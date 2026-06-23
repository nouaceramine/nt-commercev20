"""
Installment Sales Routes
GET  /installments              — list all installment payments (with filters)
GET  /installments/summary      — dashboard stats
GET  /installments/sale/{id}    — get plan for a specific sale
POST /installments/{id}/pay     — mark an installment as paid
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid


def create_installments_routes(db, get_current_user, require_tenant) -> APIRouter:
    router = APIRouter(prefix="/installments", tags=["installments"])

    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    # ── Summary ──
    @router.get("/summary")
    async def get_summary(user: dict = Depends(get_current_user)):
        today = datetime.now(timezone.utc).date().isoformat()
        all_inst = await db.installment_payments.find({}, {"_id": 0}).to_list(length=10000)
        total_owed       = sum(i["amount"] for i in all_inst if i["status"] != "paid")
        total_collected  = sum(i["amount"] for i in all_inst if i["status"] == "paid")
        overdue_count    = sum(1 for i in all_inst if i["status"] == "overdue" or (i["status"] == "pending" and i.get("due_date", "") < today))
        pending_count    = sum(1 for i in all_inst if i["status"] == "pending")
        paid_count       = sum(1 for i in all_inst if i["status"] == "paid")
        interest_earned  = sum(i.get("interest_share", 0) for i in all_inst if i["status"] == "paid")
        return {
            "total_owed": round(total_owed, 2),
            "total_collected": round(total_collected, 2),
            "overdue_count": overdue_count,
            "pending_count": pending_count,
            "paid_count": paid_count,
            "interest_earned": round(interest_earned, 2),
        }

    # ── List all installments ──
    @router.get("")
    async def list_installments(
        status: Optional[str] = Query(None),
        customer_id: Optional[str] = Query(None),
        user: dict = Depends(get_current_user),
    ):
        query = {}
        if status:
            today = datetime.now(timezone.utc).date().isoformat()
            if status == "overdue":
                query = {"status": {"$in": ["pending", "overdue"]}, "due_date": {"$lt": today}}
            else:
                query["status"] = status
        if customer_id:
            query["customer_id"] = customer_id

        items = await db.installment_payments.find(query, {"_id": 0}).sort("due_date", 1).to_list(length=10000)

        today = datetime.now(timezone.utc).date().isoformat()
        for item in items:
            if item["status"] == "pending" and item.get("due_date", "") < today:
                item["status"] = "overdue"
                await db.installment_payments.update_one({"id": item["id"]}, {"$set": {"status": "overdue"}})

        return items

    # ── Get installments for a sale ──
    @router.get("/sale/{sale_id}")
    async def get_sale_installments(sale_id: str, user: dict = Depends(get_current_user)):
        items = await db.installment_payments.find(
            {"sale_id": sale_id}, {"_id": 0}
        ).sort("installment_number", 1).to_list(length=100)
        return items

    # ── Pay an installment ──
    @router.post("/{installment_id}/pay")
    async def pay_installment(
        installment_id: str,
        data: dict,
        user: dict = Depends(get_current_user),
    ):
        inst = await db.installment_payments.find_one({"id": installment_id}, {"_id": 0})
        if not inst:
            raise HTTPException(status_code=404, detail="Installment not found")
        if inst["status"] == "paid":
            raise HTTPException(status_code=400, detail="Already paid")

        now = _now()
        payment_method = data.get("payment_method", "cash")
        paid_amount = inst["amount"]

        await db.installment_payments.update_one(
            {"id": installment_id},
            {"$set": {"status": "paid", "paid_date": now, "paid_by": user.get("name", "")}}
        )

        if payment_method and payment_method not in ["credit", "none"]:
            await db.cash_boxes.update_one(
                {"id": payment_method},
                {"$inc": {"balance": paid_amount}, "$set": {"updated_at": now}}
            )
            await db.transactions.insert_one({
                "id": str(uuid.uuid4()), "cash_box_id": payment_method,
                "type": "income", "amount": paid_amount,
                "description": f"قسط #{inst['installment_number']} - {inst.get('customer_name', '')}",
                "reference_type": "installment", "reference_id": installment_id,
                "created_at": now, "created_by": user.get("name", ""),
            })

        if inst.get("customer_id"):
            await db.customers.update_one(
                {"id": inst["customer_id"]},
                {"$inc": {"balance": -paid_amount}}
            )

        await db.sales.update_one(
            {"id": inst["sale_id"]},
            {"$inc": {"paid_amount": paid_amount, "remaining": -paid_amount}}
        )
        sale = await db.sales.find_one({"id": inst["sale_id"]}, {"_id": 0, "remaining": 1, "paid_amount": 1, "total": 1})
        if sale:
            new_remaining = max(0, sale.get("remaining", 0))
            new_status = "paid" if new_remaining <= 0 else "partial"
            await db.sales.update_one({"id": inst["sale_id"]}, {"$set": {"remaining": new_remaining, "status": new_status}})

        return {"ok": True, "message": "تم تسجيل الدفع بنجاح"}

    # ── Get cash boxes (for pay dialog) ──
    @router.get("/cash-boxes")
    async def get_cash_boxes(user: dict = Depends(get_current_user)):
        boxes = await db.cash_boxes.find({}, {"_id": 0, "id": 1, "name": 1, "balance": 1}).to_list(length=100)
        return boxes

    return router
