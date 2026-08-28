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
from core.db_naming import resolve_db_name  # p347
import qrcode
import io
import base64
import bcrypt
import jwt
import secrets

from utils.auth import email_ci

logger = logging.getLogger(__name__)



# ── p53: login-package request models ────────────────────────────────────────
class TwoFALoginVerifyRequest(BaseModel):
    pending_token: str
    code: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    new_password: str


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

    # Brute-force protection state (p45: restored — accidentally removed by p11 dead-code dedup)
    # p53b: shared across the 4 uvicorn workers via Redis (in-memory fallback).
    _login_attempts = {}  # {email: {"count": int, "locked_until": str}} — fallback only
    MAX_LOGIN_ATTEMPTS = 5
    LOCKOUT_MINUTES = 15

    _bf_redis = None
    try:
        import redis as _redis_mod
        _bf_redis = _redis_mod.from_url(
            os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
            decode_responses=True, socket_connect_timeout=2,
        )
        _bf_redis.ping()
    except Exception:  # noqa: BLE001
        _bf_redis = None

    def _bf_keys(email: str):
        e = (email or "").strip().lower()
        return f"bf_cnt:{e}", f"bf_lock:{e}"

    def _bf_locked_minutes(email: str) -> int:
        """Minutes left on the lockout (0 = not locked)."""
        if _bf_redis:
            try:
                ttl = _bf_redis.ttl(_bf_keys(email)[1])
                return (ttl + 59) // 60 if ttl and ttl > 0 else 0
            except Exception:  # noqa: BLE001
                pass
        e = (email or "").strip().lower()
        info = _login_attempts.get(e)
        if info and info.get("locked_until"):
            locked = datetime.fromisoformat(info["locked_until"])
            if datetime.now(timezone.utc) < locked:
                return int((locked - datetime.now(timezone.utc)).total_seconds() / 60) + 1
            _login_attempts.pop(e, None)
        return 0

    def _check_brute_force(email: str) -> None:
        """Check if account is locked due to too many failed attempts"""
        remaining = _bf_locked_minutes(email)
        if remaining:
            raise HTTPException(status_code=429, detail=f"الحساب مقفل. حاول بعد {remaining} دقيقة")

    def _record_failed_login(email: str) -> None:
        if _bf_redis:
            try:
                cnt_key, lock_key = _bf_keys(email)
                count = _bf_redis.incr(cnt_key)
                _bf_redis.expire(cnt_key, 30 * 60)
                if count >= MAX_LOGIN_ATTEMPTS:
                    _bf_redis.set(lock_key, "1", ex=LOCKOUT_MINUTES * 60)
                    _bf_redis.delete(cnt_key)
                return
            except Exception:  # noqa: BLE001
                pass
        e = (email or "").strip().lower()
        info = _login_attempts.get(e, {"count": 0})
        info["count"] = info.get("count", 0) + 1
        if info["count"] >= MAX_LOGIN_ATTEMPTS:
            info["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
        _login_attempts[e] = info

    def _clear_failed_login(email: str) -> None:
        if _bf_redis:
            try:
                _bf_redis.delete(*_bf_keys(email))
            except Exception:  # noqa: BLE001
                pass
        _login_attempts.pop((email or "").strip().lower(), None)

    def _bf_attempts_used(email: str) -> int:
        if _bf_redis:
            try:
                v = _bf_redis.get(_bf_keys(email)[0])
                return int(v) if v else 0
            except Exception:  # noqa: BLE001
                pass
        return _login_attempts.get((email or "").strip().lower(), {}).get("count", 0)

    # ── p53: pending-2FA gate ────────────────────────────────────────────────
    PENDING_2FA_TTL_MINUTES = 5
    RESET_CODE_TTL_MINUTES = 15

    async def _2fa_gate(user_record: dict, final_payload: dict) -> dict:
        """If the account has TOTP 2FA enabled, stash the minted login payload
        server-side (5 min TTL, single use) and ask the client for the
        authenticator code instead of returning the token directly."""
        now = datetime.now(timezone.utc)
        # p154: email OTP branch — 6-digit code sent to the account email
        if user_record.get("two_fa_email_enabled") and user_record.get("email"):
            import secrets as _sec2
            await main_db.pending_2fa_logins.delete_many({"expires_at": {"$lt": now.isoformat()}})
            _code = f"{_sec2.randbelow(1000000):06d}"
            pending_id = str(uuid.uuid4())
            await main_db.pending_2fa_logins.insert_one({
                "_id": pending_id,
                "email_code": _code,
                "payload": final_payload,
                "attempts": 0,
                "created_at": now.isoformat(),
                "expires_at": (now + timedelta(minutes=10)).isoformat(),
            })
            try:
                from services.email_service import send_email as _send_2fa_email
                await _send_2fa_email(
                    user_record["email"],
                    "رمز الدخول — NT Commerce",
                    html=(
                        "<div dir='rtl' style='font-family:Arial,sans-serif;padding:24px;max-width:480px'>"
                        "<h2 style='color:#1e40af;margin:0 0 12px'>رمز التحقق لتسجيل الدخول</h2>"
                        "<p style='color:#334155'>محاولة دخول إلى حساب مالك المنصة. الرمز صالح 10 دقائق:</p>"
                        f"<div style='font-size:32px;letter-spacing:8px;font-weight:bold;text-align:center;"
                        f"background:#f1f5f9;border-radius:12px;padding:16px;margin:16px 0;direction:ltr'>{_code}</div>"
                        "<p style='color:#94a3b8;font-size:12px'>إن لم تطلب هذا الرمز تجاهل الرسالة وغيّر كلمة المرور فوراً.</p>"
                        "</div>"
                    ),
                )
            except Exception as _exc:
                import logging as _lg
                _lg.getLogger(__name__).error("2FA email send failed: %s", _exc)
            return {
                "requires_2fa": True,
                "pending_token": pending_id,
                "method": "email",
                "message": "أرسلنا رمز تحقق من 6 أرقام إلى بريدك الإلكتروني — صالح 10 دقائق",
            }
        secret = user_record.get("two_fa_secret")
        if not (user_record.get("two_fa_enabled") and secret):
            return final_payload
        # lazy cleanup of expired pending logins (ISO strings compare lexically in UTC)
        await main_db.pending_2fa_logins.delete_many({"expires_at": {"$lt": now.isoformat()}})
        pending_id = str(uuid.uuid4())
        await main_db.pending_2fa_logins.insert_one({
            "_id": pending_id,
            "secret": secret,
            "payload": final_payload,
            "attempts": 0,
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(minutes=PENDING_2FA_TTL_MINUTES)).isoformat(),
        })
        return {
            "requires_2fa": True,
            "pending_token": pending_id,
            "message": "أدخل رمز التحقق المكوّن من 6 أرقام من تطبيق المصادقة",
        }


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
        user = await db.users.find_one({"email": email_ci(email)}, {"_id": 0})
        if user:
            stored_password = user.get("hashed_password") or user.get("password")
            if stored_password and verify_password(password, stored_password):
                _clear_failed_login(email)
                access_token = create_access_token({"sub": user["id"], "role": user["role"]})
                return await _2fa_gate(user, {
                    "access_token": access_token,
                    "user_type": "admin",
                    "redirect_to": "/saas-admin",
                    "user": {
                        "id": user["id"],
                        "email": user["email"],
                        "name": user["name"],
                        "role": user["role"],
                        "permissions": user.get("permissions", {}),
                        "features": user.get("features")
                    }
                })

        # 2. Check Agents
        agent = await db.saas_agents.find_one({"email": email_ci(email)}, {"_id": 0})
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
                    agent["two_fa_email_enabled"] = True  # p155: email OTP enforced for all agents
                    return await _2fa_gate(agent, {
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
                    })
            except Exception:
                pass

        # 2.5 Check tenant employees (main_db directory maps email → tenant)
        directory = await main_db.identity_registry.find_one({"email": email.strip().lower(), "kind": "employee"}, {"_id": 0})
        if not directory:
            directory = await main_db.tenant_user_directory.find_one({"email": email.strip().lower()}, {"_id": 0})  # legacy fallback
        if directory:
            tenant = await main_db.saas_tenants.find_one({"id": directory["tenant_id"]}, {"_id": 0})
            if tenant:
                if not tenant.get("is_active", True):
                    raise HTTPException(status_code=403, detail="حساب المتجر معطل")
                if tenant.get("subscription_ends_at"):
                    end_date = datetime.fromisoformat(tenant["subscription_ends_at"].replace("Z", "+00:00"))
                    if end_date < datetime.now(timezone.utc) and not tenant.get("is_trial"):
                        raise HTTPException(status_code=403, detail="انتهت صلاحية اشتراك المتجر")
                tenant_db_conn = get_tenant_db(directory["tenant_id"])
                emp_user = await tenant_db_conn.users.find_one({"id": directory["user_id"]}, {"_id": 0})
                if emp_user:
                    stored = emp_user.get("hashed_password") or emp_user.get("password")
                    if stored and verify_password(password, stored):
                        if emp_user.get("is_active", True) is False:
                            raise HTTPException(status_code=403, detail="الحساب معطل")
                        _clear_failed_login(email)
                        token_data = {
                            "sub": emp_user["id"],
                            "email": emp_user["email"],
                            "role": emp_user.get("role", "seller"),
                            "type": "tenant",
                            "tenant_id": directory["tenant_id"],
                        }
                        access_token = create_access_token(token_data)
                        return await _2fa_gate(emp_user, {
                            "access_token": access_token,
                            "user_type": "tenant",
                            "redirect_to": "/tenant/dashboard",
                            "user": {
                                "id": emp_user["id"],
                                "email": emp_user["email"],
                                "name": emp_user.get("name", ""),
                                "role": emp_user.get("role", "seller"),
                                "company_name": tenant.get("company_name", ""),
                                "permissions": emp_user.get("permissions", {}),
                                "is_employee": True,
                            },
                        })

        # 3. Check Tenants
        tenant = await db.saas_tenants.find_one({"email": email_ci(email)}, {"_id": 0})
        if tenant:
            stored_password = tenant.get("password", "")
            try:
                if bcrypt.checkpw(password.encode('utf-8'), stored_password.encode('utf-8')):
                    if not tenant.get("is_active", True):
                        raise HTTPException(status_code=403, detail="الحساب معطل")
                    # p156: block unverified subscribers (legacy tenants have no flag)
                    if tenant.get("email_verified") is False:
                        # p157: auto-send a fresh code when none is valid
                        from routes.saas.registration_routes import ensure_active_verification_code
                        _sent = await ensure_active_verification_code(tenant)
                        _msg = ("بريدك غير مؤكد — أرسلنا رمز تأكيد جديداً إلى بريدك، أدخله في صفحة /verify-email"
                                if _sent else
                                "بريدك غير مؤكد — أدخل الرمز المرسل إلى بريدك في صفحة /verify-email")
                        raise HTTPException(status_code=403, detail=_msg)
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
                        # p60: try golden-template provisioning first (same as registration/saas paths)
                        try:
                            from services.tenant_template import copy_template_to_tenant
                            await copy_template_to_tenant(tenant_id)
                            tenant_db_conn = get_tenant_db(tenant_id)
                        except Exception as _tpl_err:
                            logger.warning(f"template copy failed on first login, legacy seeding: {_tpl_err}")
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
                    # If still missing (db was initialized but admin user was never seeded),
                    # create one on-the-fly so tenant-scoped endpoints can locate the user.
                    if not tenant_user:
                        new_uid = str(uuid.uuid4())
                        await tenant_db_conn.users.insert_one({
                            "id": new_uid,
                            "name": tenant.get("name", email),
                            "email": email,
                            "hashed_password": stored_password,
                            "role": "admin",
                            "permissions": {},
                            "created_at": datetime.now(timezone.utc).isoformat(),
                        })
                        tenant_user = {"id": new_uid, "role": "admin", "name": tenant.get("name", "")}

                    # Use the tenant user's id as sub so get_current_user can find them
                    actual_user_id = tenant_user["id"]

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

                    return await _2fa_gate(tenant, {
                        "access_token": access_token,
                        "user_type": "tenant",
                        "redirect_to": "/tenant/dashboard",
                        "user": {
                            "id": tenant["id"],
                            "email": tenant["email"],
                            "name": tenant["name"],
                            "company_name": tenant.get("company_name", ""),
                            "plan_name": plan.get("name_ar", "") if plan else "",
                            "is_trial": tenant.get("is_trial", False),
                            "subscription_ends_at": tenant.get("subscription_ends_at"),
                            "database_name": resolve_db_name(tenant["id"]),
                            "is_first_login": not tenant.get("database_initialized", False),
                            "features": features,
                            "limits": limits
                        }
                    })
            except HTTPException:
                raise
            except Exception:
                pass

        # No user found
        _record_failed_login(email)
        if _bf_locked_minutes(email):
            raise HTTPException(status_code=429, detail=f"تم قفل الحساب مؤقتاً لمدة {LOCKOUT_MINUTES} دقيقة بسبب تكرار محاولات الدخول الخاطئة")
        _remaining = MAX_LOGIN_ATTEMPTS - _bf_attempts_used(email)
        raise HTTPException(status_code=401, detail=f"بيانات الدخول غير صحيحة — تبقّى {_remaining} من المحاولات قبل قفل الحساب مؤقتاً")

    @router.post("/auth/2fa/login-verify")
    @limiter.limit("10/minute")
    async def login_verify_2fa(request: Request, body: TwoFALoginVerifyRequest):
        """p53: second step of login — validate the TOTP code against the
        pending login and release the stashed payload (single use)."""
        doc = await main_db.pending_2fa_logins.find_one({"_id": body.pending_token})
        if not doc:
            raise HTTPException(status_code=401, detail="انتهت صلاحية طلب التحقق — أعد تسجيل الدخول")
        if datetime.fromisoformat(doc["expires_at"]) < datetime.now(timezone.utc):
            await main_db.pending_2fa_logins.delete_one({"_id": body.pending_token})
            raise HTTPException(status_code=401, detail="انتهت صلاحية طلب التحقق — أعد تسجيل الدخول")
        if doc.get("attempts", 0) >= 5:
            await main_db.pending_2fa_logins.delete_one({"_id": body.pending_token})
            raise HTTPException(status_code=429, detail="محاولات كثيرة خاطئة — أعد تسجيل الدخول من جديد")
        code = (body.code or "").strip().replace(" ", "")
        if doc.get("email_code"):
            # p154: email OTP — constant-time compare, same attempts policy
            import secrets as _sec3
            _ok = _sec3.compare_digest(code, doc["email_code"])
        else:
            _ok = pyotp.TOTP(doc["secret"]).verify(code, valid_window=1)
        if not _ok:
            await main_db.pending_2fa_logins.update_one({"_id": body.pending_token}, {"$inc": {"attempts": 1}})
            remaining = 5 - (doc.get("attempts", 0) + 1)
            raise HTTPException(status_code=401, detail=f"رمز التحقق غير صحيح — تبقّى {remaining} من المحاولات")
        payload = doc["payload"]
        await main_db.pending_2fa_logins.delete_one({"_id": body.pending_token})
        return payload

    @router.post("/auth/forgot-password")
    @limiter.limit("5/minute")
    async def forgot_password(request: Request, body: ForgotPasswordRequest):
        """p53: issue a 6-digit reset code (15 min TTL). The code is emailed
        when a real provider is configured; while email runs in mock mode the
        super admin relays it from /saas-admin/alerts. Response is generic to
        avoid account enumeration."""
        generic = {"message": "إذا كان البريد مسجلاً لدينا، فستصلك تعليمات إعادة تعيين كلمة المرور."}
        email = (body.email or "").strip().lower()
        if not email or "@" not in email:
            return generic

        account = None  # (kind, account_id, tenant_id)
        u = await db.users.find_one({"email": email_ci(email)}, {"_id": 0, "id": 1})
        if u:
            account = ("main_user", u["id"], None)
        if not account:
            t = await db.saas_tenants.find_one({"email": email_ci(email)}, {"_id": 0, "id": 1})
            if t:
                account = ("tenant_owner", t["id"], t["id"])
        if not account:
            a = await db.saas_agents.find_one({"email": email_ci(email)}, {"_id": 0, "id": 1})
            if a:
                account = ("agent", a["id"], None)
        if not account:
            d = await main_db.identity_registry.find_one({"email": email, "kind": "employee"}, {"_id": 0})
            if not d:
                d = await main_db.tenant_user_directory.find_one({"email": email}, {"_id": 0})
            if d:
                account = ("employee", d["user_id"], d["tenant_id"])
        if not account:
            return generic

        code = f"{secrets.randbelow(1000000):06d}"
        now = datetime.now(timezone.utc)
        await main_db.password_reset_requests.update_one(
            {"email": email},
            {"$set": {
                "email": email,
                # plaintext on purpose (15-min TTL): the super admin relays it
                # while the email provider is in mock mode.
                "code": code,
                "account_kind": account[0],
                "account_id": account[1],
                "tenant_id": account[2],
                "created_at": now.isoformat(),
                "expires_at": (now + timedelta(minutes=RESET_CODE_TTL_MINUTES)).isoformat(),
                "used": False,
                "attempts": 0,
                "delivered": False,
            }},
            upsert=True,
        )
        html = (
            "<div dir='rtl' style='font-family:Arial,sans-serif'>"
            "<h3>إعادة تعيين كلمة المرور — NT Commerce</h3>"
            f"<p>رمز إعادة التعيين الخاص بك: <b style='font-size:20px'>{code}</b></p>"
            "<p>الرمز صالح لمدة 15 دقيقة. إذا لم تطلب إعادة التعيين، تجاهل هذه الرسالة.</p>"
            "</div>"
        )
        try:
            from services.email_service import send_email as _send_mail
            delivered = await _send_mail(email, "إعادة تعيين كلمة المرور — NT Commerce", html=html)
            if delivered:
                await main_db.password_reset_requests.update_one({"email": email}, {"$set": {"delivered": True}})
        except Exception as exc:  # noqa: BLE001 — best effort, never leak
            logger.warning("forgot-password email send failed: %s", exc)
        return generic

    @router.post("/auth/reset-password")
    @limiter.limit("10/minute")
    async def reset_password(request: Request, body: ResetPasswordRequest):
        """p53: validate the code and set the new password in the right store."""
        email = (body.email or "").strip().lower()
        req = await main_db.password_reset_requests.find_one({"email": email})
        now = datetime.now(timezone.utc)
        if not req or req.get("used") or req.get("expires_at", "") < now.isoformat():
            raise HTTPException(status_code=400, detail="الرمز غير صالح أو منتهي الصلاحية — اطلب رمزاً جديداً")
        if req.get("attempts", 0) >= 5:
            await main_db.password_reset_requests.update_one({"email": email}, {"$set": {"used": True}})
            raise HTTPException(status_code=429, detail="محاولات كثيرة خاطئة — اطلب رمزاً جديداً")
        if (body.code or "").strip() != req.get("code"):
            await main_db.password_reset_requests.update_one({"email": email}, {"$inc": {"attempts": 1}})
            remaining = 5 - (req.get("attempts", 0) + 1)
            raise HTTPException(status_code=400, detail=f"الرمز غير صحيح — تبقّى {remaining} من المحاولات")
        new_pw = body.new_password or ""
        if len(new_pw) < 6:
            raise HTTPException(status_code=400, detail="كلمة المرور يجب أن تكون 6 أحرف على الأقل")

        new_hash = bcrypt.hashpw(new_pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        kind = req.get("account_kind")
        if kind == "main_user":
            await db.users.update_one({"id": req["account_id"]}, {"$set": {"hashed_password": new_hash}})
        elif kind == "tenant_owner":
            await db.saas_tenants.update_one({"id": req["account_id"]}, {"$set": {"password": new_hash}})
            tenant_db_conn = get_tenant_db(req["tenant_id"])
            await tenant_db_conn.users.update_many({"email": email}, {"$set": {"hashed_password": new_hash}})
        elif kind == "agent":
            await db.saas_agents.update_one({"id": req["account_id"]}, {"$set": {"password": new_hash}})
        elif kind == "employee":
            tenant_db_conn = get_tenant_db(req["tenant_id"])
            await tenant_db_conn.users.update_one({"id": req["account_id"]}, {"$set": {"hashed_password": new_hash}})
        else:
            raise HTTPException(status_code=400, detail="طلب غير صالح — اطلب رمزاً جديداً")

        await main_db.password_reset_requests.update_one(
            {"email": email}, {"$set": {"used": True, "used_at": now.isoformat()}, "$unset": {"code": ""}}
        )
        _clear_failed_login(email)
        return {"message": "تم تغيير كلمة المرور بنجاح — يمكنك تسجيل الدخول الآن"}

    @router.get("/auth/password-reset-requests")
    async def list_password_reset_requests(admin: dict = Depends(get_admin_user)):
        """p53: super-admin visibility into pending reset requests (needed while
        the email provider is in mock mode and codes are relayed manually)."""
        now_iso = datetime.now(timezone.utc).isoformat()
        items = []
        async for r in main_db.password_reset_requests.find({}, {"_id": 0}).sort("created_at", -1).limit(50):
            expired = r.get("expires_at", "") < now_iso
            r["expired"] = expired
            if r.get("used") or expired:
                r.pop("code", None)
            items.append(r)
        provider = "mock"
        try:
            from services.email_service import get_active_provider
            provider = await get_active_provider()
        except Exception:  # noqa: BLE001
            pass
        return {"items": items, "email_provider": provider}

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
        # Hide super_admin users from everyone except super_admin itself
        query = {"role": {"$ne": "super_admin"}, "user_type": {"$ne": "super_admin"}}
        if admin.get("role") == "super_admin" or admin.get("user_type") == "super_admin":
            query = {}
        users = await db.users.find(query, {"_id": 0, "password": 0}).to_list(1000)
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

        # Check if email already exists (case-insensitive, stored normalized)
        norm_email = user_data.email.strip().lower()
        existing = await db.users.find_one({"email": email_ci(norm_email)})
        if existing:
            raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم بالفعل")
        # p120: platform-wide uniqueness (owner/agent/employee/platform)
        from utils.identity import assert_email_globally_free, register_identity
        await assert_email_globally_free(norm_email)

        if len(user_data.password) < 4:
            raise HTTPException(status_code=400, detail="كلمة المرور يجب أن تكون 4 أحرف على الأقل")

        now = datetime.now(timezone.utc).isoformat()
        new_user = {
            "id": str(uuid.uuid4()),
            "name": user_data.name,
            "email": norm_email,
            "password": hash_password(user_data.password),
            "role": user_data.role,
            "tenant_id": admin.get("tenant_id"),
            "permissions": {},
            "created_at": now
        }

        await db.users.insert_one(new_user)
        await register_identity(norm_email, "employee", new_user["id"], tenant_id=admin.get("tenant_id"), name=user_data.name)

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
        from utils.identity import remove_identity
        await remove_identity(user_id=user_id)
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

