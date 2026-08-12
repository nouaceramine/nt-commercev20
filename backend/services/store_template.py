"""Master e-commerce store template (p34, gap 4).

Mirrors the golden-DB philosophy: a `store_template` Mongo DB holds the master
online-store configuration; every newly provisioned tenant gets a copy, so a
subscriber's store starts configured (disabled by default — they flip
`enabled` when ready) instead of starting from emptiness.

Non-destructive: copying never overwrites docs the tenant already has.
"""
import logging
from datetime import datetime, timezone

from config.database import client, get_tenant_db

logger = logging.getLogger(__name__)

STORE_TEMPLATE_DB = "store_template"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def default_store_docs() -> dict:
    """Master store seed docs, keyed by target tenant collection."""
    return {
        "store_settings": [{
            "id": "main",
            "enabled": False,
            "store_name": "",
            "store_slug": "",
            "description": "",
            "logo_url": "",
            "banner_url": "",
            "primary_color": "#3b82f6",
            "contact_phone": "",
            "contact_email": "",
            "contact_address": "",
            "working_hours": "09:00 - 18:00",
            "cod_enabled": True,
            "delivery_enabled": True,
            "min_order_amount": 0,
            "delivery_fee": 0,
            "free_delivery_threshold": 0,
        }],
        "payment_settings": [{
            "id": "main",
            "cod_enabled": True,
            "cod_label": "الدفع عند الاستلام",
            "bank_transfer_enabled": False,
            "bank_transfer_details": "",
            "cib_enabled": False,
            "edahabia_enabled": False,
            "gateway_merchant_id": "",
            "updated_at": _now(),
        }],
        "shipping_settings": [{
            "id": "main",
            "delivery_enabled": True,
            "default_fee": 0,
            "free_delivery_threshold": 0,
            "zones": [],
            "pickup_enabled": True,
            "pickup_label": "الاستلام من المتجر",
            "updated_at": _now(),
        }],
        "ecom_integrations": [{
            "id": "woocommerce",
            "enabled": False,
            "store_url": "",
            "consumer_key": "",
            "consumer_secret": "",
            "sync_products": True,
            "sync_orders": True,
            "sync_customers": True,
            "last_sync": "",
        }],
    }


async def build_store_template() -> dict:
    """(Re)build the master store template DB from defaults (upsert by id)."""
    tpl = client[STORE_TEMPLATE_DB]
    stats = {}
    for col, docs in default_store_docs().items():
        written = 0
        for doc in docs:
            await tpl[col].update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
            written += 1
        stats[col] = written
    logger.info(f"store template built: {stats}")
    return {"db": STORE_TEMPLATE_DB, "collections": stats, "built_at": _now()}


async def copy_store_to_tenant(tenant_id: str) -> dict:
    """Copy master store docs into a tenant DB — non-destructive by id."""
    tpl = client[STORE_TEMPLATE_DB]
    tdb = get_tenant_db(tenant_id)
    copied = 0
    skipped = 0
    for col in await tpl.list_collection_names():
        if col.startswith("system."):
            continue
        async for doc in tpl[col].find({}, {"_id": 0}):
            existing = await tdb[col].find_one({"id": doc.get("id")})
            if existing:
                skipped += 1
                continue
            await tdb[col].insert_one(dict(doc))
            copied += 1
    logger.info(f"store copy to {tenant_id}: copied={copied} skipped={skipped}")
    return {"copied": copied, "skipped": skipped}


async def store_template_info() -> dict:
    tpl = client[STORE_TEMPLATE_DB]
    info = {}
    for col in await tpl.list_collection_names():
        if col.startswith("system."):
            continue
        info[col] = await tpl[col].count_documents({})
    return {"db": STORE_TEMPLATE_DB, "collections": info, "built": bool(info)}
