"""Generalized bookings module (الحجوزات العامة) — module pack M7.

The platform only had restaurant-table reservations. M7 generalizes booking to
any rentable/bookable resource — rooms, equipment, vehicles, staff, halls —
with interval clash detection, a status lifecycle, and optional deposits that
post to accounting (Dr box / Cr 203 ودائع أمانات العملاء — the existing
customer-deposits liability account) and refund on cancellation.

Lifecycle: booked → confirmed → completed   (+ no_show / cancelled from booked|confirmed)
Clash rule: same resource, status in (booked, confirmed), overlapping [start, end).
Concurrency: per-resource booking lock with 30s stale recovery (same pattern
as p494 restaurant reservations).
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from utils.ids import new_id

RESOURCE_TYPES = ["room", "equipment", "vehicle", "staff", "hall", "other"]
ACTIVE_STATUSES = ("booked", "confirmed")
ALLOWED_TRANSITIONS = {
    "booked": {"confirmed", "cancelled", "no_show"},
    "confirmed": {"completed", "cancelled", "no_show"},
    "completed": set(),
    "cancelled": set(),
    "no_show": set(),
}


def _now_dt() -> datetime:
    return datetime.now(timezone.utc)


def _now() -> str:
    return _now_dt().isoformat()


def _parse_iso(raw) -> Optional[str]:
    """Normalize an ISO datetime to UTC 'Z' form (lexicographically comparable)."""
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except Exception:
        return None


def intervals_overlap(a_start: str, a_end: str, b_start: str, b_end: str) -> bool:
    """Half-open [start, end) overlap — back-to-back bookings are allowed."""
    return a_start < b_end and b_start < a_end


class ResourceIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: str = "other"
    capacity: int = Field(default=1, ge=1, le=100000)
    color: str = "#3b82f6"
    notes: str = ""


class ResourceUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    type: Optional[str] = None
    capacity: Optional[int] = Field(default=None, ge=1, le=100000)
    color: Optional[str] = None
    active: Optional[bool] = None
    notes: Optional[str] = None


class BookingIn(BaseModel):
    resource_id: str = Field(min_length=1)
    customer_name: str = Field(min_length=1, max_length=120)
    customer_phone: str = ""
    start: str
    end: str
    deposit: float = Field(default=0, ge=0, le=1e12)
    deposit_box: str = "cash"
    notes: str = ""


class BookingUpdate(BaseModel):
    customer_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    customer_phone: Optional[str] = None
    start: Optional[str] = None
    end: Optional[str] = None
    notes: Optional[str] = None


class StatusIn(BaseModel):
    status: str
    refund_deposit: bool = False
    refund_box: str = "cash"


def create_bookings_routes(db, get_current_user, get_tenant_admin, require_tenant):
    router = APIRouter(prefix="/bookings", tags=["bookings"])

    async def _next_code() -> str:
        year = _now_dt().strftime("%Y")
        counter = await db.counters.find_one_and_update(
            {"_id": f"BKG_{year}"}, {"$inc": {"seq": 1}},
            upsert=True, return_document=True)
        return f"BKG-{year}-{counter['seq']:04d}"

    async def _deposit_journal(booking: dict, amount: float, box_id: str, refund: bool):
        from services.accounting_auto import BOX_ACCOUNT, ensure_accounts, _insert_entry
        await ensure_accounts(db)
        # p503: fail-closed box validation on BOTH paths — an unknown/ecom box
        # used to post a journal against account 530 while the physical box
        # mirror never moved (refund path took no validation at all).
        box = await db.cash_boxes.find_one({"id": box_id})
        if not box or box.get("type") == "ecom":
            raise HTTPException(status_code=400, detail="صندوق العربون غير صالح")
        box_acc = await db.accounts.find_one({"code": BOX_ACCOUNT.get(box_id, "530")})
        dep_acc = await db.accounts.find_one({"code": "203"})
        if not box_acc or not dep_acc:
            raise HTTPException(status_code=400, detail="حسابات الصندوق أو الودائع غير موجودة")

        def line(acc, d=0.0, c=0.0):
            return {"account_id": acc["id"], "account_code": acc["code"],
                    "account_name": acc.get("name_ar") or acc.get("name"),
                    "debit": round(d, 2), "credit": round(c, 2)}

        if refund:
            lines = [line(dep_acc, d=amount), line(box_acc, c=amount)]
            ref = f"استرداد عربون حجز {booking['code']}"
        else:
            lines = [line(box_acc, d=amount), line(dep_acc, c=amount)]
            ref = f"عربون حجز {booking['code']} — {booking['customer_name']}"
        await _insert_entry(
            db, reference=ref, reference_id=booking["id"],
            source_tag="booking_refund" if refund else "booking_deposit",
            description=ref, lines=lines, date=_now()[:10])
        await db.cash_boxes.update_one(
            {"id": box_id},
            {"$inc": {"balance": -amount if refund else amount}, "$set": {"updated_at": _now()}})

    # ── Resources CRUD ──
    @router.get("/resources")
    async def list_resources(user: dict = Depends(require_tenant)):
        items = await db.booking_resources.find({}, {"_id": 0}).sort("name", 1).to_list(500)
        return {"items": items, "count": len(items)}

    @router.post("/resources", status_code=201)
    async def create_resource(body: ResourceIn, user: dict = Depends(get_tenant_admin)):
        if body.type not in RESOURCE_TYPES:
            raise HTTPException(status_code=400, detail="نوع المورد غير معروف")
        doc = {"id": new_id(), **body.model_dump(), "active": True,
               "created_at": _now(), "created_by": user.get("name", "")}
        await db.booking_resources.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.put("/resources/{resource_id}")
    async def update_resource(resource_id: str, body: ResourceUpdate, user: dict = Depends(get_tenant_admin)):
        upd = {k: v for k, v in body.model_dump().items() if v is not None}
        if "type" in upd and upd["type"] not in RESOURCE_TYPES:
            raise HTTPException(status_code=400, detail="نوع المورد غير معروف")
        if not upd:
            raise HTTPException(status_code=400, detail="لا تعديلات")
        upd["updated_at"] = _now()
        res = await db.booking_resources.update_one({"id": resource_id}, {"$set": upd})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="المورد غير موجود")
        return await db.booking_resources.find_one({"id": resource_id}, {"_id": 0})

    @router.delete("/resources/{resource_id}")
    async def delete_resource(resource_id: str, user: dict = Depends(get_tenant_admin)):
        # p503: hold the per-resource booking lock across the check+delete so a
        # concurrent create_booking cannot slip a booking onto a deleted resource.
        lock_at = _now_dt()
        stale = (lock_at.timestamp() - 30)
        lock = await db.booking_resources.find_one_and_update(
            {"id": resource_id,
             "$or": [{"_booking_lock": {"$ne": True}},
                     {"_booking_lock_ts": {"$lt": stale}}]},
            {"$set": {"_booking_lock": True, "_booking_lock_ts": lock_at.timestamp()}})
        if not lock:
            exists = await db.booking_resources.find_one({"id": resource_id}, {"_id": 1})
            if not exists:
                raise HTTPException(status_code=404, detail="المورد غير موجود")
            raise HTTPException(status_code=409, detail="حجز آخر قيد التنفيذ على هذا المورد — أعد المحاولة")
        try:
            active = await db.bookings.count_documents(
                {"resource_id": resource_id, "status": {"$in": list(ACTIVE_STATUSES)}})
            if active:
                raise HTTPException(status_code=409, detail="للمورد حجوزات نشطة — ألغِها أولاً")
            res = await db.booking_resources.delete_one({"id": resource_id})
            if res.deleted_count == 0:
                raise HTTPException(status_code=404, detail="المورد غير موجود")
            return {"deleted": True, "id": resource_id}
        finally:
            await db.booking_resources.update_one(
                {"id": resource_id},
                {"$set": {"_booking_lock": False}})

    # ── Bookings ──
    @router.get("")
    async def list_bookings(resource_id: Optional[str] = None, status: Optional[str] = None,
                            date_from: Optional[str] = None, date_to: Optional[str] = None,
                            user: dict = Depends(require_tenant)):
        q: dict = {}
        if resource_id:
            q["resource_id"] = resource_id
        if status:
            q["status"] = status
        if date_from or date_to:
            rng = {}
            if date_from:
                rng["$gte"] = date_from
            if date_to:
                rng["$lte"] = date_to + "T23:59:59.999999Z"
            q["start"] = rng
        items = await db.bookings.find(q, {"_id": 0}).sort("start", 1).to_list(1000)
        return {"items": items, "count": len(items)}

    async def _check_clash(resource_id: str, start: str, end: str, exclude_id: str = ""):
        q = {"resource_id": resource_id, "status": {"$in": list(ACTIVE_STATUSES)},
             "start": {"$lt": end}, "end": {"$gt": start}}
        if exclude_id:
            q["id"] = {"$ne": exclude_id}
        return await db.bookings.find_one(q, {"_id": 0, "code": 1, "customer_name": 1,
                                              "start": 1, "end": 1})

    @router.post("", status_code=201)
    async def create_booking(body: BookingIn, user: dict = Depends(get_current_user)):
        res = await db.booking_resources.find_one({"id": body.resource_id})
        if not res:
            raise HTTPException(status_code=404, detail="المورد غير موجود")
        if not res.get("active", True):
            raise HTTPException(status_code=400, detail="المورد غير مفعّل")
        start, end = _parse_iso(body.start), _parse_iso(body.end)
        if not start or not end or end <= start:
            raise HTTPException(status_code=400, detail="فترة الحجز غير صالحة")
        if end <= _now():
            raise HTTPException(status_code=400, detail="فترة الحجز يجب أن تكون في المستقبل")
        box = None
        if body.deposit > 0:
            box = await db.cash_boxes.find_one({"id": body.deposit_box})
            if not box or box.get("type") == "ecom":
                raise HTTPException(status_code=400, detail="صندوق العربون غير صالح")
        # per-resource lock (30s stale recovery — p494 pattern)
        lock_at = _now_dt()
        stale = (lock_at.timestamp() - 30)
        lock = await db.booking_resources.find_one_and_update(
            {"id": body.resource_id,
             "$or": [{"_booking_lock": {"$ne": True}},
                     {"_booking_lock_ts": {"$lt": stale}}]},
            {"$set": {"_booking_lock": True, "_booking_lock_ts": lock_at.timestamp()}})
        if not lock:
            raise HTTPException(status_code=409, detail="حجز آخر قيد التنفيذ على هذا المورد — أعد المحاولة")
        try:
            clash = await _check_clash(body.resource_id, start, end)
            if clash:
                raise HTTPException(
                    status_code=409,
                    detail=f"تعارض مع الحجز {clash['code']} ({clash['customer_name']})")
            doc = {
                "id": new_id(), "code": await _next_code(),
                "resource_id": body.resource_id, "resource_name": res["name"],
                "resource_type": res.get("type", "other"),
                "customer_name": body.customer_name.strip(),
                "customer_phone": body.customer_phone.strip(),
                "start": start, "end": end, "status": "booked",
                "deposit": round(body.deposit, 2),
                "deposit_paid": False, "deposit_refunded": False,
                "notes": body.notes, "created_at": _now(),
                "created_by": user.get("name", ""),
            }
            await db.bookings.insert_one(doc)
            if body.deposit > 0:
                await _deposit_journal(doc, doc["deposit"], body.deposit_box, refund=False)
                await db.bookings.update_one(
                    {"id": doc["id"]},
                    {"$set": {"deposit_paid": True, "deposit_box": body.deposit_box}})
                doc["deposit_paid"], doc["deposit_box"] = True, body.deposit_box
            doc.pop("_id", None)
            return doc
        finally:
            await db.booking_resources.update_one(
                {"id": body.resource_id},
                {"$set": {"_booking_lock": False}})

    @router.put("/{booking_id}/status")
    async def set_status(booking_id: str, body: StatusIn, user: dict = Depends(get_tenant_admin)):
        # p503: the transition is an ATOMIC CLAIM, not check-then-act — the old
        # code read the state then acted, so concurrent transitions (notably
        # cancel+refund) all passed the guard and only the journal unique index
        # (missing on freshly provisioned tenant DBs) stood between the tenant
        # and a double refund. The claim filter IS the guard now.
        b = await db.bookings.find_one({"id": booking_id})
        if not b:
            raise HTTPException(status_code=404, detail="الحجز غير موجود")
        if body.status not in ALLOWED_TRANSITIONS.get(b["status"], set()):
            raise HTTPException(
                status_code=400,
                detail=f"لا يمكن الانتقال من {b['status']} إلى {body.status}")
        # p503 fail-safe: a crash between the deposit journal and the flag
        # update leaves deposit_paid=False with money actually collected —
        # already_posted detects it so the deposit can never vanish silently.
        from services.accounting_auto import already_posted
        deposit_held = (b.get("deposit_paid") or
                        await already_posted(db, b["id"], "booking_deposit"))
        needs_refund = (body.status == "cancelled" and deposit_held
                        and not b.get("deposit_refunded") and float(b.get("deposit") or 0) > 0)
        if needs_refund and not body.refund_deposit:
            raise HTTPException(
                status_code=422,
                detail="للحجز عربون مدفوع — حدّد refund_deposit=true لاسترداده أو أعد العربون يدوياً")
        if needs_refund:
            box = await db.cash_boxes.find_one({"id": body.refund_box})
            if not box or box.get("type") == "ecom":
                raise HTTPException(status_code=400, detail="صندوق الاسترداد غير صالح")
        upd = {"status": body.status, "updated_at": _now(),
               "status_by": user.get("name", "")}
        claim_filter = {"id": booking_id, "status": b["status"]}
        if needs_refund:
            claim_filter["deposit_refunded"] = {"$ne": True}
        claimed = await db.bookings.find_one_and_update(claim_filter, {"$set": upd})
        if not claimed:
            raise HTTPException(
                status_code=400,
                detail=f"تعذّر الانتقال — حالة الحجز تغيّرت للتو (أعد المحاولة)")
        if needs_refund:
            try:
                await _deposit_journal(b, b["deposit"], body.refund_box, refund=True)
            except Exception:
                # rollback the claim — the booking returns to its prior state
                await db.bookings.update_one(
                    {"id": booking_id, "status": body.status},
                    {"$set": {"status": b["status"], "updated_at": _now()}})
                raise
            await db.bookings.update_one(
                {"id": booking_id},
                {"$set": {"deposit_refunded": True, "refund_box": body.refund_box}})
        return {"id": booking_id, "code": b["code"], "status": body.status,
                "deposit_refunded": bool(needs_refund)}

    @router.put("/{booking_id}")
    async def edit_booking(booking_id: str, body: BookingUpdate, user: dict = Depends(get_tenant_admin)):
        b = await db.bookings.find_one({"id": booking_id})
        if not b:
            raise HTTPException(status_code=404, detail="الحجز غير موجود")
        if b["status"] not in ACTIVE_STATUSES:
            raise HTTPException(status_code=400, detail="لا يمكن تعديل حجز منتهٍ")
        upd = {}
        for k in ("customer_name", "customer_phone", "notes"):
            v = getattr(body, k)
            if v is not None:
                upd[k] = v.strip() if isinstance(v, str) else v
        new_start = _parse_iso(body.start) if body.start else b["start"]
        new_end = _parse_iso(body.end) if body.end else b["end"]
        if not new_start or not new_end or new_end <= new_start:
            raise HTTPException(status_code=400, detail="فترة الحجز غير صالحة")
        if new_start != b["start"] or new_end != b["end"]:
            # p503: the time-change clash check runs under the SAME per-resource
            # lock as create_booking — without it a concurrent create+edit both
            # passed their clash checks and double-booked the resource.
            lock_at = _now_dt()
            stale = (lock_at.timestamp() - 30)
            lock = await db.booking_resources.find_one_and_update(
                {"id": b["resource_id"],
                 "$or": [{"_booking_lock": {"$ne": True}},
                         {"_booking_lock_ts": {"$lt": stale}}]},
                {"$set": {"_booking_lock": True, "_booking_lock_ts": lock_at.timestamp()}})
            if not lock:
                raise HTTPException(status_code=409,
                                    detail="حجز آخر قيد التنفيذ على هذا المورد — أعد المحاولة")
            try:
                clash = await _check_clash(b["resource_id"], new_start, new_end, exclude_id=booking_id)
                if clash:
                    raise HTTPException(
                        status_code=409,
                        detail=f"تعارض مع الحجز {clash['code']} ({clash['customer_name']})")
                upd["start"], upd["end"] = new_start, new_end
                if not upd:
                    raise HTTPException(status_code=400, detail="لا تعديلات")
                upd["updated_at"] = _now()
                await db.bookings.update_one({"id": booking_id}, {"$set": upd})
            finally:
                await db.booking_resources.update_one(
                    {"id": b["resource_id"]},
                    {"$set": {"_booking_lock": False}})
            return await db.bookings.find_one({"id": booking_id}, {"_id": 0})
        if not upd:
            raise HTTPException(status_code=400, detail="لا تعديلات")
        upd["updated_at"] = _now()
        await db.bookings.update_one({"id": booking_id}, {"$set": upd})
        return await db.bookings.find_one({"id": booking_id}, {"_id": 0})

    # ── Utilization stats ──
    @router.get("/stats")
    async def stats(days: int = 30, user: dict = Depends(require_tenant)):
        days = min(max(days, 1), 365)
        horizon = _now_dt().timestamp() + days * 86400
        from datetime import datetime as _dt
        horizon_iso = _dt.fromtimestamp(horizon, tz=timezone.utc).isoformat().replace("+00:00", "Z")
        now_iso = _now().replace("+00:00", "Z")
        resources = await db.booking_resources.find({}, {"_id": 0}).to_list(500)
        out = []
        for r in resources:
            bookings = await db.bookings.find(
                {"resource_id": r["id"], "status": {"$in": list(ACTIVE_STATUSES)},
                 "start": {"$gte": now_iso, "$lte": horizon_iso}},
                {"_id": 0, "start": 1, "end": 1}).to_list(1000)
            hours = 0.0
            for bk in bookings:
                s = _dt.fromisoformat(bk["start"].replace("Z", "+00:00"))
                e = _dt.fromisoformat(bk["end"].replace("Z", "+00:00"))
                hours += max((e - s).total_seconds() / 3600, 0)
            out.append({"resource_id": r["id"], "name": r["name"],
                        "type": r.get("type", "other"),
                        "upcoming_bookings": len(bookings),
                        "booked_hours": round(hours, 1),
                        "utilization_pct": round(min(hours / (days * 24) * 100, 100), 1)})
        return {"days": days, "resources": out}

    return {"router": router}
