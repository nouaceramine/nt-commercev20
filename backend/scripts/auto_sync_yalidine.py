#!/usr/bin/env python3
"""p97: periodic Yalidine status sync for ALL tenants.

Run inside the backend container via host cron (hourly):
    docker exec ntcommerce-backend-1 python3 /app/scripts/auto_sync_yalidine.py

For every tenant with an active yalidine integration, pulls parcel statuses for
shipped orders and advances them through the standard state machine — which also
runs the full accounting chain (wallet income on delivered, reversal + courier
charges on returned, sales ledger sync, stock restore).
"""
import asyncio
import logging
import sys

sys.path.insert(0, "/app")

from config.database import main_db, get_tenant_db  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("auto_sync_yalidine")

SYSTEM_USER = {"id": "system", "name": "المزامنة التلقائية", "role": "admin", "email": "system@local"}


async def sync_tenant(tenant_id: str) -> dict:
    from services.application.ecom_order_service import change_order_status
    from services.ecom.yalidine_service import fetch_parcel_status, map_yalidine_status

    tdb = get_tenant_db(tenant_id)
    integration = await tdb.ecom_integrations.find_one({"channel": "yalidine", "is_active": True})
    if not integration or not (integration.get("credentials") or {}).get("api_id"):
        return {"tenant": tenant_id, "skipped": "no_integration"}
    orders = await tdb.ecom_orders.find(
        {"status": "shipped", "courier": "yalidine", "tracking_number": {"$nin": [None, ""]}},
        {"_id": 0},
    ).to_list(500)
    res = {"tenant": tenant_id, "checked": 0, "delivered": 0, "returned": 0, "unchanged": 0, "errors": 0}
    for o in orders:
        res["checked"] += 1
        try:
            st = await fetch_parcel_status(integration, o["tracking_number"])
            target = map_yalidine_status(st.get("last_status"))
            if target == "delivered":
                await change_order_status(tdb, o["id"], "delivered", "مزامنة يالدين التلقائية الدورية", SYSTEM_USER)
                res["delivered"] += 1
            elif target == "refunded":
                await change_order_status(tdb, o["id"], "refunded", "مزامنة يالدين التلقائية — رفض/إرجاع", SYSTEM_USER)
                res["returned"] += 1
            else:
                res["unchanged"] += 1
        except Exception as exc:
            res["errors"] += 1
            logger.warning("order %s: %s", o.get("order_code"), str(exc)[:150])
    return res


async def main():
    tenants = await main_db.saas_tenants.find({}, {"_id": 0, "id": 1}).to_list(500)
    total = {"tenants": 0, "synced": 0, "delivered": 0, "returned": 0, "errors": 0}
    for t in tenants:
        tid = t.get("id")
        if not tid:
            continue
        total["tenants"] += 1
        try:
            r = await sync_tenant(tid)
            if r.get("skipped"):
                continue
            total["synced"] += 1
            total["delivered"] += r["delivered"]
            total["returned"] += r["returned"]
            total["errors"] += r["errors"]
            if r["checked"]:
                logger.info("tenant %s: %s", tid, r)
        except Exception as exc:
            total["errors"] += 1
            logger.warning("tenant %s failed: %s", tid, str(exc)[:200])
    logger.info("done: %s", total)


if __name__ == "__main__":
    asyncio.run(main())
