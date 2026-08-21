"""Duplicate order/lead detection (p240).

Non-blocking detector: when a new order or lead arrives, we look for another
open order/lead with the SAME normalized phone number created within a recent
time window (default 48h). Nothing is rejected — the new document is simply
annotated so staff see the warning before confirming/shipping:

    duplicate_warning: True
    duplicate_of: {"kind": "order"|"lead", "id": ..., "code": ..., "created_at": ..., "status": ...}

Matching rules:
- phone numbers normalized via services.application.ecom_order_service.normalize_phone
  (handles 00213/213/05x/06x/07x variants)
- window default 48h, override via env ECOM_DUP_WINDOW_HOURS
- orders with status cancelled/returned are ignored (a re-order after
  cancellation is legitimate); leads with status lost/converted are ignored
- matching is done in Python over the (small) recent window — no migration of
  existing documents required
"""
from datetime import datetime, timezone, timedelta
import logging
import os

from services.application.ecom_order_service import normalize_phone

logger = logging.getLogger(__name__)

DEFAULT_WINDOW_HOURS = int(os.environ.get("ECOM_DUP_WINDOW_HOURS", "48"))

_IGNORED_ORDER_STATUSES = {"cancelled", "returned"}
_IGNORED_LEAD_STATUSES = {"lost", "converted"}


def _cutoff_iso(window_hours: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=window_hours)).isoformat()


async def find_duplicate_order(db, phone: str, *, window_hours: int = DEFAULT_WINDOW_HOURS,
                               exclude_id: str | None = None) -> dict | None:
    """Most recent open order with the same normalized phone inside the window."""
    p = normalize_phone(phone)
    if not p:
        return None
    cutoff = _cutoff_iso(window_hours)
    rows = await db.ecom_orders.find(
        {"created_at": {"$gte": cutoff}, "status": {"$nin": list(_IGNORED_ORDER_STATUSES)}},
        {"_id": 0, "id": 1, "order_code": 1, "status": 1, "created_at": 1, "customer.phone": 1},
    ).sort("created_at", -1).to_list(200)
    for row in rows:
        if exclude_id and row.get("id") == exclude_id:
            continue
        if normalize_phone((row.get("customer") or {}).get("phone", "")) == p:
            return {"kind": "order", "id": row.get("id"), "code": row.get("order_code"),
                    "status": row.get("status"), "created_at": row.get("created_at")}
    return None


async def find_duplicate_lead(db, phone: str, *, window_hours: int = DEFAULT_WINDOW_HOURS,
                              exclude_id: str | None = None) -> dict | None:
    """Most recent open lead with the same normalized phone inside the window."""
    p = normalize_phone(phone)
    if not p:
        return None
    cutoff = _cutoff_iso(window_hours)
    rows = await db.ecom_leads.find(
        {"created_at": {"$gte": cutoff}, "status": {"$nin": list(_IGNORED_LEAD_STATUSES)}},
        {"_id": 0, "id": 1, "status": 1, "created_at": 1, "phone": 1, "channel": 1},
    ).sort("created_at", -1).to_list(200)
    for row in rows:
        if exclude_id and row.get("id") == exclude_id:
            continue
        if normalize_phone(row.get("phone", "")) == p:
            return {"kind": "lead", "id": row.get("id"), "code": row.get("channel"),
                    "status": row.get("status"), "created_at": row.get("created_at")}
    return None


async def annotate_order(db, doc: dict, *, window_hours: int = DEFAULT_WINDOW_HOURS) -> dict:
    """Attach duplicate_warning/duplicate_of to an order doc (before insert)."""
    try:
        phone = (doc.get("customer") or {}).get("phone", "")
        dup = await find_duplicate_order(db, phone, window_hours=window_hours, exclude_id=doc.get("id"))
        if dup:
            doc["duplicate_warning"] = True
            doc["duplicate_of"] = dup
        else:
            doc["duplicate_warning"] = False
    except Exception as exc:  # noqa: BLE001
        logger.warning("p240 duplicate check failed (order): %s", exc)
    return doc


async def annotate_lead(db, doc: dict, *, window_hours: int = DEFAULT_WINDOW_HOURS) -> dict:
    """Attach duplicate_warning/duplicate_of to a lead doc (before insert).

    A lead is also flagged when the same phone already has an open ORDER —
    that usually means the customer ordered twice through different channels.
    """
    try:
        phone = doc.get("phone", "")
        dup = await find_duplicate_lead(db, phone, window_hours=window_hours, exclude_id=doc.get("id"))
        if not dup:
            dup = await find_duplicate_order(db, phone, window_hours=window_hours)
        if dup:
            doc["duplicate_warning"] = True
            doc["duplicate_of"] = dup
        else:
            doc["duplicate_warning"] = False
    except Exception as exc:  # noqa: BLE001
        logger.warning("p240 duplicate check failed (lead): %s", exc)
    return doc
