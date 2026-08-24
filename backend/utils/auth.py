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
SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY environment variable is required (no fallback allowed)")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

security = HTTPBearer()

def email_ci(email: str) -> dict:
    """Case-insensitive exact-match Mongo query value for an email field."""
    import re as _re
    return {"$regex": f"^{_re.escape((email or '').strip())}$", "$options": "i"}

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
            # Fallback: user_id might equal tenant_id (legacy tokens) -> build user from saas_tenants
            tenant = await main_db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0, "password": 0})
            # p293 security: هذا المسار البديل لرموز قديمة sub==tenant_id فقط —
            # أي رمز بـ sub آخر غير معروف كان يتحول لمدير المستأجر (ثغرة تصعيد صلاحيات)
            if tenant and user_id == tenant_id:
                set_tenant_context(tenant_db)
                return {
                    "id": tenant["id"],
                    "email": tenant.get("email", ""),
                    "name": tenant.get("name", ""),
                    "role": "admin",
                    "tenant_id": tenant_id,
                    "user_type": "tenant",
                    "company_name": tenant.get("company_name", ""),
                }

        # Fallback: platform-level users (admin/demo/staff) whose tokens carry
        # no tenant_id and no super_admin role — they live in main_db.users.
        # Without this, /api/auth/me returned 401 "User not found" right after
        # a successful login, causing the frontend to log the user out and
        # bounce them back to the landing page.
        user = await main_db.users.find_one({"id": user_id})
        if user:
            user["user_type"] = role if role in ("admin", "cashier", "agent") else (user_type or "admin")
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
        
        # Fallback: platform-level users (admin/demo/staff) whose tokens carry
        # no tenant_id and no super_admin role — they live in main_db.users.
        # Without this, /api/auth/me returned 401 "User not found" right after
        # a successful login, causing the frontend to log the user out and
        # bounce them back to the landing page.
        user = await main_db.users.find_one({"id": user_id})
        if user:
            user["user_type"] = role if role in ("admin", "cashier", "agent") else (user_type or "admin")
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
    # Platform-level users (admin/cashier/agent in main_db) operate on the main DB
    if not current_user.get("tenant_id") and current_user.get("user_type") not in ("super_admin", "admin", "cashier", "agent"):
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
