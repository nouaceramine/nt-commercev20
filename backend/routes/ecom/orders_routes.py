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

import logging

from fastapi import APIRouter, Depends, HTTPException, Query

logger = logging.getLogger(__name__)

from config.database import db
from utils.auth import require_tenant
from .constants import (
    CHANNELS, CHANNEL_KEYS, ORDER_STATUS_KEYS, ORDER_STATUSES,
    STATUS_TRANSITIONS, require_ecom_feature,
)

router = APIRouter(tags=["E-Commerce Orders"])


async def _generate_order_code() -> str:
    """p258: tenant-stamped code ECO-NTx-XXXXXXXX (legacy ECO-XXXXXXXX on platform)."""
    from services.code_generator import public_hex_code
    return await public_hex_code(db, "ECO")



# ── p77: troublemaker blacklist (القائمة السوداء للمشاغبين) ─────────────
def _norm_phone(p: str) -> str:
    return re.sub(r"[^\d+]", "", (p or "").strip())


async def _flagged_phones() -> dict:
    """Phones flagged as troublemakers: >=2 refunded/returned orders (auto)
    or manually blacklisted (ecom_blacklist). {phone: {returned, manual, reason}}"""
    flagged: dict = {}
    try:
        pipeline = [
            {"$match": {"status": {"$in": ["refunded", "returned"]},
                        "customer.phone": {"$nin": [None, ""]}}},
            {"$group": {"_id": "$customer.phone", "n": {"$sum": 1}}},
            {"$match": {"n": {"$gte": 2}}},
        ]
        async for row in db.ecom_orders.aggregate(pipeline):
            ph = _norm_phone(row["_id"])
            if ph:
                flagged[ph] = {"returned": row["n"], "manual": False, "reason": ""}
    except Exception as exc:  # noqa: BLE001
        logger.warning("blacklist auto aggregation failed: %s", exc)
    try:
        async for row in db.ecom_blacklist.find({}, {"_id": 0}):
            ph = _norm_phone(row.get("phone"))
            if not ph:
                continue
            entry = flagged.setdefault(ph, {"returned": 0, "manual": False, "reason": ""})
            entry["manual"] = True
            entry["reason"] = row.get("reason") or ""
    except Exception as exc:  # noqa: BLE001
        logger.warning("blacklist manual fetch failed: %s", exc)
    return flagged


def _blacklist_annotation(order: dict, flagged: dict):
    ph = _norm_phone((order.get("customer") or {}).get("phone"))
    hit = flagged.get(ph) if ph else None
    if not hit:
        return None
    return {"flagged": True, "returned_count": hit["returned"],
            "manual": hit["manual"], "reason": hit["reason"]}


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
    assigned_to: Optional[str] = None,  # p242: agent id, or "none" for unassigned
    limit: int = Query(50, ge=1, le=500),
    skip: int = Query(0, ge=0),
    user: dict = Depends(require_tenant),
):
    """List orders with filters. Supports channel/status/search/date range + pagination."""
    await require_ecom_feature(user)
    query: dict = {}
    if assigned_to == "none":
        query["$or"] = [{"assigned_to": {"$exists": False}}, {"assigned_to": None}]
    elif assigned_to:
        query["assigned_to"] = assigned_to
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
    # p77: annotate troublemaker-flagged phones
    try:
        flagged = await _flagged_phones()
        if flagged:
            for it in items:
                bl = _blacklist_annotation(it, flagged)
                if bl:
                    it["blacklist"] = bl
    except Exception as exc:  # noqa: BLE001
        logger.warning("blacklist annotation failed: %s", exc)
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


@router.get("/ecom/blacklist")
async def get_blacklist(user: dict = Depends(require_tenant)):
    """p77: القائمة السوداء — تلقائي (هاتف لديه مرتجعان أو أكثر) + يدوي."""
    await require_ecom_feature(user)
    flagged = await _flagged_phones()
    auto = [{"phone": ph, "returned_count": i["returned"]}
            for ph, i in flagged.items() if i["returned"] >= 2]
    manual = [{"phone": ph, "reason": i["reason"], "also_auto": i["returned"] >= 2}
              for ph, i in flagged.items() if i["manual"]]
    auto.sort(key=lambda r: -r["returned_count"])
    return {"auto": auto, "manual": manual, "threshold": 2}


