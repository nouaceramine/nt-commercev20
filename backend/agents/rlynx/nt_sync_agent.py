#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NT Commerce — Legacy Live Mirror Agent (Windows)  v2
=====================================================
Watches a legacy system database and mirrors every new operation into
NT Commerce in near real time (STRICTLY one-way — the legacy database is
only ever READ, never written).

Supported engines:
  • access — rlynx/BDV10 file (.dblx/.mdb/.accdb) via the Access ODBC driver
  • mssql  — SQL Server systems (PC Compta / Sage / Ciel / custom) via any
             installed SQL Server ODBC driver, with a field-mapping profile

Config file (nt_sync_agent.json, next to this script):
  {
    "server": "https://nt-commerce.net",
    "token": "ntsync_...",
    "engine": "access",
    "db_path": "C:\\rlynx\\BDV10.dblx",          // engine=access
    "interval_sec": 30,

    // engine=mssql instead:
    "mssql": {
      "server": "localhost\\\\INSTANCE", "database": "GESTION",
      "user": "sa", "password": "...",            // or "trusted": true
      "driver": "ODBC Driver 17 for SQL Server"
    },
    // mapping profile: canonical name → source table + column map
    "profile": {
      "Receipt": {"table": "VENTES", "columns": {"ID": "VTE_ID", "ReceiptNo": "VTE_NUM",
                  "Total": "VTE_TOTAL", "CreditAccount": "VTE_RESTE",
                  "AccountPayment": "VTE_REGLE", "CustomerID": "VTE_CLI",
                  "Time": "VTE_DATE"}},
      "ReceiptEntry": {"table": "VENTES_LIGNES", "columns": {"ReceiptID": "VTE_ID",
                  "ItemID": "ART_ID", "ItemName": "ART_NOM", "Qty": "QTE",
                  "Price": "PRIX", "ExtPrice": "TOTAL_LIGNE"}},
      "Item": ..., "Customer": ..., "Supplier": ...,
      "Purchase": ..., "PurchaseEntry": ..., "Batch": ...
    }
  }
  (engine=access needs no profile — the BDV10 layout is built in)

Commands:
  python nt_sync_agent.py --baseline        first run: mark current content as
                                            already-imported (no push)
  python nt_sync_agent.py                   live mirror loop
  python nt_sync_agent.py --once            single poll (testing)
  python nt_sync_agent.py --dump DIR        export FULL history as a canonical
                                            bundle (folder + bundle.zip) —
                                            upload bundle.zip in the web
                                            wizard ("الترحيل من نظام قديم")

Auto-start (optional): Task Scheduler → At log on →
  program: python.exe  args: "C:\\nt_sync\\nt_sync_agent.py"
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
import zipfile

AGENT_VERSION = "2.2"

MASTER_TABLES = ("Item", "Customer", "Supplier")
LIVE_TABLES = ("Receipt", "Purchase", "Batch")

# BDV10/rlynx built-in identity profile (engine=access)
BDV_IDENTITY = {
    t: {"table": t, "columns": None}  # columns None → SELECT * (already canonical)
    for t in ("Receipt", "ReceiptEntry", "Purchase", "PurchaseEntry",
              "Batch", "Item", "Customer", "Supplier",
              "ItemFamily", "CustomerFamily", "ItemAlias", "UnitOfMeasure",
              "Employee", "StockTake", "StockTakeEntry", "ItemAdjustment",
              "Store", "PriceLevel", "PaymentMethod", "Register")
}
DUMP_TABLES = list(BDV_IDENTITY.keys())


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


# ───────────────────────── engine layer ─────────────────────────
def connect(cfg):
    import pyodbc  # only third-party dependency
    engine = cfg.get("engine", "access")
    if engine == "access":
        conn_str = (r"DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};"
                    f"DBQ={cfg['db_path']};")
    elif engine == "mssql":
        m = cfg["mssql"]
        if m.get("trusted"):
            auth = "Trusted_Connection=yes;"
        else:
            auth = f"UID={m['user']};PWD={m['password']};"
        conn_str = (f"DRIVER={{{m.get('driver', 'ODBC Driver 17 for SQL Server')}}};"
                    f"SERVER={m['server']};DATABASE={m['database']};{auth}")
    else:
        raise RuntimeError(f"unknown engine: {engine}")
    return pyodbc.connect(conn_str, autocommit=True)


def profile(cfg):
    """canonical → {table, columns}. Access uses the built-in identity profile."""
    if cfg.get("engine", "access") == "access":
        return BDV_IDENTITY
    prof = cfg.get("profile") or {}
    if "Receipt" not in prof or "Item" not in prof:
        raise RuntimeError("mssql engine needs a profile with at least Receipt + Item")
    merged = dict(prof)
    return merged


