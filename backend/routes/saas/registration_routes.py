"""SaaS Registration Routes - Public registration + tenant login"""
from fastapi import APIRouter, HTTPException, Request
from datetime import datetime, timezone, timedelta
import os
import uuid
import bcrypt

from config.database import db, init_tenant_database
from services.tenant_template import copy_template_to_tenant
from utils.auth import email_ci
from utils.ids import new_id
from .schemas import TenantCreate, AgentLoginRequest
from .helpers import create_access_token, next_tenant_short_id

# ── Sprint 1: Rate limiting on public endpoints (login, register) ─────────
from middleware.rate_limit import rate_limit as _rate_limited  # noqa: E402

router = APIRouter(tags=["SaaS Registration"])

# ── p156: email verification for new subscribers ──────────────────────────
from pydantic import BaseModel  # noqa: E402


class VerifyEmailRequest(BaseModel):
    email: str
    code: str


class ResendVerificationRequest(BaseModel):
    email: str


async def _send_verification_code(tenant_id: str, email: str, name: str = "") -> None:
    """p156: create a 6-digit verification code (10-min TTL) and email it."""
    import secrets as _sec
    now = datetime.now(timezone.utc)
    code = f"{_sec.randbelow(1000000):06d}"
    await db.email_verifications.delete_many({"email": email})
    await db.email_verifications.insert_one({
        "_id": str(uuid.uuid4()),
        "email": email,
        "tenant_id": tenant_id,
        "code": code,
        "attempts": 0,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(minutes=10)).isoformat(),
    })
    try:
        from services.email_service import send_email as _send_mail
        await _send_mail(
            email,
            "رمز تأكيد البريد — NT Commerce",
            html=(
                "<div dir='rtl' style='font-family:Arial,sans-serif;padding:24px;max-width:480px'>"
                "<h2 style='color:#1e40af;margin:0 0 12px'>أهلاً بك في NT Commerce</h2>"
                f"<p style='color:#334155'>مرحباً {name or ''} — أكّد بريدك الإلكتروني لتفعيل حسابك. الرمز صالح 10 دقائق:</p>"
                f"<div style='font-size:32px;letter-spacing:8px;font-weight:bold;text-align:center;"
                f"background:#f1f5f9;border-radius:12px;padding:16px;margin:16px 0;direction:ltr'>{code}</div>"
                "<p style='color:#94a3b8;font-size:12px'>إن لم تنشئ حساباً تجاهل هذه الرسالة.</p>"
                "</div>"
            ),
        )
    except Exception as _exc:
        print(f"[REG] verification email send failed: {_exc}")


def _max_tenants() -> int:
    """Return the configured ceiling for active tenants. 0 = unlimited."""
    try:
        return int(os.environ.get("MAX_TENANTS", "0") or 0)
    except ValueError:
        return 0


