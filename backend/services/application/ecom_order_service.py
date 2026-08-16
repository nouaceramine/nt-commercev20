"""E-commerce order application service — status state machine + side effects.

Owns: transition validation, POS inventory sync (idempotent), WhatsApp
customer notification, and ecom_order.* event publishing.
"""
from datetime import datetime, timezone
import logging
import re
import uuid

from fastapi import HTTPException

from routes.ecom.constants import ORDER_STATUS_KEYS, ORDER_STATUSES, STATUS_TRANSITIONS

logger = logging.getLogger(__name__)



# ── p100: shared customer-reputation network (aggregate counters only — no personal data) ──
def normalize_phone(phone: str) -> str:
    """Normalize Algerian phones to local digits (0XXXXXXXXX) for cross-tenant matching."""
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("00213"):
        digits = "0" + digits[5:]
    elif digits.startswith("213") and len(digits) >= 12:
        digits = "0" + digits[3:]
    if len(digits) == 9 and digits[0] in "567":
        digits = "0" + digits
    return digits


def _trust_from_counts(delivered: int, returned: int):
    outcomes = delivered + returned
    if outcomes == 0:
        return "unknown", None
    rate = round(returned / outcomes, 3)
    if outcomes >= 2 and rate >= 0.4:
        return "risk", rate
    if outcomes >= 2 and rate < 0.2:
        return "good", rate
    return "warn", rate


async def get_network_trust(phone: str) -> dict:
    """Cross-tenant reputation lookup (main_db.customer_reputation)."""
    p = normalize_phone(phone)
    if not p:
        return {"found": False, "trust": "unknown", "phone": ""}
    from config.database import main_db
    doc = await main_db.customer_reputation.find_one({"_id": p}, {"_id": 0})
    if not doc:
        return {"found": False, "trust": "unknown", "phone": p}
    d = int(doc.get("delivered") or 0)
    r = int(doc.get("returned") or 0)
    trust, rate = _trust_from_counts(d, r)
    return {
        "found": True, "phone": p, "trust": trust,
        "orders": int(doc.get("orders") or 0), "delivered": d, "returned": r,
        "outcomes": d + r, "return_rate": rate,
        "tenants": len(doc.get("tenants") or []),
    }


async def reputation_on_create(order: dict, tenant_id: str = "") -> None:
    """Feed the network: a new order was placed by this phone."""
    phone = normalize_phone((order.get("customer") or {}).get("phone", ""))
    if not phone:
        return
    from config.database import main_db
    now = datetime.now(timezone.utc).isoformat()
    upd = {
        "$inc": {"orders": 1},
        "$set": {"updated_at": now},
        "$setOnInsert": {"created_at": now, "delivered": 0, "returned": 0},
    }
    if tenant_id:
        upd["$addToSet"] = {"tenants": tenant_id}
    await main_db.customer_reputation.update_one({"_id": phone}, upd, upsert=True)


async def _reputation_on_status(order: dict, prev_status: str, new_status: str) -> None:
    """Only real delivery-attempt outcomes count: shipped→delivered / shipped→refunded."""
    if prev_status == "shipped" and new_status == "delivered":
        field = "delivered"
    elif prev_status == "shipped" and new_status == "refunded":
        field = "returned"
    else:
        return
    phone = normalize_phone((order.get("customer") or {}).get("phone", ""))
    if not phone:
        return
    from config.database import main_db
    now = datetime.now(timezone.utc).isoformat()
    await main_db.customer_reputation.update_one(
        {"_id": phone},
        {"$inc": {field: 1}, "$set": {"updated_at": now},
         "$setOnInsert": {"created_at": now, "orders": 0}},
        upsert=True,
    )


