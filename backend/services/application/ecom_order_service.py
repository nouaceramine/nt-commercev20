"""E-commerce order application service — status state machine + side effects.

Owns: transition validation, POS inventory sync (idempotent), WhatsApp
customer notification, and ecom_order.* event publishing.
"""
from datetime import datetime, timezone
import logging

from fastapi import HTTPException

from routes.ecom.constants import ORDER_STATUS_KEYS, ORDER_STATUSES, STATUS_TRANSITIONS

logger = logging.getLogger(__name__)


async def change_order_status(db, order_id: str, new_status: str, note: str, user: dict) -> dict:
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


async def _sync_inventory_on_status_change(db, order: dict, new_status: str, now_iso: str) -> dict:
    """Atomically deduct/restore POS product stock based on the order status transition.

    Idempotent via the `inventory_deducted` flag on the order document.
    """
    result = {"deducted": [], "restored": [], "warnings": []}
    items = order.get("items") or []
    items_with_product = [it for it in items if it.get("product_id")]
    if not items_with_product:
        return result

    order_id = order.get("id")
    already_deducted = bool(order.get("inventory_deducted"))

    # Deduct on first move to 'confirmed'
    if new_status == "confirmed" and not already_deducted:
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

    # Restore on transition to cancelled / refunded
    if new_status in ("cancelled", "refunded") and already_deducted:
        deductions = order.get("inventory_deductions") or []
        if not deductions:
            deductions = [{"product_id": it["product_id"], "qty": int(it.get("qty", 0) or 0)} for it in items_with_product]
        for d in deductions:
            pid = d.get("product_id")
            qty = int(d.get("qty", 0) or 0)
            if not pid or qty <= 0:
                continue
            res = await db.products.update_one({"id": pid}, {"$inc": {"quantity": qty}, "$set": {"updated_at": now_iso}})
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
    from services.ecom.whatsapp_service import send_text_message
    await send_text_message(integration, phone, msg)
