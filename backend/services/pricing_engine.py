"""Per-subscriber price-margin engine (p223).

The platform sells MEDIATED services (recharge, digital goods, IPTV, AI…) to
tenants at a cost price. Each tenant (subscriber) may define ONE active margin
rule per service category; the engine then derives the customer-facing sale
price from the cost:

    sale_price = cost × (1 + value/100)     (margin_type = "percent")
    sale_price = cost + value               (margin_type = "fixed")

The difference (sale_price − cost) is the subscriber's profit on the operation
and is what gets booked into their ledgers by the calling service (e.g. the
recharge saga records it as the operation profit / sale total).

Rules live in main_db.margin_rules (they price cross-tenant mediated services):
    {id, tenant_id, service_category, margin_type, value, active,
     created_at, updated_at, created_by}

When a tenant has NO active rule for a category the caller keeps its legacy
behaviour (face-value pricing) — the engine is purely additive.
"""
from datetime import datetime, timezone
import logging
import re

log = logging.getLogger("pricing_engine")

# Known mediated-service categories. Free slugs matching CATEGORY_RE are also
# accepted so future services can hook in without a code change.
KNOWN_SERVICE_CATEGORIES = ["recharge", "digital", "iptv", "ai"]
CATEGORY_RE = re.compile(r"^[a-z0-9_:-]{2,40}$")


async def get_active_margin_rule(main_db, tenant_id: str, service_category: str) -> dict | None:
    """Return the tenant's active margin rule for a category (latest updated wins), else None."""
    if main_db is None or not tenant_id or not service_category:
        return None
    return await main_db.margin_rules.find_one(
        {"tenant_id": tenant_id, "service_category": service_category, "active": {"$ne": False}},
        {"_id": 0},
        sort=[("updated_at", -1)],
    )


def apply_margin_rule(cost: float, rule: dict) -> tuple[float, float]:
    """Apply a rule to a cost basis. Returns (sale_price, margin_amount).

    margin_amount = sale_price − cost = the subscriber's EXTRA markup profit
    on top of the cost basis (for recharge the cost basis already nets the
    operator commission, so the subscriber's total profit = sale_price − cost).
    """
    base = round(float(cost), 2)
    value = float(rule.get("value", 0) or 0)
    if rule.get("margin_type") == "fixed":
        sale = round(base + value, 2)
    else:  # percent
        sale = round(base * (1 + value / 100.0), 2)
    if sale < base:  # defensive: never price below cost
        sale = base
    return sale, round(sale - base, 2)


async def quote_sale_price(main_db, tenant_id: str, service_category: str, cost: float) -> dict:
    """Dry-run pricing for a (tenant, category, cost) triple. Used by the
    /margin-rules/quote endpoint and by tests."""
    rule = await get_active_margin_rule(main_db, tenant_id, service_category)
    if not rule:
        base = round(float(cost), 2)
        return {"cost": base, "sale_price": base, "margin_amount": 0.0, "rule": None}
    sale, margin = apply_margin_rule(cost, rule)
    return {"cost": round(float(cost), 2), "sale_price": sale, "margin_amount": margin, "rule": rule}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
