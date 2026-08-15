"""p80: Periodic Yalidine status sync — every 2 hours, all tenants, automatic.

Replaces the manual "sync-yalidine" button cadence: a background asyncio loop
(started at app startup) iterates all active tenants, and for each tenant with
an active Yalidine integration pulls parcel statuses for shipped orders and
advances them through the standard state machine (delivered → profit realized,
refunded → losses + stock restored), then posts a notification per transition.
"""
import asyncio
import logging

logger = logging.getLogger(__name__)

SYNC_INTERVAL_SECONDS = 2 * 3600  # كل ساعتين
FIRST_RUN_DELAY = 300             # أول تشغيل بعد 5 دقائق من الإقلاع


async def _sync_tenant(tdb, tenant_label: str) -> dict:
    """Sync one tenant DB. Returns a small result summary."""
    integration = await tdb.ecom_integrations.find_one({"channel": "yalidine", "is_active": True})
    if not integration or not (integration.get("credentials") or {}).get("api_id"):
        return {"tenant": tenant_label, "skipped": True}

    orders = await tdb.ecom_orders.find(
        {"status": "shipped", "courier": "yalidine", "tracking_number": {"$nin": [None, ""]}},
        {"_id": 0},
    ).to_list(500)
    if not orders:
        return {"tenant": tenant_label, "checked": 0}

    from services.application.ecom_order_service import change_order_status
    from services.ecom.yalidine_service import fetch_parcel_status, map_yalidine_status
    from services.smart_notifications import notify

    sys_user = {"id": "yalidine-auto-sync", "name": "المزامنة التلقائية", "email": ""}
    res = {"tenant": tenant_label, "checked": 0, "delivered": 0, "returned": 0, "errors": 0}
    for o in orders:
        res["checked"] += 1
        try:
            st = await fetch_parcel_status(integration, o["tracking_number"])
            target = map_yalidine_status(st.get("last_status"))
            if target == "delivered":
                await change_order_status(tdb, o["id"], "delivered", "مزامنة يالدين الدورية", sys_user)
                res["delivered"] += 1
                await notify(tdb, "shipment_delivered", "📦 تسليم طلب",
                             f"تم تسليم الطلب {o.get('order_code')} ({(o.get('customer') or {}).get('name', '')}) — تحقّق الربح تلقائياً",
                             link="/ecom/orders")
            elif target == "refunded":
                await change_order_status(tdb, o["id"], "refunded", "مزامنة يالدين الدورية — إرجاع", sys_user)
                res["returned"] += 1
                await notify(tdb, "shipment_returned", "↩️ إرجاع طلب",
                             f"الطلب {o.get('order_code')} أُرجع/رُفض استلامه — سُجّلت الخسائر وأُعيد المخزون",
                             link="/ecom/orders")
            await asyncio.sleep(1.0)  # رفقاً بحدود يالدين
        except Exception as exc:  # noqa: BLE001
            res["errors"] += 1
            logger.warning("yalidine auto-sync order %s failed: %s", o.get("order_code"), str(exc)[:120])
    return res


async def _sync_all_tenants(main_db, get_tenant_db) -> None:
    tenants = await main_db.saas_tenants.find(
        {"is_active": {"$ne": False}}, {"_id": 0, "id": 1, "short_id": 1}
    ).to_list(2000)
    for t in tenants:
        tid = t.get("id")
        if not tid:
            continue
        try:
            res = await _sync_tenant(get_tenant_db(tid), t.get("short_id") or tid[:8])
            if res.get("delivered") or res.get("returned"):
                logger.info("yalidine auto-sync %s: %s", res["tenant"], res)
        except Exception:  # noqa: BLE001
            logger.exception("yalidine auto-sync failed for tenant %s", tid[:8])
        await asyncio.sleep(2)


def start_yalidine_scheduler(main_db, get_tenant_db) -> None:
    """Start the 2-hour background loop (idempotent)."""
    async def _loop():
        await asyncio.sleep(FIRST_RUN_DELAY)
        while True:
            try:
                await _sync_all_tenants(main_db, get_tenant_db)
            except Exception:  # noqa: BLE001
                logger.exception("yalidine scheduled sync cycle failed")
            await asyncio.sleep(SYNC_INTERVAL_SECONDS)

    asyncio.create_task(_loop())
    logger.info("Yalidine auto-sync scheduler started (every %ss, first run in %ss)",
                SYNC_INTERVAL_SECONDS, FIRST_RUN_DELAY)