@router.post("/ecom/blacklist")
async def add_blacklist_entry(body: dict, user: dict = Depends(require_tenant)):
    """p77: إضافة رقم يدوياً للقائمة السوداء."""
    await require_ecom_feature(user)
    phone = _norm_phone(body.get("phone"))
    if not phone or len(phone) < 8:
        raise HTTPException(status_code=400, detail="رقم هاتف غير صالح")
    now = datetime.now(timezone.utc).isoformat()
    await db.ecom_blacklist.update_one(
        {"phone": phone},
        {"$set": {"phone": phone, "reason": (body.get("reason") or "").strip(),
                  "updated_at": now, "by": user.get("id")},
         "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now}},
        upsert=True,
    )
    return {"ok": True, "phone": phone}


@router.delete("/ecom/blacklist/{phone}")
async def remove_blacklist_entry(phone: str, user: dict = Depends(require_tenant)):
    """p77: إزالة رقم من القائمة اليدوية (العلم التلقائي يبقى ما دامت المرتجعات موجودة)."""
    await require_ecom_feature(user)
    res = await db.ecom_blacklist.delete_one({"phone": _norm_phone(phone)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الرقم غير موجود في القائمة اليدوية")
    return {"ok": True}


@router.get("/ecom/orders/{order_id}")
async def get_order(order_id: str, user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    order = await db.ecom_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    # p77: blacklist annotation
    try:
        bl = _blacklist_annotation(order, await _flagged_phones())
        if bl:
            order["blacklist"] = bl
    except Exception as exc:  # noqa: BLE001
        logger.warning("blacklist annotation failed: %s", exc)
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
        "order_code": await _generate_order_code(),
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
        "packaging_cost": max(0.0, float(body.get("packaging_cost", 0) or 0)),
        "shipping_label_id": None,
        "tracking_number": None,
        "courier": None,
        "status_history": [{"status": "new", "at": now, "by": user.get("id")}],
        "created_at": now,
        "updated_at": now,
        "created_by": user.get("id"),
    }
    # COD risk scoring (anti-cancellation engine)
    async def _customer_stats(phone: str) -> dict:
        """سجل الزبون الفعلي: مستلَم/ملغي/مرجع — لتغذية محرك المخاطر."""
        if not phone:
            return {}
        stats = {"delivered": 0, "cancelled": 0, "returned": 0}
        stats["delivered"] = await db.ecom_orders.count_documents(
            {"customer.phone": phone, "status": {"$in": ["delivered", "shipped", "confirmed"]}})
        stats["cancelled"] = await db.ecom_orders.count_documents(
            {"customer.phone": phone, "status": "cancelled"})
        stats["returned"] = await db.ecom_orders.count_documents(
            {"customer.phone": phone, "status": "returned"})
        return stats

    payment_method = (body.get("payment_method") or ("cod" if doc["payment_status"] == "unpaid" else "prepaid")).strip().lower()
    # p78: optional UTM attribution for manual/box entries
    try:
        from routes.online_store_routes import _sanitize_utm
        doc["utm"] = _sanitize_utm(body.get("utm"))
        doc["utm_source"] = doc["utm"].get("utm_source", "")
    except Exception:  # noqa: BLE001
        doc["utm"] = {}
        doc["utm_source"] = ""
    doc["payment_method"] = payment_method
    if payment_method == "cod":
        from services.cod_risk import calculate_risk_score
        phone = doc["customer"]["phone"]
        history_count = 0
        if phone:
            history_count = await db.ecom_orders.count_documents(
                {"customer.phone": phone, "status": {"$in": ["delivered", "shipped", "confirmed"]}}
            )
        risk = calculate_risk_score(doc, customer_history_count=history_count,
                                    customer_stats=await _customer_stats(phone))
        doc["cod_risk"] = risk
        if risk["action"] == "manual_review":
            doc["status"] = "needs_review"
        elif risk["action"] == "confirm_first":
            doc["status"] = "awaiting_confirmation"

    # p245: optional referral code attachment (snapshot reward terms)
    ref_code = (body.get("referral_code") or "").strip().upper()
    if ref_code:
        from routes.ecom.referral_routes import resolve_referral
        ref = await resolve_referral(ref_code)
        if not ref:
            raise HTTPException(status_code=400, detail="رمز الإحالة غير صالح")
        doc["referral_id"] = ref["id"]
        doc["referral_code"] = ref["code"]
        doc["referral_reward_type"] = ref.get("reward_type", "fixed")
        doc["referral_reward_value"] = float(ref.get("reward_value") or 0)

    # p100: cross-tenant reputation — attach trust, escalate serial returners to confirmation
    try:
        from services.application.ecom_order_service import get_network_trust
        net = await get_network_trust(doc["customer"]["phone"])
        if net.get("found"):
            doc["network_trust"] = net
            if net["trust"] == "risk":
                reason = f"شبكة المتاجر: أرجع {net['returned']} من {net['outcomes']} طلبات عبر {net.get('tenants', 1)} متجر"
                if isinstance(doc.get("cod_risk"), dict):
                    doc["cod_risk"].setdefault("reasons", []).append(reason)
                if doc.get("status") == "new":
                    doc["status"] = "awaiting_confirmation"
    except Exception as exc:  # noqa: BLE001
        logger.warning("p100 network trust lookup failed: %s", exc)

    # p240: duplicate detection (non-blocking — flag only)
    from services.ecom.duplicate_detector import annotate_order
    await annotate_order(db, doc)

    await db.ecom_orders.insert_one(doc)

    # p280: realtime event — other open sessions refresh instantly
    try:
        from services.outbox import outbox_write as _obw
        from config.database import main_db as _mdb
        await _obw(_mdb, "ecom_order.created", {"order_id": doc.get("id"), "order_code": doc.get("order_code", ""), "channel": doc.get("channel", ""), "total": doc.get("total", 0)}, tenant_id=user.get("tenant_id") or "", source="ecom.manual")
    except Exception:
        pass

    # p170: tag/create customer category (زبون التجارة الإلكترونية)
    try:
        from services.customer_sources import tag_customer_source, SOURCE_ECOM
        _c = doc.get("customer") or {}
        await tag_customer_source(db, SOURCE_ECOM, phone=_c.get("phone", ""), name=_c.get("name", ""), address=_c.get("address", ""))
    except Exception:
        pass

    # p100: feed the shared network
    try:
        from services.application.ecom_order_service import reputation_on_create
        await reputation_on_create(doc, user.get("tenant_id") or "")
    except Exception as exc:  # noqa: BLE001
        logger.warning("p100 reputation create failed: %s", exc)

    # p87: mirror into the POS sales ledger
    try:
        from services.application.ecom_order_service import sync_sale_doc
        await sync_sale_doc(db, doc)
    except Exception as exc:  # noqa: BLE001
        logger.warning("sale doc sync failed for new order %s: %s", order_id, exc)

    # p91: instant Telegram alert (fire-and-forget)
    try:
        import asyncio as _aio
        from services.telegram_daily import notify_new_order as _tg_new
        _aio.create_task(_tg_new(db, doc))
    except Exception as exc:  # noqa: BLE001
        logger.warning("p91 telegram hook failed for order %s: %s", order_id, exc)

    # p59: reserve stock the moment the order enters (status new = انتظار)
    try:
        from services.application.ecom_order_service import deduct_order_inventory
        await deduct_order_inventory(db, doc, now)
    except Exception as exc:  # noqa: BLE001
        logger.warning("inventory reservation failed for new order %s: %s", order_id, exc)
    try:
        from services.smart_notifications import notify_new_order
        await notify_new_order(db, doc)
    except Exception:
        pass
    # Bump integration stat counter if linked.
    if doc["integration_id"]:
        await db.ecom_integrations.update_one(
            {"id": doc["integration_id"]},
            {"$inc": {"stats.orders": 1}, "$set": {"last_sync_at": now}},
        )
    doc.pop("_id", None)
    return doc


@router.get("/ecom/orders/{order_id}/risk")
async def get_order_risk(order_id: str, user: dict = Depends(require_tenant)):
    # (Re)compute and return the COD risk score for an order.
    await require_ecom_feature(user)
    order = await db.ecom_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    from services.cod_risk import calculate_risk_score
    phone = (order.get("customer") or {}).get("phone", "")
    history_count = 0
    if phone:
        history_count = await db.ecom_orders.count_documents(
            {"customer.phone": phone, "status": {"$in": ["delivered", "shipped", "confirmed"]}, "id": {"$ne": order_id}}
        )
    cancelled = await db.ecom_orders.count_documents({"customer.phone": phone, "status": "cancelled"})
    returned = await db.ecom_orders.count_documents({"customer.phone": phone, "status": "returned"})
    risk = calculate_risk_score(order, customer_history_count=history_count,
                                customer_stats={"delivered": history_count, "cancelled": cancelled, "returned": returned})
    await db.ecom_orders.update_one({"id": order_id}, {"$set": {"cod_risk": risk}})
    return risk


@router.get("/ecom/orders/{order_id}/financials")
async def get_order_financials(order_id: str, user: dict = Depends(require_tenant)):
    """p59: per-order accounting breakdown (revenue / COGS / shipping / profit / losses)."""
    await require_ecom_feature(user)
    fin = await db.ecom_order_financials.find_one({"id": order_id}, {"_id": 0})
    if not fin:
        raise HTTPException(status_code=404, detail="لا توجد قيود محاسبية لهذا الطلب بعد — تُنشأ عند التأكيد")
    return fin


@router.get("/ecom/financials/summary")
async def financials_summary(user: dict = Depends(require_tenant)):
    """p59: profit/loss rollup across all e-commerce orders."""
    await require_ecom_feature(user)
    rows = await db.ecom_order_financials.find({}, {"_id": 0}).to_list(5000)
    agg = {"expected_profit": 0.0, "realized_profit": 0.0, "losses": 0.0,
           "return_fees": 0.0, "counts": {"expected": 0, "realized": 0, "returned": 0, "cancelled": 0}}
    for r in rows:
        st = r.get("status")
        agg["counts"][st] = agg["counts"].get(st, 0) + 1
        if st == "expected":
            agg["expected_profit"] += float(r.get("expected_profit") or 0)
        elif st == "realized":
            agg["realized_profit"] += float(r.get("realized_profit") or 0)
        elif st == "returned":
            agg["losses"] += float(r.get("losses") or 0)
            agg["return_fees"] += float(r.get("return_fee") or 0)
    for k in ("expected_profit", "realized_profit", "losses", "return_fees"):
        agg[k] = round(agg[k], 2)
    agg["net_profit"] = round(agg["realized_profit"] - agg["losses"], 2)
    return agg


@router.post("/ecom/orders/{order_id}/call-attempt")
async def log_call_attempt(order_id: str, body: dict, user: dict = Depends(require_tenant)):
    """p79: سجل محاولة اتصال لتأكيد الطلب. النتيجة confirmed تؤكد الطلب تلقائياً
    و cancelled_by_phone تلغيه (عبر آلة الحالات — القيود والمخزون تلقائياً)."""
    await require_ecom_feature(user)
    order = await db.ecom_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    RESULTS = {
        "no_answer": "لم يردّ",
        "confirmed": "أكّد الطلب",
        "postponed": "أجّل التأكيد",
        "wrong_number": "رقم خاطئ",
        "cancelled_by_phone": "ألغى هاتفياً",
    }
    result = (body.get("result") or "").strip()
    if result not in RESULTS:
        raise HTTPException(status_code=400, detail="نتيجة المحاولة غير صالحة")
    now = datetime.now(timezone.utc).isoformat()
    attempt = {
        "at": now,
        "result": result,
        "result_ar": RESULTS[result],
        "note": (body.get("note") or "").strip()[:300],
        "by": user.get("id"),
        "by_name": user.get("name") or user.get("full_name") or user.get("email") or "",
    }
    await db.ecom_orders.update_one(
        {"id": order_id},
        {"$push": {"confirmation_attempts": attempt}, "$set": {"updated_at": now}},
    )
    # auto state transitions (attempt stays logged even if the transition fails)
    new_status = None
    try:
        from services.application.ecom_order_service import change_order_status
        cur = order.get("status")
        if result == "confirmed" and cur in ("new", "awaiting_confirmation", "needs_review"):
            await change_order_status(db, order_id, "confirmed", note="تأكيد هاتفي", user=user)
            new_status = "confirmed"
        elif result == "cancelled_by_phone" and cur in ("new", "awaiting_confirmation", "needs_review", "confirmed"):
            await change_order_status(db, order_id, "cancelled", note="إلغاء هاتفي", user=user)
            new_status = "cancelled"
    except Exception as exc:  # noqa: BLE001
        logger.warning("call-attempt auto transition failed for %s: %s", order_id, exc)
    return {
        "ok": True,
        "attempt": attempt,
        "attempts_count": len(order.get("confirmation_attempts") or []) + 1,
        "new_status": new_status,
    }


@router.put("/ecom/orders/{order_id}/status")
async def update_order_status(order_id: str, body: dict, user: dict = Depends(require_tenant)):
    """Transition an order to a new status — delegates to the application service."""
    await require_ecom_feature(user)
    from services.application.ecom_order_service import change_order_status
    return await change_order_status(db, order_id, body.get("status"), body.get("note", ""), user,
                                     return_fee_override=body.get("return_fee"))

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
    if "packaging_cost" in body:
        try:
            updates["packaging_cost"] = max(0.0, float(body.get("packaging_cost") or 0))
        except (TypeError, ValueError):
            pass
    if "delivery_type" in body:  # p138: مكتب (office/stopdesk) أم باب المنزل (home)
        dt = (body.get("delivery_type") or "").strip()
        if dt not in ("home", "office"):
            raise HTTPException(status_code=400, detail="نوع التوصيل غير صالح — المسموح: home أو office")
        updates["delivery_type"] = dt

    await db.ecom_orders.update_one({"id": order_id}, {"$set": updates})
    # p138: mirror delivery type to the webstore twin so /store orders stays in sync
    if "delivery_type" in updates and order.get("channel") == "webstore" and order.get("external_id"):
        try:
            await db.store_orders.update_one(
                {"id": order["external_id"]},
                {"$set": {"delivery_type": updates["delivery_type"]}},
            )
        except Exception as _me:  # noqa: BLE001
            logger.warning("p138 store_orders delivery_type mirror failed: %s", _me)
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
    await db.ecom_order_financials.delete_one({"id": order_id})  # p59: no orphan ledger rows
    return {"ok": True, "deleted": order_id}


@router.get("/ecom/customer-lookup")
async def customer_lookup(phone: str = "", user: dict = Depends(require_tenant)):
    """p100: cross-tenant trust score for a phone number (aggregate network counters only)."""
    from services.application.ecom_order_service import get_network_trust
    return await get_network_trust(phone)


# ============ p108: مركز الاتصال — قائمة أولويات التأكيد ============

@router.get("/ecom/call-queue")
async def call_queue(user: dict = Depends(require_tenant)):
    """p108: طلبات بانتظار تأكيد هاتفي، مرتَّبة حسب الأولوية:
    الأقدم + الأعلى قيمة + بلا محاولات + عوامل الخطر (شبكة المُرجِعين، مراجعة)."""
    await require_ecom_feature(user)
    orders = await db.ecom_orders.find(
        {"status": {"$in": ["new", "awaiting_confirmation", "needs_review"]}},
        {"_id": 0, "id": 1, "order_code": 1, "status": 1, "total": 1, "created_at": 1,
         "customer": 1, "items": 1, "confirmation_attempts": 1, "network_trust": 1},
    ).to_list(500)
    now = datetime.now(timezone.utc)
    rows = []
    for o in orders:
        try:
            created = datetime.fromisoformat(str(o.get("created_at") or "").replace("Z", "+00:00"))
            age_h = round(max((now - created).total_seconds() / 3600, 0), 1)
        except Exception:  # noqa: BLE001
            age_h = 0.0
        attempts = o.get("confirmation_attempts") or []
        trust = (o.get("network_trust") or {}).get("trust")
        score = age_h * 2 + float(o.get("total") or 0) / 1000.0
        reasons = []
        if not attempts:
            score += 10
            reasons.append("لم يُتصل به بعد")
        if o.get("status") == "awaiting_confirmation":
            score += 8
            reasons.append("بانتظار تأكيد الزبون")
        if o.get("status") == "needs_review":
            score += 8
            reasons.append("يحتاج مراجعة")
        if trust == "risk":
            score += 15
            reasons.append("مُرجِع متسلسل")
        elif trust == "warn":
            score += 5
            reasons.append("سجل إرجاع سابق")
        if len(attempts) >= 3:
            score += 10
            reasons.append("3+ محاولات — قرر: تأكيد أو إلغاء")
        last = attempts[-1] if attempts else {}
        cust = o.get("customer") or {}
        rows.append({
            "id": o.get("id"),
            "order_code": o.get("order_code") or "",
            "status": o.get("status"),
            "customer_name": cust.get("name") or "",
            "phone": cust.get("phone") or "",
            "wilaya": cust.get("wilaya") or cust.get("city") or "",
            "total": float(o.get("total") or 0),
            "items_count": sum(int(i.get("qty") or 1) for i in (o.get("items") or [])),
            "age_hours": age_h,
            "attempts": len(attempts),
            "last_result": last.get("result_ar"),
            "trust": trust,
            "score": round(score, 1),
            "reasons": reasons,
            "urgent": score >= 30,
        })
    rows.sort(key=lambda r: -r["score"])
    return {"queue": rows[:50], "count": len(rows)}


@router.get("/ecom/duplicates")
async def list_duplicates(
    days: int = Query(7, ge=1, le=90),
    user: dict = Depends(require_tenant),
):
    """p240: recent orders/leads flagged as duplicates (same phone within 48h)."""
    await require_ecom_feature(user)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    orders = await db.ecom_orders.find(
        {"duplicate_warning": True, "created_at": {"$gte": cutoff}},
        {"_id": 0, "id": 1, "order_code": 1, "channel": 1, "status": 1,
         "customer": 1, "total": 1, "duplicate_of": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(200)
    leads = await db.ecom_leads.find(
        {"duplicate_warning": True, "created_at": {"$gte": cutoff}},
        {"_id": 0, "id": 1, "channel": 1, "status": 1, "name": 1, "phone": 1,
         "duplicate_of": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(200)
    return {"orders": orders, "leads": leads, "count": len(orders) + len(leads)}
