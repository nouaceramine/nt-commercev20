"""
Seed script — populate `platform_card_sales` for a specific tenant so the
`/services/cards` Sales tab pagination footer can be exercised by tests.

Usage:
    python -m scripts.seed_platform_card_sales [tenant_id] [count]
    # defaults: first active tenant, count=60

The script is idempotent: rows are tagged with `seed_tag = "iter17-pagination"`
so a re-run first deletes its previous batch.
"""
from __future__ import annotations

import asyncio
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Make the backend package importable when running this file directly,
# and load the backend/.env env vars BEFORE config.database imports them.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv  # noqa: E402
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from config.database import db, get_tenant_db  # noqa: E402


SEED_TAG = "iter17-pagination"
OPERATORS = ["Mobilis", "Djezzy", "Ooredoo"]
DENOMS = [100, 200, 500, 1000, 2000]
CUSTOMER_NAMES = ["زبون 1", "زبون 2", "محمد", "أحمد", "ياسين", "خالد", "كريم", "سعيد", None]


async def main(tenant_id: str | None, count: int):
    if not tenant_id:
        first = await db.saas_tenants.find_one({"is_active": True}, sort=[("created_at", 1)])
        if not first:
            print("No active tenant found.")
            return
        tenant_id = str(first.get("id") or first.get("_id"))
    tenant_id = str(tenant_id)

    tenant_db = get_tenant_db(tenant_id)

    deleted = await tenant_db.platform_card_sales.delete_many({"seed_tag": SEED_TAG})
    print(f"Removed {deleted.deleted_count} stale seed rows for tenant {tenant_id}.")

    now = datetime.now(timezone.utc)
    docs = []
    for i in range(count):
        op = random.choice(OPERATORS)
        den = random.choice(DENOMS)
        sell = den + random.choice([0, 10, 20, 50])
        method = random.choice(["cash", "cash", "cash", "credit"])
        customer = random.choice(CUSTOMER_NAMES)
        sold_at = now - timedelta(minutes=i * 13)  # spread over ~13 hours
        docs.append({
            "id": str(uuid.uuid4()),
            "type": "telecom_card",
            "operator": op,
            "denomination": den,
            "sell_price": sell,
            "payment_method": method,
            "customer_name": customer,
            "customer_phone": "+2135" + str(random.randint(10000000, 99999999)) if customer else None,
            "is_credit": method == "credit",
            "debt_amount": sell if method == "credit" else 0,
            "code": f"PIN-{random.randint(1000, 9999)}-{random.randint(1000, 9999)}-{random.randint(1000, 9999)}",
            "created_at": sold_at.isoformat(),
            "seed_tag": SEED_TAG,
        })
    if docs:
        await tenant_db.platform_card_sales.insert_many(docs)
    print(f"Inserted {len(docs)} sales for tenant {tenant_id}.")


if __name__ == "__main__":
    tid = sys.argv[1] if len(sys.argv) > 1 else None
    cnt = int(sys.argv[2]) if len(sys.argv) > 2 else 60
    asyncio.run(main(tid, cnt))
