"""
Sales Routes — thin HTTP layer. Business logic lives in
services/application/sales_service.py
"""
from fastapi import APIRouter, HTTPException, Depends
from services.balances import adjust_customer_mirror, adjust_supplier_mirror
from typing import Optional


def create_sales_routes(db, get_current_user, get_tenant_admin, require_tenant) -> dict:
    from utils.permissions import create_permission_checker
    from services.application.sales_service import create_sale_op, delete_sale_op, return_sale_op
    require_permission = create_permission_checker(db, get_current_user)
    router = APIRouter(prefix="/sales", tags=["sales"])

    # ── Create Sale ──
    @router.post("", status_code=201)
    async def create_sale(sale: dict, user: dict = Depends(require_permission("sales.add"))):
        from models.schemas import SaleCreate
        s = SaleCreate(**sale)
        return await create_sale_op(db, s, user)

    # ── Get Sales ──
    @router.get("")
    async def get_sales(
        start_date: Optional[str] = None, end_date: Optional[str] = None,
        customer_id: Optional[str] = None, user: dict = Depends(require_tenant)
    ):
        query = {}
        if customer_id:
            query["customer_id"] = customer_id
        if start_date:
            query["created_at"] = {"$gte": start_date}
        if end_date:
            if "created_at" in query:
                query["created_at"]["$lte"] = end_date
            else:
                query["created_at"] = {"$lte": end_date}
        return await db.sales.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)

    # ── Paginated Sales ──
    @router.get("/paginated")
    async def get_sales_paginated(
        start_date: Optional[str] = None, end_date: Optional[str] = None,
        customer_id: Optional[str] = None, page: int = 1, page_size: int = 20,
        user: dict = Depends(require_tenant)
    ):
        query = {}
        if customer_id:
            query["customer_id"] = customer_id
        if start_date:
            query["created_at"] = {"$gte": start_date}
        if end_date:
            if "created_at" in query:
                query["created_at"]["$lte"] = end_date
            else:
                query["created_at"] = {"$lte": end_date}

        total = await db.sales.count_documents(query)
        total_pages = (total + page_size - 1) // page_size if page_size > 0 else 1
        skip = (page - 1) * page_size
        sales = await db.sales.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)
        return {"items": sales, "total": total, "page": page, "page_size": page_size, "total_pages": total_pages}

    # ── Generate Sale Code ──
    @router.get("/generate-code")
    async def generate_sale_code(user: dict = Depends(require_tenant)):
        from datetime import datetime as dt
        year = str(dt.now().year)[2:]
        pipeline = [
            {"$match": {"code": {"$regex": f"^BV\\d+/{year}$"}}},
            {"$project": {"num": {"$toInt": {"$substrCP": ["$code", 2, {"$subtract": [{"$strLenCP": "$code"}, 5]}]}}}},
            {"$sort": {"num": -1}},
            {"$limit": 1}
        ]
        result = await db.sales.aggregate(pipeline).to_list(1)
        next_num = result[0]["num"] + 1 if result else 1
        return {"code": f"BV{str(next_num).zfill(4)}/{year}"}

    # ── Get Single Sale ──
    @router.get("/{sale_id}")
    async def get_sale(sale_id: str, user: dict = Depends(require_permission("sales.view"))):
        sale = await db.sales.find_one({"id": sale_id}, {"_id": 0})
        if not sale:
            raise HTTPException(status_code=404, detail="Sale not found")
        return sale

    # ── Update Sale (notes, customer, record payment) ──
    @router.put("/{sale_id}")
    async def update_sale(sale_id: str, data: dict, user: dict = Depends(require_permission("sales.edit"))):
        from datetime import datetime, timezone
        import uuid
        sale = await db.sales.find_one({"id": sale_id})
        if not sale:
            raise HTTPException(status_code=404, detail="Sale not found")
        now = datetime.now(timezone.utc).isoformat()
        updates = {"updated_at": now}

        if "notes" in data:
            updates["notes"] = data.get("notes", "")

        # Customer reassignment
        if "customer_id" in data:
            new_cid = data["customer_id"]
            old_cid = sale.get("customer_id")
            if new_cid != old_cid:
                if old_cid:
                    await adjust_customer_mirror(db, old_cid,
                        total_purchases=-sale.get("total", 0), balance=-sale.get("remaining", 0))
                if new_cid:
                    cust = await db.customers.find_one({"id": new_cid}, {"_id": 0})
                    if cust:
                        await adjust_customer_mirror(db, new_cid,
                            total_purchases=sale.get("total", 0), balance=sale.get("remaining", 0))
                        updates["customer_id"] = new_cid
                        updates["customer_name"] = cust.get("name", "")
                else:
                    updates["customer_id"] = None
                    updates["customer_name"] = ""

        # Record additional payment
        payment_amount = float(data.get("payment_amount") or 0)
        if payment_amount > 0:
            new_paid = float(sale.get("paid_amount", 0)) + payment_amount
            new_remaining = max(0.0, float(sale.get("total", 0)) - new_paid)
            updates["paid_amount"] = new_paid
            updates["remaining"] = new_remaining
            updates["payment_status"] = "paid" if new_remaining <= 0.01 else "partial"

            cust_id = updates.get("customer_id", sale.get("customer_id"))
            if cust_id:
                await adjust_customer_mirror(db, cust_id, balance=-payment_amount, total_debt=-payment_amount)  # p58

            cash_box_id = data.get("cash_box_id")
            if cash_box_id:
                # p67: log which box this additional payment used
                await db.sales.update_one({"id": sale_id}, {"$push": {"payments": {"amount": payment_amount, "method": cash_box_id, "at": now}}})
                await db.cash_boxes.update_one(
                    {"id": cash_box_id},
                    {"$inc": {"balance": payment_amount}, "$set": {"updated_at": now}}
                )
                await db.transactions.insert_one({
                    "id": str(uuid.uuid4()), "cash_box_id": cash_box_id,
                    "type": "income", "amount": payment_amount,
                    "description": f"دفعة إضافية - فاتورة {sale.get('invoice_number', '')}",
                    "reference_type": "sale_payment", "reference_id": sale_id,
                    "created_at": now, "created_by": user.get("name", "")
                })

        if updates:
            await db.sales.update_one({"id": sale_id}, {"$set": updates})
        updated = await db.sales.find_one({"id": sale_id}, {"_id": 0})
        return updated

    # ── Delete Sale (permission-gated, with audit log) ──
    @router.delete("/{sale_id}")
    async def delete_sale(sale_id: str, data: dict, user: dict = Depends(require_permission("sales.delete"))):
        reason = (data.get("reason") or "").strip()
        await delete_sale_op(db, sale_id, reason, user)
        return {"message": "Sale deleted successfully"}

    # ── Return Sale ──
    @router.post("/{sale_id}/return")
    async def return_sale(sale_id: str, user: dict = Depends(require_permission("sales.refund"))):
        await return_sale_op(db, sale_id, user)
        return {"message": "Sale returned successfully"}

    return router
