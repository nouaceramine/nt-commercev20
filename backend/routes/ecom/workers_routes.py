"""
p293 — E-Commerce Workers (فريق تأكيد الطلبات)

عمال المتجر الإلكتروني: يدخل العامل بهاتفه ورمز PIN، يرى صندوق طلبات ecom فقط
(قائمة بيضاء في الخادم — رمز العامل لا يمرّ في أي مسار آخر)، يتصل بالزبائن
ويؤكد الطلبات. أول مؤكِّد للطلب يُسجَّل «منفّذاً» (executor) عبر خدمة تغيير
الحالة المركزية، وتُحسب عمولته على الطلبات المُسلَّمة: مبلغ ثابت + نسبة.

Collections (tenant db): ecom_workers, ecom_worker_settlements
Index (main_db):         ecom_worker_index  {phone → tenant_id, worker_id}
"""
from datetime import datetime, timezone, timedelta
from typing import Optional
import logging
import re
import uuid

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from config.database import db, main_db, get_tenant_db, set_tenant_context
from utils.auth import require_tenant
from utils.jwt_config import SECRET_KEY, ALGORITHM
from .constants import ORDER_STATUS_KEYS, require_ecom_feature

logger = logging.getLogger(__name__)

router = APIRouter(tags=["E-Commerce Workers"])
_security = HTTPBearer(auto_error=False)

WORKER_TOKEN_HOURS = 12
CALL_RESULTS = {
    "no_answer": "لم يردّ",
    "confirmed": "أكّد الطلب",
    "postponed": "أجّل التأكيد",
    "wrong_number": "رقم خاطئ",
    "cancelled_by_phone": "ألغى هاتفياً",
}
QUEUE_STATUSES = ("new", "awaiting_confirmation", "needs_review")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _norm_phone(p: str) -> str:
    """تطبيع جزائري: أرقام فقط، بلا رمز الدولة وبلا الصفر البادئ — 0550… ≡ +213550…"""
    d = re.sub(r"\D", "", p or "")
    if d.startswith("00"):
        d = d[2:]
    if d.startswith("213") and len(d) > 9:
        d = d[3:]
    return d.lstrip("0")


