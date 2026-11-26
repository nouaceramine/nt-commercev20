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


def fefo_projection(lots, stock_qty) -> dict:
    """p565: virtual FEFO — allocate the CURRENT stock onto lots earliest-
    expiry-first and return {lot_id: remaining_on_hand}.

    product_lots.quantity is the RECEIVED quantity (a purchase/manual record);
    sales never decrement it. The truthful "still on hand" per lot is a
    projection of the product's live quantity (the warehouse_stock invariant
    owns the number — p501/p558) assuming First-Expiry-First-Out consumption:
    sales drain the EARLIEST-expiry lots first, so the remaining stock belongs
    to the LATEST-expiry lots — the projection fills latest-first:

        sum(remaining per lot) == min(sum(received), stock_qty)

    Lots with an empty expiry are consumed last (they keep their remaining
    first). Never raises on bad data.
    """
    def _key(lot):
        exp = str(lot.get("expiry_date") or "").strip()
        # latest expiry first (FEFO drains earliest first); undated lots are
        # consumed last ⇒ first to keep their remaining.
        return (1, "9999-12-31") if not exp else (0, exp)

    remaining = {}
    left = max(0.0, float(stock_qty or 0) or 0.0)
    for lot in sorted(lots, key=_key, reverse=True):
        try:
            received = max(0.0, float(lot.get("quantity") or 0) or 0.0)
        except (TypeError, ValueError):
            received = 0.0
        alloc = min(received, left)
        if lot.get("id") is not None:
            remaining[lot.get("id")] = alloc
        left = max(0.0, left - alloc)
    return remaining
