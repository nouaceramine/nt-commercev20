"""
MongoDB Indexes for Enhanced Notifications Module (Section 9)
NT Commerce v16 - Notifications & Communication Enhancement
"""

import logging

logger = logging.getLogger(__name__)

NOTIFICATION_INDEXES = {
    "notifications": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("user_id", 1), ("read", 1), ("created_at", -1)], "opts": {}},
        {"keys": [("user_id", 1), ("type", 1)], "opts": {}},
        {"keys": [("created_at", -1)], "opts": {}},
    ],
    "notification_templates": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("channel", 1), ("language", 1)], "opts": {}},
        {"keys": [("is_active", 1)], "opts": {}},
    ],
    "notification_settings": [
        {"keys": [("user_id", 1)], "opts": {"unique": True}},
    ],
    "notification_schedules": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("status", 1), ("scheduled_at", 1)], "opts": {}},
    ],
    "notification_delivery_log": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("notification_id", 1)], "opts": {}},
        {"keys": [("user_id", 1), ("sent_at", -1)], "opts": {}},
        {"keys": [("channel", 1)], "opts": {}},
    ],
}

async def create_enhanced_notifications_indexes(db):
    """Create all indexes for enhanced notifications module."""
    results = {"created": 0, "existing": 0, "errors": 0}
    for coll_name, indexes in NOTIFICATION_INDEXES.items():
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
