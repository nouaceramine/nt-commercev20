"""M13b: Marketing growth layer — ad campaigns (Meta/TikTok…), unified
omnichannel team inbox (6 channels) with phone-based client identification,
assignment, internal notes, evaluation; and marketer performance ranking.

Tenant-scoped (tenant db). Codes: CMP_YYYY / CNV_YYYY counters.
"""
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from utils.ids import new_id
from .crm_routes import normalize_phone

CAMPAIGN_PLATFORMS = ["meta", "tiktok", "google", "snapchat", "other"]
CAMPAIGN_DECISIONS = ["continue", "stop", "review"]
CHANNELS = ["whatsapp", "messenger", "instagram", "telegram", "tiktok", "x"]
CONV_STATUSES = ["open", "pending", "resolved", "converted", "closed"]


# ── Pure helpers (unit-tested) ──────────────────────────────────────────────
def campaign_metrics(spend: float, leads: int, conversions: int) -> dict:
    spend = float(spend or 0)
    leads = int(leads or 0)
    conversions = int(conversions or 0)
    return {
        "cost_per_lead": round(spend / leads, 2) if leads > 0 else None,
        "cost_per_conversion": round(spend / conversions, 2) if conversions > 0 else None,
        "conversion_rate": round(conversions / leads * 100, 2) if leads > 0 else None,
    }


def performance_score(conversations: int, conversions: int, tasks_done: int,
                      viewings: int, minutes_active: float) -> float:
    """Weighted marketer score: conversion 40/ea, task 20/ea, viewing 10/ea,
    conversation 2/ea, activity up to 10 (capped at 160 active hours)."""
    score = conversions * 40 + tasks_done * 20 + viewings * 10 + conversations * 2
    hours = max(0.0, minutes_active_or_zero(minutes_active)) / 60.0
    score += min(hours, 160) / 160 * 10
    return round(score, 2)


