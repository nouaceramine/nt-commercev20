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

from config.database import db, main_db, get_tenant_db
from utils.auth import require_tenant
from routes.ecom.constants import require_ecom_feature

logger = logging.getLogger(__name__)

OPEN_STATUSES = ("packed", "shipped", "out_for_delivery")
MAX_TENANTS_SCAN = 50


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
    """-> (tenant, driver) scanning active tenants; token is a secret so the
    scan order is irrelevant. Test tenants excluded."""
    tenants = await main_db.saas_tenants.find(
        {"is_active": {"$ne": False}, "is_permanent_test": {"$ne": True}},
        {"_id": 0, "id": 1, "name": 1}).to_list(MAX_TENANTS_SCAN)
    for t in tenants:
        try:
            d = await get_tenant_db(t["id"]).ecom_drivers.find_one(
                {"token": token, "active": {"$ne": False}}, {"_id": 0})
        except Exception:  # noqa: BLE001
            continue
        if d:
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
