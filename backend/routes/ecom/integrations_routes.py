"""E-Commerce Hub: Channel Integrations CRUD

A channel integration is a per-tenant connection to an external sales channel
(Shopify, Meta, TikTok, WhatsApp Cloud API, Telegram Bot, Viber).

Stored in tenant_db.ecom_integrations. Credentials are kept opaque (dict) so
each channel can have its own auth shape. Real channels are added in P2+.
Until then, integrations remain in "mock" mode and webhook/poll workers no-op.
"""
from datetime import datetime, timezone
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException

from config.database import db
from utils.auth import require_tenant
from .constants import CHANNELS, CHANNEL_KEYS, require_ecom_feature
from services.crypto_fields import (
    encrypt_credentials as _encrypt_creds,
    decrypt_credentials as _decrypt_creds,
    decrypt_field as _decrypt_field,
)  # p272

router = APIRouter(tags=["E-Commerce Integrations"])


# Public-safe projection: omit secrets when listing.
def _redact(integration: dict) -> dict:
    """Return integration with credentials masked (keys preserved, values hidden)."""
    if not integration:
        return integration
    creds = integration.get("credentials") or {}
    integration["credentials_keys"] = list(creds.keys())
    integration["credentials"] = {  # p272: decrypt before masking (at-rest encrypted)
        k: ("••••" + str(_decrypt_field(v) or "")[-4:] if v else "")
        for k, v in creds.items()
    }
    return integration


@router.get("/ecom/channels")
async def list_supported_channels(user: dict = Depends(require_tenant)):
    """Return the catalogue of supported channels (static reference).

    Filters out POS / manual (not connectable). Includes shipping carriers
    (kind='shipping') so the UI can show one unified Connect list.
    """
    await require_ecom_feature(user)
    return {
        "channels": [
            {"key": k, **meta} for k, meta in CHANNELS.items() if k not in ("pos", "manual")
        ]
    }


@router.get("/ecom/integrations")
async def list_integrations(user: dict = Depends(require_tenant)):
    """List all channel integrations configured by the current tenant."""
    await require_ecom_feature(user)
    rows = await db.ecom_integrations.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": [_redact(r) for r in rows]}


PLATFORM_BASE_URL = "https://nt-commerce.net"


async def _ping_meta_channel(integration: dict) -> dict:
    """p274: real Graph API ping for Meta channels (whatsapp/facebook/messenger/instagram)."""
    import httpx
    creds = _decrypt_creds(integration.get("credentials") or {})
    channel = integration.get("channel", "")
    mode = integration.get("mode", "live")
    token = (creds.get("access_token") or "").strip()
    if not token:
        return {"ok": False, "mode": mode, "channel": channel,
                "error": "missing_token", "message": "❌ أدخل Access Token أولاً"}
    if channel == "whatsapp":
        node = (creds.get("phone_number_id") or "").strip()
        fields = "display_phone_number,verified_name"
        label = "واتساب"
    elif channel == "instagram":
        node = (creds.get("account_id") or "").strip()
        fields = "username"
        label = "إنستغرام"
    else:  # facebook / messenger → Page Access Token
        node = (creds.get("page_id") or "").strip()
        fields = "name"
        label = "صفحة فيسبوك"
    if not node:
        return {"ok": False, "mode": mode, "channel": channel,
                "error": "missing_id", "message": "❌ أدخل معرّف العقدة (phone_number_id / page_id / account_id) أولاً"}
    try:
        async with httpx.AsyncClient(timeout=12.0) as cl:
            r = await cl.get(
                f"https://graph.facebook.com/v21.0/{node}",
                params={"fields": fields},
                headers={"Authorization": f"Bearer {token}"},
            )
        data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        if r.status_code == 200 and data.get("id"):
            name = (data.get("verified_name") or data.get("name") or data.get("username")
                    or data.get("display_phone_number") or node)
            return {"ok": True, "mode": "live", "channel": channel, "details": data,
                    "message": f"✅ متصل بنجاح بـ {label} — {name}"}
        err = ((data or {}).get("error") or {}).get("message") or r.text[:150]
        return {"ok": False, "mode": mode, "channel": channel, "error": err,
                "message": f"❌ رفض Meta: {err}"}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "mode": mode, "channel": channel, "error": str(exc)[:150],
                "message": f"❌ تعذّر الوصول إلى Meta: {str(exc)[:120]}"}


