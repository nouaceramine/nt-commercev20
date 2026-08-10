"""
AI Assistant Routes — LLM-backed when a provider is configured, otherwise a
local data-driven Arabic assistant (queries the store DB and answers common
intents: sales, stock, debts, customers, products).
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
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

    def _llm():
        """Return an AsyncOpenAI client if an OpenAI-compatible provider is configured, else None.

        Security: never import `emergentintegrations` here -- that PyPI package
        is confirmed malware (MAL-2026-2702, credential stealer).
        """
        key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
        if not key:
            return None
        try:
            from openai import AsyncOpenAI
            base_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL") or None
            return AsyncOpenAI(api_key=key, base_url=base_url)
        except Exception:
            return None

    async def _llm_answer(system_message: str, prompt: str) -> str:
        client = _llm()
        if not client:
            return ""
        model = os.environ.get("AI_INTEGRATIONS_OPENAI_MODEL", "gpt-4o-mini")
        resp = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": prompt},
            ],
        )
        return resp.choices[0].message.content or ""

    # ── Local data helpers ──
    async def _store_snapshot():
        now = datetime.now(timezone.utc)
        today = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        week = (now - timedelta(days=7)).isoformat()
        month = (now - timedelta(days=30)).isoformat()

        async def sum_sales(since):
            agg = await db.sales.aggregate([
                {"$match": {"created_at": {"$gte": since}, "status": {"$ne": "returned"}}},
                {"$group": {"_id": None, "t": {"$sum": "$total"}, "n": {"$sum": 1}}},
            ]).to_list(1)
            return (agg[0]["t"], agg[0]["n"]) if agg else (0, 0)

        t_today, n_today = await sum_sales(today)
        t_week, n_week = await sum_sales(week)
        t_month, n_month = await sum_sales(month)
        low_stock = await db.products.find(
            {"$expr": {"$lte": ["$stock", {"$ifNull": ["$min_stock", 5]}]}},
            {"_id": 0, "name": 1, "name_ar": 1, "stock": 1},
        ).limit(10).to_list(10)
        debts = await db.debts.aggregate([
            {"$match": {"remaining_amount": {"$gt": 0}}},
            {"$group": {"_id": None, "t": {"$sum": "$remaining_amount"}, "n": {"$sum": 1}}},
        ]).to_list(1)
        top_products = await db.sales.aggregate([
            {"$unwind": "$items"},
            {"$group": {"_id": "$items.product_name", "qty": {"$sum": "$items.quantity"}, "total": {"$sum": {"$multiply": ["$items.quantity", {"$ifNull": ["$items.price", 0]}]}}}},
            {"$sort": {"total": -1}},
            {"$limit": 5},
        ]).to_list(5)
        return {
            "today": (t_today, n_today), "week": (t_week, n_week), "month": (t_month, n_month),
            "low_stock": low_stock,
            "debts": (debts[0]["t"], debts[0]["n"]) if debts else (0, 0),
            "customers": await db.customers.count_documents({}),
            "products": await db.products.count_documents({}),
            "top_products": top_products,
        }

    def _fmt(v):
        return f"{v:,.0f}".replace(",", " ")

    async def _local_answer(msg: str) -> str:
        s = await _store_snapshot()
        m = msg.lower()
        if any(w in m for w in ["مبيعات اليوم", "اليوم", "today"]):
            t, n = s["today"]
            return f"📊 مبيعات اليوم: **{_fmt(t)} دج** عبر {n} عملية بيع."
        if any(w in m for w in ["أسبوع", "week"]):
            t, n = s["week"]
            return f"📊 مبيعات آخر 7 أيام: **{_fmt(t)} دج** عبر {n} عملية بيع."
        if any(w in m for w in ["شهر", "month"]):
            t, n = s["month"]
            return f"📊 مبيعات آخر 30 يوماً: **{_fmt(t)} دج** عبر {n} عملية بيع."
        if any(w in m for w in ["مخزون", "نفد", "نواقص", "stock", "تخزين"]):
            if not s["low_stock"]:
                return "✅ لا توجد منتجات منخفضة المخزون حالياً."
            lines = [f"- {p.get('name_ar') or p.get('name')}: متبقٍ {p.get('stock', 0)}" for p in s["low_stock"]]
            return "⚠️ منتجات منخفضة المخزون:\n" + "\n".join(lines)
        if any(w in m for w in ["ديون", "دين", "debt", "مستحقات"]):
            t, n = s["debts"]
            return f"💳 الديون غير المسددة: **{_fmt(t)} دج** موزعة على {n} ديناً." if n else "✅ لا توجد ديون غير مسددة."
        if any(w in m for w in ["عملاء", "customer"]):
            return f"👥 عدد العملاء المسجلين: **{s['customers']}**."
        if any(w in m for w in ["منتجات", "منتج", "product"]):
            return f"📦 عدد المنتجات: **{s['products']}**."
        if any(w in m for w in ["أفضل", "الأكثر مبيعاً", "top"]):
            if not s["top_products"]:
                return "لا توجد بيانات مبيعات كافية بعد."
            lines = [f"- {p['_id'] or 'منتج'}: {_fmt(p['total'])} دج ({p['qty']} قطعة)" for p in s["top_products"]]
            return "🏆 الأكثر مبيعاً:\n" + "\n".join(lines)
        t_t, n_t = s["today"]
        t_w, _ = s["week"]
        return (
            "إليك نظرة سريعة على متجرك:\n"
            f"• مبيعات اليوم: **{_fmt(t_t)} دج** ({n_t} عملية)\n"
            f"• مبيعات الأسبوع: **{_fmt(t_w)} دج**\n"
            f"• المنتجات: {s['products']} | العملاء: {s['customers']}\n"
            f"• نواقص المخزون: {len(s['low_stock'])} منتجات\n\n"
            "اسألني عن: مبيعات اليوم/الأسبوع/الشهر، المخزون، الديون، العملاء، أو الأكثر مبيعاً."
        )

    @router.post("/chat", response_model=AIChatResponse)
    async def ai_chat(request: AIChatRequest, user: dict = Depends(get_current_user)):
        session_id = f"{user['id']}_{request.session_id}" if request.session_id else f"{user['id']}_default"
        answer = ""
        try:
            answer = await _llm_answer(
                "أنت مساعد ذكي لنظام نقاط بيع. أجب بالعربية باختصار وفائدة.",
                request.message,
            )
        except Exception as exc:
            logger.warning("LLM chat failed, falling back to local: %s", exc)
        if not answer:
            answer = await _local_answer(request.message)
        try:
            await db.ai_chat_history.update_one(
                {"session_id": session_id},
                {"$push": {"messages": {"user": request.message, "assistant": answer,
                                        "at": datetime.now(timezone.utc).isoformat()}},
                 "$setOnInsert": {"session_id": session_id, "user_id": user["id"]}},
                upsert=True,
            )
        except Exception:
            pass
        return AIChatResponse(response=answer, session_id=session_id)

    @router.get("/chat-history/{session_id}")
    async def get_chat_history(session_id: str, user: dict = Depends(get_current_user)):
        doc = await db.ai_chat_history.find_one(
            {"session_id": f"{user['id']}_{session_id}"}, {"_id": 0}
        )
        return doc or {"messages": []}

    @router.delete("/chat-history/{session_id}")
    async def clear_chat_history(session_id: str, user: dict = Depends(get_current_user)):
        await db.ai_chat_history.delete_one({"session_id": f"{user['id']}_{session_id}"})
        return {"success": True}

    @router.post("/analyze")
    async def ai_analyze(request: AIAnalysisRequest, user: dict = Depends(require_tenant)):
        if request.analysis_type == "sales_forecast":
            try:
                sales = await db.sales.find({}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
                daily_sales = {}
                for sale in sales:
                    date = sale.get("created_at", "")[:10]
                    if date:
                        daily_sales[date] = daily_sales.get(date, 0) + sale.get("total", 0)
                prompt = "بناءً على بيانات المبيعات التالية، قدم توقعاً مختصراً للمبيعات:\n" + str(dict(list(daily_sales.items())[:14]))
                analysis = await _llm_answer(
                    "أنت محلل بيانات ذكي لنظام نقاط البيع. قدم تحليلات مختصرة ومفيدة باللغة العربية.",
                    prompt,
                )
                if analysis:
                    return {"analysis": analysis, "type": "sales_forecast", "mode": "llm"}
            except Exception as exc:
                logger.warning("LLM analyze failed, falling back to local: %s", exc)

        # ── تحليل محلي مبني على البيانات ──
        s = await _store_snapshot()
        if request.analysis_type == "sales_forecast":
            t_week, n_week = s["week"]
            daily_avg = t_week / 7 if t_week else 0
            return {
                "analysis": (
                    f"متوسط المبيعات اليومية (آخر 7 أيام): **{_fmt(daily_avg)} دج**.\n"
                    f"التوقع للأسبوع القادم: **{_fmt(daily_avg * 7)} دج** تقريباً "
                    f"({n_week} عملية متوقعة بنفس الوتيرة)."
                ),
                "type": "sales_forecast",
            }
        if request.analysis_type == "restock":
            if not s["low_stock"]:
                return {"analysis": "✅ المخزون بحالة جيدة — لا توجد منتجات تحتاج إعادة تخزين حالياً.", "type": "restock"}
            lines = [f"- {p.get('name_ar') or p.get('name')}: متبقٍ {p.get('stock', 0)}" for p in s["low_stock"]]
            return {"analysis": "المنتجات التي تحتاج إعادة تخزين (حسب الأولوية):\n" + "\n".join(lines), "type": "restock"}
        if request.analysis_type == "product_description":
            d = request.data or {}
            name = d.get("name") or d.get("name_ar") or "المنتج"
            return {"analysis": f"✨ {name} — جودة عالية وسعر منافس. متوفر الآن في متجرنا مع ضمان وخدمة ما بعد البيع.", "type": "product_description"}
        if request.analysis_type == "customer_insights":
            t_m, n_m = s["month"]
            avg = (t_m / n_m) if n_m else 0
            return {
                "analysis": (
                    f"👥 العملاء: {s['customers']} مسجلاً.\n"
                    f"متوسط قيمة الفاتورة (30 يوماً): **{_fmt(avg)} دج** عبر {n_m} عملية.\n"
                    f"الديون غير المسددة: **{_fmt(s['debts'][0])} دج**."
                ),
                "type": "customer_insights",
            }
        return {"analysis": "نوع التحليل غير معروف.", "type": request.analysis_type}

    @router.get("/status")
    async def ai_status(user: dict = Depends(get_current_user)):
        key_set = bool(os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY"))
        return {
            "llm_configured": key_set,
            "base_url_set": bool(os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")),
            "model": os.environ.get("AI_INTEGRATIONS_OPENAI_MODEL", "gpt-4o-mini"),
            "mode": "llm" if key_set else "local",
            "note": "" if key_set else "يعمل المساعد بإجابات محلية مبنية على بياناتك. لتفعيل نموذج لغوي كامل أضف AI_INTEGRATIONS_OPENAI_API_KEY و AI_INTEGRATIONS_OPENAI_BASE_URL في backend/.env",
        }

    return router
