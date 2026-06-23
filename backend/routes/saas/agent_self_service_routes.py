"""SaaS Agent Self-Service Routes - Agent portal + login"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone, timedelta
import uuid
import bcrypt

from config.database import db
from .schemas import TenantCreate, AgentLoginRequest
from .helpers import get_current_agent, create_access_token
from services.wallet_service import get_or_create_wallet, transfer_balance, DEFAULT_LOW_BALANCE, enrich_transfers
from typing import Optional

COMMISSION_CHARGEBACK_DAYS = 7


async def _create_agent_commission(agent: dict, tenant_id: str, tenant_name: str, plan: dict, subscription_type: str):
    """Create a PENDING commission record for an agent when they enroll a new tenant."""
    try:
        _rate = plan.get("commission_rate")
        plan_commission_rate = 10.0 if _rate is None else float(_rate)
        commission_fixed = agent.get("commission_fixed", 0) or 0
        price_map = {"monthly": plan.get("price_monthly", 0), "6months": plan.get("price_6months", 0), "yearly": plan.get("price_yearly", 0)}
        subscription_price = price_map.get(subscription_type, plan.get("price_monthly", 0)) or 0
        amount = (subscription_price * plan_commission_rate / 100) + commission_fixed
        if amount <= 0:
            return
        now = datetime.now(timezone.utc)
        rec = {
            "id": str(uuid.uuid4()),
            "agent_id": agent["id"],
            "tenant_id": tenant_id,
            "tenant_name": tenant_name,
            "amount": amount,
            "status": "pending",
            "chargeback_until": (now + timedelta(days=COMMISSION_CHARGEBACK_DAYS)).isoformat(),
            "plan_name": plan.get("name_ar") or plan.get("name") or "",
            "commission_rate": plan_commission_rate,
            "commission_fixed": commission_fixed,
            "subscription_type": subscription_type,
            "note": f"عمولة اشتراك {subscription_type} — {plan_commission_rate}% (سعر الخطة) + {commission_fixed} ثابت",
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        await db.agent_commissions.insert_one(rec)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(f"Failed to create commission record: {exc}")

router = APIRouter(tags=["SaaS Agent Self-Service"])


@router.get("/saas/agent/me")
async def get_agent_profile(agent: dict = Depends(get_current_agent)):
    tenants_count = await db.saas_tenants.count_documents({"agent_id": agent["id"]})
    assigned = agent.get("assigned_tenant_ids", [])
    if assigned:
        tenants_count = max(tenants_count, len(assigned))
    data = {k: v for k, v in agent.items() if k not in ["_id", "password"]}
    data["tenants_count"] = tenants_count
    return data


@router.get("/saas/agent/my-tenants")
async def get_my_tenants(agent: dict = Depends(get_current_agent)):
    perms = agent.get("permissions", {})
    if not perms.get("can_view_tenants", True):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية عرض المستأجرين")
    assigned_ids = agent.get("assigned_tenant_ids", [])
    query = {"$or": [{"agent_id": agent["id"]}]}
    if assigned_ids:
        query["$or"].append({"id": {"$in": assigned_ids}})
    tenants = await db.saas_tenants.find(query, {"_id": 0, "password": 0}).to_list(1000)
    return tenants


@router.get("/saas/agent/my-stats")
async def get_my_stats(agent: dict = Depends(get_current_agent)):
    agent_id = agent["id"]
    assigned_ids = agent.get("assigned_tenant_ids", [])
    query = {"$or": [{"agent_id": agent_id}]}
    if assigned_ids:
        query["$or"].append({"id": {"$in": assigned_ids}})
    tenants = await db.saas_tenants.find(query, {"_id": 0}).to_list(1000)
    active_tenants = [t for t in tenants if t.get("is_active")]

    txns = await db.saas_agent_transactions.find({"agent_id": agent_id}, {"_id": 0}).to_list(500)
    total_commissions = sum(t.get("amount", 0) for t in txns if t.get("type") == "commission")
    total_payouts = sum(t.get("amount", 0) for t in txns if t.get("type") == "payout")

    return {
        "total_tenants": len(tenants),
        "active_tenants": len(active_tenants),
        "total_commissions": total_commissions,
        "total_payouts": total_payouts,
        "pending_earnings": agent.get("pending_earnings", 0),
        "agent_type": agent.get("agent_type", "assistant"),
        "permissions": agent.get("permissions", {}),
    }


@router.post("/saas/agent/create-tenant")
async def agent_create_tenant(tenant: TenantCreate, agent: dict = Depends(get_current_agent)):
    perms = agent.get("permissions", {})
    if not perms.get("can_create_tenants", False):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية إنشاء مستأجرين")

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
        "agent_id": agent["id"],
        "is_active": True,
        "is_trial": True,
        "trial_ends_at": trial_ends_at.isoformat(),
        "subscription_type": tenant.subscription_type or "monthly",
        "subscription_starts_at": now.isoformat(),
        "features_override": {},
        "limits_override": {},
        "business_type": tenant.business_type or "retailer",
        "database_initialized": False,
        "created_at": now.isoformat()
    }

    await db.saas_tenants.insert_one(tenant_doc)
    await db.saas_agents.update_one(
        {"id": agent["id"]},
        {"$addToSet": {"assigned_tenant_ids": tenant_id}}
    )

    # Create a PENDING commission for this agent
    await _create_agent_commission(
        agent=agent,
        tenant_id=tenant_id,
        tenant_name=tenant.name,
        plan=plan,
        subscription_type=tenant.subscription_type or "monthly",
    )

    tenant_doc.pop("_id", None)
    tenant_doc.pop("password", None)
    return tenant_doc


@router.post("/saas/agent-login")
async def agent_login(login_data: AgentLoginRequest):
    agent = await db.saas_agents.find_one({"email": login_data.email})
    if not agent:
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")

    if not bcrypt.checkpw(login_data.password.encode('utf-8'), agent["password"].encode('utf-8')):
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")

    if not agent.get("is_active", True):
        raise HTTPException(status_code=403, detail="الحساب معطل")

    access_token = create_access_token({
        "sub": agent["id"],
        "email": agent["email"],
        "role": "agent",
        "type": "agent",
        "agent_type": agent.get("agent_type", "assistant"),
    })

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {k: v for k, v in agent.items() if k not in ["_id", "password"]}
    }


# ============================================================
# Distributor (agent) wallet — buys balance from صاحب النظام / parent agent
# and resells it to its own tenants (and sub-agents).
# Wallets live in the same platform store (db == main/platform db here).
# ============================================================

async def _agent_owns_request(agent: dict, req: dict) -> bool:
    """Whether this agent may approve the given top-up request."""
    if req.get("route_agent_id") == agent["id"]:
        return True
    if req.get("entity_type") == "tenant":
        t = await db.saas_tenants.find_one({"id": req["entity_id"]}, {"_id": 0, "agent_id": 1})
        if t and t.get("agent_id") == agent["id"]:
            return True
        if req["entity_id"] in agent.get("assigned_tenant_ids", []):
            return True
    return False


@router.get("/saas/agent/wallet")
async def get_agent_wallet(agent: dict = Depends(get_current_agent)):
    wallet = await get_or_create_wallet(db, agent["id"], "agent")
    threshold = wallet.get("low_balance_threshold", DEFAULT_LOW_BALANCE)
    wallet["low_balance_threshold"] = threshold
    wallet["low_balance"] = wallet.get("balance", 0) < threshold
    return wallet


@router.get("/saas/agent/wallet/transactions")
async def get_agent_wallet_transactions(limit: int = 100, agent: dict = Depends(get_current_agent)):
    wallet = await get_or_create_wallet(db, agent["id"], "agent")
    return await db.wallet_transactions.find(
        {"wallet_id": wallet["id"]}, {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)


@router.post("/saas/agent/wallet/request")
async def create_agent_wallet_request(data: dict, agent: dict = Depends(get_current_agent)):
    """Agent buys balance: requests a top-up from its parent agent (if any) or the super admin."""
    amount = float(data.get("amount", 0) or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون أكبر من صفر")
    await get_or_create_wallet(db, agent["id"], "agent")
    parent_id = agent.get("parent_agent_id") or ""
    req = {
        "id": str(uuid.uuid4()),
        "entity_id": agent["id"],
        "entity_type": "agent",
        "entity_name": agent.get("name") or agent.get("email", ""),
        "route_agent_id": parent_id,
        "request_type": "topup",
        "amount": amount,
        "method": data.get("method", ""),
        "note": data.get("note", ""),
        "status": "pending",
        "created_by": agent.get("name", agent.get("email", "")),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "processed_by": None,
        "processed_at": None,
    }
    await db.wallet_requests.insert_one(dict(req))
    req.pop("_id", None)
    return req


@router.get("/saas/agent/wallet/requests")
async def list_agent_wallet_requests(agent: dict = Depends(get_current_agent)):
    """The agent's own top-up requests plus pending requests routed to this agent for approval."""
    my_requests = await db.wallet_requests.find(
        {"entity_id": agent["id"], "entity_type": "agent"}, {"_id": 0}
    ).sort("created_at", -1).limit(200).to_list(200)
    to_approve = await db.wallet_requests.find(
        {"route_agent_id": agent["id"], "status": "pending"}, {"_id": 0}
    ).sort("created_at", -1).limit(200).to_list(200)
    return {"my_requests": my_requests, "to_approve": to_approve}


