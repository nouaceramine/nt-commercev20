"""
Cash Box & Transactions Routes - Extracted from server.py
Cash box management, transfers, adjustments, transactions
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone
import uuid


def create_cashbox_routes(db, get_current_user, get_tenant_admin, require_tenant, init_cash_boxes) -> dict:
    from utils.permissions import create_permission_checker
    require_permission = create_permission_checker(db, get_current_user)
    router = APIRouter(tags=["cash-boxes"])

    @router.get("/cash-boxes")
    async def get_cash_boxes(admin: dict = Depends(require_permission("cash_boxes.edit"))):
        await init_cash_boxes()
        return await db.cash_boxes.find({}, {"_id": 0}).to_list(100)

    @router.post("/cash-boxes/transfer")
    async def transfer_between_boxes(from_box: str, to_box: str, amount: float, admin: dict = Depends(require_permission("cash_boxes.edit"))):
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Amount must be positive")
        from_cash_box = await db.cash_boxes.find_one({"id": from_box})
        if not from_cash_box or from_cash_box["balance"] < amount:
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
    async def adjust_cash_box(box_id: str, new_balance: float, reason: str = "تعديل يدوي", admin: dict = Depends(require_permission("cash_boxes.edit"))):
        box = await db.cash_boxes.find_one({"id": box_id})
        if not box:
            raise HTTPException(status_code=404, detail="صندوق غير موجود")
        old_balance = box.get("balance", 0)
        now = datetime.now(timezone.utc).isoformat()
        await db.cash_boxes.update_one({"id": box_id}, {"$set": {"balance": new_balance, "updated_at": now}})
        await db.transactions.insert_one({"id": str(uuid.uuid4()), "cash_box_id": box_id, "type": "adjustment", "amount": abs(new_balance - old_balance), "description": f"{reason} (من {old_balance} إلى {new_balance})", "reference_type": "manual_adjustment", "created_at": now, "created_by": admin["name"]})
        return {"message": "تم تعديل الرصيد بنجاح", "old_balance": old_balance, "new_balance": new_balance, "difference": new_balance - old_balance}

    @router.post("/cash-boxes/reset-all")
    async def reset_all(admin: dict = Depends(require_permission("cash_boxes.edit"))):
        now = datetime.now(timezone.utc).isoformat()
        boxes = await db.cash_boxes.find({}, {"_id": 0}).to_list(100)
        await db.cash_boxes.update_many({}, {"$set": {"balance": 0, "updated_at": now}})
        for box in boxes:
            if box.get("balance", 0) != 0:
                await db.transactions.insert_one({"id": str(uuid.uuid4()), "cash_box_id": box["id"], "type": "adjustment", "amount": abs(box.get("balance", 0)), "description": f"إعادة تعيين الرصيد (كان {box.get('balance', 0)})", "reference_type": "reset", "created_at": now, "created_by": admin["name"]})
        return {"message": "تم إعادة تعيين جميع الصناديق إلى صفر"}

    @router.get("/transactions")
    async def get_transactions(cash_box_id: Optional[str] = None, type: Optional[str] = None, admin: dict = Depends(require_permission("cash_boxes.edit"))):
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
        admin: dict = Depends(require_permission("cash_boxes.edit"))
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
