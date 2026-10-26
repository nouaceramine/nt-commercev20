"""Tenant SMS service backed by the configured real HTTP gateway."""
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class SMSService:
    def __init__(self, db=None):
        self.db = db
        self.sent_count = 0

    async def send_sms(self, phone: str, message: str) -> bool:
        from config.database import db as tenant_db
        from services.ecom.sms_gateway import get_sms_provider
        from services.ecom.status_sms_service import get_settings

        result = {"success": False, "provider": "unconfigured", "error": "بوابة SMS غير مهيأة"}
        try:
            settings = await get_settings(tenant_db, for_send=True)
            if settings.get("enabled") and (settings.get("provider") or {}).get("type") == "http":
                result = await get_sms_provider(settings["provider"]).send(phone, message)
            else:
                result["error"] = "خدمة SMS غير مفعّلة أو غير مرتبطة بمزود حقيقي"
            if result.get("success"):
                self.sent_count += 1
            await tenant_db.sms_log.insert_one({
                "phone": phone, "message": message,
                "status": "sent" if result.get("success") else "failed",
                "provider": result.get("provider"),
                "error": result.get("error"),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as exc:  # noqa: BLE001 — notification failures must not break sales/repairs
            logger.warning("SMS send failed: %s", type(exc).__name__)
            return False
        return bool(result.get("success"))
