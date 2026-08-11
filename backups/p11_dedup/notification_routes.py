"""
Push Notification Routes
In-app + browser push notification system
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class NotificationPreferences(BaseModel):
    low_stock_alert: bool = True
    new_sale_alert: bool = False
    daily_summary: bool = True
    payment_received: bool = True
    debt_reminder: bool = True
    expense_alert: bool = True
    system_updates: bool = True
    whatsapp_messages: bool = True
    tax_deadline: bool = True


class PushSubscription(BaseModel):
    endpoint: str
    keys: dict


class NotificationCreate(BaseModel):
    title: str
    message: str
    type: str = "info"  # info, warning, error, success
    category: str = "system"  # system, sales, inventory, finance, tax
    link: Optional[str] = None
    target_users: Optional[List[str]] = None  # None = all users


def create_notification_routes(db, get_current_user) -> dict:
    """Create notification routes with dependencies"""

    @router.get("/", operation_id="get_notifications_v2")
    async def get_notifications_v2(
        limit: int = 50,
        unread_only: bool = False,
        category: Optional[str] = None,
        current_user: dict = Depends(get_current_user),
    ):
        """Get notifications for current user"""
        user_id = current_user.get("id")
        query = {
            "$or": [
                {"target_users": None},
                {"target_users": user_id},
                {"target_users": {"$exists": False}},
            ]
        }
        if current_user.get("tenant_id"):
            query["tenant_id"] = current_user["tenant_id"]

        if unread_only:
            query["read_by"] = {"$nin": [user_id]}
        if category:
            query["category"] = category

        notifications = await db.push_notifications.find(
            query, {"_id": 0}
        ).sort("created_at", -1).limit(limit).to_list(limit)

        # Add read status
        for n in notifications:
            n["is_read"] = user_id in n.get("read_by", [])

        return notifications

    @router.get("/unread-count")
    async def get_unread_count(current_user: dict = Depends(get_current_user)):
        user_id = current_user.get("id")
        query = {
            "$or": [
                {"target_users": None},
                {"target_users": user_id},
                {"target_users": {"$exists": False}},
            ],
            "read_by": {"$nin": [user_id]},
        }
        if current_user.get("tenant_id"):
            query["tenant_id"] = current_user["tenant_id"]

        count = await db.push_notifications.count_documents(query)
        return {"count": count}

    @router.post("/")
    async def create_notification(
        notif: NotificationCreate,
        current_user: dict = Depends(get_current_user),
    ):
        """Create a new notification"""
        doc = notif.model_dump()
        doc["id"] = str(uuid.uuid4())
        doc["tenant_id"] = current_user.get("tenant_id")
        doc["created_by"] = current_user.get("id")
        doc["read_by"] = []
        doc["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.push_notifications.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.put("/{notification_id}/read")
    async def mark_as_read(
        notification_id: str,
        current_user: dict = Depends(get_current_user),
    ):
        user_id = current_user.get("id")
        await db.push_notifications.update_one(
            {"id": notification_id},
            {"$addToSet": {"read_by": user_id}}
        )
        return {"success": True}

    @router.put("/read-all")
    async def mark_all_as_read(current_user: dict = Depends(get_current_user)):
        user_id = current_user.get("id")
        tenant_id = current_user.get("tenant_id")
        query = {}
        if tenant_id:
            query["tenant_id"] = tenant_id
        await db.push_notifications.update_many(
            query,
            {"$addToSet": {"read_by": user_id}}
        )
        return {"success": True}

    @router.delete("/{notification_id}", operation_id="delete_push_notification")
    async def delete_push_notification(
        notification_id: str,
        current_user: dict = Depends(get_current_user),
    ):
        result = await db.push_notifications.delete_one({"id": notification_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Notification not found")
        return {"success": True}

    @router.get("/preferences")
    async def get_preferences(current_user: dict = Depends(get_current_user)):
        user_id = current_user.get("id")
        prefs = await db.notification_preferences.find_one(
            {"user_id": user_id}, {"_id": 0}
        )
        if not prefs:
            prefs = NotificationPreferences().model_dump()
            prefs["user_id"] = user_id
            await db.notification_preferences.insert_one(prefs)
            prefs.pop("_id", None)
        return prefs

    @router.put("/preferences")
    async def update_preferences(
        prefs: NotificationPreferences,
        current_user: dict = Depends(get_current_user),
    ):
        user_id = current_user.get("id")
        update_data = prefs.model_dump()
        update_data["user_id"] = user_id
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.notification_preferences.update_one(
            {"user_id": user_id}, {"$set": update_data}, upsert=True
        )
        return {"success": True}

    @router.post("/subscribe")
    async def subscribe_push(
        subscription: PushSubscription,
        current_user: dict = Depends(get_current_user),
    ):
        """Subscribe to browser push notifications"""
        user_id = current_user.get("id")
        doc = subscription.model_dump()
        doc["user_id"] = user_id
        doc["tenant_id"] = current_user.get("tenant_id")
        doc["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.push_subscriptions.update_one(
            {"user_id": user_id, "endpoint": doc["endpoint"]},
            {"$set": doc},
            upsert=True,
        )
        return {"success": True}

    return router
