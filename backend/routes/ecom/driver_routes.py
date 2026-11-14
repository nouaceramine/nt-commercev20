"""Driver mobile web interface (p247).

Competitor parity (MDM Express / Vozare driver apps): the tenant creates
drivers, assigns shipped orders to them, and hands each driver a token link.
The driver opens /driver/{token} on any phone — no account, no password —
sees today's runs with customer details + COD amount, scans the parcel QR
(or types the code) and marks it delivered / failed.

Tenant side (require_tenant):
  POST   /api/ecom/drivers                 — create driver (token issued)
  GET    /api/ecom/drivers                 — list + workload
  PUT    /api/ecom/drivers/{id}            — rename / toggle active / rotate token
  DELETE /api/ecom/drivers/{id}            — only with no open runs
  PUT    /api/ecom/orders/{id}/driver      — assign / unassign (driver_id null)

Driver side (token in path, no account):
  GET  /api/driver/{token}/orders                      — open runs + today stats
  POST /api/driver/{token}/scan {code}                 — find assigned parcel
  POST /api/driver/{token}/orders/{order_id}/result    — {outcome: delivered|failed, note?}

Delivered goes through the REAL state machine (change_order_status) so cash
collection, SMS, reputation, referral rewards and marketplace settlement all
fire exactly as if the office marked it. Failed never changes status — it
logs an attempt with the driver's note.
"""
from datetime import datetime, timezone
from typing import Optional
import logging
import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pymongo.errors import PyMongoError

from config.database import db, main_db, get_tenant_db
from utils.auth import require_tenant
from routes.ecom.constants import require_ecom_feature

logger = logging.getLogger(__name__)

OPEN_STATUSES = ("packed", "shipped", "out_for_delivery")
# p520: أُزيل سقف المسح MAX_TENANTS_SCAN=50 — راجع _find_driver

_tok_idx_ready = False  # p520: فهرس خريطة توكن السائق يُنشأ كسولًا مرة واحدة


async def _ensure_token_index():
    """p520: فهرس فريد على driver_token_map.token — حلّ التوكن O(1) بدل مسح
    قواعد المستأجرين (سقف MAX_TENANTS_SCAN كان يُسقط روابط السائقين 404 بعد
    خمسين مستأجرًا نشطًا). كسول ومتماثل — لا يُسقط الطلب عند فشله."""
    global _tok_idx_ready
    if _tok_idx_ready:
        return
    try:
        await main_db.driver_token_map.create_index(
            "token", unique=True, name="p520_driver_token")
    except PyMongoError as exc:
        logger.warning("driver token map index: %s", exc)
    _tok_idx_ready = True


async def _map_token(token: str, tenant_id: str, driver_id: str) -> None:
    """p520: upsert token→tenant mapping (called on create/rotate/backfill)."""
    try:
        await _ensure_token_index()
        await main_db.driver_token_map.update_one(
            {"token": token},
            {"$set": {"token": token, "tenant_id": tenant_id, "driver_id": driver_id,
                      "updated_at": _now()}},
            upsert=True)
    except PyMongoError as exc:  # الخريطة تسريع فقط؛ المسح الاحتياطي يكفي
        logger.warning("driver token map upsert: %s", exc)


async def _unmap_token(token: str = "", driver_id: str = "") -> None:
    """p520: drop mapping on token rotate / driver deactivate / delete."""
    try:
        flt = {"token": token} if token else {"driver_id": driver_id}
        await main_db.driver_token_map.delete_many(flt)
    except PyMongoError as exc:
        logger.warning("driver token map delete: %s", exc)


class DriverIn(BaseModel):
    name: str
    phone: Optional[str] = ""


class DriverUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    active: Optional[bool] = None
    rotate_token: Optional[bool] = None


class AssignIn(BaseModel):
    driver_id: Optional[str] = None


class ScanIn(BaseModel):
    code: str


