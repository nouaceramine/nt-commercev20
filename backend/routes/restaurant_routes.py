# p186: Restaurant mode — tables + kitchen orders (POS adaptation, not a new module)
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid


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
        return [_table_out(t) async for t in cursor]

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
            await _tables().update_one({"id": o["table_id"]}, {"$set": {"status": "free", "active_order_id": None}})
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
        await _tables().update_one({"id": table_id}, {"$set": {"status": "free", "active_order_id": None}})
        return {"ok": True}

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

    return {"router": router}
