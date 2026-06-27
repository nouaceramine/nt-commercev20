"""E-Commerce Webhooks (P2)

Unauthenticated endpoints that accept webhook callbacks from real third-party
channels. Security is enforced via the channel-specific signature header
(Shopify HMAC, Meta X-Hub-Signature, etc.).

Routes:
  POST /api/ecom/webhooks/shopify/{tenant_id}/{integration_id}/orders
  POST /api/ecom/webhooks/shopify/{tenant_id}/{integration_id}/products (stub for P2.1)
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException, Header
from typing import Optional

from config.database import client as mongo_client, main_db
from services.ecom.shopify_service import (
    verify_shopify_hmac, parse_shopify_order, upsert_shopify_order,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["E-Commerce Webhooks"])


def _tenant_db(tenant_id: str):
    """Resolve tenant DB by id without going through the request middleware
    (webhooks are unauthenticated — the tenant_id comes from the URL path)."""
    return mongo_client[f"tenant_{tenant_id.replace('-', '_')}"]


@router.post("/ecom/webhooks/shopify/{tenant_id}/{integration_id}/orders")
async def shopify_order_webhook(
    tenant_id: str,
    integration_id: str,
    request: Request,
    x_shopify_hmac_sha256: Optional[str] = Header(None),
    x_shopify_topic: Optional[str] = Header(None),
    x_shopify_shop_domain: Optional[str] = Header(None),
):
    """Receive `orders/create` (and `orders/updated`) webhooks from Shopify.

    Security: HMAC-SHA256 of the raw body, using the integration's `webhook_secret`.
    Returns 200 even on duplicates so Shopify stops retrying.
    """
    # Verify tenant exists
    tenant = await main_db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0, "id": 1})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    db = _tenant_db(tenant_id)
    integration = await db.ecom_integrations.find_one({"id": integration_id, "channel": "shopify"})
    if not integration:
        raise HTTPException(status_code=404, detail="Shopify integration not found")

    raw_body = await request.body()
    webhook_secret = (integration.get("credentials") or {}).get("webhook_secret", "")
    if not webhook_secret:
        # Tenant must set a webhook_secret in credentials to enable webhooks.
        raise HTTPException(status_code=400, detail="webhook_secret not configured for this integration")

    if not verify_shopify_hmac(raw_body, x_shopify_hmac_sha256 or "", webhook_secret):
        logger.warning("Shopify webhook HMAC mismatch for integration=%s shop=%s", integration_id, x_shopify_shop_domain)
        raise HTTPException(status_code=401, detail="HMAC verification failed")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    parsed = parse_shopify_order(payload, integration_id)
    result = await upsert_shopify_order(db, parsed)

    # Bump integration stats + last_sync
    now_iso = datetime.now(timezone.utc).isoformat()
    if result["created"]:
        await db.ecom_integrations.update_one(
            {"id": integration_id},
            {"$inc": {"stats.orders": 1}, "$set": {"last_sync_at": now_iso, "mode": "live", "last_error": None}},
        )
    else:
        await db.ecom_integrations.update_one(
            {"id": integration_id},
            {"$set": {"last_sync_at": now_iso, "mode": "live"}},
        )

    logger.info("Shopify webhook %s: tenant=%s integration=%s order=%s created=%s",
                x_shopify_topic, tenant_id, integration_id, parsed["external_id"], result["created"])
    return {"ok": True, "created": result["created"], "order_id": parsed["id"], "order_code": parsed["order_code"]}


@router.post("/ecom/webhooks/shopify/{tenant_id}/{integration_id}/products")
async def shopify_product_webhook(
    tenant_id: str,
    integration_id: str,
    request: Request,
    x_shopify_hmac_sha256: Optional[str] = Header(None),
):
    """Placeholder for products/update webhook (P2.1).

    Accepts the payload and verifies HMAC so Shopify stops retrying, but does
    not yet sync stock. Will be implemented after the orders flow is stabilised.
    """
    db = _tenant_db(tenant_id)
    integration = await db.ecom_integrations.find_one({"id": integration_id, "channel": "shopify"})
    if not integration:
        raise HTTPException(status_code=404, detail="Shopify integration not found")
    secret = (integration.get("credentials") or {}).get("webhook_secret", "")
    raw_body = await request.body()
    if not verify_shopify_hmac(raw_body, x_shopify_hmac_sha256 or "", secret):
        raise HTTPException(status_code=401, detail="HMAC verification failed")
    return {"ok": True, "queued": True, "message": "products sync coming in P2.1"}
