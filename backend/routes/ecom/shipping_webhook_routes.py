"""p284: Instant shipping-status webhooks — real-time parcel updates.

Public receiver endpoints that courier platforms (Yalidine, ZR Express,
Maystro, Ecotrack, Guepex...) call the moment a parcel status changes.
Security: each (tenant, channel) pair owns an unguessable webhook_token
embedded in the URL — the token authenticates the caller (Algerian couriers
do not sign payloads consistently). Tokens are indexed in main_db so the
receiver resolves the tenant without scanning tenant databases.

On every accepted event:
  1. tenant + integration resolved from webhook_token (main_db lookup)
  2. payload normalised per courier -> (tracking_number, raw_status)
  3. order located by tracking_number in that tenant's ecom_orders
  4. status mapped (map_yalidine_status / map_generic_status + optional
     per-integration status_map) -> delivered | refunded | None
  5. change_order_status() runs the REAL state machine (COD collection,
     profit realisation, stock restore, ecom_order.* realtime events)
  6. notification posted + shipping_activity_log row written
Idempotent: an event matching the current status is a logged no-op.

Setup flow (tenant): GET /ecom/shipping/webhook-info/{channel} returns the
URL to paste into the courier dashboard (+ per-courier instructions).
POST /ecom/shipping/webhook-rotate/{channel} revokes and regenerates it.
Couriers without webhook support keep the 2-hour polling fallback (p80/p248).
"""
import base64
import binascii
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Request, HTTPException, Depends

from config.database import client as mongo_client, main_db

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Shipping Webhooks"])

PLATFORM_BASE_URL = "https://nt-commerce.net"

# Couriers with documented webhook support (p284 research).
# key -> (label_ar, setup instructions for the courier dashboard)
SUPPORTED_WEBHOOKS = {
    "yalidine": (
        "يالدين",
        "في لوحة يالدين: Gérer les Webhooks ← أضف رابط Webhook ← الصق الرابط أدناه ← فعّل أحداث تتبع الطرود (tracking).",
    ),
    "guepex": (
        "Guepex",
        "نفس خطوات يالدين (نفس المنصة): قسم Webhooks ← الصق الرابط أدناه.",
    ),
    "zr": (
        "ZR Express",
        "في لوحة ZR Express (Procolis): Paramètres ← Webhooks / API ← أضف رابط الإشعارات أدناه لأحداث حالة الطرود.",
    ),
    "maystro": (
        "مايسترو",
        "في لوحة Maystro: Paramètres ← Webhooks ← Créer un webhook ← الصق الرابط أدناه ← فعّل تحديثات الحالة.",
    ),
    "ecotrack": (
        "Ecotrack",
        "في لوحة Ecotrack: الإعدادات ← Webhooks ← الصق الرابط أدناه لأحداث تغيّر حالة الشحنة.",
    ),
}


def _tenant_db(tenant_id: str):
    return mongo_client[f"tenant_{tenant_id.replace('-', '_')}"]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _ensure_token(tenant_id: str, channel: str) -> dict:
    """Get or create the webhook token row for (tenant, channel)."""
    row = await main_db.shipping_webhook_tokens.find_one(
        {"tenant_id": tenant_id, "channel": channel}, {"_id": 0})
    if row:
        return row
    row = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "channel": channel,
        "webhook_token": uuid.uuid4().hex + uuid.uuid4().hex[:16],
        "created_at": _now(),
        "events_received": 0,
    }
    await main_db.shipping_webhook_tokens.insert_one(dict(row))
    row.pop("_id", None)
    return row


# ---------------------------------------------------------------------------
# Payload normalisation — every courier speaks a different dialect.
# ---------------------------------------------------------------------------

_TRACK_KEYS = ("tracking", "tracking_number", "trackingNumber", "tracking_code",
               "code", "parcel_id", "reference", "ref")
_STATUS_KEYS = ("last_status", "status", "state", "situation", "new_status",
                "delivery_status", "parcel_status", "statut")


def _deep_find(obj, keys, depth=0):
    """Case-insensitive recursive search for the first matching key."""
    if depth > 6:
        return None
    if isinstance(obj, dict):
        lowered = {str(k).lower(): v for k, v in obj.items()}
        for k in keys:
            if k.lower() in lowered and not isinstance(lowered[k.lower()], (dict, list)):
                return lowered[k.lower()]
        for v in obj.values():
            found = _deep_find(v, keys, depth + 1)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for item in obj:
            found = _deep_find(item, keys, depth + 1)
            if found is not None:
                return found
    return None


