"""Numbered migrations runner (p32).

Discovers backend/migrations/NNN_*.py modules (each exposing `async def up(db)`),
applies them in order to template_tenant and every tenant_* database, and records
each application in the target DB's `migration_log` collection. A failure stops
that database at the failed migration (order preserved) and is reported.
"""
import importlib
import pkgutil
from datetime import datetime, timezone

from config.database import client

TEMPLATE_DB = "template_tenant"


def _discover() -> list:
    """Sorted list of migration module names (numeric-prefix only)."""
    import migrations
    names = []
    for m in pkgutil.iter_modules(migrations.__path__):
        if m.name and m.name[0].isdigit():
            names.append(m.name)
    return sorted(names)


async def _targets() -> list:
    names = await client.list_database_names()
    out = [n for n in names if n.startswith("tenant_") or n == TEMPLATE_DB]
    return sorted(out)


async def run_migrations() -> dict:
    mods = _discover()
    report = {"available": mods, "databases": {}}
    for dbname in await _targets():
        tdb = client[dbname]
        applied = set()
        async for d in tdb.migration_log.find({"ok": True}, {"name": 1}):
            applied.add(d["name"])
        done = []
        failed = None
        for name in mods:
            if name in applied:
                continue
            mod = importlib.import_module(f"migrations.{name}")
            try:
                await mod.up(tdb)
                await tdb.migration_log.insert_one({
                    "name": name, "ok": True,
                    "applied_at": datetime.now(timezone.utc).isoformat(),
                })
                done.append(name)
            except Exception as exc:
                await tdb.migration_log.insert_one({
                    "name": name, "ok": False, "error": str(exc),
                    "applied_at": datetime.now(timezone.utc).isoformat(),
                })
                failed = {"name": name, "error": str(exc)}
                break
        entry = {"applied_now": done, "up_to_date": not done and not failed}
        if failed:
            entry["failed"] = failed
        report["databases"][dbname] = entry
    return report


async def status() -> dict:
    mods = _discover()
    out = {"available": mods, "databases": {}}
    for dbname in await _targets():
        tdb = client[dbname]
        applied = []
        async for d in tdb.migration_log.find({"ok": True}, {"name": 1}):
            applied.append(d["name"])
        out["databases"][dbname] = {
            "applied": applied,
            "pending": [m for m in mods if m not in applied],
        }
    return out