async def change_order_status(db, order_id: str, new_status: str, note: str, user: dict, return_fee_override=None) -> dict:
    """Transition an order to a new status enforcing the state machine."""
    new_status = (new_status or "").strip().lower()
    if new_status not in ORDER_STATUS_KEYS:
        raise HTTPException(status_code=400, detail="حالة غير صالحة")

    order = await db.ecom_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    current = order.get("status", "new")
    if new_status == current:
        return {"ok": True, "status": new_status, "unchanged": True}
    allowed = STATUS_TRANSITIONS.get(current, set())
    if new_status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"لا يمكن الانتقال من '{ORDER_STATUSES[current]['label_ar']}' إلى '{ORDER_STATUSES[new_status]['label_ar']}'",
        )

    now = datetime.now(timezone.utc).isoformat()
    await db.ecom_orders.update_one(
        {"id": order_id},
        {
            "$set": {"status": new_status, "updated_at": now},
            "$push": {"status_history": {"status": new_status, "at": now, "by": user.get("id"), "note": note or ""}},
        },
    )

    inventory_result = await _sync_inventory_on_status_change(db, order, new_status, now)

    # p59: accounting lifecycle — ledger entries on confirm/deliver/return/cancel
    try:
        if new_status == "confirmed":
            await _record_confirmation_financials(db, order, now)
        elif new_status == "delivered":
            await _mark_financials_realized(db, order, now)
        elif new_status == "refunded":
            await _record_return_financials(db, order, now, return_fee_override)
        elif new_status == "cancelled":
            await _void_financials(db, order, now)
    except Exception as exc:  # noqa: BLE001 — never block a status change on a ledger failure
        logger.warning("financials hook failed for order %s: %s", order_id, exc)

    # p86: cash wallet + auto expenses (separate guard — never blocks status change)
    try:
        if new_status in ("shipped", "delivered", "refunded"):
            await _record_store_accounting(db, order_id, new_status, now, user)
    except Exception as exc:  # noqa: BLE001
        logger.warning("store accounting hook failed for order %s: %s", order_id, exc)

    # p87: mirror into the POS sales ledger (/sales + dashboard + reports)
    try:
        await sync_sale_doc(db, {**order, "status": new_status, "updated_at": now})
    except Exception as exc:  # noqa: BLE001
        logger.warning("sale doc sync failed for order %s: %s", order_id, exc)

    # p100: shared reputation network — record delivery-attempt outcomes
    try:
        await _reputation_on_status(order, current, new_status)
    except Exception as exc:  # noqa: BLE001
        logger.warning("reputation hook failed for order %s: %s", order_id, exc)

    # مزامنة عكسية لطلبات متجر الويب: عكس الحالة إلى store_orders
    # (المخزون أداره _sync_inventory أعلاه — نعلّم stock_restored لتفادي إعادة مزدوجة)
    if order.get("channel") == "webstore" and order.get("external_id"):
        try:
            _rev = {"new": "pending", "confirmed": "confirmed", "packed": "confirmed",
                    "shipped": "shipped", "delivered": "delivered",
                    "cancelled": "cancelled", "refunded": "refunded"}
            _so = {"status": _rev.get(new_status, "pending"), "updated_at": now}
            if new_status in ("cancelled", "refunded"):
                _so["stock_restored"] = True
            await db.store_orders.update_one({"id": order["external_id"]}, {"$set": _so})
        except Exception as exc:  # noqa: BLE001
            logger.warning("webstore reverse sync failed for %s: %s", order_id, exc)

    if new_status == "delivered":
        try:
            from services.smart_notifications import notify_shipment_delivered
            await notify_shipment_delivered(db, order)
        except Exception:
            pass

    try:
        await _maybe_notify_customer(db, order, new_status)
    except Exception as exc:  # noqa: BLE001 — never let notification failures block status change
        logger.warning("WhatsApp notify failed for order %s: %s", order_id, exc)

    # EDA: emit ecom_order.confirmed / .cancelled (dual-write)
    try:
        from services.event_bus import event_bus
        tenant_id = user.get("tenant_id") or "platform"
        if new_status == "confirmed":
            await event_bus.publish(
                "ecom_order.confirmed",
                {
                    "order_id": order_id,
                    "order_code": order.get("order_code"),
                    "items": [
                        {"product_id": it.get("product_id"), "quantity": int(it.get("qty", 0) or 0), "name": it.get("name")}
                        for it in (order.get("items") or []) if it.get("product_id")
                    ],
                    "total": order.get("total"),
                    "channel": order.get("channel"),
                },
                tenant_id=tenant_id,
                source="ecom.orders_routes",
            )
        elif new_status in ("cancelled", "refunded"):
            await event_bus.publish(
                "ecom_order.cancelled",
                {"order_id": order_id, "new_status": new_status},
                tenant_id=tenant_id,
                source="ecom.orders_routes",
            )
    except Exception:
        pass

    return {
        "ok": True,
        "status": new_status,
        "previous": current,
        "inventory": inventory_result,
    }


