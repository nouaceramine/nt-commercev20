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
        return o

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
    async def list_kitchen_orders(status: Optional[str] = None, user: dict = Depends(get_current_user)):
        q = {}
        if status:
            q["status"] = status
        cursor = _orders().find(q).sort("created_at", -1).limit(200)
        return [_order_out(o) async for o in cursor]

    @router.post("/kitchen-orders")
    async def create_kitchen_order(data: KitchenOrderCreate, user: dict = Depends(get_current_user)):
        if not data.items:
            raise HTTPException(status_code=400, detail="لا توجد عناصر في الطلب")
        items = [it.model_dump() for it in data.items]
        table = None
        if data.table_id:
            table = await _tables().find_one({"id": data.table_id})
            if not table:
                raise HTTPException(status_code=404, detail="الطاولة غير موجودة")
            # If the table already has an active order, append items to it
            active_id = table.get("active_order_id")
            if active_id:
                existing = await _orders().find_one({"id": active_id, "status": {"$in": ["pending", "preparing"]}})
                if existing:
                    await _orders().update_one(
                        {"id": active_id},
                        {"$push": {"items": {"$each": items}}, "$set": {"updated_at": _now(), "status": "pending"}},
                    )
                    updated = await _orders().find_one({"id": active_id})
                    await _publish("kitchen_order.updated", updated, user)
                    return _order_out(updated)
        doc = {
            "id": f"kch_{uuid.uuid4().hex[:12]}",
            "code": await _order_code(),
            "table_id": table["id"] if table else None,
            "table_name": table.get("name") if table else None,
            "items": items,
            "notes": data.notes,
            "customer_phone": _clean_phone(data.customer_phone),  # p315
            "status": "pending",
            "sale_id": None,
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
                {"$set": {"status": "served", "sale_id": data.sale_id, "updated_at": _now()}},
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
                {"$set": {"status": "served", "sale_id": data.sale_id, "updated_at": _now()}},
            )
        updated = await _delivery().find_one({"id": order_id})
        await _publish("delivery_order.updated", updated, user)
        return _delivery_out(updated)

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
        return {
            "restaurant_name": t.get("company_name") or t.get("name") or "",
            "table_name": table.get("name"),
            "items": items,
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
        active_id = table.get("active_order_id")
        if active_id:
            existing = await tdb.kitchen_orders.find_one(
                {"id": active_id, "status": {"$in": ["pending", "preparing"]}})
            if existing:
                await tdb.kitchen_orders.update_one(
                    {"id": active_id},
                    {"$push": {"items": {"$each": items}}, "$set": {"updated_at": _now(), "status": "pending"}},
                )
                updated = await tdb.kitchen_orders.find_one({"id": active_id})
                await _publish("kitchen_order.updated", updated, pseudo)
                return _order_out(updated)
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
            "status": "pending",
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
        return _order_out(doc)

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
