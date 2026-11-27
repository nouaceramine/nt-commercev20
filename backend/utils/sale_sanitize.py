"""P577: strict-JSON read-path defense for the sales & customers surfaces.

Legacy BSON documents written BEFORE the write walls (p508/P569) can hold
NaN/Inf numbers. One poisoned document otherwise 500s the whole list or
report (the P575-001/P576-001 read-path doctrine): sanitize at the read
choke points. Write paths stay walled (422/400) — display defense only.
"""
import math


def finite_or_zero(value):
    """Non-finite / non-numeric -> 0; everything else passes through."""
    try:
        f = float(value)
    except (TypeError, ValueError):
        return 0
    return f if math.isfinite(f) else 0


SALE_NUMBER_FIELDS = (
    "total", "paid_amount", "remaining", "debt_amount", "discount",
    "subtotal", "delivery_fee", "tax",
)
SALE_ITEM_NUMBER_FIELDS = (
    "quantity", "unit_price", "discount", "purchase_price", "total",
)
CUSTOMER_NUMBER_FIELDS = (
    "balance", "total_debt", "total_purchases", "max_debt_limit",
    "special_discount", "loyalty_points",
)
INSTALLMENT_NUMBER_FIELDS = ("amount", "principal_share", "interest_share")


def _clamp_fields(doc, fields):
    if isinstance(doc, dict):
        for key in fields:
            v = doc.get(key)
            if isinstance(v, float) and not math.isfinite(v):
                doc[key] = 0
    return doc


def sanitize_sale_numbers(doc):
    """In-place: clamp legacy non-finite floats on a sale doc for READs."""
    _clamp_fields(doc, SALE_NUMBER_FIELDS)
    if isinstance(doc, dict):
        for item in doc.get("items") or []:
            _clamp_fields(item, SALE_ITEM_NUMBER_FIELDS)
        for pay in doc.get("payments") or []:
            _clamp_fields(pay, ("amount",))
    return doc


def sanitize_customer_numbers(doc):
    return _clamp_fields(doc, CUSTOMER_NUMBER_FIELDS)


def sanitize_installment_numbers(doc):
    return _clamp_fields(doc, INSTALLMENT_NUMBER_FIELDS)