class ResultIn(BaseModel):
    outcome: str  # delivered | failed
    note: Optional[str] = ""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_token() -> str:
    return "DRV-" + secrets.token_hex(12)


def _brief(o: dict) -> dict:
    c = o.get("customer") or {}
    return {
        "id": o.get("id"),
        "order_code": o.get("order_code"),
        "status": o.get("status"),
        "customer_name": c.get("name"),
        "customer_phone": c.get("phone"),
        "address": c.get("address"),
        "city": c.get("city"),
        "wilaya": c.get("wilaya"),
        "total": o.get("total"),
        "payment_status": o.get("payment_status"),
        "items_count": sum(int(i.get("qty", 1)) for i in (o.get("items") or [])),
        "notes": o.get("notes"),
        "tracking_number": o.get("tracking_number"),
        "delivery_attempts": o.get("delivery_attempts", 0),
    }


async def _find_driver(token: str):
    """-> (tenant, driver). p520: جرّب خريطة token→tenant المفهرسة أولًا (O(1)،
    بلا سقف لعدد المستأجرين)؛ عند الغياب اسقط لمسح كامل غير محدود (للتوكنات
    السابقة لـp520 — سقف MAX_TENANTS_SCAN=50 كان يُسقط روابط السائقين 404 بعد
    خمسين مستأجرًا نشطًا) مع ملء الخريطة عند النجاح. التوكن سرّي فترتيب المسح
    لا يهم. المستأجرون الاختباريون مستثنون من المسح."""
    try:
        m = await main_db.driver_token_map.find_one(
            {"token": token}, {"_id": 0, "tenant_id": 1})
    except PyMongoError:
        m = None
    if m:
        try:
            d = await get_tenant_db(m["tenant_id"]).ecom_drivers.find_one(
                {"token": token, "active": {"$ne": False}}, {"_id": 0})
        except Exception:  # noqa: BLE001
            d = None
        if d:
            t = await main_db.saas_tenants.find_one(
                {"id": m["tenant_id"], "is_active": {"$ne": False}},
                {"_id": 0, "id": 1, "name": 1})
            if t:
                return t, d
        # خريطة قديمة (سائق حُذف/عُطّل/دوّر توكنه) — نظّفها واسقط للمسح
        await _unmap_token(token=token)
    # p520: مسح كامل بلا سقف — مسار احتياطي للتوكنات القديمة فقط، يُملأ
    # منه map فلا يتكرر لنفس التوكن
    cursor = main_db.saas_tenants.find(
        {"is_active": {"$ne": False}, "is_permanent_test": {"$ne": True}},
        {"_id": 0, "id": 1, "name": 1})
    async for t in cursor:
        try:
            d = await get_tenant_db(t["id"]).ecom_drivers.find_one(
                {"token": token, "active": {"$ne": False}}, {"_id": 0})
        except Exception:  # noqa: BLE001
            continue
        if d:
            await _map_token(token, t["id"], d["id"])  # p520: backfill
            return t, d
    return None, None


