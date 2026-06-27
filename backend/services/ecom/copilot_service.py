"""E-Commerce AI Co-pilot Service (iter 18.4)

Conversational analytics assistant — answers natural-language questions about
revenue, channels, customers, and trends by feeding the current analytics
snapshot to the Emergent LLM key.

Stateless: each call rebuilds the analytics context fresh so answers always
reflect live data. Session id allows multi-turn conversation memory inside
a single user session (not persisted server-side).
"""
import os
import json
import logging
import uuid
from datetime import datetime, timezone, timedelta

from config.database import db

logger = logging.getLogger(__name__)


# ── Per-session in-memory chat history (lightweight; flushed on backend restart) ──
_SESSIONS: dict = {}
_MAX_HISTORY_PER_SESSION = 12


async def _gather_analytics_context(days: int = 30) -> dict:
    """Compact analytics snapshot fed to the LLM as system context."""
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    # Revenue by channel
    chan_rows = await db.ecom_orders.aggregate([
        {"$match": {"created_at": {"$gte": since}, "status": {"$nin": ["cancelled", "refunded"]}}},
        {"$group": {"_id": "$channel", "revenue": {"$sum": "$total"}, "orders": {"$sum": 1}}},
        {"$sort": {"revenue": -1}},
    ]).to_list(20)

    # Status breakdown
    status_rows = await db.ecom_orders.aggregate([
        {"$match": {"created_at": {"$gte": since}}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]).to_list(20)

    # Top products
    top_rows = await db.ecom_orders.aggregate([
        {"$match": {"created_at": {"$gte": since}, "status": {"$nin": ["cancelled", "refunded"]}}},
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.name", "qty": {"$sum": "$items.qty"}, "revenue": {"$sum": "$items.total"}}},
        {"$sort": {"revenue": -1}},
        {"$limit": 5},
    ]).to_list(5)

    # Leads
    leads_total = await db.ecom_leads.count_documents({"created_at": {"$gte": since}})
    leads_converted = await db.ecom_leads.count_documents({
        "created_at": {"$gte": since},
        "converted_order_id": {"$nin": [None, ""]},
    })

    # Previous period for delta comparison
    prev_since = (datetime.now(timezone.utc) - timedelta(days=days * 2)).isoformat()
    prev_until = since
    prev_rev = await db.ecom_orders.aggregate([
        {"$match": {"created_at": {"$gte": prev_since, "$lt": prev_until},
                    "status": {"$nin": ["cancelled", "refunded"]}}},
        {"$group": {"_id": None, "revenue": {"$sum": "$total"}, "orders": {"$sum": 1}}},
    ]).to_list(1)
    current_revenue = sum(r["revenue"] for r in chan_rows)
    previous_revenue = prev_rev[0]["revenue"] if prev_rev else 0
    delta_pct = round(((current_revenue - previous_revenue) / previous_revenue) * 100, 1) if previous_revenue else None

    return {
        "period_days": days,
        "current_revenue": round(current_revenue, 2),
        "previous_period_revenue": round(previous_revenue, 2),
        "revenue_growth_pct": delta_pct,
        "channels": [
            {"channel": r["_id"], "revenue": round(r["revenue"], 2), "orders": r["orders"]}
            for r in chan_rows
        ],
        "order_statuses": {r["_id"]: r["count"] for r in status_rows},
        "top_products": [
            {"name": r["_id"], "qty": r["qty"], "revenue": round(r["revenue"], 2)}
            for r in top_rows
        ],
        "leads_total": leads_total,
        "leads_converted": leads_converted,
        "lead_conversion_pct": round((leads_converted / leads_total) * 100, 1) if leads_total else 0,
    }


_COPILOT_SYSTEM = (
    "أنت مساعد تحليلات للتجارة الإلكترونية، تعمل لصاحب متجر جزائري متعدد القنوات (Shopify/Facebook/Instagram/WhatsApp/TikTok/Telegram/Viber). "
    "ستحصل في كل سؤال على لقطة JSON محدّثة عن الأداء (إيرادات، طلبات، قنوات، عملاء محتملون، نموّ). "
    "أجب بالعربية الفصحى المختصرة (لا تتجاوز 6 جمل) واستشهد بأرقام محدَّدة من البيانات. "
    "إذا كانت البيانات لا تكفي للإجابة بدقّة، اعترف بذلك واقترح تقارير إضافية يمكن للمستخدم استعراضها. "
    "تجنّب التخمين. أبدأ كل إجابة مباشرة بالنقطة الرئيسية بدون تمهيد."
)


async def answer_copilot_question(question: str, session_id: str = None, days: int = 30) -> dict:
    """Build context → ask Emergent LLM → return answer + retained session_id."""
    question = (question or "").strip()
    if not question:
        return {"answer": "اطرح سؤالاً واضحاً عن أداء متجرك.", "session_id": session_id or str(uuid.uuid4())}

    if not session_id:
        session_id = str(uuid.uuid4())

    history = _SESSIONS.get(session_id, [])
    context = await _gather_analytics_context(days)

    key = os.environ.get("EMERGENT_LLM_KEY") or os.environ.get("OPENAI_API_KEY")
    if not key:
        # Heuristic fallback
        if context["channels"]:
            top = context["channels"][0]
            ans = (
                f"أفضل قناة بيع لديك هي {top['channel']} بإيرادات {top['revenue']:,.0f} دج. "
                f"إجمالي الإيرادات خلال {days} يوم: {context['current_revenue']:,.0f} دج."
            )
            if context.get("revenue_growth_pct") is not None:
                arrow = "↑" if context["revenue_growth_pct"] >= 0 else "↓"
                ans += f" نمو الفترة: {arrow} {abs(context['revenue_growth_pct'])}%."
        else:
            ans = "لا توجد بيانات كافية خلال هذه الفترة. أضف قنوات بيع أو طلبات يدوية لبدء التحليل."
        return {"answer": ans, "session_id": session_id, "source": "heuristic"}

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage as EmUserMessage
        chat = (
            LlmChat(api_key=key, session_id=session_id, system_message=_COPILOT_SYSTEM)
            .with_model("openai", "gpt-4o-mini")
        )
        user_prompt = (
            "بيانات الأداء الحالية:\n"
            + json.dumps(context, ensure_ascii=False, indent=2)
            + f"\n\nالسؤال: {question}"
        )
        resp = await chat.send_message(EmUserMessage(text=user_prompt))
        answer = resp if isinstance(resp, str) else getattr(resp, "content", str(resp))

        # Track session history (trim to last N exchanges)
        history.append({"role": "user", "content": question})
        history.append({"role": "assistant", "content": answer})
        _SESSIONS[session_id] = history[-_MAX_HISTORY_PER_SESSION:]

        return {"answer": answer.strip(), "session_id": session_id, "source": "llm", "context": context}
    except Exception as exc:
        logger.warning("Co-pilot LLM call failed: %s", exc)
        return {
            "answer": "تعذّر الوصول لخدمة الذكاء الصناعي مؤقتاً. حاول مجدداً بعد قليل.",
            "session_id": session_id,
            "source": "error",
            "error": str(exc),
        }


# ── Enhanced lead categorizer with RAG-lite context (iter 18.4) ────────────
async def categorize_lead_with_context(lead: dict, tenant_db) -> dict:
    """Categorize lead with extra signals: channel conversion history, language hint, prior leads from same phone.

    Returns {category, score, reason_ar, source} — same shape as the basic categorizer.
    """
    message = (lead.get("message") or "").strip()
    channel = lead.get("channel", "manual")
    phone = lead.get("phone", "")

    # Build small context
    channel_history = await tenant_db.ecom_leads.count_documents({"channel": channel})
    channel_converted = await tenant_db.ecom_leads.count_documents({
        "channel": channel,
        "converted_order_id": {"$nin": [None, ""]},
    })
    channel_conv_rate = round((channel_converted / channel_history) * 100, 1) if channel_history else 0
    prior_from_same_phone = await tenant_db.ecom_leads.count_documents({"phone": phone}) if phone else 0

    key = os.environ.get("EMERGENT_LLM_KEY") or os.environ.get("OPENAI_API_KEY")
    if not key:
        return {"category": "other", "score": 50, "reason_ar": "بدون LLM (افتراضي)", "source": "heuristic"}

    sys = (
        "أنت محلّل عملاء محتملين لمتجر إلكتروني جزائري. "
        "صنِّف الرسالة في واحدة من: interested, price_inquiry, support, complaint, spam, other. "
        "أعطِ سكور 0-100 لاحتمالية التحويل لطلب. "
        "استعمل سياق القناة (تاريخ التحويلات السابقة) في تقييمك. "
        "أعد JSON صالحاً فقط بالشكل: "
        '{"category": "<key>", "score": <int>, "reason_ar": "<شرح قصير>"}'
    )
    enriched = (
        f"رسالة العميل: {message}\n\n"
        f"السياق:\n"
        f"- القناة: {channel}\n"
        f"- مجموع العملاء المحتملين من هذه القناة: {channel_history}\n"
        f"- نسبة التحويل التاريخية لهذه القناة: {channel_conv_rate}%\n"
        f"- عدد الرسائل السابقة من هذا الرقم: {prior_from_same_phone}"
    )
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage as EmUserMessage
        chat = (
            LlmChat(api_key=key, session_id=f"lead-{uuid.uuid4()}", system_message=sys)
            .with_model("openai", "gpt-4o-mini")
        )
        resp = await chat.send_message(EmUserMessage(text=enriched))
        text = resp if isinstance(resp, str) else getattr(resp, "content", str(resp))
        text = text.strip()
        if text.startswith("```"):
            text = text.strip("`").lstrip("json").strip()
        parsed = json.loads(text)
        category = (parsed.get("category") or "other").lower()
        score = max(0, min(100, int(parsed.get("score", 50) or 50)))
        return {
            "category": category if category in ("interested", "price_inquiry", "support", "complaint", "spam", "other") else "other",
            "score": score,
            "reason_ar": parsed.get("reason_ar") or "—",
            "source": "llm_rag",
            "context_used": {
                "channel_conversion_pct": channel_conv_rate,
                "prior_from_same_phone": prior_from_same_phone,
            },
        }
    except Exception as exc:
        logger.warning("RAG lead categorizer failed: %s", exc)
        return {"category": "other", "score": 50, "reason_ar": "تعذّر التصنيف", "source": "error"}
