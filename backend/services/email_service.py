"""
Email Service - Wraps SendGrid/Resend for sending emails
"""
import os
import logging

logger = logging.getLogger(__name__)

try:
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail
    SENDGRID_AVAILABLE = True
except ImportError:
    SENDGRID_AVAILABLE = False


class EmailService:
    def __init__(self):
        self.sendgrid_key = os.environ.get("SENDGRID_API_KEY", "")
        self.sender = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")

    async def send_email(self, to: str, subject: str, html: str) -> bool:
        if not SENDGRID_AVAILABLE or not self.sendgrid_key:
            logger.info(f"[EMAIL-MOCK] To: {to} | Subject: {subject}")
            return True
        try:
            message = Mail(
                from_email=self.sender,
                to_emails=to,
                subject=subject,
                html_content=html,
            )
            sg = SendGridAPIClient(self.sendgrid_key)
            sg.send(message)
            logger.info(f"Email sent to {to}: {subject}")
            return True
        except Exception as e:
            logger.error(f"Email send failed: {e}")
            return False
