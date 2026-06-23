"""Single source of truth for the 'low stock' product query filter.

Several routes and reports independently embedded the same MongoDB $expr to
detect products at/below their low-stock threshold (default 10). They are
consolidated here so the meaning of 'low stock' lives in ONE place.

NOTE: a few call sites intentionally use different semantics (e.g. inventory_robot
uses $lte; the restock-suggestions endpoint omits the default) and are left
untouched to preserve their existing behavior.
"""


def low_stock_filter() -> dict:
    """MongoDB filter: products whose quantity is BELOW their low-stock
    threshold (falling back to 10 when no per-product threshold is set)."""
    return {"$expr": {"$lt": ["$quantity", {"$ifNull": ["$low_stock_threshold", 10]}]}}