def _hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_pin(pin: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pin.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _worker_token(worker: dict, tenant_id: str) -> str:
    payload = {
        "sub": worker["id"], "type": "ecom_worker", "role": "ecom_worker",
        "tenant_id": tenant_id, "name": worker.get("name", ""),
        "exp": datetime.now(timezone.utc) + timedelta(hours=WORKER_TOKEN_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


async def get_ecom_worker(credentials: HTTPAuthorizationCredentials = Depends(_security)) -> dict:
    """Whitelist guard: only worker tokens, only active workers, tenant-scoped."""
    if not credentials:
        raise HTTPException(status_code=401, detail="مطلوب تسجيل الدخول")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="انتهت الجلسة — سجّل الدخول مجدداً")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="رمز غير صالح")
    if payload.get("type") != "ecom_worker" or not payload.get("tenant_id"):
        raise HTTPException(status_code=403, detail="هذا المسار لعمال المتجر فقط")
    set_tenant_context(get_tenant_db(payload["tenant_id"]))
    worker = await db.ecom_workers.find_one({"id": payload.get("sub")}, {"_id": 0, "pin_hash": 0})
    if not worker:
        raise HTTPException(status_code=401, detail="العامل غير موجود")
    if not worker.get("active", True):
        raise HTTPException(status_code=403, detail="حساب العامل موقوف")
    worker["user_type"] = "ecom_worker"
    worker["role"] = "ecom_worker"
    worker["tenant_id"] = payload["tenant_id"]
    return worker


def _worker_public(w: dict) -> dict:
    return {k: v for k, v in w.items() if k not in ("_id", "pin_hash")}


async def _worker_stats(worker: dict) -> dict:
    """إحصاءات عامل واحد: مؤكَّدة/مشحونة/مُسلَّمة + العمولة المستحقة غير المصفّاة."""
    wid = worker["id"]
    base = {"executor.id": wid, "executor.type": "worker"}
    confirmed = await db.ecom_orders.count_documents({**base, "status": {"$nin": ["new", "awaiting_confirmation", "needs_review", "cancelled"]}})
    shipped = await db.ecom_orders.count_documents({**base, "status": {"$in": ["shipped", "delivered"]}})
    delivered_q = {**base, "status": "delivered"}
    delivered = await db.ecom_orders.count_documents(delivered_q)
    unsettled_q = {**delivered_q, "commission_settled": {"$exists": False}}
    unsettled = await db.ecom_orders.find(unsettled_q, {"_id": 0, "id": 1, "total": 1}).to_list(length=10000)
    fixed = float(worker.get("commission_fixed") or 0)
    pct = float(worker.get("commission_percent") or 0)
    due = round(len(unsettled) * fixed + sum(float(o.get("total") or 0) for o in unsettled) * pct / 100.0, 2)
    return {
        "confirmed": confirmed, "shipped": shipped, "delivered": delivered,
        "unsettled_delivered": len(unsettled), "commission_due": due,
    }


# ═══════════════ واجهة العامل (PIN) ═══════════════

class WorkerLogin(BaseModel):
    phone: str
    pin: str


@router.post("/ecom-workers/login")
async def worker_login(body: WorkerLogin):
    """دخول العامل: هاتف + PIN → رمز محدود (ecom فقط) لمدة 12 ساعة."""
    phone = _norm_phone(body.phone)
    pin = (body.pin or "").strip()
    if not phone or not pin:
        raise HTTPException(status_code=400, detail="أدخل الهاتف ورمز الدخول")
    idx = await main_db.ecom_worker_index.find_one({"phone": phone}, {"_id": 0})
    if not idx:
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")
    set_tenant_context(get_tenant_db(idx["tenant_id"]))
    worker = await db.ecom_workers.find_one({"id": idx["worker_id"]})
    if not worker or not _verify_pin(pin, worker.get("pin_hash", "")):
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")
    if not worker.get("active", True):
        raise HTTPException(status_code=403, detail="حسابك موقوف — راجع صاحب المتجر")
    return {
        "token": _worker_token(worker, idx["tenant_id"]),
        "worker": _worker_public(worker),
        "user_type": "ecom_worker",
    }


@router.get("/ecom-workers/me")
async def worker_me(worker: dict = Depends(get_ecom_worker)):
    return {"worker": _worker_public(worker), "stats": await _worker_stats(worker)}


@router.get("/ecom-workers/me/orders")
async def worker_orders(
    view: str = Query("queue", pattern="^(queue|mine)$"),
    search: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    worker: dict = Depends(get_ecom_worker),
):
    """queue = طابور التأكيد (جديد/بانتظار التأكيد/يحتاج مراجعة)؛ mine = ما نفّذه العامل."""
    if view == "queue":
        query = {"status": {"$in": list(QUEUE_STATUSES)}}
    else:
        query = {"executor.id": worker["id"], "executor.type": "worker"}
    if search:
        safe = re.escape(search.strip())
        query["$or"] = [
            {"order_code": {"$regex": safe, "$options": "i"}},
            {"customer.name": {"$regex": safe, "$options": "i"}},
            {"customer.phone": {"$regex": safe, "$options": "i"}},
        ]
    total = await db.ecom_orders.count_documents(query)
    items = await (db.ecom_orders.find(query, {"_id": 0})
                   .sort("created_at", -1).skip(skip).limit(limit).to_list(length=limit))
    return {"orders": items, "total": total}


@router.get("/ecom-workers/me/orders/{order_id}")
async def worker_order_detail(order_id: str, worker: dict = Depends(get_ecom_worker)):
    order = await db.ecom_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    return order


@router.post("/ecom-workers/me/orders/{order_id}/call-attempt")
async def worker_call_attempt(order_id: str, body: dict, worker: dict = Depends(get_ecom_worker)):
    """تسجيل محاولة اتصال — confirmed يؤكد الطلب ويسجّل العامل منفّذاً."""
    order = await db.ecom_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    result = (body.get("result") or "").strip()
    if result not in CALL_RESULTS:
        raise HTTPException(status_code=400, detail="نتيجة المحاولة غير صالحة")
    now = _now()
    attempt = {"at": now, "result": result, "result_ar": CALL_RESULTS[result],
               "note": (body.get("note") or "").strip()[:300],
               "by": worker["id"], "by_name": worker.get("name", ""), "by_type": "worker"}
    await db.ecom_orders.update_one({"id": order_id},
        {"$push": {"confirmation_attempts": attempt}, "$set": {"updated_at": now}})
    new_status = None
    try:
        from services.application.ecom_order_service import change_order_status
        cur = order.get("status")
        if result == "confirmed" and cur in QUEUE_STATUSES:
            await change_order_status(db, order_id, "confirmed", note="تأكيد هاتفي (عامل)", user=worker)
            new_status = "confirmed"
        elif result == "cancelled_by_phone" and cur in (*QUEUE_STATUSES, "confirmed"):
            await change_order_status(db, order_id, "cancelled", note="إلغاء هاتفي (عامل)", user=worker)
            new_status = "cancelled"
    except Exception as exc:  # noqa: BLE001
        logger.warning("worker call-attempt transition failed for %s: %s", order_id, exc)
    return {"ok": True, "attempt": attempt,
            "attempts_count": len(order.get("confirmation_attempts") or []) + 1,
            "new_status": new_status}


@router.post("/ecom-workers/me/orders/{order_id}/confirm")
async def worker_confirm_order(order_id: str, worker: dict = Depends(get_ecom_worker)):
    """تأكيد مباشر دون تسجيل اتصال."""
    from services.application.ecom_order_service import change_order_status
    res = await change_order_status(db, order_id, "confirmed", note="تأكيد (عامل)", user=worker)
    return res


# ═══════════════ إدارة العمال (صاحب المتجر) ═══════════════

class WorkerCreate(BaseModel):
    name: str
    phone: str
    pin: str
    commission_fixed: float = 0      # دج لكل طلب مُسلَّم
    commission_percent: float = 0    # % من قيمة الطلب المُسلَّم


class WorkerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    pin: Optional[str] = None
    active: Optional[bool] = None
    commission_fixed: Optional[float] = None
    commission_percent: Optional[float] = None


def _valid_pin(pin: str) -> bool:
    return bool(re.fullmatch(r"\d{4,8}", (pin or "").strip()))


@router.get("/ecom-workers")
async def list_workers(user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    workers = await db.ecom_workers.find({}, {"_id": 0, "pin_hash": 0}).sort("created_at", -1).to_list(length=500)
    out = []
    for w in workers:
        out.append({**w, "stats": await _worker_stats(w)})
    return {"workers": out}


@router.post("/ecom-workers")
async def create_worker(body: WorkerCreate, user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    name = (body.name or "").strip()
    phone = _norm_phone(body.phone)
    pin = (body.pin or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="اسم العامل مطلوب")
    if not phone:
        raise HTTPException(status_code=400, detail="هاتف العامل مطلوب")
    if not _valid_pin(pin):
        raise HTTPException(status_code=400, detail="رمز الدخول: 4 إلى 8 أرقام")
    if await main_db.ecom_worker_index.find_one({"phone": phone}):
        raise HTTPException(status_code=400, detail="هذا الهاتف مسجّل لعامل آخر")
    tenant_id = user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="العمال متاحون لحسابات المستأجرين فقط")
    now = _now()
    worker = {
        "id": str(uuid.uuid4()), "name": name, "phone": phone,
        "pin_hash": _hash_pin(pin), "active": True,
        "commission_fixed": round(float(body.commission_fixed or 0), 2),
        "commission_percent": round(float(body.commission_percent or 0), 2),
        "created_at": now, "created_by": user.get("id"),
    }
    await db.ecom_workers.insert_one(worker)
    await main_db.ecom_worker_index.update_one({"phone": phone},
        {"$set": {"phone": phone, "tenant_id": tenant_id, "worker_id": worker["id"]}}, upsert=True)
    return {"ok": True, "worker": _worker_public(worker)}


@router.put("/ecom-workers/{worker_id}")
async def update_worker(worker_id: str, body: WorkerUpdate, user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    worker = await db.ecom_workers.find_one({"id": worker_id})
    if not worker:
        raise HTTPException(status_code=404, detail="العامل غير موجود")
    upd = {"updated_at": _now()}
    if body.name is not None and body.name.strip():
        upd["name"] = body.name.strip()
    if body.active is not None:
        upd["active"] = bool(body.active)
    if body.commission_fixed is not None:
        upd["commission_fixed"] = round(float(body.commission_fixed), 2)
    if body.commission_percent is not None:
        upd["commission_percent"] = round(float(body.commission_percent), 2)
    if body.pin:
        if not _valid_pin(body.pin):
            raise HTTPException(status_code=400, detail="رمز الدخول: 4 إلى 8 أرقام")
        upd["pin_hash"] = _hash_pin(body.pin.strip())
    if body.phone:
        phone = _norm_phone(body.phone)
        clash = await main_db.ecom_worker_index.find_one({"phone": phone})
        if clash and clash.get("worker_id") != worker_id:
            raise HTTPException(status_code=400, detail="هذا الهاتف مسجّل لعامل آخر")
        await main_db.ecom_worker_index.delete_one({"worker_id": worker_id})
        await main_db.ecom_worker_index.update_one({"phone": phone},
            {"$set": {"phone": phone, "tenant_id": user.get("tenant_id"), "worker_id": worker_id}}, upsert=True)
        upd["phone"] = phone
    await db.ecom_workers.update_one({"id": worker_id}, {"$set": upd})
    doc = await db.ecom_workers.find_one({"id": worker_id}, {"_id": 0, "pin_hash": 0})
    return {"ok": True, "worker": doc}


@router.delete("/ecom-workers/{worker_id}")
async def delete_worker(worker_id: str, user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    res = await db.ecom_workers.delete_one({"id": worker_id})
    await main_db.ecom_worker_index.delete_many({"worker_id": worker_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="العامل غير موجود")
    return {"ok": True, "message": "حُذف العامل — الطلبات المنفّذة تحتفظ باسمه"}


# ═══════════════ العمولات ═══════════════

@router.get("/ecom-workers/{worker_id}/commissions")
async def worker_commissions(worker_id: str, user: dict = Depends(require_tenant)):
    """تقرير عمولة عامل: الطلبات المُسلَّمة غير المصفّاة + الإجماليات + سجل التصفيات."""
    await require_ecom_feature(user)
    worker = await db.ecom_workers.find_one({"id": worker_id}, {"_id": 0, "pin_hash": 0})
    if not worker:
        raise HTTPException(status_code=404, detail="العامل غير موجود")
    base = {"executor.id": worker_id, "executor.type": "worker", "status": "delivered"}
    unsettled = await db.ecom_orders.find(
        {**base, "commission_settled": {"$exists": False}},
        {"_id": 0, "id": 1, "order_code": 1, "total": 1, "customer.name": 1,
         "delivered_at": 1, "updated_at": 1, "created_at": 1},
    ).sort("updated_at", -1).to_list(length=10000)
    fixed = float(worker.get("commission_fixed") or 0)
    pct = float(worker.get("commission_percent") or 0)
    rows = []
    fixed_total = 0.0
    percent_total = 0.0
    for o in unsettled:
        ot = float(o.get("total") or 0)
        row_fixed = round(fixed, 2)
        row_pct = round(ot * pct / 100.0, 2)
        fixed_total += row_fixed
        percent_total += row_pct
        rows.append({"order_id": o["id"], "order_code": o.get("order_code"),
                     "customer": (o.get("customer") or {}).get("name", ""),
                     "order_total": ot, "fixed": row_fixed, "percent": row_pct,
                     "commission": round(row_fixed + row_pct, 2),
                     "at": o.get("updated_at") or o.get("created_at")})
    settlements = await db.ecom_worker_settlements.find(
        {"worker_id": worker_id}, {"_id": 0}).sort("created_at", -1).to_list(length=200)
    return {
        "worker": worker,
        "unsettled": {"count": len(rows), "fixed_total": round(fixed_total, 2),
                      "percent_total": round(percent_total, 2),
                      "total": round(fixed_total + percent_total, 2), "orders": rows},
        "settlements": settlements,
    }


@router.post("/ecom-workers/{worker_id}/commissions/settle")
async def settle_worker_commissions(worker_id: str, body: dict, user: dict = Depends(require_tenant)):
    """تصفية العمولات المستحقة: قيد مصروف + خصم من الصندوق المختار + ختم الطلبات."""
    await require_ecom_feature(user)
    worker = await db.ecom_workers.find_one({"id": worker_id}, {"_id": 0, "pin_hash": 0})
    if not worker:
        raise HTTPException(status_code=404, detail="العامل غير موجود")
    base = {"executor.id": worker_id, "executor.type": "worker", "status": "delivered",
            "commission_settled": {"$exists": False}}
    orders = await db.ecom_orders.find(base, {"_id": 0, "id": 1, "total": 1}).to_list(length=10000)
    if not orders:
        raise HTTPException(status_code=400, detail="لا عمولات مستحقة للتصفية")
    fixed = float(worker.get("commission_fixed") or 0)
    pct = float(worker.get("commission_percent") or 0)
    fixed_total = round(len(orders) * fixed, 2)
    percent_total = round(sum(float(o.get("total") or 0) for o in orders) * pct / 100.0, 2)
    total = round(fixed_total + percent_total, 2)
    if total <= 0:
        raise HTTPException(status_code=400, detail="العمولة الإجمالية صفر — حدّد قاعدة العمولة أولاً")
    box_id = (body.get("payment_method") or "cash").strip()
    if box_id == "personal":
        raise HTTPException(status_code=400, detail="اختر صندوقاً نظامياً (المال الخاص خارج الصناديق)")
    box = await db.cash_boxes.find_one({"id": box_id})
    if not box:
        raise HTTPException(status_code=400, detail="الصندوق المختار غير موجود")
    now = _now()
    sid = str(uuid.uuid4())
    order_ids = [o["id"] for o in orders]
    # 1) ختم الطلبات
    await db.ecom_orders.update_many({"id": {"$in": order_ids}},
        {"$set": {"commission_settled": sid, "updated_at": now}})
    # 2) وثيقة التصفية
    settlement = {"id": sid, "worker_id": worker_id, "worker_name": worker.get("name", ""),
                  "order_ids": order_ids, "orders_count": len(orders),
                  "fixed_total": fixed_total, "percent_total": percent_total, "total": total,
                  "payment_method": box_id, "created_at": now, "created_by": user.get("id")}
    await db.ecom_worker_settlements.insert_one(settlement)
    # 3) مصروف + قيد يومية (نفس نمط مسار المصاريف)
    from services.code_generator import generate_code
    code = await generate_code(db, "expenses", "CH", 5, with_year=True)
    expense = {"id": str(uuid.uuid4()), "title": f"عمولة عامل — {worker.get('name', '')} ({len(orders)} طلباً مُسلَّماً)",
               "category": "عمولات العمال", "amount": total, "currency": "DZD", "exchange_rate": None,
               "payment_method": box_id, "date": now, "created_at": now, "created_by": user.get("id"),
               "code": code, "expense_number": code,
               "notes": f"تصفية عمولات {settlement['id']} — ثابت {fixed_total} + نسبة {percent_total}",
               "reference_type": "worker_settlement", "reference_id": sid}
    await db.expenses.insert_one(expense)
    await db.cash_boxes.update_one({"id": box_id}, {"$inc": {"balance": -total}, "$set": {"updated_at": now}})
    await db.transactions.insert_one({"id": str(uuid.uuid4()), "cash_box_id": box_id, "type": "expense",
        "amount": total, "description": f"عمولة عامل — {worker.get('name', '')}",
        "reference_type": "worker_settlement", "reference_id": sid,
        "created_at": now, "created_by": user.get("name", "")})
    settlement.pop("_id", None)
    return {"ok": True, "settlement": settlement, "expense_code": code}
