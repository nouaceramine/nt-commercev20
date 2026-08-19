"""
Cash Box & Transactions Routes - Extracted from server.py
Cash box management, transfers, adjustments, transactions
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel
import uuid


def create_cashbox_routes(db, get_current_user, get_tenant_admin, require_tenant, init_cash_boxes) -> dict:
    from utils.permissions import create_permission_checker
    require_permission = create_permission_checker(db, get_current_user)
    router = APIRouter(tags=["cash-boxes"])

    @router.get("/cash-boxes")
    async def get_cash_boxes(admin: dict = Depends(require_permission("pos"))):
        await init_cash_boxes()
        return await db.cash_boxes.find({}, {"_id": 0}).to_list(100)

    # ============ p167: custom cash boxes linked to workers ============

    class CashBoxCreate(BaseModel):
        name: str
        name_fr: Optional[str] = ""
        assigned_user_id: Optional[str] = ""   # worker whose cash sales land here
        opening_balance: float = 0

    class CashBoxAssign(BaseModel):
        assigned_user_id: Optional[str] = ""

    @router.post("/cash-boxes", status_code=201)
    async def create_cash_box(body: CashBoxCreate, admin: dict = Depends(get_tenant_admin)):
        """Create an extra cash box, optionally linked to a worker (مبيعاته النقدية تدخل صندوقه)."""
        name = (body.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="اسم الصندوق مطلوب")
        if body.assigned_user_id:
            existing = await db.cash_boxes.find_one({"assigned_user_id": body.assigned_user_id})
            if existing:
                raise HTTPException(status_code=400, detail=f"هذا العامل مرتبط مسبقاً بصندوق «{existing.get('name')}»")
        now = datetime.now(timezone.utc).isoformat()
        box = {
            "id": f"box_{uuid.uuid4().hex[:8]}",
            "name": name,
            "name_fr": body.name_fr or name,
            "type": "cash",
            "custom": True,
            "assigned_user_id": body.assigned_user_id or "",
            "balance": float(body.opening_balance or 0),
            "created_at": now,
            "updated_at": now,
            "created_by": admin.get("name", ""),
        }
        await db.cash_boxes.insert_one(dict(box))
        box.pop("_id", None)
        return box

    @router.put("/cash-boxes/{box_id}/assign")
    async def assign_cash_box(box_id: str, body: CashBoxAssign, admin: dict = Depends(get_tenant_admin)):
        """Link/unlink a worker to a cash box."""
        box = await db.cash_boxes.find_one({"id": box_id})
        if not box:
            raise HTTPException(status_code=404, detail="صندوق غير موجود")
        if body.assigned_user_id:
            existing = await db.cash_boxes.find_one({"assigned_user_id": body.assigned_user_id, "id": {"$ne": box_id}})
            if existing:
                raise HTTPException(status_code=400, detail=f"هذا العامل مرتبط مسبقاً بصندوق «{existing.get('name')}»")
        await db.cash_boxes.update_one(
            {"id": box_id},
            {"$set": {"assigned_user_id": body.assigned_user_id or "", "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        return {"message": "تم تحديث ربط الصندوق"}

    @router.delete("/cash-boxes/{box_id}")
    async def delete_cash_box(box_id: str, admin: dict = Depends(get_tenant_admin)):
        """Delete a custom box only (built-ins are protected); balance must be zero."""
        box = await db.cash_boxes.find_one({"id": box_id})
        if not box:
            raise HTTPException(status_code=404, detail="صندوق غير موجود")
        if not box.get("custom"):
            raise HTTPException(status_code=400, detail="لا يمكن حذف الصناديق الأساسية للنظام")
        if float(box.get("balance", 0) or 0) != 0:
            raise HTTPException(status_code=400, detail="لا يمكن حذف صندوق فيه رصيد — حوّل الرصيد أولاً")
        await db.cash_boxes.delete_one({"id": box_id})
        return {"success": True}

    class TransferBody(BaseModel):
        from_box: str
        to_box: str
        amount: float

    @router.post("/cash-boxes/transfer")
    async def transfer_between_boxes(body: TransferBody, admin: dict = Depends(require_permission("pos"))):
        from_box, to_box, amount = body.from_box, body.to_box, body.amount
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Amount must be positive")
        from_cash_box = await db.cash_boxes.find_one({"id": from_box})
        # p180: صندوق «المال الخاص» يجوز أن يسالب — مال المالك من جيبه
        if not from_cash_box or (from_box != 'personal' and from_cash_box["balance"] < amount):
            raise HTTPException(status_code=400, detail="Insufficient balance")
        now = datetime.now(timezone.utc).isoformat()
        await db.cash_boxes.update_one({"id": from_box}, {"$inc": {"balance": -amount}, "$set": {"updated_at": now}})
        await db.cash_boxes.update_one({"id": to_box}, {"$inc": {"balance": amount}, "$set": {"updated_at": now}})
        transfer_id = str(uuid.uuid4())
        await db.transactions.insert_many([
            {"id": str(uuid.uuid4()), "cash_box_id": from_box, "type": "expense", "amount": amount, "description": f"تحويل إلى {to_box}", "reference_type": "transfer", "reference_id": transfer_id, "created_at": now, "created_by": admin["name"]},
            {"id": str(uuid.uuid4()), "cash_box_id": to_box, "type": "income", "amount": amount, "description": f"تحويل من {from_box}", "reference_type": "transfer", "reference_id": transfer_id, "created_at": now, "created_by": admin["name"]}
        ])
        return {"message": "Transfer completed successfully"}

    @router.put("/cash-boxes/{box_id}/adjust")
    async def adjust_cash_box(box_id: str, new_balance: float, reason: str = "تعديل يدوي", admin: dict = Depends(require_permission("pos"))):
        box = await db.cash_boxes.find_one({"id": box_id})
        if not box:
            raise HTTPException(status_code=404, detail="صندوق غير موجود")
        old_balance = box.get("balance", 0)
        now = datetime.now(timezone.utc).isoformat()
        await db.cash_boxes.update_one({"id": box_id}, {"$set": {"balance": new_balance, "updated_at": now}})
        await db.transactions.insert_one({"id": str(uuid.uuid4()), "cash_box_id": box_id, "type": "adjustment", "amount": abs(new_balance - old_balance), "description": f"{reason} (من {old_balance} إلى {new_balance})", "reference_type": "manual_adjustment", "created_at": now, "created_by": admin["name"]})
        return {"message": "تم تعديل الرصيد بنجاح", "old_balance": old_balance, "new_balance": new_balance, "difference": new_balance - old_balance}

    @router.post("/cash-boxes/reset-all")
    async def reset_all(admin: dict = Depends(require_permission("pos"))):
        now = datetime.now(timezone.utc).isoformat()
        boxes = await db.cash_boxes.find({}, {"_id": 0}).to_list(100)
        await db.cash_boxes.update_many({}, {"$set": {"balance": 0, "updated_at": now}})
        for box in boxes:
            if box.get("balance", 0) != 0:
                await db.transactions.insert_one({"id": str(uuid.uuid4()), "cash_box_id": box["id"], "type": "adjustment", "amount": abs(box.get("balance", 0)), "description": f"إعادة تعيين الرصيد (كان {box.get('balance', 0)})", "reference_type": "reset", "created_at": now, "created_by": admin["name"]})
        return {"message": "تم إعادة تعيين جميع الصناديق إلى صفر"}

    @router.get("/transactions")
    async def get_transactions(cash_box_id: Optional[str] = None, type: Optional[str] = None, admin: dict = Depends(require_permission("pos"))):
        query = {}
        if cash_box_id:
            query["cash_box_id"] = cash_box_id
        if type:
            query["type"] = type
        transactions = await db.transactions.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
        cash_boxes = {b["id"]: b["name"] for b in await db.cash_boxes.find({}, {"_id": 0}).to_list(100)}
        for t in transactions:
            t["cash_box_name"] = cash_boxes.get(t.get("cash_box_id"), t.get("cash_box_id", ""))
            t["balance_after"] = 0
        return transactions

    @router.get("/transactions/paginated")
    async def get_transactions_paginated(
        cash_box_id: Optional[str] = None, type: Optional[str] = None,
        page: int = 1, page_size: int = 20,
        admin: dict = Depends(require_permission("pos"))
    ):
        from utils.pagination import paginate
        query = {}
        if cash_box_id:
            query["cash_box_id"] = cash_box_id
        if type:
            query["type"] = type
        result = await paginate(db.transactions, query, page, page_size)
        cash_boxes = {b["id"]: b["name"] for b in await db.cash_boxes.find({}, {"_id": 0}).to_list(100)}
        for t in result["items"]:
            t["cash_box_name"] = cash_boxes.get(t.get("cash_box_id"), t.get("cash_box_id", ""))
            t["balance_after"] = 0
        return result

    return router
