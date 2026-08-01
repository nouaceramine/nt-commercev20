"""
MongoDB Indexes for Enhanced Customers Module (Section 3)
NT Commerce v16 - eCom CRM Customer Management Enhancement
"""

import logging

logger = logging.getLogger(__name__)

CUSTOMER_INDEXES = {
    "customer_segments": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("is_active", 1)], "opts": {}},
        {"keys": [("name", 1)], "opts": {}},
    ],
    "customer_interactions": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("customer_id", 1), ("created_at", -1)], "opts": {}},
        {"keys": [("interaction_type", 1)], "opts": {}},
        {"keys": [("created_by", 1)], "opts": {}},
    ],
    "customer_wishlists": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("customer_id", 1), ("created_at", -1)], "opts": {}},
        {"keys": [("product_id", 1)], "opts": {}},
        {"keys": [("customer_id", 1), ("product_id", 1)], "opts": {"unique": True}},
    ],
    "customer_addresses": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("customer_id", 1)], "opts": {}},
        {"keys": [("customer_id", 1), ("is_default", -1)], "opts": {}},
    ],
}

async def create_enhanced_customers_indexes(db):
    """Create all indexes for enhanced customers module."""
    results = {"created": 0, "existing": 0, "errors": 0}
    for coll_name, indexes in CUSTOMER_INDEXES.items():
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
