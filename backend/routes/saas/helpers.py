"""SaaS Helpers - Authentication and utility functions"""
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timezone, timedelta
import jwt

from config.database import db, main_db

from utils.jwt_config import SECRET_KEY, ALGORITHM
from utils.auth import ensure_active_account, ensure_token_not_revoked, ensure_token_pwv

security = HTTPBearer()


def create_access_token(data: dict) -> str:
    """Create JWT access token"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=30)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_super_admin(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Check if user is super admin"""
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        await ensure_token_not_revoked(payload)
        user_id = payload.get("sub")
        user = await main_db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=401, detail="Super admin not found")
        if user.get("role") not in ["super_admin", "saas_admin"]:
            raise HTTPException(status_code=403, detail="Super admin access required")
        ensure_token_pwv(payload, user)
        return ensure_active_account(user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_agent(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Verify and return current agent from JWT"""
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        await ensure_token_not_revoked(payload)
        # p566: agent impersonation tokens carry impersonation_session_id and
        # die with their audit session (the P551 tenant-impersonation
        # doctrine). Legacy impersonation tokens without the claim fail closed.
        _sid = payload.get("impersonation_session_id")
        if payload.get("impersonated_by") or _sid:
            if not _sid:
                raise HTTPException(status_code=401, detail="Impersonation session required")
            _log = await db.impersonation_logs.find_one(
                {"id": _sid}, {"_id": 0, "status": 1, "tenant_id": 1})
            if (not _log or _log.get("status") != "active"
                    or _log.get("tenant_id") != payload.get("sub")):
                raise HTTPException(status_code=401, detail="Impersonation session closed")
        if payload.get("type") != "agent" and payload.get("role") != "agent":
            raise HTTPException(status_code=403, detail="Agent access required")
        agent_id = payload.get("sub")
        agent = await db.saas_agents.find_one({"id": agent_id})
        if not agent:
            raise HTTPException(status_code=401, detail="Agent not found")
        if not agent.get("is_active", True):
            raise HTTPException(status_code=403, detail="الحساب معطل")
        ensure_token_pwv(payload, agent)
        return agent
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def next_tenant_short_id() -> str:
    """Sequential human-memorable tenant ID: NT-0001, NT-0002, ...
    Atomic via a platform counters collection (upsert + $inc)."""
    from pymongo import ReturnDocument
    c = await main_db.saas_counters.find_one_and_update(
        {"_id": "tenant_short_id"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return f"NT-{c['seq']:04d}"
