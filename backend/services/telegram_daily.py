"""p84: Daily Telegram summary — every evening (21:00 Africa/Algiers) each tenant
with telegram_daily_enabled gets a summary of the day: orders, delivered,
returned, and net profit (from the COD financial ledger).

Configured per tenant in store_settings:
  telegram_bot_token (secret — stripped from public store endpoints)
  telegram_chat_id
  telegram_daily_enabled (bool)
  telegram_last_daily (auto — dedup date)
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta

import httpx

logger = logging.getLogger(__name__)

CHECK_INTERVAL = 300          # فحص كل 5 دقائق
SUMMARY_HOUR = 21             # 21:00 بتوقيت الجزائر
ALGIERS = timezone(timedelta(hours=1))


async def send_telegram(bot_token: str, chat_id: str, text: str) -> tuple[bool, str]:
    """Send one message via Telegram Bot API. Returns (ok, error)."""
    if not bot_token or not chat_id:
        return False, "missing credentials"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                json={"chat_id": chat_id, "text": text},
            )
        if r.status_code == 200 and (r.json() or {}).get("ok"):
            return True, ""
        return False, f"HTTP {r.status_code}: {r.text[:150]}"
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)[:150]


async def build_daily_summary(tdb, day: str) -> str:
    """Arabic summary of `day` (YYYY-MM-DD, Algiers) from the tenant's ecom box."""
    orders = await tdb.ecom_orders.find(
        {"created_at": {"$regex": f"^{day}"}}, {"_id": 0, "id": 1, "status": 1, "total": 1}
    ).to_list(5000)
    fins = await tdb.ecom_order_financials.find({}, {"_id": 0}).to_list(10000)
    fin_by_id = {f.get("id"): f for f in fins}

    new_n = delivered_n = returned_n = 0
    revenue = profit = losses = 0.0
    for o in orders:
        st = o.get("status", "new")
        if st == "new":
            new_n += 1
        f = fin_by_id.get(o.get("id")) or {}
        if f.get("status") == "realized":
            delivered_n += 1
            revenue += float(f.get("revenue") or 0)
            profit += float(f.get("realized_profit") or 0)
        elif f.get("status") == "returned":
            returned_n += 1
            losses += float(f.get("losses") or 0)

    net = round(profit - losses, 2)
    return (
        f"📊 ملخص اليوم — {day}\n"
        f"🛒 طلبات جديدة: {len(orders)} (بانتظار المعالجة: {new_n})\n"
        f"✅ مُسلَّمة: {delivered_n} — إيراد {round(revenue):,} دج\n"
        f"↩️ مُرجعة: {returned_n} — خسائر {round(losses):,} دج\n"
        f"💰 صافي ربح اليوم: {round(net):,} دج"
    )


async def _daily_cycle(main_db, get_tenant_db) -> None:
    now_algiers = datetime.now(ALGIERS)
    if now_algiers.hour != SUMMARY_HOUR:
        return
    today = now_algiers.date().isoformat()
    tenants = await main_db.saas_tenants.find(
        {"is_active": {"$ne": False}}, {"_id": 0, "id": 1, "short_id": 1}
    ).to_list(2000)
    for t in tenants:
        tid = t.get("id")
        if not tid:
            continue
        try:
            tdb = get_tenant_db(tid)
            st = await tdb.store_settings.find_one({}, {"_id": 0})
            if not st or not st.get("telegram_daily_enabled"):
                continue
            token = (st.get("telegram_bot_token") or "").strip()
            chat = (st.get("telegram_chat_id") or "").strip()
            if not token or not chat:
                continue
            if st.get("telegram_last_daily") == today:
                continue  # أُرسل اليوم بالفعل
            text = await build_daily_summary(tdb, today)
            ok, err = await send_telegram(token, chat, text)
            if ok:
                await tdb.store_settings.update_many({}, {"$set": {"telegram_last_daily": today}})
                logger.info("telegram daily summary sent for %s", t.get("short_id") or tid[:8])
            else:
                logger.warning("telegram daily failed for %s: %s", t.get("short_id"), err)
        except Exception:  # noqa: BLE001
            logger.exception("telegram daily cycle failed for tenant %s", tid[:8])
        await asyncio.sleep(1)


def start_telegram_daily(main_db, get_tenant_db) -> None:
    """Start the daily-summary loop (idempotent)."""
    async def _loop():
        await asyncio.sleep(120)  # إقلاع هادئ
        while True:
            try:
                await _daily_cycle(main_db, get_tenant_db)
            except Exception:  # noqa: BLE001
                logger.exception("telegram daily cycle failed")
            await asyncio.sleep(CHECK_INTERVAL)

    asyncio.create_task(_loop())
    logger.info("Telegram daily-summary scheduler started (21:00 Algiers, check every %ss)", CHECK_INTERVAL)


async def notify_new_order(db, order: dict) -> None:
    """p91: instant Telegram alert when a new order enters (webstore or hub)."""
    try:
        st = await db.store_settings.find_one(
            {}, {"_id": 0, "telegram_bot_token": 1, "telegram_chat_id": 1, "telegram_notify_new_order": 1})
        if not st or not st.get("telegram_notify_new_order"):
            return
        token = (st.get("telegram_bot_token") or "").strip()
        chat = (st.get("telegram_chat_id") or "").strip()
        if not token or not chat:
            return
        cust = order.get("customer") or {}
        items = "، ".join(f"{i.get('name')}×{i.get('qty')}" for i in (order.get("items") or [])[:5])
        text = (
            f"🛒 طلب جديد! {order.get('order_code') or ''}\n"
            f"💰 الإجمالي: {order.get('total')} دج\n"
            f"👤 {cust.get('name', '')} — {cust.get('phone', '')}\n"
            f"📍 {cust.get('wilaya', '')} {cust.get('city', '')}\n"
            f"📦 {items}"
        )
        await send_telegram(token, chat, text)
    except Exception as exc:  # noqa: BLE001
        logger.warning("p91 instant telegram notify failed: %s", exc)
