"""
p344: Owner Notifier — email + Telegram alerts for the platform owner.

Configuration lives in main_db.platform_settings {_id: "owner_notifications"}:
    email               → owner email (Resend via services.email_service)
    telegram_bot_token  → platform bot token (owner provides it)
    telegram_chat_id    → owner chat id
    on_error / on_fixed → toggles (default True)

notify_module_event() is called by services/module_watchdog on the
ok→failing and failing→ok transitions. It never raises.
"""
import logging
import os
from datetime import datetime, timezone

from config.database import main_db

logger = logging.getLogger(__name__)

_DOC_ID = "owner_notifications"


async def get_owner_notification_settings() -> dict:
    doc = await main_db.platform_settings.find_one({"_id": _DOC_ID}, {"_id": 0}) or {}
    return {
        "email": doc.get("email") or os.environ.get("OWNER_EMAIL", ""),
        "telegram_bot_token": doc.get("telegram_bot_token") or os.environ.get("TELEGRAM_BOT_TOKEN", ""),
        "telegram_chat_id": doc.get("telegram_chat_id") or os.environ.get("TELEGRAM_CHAT_ID", ""),
        "on_error": doc.get("on_error", True),
        "on_fixed": doc.get("on_fixed", True),
    }


async def save_owner_notification_settings(data: dict) -> dict:
    allowed = {"email", "telegram_bot_token", "telegram_chat_id", "on_error", "on_fixed"}
    clean = {k: v for k, v in data.items() if k in allowed}
    await main_db.platform_settings.update_one(
        {"_id": _DOC_ID}, {"$set": clean}, upsert=True
    )
    return await get_owner_notification_settings()


def _mask(s: str) -> str:
    if not s:
        return ""
    return s[:4] + "…" + s[-4:] if len(s) > 10 else "…"


async def _send_telegram(token: str, chat_id: str, text: str) -> bool:
    import httpx
    async with httpx.AsyncClient(timeout=10) as cli:
        resp = await cli.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text},
        )
    if resp.status_code != 200:
        logger.warning("telegram send failed: %s %s", resp.status_code, resp.text[:200])
        return False
    return True


async def notify_module_event(kind: str, component_key: str, name_ar: str, detail: str) -> dict:
    """kind: 'error' | 'fixed'. Returns per-channel delivery report."""
    cfg = await get_owner_notification_settings()
    if kind == "error" and not cfg.get("on_error", True):
        return {"skipped": "on_error off"}
    if kind == "fixed" and not cfg.get("on_fixed", True):
        return {"skipped": "on_fixed off"}

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    if kind == "error":
        title = f"🔴 خلل في وحدة «{name_ar}»"
        body = (f"{title}\n\nالوحدة: {component_key}\nالوقت: {now}\n"
                f"التفاصيل: {detail}\n\nسجل أخطاء النظام + AutoHeal تم تفعيلهما تلقائياً.")
        subject = f"NT Commerce — خلل في وحدة {name_ar}"
    else:
        title = f"🟢 تم إصلاح وحدة «{name_ar}»"
        body = f"{title}\n\nالوحدة: {component_key}\nالوقت: {now}\nالتفاصيل: {detail}"
        subject = f"NT Commerce — إصلاح تلقائي: {name_ar}"

    sent = {"email": False, "telegram": False}

    if cfg.get("email"):
        try:
            from services.email_service import send_email
            html = (f"<div dir='rtl' style='font-family:Arial'>"
                    f"<h3>{title}</h3><p><b>الوحدة:</b> {component_key}</p>"
                    f"<p><b>الوقت:</b> {now}</p>"
                    f"<p><b>التفاصيل:</b> {detail}</p></div>")
            sent["email"] = bool(await send_email(cfg["email"], subject, html=html))
        except Exception:  # noqa: BLE001
            logger.warning("owner email notify failed", exc_info=True)

    if cfg.get("telegram_bot_token") and cfg.get("telegram_chat_id"):
        try:
            sent["telegram"] = await _send_telegram(
                cfg["telegram_bot_token"], cfg["telegram_chat_id"], body
            )
        except Exception:  # noqa: BLE001
            logger.warning("owner telegram notify failed", exc_info=True)

    try:
        await main_db.owner_notifications_log.insert_one({
            "kind": kind, "component_key": component_key, "name_ar": name_ar,
            "detail": detail, "sent": sent, "at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:  # noqa: BLE001
        pass
    return sent
