"""M13c: CRM matching-report snapshots — weekly/monthly auto-generation.

For every tenant with CRM activity (clients or units), a matching report
snapshot is saved to the tenant db `crm_reports` collection:
  - weekly:  every Monday  (period_key = "W:2026-W46")
  - monthly: every 1st     (period_key = "M:2026-11")

If the tenant has Telegram configured (store_settings), a short summary
is sent. Dedup: one snapshot per period_key (regeneration replaces it).
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

CHECK_INTERVAL = 600          # فحص كل 10 دقائق
REPORT_HOUR = 8               # 08:00 بتوقيت الجزائر
ALGIERS = timezone(timedelta(hours=1))


def period_key(period: str, now: datetime | None = None) -> str:
    """Deterministic dedup key for a report period."""
    now = now or datetime.now(ALGIERS)
    if period == "weekly":
        iso = now.isocalendar()
        return f"W:{iso.year}-W{iso.week:02d}"
    if period == "monthly":
        return f"M:{now.year}-{now.month:02d}"
    raise ValueError("bad_period")


def is_report_due(period: str, now: datetime | None = None) -> bool:
    """Weekly → Monday; monthly → 1st of month. Both at REPORT_HOUR Algiers."""
    now = now or datetime.now(ALGIERS)
    if now.hour != REPORT_HOUR:
        return False
    if period == "weekly":
        return now.weekday() == 0
    if period == "monthly":
        return now.day == 1
    return False


async def build_matching_snapshot(tdb) -> dict:
    """Cross matching: best client per available unit + best unit per active client."""
    from routes.crm_routes import score_unit_for_client

    units = await tdb.crm_units.find({"status": "available"}, {"_id": 0, "photos": 0}).to_list(2000)
    clients = await tdb.crm_clients.find({"status": {"$nin": ["won", "lost"]}}, {"_id": 0}).to_list(2000)
    unit_matches = []
    for u in units:
        best = max(((score_unit_for_client(u, c), c) for c in clients), key=lambda x: x[0], default=(0, None))
        if best[0] > 0:
            unit_matches.append({"unit_code": u.get("code"), "unit_id": u["id"], "price": u.get("price"),
                                 "client_name": best[1]["name"], "client_id": best[1]["id"], "score": best[0]})
    client_matches = []
    for c in clients:
        best = max(((score_unit_for_client(u, c), u) for u in units), key=lambda x: x[0], default=(0, None))
        if best[0] > 0:
            client_matches.append({"client_name": c["name"], "client_id": c["id"],
                                   "unit_code": best[1].get("code"), "unit_id": best[1]["id"], "score": best[0]})
    return {"available_units": len(units), "active_clients": len(clients),
            "unit_matches": unit_matches, "client_matches": client_matches}


async def generate_and_store(tdb, period: str, trigger: str = "manual") -> dict:
    from utils.ids import new_id
    key = period_key(period)
    snapshot = await build_matching_snapshot(tdb)
    doc = {
        "id": new_id(), "period": period, "period_key": key, "trigger": trigger,
        "generated_at": datetime.now(timezone.utc).isoformat(), **snapshot,
    }
    await tdb.crm_reports.replace_one({"period_key": key}, doc, upsert=True)
    doc.pop("_id", None)
    return doc


async def _notify_telegram(tdb, doc: dict) -> None:
    try:
        from services.telegram_daily import send_telegram
        from services.crypto_fields import decrypt_field as _df
        st = await tdb.store_settings.find_one(
            {}, {"_id": 0, "telegram_bot_token": 1, "telegram_chat_id": 1, "telegram_daily_enabled": 1})
        if not st or not st.get("telegram_daily_enabled"):
            return
        token = (_df(st.get("telegram_bot_token") or "") or "").strip()
        chat = (st.get("telegram_chat_id") or "").strip()
        if not token or not chat:
            return
        kind = "أسبوعي" if doc["period"] == "weekly" else "شهري"
        text = (
            f"📊 تقرير المطابقة العقاري {kind}\n"
            f"🏠 وحدات متاحة: {doc['available_units']} · 👥 عملاء نشطون: {doc['active_clients']}\n"
            f"🔗 مطابقات وحدات: {len(doc['unit_matches'])} · مطابقات عملاء: {len(doc['client_matches'])}"
        )
        await send_telegram(token, chat, text)
    except Exception as exc:  # noqa: BLE001
        logger.warning("crm report telegram notify failed: %s", exc)


async def _cycle(main_db, get_tenant_db) -> None:
    now = datetime.now(ALGIERS)
    for period in ("weekly", "monthly"):
        if not is_report_due(period, now):
            continue
        key = period_key(period, now)
        async for tenant in main_db.saas_tenants.find({}, {"_id": 0, "id": 1}):
            try:
                tdb = get_tenant_db(tenant["id"])
                has_crm = await tdb.crm_clients.estimated_document_count() or await tdb.crm_units.estimated_document_count()
                if not has_crm:
                    continue
                if await tdb.crm_reports.find_one({"period_key": key}):
                    continue  # already generated this period
                doc = await generate_and_store(tdb, period, trigger="auto")
                await _notify_telegram(tdb, doc)
                logger.info("crm %s report generated for tenant %s", period, tenant["id"])
            except Exception:  # noqa: BLE001
                logger.exception("crm report cycle failed for tenant %s", tenant.get("id"))


def start_crm_reports_scheduler(main_db, get_tenant_db) -> None:
    """Start the weekly/monthly CRM matching-report loop (idempotent)."""
    async def _loop():
        await asyncio.sleep(180)  # إقلاع هادئ
        while True:
            try:
                await _cycle(main_db, get_tenant_db)
            except Exception:  # noqa: BLE001
                logger.exception("crm reports cycle failed")
            await asyncio.sleep(CHECK_INTERVAL)

    asyncio.create_task(_loop())
    logger.info("CRM matching-report scheduler started (Mon/1st 08:00 Algiers)")
