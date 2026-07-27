"""
MongoDB Indexes for Enhanced Orders Module (Section 2)
NT Commerce v16 - Orders Management Enhancement
Run this at application startup to ensure optimal query performance.
"""

import logging

logger = logging.getLogger(__name__)

ORDER_INDEXES = {
    "order_templates": [
        {"keys": [("id", 1)], "options": {"unique": True}},
        {"keys": [("is_active", 1), ("usage_count", -1)], "options": {}},
        {"keys": [("name", "text"), ("description", "text")], "options": {}},
    ],
    "order_timelines": [
        {"keys": [("order_id", 1), ("created_at", -1)], "options": {}},
        {"keys": [("event_type", 1), ("created_at", -1)], "options": {}},
    ],
    "order_refunds": [
        {"keys": [("id", 1)], "options": {"unique": True}},
        {"keys": [("order_id", 1), ("status", 1)], "options": {}},
    ],
    "delivery_schedules": [
        {"keys": [("id", 1)], "options": {"unique": True}},
        {"keys": [("order_id", 1), ("created_at", -1)], "options": {}},
        {"keys": [("scheduled_date", 1)], "options": {}},
    ],
    "order_returns": [
        {"keys": [("id", 1)], "options": {"unique": True}},
        {"keys": [("order_id", 1), ("status", 1)], "options": {}},
        {"keys": [("type", 1), ("status", 1)], "options": {}},
    ],
    "automation_rules": [
        {"keys": [("id", 1)], "options": {"unique": True}},
        {"keys": [("is_active", 1), ("priority", -1)], "options": {}},
    ],
}

async def create_enhanced_orders_indexes(db):
    """Create all indexes for the enhanced orders module. Call during startup."""
    results = {"created": 0, "existing": 0, "errors": 0}
    for coll_name, indexes in ORDER_INDEXES.items():
        for idx in indexes:
            try:
                await db[coll_name].create_index(idx["keys"], **idx["options"])
                results["created"] += 1
            except Exception as e:
                err = str(e).lower()
                if "already exists" in err or "duplicate" in err:
                    results["existing"] += 1
                else:
                    results["errors"] += 1
                    logger.warning(f"Index error on {coll_name}: {e}")
    logger.info(f"Enhanced orders indexes: {results['created']} created, {results['existing']} existing, {results['errors']} errors")
    return results


# Standalone execution
if __name__ == "__main__":
    import asyncio
    import os
    from motor.motor_asyncio import AsyncIOMotorClient

    async def main():
        mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.getenv("DB_NAME", "ntcommerce")
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        print(f"Creating enhanced orders indexes on {db_name}...")
        results = await create_enhanced_orders_indexes(db)
        print(f"Done: {results}")
        client.close()

    asyncio.run(main())
