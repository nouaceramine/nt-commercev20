"""
MongoDB Indexes for Enhanced Leads Module (Section 6)
NT Commerce v16 - Leads Management Enhancement
"""

import logging

logger = logging.getLogger(__name__)

LEAD_INDEXES = {
    "lead_activity_log": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("lead_id", 1), ("created_at", -1)], "opts": {}},
        {"keys": [("action", 1)], "opts": {}},
    ],
    "lead_notes": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("lead_id", 1), ("created_at", -1)], "opts": {}},
        {"keys": [("follow_up_date", 1)], "opts": {}},
    ],
    "lead_campaigns": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("is_active", 1)], "opts": {}},
    ],
    "lead_distribution_rules": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("is_active", 1)], "opts": {}},
    ],
}

async def create_enhanced_leads_indexes(db):
    """Create all indexes for enhanced leads module."""
    results = {"created": 0, "existing": 0, "errors": 0}
    for coll_name, indexes in LEAD_INDEXES.items():
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
