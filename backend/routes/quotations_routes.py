"""Quotations module (عروض الأسعار) — module pack M1.

A full quote lifecycle before the sale: draft -> sent -> accepted/rejected,
auto-expiry past `valid_until`, and one-click conversion into a real sale
invoice through the same ACID sale engine (create_sale_op) the POS uses —
stock claims, cash box, customer mirror, and the outbox event stay atomic.

Design decisions (documented):
- A quotation does NOT reserve stock; availability is enforced at conversion.
- Totals are server-computed from item lines (never trusted from the client).
- Numbering: QUO-YYYY-NNNNNN via utils.ids.next_document_number (atomic).
- Events: quotation.created / .status_changed / .converted via outbox.
- Tenant scope: the standard per-request tenant DB proxy (`db`); every
  handler sits behind require_tenant / sales permissions.
"""
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from utils.ids import new_id, next_document_number

STATUSES = ("draft", "sent", "accepted", "rejected", "expired", "converted")
ALLOWED_TRANSITIONS = {
    "draft": {"sent", "accepted", "rejected"},
    "sent": {"accepted", "rejected"},
    "accepted": set(),       # accepted -> converted happens only via /convert
    "rejected": {"draft"},   # reopen a rejected quote as a new draft revision
    "expired": {"draft"},    # reopen an expired quote (new validity window)
    "converted": set(),
}


class QuoteItem(BaseModel):
    product_id: str
    quantity: float = Field(gt=0, le=1_000_000)
    price: float = Field(ge=0, le=1_000_000_000)
    discount: float = Field(default=0, ge=0)


class QuoteCreate(BaseModel):
    customer_id: Optional[str] = None
    customer_name: str = ""
    items: List[QuoteItem]
    discount: float = Field(default=0, ge=0)
    validity_days: int = Field(default=15, ge=1, le=365)
    notes: str = ""


class QuoteStatusIn(BaseModel):
    status: str


class QuoteConvertIn(BaseModel):
    payment_type: str = "cash"          # cash | credit | partial | installment
    payment_method: str = "cash"
    paid_amount: Optional[float] = None  # None => full total
    warehouse_id: Optional[str] = None
    notes: str = ""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _totals(items: List[QuoteItem], discount: float):
    lines = []
    subtotal = 0.0
    for it in items:
        line_total = round(it.quantity * it.price - min(it.discount, it.quantity * it.price), 2)
        subtotal = round(subtotal + line_total, 2)
        lines.append({
            "product_id": it.product_id,
            "quantity": it.quantity,
            "price": it.price,
            "discount": round(min(it.discount, it.quantity * it.price), 2),
            "total": line_total,
        })
    discount = round(min(discount, subtotal), 2)
    return lines, subtotal, discount, round(subtotal - discount, 2)


