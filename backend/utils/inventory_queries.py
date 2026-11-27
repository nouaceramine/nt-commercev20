"""Single source of truth for the 'low stock' product query filter.

Several routes and reports independently embedded the same MongoDB $expr to
detect products at/below their low-stock threshold (default 10). They are
consolidated here so the meaning of 'low stock' lives in ONE place.

NOTE: a few call sites intentionally use different semantics (e.g. inventory_robot
uses $lte; the restock-suggestions endpoint omits the default) and are left
untouched to preserve their existing behavior.
"""


# P576: legacy-poisoned BSON numbers (NaN/Inf written before the write
# walls existed) must never reach the strict-JSON response — one poisoned
# document otherwise 500s the whole list (the P575-001 read-path doctrine).
PRODUCT_NUMBER_FIELDS = (
    "quantity", "min_quantity", "low_stock_threshold",
    "purchase_price", "wholesale_price", "retail_price",
    "super_wholesale_price", "tariff_a", "tariff_b", "tariff_c", "tariff_d",
    "tax_rate", "qty_per_package",
)


def finite_or_zero(value):
    """Non-finite / non-numeric -> 0; everything else passes through."""
    try:
        f = float(value)
    except (TypeError, ValueError):
        return 0
    import math as _m
    return f if _m.isfinite(f) else 0


def sanitize_product_numbers(doc):
    """In-place: clamp legacy non-finite float fields to 0 for READ payloads.
    Write paths stay walled (422) — this is display defense only."""
    if isinstance(doc, dict):
        import math as _m
        for key in PRODUCT_NUMBER_FIELDS:
            v = doc.get(key)
            if isinstance(v, float) and not _m.isfinite(v):
                doc[key] = 0
    return doc


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
