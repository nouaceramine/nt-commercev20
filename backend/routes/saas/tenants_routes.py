"""SaaS Tenants Routes - Tenant management CRUD"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import uuid
import bcrypt
import ipaddress
import socket
import httpx
import logging
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


def _assert_safe_bridge_url(url: str) -> None:
    """Raise HTTPException 400 if url targets a private/internal network (SSRF guard)."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="رابط الجسر يجب أن يبدأ بـ http:// أو https://")
    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="رابط الجسر غير صالح")
    try:
        ip = ipaddress.ip_address(socket.gethostbyname(hostname))
    except socket.gaierror:
        raise HTTPException(status_code=400, detail="تعذّر التحقق من رابط الجسر — اسم المضيف غير صالح")
    if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_unspecified:
        raise HTTPException(status_code=400, detail="رابط الجسر يشير إلى عنوان شبكة داخلية غير مسموح")

from config.database import db, main_db, client, init_tenant_database
from .schemas import TenantCreate, TenantUpdate, TenantResponse, SubscriptionPayment
from .helpers import get_super_admin, create_access_token
from services.wallet_service import credit_wallet, get_or_create_wallet

router = APIRouter(tags=["SaaS Tenants"])

# 16 supported feature keys for per-tenant overrides
SUPPORTED_FEATURES = {
    "pos", "inventory", "customers", "recharge", "iptv", "maintenance",
    "wallet", "commission", "reports", "backup", "ai_bots", "barcode",
    "thermal_print", "credit_sales", "loyalty_points"
}


@router.get("/saas/tenants", response_model=List[TenantResponse])
async def get_tenants(admin: dict = Depends(get_super_admin)):
    tenants = await db.saas_tenants.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    agents_list = await db.saas_agents.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    agents_map = {a["id"]: a["name"] for a in agents_list}

    for tenant in tenants:
        plan = await db.saas_plans.find_one({"id": tenant.get("plan_id")}, {"_id": 0, "name": 1, "name_ar": 1})
        tenant["plan_name"] = plan.get("name_ar", "") if plan else ""
        agent_id = tenant.get("agent_id")
        tenant["agent_name"] = agents_map.get(agent_id, "") if agent_id else ""

        tenant_db = client[f"tenant_{tenant['id'].replace('-', '_')}"]
        products_count = await tenant_db.products.count_documents({})
        users_count = await tenant_db.users.count_documents({})
        sales_count = await tenant_db.sales.count_documents({})
        tenant["stats"] = {"products": products_count, "users": users_count, "sales": sales_count}

    return [TenantResponse(**t) for t in tenants]


@router.get("/saas/tenants/{tenant_id}", response_model=TenantResponse)
async def get_tenant(tenant_id: str, admin: dict = Depends(get_super_admin)):
    tenant = await db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    plan = await db.saas_plans.find_one({"id": tenant.get("plan_id")}, {"_id": 0, "name_ar": 1})
    tenant["plan_name"] = plan.get("name_ar", "") if plan else ""

    tenant_db = client[f"tenant_{tenant['id'].replace('-', '_')}"]
    products_count = await tenant_db.products.count_documents({})
    users_count = await tenant_db.users.count_documents({})
    sales_count = await tenant_db.sales.count_documents({})
    tenant["stats"] = {"products": products_count, "users": users_count, "sales": sales_count}

    return TenantResponse(**tenant)


@router.post("/saas/impersonate/{tenant_id}")
async def impersonate_tenant(tenant_id: str, admin: dict = Depends(get_super_admin)):
    tenant = await main_db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="المشترك غير موجود")
    if not tenant.get("is_active"):
        raise HTTPException(status_code=400, detail="حساب المشترك معطل")

    access_token = create_access_token({
        "sub": tenant_id,
        "email": tenant["email"],
        "role": "admin",
        "type": "tenant",
        "tenant_id": tenant_id
    })

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "email": tenant["email"],
        "name": tenant.get("name", ""),
        "company_name": tenant.get("company_name", ""),
        "tenant_id": tenant_id,
        "user_type": "tenant",
        "user": {
            "id": tenant_id,
            "email": tenant["email"],
            "name": tenant.get("name", ""),
            "role": "admin",
            "tenant_id": tenant_id,
            "company_name": tenant.get("company_name", ""),
            "database_name": tenant.get("database_name", "")
        }
    }