def create_driver_routes() -> dict:
    tenant_router = APIRouter(tags=["ecom-drivers"])
    public = APIRouter(tags=["driver-public"])

    # ── tenant side ──────────────────────────────────────────────────
    @tenant_router.post("/ecom/drivers")
    async def create_driver(body: DriverIn, user: dict = Depends(require_tenant)):
        await require_ecom_feature(user)
        name = (body.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="اسم السائق مطلوب")
        now = _now()
        doc = {
            "id": str(uuid.uuid4()),
            "name": name,
            "phone": (body.phone or "").strip(),
            "token": _new_token(),
            "active": True,
            "created_by": user.get("id"),
            "created_at": now,
            "updated_at": now,
        }
        await db.ecom_drivers.insert_one(doc)
        if user.get("tenant_id"):
            await _map_token(doc["token"], user["tenant_id"], doc["id"])  # p520
        doc.pop("_id", None)
        return {"ok": True, "driver": doc}

    @tenant_router.get("/ecom/drivers")
    async def list_drivers(user: dict = Depends(require_tenant)):
        await require_ecom_feature(user)
        rows = await db.ecom_drivers.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
        for d in rows:
            d["open_runs"] = await db.ecom_orders.count_documents(
                {"driver_id": d["id"], "status": {"$in": list(OPEN_STATUSES)}})
            d["delivered_total"] = await db.ecom_orders.count_documents(
                {"driver_id": d["id"], "status": "delivered"})
        return {"items": rows}

    @tenant_router.put("/ecom/drivers/{driver_id}")
    async def update_driver(driver_id: str, body: DriverUpdate, user: dict = Depends(require_tenant)):
        await require_ecom_feature(user)
        d = await db.ecom_drivers.find_one({"id": driver_id})
        if not d:
            raise HTTPException(status_code=404, detail="السائق غير موجود")
        updates = {"updated_at": _now()}
        if body.name is not None:
            if not body.name.strip():
                raise HTTPException(status_code=400, detail="الاسم فارغ")
            updates["name"] = body.name.strip()
        if body.phone is not None:
            updates["phone"] = body.phone.strip()
        if body.active is not None:
            updates["active"] = bool(body.active)
        if body.rotate_token:
            updates["token"] = _new_token()
        await db.ecom_drivers.update_one({"id": driver_id}, {"$set": updates})
        # p520: حافظ على خريطة التوكن — القديم يموت عند التدوير/التعطيل
        if body.rotate_token:
            await _unmap_token(token=d.get("token", ""))
            if user.get("tenant_id") and updates.get("active", d.get("active")) is not False:
                await _map_token(updates["token"], user["tenant_id"], driver_id)
        elif updates.get("active") is False:
            await _unmap_token(token=d.get("token", ""))
        out = await db.ecom_drivers.find_one({"id": driver_id}, {"_id": 0})
        return {"ok": True, "driver": out}

    @tenant_router.delete("/ecom/drivers/{driver_id}")
    async def delete_driver(driver_id: str, user: dict = Depends(require_tenant)):
        await require_ecom_feature(user)
        if await db.ecom_orders.count_documents(
                {"driver_id": driver_id, "status": {"$in": list(OPEN_STATUSES)}}):
            raise HTTPException(status_code=409, detail="للسائق مشاوير مفتوحة — عطّلوه بدل الحذف")
        res = await db.ecom_drivers.delete_one({"id": driver_id})
        if not res.deleted_count:
            raise HTTPException(status_code=404, detail="السائق غير موجود")
        await _unmap_token(driver_id=driver_id)  # p520
        return {"ok": True}

    @tenant_router.put("/ecom/orders/{order_id}/driver")
    async def assign_driver(order_id: str, body: AssignIn, user: dict = Depends(require_tenant)):
        await require_ecom_feature(user)
        order = await db.ecom_orders.find_one({"id": order_id}, {"_id": 0})
        if not order:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")
        if body.driver_id:
            d = await db.ecom_drivers.find_one({"id": body.driver_id, "active": {"$ne": False}})
            if not d:
                raise HTTPException(status_code=404, detail="السائق غير موجود أو معطّل")
            if order.get("status") not in OPEN_STATUSES:
                raise HTTPException(status_code=400, detail="الإسناد فقط للطلبات المجهّزة أو المشحونة")
            await db.ecom_orders.update_one(
                {"id": order_id},
                {"$set": {"driver_id": d["id"], "driver_name": d["name"], "updated_at": _now()}})
            return {"ok": True, "driver_id": d["id"], "driver_name": d["name"]}
        await db.ecom_orders.update_one(
            {"id": order_id},
            {"$unset": {"driver_id": "", "driver_name": ""}, "$set": {"updated_at": _now()}})
        return {"ok": True, "driver_id": None}

    # ── driver side (token auth) ─────────────────────────────────────
    @public.get("/driver/{token}/orders")
    async def driver_orders(token: str):
        tenant, driver = await _find_driver(token)
        if not driver:
            raise HTTPException(status_code=404, detail="رابط غير صالح")
        tdb = get_tenant_db(tenant["id"])
        rows = await tdb.ecom_orders.find(
            {"driver_id": driver["id"], "status": {"$in": list(OPEN_STATUSES)}},
            {"_id": 0}).sort("created_at", 1).to_list(300)
        today = _now()[:10]
        done_today = await tdb.ecom_orders.count_documents({
            "driver_id": driver["id"], "status": "delivered",
            "status_history": {"$elemMatch": {"status": "delivered", "at": {"$gte": today}}}})
        return {
            "ok": True,
            "driver": {"name": driver["name"]},
            "store": tenant.get("name") or "",
            "orders": [_brief(o) for o in rows],
            "done_today": done_today,
        }

    @public.post("/driver/{token}/scan")
    async def driver_scan(token: str, body: ScanIn):
        tenant, driver = await _find_driver(token)
        if not driver:
            raise HTTPException(status_code=404, detail="رابط غير صالح")
        code = (body.code or "").strip()
        if not code:
            raise HTTPException(status_code=400, detail="الرمز فارغ")
        tdb = get_tenant_db(tenant["id"])
        o = await tdb.ecom_orders.find_one(
            {"driver_id": driver["id"],
             "$or": [{"order_code": code}, {"tracking_number": code}]}, {"_id": 0})
        if not o:
            raise HTTPException(status_code=404, detail="الطرد غير موجود في مشاويرك")
        return {"ok": True, "order": _brief(o)}

    @public.post("/driver/{token}/orders/{order_id}/result")
    async def driver_result(token: str, order_id: str, body: ResultIn):
        tenant, driver = await _find_driver(token)
        if not driver:
            raise HTTPException(status_code=404, detail="رابط غير صالح")
        if body.outcome not in ("delivered", "failed"):
            raise HTTPException(status_code=400, detail="النتيجة delivered أو failed")
        tdb = get_tenant_db(tenant["id"])
        o = await tdb.ecom_orders.find_one({"id": order_id, "driver_id": driver["id"]}, {"_id": 0})
        if not o:
            raise HTTPException(status_code=404, detail="الطرد غير موجود في مشاويرك")

        if body.outcome == "failed":
            note = (body.note or "").strip() or "محاولة توصيل فاشلة"
            await tdb.ecom_orders.update_one(
                {"id": order_id},
                {"$inc": {"delivery_attempts": 1},
                 "$set": {"updated_at": _now()},
                 "$push": {"status_history": {
                     "status": o.get("status"), "at": _now(),
                     "by": f"driver:{driver['name']}", "note": f"فشل التوصيل: {note}"}}})
            return {"ok": True, "outcome": "failed", "attempts": (o.get("delivery_attempts") or 0) + 1}

        # delivered — through the real state machine (cash, SMS, reputation…)
        if o.get("status") != "shipped":
            raise HTTPException(
                status_code=400,
                detail="الطلب ليس في حالة شحن — لا يمكن تسليمه من واجهة السائق")
        from services.application.ecom_order_service import change_order_status
        pseudo = {"id": f"driver:{driver['id']}", "tenant_id": tenant["id"],
                  "name": driver["name"], "full_name": driver["name"]}
        res = await change_order_status(tdb, order_id, "delivered",
                                        (body.note or "").strip() or "تسليم من السائق", pseudo)
        if not res.get("ok"):
            raise HTTPException(status_code=400, detail=res.get("error") or "تعذر التسليم")
        return {"ok": True, "outcome": "delivered", "order_code": o.get("order_code")}

    return {"driver_tenant": tenant_router, "driver_public": public}
