"""SIM slot management — slots, balances, balance logs."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid


def build_sim_router(db, main_db=None, require_tenant=None, get_tenant_admin=None):
    router = APIRouter()

    # ============ SIM BALANCE MANAGEMENT ============

    class SimSlotBalance(BaseModel):
        slot_id: int  # 1 أو 2
        operator: str  # موبيليس، جازي، أوريدو
        phone: str
        balance: float = 0
        last_updated: str = ""

    class SimBalanceUpdate(BaseModel):
        balance: float
        notes: Optional[str] = ""

    @router.get("/sim/slots")
    async def get_sim_slots(admin: dict = Depends(get_tenant_admin)):
        """Get all SIM slots with their balances"""
        slots = await db.sim_slots.find({}, {"_id": 0}).to_list(10)
        if not slots:
            # Create default slots
            default_slots = [
                {"slot_id": 1, "operator": "موبيليس", "phone": "", "balance": 0, "bonus_balance": 0, "empty_sims": 0, "sim_unit_cost": 100, "last_updated": "", "prefix": "06"},
                {"slot_id": 2, "operator": "جازي", "phone": "", "balance": 0, "bonus_balance": 0, "empty_sims": 0, "sim_unit_cost": 100, "last_updated": "", "prefix": "07"},
                {"slot_id": 3, "operator": "أوريدو", "phone": "", "balance": 0, "bonus_balance": 0, "empty_sims": 0, "sim_unit_cost": 100, "last_updated": "", "prefix": "05"}
            ]
            await db.sim_slots.insert_many(default_slots)
            slots = await db.sim_slots.find({}, {"_id": 0}).to_list(10)
        return slots

    @router.put("/sim/slots/{slot_id}")
    async def update_sim_slot(slot_id: int, slot_data: dict, admin: dict = Depends(get_tenant_admin)):
        """Update SIM slot info"""
        now = datetime.now(timezone.utc).isoformat()
        update_data = {**slot_data, "last_updated": now}

        await db.sim_slots.update_one(
            {"slot_id": slot_id},
            {"$set": update_data},
            upsert=True
        )
        return {"message": "تم تحديث الشريحة بنجاح"}

    @router.put("/sim/slots/{slot_id}/balance")
    async def update_sim_balance(slot_id: int, balance_data: SimBalanceUpdate, admin: dict = Depends(get_tenant_admin)):
        """Update SIM slot balance"""
        now = datetime.now(timezone.utc).isoformat()

        # Get current slot
        slot = await db.sim_slots.find_one({"slot_id": slot_id})
        old_balance = slot.get("balance", 0) if slot else 0

        await db.sim_slots.update_one(
            {"slot_id": slot_id},
            {"$set": {"balance": balance_data.balance, "last_updated": now}}
        )

        # Log the balance change
        log_entry = {
            "id": str(uuid.uuid4()),
            "slot_id": slot_id,
            "old_balance": old_balance,
            "new_balance": balance_data.balance,
            "change": balance_data.balance - old_balance,
            "notes": balance_data.notes or "",
            "created_at": now,
            "created_by": admin.get("name", "")
        }
        await db.sim_balance_logs.insert_one(log_entry)

        return {"message": "تم تحديث الرصيد بنجاح"}

    @router.get("/sim/slots/{slot_id}/logs")
    async def get_sim_balance_logs(slot_id: int, admin: dict = Depends(get_tenant_admin)):
        """Get balance change history for a SIM slot"""
        logs = await db.sim_balance_logs.find({"slot_id": slot_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
        return logs

    # ============ p165: POS balances (flexy wallet + SIM slots) ============

    @router.get("/sim/balances")
    async def get_sim_balances(user: dict = Depends(require_tenant)):
        """POS display: platform recharge/IPTV wallet + all operator SIM balances."""
        slots = await db.sim_slots.find({}, {"_id": 0}).to_list(20)
        sim_total = round(sum(float(s.get("balance", 0) or 0) for s in slots), 2)
        bonus_total = round(sum(float(s.get("bonus_balance", 0) or 0) for s in slots), 2)
        wallet_balance = 0.0
        try:
            if main_db is not None:
                entity_id = user.get("tenant_id") or user.get("id", "")
                w = await main_db.wallets.find_one({"entity_id": entity_id}, {"_id": 0, "balance": 1})
                wallet_balance = round(float((w or {}).get("balance", 0) or 0), 2)
        except Exception:
            wallet_balance = 0.0
        return {
            "wallet_balance": wallet_balance,
            "sim_slots": slots,
            "sim_total": sim_total,
            "bonus_total": bonus_total,
            "sim_grand_total": round(sim_total + bonus_total, 2),
        }

    return router
