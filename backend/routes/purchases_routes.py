"""
Purchase Routes - Extracted from server.py
Full CRUD with supplier balance, cash box updates
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid


def create_purchases_routes(db, get_current_user, get_tenant_admin, require_tenant) -> dict:
    from utils.permissions import create_permission_checker
    require_permission = create_permission_checker(db, get_current_user)
    router = APIRouter(prefix="/purchases", tags=["purchases"])

    async def _generate_invoice_number(prefix: str) -> str:
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        count = await db.counters.find_one_and_update(
            {"_id": f"{prefix}_{today}"},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=True
        )
        return f"{prefix}-{today}-{count['seq']:04d}"

    class PurchaseUpdate(BaseModel):
        paid_amount: Optional[float] = None
        notes: Optional[str] = None

    # ── Create Purchase ──
    @router.post("", status_code=201)
    async def create_purchase(purchase: dict, admin: dict = Depends(require_permission("purchases.edit"))):
        from models.schemas import PurchaseCreate
        p = PurchaseCreate(**purchase)
        purchase_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        invoice_number = await _generate_invoice_number("PUR")

        supplier = await db.suppliers.find_one({"id": p.supplier_id})
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")

        remaining = p.total - p.paid_amount
        status = "paid" if remaining <= 0 else ("partial" if p.paid_amount > 0 else "unpaid")

        purchase_doc = {
            "id": purchase_id, "invoice_number": invoice_number,
            "code": p.code or "",
            "supplier_id": p.supplier_id, "supplier_name": supplier["name"],
            "items": [item.model_dump() for item in p.items],
            "total": p.total, "paid_amount": p.paid_amount,
            "remaining": max(0, remaining), "payment_method": p.payment_method,
            "status": status, "notes": p.notes or "",
            "created_at": now, "created_by": admin["name"]
        }
        await db.purchases.insert_one(purchase_doc)

        for item in p.items:
            product = await db.products.find_one({"id": item.product_id})
            old_quantity = product.get("quantity", 0) if product else 0
            await db.products.update_one({"id": item.product_id}, {"$inc": {"quantity": item.quantity}})
            if old_quantity == 0 and item.quantity > 0 and product:
                await db.notifications.insert_one({
                    "id": str(uuid.uuid4()), "type": "restock",
                    "message_en": f"Product '{product.get('name_en')}' is back in stock!",
                    "message_ar": f"المنتج '{product.get('name_ar')}' متوفر مرة أخرى!",
                    "product_id": item.product_id, "read": False, "created_at": now
                })

        await db.suppliers.update_one(
            {"id": p.supplier_id},
            {"$inc": {"total_purchases": p.total, "balance": remaining}}
        )

        if p.paid_amount > 0:
            await db.cash_boxes.update_one(
                {"id": p.payment_method},
                {"$inc": {"balance": -p.paid_amount}, "$set": {"updated_at": now}}
            )
            await db.transactions.insert_one({
                "id": str(uuid.uuid4()), "cash_box_id": p.payment_method,
                "type": "expense", "amount": p.paid_amount,
                "description": f"مشتريات - فاتورة {invoice_number}",
                "reference_type": "purchase", "reference_id": purchase_id,
                "created_at": now, "created_by": admin["name"]
            })

        purchase_doc.pop("_id", None)
        return purchase_doc

    # ── Get Purchases ──
    @router.get("")
    async def get_purchases(supplier_id: Optional[str] = None, admin: dict = Depends(require_permission("purchases.edit"))):
        query = {"supplier_id": supplier_id} if supplier_id else {}
        return await db.purchases.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)

    # ── Paginated Purchases ──
    @router.get("/paginated")
    async def get_purchases_paginated(
        supplier_id: Optional[str] = None,
        start_date: Optional[str] = None, end_date: Optional[str] = None,
        page: int = 1, page_size: int = 20,
        admin: dict = Depends(require_permission("purchases.edit"))
    ):
        from utils.pagination import paginate
        query = {}
        if supplier_id:
            query["supplier_id"] = supplier_id
        if start_date:
            query["created_at"] = {"$gte": start_date}
        if end_date:
            if "created_at" in query:
                query["created_at"]["$lte"] = end_date
            else:
                query["created_at"] = {"$lte": end_date}
        return await paginate(db.purchases, query, page, page_size)

    # ── Generate Purchase Code ──
    @router.get("/generate-code")
    async def generate_purchase_code():
        from datetime import datetime as dt
        year = str(dt.now().year)[2:]
        pipeline = [
            {"$match": {"code": {"$regex": f"^AC\\d{{4}}/{year}$"}}},
            {"$project": {"num": {"$toInt": {"$substr": ["$code", 2, 4]}}}},
            {"$sort": {"num": -1}},
            {"$limit": 1}
        ]
        result = await db.purchases.aggregate(pipeline).to_list(1)
        next_num = result[0]["num"] + 1 if result else 1
        return {"code": f"AC{str(next_num).zfill(4)}/{year}"}

    # ── Get Single Purchase ──
    @router.get("/{purchase_id}")
    async def get_purchase(purchase_id: str, admin: dict = Depends(require_permission("purchases.edit"))):
        purchase = await db.purchases.find_one({"id": purchase_id}, {"_id": 0})
        if not purchase:
            raise HTTPException(status_code=404, detail="Purchase not found")
        return purchase

    # ── Update Purchase ──
    @router.put("/{purchase_id}")
    async def update_purchase(purchase_id: str, update_data: PurchaseUpdate, admin: dict = Depends(require_permission("purchases.edit"))):
        purchase = await db.purchases.find_one({"id": purchase_id})
        if not purchase:
            raise HTTPException(status_code=404, detail="Purchase not found")

        now = datetime.now(timezone.utc).isoformat()
        update_dict = {"updated_at": now, "updated_by": admin["name"]}
        old_paid = purchase.get("paid_amount", 0)
        old_total = purchase.get("total", 0)
        old_remaining = purchase.get("remaining", 0)

        if update_data.paid_amount is not None:
            new_paid = update_data.paid_amount
            new_remaining = max(0, old_total - new_paid)
            new_status = "paid" if new_remaining <= 0 else ("partial" if new_paid > 0 else "unpaid")
            update_dict.update({"paid_amount": new_paid, "remaining": new_remaining, "status": new_status})

            balance_diff = old_remaining - new_remaining
            await db.suppliers.update_one({"id": purchase["supplier_id"]}, {"$inc": {"balance": -balance_diff}})

            payment_diff = new_paid - old_paid
            if payment_diff > 0:
                await db.cash_boxes.update_one(
                    {"id": purchase.get("payment_method", "cash")},
                    {"$inc": {"balance": -payment_diff}, "$set": {"updated_at": now}}
                )
                await db.transactions.insert_one({
                    "id": str(uuid.uuid4()), "cash_box_id": purchase.get("payment_method", "cash"),
                    "type": "expense", "amount": payment_diff,
                    "description": f"دفعة إضافية للمشتريات - فاتورة {purchase.get('invoice_number', '')}",
                    "reference_type": "purchase", "reference_id": purchase_id,
                    "created_at": now, "created_by": admin["name"]
                })

        if update_data.notes is not None:
            update_dict["notes"] = update_data.notes

        await db.purchases.update_one({"id": purchase_id}, {"$set": update_dict})
        updated_purchase = await db.purchases.find_one({"id": purchase_id}, {"_id": 0})
        return {"message": "تم تحديث المشتريات بنجاح", "purchase": updated_purchase}

    # ── Delete Purchase ──
    @router.delete("/{purchase_id}")
    async def delete_purchase(purchase_id: str, admin: dict = Depends(require_permission("purchases.edit"))):
        purchase = await db.purchases.find_one({"id": purchase_id})
        if not purchase:
            raise HTTPException(status_code=404, detail="Purchase not found")

        now = datetime.now(timezone.utc).isoformat()
        for item in purchase.get("items", []):
            await db.products.update_one({"id": item["product_id"]}, {"$inc": {"quantity": -item["quantity"]}})

        await db.suppliers.update_one(
            {"id": purchase["supplier_id"]},
            {"$inc": {"total_purchases": -purchase.get("total", 0), "balance": -purchase.get("remaining", 0)}}
        )

        if purchase.get("paid_amount", 0) > 0:
            await db.cash_boxes.update_one(
                {"id": purchase.get("payment_method", "cash")},
                {"$inc": {"balance": purchase["paid_amount"]}, "$set": {"updated_at": now}}
            )
            await db.transactions.insert_one({
                "id": str(uuid.uuid4()), "cash_box_id": purchase.get("payment_method", "cash"),
                "type": "income", "amount": purchase["paid_amount"],
                "description": f"إلغاء مشتريات - فاتورة {purchase.get('invoice_number', '')}",
                "reference_type": "purchase_reversal", "reference_id": purchase_id,
                "created_at": now, "created_by": admin["name"]
            })

        await db.purchases.delete_one({"id": purchase_id})
        return {"message": "تم حذف المشتريات بنجاح", "deleted_id": purchase_id}

    return router
