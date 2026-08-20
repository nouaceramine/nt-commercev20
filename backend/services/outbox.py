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
