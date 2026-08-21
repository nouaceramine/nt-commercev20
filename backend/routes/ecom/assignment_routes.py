"""E-Commerce Hub: call-center assignment (p242).

EcoManager-style: admin distributes confirmation work — orders (awaiting
confirmation / new) and leads — across staff accounts. Pure metadata:
assigned_to / assigned_to_name / assigned_at / assigned_by on the doc,
no status change, no notifications (staff open "my queue").

Endpoints:
  GET  /ecom/agents               — assignable staff accounts (admin)
  POST /ecom/assign               — bulk assign orders or leads (admin)
  POST /ecom/unassign             — bulk unassign (admin)
  GET  /ecom/my-queue             — current user's open assigned work
  GET  /ecom/assignments/summary  — per-agent open workload (admin)
"""
from datetime import datetime, timezone
from typing import Literal, List
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config.database import db
from utils.auth import require_tenant, get_tenant_admin
from routes.ecom.constants import require_ecom_feature

logger = logging.getLogger(__name__)
router = APIRouter(tags=["E-Commerce Assignment"])

_OPEN_ORDER_STATUSES = ["new", "awaiting_confirmation", "needs_review", "confirmed", "packed"]
_OPEN_LEAD_STATUSES = ["new", "contacted", "qualified"]
_COLLECTIONS = {"order": "ecom_orders", "lead": "ecom_leads"}


class AssignIn(BaseModel):
    target: Literal["order", "lead"]
    ids: List[str]
    assignee_id: str


class UnassignIn(BaseModel):
    target: Literal["order", "lead"]
    ids: List[str]


@router.get("/ecom/agents")
async def list_agents(user: dict = Depends(get_tenant_admin)):
    """Staff accounts that can take assigned work."""
    await require_ecom_feature(user)
    users = await db.users.find(
        {"role": {"$ne": "super_admin"}, "is_active": {"$ne": False}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1},
    ).to_list(200)
    return {"items": users, "total": len(users)}


@router.post("/ecom/assign")
async def assign_work(body: AssignIn, user: dict = Depends(get_tenant_admin)):
    await require_ecom_feature(user)
    if not body.ids or len(body.ids) > 200:
        raise HTTPException(status_code=400, detail="قائمة المعرفات غير صالحة (1-200)")
    agent = await db.users.find_one(
        {"id": body.assignee_id, "role": {"$ne": "super_admin"}, "is_active": {"$ne": False}},
        {"_id": 0, "id": 1, "name": 1})
    if not agent:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    coll = _COLLECTIONS[body.target]
    open_statuses = _OPEN_ORDER_STATUSES if body.target == "order" else _OPEN_LEAD_STATUSES
    now = datetime.now(timezone.utc).isoformat()
    res = await db[coll].update_many(
        {"id": {"$in": body.ids}, "status": {"$in": open_statuses}},
        {"$set": {"assigned_to": agent["id"], "assigned_to_name": agent.get("name", ""),
                  "assigned_at": now, "assigned_by": user.get("id"),
                  "updated_at": now}},
    )
    return {"ok": True, "target": body.target, "assigned_to": agent["id"],
            "assigned_to_name": agent.get("name", ""), "matched": res.matched_count,
            "updated": res.modified_count}


@router.post("/ecom/unassign")
async def unassign_work(body: UnassignIn, user: dict = Depends(get_tenant_admin)):
    await require_ecom_feature(user)
    if not body.ids or len(body.ids) > 200:
        raise HTTPException(status_code=400, detail="قائمة المعرفات غير صالحة (1-200)")
    coll = _COLLECTIONS[body.target]
    res = await db[coll].update_many(
        {"id": {"$in": body.ids}},
        {"$unset": {"assigned_to": "", "assigned_to_name": "", "assigned_at": "", "assigned_by": ""},
         "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "target": body.target, "updated": res.modified_count}


@router.get("/ecom/my-queue")
async def my_queue(user: dict = Depends(require_tenant)):
    """Open orders + leads assigned to the current user."""
    await require_ecom_feature(user)
    uid = user.get("id")
    orders = await db.ecom_orders.find(
        {"assigned_to": uid, "status": {"$in": _OPEN_ORDER_STATUSES}},
        {"_id": 0, "id": 1, "order_code": 1, "channel": 1, "status": 1, "customer": 1,
         "total": 1, "duplicate_warning": 1, "assigned_at": 1, "created_at": 1},
    ).sort("assigned_at", -1).to_list(200)
    leads = await db.ecom_leads.find(
        {"assigned_to": uid, "status": {"$in": _OPEN_LEAD_STATUSES}},
        {"_id": 0, "id": 1, "channel": 1, "status": 1, "name": 1, "phone": 1,
         "message": 1, "duplicate_warning": 1, "assigned_at": 1, "created_at": 1},
    ).sort("assigned_at", -1).to_list(200)
    return {"orders": orders, "leads": leads, "count": len(orders) + len(leads)}


@router.get("/ecom/assignments/summary")
async def assignments_summary(user: dict = Depends(get_tenant_admin)):
    """Per-agent open workload — for balanced distribution."""
    await require_ecom_feature(user)
    pipeline = [
        {"$match": {"assigned_to": {"$exists": True, "$ne": None},
                    "status": {"$in": _OPEN_ORDER_STATUSES}}},
        {"$group": {"_id": "$assigned_to", "orders": {"$sum": 1}}},
    ]
    order_counts = {r["_id"]: r["orders"] for r in await db.ecom_orders.aggregate(pipeline).to_list(500)}
    pipeline = [
        {"$match": {"assigned_to": {"$exists": True, "$ne": None},
                    "status": {"$in": _OPEN_LEAD_STATUSES}}},
        {"$group": {"_id": "$assigned_to", "leads": {"$sum": 1}}},
    ]
    lead_counts = {r["_id"]: r["leads"] for r in await db.ecom_leads.aggregate(pipeline).to_list(500)}
    agent_ids = sorted(set(order_counts) | set(lead_counts))
    users = await db.users.find({"id": {"$in": agent_ids}}, {"_id": 0, "id": 1, "name": 1, "role": 1}).to_list(500)
    names = {u["id"]: u.get("name", "") for u in users}
    items = [{"agent_id": aid, "name": names.get(aid, "?"),
              "open_orders": order_counts.get(aid, 0), "open_leads": lead_counts.get(aid, 0),
              "total": order_counts.get(aid, 0) + lead_counts.get(aid, 0)}
             for aid in agent_ids]
    items.sort(key=lambda x: -x["total"])
    return {"items": items}
