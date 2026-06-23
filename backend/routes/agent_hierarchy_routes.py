"""
Agent Hierarchy Routes - Multi-level agent/reseller system
Features:
- Agent levels (Master → Regional → Local)
- Parent-child agent relationships (tree)
- Commission cascading (parent earns % from sub-agent sales)
- Level-specific permissions
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)

# ============ MODELS ============

class AgentLevelCreate(BaseModel):
    name_ar: str
    name_fr: str
    level: int = Field(..., ge=1, le=10, description="1=highest, 10=lowest")
    commission_rate: float = Field(0, ge=0, le=100)
    cascade_commission_rate: float = Field(0, ge=0, le=50, description="% earned from sub-agent sales")
    permissions: dict = Field(default_factory=lambda: {
        "can_create_sub_agents": True,
        "can_manage_tenants": True,
        "can_view_reports": True,
        "can_collect_payments": True,
        "can_manage_plans": False,
        "can_set_prices": False,
        "max_sub_agents": 50,
        "max_tenants": 200,
    })

class AgentLevelUpdate(BaseModel):
    name_ar: Optional[str] = None
    name_fr: Optional[str] = None
    commission_rate: Optional[float] = None
    cascade_commission_rate: Optional[float] = None
    permissions: Optional[dict] = None

class AgentHierarchyUpdate(BaseModel):
    parent_agent_id: Optional[str] = None
    level_id: Optional[str] = None

class CommissionReport(BaseModel):
    agent_id: str
    period: str = "month"  # month, quarter, year


def create_agent_hierarchy_routes(db, get_super_admin) -> dict:
    router = APIRouter(prefix="/saas/hierarchy", tags=["Agent Hierarchy"])

    # ============ AGENT LEVELS ============

    @router.get("/levels")
    async def get_agent_levels(admin: dict = Depends(get_super_admin)):
        """Get all agent levels sorted by hierarchy"""
        levels = await db.agent_levels.find({}, {"_id": 0}).sort("level", 1).to_list(20)
        if not levels:
            # Seed default levels
            defaults = [
                {"id": str(uuid.uuid4()), "name_ar": "وكيل رئيسي", "name_fr": "Master Agent", "level": 1,
                 "commission_rate": 15, "cascade_commission_rate": 5,
                 "permissions": {"can_create_sub_agents": True, "can_manage_tenants": True, "can_view_reports": True,
                                 "can_collect_payments": True, "can_manage_plans": True, "can_set_prices": True,
                                 "max_sub_agents": 100, "max_tenants": 500},
                 "created_at": datetime.now(timezone.utc).isoformat()},
                {"id": str(uuid.uuid4()), "name_ar": "وكيل إقليمي", "name_fr": "Regional Agent", "level": 2,
                 "commission_rate": 10, "cascade_commission_rate": 3,
                 "permissions": {"can_create_sub_agents": True, "can_manage_tenants": True, "can_view_reports": True,
                                 "can_collect_payments": True, "can_manage_plans": False, "can_set_prices": False,
                                 "max_sub_agents": 30, "max_tenants": 200},
                 "created_at": datetime.now(timezone.utc).isoformat()},
                {"id": str(uuid.uuid4()), "name_ar": "وكيل محلي", "name_fr": "Local Agent", "level": 3,
                 "commission_rate": 7, "cascade_commission_rate": 0,
                 "permissions": {"can_create_sub_agents": False, "can_manage_tenants": True, "can_view_reports": True,
                                 "can_collect_payments": True, "can_manage_plans": False, "can_set_prices": False,
                                 "max_sub_agents": 0, "max_tenants": 50},
                 "created_at": datetime.now(timezone.utc).isoformat()},
            ]
            await db.agent_levels.insert_many(defaults)
            levels = defaults
        return levels

    @router.post("/levels")
    async def create_agent_level(level_data: AgentLevelCreate, admin: dict = Depends(get_super_admin)):
        """Create a new agent level"""
        doc = {
            "id": str(uuid.uuid4()),
            "name_ar": level_data.name_ar,
            "name_fr": level_data.name_fr,
            "level": level_data.level,
            "commission_rate": level_data.commission_rate,
            "cascade_commission_rate": level_data.cascade_commission_rate,
            "permissions": level_data.permissions,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.agent_levels.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.put("/levels/{level_id}")
    async def update_agent_level(level_id: str, updates: AgentLevelUpdate, admin: dict = Depends(get_super_admin)):
        """Update an agent level"""
        update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
        if not update_data:
            raise HTTPException(status_code=400, detail="No updates provided")
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = await db.agent_levels.update_one({"id": level_id}, {"$set": update_data})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Level not found")
        updated = await db.agent_levels.find_one({"id": level_id}, {"_id": 0})
        return updated

    @router.delete("/levels/{level_id}")
    async def delete_agent_level(level_id: str, admin: dict = Depends(get_super_admin)):
        """Delete an agent level"""
        agents_using = await db.saas_agents.count_documents({"level_id": level_id})
        if agents_using > 0:
            raise HTTPException(status_code=400, detail=f"Cannot delete: {agents_using} agents using this level")
        result = await db.agent_levels.delete_one({"id": level_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Level not found")
        return {"message": "Level deleted"}

    # ============ HIERARCHY MANAGEMENT ============

    @router.put("/agents/{agent_id}/assign")
    async def assign_agent_hierarchy(agent_id: str, data: AgentHierarchyUpdate, admin: dict = Depends(get_super_admin)):
        """Assign parent agent and/or level to an agent"""
        agent = await db.saas_agents.find_one({"id": agent_id})
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

        update = {"updated_at": datetime.now(timezone.utc).isoformat()}

        if data.parent_agent_id is not None:
            if data.parent_agent_id == agent_id:
                raise HTTPException(status_code=400, detail="Agent cannot be its own parent")
            if data.parent_agent_id:
                parent = await db.saas_agents.find_one({"id": data.parent_agent_id})
                if not parent:
                    raise HTTPException(status_code=404, detail="Parent agent not found")
                # Prevent circular hierarchy
                chain = [data.parent_agent_id]
                current = parent
                while current.get("parent_agent_id"):
                    if current["parent_agent_id"] == agent_id:
                        raise HTTPException(status_code=400, detail="Circular hierarchy detected")
                    chain.append(current["parent_agent_id"])
                    if len(chain) > 10:
                        break
                    current = await db.saas_agents.find_one({"id": current["parent_agent_id"]}) or {}
            update["parent_agent_id"] = data.parent_agent_id

        if data.level_id is not None:
            if data.level_id:
                level = await db.agent_levels.find_one({"id": data.level_id})
                if not level:
                    raise HTTPException(status_code=404, detail="Level not found")
            update["level_id"] = data.level_id

        await db.saas_agents.update_one({"id": agent_id}, {"$set": update})
        updated = await db.saas_agents.find_one({"id": agent_id}, {"_id": 0, "password": 0})
        return updated

    @router.get("/tree")
    async def get_hierarchy_tree(admin: dict = Depends(get_super_admin)):
        """Get full agent hierarchy as a tree"""
        agents = await db.saas_agents.find({}, {"_id": 0, "password": 0}).to_list(5000)
        levels = await db.agent_levels.find({}, {"_id": 0}).sort("level", 1).to_list(20)
        levels_map = {l["id"]: l for l in levels}

        # Build tree
        agents_map = {}
        for a in agents:
            a["children"] = []
            a["level_info"] = levels_map.get(a.get("level_id"), None)
            tenants_count = await db.saas_tenants.count_documents({"agent_id": a["id"]})
            a["tenants_count"] = tenants_count
            agents_map[a["id"]] = a

        roots = []
        for a in agents:
            parent_id = a.get("parent_agent_id")
            if parent_id and parent_id in agents_map:
                agents_map[parent_id]["children"].append(a)
            else:
                roots.append(a)

        return {"tree": roots, "levels": levels, "total_agents": len(agents)}

    # ============ COMMISSION MANAGEMENT ============

    @router.get("/agents/{agent_id}/commission-report")
    async def get_commission_report(agent_id: str, period: str = "month", admin: dict = Depends(get_super_admin)):
        """Get detailed commission report for an agent including cascade earnings"""
        agent = await db.saas_agents.find_one({"id": agent_id}, {"_id": 0, "password": 0})
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

        now = datetime.now(timezone.utc)
        if period == "month":
            start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        elif period == "quarter":
            quarter_month = ((now.month - 1) // 3) * 3 + 1
            start = now.replace(month=quarter_month, day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

        # Direct commissions
        direct_txns = await db.saas_agent_transactions.find({
            "agent_id": agent_id,
            "type": "commission",
            "created_at": {"$gte": start.isoformat()}
        }, {"_id": 0}).to_list(1000)

        # Cascade commissions (from sub-agents)
        cascade_txns = await db.saas_agent_transactions.find({
            "agent_id": agent_id,
            "type": "cascade_commission",
            "created_at": {"$gte": start.isoformat()}
        }, {"_id": 0}).to_list(1000)

        # Sub-agents
        sub_agents = await db.saas_agents.find(
            {"parent_agent_id": agent_id},
            {"_id": 0, "id": 1, "name": 1, "email": 1, "total_earnings": 1}
        ).to_list(500)

        direct_total = sum(t.get("amount", 0) for t in direct_txns)
        cascade_total = sum(t.get("amount", 0) for t in cascade_txns)

        return {
            "agent": agent,
            "period": period,
            "period_start": start.isoformat(),
            "direct_commissions": direct_total,
            "cascade_commissions": cascade_total,
            "total_commissions": direct_total + cascade_total,
            "direct_transactions": direct_txns[:50],
            "cascade_transactions": cascade_txns[:50],
            "sub_agents": sub_agents,
            "sub_agents_count": len(sub_agents)
        }

    @router.post("/process-cascade-commission")
    async def process_cascade_commission(
        agent_id: str = Query(...),
        sale_amount: float = Query(...),
        admin: dict = Depends(get_super_admin)
    ):
        """Process cascade commissions up the hierarchy when a tenant pays"""
        agent = await db.saas_agents.find_one({"id": agent_id})
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

        commissions = []
        current_agent = agent
        level = 0

        while current_agent and level < 5:
            level_info = None
            if current_agent.get("level_id"):
                level_info = await db.agent_levels.find_one({"id": current_agent["level_id"]}, {"_id": 0})

            if level == 0:
                # Direct commission
                rate = level_info["commission_rate"] if level_info else current_agent.get("commission_rate", 0)
                commission = sale_amount * rate / 100
                if commission > 0:
                    txn = {
                        "id": str(uuid.uuid4()),
                        "agent_id": current_agent["id"],
                        "type": "commission",
                        "amount": commission,
                        "sale_amount": sale_amount,
                        "rate": rate,
                        "level": level,
                        "notes": f"Direct commission: {rate}% of {sale_amount}",
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    await db.saas_agent_transactions.insert_one(txn)
                    await db.saas_agents.update_one(
                        {"id": current_agent["id"]},
                        {"$inc": {"total_earnings": commission, "pending_earnings": commission}}
                    )
                    commissions.append({"agent_id": current_agent["id"], "agent_name": current_agent["name"],
                                        "type": "direct", "rate": rate, "amount": commission})
            else:
                # Cascade commission
                cascade_rate = level_info["cascade_commission_rate"] if level_info else 0
                if cascade_rate > 0:
                    commission = sale_amount * cascade_rate / 100
                    txn = {
                        "id": str(uuid.uuid4()),
                        "agent_id": current_agent["id"],
                        "type": "cascade_commission",
                        "amount": commission,
                        "sale_amount": sale_amount,
                        "rate": cascade_rate,
                        "source_agent_id": agent_id,
                        "level": level,
                        "notes": f"Cascade L{level}: {cascade_rate}% of {sale_amount}",
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    await db.saas_agent_transactions.insert_one(txn)
                    await db.saas_agents.update_one(
                        {"id": current_agent["id"]},
                        {"$inc": {"total_earnings": commission, "pending_earnings": commission}}
                    )
                    commissions.append({"agent_id": current_agent["id"], "agent_name": current_agent["name"],
                                        "type": "cascade", "rate": cascade_rate, "amount": commission, "level": level})

            # Go up the hierarchy
            parent_id = current_agent.get("parent_agent_id")
            if not parent_id:
                break
            current_agent = await db.saas_agents.find_one({"id": parent_id})
            level += 1

        return {"commissions_processed": commissions, "total_distributed": sum(c["amount"] for c in commissions)}

    # ============ AGENT STATS ============

    @router.get("/stats")
    async def get_hierarchy_stats(admin: dict = Depends(get_super_admin)):
        """Get overall hierarchy statistics"""
        total_agents = await db.saas_agents.count_documents({})
        active_agents = await db.saas_agents.count_documents({"is_active": True})
        agents_with_parent = await db.saas_agents.count_documents({"parent_agent_id": {"$exists": True, "$ne": None, "$ne": ""}})
        levels = await db.agent_levels.find({}, {"_id": 0}).sort("level", 1).to_list(20)

        # Agents per level
        level_stats = []
        for lv in levels:
            count = await db.saas_agents.count_documents({"level_id": lv["id"]})
            level_stats.append({**lv, "agents_count": count})

        # Commission totals
        pipeline = [
            {"$group": {
                "_id": "$type",
                "total": {"$sum": "$amount"},
                "count": {"$sum": 1}
            }}
        ]
        commission_stats = await db.saas_agent_transactions.aggregate(pipeline).to_list(10)

        return {
            "total_agents": total_agents,
            "active_agents": active_agents,
            "agents_with_hierarchy": agents_with_parent,
            "unassigned_agents": total_agents - agents_with_parent,
            "levels": level_stats,
            "commission_breakdown": {s["_id"]: {"total": s["total"], "count": s["count"]} for s in commission_stats}
        }

    return router
