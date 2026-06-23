"""
Notification Service - Handles push notifications
"""
import uuid
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class NotificationService:
    def __init__(self, main_db):
        self.db = main_db

    async def send_to_admins(self, tenant_id: str, title: str, message: str, severity: str = "info", category: str = "system") -> dict:
        try:
            await self.db.push_notifications.insert_one({
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "title": title,
                "message": message,
                "type": severity,
                "category": category,
                "read_by": [],
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as e:
            logger.error(f"Failed to send notification: {e}")

    async def send(self, tenant_id: str, title: str, message: str, severity: str = "info", category: str = "system") -> dict:
        await self.send_to_admins(tenant_id, title, message, severity, category)
