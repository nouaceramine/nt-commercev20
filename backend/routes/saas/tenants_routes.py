"""SaaS Tenants Routes - Tenant management CRUD"""
from fastapi import APIRouter, HTTPException, Depends, Request
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import uuid
import json
import bcrypt
import ipaddress
import os
import socket
import httpx
import logging
from urllib.parse import urlparse
from utils.auth import email_ci

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

from config.database import db, main_db, client, init_tenant_database, get_tenant_db
from services.tenant_template import copy_template_to_tenant
from .schemas import TenantCreate, TenantUpdate, TenantResponse, SubscriptionPayment
from .helpers import get_super_admin, create_access_token, next_tenant_short_id
from services.wallet_service import credit_wallet, get_or_create_wallet

router = APIRouter(tags=["SaaS Tenants"])

# Supported feature keys for per-tenant overrides.
# `ecommerce_hub` gates the unified E-Commerce Hub (multi-channel orders inbox,
# channels CRUD, shipping labels, AI insights). Disabled by default at the tenant
# level — super admin must manually enable it via the Subscribers → feature flags dialog.
SUPPORTED_FEATURES = {
    "pos", "inventory", "customers", "recharge", "iptv", "maintenance",
    "wallet", "commission", "reports", "backup", "ai_bots", "barcode",
    "thermal_print", "credit_sales", "loyalty_points",
    "ecommerce_hub",
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
async def impersonate_tenant(tenant_id: str, request: Request, admin: dict = Depends(get_super_admin)):
    tenant = await main_db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="المشترك غير موجود")
    if not tenant.get("is_active"):
        raise HTTPException(status_code=400, detail="حساب المشترك معطل")

    # Make sure the tenant DB exists (lazy init like the unified-login flow).
    tenant_db = get_tenant_db(tenant_id)
    if not tenant.get("database_initialized", False):
        try:
            await copy_template_to_tenant(tenant_id)
            tenant_db = get_tenant_db(tenant_id)
        except Exception as _tpl_err:
            print(f"[TENANT] template copy failed, legacy seeding: {_tpl_err}")
            tenant_db = await init_tenant_database(tenant_id)
        await main_db.saas_tenants.update_one(
            {"id": tenant_id},
            {"$set": {
                "database_initialized": True,
                "first_login_at": datetime.now(timezone.utc).isoformat(),
            }},
        )

    # Resolve a *real* user inside the tenant DB so /auth/me can look it up.
    tenant_user = await tenant_db.users.find_one(
        {"email": tenant["email"]}, {"_id": 0, "id": 1, "role": 1, "name": 1}
    )
    if not tenant_user:
        tenant_user = await tenant_db.users.find_one(
            {"role": "admin"}, {"_id": 0, "id": 1, "role": 1, "name": 1}
        )
    if not tenant_user:
        # Last resort: create an admin user from the tenant record so impersonation can proceed.
        new_uid = str(uuid.uuid4())
        await tenant_db.users.insert_one({
            "id": new_uid,
            "name": tenant.get("name", tenant["email"]),
            "email": tenant["email"],
            "hashed_password": tenant.get("hashed_password", ""),
            "role": "admin",
            "permissions": {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        tenant_user = {"id": new_uid, "role": "admin", "name": tenant.get("name", "")}

    actual_user_id = tenant_user["id"]

    access_token = create_access_token({
        "sub": actual_user_id,           # <-- real user id in tenant_db.users
        "email": tenant["email"],
        "role": "tenant_admin",          # match the regular tenant login role
        "type": "tenant",
        "tenant_id": tenant_id,
        "impersonated_by": admin.get("id"),
    })

    plan = await db.saas_plans.find_one({"id": tenant.get("plan_id")}, {"_id": 0})
    features = {**(plan.get("features") or {}), **(tenant.get("features_override") or {})} if plan else {}
    # ── Opt-in features default OFF when neither plan nor tenant set them ──
    for opt_key in ("ecommerce_hub",):
        if opt_key not in features:
            features[opt_key] = False
    limits = {**(plan.get("limits") or {}), **(tenant.get("limits_override") or {})} if plan else {}

    # ── Impersonation Audit Log ──
    # Record who, when, where (IP), and on which tenant. The "stopped_at" + "duration_seconds"
    # are filled later by POST /saas/impersonate/{session_id}/stop or fall back to "open".
    client_host = (request.client.host if request.client else None) or "unknown"
    forwarded = request.headers.get("x-forwarded-for") or request.headers.get("x-real-ip")
    if forwarded:
        client_host = forwarded.split(",")[0].strip()
    session_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc).isoformat()
    log_doc = {
        "id": session_id,
        "tenant_id": tenant_id,
        "tenant_name": tenant.get("name", ""),
        "tenant_email": tenant.get("email", ""),
        "admin_id": admin.get("id"),
        "admin_email": admin.get("email", ""),
        "admin_name": admin.get("name", ""),
        "ip": client_host,
        "user_agent": request.headers.get("user-agent", "")[:300],
        "started_at": started_at,
        "stopped_at": None,
        "duration_seconds": None,
        "status": "active",
    }
    await main_db.impersonation_logs.insert_one(log_doc)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "email": tenant["email"],
        "name": tenant.get("name", ""),
        "company_name": tenant.get("company_name", ""),
        "tenant_id": tenant_id,
        "impersonation_session_id": session_id,
        "user_type": "tenant",
        "user": {
            "id": actual_user_id,
            "email": tenant["email"],
            "name": tenant.get("name", ""),
            "role": "tenant_admin",
            "user_type": "tenant",
            "tenant_id": tenant_id,
            "company_name": tenant.get("company_name", ""),
            "database_name": f"tenant_{tenant_id.replace('-', '_')}",
            "features": features,
            "limits": limits,
        },
    }


@router.post("/saas/impersonate/{session_id}/stop")
async def stop_impersonation(session_id: str, admin: dict = Depends(get_super_admin)):
    """Close an impersonation audit-log entry. Idempotent."""
    log = await main_db.impersonation_logs.find_one({"id": session_id}, {"_id": 0})
    if not log:
        raise HTTPException(status_code=404, detail="جلسة الانتحال غير موجودة")
    if log.get("status") == "closed":
        return {"ok": True, "already_closed": True}
    stopped_at = datetime.now(timezone.utc)
    try:
        started_dt = datetime.fromisoformat(log["started_at"].replace("Z", "+00:00"))
        duration = max(0, int((stopped_at - started_dt).total_seconds()))
    except Exception:
        duration = None
    await main_db.impersonation_logs.update_one(
        {"id": session_id},
        {"$set": {
            "stopped_at": stopped_at.isoformat(),
            "duration_seconds": duration,
            "status": "closed",
        }},
    )
    return {"ok": True, "duration_seconds": duration}


@router.get("/saas/impersonation-logs")
async def list_impersonation_logs(
    limit: int = 100,
    tenant_id: Optional[str] = None,
    admin_id: Optional[str] = None,
    admin: dict = Depends(get_super_admin),
):
    """List impersonation audit-log entries (most recent first). Super-admin only."""
    query: dict = {}
    if tenant_id:
        query["tenant_id"] = tenant_id
    if admin_id:
        query["admin_id"] = admin_id
    cursor = (
        main_db.impersonation_logs.find(query, {"_id": 0})
        .sort("started_at", -1)
        .limit(max(1, min(limit, 500)))
    )
    rows = await cursor.to_list(length=max(1, min(limit, 500)))
    active = await main_db.impersonation_logs.count_documents({"status": "active"})
    return {"total_active": active, "items": rows}


@router.post("/saas/tenants", response_model=TenantResponse)
async def create_tenant(tenant: TenantCreate, admin: dict = Depends(get_super_admin)):
    # Platform-wide cap (MAX_TENANTS env, 0 = unlimited). Applies even when
    # super-admin creates the tenant — easier policy enforcement.
    try:
        cap = int(os.environ.get("MAX_TENANTS", "0") or 0)
    except ValueError:
        cap = 0
    if cap > 0:
        current = await db.saas_tenants.count_documents({})
        if current >= cap:
            raise HTTPException(
                status_code=400,
                detail=f"تم بلوغ الحدّ الأقصى للمستأجرين على المنصّة ({cap}).",
            )

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
        "short_id": await next_tenant_short_id(),
        "database_initialized": False,
        "recharge_mode": "owner_bridge",
        "self_bridge_url": "",
        "self_bridge_api_key": "",
        "created_at": now.isoformat()
    }

    await db.saas_tenants.insert_one(tenant_doc)
    try:
        await copy_template_to_tenant(tenant_id)
    except Exception as _tpl_err:
        print(f"[TENANT] template re-init failed, legacy seeding: {_tpl_err}")
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
                    "monthly": plan.get("monthly_price", plan.get("price_monthly", 0)) or 0,
                    "6months": plan.get("six_month_price", plan.get("price_6months", 0)) or 0,
                    "yearly": plan.get("yearly_price", plan.get("price_yearly", 0)) or 0,
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
    # `ecommerce_hub` is opt-in (default disabled): super admin must explicitly toggle it on per tenant.
    OPT_IN_FEATURES = {"ecommerce_hub"}
    plan_defaults: dict = {}
    for key in SUPPORTED_FEATURES:
        val = plan_features_raw.get(key)
        if isinstance(val, dict):
            plan_defaults[key] = bool(val.get("enabled", key not in OPT_IN_FEATURES))
        elif isinstance(val, bool):
            plan_defaults[key] = val
        else:
            # default: enabled when plan has no opinion, except for opt-in features
            plan_defaults[key] = key not in OPT_IN_FEATURES

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