async def deduct_order_inventory(db, order: dict, now_iso: str) -> dict:
    """Atomically deduct POS product stock for an order (idempotent via flag).

    p59: stock is reserved the moment the order enters the system (status
    'new' / انتظار) — confirmation no longer performs the deduction.
    """
    result = {"deducted": [], "restored": [], "warnings": []}
    items_with_product = [it for it in (order.get("items") or []) if it.get("product_id")]
    if not items_with_product:
        return result
    order_id = order.get("id")
    if order.get("inventory_deducted"):
        return result
    deductions = []
    for it in items_with_product:
        pid = it["product_id"]
        qty = int(it.get("qty", 0) or 0)
        if qty <= 0:
            continue
        product = await db.products.find_one({"id": pid}, {"_id": 0, "id": 1, "name_ar": 1, "name_en": 1, "quantity": 1})
        if not product:
            result["warnings"].append(f"⚠️ منتج غير موجود في المخزون: {it.get('name', pid)}")
            continue
        new_qty = (product.get("quantity") or 0) - qty
        await db.products.update_one({"id": pid}, {"$inc": {"quantity": -qty}, "$set": {"updated_at": now_iso}})
        deductions.append({"product_id": pid, "qty": qty, "deducted_at": now_iso})
        result["deducted"].append({
            "product_id": pid,
            "name": product.get("name_ar") or product.get("name_en") or it.get("name"),
            "qty": qty,
            "stock_after": new_qty,
        })
        if new_qty < 0:
            result["warnings"].append(f"⚠️ المخزون أصبح سالباً للمنتج '{product.get('name_ar') or it.get('name')}' ({new_qty})")
    if deductions:
        await db.ecom_orders.update_one(
            {"id": order_id},
            {"$set": {"inventory_deducted": True, "inventory_deductions": deductions, "inventory_deducted_at": now_iso}},
        )
    return result


async def _sync_inventory_on_status_change(db, order: dict, new_status: str, now_iso: str) -> dict:
    """Deduct on first move to 'confirmed' (legacy path — p59 deducts at
    creation so this is normally a no-op) / restore on cancelled|refunded."""
    result = {"deducted": [], "restored": [], "warnings": []}
    items_with_product = [it for it in (order.get("items") or []) if it.get("product_id")]
    if not items_with_product:
        return result
    order_id = order.get("id")
    already_deducted = bool(order.get("inventory_deducted"))

    # Deduct on first move to 'confirmed'
    if new_status == "confirmed" and not already_deducted:
        return await deduct_order_inventory(db, order, now_iso)

    # Restore on transition to cancelled / refunded
    if new_status in ("cancelled", "refunded") and already_deducted:
        deductions = order.get("inventory_deductions") or []
        if not deductions:
            deductions = [{"product_id": it["product_id"], "qty": int(it.get("qty", 0) or 0),
                           "variant_index": it.get("variant_index")} for it in items_with_product]
        for d in deductions:
            pid = d.get("product_id")
            qty = int(d.get("qty", 0) or 0)
            if not pid or qty <= 0:
                continue
            res = await db.products.update_one({"id": pid}, {"$inc": {"quantity": qty}, "$set": {"updated_at": now_iso}})
            _vidx = d.get("variant_index")  # p73: restore variant stock too
            if isinstance(_vidx, int):
                await db.products.update_one({"id": pid}, {"$inc": {f"variants.{_vidx}.quantity": qty}})
            if res.matched_count == 0:
                result["warnings"].append(f"⚠️ تعذَّرت إعادة المخزون لمنتج محذوف: {pid}")
                continue
            result["restored"].append({"product_id": pid, "qty": qty})
        await db.ecom_orders.update_one(
            {"id": order_id},
            {"$set": {"inventory_deducted": False, "inventory_restored_at": now_iso}},
        )
        return result

    return result


