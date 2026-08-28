"""p269: super-admin account control —
impersonate agents (like tenants), reset passwords for tenants & agents.

All actions are audit-logged to main_db.saas_security_events and surface in
the unified audit timeline (p269 section in audit_timeline_routes.py).

Password "viewing" is cryptographically impossible (bcrypt one-way hashes) —
this module therefore implements set-new-password only.
"""
import uuid
from datetime import datetime, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from config.database import db, client, get_tenant_db
from utils.auth import create_access_token
from .helpers import get_super_admin

router = APIRouter(tags=["SaaS Account Control"])


async def _log_security_event(admin: dict, event_type: str, target_type: str,
                              target_id: str, target_name: str, request: Request = None):
    doc = {
        "id": str(uuid.uuid4()),
        "event_type": event_type,
        "target_type": target_type,
        "target_id": target_id,
        "target_name": target_name,
        "admin_id": admin.get("id"),
        "admin_email": admin.get("email", ""),
        "ip": ((request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
               or (request.client.host if request and request.client else "unknown")) if request else "unknown",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.saas_security_events.insert_one(doc)
    return doc


# ── Impersonate an agent (same experience as tenant impersonation) ───────────
@router.post("/saas/impersonate-agent/{agent_id}")
async def impersonate_agent(agent_id: str, request: Request, admin: dict = Depends(get_super_admin)):
    agent = await db.saas_agents.find_one({"id": agent_id}, {"_id": 0})
    if not agent:
        raise HTTPException(status_code=404, detail="الوكيل غير موجود")
    if not agent.get("is_active", True):
        raise HTTPException(status_code=400, detail="حساب الوكيل معطل")

    access_token = create_access_token({
        "sub": agent["id"],
        "email": agent["email"],
        "role": "agent",
        "type": "agent",
        "agent_type": agent.get("agent_type", "assistant"),
        "impersonated_by": admin.get("id"),
    })

    client_host = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip() \
        or (request.client.host if request.client else "unknown")
    session_id = str(uuid.uuid4())
    await db.impersonation_logs.insert_one({
        "id": session_id,
        "tenant_id": agent_id,                      # timeline groups on this field
        "tenant_name": agent.get("name", agent["email"]),
        "tenant_email": agent["email"],
        "target_type": "agent",                     # p269: distinguishes agent sessions
        "admin_id": admin.get("id"),
        "admin_email": admin.get("email", ""),
        "admin_name": admin.get("name", ""),
        "ip": client_host,
        "user_agent": request.headers.get("user-agent", "")[:300],
        "started_at": datetime.now(timezone.utc).isoformat(),
        "stopped_at": None,
        "duration_seconds": None,
        "status": "active",
    })

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_type": "agent",
        "redirect_to": "/agent/dashboard",
        "impersonation_session_id": session_id,
        "user": {k: v for k, v in agent.items() if k not in ["_id", "password"]},
    }


# ── Password resets ──────────────────────────────────────────────────────────
class PasswordResetIn(BaseModel):
    new_password: str


def _validate_password(pw: str):
    if not pw or len(pw) < 8:
        raise HTTPException(status_code=400, detail="كلمة المرور يجب أن تكون 8 أحرف على الأقل")


@router.post("/saas/tenants/{tenant_id}/reset-password")
async def reset_tenant_password(tenant_id: str, data: PasswordResetIn,
                                request: Request, admin: dict = Depends(get_super_admin)):
    _validate_password(data.new_password)
    tenant = await db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0, "id": 1, "name": 1, "email": 1})
    if not tenant:
        raise HTTPException(status_code=404, detail="المشترك غير موجود")
    hashed = bcrypt.hashpw(data.new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    await db.saas_tenants.update_one({"id": tenant_id}, {"$set": {"password": hashed}})
    # keep the tenant-DB admin user in sync so the new password works at login
    tdb = get_tenant_db(tenant_id)
    await tdb.users.update_many({"email": tenant["email"]}, {"$set": {"hashed_password": hashed}})
    await _log_security_event(admin, "password_reset", "tenant", tenant_id, tenant.get("name", ""), request)
    return {"ok": True, "message": "تم تغيير كلمة مرور المشترك"}


@router.post("/saas/agents/{agent_id}/reset-password")
async def reset_agent_password(agent_id: str, data: PasswordResetIn,
                               request: Request, admin: dict = Depends(get_super_admin)):
    _validate_password(data.new_password)
    agent = await db.saas_agents.find_one({"id": agent_id}, {"_id": 0, "id": 1, "name": 1, "email": 1})
    if not agent:
        raise HTTPException(status_code=404, detail="الوكيل غير موجود")
    hashed = bcrypt.hashpw(data.new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    await db.saas_agents.update_one({"id": agent_id}, {"$set": {"password": hashed}})
    await _log_security_event(admin, "password_reset", "agent", agent_id, agent.get("name", ""), request)
    return {"ok": True, "message": "تم تغيير كلمة مرور الوكيل"}
