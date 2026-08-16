"""
AI Accounting Routes for NT Commerce
Handles AI chat, insights, and agent endpoints
"""
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI"])


# ============ REQUEST/RESPONSE MODELS ============

class ChatRequest(BaseModel):
    message: str
    session_id: str = ""


class ChatResponse(BaseModel):
    session_id: str
    response: str
    data: Optional[dict] = None
    suggestions: list = []


class AgentTaskRequest(BaseModel):
    agent_type: str
    task_data: dict = {}


class InsightsDashboardResponse(BaseModel):
    insights: list
    financial_health: dict
    alerts: list


# ============ ROUTES ============

# These routes will be connected to the main app after db dependency injection


def create_ai_routes(db, get_current_user) -> dict:
    """Create AI routes with database dependency"""
    from services.ai.llm_service import get_llm_service
    from services.ai.agents import AIAgentsManager
    
    # ---------- p65: real data execution for chat queries ----------
    def _detect_query_type(message: str) -> str:
        m = message or ""
        if any(k in m for k in ["مصروف", "مصاريف", "مصارف"]):
            return "get_expenses"
        if any(k in m for k in ["ربح", "أرباح"]):
            return "get_profit"
        if any(k in m for k in ["إيراد", "ايراد", "مداخيل", "مدخول", "مبيعات"]):
            return "get_revenue"
        if any(k in m for k in ["رصيد", "نقدية", "نقد", "صندوق", "صناديق", "خزنة"]):
            return "get_cash_balance"
        if any(k in m for k in ["أفضل العملاء", "أفضل الزبائن", "افضل العملاء", "افضل الزبائن"]):
            return "get_top_customers"
        if any(k in m for k in ["أفضل المنتجات", "افضل المنتجات", "الأكثر مبيع"]):
            return "get_top_products"
        if any(k in m for k in ["متأخر", "مستحقات", "ديون"]):
            return "get_overdue_invoices"
        return "general_query"

    async def _sum_coll(coll: str, field: str, match: dict = None):
        pipeline = []
        if match:
            pipeline.append({"$match": match})
        pipeline.append({"$group": {"_id": None, "total": {"$sum": f"${field}"}, "count": {"$sum": 1}}})
        rows = await db[coll].aggregate(pipeline).to_list(1)
        if not rows:
            return 0.0, 0
        return float(rows[0]["total"] or 0), rows[0]["count"]

    async def _execute_ai_query(query_type: str):
        """Run the named query against real tenant data. Returns dict or None."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        month_start = today[:7]  # p65 fix: regex needs the YYYY-MM prefix, not first-day date
        try:
            if query_type == "get_revenue":
                m_total, m_count = await _sum_coll("sales", "total", {"created_at": {"$regex": f"^{month_start}"}})
                a_total, a_count = await _sum_coll("sales", "total")
                return {"kind": query_type, "month": today[:7], "month_revenue": m_total, "month_count": m_count,
                        "total_revenue": a_total, "total_count": a_count}
            if query_type == "get_expenses":
                m_total, m_count = await _sum_coll("expenses", "amount", {"date": {"$regex": f"^{month_start}"}})
                a_total, a_count = await _sum_coll("expenses", "amount")
                return {"kind": query_type, "month": today[:7], "month_expenses": m_total, "month_count": m_count,
                        "total_expenses": a_total, "total_count": a_count}
            if query_type == "get_profit":
                m_rev, _ = await _sum_coll("sales", "total", {"created_at": {"$regex": f"^{month_start}"}})
                m_exp, _ = await _sum_coll("expenses", "amount", {"date": {"$regex": f"^{month_start}"}})
                a_rev, _ = await _sum_coll("sales", "total")
                a_exp, _ = await _sum_coll("expenses", "amount")
                return {"kind": query_type, "month": today[:7],
                        "month_revenue": m_rev, "month_expenses": m_exp, "month_profit": m_rev - m_exp,
                        "total_revenue": a_rev, "total_expenses": a_exp, "total_profit": a_rev - a_exp}
            if query_type == "get_top_customers":
                rows = await db.sales.aggregate([
                    {"$match": {"customer_name": {"$nin": [None, ""]}}},
                    {"$group": {"_id": "$customer_name", "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
                    {"$sort": {"total": -1}}, {"$limit": 5}
                ]).to_list(5)
                return {"kind": query_type,
                        "top_customers": [{"name": r["_id"], "total": r["total"], "count": r["count"]} for r in rows]}
            if query_type == "get_top_products":
                rows = await db.sales.aggregate([
                    {"$unwind": "$items"},
                    {"$group": {"_id": "$items.product_name", "qty": {"$sum": "$items.quantity"}, "revenue": {"$sum": "$items.total"}}},
                    {"$sort": {"revenue": -1}}, {"$limit": 5}
                ]).to_list(5)
                return {"kind": query_type,
                        "top_products": [{"name": r["_id"], "qty": r["qty"], "revenue": r["revenue"]} for r in rows]}
            if query_type == "get_overdue_invoices":
                open_sales = await db.sales.find({"remaining": {"$gt": 0}},
                    {"_id": 0, "customer_name": 1, "total": 1, "remaining": 1, "created_at": 1}).sort("created_at", 1).to_list(20)
                overdue_debts = await db.debts.find({"status": "overdue"},
                    {"_id": 0, "party_name": 1, "remaining_amount": 1, "due_date": 1, "type": 1}).to_list(20)
                return {"kind": query_type, "open_sales": open_sales, "overdue_debts": overdue_debts,
                        "total_open": sum(float(s.get("remaining", 0)) for s in open_sales)}
            if query_type == "get_cash_balance":
                boxes = await db.cash_boxes.find({}, {"_id": 0, "id": 1, "name": 1, "balance": 1}).to_list(20)
                business_total = sum(float(b.get("balance", 0)) for b in boxes if b.get("id") != "personal")
                return {"kind": query_type, "boxes": boxes, "business_total": business_total}
            return None
        except Exception as e:
            logger.warning(f"p65 ai query exec failed ({query_type}): {e}")
            return None

    def _fmt(x: float) -> str:
        return f"{float(x):,.2f}"

    def _format_answer(query_type: str, data: dict) -> str:
        kind = data.get("kind", query_type)
        if kind == "get_expenses":
            return (f"إجمالي المصروفات المسجلة لهذا الشهر ({data['month']}): **{_fmt(data['month_expenses'])} دج** "
                    f"عبر {data['month_count']} عملية.\n"
                    f"إجمالي المصروفات منذ البداية: {_fmt(data['total_expenses'])} دج ({data['total_count']} عملية).")
        if kind == "get_revenue":
            return (f"إجمالي الإيرادات (المبيعات) لهذا الشهر ({data['month']}): **{_fmt(data['month_revenue'])} دج** "
                    f"عبر {data['month_count']} عملية بيع.\n"
                    f"إجمالي الإيرادات منذ البداية: {_fmt(data['total_revenue'])} دج ({data['total_count']} عملية).")
        if kind == "get_profit":
            return (f"هذا الشهر ({data['month']}): الإيرادات {_fmt(data['month_revenue'])} دج − المصروفات "
                    f"{_fmt(data['month_expenses'])} دج = **صافي {_fmt(data['month_profit'])} دج**.\n"
                    f"منذ البداية: إيرادات {_fmt(data['total_revenue'])} دج − مصروفات {_fmt(data['total_expenses'])} دج "
                    f"= صافي {_fmt(data['total_profit'])} دج.")
        if kind == "get_top_customers":
            items = data.get("top_customers") or []
            if not items:
                return "لا توجد مبيعات مسجلة بأسماء زبائن بعد."
            lines = [f"{i+1}. {c['name']}: {_fmt(c['total'])} دج ({c['count']} عملية)" for i, c in enumerate(items)]
            return "أفضل الزبائن حسب إجمالي المشتريات:\n" + "\n".join(lines)
        if kind == "get_top_products":
            items = data.get("top_products") or []
            if not items:
                return "لا توجد مبيعات منتجات مسجلة بعد."
            lines = [f"{i+1}. {p['name']}: {p['qty']} قطعة — {_fmt(p['revenue'])} دج" for i, p in enumerate(items)]
            return "أفضل المنتجات حسب الإيراد:\n" + "\n".join(lines)
        if kind == "get_overdue_invoices":
            sales = data.get("open_sales") or []
            debts = data.get("overdue_debts") or []
            if not sales and not debts:
                return "لا توجد فواتير مفتوحة أو ديون متأخرة. كل شيء مسدد."
            lines = [f"إجمالي المبالغ غير المسددة من الفواتير: **{_fmt(data.get('total_open', 0))} دج**."]
            for s in sales:
                lines.append(f"- فاتورة {s.get('customer_name') or 'زبون نقدي'}: متبقّي {_fmt(s.get('remaining', 0))} دج من {_fmt(s.get('total', 0))} دج")
            for d in debts:
                lines.append(f"- دين متأخر ({d.get('party_name', '')}): {_fmt(d.get('remaining_amount', 0))} دج — استحقاق {d.get('due_date', '')}")
            return "\n".join(lines)
        if kind == "get_cash_balance":
            boxes = data.get("boxes") or []
            if not boxes:
                return "لا توجد صناديق نقدية مهيأة بعد."
            lines = [f"- {b.get('name', b.get('id'))}: {_fmt(b.get('balance', 0))} دج" for b in boxes]
            lines.append(f"**إجمالي رأس المال في الصناديق: {_fmt(data.get('business_total', 0))} دج**")
            return "أرصدة الصناديق الحالية:\n" + "\n".join(lines)
        return ""

    @router.post("/chat", response_model=ChatResponse)
    async def chat_with_accountant(request: ChatRequest, user=Depends(get_current_user)):
        """Chat with AI accountant"""
        try:
            llm = get_llm_service(request.session_id if request.session_id else f"chat_{user['id']}")
            
            # Get context data
            context = {
                "user_name": user.get("name", ""),
                "company": user.get("company_name", ""),
                "role": user.get("role", ""),
                "date": datetime.now(timezone.utc).strftime("%Y-%m-%d")
            }
            
            # Add financial summary to context
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            month_start = today[:7] + "-01"
            
            # Get basic stats
            sales_today = await db.sales.count_documents({"created_at": {"$regex": f"^{today}"}})
            sales_total = await db.sales.aggregate([
                {"$match": {"created_at": {"$regex": f"^{today}"}}},
                {"$group": {"_id": None, "total": {"$sum": "$total"}}}
            ]).to_list(1)
            
            context["today_sales_count"] = sales_today
            context["today_revenue"] = sales_total[0]["total"] if sales_total else 0
            
            # Process query
            result = await llm.process_chat_query(request.message, context)

            # p65: actually execute the query the LLM named (it only describes it otherwise)
            query_type = result.get("query_type") or ""
            if query_type in ("", "general_query", "error"):
                query_type = _detect_query_type(request.message)
            if query_type and query_type not in ("general_query", "error"):
                data = await _execute_ai_query(query_type)
                if data is not None:
                    result["data"] = data
                    answer = _format_answer(query_type, data)
                    if answer:
                        result["response"] = answer
            
            # Store chat message
            chat_id = request.session_id if request.session_id else f"chat_{user['id']}_{datetime.now(timezone.utc).timestamp()}"
            await db.chat_sessions.update_one(
                {"id": chat_id},
                {
                    "$setOnInsert": {"id": chat_id, "user_id": user["id"], "created_at": datetime.now(timezone.utc).isoformat()},
                    "$push": {"messages": {
                        "role": "user",
                        "content": request.message,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }},
                    "$set": {"last_message_at": datetime.now(timezone.utc).isoformat()}
                },
                upsert=True
            )
            
            # Store assistant response
            await db.chat_sessions.update_one(
                {"id": chat_id},
                {"$push": {"messages": {
                    "role": "assistant",
                    "content": result.get("response", ""),
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }}}
            )
            
            return ChatResponse(
                session_id=chat_id,
                response=result.get("response", "عذراً، لم أتمكن من معالجة طلبك"),
                data=result.get("data"),
                suggestions=result.get("suggestions", [])
            )
            
        except Exception as e:
            logger.error(f"Chat error: {e}")
            raise HTTPException(status_code=500, detail="Internal server error")
    
    @router.get("/chat/sessions")
    async def get_chat_sessions(user=Depends(get_current_user)):
        """Get user's chat sessions"""
        sessions = await db.chat_sessions.find(
            {"user_id": user["id"]},
            {"_id": 0, "id": 1, "created_at": 1, "last_message_at": 1, "title": 1}
        ).sort("last_message_at", -1).to_list(50)
        return sessions
    
    @router.get("/chat/sessions/{session_id}")
    async def get_chat_session(session_id: str, user=Depends(get_current_user)):
        """Get a specific chat session"""
        session = await db.chat_sessions.find_one(
            {"id": session_id, "user_id": user["id"]},
            {"_id": 0}
        )
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        return session
    
    @router.get("/insights")
    async def get_ai_insights(user=Depends(get_current_user)):
        """Get AI-generated insights"""
        # Get recent insights
        insights = await db.ai_insights.find(
            {"is_dismissed": False},
            {"_id": 0}
        ).sort("created_at", -1).to_list(20)
        
        # Generate financial health
        manager = AIAgentsManager(db)
        
        # Get basic financial data
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        month_start = today[:7] + "-01"
        
        revenue = await db.sales.aggregate([
            {"$match": {"created_at": {"$gte": month_start}}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}}}
        ]).to_list(1)
        
        expenses = await db.expenses.aggregate([
            {"$match": {"expense_date": {"$gte": month_start}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]).to_list(1)
        
        cash_boxes = await db.cash_boxes.find({}, {"_id": 0, "balance": 1}).to_list(10)
        
        monthly_revenue = revenue[0]["total"] if revenue else 0
        monthly_expenses = expenses[0]["total"] if expenses else 0
        total_cash = sum(cb.get("balance", 0) for cb in cash_boxes)
        
        financial_health = {
            "monthly_revenue": monthly_revenue,
            "monthly_expenses": monthly_expenses,
            "net_profit": monthly_revenue - monthly_expenses,
            "cash_balance": total_cash,
            "profit_margin": (monthly_revenue - monthly_expenses) / monthly_revenue * 100 if monthly_revenue > 0 else 0
        }
        
        # Get recent alerts
        alerts = await db.fraud_alerts.find(
            {"is_resolved": False},
            {"_id": 0}
        ).sort("created_at", -1).to_list(10)
        
        return {
            "insights": insights,
            "financial_health": financial_health,
            "alerts": alerts
        }
    
    @router.post("/insights/{insight_id}/dismiss")
    async def dismiss_insight(insight_id: str, user=Depends(get_current_user)):
        """Dismiss an insight"""
        result = await db.ai_insights.update_one(
            {"id": insight_id},
            {"$set": {"is_dismissed": True, "dismissed_at": datetime.now(timezone.utc).isoformat()}}
        )
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Insight not found")
        return {"success": True}
    
    @router.post("/agents/run")
    async def run_agent_task(request: AgentTaskRequest, user=Depends(get_current_user)):
        """Run an AI agent task"""
        manager = AIAgentsManager(db)
        result = await manager.run_agent_task(request.agent_type, request.task_data)
        
        # Log task execution
        await db.agent_tasks.insert_one({
            "id": f"task_{datetime.now(timezone.utc).timestamp()}",
            "agent_type": request.agent_type,
            "task_data": request.task_data,
            "result": result,
            "user_id": user["id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        return result
    
    @router.get("/agents/status")
    async def get_agents_status(user=Depends(get_current_user)):
        """Get status of all AI agents"""
        agents = [
            {"id": "invoice_processor", "name": "معالج الفواتير", "name_en": "Invoice Processor", "is_enabled": True},
            {"id": "expense_classifier", "name": "مصنف المصروفات", "name_en": "Expense Classifier", "is_enabled": True},
            {"id": "financial_analyzer", "name": "المحلل المالي", "name_en": "Financial Analyzer", "is_enabled": True},
            {"id": "fraud_detector", "name": "كاشف الاحتيال", "name_en": "Fraud Detector", "is_enabled": True},
            {"id": "smart_reporter", "name": "مولد التقارير", "name_en": "Smart Reporter", "is_enabled": True},
            {"id": "tax_assistant", "name": "مساعد الضرائب", "name_en": "Tax Assistant", "is_enabled": True},
            {"id": "forecaster", "name": "المتنبئ", "name_en": "Forecaster", "is_enabled": True},
            {"id": "daily_automation", "name": "الأتمتة اليومية", "name_en": "Daily Automation", "is_enabled": True}
        ]
        
        # Get last run info for each agent
        for agent in agents:
            last_task = await db.agent_tasks.find_one(
                {"agent_type": agent["id"]},
                {"_id": 0, "created_at": 1, "result": 1}
            )
            if last_task:
                agent["last_run"] = last_task.get("created_at")
                agent["last_success"] = last_task.get("result", {}).get("success", False)
        
        return agents
    
    @router.post("/classify-expense")
    async def classify_expense(description: str, amount: float, vendor: str = "", user=Depends(get_current_user)):
        """Classify an expense using AI"""
        manager = AIAgentsManager(db)
        agent = manager.get_agent("expense_classifier")
        result = await agent.classify(description, amount, vendor)
        return result
    
    @router.post("/extract-invoice")
    async def extract_invoice_data(ocr_text: str, user=Depends(get_current_user)):
        """Extract invoice data from OCR text"""
        llm = get_llm_service()
        result = await llm.extract_invoice_data(ocr_text)
        return result
    
    def _build_math_fallback(forecast_type: str, historical_data: list, periods: int) -> dict:
        """p61: deterministic linear-trend fallback used when the LLM is too slow."""
        if forecast_type == "revenue":
            vals = [h.get("revenue", 0) for h in historical_data]
        else:
            vals = [h.get("net_cash", 0) for h in historical_data]
        n = len(vals)
        if n >= 2:
            slope = (vals[-1] - vals[0]) / (n - 1)
            base = vals[-1]
        else:
            slope, base = 0.0, (vals[0] if vals else 0.0)
        last_period = historical_data[-1]["period"] if historical_data else datetime.now(timezone.utc).strftime("%Y-%m")
        try:
            y, m = int(last_period[:4]), int(last_period[5:7])
        except Exception:
            now = datetime.now(timezone.utc)
            y, m = now.year, now.month
        forecasts = []
        for i in range(1, periods + 1):
            m += 1
            if m > 12:
                m = 1
                y += 1
            forecasts.append({
                "period": f"{y:04d}-{m:02d}",
                "value": max(0.0, round(base + slope * i, 2)),
                "confidence": 0.4,
            })
        trend = "up" if slope > 0 else ("down" if slope < 0 else "stable")
        return {
            "forecast_type": forecast_type,
            "historical_data": historical_data,
            "forecast": forecasts,
            "trend": trend,
            "confidence": 0.4,
            "insights": ["تنبؤ إحصائي مبسّط (اتجاه خطي) — نموذج الذكاء الاصطناعي بطيء حالياً"],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    async def _historical_for(forecast_type: str) -> list:
        """p61: same aggregations the forecaster agent runs (kept in sync)."""
        if forecast_type == "revenue":
            hist = await db.sales.aggregate([
                {"$group": {
                    "_id": {"$substr": ["$created_at", 0, 7]},
                    "total": {"$sum": "$total"},
                    "count": {"$sum": 1}
                }},
                {"$sort": {"_id": 1}},
                {"$limit": 12}
            ]).to_list(12)
            return [{"period": h["_id"], "revenue": h["total"], "sales_count": h["count"]} for h in hist]
        cash_in = await db.sales.aggregate([
            {"$group": {"_id": {"$substr": ["$created_at", 0, 7]}, "total": {"$sum": "$paid_amount"}}},
            {"$sort": {"_id": 1}},
            {"$limit": 12}
        ]).to_list(12)
        cash_out = await db.expenses.aggregate([
            {"$group": {"_id": {"$substr": ["$expense_date", 0, 7]}, "total": {"$sum": "$amount"}}},
            {"$sort": {"_id": 1}},
            {"$limit": 12}
        ]).to_list(12)
        out = []
        for ci in cash_in:
            co = next((c for c in cash_out if c["_id"] == ci["_id"]), {"total": 0})
            out.append({
                "period": ci["_id"],
                "cash_in": ci["total"],
                "cash_out": co["total"],
                "net_cash": ci["total"] - co["total"]
            })
        return out

    @router.get("/forecast/{forecast_type}")
    async def get_forecast(forecast_type: str, periods: int = 3, user=Depends(get_current_user)):
        """Get financial forecast"""
        if forecast_type not in ["revenue", "cash_flow"]:
            raise HTTPException(status_code=400, detail="Invalid forecast type")

        # p61: this endpoint calls the LLM synchronously (measured 2.6-6.2s) which
        # blocked the whole smart-dashboard. Cache per tenant+type+periods for 30 min
        # and cap the LLM wait at 12s with a deterministic fallback.
        import asyncio as _asyncio
        from services.cache_service import CacheManager
        _tenant_key = user.get("tenant_id") or user.get("id") or "anon"
        _cache_key = f"forecast:{_tenant_key}:{forecast_type}:{periods}"
        _cache = CacheManager()
        _cached = _cache.get(_cache_key)
        if _cached is not None:
            _cached["cached"] = True
            return _cached

        manager = AIAgentsManager(db)
        agent = manager.get_agent("forecaster")

        async def _llm_run():
            if forecast_type == "revenue":
                return await agent.forecast_revenue(periods)
            return await agent.forecast_cash_flow(periods)

        try:
            result = await _asyncio.wait_for(_llm_run(), timeout=12.0)
        except Exception as exc:  # timeout or LLM failure -> math fallback
            logger.warning("forecast LLM slow/failed (%s %s): %s — using math fallback",
                           forecast_type, periods, exc)
            try:
                hist = await _historical_for(forecast_type)
            except Exception:
                hist = []
            result = _build_math_fallback(forecast_type, hist, periods)

        # cache only meaningful results (never cache an empty failure)
        if result and result.get("forecast"):
            _cache.set(_cache_key, result, ttl=1800)
        return result
    
    @router.get("/daily-summary")
    async def get_daily_summary(date: str = None, user=Depends(get_current_user)):
        """Get daily financial summary"""
        if not date:
            date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        # Check if we have a cached summary
        cached = await db.daily_reports.find_one({"date": date}, {"_id": 0})
        if cached:
            return cached.get("results", {}).get("summary", {})
        
        # Generate new summary
        manager = AIAgentsManager(db)
        agent = manager.get_agent("daily_automation")
        result = await agent.run_daily_tasks()
        
        return result.get("summary", {})
    
    @router.get("/financial-health")
    async def get_financial_health(user=Depends(get_current_user)):
        """Get overall financial health score"""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        month_start = today[:7] + "-01"
        year_start = today[:4] + "-01-01"
        
        # Get metrics
        revenue = await db.sales.aggregate([
            {"$match": {"created_at": {"$gte": month_start}}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}}}
        ]).to_list(1)
        
        expenses = await db.expenses.aggregate([
            {"$match": {"expense_date": {"$gte": month_start}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]).to_list(1)
        
        cash_boxes = await db.cash_boxes.find({}, {"_id": 0, "balance": 1}).to_list(10)
        
        receivables = await db.customers.aggregate([
            {"$group": {"_id": None, "total": {"$sum": "$balance"}}}
        ]).to_list(1)
        
        payables = await db.suppliers.aggregate([
            {"$group": {"_id": None, "total": {"$sum": "$balance"}}}
        ]).to_list(1)
        
        monthly_revenue = revenue[0]["total"] if revenue else 0
        monthly_expenses = expenses[0]["total"] if expenses else 0
        total_cash = sum(cb.get("balance", 0) for cb in cash_boxes)
        total_receivables = receivables[0]["total"] if receivables else 0
        total_payables = payables[0]["total"] if payables else 0
        
        # Calculate health indicators
        profit_margin = (monthly_revenue - monthly_expenses) / monthly_revenue * 100 if monthly_revenue > 0 else 0
        liquidity_ratio = total_cash / total_payables if total_payables > 0 else 10
        
        # Calculate overall score (0-100)
        score = min(100, max(0, 
            (50 if profit_margin > 10 else profit_margin * 5) +
            (30 if liquidity_ratio > 1.5 else liquidity_ratio * 20) +
            (20 if total_cash > 0 else 0)
        ))
        
        # Calculate cash runway
        daily_expenses = monthly_expenses / 30 if monthly_expenses > 0 else 1
        cash_runway = int(total_cash / daily_expenses) if daily_expenses > 0 else 365
        
        return {
            "overall_score": round(score, 1),
            "profit_margin": round(profit_margin, 2),
            "liquidity_ratio": round(liquidity_ratio, 2),
            "cash_balance": total_cash,
            "cash_runway_days": cash_runway,
            "monthly_revenue": monthly_revenue,
            "monthly_expenses": monthly_expenses,
            "net_income": monthly_revenue - monthly_expenses,
            "receivables": total_receivables,
            "payables": total_payables,
            "health_indicators": [
                {"name": "هامش الربح", "value": profit_margin, "status": "good" if profit_margin > 10 else "warning"},
                {"name": "نسبة السيولة", "value": liquidity_ratio, "status": "good" if liquidity_ratio > 1.5 else "warning"},
                {"name": "الرصيد النقدي", "value": total_cash, "status": "good" if total_cash > 0 else "critical"}
            ],
            "generated_at": datetime.now(timezone.utc).isoformat()
        }
    
    # p118: delete chat sessions (user-scoped)
    @router.delete("/chat/sessions/{session_id}")
    async def delete_chat_session(session_id: str, user=Depends(get_current_user)):
        result = await db.chat_sessions.delete_one({"id": session_id, "user_id": user["id"]})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Session not found")
        return {"message": "deleted", "id": session_id}

    @router.delete("/chat/sessions")
    async def delete_all_chat_sessions(user=Depends(get_current_user)):
        result = await db.chat_sessions.delete_many({"user_id": user["id"]})
        return {"message": "deleted", "count": result.deleted_count}

    return router
