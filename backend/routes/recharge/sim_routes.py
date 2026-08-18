"""SIM slot management — slots, balances, balance logs."""
from fastapi import APIRouter, Depends, HTTPException
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

    # ============ p166: empty-SIM purchase (تموين), balance transfer, topup ============

    class SimPurchaseIn(BaseModel):
        slot_id: int
        quantity: int
        unit_cost: float = 100
        payment_method: str = "cash"  # cash box id
        notes: Optional[str] = ""

    class SimTopupIn(BaseModel):
        amount: float
        payment_method: str = "cash"  # cash box id
        notes: Optional[str] = ""

    class SimTransferIn(BaseModel):
        from_kind: str  # "slot" | "wallet"
        from_slot_id: Optional[int] = None
        to_kind: str    # "slot" | "wallet"
        to_slot_id: Optional[int] = None
        amount: float
        notes: Optional[str] = ""

    @router.post("/sim/purchase")
    async def purchase_empty_sims(payload: SimPurchaseIn, admin: dict = Depends(get_tenant_admin)):
        """Buy empty SIMs from the operator: slot stock += qty (weighted-avg cost), cash box −= total."""
        qty = int(payload.quantity or 0)
        cost = float(payload.unit_cost or 0)
        if qty <= 0:
            raise HTTPException(status_code=400, detail="الكمية يجب أن تكون أكبر من صفر")
        if cost < 0:
            raise HTTPException(status_code=400, detail="سعر الشراء غير صالح")
        slot = await db.sim_slots.find_one({"slot_id": payload.slot_id}, {"_id": 0})
        if not slot:
            raise HTTPException(status_code=404, detail="الشريحة غير موجودة")

        now = datetime.now(timezone.utc).isoformat()
        total = round(qty * cost, 2)
        old_qty = float(slot.get("empty_sims", 0) or 0)
        old_cost = float(slot.get("sim_unit_cost", 0) or 0)
        new_qty = old_qty + qty
        new_avg = round(((old_qty * old_cost) + total) / new_qty, 2) if new_qty > 0 else cost

        slot_updated = cash_done = False
        try:
            await db.sim_slots.update_one(
                {"slot_id": payload.slot_id},
                {"$set": {"empty_sims": new_qty, "sim_unit_cost": new_avg, "last_updated": now}},
            )
            slot_updated = True
            if total > 0:
                await db.cash_boxes.update_one(
                    {"id": payload.payment_method},
                    {"$inc": {"balance": -total}, "$set": {"updated_at": now}},
                )
                await db.transactions.insert_one({
                    "id": str(uuid.uuid4()),
                    "cash_box_id": payload.payment_method,
                    "type": "expense",
                    "amount": total,
                    "description": f"شراء شرائح فارغة {slot.get('operator', '')} × {qty}",
                    "reference_type": "sim_purchase",
                    "reference_id": str(uuid.uuid4()),
                    "created_at": now,
                    "created_by": admin.get("name", ""),
                })
            cash_done = True
        except Exception as e:
            if slot_updated:
                try:
                    await db.sim_slots.update_one(
                        {"slot_id": payload.slot_id},
                        {"$set": {"empty_sims": old_qty, "sim_unit_cost": old_cost, "last_updated": now}},
                    )
                except Exception:
                    pass
            logger.exception("sim purchase failed: %s", e)
            raise HTTPException(status_code=500, detail="فشل تسجيل شراء الشرائح") from e

        return {"slot_id": payload.slot_id, "quantity": qty, "unit_cost": cost,
                "total_cost": total, "new_quantity": new_qty, "avg_cost": new_avg}

    @router.post("/sim/slots/{slot_id}/topup")
    async def topup_sim_slot(slot_id: int, payload: SimTopupIn, admin: dict = Depends(get_tenant_admin)):
        """Charge the owner's own operator SIM with balance paid from a cash box."""
        amount = float(payload.amount or 0)
        if amount <= 0:
            raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون أكبر من صفر")
        slot = await db.sim_slots.find_one({"slot_id": slot_id}, {"_id": 0})
        if not slot:
            raise HTTPException(status_code=404, detail="الشريحة غير موجودة")

        now = datetime.now(timezone.utc).isoformat()
        old_balance = float(slot.get("balance", 0) or 0)
        slot_updated = cash_done = False
        try:
            await db.sim_slots.update_one(
                {"slot_id": slot_id},
                {"$inc": {"balance": amount}, "$set": {"last_updated": now}},
            )
            slot_updated = True
            await db.sim_balance_logs.insert_one({
                "id": str(uuid.uuid4()), "slot_id": slot_id,
                "old_balance": old_balance, "new_balance": round(old_balance + amount, 2),
                "change": amount,
                "notes": payload.notes or "شحن رصيد الشريحة من الصندوق",
                "created_at": now, "created_by": admin.get("name", ""),
            })
            await db.cash_boxes.update_one(
                {"id": payload.payment_method},
                {"$inc": {"balance": -amount}, "$set": {"updated_at": now}},
            )
            await db.transactions.insert_one({
                "id": str(uuid.uuid4()),
                "cash_box_id": payload.payment_method,
                "type": "expense",
                "amount": amount,
                "description": f"شحن رصيد شريحة {slot.get('operator', '')}",
                "reference_type": "sim_topup",
                "reference_id": str(uuid.uuid4()),
                "created_at": now,
                "created_by": admin.get("name", ""),
            })
            cash_done = True
        except Exception as e:
            if slot_updated:
                try:
                    await db.sim_slots.update_one({"slot_id": slot_id}, {"$inc": {"balance": -amount}})
                except Exception:
                    pass
            logger.exception("sim topup failed: %s", e)
            raise HTTPException(status_code=500, detail="فشل شحن رصيد الشريحة") from e

        return {"slot_id": slot_id, "amount": amount, "new_balance": round(old_balance + amount, 2)}

    @router.post("/sim/transfer")
    async def transfer_sim_balance(payload: SimTransferIn, admin: dict = Depends(get_tenant_admin)):
        """1:1 balance transfer between operator SIMs, or SIM ↔ platform wallet."""
        from pymongo import ReturnDocument as _RD
        amount = float(payload.amount or 0)
        if amount <= 0:
            raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون أكبر من صفر")
        if payload.from_kind not in ("slot", "wallet") or payload.to_kind not in ("slot", "wallet"):
            raise HTTPException(status_code=400, detail="نوع الطرف غير صالح")
        if payload.from_kind == payload.to_kind == "wallet":
            raise HTTPException(status_code=400, detail="لا يمكن التحويل من المحفظة إلى نفسها")
        if payload.from_kind == "slot" and payload.to_kind == "slot" and payload.from_slot_id == payload.to_slot_id:
            raise HTTPException(status_code=400, detail="لا يمكن التحويل إلى نفس الشريحة")

        now = datetime.now(timezone.utc).isoformat()
        entity_id = admin.get("tenant_id") or admin.get("id", "")
        transfer_id = str(uuid.uuid4())

        # ── debit source ──
        source_done = False
        src_slot = None
        try:
            if payload.from_kind == "slot":
                src_slot = await db.sim_slots.find_one_and_update(
                    {"slot_id": payload.from_slot_id, "balance": {"$gte": amount}},
                    {"$inc": {"balance": -amount}, "$set": {"last_updated": now}},
                    return_document=_RD.BEFORE, projection={"_id": 0},
                )
                if not src_slot:
                    raise HTTPException(status_code=400, detail="رصيد الشريحة المصدر غير كافٍ")
            else:
                from services.wallet_service import debit_wallet
                await debit_wallet(main_db, entity_id, amount, "sim_transfer_out", transfer_id,
                                   "تحويل رصيد من المحفظة إلى شريحة", admin.get("name", ""))
            source_done = True
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("sim transfer source debit failed: %s", e)
            raise HTTPException(status_code=400, detail="فشل الخصم من المصدر — تحقق من الرصيد") from e

        # ── credit destination ──
        try:
            if payload.to_kind == "slot":
                dest_slot = await db.sim_slots.find_one_and_update(
                    {"slot_id": payload.to_slot_id},
                    {"$inc": {"balance": amount}, "$set": {"last_updated": now}},
                    return_document=_RD.BEFORE, projection={"_id": 0},
                )
                if not dest_slot:
                    raise HTTPException(status_code=404, detail="الشريحة الوجهة غير موجودة")
            else:
                from services.wallet_service import credit_wallet
                await credit_wallet(main_db, entity_id, amount, "sim_transfer_in", transfer_id,
                                    "تحويل رصيد من شريحة إلى المحفظة", admin.get("name", ""))
        except Exception as e:
            # compensate source
            try:
                if payload.from_kind == "slot":
                    await db.sim_slots.update_one({"slot_id": payload.from_slot_id}, {"$inc": {"balance": amount}})
                else:
                    from services.wallet_service import credit_wallet
                    await credit_wallet(main_db, entity_id, amount, "sim_transfer_refund", transfer_id,
                                        "استرجاع تحويل فاشل", admin.get("name", ""))
            except Exception:
                logger.exception("sim transfer compensation failed for %s", transfer_id)
            if isinstance(e, HTTPException):
                raise
            logger.exception("sim transfer destination credit failed: %s", e)
            raise HTTPException(status_code=500, detail="فشل إيداع الوجهة") from e

        # ── audit logs (non-fatal) ──
        try:
            if payload.from_kind == "slot" and src_slot is not None:
                await db.sim_balance_logs.insert_one({
                    "id": str(uuid.uuid4()), "slot_id": payload.from_slot_id,
                    "old_balance": float(src_slot.get("balance", 0) or 0),
                    "new_balance": round(float(src_slot.get("balance", 0) or 0) - amount, 2),
                    "change": -amount,
                    "notes": payload.notes or f"تحويل رصيد إلى {'شريحة ' + str(payload.to_slot_id) if payload.to_kind == 'slot' else 'المحفظة'}",
                    "created_at": now, "created_by": admin.get("name", ""),
                })
            if payload.to_kind == "slot":
                dest = await db.sim_slots.find_one({"slot_id": payload.to_slot_id}, {"_id": 0, "balance": 1})
                await db.sim_balance_logs.insert_one({
                    "id": str(uuid.uuid4()), "slot_id": payload.to_slot_id,
                    "old_balance": round(float((dest or {}).get("balance", 0) or 0) - amount, 2),
                    "new_balance": float((dest or {}).get("balance", 0) or 0),
                    "change": amount,
                    "notes": payload.notes or f"تحويل رصيد من {'شريحة ' + str(payload.from_slot_id) if payload.from_kind == 'slot' else 'المحفظة'}",
                    "created_at": now, "created_by": admin.get("name", ""),
                })
        except Exception:
            logger.exception("sim transfer audit log failed for %s", transfer_id)

        return {"ok": True, "transfer_id": transfer_id, "amount": amount}

    return router
