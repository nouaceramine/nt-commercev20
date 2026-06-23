"""
Unified Pagination Utility
"""
from fastapi import Query
from typing import List, Any


async def paginate(collection, query: dict, page: int = 1, per_page: int = 20, sort_field: str = "created_at", sort_dir: int = -1, projection: dict = None) -> dict:
    """Generic paginated query for MongoDB collections"""
    if projection is None:
        projection = {"_id": 0}
    if page < 1:
        page = 1
    if per_page < 1:
        per_page = 20
    if per_page > 100:
        per_page = 100
    skip = (page - 1) * per_page
    total = await collection.count_documents(query)
    items = await collection.find(query, projection).sort(sort_field, sort_dir).skip(skip).limit(per_page).to_list(per_page)
    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
    }
