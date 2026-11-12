"""COD settlement batches module (مصالحة الدفع عند الاستلام) — module pack M4.

The missing write side of COD reconciliation (p90 built the per-courier
view, p103 the statement paste-match): group a courier's delivered-but-unpaid
orders into a settlement batch, record the courier's actual payout, compute
the variance, move the money between boxes, and post a balanced journal
entry — all order flips to `paid` are tagged with the batch id.

Accounting (accounting_auto engine):
- expected = Σ(order total − shipping_fee) per batch
- receive: Dr target box / Cr 534 (ecom holding) — shortage Dr 618,
  excess Cr 765, so the entry is always balanced
- ecom courier holding box is decremented when it exists (p90 convention:
  its balance = what the courier owes us)
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from utils.ids import new_id

COD_ACCOUNTS = [
    ("534", "المتجر الإلكتروني", "asset"),
    ("618", "فروقات تسوية COD", "expense"),
    ("765", "إيرادات متنوعة", "revenue"),
]


class BatchCreate(BaseModel):
    courier: str = ""
    notes: str = ""


class ReceiveIn(BaseModel):
    received_amount: float = Field(ge=0, le=1e12)
    target_box: str = "cash"
    notes: str = ""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_cod_settlements_routes(db, get_current_user, get_tenant_admin, require_tenant):
    router = APIRouter(prefix="/cod-settlements", tags=["cod-settlements"])

    async def _ensure_accounts() -> dict:
        out = {}
        for code, name, atype in COD_ACCOUNTS:
            acc = await db.accounts.find_one({"code": code})
            if not acc:
                acc = {"id": new_id(), "code": code, "name": name, "name_ar": name,
                       "account_type": atype, "parent_id": None,
                       "description": "حساب مصالحة COD (نظام)", "balance": 0,
                       "is_active": True, "created_by": "system", "created_at": _now()}
                try:
                    await db.accounts.insert_one(acc)
                except Exception:
                    acc = await db.accounts.find_one({"code": code})
            out[code] = acc
        return out

    def _line(acc, debit=0.0, credit=0.0):
        return {"account_id": acc["id"], "account_code": acc["code"],
                "account_name": acc.get("name_ar") or acc.get("name"),
                "debit": round(float(debit), 2), "credit": round(float(credit), 2)}

    # ── Create batch from delivered+unpaid orders ──
    @router.post("", status_code=201)
    async def create_batch(body: BatchCreate, user: dict = Depends(get_tenant_admin)):
        courier = (body.courier or "").strip()
        q = {"status": "delivered", "payment_status": {"$ne": "paid"},
             "settlement_id": {"$exists": False}}
        if courier:
            q["courier"] = courier
        else:
            q["$or"] = [{"courier": None}, {"courier": ""}]
        orders = await db.ecom_orders.find(
            q, {"_id": 0, "id": 1, "order_code": 1, "total": 1, "shipping_fee": 1}).to_list(5000)
        if not orders:
            raise HTTPException(status_code=400, detail="لا توجد طلبات مسلَّمة غير محصَّلة لهذا الناقل")
        expected = round(sum(float(o.get("total") or 0) - float(o.get("shipping_fee") or 0)
                             for o in orders), 2)
        from services.code_generator import next_code
        doc = {
            "id": new_id(),
            "code": await next_code(db, "cod_settlements", "STL", 4, True),
            "courier": courier or "manual",
            "order_ids": [o["id"] for o in orders],
            "orders_count": len(orders),
            "expected_amount": expected,
            "received_amount": None,
            "variance": None,
            "status": "open",
            "notes": body.notes or "",
            "created_by": user.get("name", ""),
            "created_at": _now(), "updated_at": _now(), "settled_at": None,
        }
        # Lock the orders into the batch immediately (no double-batching race)
        await db.cod_settlements.insert_one(doc)
        await db.ecom_orders.update_many(
            {"id": {"$in": doc["order_ids"]}},
            {"$set": {"settlement_id": doc["id"], "updated_at": _now()}})
        doc.pop("_id", None)
        return doc

    # ── List ──
    @router.get("")
    async def list_batches(status: Optional[str] = None, user: dict = Depends(require_tenant)):
        q = {}
        if status and status != "all":
            q["status"] = status
        items = await db.cod_settlements.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)
        open_expected = round(sum(b["expected_amount"] for b in items if b["status"] == "open"), 2)
        return {"items": items, "open_expected": open_expected}

    # ── Detail with orders ──
    @router.get("/{batch_id}")
    async def get_batch(batch_id: str, user: dict = Depends(require_tenant)):
        b = await db.cod_settlements.find_one({"id": batch_id}, {"_id": 0})
        if not b:
            raise HTTPException(status_code=404, detail="الدفعة غير موجودة")
        orders = await db.ecom_orders.find(
            {"id": {"$in": b.get("order_ids", [])}},
            {"_id": 0, "id": 1, "order_code": 1, "customer_name": 1, "total": 1,
             "shipping_fee": 1, "tracking_number": 1, "payment_status": 1}).to_list(5000)
        return {"batch": b, "orders": orders}

    # ── Receive the courier payout (money move + journal + order flips) ──
    @router.post("/{batch_id}/receive")
    async def receive_batch(batch_id: str, body: ReceiveIn, user: dict = Depends(get_tenant_admin)):
        b = await db.cod_settlements.find_one({"id": batch_id})
        if not b:
            raise HTTPException(status_code=404, detail="الدفعة غير موجودة")
        if b.get("status") != "open":
            raise HTTPException(status_code=400, detail="الدفعة مسوّاة أو ملغاة مسبقاً")
        box = await db.cash_boxes.find_one({"id": body.target_box})
        if not box or box.get("type") == "ecom":
            raise HTTPException(status_code=400, detail="اختر صندوق تحصيل حقيقياً (غير صناديق الناقلين)")
        accs = await _ensure_accounts()
        from services.accounting_auto import BOX_ACCOUNT, ensure_accounts, _insert_entry
        await ensure_accounts(db)
        target_acc = await db.accounts.find_one({"code": BOX_ACCOUNT.get(body.target_box, "530")})
        expected = round(b["expected_amount"], 2)
        received = round(body.received_amount, 2)
        variance = round(received - expected, 2)
        now = _now()

        lines = [_line(target_acc, debit=received), _line(accs["534"], credit=expected)]
        if variance < 0:
            lines.append(_line(accs["618"], debit=-variance))
        elif variance > 0:
            lines.append(_line(accs["765"], credit=variance))
        await _insert_entry(
            db, reference=f"تسوية COD {b['code']} — {b['courier']}",
            reference_id=batch_id, source_tag="cod_settlement",
            description=f"تحصيل {received} من {b['courier']} (متوقع {expected}، فرق {variance})",
            lines=lines, date=now[:10])

        # Money: courier holding box down, target box up
        ecom_box_id = f"ecom_store_{b['courier']}" if b["courier"] != "manual" else "ecom_store"
        ecom_box = await db.cash_boxes.find_one({"id": ecom_box_id})
        if not ecom_box:
            ecom_box = await db.cash_boxes.find_one({"id": "ecom_store"})
        if ecom_box:
            await db.cash_boxes.update_one({"id": ecom_box["id"]},
                                           {"$inc": {"balance": -expected}, "$set": {"updated_at": now}})
        await db.cash_boxes.update_one({"id": body.target_box},
                                       {"$inc": {"balance": received}, "$set": {"updated_at": now}})
        # Orders flip to paid inside the batch
        await db.ecom_orders.update_many(
            {"id": {"$in": b.get("order_ids", [])}},
            {"$set": {"payment_status": "paid", "updated_at": now}})
        status = "settled" if abs(variance) < 0.01 else "settled_with_variance"
        await db.cod_settlements.update_one({"id": batch_id}, {"$set": {
            "status": status, "received_amount": received, "variance": variance,
            "target_box": body.target_box, "receive_notes": body.notes or "",
            "settled_at": now, "settled_by": user.get("name", ""), "updated_at": now,
        }})
        return {"id": batch_id, "status": status, "expected": expected,
                "received": received, "variance": variance}

    # ── Cancel an open batch (releases the orders) ──
    @router.post("/{batch_id}/cancel")
    async def cancel_batch(batch_id: str, user: dict = Depends(get_tenant_admin)):
        b = await db.cod_settlements.find_one({"id": batch_id})
        if not b:
            raise HTTPException(status_code=404, detail="الدفعة غير موجودة")
        if b.get("status") != "open":
            raise HTTPException(status_code=400, detail="لا يمكن إلغاء إلا دفعة مفتوحة")
        await db.ecom_orders.update_many(
            {"id": {"$in": b.get("order_ids", [])}},
            {"$unset": {"settlement_id": ""}, "$set": {"updated_at": _now()}})
        await db.cod_settlements.update_one({"id": batch_id},
                                            {"$set": {"status": "cancelled", "updated_at": _now()}})
        return {"id": batch_id, "status": "cancelled"}

    return router
