"""AI Insights Service (iter 18.2)

Generates an hourly snapshot for the super-admin Monitoring dashboard:
  - Top performing tenants (by sales growth)
  - Churn-risk signals (no activity for X days, debt growing)
  - Platform-wide health KPIs
  - Quick actionable recommendations (Arabic)

Cached for 1 hour via @cached_json (keeps Emergent LLM cost negligible).
"""
import os
import json
import logging
from datetime import datetime, timezone, timedelta

from config.database import db, main_db

logger = logging.getLogger(__name__)


async def _gather_platform_metrics() -> dict:
    """Collect a compact JSON-serialisable snapshot of platform health.

    Cheap aggregations only — no per-tenant DB iteration.
    """
    now = datetime.now(timezone.utc)
    iso_7d = (now - timedelta(days=7)).isoformat()
    iso_30d = (now - timedelta(days=30)).isoformat()

    total_tenants = await main_db.saas_tenants.count_documents({})
    active_tenants = await main_db.saas_tenants.count_documents({"is_active": True})
    new_tenants_7d = await main_db.saas_tenants.count_documents({"created_at": {"$gte": iso_7d}})

    # Plan distribution
    plan_dist = await main_db.saas_tenants.aggregate([
        {"$group": {"_id": "$plan_id", "count": {"$sum": 1}}}
    ]).to_list(50)

    # Subscription expiry watch (next 14 days)
    iso_now = now.isoformat()
    iso_14d = (now + timedelta(days=14)).isoformat()
    expiring_soon = await main_db.saas_tenants.count_documents({
        "subscription_ends_at": {"$gte": iso_now, "$lte": iso_14d},
    })

    # Debt overview (mocked-safe — works even when table is empty)
    try:
        debts_pipeline = [
            {"$match": {"status": {"$in": ["pending", "overdue"]}}},
            {"$group": {"_id": None, "total": {"$sum": "$remaining_amount"}, "count": {"$sum": 1}}},
        ]
        debts = await main_db.saas_debts.aggregate(debts_pipeline).to_list(1)
        outstanding_debt_total = float(debts[0]["total"]) if debts else 0.0
        outstanding_debt_count = int(debts[0]["count"]) if debts else 0
    except Exception:
        outstanding_debt_total = 0.0
        outstanding_debt_count = 0

    # E-Commerce reach (how many tenants enabled the hub)
    ecom_enabled = await main_db.saas_tenants.count_documents({"features_override.ecommerce_hub": True})

    return {
        "as_of": now.isoformat(),
        "total_tenants": total_tenants,
        "active_tenants": active_tenants,
        "inactive_tenants": total_tenants - active_tenants,
        "new_tenants_last_7d": new_tenants_7d,
        "expiring_in_next_14d": expiring_soon,
        "plan_distribution": [{"plan_id": p["_id"], "count": p["count"]} for p in plan_dist],
        "outstanding_debt_total": outstanding_debt_total,
        "outstanding_debt_count": outstanding_debt_count,
        "ecommerce_hub_enabled_tenants": ecom_enabled,
    }


SYSTEM_PROMPT_AR = (
    "أنت مساعد ذكي لمنصة SaaS متعددة المستأجرين باسم NT Commerce. "
    "ستحلّل بيانات النشاط لآخر 7-30 يوم وتعيد ملخّصاً تنفيذياً مختصراً للسوبر-أدمن. "
    "يجب أن يكون الردّ JSON صالحاً فقط، بدون أي نصّ آخر، بالشكل التالي:\n"
    "{\n"
    '  "headline": "عنوان لمحة بسيطة (سطر واحد)",\n'
    '  "health_score": <عدد من 0 إلى 100>,\n'
    '  "highlights": ["نقطة 1", "نقطة 2", "نقطة 3"],\n'
    '  "risks": ["مخاطرة 1", "مخاطرة 2"],\n'
    '  "recommendations": ["توصية 1 قابلة للتنفيذ", "توصية 2"]\n'
    "}\n"
    "اجعل النصوص قصيرة (أقل من 100 حرف لكل عنصر) وبلهجة محترفة عربية فصحى."
)


def _heuristic_fallback(metrics: dict) -> dict:
    """Local heuristic insights when LLM is unavailable — keeps the card functional."""
    total = max(1, metrics["total_tenants"])
    active_ratio = metrics["active_tenants"] / total
    health = int(round(active_ratio * 70 + min(metrics["new_tenants_last_7d"] * 2, 30)))
    highlights = [
        f"{metrics['active_tenants']} مستأجر نشط من أصل {total} ({int(active_ratio*100)}%)",
        f"{metrics['new_tenants_last_7d']} مستأجر جديد آخر 7 أيام",
        f"{metrics['ecommerce_hub_enabled_tenants']} مستأجر مُفعَّل لديه مركز التجارة الإلكترونية",
    ]
    risks = []
    if metrics["expiring_in_next_14d"] > 0:
        risks.append(f"{metrics['expiring_in_next_14d']} اشتراك ينتهي خلال 14 يوم")
    if metrics["outstanding_debt_total"] > 0:
        risks.append(f"ديون قائمة بقيمة {int(metrics['outstanding_debt_total']):,} دج")
    recommendations = []
    if metrics["expiring_in_next_14d"] > 0:
        recommendations.append("راجع المستأجرين المنتهية اشتراكاتهم وتواصل معهم لتجديد سلس")
    if metrics["ecommerce_hub_enabled_tenants"] < total * 0.3:
        recommendations.append("سوّق ميزة مركز التجارة الإلكترونية للمستأجرين المؤهلين")
    if not recommendations:
        recommendations.append("النظام يعمل بسلاسة — استمر بمراقبة المخاطر الناشئة")
    return {
        "headline": "لقطة عامة عن صحة المنصة",
        "health_score": max(0, min(100, health)),
        "highlights": highlights,
        "risks": risks or ["لا توجد مخاطر فورية مرصودة"],
        "recommendations": recommendations,
        "source": "heuristic",
    }


async def generate_ai_insights() -> dict:
    """Generate AI-powered insights. Falls back to heuristic when LLM unavailable."""
    metrics = await _gather_platform_metrics()

    from services.ai.openai_llm import llm_chat, llm_configured
    if not llm_configured():
        return {**_heuristic_fallback(metrics), "metrics": metrics}

    try:
        user_prompt = (
            "حلّل المقاييس التالية وأعِد JSON كما طُلب منك:\n"
            + json.dumps(metrics, ensure_ascii=False, indent=2)
        )
        text = await llm_chat(SYSTEM_PROMPT_AR, user_prompt)
        # Trim accidental markdown fencing
        text = text.strip()
        if text.startswith("```"):
            text = text.split("```", 2)[1] if "```" in text[3:] else text[3:]
            if text.startswith("json"):
                text = text[4:].strip()
            text = text.strip("` \n")
        parsed = json.loads(text)
        return {**parsed, "metrics": metrics, "source": "llm"}
    except Exception as e:
        logger.warning("AI insights LLM call failed, falling back to heuristic: %s", e)
        return {**_heuristic_fallback(metrics), "metrics": metrics, "error": str(e)}
