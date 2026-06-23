"""
Debt Routes - Extracted from server.py
CRUD, payments, overdue tracking
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from datetime import datetime, timezone
import uuid


def create_debts_routes(db, get_current_user, get_tenant_admin, require_tenant) -> dict:
    from utils.permissions import create_permission_checker
    require_permission = create_permission_checker(db, get_current_user)
    router = APIRouter(prefix="/debts", tags=["debts"])

    @router.post("")
    async def create_debt(debt: dict, admin: dict = Depends(require_permission("debts.edit"))):
        from models.schemas import DebtCreate
        d = DebtCreate(**debt)
        if d.party_type == "customer":
            party = await db.customers.find_one({"id": d.party_id}, {"_id": 0, "name": 1})
        else:
            party = await db.suppliers.find_one({"id": d.party_id}, {"_id": 0, "name": 1})
        if not party:
            raise HTTPException(status_code=404, detail="Party not found")
        now = datetime.now(timezone.utc).isoformat()
        debt_id = str(uuid.uuid4())
        doc = {
            "id": debt_id, "type": d.type, "party_type": d.party_type, "party_id": d.party_id,
            "party_name": party["name"], "original_amount": d.amount, "paid_amount": 0,
            "remaining_amount": d.amount, "due_date": d.due_date or "", "status": "pending",
            "notes": d.notes or "", "reference_type": d.reference_type or "",
            "reference_id": d.reference_id or "", "created_at": now
        }
        await db.debts.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.get("")
    async def get_debts(type: Optional[str] = None, party_type: Optional[str] = None, status: Optional[str] = None, admin: dict = Depends(require_permission("debts.edit"))):
        query = {}
        if type: query["type"] = type
        if party_type: query["party_type"] = party_type
        if status: query["status"] = status
        debts = await db.debts.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        for debt in debts:
            if debt.get("due_date") and debt["due_date"] < today and debt["status"] not in ["paid", "overdue"]:
                await db.debts.update_one({"id": debt["id"]}, {"$set": {"status": "overdue"}})
                debt["status"] = "overdue"
        return debts

    @router.get("/paginated")
    async def get_debts_paginated(
        type: Optional[str] = None, party_type: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1, page_size: int = 20,
        admin: dict = Depends(require_permission("debts.edit"))
    ):
        from utils.pagination import paginate
        query = {}
        if type: query["type"] = type
        if party_type: query["party_type"] = party_type
        if status: query["status"] = status
        return await paginate(db.debts, query, page, page_size)

    @router.post("/{debt_id}/pay")
    async def pay_debt(debt_id: str, payment: dict, admin: dict = Depends(require_permission("debts.edit"))):
        from models.schemas import DebtPaymentCreate
        p = DebtPaymentCreate(**payment)
        debt = await db.debts.find_one({"id": debt_id})
        if not debt:
            raise HTTPException(status_code=404, detail="Debt not found")
        if p.amount > debt["remaining_amount"]:
            raise HTTPException(status_code=400, detail="Payment exceeds remaining")
        now = datetime.now(timezone.utc).isoformat()
        payment_id = str(uuid.uuid4())
        new_paid = debt["paid_amount"] + p.amount
        new_remaining = debt["remaining_amount"] - p.amount
        new_status = "paid" if new_remaining <= 0 else "partial"
        await db.debts.update_one({"id": debt_id}, {"$set": {"paid_amount": new_paid, "remaining_amount": new_remaining, "status": new_status}})
        payment_doc = {"id": payment_id, "debt_id": debt_id, "amount": p.amount, "payment_method": p.payment_method, "notes": p.notes or "", "created_at": now, "created_by": admin["name"]}
        await db.debt_payments.insert_one(payment_doc)
        tx_type = "income" if debt["type"] == "receivable" else "expense"
        amt = p.amount if tx_type == "income" else -p.amount
        await db.cash_boxes.update_one({"id": p.payment_method}, {"$inc": {"balance": amt}, "$set": {"updated_at": now}})
        await db.transactions.insert_one({"id": str(uuid.uuid4()), "cash_box_id": p.payment_method, "type": tx_type, "amount": p.amount, "description": f"سداد دين - {debt['party_name']}", "reference_type": "debt_payment", "reference_id": payment_id, "created_at": now, "created_by": admin["name"]})
        payment_doc.pop("_id", None)
        return payment_doc

    @router.get("/{debt_id}/payments")
    async def get_debt_payments(debt_id: str, admin: dict = Depends(require_permission("debts.edit"))):
        return await db.debt_payments.find({"debt_id": debt_id}, {"_id": 0}).sort("created_at", -1).to_list(100)

    return router