@router.get("/ecom/social-setup-info")
async def social_setup_info(user: dict = Depends(require_tenant)):
    """p274: guided-connection data for the social-channels wizard (static guidance)."""
    await require_ecom_feature(user)
    wa_hook = f"{PLATFORM_BASE_URL}/api/integrations/whatsapp/webhook"
    return {
        "platform_webhook_url": wa_hook,
        "channels": {
            "whatsapp": {
                "title_ar": "واتساب للأعمال (Cloud API)",
                "steps_ar": [
                    "افتح developers.facebook.com وأنشئ تطبيقاً من نوع «Business» (أو استعمل تطبيقاً موجوداً).",
                    "أضِف منتج «WhatsApp» إلى التطبيق واربط رقم هاتفك التجاري.",
                    "من لوحة WhatsApp ← «API Setup» انسخ «Phone Number ID» وأنشئ توكن دائماً (System User Token بصلاحية whatsapp_business_messaging).",
                    "ألصق القيمتين في الخطوة التالية ثم اضغط «حفظ واختبار».",
                    "لاستقبال الرسائل الواردة: في إعدادات Webhook داخل تطبيق Meta ألصق رابط الويب هوك أدناه (اختر أي Verify Token — المنصة تقبله) واشترك في حقل messages.",
                ],
                "webhook_url": wa_hook,
                "fields": [["phone_number_id", "Phone Number ID"], ["access_token", "WhatsApp Cloud API Token"]],
            },
            "facebook": {
                "title_ar": "صفحة فيسبوك",
                "steps_ar": [
                    "افتح developers.facebook.com وأنشئ تطبيقاً وأضف منتج «Messenger».",
                    "اربط صفحتك بالتطبيق من Messenger ← Settings ← Access Tokens.",
                    "ولّد «Page Access Token» للصفحة وانسخه مع معرّف الصفحة (Page ID).",
                    "ألصق القيمتين في الخطوة التالية ثم اضغط «حفظ واختبار».",
                ],
                "webhook_url": "",
                "fields": [["page_id", "معرّف صفحة Facebook"], ["access_token", "Page Access Token"]],
            },
            "messenger": {
                "title_ar": "ماسنجر",
                "steps_ar": [
                    "ماسنجر يعمل عبر صفحة فيسبوك: أنشئ تطبيقاً على developers.facebook.com وأضف منتج «Messenger».",
                    "اربط صفحتك من Messenger ← Settings ← Access Tokens وولّد «Page Access Token».",
                    "انسخ معرّف الصفحة (Page ID) والتوكن وألصقهما في الخطوة التالية ثم اضغط «حفظ واختبار».",
                    "لاستقبال رسائل ماسنجر: فعّل Webhooks لحقل messages في تطبيق Meta (نفس رابط الويب هوك للمنصة).",
                ],
                "webhook_url": wa_hook,
                "fields": [["page_id", "معرّف صفحة Facebook"], ["access_token", "Page Access Token"]],
            },
            "instagram": {
                "title_ar": "إنستغرام للأعمال",
                "steps_ar": [
                    "حوّل حساب إنستغرام إلى حساب «Business» واربطه بصفحة فيسبوك.",
                    "من developers.facebook.com أنشئ تطبيقاً وأضف منتج «Instagram» (أو Messenger مع دعم Instagram).",
                    "انسخ «Instagram Business Account ID» وولّد Access Token بصلاحية instagram_manage_messages.",
                    "ألصق القيمتين في الخطوة التالية ثم اضغط «حفظ واختبار».",
                ],
                "webhook_url": "",
                "fields": [["account_id", "معرّف حساب Instagram Business"], ["access_token", "Access Token"]],
            },
        },
    }


@router.post("/ecom/integrations")
async def create_integration(body: dict, user: dict = Depends(require_tenant)):
    """Create a new channel integration for the current tenant.

    Body: {channel: 'shopify'|'facebook'|'yalidine'|..., name: str, credentials: dict, is_active?: bool}
    """
    await require_ecom_feature(user)
    channel = (body.get("channel") or "").strip().lower()
    if channel not in CHANNEL_KEYS or channel in ("pos", "manual"):
        raise HTTPException(status_code=400, detail=f"قناة غير مدعومة: {channel}")

    name = (body.get("name") or CHANNELS[channel]["label_ar"]).strip()
    credentials = body.get("credentials") or {}
    if not isinstance(credentials, dict):
        raise HTTPException(status_code=400, detail="credentials يجب أن يكون كائن JSON")

    # If credentials are populated, mark mode='live' so the UI shows the real status.
    has_real_creds = any(bool(str(v).strip()) for v in credentials.values())
    credentials = _encrypt_creds(credentials)  # p272: secrets encrypted at rest

    integration_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    kind = CHANNELS[channel].get("kind", "sales")  # 'sales' (default) or 'shipping'
    doc = {
        "id": integration_id,
        "channel": channel,
        "kind": kind,
        "name": name,
        "credentials": credentials,
        "return_fee": max(0.0, float(body.get("return_fee") or 0)),  # p59: courier return price
        "is_active": bool(body.get("is_active", True)),
        "mode": "live" if has_real_creds else "mock",
        "last_sync_at": None,
        "last_error": None,
        "stats": {"orders": 0, "leads": 0, "shipments": 0},
        "created_at": now,
        "updated_at": now,
        "created_by": user.get("id"),
    }
    await db.ecom_integrations.insert_one(doc)
    doc.pop("_id", None)
    return _redact(doc)