# ─── p59: e-commerce accounting ledger (collection: ecom_order_financials) ───

async def _compute_cogs(db, order: dict) -> float:
    """Cost of goods from linked POS products' purchase_price."""
    cogs = 0.0
    for it in order.get("items") or []:
        pid = it.get("product_id")
        qty = int(it.get("qty", 0) or 0)
        if not pid or qty <= 0:
            continue
        p = await db.products.find_one({"id": pid}, {"_id": 0, "purchase_price": 1})
        if p:
            cogs += float(p.get("purchase_price") or 0) * qty
    return round(cogs, 2)


async def _courier_return_fee(db, order: dict) -> float:
    """Return-shipping fee configured on the courier's integration (p59).
    Each shipping company carries its own return price on its integration doc."""
    courier = (order.get("courier") or "").strip().lower()
    if not courier:
        return 0.0
    integ = await db.ecom_integrations.find_one({"channel": courier, "is_active": True}) \
        or await db.ecom_integrations.find_one({"channel": courier})
    if not integ:
        return 0.0
    try:
        return max(0.0, float(integ.get("return_fee") or 0))
    except (TypeError, ValueError):
        return 0.0


# --- p86: store accounting — COD wallet movements + auto expenses ---
ECOM_BOX_ID = "ecom_store"


async def _cash_tx(db, box_id, tx_type, amount, description, ref_type, ref_id, now, user,
                   box_name="محفظة المتجر الإلكتروني"):
    """Move money in/out of a cash box and journal it (upserts the box —
    self-heals when init_cash_boxes hasn't run for this tenant yet)."""
    await db.cash_boxes.update_one(
        {"id": box_id},
        {"$inc": {"balance": amount if tx_type == "income" else -amount},
         "$set": {"updated_at": now},
         "$setOnInsert": {"name": box_name, "name_fr": box_name, "type": "ecom"}},
        upsert=True,
    )


async def _courier_box(db, order: dict):
    """p88: one wallet per shipping company — its balance = what that courier
    currently owes us (COD collected, not yet paid out). Orders without a
    courier fall back to the generic store wallet."""
    courier = (order.get("courier") or "").strip().lower()
    if not courier:
        return ECOM_BOX_ID, "محفظة المتجر الإلكتروني"
    name = courier
    try:
        integ = await db.ecom_integrations.find_one({"channel": courier}, {"_id": 0, "name": 1})
        if integ and integ.get("name"):
            name = str(integ["name"]).replace("(شحن)", "").strip()
    except Exception:
        pass
    return f"{ECOM_BOX_ID}_{courier}", f"محفظة {name}"


async def _auto_expense(db, amount, category, title, now):
    """Book a P&L expense without touching a cash box (courier deducts these
    fees from the payout — wallet movement is done separately)."""
    from services.code_generator import generate_code
    code = await generate_code(db, "expenses", "CH", 5, with_year=True)
    await db.expenses.insert_one({
        "id": str(uuid.uuid4()), "title": title, "category": category,
        "amount": amount, "payment_method": "", "date": now[:10], "created_at": now,
        "code": code, "expense_number": code,  # unique index on expense_number
    })


