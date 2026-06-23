"""
Push Notification Routes
Web Push notification management - subscribe, unsubscribe, send notifications.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)


def create_push_notification_routes(db, get_current_user, get_tenant_admin, require_tenant) -> dict:
    router = APIRouter(prefix="/push", tags=["push-notifications"])

    class PushSubscription(BaseModel):
        endpoint: str
        keys: dict

    class PushNotificationRequest(BaseModel):
        title: str
        body: str
        icon: Optional[str] = "/icon-192.png"
        url: Optional[str] = "/"
        tag: Optional[str] = "default"
        target_users: Optional[List[str]] = None

    @router.post("/subscribe")
    async def subscribe(subscription: PushSubscription, user: dict = Depends(get_current_user)):
        sub_data = {
            "id": str(uuid.uuid4()),
            "user_id": user.get("id"),
            "tenant_id": user.get("tenant_id"),
            "endpoint": subscription.endpoint,
            "keys": subscription.keys,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "active": True,
        }
        await db.push_subscriptions.update_one(
            {"endpoint": subscription.endpoint},
            {"$set": sub_data},
            upsert=True
        )
        return {"success": True, "message": "تم تفعيل الإشعارات"}

    @router.post("/unsubscribe")
    async def unsubscribe(subscription: PushSubscription, user: dict = Depends(get_current_user)):
        await db.push_subscriptions.update_one(
            {"endpoint": subscription.endpoint},
            {"$set": {"active": False}}
        )
        return {"success": True, "message": "تم إلغاء الإشعارات"}

    @router.get("/status")
    async def get_push_status(user: dict = Depends(get_current_user)):
        count = await db.push_subscriptions.count_documents({
            "user_id": user.get("id"), "active": True
        })
        return {"subscribed": count > 0, "devices": count}

    @router.post("/send")
    async def send_push_notification(request: PushNotificationRequest, admin: dict = Depends(get_tenant_admin)):
        query = {"tenant_id": admin.get("tenant_id"), "active": True}
        if request.target_users:
            query["user_id"] = {"$in": request.target_users}
        subscriptions = await db.push_subscriptions.find(query, {"_id": 0}).to_list(1000)
        if not subscriptions:
            return {"success": True, "sent": 0, "message": "لا يوجد مشتركين"}
        sent = 0
        failed = 0
        try:
            from pywebpush import webpush, WebPushException
            import os
            vapid_private_key = os.environ.get("VAPID_PRIVATE_KEY", "")
            vapid_email = os.environ.get("VAPID_EMAIL", "admin@ntcommerce.com")
            if not vapid_private_key:
                await db.push_notification_logs.insert_one({
                    "id": str(uuid.uuid4()),
                    "tenant_id": admin.get("tenant_id"),
                    "title": request.title,
                    "body": request.body,
                    "target_count": len(subscriptions),
                    "sent": 0, "failed": 0,
                    "status": "queued",
                    "created_at": datetime.now(timezone.utc).isoformat()
                })
                return {"success": True, "sent": 0, "queued": len(subscriptions), "message": "VAPID key غير مُعد - تم حفظ الإشعار للإرسال لاحقاً"}
            import json
            payload = json.dumps({
                "title": request.title,
                "body": request.body,
                "icon": request.icon,
                "url": request.url,
                "tag": request.tag
            })
            for sub in subscriptions:
                try:
                    webpush(
                        subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]},
                        data=payload,
                        vapid_private_key=vapid_private_key,
                        vapid_claims={"sub": f"mailto:{vapid_email}"}
                    )
                    sent += 1
                except WebPushException:
                    failed += 1
                    if "410" in str(WebPushException):
                        await db.push_subscriptions.update_one({"endpoint": sub["endpoint"]}, {"$set": {"active": False}})
        except ImportError:
            await db.push_notification_logs.insert_one({
                "id": str(uuid.uuid4()),
                "tenant_id": admin.get("tenant_id"),
                "title": request.title,
                "body": request.body,
                "target_count": len(subscriptions),
                "sent": 0, "failed": 0,
                "status": "queued",
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            return {"success": True, "sent": 0, "queued": len(subscriptions), "message": "مكتبة pywebpush غير مثبتة - تم حفظ الإشعار"}

        await db.push_notification_logs.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": admin.get("tenant_id"),
            "title": request.title,
            "body": request.body,
            "target_count": len(subscriptions),
            "sent": sent, "failed": failed,
            "status": "sent",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        return {"success": True, "sent": sent, "failed": failed}

    @router.get("/logs")
    async def get_push_logs(limit: int = 50, admin: dict = Depends(get_tenant_admin)):
        logs = await db.push_notification_logs.find(
            {"tenant_id": admin.get("tenant_id")}, {"_id": 0}
        ).sort("created_at", -1).limit(limit).to_list(limit)
        return logs

    return router
