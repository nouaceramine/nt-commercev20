"""
Authentication utilities for NT Commerce
"""
import os
import jwt
import bcrypt
from datetime import datetime, timezone, timedelta
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from config.database import db, main_db, get_tenant_db, set_tenant_context, _tenant_db_ctx

# JWT Configuration
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "nt_commerce_super_secure_jwt_secret_key_2024_v3_hardened")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

security = HTTPBearer()

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    """Decode and validate JWT token"""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Get the current authenticated user from JWT token.

    NOTE: A parallel implementation lives in main.py for the legacy in-file routes.
    The two are intentionally NOT interchangeable:
      - This version calls set_tenant_context() (config.database ContextVar) so the
        modular routers' `db` proxy resolves to the correct tenant DB.
      - main.py's version relies on its own tenant_context_middleware + ContextVar
        and additionally injects plan `features`/`limits` onto the user object.
    Merging them naively risks breaking multi-tenant isolation. Keep the role/
    permission checks in sync across both to avoid security drift.
    """
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        user_type = payload.get("type", "tenant")
        role = payload.get("role")
        
        if user_type == "super_admin" or role == "super_admin":
            # Super admin lives in main_db (users collection, super_admins as fallback)
            user = await main_db.users.find_one({"id": user_id})
            if not user:
                user = await main_db.super_admins.find_one({"id": user_id})
            if user:
                user["user_type"] = "super_admin"
                user["role"] = "super_admin"
                return user
        
        tenant_id = payload.get("tenant_id")
        if tenant_id:
            tenant_db = get_tenant_db(tenant_id)
            set_tenant_context(tenant_db)
            user = await tenant_db.users.find_one({"id": user_id})
            if user:
                user["tenant_id"] = tenant_id
                user["user_type"] = "tenant"
                return user
        
        raise HTTPException(status_code=401, detail="User not found")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_tenant_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Get tenant user - sets up tenant DB context"""
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        user_type = payload.get("type", "tenant")
        role = payload.get("role")
        tenant_id = payload.get("tenant_id")
        
        if user_type == "super_admin" or role == "super_admin":
            user = await main_db.users.find_one({"id": user_id})
            if not user:
                user = await main_db.super_admins.find_one({"id": user_id})
            if user:
                user["user_type"] = "super_admin"
                user["role"] = "super_admin"
                if tenant_id:
                    tenant_db = get_tenant_db(tenant_id)
                    set_tenant_context(tenant_db)
                    user["tenant_id"] = tenant_id
                return user
        
        if tenant_id:
            tenant_db = get_tenant_db(tenant_id)
            set_tenant_context(tenant_db)
            user = await tenant_db.users.find_one({"id": user_id})
            if user:
                user["tenant_id"] = tenant_id
                user["user_type"] = "tenant"
                return user
        
        raise HTTPException(status_code=401, detail="User not found")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_admin_user(current_user: dict = Depends(get_current_user)) -> dict:
    """Require admin role"""
    if current_user.get("role") not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

async def get_tenant_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Require tenant admin role"""
    role = current_user.get("role", "")
    if role not in ["admin", "manager", "super_admin"]:
        raise HTTPException(status_code=403, detail="Admin or Manager access required")
    return current_user

async def require_tenant(current_user: dict = Depends(get_current_user)) -> dict:
    """Require valid tenant context"""
    if not current_user.get("tenant_id") and current_user.get("user_type") != "super_admin":
        raise HTTPException(status_code=403, detail="Tenant access required")
    return current_user

async def get_super_admin(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Require super admin access"""
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        user_type = payload.get("type", "tenant")
        role = payload.get("role")
        
        if user_type != "super_admin" and role != "super_admin":
            raise HTTPException(status_code=403, detail="Super admin access required")
        
        user = await main_db.users.find_one({"id": user_id})
        if not user:
            user = await main_db.super_admins.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=401, detail="Super admin not found")
        
        user["user_type"] = "super_admin"
        user["role"] = "super_admin"
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