async def _record_store_accounting(db, order_id: str, new_status: str, now: str, user: dict) -> None:
    """p86: link store orders to the ecom wallet + expense ledger (idempotent).

    Wallet = money the courier collects/holds on our behalf:
      delivered -> + (total - shipping_fee)       (net COD the courier pays out)
      refunded  -> reversal of that income + courier return charges
    P&L expenses (no cash-box impact):
      shipped   -> shipping_fee under شحن المتجر الإلكتروني
      refunded  -> return_fee + packaging under مرتجعات المتجر
    """
    order = await db.ecom_orders.find_one({"id": order_id})
    if not order:
        return
    box_id, box_name = await _courier_box(db, order)
    code = order.get("order_code") or order_id
    total = round(float(order.get("total") or 0), 2)
    shipping = round(float(order.get("shipping_fee") or 0), 2)
    packaging = round(float(order.get("packaging_cost") or 0), 2)
    flags = {}

    if new_status == "shipped" and not order.get("shipping_expensed") and shipping > 0:
        await _auto_expense(db, shipping, "شحن المتجر الإلكتروني", f"رسوم شحن الطلب {code}", now)
        flags["shipping_expensed"] = True

    elif new_status == "delivered" and not order.get("wallet_booked"):
        net = round(total - shipping, 2)
        if net > 0:
            await _cash_tx(db, box_id, "income", net,
                           f"تحصيل طلب المتجر {code} (صافي بعد الشحن)", "ecom_delivery", order_id, now, user, box_name)
        if not order.get("shipping_expensed") and shipping > 0:
            await _auto_expense(db, shipping, "شحن المتجر الإلكتروني", f"رسوم شحن الطلب {code}", now)
            flags["shipping_expensed"] = True
        flags["wallet_booked"] = True

    elif new_status == "refunded":
        fee = round(float(order.get("return_fee") or 0), 2)
        if order.get("wallet_booked") and not order.get("wallet_reversed"):
            net = round(total - shipping, 2)
            if net > 0:
                await _cash_tx(db, box_id, "expense", net,
                               f"عكس تحصيل الطلب المرتجع {code}", "ecom_return_reversal", order_id, now, user, box_name)
            flags["wallet_reversed"] = True
        if not order.get("return_deducted"):
            courier_charge = round(shipping + fee, 2)
            if courier_charge > 0:
                await _cash_tx(db, box_id, "expense", courier_charge,
                               f"رسوم شركة التوصيل للطلب المرتجع {code}", "ecom_return_fee", order_id, now, user, box_name)
            flags["return_deducted"] = True
        if not order.get("return_expensed"):
            exp = round(fee + packaging + (0 if order.get("shipping_expensed") else shipping), 2)
            if exp > 0:
                await _auto_expense(db, exp, "مرتجعات المتجر",
                                    f"خسائر إرجاع الطلب {code} (إرجاع {fee} + تغليف {packaging})", now)
            flags["return_expensed"] = True

    if flags:
        await db.ecom_orders.update_one({"id": order_id}, {"$set": {**flags, "updated_at": now}})


