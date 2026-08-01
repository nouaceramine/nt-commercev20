"""
MongoDB Indexes for Enhanced Reviews Module (Section 10)
NT Commerce v16 - Reviews & Ratings Enhancement
"""

import logging

logger = logging.getLogger(__name__)

REVIEW_INDEXES = {
    "reviews": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("product_id", 1), ("status", 1), ("created_at", -1)], "opts": {}},
        {"keys": [("user_id", 1), ("status", 1)], "opts": {}},
        {"keys": [("status", 1), ("created_at", -1)], "opts": {}},
        {"keys": [("product_id", 1), ("rating", 1)], "opts": {}},
    ],
    "product_ratings": [
        {"keys": [("product_id", 1)], "opts": {"unique": True}},
        {"keys": [("average_rating", -1)], "opts": {}},
    ],
    "review_votes": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("review_id", 1)], "opts": {}},
    ],
    "review_reports": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("review_id", 1)], "opts": {}},
        {"keys": [("status", 1), ("created_at", -1)], "opts": {}},
    ],
    "review_requests": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("order_id", 1)], "opts": {}},
        {"keys": [("status", 1)], "opts": {}},
    ],
}

async def create_enhanced_reviews_indexes(db):
    """Create all indexes for enhanced reviews module."""
    results = {"created": 0, "existing": 0, "errors": 0}
    for coll_name, indexes in REVIEW_INDEXES.items():
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
