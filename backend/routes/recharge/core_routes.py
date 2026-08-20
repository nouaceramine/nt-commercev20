"""Recharge core routes — config, create (saga), history, stats, status poll, auto-recharge."""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import logging

logger = logging.getLogger(__name__)


def build_core_router(db, main_db, require_tenant, get_tenant_admin, RECHARGE_CONFIG, RechargeCreate, RechargeResponse):
    router = APIRouter()

    # ============ RECHARGE / USSD ============

    async def _get_effective_config() -> dict:
        """Merge hardcoded RECHARGE_CONFIG with DB overrides (main_db.recharge_operator_config)."""
        if main_db is None:
            return RECHARGE_CONFIG
        effective = {}
        for key, defaults in RECHARGE_CONFIG.items():
            override = await main_db.recharge_operator_config.find_one({"operator": key}, {"_id": 0})
            if override:
                merged = dict(defaults)
                if "commission" in override:
                    merged["commission"] = override["commission"]
                if "platform_commission" in override:
                    merged["platform_commission"] = override["platform_commission"]
                if "amounts" in override and override["amounts"]:
                    merged["amounts"] = override["amounts"]
                effective[key] = merged
            else:
                effective[key] = dict(defaults)
        return effective

    @router.get("/recharge/config")
    async def get_recharge_config(user: dict = Depends(require_tenant)):
        """Get recharge operators configuration (with admin DB overrides)."""
        return await _get_effective_config()

    @router.post("/recharge", response_model=RechargeResponse)
    async def create_recharge(recharge: RechargeCreate, user: dict = Depends(require_tenant)):
        """Record a recharge transaction — delegates to the application service saga."""
        from services.application.recharge_service import execute_recharge_saga
        effective_config = await _get_effective_config()
        recharge_doc = await execute_recharge_saga(db, main_db, effective_config, recharge, user)
        return RechargeResponse(**recharge_doc)
    @router.get("/recharge", response_model=List[RechargeResponse])
    async def get_recharges(
        operator: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        user: dict = Depends(require_tenant)
    ):
        """Get recharge history"""
        query = {}
        if operator:
            query["operator"] = operator
        if start_date:
            query["created_at"] = {"$gte": start_date}
        if end_date:
            if "created_at" in query:
                query["created_at"]["$lte"] = end_date
            else:
                query["created_at"] = {"$lte": end_date}

        recharges = await db.recharges.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
        return [RechargeResponse(**r) for r in recharges]

    @router.get("/recharge/stats")
    async def get_recharge_stats(days: int = 30, admin: dict = Depends(get_tenant_admin)):
        """Get recharge statistics"""
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")

        # Total by operator
        pipeline = [
            {"$match": {"created_at": {"$gte": start_date}}},
            {"$group": {
                "_id": "$operator",
                "count": {"$sum": 1},
                "total_amount": {"$sum": "$amount"},
                "total_profit": {"$sum": "$profit"}
            }}
        ]
        by_operator = await db.recharges.aggregate(pipeline).to_list(10)

        # Today's stats
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        today_stats = await db.recharges.aggregate([
            {"$match": {"created_at": {"$gte": today}}},
            {"$group": {
                "_id": None,
                "count": {"$sum": 1},
                "total_amount": {"$sum": "$amount"},
                "total_profit": {"$sum": "$profit"}
            }}
        ]).to_list(1)

        return {
            "by_operator": by_operator,
            "today": today_stats[0] if today_stats else {"count": 0, "total_amount": 0, "total_profit": 0},
            "period_days": days
        }
    # Recharge status poll (note: placed after all /recharge/bridge/* to avoid path conflict)
    @router.get("/recharges/{recharge_id}/status")
    async def get_recharge_status(recharge_id: str, user: dict = Depends(require_tenant)):
        """Poll the status of a single recharge (pending/completed/failed)."""
        doc = await db.recharges.find_one({"id": recharge_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="عملية الشحن غير موجودة")
        return {"id": doc["id"], "status": doc.get("status", "pending"),
                "result_message": doc.get("result_message", "")}
    # ============ AUTO RECHARGE BY OPERATOR ============

    @router.post("/recharge/auto")
    async def auto_recharge(phone: str, amount: float, user: dict = Depends(require_tenant)):
        """Auto-select SIM slot based on phone number prefix"""

        # Clean phone number
        clean_phone = phone.replace(" ", "").replace("-", "")
        if clean_phone.startswith("+213"):
            clean_phone = "0" + clean_phone[4:]
        elif clean_phone.startswith("213"):
            clean_phone = "0" + clean_phone[3:]

        # Determine operator by prefix
        prefix = clean_phone[:2] if len(clean_phone) >= 2 else ""

        operator_map = {
            "06": {"name": "موبيليس", "name_fr": "Mobilis"},
            "07": {"name": "جازي", "name_fr": "Djezzy"},
            "05": {"name": "أوريدو", "name_fr": "Ooredoo"}
        }

        if prefix not in operator_map:
            raise HTTPException(status_code=400, detail="رقم هاتف غير صالح. يجب أن يبدأ بـ 05, 06, أو 07")

        operator = operator_map[prefix]

        # Find the appropriate SIM slot
        slot = await db.sim_slots.find_one({"prefix": prefix}, {"_id": 0})

        if not slot or not slot.get("phone"):
            raise HTTPException(status_code=400, detail=f"شريحة {operator['name']} غير مفعلة")

        if slot.get("balance", 0) < amount:
            raise HTTPException(status_code=400, detail=f"رصيد شريحة {operator['name']} غير كافي")

        # Log the recharge (MOCKED)
        now = datetime.now(timezone.utc).isoformat()
        recharge_log = {
            "id": str(uuid.uuid4()),
            "phone": clean_phone,
            "amount": amount,
            "operator": operator["name"],
            "slot_id": slot["slot_id"],
            "status": "success",  # MOCKED
            "created_at": now,
            "created_by": user.get("name", "")
        }
        await db.recharge_logs.insert_one(recharge_log)

        # Deduct from SIM balance
        await db.sim_slots.update_one(
            {"slot_id": slot["slot_id"]},
            {"$inc": {"balance": -amount}, "$set": {"last_updated": now}}
        )

        return {
            "success": True,
            "phone": clean_phone,
            "amount": amount,
            "operator": operator["name"],
            "message": f"تم شحن {amount} دج لـ {clean_phone} عبر {operator['name']}"
        }

    return router
