"""
WhatsApp Business API Integration Routes
Uses Meta's WhatsApp Cloud API. Requires WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID.
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import os
import uuid
import logging
import httpx
from pymongo.errors import DuplicateKeyError

logger = logging.getLogger(__name__)


def create_whatsapp_integration_routes(db, get_current_user, get_tenant_admin, require_tenant) -> dict:
    router = APIRouter(prefix="/integrations/whatsapp", tags=["whatsapp-integration"])

    WHATSAPP_API_URL = "https://graph.facebook.com/v21.0"

    class WhatsAppSettingsUpdate(BaseModel):
        api_token: Optional[str] = None
        phone_number_id: Optional[str] = None
        business_name: Optional[str] = None
        enabled: bool = True

    class WhatsAppMessageRequest(BaseModel):
        to: str
        message: str

    class WhatsAppTemplateRequest(BaseModel):
        to: str
        template_name: str
        language: str = "ar"
        parameters: List[str] = []

    class WhatsAppBulkRequest(BaseModel):
        numbers: List[str]
        message: str

    async def _get_wa_config(tenant_id: str = None) -> dict:
        config = await db.whatsapp_integration_settings.find_one(
            {"tenant_id": tenant_id} if tenant_id else {}, {"_id": 0}
        )
        if not config:
            config = {
                "api_token": os.environ.get("WHATSAPP_API_TOKEN", ""),
                "phone_number_id": os.environ.get("WHATSAPP_PHONE_NUMBER_ID", ""),
                "business_name": "NT Commerce",
                "enabled": bool(os.environ.get("WHATSAPP_API_TOKEN")),
            }
        if config.get("api_token"):
            from services.crypto_fields import decrypt_field as _df  # p518
            # decrypt_field passes legacy plaintext through unchanged
            config["api_token"] = _df(config["api_token"]) or ""
        return config

    async def _send_whatsapp(config, to_number, message_body) -> dict:
        if not config.get("api_token") or not config.get("phone_number_id"):
            return {"success": False, "message": "إعدادات WhatsApp غير مكتملة. أضف WHATSAPP_API_TOKEN و WHATSAPP_PHONE_NUMBER_ID."}
        phone_id = config["phone_number_id"]
        url = f"{WHATSAPP_API_URL}/{phone_id}/messages"
        headers = {
            "Authorization": f"Bearer {config['api_token']}",
            "Content-Type": "application/json"
        }
        payload = {
            "messaging_product": "whatsapp",
            "to": to_number,
            "type": "text",
            "text": {"body": message_body}
        }
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code in (200, 201):
                    return {"success": True, "message": "تم إرسال الرسالة", "data": resp.json()}
                logger.error(f"WhatsApp provider error: {resp.status_code} {resp.text[:300]}")
                return {"success": False, "message": f"خطأ WhatsApp (HTTP {resp.status_code})"}
        except Exception as e:
            logger.error(f"WhatsApp error: {e}")
            return {"success": False, "message": f"خطأ في الاتصال: {str(e)}"}

    @router.get("/status")
    async def get_whatsapp_status(admin: dict = Depends(get_tenant_admin)):
        config = await _get_wa_config(admin.get("tenant_id"))
        return {
            "configured": bool(config.get("api_token") and config.get("phone_number_id")),
            "phone_number_id": config.get("phone_number_id", "")[:8] + "..." if config.get("phone_number_id") else "",
            "business_name": config.get("business_name"),
            "enabled": config.get("enabled", False),
            "provider": "meta_whatsapp"
        }

    @router.put("/settings")
    async def update_whatsapp_settings(settings: WhatsAppSettingsUpdate, admin: dict = Depends(get_tenant_admin)):
        tenant_id = admin.get("tenant_id")
        update = {
            "tenant_id": tenant_id,
            "business_name": settings.business_name,
            "enabled": settings.enabled,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        if settings.api_token:
            from services.crypto_fields import encrypt_field as _ef  # p518
            update["api_token"] = _ef(settings.api_token)
        if settings.phone_number_id:
            update["phone_number_id"] = settings.phone_number_id
        await db.whatsapp_integration_settings.update_one(
            {"tenant_id": tenant_id}, {"$set": update}, upsert=True
        )
        return {"success": True, "message": "تم تحديث إعدادات WhatsApp"}

    @router.post("/send")
    async def send_whatsapp_message(request: WhatsAppMessageRequest, admin: dict = Depends(get_tenant_admin)):
        if not (request.to or "").strip() or not (request.message or "").strip():
            raise HTTPException(status_code=400, detail="الرقم والرسالة مطلوبان")
        config = await _get_wa_config(admin.get("tenant_id"))
        if not config.get("enabled"):
            raise HTTPException(status_code=400, detail="WhatsApp غير مفعل")
        result = await _send_whatsapp(config, request.to, request.message)
        await db.whatsapp_logs.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": admin.get("tenant_id"),
            "to": request.to,
            "message": request.message[:100],
            "status": "sent" if result["success"] else "failed",
            "error": result.get("message") if not result["success"] else None,
            "sent_at": datetime.now(timezone.utc).isoformat(),
        })
        if not result["success"]:
            raise HTTPException(status_code=500, detail=result["message"])
        return result

    @router.post("/send-bulk")
    async def send_bulk_whatsapp(request: WhatsAppBulkRequest, admin: dict = Depends(get_tenant_admin)):
        numbers = [n.strip() for n in request.numbers if n and n.strip()]
        if not numbers:
            raise HTTPException(status_code=400, detail="قائمة الأرقام فارغة")
        if len(numbers) > 500:
            raise HTTPException(status_code=400, detail="الحد الأقصى 500 رقم في الدفعة")
        if not (request.message or "").strip():
            raise HTTPException(status_code=400, detail="الرسالة فارغة")
        request.numbers = numbers
        config = await _get_wa_config(admin.get("tenant_id"))
        if not config.get("enabled"):
            raise HTTPException(status_code=400, detail="WhatsApp غير مفعل")
        results = {"sent": 0, "failed": 0, "errors": []}
        for number in request.numbers:
            result = await _send_whatsapp(config, number, request.message)
            if result["success"]:
                results["sent"] += 1
            else:
                results["failed"] += 1
                results["errors"].append({"number": number, "error": result["message"]})
        return results

    @router.post("/send-template")
    async def send_template_message(request: WhatsAppTemplateRequest, admin: dict = Depends(get_tenant_admin)):
        if not (request.to or "").strip() or not (request.template_name or "").strip():
            raise HTTPException(status_code=400, detail="الرقم واسم القالب مطلوبان")
        config = await _get_wa_config(admin.get("tenant_id"))
        if not config.get("enabled"):
            raise HTTPException(status_code=400, detail="WhatsApp غير مفعل")
        if not config.get("api_token") or not config.get("phone_number_id"):
            raise HTTPException(status_code=400, detail="إعدادات WhatsApp غير مكتملة")
        phone_id = config["phone_number_id"]
        url = f"{WHATSAPP_API_URL}/{phone_id}/messages"
        components = []
        if request.parameters:
            components = [{"type": "body", "parameters": [{"type": "text", "text": p} for p in request.parameters]}]
        payload = {
            "messaging_product": "whatsapp",
            "to": request.to,
            "type": "template",
            "template": {"name": request.template_name, "language": {"code": request.language}, "components": components}
        }
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(url, json=payload, headers={
                    "Authorization": f"Bearer {config['api_token']}",
                    "Content-Type": "application/json"
                })
                if resp.status_code in (200, 201):
                    return {"success": True, "message": "تم إرسال القالب"}
                logger.error(f"WhatsApp template provider error: {resp.status_code} {resp.text[:300]}")
                raise HTTPException(status_code=502, detail="فشل الإرسال عبر مزود WhatsApp")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=500, detail="Internal server error")

    @router.post("/webhook")
    async def whatsapp_webhook(request: Request):
        from services.ecom.webhook_security import read_signed_body, decode_json_body, verify_meta_signature
        raw_body = await read_signed_body(request)
        import os
        app_secret = os.environ.get("WHATSAPP_APP_SECRET", "")
        if not app_secret:
            raise HTTPException(status_code=503, detail="WHATSAPP_APP_SECRET is not configured")
        if not verify_meta_signature(raw_body, request.headers.get("X-Hub-Signature-256", ""), app_secret):
            raise HTTPException(status_code=401, detail="Webhook signature verification failed")
        body = decode_json_body(raw_body)
        if body.get("object") == "whatsapp_business_account":
            from routes.whatsapp_routes import resolve_tenant_by_phone_id  # p518
            for entry in body.get("entry", []):
                for change in entry.get("changes", []):
                    value = change.get("value", {})
                    phone_id = (value.get("metadata") or {}).get("phone_number_id", "")
                    tenant_id, tdb = await resolve_tenant_by_phone_id(phone_id)
                    if tdb is None:
                        logger.warning(f"WhatsApp integration webhook: unattributed phone_number_id={phone_id}")
                        continue
                    messages = value.get("messages", [])
                    for msg in messages:
                        dedupe_id = f"wa-in:{msg['id']}" if msg.get("id") else str(uuid.uuid4())
                        doc = {
                            "_id": dedupe_id,  # deterministic _id → Meta retries dedupe
                            "id": dedupe_id,
                            "tenant_id": tenant_id,
                            "from": msg.get("from"),
                            "type": msg.get("type"),
                            "text": msg.get("text", {}).get("body", ""),
                            "timestamp": msg.get("timestamp"),
                            "received_at": datetime.now(timezone.utc).isoformat()
                        }
                        try:
                            await tdb.whatsapp_incoming.insert_one(doc)
                        except DuplicateKeyError:
                            pass  # Meta retry of an already-stored message
        return {"status": "ok"}

    @router.get("/webhook")
    async def verify_whatsapp_webhook(request: Request):
        mode = request.query_params.get("hub.mode")
        token = request.query_params.get("hub.verify_token")
        challenge = request.query_params.get("hub.challenge")
        if mode == "subscribe" and token:
            return int(challenge) if challenge else ""
        raise HTTPException(status_code=403, detail="Forbidden")

    @router.get("/logs")
    async def get_whatsapp_logs(limit: int = 50, admin: dict = Depends(get_tenant_admin)):
        logs = await db.whatsapp_logs.find(
            {"tenant_id": admin.get("tenant_id")}, {"_id": 0}
        ).sort("sent_at", -1).limit(limit).to_list(limit)
        return logs

    return router
