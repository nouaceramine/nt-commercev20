"""
Notification Center Service
Real-time notifications for users + platform push notifications for robots.

Merged (v16): the class supports BOTH usage styles:
  - Instance-based (main.py: NotificationService(main_db)) -> send/send_to_admins
    used by RobotManager and robots (writes to push_notifications).
  - Stateless per-call db (routes/notification_routes.py) -> create_notification,
    get_user_notifications, mark_as_read, mark_all_read, get_unread_count,
    delete_old_notifications (writes to notifications).
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

logger = logging.getLogger(__name__)


class NotificationService:
    """Central notification management"""

    def __init__(self, main_db=None):
        self.db = main_db

    # ============ Instance-based (robots / RobotManager) ============

    async def send_to_admins(self, tenant_id: str, title: str, message: str,
                             severity: str = "info", category: str = "system") -> dict:
        """Push a notification to tenant admins (used by robots)."""
        doc = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "title": title,
            "message": message,
            "type": severity,
            "category": category,
            "read_by": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            if self.db is None:
                logger.warning("NotificationService.send_to_admins called without db; skipping persist")
                return doc
            await self.db.push_notifications.insert_one(doc)
            doc.pop("_id", None)
        except Exception as e:
            logger.error(f"Failed to send notification: {e}")
        return doc

    async def send(self, tenant_id: str, title: str, message: str,
                   severity: str = "info", category: str = "system") -> dict:
        return await self.send_to_admins(tenant_id, title, message, severity, category)

    # ============ Stateless per-call db (notification routes) ============

    async def create_notification(self, db, tenant_id: str, user_id: str,
                                   notification_type: str, title: str, message: str,
                                   data: dict = None, link: str = None) -> dict:
        """Create a new notification"""
        notification = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "user_id": user_id,
            "type": notification_type,
            "title": title,
            "message": message,
            "data": data or {},
            "link": link,
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        await db.notifications.insert_one(notification)
        notification.pop("_id", None)
        return notification

    async def get_user_notifications(self, db, user_id: str,
                                     unread_only: bool = False, limit: int = 50) -> List[dict]:
        """Get notifications for a user"""
        query = {"user_id": user_id}
        if unread_only:
            query["read"] = False

        notifications = []
        cursor = db.notifications.find(query).sort("created_at", -1).limit(limit)

        async for doc in cursor:
            doc.pop("_id", None)
            notifications.append(doc)

        return notifications

    async def mark_as_read(self, db, notification_id: str, user_id: str) -> bool:
        """Mark notification as read"""
        result = await db.notifications.update_one(
            {"id": notification_id, "user_id": user_id},
            {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
        )
        return result.modified_count > 0

    async def mark_all_read(self, db, user_id: str) -> int:
        """Mark all notifications as read"""
        result = await db.notifications.update_many(
            {"user_id": user_id, "read": False},
            {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
        )
        return result.modified_count

    async def get_unread_count(self, db, user_id: str) -> int:
        """Get count of unread notifications"""
        return await db.notifications.count_documents({"user_id": user_id, "read": False})

    async def delete_old_notifications(self, db, days: int = 30) -> int:
        """Delete notifications older than specified days"""
        from datetime import timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        result = await db.notifications.delete_many({
            "created_at": {"$lt": cutoff},
            "read": True,
        })
        return result.deleted_count


# Global instance (used by routes via per-call db)
notification_service = NotificationService()
