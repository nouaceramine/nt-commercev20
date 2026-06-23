"""
AI Assistant Routes - Extracted from server.py
AI Chat, Analysis (sales forecast, restock suggestions, product descriptions, customer insights)
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import os
import logging

logger = logging.getLogger("nt-commerce.ai")


def create_ai_assistant_routes(db, get_current_user, get_tenant_admin, require_tenant) -> dict:
    router = APIRouter(prefix="/ai-assistant", tags=["ai-assistant"])

    class AIChatRequest(BaseModel):
        message: str
        session_id: str = ""
        context: Optional[str] = None

    class AIChatResponse(BaseModel):
        response: str
        session_id: str

    class AIAnalysisRequest(BaseModel):
        analysis_type: str
        data: Optional[dict] = None

    def get_ai_system_message(context: str = None) -> str:
        base_msg = """أنت مساعد ذكي لنظام نقاط البيع (POS). يمكنك المساعدة في:
- تحليل المبيعات وتوقعها
- اقتراح المنتجات التي تحتاج إعادة تخزين
- إنشاء أوصاف للمنتجات
- الإجابة على أسئلة حول المخزون والعملاء والموردين
- تقديم نصائح لتحسين الأعمال
كن مختصراً ومفيداً. أجب باللغة العربية أو الفرنسية حسب لغة السؤال."""
        ctx_map = {
            "sales": "\n\nأنت الآن في قسم المبيعات. ركز على تحليل المبيعات وتوقعاتها.",
            "inventory": "\n\nأنت الآن في قسم المخزون. ركز على إدارة المخزون واقتراحات إعادة التخزين.",
            "products": "\n\nأنت الآن في قسم المنتجات. ساعد في إنشاء أوصاف وتحسين معلومات المنتجات.",
            "customers": "\n\nأنت الآن في قسم العملاء. ساعد في فهم سلوك العملاء وتحسين العلاقات.",
            "reports": "\n\nأنت الآن في قسم التقارير. ساعد في تحليل البيانات وإنشاء تقارير مفيدة."
        }
        return base_msg + ctx_map.get(context, "")

    @router.post("/chat", response_model=AIChatResponse)
    async def ai_chat(request: AIChatRequest, user: dict = Depends(require_tenant)):
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
        except ImportError:
            raise HTTPException(status_code=503, detail="AI service not available")
        emergent_key = os.environ.get('EMERGENT_LLM_KEY')
        if not emergent_key:
            raise HTTPException(status_code=500, detail="AI API key not configured")
        try:
            session_id = f"{user['id']}_{request.session_id}" if request.session_id else f"{user['id']}_default"
            chat_history = await db.ai_chat_history.find_one({"session_id": session_id}, {"_id": 0})
            chat = LlmChat(api_key=emergent_key, session_id=session_id, system_message=get_ai_system_message(request.context)).with_model("openai", "gpt-4o")
            context_data = ""
            if request.context == "sales":
                recent_sales = await db.sales.find({}, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10)
                total_today = sum(s.get("total", 0) for s in recent_sales if s.get("created_at", "").startswith(datetime.now(timezone.utc).strftime("%Y-%m-%d")))
                context_data = f"\n\nبيانات المبيعات: إجمالي اليوم: {total_today} دج"
            elif request.context == "inventory":
                low_stock = await db.products.find({"quantity": {"$lt": 10}}, {"_id": 0}).to_list(20)
                context_data = f"\n\nالمنتجات منخفضة المخزون: {len(low_stock)} منتج"
            elif request.context == "customers":
                total_customers = await db.customers.count_documents({})
                context_data = f"\n\nإجمالي العملاء: {total_customers}"
            response = await chat.send_message(UserMessage(text=request.message + context_data))
            if not chat_history:
                chat_history = {"session_id": session_id, "user_id": user['id'], "messages": [], "created_at": datetime.now(timezone.utc).isoformat()}
            chat_history["messages"].append({"role": "user", "content": request.message, "timestamp": datetime.now(timezone.utc).isoformat()})
            chat_history["messages"].append({"role": "assistant", "content": response, "timestamp": datetime.now(timezone.utc).isoformat()})
            chat_history["updated_at"] = datetime.now(timezone.utc).isoformat()
            if len(chat_history["messages"]) > 50:
                chat_history["messages"] = chat_history["messages"][-50:]
            await db.ai_chat_history.update_one({"session_id": session_id}, {"$set": chat_history}, upsert=True)
            return AIChatResponse(response=response, session_id=session_id)
        except Exception as e:
            logger.error(f"AI chat error: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal server error")

    @router.get("/chat-history/{session_id}")
    async def get_ai_chat_history(session_id: str, user: dict = Depends(require_tenant)):
        full_session_id = f"{user['id']}_{session_id}"
        history = await db.ai_chat_history.find_one({"session_id": full_session_id}, {"_id": 0})
        return {"messages": history.get("messages", []) if history else []}

    @router.delete("/chat-history/{session_id}")
    async def clear_ai_chat_history(session_id: str, user: dict = Depends(require_tenant)):
        await db.ai_chat_history.delete_one({"session_id": f"{user['id']}_{session_id}"})
        return {"success": True}

    @router.post("/analyze")
    async def ai_analyze(request: AIAnalysisRequest, user: dict = Depends(require_tenant)):
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
        except ImportError:
            raise HTTPException(status_code=503, detail="AI service not available")
        emergent_key = os.environ.get('EMERGENT_LLM_KEY')
        if not emergent_key:
            raise HTTPException(status_code=500, detail="AI API key not configured")
        try:
            chat = LlmChat(api_key=emergent_key, session_id=f"analysis_{user['id']}_{datetime.now(timezone.utc).timestamp()}", system_message="أنت محلل بيانات ذكي لنظام نقاط البيع. قدم تحليلات مختصرة ومفيدة باللغة العربية.").with_model("openai", "gpt-4o")
            if request.analysis_type == "sales_forecast":
                sales = await db.sales.find({}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
                daily_sales = {}
                for sale in sales:
                    date = sale.get("created_at", "")[:10]
                    if date:
                        daily_sales[date] = daily_sales.get(date, 0) + sale.get("total", 0)
                prompt = f"بناءً على بيانات المبيعات التالية، قدم توقعاً مختصراً للمبيعات:\n{dict(list(daily_sales.items())[:14])}"
                response = await chat.send_message(UserMessage(text=prompt))
                return {"analysis": response, "type": "sales_forecast"}
            elif request.analysis_type == "restock":
                products = await db.products.find({"quantity": {"$lte": 20}}, {"_id": 0}).to_list(50)
                product_list = [f"- {p.get('name_ar', '')}: كمية {p.get('quantity', 0)}" for p in products[:20]]
                prompt = f"هذه المنتجات تحتاج مراجعة:\n{chr(10).join(product_list)}\nقدم ترتيباً حسب الأولوية."
                response = await chat.send_message(UserMessage(text=prompt))
                return {"analysis": response, "type": "restock"}
            elif request.analysis_type == "product_description":
                product_data = request.data or {}
                prompt = f"اكتب وصفاً تسويقياً جذاباً للمنتج: {product_data.get('name', 'منتج')}\nالتفاصيل: {product_data}\nأجب بالعربية والفرنسية."
                response = await chat.send_message(UserMessage(text=prompt))
                return {"analysis": response, "type": "product_description"}
            elif request.analysis_type == "customer_insights":
                customers = await db.customers.find({}, {"_id": 0}).to_list(100)
                total_debt = sum(c.get("debt", 0) for c in customers)
                prompt = f"حلل بيانات العملاء: إجمالي {len(customers)} عميل، ديون {total_debt} دج"
                response = await chat.send_message(UserMessage(text=prompt))
                return {"analysis": response, "type": "customer_insights"}
            else:
                raise HTTPException(status_code=400, detail="Unknown analysis type")
        except Exception as e:
            logger.error(f"AI analysis error: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal server error")

    return router
