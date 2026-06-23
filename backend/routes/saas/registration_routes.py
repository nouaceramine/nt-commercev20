"""SaaS Registration Routes - Public registration + tenant login"""
from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone, timedelta
import uuid
import bcrypt

from config.database import db, init_tenant_database
from .schemas import TenantCreate, AgentLoginRequest
from .helpers import create_access_token

router = APIRouter(tags=["SaaS Registration"])


@router.post("/saas/register")
async def register_tenant(tenant: TenantCreate):
    existing = await db.saas_tenants.find_one({"email": tenant.email})
    if existing:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم بالفعل")

    plan = await db.saas_plans.find_one({"id": tenant.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="الخطة غير موجودة")

    now = datetime.now(timezone.utc)
    trial_ends_at = now + timedelta(days=14)

    tenant_id = str(uuid.uuid4())
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
        "is_trial": True,
        "trial_ends_at": trial_ends_at.isoformat(),
        "subscription_type": "monthly",
        "subscription_starts_at": now.isoformat(),
        "subscription_ends_at": trial_ends_at.isoformat(),
        "features_override": {},
        "limits_override": {},
        "notes": "",
        "business_type": tenant.business_type if hasattr(tenant, 'business_type') else "retailer",
        "database_initialized": False,
        "created_at": now.isoformat()
    }

    await db.saas_tenants.insert_one(tenant_doc)
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
        "message": "تم إنشاء حسابك بنجاح! لديك 14 يوماً تجريبية.",
        "trial_ends_at": trial_ends_at.isoformat()
    }


@router.post("/saas/tenant-login")
async def tenant_login(login_data: AgentLoginRequest):
    tenant = await db.saas_tenants.find_one({"email": login_data.email})
    if not tenant:
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")

    if not bcrypt.checkpw(login_data.password.encode('utf-8'), tenant["password"].encode('utf-8')):
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")

    if not tenant.get("is_active", True):
        raise HTTPException(status_code=403, detail="الحساب معطل")

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
