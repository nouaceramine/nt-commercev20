"""p266: super-admin ID-system audit — code coverage & duplicate detection.

GET /api/saas/id-audit → per-collection report for the platform DB and every
tenant DB: how many rows exist, how many carry their public code, how many
are missing it, and whether any duplicate codes exist (must always be 0).
"""
from fastapi import APIRouter, Depends

from config.database import db, client, get_tenant_db
from .helpers import get_super_admin

router = APIRouter(tags=["ID Audit"])

_MAIN_SPECS = [
    ("wallets", "code"),
    ("wallet_requests", "code"),
    ("saas_agents", "agent_code"),
    ("saas_payments", "payment_code"),
    ("supplier_payments", "payment_code"),
    ("saas_tenants", "short_id"),
]

_TENANT_SPECS = [
    ("wallets", "code"),
    ("cash_boxes", "id"),
]


async def _coll_report(coll, field: str) -> dict:
    total = await coll.count_documents({})
    coded = await coll.count_documents({field: {"$gt": ""}})
    pipeline = [
        {"$match": {field: {"$gt": ""}}},
        {"$group": {"_id": f"${field}", "n": {"$sum": 1}}},
        {"$match": {"n": {"$gt": 1}}},
        {"$count": "dups"},
    ]
    dup = await coll.aggregate(pipeline).to_list(1)
    return {
        "total": total,
        "coded": coded,
        "missing": total - coded,
        "duplicate_codes": dup[0]["dups"] if dup else 0,
    }


@router.get("/saas/id-audit")
async def id_audit(_admin: dict = Depends(get_super_admin)):
    main = {}
    for coll_name, field in _MAIN_SPECS:
        main[coll_name] = await _coll_report(db[coll_name], field)

    tenants = []
    async for t in db.saas_tenants.find({}, {"id": 1, "short_id": 1, "name": 1}):
        tdb = get_tenant_db(t['id'])
        cols = {}
        for coll_name, field in _TENANT_SPECS:
            cols[coll_name] = await _coll_report(tdb[coll_name], field)
        tenants.append({
            "tenant_id": t["id"],
            "short_id": t.get("short_id"),
            "name": t.get("name"),
            "collections": cols,
        })

    total_missing = sum(v["missing"] for v in main.values()) + sum(
        c["missing"] for t in tenants for c in t["collections"].values()
    )
    total_dups = sum(v["duplicate_codes"] for v in main.values()) + sum(
        c["duplicate_codes"] for t in tenants for c in t["collections"].values()
    )
    return {
        "main": main,
        "tenants": tenants,
        "summary": {"total_missing": total_missing, "total_duplicate_codes": total_dups},
    }