@router.post("/saas/tenants", response_model=TenantResponse)
async def create_tenant(tenant: TenantCreate, admin: dict = Depends(get_super_admin)):
    existing = await db.saas_tenants.find_one({"email": tenant.email})
    if existing:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم بالفعل")

    plan = await db.saas_plans.find_one({"id": tenant.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="الخطة غير موجودة")

    now = datetime.now(timezone.utc)
    if tenant.subscription_type == "monthly":
        ends_at = now + timedelta(days=30)
    elif tenant.subscription_type == "6months":
        ends_at = now + timedelta(days=180)
    else:
        ends_at = now + timedelta(days=365)

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
        "agent_id": tenant.agent_id if hasattr(tenant, 'agent_id') else None,
        "is_active": True,
        "is_trial": False,
        "trial_ends_at": None,
        "subscription_type": tenant.subscription_type,
        "subscription_starts_at": now.isoformat(),
        "subscription_ends_at": ends_at.isoformat(),
        "features_override": {},
        "limits_override": {},
        "notes": "",
        "business_type": tenant.business_type if hasattr(tenant, 'business_type') else "retailer",
        "database_initialized": False,
        "recharge_mode": "owner_bridge",
        "self_bridge_url": "",
        "self_bridge_api_key": "",
        "created_at": now.isoformat()
    }

    await db.saas_tenants.insert_one(tenant_doc)
    await init_tenant_database(tenant_id)
    await db.saas_tenants.update_one({"id": tenant_id}, {"$set": {"database_initialized": True}})

    # Create PENDING commission for the agent if this tenant has one
    agent_id = tenant_doc.get("agent_id")
    if agent_id:
        try:
            agent_doc = await db.saas_agents.find_one({"id": agent_id}, {"_id": 0})
            if agent_doc:
                _rate = plan.get("commission_rate")
                plan_commission_rate = 10.0 if _rate is None else float(_rate)
                commission_fixed = agent_doc.get("commission_fixed", 0) or 0
                price_map = {
                    "monthly": plan.get("price_monthly", 0),
                    "6months": plan.get("price_6months", 0),
                    "yearly": plan.get("price_yearly", 0),
                }
                subscription_price = price_map.get(tenant_doc["subscription_type"], 0) or 0
                comm_amount = (subscription_price * plan_commission_rate / 100) + commission_fixed
                if comm_amount > 0:
                    comm_rec = {
                        "id": str(uuid.uuid4()),
                        "agent_id": agent_id,
                        "tenant_id": tenant_id,
                        "tenant_name": tenant_doc["name"],
                        "amount": comm_amount,
                        "status": "pending",
                        "chargeback_until": (now + timedelta(days=7)).isoformat(),
                        "plan_name": plan.get("name_ar") or plan.get("name") or "",
                        "commission_rate": plan_commission_rate,
                        "commission_fixed": commission_fixed,
                        "subscription_type": tenant_doc["subscription_type"],
                        "note": f"عمولة اشتراك {tenant_doc['subscription_type']} — {plan_commission_rate}% (سعر الخطة) + {commission_fixed} ثابت",
                        "created_at": now.isoformat(),
                        "updated_at": now.isoformat(),
                    }
                    await db.agent_commissions.insert_one(comm_rec)
        except Exception as comm_err:
            logger.warning(
                "Failed to create commission record for agent %s / tenant %s: %s",
                agent_id, tenant_id, comm_err
            )

    tenant_doc["plan_name"] = plan.get("name_ar", "")
    tenant_doc["agent_name"] = ""
    tenant_doc["stats"] = {"products": 0, "users": 1, "sales": 0}
    tenant_doc["database_initialized"] = True

    return TenantResponse(**{k: v for k, v in tenant_doc.items() if k not in ["_id", "password"]})


@router.put("/saas/tenants/{tenant_id}", response_model=TenantResponse)
async def update_tenant(tenant_id: str, updates: TenantUpdate, admin: dict = Depends(get_super_admin)):
    tenant = await db.saas_tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.saas_tenants.update_one({"id": tenant_id}, {"$set": update_data})
    updated = await db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0})

    plan = await db.saas_plans.find_one({"id": updated.get("plan_id")}, {"_id": 0, "name_ar": 1})
    updated["plan_name"] = plan.get("name_ar", "") if plan else ""
    updated["agent_name"] = ""
    updated["stats"] = {"products": 0, "users": 0, "sales": 0}

    return TenantResponse(**{k: v for k, v in updated.items() if k != "password"})


