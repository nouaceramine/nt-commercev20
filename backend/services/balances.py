"""Unified balances service (Phase D).

Single knowledge point for HOW customer/supplier debt mirrors are stored and
maintained. The authoritative customer debt is derived from sales.debt_amount;
customers.balance / customers.total_debt / suppliers.balance /
suppliers.total_purchases are stored mirrors kept in sync via the adjust_*
helpers below. All call sites were rewired here without changing any update
semantics (same $inc ops, same fields, same values).
"""
from typing import Optional


async def customer_debt_aggregates(db, limit: int = 1000):
    """Per-customer open debt derived from sales (authoritative source)."""
    pipeline = [
        # p64: sales store open debt in `remaining` (legacy docs used `debt_amount`)
        {"$match": {"$or": [{"remaining": {"$gt": 0}}, {"debt_amount": {"$gt": 0}}]}},
        {"$group": {"_id": "$customer_id",
                    "total_debt": {"$sum": {"$max": [{"$ifNull": ["$remaining", 0]}, {"$ifNull": ["$debt_amount", 0]}]}},
                    "sales_count": {"$sum": 1}}},
    ]
    return await db.sales.aggregate(pipeline).to_list(limit)


async def adjust_customer_mirror(db, customer_id: str, *,
                                 balance: Optional[float] = None,
                                 total_debt: Optional[float] = None,
                                 total_purchases: Optional[float] = None,
                                 session=None):
    """$inc the stored customer mirror fields. None = leave field untouched."""
    inc = {}
    if balance is not None:
        inc["balance"] = balance
    if total_debt is not None:
        inc["total_debt"] = total_debt
    if total_purchases is not None:
        inc["total_purchases"] = total_purchases
    if inc:
        await db.customers.update_one({"id": customer_id}, {"$inc": inc}, session=session)


async def adjust_supplier_mirror(db, supplier_id: str, *,
                                 balance: Optional[float] = None,
                                 total_purchases: Optional[float] = None,
                                 session=None):
    """$inc the stored supplier mirror fields. None = leave field untouched."""
    inc = {}
    if balance is not None:
        inc["balance"] = balance
    if total_purchases is not None:
        inc["total_purchases"] = total_purchases
    if inc:
        await db.suppliers.update_one({"id": supplier_id}, {"$inc": inc}, session=session)


async def allocate_customer_payment(db, customer_id: str, amount: float, method: str = None, session=None):
    """p64: FIFO-allocate a customer debt payment across open sales.

    Sales may store open debt in `remaining` (current) or `debt_amount` (legacy);
    both are synced to the same value after allocation. Oldest sale first.
    Returns (applied_amount, sales_updated).
    """
    sales = await db.sales.find(
        {"customer_id": customer_id, "$or": [{"remaining": {"$gt": 0}}, {"debt_amount": {"$gt": 0}}]},
        session=session,
    ).sort("created_at", 1).to_list(100)
    remaining_payment = float(amount)
    sales_updated = []
    for sale in sales:
        if remaining_payment <= 0:
            break
        open_debt = max(float(sale.get("remaining") or 0), float(sale.get("debt_amount") or 0))
        if open_debt <= 0:
            continue
        applied = min(remaining_payment, open_debt)
        new_debt = round(open_debt - applied, 2)
        new_paid = float(sale.get("paid_amount", 0)) + applied
        _upd = {"$set": {
            "remaining": new_debt, "debt_amount": new_debt, "paid_amount": new_paid,
            "payment_status": "paid" if new_debt <= 0.01 else "partial",
        }}
        if method:  # p67: track which box this payment used
            from datetime import datetime as _dt, timezone as _tz
            _upd["$push"] = {"payments": {"amount": applied, "method": method, "at": _dt.now(_tz.utc).isoformat()}}
        await db.sales.update_one({"id": sale["id"]}, _upd, session=session)
        remaining_payment -= applied
        sales_updated.append({"sale_id": sale["id"], "payment_applied": applied, "remaining_debt": new_debt})
    return round(float(amount) - remaining_payment, 2), sales_updated


async def allocate_supplier_payment(db, supplier_id: str, amount: float, method: str = None, session=None):
    """p64: FIFO-allocate a supplier debt payment across open purchases (`remaining`).

    Oldest purchase first. Returns (applied_amount, purchases_updated).
    """
    purchases = await db.purchases.find({"supplier_id": supplier_id, "remaining": {"$gt": 0}}, session=session).sort("created_at", 1).to_list(100)
    remaining_payment = float(amount)
    purchases_updated = []
    for purchase in purchases:
        if remaining_payment <= 0:
            break
        open_debt = float(purchase.get("remaining") or 0)
        if open_debt <= 0:
            continue
        applied = min(remaining_payment, open_debt)
        new_debt = round(open_debt - applied, 2)
        new_paid = float(purchase.get("paid_amount", 0)) + applied
        from datetime import datetime, timezone
        _upd = {"$set": {
            "paid_amount": new_paid, "remaining": new_debt,
            "status": "paid" if new_debt <= 0 else "partial",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}
        if method:  # p67: track which box this payment used
            _upd["$push"] = {"payments": {"amount": applied, "method": method, "at": datetime.now(timezone.utc).isoformat()}}
        await db.purchases.update_one({"id": purchase["id"]}, _upd, session=session)
        remaining_payment -= applied
        purchases_updated.append({"purchase_id": purchase["id"], "paid": applied, "payment_applied": applied, "remaining_debt": new_debt})
    return round(float(amount) - remaining_payment, 2), purchases_updated
