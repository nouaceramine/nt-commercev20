"""AI usage metering (p224).

Every OpenAI-compatible LLM call hooks two functions here:
  • check_ai_cap()   — BEFORE the call: blocks (HTTP 429) when the tenant
                       exceeded its optional monthly cap (USD of cost).
  • record_ai_usage()— AFTER the call: writes one row to main_db.usage_records
                       {id, tenant_id, month, model, tokens_in, tokens_out,
                        cost_usd, feature, created_at}.

Tenant resolution uses middleware.request_context.tenant_id_ctx, which
get_current_user sets on every authenticated request. Platform/background
calls land under tenant_id="platform" and are never capped or invoiced.

Both hooks are fail-open for platform errors EXCEPT the cap breach itself —
a metering bug must never take down AI features, but a real cap breach must.
"""
from datetime import datetime, timezone
import logging
import os
import uuid

from fastapi import HTTPException

logger = logging.getLogger("usage_meter")

# Default per-1M-token prices in USD (input, output). Overridable via
# main_db.ai_billing_config {model_prices: {model: {"in": x, "out": y}}}.
DEFAULT_MODEL_PRICING = {
    "gpt-5": (1.25, 10.0),
    "gpt-5-mini": (0.25, 2.0),
    "gpt-4o": (2.50, 10.0),
    "gpt-4o-mini": (0.15, 0.60),
}
_FALLBACK_PRICE = (1.0, 4.0)  # unknown model → conservative estimate

DEFAULT_BILLING_CONFIG = {
    "margin_pct": 30.0,       # owner's markup when billing tenants
    "usd_dzd_rate": 135.0,    # conversion for wallet deduction
    "model_prices": {},       # per-model overrides
}


def current_tenant_id() -> str:
    try:
        from middleware.request_context import tenant_id_ctx
        return tenant_id_ctx.get() or "platform"
    except Exception:
        return "platform"


def month_key(dt: datetime | None = None) -> str:
    return (dt or datetime.now(timezone.utc)).strftime("%Y-%m")


def compute_cost_usd(model: str, tokens_in: int, tokens_out: int, prices: dict | None = None) -> float:
    prices = prices or {}
    pin, pout = DEFAULT_MODEL_PRICING.get(model or "", _FALLBACK_PRICE)
    over = (prices.get(model) or {}) if isinstance(prices, dict) else {}
    pin = float(over.get("in", pin))
    pout = float(over.get("out", pout))
    return round((tokens_in or 0) / 1_000_000 * pin + (tokens_out or 0) / 1_000_000 * pout, 6)


async def get_billing_config(main_db) -> dict:
    cfg = dict(DEFAULT_BILLING_CONFIG)
    try:
        doc = await main_db.ai_billing_config.find_one({"id": "global"}, {"_id": 0})
        if doc:
            cfg.update({k: v for k, v in doc.items() if k in cfg})
    except Exception:
        logger.exception("ai billing config read failed — using defaults")
    return cfg


async def check_ai_cap(main_db) -> None:
    """Raise HTTP 429 when the current tenant exceeded its monthly AI cost cap.
    No cap configured (0/missing) → always allowed. Platform context → allowed."""
    try:
        tenant_id = current_tenant_id()
        if tenant_id in ("platform", "-", ""):
            return
        tdoc = await main_db.saas_tenants.find_one(
            {"id": tenant_id}, {"_id": 0, "ai_monthly_cap_usd": 1})
        cap = float((tdoc or {}).get("ai_monthly_cap_usd") or 0)
        if cap <= 0:
            return
        mk = month_key()
        agg = await main_db.usage_records.aggregate([
            {"$match": {"tenant_id": tenant_id, "month": mk}},
            {"$group": {"_id": None, "c": {"$sum": "$cost_usd"}}},
        ]).to_list(1)
        used = agg[0]["c"] if agg else 0.0
        if used >= cap:
            raise HTTPException(
                status_code=429,
                detail=f"تم بلوغ السقف الشهري لاستهلاك الذكاء الاصطناعي ({used:.2f}$ / {cap:.2f}$) — تواصل مع إدارة المنصة لرفع السقف",
            )
    except HTTPException:
        raise
    except Exception:
        logger.exception("ai cap check failed — allowing call (fail-open)")


async def record_ai_usage(main_db, *, model: str, tokens_in: int, tokens_out: int, feature: str = "") -> None:
    """Write one usage row. Never raises — metering must not break AI calls."""
    try:
        if not tokens_in and not tokens_out:
            return
        tenant_id = current_tenant_id()
        cfg = await get_billing_config(main_db)
        cost = compute_cost_usd(model, tokens_in, tokens_out, cfg.get("model_prices"))
        now = datetime.now(timezone.utc)
        await main_db.usage_records.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "month": month_key(now),
            "model": model or "",
            "tokens_in": int(tokens_in or 0),
            "tokens_out": int(tokens_out or 0),
            "cost_usd": cost,
            "feature": feature,
            "created_at": now.isoformat(),
        })
    except Exception:
        logger.exception("ai usage record failed (%s)", feature)
