"""
Sales Routes - Extracted from server.py
Full CRUD, pagination, returns
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid


def create_sales_routes(db, get_current_user, get_tenant_admin, require_tenant) -> dict:
    from utils.permissions import create_permission_checker
    require_permission = create_permission_checker(db, get_current_user)
    router = APIRouter(prefix="/sales", tags=["sales"])

    async def _generate_invoice_number(prefix: str) -> str:
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        count = await db.counters.find_one_and_update(
            {"_id": f"{prefix}_{today}"},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=True
        )
        return f"{prefix}-{today}-{count['seq']:04d}"

    # ── Create Sale ──
    @router.post("", status_code=201)
    async def create_sale(sale: dict, user: dict = Depends(require_permission("sales.view"))):
        from models.schemas import SaleCreate
        s = SaleCreate(**sale)
        sale_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        invoice_number = await _generate_invoice_number("INV")

        customer_name = "عميل نقدي"
        if s.customer_id:
            customer = await db.customers.find_one({"id": s.customer_id})
            if customer:
                customer_name = customer["name"]

        if s.payment_type in ["credit", "partial"] and not s.customer_id:
            raise HTTPException(status_code=400, detail="Customer required for credit sale")

        delivery_fee = 0
        delivery_info = None
        if s.delivery and s.delivery.enabled:
            delivery_fee = s.delivery.fee
            delivery_info = {
                "enabled": True, "wilaya_code": s.delivery.wilaya_code,
                "wilaya_name": s.delivery.wilaya_name, "city": s.delivery.city,
                "address": s.delivery.address, "delivery_type": s.delivery.delivery_type,
                "fee": delivery_fee
            }

        final_total = s.total + delivery_fee
        if s.payment_type == "installment" and s.installment_plan:
            s.paid_amount = s.installment_plan.down_payment
        remaining = final_total - s.paid_amount
        debt_amount = remaining if s.payment_type in ["credit", "partial", "installment"] else 0
        status = "paid" if remaining <= 0 else ("partial" if s.paid_amount > 0 else "unpaid")

        enriched_items = []
        for item in s.items:
            item_dict = item.model_dump()
            if "purchase_price" not in item_dict or item_dict.get("purchase_price") is None:
                product = await db.products.find_one({"id": item.product_id}, {"_id": 0, "purchase_price": 1})
                item_dict["purchase_price"] = product.get("purchase_price", 0) if product else 0
            enriched_items.append(item_dict)

        installment_info = None
        if s.payment_type == "installment" and s.installment_plan:
            plan = s.installment_plan
            remaining_after_down = final_total - plan.down_payment
            interest_amount = remaining_after_down * plan.interest_rate / 100
            total_with_interest = remaining_after_down + interest_amount
            installment_amount = round(total_with_interest / plan.installments_count, 2)
            installment_info = {
                "down_payment": plan.down_payment,
                "installments_count": plan.installments_count,
                "interest_rate": plan.interest_rate,
                "interest_amount": round(interest_amount, 2),
                "installment_amount": installment_amount,
                "total_with_interest": round(final_total - plan.down_payment + interest_amount, 2),
                "frequency": plan.frequency,
                "first_due_date": plan.first_due_date,
            }

        sale_doc = {
            "id": sale_id, "invoice_number": invoice_number,
            "code": s.code or "",
            "customer_id": s.customer_id, "customer_name": customer_name,
            "items": enriched_items,
            "subtotal": s.subtotal, "discount": s.discount,
            "delivery_fee": delivery_fee, "delivery": delivery_info,
            "total": final_total,
            "paid_amount": s.paid_amount, "debt_amount": debt_amount,
            "remaining": max(0, remaining),
            "payment_method": s.payment_method, "payment_type": s.payment_type,
            "installment_plan": installment_info,
            "status": status,
            "notes": s.notes or "", "created_at": now, "created_by": user["name"]
        }
        await db.sales.insert_one(sale_doc)

        if s.payment_type == "installment" and installment_info:
            from datetime import datetime as dt, timedelta
            first_due = dt.strptime(installment_info["first_due_date"], "%Y-%m-%d")
            freq_days = 30 if installment_info["frequency"] == "monthly" else 7
            interest_share = round(installment_info["interest_amount"] / installment_info["installments_count"], 2)
            for i in range(installment_info["installments_count"]):
                due = (first_due + timedelta(days=freq_days * i)).strftime("%Y-%m-%d")
                await db.installment_payments.insert_one({
                    "id": str(uuid.uuid4()),
                    "sale_id": sale_id,
                    "invoice_number": invoice_number,
                    "customer_id": s.customer_id,
                    "customer_name": customer_name,
                    "installment_number": i + 1,
                    "total_installments": installment_info["installments_count"],
                    "amount": installment_info["installment_amount"],
                    "interest_share": interest_share,
                    "due_date": due,
                    "status": "pending",
                    "paid_date": None,
                    "paid_by": None,
                    "created_at": now,
                })

        for item in s.items:
            await db.products.update_one({"id": item.product_id}, {"$inc": {"quantity": -item.quantity}})
            product = await db.products.find_one({"id": item.product_id})
            if product:
                threshold = product.get("low_stock_threshold", 10)
                if product.get("quantity", 0) < threshold:
                    await db.notifications.insert_one({
                        "id": str(uuid.uuid4()), "type": "low_stock",
                        "message_en": f"Low stock alert: '{product.get('name_en')}' ({product.get('quantity')} remaining)",
                        "message_ar": f"تنبيه مخزون: '{product.get('name_ar')}' ({product.get('quantity')} متبقي)",
                        "product_id": item.product_id, "read": False, "created_at": now
                    })

        if s.customer_id:
            await db.customers.update_one(
                {"id": s.customer_id},
                {"$inc": {"total_purchases": final_total, "balance": debt_amount, "total_debt": debt_amount}}
            )

        if s.paid_amount > 0:
            cash_box_id = s.payment_method
            await db.cash_boxes.update_one({"id": cash_box_id}, {"$inc": {"balance": s.paid_amount}, "$set": {"updated_at": now}})
            await db.transactions.insert_one({
                "id": str(uuid.uuid4()), "cash_box_id": cash_box_id,
                "type": "income", "amount": s.paid_amount,
                "description": f"مبيعات - فاتورة {invoice_number}",
                "reference_type": "sale", "reference_id": sale_id,
                "created_at": now, "created_by": user["name"]
            })

        sale_doc.pop("_id", None)
        return sale_doc

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
    async def generate_sale_code():
        from datetime import datetime as dt
        year = str(dt.now().year)[2:]
        pipeline = [
            {"$match": {"code": {"$regex": f"^BV\\d{{4}}/{year}$"}}},
            {"$project": {"num": {"$toInt": {"$substr": ["$code", 2, 4]}}}},
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
    async def update_sale(sale_id: str, data: dict, user: dict = Depends(require_permission("sales.view"))):
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
                    await db.customers.update_one(
                        {"id": old_cid},
                        {"$inc": {"total_purchases": -sale.get("total", 0), "balance": -sale.get("remaining", 0)}}
                    )
                if new_cid:
                    cust = await db.customers.find_one({"id": new_cid}, {"_id": 0})
                    if cust:
                        await db.customers.update_one(
                            {"id": new_cid},
                            {"$inc": {"total_purchases": sale.get("total", 0), "balance": sale.get("remaining", 0)}}
                        )
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
                await db.customers.update_one({"id": cust_id}, {"$inc": {"balance": -payment_amount}})

            cash_box_id = data.get("cash_box_id")
            if cash_box_id:
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

    # ── Delete Sale (admin only, with audit log) ──
    @router.delete("/{sale_id}")
    async def delete_sale(sale_id: str, data: dict, user: dict = Depends(require_permission("sales.view"))):
        if not user.get("is_admin"):
            raise HTTPException(status_code=403, detail="مسموح للأدمن فقط")
        sale = await db.sales.find_one({"id": sale_id})
        if not sale:
            raise HTTPException(status_code=404, detail="Sale not found")
        reason = (data.get("reason") or "").strip()
        if not reason:
            raise HTTPException(status_code=400, detail="يجب إدخال سبب الحذف")
        now = datetime.now(timezone.utc).isoformat()
        # Restore stock
        for item in sale.get("items", []):
            await db.products.update_one({"id": item["product_id"]}, {"$inc": {"quantity": item["quantity"]}})
        # Revert customer stats
        if sale.get("customer_id"):
            await db.customers.update_one(
                {"id": sale["customer_id"]},
                {"$inc": {"total_purchases": -sale.get("total", 0), "balance": -sale.get("remaining", 0)}}
            )
        # Reverse cash
        if sale.get("paid_amount", 0) > 0 and sale.get("cash_box_id"):
            await db.cash_boxes.update_one(
                {"id": sale["cash_box_id"]},
                {"$inc": {"balance": -sale["paid_amount"]}, "$set": {"updated_at": now}}
            )
        # Audit log
        await db.audit_log.insert_one({
            "id": str(uuid.uuid4()), "action": "delete_sale",
            "entity_type": "sale", "entity_id": sale_id,
            "entity_ref": sale.get("invoice_number", ""),
            "reason": reason, "performed_by": user.get("name", ""),
            "performed_by_id": user.get("id", ""),
            "sale_total": sale.get("total", 0),
            "snapshot": {k: v for k, v in sale.items() if k != "_id"},
            "created_at": now
        })
        await db.sales.delete_one({"id": sale_id})
        return {"message": "Sale deleted successfully"}

    # ── Return Sale ──
    @router.post("/{sale_id}/return")
    async def return_sale(sale_id: str, user: dict = Depends(require_permission("sales.view"))):
        sale = await db.sales.find_one({"id": sale_id})
        if not sale:
            raise HTTPException(status_code=404, detail="Sale not found")
        now = datetime.now(timezone.utc).isoformat()

        for item in sale["items"]:
            await db.products.update_one({"id": item["product_id"]}, {"$inc": {"quantity": item["quantity"]}})

        if sale.get("customer_id"):
            await db.customers.update_one(
                {"id": sale["customer_id"]},
                {"$inc": {"total_purchases": -sale["total"], "balance": -sale.get("remaining", 0)}}
            )

        if sale.get("paid_amount", 0) > 0:
            await db.cash_boxes.update_one(
                {"id": sale["payment_method"]},
                {"$inc": {"balance": -sale["paid_amount"]}, "$set": {"updated_at": now}}
            )
            await db.transactions.insert_one({
                "id": str(uuid.uuid4()), "cash_box_id": sale["payment_method"],
                "type": "expense", "amount": sale["paid_amount"],
                "description": f"إرجاع مبيعات - فاتورة {sale['invoice_number']}",
                "reference_type": "return", "reference_id": sale_id,
                "created_at": now, "created_by": user["name"]
            })

        await db.sales.update_one({"id": sale_id}, {"$set": {"status": "returned"}})
        return {"message": "Sale returned successfully"}

    return router
