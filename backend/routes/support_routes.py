"""Support ticket system (p246).

Competitor parity (EcoManager/Vozare in-app support): tenants open support
tickets from inside the app; the platform team answers from the super-admin
side. One collection in main_db with an embedded message thread.

Tenant side (require_tenant):
  POST /api/support/tickets              — open a ticket
  GET  /api/support/tickets              — my tenant's tickets
  GET  /api/support/tickets/{id}         — thread (marks platform replies read)
  POST /api/support/tickets/{id}/reply   — add message (reopens resolved)
  POST /api/support/tickets/{id}/close   — close

Platform side (get_super_admin):
  GET  /api/admin/support/tickets        — all tickets, filters + unread count
  GET  /api/admin/support/tickets/{id}   — thread (marks tenant replies read)
  POST /api/admin/support/tickets/{id}/reply
  PUT  /api/admin/support/tickets/{id}   — status / priority
"""
from datetime import datetime, timezone
from typing import Optional
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from config.database import main_db
from utils.auth import require_tenant, get_super_admin

logger = logging.getLogger(__name__)

CATEGORIES = ("technical", "billing", "feature", "other")
PRIORITIES = ("low", "normal", "high")
STATUSES = ("open", "in_progress", "resolved", "closed")

CATEGORY_AR = {"technical": "تقني", "billing": "فوترة", "feature": "اقتراح ميزة", "other": "أخرى"}


class TicketIn(BaseModel):
    subject: str
    message: str
    category: str = "other"
    priority: str = "normal"


class ReplyIn(BaseModel):
    message: str


class AdminUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _msg(sender: str, name: str, body: str) -> dict:
    return {"id": str(uuid.uuid4()), "sender": sender, "name": name,
            "body": body.strip(), "at": _now()}


def _public(t: dict) -> dict:
    t.pop("_id", None)
    return t


async def _next_code() -> str:
    from services.code_generator import generate_code
    return await generate_code(main_db, "support_tickets", "TKT", 5, with_year=False)


