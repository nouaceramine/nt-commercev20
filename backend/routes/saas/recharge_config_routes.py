"""Recharge Config Routes — Admin manages operator commissions + monitors all-tenant recharges."""
from fastapi import APIRouter, Depends
from datetime import datetime, timezone

from config.database import db, main_db
from .helpers import get_super_admin

router = APIRouter(tags=["Recharge Config"])

DEFAULT_OPERATORS = {
    "mobilis": {"name": "موبيليس", "name_en": "Mobilis", "commission": 3, "amounts": [100, 200, 500, 1000, 2000, 5000]},
    "djezzy":  {"name": "جازي",    "name_en": "Djezzy",  "commission": 3, "amounts": [100, 200, 500, 1000, 2000, 5000]},
    "ooredoo": {"name": "أوريدو",  "name_en": "Ooredoo", "commission": 3, "amounts": [100, 200, 500, 1000, 2000, 5000]},
    "idoom":   {"name": "إيدوم",   "name_en": "Idoom",   "commission": 2, "amounts": [1000, 1500, 2000, 2500, 3000, 4000, 5000]},
}


async def _get_operator_doc(operator_key: str) -> dict:
    doc = await db.recharge_operator_config.find_one({"operator": operator_key}, {"_id": 0})
    if not doc:
        d = DEFAULT_OPERATORS.get(operator_key, {})
        return {"operator": operator_key, **d}
    return doc


@router.get("/saas/recharge-config")
async def get_recharge_config(admin: dict = Depends(get_super_admin)):
    """Get all operator configs (DB overrides merged with defaults)."""
    result = []
    for key, defaults in DEFAULT_OPERATORS.items():
        doc = await db.recharge_operator_config.find_one({"operator": key}, {"_id": 0})
        if doc:
            merged = {**defaults, **doc}
        else:
            merged = {"operator": key, **defaults}
        result.append(merged)
    return result


@router.put("/saas/recharge-config/{operator_key}")
async def update_operator_config(operator_key: str, body: dict, admin: dict = Depends(get_super_admin)):
    """Admin: update commission rate and/or available amounts for an operator."""
    if operator_key not in DEFAULT_OPERATORS:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="شركة الاتصالات غير موجودة")

    update = {"updated_at": datetime.now(timezone.utc).isoformat(), "updated_by": admin.get("email", "")}
    if "commission" in body:
        update["commission"] = float(body["commission"])
    if "amounts" in body and isinstance(body["amounts"], list):
        update["amounts"] = [int(a) for a in body["amounts"] if str(a).isdigit()]

    await db.recharge_operator_config.update_one(
        {"operator": operator_key},
        {"$set": {"operator": operator_key, **update}},
        upsert=True,
    )
    return await _get_operator_doc(operator_key)


@router.get("/saas/recharge-transactions")
async def get_all_recharge_transactions(
    limit: int = 100,
    admin: dict = Depends(get_super_admin)
):
    """Admin: get recent recharge wallet transactions across all tenants."""
    txns = await main_db.wallet_transactions.find(
        {"reference_type": "recharge"},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)

    total_count = await main_db.wallet_transactions.count_documents({"reference_type": "recharge"})
    total_amount = 0.0
    async for t in main_db.wallet_transactions.find({"reference_type": "recharge"}, {"amount": 1, "_id": 0}):
        total_amount += float(t.get("amount", 0))

    return {
        "transactions": txns,
        "total_count": total_count,
        "total_amount": round(total_amount, 2),
    }
