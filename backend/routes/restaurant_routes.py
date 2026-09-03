# p186: Restaurant mode — tables + kitchen orders (POS adaptation, not a new module)
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import secrets  # p323: rotating QR table tokens


class TableCreate(BaseModel):
    name: str
    seats: int = 4
    zone: Optional[str] = None


class TableUpdate(BaseModel):
    name: Optional[str] = None
    seats: Optional[int] = None
    zone: Optional[str] = None


class KitchenItem(BaseModel):
    product_name: str
    quantity: float = 1
    note: Optional[str] = None
    variant: Optional[dict] = None  # p184
    product_id: Optional[str] = None  # p311: enables loading a table order back into the POS cart
    unit_price: Optional[float] = None  # p311: server-side price snapshot (QR orders)
    modifiers: Optional[List[dict]] = None  # p311: structured modifier choices


class KitchenOrderCreate(BaseModel):
    table_id: Optional[str] = None
    items: List[KitchenItem]
    notes: Optional[str] = None
    customer_phone: Optional[str] = None  # p315: إشعار واتساب عند الجاهزية
    source: Optional[str] = None  # p338: pos | waiter | kitchen — qr/delivery تُضبط تلقائيًا في مساريهما
    scheduled_for: Optional[str] = None  # p337: طلبية مجدولة — موعد التجهيز (ISO)
    remind_days: Optional[int] = 1  # p337: تذكير قبل الموعد بيوم أو ثلاثة


class DiscountIn(BaseModel):
    # p337: خصم على طلب مطبخ — نسبة/مبلغ مباشر أو كوبون من وحدة promotions
    type: Optional[str] = None  # percent | amount
    value: Optional[float] = None
    code: Optional[str] = None
    reason: Optional[str] = None


class OrderSettingsIn(BaseModel):
    # p336: إعدادات طلبات المطعم — نمط الدفع
    payment_mode: str  # prepaid | postpaid


class PayBody(BaseModel):
    # p336: تأكيد دفع طلب مطبخ
    method: str = "cash"  # cash | card | debt
    customer_phone: Optional[str] = None  # p356: ولاء — هاتف الزبون عند الدفع


class NeighborIn(BaseModel):
    # p335: حساب جار (مؤسسة/محل مجاور) — طلبات B2B بأسعار خاصة ودين/كاش
    name: str
    manager_name: Optional[str] = None
    phone: Optional[str] = None
    payment: str = "debt"  # debt (دين شهري) | cash
    discount_pct: float = 0  # خصم عام % على كل الأسعار
    prices: Optional[dict] = None  # product_id -> سعر خاص (يتقدم على الخصم)
    notes: Optional[str] = None


class NeighborUpdate(BaseModel):
    name: Optional[str] = None
    manager_name: Optional[str] = None
    phone: Optional[str] = None
    payment: Optional[str] = None
    discount_pct: Optional[float] = None
    prices: Optional[dict] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class NeighborSettle(BaseModel):
    amount: float
    notes: Optional[str] = None


class NeighborOrderItem(BaseModel):
    product_id: str
    quantity: float
    note: Optional[str] = None


class NeighborOrderCreate(BaseModel):
    items: List[NeighborOrderItem]
    ordered_by: Optional[str] = None  # اسم العامل الطالب
    notes: Optional[str] = None


class DeliveryItem(BaseModel):
    # p316: عنصر طلب توصيل — الكاشير مصدر موثوق (مثل مسار طلب المطبخ)
    product_id: Optional[str] = None
    product_name: str
    quantity: float = 1
    unit_price: float = 0
    note: Optional[str] = None
    modifiers: Optional[List[dict]] = None


class DeliveryOrderCreate(BaseModel):
    # p316: طلب توصيل مطعم — يولّد طلب مطبخ مرافقًا (source=delivery)
    customer_name: str
    customer_phone: Optional[str] = None
    address: Optional[str] = None
    items: List[DeliveryItem]
    delivery_fee: float = 0
    driver_name: Optional[str] = None
    notes: Optional[str] = None


class DeliveryStatusUpdate(BaseModel):
    status: str  # pending | ready | out_for_delivery | delivered | cancelled
    driver_name: Optional[str] = None
    reason: Optional[str] = None


class DeliveryCollect(BaseModel):
    sale_id: str


class StatusUpdate(BaseModel):
    status: str  # pending | preparing | served | cancelled


class CheckoutBody(BaseModel):
    sale_id: Optional[str] = None


class ModifierOption(BaseModel):
    name: str
    price_delta: float = 0
    product_id: Optional[str] = None  # p308: مكوّن مخزون مرتبط يُخصم عند البيع (مثلاً جبن إضافي)
    qty: float = 1  # كمية المكوّن لكل وحدة طبق


class ModifierGroup(BaseModel):
    name: str
    required: bool = False
    max_select: int = 1
    options: List[ModifierOption] = []


class ModifierGroupsBody(BaseModel):
    groups: List[ModifierGroup]


class SocialLinksIn(BaseModel):
    # p334: روابط التواصل الاجتماعي للمطعم — تُعرض للزبون في صفحة QR
    instagram: Optional[str] = None
    facebook: Optional[str] = None
    tiktok: Optional[str] = None
    google_maps: Optional[str] = None
    whatsapp: Optional[str] = None
    website: Optional[str] = None


def _now():
    return datetime.now(timezone.utc)


def _clean_phone(raw):
    # p315: تطبيع رقم جزائري — أرقام فقط بصيغة دولية، وإلا None
    if not raw:
        return None
    import re
    d = re.sub(r"\D", "", str(raw))
    if d.startswith("00213"):
        d = d[2:]
    elif d.startswith("0"):
        d = "213" + d[1:]
    return d if 8 <= len(d) <= 15 else None