@router.get("/saas/tenants/{tenant_id}/features")
async def get_tenant_features(tenant_id: str, admin: dict = Depends(get_super_admin)):
    """Return resolved feature flags (plan defaults merged with tenant overrides)."""
    tenant = await db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0, "plan_id": 1, "features_override": 1})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    plan = await db.saas_plans.find_one({"id": tenant.get("plan_id")}, {"_id": 0, "features": 1}) or {}
    plan_features_raw = plan.get("features", {})

    # Normalise plan features to flat booleans — plans may store nested {enabled, subFeatures}
    plan_defaults: dict = {}
    for key in SUPPORTED_FEATURES:
        val = plan_features_raw.get(key)
        if isinstance(val, dict):
            plan_defaults[key] = bool(val.get("enabled", True))
        elif isinstance(val, bool):
            plan_defaults[key] = val
        else:
            plan_defaults[key] = True  # default: enabled when plan has no opinion

    overrides = tenant.get("features_override") or {}
    resolved = {**plan_defaults, **{k: bool(v) for k, v in overrides.items() if k in SUPPORTED_FEATURES}}
    return {"resolved": resolved, "features_override": overrides}


@router.put("/saas/tenants/{tenant_id}/features")
async def update_tenant_features(tenant_id: str, body: dict, admin: dict = Depends(get_super_admin)):
    """Save per-tenant feature flag overrides (super admin only)."""
    tenant = await db.saas_tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Accept only known feature keys; unknown keys are silently dropped
    clean = {k: bool(v) for k, v in body.items() if k in SUPPORTED_FEATURES}
    await db.saas_tenants.update_one({"id": tenant_id}, {"$set": {"features_override": clean}})
    return {"features_override": clean}


@router.delete("/saas/tenants/{tenant_id}")
async def delete_tenant(tenant_id: str, admin: dict = Depends(get_super_admin)):
    result = await db.saas_tenants.delete_one({"id": tenant_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Tenant not found")
    # Reverse PENDING commissions that are still inside the 7-day chargeback window.
    # Commissions whose window has already expired should have been promoted to AVAILABLE
    # and must NOT be reversed — reversing them would incorrectly claw back earned income.
    now = datetime.now(timezone.utc).isoformat()
    await db.agent_commissions.update_many(
        {"tenant_id": tenant_id, "status": "pending", "chargeback_until": {"$gt": now}},
        {"$set": {"status": "reversed", "updated_at": now}},
    )
    return {"message": "Tenant deleted successfully"}


@router.post("/saas/tenants/{tenant_id}/toggle-status")
async def toggle_tenant_status(tenant_id: str, admin: dict = Depends(get_super_admin)):
    tenant = await db.saas_tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    new_status = not tenant.get("is_active", True)
    await db.saas_tenants.update_one({"id": tenant_id}, {"$set": {"is_active": new_status}})
    # If deactivating a tenant, reverse PENDING commissions that are still inside
    # the 7-day chargeback window. Using chargeback_until > now is the canonical
    # check — it avoids re-doing a date calculation and handles edge cases where
    # the record's window has already expired (those must not be clawed back).
    if not new_status:
        try:
            now = datetime.now(timezone.utc).isoformat()
            await db.agent_commissions.update_many(
                {"tenant_id": tenant_id, "status": "pending", "chargeback_until": {"$gt": now}},
                {"$set": {"status": "reversed", "updated_at": now}},
            )
        except Exception as rev_err:
            logger.warning("Failed to reverse commissions for tenant %s: %s", tenant_id, rev_err)
    return {"is_active": new_status}


@router.put("/saas/tenants/{tenant_id}/recharge-mode")
async def set_recharge_mode(
    tenant_id: str,
    body: dict,
    admin: dict = Depends(get_super_admin)
):
    """Super admin: switch recharge mode and optionally set self-bridge URL/secret."""
    tenant = await db.saas_tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    mode = body.get("recharge_mode", "owner_bridge")
    if mode not in ("owner_bridge", "self_bridge"):
        raise HTTPException(status_code=400, detail="Invalid recharge_mode")

    update: dict = {
        "recharge_mode": mode,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if "self_bridge_url" in body:
        update["self_bridge_url"] = body["self_bridge_url"] or ""
    if "self_bridge_api_key" in body:
        update["self_bridge_api_key"] = body["self_bridge_api_key"] or ""

    await db.saas_tenants.update_one({"id": tenant_id}, {"$set": update})
    return {"ok": True, "recharge_mode": mode}


@router.post("/saas/tenants/{tenant_id}/test-bridge")
async def test_tenant_bridge(
    tenant_id: str,
    body: dict = {},
    admin: dict = Depends(get_super_admin)
):
    """Super admin: ping a tenant's self-bridge /health endpoint."""
    tenant = await db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    bridge_url = body.get("self_bridge_url") or tenant.get("self_bridge_url", "")
    bridge_api_key = body.get("self_bridge_api_key") or tenant.get("self_bridge_api_key", "")

    if not bridge_url:
        raise HTTPException(status_code=400, detail="لم يُعدَّ رابط الجسر بعد")

    _assert_safe_bridge_url(bridge_url)
    bridge_url = bridge_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"{bridge_url}/health",
                headers={"X-Api-Key": bridge_api_key} if bridge_api_key else {},
            )
        return {"ok": resp.status_code < 400, "status_code": resp.status_code}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@router.post("/saas/tenants/{tenant_id}/wallet/credit")
async def admin_credit_tenant_wallet(
    tenant_id: str,
    body: dict,
    admin: dict = Depends(get_super_admin)
):
    """Super admin: credit (top-up) a tenant's platform wallet."""
    tenant = await db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="المستأجر غير موجود")

    amount = float(body.get("amount", 0))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="يجب أن يكون المبلغ أكبر من صفر")

    notes = body.get("notes", "").strip() or "شحن من المدير العام"
    admin_id = admin.get("id", "super_admin")
    ref_id = str(uuid.uuid4())

    new_balance, txn = await credit_wallet(
        main_db=main_db,
        entity_id=tenant_id,
        amount=amount,
        ref_type="admin_topup",
        ref_id=ref_id,
        description=notes,
        created_by=admin_id,
        entity_type="tenant",
    )
    return {
        "ok": True,
        "new_balance": new_balance,
        "transaction_code": txn.get("code"),
        "tenant_name": tenant.get("name", ""),
    }


