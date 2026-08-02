"""
MongoDB Indexes for Enhanced Inventory Module (Section 11)
NT Commerce v16 - Inventory & Warehouse Management
"""

import logging

logger = logging.getLogger(__name__)

INVENTORY_INDEXES = {
    "warehouses": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("code", 1)], "opts": {"unique": True}},
        {"keys": [("is_active", 1)], "opts": {}},
    ],
    "inventory": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("product_id", 1), ("warehouse_id", 1)], "opts": {"unique": True}},
        {"keys": [("warehouse_id", 1), ("quantity", 1)], "opts": {}},
        {"keys": [("product_id", 1)], "opts": {}},
    ],
    "stock_transfers": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("from_warehouse_id", 1), ("status", 1)], "opts": {}},
        {"keys": [("to_warehouse_id", 1), ("status", 1)], "opts": {}},
    ],
    "stock_history": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("product_id", 1), ("warehouse_id", 1), ("created_at", -1)], "opts": {}},
        {"keys": [("movement_type", 1), ("created_at", -1)], "opts": {}},
    ],
    "stock_adjustments": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("product_id", 1), ("warehouse_id", 1), ("created_at", -1)], "opts": {}},
    ],
    "stock_alerts": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("product_id", 1), ("warehouse_id", 1)], "opts": {}},
        {"keys": [("is_active", 1), ("alert_type", 1)], "opts": {}},
    ],
    "inventory_counts": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("warehouse_id", 1), ("status", 1)], "opts": {}},
    ],
}

async def create_enhanced_inventory_indexes(db):
    """Create all indexes for enhanced inventory module."""
    results = {"created": 0, "existing": 0, "errors": 0}
    for coll_name, indexes in INVENTORY_INDEXES.items():
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
