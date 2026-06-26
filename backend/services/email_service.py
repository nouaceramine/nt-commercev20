"""
Email Service — multi-provider abstraction (Resend > SendGrid > mock).

Selection order:
  1. RESEND_API_KEY  → use Resend (preferred when both keys exist)
  2. SENDGRID_API_KEY → use SendGrid
  3. Neither         → log to console as a mock (returns True so callers
                       don't surface a "send failed" toast to the user)
"""
import os
import asyncio
import logging

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


class EmailService:
    def __init__(self):
        self.resend_key = os.environ.get("RESEND_API_KEY", "").strip()
        self.sendgrid_key = os.environ.get("SENDGRID_API_KEY", "").strip()
        self.sender = os.environ.get("SENDER_EMAIL", "").strip()
        # Resend will reject sends from unverified domains — warn loudly at
        # startup when the key is set but the sender is missing or pointing
        # at the Resend sandbox so this isn't a silent production failure.
        if self.resend_key and (not self.sender or self.sender == "onboarding@resend.dev"):
            logger.warning(
                "RESEND_API_KEY is set but SENDER_EMAIL is %s — real sends will "
                "be rejected unless you configure a verified sender domain.",
                "missing" if not self.sender else "the Resend sandbox default",
            )
        if not self.sender:
            self.sender = "onboarding@resend.dev"

    @property
    def provider(self) -> str:
        if RESEND_AVAILABLE and self.resend_key:
            return "resend"
        if SENDGRID_AVAILABLE and self.sendgrid_key:
            return "sendgrid"
        return "mock"

    async def _send_via_resend(self, to: str, subject: str, html: str) -> bool:
        try:
            resend.api_key = self.resend_key
            params = {"from": self.sender, "to": [to], "subject": subject, "html": html}
            # Resend SDK is sync — push to thread to keep the event loop free
            res = await asyncio.to_thread(resend.Emails.send, params)
            logger.info("Resend email sent to %s (id=%s)", to, (res or {}).get("id"))
            return True
        except Exception as exc:
            logger.error("Resend send failed: %s", exc)
            return False

    async def _send_via_sendgrid(self, to: str, subject: str, html: str) -> bool:
        try:
            message = Mail(from_email=self.sender, to_emails=to, subject=subject, html_content=html)
            sg = SendGridAPIClient(self.sendgrid_key)
            await asyncio.to_thread(sg.send, message)
            logger.info("SendGrid email sent to %s: %s", to, subject)
            return True
        except Exception as exc:
            logger.error("SendGrid send failed: %s", exc)
            return False

    async def send_email(self, to: str, subject: str, html: str) -> bool:
        provider = self.provider
        if provider == "resend":
            return await self._send_via_resend(to, subject, html)
        if provider == "sendgrid":
            return await self._send_via_sendgrid(to, subject, html)
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
    """Public helper for diagnostics — returns 'resend' / 'sendgrid' / 'mock'."""
    return _default_service.provider

