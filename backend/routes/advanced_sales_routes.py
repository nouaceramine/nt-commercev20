"""
Advanced Sales Tracking & Reports Routes - Extracted from server.py
Advanced reports, employee sales, peak hours, returns analysis
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta


def create_advanced_sales_routes(db, get_current_user, get_tenant_admin, require_tenant) -> dict:
    router = APIRouter(prefix="/sales", tags=["advanced-sales"])

    @router.get("/advanced-report")
    async def get_advanced_sales_report(start_date: Optional[str] = None, end_date: Optional[str] = None, employee_id: Optional[str] = None, customer_id: Optional[str] = None, product_id: Optional[str] = None, payment_method: Optional[str] = None, admin: dict = Depends(get_tenant_admin)):
        query = {"status": {"$ne": "returned"}}
        if start_date:
            query["created_at"] = {"$gte": start_date}
        if end_date:
            query.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59" if isinstance(query.get("created_at"), dict) else {"$lte": end_date + "T23:59:59"}
        if employee_id:
            query["employee_id"] = employee_id
        if customer_id:
            query["customer_id"] = customer_id
        if payment_method:
            query["payment_method"] = payment_method
        sales = await db.sales.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
        if product_id:
            sales = [s for s in sales if any(i.get("product_id") == product_id for i in s.get("items", []))]
        total_amount = sum(s.get("total", 0) for s in sales)
        total_paid = sum(s.get("paid_amount", 0) for s in sales)
        total_discount = sum(s.get("discount", 0) for s in sales)
        total_profit = sum((i.get("unit_price", 0) - i.get("purchase_price", i.get("unit_price", 0) * 0.7)) * i.get("quantity", 1) for s in sales for i in s.get("items", []))
        by_employee, by_payment, product_sales = {}, {}, {}
        for sale in sales:
            eid = sale.get("employee_id", "unknown")
            by_employee.setdefault(eid, {"name": sale.get("employee_name", "غير محدد"), "count": 0, "total": 0})
            by_employee[eid]["count"] += 1
            by_employee[eid]["total"] += sale.get("total", 0)
            m = sale.get("payment_method", "cash")
            by_payment.setdefault(m, {"count": 0, "total": 0})
            by_payment[m]["count"] += 1
            by_payment[m]["total"] += sale.get("total", 0)
            for i in sale.get("items", []):
                pid = i.get("product_id", "unknown")
                product_sales.setdefault(pid, {"name": i.get("product_name", "غير محدد"), "quantity": 0, "total": 0})
                product_sales[pid]["quantity"] += i.get("quantity", 1)
                product_sales[pid]["total"] += i.get("total", 0)
        return {"sales": sales, "statistics": {"total_sales": len(sales), "total_amount": total_amount, "total_paid": total_paid, "total_remaining": total_amount - total_paid, "total_discount": total_discount, "total_profit": total_profit, "average_sale": total_amount / len(sales) if sales else 0}, "by_employee": list(by_employee.values()), "by_payment_method": by_payment, "top_products": sorted(product_sales.values(), key=lambda x: x["total"], reverse=True)[:10]}

    @router.get("/employee-report/{employee_id}")
    async def get_employee_sales_report(employee_id: str, start_date: Optional[str] = None, end_date: Optional[str] = None, admin: dict = Depends(get_tenant_admin)):
        query = {"employee_id": employee_id, "status": {"$ne": "returned"}}
        if start_date:
            query["created_at"] = {"$gte": start_date}
        if end_date:
            query.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"
        sales = await db.sales.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
        employee = await db.employees.find_one({"id": employee_id}, {"_id": 0})
        total_amount = sum(s.get("total", 0) for s in sales)
        total_paid = sum(s.get("paid_amount", 0) for s in sales)
        by_hour = {}
        for sale in sales:
            try:
                hour = sale.get("created_at", "")[:13].split("T")[1] if "T" in sale.get("created_at", "") else "00"
                by_hour.setdefault(hour, {"count": 0, "total": 0})
                by_hour[hour]["count"] += 1
                by_hour[hour]["total"] += sale.get("total", 0)
            except Exception:
                pass
        return {"employee": employee, "sales": sales, "statistics": {"total_sales": len(sales), "total_amount": total_amount, "total_paid": total_paid, "total_remaining": total_amount - total_paid, "average_sale": total_amount / len(sales) if sales else 0}, "by_hour": by_hour}

    @router.get("/peak-hours")
    async def get_peak_hours_report(days: int = 30, admin: dict = Depends(get_tenant_admin)):
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
        sales = await db.sales.find({"created_at": {"$gte": start_date}, "status": {"$ne": "returned"}}, {"_id": 0, "created_at": 1, "total": 1}).to_list(10000)
        by_hour = {str(i).zfill(2): {"count": 0, "total": 0} for i in range(24)}
        day_names_ar = ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"]
        by_day = {i: {"count": 0, "total": 0, "name_ar": day_names_ar[i]} for i in range(7)}
        for sale in sales:
            try:
                if "T" in sale.get("created_at", ""):
                    hour = sale["created_at"].split("T")[1][:2]
                    by_hour[hour]["count"] += 1
                    by_hour[hour]["total"] += sale.get("total", 0)
                date = datetime.fromisoformat(sale["created_at"].replace("Z", "+00:00"))
                by_day[date.weekday()]["count"] += 1
                by_day[date.weekday()]["total"] += sale.get("total", 0)
            except Exception:
                pass
        return {"by_hour": by_hour, "by_day": list(by_day.values()), "peak_hour": max(by_hour.items(), key=lambda x: x[1]["total"])[0] if by_hour else None, "peak_day": max(by_day.items(), key=lambda x: x[1]["total"])[0] if by_day else None}

    @router.get("/returns-report")
    async def get_returns_report(start_date: Optional[str] = None, end_date: Optional[str] = None, admin: dict = Depends(get_tenant_admin)):
        query = {"status": "returned"}
        if start_date:
            query["returned_at"] = {"$gte": start_date}
        if end_date:
            query.setdefault("returned_at", {})["$lte"] = end_date + "T23:59:59"
        returns = await db.sales.find(query, {"_id": 0}).sort("returned_at", -1).to_list(1000)
        by_reason = {}
        for ret in returns:
            reason = ret.get("return_reason", "غير محدد")
            by_reason.setdefault(reason, {"count": 0, "total": 0})
            by_reason[reason]["count"] += 1
            by_reason[reason]["total"] += ret.get("total", 0)
        return {"returns": returns, "statistics": {"total_returns": len(returns), "total_amount": sum(r.get("total", 0) for r in returns)}, "by_reason": by_reason}

    @router.get("/{sale_id}/audit-log")
    async def get_sale_audit_log(sale_id: str, admin: dict = Depends(get_tenant_admin)):
        return await db.sale_audit_logs.find({"sale_id": sale_id}, {"_id": 0}).sort("created_at", -1).to_list(100)

    return router