@router.put("/ecom/integrations/{integration_id}")
async def update_integration(integration_id: str, body: dict, user: dict = Depends(require_tenant)):
    """Update an integration. Only mutable fields are name, credentials, is_active."""
    await require_ecom_feature(user)
    existing = await db.ecom_integrations.find_one({"id": integration_id})
    if not existing:
        raise HTTPException(status_code=404, detail="التكامل غير موجود")

    updates: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if "name" in body:
        updates["name"] = (body["name"] or "").strip()
    if "is_active" in body:
        updates["is_active"] = bool(body["is_active"])
    if "return_fee" in body:  # p59
        try:
            updates["return_fee"] = max(0.0, float(body["return_fee"] or 0))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="سعر الإرجاع يجب أن يكون رقماً")
    if "credentials" in body and isinstance(body["credentials"], dict):
        # Merge — clients can send {api_key: 'new'} without resending all keys.
        merged = {**_decrypt_creds(existing.get("credentials") or {}), **body["credentials"]}  # p272
        updates["credentials"] = _encrypt_creds(merged)  # p272

    await db.ecom_integrations.update_one({"id": integration_id}, {"$set": updates})
    refreshed = await db.ecom_integrations.find_one({"id": integration_id}, {"_id": 0})
    return _redact(refreshed)


@router.post("/ecom/integrations/{integration_id}/test")
async def test_integration(integration_id: str, user: dict = Depends(require_tenant)):
    """Live ping of the integration's real API.

    Dispatches by channel:
      • shopify  → GET /admin/api/2024-10/shop.json
      • yalidine → GET /v1/wilayas/  (returns count + sample wilaya)
      • others   → mock-mode response until those providers get a ping helper

    Always 200 — the response body's `ok` / `error` fields tell the UI which
    integrations actually work and which need credential fixes.
    """
    await require_ecom_feature(user)
    existing = await db.ecom_integrations.find_one({"id": integration_id})
    if not existing:
        raise HTTPException(status_code=404, detail="التكامل غير موجود")
    channel = existing.get("channel", "")
    mode = existing.get("mode", "mock")

    # ── Mock mode — simulated integration, no live ping ──────────────
    if mode == "mock":
        return {
            "ok": True,
            "mode": "mock",
            "channel": channel,
            "message": "وضع المحاكاة — الاتصال محاكى ولا يتم فحص المزود الحقيقي.",
        }

    # ── Shopify ──────────────────────────────────────────────────────
    if channel == "shopify":
        from services.ecom.shopify_service import ping as shopify_ping, ShopifyAPIError
        try:
            data = await shopify_ping(existing)
            return {"ok": True, "mode": "live", "channel": "shopify", "details": data,
                    "message": f"✅ متصل بنجاح بمتجر '{data.get('shop_name')}'"}
        except ShopifyAPIError as exc:
            return {"ok": False, "mode": mode, "channel": "shopify", "error": str(exc),
                    "message": f"❌ فشل الاتصال: {exc}"}

    # ── Yalidine ─────────────────────────────────────────────────────
    if channel == "yalidine":
        from services.ecom.yalidine_service import (
            ping as yali_ping, YalidineCredentialsMissing, YalidineAPIError,
        )
        try:
            data = await yali_ping(existing)
            return {"ok": True, "mode": "live", "channel": "yalidine", "details": data,
                    "message": f"✅ متصل بنجاح بـ Yalidine — {data.get('wilayas_count')} ولاية متاحة"}
        except (YalidineCredentialsMissing, YalidineAPIError) as exc:
            return {"ok": False, "mode": mode, "channel": "yalidine", "error": str(exc),
                    "message": f"❌ {exc}"}

    # ── Meta channels (p274): real Graph API ping ────────────────────
    if channel in ("whatsapp", "facebook", "messenger", "instagram"):
        return await _ping_meta_channel(existing)

    # ── Others (TikTok / Telegram / Viber) ───────────────────────────
    # No live ping helper yet — surface mock status honestly.
    return {
        "ok": True,
        "mode": mode,
        "channel": channel,
        "message": "وضع المحاكاة — لم يُضَف فحص الاتصال الحقيقي لهذه القناة بعد.",
    }


@router.delete("/ecom/integrations/{integration_id}")
async def delete_integration(integration_id: str, user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    result = await db.ecom_integrations.delete_one({"id": integration_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="التكامل غير موجود")
    return {"ok": True, "deleted": integration_id}
