"""
Stats, Reports & Analytics Routes - Extracted from server.py
Dashboard stats, sales analytics, profit reports, AI predictions
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone, timedelta
from utils.inventory_queries import low_stock_filter


def create_stats_routes(db, get_current_user, get_tenant_admin, require_tenant, init_cash_boxes, CURRENCY="DZD") -> dict:
    from utils.permissions import create_cashier_block
    router = APIRouter(tags=["stats-reports"])
    block_cashier = create_cashier_block(get_current_user)

    # ── Main Dashboard Stats ──
    @router.get("/stats")
    async def get_stats(admin: dict = Depends(get_tenant_admin)):
        from services.cache_service import cache
        tenant_id = admin.get("tenant_id", "main")
        cache_key = f"stats:dashboard:{tenant_id}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        await init_cash_boxes()
        total_products = await db.products.count_documents({})
        total_customers = await db.customers.count_documents({})
        total_suppliers = await db.suppliers.count_documents({})
        total_employees = await db.employees.count_documents({})

        pipeline = [
            {"$match": low_stock_filter()},
            {"$count": "count"}
        ]
        result = await db.products.aggregate(pipeline).to_list(1)
        low_stock = result[0]["count"] if result else 0

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        today_sales = await db.sales.aggregate([
            {"$match": {"created_at": {"$gte": today}, "status": {"$ne": "returned"}}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}}
        ]).to_list(1)

        cash_boxes = await db.cash_boxes.find({}, {"_id": 0}).to_list(100)
        total_cash = sum(b.get("balance", 0) for b in cash_boxes)
        unread_notifications = await db.notifications.count_documents({"read": False})

        total_receivables = await db.debts.aggregate([
            {"$match": {"type": "receivable", "status": {"$ne": "paid"}}},
            {"$group": {"_id": None, "total": {"$sum": "$remaining_amount"}}}
        ]).to_list(1)
        total_payables = await db.debts.aggregate([
            {"$match": {"type": "payable", "status": {"$ne": "paid"}}},
            {"$group": {"_id": None, "total": {"$sum": "$remaining_amount"}}}
        ]).to_list(1)

        response = {
            "total_products": total_products, "total_customers": total_customers,
            "total_suppliers": total_suppliers, "total_employees": total_employees,
            "low_stock_count": low_stock,
            "today_sales_total": today_sales[0]["total"] if today_sales else 0,
            "today_sales_count": today_sales[0]["count"] if today_sales else 0,
            "total_cash": total_cash, "cash_boxes": cash_boxes,
            "unread_notifications": unread_notifications,
            "total_receivables": total_receivables[0]["total"] if total_receivables else 0,
            "total_payables": total_payables[0]["total"] if total_payables else 0,
            "currency": CURRENCY
        }
        cache.set(cache_key, response, ttl=60)  # Cache for 1 minute
        return response

    # ── Dashboard Sales Stats ──
    @router.get("/dashboard/sales-stats")
    async def get_sales_stats(user: dict = Depends(block_cashier)):
        now = datetime.now(timezone.utc)
        today = now.strftime("%Y-%m-%d")
        month_start = now.strftime("%Y-%m-01")
        year_start = now.strftime("%Y-01-01")

        today_result = await db.sales.aggregate([
            {"$match": {"created_at": {"$gte": today}, "status": {"$ne": "returned"}}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}}
        ]).to_list(1)
        month_result = await db.sales.aggregate([
            {"$match": {"created_at": {"$gte": month_start}, "status": {"$ne": "returned"}}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}}
        ]).to_list(1)
        year_result = await db.sales.aggregate([
            {"$match": {"created_at": {"$gte": year_start}, "status": {"$ne": "returned"}}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}}
        ]).to_list(1)

        return {
            "today": {"total": today_result[0]["total"] if today_result else 0, "count": today_result[0]["count"] if today_result else 0},
            "month": {"total": month_result[0]["total"] if month_result else 0, "count": month_result[0]["count"] if month_result else 0},
            "year": {"total": year_result[0]["total"] if year_result else 0, "count": year_result[0]["count"] if year_result else 0},
        }

    # ── Profit Stats ──
    @router.get("/dashboard/profit-stats")
    async def get_profit_stats(user: dict = Depends(block_cashier)):
        now = datetime.now(timezone.utc)
        month_start = now.strftime("%Y-%m-01")

        sales_result = await db.sales.aggregate([
            {"$match": {"created_at": {"$gte": month_start}, "status": {"$ne": "returned"}}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}}}
        ]).to_list(1)
        monthly_revenue = sales_result[0]["total"] if sales_result else 0

        monthly_purchase_cost = 0
        try:
            monthly_sales = await db.sales.find({"created_at": {"$gte": month_start}, "status": {"$ne": "returned"}}, {"_id": 0, "items": 1}).to_list(1000)
            product_ids = set()
            for sale in monthly_sales:
                for item in sale.get("items", []):
                    product_ids.add(item.get("product_id"))
            products_cache = {}
            if product_ids:
                products = await db.products.find({"id": {"$in": list(product_ids)}}, {"_id": 0, "id": 1, "purchase_price": 1}).to_list(len(product_ids))
                products_cache = {p["id"]: p.get("purchase_price", 0) for p in products}
            for sale in monthly_sales:
                for item in sale.get("items", []):
                    purchase_price = item.get("purchase_price") or products_cache.get(item.get("product_id"), 0)
                    monthly_purchase_cost += item.get("quantity", 0) * purchase_price
        except Exception:
            monthly_purchase_cost = 0

        expenses_result = await db.expenses.aggregate([
            {"$match": {"date": {"$gte": month_start}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]).to_list(1)
        monthly_expenses = expenses_result[0]["total"] if expenses_result else 0

        return {
            "monthly_revenue": monthly_revenue,
            "monthly_purchase_cost": monthly_purchase_cost,
            "monthly_expenses": monthly_expenses,
            "monthly_profit": monthly_revenue - monthly_purchase_cost - monthly_expenses
        }

    # ── Analytics: Sales Chart ──
    @router.get("/analytics/sales-chart")
    async def get_sales_chart_data(period: str = "week", admin: dict = Depends(get_tenant_admin)):
        now = datetime.now(timezone.utc)
        if period == "year":
            start_date = (now - timedelta(days=365)).strftime("%Y-%m-%d")
            group_key = {"$substr": ["$created_at", 0, 7]}
        else:
            days = 7 if period == "week" else 30
            start_date = (now - timedelta(days=days)).strftime("%Y-%m-%d")
            group_key = {"$substr": ["$created_at", 0, 10]}

        pipeline = [
            {"$match": {"created_at": {"$gte": start_date}, "status": {"$ne": "returned"}}},
            {"$group": {"_id": group_key, "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}}
        ]
        result = await db.sales.aggregate(pipeline).to_list(100)
        return {"period": period, "data": [{"date": r["_id"], "total": r["total"], "count": r["count"]} for r in result]}

    # ── Analytics: Top Products ──
    @router.get("/analytics/top-products")
    async def get_top_products(limit: int = 10, period: str = "month", admin: dict = Depends(get_tenant_admin)):
        now = datetime.now(timezone.utc)
        days = {"week": 7, "month": 30}.get(period, 365)
        start_date = (now - timedelta(days=days)).strftime("%Y-%m-%d")

        pipeline = [
            {"$match": {"created_at": {"$gte": start_date}, "status": {"$ne": "returned"}}},
            {"$unwind": "$items"},
            {"$group": {"_id": "$items.product_id", "product_name": {"$first": "$items.name"}, "total_quantity": {"$sum": "$items.quantity"}, "total_revenue": {"$sum": {"$multiply": ["$items.price", "$items.quantity"]}}}},
            {"$sort": {"total_revenue": -1}},
            {"$limit": limit}
        ]
        result = await db.sales.aggregate(pipeline).to_list(limit)
        return {"period": period, "products": result}

    # ── Analytics: Top Customers ──
    @router.get("/analytics/top-customers")
    async def get_top_customers(limit: int = 10, period: str = "month", admin: dict = Depends(get_tenant_admin)):
        now = datetime.now(timezone.utc)
        days = {"week": 7, "month": 30}.get(period, 365)
        start_date = (now - timedelta(days=days)).strftime("%Y-%m-%d")

        pipeline = [
            {"$match": {"created_at": {"$gte": start_date}, "status": {"$ne": "returned"}, "customer_id": {"$exists": True, "$ne": ""}}},
            {"$group": {"_id": "$customer_id", "customer_name": {"$first": "$customer_name"}, "total_purchases": {"$sum": "$total"}, "orders_count": {"$sum": 1}}},
            {"$sort": {"total_purchases": -1}},
            {"$limit": limit}
        ]
        result = await db.sales.aggregate(pipeline).to_list(limit)
        return {"period": period, "customers": result}

    # ── Analytics: Employee Performance ──
    @router.get("/analytics/employee-performance")
    async def get_employee_performance(period: str = "month", admin: dict = Depends(get_tenant_admin)):
        now = datetime.now(timezone.utc)
        days = {"week": 7, "month": 30}.get(period, 365)
        start_date = (now - timedelta(days=days)).strftime("%Y-%m-%d")

        pipeline = [
            {"$match": {"closed_at": {"$gte": start_date}, "status": "closed"}},
            {"$group": {"_id": "$user_id", "user_name": {"$first": "$user_name"}, "total_sales": {"$sum": "$total_sales"}, "sessions_count": {"$sum": 1}, "total_difference": {"$sum": {"$subtract": ["$closing_cash", {"$add": ["$opening_cash", "$cash_sales"]}]}}}},
            {"$sort": {"total_sales": -1}}
        ]
        result = await db.daily_sessions.aggregate(pipeline).to_list(50)
        return {"period": period, "employees": result}

    # ── Analytics: Sales Prediction ──
    @router.get("/analytics/sales-prediction")
    async def get_sales_prediction(admin: dict = Depends(get_tenant_admin)):
        now = datetime.now(timezone.utc)
        start_date = (now - timedelta(days=30)).strftime("%Y-%m-%d")
        pipeline = [
            {"$match": {"created_at": {"$gte": start_date}, "status": {"$ne": "returned"}}},
            {"$group": {"_id": {"$substr": ["$created_at", 0, 10]}, "total": {"$sum": "$total"}}},
            {"$sort": {"_id": 1}}
        ]
        result = await db.sales.aggregate(pipeline).to_list(30)
        if not result:
            return {"prediction": 0, "confidence": 0, "trend": "neutral"}

        totals = [r["total"] for r in result]
        avg = sum(totals) / len(totals) if totals else 0
        trend = "neutral"
        if len(totals) >= 7:
            recent_avg = sum(totals[-7:]) / 7
            older_avg = sum(totals[:7]) / 7 if len(totals) >= 14 else avg
            trend = "up" if recent_avg > older_avg * 1.1 else ("down" if recent_avg < older_avg * 0.9 else "neutral")

        prediction = avg * (1.05 if trend == "up" else (0.95 if trend == "down" else 1))
        return {
            "predicted_daily_sales": round(prediction, 2),
            "predicted_monthly_sales": round(prediction * 30, 2),
            "average_daily_sales": round(avg, 2),
            "trend": trend,
            "confidence": 0.7 if len(totals) >= 14 else 0.5,
            "recommendation": {
                "ar": "بناءً على البيانات، يُنصح بزيادة المخزون للمنتجات الأكثر مبيعاً" if trend == "up" else "حافظ على مستوى المخزون الحالي",
                "fr": "Basé sur les données, il est recommandé d'augmenter le stock" if trend == "up" else "Maintenez le niveau de stock actuel"
            }
        }

    # ── Analytics: Restock Suggestions ──
    @router.get("/analytics/restock-suggestions")
    async def get_restock_suggestions(admin: dict = Depends(get_tenant_admin)):
        low_stock_products = await db.products.find(
            {"$expr": {"$lte": ["$quantity", "$low_stock_threshold"]}}, {"_id": 0}
        ).to_list(100)
        now = datetime.now(timezone.utc)
        start_date = (now - timedelta(days=30)).strftime("%Y-%m-%d")

        suggestions = []
        for product in low_stock_products:
            pipeline = [
                {"$match": {"created_at": {"$gte": start_date}, "status": {"$ne": "returned"}}},
                {"$unwind": "$items"},
                {"$match": {"items.product_id": product["id"]}},
                {"$group": {"_id": None, "total_sold": {"$sum": "$items.quantity"}}}
            ]
            sales_result = await db.sales.aggregate(pipeline).to_list(1)
            monthly_sales = sales_result[0]["total_sold"] if sales_result else 0
            daily_velocity = monthly_sales / 30
            days_until_stockout = product["quantity"] / daily_velocity if daily_velocity > 0 else 999
            suggested_quantity = max(int(daily_velocity * 60), product.get("low_stock_threshold", 10) * 2)
            urgency = "critical" if days_until_stockout <= 3 else ("high" if days_until_stockout <= 7 else ("medium" if days_until_stockout <= 14 else "low"))
            suggestions.append({
                "product_id": product["id"],
                "product_name": product.get("name_en", ""),
                "current_stock": product["quantity"],
                "monthly_sales": monthly_sales,
                "daily_velocity": round(daily_velocity, 2),
                "days_until_stockout": round(days_until_stockout, 1),
                "suggested_restock": suggested_quantity,
                "urgency": urgency
            })

        urgency_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        suggestions.sort(key=lambda x: urgency_order.get(x["urgency"], 4))
        return {"suggestions": suggestions, "total_products_needing_restock": len(suggestions)}

    # ── Reports: Sales Chart (Legacy) ──
    @router.get("/reports/sales-chart")
    async def get_sales_chart(days: int = 7, admin: dict = Depends(get_tenant_admin)):
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
        pipeline = [
            {"$match": {"created_at": {"$gte": start_date}, "status": {"$ne": "returned"}}},
            {"$addFields": {"date": {"$substr": ["$created_at", 0, 10]}}},
            {"$group": {"_id": "$date", "total_sales": {"$sum": "$total"}, "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}}
        ]
        result = await db.sales.aggregate(pipeline).to_list(100)
        return [{"date": r["_id"], "total": r["total_sales"], "count": r["count"]} for r in result]

    # ── Reports: Top Products (Legacy) ──
    @router.get("/reports/top-products")
    async def get_report_top_products(limit: int = 10, admin: dict = Depends(get_tenant_admin)):
        pipeline = [
            {"$match": {"status": {"$ne": "returned"}}},
            {"$unwind": "$items"},
            {"$group": {"_id": "$items.product_id", "product_name": {"$first": "$items.product_name"}, "total_quantity": {"$sum": "$items.quantity"}, "total_revenue": {"$sum": "$items.total"}}},
            {"$sort": {"total_quantity": -1}},
            {"$limit": limit}
        ]
        return await db.sales.aggregate(pipeline).to_list(limit)

    # ── Reports: Top Customers (Legacy) ──
    @router.get("/reports/top-customers")
    async def get_report_top_customers(limit: int = 10, admin: dict = Depends(get_tenant_admin)):
        return await db.customers.find({}, {"_id": 0}).sort("total_purchases", -1).limit(limit).to_list(limit)

    # ── Reports: Profit ──
    @router.get("/reports/profit")
    async def get_profit_report(days: int = 30, admin: dict = Depends(get_tenant_admin)):
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
        sales = await db.sales.find({"created_at": {"$gte": start_date}, "status": {"$ne": "returned"}}, {"_id": 0, "items": 1, "total": 1}).to_list(10000)
        total_revenue = sum(s["total"] for s in sales)
        total_cost = 0
        for sale in sales:
            for item in sale.get("items", []):
                product = await db.products.find_one({"id": item["product_id"]}, {"_id": 0, "purchase_price": 1})
                if product:
                    total_cost += product.get("purchase_price", 0) * item["quantity"]
        gross_profit = total_revenue - total_cost
        profit_margin = (gross_profit / total_revenue * 100) if total_revenue > 0 else 0
        return {"total_revenue": total_revenue, "total_cost": total_cost, "gross_profit": gross_profit, "profit_margin": round(profit_margin, 2), "period_days": days}

    # ── Reports: Profit Detailed ──
    @router.get("/reports/profit-detailed")
    async def get_detailed_profit_report(days: int = 30, admin: dict = Depends(get_tenant_admin)):
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
        sales = await db.sales.find({"created_at": {"$gte": start_date}, "status": {"$ne": "returned"}}, {"_id": 0}).to_list(10000)

        daily_data = {}
        product_profits = {}
        for sale in sales:
            sale_date = sale.get("created_at", "")[:10]
            if sale_date not in daily_data:
                daily_data[sale_date] = {"revenue": 0, "cost": 0, "profit": 0, "sales_count": 0}
            daily_data[sale_date]["sales_count"] += 1
            daily_data[sale_date]["revenue"] += sale.get("total", 0)
            for item in sale.get("items", []):
                product_id = item.get("product_id")
                if product_id:
                    product = await db.products.find_one({"id": product_id}, {"_id": 0, "purchase_price": 1, "name_ar": 1, "name_en": 1})
                    if product:
                        purchase_price = product.get("purchase_price", 0)
                        sale_price = item.get("price", 0)
                        quantity = item.get("quantity", 1)
                        item_cost = purchase_price * quantity
                        item_profit = (sale_price - purchase_price) * quantity
                        daily_data[sale_date]["cost"] += item_cost
                        daily_data[sale_date]["profit"] += item_profit
                        if product_id not in product_profits:
                            product_profits[product_id] = {"name": product.get("name_ar") or product.get("name_en", ""), "total_sold": 0, "total_profit": 0}
                        product_profits[product_id]["total_sold"] += quantity
                        product_profits[product_id]["total_profit"] += item_profit

        for pdata in product_profits.values():
            if pdata["total_sold"] > 0:
                pdata["profit_per_unit"] = round(pdata["total_profit"] / pdata["total_sold"], 2)

        sorted_daily = [{"date": k, **v} for k, v in sorted(daily_data.items(), reverse=True)]
        top_products = sorted(product_profits.values(), key=lambda x: x["total_profit"], reverse=True)[:10]
        total_revenue = sum(d["revenue"] for d in daily_data.values())
        total_cost = sum(d["cost"] for d in daily_data.values())
        total_profit = sum(d["profit"] for d in daily_data.values())

        return {
            "summary": {
                "total_revenue": total_revenue, "total_cost": total_cost,
                "total_profit": total_profit,
                "profit_margin": round((total_profit / total_revenue * 100) if total_revenue > 0 else 0, 2),
                "avg_daily_profit": round(total_profit / days, 2) if days > 0 else 0,
                "period_days": days
            },
            "daily_breakdown": sorted_daily[:30],
            "top_profitable_products": top_products
        }

    return router
