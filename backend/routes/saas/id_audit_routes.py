"""p266: super-admin ID-system audit — code coverage & duplicate detection.

GET /api/saas/id-audit → per-collection report for the platform DB and every
tenant DB: how many rows exist, how many carry their public code, how many
are missing it, and whether any duplicate codes exist (must always be 0).
"""
from fastapi import APIRouter, Depends, HTTPException, Query

from config.database import db, get_tenant_db
from .helpers import get_super_admin

router = APIRouter(tags=["ID Audit"])

_MAIN_SPECS = [
    ("wallets", "code"),
    ("wallet_requests", "code"),
    ("saas_agents", "agent_code"),
    ("saas_payments", "payment_code"),
    ("supplier_payments", "payment_code"),
    ("saas_tenants", "short_id"),
    ("users", "id"),
]

_TENANT_SPECS = [
    ("wallets", "code"),
    ("cash_boxes", "id"),
    ("users", "id"),
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


# ---------------------------------------------------------------------------
# W1: per-user operation attribution — "who did what" inside one tenant DB.
# ---------------------------------------------------------------------------

_ATTR_SPECS = [
    ("sales", ["created_by", "seller_id", "user_id"]),
    ("purchases", ["created_by", "user_id"]),
    ("expenses", ["created_by", "user_id"]),
    ("quotations", ["created_by", "user_id"]),
    ("returns", ["created_by", "user_id"]),
    ("recharges", ["created_by", "agent_id", "user_id"]),
    ("stock_movements", ["created_by", "user_id"]),
    ("daily_sessions", ["user_id", "opened_by", "created_by"]),
    ("ecom_orders", ["created_by", "user_id"]),
    ("transfers", ["created_by", "user_id"]),
]


def _user_ref_expr(fields):
    """Nested $ifNull chain over candidate user-reference fields."""
    expr = f"${fields[-1]}"
    for f in reversed(fields[:-1]):
        expr = {"$ifNull": [f"${f}", expr]}
    return expr


@router.get("/saas/id-audit/user-attribution")
async def user_attribution(
    tenant_id: str = Query(...),
    _admin: dict = Depends(get_super_admin),
):
    tenant = await db.saas_tenants.find_one({"id": tenant_id}, {"id": 1, "name": 1, "short_id": 1, "db_name": 1})
    if not tenant:
        raise HTTPException(404, "المتجر غير موجود")
    tdb = get_tenant_db(tenant_id)

    collections = []
    per_user = {}   # user_ref -> {total, by_collection}
    grand_total = 0
    grand_attributed = 0

    for coll_name, fields in _ATTR_SPECS:
        pipeline = [{"$group": {"_id": _user_ref_expr(fields), "n": {"$sum": 1}}}]
        rows = await tdb[coll_name].aggregate(pipeline).to_list(None)
        total = sum(r["n"] for r in rows)
        if total == 0:
            continue
        missing = sum(r["n"] for r in rows if r["_id"] in (None, ""))
        attributed = total - missing
        grand_total += total
        grand_attributed += attributed
        collections.append({
            "collection": coll_name,
            "total": total,
            "attributed": attributed,
            "missing": missing,
            "coverage_pct": round(100.0 * attributed / total, 1),
        })
        for r in rows:
            ref = r["_id"]
            if ref in (None, ""):
                continue
            slot = per_user.setdefault(str(ref), {"total": 0, "by_collection": {}})
            slot["total"] += r["n"]
            slot["by_collection"][coll_name] = slot["by_collection"].get(coll_name, 0) + r["n"]

    # resolve user identities in one batch
    refs = list(per_user.keys())
    users_docs = await tdb.users.find(
        {"id": {"$in": refs}},
        {"id": 1, "name": 1, "full_name": 1, "email": 1, "role": 1},
    ).to_list(None)
    users_map = {u["id"]: u for u in users_docs}

    users = []
    unknown = []
    for ref, slot in per_user.items():
        u = users_map.get(ref)
        entry = {
            "user_id": ref,
            "name": (u or {}).get("name") or (u or {}).get("full_name"),
            "email": (u or {}).get("email"),
            "role": (u or {}).get("role"),
            "total_ops": slot["total"],
            "by_collection": slot["by_collection"],
        }
        (users if u else unknown).append(entry)
    users.sort(key=lambda x: -x["total_ops"])
    unknown.sort(key=lambda x: -x["total_ops"])

    return {
        "tenant_id": tenant_id,
        "tenant_name": tenant.get("name"),
        "short_id": tenant.get("short_id"),
        "db_name": tenant.get("db_name"),
        "collections": collections,
        "users": users,
        "unknown_creators": unknown,
        "summary": {
            "total_ops": grand_total,
            "attributed_ops": grand_attributed,
            "missing_ops": grand_total - grand_attributed,
            "coverage_pct": round(100.0 * grand_attributed / grand_total, 1) if grand_total else 100.0,
            "active_users": len(users),
            "unknown_creator_ids": len(unknown),
        },
    }
