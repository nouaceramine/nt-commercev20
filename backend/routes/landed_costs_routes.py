"""D3: landed costs — distribute purchase extra costs (freight/customs/fees)
across purchase items to compute true landed unit cost, optionally applying
it to product cost prices (with revert).

Storage: purchases.landed = {extras, method, allocation, applied, prev_costs, ...}

p552 hardening (proven on staging before the change):
  * apply ran without a transaction — two concurrent applies both passed the
    `applied` guard, last-writer's prev_costs captured the OTHER request's
    landed price (110/120 instead of 100), and the revert then leaked it.
    The whole read-modify-write now runs in one Mongo transaction with the
    standard 5-attempt TransientTransactionError retry; the loser re-reads,
    sees applied=True and takes 409.
  * apply_to_cost on a DRAFT purchase was accepted; the later confirm-stock
    rewrote purchase_price from the invoice lines (silently losing the landed
    cost) while the stale prev_costs revert then destroyed the confirmed
    price. Applying is now rejected until stock is confirmed (400).
  * revert blindly restored prev_costs, stomping NEWER legitimate prices
    (a fresh confirmed purchase at 130 was reset to 100). Revert is now
    conditional: it only runs while the live price still equals the landed
    unit cost this document applied; otherwise the product is skipped and
    reported.
  * apply/revert moved purchase_price without any price_history row — the
    audit trail every other price change writes. Both now write
    source="landed_cost" entries against the purchase invoice number.
  * GET required only authentication; it now requires purchases.view like
    every other purchase read.
"""
import asyncio
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError, PyMongoError

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
    from utils.permissions import create_permission_checker
    require_permission = create_permission_checker(db, get_current_user)
    purchases_view = require_permission("purchases.view")
    router = APIRouter(prefix="/purchases", tags=["landed-costs"])

    def _now():
        return datetime.now(UTC).isoformat()

    async def _price_history(pid: str, product: dict, old: float, new: float,
                             invoice: str, admin_name: str, now: str, session):
        import uuid as _uuid
        await db.price_history.insert_one({
            "id": str(_uuid.uuid4()),
            "product_id": pid,
            "product_name": product.get("name_ar") or product.get("name_en") or "",
            "old_price": old,
            "new_price": new,
            "price_type": "purchase_price",
            "change_percent": round(((new - old) / old) * 100, 2) if old else 0.0,
            "changed_by": admin_name,
            "changed_by_name": admin_name,
            "source": "landed_cost",
            "reference": invoice,
            "created_at": now,
        }, session=session)

    @router.get("/{purchase_id}/landed")
    async def get_landed(purchase_id: str, user: dict = Depends(purchases_view)):
        p = await db.purchases.find_one({"id": purchase_id}, {"_id": 0, "id": 1, "landed": 1})
        if not p:
            raise HTTPException(status_code=404, detail="فاتورة الشراء غير موجودة")
        return {"purchase_id": purchase_id, "landed": p.get("landed")}

    async def _put_landed_impl(purchase_id: str, data: LandedIn, admin: dict, session):
        p = await db.purchases.find_one({"id": purchase_id}, {"_id": 0}, session=session)
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

        if data.apply_to_cost and p.get("stock_status", "confirmed") != "confirmed":
            # p552: confirming a draft rewrites purchase_price from the invoice
            # lines — a landed cost applied earlier would be silently lost and
            # its stale prev_costs would later destroy the confirmed price.
            raise HTTPException(status_code=400, detail="طبّق التكاليف على الأسعار بعد تأكيد المخزون")

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
            now = _now()
            admin_name = admin.get("name") or admin.get("email") or ""
            invoice = p.get("invoice_number", "")
            prev = {}
            for ln in allocation["lines"]:
                pid = ln.get("product_id")
                if not pid:
                    continue
                prod = await db.products.find_one({"id": pid}, session=session)
                if not prod:
                    continue
                old_pp = float(prod.get("purchase_price", 0) or 0)
                prev[pid] = old_pp
                await db.products.update_one(
                    {"id": pid},
                    {"$set": {"purchase_price": ln["landed_unit_cost"], "updated_at": now}},
                    session=session,
                )
                if abs(float(ln["landed_unit_cost"]) - old_pp) > 1e-9:
                    await _price_history(pid, prod, old_pp, float(ln["landed_unit_cost"]),
                                         invoice, admin_name, now, session)
            landed["applied"] = True
            landed["applied_at"] = now
            landed["prev_costs"] = prev
        await db.purchases.update_one({"id": purchase_id}, {"$set": {"landed": landed}}, session=session)
        return {"ok": True, "landed": landed}

    @router.put("/{purchase_id}/landed")
    async def put_landed(purchase_id: str, data: LandedIn, admin: dict = Depends(get_tenant_admin)):
        from config.database import client
        for attempt in range(5):
            try:
                async with await client.start_session() as tx_session, \
                        tx_session.start_transaction():
                        return await _put_landed_impl(purchase_id, data, admin, tx_session)
            except (DuplicateKeyError, PyMongoError) as exc:
                if attempt == 4 or (
                    not isinstance(exc, DuplicateKeyError)
                    and not exc.has_error_label("TransientTransactionError")
                ):
                    raise
                await asyncio.sleep(0.02 * (2 ** attempt))

    async def _delete_landed_impl(purchase_id: str, admin: dict, session):
        p = await db.purchases.find_one({"id": purchase_id}, {"_id": 0}, session=session)
        if not p:
            raise HTTPException(status_code=404, detail="فاتورة الشراء غير موجودة")
        landed = p.get("landed")
        if not landed:
            return {"ok": True, "reverted": 0, "skipped": 0}
        reverted = 0
        skipped = 0
        if landed.get("applied"):
            now = _now()
            admin_name = admin.get("name") or admin.get("email") or ""
            invoice = p.get("invoice_number", "")
            prev_costs = landed.get("prev_costs") or {}
            lines = ((landed.get("allocation") or {}).get("lines")) or []
            expected = {ln.get("product_id"): ln.get("landed_unit_cost") for ln in lines}
            for pid, price in prev_costs.items():
                prod = await db.products.find_one({"id": pid}, session=session)
                if not prod:
                    skipped += 1
                    continue
                current = float(prod.get("purchase_price", 0) or 0)
                exp = expected.get(pid)
                if exp is None or abs(current - float(exp)) > 0.01:
                    # p552: the live price no longer equals what this document
                    # applied — a newer purchase/manual edit owns it now.
                    # Stale prev_costs must never stomp it.
                    skipped += 1
                    continue
                await db.products.update_one(
                    {"id": pid},
                    {"$set": {"purchase_price": float(price), "updated_at": now}},
                    session=session,
                )
                if abs(float(price) - current) > 1e-9:
                    await _price_history(pid, prod, current, float(price),
                                         invoice, admin_name, now, session)
                reverted += 1
        await db.purchases.update_one({"id": purchase_id}, {"$unset": {"landed": ""}}, session=session)
        return {"ok": True, "reverted": reverted, "skipped": skipped}

    @router.delete("/{purchase_id}/landed")
    async def delete_landed(purchase_id: str, admin: dict = Depends(get_tenant_admin)):
        from config.database import client
        for attempt in range(5):
            try:
                async with await client.start_session() as tx_session, \
                        tx_session.start_transaction():
                        return await _delete_landed_impl(purchase_id, admin, tx_session)
            except (DuplicateKeyError, PyMongoError) as exc:
                if attempt == 4 or (
                    not isinstance(exc, DuplicateKeyError)
                    and not exc.has_error_label("TransientTransactionError")
                ):
                    raise
                await asyncio.sleep(0.02 * (2 ** attempt))

    return {"router": router}
