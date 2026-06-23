"""SaaS Plans Routes - Subscription plans CRUD"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime, timezone
import uuid

from config.database import db
from .schemas import PlanCreate, PlanUpdate, PlanResponse
from .helpers import get_super_admin

router = APIRouter(tags=["SaaS Plans"])


@router.get("/saas/plans", response_model=List[PlanResponse])
async def get_plans(include_inactive: bool = False):
    query = {} if include_inactive else {"is_active": True}
    plans = await db.saas_plans.find(query, {"_id": 0}).sort("sort_order", 1).to_list(100)
    return [PlanResponse(**p) for p in plans]


@router.get("/saas/plans/public")
async def get_public_plans():
    plans = await db.saas_plans.find({"is_active": True}, {"_id": 0}).sort("sort_order", 1).to_list(100)
    return plans


@router.get("/saas/plans/{plan_id}", response_model=PlanResponse)
async def get_plan(plan_id: str):
    plan = await db.saas_plans.find_one({"id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return PlanResponse(**plan)


@router.post("/saas/plans", response_model=PlanResponse)
async def create_plan(plan: PlanCreate, admin: dict = Depends(get_super_admin)):
    plan_doc = {
        "id": str(uuid.uuid4()),
        **plan.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.saas_plans.insert_one(plan_doc)
    return PlanResponse(**{k: v for k, v in plan_doc.items() if k != "_id"})


@router.put("/saas/plans/{plan_id}", response_model=PlanResponse)
async def update_plan(plan_id: str, updates: PlanUpdate, admin: dict = Depends(get_super_admin)):
    plan = await db.saas_plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.saas_plans.update_one({"id": plan_id}, {"$set": update_data})
    updated = await db.saas_plans.find_one({"id": plan_id}, {"_id": 0})
    return PlanResponse(**updated)


@router.delete("/saas/plans/{plan_id}")
async def delete_plan(plan_id: str, admin: dict = Depends(get_super_admin)):
    result = await db.saas_plans.delete_one({"id": plan_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Plan not found")
    return {"message": "Plan deleted successfully"}
