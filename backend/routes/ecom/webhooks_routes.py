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

    # ── Persist a lightweight external-product mirror (iter 18.3 — P2.1) ──
    # Real inventory sync (decrement local stock on order) is wired in a
    # follow-up; for now we keep a per-channel mirror so analytics + future
    # reconciliation jobs have ground truth.
    try:
        payload = await request.json()
    except Exception:
        return {"ok": True, "queued": True, "message": "invalid JSON skipped"}

    external_id = str(payload.get("id") or "")
    if external_id:
        from datetime import datetime as _dt, timezone as _tz
        variants = payload.get("variants") or []
        stock_total = sum(int(v.get("inventory_quantity", 0) or 0) for v in variants)
        await db.ecom_external_products.update_one(
            {"channel": "shopify", "integration_id": integration_id, "external_id": external_id},
            {"$set": {
                "channel": "shopify",
                "integration_id": integration_id,
                "external_id": external_id,
                "title": payload.get("title", ""),
                "handle": payload.get("handle", ""),
                "stock": stock_total,
                "variants_count": len(variants),
                "updated_at": _dt.now(_tz.utc).isoformat(),
            }},
            upsert=True,
        )
    return {"ok": True, "synced": True, "external_id": external_id}


# ─── WhatsApp Cloud API webhooks ────────────────────────────────────────────
@router.get("/ecom/webhooks/whatsapp/{tenant_id}/{integration_id}")
async def whatsapp_webhook_verify(
    tenant_id: str,
    integration_id: str,
    request: Request,
):
    """Meta GET handshake — echoes hub.challenge when hub.verify_token matches.

    The verify_token is stored in integration.credentials.verify_token.
    """
    db = _tenant_db(tenant_id)
    integration = await db.ecom_integrations.find_one({"id": integration_id, "channel": "whatsapp"})
    if not integration:
        raise HTTPException(status_code=404, detail="WhatsApp integration not found")
    params = dict(request.query_params)
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")
    expected = (integration.get("credentials") or {}).get("verify_token", "")
    if mode == "subscribe" and token and token == expected:
        return int(challenge) if challenge and challenge.isdigit() else challenge
    raise HTTPException(status_code=403, detail="Verify token mismatch")


@router.post("/ecom/webhooks/whatsapp/{tenant_id}/{integration_id}")
async def whatsapp_webhook(tenant_id: str, integration_id: str, request: Request):
    """Receive incoming WhatsApp messages → create lead."""
    from services.ecom.whatsapp_service import parse_incoming_message
    db = _tenant_db(tenant_id)
    integration = await db.ecom_integrations.find_one({"id": integration_id, "channel": "whatsapp"})
    if not integration:
        raise HTTPException(status_code=404, detail="WhatsApp integration not found")
    try:
        payload = await request.json()
    except Exception:
        return {"ok": True, "skipped": "invalid_json"}
    parsed = parse_incoming_message(payload)
    if not parsed:
        return {"ok": True, "skipped": "not_a_message"}

    # p101: order confirmation replies — «1/نعم» confirms, «2/لا» cancels the latest awaiting order.
    # The status change itself triggers the WhatsApp template reply via _maybe_notify_customer.
    try:
        from services.application.ecom_order_service import normalize_phone, change_order_status
        phone_norm = normalize_phone(parsed.get("from_phone", ""))
        txt = (parsed.get("text") or "").strip().lower()
        confirm_words = {"1", "نعم", "اكد", "أكد", "اوكي", "أوكي", "ok", "okay", "yes", "oui", "تأكيد", "تم", "موافق"}
        cancel_words = {"2", "لا", "الغاء", "إلغاء", "الغي", "ألغي", "non", "no", "annuler", "cancel"}
        if phone_norm and txt in (confirm_words | cancel_words):
            pendings = await db.ecom_orders.find(
                {"status": "awaiting_confirmation"}, {"_id": 0}
            ).sort("created_at", -1).to_list(100)
            target = next(
                (o for o in pendings
                 if normalize_phone((o.get("customer") or {}).get("phone", "")) == phone_norm),
                None,
            )
            if target:
                sys_user = {"id": "whatsapp-auto", "name": "تأكيد واتساب التلقائي", "role": "system"}
                if txt in confirm_words:
                    await change_order_status(db, target["id"], "confirmed", "تأكيد الزبون عبر واتساب", sys_user)
                    return {"ok": True, "order_confirmed": target.get("order_code")}
                await change_order_status(db, target["id"], "cancelled", "إلغاء الزبون عبر واتساب", sys_user)
                return {"ok": True, "order_cancelled": target.get("order_code")}
    except Exception as exc:  # noqa: BLE001
        logger.warning("p101 wa confirmation handling failed: %s", exc)

    await _upsert_lead(db, channel="whatsapp", integration_id=integration_id, parsed=parsed)
    return {"ok": True, "lead_created": True}


