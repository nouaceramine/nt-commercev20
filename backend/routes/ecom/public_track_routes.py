"""Public global order tracking (p244).

Competitor parity (Vozare / MDM Express): a customer of ANY tenant can track
a parcel from one public page with just the order code or courier tracking
number — no login, no store slug needed (the per-store /shop/:slug/track
page from the storefront still exists; this is the platform-wide one).

  GET /api/track/{code}   — public, no auth

Privacy: the payload carries NO personal data (no name/phone/address) —
only order code, status timeline, courier, totals and the store name.
"""
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

STATUS_AR = {
    "new": "قيد المراجعة",
    "awaiting_confirmation": "بانتظار التأكيد",
    "needs_review": "قيد التدقيق",
    "confirmed": "تم التأكيد",
    "packed": "تم التجهيز",
    "shipped": "خرج للتوصيل",
    "out_for_delivery": "قيد التوصيل",
    "delivered": "تم التوصيل",
    "cancelled": "ملغي",
    "refunded": "مسترجع",
    "returned": "مسترجع",
}

CHANNEL_AR = {
    "webstore": "متجر إلكتروني",
    "marketplace": "السوق الموحد",
    "excel": "استيراد Excel",
    "manual": "إدخال مباشر",
    "facebook": "فيسبوك",
    "instagram": "إنستغرام",
    "whatsapp": "واتساب",
    "tiktok": "تيك توك",
}

_CODE_RE = re.compile(r"^[A-Za-z0-9\-]{3,40}$")
MAX_TENANTS_SCAN = 50


