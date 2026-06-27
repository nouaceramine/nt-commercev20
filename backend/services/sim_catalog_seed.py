"""Idempotent seed for the platform SIM-card catalog.

Inserts 7 baseline catalog entries (one per operator x tier) the first time the
backend starts. Re-runs are no-ops because of the unique (operator, tier) check.

The seed only sets sensible default prices — the super-admin can edit them at
any time from /saas-admin/supplier → tab "شرائح SIM".
"""
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)

# Default prices (DZD) — purely indicative. Super-admin edits via UI.
# default_price = platform → tenant.  suggested_retail_price = tenant → end-customer.
_SIM_SEED = [
    # Retail SIMs (تجزئة) — single SIM, full price
    {"operator": "Mobilis", "tier": "retail",    "name_ar": "موبيليس - شريحة تجزئة",       "default_price": 200, "suggested_retail_price": 300},
    {"operator": "Ooredoo", "tier": "retail",    "name_ar": "أوريدو - شريحة تجزئة",       "default_price": 200, "suggested_retail_price": 300},
    {"operator": "Djezzy",  "tier": "retail",    "name_ar": "جازي - شريحة تجزئة",         "default_price": 200, "suggested_retail_price": 300},
    {"operator": "Sama",    "tier": "retail",    "name_ar": "سما - شريحة تجزئة",          "default_price": 250, "suggested_retail_price": 400},
    # Wholesale SIMs (جملة) — lower per-unit price, sold in bulk
    {"operator": "Mobilis", "tier": "wholesale", "name_ar": "موبيليس - شريحة جملة",       "default_price": 150, "suggested_retail_price": 250},
    {"operator": "Ooredoo", "tier": "wholesale", "name_ar": "أوريدو - شريحة جملة",       "default_price": 150, "suggested_retail_price": 250},
    {"operator": "Djezzy",  "tier": "wholesale", "name_ar": "جازي - شريحة جملة",         "default_price": 150, "suggested_retail_price": 250},
]


async def seed_sim_catalog(main_db) -> dict:
    """Run on startup. Returns {inserted, skipped} for observability."""
    inserted = 0
    skipped = 0
    now = datetime.now(timezone.utc).isoformat()
    for entry in _SIM_SEED:
        exists = await main_db.platform_sim_catalog.find_one(
            {"operator": entry["operator"], "tier": entry["tier"]},
            {"_id": 0, "id": 1},
        )
        if exists:
            skipped += 1
            continue
        doc = {
            **entry,
            "id": str(uuid.uuid4()),
            "tenant_prices": {},
            "is_active": True,
            "created_at": now,
        }
        await main_db.platform_sim_catalog.insert_one(doc)
        inserted += 1

    # Ensure index on (operator, tier) for the unique check + sorted listing
    try:
        await main_db.platform_sim_catalog.create_index(
            [("operator", 1), ("tier", 1)],
            unique=True,
            name="sim_operator_tier_unique",
        )
        await main_db.platform_sim_stock.create_index(
            [("catalog_id", 1), ("status", 1)],
            name="sim_stock_catalog_status",
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("sim catalog index create failed (likely pre-existing): %s", exc)

    logger.info("SIM catalog seed: inserted=%d, skipped=%d", inserted, skipped)
    return {"inserted": inserted, "skipped": skipped}
