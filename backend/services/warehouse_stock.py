"""Transactional per-warehouse stock balances."""
import math
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from pymongo import ReturnDocument


def warehouse_stock_id(product_id: str, warehouse_id: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"warehouse-stock:{product_id}:{warehouse_id}"))


async def adjust_warehouse_stock(
    db, product_id: str, warehouse_id: str, delta: float,
    product_quantity_before: float, session=None, initialize_from_product: bool = True,
    allow_negative: bool = False,
):
    """Adjust one location while the caller's transaction controls atomicity.

    Legacy products have no location rows. The first source operation assigns
    their current total to that source; a destination starts at zero. New rows
    use the deterministic id as MongoDB's unique `_id`, so concurrent first
    writes conflict instead of creating two logical balances. Existing rows
    are changed atomically with `$inc`, never by writing back a stale value.
    """
    # P568: chokepoint wall — a non-finite delta would poison the balance
    # forever (BSON nan/inf). Entry points validate their inputs; this is
    # defense in depth at the one shared stock-mutation service.
    if not math.isfinite(float(delta)):
        raise HTTPException(status_code=400, detail="Non-finite stock delta")
    if not warehouse_id or abs(float(delta)) < 1e-12:
        return None
    stock_id = warehouse_stock_id(product_id, warehouse_id)
    delta = float(delta)
    now = datetime.now(timezone.utc).isoformat()
    stock = await db.warehouse_stock.find_one({"id": stock_id}, session=session)
    if stock is None:
        # p558: the legacy "first location inherits the product total" path must
        # fire exactly once per product and only while NO location rows exist.
        # The product-level flag is claimed atomically — a racing first-write at
        # another location loses with a TransientTransactionError and retries
        # into the row-aware branch — so a second untouched location can no
        # longer re-inherit the full total and inflate sum(locations) past
        # products.quantity.
        initial = 0.0
        if initialize_from_product:
            claim = await db.products.find_one_and_update(
                {"id": product_id, "warehouse_stock_init": {"$ne": True}},
                {"$set": {"warehouse_stock_init": True}},
                session=session)
            if claim is not None:
                any_row = await db.warehouse_stock.find_one(
                    {"product_id": product_id}, {"_id": 1}, session=session)
                if not any_row:
                    initial = float(product_quantity_before or 0)
        new_quantity = initial + delta
        # p501: reversal paths (purchase delete/reopen, manual quantity set) pass
        # allow_negative — products.quantity already goes negative there, and
        # blocking the reversal made such purchases undeletable/unreopenable.
        if new_quantity < -1e-9 and not allow_negative:
            raise HTTPException(status_code=400, detail="Insufficient warehouse quantity")
        stock = {
            "_id": stock_id,
            "id": stock_id,
            "product_id": product_id,
            "warehouse_id": warehouse_id,
            "quantity": new_quantity if allow_negative else max(0.0, new_quantity),
            "created_at": now,
            "updated_at": now,
        }
        await db.warehouse_stock.insert_one(stock, session=session)
        return stock["quantity"]

    query = {"_id": stock["_id"]}
    if delta < 0 and not allow_negative:
        query["quantity"] = {"$gte": -delta}
    updated = await db.warehouse_stock.find_one_and_update(
        query,
        {"$inc": {"quantity": delta}, "$set": {"updated_at": now}},
        session=session,
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        raise HTTPException(status_code=400, detail="Insufficient warehouse quantity")
    return float(updated.get("quantity", 0) or 0)
