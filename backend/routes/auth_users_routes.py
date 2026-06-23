"""
Auth Users Routes - Extracted from legacy_inline_routes.py
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Literal
from datetime import datetime, timezone, timedelta
import uuid
import os
import logging
import pyotp
import qrcode
import io
import base64
import bcrypt
import jwt

logger = logging.getLogger(__name__)


def create_auth_users_routes(db, main_db, get_current_user, get_admin_user, get_tenant_admin, require_tenant, get_tenant_db, hash_password, verify_password, create_access_token, init_tenant_database, init_default_data, init_cash_boxes, SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_HOURS, security, UserCreate, UserLogin, UserUpdate, UserResponse, TokenResponse, PasswordUpdate, limiter=None) -> dict:
    """Create auth users routes"""
    router = APIRouter()

    @router.post("/init-default-data")
    async def api_init_default_data(admin: dict = Depends(get_tenant_admin)):
        """Initialize default data for existing tenant"""
        tenant_db = get_tenant_db(admin["tenant_id"])
        await init_default_data(tenant_db)
        return {"message": "تم تهيئة البيانات الافتراضية بنجاح", "status": "success"}

    # ============ AUTH ROUTES ============

    @router.post("/auth/register", response_model=TokenResponse)
    @limiter.limit("10/minute")
    async def register(request: Request, user: UserCreate):
        existing = await db.users.find_one({"email": user.email})
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")

        # SECURITY: Prevent creating super_admin or saas_admin roles
        forbidden_roles = ["super_admin", "saas_admin", "superadmin"]
        if user.role and user.role.lower() in [r.lower() for r in forbidden_roles]:
            raise HTTPException(
                status_code=403, 
                detail="لا يمكن إنشاء حساب بصلاحية سوبر أدمين - Creating super_admin accounts is not allowed"
            )

        # Password strength validation
        from utils.password_validator import validate_password
        pw_check = validate_password(user.password)
        if not pw_check["is_valid"]:
            raise HTTPException(status_code=400, detail={"message": "كلمة المرور ضعيفة", "errors": pw_check["errors"]})

        user_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        user_doc = {
            "id": user_id, "email": user.email,
            "password": hash_password(user.password),
            "name": user.name, "role": user.role, "created_at": now
        }
        await db.users.insert_one(user_doc)
        access_token = create_access_token({"sub": user_id, "role": user.role})

        return TokenResponse(
            access_token=access_token,
            user=UserResponse(id=user_id, email=user.email, name=user.name, role=user.role, created_at=now)
        )

    @router.post("/auth/login", response_model=TokenResponse)
    @limiter.limit("20/minute")
    async def login(request: Request, credentials: UserLogin):
        user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        # Support both password and hashed_password fields
        stored_password = user.get("hashed_password") or user.get("password")
        if not stored_password or not verify_password(credentials.password, stored_password):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        access_token = create_access_token({"sub": user["id"], "role": user["role"]})
        return TokenResponse(
            access_token=access_token,
            user=UserResponse(id=user["id"], email=user["email"], name=user["name"], role=user["role"], permissions=user.get("permissions", {}), created_at=user["created_at"])
        )

    # Unified Login - Auto-detect user type
    class UnifiedLoginResponse(BaseModel):
        access_token: str
        user_type: str  # admin, agent, tenant
        redirect_to: str
        user: dict

    # ============ BRUTE FORCE PROTECTION ============
    _login_attempts = {}  # {email: {"count": int, "locked_until": str}}
    MAX_LOGIN_ATTEMPTS = 5
    LOCKOUT_MINUTES = 15

    def _check_brute_force(email: str) -> dict:
        """Check if account is locked due to too many failed attempts"""
        info = _login_attempts.get(email)
        if not info:
            return
        if info.get("locked_until"):
            locked = datetime.fromisoformat(info["locked_until"])
            if datetime.now(timezone.utc) < locked:
                remaining = int((locked - datetime.now(timezone.utc)).total_seconds() / 60) + 1
                raise HTTPException(status_code=429, detail=f"الحساب مقفل. حاول بعد {remaining} دقيقة")
            else:
                _login_attempts.pop(email, None)

    def _record_failed_login(email: str) -> dict:
        info = _login_attempts.get(email, {"count": 0})
        info["count"] = info.get("count", 0) + 1
        if info["count"] >= MAX_LOGIN_ATTEMPTS:
            info["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
        _login_attempts[email] = info

    def _clear_failed_login(email: str) -> dict:
        _login_attempts.pop(email, None)

    @router.post("/auth/unified-login")
    @limiter.limit("20/minute")
    async def unified_login(request: Request, credentials: UserLogin):
        """
        Unified login endpoint that auto-detects user type:
        1. Check if user is an admin/employee
        2. Check if user is an agent
        3. Check if user is a tenant
        """
        email = credentials.email
        password = credentials.password

        # Brute force protection
        _check_brute_force(email)

        # 1. Check Admin/Employee users first
        user = await db.users.find_one({"email": email}, {"_id": 0})
        if user:
            stored_password = user.get("hashed_password") or user.get("password")
            if stored_password and verify_password(password, stored_password):
                _clear_failed_login(email)
                access_token = create_access_token({"sub": user["id"], "role": user["role"]})
                return {
                    "access_token": access_token,
                    "user_type": "admin",
                    "redirect_to": "/saas-admin",
                    "user": {
                        "id": user["id"],
                        "email": user["email"],
                        "name": user["name"],
                        "role": user["role"],
                        "permissions": user.get("permissions", {})
                    }
                }

        # 2. Check Agents
        agent = await db.saas_agents.find_one({"email": email}, {"_id": 0})
        if agent:
            stored_password = agent.get("password", "")
            try:
                if bcrypt.checkpw(password.encode('utf-8'), stored_password.encode('utf-8')):
                    if not agent.get("is_active", True):
                        raise HTTPException(status_code=403, detail="الحساب معطل")
                    _clear_failed_login(email)

                    token_data = {
                        "sub": agent["id"],
                        "email": agent["email"],
                        "role": "agent",
                        "type": "agent"
                    }
                    access_token = create_access_token(token_data)
                    return {
                        "access_token": access_token,
                        "user_type": "agent",
                        "redirect_to": "/agent/dashboard",
                        "user": {
                            "id": agent["id"],
                            "email": agent["email"],
                            "name": agent["name"],
                            "company_name": agent.get("company_name", ""),
                            "current_balance": agent.get("current_balance", 0),
                            "credit_limit": agent.get("credit_limit", 0)
                        }
                    }
            except Exception:
                pass

        # 3. Check Tenants
        tenant = await db.saas_tenants.find_one({"email": email}, {"_id": 0})
        if tenant:
            stored_password = tenant.get("password", "")
            try:
                if bcrypt.checkpw(password.encode('utf-8'), stored_password.encode('utf-8')):
                    if not tenant.get("is_active", True):
                        raise HTTPException(status_code=403, detail="الحساب معطل")
                    _clear_failed_login(email)

                    # Check subscription
                    if tenant.get("subscription_ends_at"):
                        end_date = datetime.fromisoformat(tenant["subscription_ends_at"].replace("Z", "+00:00"))
                        if end_date < datetime.now(timezone.utc) and not tenant.get("is_trial"):
                            raise HTTPException(status_code=403, detail="انتهت صلاحية الاشتراك")

                    # Check if this is the first login - create database if not initialized
                    tenant_id = tenant['id']
                    tenant_db_conn = get_tenant_db(tenant_id)
                    if not tenant.get("database_initialized", False):
                        logger.info(f"First login (unified) for tenant {tenant_id} - initializing database...")
                        tenant_db_conn = await init_tenant_database(tenant_id)

                        # Create admin user in tenant's database
                        admin_user_id = str(uuid.uuid4())
                        admin_user = {
                            "id": admin_user_id,
                            "name": tenant["name"],
                            "email": tenant["email"],
                            "hashed_password": stored_password,
                            "role": "admin",
                            "permissions": {},
                            "created_at": datetime.now(timezone.utc).isoformat()
                        }
                        await tenant_db_conn.users.insert_one(admin_user)

                        # Initialize default data (customers, suppliers, families, products)
                        await init_default_data(tenant_db_conn)

                        # Mark database as initialized
                        await db.saas_tenants.update_one(
                            {"id": tenant_id},
                            {"$set": {
                                "database_initialized": True,
                                "first_login_at": datetime.now(timezone.utc).isoformat()
                            }}
                        )
                        logger.info(f"Database initialized successfully for tenant {tenant_id}")

                    # Look up the actual user record in the tenant DB to get the correct user_id
                    tenant_user = await tenant_db_conn.users.find_one(
                        {"email": email}, {"_id": 0, "id": 1, "role": 1, "name": 1}
                    )
                    if not tenant_user:
                        # Fallback: find by role admin
                        tenant_user = await tenant_db_conn.users.find_one(
                            {"role": "admin"}, {"_id": 0, "id": 1, "role": 1, "name": 1}
                        )
                    
                    # Use the tenant user's id as sub so get_current_user can find them
                    actual_user_id = tenant_user["id"] if tenant_user else tenant_id

                    token_data = {
                        "sub": actual_user_id,
                        "email": tenant["email"],
                        "role": "tenant_admin",
                        "type": "tenant",
                        "tenant_id": tenant["id"]
                    }
                    access_token = create_access_token(token_data)

                    # Get plan info with features and limits
                    plan = await db.saas_plans.find_one({"id": tenant.get("plan_id")}, {"_id": 0})
                    features = {**plan.get("features", {}), **tenant.get("features_override", {})} if plan else {}
                    limits = {**plan.get("limits", {}), **tenant.get("limits_override", {})} if plan else {}

                    return {
                        "access_token": access_token,
                        "user_type": "tenant",
                        "redirect_to": "/tenant/dashboard",
                        "user": {
                            "id": tenant["id"],
                            "email": tenant["email"],
                            "name": tenant["name"],
                            "company_name": tenant.get("company_name", ""),
                            "plan_name": plan.get("name_ar", "") if plan else "",
                            "subscription_ends_at": tenant.get("subscription_ends_at"),
                            "database_name": f"tenant_{tenant['id'].replace('-', '_')}",
                            "is_first_login": not tenant.get("database_initialized", False),
                            "features": features,
                            "limits": limits
                        }
                    }
            except HTTPException:
                raise
            except Exception:
                pass

        # No user found
        _record_failed_login(email)
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")

    @router.get("/auth/me", response_model=UserResponse)
    async def get_me(current_user: dict = Depends(get_current_user)):
        return UserResponse(**current_user)

    # ============ TWO-FACTOR AUTHENTICATION (2FA) ============
    import pyotp
    import qrcode
    import io
    import base64

    @router.post("/auth/2fa/setup")
    async def setup_2fa(current_user: dict = Depends(get_current_user)):
        """Generate 2FA secret and QR code for user"""
        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)
        uri = totp.provisioning_uri(name=current_user.get("email", ""), issuer_name="NT Commerce")
        # Generate QR code as base64
        qr = qrcode.make(uri)
        buffer = io.BytesIO()
        qr.save(buffer, format="PNG")
        qr_base64 = base64.b64encode(buffer.getvalue()).decode()
        # Save secret - check both main_db and tenant db
        user_db = main_db
        user = await main_db.users.find_one({"id": current_user["id"]})
        if not user:
            user_db = db
            user = await db.users.find_one({"id": current_user["id"]})
        if not user:
            # Try looking up tenants
            user_db = main_db
            user = await main_db.tenants.find_one({"id": current_user["id"]})
        if user:
            coll = main_db.tenants if user.get("plan_name") or user.get("plan_id") else user_db.users
            await coll.update_one(
                {"id": current_user["id"]},
                {"$set": {"two_fa_secret_pending": secret}}
            )
        # Generate backup codes
        backup_codes = [pyotp.random_base32()[:8] for _ in range(6)]
        return {
            "secret": secret,
            "qr_code": f"data:image/png;base64,{qr_base64}",
            "uri": uri,
            "backup_codes": backup_codes,
        }

    @router.post("/auth/2fa/verify")
    async def verify_2fa(data: dict, current_user: dict = Depends(get_current_user)):
        """Verify and activate 2FA with a code"""
        code = data.get("code", "")
        # Look up user in multiple locations
        user = await main_db.users.find_one({"id": current_user["id"]}, {"_id": 0})
        user_coll = main_db.users
        if not user:
            user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
            user_coll = db.users
        if not user:
            user = await main_db.tenants.find_one({"id": current_user["id"]}, {"_id": 0})
            user_coll = main_db.tenants
        if not user:
            raise HTTPException(status_code=404, detail="المستخدم غير موجود")
        secret = user.get("two_fa_secret_pending") or user.get("two_fa_secret")
        if not secret:
            raise HTTPException(status_code=400, detail="قم بإعداد 2FA أولا")
        totp = pyotp.TOTP(secret)
        if totp.verify(code):
            await user_coll.update_one(
                {"id": current_user["id"]},
                {"$set": {"two_fa_secret": secret, "two_fa_enabled": True}, "$unset": {"two_fa_secret_pending": ""}}
            )
            return {"message": "تم تفعيل المصادقة الثنائية بنجاح", "enabled": True}
        raise HTTPException(status_code=400, detail="الرمز غير صحيح")

    @router.post("/auth/2fa/disable")
    async def disable_2fa(data: dict, current_user: dict = Depends(get_current_user)):
        """Disable 2FA"""
        code = data.get("code", "")
        user = await main_db.users.find_one({"id": current_user["id"]}, {"_id": 0})
        user_coll = main_db.users
        if not user:
            user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
            user_coll = db.users
        if not user:
            user = await main_db.tenants.find_one({"id": current_user["id"]}, {"_id": 0})
            user_coll = main_db.tenants
        if not user or not user.get("two_fa_secret"):
            raise HTTPException(status_code=400, detail="2FA غير مفعل")
        totp = pyotp.TOTP(user["two_fa_secret"])
        if totp.verify(code):
            await user_coll.update_one(
                {"id": current_user["id"]},
                {"$set": {"two_fa_enabled": False}, "$unset": {"two_fa_secret": "", "two_fa_secret_pending": ""}}
            )
            return {"message": "تم إلغاء تفعيل المصادقة الثنائية", "enabled": False}
        raise HTTPException(status_code=400, detail="الرمز غير صحيح")

    @router.get("/auth/2fa/status")
    async def get_2fa_status(current_user: dict = Depends(get_current_user)):
        """Check if 2FA is enabled for current user"""
        user = await main_db.users.find_one({"id": current_user["id"]}, {"_id": 0, "two_fa_enabled": 1})
        if not user:
            user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "two_fa_enabled": 1})
        if not user:
            user = await main_db.tenants.find_one({"id": current_user["id"]}, {"_id": 0, "two_fa_enabled": 1})
        return {"enabled": user.get("two_fa_enabled", False) if user else False}

    # ============ USER MANAGEMENT ============

    @router.get("/users", response_model=List[UserResponse])
    async def get_all_users(admin: dict = Depends(get_admin_user)):
        users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
        return [UserResponse(**u) for u in users]

    class UserCreateLocal(BaseModel):
        name: str
        email: str
        password: str
        role: str = "user"

    @router.post("/users", response_model=UserResponse)
    async def create_user(user_data: UserCreateLocal, admin: dict = Depends(get_admin_user)):
        """Create a new user (admin only)"""
        # SECURITY: Prevent creating super_admin or saas_admin roles
        forbidden_roles = ["super_admin", "saas_admin", "superadmin"]
        if user_data.role and user_data.role.lower() in [r.lower() for r in forbidden_roles]:
            # Only super_admin can create super_admin users
            if admin.get("role") != "super_admin":
                raise HTTPException(
                    status_code=403, 
                    detail="لا يمكن إنشاء حساب بصلاحية سوبر أدمين - Creating super_admin accounts is not allowed"
                )

        # Check if email already exists
        existing = await db.users.find_one({"email": user_data.email})
        if existing:
            raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم بالفعل")

        if len(user_data.password) < 4:
            raise HTTPException(status_code=400, detail="كلمة المرور يجب أن تكون 4 أحرف على الأقل")

        now = datetime.now(timezone.utc).isoformat()
        new_user = {
            "id": str(uuid.uuid4()),
            "name": user_data.name,
            "email": user_data.email,
            "password": hash_password(user_data.password),
            "role": user_data.role,
            "tenant_id": admin.get("tenant_id"),
            "permissions": {},
            "created_at": now
        }

        await db.users.insert_one(new_user)

        # Return without password
        del new_user["password"]
        return UserResponse(**new_user)

    @router.put("/users/{user_id}", response_model=UserResponse)
    async def update_user(user_id: str, updates: UserUpdate, admin: dict = Depends(get_admin_user)):
        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # SECURITY: Prevent changing role to super_admin or saas_admin
        forbidden_roles = ["super_admin", "saas_admin", "superadmin"]
        if updates.role and updates.role.lower() in [r.lower() for r in forbidden_roles]:
            # Only super_admin can assign super_admin role
            if admin.get("role") != "super_admin":
                raise HTTPException(
                    status_code=403, 
                    detail="لا يمكن تعيين صلاحية سوبر أدمين - Cannot assign super_admin role"
                )

        # SECURITY: Prevent non-super_admin from modifying super_admin users
        if user.get("role") == "super_admin" and admin.get("role") != "super_admin":
            raise HTTPException(
                status_code=403, 
                detail="لا يمكن تعديل حساب سوبر أدمين - Cannot modify super_admin account"
            )

        update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
        if update_data:
            await db.users.update_one({"id": user_id}, {"$set": update_data})
        updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
        return UserResponse(**updated)

    @router.delete("/users/{user_id}")
    async def delete_user(user_id: str, admin: dict = Depends(get_admin_user)):
        if admin["id"] == user_id:
            raise HTTPException(status_code=400, detail="Cannot delete your own account")
        result = await db.users.delete_one({"id": user_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="User not found")
        return {"message": "User deleted successfully"}

    @router.put("/users/{user_id}/password")
    async def update_user_password(user_id: str, password_data: PasswordUpdate, admin: dict = Depends(get_admin_user)):
        """Update user password (admin only)"""
        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if len(password_data.new_password) < 4:
            raise HTTPException(status_code=400, detail="كلمة المرور يجب أن تكون 4 أحرف على الأقل")

        from utils.password_validator import validate_password
        pw_check = validate_password(password_data.new_password)
        if not pw_check["is_valid"]:
            raise HTTPException(status_code=400, detail={"message": "كلمة المرور ضعيفة", "errors": pw_check["errors"]})

        hashed = hash_password(password_data.new_password)
        await db.users.update_one({"id": user_id}, {"$set": {"password": hashed}})

        return {"message": "تم تحديث كلمة المرور بنجاح"}


    return router