def minutes_active_or_zero(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


async def _next(db, prefix: str) -> str:
    year = datetime.now(timezone.utc).year
    doc = await db.counters.find_one_and_update(
        {"_id": f"{prefix}_{year}"}, {"$inc": {"seq": 1}}, upsert=True, return_document=True
    )
    return f"{prefix}-{year}-{doc['seq']:04d}"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


# ── Payloads ────────────────────────────────────────────────────────────────
class CampaignIn(BaseModel):
    name: str
    platform: str = "meta"
    start_date: str = ""
    end_date: str = ""
    spend: float = 0
    leads_count: int = 0
    notes: str = ""


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    spend: Optional[float] = None
    leads_count: Optional[int] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None
    decision: Optional[str] = None


class ConversationIn(BaseModel):
    channel: str
    external_user_id: str = ""
    client_phone: str = ""
    client_name: str = ""
    campaign_id: Optional[str] = None
    assigned_to: Optional[str] = None


class MessageIn(BaseModel):
    text: str
    direction: str = "out"  # out = team → client, in = client → team


class NoteIn(BaseModel):
    text: str


class EvalIn(BaseModel):
    rating: int  # 1..5
    note: str = ""


def create_crm_growth_routes(db, get_current_user, get_tenant_admin, require_tenant):
    router = APIRouter(prefix="/crm", tags=["crm-growth"])

    # ── Campaigns ───────────────────────────────────────────────────────────
    @router.get("/campaigns")
    async def list_campaigns(user: dict = Depends(require_tenant)):
        items = []
        async for c in db.crm_campaigns.find({}).sort("created_at", -1).limit(200):
            conv_count = await db.crm_conversations.count_documents({"campaign_id": c["id"]})
            converted = await db.crm_conversations.count_documents({"campaign_id": c["id"], "status": "converted"})
            m = campaign_metrics(c.get("spend"), c.get("leads_count"), converted)
            items.append(_clean(c) | {"conversations_count": conv_count, "conversions": converted, "metrics": m})
        return {"items": items}

    @router.post("/campaigns")
    async def create_campaign(payload: CampaignIn, user: dict = Depends(get_tenant_admin)):
        if not payload.name.strip():
            raise HTTPException(status_code=422, detail="name_required")
        if payload.platform not in CAMPAIGN_PLATFORMS:
            raise HTTPException(status_code=422, detail="bad_platform")
        doc = payload.model_dump()
        doc.update({"id": new_id(), "code": await _next(db, "CMP"), "decision": "review",
                    "created_at": _now(), "created_by": user.get("id")})
        await db.crm_campaigns.insert_one(doc)
        return _clean(doc)

    @router.put("/campaigns/{cid}")
    async def update_campaign(cid: str, payload: CampaignUpdate, user: dict = Depends(get_tenant_admin)):
        data = {k: v for k, v in payload.model_dump().items() if v is not None}
        if "decision" in data and data["decision"] not in CAMPAIGN_DECISIONS:
            raise HTTPException(status_code=422, detail="bad_decision")
        data["updated_at"] = _now()
        r = await db.crm_campaigns.update_one({"id": cid}, {"$set": data})
        if not r.matched_count:
            raise HTTPException(status_code=404, detail="not_found")
        return {"message": "updated"}

    # ── Omnichannel inbox ───────────────────────────────────────────────────
    async def _identify_client(phone: str):
        ph = normalize_phone(phone)
        if not ph:
            return None
        return await db.crm_clients.find_one({"phones": ph}, {"_id": 0, "id": 1, "name": 1, "status": 1})

    @router.get("/inbox")
    async def inbox(status: Optional[str] = None, channel: Optional[str] = None,
                    assigned_to: Optional[str] = None, user: dict = Depends(require_tenant)):
        q = {}
        if status in CONV_STATUSES:
            q["status"] = status
        if channel in CHANNELS:
            q["channel"] = channel
        if assigned_to:
            q["assigned_to"] = assigned_to
        cursor = db.crm_conversations.find(q, {"messages": 0, "internal_notes": 0}).sort("last_message_at", -1).limit(200)
        return {"items": [_clean(d) async for d in cursor]}

    @router.post("/inbox/conversations")
    async def create_conversation(payload: ConversationIn, user: dict = Depends(get_tenant_admin)):
        if payload.channel not in CHANNELS:
            raise HTTPException(status_code=422, detail="bad_channel")
        client = await _identify_client(payload.client_phone)
        existing = None
        if payload.external_user_id:
            existing = await db.crm_conversations.find_one(
                {"channel": payload.channel, "external_user_id": payload.external_user_id,
                 "status": {"$nin": ["closed"]}})
        if existing:
            return _clean(existing) | {"deduplicated": True}
        doc = payload.model_dump()
        doc["client_phone"] = normalize_phone(payload.client_phone)
        doc.update({
            "id": new_id(), "code": await _next(db, "CNV"),
            "status": "open", "messages": [], "internal_notes": [],
            "evaluation": None,
            "client_id": (client or {}).get("id"),
            "client_name": payload.client_name or (client or {}).get("name") or "",
            "assigned_to": payload.assigned_to or user.get("id"),
            "created_at": _now(), "last_message_at": _now(),
        })
        await db.crm_conversations.insert_one(doc)
        return _clean(doc)

    @router.get("/inbox/conversations/{cid}")
    async def get_conversation(cid: str, user: dict = Depends(require_tenant)):
        doc = await db.crm_conversations.find_one({"id": cid})
        if not doc:
            raise HTTPException(status_code=404, detail="not_found")
        return _clean(doc)

    @router.post("/inbox/conversations/{cid}/messages")
    async def add_message(cid: str, payload: MessageIn, user: dict = Depends(require_tenant)):
        if payload.direction not in ("in", "out"):
            raise HTTPException(status_code=422, detail="bad_direction")
        if not payload.text.strip():
            raise HTTPException(status_code=422, detail="text_required")
        msg = {"id": new_id(), "direction": payload.direction, "text": payload.text.strip(),
               "at": _now(), "by": user.get("id")}
        r = await db.crm_conversations.update_one(
            {"id": cid},
            {"$push": {"messages": msg}, "$set": {"last_message_at": msg["at"]}})
        if not r.matched_count:
            raise HTTPException(status_code=404, detail="not_found")
        return msg

    @router.post("/inbox/conversations/{cid}/notes")
    async def add_note(cid: str, payload: NoteIn, user: dict = Depends(require_tenant)):
        if not payload.text.strip():
            raise HTTPException(status_code=422, detail="text_required")
        note = {"id": new_id(), "text": payload.text.strip(), "at": _now(), "by": user.get("id")}
        r = await db.crm_conversations.update_one({"id": cid}, {"$push": {"internal_notes": note}})
        if not r.matched_count:
            raise HTTPException(status_code=404, detail="not_found")
        return note

    @router.put("/inbox/conversations/{cid}")
    async def update_conversation(cid: str, payload: dict, user: dict = Depends(get_tenant_admin)):
        data = {}
        if (payload or {}).get("status") in CONV_STATUSES:
            data["status"] = payload["status"]
        if (payload or {}).get("assigned_to"):
            data["assigned_to"] = payload["assigned_to"]
        if (payload or {}).get("campaign_id"):
            data["campaign_id"] = payload["campaign_id"]
        if not data:
            raise HTTPException(status_code=422, detail="nothing_to_update")
        data["updated_at"] = _now()
        r = await db.crm_conversations.update_one({"id": cid}, {"$set": data})
        if not r.matched_count:
            raise HTTPException(status_code=404, detail="not_found")
        return {"message": "updated"}

    @router.post("/inbox/conversations/{cid}/evaluate")
    async def evaluate_conversation(cid: str, payload: EvalIn, user: dict = Depends(get_tenant_admin)):
        if not 1 <= payload.rating <= 5:
            raise HTTPException(status_code=422, detail="bad_rating")
        ev = {"rating": payload.rating, "note": payload.note, "at": _now(), "by": user.get("id")}
        r = await db.crm_conversations.update_one({"id": cid}, {"$set": {"evaluation": ev}})
        if not r.matched_count:
            raise HTTPException(status_code=404, detail="not_found")
        return ev

    @router.post("/inbox/conversations/{cid}/link-client")
    async def link_client(cid: str, payload: dict, user: dict = Depends(get_tenant_admin)):
        client_id = (payload or {}).get("client_id")
        client = await db.crm_clients.find_one({"id": client_id}, {"id": 1, "name": 1})
        if not client:
            raise HTTPException(status_code=404, detail="client_not_found")
        r = await db.crm_conversations.update_one(
            {"id": cid}, {"$set": {"client_id": client["id"], "client_name": client["name"]}})
        if not r.matched_count:
            raise HTTPException(status_code=404, detail="not_found")
        return {"message": "linked", "client_id": client["id"]}

    # ── Marketer performance ────────────────────────────────────────────────
    @router.get("/performance")
    async def performance(user: dict = Depends(require_tenant)):
        """Per-employee marketing scoreboard over all time (conversations,
        conversions, tasks done, viewings, tracked activity minutes)."""
        employees = [e async for e in db.employees.find({}, {"id": 1, "name": 1, "full_name": 1, "role": 1})]
        board = []
        for e in employees:
            eid = e["id"]
            convs = await db.crm_conversations.count_documents({"assigned_to": eid})
            convd = await db.crm_conversations.count_documents({"assigned_to": eid, "status": "converted"})
            tasks_done = await db.tasks.count_documents(
                {"assigned_to": eid, "status": {"$in": ["done", "completed"]}})
            viewings = await db.crm_viewings.count_documents({"created_by": eid})
            minutes = 0.0
            async for a in db.attendance.find({"employee_id": eid}, {"minutes_active": 1, "work_minutes": 1}):
                minutes += minutes_active_or_zero(a.get("minutes_active") or a.get("work_minutes"))
            board.append({
                "employee_id": eid,
                "name": e.get("name") or e.get("full_name") or eid,
                "conversations": convs, "conversions": convd,
                "tasks_done": tasks_done, "viewings": viewings,
                "minutes_active": round(minutes, 1),
                "score": performance_score(convs, convd, tasks_done, viewings, minutes),
            })
        board.sort(key=lambda x: -x["score"])
        for i, row in enumerate(board, 1):
            row["rank"] = i
        return {"generated_at": _now(), "items": board}

    return router
