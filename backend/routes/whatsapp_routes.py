"""
WhatsApp Business API Integration Routes
Handles incoming/outgoing WhatsApp messages for accounting tasks
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging
import os
from pymongo.errors import DuplicateKeyError

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


async def resolve_tenant_by_phone_id(phone_number_id: str):
    """Map a Meta phone_number_id to its tenant (p518 webhook attribution).

    Webhook calls carry no auth, so the injected db proxy falls back to main_db;
    without resolving, incoming messages were orphaned where no tenant reader
    could ever see them. Returns (tenant_id, tenant_db) or (None, None).
    """
    from config.database import client, main_db
    if not phone_number_id:
        return None, None
    tenants = await main_db.saas_tenants.find(
        {"is_active": {"$ne": False}}, {"_id": 0, "id": 1, "db_name": 1}).to_list(500)
    for t in tenants:
        dbn = t.get("db_name") or "tenant_" + t["id"].replace("-", "_")
        tdb = client[dbn]
        for coll in ("whatsapp_config", "whatsapp_integration_settings"):
            cfg = await tdb[coll].find_one(
                {"phone_number_id": phone_number_id}, {"_id": 0, "tenant_id": 1})
            if cfg:
                return t["id"], tdb
    return None, None


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

        # Mask access token (p298: stored AES-256-GCM encrypted — decrypt to mask;
        # decrypt_field passes legacy plaintext through unchanged)
        if config.get("access_token"):
            from services.crypto_fields import decrypt_field as _df
            plain = _df(config["access_token"]) or ""
            config["access_token"] = (plain[:8] + "...") if plain else ""
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

        # p298: encrypt access_token at rest; never persist the masked echo
        # ("EAA12345...") that GET returns — keep the stored value instead.
        tok = update_data.get("access_token") or ""
        if tok.endswith("..."):
            existing = await db.whatsapp_config.find_one(
                {"tenant_id": tenant_id}, {"_id": 0, "access_token": 1}
            )
            update_data["access_token"] = (existing or {}).get("access_token", "")
        elif tok:
            from services.crypto_fields import encrypt_field as _ef
            update_data["access_token"] = _ef(tok)

        await db.whatsapp_config.update_one(
            {"tenant_id": tenant_id}, {"$set": update_data}, upsert=True
        )
        return {"success": True, "message": "تم تحديث إعدادات WhatsApp بنجاح"}

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
        from services.ecom.webhook_security import read_signed_body, decode_json_body, verify_meta_signature
        raw_body = await read_signed_body(request)
        app_secret = os.environ.get("WHATSAPP_APP_SECRET", "")
        if not app_secret:
            raise HTTPException(status_code=503, detail="WHATSAPP_APP_SECRET is not configured")
        if not verify_meta_signature(raw_body, request.headers.get("X-Hub-Signature-256", ""), app_secret):
            raise HTTPException(status_code=401, detail="Webhook signature verification failed")
        body = decode_json_body(raw_body)
        
        try:
            # p518: iterate ALL entries/changes (was [0] only), attribute the
            # message to its tenant via metadata.phone_number_id, and dedupe on
            # Meta retries via a deterministic id
            for entry in body.get("entry", []):
                for change in entry.get("changes", []):
                    value = change.get("value", {})
                    phone_id = (value.get("metadata") or {}).get("phone_number_id", "")
                    tenant_id, tdb = await resolve_tenant_by_phone_id(phone_id)
                    if tdb is None:
                        # p518: no tenant claims this phone_number_id — the message
                        # has no possible reader; log and skip instead of orphaning
                        logger.warning(f"WhatsApp webhook: unattributed phone_number_id={phone_id}")
                        continue
                    for msg in value.get("messages", []):
                        sender = msg.get("from", "")
                        text = msg.get("text", {}).get("body", "")
                        msg_type = msg.get("type", "text")

                        # Parse command
                        parsed = parse_whatsapp_command(text)

                        # Log incoming message
                        dedupe_id = f"wa:{msg['id']}" if msg.get("id") else str(uuid.uuid4())
                        message_log = {
                            "_id": dedupe_id,  # deterministic _id → Meta retries dedupe
                            "id": dedupe_id,
                            "tenant_id": tenant_id,
                            "direction": "incoming",
                            "from": sender,
                            "message": text,
                            "message_type": msg_type,
                            "parsed_command": parsed,
                            "status": "received",
                            "created_at": datetime.now(timezone.utc).isoformat(),
                        }
                        try:
                            await tdb.whatsapp_messages.insert_one(message_log)
                        except DuplicateKeyError:
                            pass  # Meta retry of an already-stored message

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

    # ── Message templates (قوالب الرسائل) ──
    class TemplateBody(BaseModel):
        name: str
        category: str = "general"
        body: str
        variables: List[str] = []
        is_active: bool = True

    @router.get("/templates")
    async def list_templates(current_user: dict = Depends(get_current_user)):
        return await db.whatsapp_templates.find({}, {"_id": 0}).to_list(200)

    def _require_template_admin(user: dict):
        # p518: templates shape business messaging — admin/manager only
        if user.get("role") not in ("admin", "manager", "tenant_admin", "super_admin"):
            raise HTTPException(status_code=403, detail="إدارة القوالب متاحة للإدارة فقط")

    @router.post("/templates", status_code=201)
    async def create_template(tpl: TemplateBody, current_user: dict = Depends(get_current_user)):
        _require_template_admin(current_user)
        name = (tpl.name or "").strip()
        body = (tpl.body or "").strip()
        if not name or not body:
            raise HTTPException(status_code=400, detail="اسم القالب ونصه مطلوبان")
        if await db.whatsapp_templates.find_one({"name": name}):
            raise HTTPException(status_code=400, detail="يوجد قالب بهذا الاسم")
        doc = {"id": str(uuid.uuid4()), **tpl.model_dump(),
               "created_at": datetime.now(timezone.utc).isoformat()}
        doc["name"], doc["body"] = name, body
        await db.whatsapp_templates.insert_one(dict(doc))
        doc.pop("_id", None)
        return doc

    @router.put("/templates/{template_id}")
    async def update_template(template_id: str, tpl: TemplateBody, current_user: dict = Depends(get_current_user)):
        _require_template_admin(current_user)
        if not (tpl.name or "").strip() or not (tpl.body or "").strip():
            raise HTTPException(status_code=400, detail="اسم القالب ونصه مطلوبان")
        res = await db.whatsapp_templates.update_one({"id": template_id}, {"$set": tpl.model_dump()})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="القالب غير موجود")
        return await db.whatsapp_templates.find_one({"id": template_id}, {"_id": 0})

    @router.delete("/templates/{template_id}")
    async def delete_template(template_id: str, current_user: dict = Depends(get_current_user)):
        _require_template_admin(current_user)
        await db.whatsapp_templates.delete_one({"id": template_id})
        return {"message": "تم حذف القالب"}

    return router

