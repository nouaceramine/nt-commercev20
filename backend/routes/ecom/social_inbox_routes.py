"""Unified social inbox → order conversion (p249).

Competitor parity (EcoManager/Vozare social inbox): Messenger / Instagram /
WhatsApp conversations land in one inbox; the agent replies in place and
converts a conversation into a confirmed ecom order without retyping.

Meta/Meta credentials stay an OWNER item — this phase ships the full
framework with a token-secured normalized ingestion webhook (any gateway or
the real Meta webhook can feed it), mock outbound, and the complete
inbox + conversion pipeline.

Tenant side (require_tenant):
  POST /api/ecom/social/sources                      — create channel source (token issued)
  GET  /api/ecom/social/sources                      — list + stats
  GET  /api/ecom/social/conversations                — inbox (status/channel filters)
  GET  /api/ecom/social/conversations/{id}           — thread
  POST /api/ecom/social/conversations/{id}/reply     — outbound (mock send)
  POST /api/ecom/social/conversations/{id}/convert   — → ecom order (full pipeline)
  POST /api/ecom/social/conversations/{id}/close

Public ingestion (token = secret):
  POST /api/ecom/social/webhook/{tenant_id}/{token}
    body: {external_user_id, customer_name, phone?, text, external_message_id?}
"""
from datetime import datetime, timezone
from typing import Optional
import logging
import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from config.database import db, main_db, get_tenant_db
from utils.auth import require_tenant
from routes.ecom.constants import require_ecom_feature

logger = logging.getLogger(__name__)

SOCIAL_CHANNELS = ("messenger", "instagram", "whatsapp")


class SourceIn(BaseModel):
    channel: str
    name: Optional[str] = ""


class ReplyIn(BaseModel):
    text: str