# Collections that must NEVER be bulk-cleaned by tenant_id during cascade delete
_CASCADE_EXCLUDE = {"saas_tenants", "saas_plans", "users", "agent_commissions"}


async def _cascade_delete_tenant(tenant: dict, admin: dict) -> dict:
    """Full cascade delete (p32): archive tenant DB to JSON, drop it, remove the
    hijack-class main user sharing the tenant email, clean every tenant_id
    reference in platform collections, reverse in-window pending commissions,
    and write an audit log entry. Returns a per-step report."""
    from config.database import client, main_db

    tenant_id = tenant["id"]
    email = (tenant.get("email") or "").strip()
    db_name = f"tenant_{tenant_id.replace('-', '_')}"
    now = datetime.now(timezone.utc)
    ts = now.strftime("%Y%m%d_%H%M%S")
    steps = {}

    # 1) Archive tenant DB to JSON files (volume-mounted /backups)
    tenant_db = client[db_name]
    cols = await tenant_db.list_collection_names()
    cols = [c for c in cols if not c.startswith("system.")]
    if cols:
        archive_dir = f"/backups/tenant_delete_{tenant_id}_{ts}"
        os.makedirs(archive_dir, exist_ok=True)
        total_docs = 0
        for col in cols:
            try:
                docs = await tenant_db[col].find({}).to_list(None)
            except Exception as exc:
                logger.warning(f"cascade archive skip {col}: {exc}")
                continue
            total_docs += len(docs)
            if docs:
                with open(f"{archive_dir}/{col}.json", "w", encoding="utf-8") as f:
                    f.write(json.dumps(docs, default=str, ensure_ascii=False))
        steps["archive"] = {"dir": archive_dir, "collections": len(cols), "docs": total_docs}
    else:
        steps["archive"] = {"skipped": "tenant db empty or missing"}

    # 2) Drop the tenant database
    await client.drop_database(db_name)
    steps["drop_db"] = db_name

    # 3) Delete main-DB users owning the same email (the p30 login-hijack class)
    if email:
        res = await main_db.users.delete_many({"email": email_ci(email)})
        steps["main_users_deleted"] = res.deleted_count

    # 4) Reverse PENDING commissions still inside the 7-day chargeback window.
    #    AVAILABLE commissions are earned agent income and must NOT be touched.
    now_iso = now.isoformat()
    comm = await main_db.agent_commissions.update_many(
        {"tenant_id": tenant_id, "status": "pending", "chargeback_until": {"$gt": now_iso}},
        {"$set": {"status": "reversed", "updated_at": now_iso}},
    )
    steps["commissions_reversed"] = comm.modified_count

    # 5) Clean tenant_id references across platform collections (dynamic scan —
    #    catches any collection, present or future, that carries tenant_id)
    cleaned = {}
    for col in await main_db.list_collection_names():
        if col in _CASCADE_EXCLUDE or col.startswith("system."):
            continue
        try:
            r = await main_db[col].delete_many({"tenant_id": tenant_id})
            if r.deleted_count:
                cleaned[col] = r.deleted_count
        except Exception as exc:
            logger.warning(f"cascade clean skip {col}: {exc}")
    steps["refs_cleaned"] = cleaned

    # 6) Remove the tenant record itself
    await main_db.saas_tenants.delete_one({"id": tenant_id})
    steps["tenant_record_deleted"] = True

    # 7) Audit log
    await main_db.platform_audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "action": "tenant_cascade_delete",
        "tenant_id": tenant_id,
        "tenant_email": email,
        "performed_by": admin.get("email") or admin.get("id"),
        "at": now_iso,
        "report": steps,
    })
    return {"tenant_id": tenant_id, "db_name": db_name, "steps": steps}