async def sync_sale_doc(db, order: dict) -> None:
    """p87: mirror an ecom order into the POS sales ledger so /sales, dashboard
    stats and daily reports see it. Idempotent upsert keyed ecom-{order_id}.
    Status mapping: cancelled/refunded -> returned (excluded from stats),
    delivered -> paid (money collected), otherwise -> unpaid (COD pending)."""
    order_id = order.get("id")
    if not order_id:
        return
    sale_id = f"ecom-{order_id}"
    st = order.get("status", "new")
    sale_status = "returned" if st in ("cancelled", "refunded") else ("paid" if st == "delivered" else "unpaid")
    now = datetime.now(timezone.utc).isoformat()
    items = []
    for it in (order.get("items") or []):
        pid = it.get("product_id")
        pp = it.get("purchase_price")
        if pp is None and pid:
            p = await db.products.find_one({"id": pid}, {"_id": 0, "purchase_price": 1})
            pp = (p or {}).get("purchase_price", 0)
        qty = int(it.get("qty", 0) or 0)
        price = float(it.get("price", 0) or 0)
        items.append({
            "product_id": pid, "product_name": it.get("name") or "",
            "barcode": it.get("sku") or "", "quantity": qty,
            "unit_price": price, "discount": 0,
            "purchase_price": float(pp or 0),
            "total": float(it.get("total") or round(price * qty, 2)),
        })
    total = round(float(order.get("total") or 0), 2)
    shipping = round(float(order.get("shipping_fee") or 0), 2)
    subtotal = round(float(order.get("subtotal") or (total - shipping)), 2)
    customer = order.get("customer") or {}
    delivered = st == "delivered"
    doc = {
        "invoice_number": order.get("order_code") or "",
        "code": order.get("order_code") or "",
        "customer_id": None,
        "customer_name": customer.get("name") or "زبون المتجر",
        "items": items,
        "subtotal": subtotal, "discount": 0,
        "delivery_fee": shipping, "delivery": None,
        "total": total,
        "paid_amount": total if delivered else 0,
        "debt_amount": 0, "remaining": 0,
        "payment_method": "ecom_store" if delivered else "",
        "payment_type": "cod",
        "payments": ([{"amount": total, "method": "ecom_store", "at": now}] if delivered else []),
        "installment_plan": None,
        "status": sale_status,
        "notes": order.get("notes") or "",
        "source": "webstore",
        "ecom_order_id": order_id,
        "channel": order.get("channel"),
        "updated_at": now,
    }
    await db.sales.update_one(
        {"id": sale_id},
        {"$set": doc,
         "$setOnInsert": {"id": sale_id, "created_at": order.get("created_at") or now,
                          "created_by": "المتجر الإلكتروني"}},
        upsert=True,
    )


