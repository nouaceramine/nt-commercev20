"""E-Commerce Hub: Shipping Labels (Mock provider for P1)

Generates a shipping label for an order. Real Yalidine/ZR/Maystro integrations
land in P2 — for P1 we return a mocked tracking number + label URL so the UI
flow works end-to-end.
"""
from datetime import datetime, timezone
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException

from config.database import db
from utils.auth import require_tenant
from .constants import (
    SHIPPING_PROVIDERS, SHIPPING_PROVIDER_KEYS, require_ecom_feature,
)

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
    """Create a shipping label for a given order. Mocks the provider call for P1.

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

    # ── MOCK label ──────────────────────────────────────────────────────────
    # In P2 we'd dispatch to provider HTTP APIs here. For now, persist a row.
    now = datetime.now(timezone.utc).isoformat()
    label_id = str(uuid.uuid4())
    tracking = _mock_tracking_number(provider)
    label_doc = {
        "id": label_id,
        "order_id": order_id,
        "order_code": order.get("order_code"),
        "provider": provider,
        "mode": "mock" if provider == "mock" else "mock_real_provider_pending",
        "tracking_number": tracking,
        "label_url": f"mock://labels/{label_id}.pdf",
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
    # Optional auto-status bump: confirmed/packed → shipped.
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
                        "note": f"تم إنشاء بطاقة شحن {provider} (mock)",
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
