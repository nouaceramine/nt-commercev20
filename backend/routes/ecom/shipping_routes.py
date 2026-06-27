"""E-Commerce Hub: Shipping Labels (P2 — real Yalidine + mock fallback)

Strategy: if the tenant has a Yalidine integration with valid credentials AND
provider=yalidine, attempt a real call. On any failure (or for other providers)
we fall back to the P1 mock so the UI flow never breaks.
"""
from datetime import datetime, timezone
from typing import Optional
import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException

from config.database import db
from utils.auth import require_tenant
from services.ecom.yalidine_service import (
    create_parcel as yalidine_create_parcel,
    YalidineCredentialsMissing,
    YalidineAPIError,
)
from .constants import (
    SHIPPING_PROVIDERS, SHIPPING_PROVIDER_KEYS, require_ecom_feature,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["E-Commerce Shipping"])


def _mock_tracking_number(provider: str) -> str:
    """Provider-prefixed mock tracking number."""
    prefix = {"yalidine": "YAL", "zr": "ZR", "maystro": "MS", "mock": "MOCK"}.get(provider, "TRK")
    return f"{prefix}-{uuid.uuid4().hex[:10].upper()}"


@router.get("/ecom/shipping/providers")
async def list_providers(user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    return {
        "providers": [
            {"key": k, **meta} for k, meta in SHIPPING_PROVIDERS.items()
        ]
    }


@router.get("/ecom/shipping/labels")
async def list_labels(user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    rows = await db.ecom_shipping_labels.find({}, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
    return {"items": rows}


@router.post("/ecom/shipping/labels")
async def create_label(body: dict, user: dict = Depends(require_tenant)):
    """Create a shipping label for an order.

    Real Yalidine call when:
      • provider == 'yalidine'
      • A yalidine integration exists with api_id + api_token configured

    Otherwise falls back to mock (returns a synthetic tracking number).

    Body: {order_id: str, provider: 'yalidine'|'zr'|'maystro'|'mock'}
    """
    await require_ecom_feature(user)
    order_id = (body.get("order_id") or "").strip()
    provider = (body.get("provider") or "mock").strip().lower()
    if provider not in SHIPPING_PROVIDER_KEYS:
        raise HTTPException(status_code=400, detail="مزود شحن غير صالح")
    if not order_id:
        raise HTTPException(status_code=400, detail="order_id مطلوب")

    order = await db.ecom_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")

    now = datetime.now(timezone.utc).isoformat()
    label_id = str(uuid.uuid4())
    mode = "mock"
    tracking = None
    label_url = ""

    # ── Real provider path (Yalidine only for P2) ──────────────────────────
    if provider == "yalidine":
        # Find the tenant's active Yalidine integration (first match).
        integration = await db.ecom_integrations.find_one({
            "channel": "yalidine",
            "is_active": True,
        }) or await db.ecom_integrations.find_one({
            "credentials.api_id": {"$exists": True},
            "credentials.api_token": {"$exists": True},
        })
        if integration:
            try:
                result = await yalidine_create_parcel(integration, order)
                tracking = result["tracking_number"]
                label_url = result["label_url"]
                mode = "live"
                logger.info("Yalidine real parcel created: order=%s tracking=%s", order_id, tracking)
            except YalidineCredentialsMissing:
                logger.info("Yalidine creds missing — falling back to mock for order=%s", order_id)
            except YalidineAPIError as exc:
                logger.warning("Yalidine real call failed (%s) — falling back to mock", exc)

    # ── Mock fallback (always works) ──────────────────────────────────────
    if not tracking:
        tracking = _mock_tracking_number(provider)
        label_url = f"mock://labels/{label_id}.pdf"
        mode = "mock" if provider == "mock" else "mock_real_provider_pending"

    label_doc = {
        "id": label_id,
        "order_id": order_id,
        "order_code": order.get("order_code"),
        "provider": provider,
        "mode": mode,
        "tracking_number": tracking,
        "label_url": label_url,
        "customer_name": order.get("customer", {}).get("name", ""),
        "customer_phone": order.get("customer", {}).get("phone", ""),
        "city": order.get("customer", {}).get("city", ""),
        "wilaya": order.get("customer", {}).get("wilaya", ""),
        "total": order.get("total", 0),
        "status": "created",
        "created_at": now,
        "created_by": user.get("id"),
    }
    await db.ecom_shipping_labels.insert_one(label_doc)

    # Attach label info to the order + advance status if appropriate.
    update: dict = {
        "shipping_label_id": label_id,
        "tracking_number": tracking,
        "courier": provider,
        "updated_at": now,
    }
    if order.get("status") in ("confirmed", "packed"):
        update["status"] = "shipped"
        await db.ecom_orders.update_one(
            {"id": order_id},
            {
                "$set": update,
                "$push": {
                    "status_history": {
                        "status": "shipped",
                        "at": now,
                        "by": user.get("id"),
                        "note": f"تم إنشاء بطاقة شحن {provider} ({mode})",
                    }
                },
            },
        )
    else:
        await db.ecom_orders.update_one({"id": order_id}, {"$set": update})

    label_doc.pop("_id", None)
    return label_doc


@router.get("/ecom/shipping/labels/{label_id}")
async def get_label(label_id: str, user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    label = await db.ecom_shipping_labels.find_one({"id": label_id}, {"_id": 0})
    if not label:
        raise HTTPException(status_code=404, detail="بطاقة الشحن غير موجودة")
    return label