def create_restaurant_routes(db, get_current_user, get_tenant_admin) -> dict:
    router = APIRouter(prefix="/restaurant", tags=["restaurant"])
    # Resolve collections per-call: _TenantDBProxy routes via ContextVar,
    # capturing collections at factory time would bind them to main_db forever.
    def _tables():
        return db.restaurant_tables

    def _orders():
        return db.kitchen_orders

    def _delivery():
        return db.delivery_orders

    def _delivery_out(o):
        o = dict(o)
        o.pop("_id", None)
        return o

    async def _delivery_code() -> str:
        day = _now().strftime("%Y%m%d")
        count = await _delivery().count_documents({"code": {"$regex": f"^DLV-{day}-"}})
        return f"DLV-{day}-{count + 1:04d}"

    def _table_out(t):
        t = dict(t)
        t.pop("_id", None)
        return t

    async def _send_sched_reminder(o, user):
        # p337: تذكير طلبية مجدولة — إشعار داخلي للمدراء + بريد إلكتروني إن توفر
        try:
            tenant_id = user.get("tenant_id")
            when = o.get("scheduled_for")
            when_txt = when.strftime("%Y-%m-%d %H:%M") if hasattr(when, "strftime") else str(when or "")
            title = "تذكير: طلبية مجدولة تقترب"
            msg = f"الطلبية {o.get('code')} مجدولة بتاريخ {when_txt} — جهّزوا المكونات والمواد."
            admins = await db.users.find(
                {"role": {"$in": ["admin", "tenant_admin"]}}, {"_id": 0, "id": 1}
            ).to_list(10)
            for a in admins:
                await db.notifications.insert_one({
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant_id,
                    "user_id": a.get("id"),
                    "type": "scheduled_order",
                    "title": title,
                    "message": msg,
                    "data": {"order_id": o.get("id"), "code": o.get("code")},
                    "link": "/tables",
                    "read": False,
                    "created_at": _now().isoformat(),
                })
            try:
                from config.database import main_db as _mdb
                t = await _mdb.tenants.find_one({"id": tenant_id}, {"_id": 0, "email": 1})
                to = (t or {}).get("email")
                if to:
                    from services.email_service import send_email
                    await send_email(to, title, body=msg)
            except Exception:
                pass
            await _orders().update_one({"id": o.get("id")}, {"$set": {"reminder_sent": True}})
        except Exception:
            pass

    async def _publish(event_type, o, user):
        # p306: kitchen order events feed the live KDS screen via SSE
        try:
            from services.outbox import outbox_write
            from config.database import main_db as _main_db
            await outbox_write(
                _main_db, event_type,
                {
                    "order_id": o.get("id"), "code": o.get("code"),
                    "table_name": o.get("table_name"), "status": o.get("status"),
                    "item_count": len(o.get("items") or []),
                },
                tenant_id=user.get("tenant_id") or "platform",
                source="restaurant",
            )
        except Exception:
            pass  # فشل النشر لا يمنع عملية المطبخ

    def _order_out(o):
        o = dict(o)
        o.pop("_id", None)
        try:  # p336: إجمالي الطلب — لشارات الدفع والفاتورة الموحدة
            o["total"] = round(sum(
                float(i.get("quantity") or 0) * float(i.get("unit_price") or 0)
                for i in (o.get("items") or [])
            ), 2)
        except Exception:
            o["total"] = 0
        try:  # p337: الخصم — المبلغ المحسوب والصافي بعده
            disc = o.get("discount") or {}
            o["discount_amount"] = round(float(disc.get("amount") or 0), 2)
            o["final_total"] = round(max(0.0, o["total"] - o["discount_amount"]), 2)
        except Exception:
            o["discount_amount"] = 0
            o["final_total"] = o["total"]
        return o

    async def _payment_mode(tdb=None):
        """p336: نمط دفع المطعم — postpaid افتراضيًا (سلوك ما قبل p336 حرفيًا)"""
        coll = tdb.restaurant_settings if tdb is not None else db.restaurant_settings
        doc = await coll.find_one({"_id": "order_settings"}, {"_id": 0, "payment_mode": 1}) or {}
        return doc.get("payment_mode") or "postpaid"

    async def _order_code() -> str:
        day = _now().strftime("%Y%m%d")
        count = await _orders().count_documents({"code": {"$regex": f"^KCH-{day}-"}})
        return f"KCH-{day}-{count + 1:04d}"

    # ---------- p308: Modifier groups (إضافات/بدائل الأطباق) ----------
    @router.get("/products/{product_id}/modifier-groups")
    async def get_modifier_groups(product_id: str, user: dict = Depends(get_current_user)):
        p = await db.products.find_one(
            {"id": product_id}, {"_id": 0, "modifier_groups": 1, "name": 1}
        )
        if not p:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        return {
            "product_id": product_id,
            "product_name": p.get("name"),
            "groups": p.get("modifier_groups") or [],
        }

    @router.put("/products/{product_id}/modifier-groups")
    async def set_modifier_groups(
        product_id: str, body: ModifierGroupsBody, admin: dict = Depends(get_tenant_admin)
    ):
        res = await db.products.update_one(
            {"id": product_id},
            {"$set": {"modifier_groups": [g.model_dump() for g in body.groups]}},
        )
        if not res.matched_count:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        return {"ok": True, "groups": len(body.groups)}

    # ---------- Tables ----------
    @router.get("/tables")
    async def list_tables(user: dict = Depends(get_current_user)):
        cursor = _tables().find({}).sort("name", 1)
        out = []
        async for t in cursor:
            if not t.get("qr_token"):  # p323: backfill للطاولات القديمة
                t["qr_token"] = secrets.token_hex(5)
                await _tables().update_one({"id": t["id"]}, {"$set": {"qr_token": t["qr_token"]}})
            out.append(_table_out(t))
        return out

    @router.post("/tables")
    async def create_table(data: TableCreate, admin: dict = Depends(get_tenant_admin)):
        name = data.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="اسم الطاولة مطلوب")
        doc = {
            "id": f"tbl_{uuid.uuid4().hex[:12]}",
            "name": name,
            "seats": max(1, int(data.seats or 1)),
            "zone": (data.zone or "").strip() or None,
            "status": "free",
            "active_order_id": None,
            "qr_token": secrets.token_hex(5),  # p323: رابط QR مؤقت يدور عند تحرير الطاولة
            "created_at": _now(),
        }
        await _tables().insert_one(doc)
        return _table_out(doc)

    @router.put("/tables/{table_id}")
    async def update_table(table_id: str, data: TableUpdate, admin: dict = Depends(get_tenant_admin)):
        t = await _tables().find_one({"id": table_id})
        if not t:
            raise HTTPException(status_code=404, detail="الطاولة غير موجودة")
        upd = {}
        if data.name is not None:
            if not data.name.strip():
                raise HTTPException(status_code=400, detail="اسم الطاولة مطلوب")
            upd["name"] = data.name.strip()
        if data.seats is not None:
            upd["seats"] = max(1, int(data.seats))
        if data.zone is not None:
            upd["zone"] = data.zone.strip() or None
        if not upd:
            return _table_out(t)
        await _tables().update_one({"id": table_id}, {"$set": upd})
        return _table_out(await _tables().find_one({"id": table_id}))

    @router.delete("/tables/{table_id}")
    async def delete_table(table_id: str, admin: dict = Depends(get_tenant_admin)):
        t = await _tables().find_one({"id": table_id})
        if not t:
            raise HTTPException(status_code=404, detail="الطاولة غير موجودة")
        if t.get("status") == "occupied":
            raise HTTPException(status_code=400, detail="الطاولة مشغولة — أنهِ الطلب أولاً")
        await _tables().delete_one({"id": table_id})
        return {"ok": True}

    # ---------- Kitchen orders ----------
    @router.get("/kitchen-orders")
    async def list_kitchen_orders(status: Optional[str] = None, all: bool = False, user: dict = Depends(get_current_user)):
        # p337: الطلبيات المجدولة التي حان موعدها تدخل المطبخ تلقائيًا
        await _orders().update_many(
            {"status": "scheduled", "scheduled_for": {"$lte": _now()}},
            {"$set": {"status": "pending", "updated_at": _now()}},
        )
        q = {}
        if status:
            q["status"] = status
        elif not all:
            # p336: في نمط الدفع المسبق تبقى الطلبات غير المدفوعة خارج المطبخ
            # p337: والمجدولة لها لوحة «قيد التجهيز» الخاصة بها
            q["status"] = {"$nin": ["pending_payment", "scheduled"]}
        else:
            q["status"] = {"$ne": "scheduled"}
        cursor = _orders().find(q).sort("created_at", -1).limit(200)
        return [_order_out(o) async for o in cursor]

    @router.post("/kitchen-orders")
    async def create_kitchen_order(data: KitchenOrderCreate, user: dict = Depends(get_current_user)):
        if not data.items:
            raise HTTPException(status_code=400, detail="لا توجد عناصر في الطلب")
        items = [it.model_dump() for it in data.items]
        if data.scheduled_for:
            # p337: طلبية مجدولة — لا تدخل المطبخ ولا تشغل طاولة حتى موعدها
            try:
                sched = datetime.fromisoformat(str(data.scheduled_for).replace("Z", "+00:00"))
                if sched.tzinfo is None:
                    sched = sched.replace(tzinfo=timezone.utc)
            except Exception:
                raise HTTPException(status_code=400, detail="موعد الجدولة غير صالح")
            if sched <= _now():
                raise HTTPException(status_code=400, detail="موعد الجدولة يجب أن يكون في المستقبل")
            remind_days = int(data.remind_days or 1)
            if remind_days not in (1, 3):
                raise HTTPException(status_code=400, detail="التذكير إما قبل يوم أو قبل ثلاثة أيام")
            table = None
            if data.table_id:
                table = await _tables().find_one({"id": data.table_id})
                if not table:
                    raise HTTPException(status_code=404, detail="الطاولة غير موجودة")
            doc = {
                "id": f"kch_{uuid.uuid4().hex[:12]}",
                "code": await _order_code(),
                "table_id": table["id"] if table else None,
                "table_name": table.get("name") if table else None,
                "items": items,
                "notes": data.notes,
                "customer_phone": _clean_phone(data.customer_phone),
                "status": "scheduled",
                "payment_status": None,
                "sale_id": None,
                "source": data.source if data.source in ("pos", "waiter", "kitchen") else "pos",
                "scheduled_for": sched,
                "remind_days": remind_days,
                "reminder_sent": False,
                "created_by": user.get("username") or user.get("email"),
                "created_at": _now(),
                "updated_at": _now(),
            }
            await _orders().insert_one(doc)
            return _order_out(doc)
        table = None
        if data.table_id:
            table = await _tables().find_one({"id": data.table_id})
            if not table:
                raise HTTPException(status_code=404, detail="الطاولة غير موجودة")
            # If the table already has an active order, append items to it
            active_id = table.get("active_order_id")
            if active_id:
                # p336: pending_payment أيضًا — الطلب غير المدفوع (نمط مسبق) يُلحق ولا يتضاعف
                existing = await _orders().find_one({"id": active_id, "status": {"$in": ["pending", "preparing", "pending_payment"]}})
                if existing:
                    _set = {"updated_at": _now()}
                    if existing.get("status") != "pending_payment":
                        _set["status"] = "pending"
                    if await _payment_mode() == "prepaid":
                        _set["payment_status"] = "unpaid"  # الإضافات الجديدة غير مدفوعة
                    await _orders().update_one(
                        {"id": active_id},
                        {"$push": {"items": {"$each": items}}, "$set": _set},
                    )
                    updated = await _orders().find_one({"id": active_id})
                    await _publish("kitchen_order.updated", updated, user)
                    return _order_out(updated)
        _mode = await _payment_mode()  # p336
        doc = {
            "id": f"kch_{uuid.uuid4().hex[:12]}",
            "code": await _order_code(),
            "table_id": table["id"] if table else None,
            "table_name": table.get("name") if table else None,
            "items": items,
            "notes": data.notes,
            "customer_phone": _clean_phone(data.customer_phone),  # p315
            "status": "pending_payment" if _mode == "prepaid" else "pending",  # p336
            "payment_status": "unpaid" if _mode == "prepaid" else None,        # p336
            "sale_id": None,
            "source": data.source if data.source in ("pos", "waiter", "kitchen") else "pos",  # p338
            "created_by": user.get("username") or user.get("email"),
            "created_at": _now(),
            "updated_at": _now(),
        }
        await _orders().insert_one(doc)
        if table:
            await _tables().update_one({"id": table["id"]}, {"$set": {"status": "occupied", "active_order_id": doc["id"]}})
        await _publish("kitchen_order.created", doc, user)
        return _order_out(doc)

    @router.put("/kitchen-orders/{order_id}/status")
    async def update_order_status(order_id: str, data: StatusUpdate, user: dict = Depends(get_current_user)):
        if data.status not in ("pending", "preparing", "served", "cancelled"):
            raise HTTPException(status_code=400, detail="حالة غير صالحة")
        o = await _orders().find_one({"id": order_id})
        if not o:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")
        await _orders().update_one({"id": order_id}, {"$set": {"status": data.status, "updated_at": _now()}})
        if data.status in ("served", "cancelled") and o.get("table_id"):
            # p323: تحرير الطاولة يقتل رابط QR الحالي — رابط مؤقت لكل زيارة
            await _tables().update_one({"id": o["table_id"]}, {"$set": {
                "status": "free", "active_order_id": None, "qr_token": secrets.token_hex(5)}})
        updated = await _orders().find_one({"id": order_id})
        await _publish("kitchen_order.updated", updated, user)
        if data.status == "served" and updated.get("customer_phone"):
            # p315: إشعار واتساب عند الجاهزية — لا يفشل تحديث الحالة إن تعذر الإرسال
            try:
                from services.whatsapp_service import WhatsAppService
                res = await WhatsAppService().send_message(
                    updated["customer_phone"],
                    f"طلبك {updated.get('code')} جاهز للاستلام. شكرًا لزيارتكم!",
                )
                await _orders().update_one(
                    {"id": order_id},
                    {"$set": {"ready_notified": {"at": _now(), "sent": bool(res.get("sent"))}}},
                )
            except Exception:
                pass
        return _order_out(updated)

    # ---------- p339: الأكثر مبيعًا — ترتيب شبكة POS المطاعم ----------
    @router.get("/top-sellers")
    async def top_sellers(days: int = 30, user: dict = Depends(get_current_user)):
        since = _now() - timedelta(days=max(1, min(int(days), 365)))
        pipeline = [
            {"$match": {"created_at": {"$gte": since}, "status": {"$nin": ["cancelled", "scheduled"]}}},
            {"$unwind": "$items"},
            {"$match": {"items.product_id": {"$ne": None}}},
            {"$group": {"_id": "$items.product_id", "qty": {"$sum": "$items.quantity"}}},
            {"$sort": {"qty": -1}},
            {"$limit": 50},
        ]
        rows = await _orders().aggregate(pipeline).to_list(50)
        return {"top": [{"product_id": r["_id"], "qty": r["qty"]} for r in rows]}

    # ---------- p337: خصومات طلبات المطعم ----------
    @router.post("/kitchen-orders/{order_id}/discount")
    async def apply_discount(order_id: str, data: DiscountIn, user: dict = Depends(get_current_user)):
        o = await _orders().find_one({"id": order_id})
        if not o:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")
        if o.get("status") in ("served", "cancelled"):
            raise HTTPException(status_code=400, detail="لا يمكن الخصم على طلب منتهٍ")
        total = round(sum(
            float(i.get("quantity") or 0) * float(i.get("unit_price") or 0)
            for i in (o.get("items") or [])
        ), 2)
        dtype, dval, code = None, None, None
        if data.code:
            promo = await db.promotions.find_one(
                {"code": data.code.strip(), "is_active": {"$ne": False}}, {"_id": 0})
            if not promo:
                raise HTTPException(status_code=404, detail="كوبون غير صالح أو منتهٍ")
            ptype = str(promo.get("discount_type") or promo.get("type") or "percent")
            pval = float(promo.get("discount_percent") or promo.get("discount_value") or promo.get("value") or 0)
            dtype = "amount" if ptype in ("amount", "fixed") else "percent"
            dval, code = pval, data.code.strip()
        else:
            if data.type not in ("percent", "amount") or data.value is None:
                raise HTTPException(status_code=400, detail="حدد نوع الخصم وقيمته")
            dtype, dval = data.type, float(data.value)
        if dtype == "percent":
            if not (0 < dval <= 100):
                raise HTTPException(status_code=400, detail="النسبة بين 0 و 100")
            amount = round(total * dval / 100, 2)
        else:
            if total <= 0:
                raise HTTPException(status_code=400, detail="لا يمكن الخصم على طلب بلا إجمالي")
            if not (0 < dval <= total):
                raise HTTPException(status_code=400, detail="مبلغ الخصم أكبر من إجمالي الطلب")
            amount = round(dval, 2)
        disc = {
            "type": dtype, "value": dval, "amount": amount, "code": code,
            "reason": data.reason,
            "by": user.get("username") or user.get("email"), "at": _now(),
        }
        await _orders().update_one({"id": order_id}, {"$set": {"discount": disc, "updated_at": _now()}})
        updated = await _orders().find_one({"id": order_id})
        await _publish("kitchen_order.updated", updated, user)
        return _order_out(updated)

    @router.delete("/kitchen-orders/{order_id}/discount")
    async def remove_discount(order_id: str, user: dict = Depends(get_current_user)):
        res = await _orders().update_one(
            {"id": order_id}, {"$unset": {"discount": ""}, "$set": {"updated_at": _now()}})
        if not res.matched_count:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")
        updated = await _orders().find_one({"id": order_id})
        await _publish("kitchen_order.updated", updated, user)
        return _order_out(updated)

    # ---------- p337: الطلبيات المجدولة (لوحة قيد التجهيز) ----------
    @router.get("/scheduled-orders")
    async def list_scheduled_orders(user: dict = Depends(get_current_user)):
        await _orders().update_many(
            {"status": "scheduled", "scheduled_for": {"$lte": _now()}},
            {"$set": {"status": "pending", "updated_at": _now()}},
        )
        rows = await _orders().find({"status": "scheduled"}).sort("scheduled_for", 1).to_list(200)
        out = []
        now = _now()
        for o in rows:
            oo = _order_out(o)
            sched = o.get("scheduled_for")
            remind_days = int(o.get("remind_days") or 1)
            due_soon = False
            try:
                due_soon = bool(sched) and (sched - timedelta(days=remind_days)) <= now
            except Exception:
                pass
            oo["due_soon"] = due_soon
            out.append(oo)
            if due_soon and not o.get("reminder_sent"):
                await _send_sched_reminder(o, user)
        return out

    @router.post("/scheduled-orders/{order_id}/activate")
    async def activate_scheduled_order(order_id: str, user: dict = Depends(get_current_user)):
        res = await _orders().find_one_and_update(
            {"id": order_id, "status": "scheduled"},
            {"$set": {"status": "pending", "updated_at": _now()}},
        )
        if not res:
            raise HTTPException(status_code=404, detail="الطلبية المجدولة غير موجودة")
        updated = await _orders().find_one({"id": order_id})
        await _publish("kitchen_order.created", updated, user)  # تدخل المطبخ فورًا (والطبع التلقائي p338)
        return _order_out(updated)

    @router.post("/kitchen-orders/{order_id}/pay")
    async def pay_kitchen_order(order_id: str, data: PayBody, user: dict = Depends(get_current_user)):
        """p336: تأكيد دفع الطلب — في النمط المسبق يدخل المطبخ الآن فقط"""
        if data.method not in ("cash", "card", "debt"):
            raise HTTPException(status_code=400, detail="طريقة دفع غير صالحة")
        o = await _orders().find_one({"id": order_id})
        if not o:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")
        upd = {"payment_status": "paid", "payment_method": data.method,
               "paid_at": _now(), "paid_by": user.get("username") or user.get("email"),
               "updated_at": _now()}
        if o.get("status") == "pending_payment":
            upd["status"] = "pending"
        await _orders().update_one({"id": order_id}, {"$set": upd})
        updated = await _orders().find_one({"id": order_id})
        await _publish("kitchen_order.updated", updated, user)
        out = _order_out(updated)
        # p356: كسب نقاط الولاء عند الدفع الفعلي (الآجل لا يكسب حتى السداد)
        if data.method != "debt":
            from services import pos_loyalty
            earned = await pos_loyalty.earn_points(
                db, amount=out.get("final_total") or out.get("total") or 0,
                ref_id=order_id, ref_label=f"طلب مطعم {o.get('code', '')}",
                user_name=user.get("username") or user.get("email", ""),
                phone=data.customer_phone or o.get("customer_phone") or "")
            if earned:
                out["loyalty_earned"] = earned["points"]
        return out

    @router.post("/tables/{table_id}/checkout")
    async def checkout_table(table_id: str, data: CheckoutBody, user: dict = Depends(get_current_user)):
        """Called after the POS sale completes: link the sale and free the table."""
        t = await _tables().find_one({"id": table_id})
        if not t:
            raise HTTPException(status_code=404, detail="الطاولة غير موجودة")
        active_id = t.get("active_order_id")
        if active_id:
            await _orders().update_one(
                {"id": active_id},
                {"$set": {"status": "served", "sale_id": data.sale_id,
                          "payment_status": "paid", "paid_at": _now(), "updated_at": _now()}},  # p336
            )
        await _tables().update_one({"id": table_id}, {"$set": {
            "status": "free", "active_order_id": None, "qr_token": secrets.token_hex(5)}})  # p323
        return {"ok": True}

    @router.post("/tables/{table_id}/rotate-qr")
    async def rotate_table_qr(table_id: str, admin: dict = Depends(get_tenant_admin)):
        """p323: تجديد رابط QR للطاولة يدوياً — يقتل الرابط السابق فوراً"""
        t = await _tables().find_one({"id": table_id})
        if not t:
            raise HTTPException(status_code=404, detail="الطاولة غير موجودة")
        tok = secrets.token_hex(5)
        await _tables().update_one({"id": table_id}, {"$set": {"qr_token": tok}})
        return {"ok": True, "qr_token": tok}

    # ---------- p316: Delivery orders (طلبات التوصيل) ----------
    _DLV_STATUSES = ("pending", "ready", "out_for_delivery", "delivered", "cancelled")

    @router.get("/delivery-orders")
    async def list_delivery_orders(
        status: Optional[str] = None, days: int = 30,
        user: dict = Depends(get_current_user),
    ):
        q = {}
        if status:
            q["status"] = status
        if days and days > 0:
            since = _now() - timedelta(days=min(days, 365))
            q["created_at"] = {"$gte": since}
        cursor = _delivery().find(q).sort("created_at", -1).limit(300)
        return [_delivery_out(o) async for o in cursor]

    @router.get("/delivery-orders-summary")
    async def delivery_summary(days: int = 30, user: dict = Depends(get_current_user)):
        since = _now() - timedelta(days=min(max(days, 1), 365))
        by_status = {}
        revenue = 0.0
        fees = 0.0
        async for o in _delivery().find({"created_at": {"$gte": since}}):
            by_status[o.get("status")] = by_status.get(o.get("status"), 0) + 1
            if o.get("status") == "delivered":
                revenue += float(o.get("total") or 0)
                fees += float(o.get("delivery_fee") or 0)
        return {
            "days": days,
            "by_status": by_status,
            "delivered_revenue": round(revenue, 2),
            "delivered_fees": round(fees, 2),
        }

    @router.post("/delivery-orders")
    async def create_delivery_order(data: DeliveryOrderCreate, user: dict = Depends(get_current_user)):
        if not data.items:
            raise HTTPException(status_code=400, detail="لا توجد عناصر في الطلب")
        if not (data.customer_name or "").strip():
            raise HTTPException(status_code=400, detail="اسم الزبون مطلوب")
        items = []
        subtotal = 0.0
        for it in data.items:
            if not (0 < float(it.quantity or 0) <= 100):
                raise HTTPException(status_code=400, detail="كمية غير صالحة")
            d = it.model_dump()
            mod_extra = sum(float(m.get("price_delta") or 0) for m in (d.get("modifiers") or []))
            d["unit_price"] = round(float(d.get("unit_price") or 0) + mod_extra, 2)
            subtotal += d["unit_price"] * float(it.quantity)
            items.append(d)
        fee = max(0.0, float(data.delivery_fee or 0))
        # طلب مطبخ مرافق حتى يظهر في شاشة KDS — بلا طاولة
        kdoc = {
            "id": f"kch_{uuid.uuid4().hex[:12]}",
            "code": await _order_code(),
            "table_id": None,
            "table_name": f"توصيل — {data.customer_name.strip()}",
            "items": items,
            "notes": data.notes,
            "customer_phone": _clean_phone(data.customer_phone),
            "status": "pending",
            "sale_id": None,
            "source": "delivery",
            "created_by": user.get("username") or user.get("email"),
            "created_at": _now(),
            "updated_at": _now(),
        }
        await _orders().insert_one(kdoc)
        await _publish("kitchen_order.created", kdoc, user)
        doc = {
            "id": f"dlv_{uuid.uuid4().hex[:12]}",
            "code": await _delivery_code(),
            "customer_name": data.customer_name.strip(),
            "customer_phone": _clean_phone(data.customer_phone),
            "address": (data.address or "").strip() or None,
            "items": items,
            "subtotal": round(subtotal, 2),
            "delivery_fee": round(fee, 2),
            "total": round(subtotal + fee, 2),
            "driver_name": (data.driver_name or "").strip() or None,
            "notes": data.notes,
            "status": "pending",
            "kitchen_order_id": kdoc["id"],
            "kitchen_code": kdoc["code"],
            "sale_id": None,
            "payment_collected": False,
            "created_by": user.get("username") or user.get("email"),
            "created_at": _now(),
            "updated_at": _now(),
            "delivered_at": None,
        }
        await _delivery().insert_one(doc)
        await _publish("delivery_order.created", doc, user)
        return _delivery_out(doc)

    @router.put("/delivery-orders/{order_id}/status")
    async def update_delivery_status(order_id: str, data: DeliveryStatusUpdate, user: dict = Depends(get_current_user)):
        if data.status not in _DLV_STATUSES:
            raise HTTPException(status_code=400, detail="حالة غير صالحة")
        o = await _delivery().find_one({"id": order_id})
        if not o:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")
        if o.get("status") in ("delivered", "cancelled"):
            raise HTTPException(status_code=400, detail="الطلب مُنهى")
        driver = (data.driver_name or "").strip() or o.get("driver_name")
        if data.status == "out_for_delivery" and not driver:
            raise HTTPException(status_code=400, detail="عيّن السائق قبل الانطلاق")
        upd = {"status": data.status, "updated_at": _now()}
        if driver:
            upd["driver_name"] = driver
        if data.status == "delivered":
            upd["delivered_at"] = _now()
        if data.status == "cancelled":
            upd["cancel_reason"] = (data.reason or "").strip() or None
            # ألغِ طلب المطبخ المرافق إن لم يُقدَّم بعد
            await _orders().update_one(
                {"id": o.get("kitchen_order_id"), "status": {"$in": ["pending", "preparing"]}},
                {"$set": {"status": "cancelled", "updated_at": _now()}},
            )
        await _delivery().update_one({"id": order_id}, {"$set": upd})
        updated = await _delivery().find_one({"id": order_id})
        await _publish("delivery_order.updated", updated, user)
        return _delivery_out(updated)

    @router.post("/delivery-orders/{order_id}/collect")
    async def collect_delivery_order(order_id: str, data: DeliveryCollect, user: dict = Depends(get_current_user)):
        """بعد تسجيل البيع في POS: ربط الفاتورة وإنهاء الطلب (مثل checkout الطاولة)."""
        o = await _delivery().find_one({"id": order_id})
        if not o:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")
        if o.get("status") == "cancelled":
            raise HTTPException(status_code=400, detail="الطلب ملغى")
        await _delivery().update_one(
            {"id": order_id},
            {"$set": {"sale_id": data.sale_id, "payment_collected": True,
                      "status": "delivered", "delivered_at": _now(), "updated_at": _now()}},
        )
        if o.get("kitchen_order_id"):
            await _orders().update_one(
                {"id": o["kitchen_order_id"]},
                {"$set": {"status": "served", "sale_id": data.sale_id,
                          "payment_status": "paid", "paid_at": _now(), "updated_at": _now()}},  # p336
            )
        updated = await _delivery().find_one({"id": order_id})
        await _publish("delivery_order.updated", updated, user)
        return _delivery_out(updated)

    # ---------- p335: حسابات الجيران (B2B) — طلبات المؤسسات المجاورة ----------
    def _neighbors():
        return db.neighbor_accounts

    def _neighbor_out(n):
        n = dict(n)
        n.pop("_id", None)
        return n

    def _nbr_price(n, pid, base):
        """السعر الخاص يتقدم، ثم نسبة الخصم العامة، ثم سعر التجزئة"""
        sp = (n.get("prices") or {}).get(pid)
        if sp is not None:
            try:
                return float(sp)
            except (TypeError, ValueError):
                pass
        disc = float(n.get("discount_pct") or 0)
        if disc > 0:
            return round(base * (1 - disc / 100), 2)
        return base

    @router.get("/neighbors")
    async def list_neighbors(admin: dict = Depends(get_tenant_admin)):
        rows = await _neighbors().find({}).sort("created_at", 1).to_list(200)
        return [_neighbor_out(n) for n in rows]

    @router.post("/neighbors", status_code=201)
    async def create_neighbor(data: NeighborIn, admin: dict = Depends(get_tenant_admin)):
        if not data.name.strip():
            raise HTTPException(status_code=400, detail="اسم الجار مطلوب")
        if data.payment not in ("debt", "cash"):
            raise HTTPException(status_code=400, detail="نمط الحساب غير صالح — debt أو cash")
        doc = {
            "id": f"nbr_{uuid.uuid4().hex[:12]}",
            "token": "NBR-" + secrets.token_hex(10),
            "name": data.name.strip(),
            "manager_name": (data.manager_name or "").strip(),
            "phone": (data.phone or "").strip(),
            "payment": data.payment,
            "discount_pct": max(0.0, min(90.0, float(data.discount_pct or 0))),
            "prices": {str(k): float(v) for k, v in (data.prices or {}).items() if v is not None},
            "balance": 0.0,
            "is_active": True,
            "notes": (data.notes or "").strip(),
            "created_at": _now(),
        }
        await _neighbors().insert_one(doc)
        return _neighbor_out(doc)

    @router.put("/neighbors/{nid}")
    async def update_neighbor(nid: str, data: NeighborUpdate, admin: dict = Depends(get_tenant_admin)):
        n = await _neighbors().find_one({"id": nid})
        if not n:
            raise HTTPException(status_code=404, detail="الجار غير موجود")
        upd = {}
        for k in ("name", "manager_name", "phone", "notes"):
            v = getattr(data, k)
            if v is not None:
                upd[k] = v.strip()
        if data.payment is not None:
            if data.payment not in ("debt", "cash"):
                raise HTTPException(status_code=400, detail="نمط حساب غير صالح")
            upd["payment"] = data.payment
        if data.discount_pct is not None:
            upd["discount_pct"] = max(0.0, min(90.0, float(data.discount_pct)))
        if data.prices is not None:
            upd["prices"] = {str(k): float(v) for k, v in data.prices.items() if v is not None}
        if data.is_active is not None:
            upd["is_active"] = bool(data.is_active)
        if upd:
            await _neighbors().update_one({"id": nid}, {"$set": upd})
        return _neighbor_out(await _neighbors().find_one({"id": nid}))

    @router.delete("/neighbors/{nid}")
    async def delete_neighbor(nid: str, admin: dict = Depends(get_tenant_admin)):
        res = await _neighbors().delete_one({"id": nid})
        if not res.deleted_count:
            raise HTTPException(status_code=404, detail="الجار غير موجود")
        return {"ok": True}

    @router.post("/neighbors/{nid}/settle")
    async def settle_neighbor(nid: str, data: NeighborSettle, admin: dict = Depends(get_tenant_admin)):
        """تسديد (جزء من) دين الجار — كاش من مدير العمال"""
        if data.amount <= 0:
            raise HTTPException(status_code=400, detail="مبلغ غير صالح")
        n = await _neighbors().find_one({"id": nid})
        if not n:
            raise HTTPException(status_code=404, detail="الجار غير موجود")
        await db.neighbor_settlements.insert_one({
            "id": f"stl_{uuid.uuid4().hex[:12]}",
            "neighbor_id": nid,
            "amount": float(data.amount),
            "notes": (data.notes or "").strip(),
            "created_by": admin.get("username") or admin.get("email"),
            "created_at": _now(),
        })
        await _neighbors().update_one({"id": nid}, {"$inc": {"balance": -float(data.amount)}})
        return _neighbor_out(await _neighbors().find_one({"id": nid}))

    @router.get("/neighbors/{nid}/statement")
    async def neighbor_statement(nid: str, days: int = 30, admin: dict = Depends(get_tenant_admin)):
        """الكشف الشهري: طلبات + تسديدات + الرصيد"""
        n = await _neighbors().find_one({"id": nid})
        if not n:
            raise HTTPException(status_code=404, detail="الجار غير موجود")
        since = _now() - timedelta(days=max(1, min(365, days)))
        orders = await _orders().find(
            {"neighbor_id": nid, "created_at": {"$gte": since}, "status": {"$ne": "cancelled"}},
            {"_id": 0, "id": 1, "code": 1, "items": 1, "status": 1, "created_at": 1, "ordered_by": 1},
        ).sort("created_at", -1).to_list(500)
        for o in orders:
            o["total"] = round(sum(
                float(i.get("quantity") or 0) * float(i.get("unit_price") or 0)
                for i in (o.get("items") or [])), 2)
        settlements = await db.neighbor_settlements.find(
            {"neighbor_id": nid, "created_at": {"$gte": since}}, {"_id": 0},
        ).sort("created_at", -1).to_list(500)
        return {
            "neighbor": _neighbor_out(n),
            "days": days,
            "orders": orders,
            "orders_total": round(sum(o["total"] for o in orders), 2),
            "settlements": settlements,
            "settlements_total": round(sum(float(s.get("amount") or 0) for s in settlements), 2),
            "balance": n.get("balance") or 0,
        }

    # ---------- p311: QR table ordering (public — no auth) ----------
    # Security notes: tenant must have the restaurant feature ON; prices and
    # modifier deltas are ALWAYS taken from the DB (client sends ids/names
    # only); one order per 10s per table (in-memory throttle).
    class QrOrderItem(BaseModel):
        product_id: str
        quantity: float = 1
        note: Optional[str] = None
        modifiers: Optional[List[dict]] = None

    class QrOrderCreate(BaseModel):
        items: List[QrOrderItem]
        notes: Optional[str] = None
        customer_phone: Optional[str] = None  # p315
        token: Optional[str] = None  # p323: رابط الطاولة المؤقت — إلزامي فعلياً

    # ---------- p336: إعدادات الطلبات — نمط الدفع ----------
    @router.get("/settings/orders")
    async def get_order_settings(admin: dict = Depends(get_tenant_admin)):
        return {"payment_mode": await _payment_mode()}

    @router.put("/settings/orders")
    async def put_order_settings(data: OrderSettingsIn, admin: dict = Depends(get_tenant_admin)):
        if data.payment_mode not in ("prepaid", "postpaid"):
            raise HTTPException(status_code=400, detail="نمط دفع غير صالح — prepaid أو postpaid")
        await db.restaurant_settings.update_one(
            {"_id": "order_settings"}, {"$set": {"payment_mode": data.payment_mode}}, upsert=True)
        return {"ok": True, "payment_mode": data.payment_mode}

    # ---------- p360: إعدادات الكشك الذاتي داخل المحل ----------
    class KioskSettingsIn(BaseModel):
        enabled: bool
        counter_name: Optional[str] = "كشك"
        require_phone: Optional[bool] = False

    @router.get("/settings/kiosk")
    async def get_kiosk_settings(admin: dict = Depends(get_tenant_admin)):
        doc = await db.restaurant_settings.find_one({"_id": "kiosk_settings"}, {"_id": 0}) or {}
        return {"enabled": bool(doc.get("enabled")),
                "counter_name": doc.get("counter_name") or "كشك",
                "require_phone": bool(doc.get("require_phone"))}

    @router.put("/settings/kiosk")
    async def put_kiosk_settings(data: KioskSettingsIn, admin: dict = Depends(get_tenant_admin)):
        payload = {"enabled": bool(data.enabled),
                   "counter_name": ((data.counter_name or "").strip()[:30] or "كشك"),
                   "require_phone": bool(data.require_phone)}
        await db.restaurant_settings.update_one({"_id": "kiosk_settings"}, {"$set": payload}, upsert=True)
        return {"ok": True, **payload}

    # ---------- p334: روابط التواصل الاجتماعي (إعدادات المطعم) ----------
    SOCIAL_KEYS = ("instagram", "facebook", "tiktok", "google_maps", "whatsapp", "website")

    def _social_out(doc):
        doc = doc or {}
        return {k: (doc.get(k) or "") for k in SOCIAL_KEYS}

    @router.get("/settings/social")
    async def get_social_links(admin: dict = Depends(get_tenant_admin)):
        doc = await db.restaurant_settings.find_one({"_id": "social_links"}, {"_id": 0})
        return _social_out(doc)

    @router.put("/settings/social")
    async def put_social_links(data: SocialLinksIn, admin: dict = Depends(get_tenant_admin)):
        clean = {}
        for k in SOCIAL_KEYS:
            v = (getattr(data, k) or "").strip()
            if v and not v.startswith(("http://", "https://")):
                raise HTTPException(status_code=400, detail=f"رابط غير صالح: {k} — يجب أن يبدأ بـ https://")
            clean[k] = v
        await db.restaurant_settings.update_one({"_id": "social_links"}, {"$set": clean}, upsert=True)
        return {"ok": True, **_social_out(clean)}

    async def _qr_tenant(tenant_id: str):
        from config.database import main_db as _mdb
        t = await _mdb.saas_tenants.find_one(
            {"id": tenant_id},
            {"_id": 0, "name": 1, "company_name": 1, "features_override": 1, "is_active": 1},
        )
        if not t or t.get("is_active") is False:
            raise HTTPException(status_code=404, detail="غير موجود")
        if not (t.get("features_override") or {}).get("restaurant"):
            raise HTTPException(status_code=404, detail="غير موجود")
        return t

    @router.get("/public/menu/{tenant_id}")
    async def qr_public_menu(tenant_id: str):
        from config.database import get_tenant_db
        t = await _qr_tenant(tenant_id)
        tdb = get_tenant_db(tenant_id)
        fams = {f["id"]: (f.get("name_ar") or f.get("name") or "") for f in await tdb.families.find({}, {"_id": 0, "id": 1, "name": 1, "name_ar": 1}).to_list(500)}
        prods = await tdb.products.find(
            {"retail_price": {"$gt": 0}, "is_active": {"$ne": False}},
            {"_id": 0, "id": 1, "name": 1, "name_ar": 1, "name_en": 1, "retail_price": 1, "family_id": 1, "modifier_groups": 1, "image_url": 1},
        ).to_list(1000)
        items = [{
            "id": p["id"],
            "name": p.get("name_ar") or p.get("name") or p.get("name_en"),
            "price": p.get("retail_price") or 0,
            "family": fams.get(p.get("family_id")) or "",
            "modifier_groups": p.get("modifier_groups") or [],
            "image_url": p.get("image_url"),
        } for p in prods]
        return {"restaurant_name": t.get("company_name") or t.get("name") or "", "items": items}

    @router.get("/public/table-session/{tenant_id}/{table_id}")
    async def qr_table_session(tenant_id: str, table_id: str):
        """p325: رمز QR المطبوع على الطاولة دائم — كل مسح يسترجع (أو ينشئ كسلًا) رابط الطلب المؤقت الحالي.
        الرابط المؤقت نفسه (qr_token) يدور عند تحرير الطاولة/الدفع كما في p323."""
        from config.database import get_tenant_db
        await _qr_tenant(tenant_id)
        tdb = get_tenant_db(tenant_id)
        table = await tdb.restaurant_tables.find_one({"id": table_id})
        if not table:
            raise HTTPException(status_code=404, detail="رمز الطاولة غير صالح")
        tok = table.get("qr_token")
        if not tok:  # طاولات قديمة بلا رمز — إنشاء كسول
            tok = secrets.token_hex(5)
            await tdb.restaurant_tables.update_one({"id": table_id}, {"$set": {"qr_token": tok}})
        return {"token": tok, "table_name": table.get("name") or ""}

    @router.get("/public/table-menu/{tenant_id}/{table_id}/{token}")
    async def qr_table_menu(tenant_id: str, table_id: str, token: str):
        """p323: قائمة الطاولة برابط مؤقت — 410 إن دُوّر الرابط (انتهت الزيارة) أو زُوّر"""
        from config.database import get_tenant_db
        t = await _qr_tenant(tenant_id)
        tdb = get_tenant_db(tenant_id)
        table = await tdb.restaurant_tables.find_one({"id": table_id})
        if not table:
            raise HTTPException(status_code=404, detail="الطاولة غير موجودة")
        if not table.get("qr_token") or table["qr_token"] != token:
            raise HTTPException(status_code=410, detail="انتهت صلاحية رابط هذه الطاولة — اطلب من النادل الرمز الحالي")
        fams = {f["id"]: (f.get("name_ar") or f.get("name") or "") for f in await tdb.families.find({}, {"_id": 0, "id": 1, "name": 1, "name_ar": 1}).to_list(500)}
        prods = await tdb.products.find(
            {"retail_price": {"$gt": 0}, "is_active": {"$ne": False}},
            {"_id": 0, "id": 1, "name": 1, "name_ar": 1, "name_en": 1, "retail_price": 1, "family_id": 1, "modifier_groups": 1, "image_url": 1},
        ).to_list(1000)
        items = [{
            "id": p["id"],
            "name": p.get("name_ar") or p.get("name") or p.get("name_en"),
            "price": p.get("retail_price") or 0,
            "family": fams.get(p.get("family_id")) or "",
            "modifier_groups": p.get("modifier_groups") or [],
            "image_url": p.get("image_url"),
        } for p in prods]
        _soc = await tdb.restaurant_settings.find_one({"_id": "social_links"}, {"_id": 0}) or {}
        _soc = {k: v for k, v in _soc.items() if isinstance(v, str) and v}
        return {
            "restaurant_name": t.get("company_name") or t.get("name") or "",
            "table_name": table.get("name"),
            "items": items,
            "social": _soc,  # p334
        }

    @router.post("/public/order/{tenant_id}/{table_id}")
    async def qr_public_order(tenant_id: str, table_id: str, data: QrOrderCreate):
        import time as _time
        from config.database import get_tenant_db
        await _qr_tenant(tenant_id)
        if not data.items or len(data.items) > 20:
            raise HTTPException(status_code=400, detail="طلب غير صالح")
        now_ts = _time.time()
        tdb = get_tenant_db(tenant_id)
        # DB-backed throttle (works across the 4 uvicorn workers, unlike RAM)
        _last = await tdb["_qr_throttle"].find_one({"_id": table_id})
        if _last and now_ts - float(_last.get("last") or 0) < 10:
            raise HTTPException(status_code=429, detail="انتظر قليلاً قبل إرسال طلب آخر")
        await tdb["_qr_throttle"].update_one({"_id": table_id}, {"$set": {"last": now_ts}}, upsert=True)
        table = await tdb.restaurant_tables.find_one({"id": table_id})
        if not table:
            raise HTTPException(status_code=404, detail="الطاولة غير موجودة")
        # p323: الرابط المؤقت — طلب بلا توكن أو بتوكن مُدوَّر يُرفض
        if not table.get("qr_token") or table["qr_token"] != (data.token or ""):
            raise HTTPException(status_code=410, detail="انتهت صلاحية رابط هذه الطاولة — اطلب من النادل الرمز الحالي")
        items = []
        for it in data.items:
            if not (0 < float(it.quantity or 0) <= 20):
                raise HTTPException(status_code=400, detail="كمية غير صالحة")
            p = await tdb.products.find_one(
                {"id": it.product_id},
                {"_id": 0, "id": 1, "name": 1, "name_ar": 1, "name_en": 1, "retail_price": 1, "modifier_groups": 1},
            )
            if not p:
                raise HTTPException(status_code=400, detail="منتج غير موجود")
            mods = []
            extra = 0.0
            groups = p.get("modifier_groups") or []
            for m in (it.modifiers or []):
                hit = None
                for g in groups:
                    for opt in (g.get("options") or []):
                        if opt.get("name") == (m.get("option") or ""):
                            hit = (g, opt)
                            break
                    if hit:
                        break
                if not hit:
                    raise HTTPException(status_code=400, detail="خيار غير صالح")
                g, opt = hit
                delta = float(opt.get("price_delta") or 0)
                mods.append({"group": g.get("name"), "option": opt.get("name"),
                             "price_delta": delta, "product_id": opt.get("product_id"),
                             "qty": opt.get("qty") or 1})
                extra += delta
            items.append({
                "product_id": p["id"],
                "product_name": p.get("name_ar") or p.get("name") or p.get("name_en"),
                "quantity": float(it.quantity),
                "unit_price": (p.get("retail_price") or 0) + extra,
                "note": it.note,
                "modifiers": mods or None,
            })
        pseudo = {"tenant_id": tenant_id, "email": "qr@table", "username": "QR"}
        _mode = await _payment_mode(tdb)  # p336
        active_id = table.get("active_order_id")
        if active_id:
            existing = await tdb.kitchen_orders.find_one(
                {"id": active_id, "status": {"$in": ["pending", "preparing", "pending_payment"]}})  # p336
            if existing:
                _set = {"updated_at": _now()}
                if existing.get("status") != "pending_payment":
                    _set["status"] = "pending"
                if _mode == "prepaid":
                    _set["payment_status"] = "unpaid"
                await tdb.kitchen_orders.update_one(
                    {"id": active_id},
                    {"$push": {"items": {"$each": items}}, "$set": _set},
                )
                updated = await tdb.kitchen_orders.find_one({"id": active_id})
                await _publish("kitchen_order.updated", updated, pseudo)
                _out = _order_out(updated)
                _out["payment_mode"] = _mode  # p336
                return _out
        day = _now().strftime("%Y%m%d")
        count = await tdb.kitchen_orders.count_documents({"code": {"$regex": f"^KCH-{day}-"}})
        doc = {
            "id": f"kch_{uuid.uuid4().hex[:12]}",
            "code": f"KCH-{day}-{count + 1:04d}",
            "table_id": table["id"],
            "table_name": table.get("name"),
            "items": items,
            "notes": data.notes,
            "customer_phone": _clean_phone(data.customer_phone),  # p315
            "status": "pending_payment" if _mode == "prepaid" else "pending",  # p336
            "payment_status": "unpaid" if _mode == "prepaid" else None,        # p336
            "sale_id": None,
            "source": "qr",
            "created_by": "QR",
            "created_at": _now(),
            "updated_at": _now(),
        }
        await tdb.kitchen_orders.insert_one(doc)
        await tdb.restaurant_tables.update_one(
            {"id": table["id"]},
            {"$set": {"status": "occupied", "active_order_id": doc["id"]}},
        )
        await _publish("kitchen_order.created", doc, pseudo)
        _out = _order_out(doc)
        _out["payment_mode"] = _mode  # p336
        return _out

    # ---------- p360: الكشك الذاتي داخل المحل (عمومي — بلا حساب، يُفعَّل من الإعدادات) ----------
    async def _kiosk_ctx(tenant_id: str):
        from config.database import get_tenant_db
        t = await _qr_tenant(tenant_id)
        tdb = get_tenant_db(tenant_id)
        ks = await tdb.restaurant_settings.find_one({"_id": "kiosk_settings"}, {"_id": 0}) or {}
        if not ks.get("enabled"):
            raise HTTPException(status_code=404, detail="غير موجود")
        return t, tdb, ks

    class KioskOrderCreate(BaseModel):
        items: List[QrOrderItem]
        notes: Optional[str] = None
        customer_name: Optional[str] = None
        customer_phone: Optional[str] = None

    @router.get("/public/kiosk/{tenant_id}")
    async def public_kiosk_menu(tenant_id: str):
        t, tdb, ks = await _kiosk_ctx(tenant_id)
        fams = {f["id"]: (f.get("name_ar") or f.get("name") or "") for f in await tdb.families.find({}, {"_id": 0, "id": 1, "name": 1, "name_ar": 1}).to_list(500)}
        prods = await tdb.products.find(
            {"retail_price": {"$gt": 0}, "is_active": {"$ne": False}},
            {"_id": 0, "id": 1, "name": 1, "name_ar": 1, "name_en": 1, "retail_price": 1, "family_id": 1, "modifier_groups": 1, "image_url": 1},
        ).to_list(1000)
        items = [{
            "id": p["id"],
            "name": p.get("name_ar") or p.get("name") or p.get("name_en"),
            "price": p.get("retail_price") or 0,
            "family": fams.get(p.get("family_id")) or "",
            "modifier_groups": p.get("modifier_groups") or [],
            "image_url": p.get("image_url"),
        } for p in prods]
        return {"restaurant_name": t.get("company_name") or t.get("name") or "",
                "counter_name": ks.get("counter_name") or "كشك",
                "require_phone": bool(ks.get("require_phone")),
                "payment_mode": await _payment_mode(tdb),
                "items": items}

    @router.post("/public/kiosk/{tenant_id}/order")
    async def public_kiosk_order(tenant_id: str, data: KioskOrderCreate):
        import time as _time
        t, tdb, ks = await _kiosk_ctx(tenant_id)
        if not data.items or len(data.items) > 20:
            raise HTTPException(status_code=400, detail="طلب غير صالح")
        phone = _clean_phone(data.customer_phone)
        if ks.get("require_phone") and not phone:
            raise HTTPException(status_code=400, detail="رقم الهاتف مطلوب للطلب من الكشك")
        now_ts = _time.time()
        # نفس درع QR: طلب واحد كل 10 ثوانٍ (DB — يعمل عبر عمال uvicorn الأربعة)
        _last = await tdb["_qr_throttle"].find_one({"_id": "kiosk"})
        if _last and now_ts - float(_last.get("last") or 0) < 10:
            raise HTTPException(status_code=429, detail="انتظر قليلاً قبل إرسال طلب آخر")
        await tdb["_qr_throttle"].update_one({"_id": "kiosk"}, {"$set": {"last": now_ts}}, upsert=True)
        items = []
        for it in data.items:
            if not (0 < float(it.quantity or 0) <= 20):
                raise HTTPException(status_code=400, detail="كمية غير صالحة")
            p = await tdb.products.find_one(
                {"id": it.product_id},
                {"_id": 0, "id": 1, "name": 1, "name_ar": 1, "name_en": 1, "retail_price": 1, "modifier_groups": 1},
            )
            if not p:
                raise HTTPException(status_code=400, detail="منتج غير موجود")
            mods = []
            extra = 0.0
            groups = p.get("modifier_groups") or []
            for m in (it.modifiers or []):
                hit = None
                for g in groups:
                    for opt in (g.get("options") or []):
                        if opt.get("name") == (m.get("option") or ""):
                            hit = (g, opt)
                            break
                    if hit:
                        break
                if not hit:
                    raise HTTPException(status_code=400, detail="خيار غير صالح")
                g, opt = hit
                delta = float(opt.get("price_delta") or 0)
                mods.append({"group": g.get("name"), "option": opt.get("name"),
                             "price_delta": delta, "product_id": opt.get("product_id"),
                             "qty": opt.get("qty") or 1})
                extra += delta
            items.append({
                "product_id": p["id"],
                "product_name": p.get("name_ar") or p.get("name") or p.get("name_en"),
                "quantity": float(it.quantity),
                "unit_price": (p.get("retail_price") or 0) + extra,
                "note": it.note,
                "modifiers": mods or None,
            })
        pseudo = {"tenant_id": tenant_id, "email": "kiosk@counter", "username": "KIOSK"}
        _mode = await _payment_mode(tdb)  # p336
        day = _now().strftime("%Y%m%d")
        count = await tdb.kitchen_orders.count_documents({"code": {"$regex": f"^KCH-{day}-"}})
        doc = {
            "id": f"kch_{uuid.uuid4().hex[:12]}",
            "code": f"KCH-{day}-{count + 1:04d}",
            "table_id": None,  # كشك — بلا طاولة
            "table_name": ks.get("counter_name") or "كشك",
            "items": items,
            "notes": data.notes,
            "customer_name": (data.customer_name or "").strip()[:60] or None,
            "customer_phone": phone,
            "status": "pending_payment" if _mode == "prepaid" else "pending",  # p336
            "payment_status": "unpaid" if _mode == "prepaid" else None,        # p336
            "sale_id": None,
            "source": "kiosk",
            "created_by": "KIOSK",
            "created_at": _now(),
            "updated_at": _now(),
        }
        await tdb.kitchen_orders.insert_one(doc)
        await _publish("kitchen_order.created", doc, pseudo)
        out = _order_out(doc)
        out["payment_mode"] = _mode  # p336
        return out

    # ---------- p335: واجهة الجار العمومية (بلا حساب — برابط/QR خاص دائم) ----------
    async def _qr_neighbor(tenant_id: str, token: str):
        from config.database import get_tenant_db
        t = await _qr_tenant(tenant_id)
        tdb = get_tenant_db(tenant_id)
        n = await tdb.neighbor_accounts.find_one({"token": token})
        if not n or n.get("is_active") is False:
            raise HTTPException(status_code=404, detail="رابط غير صالح أو موقوف")
        return t, tdb, n

    @router.get("/public/neighbor-menu/{tenant_id}/{token}")
    async def public_neighbor_menu(tenant_id: str, token: str):
        """قائمة الجار بأسعاره الخاصة"""
        t, tdb, n = await _qr_neighbor(tenant_id, token)
        fams = {f["id"]: (f.get("name_ar") or f.get("name") or "") for f in await tdb.families.find({}, {"_id": 0, "id": 1, "name": 1, "name_ar": 1}).to_list(500)}
        prods = await tdb.products.find(
            {"retail_price": {"$gt": 0}, "is_active": {"$ne": False}},
            {"_id": 0, "id": 1, "name": 1, "name_ar": 1, "name_en": 1, "retail_price": 1, "family_id": 1, "image_url": 1},
        ).to_list(1000)
        items = []
        for p in prods:
            base = float(p.get("retail_price") or 0)
            price = _nbr_price(n, p["id"], base)
            items.append({
                "id": p["id"],
                "name": p.get("name_ar") or p.get("name") or p.get("name_en"),
                "price": price,
                "base_price": base if price != base else None,
                "family": fams.get(p.get("family_id")) or "",
                "image_url": p.get("image_url"),
            })
        return {
            "restaurant_name": t.get("company_name") or t.get("name") or "",
            "neighbor_name": n.get("name"),
            "payment": n.get("payment") or "debt",
            "items": items,
        }

    @router.post("/public/neighbor-order/{tenant_id}/{token}")
    async def public_neighbor_order(tenant_id: str, token: str, data: NeighborOrderCreate):
        """طلب الجار — يدخل المطبخ مباشرة بوسم «جار»؛ الدين يتراكم في رصيده"""
        import time as _time
        t, tdb, n = await _qr_neighbor(tenant_id, token)
        if not data.items or len(data.items) > 30:
            raise HTTPException(status_code=400, detail="طلب غير صالح")
        # خانق معدل لكل جار
        now_ts = _time.time()
        _last = await tdb["_nbr_throttle"].find_one({"_id": n["id"]})
        if _last and now_ts - float(_last.get("last") or 0) < 10:
            raise HTTPException(status_code=429, detail="انتظر قليلاً قبل إرسال طلب آخر")
        await tdb["_nbr_throttle"].update_one({"_id": n["id"]}, {"$set": {"last": now_ts}}, upsert=True)
        items = []
        total = 0.0
        for it in data.items:
            if not (0 < float(it.quantity or 0) <= 50):
                raise HTTPException(status_code=400, detail="كمية غير صالحة")
            p = await tdb.products.find_one(
                {"id": it.product_id},
                {"_id": 0, "id": 1, "name": 1, "name_ar": 1, "name_en": 1, "retail_price": 1},
            )
            if not p:
                raise HTTPException(status_code=400, detail="منتج غير موجود")
            price = _nbr_price(n, p["id"], float(p.get("retail_price") or 0))
            total += price * float(it.quantity)
            items.append({
                "product_id": p["id"],
                "product_name": p.get("name_ar") or p.get("name") or p.get("name_en"),
                "quantity": float(it.quantity),
                "unit_price": price,
                "note": it.note,
            })
        day = _now().strftime("%Y%m%d")
        count = await tdb.kitchen_orders.count_documents({"code": {"$regex": f"^KCH-{day}-"}})
        doc = {
            "id": f"kch_{uuid.uuid4().hex[:12]}",
            "code": f"KCH-{day}-{count + 1:04d}",
            "table_id": None,
            "table_name": n.get("name"),  # يظهر اسم الجار في شاشة المطبخ
            "items": items,
            "notes": data.notes,
            "status": "pending",
            "payment_status": "debt" if n.get("payment") == "debt" else "unpaid",
            "sale_id": None,
            "source": "neighbor",  # p335+p338
            "neighbor_id": n["id"],
            "ordered_by": (data.ordered_by or "").strip() or None,
            "created_by": f"جار: {n.get('name')}",
            "created_at": _now(),
            "updated_at": _now(),
        }
        await tdb.kitchen_orders.insert_one(doc)
        if n.get("payment") == "debt":
            await tdb.neighbor_accounts.update_one({"id": n["id"]}, {"$inc": {"balance": round(total, 2)}})
        pseudo = {"tenant_id": tenant_id, "email": "neighbor@b2b", "username": "NEIGHBOR"}
        await _publish("kitchen_order.created", doc, pseudo)
        out = _order_out(doc)
        out["payment"] = n.get("payment") or "debt"
        return out

    @router.get("/public/board/{tenant_id}")
    async def public_order_board(tenant_id: str):
        """p314: لوحة أرقام الطلبات للعرض العام (تلفاز المحل) — أكواد وحالات فقط،
        بلا أسعار ولا أسماء. طلبات اليوم غير الملغاة."""
        from config.database import get_tenant_db
        await _qr_tenant(tenant_id)
        tdb = get_tenant_db(tenant_id)
        day = _now().strftime("%Y%m%d")
        orders = await tdb.kitchen_orders.find(
            {"code": {"$regex": f"^KCH-{day}-"}, "status": {"$ne": "cancelled"}},
            {"_id": 0, "code": 1, "status": 1, "updated_at": 1},
        ).to_list(300)
        board = {"pending": [], "preparing": [], "served": []}
        for o in orders:
            st = o.get("status")
            if st in board:
                board[st].append(o.get("code"))
        return {"day": day, "board": board}

    @router.get("/public/menu-board/{tenant_id}")
    async def public_menu_board(tenant_id: str):
        """p320: شاشة تلفاز المنتجات — قائمة عمومية بتوفر حي مربوط بالمخزون:
        طبق له وصفة → متاح إن كانت مكوّناته تكفي لدفعة واحدة على الأقل (والباقي = عدد الدفعات)
        منتج غير مخزوني بلا وصفة → متاح دائماً
        منتج مخزوني بلا وصفة → متاح إن كانت الكمية > 0 (والباقي = الكمية)
        أسماء/أسعار/توفر فقط — بلا تكاليف ولا بيانات حساسة."""
        from config.database import get_tenant_db
        t = await _qr_tenant(tenant_id)
        tdb = get_tenant_db(tenant_id)
        fams = {
            f["id"]: (f.get("name_ar") or f.get("name") or "")
            for f in await tdb.families.find({}, {"_id": 0, "id": 1, "name": 1, "name_ar": 1}).to_list(500)
        }
        prods = await tdb.products.find(
            {"retail_price": {"$gt": 0}, "is_active": {"$ne": False}, "is_blocked": {"$ne": True}},
            {"_id": 0, "id": 1, "name": 1, "name_ar": 1, "name_en": 1, "retail_price": 1,
             "family_id": 1, "image_url": 1, "images": 1, "is_non_stockable": 1, "quantity": 1},
        ).to_list(1000)
        recipes = {
            r["product_id"]: r
            for r in await tdb.recipes.find(
                {}, {"_id": 0, "product_id": 1, "components": 1, "output_qty": 1}
            ).to_list(500)
        }
        comp_ids = {
            c["product_id"]
            for r in recipes.values()
            for c in (r.get("components") or [])
        }
        stock = {}
        if comp_ids:
            async for cp in tdb.products.find(
                {"id": {"$in": list(comp_ids)}}, {"_id": 0, "id": 1, "quantity": 1}
            ):
                stock[cp["id"]] = float(cp.get("quantity") or 0)
        items = []
        for p in prods:
            r = recipes.get(p["id"])
            if r:
                batches = None
                for c in (r.get("components") or []):
                    q = float(c.get("quantity") or 0)
                    if q <= 0:
                        continue
                    b = int(stock.get(c["product_id"], 0) // q)
                    batches = b if batches is None else min(batches, b)
                if batches is None:
                    batches = 0
                per_batch = float(r.get("output_qty") or 1)
                available = batches >= 1
                remaining = int(batches * per_batch)
            elif p.get("is_non_stockable"):
                available, remaining = True, None
            else:
                qty = int(p.get("quantity") or 0)
                available, remaining = qty > 0, qty
            items.append({
                "id": p["id"],
                "name": p.get("name_ar") or p.get("name") or p.get("name_en"),
                "price": p.get("retail_price") or 0,
                "family": fams.get(p.get("family_id")) or "",
                "image_url": p.get("image_url") or "",
                "images": [i for i in (p.get("images") or []) if i][:5],  # p321: معرض الصور لشرائح التلفاز
                "available": available,
                "remaining": remaining,
            })
        items.sort(key=lambda x: (x["family"], x["name"] or ""))
        return {
            "restaurant_name": t.get("company_name") or t.get("name") or "",
            "items": items,
            "generated_at": _now().isoformat(),
        }

    return {"router": router}
