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


class KitchenOrderCreate(BaseModel):
    table_id: Optional[str] = None
    items: List[KitchenItem]
    notes: Optional[str] = None


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

    return {"router": router}