def _normalize(channel: str, payload) -> tuple[Optional[str], Optional[str], bool]:
    """Return (tracking_number, raw_status, is_challenge).

    is_challenge=True means the payload is a subscription/handshake probe
    (e.g. Yalidine CRC) — answered 200 without touching orders.
    """
    if isinstance(payload, dict):
        # Yalidine/Guepex CRC subscription challenge
        if payload.get("crc_token") is not None or payload.get("subscribe") is not None:
            return None, None, True

    # Maystro: JSON body base64-encoded twice (possibly bare string body)
    if channel == "maystro":
        decoded = payload
        if isinstance(decoded, dict) and isinstance(decoded.get("data"), str):
            decoded = decoded["data"]
        if isinstance(decoded, (bytes, bytearray)):
            decoded = decoded.decode("utf-8", "ignore")
        for _ in range(3):
            if not isinstance(decoded, str):
                break
            candidate = decoded.strip().strip('"')
            try:
                raw = base64.b64decode(candidate).decode("utf-8")
            except (binascii.Error, ValueError, UnicodeDecodeError):
                break
            try:
                decoded = json.loads(raw)  # reached the JSON layer
            except ValueError:
                decoded = raw  # still base64 — loop again
        payload = decoded

    tracking = _deep_find(payload, _TRACK_KEYS)
    status = _deep_find(payload, _STATUS_KEYS)
    return (str(tracking).strip() if tracking is not None else None,
            str(status).strip() if status is not None else None,
            False)


# ---------------------------------------------------------------------------
# Public receiver
# ---------------------------------------------------------------------------

@router.post("/ecom/shipping/webhook/{channel}/{webhook_token}")
async def shipping_status_webhook(channel: str, webhook_token: str, request: Request):
    channel = channel.lower().strip()
    row = await main_db.shipping_webhook_tokens.find_one(
        {"channel": channel, "webhook_token": webhook_token}, {"_id": 0})
    if not row:
        # Unknown token: 404 (do not confirm the route shape to scanners)
        raise HTTPException(status_code=404, detail="unknown webhook")

    try:
        raw_body = await request.body()
        payload = json.loads(raw_body)
        if not isinstance(payload, (dict, list)) and isinstance(payload, str):
            pass  # bare string body (e.g. base64) — normaliser handles it
    except Exception:
        try:
            payload = raw_body.decode("utf-8", "ignore")
        except Exception:
            payload = {}

    tracking, raw_status, is_challenge = _normalize(channel, payload)

    if is_challenge:
        # Handshake probe (Yalidine CRC-style): acknowledge and stop.
        await main_db.shipping_webhook_tokens.update_one(
            {"id": row["id"]}, {"$inc": {"events_received": 1},
                                "$set": {"last_event_at": _now(), "last_event_kind": "challenge"}})
        return {"ok": True, "challenge": True}

    tenant_id = row["tenant_id"]
    tdb = _tenant_db(tenant_id)
    log_row = {
        "id": str(uuid.uuid4()),
        "kind": "shipping_webhook",
        "channel": channel,
        "tracking": tracking or "",
        "raw_status": raw_status or "",
        "payload_keys": sorted(list(payload.keys()))[:20] if isinstance(payload, dict) else [],
        "created_at": _now(),
    }

    if not tracking:
        log_row["result"] = "ignored_no_tracking"
        await tdb.shipping_activity_log.insert_one(log_row)
        return {"ok": True, "ignored": "no tracking in payload"}

    order = await tdb.ecom_orders.find_one(
        {"tracking_number": tracking}, {"_id": 0})
    if not order:
        log_row["result"] = "order_not_found"
        await tdb.shipping_activity_log.insert_one(log_row)
        return {"ok": True, "ignored": "order not found"}

    # Map courier status -> internal target
    target = None
    if channel in ("yalidine", "guepex"):
        from services.ecom.yalidine_service import map_yalidine_status
        target = map_yalidine_status(raw_status)
    if target is None:
        from services.ecom.courier_sync import map_generic_status
        integration = await tdb.ecom_integrations.find_one(
            {"channel": channel, "is_active": True}, {"_id": 0})
        target = map_generic_status(raw_status, (integration or {}).get("status_map"))

    log_row["order_id"] = order.get("id")
    log_row["order_code"] = order.get("order_code")
    log_row["mapped"] = target

    if target not in ("delivered", "refunded"):
        # transit/intermediate state — keep the raw status visible on the order
        if raw_status and order.get("courier_last_status") != raw_status:
            await tdb.ecom_orders.update_one(
                {"id": order["id"]},
                {"$set": {"courier_last_status": raw_status, "courier_last_status_at": _now()}})
            log_row["result"] = "transit_status_recorded"
        else:
            log_row["result"] = "no_change"
        await tdb.shipping_activity_log.insert_one(log_row)
        await main_db.shipping_webhook_tokens.update_one(
            {"id": row["id"]}, {"$inc": {"events_received": 1}, "$set": {"last_event_at": _now()}})
        return {"ok": True, "mapped": target}

    if order.get("status") == target:
        log_row["result"] = "already_in_target"
        await tdb.shipping_activity_log.insert_one(log_row)
        return {"ok": True, "mapped": target, "idempotent": True}

    from services.application.ecom_order_service import change_order_status
    from services.smart_notifications import notify

    sys_user = {"id": f"webhook-{channel}", "name": f"إشعار {channel} اللحظي", "email": ""}
    reason = (f"إشعار لحظي من {SUPPORTED_WEBHOOKS.get(channel, (channel,))[0]}"
              f" — {raw_status or target}")
    await change_order_status(tdb, order["id"], target, reason, sys_user)

    if target == "delivered":
        await notify(tdb, "shipment_delivered", "📦 تسليم طلب (لحظي)",
                     f"تم تسليم الطلب {order.get('order_code')} — تحقّق الربح تلقائياً",
                     link="/ecom/orders")
    else:
        await notify(tdb, "shipment_returned", "↩️ إرجاع طلب (لحظي)",
                     f"الطلب {order.get('order_code')} أُرجع — سُجّلت الخسارة وأُعيد المخزون",
                     link="/ecom/orders")

    log_row["result"] = f"advanced_to_{target}"
    await tdb.shipping_activity_log.insert_one(log_row)
    await main_db.shipping_webhook_tokens.update_one(
        {"id": row["id"]}, {"$inc": {"events_received": 1}, "$set": {"last_event_at": _now()}})
    logger.info("p284 webhook %s: order %s -> %s (tracking %s)",
                channel, order.get("order_code"), target, tracking)
    return {"ok": True, "mapped": target, "order": order.get("order_code")}