def create_public_track_routes(main_db) -> dict:
    from config.database import get_tenant_db

    public = APIRouter(tags=["public-tracking"])

    async def _resolve_order(code: str):
        """(order, tenant) for an order code: stamped fast path → marketplace
        fast path → bounded tenant scan. (None, None) when not found."""
        order, tenant = None, None

        # p258 fast path: stamped codes (PREFIX-NTx-...) name their tenant —
        # resolve it in O(1) instead of scanning every tenant database.
        m = re.match(r"^[A-Za-z]{1,4}-NT(\d+)-", code)
        if m:
            short_id = f"NT-{int(m.group(1)):04d}"
            t = await main_db.saas_tenants.find_one(
                {"short_id": short_id, "is_permanent_test": {"$ne": True}},
                {"_id": 0, "id": 1, "name": 1})
            if t:
                try:
                    order = await get_tenant_db(t["id"]).ecom_orders.find_one(
                        {"order_code": code}, {"_id": 0})
                    if order:
                        tenant = t
                except Exception:  # noqa: BLE001 — fall through to legacy scan
                    order = None

        # fast path: marketplace orders carry their tenant id in main_db
        mo = await main_db.marketplace_orders.find_one(
            {"order_code": code}, {"_id": 0, "tenant_id": 1})
        if mo:
            tenant = await main_db.saas_tenants.find_one(
                {"id": mo["tenant_id"]}, {"_id": 0, "id": 1, "name": 1})
            if tenant:
                order = await get_tenant_db(tenant["id"]).ecom_orders.find_one(
                    {"order_code": code}, {"_id": 0})

        # general path: scan active real tenants (order code or courier tracking
        # number). Order codes are unique per tenant only — if several tenants
        # have the same code, the most recently created order wins; permanent
        # test tenants are excluded so they never shadow a real customer order.
        if order is None:
            tenants = await main_db.saas_tenants.find(
                {"is_active": {"$ne": False}, "is_permanent_test": {"$ne": True}},
                {"_id": 0, "id": 1, "name": 1},
            ).to_list(MAX_TENANTS_SCAN)
            best_key = ""
            for t in tenants:
                try:
                    cand = await get_tenant_db(t["id"]).ecom_orders.find_one(
                        {"$or": [{"order_code": code}, {"tracking_number": code}]},
                        {"_id": 0})
                except Exception:  # noqa: BLE001 — one tenant's failure must not break tracking
                    continue
                if cand and str(cand.get("created_at") or "") >= best_key:
                    best_key = str(cand.get("created_at") or "")
                    order, tenant = cand, t

        return order, tenant

    @public.get("/track/{code}")
    async def track_order(code: str):
        code = (code or "").strip()
        if not _CODE_RE.match(code):
            raise HTTPException(status_code=400, detail="رمز غير صالح")
        order, tenant = await _resolve_order(code)
        if not order:
            return {"ok": True, "found": False}

        timeline = [
            {
                "status": h.get("status"),
                "status_ar": STATUS_AR.get(h.get("status"), h.get("status") or ""),
                "at": h.get("at"),
            }
            for h in (order.get("status_history") or [])
            if h.get("status")
        ]
        return {
            "ok": True,
            "found": True,
            "order": {
                "order_code": order.get("order_code"),
                "status": order.get("status"),
                "status_ar": STATUS_AR.get(order.get("status"), order.get("status") or ""),
                "timeline": timeline,
                "courier": order.get("courier"),
                "tracking_number": order.get("tracking_number"),
                "total": order.get("total"),
                "currency": "دج",
                "items_count": sum(int(i.get("qty", 1)) for i in (order.get("items") or [])),
                "channel_ar": CHANNEL_AR.get(order.get("channel"), order.get("channel") or ""),
                "store": (tenant or {}).get("name") or "",
                "created_at": order.get("created_at"),
            },
        }

    # ── p530-D2: customer-side "report a problem with my order" ──
    REPORT_CATEGORIES = {
        "late": "تأخر التوصيل",
        "wrong_item": "منتج خاطئ أو ناقص",
        "damaged": "منتج تالف",
        "no_answer": "المتجر لا يرد",
        "other": "أخرى",
    }
    MAX_OPEN_REPORTS_PER_ORDER = 3

    class ReportIn(BaseModel):
        category: str
        message: str
        contact: Optional[str] = ""

    @public.post("/track/{code}/report")
    async def report_order_issue(code: str, body: ReportIn):
        """Public, no auth — the order code itself is the capability.
        Abuse control: valid code required, 3 open reports per order max,
        message length-bounded. Returns no order data."""
        code = (code or "").strip()
        if not _CODE_RE.match(code):
            raise HTTPException(status_code=400, detail="رمز غير صالح")
        category = (body.category or "").strip()
        if category not in REPORT_CATEGORIES:
            raise HTTPException(status_code=400, detail="نوع البلاغ غير صالح")
        message = (body.message or "").strip()
        if not 10 <= len(message) <= 500:
            raise HTTPException(status_code=400, detail="نص البلاغ يجب أن يكون بين 10 و 500 حرف")
        contact = (body.contact or "").strip()[:100]

        order, tenant = await _resolve_order(code)
        if not order or not tenant:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")

        tdb = get_tenant_db(tenant["id"])
        open_reports = await tdb.order_reports.count_documents(
            {"order_code": code, "status": "new"})
        if open_reports >= MAX_OPEN_REPORTS_PER_ORDER:
            raise HTTPException(
                status_code=429,
                detail="تم استلام بلاغات كافية لهذا الطلب — سيتواصل معك المتجر")

        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": str(uuid.uuid4()),
            "order_id": order.get("id", ""),
            "order_code": code,
            "category": category,
            "category_ar": REPORT_CATEGORIES[category],
            "message": message,
            "contact": contact,
            "status": "new",
            "created_at": now,
        }
        await tdb.order_reports.insert_one(doc)
        await tdb.ecom_orders.update_one(
            {"order_code": code},
            {"$inc": {"report_count": 1}, "$set": {"has_open_report": True}})
        # merchant notification (best-effort — the bell shows it immediately)
        try:
            await tdb.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "title": "بلاغ عن طلب",
                "message": f"بلاغ جديد على الطلب {code} ({REPORT_CATEGORIES[category]}): {message[:80]}",
                "type": "order_report",
                "link": "/ecom-hub",
                "is_read": False,
                "created_at": now,
            })
        except Exception:  # noqa: BLE001
            pass
        return {"ok": True}

    return {"public_track": public}
