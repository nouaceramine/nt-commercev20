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
            {"_id": 0, "id": 1, "created_at": 1, "last_message_at": 1}
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
    
    @router.get("/forecast/{forecast_type}")
    async def get_forecast(forecast_type: str, periods: int = 3, user=Depends(get_current_user)):
        """Get financial forecast"""
        if forecast_type not in ["revenue", "cash_flow"]:
            raise HTTPException(status_code=400, detail="Invalid forecast type")
        
        manager = AIAgentsManager(db)
        agent = manager.get_agent("forecaster")
        
        if forecast_type == "revenue":
            result = await agent.forecast_revenue(periods)
        else:
            result = await agent.forecast_cash_flow(periods)
        
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
    
    return router
