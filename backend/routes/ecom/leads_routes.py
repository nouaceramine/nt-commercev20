"""E-Commerce Hub: Multi-Channel Leads

Lightweight leads collection — populated by social/messaging integrations in P3+.
For P1 we expose CRUD so a tenant can manually log leads (e.g. WhatsApp DM).
"""
from datetime import datetime, timezone
from typing import Optional
import uuid
import re

from fastapi import APIRouter, Depends, HTTPException, Query

from config.database import db
from utils.auth import require_tenant
from .constants import CHANNEL_KEYS, LEAD_STATUS_KEYS, require_ecom_feature

router = APIRouter(tags=["E-Commerce Leads"])


@router.get("/ecom/leads")
async def list_leads(
    channel: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    skip: int = Query(0, ge=0),
    user: dict = Depends(require_tenant),
):
    await require_ecom_feature(user)
    query: dict = {}
    if channel:
        if channel not in CHANNEL_KEYS:
            raise HTTPException(status_code=400, detail="قناة غير صالحة")
        query["channel"] = channel
    if status:
        if status not in LEAD_STATUS_KEYS:
            raise HTTPException(status_code=400, detail="حالة غير صالحة")
        query["status"] = status
    if search:
        safe = re.escape(search.strip())
        query["$or"] = [
            {"name": {"$regex": safe, "$options": "i"}},
            {"phone": {"$regex": safe, "$options": "i"}},
            {"message": {"$regex": safe, "$options": "i"}},
        ]

    total = await db.ecom_leads.count_documents(query)
    rows = await (
        db.ecom_leads.find(query, {"_id": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
        .to_list(limit)
    )
    return {"items": rows, "total": total, "limit": limit, "skip": skip}


@router.post("/ecom/leads")
async def create_lead(body: dict, user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    channel = (body.get("channel") or "manual").strip().lower()
    if channel not in CHANNEL_KEYS:
        raise HTTPException(status_code=400, detail="قناة غير صالحة")
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="الاسم مطلوب")

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "channel": channel,
        "external_id": (body.get("external_id") or "").strip(),
        "integration_id": body.get("integration_id"),
        "name": name,
        "phone": (body.get("phone") or "").strip(),
        "email": (body.get("email") or "").strip(),
        "message": (body.get("message") or "").strip(),
        "status": "new",
        "tags": list(body.get("tags") or []),
        "ai_category": None,            # populated in P5 via LLM
        "ai_score": None,
        "converted_order_id": None,
        "created_at": now,
        "updated_at": now,
        "created_by": user.get("id"),
    }
    await db.ecom_leads.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/ecom/leads/{lead_id}")
async def update_lead(lead_id: str, body: dict, user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    existing = await db.ecom_leads.find_one({"id": lead_id})
    if not existing:
        raise HTTPException(status_code=404, detail="العميل المحتمل غير موجود")
    updates: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    for key in ("name", "phone", "email", "message"):
        if key in body:
            updates[key] = (body.get(key) or "").strip()
    if "status" in body:
        if body["status"] not in LEAD_STATUS_KEYS:
            raise HTTPException(status_code=400, detail="حالة غير صالحة")
        updates["status"] = body["status"]
    if "tags" in body and isinstance(body["tags"], list):
        updates["tags"] = list(body["tags"])
    await db.ecom_leads.update_one({"id": lead_id}, {"$set": updates})
    return await db.ecom_leads.find_one({"id": lead_id}, {"_id": 0})


@router.delete("/ecom/leads/{lead_id}")
async def delete_lead(lead_id: str, user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    result = await db.ecom_leads.delete_one({"id": lead_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="العميل المحتمل غير موجود")
    return {"ok": True}