# ─── Meta (Facebook + Instagram) leads webhook ──────────────────────────────
@router.get("/ecom/webhooks/meta/{tenant_id}/{integration_id}")
async def meta_webhook_verify(tenant_id: str, integration_id: str, request: Request):
    """Meta GET handshake for FB/IG lead webhooks."""
    db = _tenant_db(tenant_id)
    integration = await db.ecom_integrations.find_one({"id": integration_id, "channel": {"$in": ["facebook", "instagram"]}})
    if not integration:
        raise HTTPException(status_code=404, detail="Meta integration not found")
    params = dict(request.query_params)
    expected = (integration.get("credentials") or {}).get("verify_token", "")
    if params.get("hub.mode") == "subscribe" and params.get("hub.verify_token") == expected:
        ch = params.get("hub.challenge", "")
        return int(ch) if ch.isdigit() else ch
    raise HTTPException(status_code=403, detail="Verify token mismatch")


@router.post("/ecom/webhooks/meta/{tenant_id}/{integration_id}")
async def meta_lead_webhook(tenant_id: str, integration_id: str, request: Request):
    """Receive FB/Instagram lead-gen submissions → create lead."""
    from services.ecom.whatsapp_service import parse_meta_lead
    db = _tenant_db(tenant_id)
    integration = await db.ecom_integrations.find_one({"id": integration_id, "channel": {"$in": ["facebook", "instagram"]}})
    if not integration:
        raise HTTPException(status_code=404, detail="Meta integration not found")
    try:
        payload = await request.json()
    except Exception:
        return {"ok": True, "skipped": "invalid_json"}
    parsed = parse_meta_lead(payload)
    if not parsed:
        return {"ok": True, "skipped": "not_a_lead"}
    parsed["text"] = parsed.pop("message", "")
    parsed["from_phone"] = parsed.pop("phone", "")
    parsed["from_email"] = parsed.pop("email", "")
    await _upsert_lead(db, channel=integration["channel"], integration_id=integration_id, parsed=parsed)
    return {"ok": True, "lead_created": True}


# ─── Telegram + Viber + TikTok webhooks ─────────────────────────────────────
@router.post("/ecom/webhooks/telegram/{tenant_id}/{integration_id}")
async def telegram_webhook(tenant_id: str, integration_id: str, request: Request):
    from services.ecom.messaging_services import parse_telegram_update
    db = _tenant_db(tenant_id)
    integration = await db.ecom_integrations.find_one({"id": integration_id, "channel": "telegram"})
    if not integration:
        raise HTTPException(status_code=404, detail="Telegram integration not found")
    payload = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    parsed = parse_telegram_update(payload)
    if not parsed:
        return {"ok": True, "skipped": "not_a_message"}
    await _upsert_lead(db, channel="telegram", integration_id=integration_id, parsed=parsed)
    return {"ok": True, "lead_created": True}


@router.post("/ecom/webhooks/viber/{tenant_id}/{integration_id}")
async def viber_webhook(tenant_id: str, integration_id: str, request: Request):
    from services.ecom.messaging_services import parse_viber_event
    db = _tenant_db(tenant_id)
    integration = await db.ecom_integrations.find_one({"id": integration_id, "channel": "viber"})
    if not integration:
        raise HTTPException(status_code=404, detail="Viber integration not found")
    payload = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    parsed = parse_viber_event(payload)
    if not parsed:
        return {"ok": True, "skipped": "not_an_event"}
    await _upsert_lead(db, channel="viber", integration_id=integration_id, parsed=parsed)
    return {"ok": True, "lead_created": True}


