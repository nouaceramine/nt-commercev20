"""
Enhanced Notifications Routes - NT Commerce v16
Section 9: Notifications & Communication
32 endpoints for user inbox, templates, scheduled notifications, settings, analytics, admin management, broadcast, and test.
"""

import traceback
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
import uuid

from fastapi import APIRouter, HTTPException, Depends, Query, status, Body


class NotificationSendRequest(BaseModel):
    user_id: str
    title: str
    message: str
    notification_type: str = "system"
    link: Optional[str] = None

class BulkNotificationRequest(BaseModel):
    user_ids: List[str]
    title: str
    message: str
    notification_type: str = "system"
    link: Optional[str] = None

class NotificationTemplateCreate(BaseModel):
    name: str
    channel: str = "in_app"
    subject: str = ""
    body: str
    variables: Optional[List[str]] = None
    language: str = "ar"
    is_active: bool = True

class NotificationTemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    variables: Optional[List[str]] = None
    language: Optional[str] = None
    is_active: Optional[bool] = None

class NotificationSettingsUpdate(BaseModel):
    order_notifications: Optional[bool] = None
    shipping_notifications: Optional[bool] = None
    promotion_notifications: Optional[bool] = None
    payment_notifications: Optional[bool] = None
    lead_notifications: Optional[bool] = None
    reminder_notifications: Optional[bool] = None
    channels: Optional[Dict[str, bool]] = None

class NotificationScheduleCreate(BaseModel):
    template_id: str
    recipients: List[str]
    variables: Optional[Dict[str, str]] = None
    scheduled_at: str


