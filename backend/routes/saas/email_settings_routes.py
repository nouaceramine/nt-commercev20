"""Super-Admin Email Settings Route (iter 18.2)

Allows the operator to configure RESEND_API_KEY / SENDGRID_API_KEY / SENDER_EMAIL
at runtime via the admin UI — no redeploy needed. Values are stored in
main_db.platform_settings with _id='email_settings'.

Secrets are returned MASKED in GET responses (only last 4 chars).
"""
from fastapi import APIRouter, Depends, HTTPException, Header
from datetime import datetime, timezone

from config.database import main_db
from services.email_service import (
    EmailService,
    invalidate_email_settings_cache,
    get_email_provider_async,
)
from .helpers import get_super_admin

router = APIRouter(tags=["SaaS Email Settings"])


def _mask(value: str) -> str:
    """Return last 4 chars only, prefixed with dots."""
    if not value:
        return ""
    if len(value) <= 4:
        return "••••"
    return "••••" + value[-4:]


@router.get("/saas/email-settings")
async def get_email_settings(admin: dict = Depends(get_super_admin)):
    """Current effective email settings — keys MASKED. Includes the active provider."""
    doc = await main_db.platform_settings.find_one({"_id": "email_settings"}) or {}
    return {
        "provider":             await get_email_provider_async(),
        "provider_preference":  doc.get("provider_preference") or "auto",
        "sender_email":         doc.get("sender_email") or "",
        "resend_api_key_masked":   _mask(doc.get("resend_api_key", "")),
        "sendgrid_api_key_masked": _mask(doc.get("sendgrid_api_key", "")),
        "brevo_api_key_masked":    _mask(doc.get("brevo_api_key", "")),
        "has_resend_key":   bool(doc.get("resend_api_key")),
        "has_sendgrid_key": bool(doc.get("sendgrid_api_key")),
        "has_brevo_key":    bool(doc.get("brevo_api_key")),
        "updated_at":       doc.get("updated_at"),
    }


@router.put("/saas/email-settings")
async def update_email_settings(body: dict, admin: dict = Depends(get_super_admin)):
    """Save email provider settings. Empty string clears a key; null/missing keeps it.

    Body: {resend_api_key?, sendgrid_api_key?, brevo_api_key?, sender_email?, provider_preference?}

    provider_preference: 'auto' | 'resend' | 'sendgrid' | 'brevo' | 'mock'
    """
    existing = await main_db.platform_settings.find_one({"_id": "email_settings"}) or {}
    updates = {"updated_at": datetime.now(timezone.utc).isoformat(), "updated_by": admin.get("id")}

    for key in ("resend_api_key", "sendgrid_api_key", "brevo_api_key", "sender_email", "provider_preference"):
        if key in body:
            val = body[key]
            if val is None:
                continue
            cleaned = str(val).strip()
            if key == "provider_preference" and cleaned not in ("auto", "resend", "sendgrid", "brevo", "mock"):
                raise HTTPException(status_code=400, detail=f"قيمة مزوِّد غير صالحة: {cleaned}")
            updates[key] = cleaned

    merged = {**existing, **updates, "_id": "email_settings"}
    await main_db.platform_settings.update_one(
        {"_id": "email_settings"},
        {"$set": merged},
        upsert=True,
    )
    invalidate_email_settings_cache()
    return {
        "ok": True,
        "provider": await get_email_provider_async(),
        "saved_keys": [k for k in ("resend_api_key", "sendgrid_api_key", "brevo_api_key", "sender_email", "provider_preference") if k in updates],
    }


@router.post("/saas/email-settings/test")
async def test_email_settings(body: dict, admin: dict = Depends(get_super_admin)):
    """Send a real test email to the provided address to validate the current setup."""
    to = (body.get("to") or "").strip()
    if not to or "@" not in to:
        raise HTTPException(status_code=400, detail="عنوان بريد صالح مطلوب")

    invalidate_email_settings_cache()
    service = EmailService()
    success = await service.send_email(
        to=to,
        subject="✉️ اختبار إعدادات البريد — NT Commerce",
        html=(
            "<div style='font-family:Arial,sans-serif;padding:20px;direction:rtl'>"
            "<h2 style='color:#10b981'>✅ تم استلام الرسالة بنجاح</h2>"
            "<p>هذه رسالة تجريبية للتأكد من صحة إعدادات البريد على منصة NT Commerce.</p>"
            f"<p>المُرسَل في: {datetime.now(timezone.utc).isoformat()}</p>"
            "</div>"
        ),
    )
    return {
        "ok": success,
        "provider": await get_email_provider_async(),
        "message": "تم الإرسال (تحقق من البريد)" if success else "فشل الإرسال — راجع المفاتيح والـ sender",
    }


