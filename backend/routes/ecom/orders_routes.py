"""E-Commerce Hub: Unified Orders Inbox

A single collection (`ecom_orders` in tenant_db) aggregates orders from ALL channels
plus manual entries. POS sales remain in `sales` (separate concern) but P5 analytics
will join them.

Each ecom_order doc:
  {
    id, order_code ('ECO-XXXXXXXX'), channel, external_id, integration_id?,
    status, payment_status, customer{name, phone, address, city, wilaya},
    items[{name, sku, qty, price, total}],
    subtotal, shipping_fee, total,
    notes, tags[],
    shipping_label_id?, tracking_number?, courier?,
    created_at, updated_at, created_by
  }
"""
from datetime import datetime, timezone, timedelta
from typing import Optional
import uuid
import re

from fastapi import APIRouter, Depends, HTTPException, Query

from config.database import db
from utils.auth import require_tenant
from .constants import (
    CHANNELS, CHANNEL_KEYS, ORDER_STATUS_KEYS, ORDER_STATUSES,
    STATUS_TRANSITIONS, require_ecom_feature,
)

router = APIRouter(tags=["E-Commerce Orders"])


def _generate_order_code() -> str:
    """Short uppercase code: ECO-XXXXXXXX (8 hex chars)."""
    return f"ECO-{uuid.uuid4().hex[:8].upper()}"


def _validate_items(items_raw) -> list:
    """Coerce + validate items array."""
    if not isinstance(items_raw, list) or not items_raw:
        raise HTTPException(status_code=400, detail="يجب إضافة منتج واحد على الأقل")
    clean = []
    for it in items_raw:
        if not isinstance(it, dict):
            continue
        name = (it.get("name") or "").strip()
        if not name:
            continue
        qty = max(1, int(it.get("qty", 1) or 1))
        price = max(0.0, float(it.get("price", 0) or 0))
        total = round(qty * price, 2)
        item_doc = {
            "name": name,
            "sku": (it.get("sku") or "").strip(),
            "qty": qty,
            "price": price,
            "total": total,
        }
        # Link back to POS inventory when the UI provided a product_id
        product_id = it.get("product_id")
        if isinstance(product_id, str) and product_id.strip():
            item_doc["product_id"] = product_id.strip()
        clean.append(item_doc)
    if not clean:
        raise HTTPException(status_code=400, detail="لا توجد منتجات صالحة")
    return clean


def _compute_totals(items: list, shipping_fee: float = 0.0) -> dict:
    subtotal = round(sum(i["total"] for i in items), 2)
    total = round(subtotal + max(0.0, shipping_fee), 2)
    return {"subtotal": subtotal, "shipping_fee": max(0.0, shipping_fee), "total": total}


