"""Super-Admin Email Settings Route (iter 18.2)

Allows the operator to configure RESEND_API_KEY / SENDGRID_API_KEY / SENDER_EMAIL
at runtime via the admin UI — no redeploy needed. Values are stored in
main_db.platform_settings with _id='email_settings'.

Secrets are returned MASKED in GET responses (only last 4 chars).
"""
from fastapi import APIRouter, Depends, HTTPException
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
        "provider": await get_email_provider_async(),
        "sender_email": doc.get("sender_email") or "",
        "resend_api_key_masked": _mask(doc.get("resend_api_key", "")),
        "sendgrid_api_key_masked": _mask(doc.get("sendgrid_api_key", "")),
        "has_resend_key": bool(doc.get("resend_api_key")),
        "has_sendgrid_key": bool(doc.get("sendgrid_api_key")),
        "updated_at": doc.get("updated_at"),
    }


@router.put("/saas/email-settings")
async def update_email_settings(body: dict, admin: dict = Depends(get_super_admin)):
    """Save email provider settings. Empty string clears a key; null/missing keeps it.

    Body: {resend_api_key?: str|null, sendgrid_api_key?: str|null, sender_email?: str|null}
    """
    existing = await main_db.platform_settings.find_one({"_id": "email_settings"}) or {}
    updates = {"updated_at": datetime.now(timezone.utc).isoformat(), "updated_by": admin.get("id")}

    for key in ("resend_api_key", "sendgrid_api_key", "sender_email"):
        if key in body:
            val = body[key]
            if val is None:
                continue
            updates[key] = str(val).strip()

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
        "saved_keys": [k for k in ("resend_api_key", "sendgrid_api_key", "sender_email") if k in updates],
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
