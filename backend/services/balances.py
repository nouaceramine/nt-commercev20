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
        {"$match": {"debt_amount": {"$gt": 0}}},
        {"$group": {"_id": "$customer_id", "total_debt": {"$sum": "$debt_amount"}, "sales_count": {"$sum": 1}}},
    ]
    return await db.sales.aggregate(pipeline).to_list(limit)


async def adjust_customer_mirror(db, customer_id: str, *,
                                 balance: Optional[float] = None,
                                 total_debt: Optional[float] = None,
                                 total_purchases: Optional[float] = None):
    """$inc the stored customer mirror fields. None = leave field untouched."""
    inc = {}
    if balance is not None:
        inc["balance"] = balance
    if total_debt is not None:
        inc["total_debt"] = total_debt
    if total_purchases is not None:
        inc["total_purchases"] = total_purchases
    if inc:
        await db.customers.update_one({"id": customer_id}, {"$inc": inc})


async def adjust_supplier_mirror(db, supplier_id: str, *,
                                 balance: Optional[float] = None,
                                 total_purchases: Optional[float] = None):
    """$inc the stored supplier mirror fields. None = leave field untouched."""
    inc = {}
    if balance is not None:
        inc["balance"] = balance
    if total_purchases is not None:
        inc["total_purchases"] = total_purchases
    if inc:
        await db.suppliers.update_one({"id": supplier_id}, {"$inc": inc})
