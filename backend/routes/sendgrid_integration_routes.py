"""
SendGrid Email Integration Routes
Real SendGrid integration with fallback messaging when API key not configured.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import os
import uuid
import logging

logger = logging.getLogger(__name__)


def create_sendgrid_integration_routes(db, get_current_user, get_tenant_admin, require_tenant) -> dict:
    router = APIRouter(prefix="/integrations/email", tags=["email-integration"])

    class EmailRequest(BaseModel):
        to: List[str]
        subject: str
        html_content: str
        from_email: Optional[str] = None

    class EmailTemplateRequest(BaseModel):
        to: List[str]
        template_name: str
        variables: dict = {}

    class EmailSettingsUpdate(BaseModel):
        api_key: Optional[str] = None
        from_email: Optional[str] = None
        from_name: Optional[str] = None
        enabled: bool = True

    async def _get_sendgrid_config(tenant_id: str = None) -> dict:
        config = await db.email_integration_settings.find_one(
            {"tenant_id": tenant_id} if tenant_id else {},
            {"_id": 0}
        )
        if not config:
            api_key = os.environ.get("SENDGRID_API_KEY", "")
            config = {
                "api_key": api_key,
                "from_email": os.environ.get("SENDER_EMAIL", "noreply@ntcommerce.com"),
                "from_name": "NT Commerce",
                "enabled": bool(api_key),
            }
        return config

    async def _send_email(config, to_emails, subject, html_content) -> dict:
        if not config.get("api_key"):
            return {"success": False, "message": "مفتاح SendGrid غير مُعد. أضف SENDGRID_API_KEY في الإعدادات."}
        try:
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail
            sg = SendGridAPIClient(config["api_key"])
            for to_email in to_emails:
                message = Mail(
                    from_email=config.get("from_email", "noreply@ntcommerce.com"),
                    to_emails=to_email,
                    subject=subject,
                    html_content=html_content
                )
                sg.send(message)
            return {"success": True, "message": f"تم إرسال {len(to_emails)} رسالة بنجاح"}
        except ImportError:
            return {"success": False, "message": "مكتبة SendGrid غير مثبتة"}
        except Exception as e:
            logger.error(f"SendGrid error: {e}")
            return {"success": False, "message": f"خطأ في الإرسال: {str(e)}"}

    @router.get("/status")
    async def get_email_status(admin: dict = Depends(get_tenant_admin)):
        config = await _get_sendgrid_config(admin.get("tenant_id"))
        return {
            "configured": bool(config.get("api_key")),
            "from_email": config.get("from_email"),
            "from_name": config.get("from_name"),
            "enabled": config.get("enabled", False),
            "provider": "sendgrid"
        }

    @router.put("/settings")
    async def update_email_settings(settings: EmailSettingsUpdate, admin: dict = Depends(get_tenant_admin)):
        tenant_id = admin.get("tenant_id")
        update = {
            "tenant_id": tenant_id,
            "from_email": settings.from_email,
            "from_name": settings.from_name,
            "enabled": settings.enabled,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        if settings.api_key:
            update["api_key"] = settings.api_key
        await db.email_integration_settings.update_one(
            {"tenant_id": tenant_id}, {"$set": update}, upsert=True
        )
        return {"success": True, "message": "تم تحديث إعدادات البريد"}

    @router.post("/send")
    async def send_email(request: EmailRequest, admin: dict = Depends(get_tenant_admin)):
        config = await _get_sendgrid_config(admin.get("tenant_id"))
        if not config.get("enabled"):
            raise HTTPException(status_code=400, detail="خدمة البريد غير مفعلة")
        result = await _send_email(config, request.to, request.subject, request.html_content)
        await db.email_logs.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": admin.get("tenant_id"),
            "to": request.to,
            "subject": request.subject,
            "status": "sent" if result["success"] else "failed",
            "error": result.get("message") if not result["success"] else None,
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "sent_by": admin.get("id")
        })
        if not result["success"]:
            raise HTTPException(status_code=500, detail=result["message"])
        return result

    @router.post("/send-template")
    async def send_template_email(request: EmailTemplateRequest, admin: dict = Depends(get_tenant_admin)):
        templates = {
            "welcome": {"subject": "مرحباً بك في NT Commerce", "body": "<h1>مرحباً!</h1><p>شكراً لتسجيلك معنا.</p>"},
            "invoice": {"subject": "فاتورة جديدة", "body": "<h1>فاتورة</h1><p>لديك فاتورة جديدة.</p>"},
            "reminder": {"subject": "تذكير بالدفع", "body": "<h1>تذكير</h1><p>لديك دين مستحق.</p>"},
            "report": {"subject": "تقرير يومي", "body": "<h1>التقرير اليومي</h1><p>ملخص نشاطك اليوم.</p>"},
        }
        template = templates.get(request.template_name)
        if not template:
            raise HTTPException(status_code=400, detail=f"القالب غير موجود. المتوفر: {list(templates.keys())}")
        config = await _get_sendgrid_config(admin.get("tenant_id"))
        html = template["body"]
        for key, val in request.variables.items():
            html = html.replace(f"{{{{{key}}}}}", str(val))
        result = await _send_email(config, request.to, template["subject"], html)
        if not result["success"]:
            raise HTTPException(status_code=500, detail=result["message"])
        return result

    @router.get("/logs")
    async def get_email_logs(limit: int = 50, admin: dict = Depends(get_tenant_admin)):
        logs = await db.email_logs.find(
            {"tenant_id": admin.get("tenant_id")}, {"_id": 0}
        ).sort("sent_at", -1).limit(limit).to_list(limit)
        return logs

    return router