@router.get("/ecom/orders")
async def list_orders(
    channel: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    skip: int = Query(0, ge=0),
    user: dict = Depends(require_tenant),
):
    """List orders with filters. Supports channel/status/search/date range + pagination."""
    await require_ecom_feature(user)
    query: dict = {}
    if channel:
        if channel not in CHANNEL_KEYS:
            raise HTTPException(status_code=400, detail="قناة غير صالحة")
        query["channel"] = channel
    if status:
        if status not in ORDER_STATUS_KEYS:
            raise HTTPException(status_code=400, detail="حالة غير صالحة")
        query["status"] = status
    if since:
        query.setdefault("created_at", {})["$gte"] = since
    if until:
        query.setdefault("created_at", {})["$lte"] = until
    if search:
        safe = re.escape(search.strip())
        query["$or"] = [
            {"order_code": {"$regex": safe, "$options": "i"}},
            {"external_id": {"$regex": safe, "$options": "i"}},
            {"customer.name": {"$regex": safe, "$options": "i"}},
            {"customer.phone": {"$regex": safe, "$options": "i"}},
        ]

    total = await db.ecom_orders.count_documents(query)
    cursor = (
        db.ecom_orders.find(query, {"_id": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    items = await cursor.to_list(length=limit)
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "skip": skip,
        "has_more": skip + len(items) < total,
    }


@router.get("/ecom/orders/summary")
async def orders_summary(user: dict = Depends(require_tenant)):
    """Per-channel + per-status order counts for the Inbox dashboard cards.

    Also returns 'today' / '7d' totals (revenue + count).
    """
    await require_ecom_feature(user)
    pipeline_channel = [
        {"$group": {"_id": "$channel", "count": {"$sum": 1}, "revenue": {"$sum": "$total"}}}
    ]
    pipeline_status = [
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]

    by_channel_rows = await db.ecom_orders.aggregate(pipeline_channel).to_list(50)
    by_status_rows = await db.ecom_orders.aggregate(pipeline_status).to_list(20)

    now = datetime.now(timezone.utc)
    today_iso = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_iso = (now - timedelta(days=7)).isoformat()

    today_agg = await db.ecom_orders.aggregate([
        {"$match": {"created_at": {"$gte": today_iso}}},
        {"$group": {"_id": None, "count": {"$sum": 1}, "revenue": {"$sum": "$total"}}},
    ]).to_list(1)
    week_agg = await db.ecom_orders.aggregate([
        {"$match": {"created_at": {"$gte": week_iso}}},
        {"$group": {"_id": None, "count": {"$sum": 1}, "revenue": {"$sum": "$total"}}},
    ]).to_list(1)

    return {
        "by_channel": {r["_id"]: {"count": r["count"], "revenue": round(r["revenue"], 2)} for r in by_channel_rows},
        "by_status": {r["_id"]: r["count"] for r in by_status_rows},
        "today": {
            "count": today_agg[0]["count"] if today_agg else 0,
            "revenue": round(today_agg[0]["revenue"], 2) if today_agg else 0,
        },
        "last_7_days": {
            "count": week_agg[0]["count"] if week_agg else 0,
            "revenue": round(week_agg[0]["revenue"], 2) if week_agg else 0,
        },
        "total_all_time": await db.ecom_orders.count_documents({}),
    }


@router.get("/ecom/orders/{order_id}")
async def get_order(order_id: str, user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    order = await db.ecom_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    return order


@router.post("/ecom/orders")
async def create_order(body: dict, user: dict = Depends(require_tenant)):
    """Create a new order. Supports manual entry AND mock-channel webhook simulation.

    Body shape:
      {
        channel: 'manual'|'shopify'|...,
        external_id?: str,
        integration_id?: str,
        customer: {name, phone, address?, city?, wilaya?},
        items: [{name, sku?, qty, price}],
        shipping_fee?: float,
        notes?: str,
        tags?: [str],
      }
    """
    await require_ecom_feature(user)
    channel = (body.get("channel") or "manual").strip().lower()
    if channel not in CHANNEL_KEYS:
        raise HTTPException(status_code=400, detail="قناة غير صالحة")

    customer = body.get("customer") or {}
    if not isinstance(customer, dict) or not (customer.get("name") or "").strip():
        raise HTTPException(status_code=400, detail="اسم الزبون مطلوب")

    items = _validate_items(body.get("items"))
    totals = _compute_totals(items, float(body.get("shipping_fee", 0) or 0))

    now = datetime.now(timezone.utc).isoformat()
    order_id = str(uuid.uuid4())
    doc = {
        "id": order_id,
        "order_code": _generate_order_code(),
        "channel": channel,
        "external_id": (body.get("external_id") or "").strip(),
        "integration_id": body.get("integration_id"),
        "status": "new",
        "payment_status": (body.get("payment_status") or "unpaid").strip(),
        "customer": {
            "name": customer.get("name", "").strip(),
            "phone": customer.get("phone", "").strip(),
            "address": customer.get("address", "").strip(),
            "city": customer.get("city", "").strip(),
            "wilaya": customer.get("wilaya", "").strip(),
        },
        "items": items,
        **totals,
        "notes": (body.get("notes") or "").strip(),
        "tags": list(body.get("tags") or []),
        "shipping_label_id": None,
        "tracking_number": None,
        "courier": None,
        "status_history": [{"status": "new", "at": now, "by": user.get("id")}],
        "created_at": now,
        "updated_at": now,
        "created_by": user.get("id"),
    }
    await db.ecom_orders.insert_one(doc)
    # Bump integration stat counter if linked.
    if doc["integration_id"]:
        await db.ecom_integrations.update_one(
            {"id": doc["integration_id"]},
            {"$inc": {"stats.orders": 1}, "$set": {"last_sync_at": now}},
        )
    doc.pop("_id", None)
    return doc


@router.put("/ecom/orders/{order_id}/status")
async def update_order_status(order_id: str, body: dict, user: dict = Depends(require_tenant)):
    """Transition an order to a new status. Enforces the state machine.

    Side effects:
      • Inventory sync — deducts POS stock on first move to 'confirmed' (per item with product_id);
        restores it on move to 'cancelled'/'refunded' (idempotent via inventory_deducted flag).
      • WhatsApp notification — if a configured integration exists and customer.phone is set.
    """
    await require_ecom_feature(user)
    new_status = (body.get("status") or "").strip().lower()
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
            "$push": {"status_history": {"status": new_status, "at": now, "by": user.get("id"), "note": body.get("note", "")}},
        },
    )

    # ── Inventory sync with POS products ──
    inventory_result = await _sync_inventory_on_status_change(order, new_status, now)

    # ── Auto-notify customer via WhatsApp when integration is configured ──
    try:
        await _maybe_notify_customer(order, new_status)
    except Exception as exc:  # noqa: BLE001 — never let notification failures block status change
        import logging
        logging.getLogger(__name__).warning("WhatsApp notify failed for order %s: %s", order_id, exc)

    return {
        "ok": True,
        "status": new_status,
        "previous": current,
        "inventory": inventory_result,
    }


async def _sync_inventory_on_status_change(order: dict, new_status: str, now_iso: str) -> dict:
    """Atomically deduct/restore POS product stock based on the order status transition.

    Idempotent via the `inventory_deducted` flag on the order document.

    Returns {deducted:[...], restored:[...], warnings:[...]} for the API consumer.
    """
    result = {"deducted": [], "restored": [], "warnings": []}
    items = order.get("items") or []
    items_with_product = [it for it in items if it.get("product_id")]
    if not items_with_product:
        return result

    order_id = order.get("id")
    already_deducted = bool(order.get("inventory_deducted"))

    # ── Deduct on first move to 'confirmed' ──
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

    # ── Restore on transition to cancelled / refunded ──
    if new_status in ("cancelled", "refunded") and already_deducted:
        deductions = order.get("inventory_deductions") or []
        # Fallback: if we don't have the recorded deductions, restore from items
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


# Cached lookup: is there an active WhatsApp integration with real creds?
async def _maybe_notify_customer(order: dict, new_status: str) -> None:
    """Send a WhatsApp message to the customer if a configured integration exists.

    No-op when no WhatsApp integration is set up — keeps the feature opt-in.
    """
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


@router.put("/ecom/orders/{order_id}")
async def update_order(order_id: str, body: dict, user: dict = Depends(require_tenant)):
    """Update order metadata (customer / items / shipping_fee / notes / tags).

    Status changes go through /status endpoint to enforce the state machine.
    """
    await require_ecom_feature(user)
    order = await db.ecom_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")

    updates: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if "customer" in body and isinstance(body["customer"], dict):
        merged = {**(order.get("customer") or {}), **{k: (v or "").strip() if isinstance(v, str) else v for k, v in body["customer"].items()}}
        updates["customer"] = merged
    if "items" in body:
        items = _validate_items(body["items"])
        updates["items"] = items
        totals = _compute_totals(items, float(body.get("shipping_fee", order.get("shipping_fee", 0)) or 0))
        updates.update(totals)
    elif "shipping_fee" in body:
        items = order.get("items") or []
        totals = _compute_totals(items, float(body["shipping_fee"] or 0))
        updates.update(totals)
    if "notes" in body:
        updates["notes"] = (body.get("notes") or "").strip()
    if "tags" in body and isinstance(body["tags"], list):
        updates["tags"] = list(body["tags"])
    if "payment_status" in body:
        updates["payment_status"] = (body["payment_status"] or "").strip()

    await db.ecom_orders.update_one({"id": order_id}, {"$set": updates})
    refreshed = await db.ecom_orders.find_one({"id": order_id}, {"_id": 0})
    return refreshed


@router.delete("/ecom/orders/{order_id}")
async def delete_order(order_id: str, user: dict = Depends(require_tenant)):
    """Delete an order (only allowed for cancelled/refunded — guards against losing
    real revenue history)."""
    await require_ecom_feature(user)
    order = await db.ecom_orders.find_one({"id": order_id}, {"_id": 0, "status": 1, "integration_id": 1})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if order.get("status") not in ("cancelled", "refunded"):
        raise HTTPException(
            status_code=400,
            detail="يمكن حذف الطلب فقط بعد إلغائه أو استرداده — أوقفه أولاً.",
        )
    await db.ecom_orders.delete_one({"id": order_id})
    return {"ok": True, "deleted": order_id}