@router.post("/saas/register")
async def register_tenant(tenant: TenantCreate):
    # Enforce the platform-wide tenant cap when MAX_TENANTS > 0
    cap = _max_tenants()
    if cap > 0:
        current = await db.saas_tenants.count_documents({})
        if current >= cap:
            raise HTTPException(
                status_code=400,
                detail=f"تم بلوغ الحدّ الأقصى للمستأجرين على المنصّة ({cap}). الرجاء التواصل مع الإدارة.",
            )

    existing = await db.saas_tenants.find_one({"email": email_ci(tenant.email)})
    if existing:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم بالفعل")

    # p32: also reject emails owned by a main-DB user — such a user would
    # hijack /api/auth/login and shadow the tenant account (the p30 bug class)
    stale_user = await db.users.find_one({"email": email_ci(tenant.email)})
    if stale_user:
        raise HTTPException(
            status_code=400,
            detail="البريد الإلكتروني مستخدم بالفعل في حساب آخر. الرجاء استخدام بريد مختلف أو التواصل مع الإدارة.",
        )

    # p120: reject agent emails + any registered identity, then normalize
    stale_agent = await db.saas_agents.find_one({"email": email_ci(tenant.email)})
    if stale_agent:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم بالفعل في حساب وكيل")
    from utils.identity import assert_email_globally_free, register_identity
    await assert_email_globally_free(tenant.email)
    tenant.email = tenant.email.strip().lower()

    plan = await db.saas_plans.find_one({"id": tenant.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="الخطة غير موجودة")

    now = datetime.now(timezone.utc)
    trial_ends_at = now + timedelta(days=14)

    tenant_id = new_id()
    hashed_password = bcrypt.hashpw(tenant.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    tenant_doc = {
        "id": tenant_id,
        "name": tenant.name,
        "email": tenant.email,
        "phone": tenant.phone or "",
        "company_name": tenant.company_name or "",
        "password": hashed_password,
        "plan_id": tenant.plan_id,
        "agent_id": tenant.agent_id if hasattr(tenant, 'agent_id') and tenant.agent_id else None,
        "is_active": True,
        "email_verified": False,  # p156: must confirm email before login
        "is_trial": True,
        "trial_ends_at": trial_ends_at.isoformat(),
        "subscription_type": "monthly",
        "subscription_starts_at": now.isoformat(),
        "subscription_ends_at": trial_ends_at.isoformat(),
        "features_override": {},
        "limits_override": {},
        "notes": "",
        "business_type": tenant.business_type if hasattr(tenant, 'business_type') else "retailer",
        "short_id": await next_tenant_short_id(),
        "database_initialized": False,
        "created_at": now.isoformat()
    }

    await db.saas_tenants.insert_one(tenant_doc)
    await register_identity(tenant.email, "owner", tenant_id, tenant_id=tenant_id, name=tenant.name)
    # Golden template provisioning (p31): full collections/indexes/seeds;
    # legacy seeding kept as fallback if the template is missing/broken
    try:
        await copy_template_to_tenant(tenant_id)
    except Exception as _tpl_err:
        print(f"[REG] template copy failed, legacy seeding: {_tpl_err}")
        await init_tenant_database(tenant_id)
    await db.saas_tenants.update_one({"id": tenant_id}, {"$set": {"database_initialized": True}})

    if tenant_doc.get("agent_id"):
        agent = await db.saas_agents.find_one({"id": tenant_doc["agent_id"]})
        if agent:
            _plan_rate = plan.get("commission_rate")
            _commission_rate = 10.0 if _plan_rate is None else float(_plan_rate)
            commission = plan.get("monthly_price", 0) * (_commission_rate / 100)
            if commission > 0:
                transaction_doc = {
                    "id": str(uuid.uuid4()),
                    "agent_id": agent["id"],
                    "type": "commission",
                    "amount": commission,
                    "tenant_id": tenant_id,
                    "tenant_name": tenant.name,
                    "notes": f"عمولة تسجيل مشترك جديد: {tenant.name}",
                    "created_at": now.isoformat()
                }
                await db.saas_agent_transactions.insert_one(transaction_doc)
                await db.saas_agents.update_one({"id": agent["id"]}, {
                    "$inc": {"total_earnings": commission, "pending_earnings": commission}
                })

    # p156: email the verification code — login stays blocked until confirmed
    await _send_verification_code(tenant_id, tenant.email, tenant.name)

    access_token = create_access_token({
        "sub": tenant_id,
        "email": tenant.email,
        "role": "admin",
        "type": "tenant",
        "tenant_id": tenant_id
    })

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "tenant_id": tenant_id,
        "requires_email_verification": True,  # p156
        "message": "تم إنشاء حسابك بنجاح! أرسلنا رمز تأكيد إلى بريدك الإلكتروني.",
        "trial_ends_at": trial_ends_at.isoformat()
    }


@router.post("/saas/tenant-login")
@_rate_limited(os.environ.get("RATE_LIMIT_LOGIN", "10/minute"))
async def tenant_login(request: Request, login_data: AgentLoginRequest):
    tenant = await db.saas_tenants.find_one({"email": email_ci(login_data.email)})
    if not tenant:
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")

    if not bcrypt.checkpw(login_data.password.encode('utf-8'), tenant["password"].encode('utf-8')):
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")

    if not tenant.get("is_active", True):
        raise HTTPException(status_code=403, detail="الحساب معطل")

    # p156: block login until the signup email is verified (legacy accounts have no flag)
    if tenant.get("email_verified") is False:
        raise HTTPException(status_code=403, detail="يجب تأكيد بريدك الإلكتروني أولاً — أدخل الرمز المرسل إليك عند التسجيل في صفحة /verify-email")

    access_token = create_access_token({
        "sub": tenant["id"],
        "email": tenant["email"],
        "role": "admin",
        "type": "tenant",
        "tenant_id": tenant["id"]
    })

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "tenant_id": tenant["id"],
        "user": {
            "id": tenant["id"],
            "email": tenant["email"],
            "name": tenant.get("name", ""),
            "role": "admin",
            "tenant_id": tenant["id"],
            "company_name": tenant.get("company_name", "")
        }
    }


@router.post("/saas/verify-email")
@_rate_limited(os.environ.get("RATE_LIMIT_LOGIN", "10/minute"))
async def verify_email(request: Request, data: VerifyEmailRequest):
    """p156: confirm a new subscriber's email with the 6-digit code."""
    import secrets as _sec
    email = data.email.strip().lower()
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = await db.email_verifications.find_one({"email": email, "expires_at": {"$gt": now_iso}})
    if not doc:
        raise HTTPException(status_code=400, detail="الرمز منتهي أو لم يُطلب — اطلب رمزاً جديداً")
    if doc.get("attempts", 0) >= 5:
        raise HTTPException(status_code=429, detail="تجاوزت عدد المحاولات — اطلب رمزاً جديداً")
    if not _sec.compare_digest(data.code.strip(), doc["code"]):
        await db.email_verifications.update_one({"_id": doc["_id"]}, {"$inc": {"attempts": 1}})
        remaining = 4 - doc.get("attempts", 0)
        raise HTTPException(status_code=400, detail=f"رمز التحقق غير صحيح — تبقّى {remaining} من المحاولات")
    await db.saas_tenants.update_one(
        {"id": doc["tenant_id"]},
        {"$set": {"email_verified": True, "email_verified_at": now_iso}},
    )
    await db.email_verifications.delete_many({"email": email})
    return {"verified": True, "message": "تم تأكيد بريدك الإلكتروني بنجاح — يمكنك الآن استخدام حسابك"}


@router.post("/saas/resend-verification")
@_rate_limited("3/minute")
async def resend_verification(request: Request, data: ResendVerificationRequest):
    """p156: resend the verification code (generic response — anti-enumeration)."""
    email = data.email.strip().lower()
    tenant = await db.saas_tenants.find_one({"email": email_ci(email)})
    if tenant and tenant.get("email_verified") is False:
        await _send_verification_code(tenant["id"], tenant["email"], tenant.get("name", ""))
    return {"message": "إن كان الحساب بانتظار التأكيد فقد أرسلنا رمزاً جديداً إلى بريدك"}