# ── p153: Platform Telegram alert settings ──────────────────────────────────
# UI-driven config for scripts/alert.sh (backups, health monitor, deploys).
# alert.sh reads /opt/ntcommerce/.alert.env first; when absent it fetches this
# DB-backed config via the /internal/alert-config endpoint below.

@router.get("/saas/alert-settings")
async def get_alert_settings(admin: dict = Depends(get_super_admin)):
    doc = await main_db.platform_settings.find_one({"_id": "alert_settings"}) or {}
    tok = doc.get("telegram_bot_token", "")
    return {
        "has_token": bool(tok),
        "token_masked": _mask(tok),
        "chat_id": doc.get("telegram_chat_id", ""),
        "updated_at": doc.get("updated_at"),
    }


@router.put("/saas/alert-settings")
async def update_alert_settings(body: dict, admin: dict = Depends(get_super_admin)):
    existing = await main_db.platform_settings.find_one({"_id": "alert_settings"}) or {}
    updates = {"updated_at": datetime.now(timezone.utc).isoformat(), "updated_by": admin.get("id")}
    if body.get("telegram_bot_token"):
        tok = str(body["telegram_bot_token"]).strip()
        if ":" not in tok:
            raise HTTPException(status_code=400, detail="صيغة توكن البوت غير صحيحة (يجب أن تحتوي :)")
        updates["telegram_bot_token"] = tok
    if "telegram_chat_id" in body:
        updates["telegram_chat_id"] = str(body["telegram_chat_id"]).strip()
    merged = {**existing, **updates, "_id": "alert_settings"}
    await main_db.platform_settings.update_one({"_id": "alert_settings"}, {"$set": merged}, upsert=True)
    return {"ok": True}


@router.post("/saas/alert-settings/test")
async def test_alert_settings(admin: dict = Depends(get_super_admin)):
    doc = await main_db.platform_settings.find_one({"_id": "alert_settings"}) or {}
    tok = doc.get("telegram_bot_token", "")
    chat = doc.get("telegram_chat_id", "")
    if not tok or not chat:
        raise HTTPException(status_code=400, detail="احفظ توكن البوت ومعرّف المحادثة أولاً")
    import httpx as _httpx
    try:
        async with _httpx.AsyncClient(timeout=12.0) as cl:
            resp = await cl.post(
                f"https://api.telegram.org/bot{tok}/sendMessage",
                json={"chat_id": chat, "text": "✅ اختبار تنبيهات NT Commerce — الإعداد يعمل بنجاح"},
            )
        data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        if resp.status_code == 200 and data.get("ok"):
            return {"ok": True, "message": "أُرسلت رسالة الاختبار — تحقق من Telegram"}
        detail = data.get("description") or resp.text[:200]
        return {"ok": False, "message": f"رفض Telegram: {detail}"}
    except Exception as exc:
        return {"ok": False, "message": f"تعذّر الاتصال بـ Telegram: {str(exc)[:120]}"}


@router.get("/internal/alert-config")
async def internal_alert_config(x_internal_key: str = Header("")):
    """Machine-to-machine config for scripts/alert.sh — guarded by ALERT_INTERNAL_KEY."""
    import os as _os
    expected = _os.environ.get("ALERT_INTERNAL_KEY", "")
    if not expected or x_internal_key != expected:
        raise HTTPException(status_code=404, detail="Not found")
    doc = await main_db.platform_settings.find_one({"_id": "alert_settings"}) or {}
    return {
        "token": doc.get("telegram_bot_token", ""),
        "chat_id": doc.get("telegram_chat_id", ""),
    }