@router.get("/saas/tenants/{tenant_id}/wallet")
async def get_tenant_wallet(
    tenant_id: str,
    admin: dict = Depends(get_super_admin)
):
    """Super admin: get a tenant's wallet info and recent transactions."""
    tenant = await db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="المستأجر غير موجود")

    wallet = await get_or_create_wallet(main_db, tenant_id, "tenant")
    recent_txns = await main_db.wallet_transactions.find(
        {"entity_id": tenant_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(20).to_list(20)

    return {
        "wallet": wallet,
        "transactions": recent_txns,
    }


@router.post("/saas/tenants/{tenant_id}/extend-subscription")
async def extend_subscription(tenant_id: str, payment: SubscriptionPayment, admin: dict = Depends(get_super_admin)):
    tenant = await db.saas_tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    current_end = datetime.fromisoformat(tenant.get("subscription_ends_at", datetime.now(timezone.utc).isoformat()).replace('Z', '+00:00'))
    now = datetime.now(timezone.utc)
    start_date = max(current_end, now)

    if payment.subscription_type == "monthly":
        new_end = start_date + timedelta(days=30)
    elif payment.subscription_type == "6months":
        new_end = start_date + timedelta(days=180)
    else:
        new_end = start_date + timedelta(days=365)

    await db.saas_tenants.update_one({"id": tenant_id}, {"$set": {
        "subscription_type": payment.subscription_type,
        "subscription_ends_at": new_end.isoformat(),
        "is_active": True,
        "is_trial": False
    }})

    payment_doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "tenant_name": tenant.get("name", ""),
        "amount": payment.amount,
        "payment_method": payment.payment_method,
        "subscription_type": payment.subscription_type,
        "period_start": start_date.isoformat(),
        "period_end": new_end.isoformat(),
        "notes": payment.notes or "",
        "transaction_id": payment.transaction_id or "",
        "created_by": admin.get("id", ""),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.saas_payments.insert_one(payment_doc)

    return {"new_subscription_ends_at": new_end.isoformat()}
