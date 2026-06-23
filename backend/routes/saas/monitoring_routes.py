"""SaaS Monitoring Routes - Stats, finance reports, payments"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from config.database import db, client
from .schemas import SubscriptionPaymentResponse
from .helpers import get_super_admin

router = APIRouter(tags=["SaaS Monitoring"])


@router.get("/saas/monitoring")
async def get_monitoring_data(admin: dict = Depends(get_super_admin)):
    tenants = await db.saas_tenants.find({}, {"_id": 0}).to_list(1000)
    monitoring_data = []

    for tenant in tenants:
        tenant_db = client[f"tenant_{tenant['id'].replace('-', '_')}"]
        products_count = await tenant_db.products.count_documents({})
        customers_count = await tenant_db.customers.count_documents({})
        sales_count = await tenant_db.sales.count_documents({})

        monitoring_data.append({
            "tenant_id": tenant["id"],
            "name": tenant.get("name", ""),
            "email": tenant.get("email", ""),
            "company_name": tenant.get("company_name", ""),
            "is_active": tenant.get("is_active", True),
            "products_count": products_count,
            "customers_count": customers_count,
            "sales_count": sales_count,
            "subscription_ends_at": tenant.get("subscription_ends_at", ""),
            "created_at": tenant.get("created_at", "")
        })

    total_products = sum(t["products_count"] for t in monitoring_data)
    total_customers = sum(t["customers_count"] for t in monitoring_data)
    total_sales = sum(t["sales_count"] for t in monitoring_data)

    return {
        "tenants": monitoring_data,
        "totals": {"products": total_products, "customers": total_customers, "sales": total_sales}
    }


@router.get("/saas/payments", response_model=List[SubscriptionPaymentResponse])
async def get_payments(
    limit: int = 100, skip: int = 0,
    tenant_id: Optional[str] = None,
    admin: dict = Depends(get_super_admin)
):
    query = {"tenant_id": tenant_id} if tenant_id else {}
    payments = await db.saas_payments.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return [SubscriptionPaymentResponse(**p) for p in payments]


@router.get("/saas/finance-reports")
async def get_finance_reports(admin: dict = Depends(get_super_admin)):
    now = datetime.now(timezone.utc)
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    start_of_year = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

    monthly_revenue = 0
    yearly_revenue = 0

    async for payment in db.saas_payments.find({"created_at": {"$gte": start_of_month.isoformat()}}, {"_id": 0}):
        monthly_revenue += payment.get("amount", 0)

    async for payment in db.saas_payments.find({"created_at": {"$gte": start_of_year.isoformat()}}, {"_id": 0}):
        yearly_revenue += payment.get("amount", 0)

    return {"monthly_revenue": monthly_revenue, "yearly_revenue": yearly_revenue, "currency": "دج"}


@router.get("/saas/stats")
async def get_saas_stats(admin: dict = Depends(get_super_admin)):
    now = datetime.now(timezone.utc)

    total_tenants = await db.saas_tenants.count_documents({})
    active_tenants = await db.saas_tenants.count_documents({"is_active": True})
    trial_tenants = await db.saas_tenants.count_documents({"is_trial": True})

    seven_days_later = now + timedelta(days=7)
    expiring_soon = await db.saas_tenants.count_documents({
        "is_active": True,
        "subscription_ends_at": {"$lte": seven_days_later.isoformat()}
    })

    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    monthly_revenue_cursor = db.saas_payments.aggregate([
        {"$match": {"created_at": {"$gte": start_of_month.isoformat()}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ])
    monthly_revenue_result = await monthly_revenue_cursor.to_list(1)
    monthly_revenue = monthly_revenue_result[0]["total"] if monthly_revenue_result else 0

    total_revenue_cursor = db.saas_payments.aggregate([
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ])
    total_revenue_result = await total_revenue_cursor.to_list(1)
    total_revenue = total_revenue_result[0]["total"] if total_revenue_result else 0

    plans = await db.saas_plans.find({}, {"_id": 0, "id": 1, "name_ar": 1}).to_list(100)
    plans_distribution = {}
    for plan in plans:
        count = await db.saas_tenants.count_documents({"plan_id": plan["id"]})
        plans_distribution[plan.get("name_ar", plan["id"])] = count

    return {
        "total_tenants": total_tenants,
        "active_tenants": active_tenants,
        "trial_tenants": trial_tenants,
        "expiring_soon": expiring_soon,
        "monthly_revenue": monthly_revenue,
        "total_revenue": total_revenue,
        "plans_distribution": plans_distribution
    }


@router.get("/saas/stats-extended")
async def get_stats_extended(admin: dict = Depends(get_super_admin)):
    now = datetime.now(timezone.utc)

    total_tenants = await db.saas_tenants.count_documents({})
    active_tenants = await db.saas_tenants.count_documents({"is_active": True})
    total_agents = await db.saas_agents.count_documents({})

    seven_days_later = now + timedelta(days=7)
    expiring_soon = await db.saas_tenants.count_documents({
        "is_active": True,
        "subscription_ends_at": {"$lte": seven_days_later.isoformat()}
    })

    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    revenue_cursor = db.saas_payments.aggregate([
        {"$match": {"created_at": {"$gte": start_of_month.isoformat()}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ])
    revenue_result = await revenue_cursor.to_list(1)
    monthly_revenue = revenue_result[0]["total"] if revenue_result else 0

    return {
        "total_tenants": total_tenants,
        "active_tenants": active_tenants,
        "total_agents": total_agents,
        "expiring_soon": expiring_soon,
        "monthly_revenue": monthly_revenue
    }