def select_rows(cur, prof, canon, where=None, params=()):
    """SELECT canonical columns (renamed per profile) from the source table."""
    spec = prof[canon]
    if spec["columns"] is None:
        sql = f"SELECT * FROM [{spec['table']}]"
    else:
        cols = ", ".join(f"[{src}] AS [{dst}]" for dst, src in spec["columns"].items())
        sql = f"SELECT {cols} FROM [{spec['table']}]"
    if where:
        sql += f" WHERE {where}"
    sql += f" ORDER BY [{spec['columns']['ID'] if spec['columns'] else 'ID'}]" \
        if canon in LIVE_TABLES and where else sql
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


def num(x):
    try:
        return float(x)
    except Exception:
        return 0.0


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


# ───────────────────────── polling ─────────────────────────
def collect_new(cur, prof, canon, entry_canon, fk, wm):
    spec = prof[canon]
    id_col = spec["columns"]["ID"] if spec["columns"] else "ID"
    rows = select_rows(cur, prof, canon, f"[{id_col}] > ?", (wm,))
    for r in rows:
        espec = prof[entry_canon]
        fk_col = espec["columns"][fk] if espec["columns"] else fk
        r["entries"] = select_rows(cur, prof, entry_canon,
                                   f"[{fk_col}] = ?", (r["ID"],))
    return rows


def day_of(v):
    """'YYYY-MM-DD HH:MM:SS' → 'YYYY-MM-DD' ('' when unusable)."""
    s = str(v or "")[:10]
    return s if len(s) == 10 and s[4] == "-" else ""


def compute_digest(cur, prof, days=120):
    """p355: daily truth digest computed from the LEGACY database itself.
    The server reconciles these per-day aggregates against what the mirror
    stored — drift here means a sync bug or a missed window, not guesswork.
    Covers the last `days` days; masters row carries full-table counts."""
    cutoff = time.strftime("%Y-%m-%d",
                           time.localtime(time.time() - days * 86400))
    agg = {}
    if "Receipt" in prof:
        for r in select_rows(cur, prof, "Receipt"):
            day = day_of(r.get("Time"))
            if not day or day < cutoff:
                continue
            a = agg.setdefault(("sale", day), [0, 0.0, 0.0])
            a[0] += 1
            a[1] += num(r.get("Total"))
            a[2] += max(0.0, num(r.get("CreditAccount")))
    if "Purchase" in prof:
        for p in select_rows(cur, prof, "Purchase"):
            day = day_of(p.get("ADate")) or day_of(p.get("DateValidated"))
            if not day or day < cutoff:
                continue
            a = agg.setdefault(("purchase", day), [0, 0.0, 0.0])
            a[0] += 1
            a[1] += num(p.get("Total"))
    rows = [{"kind": k, "day": d, "count": v[0],
             "total": round(v[1], 2), "credit": round(v[2], 2)}
            for (k, d), v in sorted(agg.items())]
    masters = {"kind": "masters"}
    for canon, key in (("Item", "items"), ("Customer", "customers"),
                       ("Supplier", "suppliers")):
        if canon in prof:
            masters[key] = len(select_rows(cur, prof, canon))
    rows.append(masters)
    return rows


def poll_once(cfg, state):
    prof = profile(cfg)
    conn = connect(cfg)
    cur = conn.cursor()
    tables = {}

    receipts = collect_new(cur, prof, "Receipt", "ReceiptEntry", "ReceiptID",
                           num(state.get("wm_receipt", 0)))
    if receipts:
        tables["receipts"] = receipts
        state["wm_receipt"] = max(num(r["ID"]) for r in receipts)

    if "Purchase" in prof:
        purchases = collect_new(cur, prof, "Purchase", "PurchaseEntry", "PurchaseID",
                                num(state.get("wm_purchase", 0)))
        if purchases:
            tables["purchases"] = purchases
            state["wm_purchase"] = max(num(r["ID"]) for r in purchases)

    if "Batch" in prof:
        batches = select_rows(cur, prof, "Batch")
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

    hashes = state.get("hashes", {})
    for canon in MASTER_TABLES:
        if canon not in prof:
            continue
        rows = select_rows(cur, prof, canon)
        tmap = hashes.setdefault(canon, {})
        diff = []
        for row in rows:
            rid = str(row.get("ID", ""))
            h = row_hash(row)
            if tmap.get(rid) != h:
                tmap[rid] = h
                diff.append(row)
        if diff:
            tables[{"Item": "items", "Customer": "customers",
                    "Supplier": "suppliers"}[canon]] = diff

    today = time.strftime("%Y-%m-%d")
    if state.get("digest_day") != today:
        try:
            tables["digest"] = compute_digest(
                cur, prof, int(cfg.get("digest_days", 120) or 120))
            state["digest_day"] = today
        except Exception as e:
            log(f"digest failed (non-fatal): {e}")

    conn.close()

    if tables:
        res = push(cfg, tables)
        log("pushed " + ", ".join(f"{k}={len(v)}" for k, v in tables.items())
            + f" → applied {res.get('applied')}")
    return tables


