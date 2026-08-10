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
        return {"id": user["id"], "email": user["email"], "full_name": user.get("full_name", ""), "role": user.get("role", "user"), "features": user.get("features")}

    return router