@router.post("/saas/agent/wallet/requests/{request_id}/approve")
async def agent_approve_wallet_request(request_id: str, agent: dict = Depends(get_current_agent)):
    """Agent sells balance: approve a tenant/sub-agent top-up by transferring from the agent's wallet."""
    # Validate ownership/type while still pending (read-only checks).
    req = await db.wallet_requests.find_one({"id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if req.get("status") != "pending":
        raise HTTPException(status_code=400, detail="تمت معالجة الطلب مسبقاً")
    if req.get("request_type") != "topup":
        raise HTTPException(status_code=400, detail="لا يمكن للموزّع معالجة هذا النوع من الطلبات")
    if not await _agent_owns_request(agent, req):
        raise HTTPException(status_code=403, detail="هذا الطلب ليس ضمن مستأجريك")
    # Atomically claim the request so two concurrent approvals can't both move money.
    req = await db.wallet_requests.find_one_and_update(
        {"id": request_id, "status": "pending"},
        {"$set": {"status": "processing"}},
        projection={"_id": 0},
    )
    if not req:
        raise HTTPException(status_code=400, detail="تمت معالجة الطلب مسبقاً")
    by_label = agent.get("name", agent.get("email", ""))
    try:
        result = await transfer_balance(
            db, agent["id"], req["entity_id"], req["amount"], "topup_request", request_id,
            req.get("note") or "شحن رصيد المحفظة", by_label,
            from_type="agent", to_type=req.get("entity_type", "tenant"),
            insufficient_message="رصيدك غير كافٍ لإتمام البيع، يرجى شحن محفظتك أولاً",
        )
    except Exception:
        await db.wallet_requests.update_one(
            {"id": request_id, "status": "processing"}, {"$set": {"status": "pending"}},
        )
        raise
    await db.wallet_requests.update_one({"id": request_id}, {"$set": {
        "status": "approved",
        "processed_by": by_label,
        "processed_at": datetime.now(timezone.utc).isoformat(),
    }})
    return {"message": "تمت الموافقة على الطلب", "new_balance": result["from_balance"]}


@router.get("/saas/agent/wallet/transfers")
async def agent_get_wallet_transfers(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    ref_type: Optional[str] = None,
    page: int = 1,
    page_size: int = 30,
    agent: dict = Depends(get_current_agent),
):
    """Paginated ledger of transfers involving this agent, their tenants, and sub-agents."""
    agent_id = agent["id"]
    # Collect all entity IDs this agent can see transfers for.
    tenant_ids = await db.saas_tenants.distinct("id", {"agent_id": agent_id})
    sub_agent_ids = await db.saas_agents.distinct("id", {"parent_agent_id": agent_id})
    all_ids = list({agent_id} | set(tenant_ids) | set(sub_agent_ids))
    query: dict = {"$or": [{"from_entity_id": {"$in": all_ids}}, {"to_entity_id": {"$in": all_ids}}]}
    if ref_type:
        query["reference_type"] = ref_type
    if from_date or to_date:
        dq: dict = {}
        if from_date:
            dq["$gte"] = from_date
        if to_date:
            dq["$lte"] = to_date + "T23:59:59"
        query["created_at"] = dq
    total = await db.wallet_transfers.count_documents(query)
    skip = max(0, (page - 1) * page_size)
    rows = await db.wallet_transfers.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)
    rows = await enrich_transfers(db, rows)
    return {
        "items": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.post("/saas/agent/wallet/requests/{request_id}/reject")
async def agent_reject_wallet_request(request_id: str, data: dict = None, agent: dict = Depends(get_current_agent)):
    req = await db.wallet_requests.find_one({"id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if req.get("status") != "pending":
        raise HTTPException(status_code=400, detail="تمت معالجة الطلب مسبقاً")
    if not await _agent_owns_request(agent, req):
        raise HTTPException(status_code=403, detail="هذا الطلب ليس ضمن مستأجريك")
    await db.wallet_requests.update_one({"id": request_id}, {"$set": {
        "status": "rejected",
        "reject_reason": (data or {}).get("reason", ""),
        "processed_by": agent.get("name", agent.get("email", "")),
        "processed_at": datetime.now(timezone.utc).isoformat(),
    }})
    return {"message": "تم رفض الطلب"}
