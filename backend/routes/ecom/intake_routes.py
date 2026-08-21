"""External order-ingestion webhooks (p251).

Competitor parity (EcoManager's YouCan / LightFunnels / Google Sheets
connectors): the merchant creates an "intake source" per external shop and
points that platform's webhook (or a Sheets Apps Script) at the issued URL.
Every payload is normalised through a per-source field mapping and lands in
the unified ecom inbox via the SAME pipeline as manual entry: duplicate flag
(p240), COD risk, network reputation, POS sale mirror.

Tenant side (require_tenant):
  POST   /api/ecom/intake-sources          — create (token issued)
  GET    /api/ecom/intake-sources          — list + stats
  PUT    /api/ecom/intake-sources/{id}     — rename / toggle / remap
  DELETE /api/ecom/intake-sources/{id}     — remove

Public endpoint (token = secret):
  POST /api/ecom/intake/{tenant_id}/{token}

Default mappings (dot paths, "|" = fallback, ".0" = first array element):
  youcan:        order.customer.name / order.customer.phone / order.items.0 …
  lightfunnels:  customer.name / customer.phone / products.0 …
  sheets:        flat {name, phone, wilaya, city, product, qty, price}
  custom:        tenant-supplied mapping (all paths mandatory for name/phone)
Dedup: a payload carrying an external order id is upserted — repeats return
{"created": false} and never double-book.
"""
from datetime import datetime, timezone
from typing import Optional
import logging
import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from config.database import db, main_db, get_tenant_db
from utils.auth import require_tenant
from routes.ecom.constants import require_ecom_feature

logger = logging.getLogger(__name__)

SOURCE_TYPES = ("youcan", "lightfunnels", "sheets", "custom")

DEFAULT_MAPPINGS = {
    "youcan": {
        "external_id": "order.id|id",
        "name": "order.customer.name|customer.name|name",
        "phone": "order.customer.phone|customer.phone|phone",
        "address": "order.customer.address|customer.address|address",
        "city": "order.customer.city|customer.city|city",
        "wilaya": "order.customer.wilaya|customer.wilaya|wilaya",
        "product": "order.items.0.name|items.0.name|product",
        "qty": "order.items.0.quantity|items.0.quantity|qty",
        "price": "order.items.0.price|items.0.price|price",
        "total": "order.total|total",
        "notes": "order.notes|notes",
    },
    "lightfunnels": {
        "external_id": "order.id|id",
        "name": "customer.name|order.customer.name|name",
        "phone": "customer.phone|order.customer.phone|phone",
        "address": "customer.address|address",
        "city": "customer.city|city",
        "wilaya": "customer.wilaya|wilaya",
        "product": "products.0.name|order.items.0.name|product",
        "qty": "products.0.quantity|order.items.0.quantity|qty",
        "price": "products.0.price|order.items.0.price|price",
        "total": "order.total|total",
        "notes": "notes",
    },
    "sheets": {
        "external_id": "id",
        "name": "name", "phone": "phone", "address": "address",
        "city": "city", "wilaya": "wilaya", "product": "product",
        "qty": "qty", "price": "price", "total": "total", "notes": "notes",
    },
    "custom": {},
}

CHANNEL_MAP = {"youcan": "youcan", "lightfunnels": "lightfunnels",
               "sheets": "sheets", "custom": "custom-intake"}


class SourceIn(BaseModel):
    name: str
    source_type: str
    mapping: Optional[dict] = None