async def _record_confirmation_financials(db, order: dict, now: str) -> None:
    """On confirmation: revenue − COGS − shipping = expected profit (upsert)."""
    order_id = order.get("id")
    cogs = await _compute_cogs(db, order)
    revenue = round(float(order.get("total") or 0), 2)
    shipping = round(float(order.get("shipping_fee") or 0), 2)
    packaging = round(float(order.get("packaging_cost") or 0), 2)
    expected_profit = round(revenue - cogs - shipping - packaging, 2)
    await db.ecom_order_financials.update_one(
        {"id": order_id},
        {"$set": {
            "id": order_id,
            "order_id": order_id,
            "order_code": order.get("order_code"),
            "revenue": revenue,
            "cogs": cogs,
            "shipping_fee": shipping,
            "packaging_cost": packaging,
            "expected_profit": expected_profit,
            "status": "expected",
            "confirmed_at": now,
            "updated_at": now,
        }, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )


async def _mark_financials_realized(db, order: dict, now: str) -> None:
    """On delivery: the expected profit becomes realized."""
    fin = await db.ecom_order_financials.find_one({"id": order.get("id")})
    if not fin or fin.get("status") != "expected":
        return
    await db.ecom_order_financials.update_one(
        {"id": order.get("id")},
        {"$set": {"status": "realized", "realized_at": now,
                  "realized_profit": fin.get("expected_profit"), "updated_at": now}},
    )


async def _record_return_financials(db, order: dict, now: str, return_fee_override=None) -> None:
    """On refund/return: reverse the profit and book the losses —
    outbound shipping (merchant-borne) + packaging + the return fee.
    p71: return fee can be overridden per order (manual fee from the courier receipt)."""
    order_id = order.get("id")
    if return_fee_override is not None:
        try:
            return_fee = max(0.0, float(return_fee_override))
        except (TypeError, ValueError):
            return_fee = await _courier_return_fee(db, order)
    else:
        return_fee = await _courier_return_fee(db, order)
    shipping = round(float(order.get("shipping_fee") or 0), 2)
    packaging = round(float(order.get("packaging_cost") or 0), 2)
    losses = round(shipping + return_fee + packaging, 2)
    fin = await db.ecom_order_financials.find_one({"id": order_id})
    if fin:
        await db.ecom_order_financials.update_one(
            {"id": order_id},
            {"$set": {"status": "returned", "returned_at": now,
                      "return_fee": return_fee, "packaging_cost": packaging, "losses": losses,
                      "realized_profit": -losses, "updated_at": now}},
        )
    else:
        # returned without a prior confirmation — still book the loss
        cogs = await _compute_cogs(db, order)
        revenue = round(float(order.get("total") or 0), 2)
        await db.ecom_order_financials.insert_one({
            "id": order_id, "order_id": order_id, "order_code": order.get("order_code"),
            "revenue": revenue, "cogs": cogs, "shipping_fee": shipping,
            "expected_profit": 0, "status": "returned", "returned_at": now,
            "return_fee": return_fee, "packaging_cost": packaging, "losses": losses, "realized_profit": -losses,
            "created_at": now, "updated_at": now,
        })
    await db.ecom_orders.update_one(
        {"id": order_id},
        {"$set": {"return_fee": return_fee, "return_losses": losses, "updated_at": now}},
    )


async def _void_financials(db, order: dict, now: str) -> None:
    """On cancellation before delivery: void the expected profit (no loss)."""
    await db.ecom_order_financials.update_one(
        {"id": order.get("id"), "status": "expected"},
        {"$set": {"status": "cancelled", "expected_profit": 0, "realized_profit": 0, "updated_at": now}},
    )


async def _maybe_notify_customer(db, order: dict, new_status: str) -> None:
    """Send a WhatsApp message to the customer if a configured integration exists."""
    phone = (order.get("customer") or {}).get("phone", "").strip()
    if not phone:
        return
    integration = await db.ecom_integrations.find_one({
        "channel": "whatsapp", "is_active": True,
        "credentials.phone_number_id": {"$exists": True},
        "credentials.access_token": {"$exists": True},
    })
    if not integration:
        return
    creds = integration.get("credentials") or {}
    if not (creds.get("phone_number_id") and creds.get("access_token")):
        return
    template = {
        "confirmed": f"تم تأكيد طلبك {order.get('order_code', '')}. سنبدأ بتحضيره فوراً.",
        "packed":    f"طلبك {order.get('order_code', '')} جاهز للشحن.",
        "shipped":   f"📦 تم شحن طلبك {order.get('order_code', '')}. رقم التتبع: {order.get('tracking_number') or 'سيتم تزويدك قريباً'}.",
        "delivered": f"✅ شكراً لك! تم تسليم طلبك {order.get('order_code', '')}.",
        "cancelled": f"تم إلغاء طلبك {order.get('order_code', '')}. للاستفسار تواصل معنا.",
        "refunded":  f"تم استرداد طلبك {order.get('order_code', '')}.",
    }
    msg = template.get(new_status)
    if not msg:
        return
    # p98: enrich the shipped message with courier name + tracking link
    if new_status == "shipped":
        tn = (order.get("tracking_number") or "").strip()
        courier = (order.get("courier") or "").strip()
        c_name, c_link = {
            "yalidine": ("يالدين", "https://yalidine.com/suivi/?tracking={tn}"),
            "zr":       ("ZR Express", "https://zrexpress.dz/suivi"),
            "maystro":  ("مايسترو", "https://maystro-delivery.com"),
        }.get(courier, ("", ""))
        parts = [f"📦 تم شحن طلبك {order.get('order_code', '')}" + (f" عبر {c_name}." if c_name else ".")]
        if tn:
            parts.append(f"رقم التتبع: {tn}")
        if c_link:
            parts.append("🔗 تتبع طردك: " + (c_link.format(tn=tn) if "{tn}" in c_link else c_link))
        msg = "\n".join(parts)
    from services.ecom.whatsapp_service import send_text_message
    await send_text_message(integration, phone, msg)
