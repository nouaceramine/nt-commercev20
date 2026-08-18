"""
Stats, Reports & Analytics Routes - Extracted from server.py
Dashboard stats, sales analytics, profit reports, AI predictions
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone, timedelta
from utils.inventory_queries import low_stock_filter
from services.reporting import (
    sales_chart_rows, top_products_rows, product_price_map, product_docs_map,
)


def create_stats_routes(db, get_current_user, get_tenant_admin, require_tenant, init_cash_boxes, CURRENCY="DZD", main_db=None) -> dict:
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
        total_cash = sum(b.get("balance", 0) for b in cash_boxes if b.get("id") != "personal")  # p68: personal money is outside business capital

        # ── p162: Real capital ──
        # capital = stock value at purchase cost + business cash boxes (excl. personal)
        #           − today's expenses NOT charged to any box (boxed expenses already reduced balances → no double count)
        stock_val_agg = await db.products.aggregate([
            {"$group": {"_id": None, "total": {"$sum": {"$multiply": [
                {"$convert": {"input": "$purchase_price", "to": "double", "onError": 0, "onNull": 0}},
                {"$convert": {"input": "$quantity", "to": "double", "onError": 0, "onNull": 0}}
            ]}}}}
        ]).to_list(1)
        stock_value = round(stock_val_agg[0]["total"], 2) if stock_val_agg else 0
        next_day = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
        unboxed_exp_agg = await db.expenses.aggregate([
            {"$match": {
                "date": {"$gte": today, "$lt": next_day},
                "$or": [{"payment_method": {"$exists": False}}, {"payment_method": None}, {"payment_method": ""}],
                "currency": {"$ne": "USD"},
            }},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]).to_list(1)
        unboxed_expenses_today = round(unboxed_exp_agg[0]["total"], 2) if unboxed_exp_agg else 0

        # ── p165: flexy/IPTV platform wallet + operator SIM balances count toward capital ──
        flexy_wallet_balance = 0.0
        try:
            if main_db is not None:
                _ent = admin.get("tenant_id") or admin.get("id", "")
                _w = await main_db.wallets.find_one({"entity_id": _ent}, {"_id": 0, "balance": 1})
                flexy_wallet_balance = round(float((_w or {}).get("balance", 0) or 0), 2)
        except Exception:
            flexy_wallet_balance = 0.0
        sim_slots_list = await db.sim_slots.find({}, {"_id": 0}).to_list(20)
        sim_balance_total = round(sum(float(s.get("balance", 0) or 0) + float(s.get("bonus_balance", 0) or 0) for s in sim_slots_list), 2)
        sim_stock_value = round(sum(float(s.get("empty_sims", 0) or 0) * float(s.get("sim_unit_cost", 0) or 0) for s in sim_slots_list), 2)
        capital = round(stock_value + total_cash - unboxed_expenses_today + flexy_wallet_balance + sim_balance_total + sim_stock_value, 2)

        unread_notifications = await db.notifications.count_documents({"read": False})

        total_receivables = await db.debts.aggregate([
            {"$match": {"type": "receivable", "status": {"$ne": "paid"}}},
            {"$group": {"_id": None, "total": {"$sum": "$remaining_amount"}}}
        ]).to_list(1)
        total_payables = await db.debts.aggregate([
            {"$match": {"type": "payable", "status": {"$ne": "paid"}}},
            {"$group": {"_id": None, "total": {"$sum": "$remaining_amount"}}}
        ]).to_list(1)

        # Customer wallet aggregates ─ used by dashboard cards
        # "رصيد محفظة الزبون" — total positive prepaid credit held by customers
        customer_balance_agg = await db.customers.aggregate([
            {"$match": {"balance": {"$gt": 0}}},
            {"$group": {"_id": None, "total": {"$sum": "$balance"}, "count": {"$sum": 1}}}
        ]).to_list(1)
        customer_balance_total = customer_balance_agg[0]["total"] if customer_balance_agg else 0
        customer_balance_count = customer_balance_agg[0]["count"] if customer_balance_agg else 0

        # "ديون محفظة الزبون" — total outstanding from unpaid sales (debt_amount > 0)
        customer_debt_agg = await db.sales.aggregate([
            {"$match": {"debt_amount": {"$gt": 0}, "status": {"$ne": "returned"}}},
            {"$group": {"_id": "$customer_id", "total_debt": {"$sum": "$debt_amount"}}},
            {"$group": {"_id": None, "total": {"$sum": "$total_debt"}, "count": {"$sum": 1}}}
        ]).to_list(1)
        customer_debt_total = customer_debt_agg[0]["total"] if customer_debt_agg else 0
        customers_with_debt = customer_debt_agg[0]["count"] if customer_debt_agg else 0

        # p115: today's NEW debt — what went out as debt today
        customer_debt_today_agg = await db.sales.aggregate([
            {"$match": {"created_at": {"$gte": today}, "debt_amount": {"$gt": 0}, "status": {"$ne": "returned"}}},
            {"$group": {"_id": None, "total": {"$sum": "$debt_amount"}, "count": {"$sum": 1}}}
        ]).to_list(1)
        customer_debt_today = customer_debt_today_agg[0]["total"] if customer_debt_today_agg else 0
        customer_debt_today_count = customer_debt_today_agg[0]["count"] if customer_debt_today_agg else 0

        supplier_debt_today_agg = await db.purchases.aggregate([
            {"$match": {"created_at": {"$gte": today}, "remaining": {"$gt": 0}}},
            {"$group": {"_id": None, "total": {"$sum": "$remaining"}, "count": {"$sum": 1}}}
        ]).to_list(1)
        supplier_debt_today = supplier_debt_today_agg[0]["total"] if supplier_debt_today_agg else 0
        supplier_debt_today_count = supplier_debt_today_agg[0]["count"] if supplier_debt_today_agg else 0

        supplier_debt_agg = await db.suppliers.aggregate([
            {"$match": {"balance": {"$gt": 0}}},
            {"$group": {"_id": None, "total": {"$sum": "$balance"}, "count": {"$sum": 1}}}
        ]).to_list(1)
        supplier_debt_total = supplier_debt_agg[0]["total"] if supplier_debt_agg else 0

        response = {
            "total_products": total_products, "total_customers": total_customers,
            "total_suppliers": total_suppliers, "total_employees": total_employees,
            "low_stock_count": low_stock,
            "today_sales_total": today_sales[0]["total"] if today_sales else 0,
            "today_sales_count": today_sales[0]["count"] if today_sales else 0,
            "total_cash": total_cash, "cash_boxes": cash_boxes,
            "stock_value": stock_value,
            "unboxed_expenses_today": unboxed_expenses_today,
            "flexy_wallet_balance": flexy_wallet_balance,
            "sim_balance_total": sim_balance_total,
            "sim_stock_value": sim_stock_value,
            "capital": capital,
            "unread_notifications": unread_notifications,
            "total_receivables": total_receivables[0]["total"] if total_receivables else 0,
            "total_payables": total_payables[0]["total"] if total_payables else 0,
            "customer_balance_total": customer_balance_total,
            "customer_balance_count": customer_balance_count,
            "customer_debt_total": customer_debt_total,
            "customers_with_debt": customers_with_debt,
            "customer_debt_today": customer_debt_today,
            "customer_debt_today_count": customer_debt_today_count,
            "supplier_debt_today": supplier_debt_today,
            "supplier_debt_today_count": supplier_debt_today_count,
            "supplier_debt_total": supplier_debt_total,
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

        POS_MATCH = {"source": {"$ne": "webstore"}}  # p87: split POS vs webstore halves
        today_result = await db.sales.aggregate([
            {"$match": {"created_at": {"$gte": today}, "status": {"$ne": "returned"}, **POS_MATCH}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}}
        ]).to_list(1)
        month_result = await db.sales.aggregate([
            {"$match": {"created_at": {"$gte": month_start}, "status": {"$ne": "returned"}, **POS_MATCH}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}}
        ]).to_list(1)
        year_result = await db.sales.aggregate([
            {"$match": {"created_at": {"$gte": year_start}, "status": {"$ne": "returned"}, **POS_MATCH}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}}
        ]).to_list(1)

        # p86: merge web-store orders (counted at creation, excluding cancelled)
        async def _ecom_sum(gte):
            # p87: web-store orders live in sales as source=webstore docs
            rows = await db.sales.aggregate([
                {"$match": {"created_at": {"$gte": gte}, "source": "webstore", "status": {"$ne": "returned"}}},
                {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
            ]).to_list(1)
            return {"total": rows[0]["total"] if rows else 0, "count": rows[0]["count"] if rows else 0}

        store_today = await _ecom_sum(today)
        store_month = await _ecom_sum(month_start)
        store_year = await _ecom_sum(year_start)
        pos_today = {"total": today_result[0]["total"] if today_result else 0, "count": today_result[0]["count"] if today_result else 0}
        pos_month = {"total": month_result[0]["total"] if month_result else 0, "count": month_result[0]["count"] if month_result else 0}
        pos_year = {"total": year_result[0]["total"] if year_result else 0, "count": year_result[0]["count"] if year_result else 0}

        def _merge(pos, store):
            return {"total": round(pos["total"] + store["total"], 2), "count": pos["count"] + store["count"]}

        return {
            "today": _merge(pos_today, store_today),
            "month": _merge(pos_month, store_month),
            "year": _merge(pos_year, store_year),
            "store": {"today": store_today, "month": store_month, "year": store_year},
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
            product_ids = {item.get("product_id") for sale in monthly_sales for item in sale.get("items", [])}
            products_cache = await product_price_map(db, product_ids)
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

        # p87: web-store orders are already inside `sales` (source=webstore),
        # so revenue/COGS above include them — just expose the breakdown.
        ecom_revenue = ecom_cogs = 0
        try:
            ecom_sales = await db.sales.find(
                {"created_at": {"$gte": month_start}, "status": {"$ne": "returned"}, "source": "webstore"},
                {"_id": 0, "total": 1, "items": 1},
            ).to_list(5000)
            ecom_revenue = round(sum(float(s.get("total") or 0) for s in ecom_sales), 2)
            for s in ecom_sales:
                for it in (s.get("items") or []):
                    ecom_cogs += int(it.get("quantity", 0) or 0) * float(it.get("purchase_price") or 0)
            ecom_cogs = round(ecom_cogs, 2)
        except Exception:
            ecom_revenue = ecom_cogs = 0

        return {
            "monthly_revenue": monthly_revenue,
            "monthly_purchase_cost": monthly_purchase_cost,
            "monthly_expenses": monthly_expenses,
            "monthly_profit": round(monthly_revenue - monthly_purchase_cost - monthly_expenses, 2),
            "ecom_revenue": ecom_revenue,
            "ecom_cogs": ecom_cogs,
        }

    # ── Analytics: Sales Chart ──
    @router.get("/analytics/sales-chart")
    async def get_sales_chart_data(period: str = "week", admin: dict = Depends(get_tenant_admin)):
        now = datetime.now(timezone.utc)
        if period == "year":
            start_date = (now - timedelta(days=365)).strftime("%Y-%m-%d")
        else:
            days = 7 if period == "week" else 30
            start_date = (now - timedelta(days=days)).strftime("%Y-%m-%d")

        result = await sales_chart_rows(db, start_date, monthly=(period == "year"))
        return {"period": period, "data": [{"date": r["_id"], "total": r["total"], "count": r["count"]} for r in result]}

    # ── Analytics: Top Products ──
    @router.get("/analytics/top-products")
    async def get_top_products(limit: int = 10, period: str = "month", admin: dict = Depends(get_tenant_admin)):
        now = datetime.now(timezone.utc)
        days = {"week": 7, "month": 30}.get(period, 365)
        start_date = (now - timedelta(days=days)).strftime("%Y-%m-%d")

        # p148: items carry product_name/total (not name/price) — defaults produced null names and zero revenue
        result = await top_products_rows(db, limit, start_date,
                                         name_field="product_name", revenue_mode="total",
                                         sort_key="total_revenue")
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
            {"stock": {"$type": "number"},
             "$expr": {"$lte": ["$stock", {"$ifNull": ["$min_stock", 5]}]}},
            {"_id": 0}
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
            current_stock = product.get("stock", 0)
            days_until_stockout = current_stock / daily_velocity if daily_velocity > 0 else 999
            suggested_quantity = max(int(daily_velocity * 60), product.get("low_stock_threshold", 10) * 2)
            urgency = "critical" if days_until_stockout <= 3 else ("high" if days_until_stockout <= 7 else ("medium" if days_until_stockout <= 14 else "low"))
            suggestions.append({
                "product_id": product["id"],
                "product_name": product.get("name_en", ""),
                "current_stock": current_stock,
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
        result = await sales_chart_rows(db, start_date)
        return [{"date": r["_id"], "total": r["total"], "count": r["count"]} for r in result]

    # ── Reports: Top Products (Legacy) ──
    @router.get("/reports/top-products")
    async def get_report_top_products(limit: int = 10, admin: dict = Depends(get_tenant_admin)):
        return await top_products_rows(db, limit, None, name_field="product_name",
                                       revenue_mode="total", sort_key="total_quantity")

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
        docs = await product_docs_map(db, (it.get("product_id") for s in sales for it in s.get("items", [])))
        total_cost = 0
        for sale in sales:
            for item in sale.get("items", []):
                product = docs.get(item["product_id"])
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
        docs = await product_docs_map(db, (it.get("product_id") for s in sales for it in s.get("items", [])))

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
                    product = docs.get(product_id)
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

    # ── p119: Comprehensive Daily Report — every business line, one endpoint ──
    @router.get("/reports/daily-full")
    async def get_daily_full_report(date: Optional[str] = None, admin: dict = Depends(get_tenant_admin)):
        day = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        next_day = (datetime.strptime(day, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
        in_day = {"$gte": day, "$lt": next_day}

        # 1) POS / inventory sales (webstore mirror rows are counted in the ecom line)
        pos_docs = await db.sales.find({"created_at": in_day, "source": {"$ne": "webstore"},
                                        "type": {"$nin": ["recharge_credit", "recharge_cash", "digital_subscription", "sim_activation"]}}, {"_id": 0}).to_list(5000)
        pos_active = [s for s in pos_docs if s.get("status") != "returned"]
        pos_returned = [s for s in pos_docs if s.get("status") == "returned"]
        pos_ids = [it.get("product_id") for s in pos_active for it in (s.get("items") or [])]
        pmap = await product_docs_map(db, pos_ids)
        pos_profit = 0.0
        for s in pos_active:
            for it in (s.get("items") or []):
                pp = it.get("purchase_price")
                if pp is None:
                    pp = (pmap.get(it.get("product_id")) or {}).get("purchase_price", 0)
                # p148: sale items store unit_price (never "price") — wrong field made profit negative
                pos_profit += ((it.get("unit_price") or it.get("price") or 0) - (pp or 0)) * (it.get("quantity") or 1)
        pos = {
            "count": len(pos_active),
            "total": round(sum(s.get("total") or 0 for s in pos_active), 2),
            "cash": round(sum(s.get("paid_amount") or 0 for s in pos_active if s.get("payment_method") == "cash"), 2),
            "debt": round(sum(s.get("debt_amount") or 0 for s in pos_active), 2),
            "profit": round(pos_profit, 2),
            "returned_count": len(pos_returned),
            "returned_total": round(sum(s.get("total") or 0 for s in pos_returned), 2),
        }

        # 2) E-commerce store (status_history drives delivered/cancelled/refunded "today")
        ecom_new = await db.ecom_orders.find({"created_at": in_day}, {"_id": 0, "status": 1, "total": 1}).to_list(3000)
        ecom_delivered = await db.ecom_orders.find(
            {"status_history": {"$elemMatch": {"status": "delivered", "at": in_day}}},
            {"_id": 0, "total": 1, "shipping_fee": 1}).to_list(3000)
        ecom_cancelled = await db.ecom_orders.count_documents(
            {"status_history": {"$elemMatch": {"status": "cancelled", "at": in_day}}})
        ecom_refunded = await db.ecom_orders.count_documents(
            {"status_history": {"$elemMatch": {"status": "refunded", "at": in_day}}})
        ecom_shipped = await db.ecom_orders.find({"status": "shipped"}, {"_id": 0, "total": 1, "shipping_fee": 1}).to_list(3000)
        ecom = {
            "new_count": len(ecom_new),
            "new_total": round(sum(o.get("total") or 0 for o in ecom_new), 2),
            "delivered_count": len(ecom_delivered),
            "delivered_total": round(sum(o.get("total") or 0 for o in ecom_delivered), 2),
            "cancelled_today": ecom_cancelled,
            "refunded_today": ecom_refunded,
            "in_transit_count": len(ecom_shipped),
            "in_transit_total": round(sum(max((o.get("total") or 0) - (o.get("shipping_fee") or 0), 0) for o in ecom_shipped), 2),
        }

        # 3) Balance recharge service
        recharge_agg = await db.recharges.aggregate([
            {"$match": {"created_at": in_day}},
            {"$group": {"_id": None, "count": {"$sum": 1}, "amount": {"$sum": "$amount"}, "profit": {"$sum": "$profit"}}}
        ]).to_list(1)
        recharge = {"count": 0, "amount": 0, "profit": 0}
        if recharge_agg:
            r0 = recharge_agg[0]
            recharge = {"count": r0.get("count", 0), "amount": round(r0.get("amount") or 0, 2), "profit": round(r0.get("profit") or 0, 2)}

        # 4) Digital services / IPTV
        dig_docs = await db.digital_orders.find({"created_at": in_day}, {"_id": 0, "status": 1, "amount": 1, "product_type": 1}).to_list(3000)
        dig_done = [d for d in dig_docs if d.get("status") == "COMPLETED"]
        by_type = {}
        for d in dig_docs:
            tpe = d.get("product_type") or "OTHER"
            by_type[tpe] = by_type.get(tpe, 0) + 1
        # p165: IPTV/digital panel subscriptions sold today (the real IPTV sales line)
        subs_docs = await db.digital_subscriptions.find({"created_at": in_day}, {"_id": 0, "price": 1, "profit": 1, "category": 1}).to_list(3000)
        subs_revenue = round(sum(s.get("price") or 0 for s in subs_docs), 2)
        digital = {
            "count": len(dig_docs),
            "completed_count": len(dig_done),
            "revenue": round(sum(d.get("amount") or 0 for d in dig_done), 2),
            "pending_count": len([d for d in dig_docs if d.get("status") == "PENDING"]),
            "by_type": by_type,
            "subs_count": len(subs_docs),
            "subs_revenue": subs_revenue,
            "subs_profit": round(sum(s.get("profit") or 0 for s in subs_docs), 2),
        }

        # p165: SIM card activations sold today
        sim_act_docs = await db.sim_activations.find({"created_at": in_day}, {"_id": 0, "sale_price": 1, "profit": 1}).to_list(3000)
        sim_activations = {
            "count": len(sim_act_docs),
            "revenue": round(sum(s.get("sale_price") or 0 for s in sim_act_docs), 2),
            "profit": round(sum(s.get("profit") or 0 for s in sim_act_docs), 2),
        }

        # 5) Repairs / maintenance
        rep_received = await db.repair_tickets.count_documents({"received_at": in_day})
        rep_delivered_docs = await db.repair_tickets.find({"delivered_at": in_day}, {"_id": 0, "final_cost": 1}).to_list(2000)
        rep_in_progress = await db.repair_tickets.count_documents({"status": {"$nin": ["delivered", "cancelled"]}})
        repairs = {
            "received_today": rep_received,
            "delivered_today": len(rep_delivered_docs),
            "revenue": round(sum(t.get("final_cost") or 0 for t in rep_delivered_docs), 2),
            "in_progress": rep_in_progress,
        }

        # 6) Expenses + capital snapshot
        # p148: expenses.date is a full ISO datetime — exact string match never hits; use the day range
        exp_agg = await db.expenses.aggregate([
            {"$match": {"date": in_day}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
        ]).to_list(1)
        expenses = {"total": round(exp_agg[0]["total"], 2), "count": exp_agg[0]["count"]} if exp_agg else {"total": 0, "count": 0}
        boxes = await db.cash_boxes.find({}, {"_id": 0, "id": 1, "name": 1, "balance": 1}).to_list(50)
        # p162: unified real-capital formula — stock value at cost + business boxes − unboxed today expenses
        boxes_total = round(sum(b.get("balance", 0) for b in boxes if b.get("id") != "personal"), 2)
        stock_val_agg2 = await db.products.aggregate([
            {"$group": {"_id": None, "total": {"$sum": {"$multiply": [
                {"$convert": {"input": "$purchase_price", "to": "double", "onError": 0, "onNull": 0}},
                {"$convert": {"input": "$quantity", "to": "double", "onError": 0, "onNull": 0}}
            ]}}}}
        ]).to_list(1)
        stock_value2 = round(stock_val_agg2[0]["total"], 2) if stock_val_agg2 else 0
        unboxed_exp_agg2 = await db.expenses.aggregate([
            {"$match": {
                "date": in_day,
                "$or": [{"payment_method": {"$exists": False}}, {"payment_method": None}, {"payment_method": ""}],
                "currency": {"$ne": "USD"},
            }},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]).to_list(1)
        unboxed_exp2 = round(unboxed_exp_agg2[0]["total"], 2) if unboxed_exp_agg2 else 0

        # p165: capital also counts the flexy/IPTV wallet and operator SIM balances
        flexy_wallet2 = 0.0
        try:
            if main_db is not None:
                _ent2 = admin.get("tenant_id") or admin.get("id", "")
                _w2 = await main_db.wallets.find_one({"entity_id": _ent2}, {"_id": 0, "balance": 1})
                flexy_wallet2 = round(float((_w2 or {}).get("balance", 0) or 0), 2)
        except Exception:
            flexy_wallet2 = 0.0
        sim_slots2 = await db.sim_slots.find({}, {"_id": 0}).to_list(20)
        sim_balance2 = round(sum(float(s.get("balance", 0) or 0) + float(s.get("bonus_balance", 0) or 0) for s in sim_slots2), 2)
        sim_stock2 = round(sum(float(s.get("empty_sims", 0) or 0) * float(s.get("sim_unit_cost", 0) or 0) for s in sim_slots2), 2)
        capital = round(stock_value2 + boxes_total - unboxed_exp2 + flexy_wallet2 + sim_balance2 + sim_stock2, 2)

        total_revenue = round(pos["total"] + ecom["delivered_total"] + recharge["amount"] + digital["revenue"] + digital["subs_revenue"] + sim_activations["revenue"] + repairs["revenue"], 2)

        return {
            "date": day,
            "pos": pos, "ecom": ecom, "recharge": recharge,
            "digital": digital, "repairs": repairs,
            "expenses": expenses, "capital": capital, "cash_boxes": boxes,
            "stock_value": stock_value2,
            "sim_activations": sim_activations,
            "flexy_wallet_balance": flexy_wallet2,
            "sim_balance_total": sim_balance2,
            "sim_stock_value": sim_stock2,
            "total_revenue": total_revenue,
        }

    return router
