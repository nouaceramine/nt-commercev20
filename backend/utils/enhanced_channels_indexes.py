"""
MongoDB Indexes for Enhanced Channels Module (Section 5)
NT Commerce v16 - Channels & Integrations Enhancement
"""

import logging

logger = logging.getLogger(__name__)

CHANNEL_INDEXES = {
    "channel_sync_log": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("integration_id", 1), ("created_at", -1)], "opts": {}},
        {"keys": [("channel", 1), ("created_at", -1)], "opts": {}},
        {"keys": [("action", 1)], "opts": {}},
        {"keys": [("status", 1)], "opts": {}},
    ],
    "sync_schedules": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("integration_id", 1)], "opts": {}},
        {"keys": [("is_active", 1), ("frequency", 1)], "opts": {}},
    ],
    "inventory_sync_rules": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
    ],
}

async def create_enhanced_channels_indexes(db):
    """Create all indexes for enhanced channels module."""
    results = {"created": 0, "existing": 0, "errors": 0}
    for coll_name, indexes in CHANNEL_INDEXES.items():
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
