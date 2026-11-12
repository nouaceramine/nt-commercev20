"""Shared money-amount validation for wallet/financial routes (p495c)."""
import math

from fastapi import HTTPException


def parse_amount(value, allow_zero=False):
    """Coerce to a finite float; reject NaN/Inf/garbage/negatives with 400."""
    try:
        amount = float(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="المبلغ غير صالح")
    if not math.isfinite(amount):
        raise HTTPException(status_code=400, detail="المبلغ غير صالح")
    if allow_zero:
        if amount < 0:
            raise HTTPException(status_code=400, detail="المبلغ يجب ألا يكون سالباً")
    elif amount <= 0:
        raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون أكبر من صفر")
    return amount