def baseline(cfg, state):
    """Mark current content as already-imported (nothing pushed)."""
    prof = profile(cfg)
    conn = connect(cfg)
    cur = conn.cursor()
    for canon, key in (("Receipt", "wm_receipt"), ("Purchase", "wm_purchase")):
        if canon not in prof:
            continue
        spec = prof[canon]
        id_col = spec["columns"]["ID"] if spec["columns"] else "ID"
        cur.execute(f"SELECT MAX([{id_col}]) FROM [{spec['table']}]")
        val = cur.fetchone()[0]
        state[key] = float(val) if val is not None else 0
    if "Batch" in prof:
        known = {}
        for bt in select_rows(cur, prof, "Batch"):
            known[str(bt.get("ID", ""))] = (
                f"{bt.get('Status')}|{bt.get('CashClose')}|{bt.get('ClosingTime')}")
        state["batches"] = known
    hashes = {}
    for canon in MASTER_TABLES:
        if canon not in prof:
            continue
        tmap = {}
        for row in select_rows(cur, prof, canon):
            tmap[str(row.get("ID", ""))] = row_hash(row)
        hashes[canon] = tmap
    state["hashes"] = hashes
    conn.close()
    log(f"baseline set: receipt≤{state.get('wm_receipt', 0):.0f} "
        f"purchase≤{state.get('wm_purchase', 0):.0f} masters hashed")


def dump(cfg, out_dir):
    """Export FULL history as a canonical bundle: {Table}.json + bundle.zip.
    Upload bundle.zip in the web wizard — the server imports it directly."""
    prof = profile(cfg)
    conn = connect(cfg)
    cur = conn.cursor()
    os.makedirs(out_dir, exist_ok=True)
    total = 0
    for canon in DUMP_TABLES:
        if canon not in prof:
            continue
        try:
            rows = select_rows(cur, prof, canon)
        except Exception as e:
            log(f"dump: skipping {canon}: {e}")
            continue
        with open(os.path.join(out_dir, f"{canon}.json"), "w",
                  encoding="utf-8") as fh:
            json.dump(rows, fh, ensure_ascii=False)
        total += len(rows)
        log(f"dump: {canon} = {len(rows)} rows")
    conn.close()
    zip_path = os.path.join(out_dir, "bundle.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for fname in os.listdir(out_dir):
            if fname.endswith(".json"):
                zf.write(os.path.join(out_dir, fname), fname)
    log(f"dump complete: {total} rows → {zip_path} "
        f"(upload bundle.zip in the web wizard)")


def main():
    ap = argparse.ArgumentParser(description="NT Commerce legacy live mirror agent")
    ap.add_argument("--config", default=None)
    ap.add_argument("--baseline", action="store_true",
                    help="initialize state without pushing (first run)")
    ap.add_argument("--once", action="store_true", help="single poll then exit")
    ap.add_argument("--dump", metavar="DIR", default=None,
                    help="export full history to a canonical bundle + bundle.zip")
    args = ap.parse_args()

    cfg_path = args.config or os.path.join(BASE_DIR, "nt_sync_agent.json")
    cfg = load_json(cfg_path, None)
    if not cfg:
        print(f"config not found: {cfg_path}")
        sys.exit(2)
    for key in ("server", "token"):
        if not cfg.get(key):
            print(f"missing config key: {key}")
            sys.exit(2)
    if cfg.get("engine", "access") == "access" and not cfg.get("db_path"):
        print("missing config key: db_path")
        sys.exit(2)
    if cfg.get("engine") == "mssql" and not cfg.get("mssql"):
        print("missing config section: mssql")
        sys.exit(2)

    if args.dump:
        dump(cfg, args.dump)
        return

    state_path = os.path.join(BASE_DIR, "nt_sync_agent_state.json")
    state = load_json(state_path, {})
    interval = max(10, int(cfg.get("interval_sec", 30)))

    if args.baseline:
        baseline(cfg, state)
        save_json(state_path, state)
        return

    log(f"agent {AGENT_VERSION} started — engine={cfg.get('engine', 'access')} → "
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


if getattr(sys, "frozen", False):
    # running as PyInstaller exe — config/state/log live next to the exe
    BASE_DIR = os.path.dirname(os.path.abspath(sys.executable))
else:
    BASE_DIR = os.path.dirname(os.path.abspath(sys.argv[0]))
LOG_PATH = os.path.join(BASE_DIR, "nt_sync_agent.log")

if __name__ == "__main__":
    main()
