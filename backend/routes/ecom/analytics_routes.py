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


@router.get("/ecom/analytics/profitability")
async def ecom_profitability(days: int = 30, user: dict = Depends(require_tenant)):
    """p71: true COD profitability — funnel rates + realized profit − return losses − ad spend.

    Answers the merchant's real question: after funded ads, confirmation,
    packaging, shipping, deliveries and refused parcels with return fees —
    how much did we actually earn?
    """
    await require_ecom_feature(user)
    from datetime import datetime, timezone, timedelta
    days = max(1, min(int(days or 30), 365))
    now = datetime.now(timezone.utc)
    since = (now - timedelta(days=days)).isoformat()
    since_day = since[:10]

    orders = await db.ecom_orders.find({"created_at": {"$gte": since}}, {"_id": 0}).to_list(10000)
    fins = await db.ecom_order_financials.find({}, {"_id": 0}).to_list(10000)
    fin_by_id = {f.get("id"): f for f in fins}

    counts = {}
    for o in orders:
        counts[o.get("status", "new")] = counts.get(o.get("status", "new"), 0) + 1
    total_orders = len(orders)
    confirmed_plus = sum(counts.get(s, 0) for s in ("confirmed", "packed", "shipped", "delivered", "refunded"))
    delivered = counts.get("delivered", 0)
    refunded = counts.get("refunded", 0)
    outcome = delivered + refunded  # orders that reached a final shipping outcome

    realized_profit = losses = return_fees = 0.0
    delivered_revenue = delivered_cogs = packaging_total = shipping_total = 0.0
    for o in orders:
        f = fin_by_id.get(o.get("id"))
        if not f:
            continue
        st = f.get("status")
        if st == "realized":
            realized_profit += float(f.get("realized_profit") or 0)
            delivered_revenue += float(f.get("revenue") or 0)
            delivered_cogs += float(f.get("cogs") or 0)
            shipping_total += float(f.get("shipping_fee") or 0)
            packaging_total += float(f.get("packaging_cost") or 0)
        elif st == "returned":
            losses += float(f.get("losses") or 0)
            return_fees += float(f.get("return_fee") or 0)
            packaging_total += float(f.get("packaging_cost") or 0)

    # Funded-ads spend: recorded as expenses under the ads category (p71)
    AD_CATS = ["إعلانات ممولة", "إعلانات", "ads", "Ads", "ADs", "Publicité", "publicité"]
    ad_rows = await db.expenses.find(
        {"category": {"$in": AD_CATS},
         "$or": [{"date": {"$gte": since_day}}, {"created_at": {"$gte": since}}]},
        {"_id": 0, "amount": 1},
    ).to_list(5000)
    ad_spend = round(sum(float(e.get("amount") or 0) for e in ad_rows), 2)

    realized_profit = round(realized_profit, 2)
    losses = round(losses, 2)
    net_profit = round(realized_profit - losses - ad_spend, 2)

    def pct(a, b):
        return round((a / b) * 100, 1) if b else 0.0

    # p78: per-UTM-source breakdown (which campaign actually delivers?)
    sources: dict = {}
    for o in orders:
        key = (o.get("utm") or {}).get("utm_source") or o.get("utm_source") or "direct"
        s = sources.setdefault(key, {"source": key, "orders": 0, "delivered": 0,
                                     "refunded": 0, "revenue": 0.0, "profit": 0.0})
        s["orders"] += 1
        st = o.get("status")
        if st == "delivered":
            s["delivered"] += 1
            s["revenue"] = round(s["revenue"] + float(o.get("total") or 0), 2)
            f = fin_by_id.get(o.get("id"))
            if f and f.get("status") == "realized":
                s["profit"] = round(s["profit"] + float(f.get("realized_profit") or 0), 2)
        elif st == "refunded":
            s["refunded"] += 1
    utm_sources = sorted(sources.values(), key=lambda r: -r["revenue"])

    return {
        "days": days,
        "utm_sources": utm_sources,
        "total_orders": total_orders,
        "counts": counts,
        "confirmation_rate": pct(confirmed_plus, total_orders),
        "delivery_rate": pct(delivered, outcome),
        "return_rate": pct(refunded, outcome),
        "delivered_revenue": round(delivered_revenue, 2),
        "delivered_cogs": round(delivered_cogs, 2),
        "shipping_fees": round(shipping_total, 2),
        "packaging_costs": round(packaging_total, 2),
        "realized_profit": realized_profit,
        "return_losses": losses,
        "return_fees": round(return_fees, 2),
        "ad_spend": ad_spend,
        "net_profit": net_profit,
        "ad_cost_per_delivered": round(ad_spend / delivered, 2) if delivered else 0.0,
        "true_roas": round(delivered_revenue / ad_spend, 2) if ad_spend > 0 else None,
        "roi_on_ads": round((net_profit / ad_spend) * 100, 1) if ad_spend > 0 else None,
    }


@router.post("/ecom/leads/{lead_id}/ai-categorize")
async def categorize_lead(lead_id: str, user: dict = Depends(require_tenant)):
    """LLM classifies the lead message and stores the result on the lead doc.

    Iter 18.4: uses the RAG-lite categorizer which feeds channel conversion
    history + prior-leads-from-same-phone into the prompt.
    Cached on the lead — re-call returns the existing result.
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

    from services.ecom.copilot_service import categorize_lead_with_context
    result = await categorize_lead_with_context(lead, db)

    await db.ecom_leads.update_one(
        {"id": lead_id},
        {"$set": {
            "ai_category": result["category"],
            "ai_score": result["score"],
            "ai_reason": result["reason_ar"],
            "ai_source": result.get("source", "llm"),
            "ai_context": result.get("context_used"),
            "ai_categorized_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {**result, "cached": False}


# ─── AI Co-pilot conversational endpoint (iter 18.4) ────────────────────────
@router.post("/ecom/analytics/copilot")
async def analytics_copilot(body: dict, user: dict = Depends(require_tenant)):
    """Conversational analytics. Body: {question: str, session_id?: str, days?: int}"""
    await require_ecom_feature(user)
    from services.ecom.copilot_service import answer_copilot_question
    return await answer_copilot_question(
        question=body.get("question", ""),
        session_id=body.get("session_id"),
        days=int(body.get("days", 30) or 30),
    )