@router.delete("/saas/tenants/{tenant_id}")
async def delete_tenant(tenant_id: str, admin: dict = Depends(get_super_admin)):
    tenant = await db.saas_tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    report = await _cascade_delete_tenant(tenant, admin)
    return {"message": "تم حذف المستأجر وكل بياناته المرتبطة بنجاح", "report": report}


@router.post("/saas/restore-test")
async def restore_test_run(admin: dict = Depends(get_super_admin)):
    from services.restore_test import run_restore_test, enforce_archive_retention
    report = await run_restore_test()
    report["retention"] = enforce_archive_retention(keep=5)
    return report


@router.get("/saas/restore-test/latest")
async def restore_test_latest(admin: dict = Depends(get_super_admin)):
    from services.restore_test import latest_restore_test
    return await latest_restore_test() or {"message": "no restore test yet"}


@router.get("/saas/migrations/status")
async def migrations_status(admin: dict = Depends(get_super_admin)):
    from services.migrations_runner import status
    return await status()


@router.post("/saas/migrations/run")
async def migrations_run(admin: dict = Depends(get_super_admin)):
    from services.migrations_runner import run_migrations
    return await run_migrations()


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


# ============ Golden Template management (p31) ============
from services.tenant_template import (
    build_template as _tpl_build,
    copy_template_to_tenant as _tpl_copy,
    doctor_tenant as _tpl_doctor,
    doctor_all as _tpl_doctor_all,
    TEMPLATE_DB_NAME,
)


@router.get("/saas/template/info")
async def template_info(admin: dict = Depends(get_super_admin)):
    tpl = client[TEMPLATE_DB_NAME]
    cols = await tpl.list_collection_names()
    nidx = 0
    for c in cols:
        async for i in tpl[c].list_indexes():
            if i["name"] != "_id_":
                nidx += 1
    settings = await tpl.settings.find_one({"id": "general"}, {"_id": 0})
    return {
        "database": TEMPLATE_DB_NAME,
        "collections": len(cols),
        "indexes": nidx,
        "template_version": (settings or {}).get("template_version"),
        "built_at": (settings or {}).get("built_at"),
    }


@router.post("/saas/template/rebuild")
async def template_rebuild(admin: dict = Depends(get_super_admin)):
    return await _tpl_build()


@router.get("/saas/template/doctor/{tenant_id}")
async def template_doctor_one(tenant_id: str, fix: bool = False, admin: dict = Depends(get_super_admin)):
    return await _tpl_doctor(tenant_id, fix=fix)


@router.get("/saas/template/doctor-all")
async def template_doctor_all(fix: bool = False, admin: dict = Depends(get_super_admin)):
    return await _tpl_doctor_all(fix=fix)
