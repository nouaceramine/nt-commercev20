#!/usr/bin/env python3
"""p120 migration: build identity_registry from all existing accounts + conflict report.
Run: docker exec ntcommerce-backend-1 python3 /app/scripts/identity_migration.py"""
import asyncio
import sys

sys.path.insert(0, "/app")

from config.database import main_db, client  # noqa: E402
from utils.identity import register_identity, ensure_identity_index  # noqa: E402


async def run():
    await ensure_identity_index()
    report = {"platform": 0, "agent": 0, "owner": 0, "employee": 0, "conflicts": []}
    seen = {}

    async def reg(email, kind, user_id, tenant_id=None, name=""):
        e = (email or "").strip().lower()
        if not e or not user_id:
            return
        if e in seen:
            prev = seen[e]
            if prev["kind"] != kind or prev.get("tenant_id") != tenant_id:
                report["conflicts"].append({"email": e, "kept": prev, "skipped": {"kind": kind, "tenant_id": tenant_id, "user_id": user_id}})
            return  # first wins — conflict reported
        seen[e] = {"kind": kind, "tenant_id": tenant_id, "user_id": user_id}
        await register_identity(e, kind, user_id, tenant_id, name)
        report[kind] += 1

    # 1) platform users (main db)
    async for u in main_db.users.find({}, {"_id": 0}):
        await reg(u.get("email"), "platform", u.get("id"), None, u.get("name") or u.get("full_name", ""))

    # 2) agents
    async for a in main_db.saas_agents.find({}, {"_id": 0}):
        await reg(a.get("email"), "agent", a.get("id"), None, a.get("name", ""))

    # 3) tenant owners (subscribers)
    owner_emails = {}
    async for t in main_db.saas_tenants.find({}, {"_id": 0}):
        await reg(t.get("email"), "owner", t.get("id"), t.get("id"), t.get("name", ""))
        owner_emails[t.get("id")] = (t.get("email") or "").strip().lower()

    # 4) tenant employees (skip the auto-created owner mirror: same email as the tenant)
    for name in await client.list_database_names():
        if not name.startswith(("tenant_", "nt_")):  # p348
            continue
        tid = name[len("tenant_"):].replace("_", "-")
        tdb = client[name]
        async for u in tdb.users.find({}, {"_id": 0}):
            ue = (u.get("email") or "").strip().lower()
            if ue and ue == owner_emails.get(tid):
                continue
            await reg(u.get("email"), "employee", u.get("id"), tid, u.get("name", ""))

    total = await main_db.identity_registry.count_documents({})
    print("MIGRATION REPORT:", report)
    print("identity_registry total docs:", total)


asyncio.run(run())
