#!/usr/bin/env python3
"""p107: hourly WhatsApp reminders for abandoned carts, per tenant.

Run inside the backend container via host cron:
    docker exec ntcommerce-backend-1 python3 /app/scripts/cart_recovery.py

For every tenant with cart_recovery_enabled + an active WhatsApp integration:
finds store_cart_leads not converted, not yet reminded, older than
cart_recovery_delay_hours — sends a reminder and marks reminder_sent.
"""
import asyncio
import logging
import sys

sys.path.insert(0, "/app")

from datetime import datetime, timezone, timedelta  # noqa: E402

from config.database import main_db, get_tenant_db  # noqa: E402
from services.ecom.whatsapp_service import send_text_message  # noqa: E402
from services.application.ecom_order_service import normalize_phone  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("cart_recovery")


async def recover_tenant(tenant_id: str) -> dict:
    tdb = get_tenant_db(tenant_id)
    settings = await tdb.store_settings.find_one({"enabled": True}) or {}
    if not settings.get("cart_recovery_enabled", True):
        return {"tenant": tenant_id, "skipped": "disabled"}
    integration = await tdb.ecom_integrations.find_one({"channel": "whatsapp", "is_active": True})
    creds = (integration or {}).get("credentials") or {}
    if not creds.get("phone_number_id") or not creds.get("access_token"):
        return {"tenant": tenant_id, "skipped": "no_whatsapp"}
    delay = int(settings.get("cart_recovery_delay_hours", 3) or 3)
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=delay)).isoformat()
    leads = await tdb.store_cart_leads.find(
        {"converted": False, "reminder_sent": {"$ne": True}, "last_seen": {"$lt": cutoff}},
        {"_id": 0},
    ).to_list(200)
    store_name = settings.get("store_name") or "متجرنا"
    res = {"tenant": tenant_id, "reminded": 0, "errors": 0}
    for lead in leads:
        phone = normalize_phone(lead.get("phone") or "")
        if not phone:
            continue
        items = "، ".join(f"{i.get('name')}×{i.get('quantity')}" for i in (lead.get("items") or [])[:5])
        total = lead.get("total") or 0
        name = lead.get("name") or ""
        slug = lead.get("store_slug") or ""
        body = (
            f"مرحباً {name} 👋\n"
            f"لاحظنا أنك بدأت طلباً في {store_name} ولم تكمله 🛒\n"
            f"سلتك: {items or 'منتجات'} — بقيمة {total} دج.\n"
            f"أكمل طلبك قبل نفاد الكمية: https://nt-commerce.net/shop/{slug}"
        )
        try:
            await send_text_message(integration, phone, body)
            await tdb.store_cart_leads.update_one(
                {"id": lead.get("id")},
                {"$set": {"reminder_sent": True, "reminded_at": datetime.now(timezone.utc).isoformat()}},
            )
            res["reminded"] += 1
        except Exception as exc:  # noqa: BLE001
            logger.warning("reminder failed for %s: %s", lead.get("id"), exc)
            res["errors"] += 1
    return res


async def main():
    tenants = await main_db.saas_tenants.find({}, {"_id": 0, "id": 1}).to_list(500)
    logger.info("cart recovery: tenants=%d", len(tenants))
    for t in tenants:
        try:
            res = await recover_tenant(t.get("id"))
            if res.get("reminded"):
                logger.info("result: %s", res)
        except Exception as exc:  # noqa: BLE001
            logger.error("tenant %s failed: %s", t.get("id"), exc)


if __name__ == "__main__":
    asyncio.run(main())
