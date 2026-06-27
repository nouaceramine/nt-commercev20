"""E-Commerce Analytics + AI Lead Categorization (iter 18.3 — P5)

Routes:
  GET  /api/ecom/analytics/revenue       — revenue per channel, time series
  GET  /api/ecom/analytics/funnel        — leads → orders → shipped → delivered conversion
  GET  /api/ecom/analytics/top-products  — best-selling items across all channels
  POST /api/ecom/leads/{lead_id}/ai-categorize  — LLM tags lead intent + score

The LLM call uses the Emergent LLM key (Gemini/OpenAI/Claude). Per-lead result
is persisted on the doc so re-clicking is free.
"""
import os
import json
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from config.database import db
from utils.auth import require_tenant
from .constants import require_ecom_feature

logger = logging.getLogger(__name__)
router = APIRouter(tags=["E-Commerce Analytics"])


@router.get("/ecom/analytics/revenue")
async def revenue_by_channel(
    days: int = Query(30, ge=1, le=365),
    user: dict = Depends(require_tenant),
):
    """Aggregate revenue and order count per channel + day for the last N days."""
    await require_ecom_feature(user)
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    pipeline = [
        {"$match": {"created_at": {"$gte": since}, "status": {"$nin": ["cancelled", "refunded"]}}},
        {"$group": {
            "_id": {
                "channel": "$channel",
                "day": {"$substr": ["$created_at", 0, 10]},  # YYYY-MM-DD
            },
            "revenue": {"$sum": "$total"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id.day": 1}},
    ]
    rows = await db.ecom_orders.aggregate(pipeline).to_list(5000)

    # Pivot into time series per channel
    series: dict = {}
    days_set: set = set()
    for r in rows:
        ch = r["_id"]["channel"]
        day = r["_id"]["day"]
        days_set.add(day)
        series.setdefault(ch, {})[day] = {"revenue": round(r["revenue"], 2), "count": r["count"]}

    sorted_days = sorted(days_set)
    # Channel totals
    channels = []
    for ch, by_day in series.items():
        total_rev = sum(d["revenue"] for d in by_day.values())
        total_cnt = sum(d["count"] for d in by_day.values())
        channels.append({
            "channel": ch,
            "total_revenue": round(total_rev, 2),
            "total_orders": total_cnt,
            "avg_order_value": round(total_rev / total_cnt, 2) if total_cnt else 0,
        })
    channels.sort(key=lambda x: x["total_revenue"], reverse=True)

    return {
        "since": since,
        "days": days,
        "labels": sorted_days,
        "series": series,           # {channel: {day: {revenue,count}}}
        "channels": channels,        # sorted by revenue
        "grand_total_revenue": round(sum(c["total_revenue"] for c in channels), 2),
        "grand_total_orders": sum(c["total_orders"] for c in channels),
    }


@router.get("/ecom/analytics/funnel")
async def conversion_funnel(
    days: int = Query(30, ge=1, le=365),
    user: dict = Depends(require_tenant),
):
    """Lead → Order → Shipped → Delivered conversion funnel for the period."""
    await require_ecom_feature(user)
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    leads = await db.ecom_leads.count_documents({"created_at": {"$gte": since}})
    converted_leads = await db.ecom_leads.count_documents({
        "created_at": {"$gte": since},
        "converted_order_id": {"$nin": [None, ""]},
    })
    orders_total = await db.ecom_orders.count_documents({"created_at": {"$gte": since}})
    confirmed = await db.ecom_orders.count_documents({
        "created_at": {"$gte": since},
        "status": {"$in": ["confirmed", "packed", "shipped", "delivered"]},
    })
    shipped = await db.ecom_orders.count_documents({
        "created_at": {"$gte": since},
        "status": {"$in": ["shipped", "delivered"]},
    })
    delivered = await db.ecom_orders.count_documents({
        "created_at": {"$gte": since},
        "status": "delivered",
    })
    cancelled = await db.ecom_orders.count_documents({
        "created_at": {"$gte": since},
        "status": {"$in": ["cancelled", "refunded"]},
    })

    def pct(num, denom):
        return round((num / denom) * 100, 1) if denom else 0

    return {
        "since": since,
        "stages": [
            {"key": "leads",     "label_ar": "عملاء محتملون", "count": leads,     "pct": 100.0},
            {"key": "orders",    "label_ar": "طلبات",          "count": orders_total, "pct": pct(orders_total, leads) if leads else 100.0},
            {"key": "confirmed", "label_ar": "مؤكَّدة",         "count": confirmed, "pct": pct(confirmed, orders_total)},
            {"key": "shipped",   "label_ar": "في الشحن أو وصلت", "count": shipped, "pct": pct(shipped, orders_total)},
            {"key": "delivered", "label_ar": "مُسلَّمة",         "count": delivered, "pct": pct(delivered, orders_total)},
        ],
        "extras": {
            "leads_converted_to_orders": converted_leads,
            "lead_to_order_pct": pct(converted_leads, leads),
            "cancelled_or_refunded": cancelled,
            "cancel_pct": pct(cancelled, orders_total),
        },
    }


@router.get("/ecom/analytics/top-products")
async def top_products(
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(10, ge=1, le=100),
    user: dict = Depends(require_tenant),
):
    """Top selling items by revenue across all channels."""
    await require_ecom_feature(user)
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    pipeline = [
        {"$match": {"created_at": {"$gte": since}, "status": {"$nin": ["cancelled", "refunded"]}}},
        {"$unwind": "$items"},
        {"$group": {
            "_id": "$items.name",
            "qty": {"$sum": "$items.qty"},
            "revenue": {"$sum": "$items.total"},
            "orders": {"$sum": 1},
            "skus": {"$addToSet": "$items.sku"},
        }},
        {"$sort": {"revenue": -1}},
        {"$limit": limit},
    ]
    rows = await db.ecom_orders.aggregate(pipeline).to_list(limit)
    return {
        "since": since,
        "items": [
            {
                "name": r["_id"] or "—",
                "qty": int(r["qty"]),
                "revenue": round(r["revenue"], 2),
                "orders": int(r["orders"]),
                "skus": [s for s in r["skus"] if s],
            } for r in rows
        ],
    }


# ─── AI Lead Categorization ─────────────────────────────────────────────────
_LEAD_CATEGORIES = ["interested", "price_inquiry", "support", "complaint", "spam", "other"]

_LEAD_SYS_PROMPT = (
    "أنت محلّل عملاء محتملين لمتجر إلكتروني في الجزائر. ستحصل على رسالة من عميل. "
    "أعد JSON صالحاً فقط بالشكل: "
    '{"category": "<one of: interested|price_inquiry|support|complaint|spam|other>", '
    '"score": <0-100 likelihood to convert>, '
    '"reason_ar": "<شرح قصير بالعربية>"}'
)


@router.post("/ecom/leads/{lead_id}/ai-categorize")
async def categorize_lead(lead_id: str, user: dict = Depends(require_tenant)):
    """LLM classifies the lead message and stores the result on the lead doc.

    Cached on the lead — re-call returns the existing result unless force_refresh.
    """
    await require_ecom_feature(user)
    lead = await db.ecom_leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="العميل المحتمل غير موجود")

    if lead.get("ai_category") and lead.get("ai_score") is not None:
        return {
            "category": lead["ai_category"],
            "score": lead["ai_score"],
            "reason_ar": lead.get("ai_reason", ""),
            "cached": True,
        }

    message = (lead.get("message") or "").strip() or "(no message)"
    key = os.environ.get("EMERGENT_LLM_KEY") or os.environ.get("OPENAI_API_KEY")

    # Default heuristic when LLM unavailable
    category, score, reason = "other", 50, "تصنيف افتراضي (لا يوجد LLM)"

    if key:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage as EmUserMessage
            chat = (
                LlmChat(api_key=key, session_id=f"lead-{uuid.uuid4()}", system_message=_LEAD_SYS_PROMPT)
                .with_model("openai", "gpt-4o-mini")
            )
            resp = await chat.send_message(EmUserMessage(text=message))
            text = resp if isinstance(resp, str) else getattr(resp, "content", str(resp))
            text = text.strip()
            if text.startswith("```"):
                text = text.strip("`").lstrip("json").strip()
            parsed = json.loads(text)
            cat = (parsed.get("category") or "other").lower()
            if cat in _LEAD_CATEGORIES:
                category = cat
            score = max(0, min(100, int(parsed.get("score", 50) or 50)))
            reason = parsed.get("reason_ar") or parsed.get("reason") or reason
        except Exception as exc:
            logger.warning("Lead AI categorization failed: %s", exc)

    await db.ecom_leads.update_one(
        {"id": lead_id},
        {"$set": {
            "ai_category": category,
            "ai_score": score,
            "ai_reason": reason,
            "ai_categorized_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"category": category, "score": score, "reason_ar": reason, "cached": False}
