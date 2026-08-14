from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime, timezone
from pydantic import BaseModel, EmailStr
from middleware.rate_limiter import limiter
from services.auth_service import AuthService
import logging

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str

def create_auth_routes(db, get_current_user):
    auth_service = AuthService(db)
    router = APIRouter(prefix="/auth", tags=["Authentication"])

    @router.post("/login")
    @limiter.limit("10/minute")
    async def login(request: Request, body: LoginRequest):
        user = await auth_service.authenticate(body.email, body.password)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        token = auth_service.create_access_token({"sub": user["id"], "email": user["email"], "role": user.get("role", "user")})
        return {"access_token": token, "token_type": "bearer", "user": {"id": user["id"], "email": user["email"], "full_name": user.get("full_name", ""), "role": user.get("role", "user"), "features": user.get("features")}}

    @router.post("/register")
    @limiter.limit("5/minute")
    async def register(request: Request, body: RegisterRequest):
        existing = await auth_service.get_user_by_email(body.email)
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
        user = await auth_service.create_user(body.email, body.password, body.full_name, role="admin")
        token = auth_service.create_access_token({"sub": user["id"], "email": user["email"], "role": user.get("role", "user")})
        return {"access_token": token, "token_type": "bearer", "user": {"id": user["id"], "email": user["email"], "full_name": user.get("full_name", ""), "role": user.get("role", "user"), "features": user.get("features")}}

    @router.get("/me")
    async def me(user=Depends(get_current_user)):
        # Return the FULL session shape — the previous thin dict dropped
        # tenant_id/features/limits, so feature-gated pages disappeared
        # after a page refresh (AuthContext restores from /auth/me).
        out = {
            "id": user["id"],
            "email": user["email"],
            "full_name": user.get("full_name") or user.get("name", ""),
            "name": user.get("name") or user.get("full_name", ""),
            "role": user.get("role", "user"),
            "user_type": user.get("user_type"),
            "tenant_id": user.get("tenant_id"),
            "company_name": user.get("company_name"),
            "permissions": user.get("permissions") or {},
            "features": user.get("features"),
            "limits": user.get("limits"),
        }
        # Tenant users authenticated via utils/auth.get_current_user arrive
        # WITHOUT plan features (that variant doesn't inject them). Enrich
        # from the tenant's plan so feature-gated UI works on session restore.
        if out["tenant_id"] and not out["features"]:
            from config.database import main_db as _mdb
            tenant = await _mdb.saas_tenants.find_one({"id": out["tenant_id"]}, {"_id": 0, "password": 0})
            if tenant:
                plan = await _mdb.saas_plans.find_one({"id": tenant.get("plan_id")}, {"_id": 0})
                if plan:
                    feats = {**plan.get("features", {}), **tenant.get("features_override", {})}
                    feats.setdefault("ecommerce_hub", False)
                    out["features"] = feats
                    out["limits"] = {**plan.get("limits", {}), **tenant.get("limits_override", {})}
                out["company_name"] = out["company_name"] or tenant.get("company_name")
        # p56: surface subscription/trial state so the expiry banner survives
        # session restore (AuthContext rebuilds the user from /auth/me).
        if out["tenant_id"]:
            from config.database import main_db as _mdb2
            _t = await _mdb2.saas_tenants.find_one({"id": out["tenant_id"]}, {"_id": 0, "is_trial": 1, "subscription_ends_at": 1})
            if _t:
                out["is_trial"] = _t.get("is_trial", False)
                out["subscription_ends_at"] = _t.get("subscription_ends_at")
        return out

    return router
