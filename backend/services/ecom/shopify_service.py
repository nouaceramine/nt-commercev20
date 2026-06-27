"""Shopify Webhook & Order Sync Service (iter 18.2 — P2 real integration)

Responsibilities:
  - Verify Shopify webhook HMAC using the integration's stored webhook_secret.
  - Parse a Shopify order JSON payload into our internal `ecom_orders` shape.
  - Persist idempotently by Shopify order ID (re-deliveries are no-ops).

Webhook payload shape: https://shopify.dev/docs/api/admin-rest/2024-10/resources/order
"""
import base64
import hashlib
import hmac
import logging
from datetime import datetime, timezone
from typing import Optional
import uuid

logger = logging.getLogger(__name__)


def verify_shopify_hmac(raw_body: bytes, hmac_header: str, secret: str) -> bool:
    """Compute HMAC-SHA256 of raw body using secret, base64-encoded, compare to header.

    Returns False (never raises) if any input is missing or malformed.
    """
    if not raw_body or not hmac_header or not secret:
        return False
    try:
        computed = hmac.new(
            secret.encode("utf-8"),
            raw_body,
            hashlib.sha256,
        ).digest()
        encoded = base64.b64encode(computed).decode("utf-8")
        # constant-time comparison
        return hmac.compare_digest(encoded, hmac_header)
    except Exception as exc:
        logger.warning("Shopify HMAC verification crashed: %s", exc)
        return False


class ShopifyAPIError(Exception):
    """Raised when Shopify returns a non-2xx response."""


async def ping(integration: dict) -> dict:
    """Lightweight connectivity check — fetches GET /admin/api/2024-10/shop.json

    Requires `shop_domain` (e.g. `my-store.myshopify.com`) and `admin_api_key`
    (Shopify Admin API access token starting with `shpat_`) in credentials.

    Returns {ok: True, shop_name, currency, plan} on success.
    """
    import httpx
    creds = (integration or {}).get("credentials") or {}
    domain = (creds.get("shop_domain") or "").strip().rstrip("/")
    token = (creds.get("admin_api_key") or "").strip()
    if not domain or not token:
        raise ShopifyAPIError("shop_domain و admin_api_key مطلوبان")

    # Allow user to enter either "store.myshopify.com" or full URL
    if domain.startswith("http"):
        domain = domain.split("//", 1)[1]
    if "/" in domain:
        domain = domain.split("/", 1)[0]
    if not domain.endswith(".myshopify.com") and "myshopify" not in domain:
        # Be lenient — let Shopify itself reject if domain is wrong
        pass

    url = f"https://{domain}/admin/api/2024-10/shop.json"
    headers = {"X-Shopify-Access-Token": token, "Accept": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
    except httpx.HTTPError as exc:
        raise ShopifyAPIError(f"Network error: {exc}") from exc

    if resp.status_code in (401, 403):
        raise ShopifyAPIError(f"مفاتيح Shopify غير صحيحة (HTTP {resp.status_code}) — تحقَّق من admin_api_key")
    if resp.status_code == 404:
        raise ShopifyAPIError(f"النطاق غير موجود ({domain}) — تأكَّد من shop_domain")
    if resp.status_code >= 400:
        raise ShopifyAPIError(f"Shopify returned HTTP {resp.status_code}: {resp.text[:200]}")

    data = resp.json().get("shop") or {}
    return {
        "ok": True,
        "shop_name": data.get("name"),
        "currency": data.get("currency"),
        "plan": data.get("plan_display_name") or data.get("plan_name"),
        "domain": data.get("myshopify_domain"),
    }



def parse_shopify_order(payload: dict, integration_id: str) -> dict:
    """Map a Shopify order webhook payload to our internal `ecom_orders` shape.

    Only the fields we need today — extend as integration matures.
    """
    customer = payload.get("customer") or {}
    shipping = payload.get("shipping_address") or {}
    items_raw = payload.get("line_items") or []
    items: list = []
    for li in items_raw:
        qty = int(li.get("quantity", 0) or 0)
        price = float(li.get("price", 0) or 0)
        items.append({
            "name": li.get("name") or li.get("title") or "—",
            "sku": li.get("sku") or "",
            "qty": max(1, qty),
            "price": price,
            "total": round(qty * price, 2),
        })
    subtotal = round(sum(i["total"] for i in items), 2)
    shipping_fee = float((payload.get("shipping_lines") or [{}])[0].get("price", 0) or 0)
    # Shopify includes total in the payload — prefer it (handles discounts/taxes correctly).
    total = float(payload.get("total_price", 0) or 0) or round(subtotal + shipping_fee, 2)

    name_parts = [customer.get("first_name", ""), customer.get("last_name", "")]
    customer_name = " ".join([p for p in name_parts if p]).strip() or shipping.get("name", "") or "Shopify Customer"

    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": str(uuid.uuid4()),
        "order_code": f"SHO-{str(payload.get('order_number') or payload.get('id'))}",
        "channel": "shopify",
        "external_id": str(payload.get("id")),
        "integration_id": integration_id,
        "status": "new",
        "payment_status": payload.get("financial_status") or "unpaid",
        "customer": {
            "name": customer_name,
            "phone": customer.get("phone", "") or shipping.get("phone", "") or "",
            "address": shipping.get("address1", "") or "",
            "city": shipping.get("city", "") or "",
            "wilaya": shipping.get("province", "") or "",
        },
        "items": items,
        "subtotal": subtotal,
        "shipping_fee": shipping_fee,
        "total": total,
        "notes": (payload.get("note") or "")[:500],
        "tags": [t.strip() for t in (payload.get("tags") or "").split(",") if t.strip()],
        "shipping_label_id": None,
        "tracking_number": None,
        "courier": None,
        "status_history": [{"status": "new", "at": now, "by": "shopify-webhook", "note": "imported from Shopify"}],
        "created_at": now,
        "updated_at": now,
        "created_by": "shopify-webhook",
    }


async def upsert_shopify_order(db, parsed: dict) -> dict:
    """Insert a Shopify order if its external_id is new; otherwise return existing.

    Idempotent — Shopify retries the same webhook multiple times.
    """
    existing = await db.ecom_orders.find_one(
        {"channel": "shopify", "external_id": parsed["external_id"]},
        {"_id": 0},
    )
    if existing:
        return {"order": existing, "created": False}
    await db.ecom_orders.insert_one(parsed)
    parsed.pop("_id", None)
    return {"order": parsed, "created": True}
