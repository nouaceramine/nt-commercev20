# p189: Transactional Outbox — events committed atomically with the business
# operation (same MongoDB transaction, works across DBs on the replica set),
# then relayed asynchronously to the Redis Streams event bus.
#
# The outbox collection lives in main_db so a single relay drains all tenants.
# Consumers stay idempotent via processed_events, so a rare duplicate publish
# (crash between publish and mark) is harmless.
import asyncio
import logging
import uuid
from datetime import datetime, timezone, timedelta

log = logging.getLogger("outbox")

_RELAY_BATCH = 50
_RELAY_INTERVAL = 2.0

# p211: archival of published events — keeps the outbox collection light.
_ARCHIVE_DAYS = int(__import__("os").environ.get("OUTBOX_ARCHIVE_DAYS", "30"))
_ARCHIVE_INTERVAL = float(__import__("os").environ.get("OUTBOX_ARCHIVE_INTERVAL", "3600"))
_ARCHIVE_BATCH = 500


async def outbox_write(main_db, event_type: str, payload: dict, tenant_id: str,
                       source: str = "", session=None) -> str:
    """Write an event to the outbox. Pass the active transaction session so the
    event commits or aborts together with the business operation."""
    doc = {
        "id": f"evt_{uuid.uuid4().hex[:16]}",
        "event_type": event_type,
        "payload": payload,
        "tenant_id": tenant_id or "platform",
        "source": source,
        "published": False,
        "created_at": datetime.now(timezone.utc),
        "published_at": None,
    }
    await main_db.outbox.insert_one(doc, session=session)
    return doc["id"]


async def relay_pending(main_db) -> int:
    """Publish a batch of pending outbox events to the bus. Returns count.
    Multi-worker safe: each row is claimed atomically (find_one_and_update)
    before publishing; rows stuck 'in_progress' > 60s (crashed worker) are
    reclaimed."""
    from services.event_bus import event_bus
    n = 0
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=60)
    cursor = main_db.outbox.find({
        "$or": [
            {"published": False},
            {"published": "in_progress", "claimed_at": {"$lt": cutoff}},
        ]
    }).sort("created_at", 1).limit(_RELAY_BATCH)
    async for doc in cursor:
        claimed = await main_db.outbox.find_one_and_update(
            {"id": doc["id"], "published": doc["published"]},
            {"$set": {"published": "in_progress", "claimed_at": datetime.now(timezone.utc)}},
        )
        if not claimed:
            continue  # another worker took it
        try:
            eid = await event_bus.publish(
                doc["event_type"], doc["payload"],
                tenant_id=doc.get("tenant_id", "platform"),
                source=doc.get("source") or "outbox",
            )
            if eid:
                await main_db.outbox.update_one(
                    {"id": doc["id"]},
                    {"$set": {"published": True, "published_at": datetime.now(timezone.utc), "bus_event_id": eid}},
                )
                n += 1
                # p191: fan out to the SSE feed (fire-and-forget)
                try:
                    import json as _json
                    c = await event_bus._get_client()
                    if c is not None:
                        await c.publish("nt:events_feed", _json.dumps({
                            "type": doc["event_type"],
                            "tenant_id": doc.get("tenant_id", "platform"),
                            "payload": doc["payload"],
                        }, default=str))
                except Exception:
                    pass
        except Exception as exc:
            log.warning("relay %s failed: %s", doc.get("id"), exc)
    return n


async def archive_published(main_db, older_than_days: int = None) -> int:
    """p211: move old PUBLISHED outbox rows to outbox_archive. Multi-worker
    safe: each row is claimed atomically (published True → "archiving")
    before the move; rows stuck "archiving" > 10min (crashed worker) are
    reclaimed. Only fully published rows are touched — pending/in_progress
    rows never leave the outbox."""
    days = older_than_days if older_than_days is not None else _ARCHIVE_DAYS
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    stuck = datetime.now(timezone.utc) - timedelta(minutes=10)
    n = 0
    cursor = main_db.outbox.find({
        "$or": [
            {"published": True, "published_at": {"$lt": cutoff}},
            {"published": "archiving", "archiving_at": {"$lt": stuck}},
        ]
    }).limit(_ARCHIVE_BATCH)
    async for doc in cursor:
        claim_q = {"id": doc["id"], "published": doc["published"]}
        claimed = await main_db.outbox.find_one_and_update(
            claim_q, {"$set": {"published": "archiving",
                               "archiving_at": datetime.now(timezone.utc)}})
        if not claimed:
            continue  # another worker took it
        try:
            doc["archived_at"] = datetime.now(timezone.utc)
            doc["published"] = True
            doc.pop("_id", None)
            await main_db.outbox_archive.update_one(
                {"id": doc["id"]}, {"$setOnInsert": doc}, upsert=True)
            await main_db.outbox.delete_one({"id": doc["id"]})
            n += 1
        except Exception as exc:
            log.warning("archive %s failed: %s", doc.get("id"), exc)
    return n


async def _archive_loop(main_db) -> None:
    log.info("Outbox archival started (>%sd, every %.0fs)", _ARCHIVE_DAYS, _ARCHIVE_INTERVAL)
    await asyncio.sleep(60)  # let the app settle before the first sweep
    while True:
        try:
            n = await archive_published(main_db)
            if n:
                log.info("outbox archival moved %d rows", n)
        except Exception as exc:
            log.warning("archive cycle failed: %s", exc)
        await asyncio.sleep(_ARCHIVE_INTERVAL)


async def _relay_loop(main_db) -> None:
    log.info("Outbox relay started (interval %.1fs)", _RELAY_INTERVAL)
    while True:
        try:
            await relay_pending(main_db)
        except Exception as exc:
            log.warning("relay cycle failed: %s", exc)
        await asyncio.sleep(_RELAY_INTERVAL)


def start_outbox_relay(main_db) -> None:
    asyncio.create_task(_relay_loop(main_db))
    asyncio.create_task(_archive_loop(main_db))  # p211
