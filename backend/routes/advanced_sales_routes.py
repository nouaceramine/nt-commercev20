"""
Advanced Sales Tracking & Reports Routes - Extracted from server.py
Advanced reports, employee sales, peak hours, returns analysis
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime, timezone, timedelta

# p494b: business-hour grouping follows Africa/Algiers (fixed UTC+1, no DST)
# like every other report in the system (restaurant reports use the same
# timezone in their $dateToString/$hour aggregations).
DZ_TZ = timezone(timedelta(hours=1))


def _local_dt(iso_value):
    """Parse a stored ISO timestamp into Africa/Algiers local time."""
    try:
        dt = datetime.fromisoformat(str(iso_value).replace("Z", "+00:00"))
    except Exception:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(DZ_TZ)


def create_advanced_sales_routes(db, get_current_user, get_tenant_admin, require_tenant) -> dict:
    router = APIRouter(prefix="/sales", tags=["advanced-sales"])

    @router.get("/advanced-report")
    async def get_advanced_sales_report(start_date: Optional[str] = None, end_date: Optional[str] = None, employee_id: Optional[str] = None, customer_id: Optional[str] = None, product_id: Optional[str] = None, payment_method: Optional[str] = None, admin: dict = Depends(get_tenant_admin)):
        query = {"status": {"$ne": "returned"}}
        if start_date:
            query["created_at"] = {"$gte": start_date}
        if end_date:
            query.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"
        if employee_id:
            query["employee_id"] = employee_id
        if customer_id:
            query["customer_id"] = customer_id
        if payment_method:
            query["payment_method"] = payment_method
        sales = await db.sales.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
        if product_id:
            sales = [s for s in sales if any(i.get("product_id") == product_id for i in s.get("items", []))]
        total_amount = sum(s.get("total", 0) for s in sales)
        total_paid = sum(s.get("paid_amount", 0) for s in sales)
        total_discount = sum(s.get("discount", 0) for s in sales)
        total_profit = 0
        by_employee, by_payment, product_sales = {}, {}, {}
        for sale in sales:
            eid = sale.get("employee_id", "unknown")
            by_employee.setdefault(eid, {"employee_id": eid, "name": sale.get("employee_name", "غير محدد"), "count": 0, "total": 0})
            by_employee[eid]["count"] += 1
            by_employee[eid]["total"] += sale.get("total", 0)
            m = sale.get("payment_method", "cash")
            by_payment.setdefault(m, {"count": 0, "total": 0})
            by_payment[m]["count"] += 1
            by_payment[m]["total"] += sale.get("total", 0)
            for item in sale.get("items", []):
                pid = item.get("product_id")
                pname = item.get("product_name", "غير محدد")
                product_sales.setdefault(pid, {"name": pname, "quantity": 0, "total": 0})
                product_sales[pid]["quantity"] += item.get("quantity", 0)
                product_sales[pid]["total"] += item.get("total", 0)
                prod = await db.products.find_one({"id": pid}, {"_id": 0, "purchase_price": 1})
                if prod:
                    total_profit += (item.get("price", 0) - prod.get("purchase_price", 0)) * item.get("quantity", 0)
        top_products = sorted(product_sales.values(), key=lambda x: x["total"], reverse=True)[:10]
        return {"period": {"start": start_date, "end": end_date}, "statistics": {"total_sales": len(sales), "total_amount": total_amount, "total_paid": total_paid, "total_remaining": total_amount - total_paid, "total_discount": total_discount, "total_profit": total_profit, "average_sale": total_amount / len(sales) if sales else 0}, "by_employee": sorted(by_employee.values(), key=lambda x: x["total"], reverse=True), "by_payment_method": by_payment, "top_products": top_products, "sales": sales[:100]}

    @router.get("/employee-report/{employee_id}")
    async def get_employee_sales_report(employee_id: str, start_date: Optional[str] = None, end_date: Optional[str] = None, admin: dict = Depends(get_tenant_admin)):
        query = {"employee_id": employee_id, "status": {"$ne": "returned"}}
        if start_date:
            query["created_at"] = {"$gte": start_date}
        if end_date:
            query.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"
        sales = await db.sales.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
        employee = await db.employees.find_one({"id": employee_id}, {"_id": 0})
        if not employee:
            # p494b: sales made by tenant users (owner/manager) carry their user
            # id; fall back to the users collection so the report still names them
            employee = await db.users.find_one({"id": employee_id}, {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1})
        total_amount = sum(s.get("total", 0) for s in sales)
        total_paid = sum(s.get("paid_amount", 0) for s in sales)
        by_hour = {}
        for sale in sales:
            local = _local_dt(sale.get("created_at"))
            if local is None:
                continue
            hour = f"{local.hour:02d}"
            by_hour.setdefault(hour, {"count": 0, "total": 0})
            by_hour[hour]["count"] += 1
            by_hour[hour]["total"] += sale.get("total", 0)
        return {"employee": employee, "sales": sales, "statistics": {"total_sales": len(sales), "total_amount": total_amount, "total_paid": total_paid, "total_remaining": total_amount - total_paid, "average_sale": total_amount / len(sales) if sales else 0}, "by_hour": by_hour}

    @router.get("/peak-hours")
    async def get_peak_hours_report(days: int = Query(30, ge=1, le=366), admin: dict = Depends(get_tenant_admin)):
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
        sales = await db.sales.find({"created_at": {"$gte": start_date}, "status": {"$ne": "returned"}}, {"_id": 0, "created_at": 1, "total": 1}).to_list(10000)
        by_hour = {str(i).zfill(2): {"count": 0, "total": 0} for i in range(24)}
        day_names_ar = ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"]
        by_day = {i: {"count": 0, "total": 0, "name_ar": day_names_ar[i]} for i in range(7)}
        for sale in sales:
            local = _local_dt(sale.get("created_at"))
            if local is None:
                continue
            hour = f"{local.hour:02d}"
            by_hour[hour]["count"] += 1
            by_hour[hour]["total"] += sale.get("total", 0)
            by_day[local.weekday()]["count"] += 1
            by_day[local.weekday()]["total"] += sale.get("total", 0)
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
            reason = ret.get("return_reason") or "غير محدد"
            by_reason.setdefault(reason, {"count": 0, "total": 0})
            by_reason[reason]["count"] += 1
            by_reason[reason]["total"] += ret.get("total", 0)
        return {"returns": returns, "statistics": {"total_returns": len(returns), "total_amount": sum(r.get("total", 0) for r in returns)}, "by_reason": by_reason}

    @router.get("/{sale_id}/audit-log")
    async def get_sale_audit_log(sale_id: str, user: dict = Depends(require_tenant)):
        # p494b: a real sale is required — ghost ids return 404 instead of an
        # empty list that looks legitimate
        sale = await db.sales.find_one({"id": sale_id}, {"_id": 0, "id": 1})
        if not sale:
            raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")
        logs = await db.sale_audit_log.find({"sale_id": sale_id}, {"_id": 0}).sort("timestamp", -1).to_list(200)
        return {"sale_id": sale_id, "logs": logs}

    return {"router": router}