class SourceUpdate(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None
    mapping: Optional[dict] = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract(payload: dict, paths: str) -> str:
    """First non-empty value among pipe-separated dot paths (.0 = first item)."""
    for path in (paths or "").split("|"):
        cur = payload
        ok = True
        for part in path.strip().split("."):
            if isinstance(cur, list) and part.isdigit():
                cur = cur[int(part)] if len(cur) > int(part) else None
            elif isinstance(cur, dict):
                cur = cur.get(part)
            else:
                cur = None
            if cur is None:
                ok = False
                break
        if ok and str(cur).strip() != "":
            return str(cur).strip()
    return ""


async def _create_intake_order(tdb, source: dict, payload: dict) -> dict:
    mapping = {**DEFAULT_MAPPINGS.get(source["source_type"], {}),
               **(source.get("mapping") or {})}
    name = _extract(payload, mapping.get("name", ""))
    phone = _extract(payload, mapping.get("phone", ""))
    if not name or not phone:
        raise HTTPException(status_code=422,
                            detail="تعذر استخراج الاسم/الهاتف — راجعوا خريطة الحقول")
    try:
        qty = max(1, int(float(_extract(payload, mapping.get("qty", "")) or 1)))
    except ValueError:
        qty = 1
    try:
        price = float(_extract(payload, mapping.get("price", "")) or 0)
    except ValueError:
        price = 0.0
    total_raw = _extract(payload, mapping.get("total", ""))
    try:
        total = round(float(total_raw), 2) if total_raw else round(qty * price, 2)
    except ValueError:
        total = round(qty * price, 2)
    product = _extract(payload, mapping.get("product", "")) or "منتج"
    channel = CHANNEL_MAP.get(source["source_type"], "custom-intake")
    external_id = _extract(payload, mapping.get("external_id", ""))

    # dedup on (channel, external_id) — webhook retries must not double-book
    if external_id:
        existing = await tdb.ecom_orders.find_one(
            {"channel": channel, "external_id": external_id}, {"_id": 0, "order_code": 1})
        if existing:
            return {"created": False, "order_code": existing.get("order_code")}

    now = _now()
    order_id = str(uuid.uuid4())
    doc = {
        "id": order_id,
        "order_code": f"IN-{uuid.uuid4().hex[:8].upper()}",
        "channel": channel,
        "external_id": external_id,
        "integration_id": source["id"],
        "status": "new",
        "payment_status": "unpaid",
        "payment_method": "cod",
        "customer": {
            "name": name, "phone": phone,
            "address": _extract(payload, mapping.get("address", "")),
            "city": _extract(payload, mapping.get("city", "")),
            "wilaya": _extract(payload, mapping.get("wilaya", "")),
        },
        "items": [{"name": product, "sku": "", "qty": qty, "price": price,
                   "total": round(qty * price, 2)}],
        "subtotal": round(qty * price, 2), "shipping_fee": 0, "total": total,
        "notes": _extract(payload, mapping.get("notes", "")),
        "tags": ["intake", source["source_type"]],
        "shipping_label_id": None, "tracking_number": None, "courier": None,
        "utm": {}, "utm_source": "",
        "status_history": [{"status": "new", "at": now, "by": f"intake:{source['source_type']}"}],
        "created_at": now, "updated_at": now,
        "created_by": f"intake:{source['id']}",
    }

    from services.ecom.duplicate_detector import annotate_order
    from services.cod_risk import calculate_risk_score
    from services.application.ecom_order_service import (
        get_network_trust, reputation_on_create, sync_sale_doc, normalize_phone)
    doc["customer"]["phone"] = normalize_phone(doc["customer"]["phone"])
    try:
        await annotate_order(tdb, doc)
    except Exception:  # noqa: BLE001
        pass
    try:
        risk = calculate_risk_score(doc, customer_history_count=0, customer_stats={})
        doc["cod_risk"] = risk
        if risk["action"] == "manual_review":
            doc["status"] = "needs_review"
        elif risk["action"] == "confirm_first":
            doc["status"] = "awaiting_confirmation"
    except Exception:  # noqa: BLE001
        pass
    try:
        net = await get_network_trust(doc["customer"]["phone"])
        if net.get("found"):
            doc["network_trust"] = net
    except Exception:  # noqa: BLE001
        pass
    await tdb.ecom_orders.insert_one(doc)
    try:
        await sync_sale_doc(tdb, doc)
    except Exception:  # noqa: BLE001
        pass
    try:
        await reputation_on_create(doc, source.get("tenant_id") or "")
    except Exception:  # noqa: BLE001
        pass
    return {"created": True, "order_id": order_id, "order_code": doc["order_code"],
            "duplicate_warning": bool(doc.get("duplicate_warning"))}


def create_intake_routes() -> dict:
    tenant_router = APIRouter(tags=["ecom-intake"])
    public = APIRouter(tags=["ecom-intake-public"])

    # ── tenant side ──────────────────────────────────────────────────
    @tenant_router.post("/ecom/intake-sources")
    async def create_source(body: SourceIn, user: dict = Depends(require_tenant)):
        await require_ecom_feature(user)
        name = (body.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="اسم المصدر مطلوب")
        if body.source_type not in SOURCE_TYPES:
            raise HTTPException(status_code=400, detail="نوع المصدر غير مدعوم")
        if body.source_type == "custom" and not (body.mapping or {}).get("name"):
            raise HTTPException(status_code=400, detail="المصدر المخصص يتطلب خريطة name على الأقل")
        tenant_id = user.get("tenant_id") or user.get("id")
        now = _now()
        doc = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "name": name,
            "source_type": body.source_type,
            "token": "INT-" + secrets.token_hex(12),
            "mapping": body.mapping or {},
            "active": True,
            "stats": {"received": 0, "created": 0, "duplicates": 0, "rejected": 0},
            "last_received_at": None,
            "created_by": user.get("id"),
            "created_at": now,
            "updated_at": now,
        }
        await db.ecom_intake_sources.insert_one(doc)
        doc.pop("_id", None)
        return {"ok": True, "source": doc,
                "webhook_url": f"/api/ecom/intake/{tenant_id}/{doc['token']}"}

    @tenant_router.get("/ecom/intake-sources")
    async def list_sources(user: dict = Depends(require_tenant)):
        await require_ecom_feature(user)
        rows = await db.ecom_intake_sources.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
        tenant_id = user.get("tenant_id") or user.get("id")
        for r in rows:
            r["webhook_url"] = f"/api/ecom/intake/{tenant_id}/{r['token']}"
        return {"items": rows}

    @tenant_router.put("/ecom/intake-sources/{source_id}")
    async def update_source(source_id: str, body: SourceUpdate, user: dict = Depends(require_tenant)):
        await require_ecom_feature(user)
        s = await db.ecom_intake_sources.find_one({"id": source_id})
        if not s:
            raise HTTPException(status_code=404, detail="المصدر غير موجود")
        updates = {"updated_at": _now()}
        if body.name is not None:
            if not body.name.strip():
                raise HTTPException(status_code=400, detail="الاسم فارغ")
            updates["name"] = body.name.strip()
        if body.active is not None:
            updates["active"] = bool(body.active)
        if body.mapping is not None:
            updates["mapping"] = body.mapping
        await db.ecom_intake_sources.update_one({"id": source_id}, {"$set": updates})
        return {"ok": True}

    @tenant_router.delete("/ecom/intake-sources/{source_id}")
    async def delete_source(source_id: str, user: dict = Depends(require_tenant)):
        await require_ecom_feature(user)
        res = await db.ecom_intake_sources.delete_one({"id": source_id})
        if not res.deleted_count:
            raise HTTPException(status_code=404, detail="المصدر غير موجود")
        return {"ok": True}

    # ── public webhook ───────────────────────────────────────────────
    @public.post("/ecom/intake/{tenant_id}/{token}")
    async def intake_webhook(tenant_id: str, token: str, request: Request):
        tenant = await main_db.saas_tenants.find_one(
            {"id": tenant_id, "is_active": {"$ne": False}}, {"_id": 0, "id": 1})
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        tdb = get_tenant_db(tenant_id)
        source = await tdb.ecom_intake_sources.find_one(
            {"token": token, "active": {"$ne": False}}, {"_id": 0})
        if not source:
            raise HTTPException(status_code=404, detail="Intake source not found")
        try:
            payload = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body")
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail="JSON object expected")

        await tdb.ecom_intake_sources.update_one(
            {"id": source["id"]},
            {"$inc": {"stats.received": 1}, "$set": {"last_received_at": _now()}})
        try:
            result = await _create_intake_order(tdb, source, payload)
        except HTTPException:
            await tdb.ecom_intake_sources.update_one(
                {"id": source["id"]}, {"$inc": {"stats.rejected": 1}})
            raise
        await tdb.ecom_intake_sources.update_one(
            {"id": source["id"]},
            {"$inc": {"stats.created" if result["created"] else "stats.duplicates": 1}})
        logger.info("intake %s/%s: created=%s code=%s",
                    source["source_type"], source["id"], result["created"],
                    result.get("order_code"))
        return {"ok": True, **result}

    return {"intake_tenant": tenant_router, "intake_public": public}
