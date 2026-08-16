#!/usr/bin/env python3
"""p100: backfill main_db.customer_reputation from all tenants' existing ecom_orders."""
import asyncio
import sys
from collections import defaultdict

sys.path.insert(0, "/app")

from config.database import main_db, get_tenant_db  # noqa: E402
from services.application.ecom_order_service import normalize_phone  # noqa: E402


async def main():
    agg = defaultdict(lambda: {"orders": 0, "delivered": 0, "returned": 0, "tenants": set()})
    tenants = await main_db.saas_tenants.find({}, {"_id": 0, "id": 1}).to_list(500)
    for t in tenants:
        tid = t.get("id")
        if not tid:
            continue
        tdb = get_tenant_db(tid)
        cursor = tdb.ecom_orders.find({}, {"_id": 0, "customer.phone": 1, "status": 1})
        n = 0
        async for o in cursor:
            phone = normalize_phone((o.get("customer") or {}).get("phone", ""))
            if not phone:
                continue
            rec = agg[phone]
            rec["orders"] += 1
            st = o.get("status")
            if st == "delivered":
                rec["delivered"] += 1
            elif st in ("refunded", "returned"):
                rec["returned"] += 1
            rec["tenants"].add(tid)
            n += 1
        print(f"tenant {tid[:8]}: {n} orders scanned")

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    written = 0
    for phone, rec in agg.items():
        await main_db.customer_reputation.update_one(
            {"_id": phone},
            {"$set": {
                "orders": rec["orders"], "delivered": rec["delivered"], "returned": rec["returned"],
                "updated_at": now, "backfilled": True,
            }, "$addToSet": {"tenants": {"$each": list(rec["tenants"])}},
             "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        written += 1
    print(f"reputation records written: {written}")


if __name__ == "__main__":
    asyncio.run(main())
