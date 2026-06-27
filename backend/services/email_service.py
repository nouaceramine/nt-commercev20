"""
Email Service — multi-provider abstraction (Resend > SendGrid > mock).

Selection order:
  1. RESEND_API_KEY  → use Resend (preferred when both keys exist)
  2. SENDGRID_API_KEY → use SendGrid
  3. Neither         → log to console as a mock (returns True so callers
                       don't surface a "send failed" toast to the user)

Runtime overrides: super-admin can save the key/sender in main_db.platform_settings
via /api/saas/email-settings — DB values take precedence over env vars, so the
operator can switch providers without redeploying.
"""
import os
import asyncio
import logging
import time

logger = logging.getLogger(__name__)

try:
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail
    SENDGRID_AVAILABLE = True
except ImportError:
    SENDGRID_AVAILABLE = False

try:
    import resend
    RESEND_AVAILABLE = True
except ImportError:
    RESEND_AVAILABLE = False


_SETTINGS_CACHE: dict = {"loaded_at": 0, "data": {}}
_SETTINGS_TTL_SEC = 60   # cheap re-read every minute; admin edits become live in <60s


async def _load_db_settings() -> dict:
    """Lazy-load email overrides from main_db.platform_settings (cached 60s)."""
    now = time.time()
    if now - _SETTINGS_CACHE["loaded_at"] < _SETTINGS_TTL_SEC:
        return _SETTINGS_CACHE["data"]
    try:
        from config.database import main_db
        doc = await main_db.platform_settings.find_one({"_id": "email_settings"}) or {}
    except Exception:
        doc = {}
    _SETTINGS_CACHE["data"] = doc
    _SETTINGS_CACHE["loaded_at"] = now
    return doc


def invalidate_email_settings_cache() -> None:
    """Call from the admin save endpoint to make changes live immediately."""
    _SETTINGS_CACHE["loaded_at"] = 0
    _SETTINGS_CACHE["data"] = {}


class EmailService:
    def __init__(self):
        self._env_resend_key = os.environ.get("RESEND_API_KEY", "").strip()
        self._env_sendgrid_key = os.environ.get("SENDGRID_API_KEY", "").strip()
        self._env_sender = os.environ.get("SENDER_EMAIL", "").strip()

    async def _resolved_config(self) -> dict:
        """Merge env vars with optional DB overrides. DB values win."""
        db_settings = await _load_db_settings()
        resend_key = (db_settings.get("resend_api_key") or self._env_resend_key or "").strip()
        sendgrid_key = (db_settings.get("sendgrid_api_key") or self._env_sendgrid_key or "").strip()
        sender = (db_settings.get("sender_email") or self._env_sender or "onboarding@resend.dev").strip()
        return {"resend_key": resend_key, "sendgrid_key": sendgrid_key, "sender": sender}

    async def _provider(self) -> str:
        cfg = await self._resolved_config()
        if RESEND_AVAILABLE and cfg["resend_key"]:
            return "resend"
        if SENDGRID_AVAILABLE and cfg["sendgrid_key"]:
            return "sendgrid"
        return "mock"

    async def _send_via_resend(self, to: str, subject: str, html: str, cfg: dict) -> bool:
        try:
            resend.api_key = cfg["resend_key"]
            params = {"from": cfg["sender"], "to": [to], "subject": subject, "html": html}
            # Resend SDK is sync — push to thread to keep the event loop free
            res = await asyncio.to_thread(resend.Emails.send, params)
            logger.info("Resend email sent to %s (id=%s)", to, (res or {}).get("id"))
            return True
        except Exception as exc:
            logger.error("Resend send failed: %s", exc)
            return False

    async def _send_via_sendgrid(self, to: str, subject: str, html: str, cfg: dict) -> bool:
        try:
            message = Mail(from_email=cfg["sender"], to_emails=to, subject=subject, html_content=html)
            sg = SendGridAPIClient(cfg["sendgrid_key"])
            await asyncio.to_thread(sg.send, message)
            logger.info("SendGrid email sent to %s: %s", to, subject)
            return True
        except Exception as exc:
            logger.error("SendGrid send failed: %s", exc)
            return False

    async def send_email(self, to: str, subject: str, html: str) -> bool:
        cfg = await self._resolved_config()
        provider = (
            "resend" if RESEND_AVAILABLE and cfg["resend_key"]
            else "sendgrid" if SENDGRID_AVAILABLE and cfg["sendgrid_key"]
            else "mock"
        )
        if provider == "resend":
            return await self._send_via_resend(to, subject, html, cfg)
        if provider == "sendgrid":
            return await self._send_via_sendgrid(to, subject, html, cfg)
        # mock — log only
        logger.info("[EMAIL-MOCK] provider=none to=%s subject=%s", to, subject)
        return True


# Module-level convenience wrapper used by other routers.
# Accepts either `html=` or `body=` (plain-text body is auto-wrapped in <pre>).
_default_service = EmailService()


async def send_email(to: str, subject: str, html: str = "", body: str = "") -> bool:
    if not to:
        raise ValueError("recipient email is required")
    content = html or f"<pre style='font-family: Arial, sans-serif; white-space: pre-wrap;'>{body}</pre>"
    return await _default_service.send_email(to=to, subject=subject, html=content)


def get_email_provider() -> str:
    """Public helper for diagnostics — returns 'resend' / 'sendgrid' / 'mock'.

    Synchronous best-effort using env vars only. For the runtime-aware value
    (including DB overrides) callers should await EmailService()._provider().
    """
    if RESEND_AVAILABLE and os.environ.get("RESEND_API_KEY"):
        return "resend"
    if SENDGRID_AVAILABLE and os.environ.get("SENDGRID_API_KEY"):
        return "sendgrid"
    return "mock"


async def get_email_provider_async() -> str:
    """DB-aware provider lookup — reflects super-admin runtime overrides."""
    return await _default_service._provider()

