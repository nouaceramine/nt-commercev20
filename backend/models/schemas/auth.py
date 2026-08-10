from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional, Literal
# ============ USER MODELS ============

class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    role: str = "user"
    permissions: Optional[dict] = None
    tenant_id: Optional[str] = None  # For multi-tenant

class UserLogin(BaseModel):
    email: str
    password: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    permissions: Optional[dict] = None

class PasswordUpdate(BaseModel):
    new_password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    role: str
    permissions: dict = {}
    tenant_id: Optional[str] = None
    user_type: Optional[str] = None
    company_name: Optional[str] = None
    features: Optional[dict] = None
    limits: Optional[dict] = None
    created_at: Optional[str] = None

    @field_validator("created_at", mode="before")
    @classmethod
    def _coerce_created_at(cls, v):
        # Some legacy user docs store created_at as a BSON datetime
        if hasattr(v, "isoformat"):
            return v.isoformat()
        return v

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
