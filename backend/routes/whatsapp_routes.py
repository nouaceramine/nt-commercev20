"""
WhatsApp Business API Integration Routes
Handles incoming/outgoing WhatsApp messages for accounting tasks
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging
import os
import json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"])


class WhatsAppConfig(BaseModel):
    phone_number_id: str = ""
    access_token: str = ""
    verify_token: str = ""
    webhook_url: str = ""
    is_active: bool = False
    auto_reply: bool = True
    allowed_commands: List[str] = ["expense", "invoice", "balance", "report"]


class WhatsAppMessage(BaseModel):
    to: str
    message: str
    message_type: str = "text"


class WhatsAppCommandResult(BaseModel):
    command: str
    success: bool
    message: str
    data: Optional[dict] = None


COMMAND_MAP = {
    "مصروف": "expense",
    "فاتورة": "invoice",
    "رصيد": "balance",
    "تقرير": "report",
    "مبيعات": "sales",
    "expense": "expense",
    "invoice": "invoice",
    "balance": "balance",
    "report": "report",
    "sales": "sales",
}


def parse_whatsapp_command(text: str) -> dict:
    """Parse incoming WhatsApp message into a command"""
    text = text.strip()
    parts = text.split(maxsplit=1)
    command_word = parts[0].lower() if parts else ""
    args = parts[1] if len(parts) > 1 else ""

    command = COMMAND_MAP.get(command_word, None)
    if not command:
        return {"command": "unknown", "args": text, "raw": text}

    return {"command": command, "args": args, "raw": text}


def create_whatsapp_routes(db, get_current_user) -> dict:
    """Create WhatsApp routes with dependencies"""

    @router.get("/config")
    async def get_whatsapp_config(current_user: dict = Depends(get_current_user)):
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=403, detail="Tenant access required")

        config = await db.whatsapp_config.find_one(
            {"tenant_id": tenant_id}, {"_id": 0}
        )
        if not config:
            config = {
                "tenant_id": tenant_id,
                "phone_number_id": "",
                "access_token": "",
                "verify_token": str(uuid.uuid4())[:8],
                "is_active": False,
                "auto_reply": True,
                "allowed_commands": ["expense", "invoice", "balance", "report", "sales"],
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.whatsapp_config.insert_one(config)
            config.pop("_id", None)

        # Mask access token
        if config.get("access_token"):
            config["access_token"] = config["access_token"][:8] + "..." 
        return config

    @router.put("/config")
    async def update_whatsapp_config(
        config_data: WhatsAppConfig,
        current_user: dict = Depends(get_current_user),
    ):
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=403, detail="Tenant access required")

        update_data = config_data.model_dump()
        update_data["tenant_id"] = tenant_id
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

        await db.whatsapp_config.update_one(
            {"tenant_id": tenant_id}, {"$set": update_data}, upsert=True
        )
        return {"success": True, "message": "تم تحديث إعدادات WhatsApp بنجاح"}

    @router.post("/send")
    async def send_whatsapp_message(
        msg: WhatsAppMessage,
        current_user: dict = Depends(get_current_user),
    ):
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=403, detail="Tenant access required")

        config = await db.whatsapp_config.find_one({"tenant_id": tenant_id})
        if not config or not config.get("is_active"):
            raise HTTPException(status_code=400, detail="WhatsApp غير مفعل")

        # Log the message
        message_log = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "direction": "outgoing",
            "to": msg.to,
            "message": msg.message,
            "message_type": msg.message_type,
            "status": "queued",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.whatsapp_messages.insert_one(message_log)

        # In production, this would call the WhatsApp Business API
        # For now, we simulate success
        return {
            "success": True,
            "message_id": message_log["id"],
            "status": "queued",
        }

    @router.get("/webhook")
    async def verify_webhook(request: Request):
        """WhatsApp webhook verification endpoint"""
        params = request.query_params
        mode = params.get("hub.mode")
        token = params.get("hub.verify_token")
        challenge = params.get("hub.challenge")

        # Find config with this verify token
        config = await db.whatsapp_config.find_one({"verify_token": token})
        if mode == "subscribe" and config:
            return int(challenge) if challenge else 0
        raise HTTPException(status_code=403, detail="Verification failed")

    @router.post("/webhook")
    async def receive_webhook(request: Request):
        """Process incoming WhatsApp messages"""
        body = await request.json()
        
        try:
            entry = body.get("entry", [{}])[0]
            changes = entry.get("changes", [{}])[0]
            value = changes.get("value", {})
            messages = value.get("messages", [])

            for msg in messages:
                sender = msg.get("from", "")
                text = msg.get("text", {}).get("body", "")
                msg_type = msg.get("type", "text")

                # Parse command
                parsed = parse_whatsapp_command(text)

                # Log incoming message
                message_log = {
                    "id": str(uuid.uuid4()),
                    "direction": "incoming",
                    "from": sender,
                    "message": text,
                    "message_type": msg_type,
                    "parsed_command": parsed,
                    "status": "received",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.whatsapp_messages.insert_one(message_log)

        except Exception as e:
            logger.error(f"WhatsApp webhook error: {e}")

        return {"status": "ok"}

    @router.get("/messages")
    async def get_messages(
        limit: int = 50,
        direction: Optional[str] = None,
        current_user: dict = Depends(get_current_user),
    ):
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=403, detail="Tenant access required")

        query = {"tenant_id": tenant_id}
        if direction:
            query["direction"] = direction

        messages = await db.whatsapp_messages.find(
            query, {"_id": 0}
        ).sort("created_at", -1).limit(limit).to_list(limit)
        return messages

    @router.get("/stats")
    async def get_whatsapp_stats(current_user: dict = Depends(get_current_user)):
        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=403, detail="Tenant access required")

        pipeline = [
            {"$match": {"tenant_id": tenant_id}},
            {"$group": {
                "_id": "$direction",
                "count": {"$sum": 1}
            }}
        ]
        results = await db.whatsapp_messages.aggregate(pipeline).to_list(10)
        
        stats = {"incoming": 0, "outgoing": 0, "total": 0}
        for r in results:
            stats[r["_id"]] = r["count"]
            stats["total"] += r["count"]

        config = await db.whatsapp_config.find_one(
            {"tenant_id": tenant_id}, {"_id": 0, "is_active": 1}
        )
        stats["is_active"] = config.get("is_active", False) if config else False
        return stats

    return router
