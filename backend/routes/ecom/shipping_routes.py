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


@router.get("/ecom/shipping/labels/{label_id}")
async def get_label(label_id: str, user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    label = await db.ecom_shipping_labels.find_one({"id": label_id}, {"_id": 0})
    if not label:
        raise HTTPException(status_code=404, detail="بطاقة الشحن غير موجودة")
    return label
