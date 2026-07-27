"""
MongoDB Indexes for Enhanced Products Module (Section 1)
NT Commerce v16 - Products Management Enhancement
Run this at application startup to ensure optimal query performance.
"""

import logging

logger = logging.getLogger(__name__)

PRODUCT_INDEXES = {
    "product_variants": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("product_id", 1), ("is_active", 1)], "opts": {}},
        {"keys": [("sku", 1)], "opts": {}},
        {"keys": [("barcode", 1)], "opts": {}},
    ],
    "product_bundles": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("is_active", 1)], "opts": {}},
    ],
    "product_reviews": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("product_id", 1), ("is_approved", 1)], "opts": {}},
        {"keys": [("product_id", 1), ("rating", -1)], "opts": {}},
        {"keys": [("customer_id", 1)], "opts": {}},
    ],
    "product_tags": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("name", 1)], "opts": {"unique": True}},
    ],
    "stock_movements": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("product_id", 1), ("created_at", -1)], "opts": {}},
        {"keys": [("movement_type", 1)], "opts": {}},
        {"keys": [("variant_id", 1)], "opts": {}},
        {"keys": [("warehouse_id", 1)], "opts": {}},
    ],
    "product_audit_log": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("product_id", 1), ("created_at", -1)], "opts": {}},
        {"keys": [("action", 1)], "opts": {}},
        {"keys": [("user_id", 1)], "opts": {}},
    ],
    "related_products": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("product_id", 1), ("relation_type", 1)], "opts": {}},
        {"keys": [("related_product_id", 1)], "opts": {}},
    ],
    "product_promotions": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("is_active", 1), ("start_date", 1), ("end_date", 1)], "opts": {}},
        {"keys": [("product_ids", 1)], "opts": {}},
    ],
    "price_history": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("product_id", 1), ("created_at", -1)], "opts": {}},
        {"keys": [("field", 1)], "opts": {}},
    ],
}

async def create_enhanced_products_indexes(db):
    """Create all indexes for enhanced products module."""
    results = {"created": 0, "existing": 0, "errors": 0}
    for coll_name, indexes in PRODUCT_INDEXES.items():
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
    logger.info(f"Products indexes: {results['created']} created, {results['existing']} existing, {results['errors']} errors")
    return results
