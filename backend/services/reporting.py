"""Unified reporting engine (Phase C).

Single source for the sales/profit aggregations that were duplicated across
stats_routes endpoints. Every route handler is now a thin adapter over these
helpers; response shapes and NUMBERS are identical to the pre-consolidation
implementations (verified before/after on the same period, same tenant).
"""
from typing import Optional


async def sales_chart_rows(db, start_date: str, monthly: bool = False):
    """Sales grouped by day (YYYY-MM-DD) or month (YYYY-MM). One row per period."""
    key = {"$substr": ["$created_at", 0, 7 if monthly else 10]}
    pipeline = [
        {"$match": {"created_at": {"$gte": start_date}, "status": {"$ne": "returned"}}},
        {"$group": {"_id": key, "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]
    return await db.sales.aggregate(pipeline).to_list(100)


async def top_products_rows(db, limit: int, start_date: Optional[str] = None,
                            name_field: str = "name", revenue_mode: str = "price_qty",
                            sort_key: str = "total_revenue"):
    """Top-selling products by items aggregation.

    name_field:   sale-item field carrying the product name.
    revenue_mode: "price_qty" -> price*quantity | "total" -> item.total.
    sort_key:     "total_revenue" | "total_quantity".
    """
    match = {"status": {"$ne": "returned"}}
    if start_date:
        match["created_at"] = {"$gte": start_date}
    revenue_expr = {"$multiply": ["$items.price", "$items.quantity"]} if revenue_mode == "price_qty" else "$items.total"
    pipeline = [
        {"$match": match},
        {"$unwind": "$items"},
        {"$group": {
            "_id": "$items.product_id",
            "product_name": {"$first": f"$items.{name_field}"},
            "total_quantity": {"$sum": "$items.quantity"},
            "total_revenue": {"$sum": revenue_expr},
        }},
        {"$sort": {sort_key: -1}},
        {"$limit": limit},
    ]
    return await db.sales.aggregate(pipeline).to_list(limit)


async def product_price_map(db, product_ids):
    """{product_id: purchase_price} for cost calculations (one query, no N+1)."""
    ids = [pid for pid in set(product_ids) if pid]
    if not ids:
        return {}
    products = await db.products.find(
        {"id": {"$in": ids}}, {"_id": 0, "id": 1, "purchase_price": 1}
    ).to_list(len(ids))
    return {p["id"]: p.get("purchase_price", 0) for p in products}


async def product_docs_map(db, product_ids):
    """{product_id: {purchase_price, name_ar, name_en}} for detailed profit reports."""
    ids = [pid for pid in set(product_ids) if pid]
    if not ids:
        return {}
    products = await db.products.find(
        {"id": {"$in": ids}},
        {"_id": 0, "id": 1, "purchase_price": 1, "name_ar": 1, "name_en": 1},
    ).to_list(len(ids))
    return {p["id"]: p for p in products}