# ---------------------------------------------------------------------------
# Tenant-facing setup endpoints
# ---------------------------------------------------------------------------

def _require_tenant_dep():
    from utils.auth import require_tenant  # late import — circular-safe
    return require_tenant


@router.get("/ecom/shipping/webhook-info/{channel}")
async def webhook_info(channel: str, user: dict = Depends(_require_tenant_dep())):
    channel = channel.lower().strip()
    tenant_id = user.get("tenant_id") or user.get("id")
    if channel not in SUPPORTED_WEBHOOKS:
        return {
            "supported": False,
            "channel": channel,
            "note": "هذه الشركة لا توفّر إشعارات لحظية (Webhook) موثّقة — تبقى المزامنة الدورية التلقائية كل ساعتين فعّالة.",
        }
    row = await _ensure_token(tenant_id, channel)
    label_ar, instructions = SUPPORTED_WEBHOOKS[channel]
    return {
        "supported": True,
        "channel": channel,
        "label_ar": label_ar,
        "webhook_url": f"{PLATFORM_BASE_URL}/api/ecom/shipping/webhook/{channel}/{row['webhook_token']}",
        "instructions": instructions,
        "events_received": row.get("events_received", 0),
        "last_event_at": row.get("last_event_at"),
        "security_note": "هذا الرابط سري — لا تشاركه. يمكنك توليد رابط جديد (يبطل القديم) في أي وقت.",
    }


@router.post("/ecom/shipping/webhook-rotate/{channel}")
async def webhook_rotate(channel: str, user: dict = Depends(_require_tenant_dep())):
    channel = channel.lower().strip()
    if channel not in SUPPORTED_WEBHOOKS:
        raise HTTPException(status_code=400, detail="channel without webhook support")
    tenant_id = user.get("tenant_id") or user.get("id")
    row = await _ensure_token(tenant_id, channel)
    new_token = uuid.uuid4().hex + uuid.uuid4().hex[:16]
    await main_db.shipping_webhook_tokens.update_one(
        {"id": row["id"]},
        {"$set": {"webhook_token": new_token, "rotated_at": _now()}})
    return {"ok": True,
            "webhook_url": f"{PLATFORM_BASE_URL}/api/ecom/shipping/webhook/{channel}/{new_token}"}
