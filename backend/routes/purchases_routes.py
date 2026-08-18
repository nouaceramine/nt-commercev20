"""
Purchase Routes - Extracted from server.py
Full CRUD with supplier balance, cash box updates
"""
from fastapi import APIRouter, HTTPException, Depends
from services.balances import adjust_supplier_mirror
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
    async def _sync_item_extras(product, item: dict, ref: str, now: str, admin_name: str):
        # p168: sale price entered on the purchase → canonical retail_price + price_history;
        #        expiry date → auto-create a product lot (feeds expiry notifications).
        pid = product.get("id")
        rp = item.get("retail_price")
        if rp is not None and float(rp) > 0:
            old_rp = float(product.get("retail_price") or 0)
            new_rp = float(rp)
            if new_rp != old_rp:
                await db.products.update_one({"id": pid}, {"$set": {"retail_price": new_rp, "updated_at": now}})
                await db.price_history.insert_one({
                    "id": str(uuid.uuid4()),
                    "product_id": pid,
                    "product_name": product.get("name_ar") or product.get("name_en") or "",
                    "old_price": old_rp,
                    "new_price": new_rp,
                    "price_type": "retail_price",
                    "change_percent": round(((new_rp - old_rp) / old_rp) * 100, 2) if old_rp else 0.0,
                    "changed_by": admin_name,
                    "changed_by_name": admin_name,
                    "source": "purchase",
                    "reference": ref,
                    "created_at": now,
                })
        exp = (item.get("expiry_date") or "").strip()
        if exp:
            await db.product_lots.insert_one({
                "id": str(uuid.uuid4()),
                "product_id": pid,
                "lot_number": ref,
                "expiry_date": exp,
                "quantity": float(item.get("quantity", 0) or 0),
                "alert_days": int(item.get("alert_days") or 30),
                "created_at": now,
            })

    async def _apply_purchase_stock(items, sign: int, now: str, sync_prices: bool = True, ref: str = "", admin_name: str = ""):
        # sign=+1 confirm stock, sign=-1 reverse
        for item in items:
            pid = item.get("product_id")
            qty = item.get("quantity", 0)
            if not pid or not qty:
                continue
            product = await db.products.find_one({"id": pid})
            if not product:
                continue
            updates = {"$inc": {"quantity": sign * qty}}
            if sign > 0 and sync_prices:
                set_fields = {"purchase_price": float(item.get("unit_price", 0) or 0), "updated_at": now}
                sp = item.get("selling_price")
                if sp is not None and sp > 0:
                    set_fields["selling_price"] = float(sp)
                updates["$set"] = set_fields
            await db.products.update_one({"id": pid}, updates)
            if sign > 0:
                await _sync_item_extras(product, item, ref, now, admin_name)

    @router.post("", status_code=201)
    async def create_purchase(purchase: dict, admin: dict = Depends(require_permission("purchases.add"))):
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
            "payments": ([{"amount": p.paid_amount, "method": p.payment_method, "at": now}] if p.paid_amount > 0 else []),  # p67
            "status": status, "notes": p.notes or "",
            "created_at": now, "created_by": admin["name"]
        }
        # المخزن المستهدف (اختياري) — يُسجّل على الفاتورة، والمخزون العام يبقى كما هو
        wid = purchase.get("warehouse_id") or ""
        purchase_doc["warehouse_id"] = wid
        purchase_doc["warehouse_name"] = purchase.get("warehouse_name") or ""
        if wid:
            wh = await db.warehouses.find_one({"id": wid})
            if wh:
                purchase_doc["warehouse_name"] = wh.get("name", purchase_doc["warehouse_name"])
        confirm_stock = purchase.get("confirm_stock", True)
        purchase_doc["stock_status"] = "confirmed" if confirm_stock else "draft"
        await db.purchases.insert_one(purchase_doc)

        if not confirm_stock:
            purchase_doc.pop("_id", None)
            return purchase_doc

        for item in p.items:
            product = await db.products.find_one({"id": item.product_id})
            old_quantity = product.get("quantity", 0) if product else 0

            # ── Build product update: quantity + optionally prices ──
            product_updates: dict = {"$inc": {"quantity": item.quantity}}
            set_fields: dict = {}
            if product and item.product_id and (item.update_product_prices is None or item.update_product_prices):
                # Always sync purchase_price to the latest unit_price on purchase
                set_fields["purchase_price"] = float(item.unit_price)
                # Sync selling_price only when explicitly passed (frontend may compute markup)
                if item.selling_price is not None and item.selling_price > 0:
                    set_fields["selling_price"] = float(item.selling_price)
                set_fields["updated_at"] = now
            if set_fields:
                product_updates["$set"] = set_fields

            await db.products.update_one({"id": item.product_id}, product_updates)

            if product:
                await _sync_item_extras(product, item.model_dump(), invoice_number, now, admin.get("name", ""))

            if old_quantity == 0 and item.quantity > 0 and product:
                await db.notifications.insert_one({
                    "id": str(uuid.uuid4()), "type": "restock",
                    "message_en": f"Product '{product.get('name_en')}' is back in stock!",
                    "message_ar": f"المنتج '{product.get('name_ar')}' متوفر مرة أخرى!",
                    "product_id": item.product_id, "read": False, "created_at": now
                })

        await adjust_supplier_mirror(db, p.supplier_id,
            total_purchases=p.total, balance=remaining)

        # p62: "personal" (مالي الخاص) lives outside business cash boxes — no deduction
        if p.paid_amount > 0:  # p68: personal box tracks it too
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
    async def get_purchases(supplier_id: Optional[str] = None, admin: dict = Depends(require_permission("purchases.view"))):
        query = {"supplier_id": supplier_id} if supplier_id else {}
        return await db.purchases.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)

    # ── Paginated Purchases ──
    @router.get("/paginated")
    async def get_purchases_paginated(
        supplier_id: Optional[str] = None,
        start_date: Optional[str] = None, end_date: Optional[str] = None,
        page: int = 1, page_size: int = 20,
        admin: dict = Depends(require_permission("purchases.view"))
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

    # ── p150: OCR scan of a supplier invoice photo (Gemini vision) ──
    @router.post("/scan-invoice")
    async def scan_purchase_invoice(data: dict, user: dict = Depends(require_permission("purchases.add"))):
        """p150: صورة فاتورة شراء من كاميرا الهاتف → Gemini vision يستخرج مسودة + مطابقة تلقائية مع المنتجات والموردين"""
        import base64 as _b64
        import json as _j
        import re as _re2
        b64 = (data.get("image_base64") or "").strip()
        if not b64:
            raise HTTPException(status_code=400, detail="الصورة مطلوبة")
        if "," in b64[:40]:
            b64 = b64.split(",", 1)[1]
        try:
            img_bytes = _b64.b64decode(b64)
        except Exception:
            raise HTTPException(status_code=400, detail="صورة غير صالحة")
        if len(img_bytes) > 8 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="الصورة أكبر من 8MB")
        if len(img_bytes) < 2000:
            raise HTTPException(status_code=400, detail="الصورة صغيرة جداً أو فارغة")

        mime = "image/jpeg"
        if img_bytes[:4] == b"\x89PNG":
            mime = "image/png"
        elif img_bytes[:4] == b"RIFF" and img_bytes[8:12] == b"WEBP":
            mime = "image/webp"

        from services.ai_service import AIService
        import google.generativeai as genai
        if not AIService.is_configured():
            raise HTTPException(status_code=503, detail="ميزة المسح غير مفعّلة — مفتاح Gemini غير مهيأ")

        prompt = (
            'You are reading a supplier PURCHASE INVOICE photo (Arabic/French/English, printed or handwritten). '
            'Extract and reply with ONLY valid JSON (no markdown fences, no explanation) in exactly this shape: '
            '{"supplier_name": str, "invoice_number": str, "invoice_date": "YYYY-MM-DD or empty", '
            '"items": [{"name": str, "quantity": number, "unit_price": number}], "total": number}. '
            'List every purchased line with name, quantity and unit price (unit, not line total). '
            'Unreadable values become empty string or 0. Plain numbers only, no currency symbols.'
        )
        try:
            model = genai.GenerativeModel(AIService.MODEL)
            resp = await model.generate_content_async([prompt, {"mime_type": mime, "data": img_bytes}])
            text = (resp.text or "").strip()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"فشل تحليل الصورة: {str(e)[:120]}")

        m = _re2.search(r"\{.*\}", text, _re2.S)
        draft = None
        if m:
            try:
                draft = _j.loads(m.group(0))
            except Exception:
                draft = None
        if not isinstance(draft, dict):
            raise HTTPException(status_code=422, detail="لم يتمكن النظام من قراءة الفاتورة — جرّب صورة أوضح بإضاءة أفضل")

        items_out = []
        for it in (draft.get("items") or [])[:60]:
            name = str(it.get("name") or "").strip()[:120]
            try:
                qty = float(it.get("quantity") or 0) or 1
            except Exception:
                qty = 1
            try:
                price = float(it.get("unit_price") or 0)
            except Exception:
                price = 0
            match = None
            if name:
                rx = {"$regex": f"^{_re2.escape(name)}$", "$options": "i"}
                match = await db.products.find_one(
                    {"$or": [{"name_ar": rx}, {"name_en": rx}, {"barcode": name}]},
                    {"_id": 0, "id": 1, "name_ar": 1, "name_en": 1, "purchase_price": 1, "retail_price": 1})
                if not match and len(name) >= 6:
                    rx2 = {"$regex": _re2.escape(name[:25]), "$options": "i"}
                    match = await db.products.find_one(
                        {"$or": [{"name_ar": rx2}, {"name_en": rx2}]},
                        {"_id": 0, "id": 1, "name_ar": 1, "name_en": 1, "purchase_price": 1, "retail_price": 1})
            items_out.append({
                "raw_name": name, "quantity": qty, "unit_price": price,
                "product_id": match.get("id") if match else None,
                "product_name": (match.get("name_ar") or match.get("name_en")) if match else None,
            })

        supplier_id = None
        supplier_name_found = None
        sname = str(draft.get("supplier_name") or "").strip()[:120]
        if sname:
            rxs = {"$regex": _re2.escape(sname[:25]), "$options": "i"}
            sup = await db.suppliers.find_one({"name": rxs}, {"_id": 0, "id": 1, "name": 1})
            if sup:
                supplier_id, supplier_name_found = sup["id"], sup.get("name")

        return {
            "success": True,
            "draft": {
                "supplier_name": sname,
                "invoice_number": str(draft.get("invoice_number") or "")[:60],
                "invoice_date": str(draft.get("invoice_date") or "")[:20],
                "total": float(draft.get("total") or 0),
                "items": items_out,
            },
            "matched_supplier_id": supplier_id,
            "matched_supplier_name": supplier_name_found,
        }

    @router.get("/generate-code")
    async def generate_purchase_code(user: dict = Depends(require_tenant)):
        from datetime import datetime as dt
        year = str(dt.now().year)[2:]
        pipeline = [
            {"$match": {"code": {"$regex": f"^AC\\d+/{year}$"}}},
            {"$project": {"num": {"$toInt": {"$substrCP": ["$code", 2, {"$subtract": [{"$strLenCP": "$code"}, 5]}]}}}},
            {"$sort": {"num": -1}},
            {"$limit": 1}
        ]
        result = await db.purchases.aggregate(pipeline).to_list(1)
        next_num = result[0]["num"] + 1 if result else 1
        return {"code": f"AC{str(next_num).zfill(4)}/{year}"}

    # ── Get Single Purchase ──
    @router.post("/{purchase_id}/confirm-stock")
    async def confirm_purchase_stock(purchase_id: str, admin: dict = Depends(require_permission("purchases.edit"))):
        purchase_doc = await db.purchases.find_one({"id": purchase_id})
        if not purchase_doc:
            raise HTTPException(status_code=404, detail="Purchase not found")
        if purchase_doc.get("stock_status") == "confirmed":
            return {"message": "المخزون مؤكد مسبقاً", "stock_status": "confirmed"}
        now = datetime.now(timezone.utc).isoformat()
        await _apply_purchase_stock(purchase_doc.get("items", []), +1, now, ref=purchase_doc.get("invoice_number", ""), admin_name=admin.get("name", ""))
        await db.purchases.update_one({"id": purchase_id}, {"$set": {"stock_status": "confirmed", "updated_at": now}})
        return {"message": "تم تأكيد المخزون", "stock_status": "confirmed"}

    @router.post("/{purchase_id}/reopen")
    async def reopen_purchase(purchase_id: str, admin: dict = Depends(require_permission("purchases.edit"))):
        purchase_doc = await db.purchases.find_one({"id": purchase_id})
        if not purchase_doc:
            raise HTTPException(status_code=404, detail="Purchase not found")
        if purchase_doc.get("stock_status") != "confirmed":
            return {"message": "الفاتورة غير مؤكدة", "stock_status": purchase_doc.get("stock_status", "draft")}
        now = datetime.now(timezone.utc).isoformat()
        await _apply_purchase_stock(purchase_doc.get("items", []), -1, now, sync_prices=False)
        await db.purchases.update_one({"id": purchase_id}, {"$set": {"stock_status": "draft", "updated_at": now}})
        return {"message": "تمت إعادة فتح الفاتورة", "stock_status": "draft"}

    @router.get("/{purchase_id}")
    async def get_purchase(purchase_id: str, admin: dict = Depends(require_permission("purchases.view"))):
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
            if purchase.get("stock_status", "confirmed") == "confirmed":
                await adjust_supplier_mirror(db, purchase["supplier_id"], balance=-balance_diff)

            payment_diff = new_paid - old_paid
            # p62: personal money never touches cash boxes
            if payment_diff > 0:  # p68
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
    async def delete_purchase(purchase_id: str, admin: dict = Depends(require_permission("purchases.delete"))):
        purchase = await db.purchases.find_one({"id": purchase_id})
        if not purchase:
            raise HTTPException(status_code=404, detail="Purchase not found")

        now = datetime.now(timezone.utc).isoformat()
        # Reverse stock only if it was actually confirmed (avoid double reversal for drafts)
        if purchase.get("stock_status", "confirmed") == "confirmed":
            for item in purchase.get("items", []):
                await db.products.update_one({"id": item["product_id"]}, {"$inc": {"quantity": -item["quantity"]}})

        if purchase.get("stock_status", "confirmed") == "confirmed":
            await adjust_supplier_mirror(db, purchase["supplier_id"],
                total_purchases=-purchase.get("total", 0), balance=-purchase.get("remaining", 0))

        # p67: refund each payment to the box it actually came from (debt payments may use other boxes)
        payments_log = purchase.get("payments") or []
        if payments_log:
            for pay in payments_log:
                m = pay.get("method", "cash")
                if pay.get("amount", 0) > 0 and m:  # p68: refund personal box too
                    await db.cash_boxes.update_one({"id": m}, {"$inc": {"balance": pay["amount"]}, "$set": {"updated_at": now}})
                    await db.transactions.insert_one({
                        "id": str(uuid.uuid4()), "cash_box_id": m,
                        "type": "income", "amount": pay["amount"],
                        "description": f"إلغاء مشتريات - فاتورة {purchase.get('invoice_number', '')}",
                        "reference_type": "purchase_reversal", "reference_id": purchase_id,
                        "created_at": now, "created_by": admin["name"]
                    })
        # p62: refund only if the payment actually came from a business box (legacy docs without payments log)
        elif purchase.get("paid_amount", 0) > 0 and purchase.get("payment_method", "cash") != "personal":
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
