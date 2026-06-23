"""SaaS Agents Routes - Agent/Reseller CRUD + permissions"""
from fastapi import APIRouter, HTTPException, Depends, Body
from typing import List
from datetime import datetime, timezone
import uuid
import bcrypt

from config.database import db
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
    existing = await db.saas_agents.find_one({"email": agent.email})
    if existing:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم بالفعل")

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
        "email": agent.email,
        "password": hashed_password,
        "phone": agent.phone or "",
        "agent_type": agent.agent_type,
        "commission_rate": agent.commission_rate,
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

    await db.saas_agents.insert_one(agent_doc)
    return AgentResponse(**{k: v for k, v in agent_doc.items() if k not in ["_id", "password"]}, tenants_count=0)


@router.put("/saas/agents/{agent_id}", response_model=AgentResponse)
async def update_agent(agent_id: str, updates: AgentUpdate, admin: dict = Depends(get_super_admin)):
    agent = await db.saas_agents.find_one({"id": agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.saas_agents.update_one({"id": agent_id}, {"$set": update_data})
    updated = await db.saas_agents.find_one({"id": agent_id}, {"_id": 0})
    tenants_count = await db.saas_tenants.count_documents({"agent_id": agent_id})

    return AgentResponse(**{k: v for k, v in updated.items() if k != "password"}, tenants_count=tenants_count)


@router.delete("/saas/agents/{agent_id}")
async def delete_agent(agent_id: str, admin: dict = Depends(get_super_admin)):
    result = await db.saas_agents.delete_one({"id": agent_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Agent not found")
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
        tenant_name = tenant.get("name", "") if tenant else ""

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

    await db.saas_agent_transactions.insert_one(transaction_doc)

    if transaction.type == "commission":
        await db.saas_agents.update_one({"id": agent_id}, {
            "$inc": {"total_earnings": transaction.amount, "pending_earnings": transaction.amount}
        })
    elif transaction.type == "payout":
        await db.saas_agents.update_one({"id": agent_id}, {
            "$inc": {"pending_earnings": -transaction.amount, "paid_earnings": transaction.amount}
        })

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
    for tid in tenant_ids:
        t = await db.saas_tenants.find_one({"id": tid})
        if not t:
            raise HTTPException(status_code=404, detail=f"المستأجر {tid} غير موجود")
    await db.saas_agents.update_one({"id": agent_id}, {"$set": {"assigned_tenant_ids": tenant_ids, "updated_at": datetime.now(timezone.utc).isoformat()}})
    for tid in tenant_ids:
        await db.saas_tenants.update_one({"id": tid}, {"$set": {"agent_id": agent_id}})
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
