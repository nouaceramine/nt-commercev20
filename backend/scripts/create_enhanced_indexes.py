"""
NT Commerce v16 - Create enhanced modules indexes on ALL databases.

Creates Section 1 (Products) + Section 2 (Orders) indexes on:
  - the main database (DB_NAME)
  - every tenant database (tenant_<id>) found in main_db.saas_tenants

Usage (inside the backend container):
  python scripts/create_enhanced_indexes.py
"""
import asyncio
import os
import sys
from pathlib import Path

# Allow running as a standalone script: make `utils.*` importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from utils.enhanced_products_indexes import create_enhanced_products_indexes  # noqa: E402
from utils.enhanced_orders_indexes import create_enhanced_orders_indexes  # noqa: E402


async def run() -> None:
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "nt_commerce")
    client = AsyncIOMotorClient(mongo_url)

    main_db = client[db_name]
    targets = [main_db]

    # Discover all tenant databases (same naming rule as config/database.py)
    try:
        tenant_ids = await main_db.saas_tenants.distinct("id")
        for tid in tenant_ids:
            if tid:
                targets.append(client[f"tenant_{str(tid).replace('-', '_')}"])
    except Exception as exc:
        print(f"Warning: could not list tenants ({exc}) - main DB only")

    print(f"Creating enhanced indexes on {len(targets)} database(s)...")
    for tdb in targets:
        products = await create_enhanced_products_indexes(tdb)
        orders = await create_enhanced_orders_indexes(tdb)
        print(f"  [{tdb.name}] products={products} orders={orders}")

    client.close()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(run())
