"""
MongoDB Indexes for Enhanced Content Module (Section 8)
NT Commerce v16 - Content Hub Enhancement
"""

import logging

logger = logging.getLogger(__name__)

CONTENT_INDEXES = {
    "cms_pages": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("slug", 1)], "opts": {}},
        {"keys": [("is_published", 1)], "opts": {}},
    ],
    "blog_posts": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("slug", 1)], "opts": {}},
        {"keys": [("is_published", 1), ("created_at", -1)], "opts": {}},
        {"keys": [("category", 1)], "opts": {}},
        {"keys": [("tags", 1)], "opts": {}},
    ],
    "faq_entries": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("is_published", 1), ("order_index", 1)], "opts": {}},
        {"keys": [("category", 1)], "opts": {}},
    ],
    "product_reviews": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("product_id", 1), ("created_at", -1)], "opts": {}},
        {"keys": [("status", 1)], "opts": {}},
    ],
    "media_gallery": [
        {"keys": [("id", 1)], "opts": {"unique": True}},
        {"keys": [("folder", 1), ("uploaded_at", -1)], "opts": {}},
    ],
}

async def create_enhanced_content_indexes(db):
    """Create all indexes for enhanced content module."""
    results = {"created": 0, "existing": 0, "errors": 0}
    for coll_name, indexes in CONTENT_INDEXES.items():
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
