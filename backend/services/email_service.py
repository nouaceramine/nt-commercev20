"""Email Service — multi-provider (Resend / SendGrid / Brevo / Mock).

Selection priority:
  1. Explicit preference saved by super-admin in DB ('provider_preference' field).
  2. Auto-fallback: first available key in this order — resend → brevo → sendgrid → mock.

Brevo (formerly Sendinblue) is the recommended provider for Algerian / MENA
tenants because Resend blocks sign-ups from many North-African countries.
Brevo's free tier offers 300 transactional emails per day.

Cached config: settings are pulled from DB once per 30s to avoid hammering
Mongo on every send. Cache is invalidated explicitly when settings change.
"""
import asyncio
import logging
import os
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ── Optional SDK imports — these only matter when their key is configured ──
try:
    import resend  # noqa: F401
    RESEND_AVAILABLE = True
except ImportError:
    RESEND_AVAILABLE = False

try:
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail
    SENDGRID_AVAILABLE = True
except ImportError:
    SENDGRID_AVAILABLE = False

# Brevo has no Python SDK dep — we call its REST API directly via httpx.
BREVO_AVAILABLE = True
BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


# ── DB settings cache (30s TTL) ─────────────────────────────────────────────
_settings_cache: dict = {"ts": 0.0, "data": None}
_CACHE_TTL = 30.0


async def _load_db_settings() -> dict:
    now = time.time()
    if _settings_cache["data"] is not None and (now - _settings_cache["ts"]) < _CACHE_TTL:
        return _settings_cache["data"]
    try:
        from config.database import main_db
        doc = await main_db.platform_settings.find_one({"_id": "email_settings"}) or {}
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to load email settings from DB: %s", exc)
        doc = {}
    _settings_cache["data"] = doc
    _settings_cache["ts"] = now
    return doc


def invalidate_email_settings_cache() -> None:
    _settings_cache["data"] = None
    _settings_cache["ts"] = 0.0


# ── Provider implementations ────────────────────────────────────────────────
class EmailService:
    def __init__(self):
        self._env_resend_key = os.environ.get("RESEND_API_KEY", "").strip()
        self._env_sendgrid_key = os.environ.get("SENDGRID_API_KEY", "").strip()
        self._env_brevo_key = os.environ.get("BREVO_API_KEY", "").strip()
        self._env_sender = os.environ.get("SENDER_EMAIL", "").strip()

    async def _resolved_config(self) -> dict:
        """Merge env vars with optional DB overrides. DB values win."""
        db_settings = await _load_db_settings()
        return {
            "resend_key":   (db_settings.get("resend_api_key")   or self._env_resend_key   or "").strip(),
            "sendgrid_key": (db_settings.get("sendgrid_api_key") or self._env_sendgrid_key or "").strip(),
            "brevo_key":    (db_settings.get("brevo_api_key")    or self._env_brevo_key    or "").strip(),
            "sender":       (db_settings.get("sender_email")     or self._env_sender       or "onboarding@resend.dev").strip(),
            "preference":   (db_settings.get("provider_preference") or "auto").strip().lower(),
        }

    @staticmethod
    def _pick_provider(cfg: dict) -> str:
        """Honour user preference if set & available, else auto-fallback."""
        pref = cfg["preference"]
        # Explicit choice ('resend', 'sendgrid', 'brevo', 'mock')
        if pref == "mock":
            return "mock"
        if pref == "resend" and RESEND_AVAILABLE and cfg["resend_key"]:
            return "resend"
        if pref == "sendgrid" and SENDGRID_AVAILABLE and cfg["sendgrid_key"]:
            return "sendgrid"
        if pref == "brevo" and cfg["brevo_key"]:
            return "brevo"
        # Auto-fallback chain — Brevo prioritised over Resend for MENA-region tenants.
        if cfg["brevo_key"]:
            return "brevo"
        if RESEND_AVAILABLE and cfg["resend_key"]:
            return "resend"
        if SENDGRID_AVAILABLE and cfg["sendgrid_key"]:
            return "sendgrid"
        return "mock"

    async def _provider(self) -> str:
        return self._pick_provider(await self._resolved_config())

    # ── Send paths ─────────────────────────────────────────────────────────
    async def _send_via_resend(self, to: str, subject: str, html: str, cfg: dict) -> bool:
        try:
            import resend as _r
            _r.api_key = cfg["resend_key"]
            _sender = cfg["sender"]
            _from = _sender if "<" in _sender else f"NT Commerce <{_sender}>"  # p157: display name
            params = {"from": _from, "to": [to], "subject": subject, "html": html}
            res = await asyncio.to_thread(_r.Emails.send, params)
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

    async def _send_via_brevo(self, to: str, subject: str, html: str, cfg: dict) -> bool:
        """Brevo (Sendinblue) — direct REST call. Works from Algeria/MENA."""
        sender_email = cfg["sender"]
        # Brevo expects {sender: {email, name?}, to: [{email, name?}], subject, htmlContent}
        payload = {
            "sender":      {"email": sender_email, "name": "NT Commerce"},
            "to":          [{"email": to}],
            "subject":     subject,
            "htmlContent": html,
        }
        headers = {
            "api-key": cfg["brevo_key"],
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(BREVO_API_URL, headers=headers, json=payload)
            if resp.status_code in (200, 201, 202):
                msg_id = (resp.json() or {}).get("messageId", "?")
                logger.info("Brevo email sent to %s (messageId=%s)", to, msg_id)
                return True
            logger.error("Brevo HTTP %s: %s", resp.status_code, resp.text[:300])
            return False
        except Exception as exc:
            logger.error("Brevo send crashed: %s", exc)
            return False

    async def send_email(self, to: str, subject: str, html: str) -> bool:
        cfg = await self._resolved_config()
        provider = self._pick_provider(cfg)
        if provider == "resend":
            return await self._send_via_resend(to, subject, html, cfg)
        if provider == "sendgrid":
            return await self._send_via_sendgrid(to, subject, html, cfg)
        if provider == "brevo":
            return await self._send_via_brevo(to, subject, html, cfg)
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


async def get_active_provider() -> str:
    """DB-aware active provider name (p53) — reflects the super-admin's saved
    preference / configured keys, falling back to env-only detection."""
    try:
        cfg = await _default_service._resolved_config()
        return _default_service._pick_provider(cfg)
    except Exception:  # noqa: BLE001
        return get_email_provider()


def get_email_provider() -> str:
    """Public helper for diagnostics — env-only (no DB lookup)."""
    if os.environ.get("BREVO_API_KEY"):
        return "brevo"
    if RESEND_AVAILABLE and os.environ.get("RESEND_API_KEY"):
        return "resend"
    if SENDGRID_AVAILABLE and os.environ.get("SENDGRID_API_KEY"):
        return "sendgrid"
    return "mock"


async def get_email_provider_async() -> str:
    """DB-aware provider lookup — reflects super-admin runtime overrides."""
    return await _default_service._provider()


__all__ = [
    "EmailService",
    "send_email",
    "get_email_provider",
    "get_email_provider_async",
    "invalidate_email_settings_cache",
    "RESEND_AVAILABLE",
    "SENDGRID_AVAILABLE",
    "BREVO_AVAILABLE",
]
