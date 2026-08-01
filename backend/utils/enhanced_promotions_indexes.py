"""
MongoDB Indexes for Enhanced Promotions Module (Section 7)
NT Commerce v16 - Promotions, Discounts & Loyalty Enhancement
"""

import logging

logger = logging.getLogger(__name__)

PROMO_INDEXES = {
    "coupons": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("code", 1)], "opts": {}},
        {"keys": [("is_active", 1)], "opts": {}},
        {"keys": [("start_date", 1), ("end_date", 1)], "opts": {}},
    ],
    "coupon_usage": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("coupon_id", 1), ("used_at", -1)], "opts": {}},
        {"keys": [("customer_id", 1)], "opts": {}},
        {"keys": [("order_id", 1)], "opts": {}},
    ],
    "flash_sales": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("is_active", 1), ("start_date", 1), ("end_date", 1)], "opts": {}},
    ],
    "discount_rules": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("is_active", 1), ("priority", -1)], "opts": {}},
    ],
    "loyalty_transactions": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("customer_id", 1), ("created_at", -1)], "opts": {}},
    ],
    "product_bundles": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("is_active", 1)], "opts": {}},
    ],
    "promo_activity_log": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("action", 1), ("created_at", -1)], "opts": {}},
    ],
}

async def create_enhanced_promotions_indexes(db):
    """Create all indexes for enhanced promotions module."""
    results = {"created": 0, "existing": 0, "errors": 0}
    for coll_name, indexes in PROMO_INDEXES.items():
        for idx in indexes:
            try:
                await db[coll_name].create_index(idx["keys"], **idx["opts"])
                results["created"] += 1
            except Exception as e:
                err = str(e).lower()
                if "already exists" in err or "duplicate" in err:
                    results["existing"] += 1
                else:
                    results["errors"] += 1
                    logger.warning(f"Index error on {coll_name}: {e}")
    return results