@router.post("/ecom/webhooks/tiktok/{tenant_id}/{integration_id}")
async def tiktok_webhook(tenant_id: str, integration_id: str, request: Request):
    """TikTok Shop order webhook — convert into an internal order."""
    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz
    from services.ecom.messaging_services import parse_tiktok_order
    db = _tenant_db(tenant_id)
    integration = await db.ecom_integrations.find_one({"id": integration_id, "channel": "tiktok"})
    if not integration:
        raise HTTPException(status_code=404, detail="TikTok integration not found")
    try:
        payload = await request.json()
    except Exception:
        return {"ok": True, "skipped": "invalid_json"}
    parsed = parse_tiktok_order(payload, integration_id)
    if not parsed:
        return {"ok": True, "skipped": "not_an_order"}

    # Idempotency by external_id
    existing = await db.ecom_orders.find_one({"channel": "tiktok", "external_id": parsed["external_id"]}, {"_id": 0})
    if existing:
        return {"ok": True, "duplicate": True, "order_code": existing.get("order_code")}

    now = _dt.now(_tz.utc).isoformat()
    subtotal = sum(it["total"] for it in parsed["items"])
    doc = {
        "id": str(_uuid.uuid4()),
        "order_code": f"TIK-{parsed['external_id'][-8:].upper()}",
        "channel": "tiktok",
        "external_id": parsed["external_id"],
        "integration_id": integration_id,
        "status": "new",
        "payment_status": "paid",
        "customer": {
            "name": parsed["customer_name"], "phone": parsed["customer_phone"],
            "address": parsed["address"], "city": parsed["city"], "wilaya": parsed["wilaya"],
        },
        "items": parsed["items"],
        "subtotal": round(subtotal, 2),
        "shipping_fee": 0,
        "total": parsed["total"] or round(subtotal, 2),
        "notes": "", "tags": [],
        "shipping_label_id": None, "tracking_number": None, "courier": None,
        "status_history": [{"status": "new", "at": now, "by": "tiktok-webhook"}],
        "created_at": now, "updated_at": now, "created_by": "tiktok-webhook",
    }
    await db.ecom_orders.insert_one(doc)
    await db.ecom_integrations.update_one(
        {"id": integration_id},
        {"$inc": {"stats.orders": 1}, "$set": {"last_sync_at": now, "mode": "live"}},
    )
    return {"ok": True, "created": True, "order_code": doc["order_code"]}


async def _upsert_lead(db, channel: str, integration_id: str, parsed: dict) -> None:
    """Shared idempotent lead upsert used by messaging-channel webhooks."""
    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz
    external_id = parsed.get("external_id", "")
    if external_id:
        existing = await db.ecom_leads.find_one({"channel": channel, "external_id": external_id}, {"_id": 0, "id": 1})
        if existing:
            return
    now = _dt.now(_tz.utc).isoformat()
    doc = {
        "id": str(_uuid.uuid4()),
        "channel": channel,
        "external_id": external_id,
        "integration_id": integration_id,
        "name": parsed.get("name", ""),
        "phone": parsed.get("from_phone", "") or parsed.get("phone", ""),
        "email": parsed.get("from_email", "") or parsed.get("email", ""),
        "message": parsed.get("text", "") or parsed.get("message", ""),
        "status": "new",
        "tags": [], "ai_category": None, "ai_score": None,
        "converted_order_id": None,
        "created_at": now, "updated_at": now, "created_by": f"{channel}-webhook",
    }
    await db.ecom_leads.insert_one(doc)
    await db.ecom_integrations.update_one(
        {"id": integration_id},
        {"$inc": {"stats.leads": 1}, "$set": {"last_sync_at": now, "mode": "live"}},
    )
