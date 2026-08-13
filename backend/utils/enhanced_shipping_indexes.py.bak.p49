"""
MongoDB Indexes for Enhanced Shipping Module (Section 4)
NT Commerce v16 - Shipping & Delivery Enhancement
"""

import logging

logger = logging.getLogger(__name__)

SHIPPING_INDEXES = {
    "couriers": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("is_active", 1)], "opts": {}},
        {"keys": [("wilaya_codes", 1)], "opts": {}},
        {"keys": [("phone", 1)], "opts": {}},
    ],
    "delivery_routes": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("courier_id", 1)], "opts": {}},
        {"keys": [("scheduled_date", 1)], "opts": {}},
        {"keys": [("status", 1)], "opts": {}},
    ],
    "ecom_shipping_labels": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("tracking_number", 1)], "opts": {}},
        {"keys": [("order_id", 1)], "opts": {}},
        {"keys": [("courier_id", 1)], "opts": {}},
        {"keys": [("status", 1)], "opts": {}},
        {"keys": [("provider", 1)], "opts": {}},
        {"keys": [("wilaya", 1)], "opts": {}},
        {"keys": [("created_at", -1)], "opts": {}},
    ],
    "shipping_settings": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
    ],
    "pickup_requests": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("provider", 1), ("status", 1)], "opts": {}},
    ],
    "delivery_zones": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("wilaya_codes", 1)], "opts": {}},
        {"keys": [("is_active", 1)], "opts": {}},
    ],
    "shipping_activity_log": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("action", 1), ("created_at", -1)], "opts": {}},
    ],
}

async def create_enhanced_shipping_indexes(db):
    """Create all indexes for enhanced shipping module."""
    results = {"created": 0, "existing": 0, "errors": 0}
    for coll_name, indexes in SHIPPING_INDEXES.items():
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
