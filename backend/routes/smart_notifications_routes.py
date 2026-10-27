"""
Smart Notifications Routes — robot alerts view over the unified notifications store (channel=smart).
"""
from fastapi import APIRouter, Depends
from typing import Optional
from datetime import datetime, timezone


def create_smart_notifications_routes(db, main_db, get_current_user) -> dict:
    router = APIRouter(prefix="/smart-notifications", tags=["smart-notifications"])

    @router.get("")
    async def get_notifications(
        severity: Optional[str] = None,
        read: Optional[bool] = None,
        limit: int = 50,
        user: dict = Depends(get_current_user)
    ):
        query = {"channel": "smart"}
        if severity:
            query["severity"] = severity
        if read is not None:
            query["read"] = read
        return await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)

    @router.get("/unread-count")
    async def get_unread_count(user: dict = Depends(get_current_user)):
        count = await db.notifications.count_documents({"channel": "smart", "read": {"$ne": True}})
        by_severity = {}
        for sev in ["high", "medium", "low", "warning", "info"]:
            c = await db.notifications.count_documents({"channel": "smart", "read": {"$ne": True}, "severity": sev})
            if c > 0:
                by_severity[sev] = c
        return {"unread": count, "by_severity": by_severity}

    @router.put("/{notification_id}/read")
    async def mark_as_read(notification_id: str, user: dict = Depends(get_current_user)):
        await db.notifications.update_one(
            {"id": notification_id, "channel": "smart"}, {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"message": "ok"}

    @router.put("/mark-all-read")
    async def mark_all_read(user: dict = Depends(get_current_user)):
        await db.notifications.update_many(
            {"channel": "smart", "read": {"$ne": True}}, {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"message": "ok"}

    @router.delete("/clear")
    async def clear_notifications(user: dict = Depends(get_current_user)):
        await db.notifications.delete_many({"channel": "smart", "read": True})
        return {"message": "تم مسح الإشعارات المقروءة"}

    @router.get("/stats")
    async def get_notification_stats(user: dict = Depends(get_current_user)):
        total = await db.notifications.count_documents({"channel": "smart"})
        unread = await db.notifications.count_documents({"channel": "smart", "read": {"$ne": True}})
        by_type = await db.notifications.aggregate([
            {"$match": {"channel": "smart"}},
            {"$group": {"_id": "$type", "count": {"$sum": 1}}}
        ]).to_list(20)
        return {
            "total": total,
            "unread": unread,
            "by_type": {item["_id"]: item["count"] for item in by_type if item["_id"]},
        }

    return router
