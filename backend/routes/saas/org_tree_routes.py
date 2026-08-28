"""p345: Org tree — super-admin → agents → subscribers with effective modules.

- GET /api/saas/org-tree
      Full hierarchy: agents (level, parent, permissions) and tenants with their
      effective feature gates + the source of each value (plan | override |
      default). One request feeds the whole tree page.
- PUT /api/saas/agent/my-tenants/{tenant_id}/features/{gate}
      Delegated toggle: an agent with permissions.can_toggle_features may flip
      one gate for a tenant assigned to him (directly or via a sub-agent when
      can_manage_tenants). Every change is audit-logged and the effective-
      features cache is invalidated instantly.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from config.database import main_db
from core.business_profiles import OPT_IN_GATES, invalidate_features_cache
from core import modules_map
from .helpers import get_super_admin, get_current_agent

router = APIRouter(tags=["Org Tree"])


def _effective_gates(plan: dict, tenant: dict) -> dict:
    """gate → {value, source: plan|override|default}"""
    plan_features = plan.get("features") or {}
    overrides = tenant.get("features_override") or {}
    out = {}
    for g in modules_map.gates_catalog():
        gate = g["gate"]
        if gate in overrides:
            out[gate] = {"value": bool(overrides[gate]), "source": "override"}
        elif gate in plan_features:
            v = plan_features[gate]
            if isinstance(v, dict):
                v = v.get("enabled", True)
            out[gate] = {"value": bool(v), "source": "plan"}
        else:
            out[gate] = {"value": gate not in OPT_IN_GATES, "source": "default"}
    return out


@router.get("/saas/org-tree")
async def get_org_tree(admin: dict = Depends(get_super_admin)):
    plans = await main_db.saas_plans.find({}, {"_id": 0, "id": 1, "name": 1, "name_ar": 1, "features": 1}).to_list(100)
    plans_map = {p["id"]: p for p in plans}

    agents = await main_db.saas_agents.find(
        {}, {"_id": 0, "id": 1, "name": 1, "agent_code": 1, "level": 1, "level_id": 1,
             "parent_agent_id": 1, "permissions": 1, "is_active": 1, "email": 1}
    ).to_list(500)

    tenants = await main_db.saas_tenants.find(
        {}, {"_id": 0, "id": 1, "name": 1, "short_id": 1, "company_name": 1, "agent_id": 1,
             "plan_id": 1, "business_type": 1, "is_active": 1, "features_override": 1}
    ).to_list(2000)

    agent_ids = {a["id"] for a in agents}
    tree_tenants = []
    for t in tenants:
        plan = plans_map.get(t.get("plan_id")) or {}
        tree_tenants.append({
            "id": t["id"],
            "name": t.get("name", ""),
            "short_id": t.get("short_id", ""),
            "company_name": t.get("company_name", ""),
            "agent_id": t.get("agent_id"),
            "plan_id": t.get("plan_id"),
            "plan_name": (plan.get("name_ar") or plan.get("name") or "") if plan else "",
            "business_type": t.get("business_type", ""),
            "is_active": t.get("is_active", True),
            "gates": _effective_gates(plan, t),
        })

    # tenant count per agent (direct)
    counts = {}
    for t in tenants:
        aid = t.get("agent_id")
        if aid in agent_ids:
            counts[aid] = counts.get(aid, 0) + 1
    tree_agents = [{
        "id": a["id"],
        "name": a.get("name", ""),
        "agent_code": a.get("agent_code", ""),
        "level": a.get("level"),
        "level_id": a.get("level_id"),
        "parent_agent_id": a.get("parent_agent_id"),
        "permissions": a.get("permissions", {}),
        "is_active": a.get("is_active", True),
        "tenant_count": counts.get(a["id"], 0),
    } for a in agents]

    return {
        "agents": tree_agents,
        "tenants": tree_tenants,
        "gates": modules_map.gates_catalog(),
        "opt_in_gates": list(OPT_IN_GATES),
        "unassigned_tenants": len([t for t in tenants if t.get("agent_id") not in agent_ids]),
    }


@router.put("/saas/agent/my-tenants/{tenant_id}/features/{gate}")
async def agent_toggle_feature(tenant_id: str, gate: str, body: dict,
                               agent: dict = Depends(get_current_agent)):
    """Delegated per-gate toggle for agents (requires can_toggle_features)."""
    perms = agent.get("permissions") or {}
    if not perms.get("can_toggle_features"):
        raise HTTPException(status_code=403, detail="غير مسموح لك بتعديل ميزات المشتركين")

    gate_keys = {g["gate"] for g in modules_map.gates_catalog()}
    if gate not in gate_keys:
        raise HTTPException(status_code=400, detail="ميزة غير معروفة")

    tenant = await main_db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0, "id": 1, "agent_id": 1})
    if not tenant:
        raise HTTPException(status_code=404, detail="المشترك غير موجود")

    owns = tenant.get("agent_id") == agent["id"]
    if not owns and perms.get("can_manage_tenants"):
        sub_ids = {
            a["id"] for a in await main_db.saas_agents.find(
                {"parent_agent_id": agent["id"]}, {"_id": 0, "id": 1}
            ).to_list(100)
        }
        owns = tenant.get("agent_id") in sub_ids
    if not owns:
        raise HTTPException(status_code=403, detail="هذا المشترك ليس ضمن نطاقك")

    value = body.get("value")
    if value is None:
        await main_db.saas_tenants.update_one(
            {"id": tenant_id}, {"$unset": {f"features_override.{gate}": ""}}
        )
    else:
        await main_db.saas_tenants.update_one(
            {"id": tenant_id}, {"$set": {f"features_override.{gate}": bool(value)}}
        )
    await invalidate_features_cache(tenant_id)

    await main_db.audit_log.insert_one({
        "at": datetime.now(timezone.utc).isoformat(),
        "actor": f"agent:{agent['id']}",
        "action": "agent_toggle_feature",
        "tenant_id": tenant_id, "gate": gate, "value": value,
    })
    return {"tenant_id": tenant_id, "gate": gate, "value": value}
