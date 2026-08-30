#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NT Commerce — rlynx/BDV10 Live Mirror Agent (Windows)
======================================================
Watches the legacy rlynx/BDV10 Access database and pushes every new
operation to NT Commerce in near real time (one-way mirror — the legacy
system is never written to).

Setup on the subscriber's PC:
  1. Install Python 3.10+ (python.org) — check "Add python.exe to PATH"
  2. pip install pyodbc
  3. Make sure the "Microsoft Access Driver (*.mdb, *.accdb)" ODBC driver
     exists (it ships with Microsoft Office / Access Runtime)
  4. Put nt_sync_agent.json next to this file:
       {
         "server": "https://nt-commerce.net",
         "token": "ntsync_...",
         "db_path": "C:\\rlynx\\BDV10.dblx",
         "interval_sec": 30
       }
  5. First run (right after the initial import on the web):
       python nt_sync_agent.py --baseline
     then normal operation:
       python nt_sync_agent.py
  6. (Optional) auto-start: Task Scheduler → "At log on" →
     program: python.exe  arguments: "C:\\nt_sync\\nt_sync_agent.py"

State is kept in nt_sync_agent_state.json next to the config — deleting it
forces a fresh baseline (nothing is duplicated server-side anyway: every
row is applied idempotently by its legacy id).
"""
import argparse
import hashlib
import json
import os
import sys
import time
import traceback
import urllib.request
import urllib.error

AGENT_VERSION = "1.0"

MASTER_TABLES = ("Item", "Customer", "Supplier")


def log(msg):
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return default


def save_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False)
    os.replace(tmp, path)


def connect(db_path):
    import pyodbc  # only dependency
    conn_str = (r"DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};"
                f"DBQ={db_path};")
    return pyodbc.connect(conn_str, autocommit=True)


def rows_of(cur, sql, params=()):
    cur.execute(sql, *params)
    cols = [c[0] for c in cur.description]
    out = []
    for rec in cur.fetchall():
        row = {}
        for c, v in zip(cols, rec):
            if v is None:
                row[c] = ""
            elif hasattr(v, "strftime"):
                row[c] = v.strftime("%Y-%m-%d %H:%M:%S")
            else:
                row[c] = str(v)
        out.append(row)
    return out


def row_hash(row):
    return hashlib.sha1(
        json.dumps(row, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()


def push(cfg, tables):
    body = json.dumps({"tables": tables,
                       "agent_version": AGENT_VERSION}).encode()
    req = urllib.request.Request(
        cfg["server"].rstrip("/") + "/api/migration/live/push",
        data=body,
        headers={"Content-Type": "application/json",
                 "X-Sync-Token": cfg["token"]},
        method="POST")
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read() or b"{}")


def num(x):
    try:
        return float(x)
    except Exception:
        return 0.0


def collect_new(cur, table, entry_table, fk, wm):
    """New rows of `table` with ID > watermark, each with nested entries."""
    rows = rows_of(cur, f"SELECT * FROM [{table}] WHERE ID > ? ORDER BY ID", (wm,))
    for r in rows:
        r["entries"] = rows_of(
            cur, f"SELECT * FROM [{entry_table}] WHERE [{fk}] = ?", (r["ID"],))
    return rows


def poll_once(cfg, state):
    conn = connect(cfg["db_path"])
    cur = conn.cursor()
    tables = {}

    # ── new receipts (+entries) ──
    receipts = collect_new(cur, "Receipt", "ReceiptEntry", "ReceiptID",
                           num(state.get("wm_receipt", 0)))
    if receipts:
        tables["receipts"] = receipts
        state["wm_receipt"] = max(num(r["ID"]) for r in receipts)

    # ── new purchases (+entries) ──
    purchases = collect_new(cur, "Purchase", "PurchaseEntry", "PurchaseID",
                            num(state.get("wm_purchase", 0)))
    if purchases:
        tables["purchases"] = purchases
        state["wm_purchase"] = max(num(r["ID"]) for r in purchases)

    # ── batches: new OR status-changed (open→closed) ──
    batches = rows_of(cur, "SELECT * FROM [Batch]")
    known = state.get("batches", {})
    changed = []
    for bt in batches:
        bid = str(bt.get("ID", ""))
        sig = f"{bt.get('Status')}|{bt.get('CashClose')}|{bt.get('ClosingTime')}"
        if known.get(bid) != sig:
            known[bid] = sig
            changed.append(bt)
    if changed:
        tables["batches"] = changed
    state["batches"] = known

    # ── masters: hash-diff full scan ──
    hashes = state.get("hashes", {})
    for table in MASTER_TABLES:
        rows = rows_of(cur, f"SELECT * FROM [{table}]")
        tmap = hashes.setdefault(table, {})
        diff = []
        for row in rows:
            rid = str(row.get("ID", ""))
            h = row_hash(row)
            if tmap.get(rid) != h:
                tmap[rid] = h
                diff.append(row)
        if diff:
            tables[{"Item": "items", "Customer": "customers",
                    "Supplier": "suppliers"}[table]] = diff

    conn.close()

    if tables:
        res = push(cfg, tables)
        log("pushed " + ", ".join(f"{k}={len(v)}" for k, v in tables.items())
            + f" → applied {res.get('applied')}")
    return tables


def baseline(cfg, state):
    """Initialize watermarks/hashes to the CURRENT content without pushing
    (history was already imported via the web wizard)."""
    conn = connect(cfg["db_path"])
    cur = conn.cursor()
    for table, key in (("Receipt", "wm_receipt"), ("Purchase", "wm_purchase")):
        cur.execute(f"SELECT MAX(ID) FROM [{table}]")
        val = cur.fetchone()[0]
        state[key] = float(val) if val is not None else 0
    known = {}
    for bt in rows_of(cur, "SELECT * FROM [Batch]"):
        known[str(bt.get("ID", ""))] = (
            f"{bt.get('Status')}|{bt.get('CashClose')}|{bt.get('ClosingTime')}")
    state["batches"] = known
    hashes = {}
    for table in MASTER_TABLES:
        tmap = {}
        for row in rows_of(cur, f"SELECT * FROM [{table}]"):
            tmap[str(row.get("ID", ""))] = row_hash(row)
        hashes[table] = tmap
    state["hashes"] = hashes
    conn.close()
    log(f"baseline set: receipt≤{state['wm_receipt']:.0f} "
        f"purchase≤{state['wm_purchase']:.0f} "
        f"batches={len(known)} masters hashed")


def main():
    ap = argparse.ArgumentParser(description="NT Commerce rlynx live mirror agent")
    ap.add_argument("--config", default=None)
    ap.add_argument("--baseline", action="store_true",
                    help="initialize state without pushing (first run)")
    ap.add_argument("--once", action="store_true", help="single poll then exit")
    args = ap.parse_args()

    cfg_path = args.config or os.path.join(BASE_DIR, "nt_sync_agent.json")
    cfg = load_json(cfg_path, None)
    if not cfg:
        print(f"config not found: {cfg_path}")
        sys.exit(2)
    for key in ("server", "token", "db_path"):
        if not cfg.get(key):
            print(f"missing config key: {key}")
            sys.exit(2)

    state_path = os.path.join(BASE_DIR, "nt_sync_agent_state.json")
    state = load_json(state_path, {})
    interval = max(10, int(cfg.get("interval_sec", 30)))

    if args.baseline:
        baseline(cfg, state)
        save_json(state_path, state)
        return

    log(f"agent {AGENT_VERSION} started — mirror {cfg['db_path']} → "
        f"{cfg['server']} every {interval}s")
    while True:
        try:
            poll_once(cfg, state)
            save_json(state_path, state)
        except urllib.error.HTTPError as e:
            body = ""
            try:
                body = e.read().decode()[:200]
            except Exception:
                pass
            log(f"HTTP {e.code}: {body}")
            if e.code in (401, 403):
                log("sync token rejected — stopping (check the token)")
                return
        except Exception as e:
            log(f"error: {e}")
            log(traceback.format_exc()[:500])
        if args.once:
            return
        time.sleep(interval)


BASE_DIR = os.path.dirname(os.path.abspath(sys.argv[0]))
LOG_PATH = os.path.join(BASE_DIR, "nt_sync_agent.log")

if __name__ == "__main__":
    main()
