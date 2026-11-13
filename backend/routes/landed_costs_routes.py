# -*- coding: utf-8 -*-
"""D3: landed costs — distribute purchase extra costs (freight/customs/fees)
across purchase items to compute true landed unit cost, optionally applying
it to product cost prices (with revert).

Storage: purchases.landed = {extras, method, allocation, applied, prev_costs, ...}
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

METHODS = ("value", "quantity")
MAX_EXTRAS = 10


class ExtraCost(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    amount: float = Field(ge=0, le=100_000_000, allow_inf_nan=False)


class LandedIn(BaseModel):
    extras: list[ExtraCost] = []
    method: str = "value"
    apply_to_cost: bool = False


def validate_landed(extras: list, method: str) -> list:
    errors = []
    if method not in METHODS:
        errors.append("bad_method")
    if len(extras) > MAX_EXTRAS:
        errors.append("too_many_extras")
    for ex in extras:
        if not (ex.get("label") or "").strip():
            errors.append("label_required")
        try:
            if float(ex.get("amount", 0)) < 0:
                errors.append("negative_amount")
        except (TypeError, ValueError):
            errors.append("bad_amount")
    return sorted(set(errors))


def distribute_landed(items: list, extras: list, method: str = "value") -> dict:
    """Pure: split extras across items → per-line allocation + landed unit cost.

    Rounding: every line rounds to 2dp; the largest-share line absorbs the
    remainder so sum(allocated) == round(total_extra, 2) exactly.
    """
    total_extra = round(sum(float(e.get("amount", 0) or 0) for e in extras), 2)
    bases, weights = [], []
    for it in items:
        qty = float(it.get("quantity", 0) or 0)
        unit = float(it.get("unit_price", 0) or 0)
        bases.append(round(qty * unit, 2))
        weights.append(bases[-1] if method == "value" else qty)
    total_w = sum(weights)

    lines, allocated_sum, biggest = [], 0.0, -1
    for i, it in enumerate(items):
        qty = float(it.get("quantity", 0) or 0)
        unit = float(it.get("unit_price", 0) or 0)
        w = weights[i]
        share = (w / total_w) if total_w > 0 else 0.0
        alloc = round(total_extra * share, 2)
        allocated_sum += alloc
        if biggest < 0 or w > weights[biggest]:
            biggest = i
        landed_unit = round(unit + (alloc / qty if qty > 0 else 0.0), 2)
        lines.append({
            "product_id": it.get("product_id"),
            "product_name": it.get("product_name", ""),
            "quantity": qty,
            "unit_price": unit,
            "base_total": bases[i],
            "allocated": alloc,
            "landed_total": round(bases[i] + alloc, 2),
            "landed_unit_cost": landed_unit,
        })
    # remainder to the biggest line
    remainder = round(total_extra - allocated_sum, 2)
    if remainder and lines:
        lines[biggest]["allocated"] = round(lines[biggest]["allocated"] + remainder, 2)
        lines[biggest]["landed_total"] = round(lines[biggest]["base_total"] + lines[biggest]["allocated"], 2)
        q = lines[biggest]["quantity"]
        lines[biggest]["landed_unit_cost"] = round(
            lines[biggest]["unit_price"] + (lines[biggest]["allocated"] / q if q > 0 else 0.0), 2)
    return {
        "lines": lines,
        "total_extra": total_extra,
        "total_allocated": round(sum(l["allocated"] for l in lines), 2),
        "grand_total": round(sum(l["landed_total"] for l in lines), 2),
    }


def create_landed_costs_routes(db, get_current_user, get_tenant_admin) -> dict:
    router = APIRouter(prefix="/purchases", tags=["landed-costs"])

    def _now():
        return datetime.now(timezone.utc).isoformat()

    @router.get("/{purchase_id}/landed")
    async def get_landed(purchase_id: str, user: dict = Depends(get_current_user)):
        p = await db.purchases.find_one({"id": purchase_id}, {"_id": 0, "id": 1, "landed": 1})
        if not p:
            raise HTTPException(status_code=404, detail="فاتورة الشراء غير موجودة")
        return {"purchase_id": purchase_id, "landed": p.get("landed")}

    @router.put("/{purchase_id}/landed")
    async def put_landed(purchase_id: str, data: LandedIn, admin: dict = Depends(get_tenant_admin)):
        p = await db.purchases.find_one({"id": purchase_id}, {"_id": 0})
        if not p:
            raise HTTPException(status_code=404, detail="فاتورة الشراء غير موجودة")
        items = p.get("items") or []
        if not items:
            raise HTTPException(status_code=400, detail="الفاتورة بلا أصناف")
        extras = [e.model_dump() for e in data.extras]
        errors = validate_landed(extras, data.method)
        if errors:
            raise HTTPException(status_code=422, detail={"errors": errors})
        if not extras:
            raise HTTPException(status_code=400, detail="لا توجد تكاليف — استخدم الحذف للتراجع")

        old_landed = p.get("landed") or {}
        if old_landed.get("applied"):
            raise HTTPException(status_code=409, detail="التكاليف مُطبَّقة على الأسعار — تراجع أولاً")

        allocation = distribute_landed(items, extras, data.method)
        landed = {
            "extras": extras,
            "method": data.method,
            "allocation": allocation,
            "applied": False,
            "computed_at": _now(),
            "computed_by": admin.get("name") or admin.get("email"),
        }
        if data.apply_to_cost:
            prev = {}
            for ln in allocation["lines"]:
                pid = ln.get("product_id")
                if not pid:
                    continue
                prod = await db.products.find_one({"id": pid}, {"purchase_price": 1})
                if not prod:
                    continue
                prev[pid] = float(prod.get("purchase_price", 0) or 0)
                await db.products.update_one(
                    {"id": pid},
                    {"$set": {"purchase_price": ln["landed_unit_cost"], "updated_at": _now()}},
                )
            landed["applied"] = True
            landed["applied_at"] = _now()
            landed["prev_costs"] = prev
        await db.purchases.update_one({"id": purchase_id}, {"$set": {"landed": landed}})
        return {"ok": True, "landed": landed}

    @router.delete("/{purchase_id}/landed")
    async def delete_landed(purchase_id: str, admin: dict = Depends(get_tenant_admin)):
        p = await db.purchases.find_one({"id": purchase_id}, {"_id": 0, "landed": 1})
        if not p:
            raise HTTPException(status_code=404, detail="فاتورة الشراء غير موجودة")
        landed = p.get("landed")
        if not landed:
            return {"ok": True, "reverted": 0}
        reverted = 0
        if landed.get("applied"):
            for pid, price in (landed.get("prev_costs") or {}).items():
                r = await db.products.update_one(
                    {"id": pid},
                    {"$set": {"purchase_price": float(price), "updated_at": _now()}},
                )
                reverted += r.matched_count
        await db.purchases.update_one({"id": purchase_id}, {"$unset": {"landed": ""}})
        return {"ok": True, "reverted": reverted}

    return {"router": router}
