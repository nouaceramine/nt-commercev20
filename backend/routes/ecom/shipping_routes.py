"""E-Commerce Hub: Shipping Labels (P2 — real Yalidine + mock fallback)

Strategy: if the tenant has a Yalidine integration with valid credentials AND
provider=yalidine, attempt a real call. On any failure (or for other providers)
we fall back to the P1 mock so the UI flow never breaks.
"""
from datetime import datetime, timezone
from typing import Optional
import re
import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException

from config.database import db
from utils.auth import require_tenant
from services.ecom.yalidine_service import (
    create_parcel as yalidine_create_parcel,
    YalidineCredentialsMissing,
    YalidineAPIError,
)
from .constants import (
    SHIPPING_PROVIDERS, SHIPPING_PROVIDER_KEYS, require_ecom_feature,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["E-Commerce Shipping"])


def _mock_tracking_number(provider: str) -> str:
    """Provider-prefixed mock tracking number."""
    prefix = {"yalidine": "YAL", "zr": "ZR", "maystro": "MS", "mock": "MOCK"}.get(provider, "TRK")
    return f"{prefix}-{uuid.uuid4().hex[:10].upper()}"


@router.get("/ecom/shipping/providers")
async def list_providers(user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    return {
        "providers": [
            {"key": k, **meta} for k, meta in SHIPPING_PROVIDERS.items()
        ]
    }


@router.get("/ecom/shipping/labels")
async def list_labels(user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    rows = await db.ecom_shipping_labels.find({}, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
    return {"items": rows}


@router.post("/ecom/shipping/labels")
async def create_label(body: dict, user: dict = Depends(require_tenant)):
    """Create a shipping label for an order.

    Real Yalidine call when:
      • provider == 'yalidine'
      • A yalidine integration exists with api_id + api_token configured

    Otherwise falls back to mock (returns a synthetic tracking number).

    Body: {order_id: str, provider: 'yalidine'|'zr'|'maystro'|'mock'}
    """
    await require_ecom_feature(user)
    order_id = (body.get("order_id") or "").strip()
    provider = (body.get("provider") or "mock").strip().lower()
    if provider not in SHIPPING_PROVIDER_KEYS:
        raise HTTPException(status_code=400, detail="مزود شحن غير صالح")
    if not order_id:
        raise HTTPException(status_code=400, detail="order_id مطلوب")

    order = await db.ecom_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")

    # ── p109: قاعدة «لا تشحن» — منع آلي قبل إنشاء البوليصة ──────────────
    if not body.get("force"):
        try:
            from services.application.ecom_order_service import normalize_phone as _np
            raw_phone = ((order.get("customer") or {}).get("phone") or "")
            variants = list({re.sub(r"[^\d+]", "", raw_phone), _np(raw_phone)} - {""})
            if variants:
                manual = await db.ecom_blacklist.find_one({"phone": {"$in": variants}})
                if manual:
                    raise HTTPException(
                        status_code=400,
                        detail=f"⛔ لا تشحن: هذا الرقم في القائمة السوداء ({manual.get('reason') or 'محظور يدوياً'}). أزل الحظر أولاً إن أردت الشحن.",
                    )
                returned = await db.ecom_orders.count_documents({
                    "status": {"$in": ["refunded", "returned"]},
                    "customer.phone": {"$in": variants + [raw_phone]},
                })
                if returned >= 2:
                    raise HTTPException(
                        status_code=400,
                        detail=f"⛔ لا تشحن: للزبون {returned} مرتجعات في متجرك. راجع القائمة السوداء للاستثناء.",
                    )
                from services.application.ecom_order_service import get_network_trust as _gnt
                net = await _gnt(_np(raw_phone))
                if net.get("trust") == "risk":
                    raise HTTPException(
                        status_code=400,
                        detail=f"⛔ لا تشحن: مُرجِع متسلسل عبر شبكة المتاجر (أرجع {net.get('returned')} من {net.get('orders')} طلباً).",
                    )
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.warning("p109 do-not-ship check failed (non-blocking): %s", exc)

    now = datetime.now(timezone.utc).isoformat()
    label_id = str(uuid.uuid4())
    mode = "mock"
    tracking = None
    label_url = ""

    # ── Real provider path (Yalidine only for P2) ──────────────────────────
    if provider == "yalidine":
        # Find the tenant's active Yalidine integration (first match).
        integration = await db.ecom_integrations.find_one({
            "channel": "yalidine",
            "is_active": True,
        }) or await db.ecom_integrations.find_one({
            "credentials.api_id": {"$exists": True},
            "credentials.api_token": {"$exists": True},
        })
        if integration:
            try:
                result = await yalidine_create_parcel(integration, order)
                tracking = result["tracking_number"]
                label_url = result["label_url"]
                mode = "live"
                logger.info("Yalidine real parcel created: order=%s tracking=%s", order_id, tracking)
            except YalidineCredentialsMissing:
                logger.info("Yalidine creds missing — falling back to mock for order=%s", order_id)
            except YalidineAPIError as exc:
                logger.warning("Yalidine real call failed (%s) — falling back to mock", exc)

    # ── Mock fallback (always works) ──────────────────────────────────────
    if not tracking:
        tracking = _mock_tracking_number(provider)
        label_url = f"mock://labels/{label_id}.pdf"
        mode = "mock" if provider == "mock" else "mock_real_provider_pending"

    label_doc = {
        "id": label_id,
        "order_id": order_id,
        "order_code": order.get("order_code"),
        "provider": provider,
        "mode": mode,
        "tracking_number": tracking,
        "label_url": label_url,
        "customer_name": order.get("customer", {}).get("name", ""),
        "customer_phone": order.get("customer", {}).get("phone", ""),
        "city": order.get("customer", {}).get("city", ""),
        "wilaya": order.get("customer", {}).get("wilaya", ""),
        "total": order.get("total", 0),
        "status": "created",
        "created_at": now,
        "created_by": user.get("id"),
    }
    await db.ecom_shipping_labels.insert_one(label_doc)

    # Attach label info to the order + advance status if appropriate.
    update: dict = {
        "shipping_label_id": label_id,
        "tracking_number": tracking,
        "courier": provider,
        "updated_at": now,
    }
    if order.get("status") in ("confirmed", "packed"):
        update["status"] = "shipped"
        await db.ecom_orders.update_one(
            {"id": order_id},
            {
                "$set": update,
                "$push": {
                    "status_history": {
                        "status": "shipped",
                        "at": now,
                        "by": user.get("id"),
                        "note": f"تم إنشاء بطاقة شحن {provider} ({mode})",
                    }
                },
            },
        )
    else:
        await db.ecom_orders.update_one({"id": order_id}, {"$set": update})

    label_doc.pop("_id", None)
    return label_doc


@router.post("/ecom/shipping/yalidine/pull-rates")
async def pull_yalidine_rates(body: dict, user: dict = Depends(require_tenant)):
    """p76: pull real delivery fees (home + desk + return) for all 58 wilayas
    from the tenant's Yalidine account and overwrite delivery_rates with them."""
    await require_ecom_feature(user)
    integration = await db.ecom_integrations.find_one({"channel": "yalidine", "is_active": True})
    if not integration or not (integration.get("credentials") or {}).get("api_id"):
        raise HTTPException(status_code=400, detail="تكامل يالدين غير مُعَدّ")

    try:
        from_wilaya = int(body.get("from_wilaya_id") or 16)
    except (TypeError, ValueError):
        from_wilaya = 16

    from routes.online_store_routes import DEFAULT_DELIVERY_RATES  # names + ids
    from services.ecom.yalidine_service import fetch_fees_for_wilaya
    import asyncio

    now = datetime.now(timezone.utc).isoformat()
    saved = 0
    failed = []
    retour_fees = []

    # Sequential with delay + one retry — Yalidine rate-limits parallel calls (429).
    # Non-destructive: upsert per wilaya, never wipe the collection.
    for rate_row in DEFAULT_DELIVERY_RATES:
        to_id = int(rate_row["wilaya_id"])
        fees = None
        for attempt in range(3):
            try:
                fees = await fetch_fees_for_wilaya(integration, from_wilaya, to_id)
                break
            except Exception as exc:  # noqa: BLE001
                if "429" in str(exc) and attempt < 2:
                    await asyncio.sleep(8 + attempt * 12)
                    continue
                failed.append({"wilaya": to_id, "error": str(exc)[:80]})
        if fees is None:
            continue
        await db.delivery_rates.update_one(
            {"id": rate_row["wilaya_id"]},
            {"$set": {
                "id": rate_row["wilaya_id"],
                "wilaya_name": rate_row.get("wilaya_name", ""),
                "home_price": float(fees["home"]),
                "office_price": float(fees["desk"]),
                "source": "yalidine",
                "updated_at": now,
            }},
            upsert=True,
        )
        saved += 1
        if fees["retour"]:
            retour_fees.append(fees["retour"])
        await asyncio.sleep(1.5)

    if saved == 0:
        raise HTTPException(status_code=502, detail=f"فشل جلب الأسعار من يالدين: {failed[:2]}")

    # return fee: the most common non-zero retour_fee across wilayas
    retour = 0
    if retour_fees:
        from collections import Counter
        retour = Counter(retour_fees).most_common(1)[0][0]
    await db.ecom_integrations.update_one(
        {"id": integration["id"]},
        {"$set": {"return_fee": float(retour), "sender_wilaya_id": from_wilaya, "rates_pulled_at": now}},
    )

    return {
        "saved": saved,
        "failed": failed,
        "return_fee": retour,
        "from_wilaya_id": from_wilaya,
        "message": f"تم سحب أسعار {saved} ولاية من يالدين (حق الإرجاع: {retour} دج)" + (f" — فشل {len(failed)}" if failed else ""),
    }


@router.post("/ecom/shipping/sync-yalidine")
async def sync_yalidine_statuses(user: dict = Depends(require_tenant)):
    """p74: pull real parcel statuses from Yalidine for shipped orders and
    advance them automatically (delivered → profit realized / returned →
    losses + stock restored, via the standard status state machine)."""
    await require_ecom_feature(user)
    integration = await db.ecom_integrations.find_one({"channel": "yalidine", "is_active": True})
    if not integration or not (integration.get("credentials") or {}).get("api_id"):
        raise HTTPException(status_code=400, detail="تكامل يالدين غير مُعَدّ — أدخل المفاتيح من صفحة التكاملات أولاً")

    orders = await db.ecom_orders.find(
        {"status": "shipped", "courier": "yalidine", "tracking_number": {"$nin": [None, ""]}},
        {"_id": 0},
    ).to_list(500)

    from services.application.ecom_order_service import change_order_status
    from services.ecom.yalidine_service import fetch_parcel_status, map_yalidine_status

    results = {"checked": 0, "delivered": 0, "returned": 0, "unchanged": 0, "errors": []}
    for o in orders:
        results["checked"] += 1
        try:
            st = await fetch_parcel_status(integration, o["tracking_number"])
            target = map_yalidine_status(st.get("last_status"))
            if target == "delivered":
                await change_order_status(db, o["id"], "delivered", "مزامنة يالدين التلقائية", user)
                results["delivered"] += 1
            elif target == "refunded":
                await change_order_status(db, o["id"], "refunded", "مزامنة يالدين — رفض الاستلام / إرجاع", user)
                results["returned"] += 1
            else:
                results["unchanged"] += 1
        except Exception as exc:  # noqa: BLE001 — keep syncing the rest
            results["errors"].append({"order": o.get("order_code"), "error": str(exc)[:120]})
    return results


COURIER_DISPLAY_NAMES = {"yalidine": "يالدين", "zr": "ZR Express", "maystro": "مايسترو"}
# p256: display names for the full courier registry (settlements, reports)
from services.ecom.algerian_couriers import EXTRA_COURIERS as _EXTRA_COURIERS
for _c in _EXTRA_COURIERS:
    COURIER_DISPLAY_NAMES.setdefault(_c["id"], _c["name_ar"])


@router.get("/ecom/shipping/courier-adapters")
async def courier_adapters(user: dict = Depends(require_tenant)):
    """p248: registered couriers + whether each is sync-ready (credentials or mock)."""
    await require_ecom_feature(user)
    from services.ecom.courier_sync import COURIER_ADAPTERS
    out = []
    for code, meta in COURIER_ADAPTERS.items():
        integ = await db.ecom_integrations.find_one(
            {"channel": code, "is_active": True}, {"_id": 0, "credentials": 1, "status_map": 1})
        creds = (integ or {}).get("credentials") or {}
        ready = bool(creds.get("mock_status") or creds.get("api_id")
                     or (creds.get("base_url") and (creds.get("api_token") or creds.get("api_key"))))
        out.append({"courier": code, "label_ar": meta["label_ar"],
                    "adapter": meta["adapter"], "configured": bool(integ),
                    "sync_ready": ready, "has_status_map": bool((integ or {}).get("status_map"))})
    return {"items": out}


@router.post("/ecom/shipping/sync/{courier}")
async def sync_courier(courier: str, user: dict = Depends(require_tenant)):
    """p248: generic auto status sync for any registered courier (mock or
    credentials-configured). Advances shipped orders through the real state
    machine — delivered collects COD, refunded books the return."""
    await require_ecom_feature(user)
    from services.ecom.courier_sync import sync_courier_orders, CourierNotConfigured
    courier = (courier or "").strip().lower()
    try:
        return await sync_courier_orders(db, courier, user)
    except CourierNotConfigured as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/ecom/shipping/cheapest")
async def cheapest_courier(wilaya: str = "", desk: bool = False, user: dict = Depends(require_tenant)):
    """p99: for each ACTIVE courier integration, the price for a given wilaya + the cheapest pick.
    Yalidine prices come from the pulled delivery_rates; other couriers from ecom_courier_prices
    (manual rate sheets entered via PUT /courier-prices/{courier})."""
    await require_ecom_feature(user)
    w = (wilaya or "").strip()
    options = []
    if w:
        intgs = await db.ecom_integrations.find(
            {"kind": "shipping", "is_active": True}, {"_id": 0, "channel": 1}
        ).to_list(20)
        for intg in intgs:
            ch = intg.get("channel")
            if ch == "mock":
                continue
            row = None
            source = "manual"
            if ch == "yalidine":
                row = await db.delivery_rates.find_one({"wilaya_name": w}, {"_id": 0})
                source = "yalidine_api"
            if row is None:
                row = await db.ecom_courier_prices.find_one(
                    {"courier": ch, "$or": [{"wilaya_name": w}, {"wilaya_id": w}]}, {"_id": 0}
                )
                source = "manual"
            if not row:
                continue
            price = row.get("office_price") if desk else row.get("home_price")
            if price is None:
                continue
            options.append({
                "courier": ch,
                "name": COURIER_DISPLAY_NAMES.get(ch, ch),
                "price": price,
                "home_price": row.get("home_price"),
                "office_price": row.get("office_price"),
                "source": source,
            })
    cheapest = min(options, key=lambda o: o["price"])["courier"] if options else None
    return {"wilaya": w, "options": options, "cheapest": cheapest}


@router.put("/ecom/shipping/courier-prices/{courier}")
async def set_courier_prices(courier: str, body: dict, user: dict = Depends(require_tenant)):
    """p99: bulk upsert a manual rate sheet for a courier (zr/maystro/...).
    body: {rates: [{wilaya_id, wilaya_name, home_price, office_price}]}"""
    await require_ecom_feature(user)
    if courier not in SHIPPING_PROVIDER_KEYS or courier == "mock":
        raise HTTPException(status_code=400, detail="شركة شحن غير مدعومة")
    rates = body.get("rates") or []
    now = datetime.now(timezone.utc).isoformat()
    saved = 0
    for r in rates:
        try:
            doc = {
                "courier": courier,
                "wilaya_id": str(r.get("wilaya_id") or "").strip(),
                "wilaya_name": (r.get("wilaya_name") or "").strip(),
                "home_price": float(r.get("home_price") or 0),
                "office_price": float(r.get("office_price") or 0),
                "updated_at": now,
            }
        except (TypeError, ValueError):
            continue
        if not (doc["wilaya_id"] or doc["wilaya_name"]):
            continue
        await db.ecom_courier_prices.update_one(
            {"courier": courier, "wilaya_id": doc["wilaya_id"], "wilaya_name": doc["wilaya_name"]},
            {"$set": doc},
            upsert=True,
        )
        saved += 1
    return {"saved": saved}


@router.get("/ecom/shipping/labels-bulk")
async def bulk_labels(date: Optional[str] = None, user: dict = Depends(require_tenant)):
    """p85: كل بوليصات يوم معيّن (افتراضياً اليوم) للطباعة الجماعية."""
    await require_ecom_feature(user)
    if not date:
        from datetime import datetime as _dt, timezone as _tz, timedelta as _td
        date = (_dt.now(_tz.utc) + _td(hours=1)).date().isoformat()  # Africa/Algiers
    q = {"created_at": {"$regex": f"^{re.escape(date)}"}}
    rows = await db.ecom_shipping_labels.find(q, {"_id": 0}).sort("created_at", 1).to_list(500)
    labels = []
    for r in rows:
        url = r.get("label_url") or ""
        labels.append({
            "label_id": r.get("id"),
            "order_id": r.get("order_id"),
            "tracking_number": r.get("tracking_number") or "",
            "provider": r.get("provider") or "",
            "label_url": url,
            "real": bool(url) and not url.startswith("mock://"),
            "created_at": r.get("created_at"),
        })
    return {"date": date, "count": len(labels), "labels": labels}


@router.get("/ecom/shipping/settlements")
async def shipping_settlements(user: dict = Depends(require_tenant)):
    """p90: per-courier payout reconciliation.
    Wallet balance = what that courier owes us right now (COD collected, not paid out)."""
    await require_ecom_feature(user)
    boxes = await db.cash_boxes.find({"type": "ecom"}, {"_id": 0}).to_list(50)
    out = []
    for b in boxes:
        box_id = b.get("id") or ""
        courier = box_id.replace("ecom_store_", "", 1) if box_id.startswith("ecom_store_") else ""
        q = {"status": "delivered"}
        if courier:
            q["courier"] = courier
        else:
            q["$or"] = [{"courier": None}, {"courier": ""}]
        orders = await db.ecom_orders.find(q, {"_id": 0, "total": 1, "shipping_fee": 1}).to_list(5000)
        delivered_total = round(sum(float(o.get("total") or 0) - float(o.get("shipping_fee") or 0) for o in orders), 2)
        ret_q = dict(q)
        ret_q["status"] = "refunded"
        returned = await db.ecom_orders.count_documents(ret_q)
        out.append({
            "box_id": box_id, "courier": courier or "manual", "name": b.get("name") or box_id,
            "balance": round(float(b.get("balance") or 0), 2),
            "delivered_count": len(orders), "delivered_total": delivered_total,
            "returned_count": returned,
        })
    targets = [{"id": t.get("id"), "name": t.get("name")}
               for t in await db.cash_boxes.find({"type": {"$ne": "ecom"}}, {"_id": 0, "id": 1, "name": 1}).to_list(20)]
    return {"settlements": out, "targets": targets}


@router.get("/ecom/shipping/labels/{label_id}")
async def get_label(label_id: str, user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    label = await db.ecom_shipping_labels.find_one({"id": label_id}, {"_id": 0})
    if not label:
        raise HTTPException(status_code=404, detail="بطاقة الشحن غير موجودة")
    return label


# ============ p103: التسوية الذكية + توقع التدفق النقدي ============

@router.get("/ecom/shipping/cash-forecast")
async def cash_forecast(user: dict = Depends(require_tenant)):
    """p103: لكل شركة شحن — المستحق الآن (الرصيد) + قيد التحصيل في الطريق
    + المتوقع تحصيله فعلاً حسب معدل التسليم التاريخي لهذه الشركة."""
    await require_ecom_feature(user)
    couriers = await db.ecom_orders.distinct(
        "courier",
        {"status": {"$in": ["shipped", "delivered", "refunded"]}, "courier": {"$nin": [None, ""]}},
    )
    out = []
    for c in sorted(couriers):
        shipped = await db.ecom_orders.find(
            {"courier": c, "status": "shipped"},
            {"_id": 0, "total": 1, "shipping_fee": 1},
        ).to_list(5000)
        in_transit = round(
            sum(max(float(o.get("total") or 0) - float(o.get("shipping_fee") or 0), 0) for o in shipped), 2)
        delivered = await db.ecom_orders.count_documents({"courier": c, "status": "delivered"})
        refunded = await db.ecom_orders.count_documents({"courier": c, "status": "refunded"})
        outcomes = delivered + refunded
        rate = round(delivered / outcomes, 3) if outcomes else None
        expected = round(in_transit * rate, 2) if rate is not None else None
        box = await db.cash_boxes.find_one({"id": f"ecom_store_{c}"}, {"_id": 0, "balance": 1})
        out.append({
            "courier": c,
            "owed_now": round(float(box.get("balance") or 0), 2) if box else 0.0,
            "in_transit_count": len(shipped),
            "in_transit": in_transit,
            "delivery_rate": rate,
            "expected": expected,
        })
    return {"forecast": out}


@router.post("/ecom/shipping/reconcile")
async def reconcile_statement(body: dict, user: dict = Depends(require_tenant)):
    """p103: مطابقة كشف دفع شركة الشحن — الصق أرقام التتبع من الكشف،
    فيكشف النظام الطرود المسلَّمة التي لم تُدفع لك (الفجوة) وأرقاماً مجهولة."""
    await require_ecom_feature(user)
    raw = body.get("tracking_numbers") or ""
    if isinstance(raw, list):
        raw = "\n".join(str(x) for x in raw)
    courier = (body.get("courier") or "").strip()
    nums = [t.strip() for t in re.split(r"[\s,;]+", str(raw)) if t.strip()]
    if not nums:
        raise HTTPException(status_code=400, detail="الصق أرقام التتبع من الكشف أولاً")
    orig = {}
    for n in nums:
        orig.setdefault(n.lower(), n)

    q = {"status": "delivered", "tracking_number": {"$nin": [None, ""]}}
    if courier:
        q["courier"] = courier
    orders = await db.ecom_orders.find(
        q, {"_id": 0, "order_code": 1, "tracking_number": 1, "total": 1, "shipping_fee": 1},
    ).to_list(10000)
    sys_map = {}
    for o in orders:
        tn = str(o.get("tracking_number") or "").strip()
        if tn:
            sys_map[tn.lower()] = o

    stmt_set = set(orig.keys())
    sys_set = set(sys_map.keys())
    missing, gap = [], 0.0
    for tn in sorted(sys_set - stmt_set):
        o = sys_map[tn]
        amount = round(max(float(o.get("total") or 0) - float(o.get("shipping_fee") or 0), 0), 2)
        gap += amount
        missing.append({
            "tracking": o.get("tracking_number"),
            "order_code": o.get("order_code") or "",
            "amount": amount,
        })
    unknown = [orig[tn] for tn in sorted(stmt_set - sys_set)]
    return {
        "courier": courier or "all",
        "statement_count": len(nums),
        "system_delivered": len(sys_map),
        "matched": len(stmt_set & sys_set),
        "missing_in_statement": missing,
        "unknown_in_statement": unknown,
        "gap_amount": round(gap, 2),
    }