def create_enhanced_notifications_routes(db, get_current_user, require_permission=None, **kwargs):
    router = APIRouter(prefix="/notifications", tags=["Enhanced Notifications v2"])

    def now_iso():
        return datetime.utcnow().isoformat()

    async def log_activity(action: str, details: str, user_id: str):
        try:
            await db.activities.insert_one({
                "id": str(uuid.uuid4()), "action": action,
                "details": details, "user_id": user_id,
                "created_at": now_iso(), "type": "notification"
            })
        except Exception:
            pass

    def paginate(page: int, limit: int):
        return (page - 1) * limit, page * limit

    # ===== 1. USER NOTIFICATION INBOX (6 endpoints) =====

    @router.get("/inbox", response_model=Dict[str, Any])
    async def get_user_inbox(
        page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100),
        read: Optional[bool] = None, notification_type: Optional[str] = None,
        current_user: dict = Depends(get_current_user)
    ):
        try:
            query = {"user_id": current_user.get("id", "")}
            if read is not None:
                query["read"] = read
            if notification_type:
                query["type"] = notification_type
            skip, _ = paginate(page, limit)
            total = await db.notifications.count_documents(query)
            items = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            unread_count = await db.notifications.count_documents({"user_id": current_user.get("id", ""), "read": False})
            return {"notifications": items, "total": total, "unread": unread_count, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/inbox/unread-count", response_model=Dict[str, Any])
    async def get_unread_count(current_user: dict = Depends(get_current_user)):
        try:
            user_id = current_user.get("id", "")
            total_unread = await db.notifications.count_documents({"user_id": user_id, "read": False})
            by_type = await db.notifications.aggregate([
                {"$match": {"user_id": user_id, "read": False}},
                {"$group": {"_id": "$type", "count": {"$sum": 1}}}
            ]).to_list(None)
            return {"total_unread": total_unread, "by_type": [{"type": b["_id"] or "unknown", "count": b["count"]} for b in by_type]}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/{notification_id}/read", response_model=Dict[str, Any])
    async def mark_as_read(notification_id: str, current_user: dict = Depends(get_current_user)):
        try:
            result = await db.notifications.update_one(
                {"id": notification_id, "user_id": current_user.get("id", "")},
                {"$set": {"read": True, "read_at": now_iso()}}
            )
            if result.matched_count == 0:
                raise HTTPException(status_code=404, detail="Notification not found")
            return {"notification_id": notification_id, "read": True}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/inbox/mark-all-read", response_model=Dict[str, Any])
    async def mark_all_read(current_user: dict = Depends(get_current_user)):
        try:
            result = await db.notifications.update_many(
                {"user_id": current_user.get("id", ""), "read": False},
                {"$set": {"read": True, "read_at": now_iso()}}
            )
            return {"marked_read": result.modified_count}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_notification(notification_id: str, current_user: dict = Depends(get_current_user)):
        try:
            await db.notifications.delete_one({"id": notification_id, "user_id": current_user.get("id", "")})
            return None
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/send", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def send_notification(req: NotificationSendRequest, current_user: dict = Depends(get_current_user)):
        try:
            notif_id = str(uuid.uuid4())
            doc = {
                "id": notif_id, "user_id": req.user_id, "type": req.notification_type,
                "title": req.title, "message": req.message, "link": req.link,
                "read": False, "created_at": now_iso(), "sent_by": current_user.get("id", "")
            }
            await db.notifications.insert_one(doc)
            await db.notification_delivery_log.insert_one({
                "id": str(uuid.uuid4()), "notification_id": notif_id, "user_id": req.user_id,
                "channel": "in_app", "status": "sent", "sent_at": now_iso()
            })
            await log_activity("send_notification", f"Sent to {req.user_id}: {req.title}", current_user.get("id", ""))
            return {"notification_id": notif_id, "status": "sent", "user_id": req.user_id}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 2. BULK & ADMIN SEND (3 endpoints) =====

    @router.post("/send/bulk", response_model=Dict[str, Any])
    async def send_bulk_notification(req: BulkNotificationRequest, current_user: dict = Depends(get_current_user)):
        try:
            sent, failed = 0, 0
            for uid in req.user_ids:
                try:
                    notif_id = str(uuid.uuid4())
                    await db.notifications.insert_one({
                        "id": notif_id, "user_id": uid, "type": req.notification_type,
                        "title": req.title, "message": req.message, "link": req.link,
                        "read": False, "created_at": now_iso(), "sent_by": current_user.get("id", "")
                    })
                    sent += 1
                except Exception:
                    failed += 1
            await log_activity("bulk_send", f"Bulk sent to {sent} users", current_user.get("id", ""))
            return {"sent": sent, "failed": failed, "total": len(req.user_ids)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/send/to-admins", response_model=Dict[str, Any])
    async def send_to_all_admins(title: str = Body(...), message: str = Body(...), current_user: dict = Depends(get_current_user)):
        try:
            admins = await db.users.find({"role": {"$in": ["admin", "super_admin"]}}, {"_id": 0, "id": 1}).to_list(None)
            sent = 0
            for a in admins:
                notif_id = str(uuid.uuid4())
                await db.notifications.insert_one({
                    "id": notif_id, "user_id": a["id"], "type": "system",
                    "title": title, "message": message, "read": False,
                    "created_at": now_iso(), "sent_by": current_user.get("id", "")
                })
                sent += 1
            return {"sent": sent, "recipients": "all_admins"}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 3. NOTIFICATION TEMPLATES (5 endpoints) =====

    @router.post("/templates", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_template(template: NotificationTemplateCreate, current_user: dict = Depends(get_current_user)):
        try:
            t_id = str(uuid.uuid4())
            doc = {
                "id": t_id, "name": template.name,
                "channel": template.channel,
                "subject": template.subject,
                "body": template.body,
                "variables": template.variables,
                "language": template.language,
                "is_active": template.is_active,
                "created_at": now_iso(),
                "created_by": current_user.get("id", "")
            }
            await db.notification_templates.insert_one(doc)
            doc.pop("_id", None)
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/templates", response_model=Dict[str, Any])
    async def list_templates(channel: Optional[str] = None, language: Optional[str] = None, current_user: dict = Depends(get_current_user)):
        try:
            query = {}
            if channel:
                query["channel"] = channel
            if language:
                query["language"] = language
            items = await db.notification_templates.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
            return {"templates": items, "total": len(items)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/templates/{template_id}", response_model=Dict[str, Any])
    async def get_template(template_id: str, current_user: dict = Depends(get_current_user)):
        try:
            template = await db.notification_templates.find_one({"id": template_id}, {"_id": 0})
            if not template:
                raise HTTPException(status_code=404, detail="Template not found")
            return template
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/templates/{template_id}", response_model=Dict[str, Any])
    async def update_template(template_id: str, template: NotificationTemplateUpdate, current_user: dict = Depends(get_current_user)):
        try:
            existing = await db.notification_templates.find_one({"id": template_id})
            if not existing:
                raise HTTPException(status_code=404, detail="Template not found")
            changes = {k: v for k, v in template.model_dump().items() if v is not None}
            if changes:
                changes["updated_at"] = now_iso()
                await db.notification_templates.update_one({"id": template_id}, {"$set": changes})
            doc = await db.notification_templates.find_one({"id": template_id}, {"_id": 0})
            return doc
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_template(template_id: str, current_user: dict = Depends(get_current_user)):
        try:
            await db.notification_templates.delete_one({"id": template_id})
            return None
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 4. SEND USING TEMPLATE (1 endpoint) =====

    @router.post("/templates/{template_id}/send", response_model=Dict[str, Any])
    async def send_using_template(template_id: str, user_id: str = Body(...), variables: Dict[str, str] = Body(default_factory=dict), current_user: dict = Depends(get_current_user)):
        try:
            template = await db.notification_templates.find_one({"id": template_id}, {"_id": 0})
            if not template:
                raise HTTPException(status_code=404, detail="Template not found")

            body = template["body"]
            subject = template.get("subject", "")
            for key, value in variables.items():
                placeholder = "{{" + key + "}}"
                body = body.replace(placeholder, str(value))
                subject = subject.replace(placeholder, str(value))

            notif_id = str(uuid.uuid4())
            await db.notifications.insert_one({
                "id": notif_id, "user_id": user_id,
                "type": "system", "title": subject or template["name"],
                "message": body, "channel": template["channel"],
                "read": False, "created_at": now_iso(),
                "sent_by": current_user.get("id", ""),
                "template_id": template_id,
                "variables_used": variables
            })

            return {"notification_id": notif_id, "channel": template["channel"], "message_preview": body[:100]}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 5. NOTIFICATION SETTINGS (2 endpoints) =====

    @router.get("/settings", response_model=Dict[str, Any])
    async def get_notification_settings(current_user: dict = Depends(get_current_user)):
        try:
            user_id = current_user.get("id", "")
            settings = await db.notification_settings.find_one({"user_id": user_id}, {"_id": 0})
            if not settings:
                return {
                    "user_id": user_id,
                    "order_notifications": True,
                    "shipping_notifications": True,
                    "promotion_notifications": True,
                    "payment_notifications": True,
                    "lead_notifications": True,
                    "reminder_notifications": True,
                    "channels": {"in_app": True, "email": False, "sms": False, "whatsapp": False, "push": False}
                }
            return settings
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/settings", response_model=Dict[str, Any])
    async def update_notification_settings(settings: NotificationSettingsUpdate, current_user: dict = Depends(get_current_user)):
        try:
            user_id = current_user.get("id", "")
            update = {k: v for k, v in settings.model_dump().items() if v is not None}
            update["updated_at"] = now_iso()

            existing = await db.notification_settings.find_one({"user_id": user_id})
            if existing:
                await db.notification_settings.update_one({"user_id": user_id}, {"$set": update})
            else:
                update["user_id"] = user_id
                update["created_at"] = now_iso()
                await db.notification_settings.insert_one(update)

            return await get_notification_settings(current_user)
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 6. NOTIFICATION ANALYTICS (4 endpoints) =====

    @router.get("/analytics/overview", response_model=Dict[str, Any])
    async def get_notification_analytics(current_user: dict = Depends(get_current_user)):
        try:
            total = await db.notifications.count_documents({})
            unread = await db.notifications.count_documents({"read": False})
            today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
            sent_today = await db.notifications.count_documents({"created_at": {"$gte": today}})

            type_pipeline = [{"$group": {"_id": "$type", "count": {"$sum": 1}}}]
            by_type = await db.notifications.aggregate(type_pipeline).to_list(None)

            channel_pipeline = [{"$group": {"_id": "$channel", "count": {"$sum": 1}}}]
            by_channel = await db.notification_delivery_log.aggregate(channel_pipeline).to_list(None)

            read_rate = ((total - unread) / total * 100) if total > 0 else 0

            return {
                "total_notifications": total,
                "unread": unread,
                "sent_today": sent_today,
                "read_rate": round(read_rate, 1),
                "by_type": [{"type": b["_id"] or "unknown", "count": b["count"]} for b in by_type],
                "by_channel": [{"channel": b["_id"] or "unknown", "count": b["count"]} for b in by_channel]
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/delivery", response_model=Dict[str, Any])
    async def get_delivery_analytics(days: int = Query(30, ge=1, le=365), current_user: dict = Depends(get_current_user)):
        try:
            since = (datetime.utcnow() - timedelta(days=days)).isoformat()
            pipeline = [
                {"$match": {"sent_at": {"$gte": since}}},
                {"$group": {"_id": {"$substr": ["$sent_at", 0, 10]}, "count": {"$sum": 1}}},
                {"$sort": {"_id": 1}}
            ]
            daily = await db.notification_delivery_log.aggregate(pipeline).to_list(None)
            return {"period_days": days, "daily": [{"date": d["_id"], "sent": d["count"]} for d in daily]}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/templates", response_model=Dict[str, Any])
    async def get_template_usage(current_user: dict = Depends(get_current_user)):
        try:
            pipeline = [
                {"$match": {"template_id": {"$exists": True}}},
                {"$group": {"_id": "$template_id", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}}
            ]
            usage = await db.notifications.aggregate(pipeline).to_list(None)
            return {"template_usage": [{"template_id": u["_id"], "sent_count": u["count"]} for u in usage]}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/users", response_model=Dict[str, Any])
    async def get_user_notification_stats(current_user: dict = Depends(get_current_user)):
        try:
            pipeline = [
                {"$group": {"_id": "$user_id", "total": {"$sum": 1}, "unread": {"$sum": {"$cond": [{"$eq": ["$read", False]}, 1, 0]}}}},
                {"$sort": {"total": -1}},
                {"$limit": 50}
            ]
            stats = await db.notifications.aggregate(pipeline).to_list(None)
            return {"users": [{"user_id": s["_id"], "total": s["total"], "unread": s["unread"]} for s in stats]}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 7. SCHEDULED NOTIFICATIONS (3 endpoints) =====

    @router.post("/schedule", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def schedule_notification(schedule: NotificationScheduleCreate, current_user: dict = Depends(get_current_user)):
        try:
            s_id = str(uuid.uuid4())
            doc = {
                "id": s_id, "template_id": schedule.template_id,
                "recipients": schedule.recipients,
                "variables": schedule.variables,
                "scheduled_at": schedule.scheduled_at,
                "status": "scheduled",
                "created_at": now_iso(),
                "created_by": current_user.get("id", "")
            }
            await db.notification_schedules.insert_one(doc)
            doc.pop("_id", None)
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/schedule", response_model=Dict[str, Any])
    async def list_scheduled_notifications(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
        try:
            query = {}
            if status:
                query["status"] = status
            items = await db.notification_schedules.find(query, {"_id": 0}).sort("scheduled_at", 1).to_list(100)
            return {"scheduled": items, "total": len(items)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/schedule/{schedule_id}/cancel", response_model=Dict[str, Any])
    async def cancel_scheduled_notification(schedule_id: str, current_user: dict = Depends(get_current_user)):
        try:
            await db.notification_schedules.update_one({"id": schedule_id}, {"$set": {"status": "cancelled", "cancelled_at": now_iso()}})
            return {"schedule_id": schedule_id, "status": "cancelled"}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 8. NOTIFICATION CENTER - ADMIN (4 endpoints) =====

    @router.get("/admin/all", response_model=Dict[str, Any])
    async def get_all_notifications(
        user_id: Optional[str] = None,
        notification_type: Optional[str] = None,
        page: int = Query(1, ge=1),
        limit: int = Query(50, ge=1),
        current_user: dict = Depends(get_current_user)
    ):
        try:
            query = {}
            if user_id:
                query["user_id"] = user_id
            if notification_type:
                query["type"] = notification_type
            skip, _ = paginate(page, limit)
            total = await db.notifications.count_documents(query)
            items = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"notifications": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/admin/cleanup", response_model=Dict[str, Any])
    async def cleanup_old_notifications(days: int = Query(30, ge=1), current_user: dict = Depends(get_current_user)):
        try:
            cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
            result = await db.notifications.delete_many({"created_at": {"$lt": cutoff}})
            return {"deleted_count": result.deleted_count, "older_than_days": days}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/admin/delivery-log", response_model=Dict[str, Any])
    async def get_delivery_log(notification_id: Optional[str] = None, page: int = Query(1, ge=1), limit: int = Query(50, ge=1), current_user: dict = Depends(get_current_user)):
        try:
            query = {}
            if notification_id:
                query["notification_id"] = notification_id
            skip, _ = paginate(page, limit)
            total = await db.notification_delivery_log.count_documents(query)
            items = await db.notification_delivery_log.find(query, {"_id": 0}).sort("sent_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"logs": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/admin/stats/system", response_model=Dict[str, Any])
    async def get_system_notification_stats(current_user: dict = Depends(get_current_user)):
        try:
            total = await db.notifications.count_documents({})
            today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
            week_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()

            today_count = await db.notifications.count_documents({"created_at": {"$gte": today}})
            week_count = await db.notifications.count_documents({"created_at": {"$gte": week_ago}})

            status_pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
            statuses = await db.notification_delivery_log.aggregate(status_pipeline).to_list(None)

            return {
                "total_notifications": total,
                "today_sent": today_count,
                "week_sent": week_count,
                "active_templates": await db.notification_templates.count_documents({"is_active": True}),
                "scheduled_pending": await db.notification_schedules.count_documents({"status": "scheduled"}),
                "delivery_statuses": [{"status": s["_id"] or "unknown", "count": s["count"]} for s in statuses]
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 9. PREFERENCES & CHANNELS (3 endpoints) =====

    @router.get("/channels/list", response_model=Dict[str, Any])
    async def list_channels(current_user: dict = Depends(get_current_user)):
        try:
            channels = [
                {"key": "in_app", "label_ar": "داخل التطبيق", "label_en": "In-App", "enabled": True},
                {"key": "email", "label_ar": "البريد الإلكتروني", "label_en": "Email", "enabled": True},
                {"key": "sms", "label_ar": "رسائل نصية", "label_en": "SMS", "enabled": True},
                {"key": "whatsapp", "label_ar": "واتساب", "label_en": "WhatsApp", "enabled": True},
                {"key": "push", "label_ar": "إشعارات فورية", "label_en": "Push", "enabled": True},
            ]
            return {"channels": channels}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/types/list", response_model=Dict[str, Any])
    async def list_notification_types(current_user: dict = Depends(get_current_user)):
        try:
            types = [
                {"key": "order", "label_ar": "طلبات", "label_en": "Orders", "description": "Order status updates"},
                {"key": "shipping", "label_ar": "شحن", "label_en": "Shipping", "description": "Delivery tracking updates"},
                {"key": "promotion", "label_ar": "عروض", "label_en": "Promotions", "description": "Coupons and flash sales"},
                {"key": "payment", "label_ar": "مدفوعات", "label_en": "Payments", "description": "Payment confirmations"},
                {"key": "lead", "label_ar": "عملاء محتملون", "label_en": "Leads", "description": "Lead assignments and conversions"},
                {"key": "system", "label_ar": "نظام", "label_en": "System", "description": "System alerts and updates"},
                {"key": "reminder", "label_ar": "تذكيرات", "label_en": "Reminders", "description": "Follow-up reminders"},
                {"key": "alert", "label_ar": "تنبيهات", "label_en": "Alerts", "description": "Important alerts"},
            ]
            return {"types": types}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/preferences/reset", response_model=Dict[str, Any])
    async def reset_notification_preferences(current_user: dict = Depends(get_current_user)):
        try:
            user_id = current_user.get("id", "")
            defaults = {
                "user_id": user_id,
                "order_notifications": True,
                "shipping_notifications": True,
                "promotion_notifications": True,
                "payment_notifications": True,
                "lead_notifications": True,
                "reminder_notifications": True,
                "channels": {"in_app": True, "email": True, "sms": False, "whatsapp": False, "push": False},
                "updated_at": now_iso()
            }
            await db.notification_settings.update_one(
                {"user_id": user_id},
                {"$set": defaults},
                upsert=True
            )
            return {"status": "reset", "defaults_applied": True}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 10. BROADCAST & TEST (2 endpoints) =====

    @router.post("/broadcast/system", response_model=Dict[str, Any])
    async def broadcast_system_message(title: str = Body(...), message: str = Body(...), link: Optional[str] = Body(None), current_user: dict = Depends(get_current_user)):
        try:
            users = await db.users.find({}, {"_id": 0, "id": 1}).to_list(None)
            sent = 0
            for u in users:
                await db.notifications.insert_one({
                    "id": str(uuid.uuid4()), "user_id": u["id"],
                    "type": "system", "title": title, "message": message,
                    "link": link, "broadcast": True, "read": False,
                    "created_at": now_iso(), "sent_by": current_user.get("id", "")
                })
                sent += 1
            await log_activity("broadcast", f"System broadcast to {sent} users", current_user.get("id", ""))
            return {"broadcast": True, "recipients": sent, "title": title}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/test/send", response_model=Dict[str, Any])
    async def test_notification(channel: str = Body(...), user_id: str = Body(...), current_user: dict = Depends(get_current_user)):
        try:
            notif_id = str(uuid.uuid4())
            await db.notifications.insert_one({
                "id": notif_id, "user_id": user_id,
                "type": "system", "title": f"Test {channel}",
                "message": f"This is a test notification via {channel}",
                "channel": channel, "test": True, "read": False,
                "created_at": now_iso(), "sent_by": current_user.get("id", "")
            })
            await db.notification_delivery_log.insert_one({
                "id": str(uuid.uuid4()), "notification_id": notif_id,
                "user_id": user_id, "channel": channel,
                "status": "test_sent", "sent_at": now_iso()
            })
            return {"test_notification_id": notif_id, "channel": channel, "user_id": user_id, "status": "sent"}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    return router