def create_quotations_routes(db, get_current_user, get_tenant_admin, require_tenant):
    from utils.permissions import create_permission_checker
    _perm = create_permission_checker(db, get_current_user)
    router = APIRouter(prefix="/quotations", tags=["quotations"])

    async def _sweep_expired():
        now_s = _now().isoformat()
        await db.quotations.update_many(
            {"status": {"$in": ["draft", "sent"]}, "valid_until": {"$lt": now_s}},
            {"$set": {"status": "expired", "updated_at": now_s}},
        )

    async def _event(event_type: str, payload: dict, user: dict, session=None):
        try:
            from config.database import main_db
            from services.outbox import outbox_write
            await outbox_write(main_db, event_type, payload,
                               tenant_id=user.get("tenant_id", ""),
                               source="quotations", session=session)
        except Exception:  # events must never break the business flow
            pass

    # ── Create ──
    @router.post("", status_code=201)
    async def create_quotation(q: QuoteCreate, user: dict = Depends(_perm("sales.add"))):
        if not q.items:
            raise HTTPException(status_code=400, detail="أضف صنفاً واحداً على الأقل")
        if q.customer_id:
            cust = await db.customers.find_one({"id": q.customer_id}, {"_id": 0, "id": 1, "name": 1})
            if not cust:
                raise HTTPException(status_code=404, detail="الزبون غير موجود")
            q.customer_name = cust.get("name") or q.customer_name
        # Snapshot product names; every line must reference a real product.
        names = {}
        for it in q.items:
            p = await db.products.find_one({"id": it.product_id}, {"_id": 0, "name": 1, "name_ar": 1})
            if not p:
                raise HTTPException(status_code=404, detail=f"منتج غير موجود: {it.product_id}")
            names[it.product_id] = p.get("name_ar") or p.get("name") or ""
        lines, subtotal, discount, total = _totals(q.items, q.discount)
        for ln in lines:
            ln["name"] = names.get(ln["product_id"], "")
        now = _now()
        doc = {
            "id": new_id(),
            "number": await next_document_number(db, "quote"),
            "customer_id": q.customer_id,
            "customer_name": q.customer_name or "زبون عابر",
            "items": lines,
            "subtotal": subtotal,
            "discount": discount,
            "total": total,
            "status": "draft",
            "validity_days": q.validity_days,
            "valid_until": (now + timedelta(days=q.validity_days)).isoformat(),
            "notes": q.notes or "",
            "converted_sale_id": None,
            "created_by": user.get("name", ""),
            "created_by_id": user.get("id", ""),
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        await db.quotations.insert_one(doc)
        doc.pop("_id", None)
        await _event("quotation.created", {"quotation_id": doc["id"], "number": doc["number"],
                                           "total": total, "customer_name": doc["customer_name"]}, user)
        return doc

    # ── List (with auto-expiry sweep) ──
    @router.get("")
    async def list_quotations(status: Optional[str] = None, search: str = "",
                              page: int = 1, page_size: int = 50,
                              user: dict = Depends(require_tenant)):
        await _sweep_expired()
        query = {}
        if status and status != "all":
            if status not in STATUSES:
                raise HTTPException(status_code=400, detail="حالة غير معروفة")
            query["status"] = status
        if search:
            query["$or"] = [{"number": {"$regex": search, "$options": "i"}},
                            {"customer_name": {"$regex": search, "$options": "i"}}]
        page = max(1, page)
        page_size = max(1, min(page_size, 200))
        total_docs = await db.quotations.count_documents(query)
        items = await db.quotations.find(query, {"_id": 0}) \
            .sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
        return {"items": items, "total": total_docs, "page": page, "page_size": page_size}

    # ── Stats ──
    @router.get("/stats")
    async def quotation_stats(user: dict = Depends(require_tenant)):
        await _sweep_expired()
        rows = await db.quotations.aggregate([
            {"$group": {"_id": "$status", "n": {"$sum": 1}, "amount": {"$sum": "$total"}}},
        ]).to_list(None)
        by_status = {r["_id"]: {"count": r["n"], "amount": round(r["amount"], 2)} for r in rows}
        return {"by_status": by_status, "total": sum(v["count"] for v in by_status.values())}

    # ── Detail ──
    @router.get("/{quotation_id}")
    async def get_quotation(quotation_id: str, user: dict = Depends(require_tenant)):
        doc = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="عرض السعر غير موجود")
        return doc

    # ── Edit (draft only) ──
    @router.put("/{quotation_id}")
    async def update_quotation(quotation_id: str, q: QuoteCreate,
                               user: dict = Depends(_perm("sales.add"))):
        doc = await db.quotations.find_one({"id": quotation_id})
        if not doc:
            raise HTTPException(status_code=404, detail="عرض السعر غير موجود")
        if doc.get("status") != "draft":
            raise HTTPException(status_code=400, detail="لا يمكن تعديل إلا المسودات")
        if not q.items:
            raise HTTPException(status_code=400, detail="أضف صنفاً واحداً على الأقل")
        lines, subtotal, discount, total = _totals(q.items, q.discount)
        for ln in lines:
            p = await db.products.find_one({"id": ln["product_id"]}, {"_id": 0, "name": 1, "name_ar": 1})
            if not p:
                raise HTTPException(status_code=404, detail=f"منتج غير موجود: {ln['product_id']}")
            ln["name"] = p.get("name_ar") or p.get("name") or ""
        now = _now()
        await db.quotations.update_one({"id": quotation_id}, {"$set": {
            "customer_id": q.customer_id, "customer_name": q.customer_name or doc.get("customer_name"),
            "items": lines, "subtotal": subtotal, "discount": discount, "total": total,
            "validity_days": q.validity_days,
            "valid_until": (now + timedelta(days=q.validity_days)).isoformat(),
            "notes": q.notes or "", "updated_at": now.isoformat(),
        }})
        return await db.quotations.find_one({"id": quotation_id}, {"_id": 0})

    # ── Status transitions ──
    @router.post("/{quotation_id}/status")
    async def set_status(quotation_id: str, body: QuoteStatusIn,
                         user: dict = Depends(_perm("sales.add"))):
        if body.status not in STATUSES:
            raise HTTPException(status_code=400, detail="حالة غير معروفة")
        doc = await db.quotations.find_one({"id": quotation_id})
        if not doc:
            raise HTTPException(status_code=404, detail="عرض السعر غير موجود")
        cur = doc.get("status", "draft")
        if body.status not in ALLOWED_TRANSITIONS.get(cur, set()):
            raise HTTPException(status_code=400, detail=f"لا يمكن الانتقال من {cur} إلى {body.status}")
        upd = {"status": body.status, "updated_at": _now().isoformat()}
        if body.status == "draft":  # reopen: fresh validity window
            upd["valid_until"] = (_now() + timedelta(days=doc.get("validity_days", 15))).isoformat()
        await db.quotations.update_one({"id": quotation_id}, {"$set": upd})
        await _event("quotation.status_changed", {"quotation_id": quotation_id,
                                                  "number": doc.get("number"),
                                                  "from": cur, "to": body.status}, user)
        return {"id": quotation_id, "status": body.status}

    # ── Convert to a real sale (ACID via the shared sale engine) ──
    @router.post("/{quotation_id}/convert", status_code=201)
    async def convert_quotation(quotation_id: str, body: QuoteConvertIn,
                                user: dict = Depends(_perm("sales.add"))):
        doc = await db.quotations.find_one({"id": quotation_id})
        if not doc:
            raise HTTPException(status_code=404, detail="عرض السعر غير موجود")
        if doc.get("status") == "converted":
            raise HTTPException(status_code=400, detail="عرض السعر محوَّل مسبقاً")
        if doc.get("status") not in ("draft", "sent", "accepted"):
            raise HTTPException(status_code=400, detail="لا يمكن تحويل عرض مرفوض أو منتهي")
        from models.schemas.trading import SaleCreate
        from services.application.sales_service import create_sale_op
        paid = body.paid_amount if body.paid_amount is not None else (
            doc["total"] if body.payment_type == "cash" else 0)
        sale_payload = SaleCreate(
            customer_id=doc.get("customer_id"),
            warehouse_id=body.warehouse_id,
            items=[{"product_id": ln["product_id"], "product_name": ln.get("name", ""),
                    "quantity": ln["quantity"], "unit_price": ln["price"],
                    "discount": ln.get("discount", 0),
                    "total": ln["total"]} for ln in doc["items"]],
            subtotal=doc["subtotal"], discount=doc["discount"], total=doc["total"],
            paid_amount=paid, payment_method=body.payment_method,
            payment_type=body.payment_type,
            notes=(body.notes or f"تحويل عرض السعر {doc.get('number', '')}"),
        )
        sale = await create_sale_op(db, sale_payload, user)
        now_s = _now().isoformat()
        await db.quotations.update_one({"id": quotation_id}, {"$set": {
            "status": "converted", "converted_sale_id": sale.get("id"), "updated_at": now_s,
        }})
        await _event("quotation.converted", {"quotation_id": quotation_id,
                                             "number": doc.get("number"),
                                             "sale_id": sale.get("id")}, user)
        return {"quotation_id": quotation_id, "sale": sale}

    # ── Delete (draft/rejected only) ──
    @router.delete("/{quotation_id}")
    async def delete_quotation(quotation_id: str, user: dict = Depends(get_tenant_admin)):
        doc = await db.quotations.find_one({"id": quotation_id})
        if not doc:
            raise HTTPException(status_code=404, detail="عرض السعر غير موجود")
        if doc.get("status") not in ("draft", "rejected", "expired"):
            raise HTTPException(status_code=400, detail="لا يمكن حذف عرض مرسل أو مقبول أو محوَّل")
        await db.quotations.delete_one({"id": quotation_id})
        return {"deleted": True, "id": quotation_id}

    return router
