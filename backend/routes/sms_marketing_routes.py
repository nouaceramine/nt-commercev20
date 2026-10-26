"""
SMS Marketing & SMS Reminder System Routes
Extracted from server.py
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta
import uuid


def create_sms_marketing_routes(db, get_current_user, get_tenant_admin, require_tenant) -> dict:
    router = APIRouter(tags=["sms"])

    # ── Models ──

    class SMSCampaign(BaseModel):
        name: str
        message: str
        target: str  # all, customers_with_debt, inactive, custom
        customer_ids: Optional[List[str]] = []
        scheduled_at: Optional[str] = None

    class SMSReminderRequest(BaseModel):
        customer_ids: List[str]
        message_template: Optional[str] = None

    class SMSSettingsUpdate(BaseModel):
        auto_reminder_enabled: bool = False
        reminder_frequency: Literal["daily", "weekly", "monthly"] = "weekly"
        reminder_day: int = 1
        reminder_time: str = "09:00"
        min_debt_amount: float = 100
        message_template: str = "السلام عليكم {customer_name}، نذكركم بأن لديكم مبلغ {debt_amount} دج مستحق. شكراً لتعاملكم معنا."

    DEFAULT_SMS_SETTINGS = {
        "auto_reminder_enabled": False,
        "reminder_frequency": "weekly",
        "reminder_day": 1,
        "reminder_time": "09:00",
        "min_debt_amount": 100,
        "message_template": "السلام عليكم {customer_name}، نذكركم بأن لديكم مبلغ {debt_amount} دج مستحق. شكراً لتعاملكم معنا - NT"
    }

    async def send_sms_real(phone: str, message: str) -> dict:
        from services.ecom.status_sms_service import get_settings
        from services.ecom.sms_gateway import get_sms_provider
        settings = await get_settings(db, for_send=True)
        provider_cfg = settings.get("provider") or {}
        if not settings.get("enabled") or provider_cfg.get("type") != "http" or not provider_cfg.get("url"):
            return {"success": False, "provider": "unconfigured", "message_id": None,
                    "error": "بوابة SMS غير مفعّلة أو غير مرتبطة بمزود حقيقي"}
        return await get_sms_provider(provider_cfg).send(phone, message)

    async def require_sms_gateway() -> None:
        settings = await get_sms_settings_for_send()
        provider = settings.get("provider") or {}
        if not settings.get("enabled") or provider.get("type") != "http" or not provider.get("url"):
            raise HTTPException(status_code=503, detail="أرسل SMS يتطلب بوابة حقيقية مفعّلة من مركز التكاملات")

    async def get_sms_settings_for_send() -> dict:
        from services.ecom.status_sms_service import get_settings
        return await get_settings(db, for_send=True)

    # ── SMS Marketing Campaigns ──

    @router.get("/marketing/sms/campaigns")
    async def get_sms_campaigns(admin: dict = Depends(get_tenant_admin)):
        campaigns = await db.sms_campaigns.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
        return campaigns

    @router.post("/marketing/sms/campaigns")
    async def create_sms_campaign(campaign: SMSCampaign, admin: dict = Depends(get_tenant_admin)):
        now = datetime.now(timezone.utc).isoformat()
        if campaign.target == "all":
            customers = await db.customers.find({"phone": {"$ne": ""}}, {"_id": 0, "id": 1, "phone": 1, "name": 1}).to_list(1000)
        elif campaign.target == "customers_with_debt":
            customers = await db.customers.find({"balance": {"$gt": 0}, "phone": {"$ne": ""}}, {"_id": 0, "id": 1, "phone": 1, "name": 1}).to_list(1000)
        elif campaign.target == "inactive":
            thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
            active_customer_ids = await db.sales.distinct("customer_id", {"created_at": {"$gte": thirty_days_ago}})
            customers = await db.customers.find({"id": {"$nin": active_customer_ids}, "phone": {"$ne": ""}}, {"_id": 0, "id": 1, "phone": 1, "name": 1}).to_list(1000)
        else:
            customers = await db.customers.find({"id": {"$in": campaign.customer_ids}, "phone": {"$ne": ""}}, {"_id": 0, "id": 1, "phone": 1, "name": 1}).to_list(1000)
        campaign_doc = {"id": str(uuid.uuid4()), "name": campaign.name, "message": campaign.message, "target": campaign.target, "recipients_count": len(customers), "status": "pending", "scheduled_at": campaign.scheduled_at, "sent_at": None, "created_at": now, "created_by": admin.get("name", "")}
        if campaign.scheduled_at:
            await db.sms_campaigns.insert_one(campaign_doc)
            return {"success": True, "message": "تم حفظ الحملة المجدولة دون إرسال", "campaign_id": campaign_doc["id"], "recipients_count": len(customers), "sent_count": 0, "failed_count": 0}
        await require_sms_gateway()
        sent_count = 0
        failed_count = 0
        for customer in customers:
            result = await send_sms_real(customer["phone"], campaign.message)
            ok = bool(result.get("success"))
            sent_count += int(ok)
            failed_count += int(not ok)
            await db.sms_logs.insert_one({
                "id": str(uuid.uuid4()), "campaign_id": campaign_doc["id"],
                "customer_id": customer.get("id"), "customer_name": customer.get("name", ""),
                "phone": customer.get("phone"), "message": campaign.message,
                "status": "sent" if ok else "failed", "provider_response": result,
                "sent_by": admin.get("name", ""), "created_at": datetime.now(timezone.utc).isoformat(),
            })
        campaign_doc.update({
            "status": "sent" if sent_count == len(customers) and customers else ("partial" if sent_count else "failed"),
            "sent_count": sent_count, "failed_count": failed_count,
            "sent_at": datetime.now(timezone.utc).isoformat() if sent_count else None,
        })
        await db.sms_campaigns.insert_one(campaign_doc)
        return {"success": sent_count > 0 or not customers,
                "message": f"اكتملت الحملة: {sent_count} ناجح و{failed_count} فاشل",
                "campaign_id": campaign_doc["id"], "recipients_count": len(customers),
                "sent_count": sent_count, "failed_count": failed_count}

    # ── SMS Settings ──

    @router.get("/sms/settings")
    async def get_sms_settings(admin: dict = Depends(get_tenant_admin)):
        settings = await db.sms_settings.find_one({"id": "global"}, {"_id": 0})
        if not settings:
            settings = {**DEFAULT_SMS_SETTINGS, "id": "global"}
            await db.sms_settings.insert_one(settings)
            settings = {k: v for k, v in settings.items() if k != "_id"}
        return settings

    @router.put("/sms/settings")
    async def update_sms_settings(settings: SMSSettingsUpdate, admin: dict = Depends(get_tenant_admin)):
        update_data = settings.model_dump()
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.sms_settings.update_one({"id": "global"}, {"$set": update_data}, upsert=True)
        return {"success": True, "message": "Settings updated"}

    # ── SMS Reminders ──

    @router.post("/sms/send-reminder")
    async def send_debt_reminder(request: SMSReminderRequest, user: dict = Depends(require_tenant)):
        settings = await db.sms_settings.find_one({"id": "global"}, {"_id": 0})
        if not settings:
            settings = DEFAULT_SMS_SETTINGS
        template = request.message_template or settings.get("message_template", DEFAULT_SMS_SETTINGS["message_template"])
        results = []
        for customer_id in request.customer_ids:
            customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
            if not customer:
                results.append({"customer_id": customer_id, "success": False, "error": "Customer not found"})
                continue
            if not customer.get("phone"):
                results.append({"customer_id": customer_id, "success": False, "error": "No phone number"})
                continue
            debt_pipeline = [{"$match": {"customer_id": customer_id, "debt_amount": {"$gt": 0}}}, {"$group": {"_id": None, "total": {"$sum": "$debt_amount"}}}]
            debt_result = await db.sales.aggregate(debt_pipeline).to_list(1)
            total_debt = debt_result[0]["total"] if debt_result else 0
            if total_debt <= 0:
                results.append({"customer_id": customer_id, "success": False, "error": "No debt"})
                continue
            message = template.format(customer_name=customer.get("name", ""), debt_amount=f"{total_debt:,.0f}", phone=customer.get("phone", ""))
            sms_result = await send_sms_real(customer["phone"], message)
            sms_log = {"id": str(uuid.uuid4()), "customer_id": customer_id, "customer_name": customer.get("name", ""), "phone": customer.get("phone", ""), "message": message, "debt_amount": total_debt, "status": "sent" if sms_result["success"] else "failed", "provider_response": sms_result, "sent_by": user.get("name", ""), "created_at": datetime.now(timezone.utc).isoformat()}
            await db.sms_logs.insert_one(sms_log)
            results.append({"customer_id": customer_id, "customer_name": customer.get("name", ""), "phone": customer.get("phone", ""), "success": sms_result["success"], "error": sms_result.get("error")})
        success_count = sum(1 for r in results if r.get("success"))
        return {"total": len(request.customer_ids), "success": success_count, "failed": len(request.customer_ids) - success_count, "results": results}

    @router.post("/sms/send-bulk-reminder")
    async def send_bulk_debt_reminder(user: dict = Depends(require_tenant), min_debt: float = 0):
        settings = await db.sms_settings.find_one({"id": "global"}, {"_id": 0})
        if not settings:
            settings = DEFAULT_SMS_SETTINGS
        min_amount = min_debt if min_debt > 0 else settings.get("min_debt_amount", 100)
        pipeline = [{"$match": {"debt_amount": {"$gt": 0}}}, {"$group": {"_id": "$customer_id", "total_debt": {"$sum": "$debt_amount"}}}, {"$match": {"total_debt": {"$gte": min_amount}}}]
        debts = await db.sales.aggregate(pipeline).to_list(1000)
        customer_ids = [d["_id"] for d in debts if d["_id"]]
        if not customer_ids:
            return {"total": 0, "success": 0, "failed": 0, "results": [], "message": "No customers with debt found"}
        request = SMSReminderRequest(customer_ids=customer_ids)
        return await send_debt_reminder(request, user)

    @router.get("/sms/logs")
    async def get_sms_logs(limit: int = 50, customer_id: Optional[str] = None, user: dict = Depends(require_tenant)):
        query = {}
        if customer_id:
            query["customer_id"] = customer_id
        logs = await db.sms_logs.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        total_sent = await db.sms_logs.count_documents({"status": "sent"})
        total_failed = await db.sms_logs.count_documents({"status": "failed"})
        return {"logs": logs, "stats": {"total_sent": total_sent, "total_failed": total_failed}}

    @router.get("/sms/templates")
    async def get_sms_templates():
        return {"templates": [
            {"id": "reminder_friendly", "name_ar": "تذكير ودي", "template": "السلام عليكم {customer_name}، نذكركم بأن لديكم مبلغ {debt_amount} دج مستحق. شكراً لتعاملكم معنا."},
            {"id": "reminder_formal", "name_ar": "تذكير رسمي", "template": "عزيزنا {customer_name}، نود إعلامكم بوجود مستحقات بقيمة {debt_amount} دج. نرجو التسديد في أقرب وقت."},
            {"id": "reminder_urgent", "name_ar": "تذكير عاجل", "template": "تنبيه: {customer_name}، لديكم مبلغ {debt_amount} دج متأخر السداد. يرجى التواصل معنا."},
            {"id": "payment_thanks", "name_ar": "شكر على الدفع", "template": "شكراً {customer_name} على سداد مستحقاتكم. نقدر تعاملكم معنا - NT"}
        ]}

    return router