class ConvertIn(BaseModel):
    customer_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = ""
    city: Optional[str] = ""
    wilaya: Optional[str] = ""
    product: str
    qty: int = 1
    price: float = 0
    shipping_fee: float = 0
    notes: Optional[str] = ""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_social_inbox_routes() -> dict:
    tenant_router = APIRouter(tags=["social-inbox"])
    public = APIRouter(tags=["social-inbox-public"])

    # ── sources ──────────────────────────────────────────────────────
    @tenant_router.post("/ecom/social/sources")
    async def create_source(body: SourceIn, user: dict = Depends(require_tenant)):
        await require_ecom_feature(user)
        if body.channel not in SOCIAL_CHANNELS:
            raise HTTPException(status_code=400, detail="قناة غير مدعومة — messenger/instagram/whatsapp")
        tenant_id = user.get("tenant_id") or user.get("id")
        now = _now()
        doc = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "channel": body.channel,
            "name": (body.name or "").strip() or body.channel,
            "token": "SOC-" + secrets.token_hex(12),
            "active": True,
            "stats": {"messages": 0, "conversations": 0},
            "created_by": user.get("id"),
            "created_at": now,
            "updated_at": now,
        }
        await db.ecom_social_sources.insert_one(doc)
        doc.pop("_id", None)
        return {"ok": True, "source": doc,
                "webhook_url": f"/api/ecom/social/webhook/{tenant_id}/{doc['token']}"}

    @tenant_router.get("/ecom/social/sources")
    async def list_sources(user: dict = Depends(require_tenant)):
        await require_ecom_feature(user)
        rows = await db.ecom_social_sources.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
        tenant_id = user.get("tenant_id") or user.get("id")
        for r in rows:
            r["webhook_url"] = f"/api/ecom/social/webhook/{tenant_id}/{r['token']}"
        return {"items": rows}

    @tenant_router.delete("/ecom/social/sources/{source_id}")
    async def delete_source(source_id: str, user: dict = Depends(require_tenant)):
        await require_ecom_feature(user)
        res = await db.ecom_social_sources.delete_one({"id": source_id})
        if not res.deleted_count:
            raise HTTPException(status_code=404, detail="المصدر غير موجود")
        return {"ok": True}

    # ── inbox ────────────────────────────────────────────────────────
    @tenant_router.get("/ecom/social/conversations")
    async def list_conversations(status: Optional[str] = None, channel: Optional[str] = None,
                                 limit: int = Query(50, ge=1, le=200),
                                 user: dict = Depends(require_tenant)):
        await require_ecom_feature(user)
        q = {}
        if status:
            q["status"] = status
        if channel:
            q["channel"] = channel
        rows = await db.ecom_social_conversations.find(
            q, {"_id": 0}).sort("last_at", -1).limit(limit).to_list(limit)
        unread = await db.ecom_social_conversations.count_documents({"unread": {"$gt": 0}})
        return {"items": rows, "unread_conversations": unread}

    @tenant_router.get("/ecom/social/conversations/{conv_id}")
    async def read_conversation(conv_id: str, user: dict = Depends(require_tenant)):
        await require_ecom_feature(user)
        conv = await db.ecom_social_conversations.find_one({"id": conv_id}, {"_id": 0})
        if not conv:
            raise HTTPException(status_code=404, detail="المحادثة غير موجودة")
        msgs = await db.ecom_social_messages.find(
            {"conversation_id": conv_id}, {"_id": 0}).sort("at", 1).to_list(500)
        if conv.get("unread"):
            await db.ecom_social_conversations.update_one(
                {"id": conv_id}, {"$set": {"unread": 0}})
            conv["unread"] = 0
        return {"conversation": conv, "messages": msgs}

    @tenant_router.post("/ecom/social/conversations/{conv_id}/reply")
    async def reply(conv_id: str, body: ReplyIn, user: dict = Depends(require_tenant)):
        await require_ecom_feature(user)
        conv = await db.ecom_social_conversations.find_one({"id": conv_id})
        if not conv:
            raise HTTPException(status_code=404, detail="المحادثة غير موجودة")
        text = (body.text or "").strip()
        if not text:
            raise HTTPException(status_code=400, detail="الرسالة فارغة")
        now = _now()
        msg = {
            "id": str(uuid.uuid4()),
            "conversation_id": conv_id,
            "direction": "out",
            "text": text,
            "sent_via": "mock",  # real Meta/WA send needs the owner's API credentials
            "by": user.get("id"),
            "at": now,
        }
        await db.ecom_social_messages.insert_one(msg)
        await db.ecom_social_conversations.update_one(
            {"id": conv_id}, {"$set": {"last_message": text, "last_at": now, "updated_at": now}})
        msg.pop("_id", None)
        return {"ok": True, "message": msg}

    @tenant_router.post("/ecom/social/conversations/{conv_id}/convert")
    async def convert(conv_id: str, body: ConvertIn, user: dict = Depends(require_tenant)):
        """Convert a conversation into an ecom order — same pipeline as manual entry."""
        await require_ecom_feature(user)
        conv = await db.ecom_social_conversations.find_one({"id": conv_id}, {"_id": 0})
        if not conv:
            raise HTTPException(status_code=404, detail="المحادثة غير موجودة")
        if conv.get("order_id"):
            raise HTTPException(status_code=409, detail="المحادثة حُوِّلت إلى طلب من قبل")
        name = (body.customer_name or conv.get("customer_name") or "").strip()
        phone = (body.phone or conv.get("phone") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="اسم الزبون مطلوب")
        if not (body.product or "").strip():
            raise HTTPException(status_code=400, detail="المنتج مطلوب")
        qty = max(1, int(body.qty or 1))
        price = max(0.0, float(body.price or 0))
        shipping = max(0.0, float(body.shipping_fee or 0))
        subtotal = round(qty * price, 2)
        now = _now()
        order_id = str(uuid.uuid4())
        doc = {
            "id": order_id,
            "order_code": f"SOC-{uuid.uuid4().hex[:8].upper()}",
            "channel": conv["channel"],
            "external_id": "",
            "integration_id": conv.get("source_id"),
            "status": "new",
            "payment_status": "unpaid",
            "payment_method": "cod",
            "customer": {"name": name, "phone": phone, "address": (body.address or "").strip(),
                         "city": (body.city or "").strip(), "wilaya": (body.wilaya or "").strip()},
            "items": [{"name": body.product.strip(), "sku": "", "qty": qty, "price": price,
                       "total": subtotal}],
            "subtotal": subtotal, "shipping_fee": shipping, "total": round(subtotal + shipping, 2),
            "notes": (body.notes or "").strip(),
            "tags": ["social-inbox", f"conv-{conv_id}"],
            "conversation_id": conv_id,
            "shipping_label_id": None, "tracking_number": None, "courier": None,
            "utm": {}, "utm_source": "",
            "status_history": [{"status": "new", "at": now, "by": user.get("id"),
                                "note": f"تحويل من محادثة {conv['channel']}"}],
            "created_at": now, "updated_at": now,
            "created_by": user.get("id"),
        }
        from services.ecom.duplicate_detector import annotate_order
        from services.cod_risk import calculate_risk_score
        from services.application.ecom_order_service import (
            get_network_trust, reputation_on_create, sync_sale_doc, normalize_phone)
        doc["customer"]["phone"] = normalize_phone(doc["customer"]["phone"])
        try:
            await annotate_order(db, doc)
        except Exception:  # noqa: BLE001
            pass
        try:
            risk = calculate_risk_score(doc, customer_history_count=0, customer_stats={})
            doc["cod_risk"] = risk
            if risk["action"] == "manual_review":
                doc["status"] = "needs_review"
            elif risk["action"] == "confirm_first":
                doc["status"] = "awaiting_confirmation"
        except Exception:  # noqa: BLE001
            pass
        try:
            net = await get_network_trust(doc["customer"]["phone"])
            if net.get("found"):
                doc["network_trust"] = net
        except Exception:  # noqa: BLE001
            pass
        await db.ecom_orders.insert_one(doc)
        try:
            await sync_sale_doc(db, doc)
        except Exception:  # noqa: BLE001
            pass
        try:
            await reputation_on_create(doc, user.get("tenant_id") or "")
        except Exception:  # noqa: BLE001
            pass
        await db.ecom_social_conversations.update_one(
            {"id": conv_id},
            {"$set": {"status": "converted", "order_id": order_id,
                      "order_code": doc["order_code"], "updated_at": now}})
        return {"ok": True, "order_id": order_id, "order_code": doc["order_code"],
                "duplicate_warning": bool(doc.get("duplicate_warning"))}

    @tenant_router.post("/ecom/social/conversations/{conv_id}/close")
    async def close_conversation(conv_id: str, user: dict = Depends(require_tenant)):
        await require_ecom_feature(user)
        res = await db.ecom_social_conversations.update_one(
            {"id": conv_id}, {"$set": {"status": "closed", "updated_at": _now()}})
        if not res.matched_count:
            raise HTTPException(status_code=404, detail="المحادثة غير موجودة")
        return {"ok": True}

    # ── public ingestion webhook ─────────────────────────────────────
    @public.post("/ecom/social/webhook/{tenant_id}/{token}")
    async def social_webhook(tenant_id: str, token: str, request: Request):
        tenant = await main_db.saas_tenants.find_one(
            {"id": tenant_id, "is_active": {"$ne": False}}, {"_id": 0, "id": 1})
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        tdb = get_tenant_db(tenant_id)
        source = await tdb.ecom_social_sources.find_one(
            {"token": token, "active": {"$ne": False}}, {"_id": 0})
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")
        try:
            payload = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body")

        ext_user = str(payload.get("external_user_id") or "").strip()
        text = str(payload.get("text") or "").strip()
        if not ext_user or not text:
            raise HTTPException(status_code=422, detail="external_user_id و text مطلوبان")
        ext_mid = str(payload.get("external_message_id") or "").strip()

        # dedup retried deliveries
        if ext_mid and await tdb.ecom_social_messages.find_one(
                {"external_message_id": ext_mid, "source_id": source["id"]}, {"_id": 1}):
            return {"ok": True, "duplicate": True}

        now = _now()
        conv = await tdb.ecom_social_conversations.find_one(
            {"source_id": source["id"], "external_user_id": ext_user,
             "status": {"$ne": "closed"}}, {"_id": 0})
        if not conv:
            conv = {
                "id": str(uuid.uuid4()),
                "source_id": source["id"],
                "channel": source["channel"],
                "external_user_id": ext_user,
                "customer_name": str(payload.get("customer_name") or "").strip(),
                "phone": str(payload.get("phone") or "").strip(),
                "status": "open",
                "unread": 0,
                "order_id": None,
                "last_message": "",
                "last_at": now,
                "created_at": now,
                "updated_at": now,
            }
            await tdb.ecom_social_conversations.insert_one(conv)
            await tdb.ecom_social_sources.update_one(
                {"id": source["id"]}, {"$inc": {"stats.conversations": 1}})
        msg = {
            "id": str(uuid.uuid4()),
            "conversation_id": conv["id"],
            "source_id": source["id"],
            "direction": "in",
            "text": text,
            "external_message_id": ext_mid,
            "at": now,
        }
        await tdb.ecom_social_messages.insert_one(msg)
        await tdb.ecom_social_conversations.update_one(
            {"id": conv["id"]},
            {"$set": {"last_message": text, "last_at": now, "updated_at": now,
                      "status": "open" if conv.get("status") == "converted" else conv.get("status", "open")},
             "$inc": {"unread": 1}})
        await tdb.ecom_social_sources.update_one(
            {"id": source["id"]}, {"$inc": {"stats.messages": 1}, "$set": {"updated_at": now}})
        return {"ok": True, "conversation_id": conv["id"]}

    return {"social_inbox": tenant_router, "social_inbox_public": public}