def create_support_routes() -> dict:
    tenant_router = APIRouter(prefix="/support", tags=["support"])
    admin_router = APIRouter(prefix="/admin/support", tags=["support-admin"])

    # ── tenant side ──────────────────────────────────────────────────
    @tenant_router.post("/tickets")
    async def create_ticket(body: TicketIn, user: dict = Depends(require_tenant)):
        subject = (body.subject or "").strip()
        message = (body.message or "").strip()
        if not subject or not message:
            raise HTTPException(status_code=400, detail="الموضوع والرسالة مطلوبان")
        if body.category not in CATEGORIES or body.priority not in PRIORITIES:
            raise HTTPException(status_code=400, detail="تصنيف أو أولوية غير صالحة")
        tenant_id = user.get("tenant_id") or user.get("id")
        tenant = await main_db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0, "name": 1})
        now = _now()
        doc = {
            "id": str(uuid.uuid4()),
            "code": await _next_code(),
            "tenant_id": tenant_id,
            "tenant_name": (tenant or {}).get("name") or "",
            "subject": subject,
            "category": body.category,
            "category_ar": CATEGORY_AR[body.category],
            "priority": body.priority,
            "status": "open",
            "messages": [_msg("tenant", user.get("full_name") or user.get("name") or "", message)],
            "platform_unread": True,
            "tenant_unread": False,
            "created_by": user.get("id"),
            "created_at": now,
            "updated_at": now,
        }
        await main_db.support_tickets.insert_one(doc)
        return {"ok": True, "ticket": _public(doc)}

    @tenant_router.get("/tickets")
    async def my_tickets(status: Optional[str] = None, user: dict = Depends(require_tenant)):
        tenant_id = user.get("tenant_id") or user.get("id")
        q = {"tenant_id": tenant_id}
        if status:
            q["status"] = status
        rows = await main_db.support_tickets.find(
            q, {"_id": 0, "messages": 0}).sort("updated_at", -1).to_list(200)
        return {"items": rows}

    async def _own_ticket(ticket_id: str, user: dict) -> dict:
        tenant_id = user.get("tenant_id") or user.get("id")
        t = await main_db.support_tickets.find_one({"id": ticket_id, "tenant_id": tenant_id}, {"_id": 0})
        if not t:
            raise HTTPException(status_code=404, detail="التذكرة غير موجودة")
        return t

    @tenant_router.get("/tickets/{ticket_id}")
    async def read_ticket(ticket_id: str, user: dict = Depends(require_tenant)):
        t = await _own_ticket(ticket_id, user)
        if t.get("tenant_unread"):
            await main_db.support_tickets.update_one(
                {"id": ticket_id}, {"$set": {"tenant_unread": False}})
            t["tenant_unread"] = False
        return {"ticket": t}

    @tenant_router.post("/tickets/{ticket_id}/reply")
    async def tenant_reply(ticket_id: str, body: ReplyIn, user: dict = Depends(require_tenant)):
        t = await _own_ticket(ticket_id, user)
        if t["status"] == "closed":
            raise HTTPException(status_code=400, detail="التذكرة مغلقة")
        if not (body.message or "").strip():
            raise HTTPException(status_code=400, detail="الرسالة فارغة")
        new_status = "open" if t["status"] == "resolved" else t["status"]
        await main_db.support_tickets.update_one(
            {"id": ticket_id},
            {"$push": {"messages": _msg("tenant", user.get("full_name") or user.get("name") or "", body.message)},
             "$set": {"status": new_status, "updated_at": _now(),
                      "platform_unread": True, "tenant_unread": False}})
        return {"ok": True, "status": new_status}

    @tenant_router.post("/tickets/{ticket_id}/close")
    async def tenant_close(ticket_id: str, user: dict = Depends(require_tenant)):
        await _own_ticket(ticket_id, user)
        await main_db.support_tickets.update_one(
            {"id": ticket_id}, {"$set": {"status": "closed", "updated_at": _now()}})
        return {"ok": True, "status": "closed"}

    # ── platform side ────────────────────────────────────────────────
    @admin_router.get("/tickets")
    async def all_tickets(status: Optional[str] = None, tenant_id: Optional[str] = None,
                          limit: int = Query(50, ge=1, le=200),
                          admin: dict = Depends(get_super_admin)):
        q = {}
        if status:
            q["status"] = status
        if tenant_id:
            q["tenant_id"] = tenant_id
        rows = await main_db.support_tickets.find(
            q, {"_id": 0, "messages": 0}).sort("updated_at", -1).limit(limit).to_list(limit)
        unread = await main_db.support_tickets.count_documents({"platform_unread": True})
        return {"items": rows, "platform_unread_count": unread}

    @admin_router.get("/tickets/{ticket_id}")
    async def admin_read(ticket_id: str, admin: dict = Depends(get_super_admin)):
        t = await main_db.support_tickets.find_one({"id": ticket_id}, {"_id": 0})
        if not t:
            raise HTTPException(status_code=404, detail="التذكرة غير موجودة")
        if t.get("platform_unread"):
            await main_db.support_tickets.update_one(
                {"id": ticket_id}, {"$set": {"platform_unread": False}})
            t["platform_unread"] = False
        return {"ticket": t}

    @admin_router.post("/tickets/{ticket_id}/reply")
    async def admin_reply(ticket_id: str, body: ReplyIn, admin: dict = Depends(get_super_admin)):
        t = await main_db.support_tickets.find_one({"id": ticket_id}, {"_id": 0})
        if not t:
            raise HTTPException(status_code=404, detail="التذكرة غير موجودة")
        if t["status"] == "closed":
            raise HTTPException(status_code=400, detail="التذكرة مغلقة")
        if not (body.message or "").strip():
            raise HTTPException(status_code=400, detail="الرسالة فارغة")
        new_status = "in_progress" if t["status"] == "open" else t["status"]
        await main_db.support_tickets.update_one(
            {"id": ticket_id},
            {"$push": {"messages": _msg("platform", admin.get("full_name") or "الدعم الفني", body.message)},
             "$set": {"status": new_status, "updated_at": _now(),
                      "platform_unread": False, "tenant_unread": True}})
        return {"ok": True, "status": new_status}

    @admin_router.put("/tickets/{ticket_id}")
    async def admin_update(ticket_id: str, body: AdminUpdate, admin: dict = Depends(get_super_admin)):
        t = await main_db.support_tickets.find_one({"id": ticket_id}, {"_id": 0})
        if not t:
            raise HTTPException(status_code=404, detail="التذكرة غير موجودة")
        updates = {"updated_at": _now()}
        if body.status is not None:
            if body.status not in STATUSES:
                raise HTTPException(status_code=400, detail="حالة غير صالحة")
            updates["status"] = body.status
        if body.priority is not None:
            if body.priority not in PRIORITIES:
                raise HTTPException(status_code=400, detail="أولوية غير صالحة")
            updates["priority"] = body.priority
        await main_db.support_tickets.update_one({"id": ticket_id}, {"$set": updates})
        return {"ok": True}

    return {"support_tenant": tenant_router, "support_admin": admin_router}
