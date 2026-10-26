"""SaaS Helpers - Authentication and utility functions"""
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timezone, timedelta
import jwt
import os

from config.database import db, main_db

from utils.jwt_config import SECRET_KEY, ALGORITHM
from utils.auth import ensure_active_account

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
        user_id = payload.get("sub")
        user = await main_db.users.find_one({"id": user_id})
        if not user or user.get("role") not in ["super_admin", "saas_admin"]:
            raise HTTPException(status_code=403, detail="Super admin access required")
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
        if payload.get("type") != "agent" and payload.get("role") != "agent":
            raise HTTPException(status_code=403, detail="Agent access required")
        agent_id = payload.get("sub")
        agent = await db.saas_agents.find_one({"id": agent_id})
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        if not agent.get("is_active", True):
            raise HTTPException(status_code=403, detail="الحساب معطل")
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
