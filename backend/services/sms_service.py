"""
SMS Service - Stub for SMS sending (MOCKED)
Logs SMS messages. Replace with real provider (Twilio/etc) for production.
"""
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class SMSService:
    def __init__(self, db=None):
        self.db = db
        self.sent_count = 0

    async def send_sms(self, phone: str, message: str) -> bool:
        masked_phone = f"****{phone[-4:]}" if len(str(phone)) >= 4 else "****"
        logger.info(f"[SMS-MOCK] To: {masked_phone} | Message: {message[:80]}...")
        self.sent_count += 1
        if self.db:
            try:
                await self.db.sms_log.insert_one({
                    "phone": phone,
                    "message": message,
                    "status": "mocked",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
            except Exception:
                pass
        return True
