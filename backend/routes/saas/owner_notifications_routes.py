"""p344: owner-notification settings + test (super-admin only).

- GET  /api/saas/owner-notifications        → current config (token masked)
- PUT  /api/saas/owner-notifications        → save email / telegram token+chat
- POST /api/saas/owner-notifications/test   → send a test alert on both channels
"""
from fastapi import APIRouter, Depends

from .helpers import get_super_admin
from services import owner_notifier

router = APIRouter(tags=["Owner Notifications"])


def _public(cfg: dict) -> dict:
    tok = cfg.get("telegram_bot_token") or ""
    return {
        "email": cfg.get("email", ""),
        "telegram_chat_id": cfg.get("telegram_chat_id", ""),
        "telegram_bot_token_set": bool(tok),
        "telegram_bot_token_hint": (tok[:6] + "…" + tok[-4:]) if len(tok) > 12 else ("set" if tok else ""),
        "on_error": cfg.get("on_error", True),
        "on_fixed": cfg.get("on_fixed", True),
    }


@router.get("/saas/owner-notifications")
async def get_settings(admin=Depends(get_super_admin)):
    return _public(await owner_notifier.get_owner_notification_settings())


@router.put("/saas/owner-notifications")
async def save_settings(body: dict, admin=Depends(get_super_admin)):
    cfg = await owner_notifier.save_owner_notification_settings(body)
    return _public(cfg)


@router.post("/saas/owner-notifications/test")
async def send_test(admin=Depends(get_super_admin)):
    sent = await owner_notifier.notify_module_event(
        "fixed", "owner_notifications", "إشعارات المالك",
        "رسالة تجريبية من لوحة السوبر أدمن",
    )
    return {"sent": sent}
