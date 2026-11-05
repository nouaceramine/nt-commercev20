"""SaaS Agents Routes - Agent/Reseller CRUD + permissions"""
from fastapi import APIRouter, HTTPException, Depends, Body
from typing import List
from datetime import datetime, timezone
import uuid
import bcrypt
from pymongo.errors import DuplicateKeyError, OperationFailure

from config.database import client, db
from .schemas import (
    AgentCreate, AgentUpdate, AgentResponse, AgentPermissions,
    AgentTransactionCreate, AgentTransactionResponse,
)
from .helpers import get_super_admin

router = APIRouter(tags=["SaaS Agents"])


@router.get("/saas/agents", response_model=List[AgentResponse])
async def get_agents(admin: dict = Depends(get_super_admin)):
    agents = await db.saas_agents.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    result = []
    for agent in agents:
        tenants_count = await db.saas_tenants.count_documents({"agent_id": agent["id"]})
        agent_data = {k: v for k, v in agent.items() if k != "password"}
        agent_data["tenants_count"] = tenants_count
        result.append(AgentResponse(**agent_data))
    return result


@router.get("/saas/agents/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: str, admin: dict = Depends(get_super_admin)):
    agent = await db.saas_agents.find_one({"id": agent_id}, {"_id": 0})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    tenants_count = await db.saas_tenants.count_documents({"agent_id": agent_id})
    agent_data = {k: v for k, v in agent.items() if k != "password"}
    agent_data["tenants_count"] = tenants_count
    return AgentResponse(**agent_data)


@router.post("/saas/agents", response_model=AgentResponse)
async def create_agent(agent: AgentCreate, admin: dict = Depends(get_super_admin)):
    from utils.auth import email_ci as _email_ci
    from utils.identity import assert_email_globally_free, remove_identity, reserve_identity
    agent_email = agent.email.strip().lower()
    existing = await db.saas_agents.find_one({"email": _email_ci(agent_email)})
    if existing:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم بالفعل")
    await assert_email_globally_free(agent_email)

    hashed_password = bcrypt.hashpw(agent.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    default_perms = AgentPermissions()
    if agent.agent_type == "reseller":
        default_perms.can_create_tenants = True
        default_perms.can_edit_tenants = True
        default_perms.can_collect_payments = True
        default_perms.can_edit_subscriptions = True
        default_perms.can_export_reports = True

    permissions = agent.permissions if agent.permissions else default_perms.model_dump()

    agent_doc = {
        "id": str(uuid.uuid4()),
        "name": agent.name,
        "email": agent_email,
        "password": hashed_password,
        "phone": agent.phone or "",
        "company_name": agent.company_name or "",
        "address": agent.address or "",
        "agent_type": agent.agent_type,
        "commission_rate": agent.commission_rate,
        "commission_fixed": agent.commission_fixed,
        "credit_limit": agent.credit_limit,
        "region": agent.region or "",
        "permissions": permissions,
        "assigned_tenant_ids": agent.assigned_tenant_ids or [],
        "total_earnings": 0,
        "pending_earnings": 0,
        "paid_earnings": 0,
        "notes": agent.notes or "",
        "is_active": agent.is_active,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    # p266: every agent gets an atomic public code (AG-0001, ...)
    from services.code_generator import public_order_code as _poc
    agent_doc["agent_code"] = await _poc(db, "saas_agents", "AG", 4, field="agent_code")

    # Reserve the global email before inserting the agent. The unique identity
    # claim closes the concurrent-create race; compensation prevents orphans.
    await reserve_identity(agent_email, "agent", agent_doc["id"], name=agent.name)
    try:
        await db.saas_agents.insert_one(agent_doc)
    except DuplicateKeyError:
        await remove_identity(user_id=agent_doc["id"])
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم بالفعل")
    except Exception:
        await remove_identity(user_id=agent_doc["id"])
        raise
    return AgentResponse(**{k: v for k, v in agent_doc.items() if k not in ["_id", "password"]}, tenants_count=0)


@router.put("/saas/agents/{agent_id}", response_model=AgentResponse)
async def update_agent(agent_id: str, updates: AgentUpdate, admin: dict = Depends(get_super_admin)):
    agent = await db.saas_agents.find_one({"id": agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    new_email = update_data.get("email")
    email_changed = bool(new_email and new_email != agent.get("email"))

    if not email_changed:
        await db.saas_agents.update_one({"id": agent_id}, {"$set": update_data})
    else:
        from utils.auth import email_ci
        from utils.identity import assert_email_globally_free, reserve_identity
        new_email = new_email.strip().lower()
        update_data["email"] = new_email
        existing = await db.saas_agents.find_one(
            {"id": {"$ne": agent_id}, "email": email_ci(new_email)}, {"_id": 0, "id": 1}
        )
        if existing:
            raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم بالفعل")
        await assert_email_globally_free(new_email, exclude_user_id=agent_id)
        await reserve_identity(new_email, "agent", agent_id,
                               name=update_data.get("name") or agent.get("name", ""))
        try:
            async with await client.start_session() as session:
                async with session.start_transaction():
                    result = await db.saas_agents.update_one(
                        {"id": agent_id}, {"$set": update_data}, session=session
                    )
                    if result.matched_count != 1:
                        raise HTTPException(status_code=404, detail="Agent not found")
                    await db.identity_registry.delete_one(
                        {"email": (agent.get("email") or "").strip().lower(),
                         "kind": "agent", "user_id": agent_id}, session=session
                    )
        except DuplicateKeyError:
            await db.identity_registry.delete_one(
                {"email": new_email, "kind": "agent", "user_id": agent_id}
            )
            raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم بالفعل")
        except Exception:
            await db.identity_registry.delete_one(
                {"email": new_email, "kind": "agent", "user_id": agent_id}
            )
            raise
    updated = await db.saas_agents.find_one({"id": agent_id}, {"_id": 0})
    tenants_count = await db.saas_tenants.count_documents({"agent_id": agent_id})

    return AgentResponse(**{k: v for k, v in updated.items() if k != "password"}, tenants_count=tenants_count)


@router.delete("/saas/agents/{agent_id}")
async def delete_agent(agent_id: str, admin: dict = Depends(get_super_admin)):
    result = await db.saas_agents.delete_one({"id": agent_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Agent not found")
    from utils.identity import remove_identity
    await remove_identity(user_id=agent_id)
    return {"message": "Agent deleted successfully"}


@router.get("/saas/agents/{agent_id}/transactions")
async def get_agent_transactions(agent_id: str, admin: dict = Depends(get_super_admin)):
    transactions = await db.saas_agent_transactions.find({"agent_id": agent_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return transactions


@router.post("/saas/agents/{agent_id}/transactions", response_model=AgentTransactionResponse)
async def create_agent_transaction(agent_id: str, transaction: AgentTransactionCreate, admin: dict = Depends(get_super_admin)):
    agent = await db.saas_agents.find_one({"id": agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    tenant_name = ""
    if transaction.tenant_id:
        tenant = await db.saas_tenants.find_one({"id": transaction.tenant_id}, {"_id": 0, "name": 1})
        if not tenant:
            raise HTTPException(status_code=404, detail="المستأجر غير موجود")
        tenant_name = tenant.get("name", "")

    transaction_doc = {
        "id": str(uuid.uuid4()),
        "agent_id": agent_id,
        "type": transaction.type,
        "amount": transaction.amount,
        "tenant_id": transaction.tenant_id,
        "tenant_name": tenant_name,
        "notes": transaction.notes or "",
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    # Ledger entry and balance movement commit together. A payout condition on
    # the current pending balance prevents both sequential and concurrent
    # over-payouts; transient write conflicts retry the whole transaction.
    for attempt in range(3):
        try:
            async with await client.start_session() as session:
                async with session.start_transaction():
                    await db.saas_agent_transactions.insert_one(transaction_doc, session=session)
                    if transaction.type == "commission":
                        result = await db.saas_agents.update_one(
                            {"id": agent_id},
                            {"$inc": {"total_earnings": transaction.amount,
                                      "pending_earnings": transaction.amount}},
                            session=session,
                        )
                        if result.matched_count != 1:
                            raise HTTPException(status_code=404, detail="Agent not found")
                    else:
                        result = await db.saas_agents.update_one(
                            {"id": agent_id, "pending_earnings": {"$gte": transaction.amount}},
                            {"$inc": {"pending_earnings": -transaction.amount,
                                      "paid_earnings": transaction.amount}},
                            session=session,
                        )
                        if result.matched_count != 1:
                            raise HTTPException(status_code=400, detail="الرصيد المعلق غير كافٍ")
            break
        except OperationFailure as exc:
            if exc.has_error_label("TransientTransactionError") and attempt < 2:
                import asyncio
                await asyncio.sleep(0.05 * (attempt + 1))
                continue
            raise

    return AgentTransactionResponse(**{k: v for k, v in transaction_doc.items() if k != "_id"})


@router.get("/saas/agents/{agent_id}/tenants")
async def get_agent_tenants(agent_id: str, admin: dict = Depends(get_super_admin)):
    agent = await db.saas_agents.find_one({"id": agent_id}, {"_id": 0})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    assigned_ids = agent.get("assigned_tenant_ids", [])
    query = {"$or": [{"agent_id": agent_id}]}
    if assigned_ids:
        query["$or"].append({"id": {"$in": assigned_ids}})
    tenants = await db.saas_tenants.find(query, {"_id": 0}).to_list(1000)
    return tenants


@router.get("/saas/agents/{agent_id}/permissions")
async def get_agent_permissions(agent_id: str, admin: dict = Depends(get_super_admin)):
    agent = await db.saas_agents.find_one({"id": agent_id}, {"_id": 0, "password": 0})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    defaults = AgentPermissions().model_dump()
    current = agent.get("permissions", {})
    merged = {**defaults, **current}
    return {"agent_id": agent_id, "agent_name": agent.get("name", ""), "permissions": merged}


@router.put("/saas/agents/{agent_id}/permissions")
async def update_agent_permissions(agent_id: str, permissions: dict = Body(...), admin: dict = Depends(get_super_admin)):
    agent = await db.saas_agents.find_one({"id": agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    valid_keys = set(AgentPermissions.model_fields.keys())
    filtered = {k: v for k, v in permissions.items() if k in valid_keys}
    await db.saas_agents.update_one({"id": agent_id}, {"$set": {"permissions": filtered, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "تم تحديث الصلاحيات بنجاح", "permissions": filtered}


@router.put("/saas/agents/{agent_id}/assign-tenants")
async def assign_tenants_to_agent(agent_id: str, tenant_ids: List[str] = Body(...), admin: dict = Depends(get_super_admin)):
    agent = await db.saas_agents.find_one({"id": agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    tenant_ids = list(dict.fromkeys(tenant_ids))
    for tid in tenant_ids:
        t = await db.saas_tenants.find_one({"id": tid}, {"_id": 0, "id": 1})
        if not t:
            raise HTTPException(status_code=404, detail=f"المستأجر {tid} غير موجود")
    async with await client.start_session() as session:
        async with session.start_transaction():
            # Remove stale reverse links, then establish the new bidirectional
            # assignment. Pull reassigned tenants from other agents' lists too.
            await db.saas_tenants.update_many(
                {"agent_id": agent_id, "id": {"$nin": tenant_ids}},
                {"$unset": {"agent_id": ""}}, session=session,
            )
            if tenant_ids:
                await db.saas_tenants.update_many(
                    {"id": {"$in": tenant_ids}}, {"$set": {"agent_id": agent_id}}, session=session,
                )
                await db.saas_agents.update_many(
                    {"id": {"$ne": agent_id}, "assigned_tenant_ids": {"$in": tenant_ids}},
                    {"$pull": {"assigned_tenant_ids": {"$in": tenant_ids}}}, session=session,
                )
            await db.saas_agents.update_one(
                {"id": agent_id},
                {"$set": {"assigned_tenant_ids": tenant_ids,
                          "updated_at": datetime.now(timezone.utc).isoformat()}},
                session=session,
            )
    return {"message": f"تم تعيين {len(tenant_ids)} مستأجر للوكيل", "assigned_tenant_ids": tenant_ids}


@router.get("/saas/permissions-template")
async def get_permissions_template(admin: dict = Depends(get_super_admin)):
    template = {
        "can_view_tenants": {"label_ar": "عرض المستأجرين", "label_fr": "Voir les locataires", "category": "tenants"},
        "can_create_tenants": {"label_ar": "إنشاء مستأجرين", "label_fr": "Creer des locataires", "category": "tenants"},
        "can_edit_tenants": {"label_ar": "تعديل المستأجرين", "label_fr": "Modifier les locataires", "category": "tenants"},
        "can_delete_tenants": {"label_ar": "حذف المستأجرين", "label_fr": "Supprimer les locataires", "category": "tenants"},
        "can_view_reports": {"label_ar": "عرض التقارير", "label_fr": "Voir les rapports", "category": "reports"},
        "can_export_reports": {"label_ar": "تصدير التقارير", "label_fr": "Exporter les rapports", "category": "reports"},
        "can_view_subscriptions": {"label_ar": "عرض الاشتراكات", "label_fr": "Voir les abonnements", "category": "subscriptions"},
        "can_edit_subscriptions": {"label_ar": "تعديل الاشتراكات", "label_fr": "Modifier les abonnements", "category": "subscriptions"},
        "can_manage_plans": {"label_ar": "إدارة الخطط", "label_fr": "Gerer les plans", "category": "subscriptions"},
        "can_view_payments": {"label_ar": "عرض المدفوعات", "label_fr": "Voir les paiements", "category": "payments"},
        "can_collect_payments": {"label_ar": "تحصيل المدفوعات", "label_fr": "Collecter les paiements", "category": "payments"},
        "can_manage_payouts": {"label_ar": "إدارة المسحوبات", "label_fr": "Gerer les retraits", "category": "payments"},
        "can_provide_support": {"label_ar": "تقديم الدعم الفني", "label_fr": "Fournir le support", "category": "support"},
        "can_create_sub_agents": {"label_ar": "إنشاء وكلاء فرعيين", "label_fr": "Creer des sous-agents", "category": "agents"},
        "can_manage_sub_agents": {"label_ar": "إدارة الوكلاء الفرعيين", "label_fr": "Gerer les sous-agents", "category": "agents"},
        "can_view_system_stats": {"label_ar": "عرض إحصائيات النظام", "label_fr": "Voir les stats systeme", "category": "system"},
        "can_manage_features": {"label_ar": "إدارة مميزات المستأجرين", "label_fr": "Gerer les fonctionnalites", "category": "system"},
    }
    categories = {
        "tenants": {"label_ar": "إدارة المستأجرين", "label_fr": "Gestion des locataires"},
        "reports": {"label_ar": "التقارير والإحصائيات", "label_fr": "Rapports et statistiques"},
        "subscriptions": {"label_ar": "الاشتراكات والخطط", "label_fr": "Abonnements et plans"},
        "payments": {"label_ar": "المدفوعات والفوترة", "label_fr": "Paiements et facturation"},
        "support": {"label_ar": "الدعم الفني", "label_fr": "Support technique"},
        "agents": {"label_ar": "إدارة الوكلاء", "label_fr": "Gestion des agents"},
        "system": {"label_ar": "النظام", "label_fr": "Systeme"},
    }
    return {"permissions": template, "categories": categories}
