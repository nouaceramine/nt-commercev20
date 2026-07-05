"""RedisEventBus — async event bus on top of Redis Streams.

Why Redis Streams?
  • Persistent log with consumer groups → at-least-once delivery + DLQ.
  • Already part of the stack (REDIS_URL env).
  • XADD is O(1), XREADGROUP supports pending/ack/claim — perfect for saga.

Topology:
  STREAM_KEY            = 'nt:events'            (main stream — all events fan in)
  GROUP_NAME            = 'nt:workers'           (single consumer group; scale horizontally by adding consumers)
  DLQ_STREAM            = 'nt:events:dlq'        (after MAX_RETRIES, the event is XADDed here for manual review)
  PROCESSED_COLLECTION  = 'processed_events'     (Mongo — idempotency + audit log)

Publish path:
    bus.publish(event_type, payload, tenant_id, **meta) → returns event_id

Consume path (started in main.py startup):
    asyncio.create_task(bus.consume_loop(handler_registry))

The handler registry is `{event_type: async fn(event, db_main, db_tenant_helper)}`.
A handler raising will:
  1. Increment `metadata.retries`.
  2. Re-XADD to main stream (back-pressure: capped by MAX_RETRIES).
  3. If retries exhausted → write to DLQ stream + mark processed_events.status='dlq'.

Idempotency:
  Before invoking any handler, the bus inserts a doc in `processed_events`
  with status='processing'. If that insert fails on duplicate event_id, we
  ACK and skip — the event has already been handled by another consumer.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import socket
from datetime import datetime, timezone
from typing import Awaitable, Callable, Optional

from models.events import Event, ProcessedEvent

log = logging.getLogger("event_bus")

STREAM_KEY = os.environ.get("EVENT_STREAM_KEY", "nt:events")
GROUP_NAME = os.environ.get("EVENT_STREAM_GROUP", "nt:workers")
DLQ_STREAM = os.environ.get("EVENT_DLQ_STREAM", "nt:events:dlq")
MAX_RETRIES = int(os.environ.get("EVENT_MAX_RETRIES", "3"))
BLOCK_MS = int(os.environ.get("EVENT_BLOCK_MS", "5000"))
BATCH = int(os.environ.get("EVENT_BATCH", "16"))

# Mongo collection for idempotency + audit
PROCESSED_COLLECTION = "processed_events"

# Type alias for an event handler. Receives the Event; may raise for retry.
Handler = Callable[[Event], Awaitable[None]]


class RedisEventBus:
    """Async event bus. Singleton — import `event_bus` from this module."""

    def __init__(self, redis_url: Optional[str] = None) -> None:
        self._url = redis_url or os.environ.get("REDIS_URL", "")
        self._client = None
        self._handlers: dict[str, list[Handler]] = {}
        self._db = None  # main_db, set during start()
        self._consumer_name = f"{socket.gethostname()}-{os.getpid()}"
        self._running = False
        self._broken = False

    # ── Setup ────────────────────────────────────────────────────────────
    async def _get_client(self):
        if self._client is not None:
            return self._client
        if not self._url:
            log.warning("REDIS_URL not set — event bus disabled")
            self._broken = True
            return None
        try:
            import redis.asyncio as redis_async  # type: ignore
            self._client = redis_async.from_url(
                self._url,
                decode_responses=True,
                socket_timeout=(BLOCK_MS / 1000) + 5.0,
                socket_connect_timeout=2.0,
            )
            await self._client.ping()
            return self._client
        except Exception as exc:
            log.warning("Redis event bus init failed: %s — bus disabled", exc)
            self._broken = True
            return None

    async def _ensure_group(self) -> bool:
        """Create consumer group if missing. Idempotent."""
        c = await self._get_client()
        if c is None:
            return False
        try:
            await c.xgroup_create(STREAM_KEY, GROUP_NAME, id="0", mkstream=True)
            log.info("Created consumer group %s on %s", GROUP_NAME, STREAM_KEY)
        except Exception as exc:
            if "BUSYGROUP" in str(exc):
                pass  # already exists — ok
            else:
                log.warning("xgroup_create failed: %s", exc)
                return False
        return True

    def register(self, event_type: str, handler: Handler) -> None:
        """Register an async handler for an event type."""
        self._handlers.setdefault(event_type, []).append(handler)
        log.info("Registered handler %s for %s", handler.__name__, event_type)

    # ── Publish ──────────────────────────────────────────────────────────
    async def publish(
        self,
        event_type: str,
        payload: dict,
        tenant_id: str = "platform",
        *,
        correlation_id: Optional[str] = None,
        priority: str = "normal",
        source: str = "",
    ) -> Optional[str]:
        """Publish an event. Returns event_id on success, None on failure
        (Redis unavailable). The application MUST treat failure as non-fatal
        — that's the whole point of dual-write."""
        from models.events import EventMetadata
        meta = EventMetadata(
            correlation_id=correlation_id or "",
            priority=priority,  # type: ignore[arg-type]
            source=source,
        )
        if not meta.correlation_id:
            import uuid
            meta.correlation_id = str(uuid.uuid4())
        event = Event(
            event_type=event_type,
            tenant_id=tenant_id,
            payload=payload,
            metadata=meta,
        )
        c = await self._get_client()
        if c is None:
            log.debug("publish skipped (bus disabled): %s", event_type)
            return None
        try:
            await c.xadd(STREAM_KEY, event.to_wire(), maxlen=100_000, approximate=True)
            log.debug("Published %s id=%s", event_type, event.event_id)
            return event.event_id
        except Exception as exc:
            log.warning("publish %s failed: %s", event_type, exc)
            return None

    # ── Consume ──────────────────────────────────────────────────────────
    async def start(self, main_db) -> None:
        """Bind the bus to MongoDB & ensure consumer group exists."""
        self._db = main_db
        # Idempotency index
        try:
            await main_db[PROCESSED_COLLECTION].create_index("event_id", unique=True)
            await main_db[PROCESSED_COLLECTION].create_index("event_type")
            await main_db[PROCESSED_COLLECTION].create_index("status")
            await main_db[PROCESSED_COLLECTION].create_index("started_at")
        except Exception as exc:
            log.warning("processed_events index init failed: %s", exc)
        await self._ensure_group()

    async def consume_loop(self) -> None:
        """Main consumer loop — runs forever. Must be wrapped in asyncio.create_task."""
        if self._broken:
            log.info("event bus broken — consume_loop exiting")
            return
        self._running = True
        log.info("event bus consumer %s starting on %s/%s", self._consumer_name, STREAM_KEY, GROUP_NAME)
        c = await self._get_client()
        if c is None:
            log.warning("consume_loop: no client, exiting")
            return
        while self._running:
            try:
                # XREADGROUP blocks up to BLOCK_MS for new entries.
                resp = await c.xreadgroup(
                    GROUP_NAME, self._consumer_name,
                    {STREAM_KEY: ">"},
                    count=BATCH, block=BLOCK_MS,
                )
                if not resp:
                    continue
                for _stream, messages in resp:
                    for msg_id, fields in messages:
                        await self._handle_message(msg_id, fields)
            except asyncio.CancelledError:
                log.info("consume_loop cancelled")
                break
            except Exception as exc:
                log.exception("consume_loop iteration failed: %s", exc)
                await asyncio.sleep(1)
        log.info("consume_loop stopped")

    def stop(self) -> None:
        self._running = False

    # ── Dispatch ─────────────────────────────────────────────────────────
    async def _handle_message(self, msg_id: str, fields: dict) -> None:
        c = self._client
        try:
            event = Event.from_wire(fields)
        except Exception as exc:
            log.exception("Bad event payload at %s: %s — sending to DLQ", msg_id, exc)
            try:
                await c.xadd(DLQ_STREAM, {"raw": json.dumps(fields, default=str), "error": str(exc)})
                await c.xack(STREAM_KEY, GROUP_NAME, msg_id)
            except Exception:
                pass
            return

        # Idempotency — try to claim ownership by inserting a 'processing' doc.
        # If duplicate (UniqueError) → another consumer already processed this. ACK & skip.
        claimed = await self._claim_processing(event)
        if not claimed:
            log.debug("Skipping duplicate event %s", event.event_id)
            await c.xack(STREAM_KEY, GROUP_NAME, msg_id)
            return

        handlers = self._handlers.get(event.event_type, [])
        if not handlers:
            log.debug("No handler for %s — marking ok", event.event_type)
            await self._mark_finished(event, status="ok", consumer="<none>")
            await c.xack(STREAM_KEY, GROUP_NAME, msg_id)
            return

        # Run handlers sequentially — if any raises we retry the whole event.
        try:
            for h in handlers:
                await h(event)
            await self._mark_finished(event, status="ok", consumer=",".join(h.__name__ for h in handlers))
            await c.xack(STREAM_KEY, GROUP_NAME, msg_id)
        except Exception as exc:
            log.exception("Handler failed for %s: %s", event.event_type, exc)
            event.metadata.retries += 1
            if event.metadata.retries >= MAX_RETRIES:
                # DLQ
                try:
                    await c.xadd(DLQ_STREAM, event.to_wire(), maxlen=10_000, approximate=True)
                except Exception:
                    pass
                await self._mark_finished(event, status="dlq", consumer="dlq", error=str(exc))
                await c.xack(STREAM_KEY, GROUP_NAME, msg_id)
            else:
                # Re-publish for retry. We delete the 'processing' doc so the
                # idempotency check passes for the retry attempt.
                await self._db[PROCESSED_COLLECTION].delete_one({"event_id": event.event_id})
                try:
                    await c.xadd(STREAM_KEY, event.to_wire(), maxlen=100_000, approximate=True)
                except Exception:
                    pass
                await c.xack(STREAM_KEY, GROUP_NAME, msg_id)

    async def _claim_processing(self, event: Event) -> bool:
        if self._db is None:
            return True
        doc = ProcessedEvent(
            event_id=event.event_id,
            event_type=event.event_type,
            tenant_id=event.tenant_id,
            status="processing",
            attempts=event.metadata.retries + 1,
            correlation_id=event.metadata.correlation_id,
            payload_snapshot=event.payload,
        ).model_dump()
        try:
            await self._db[PROCESSED_COLLECTION].insert_one(doc)
            return True
        except Exception as exc:
            # Duplicate key — already processed
            if "duplicate key" in str(exc).lower() or "E11000" in str(exc):
                return False
            log.warning("claim_processing failed: %s", exc)
            return True  # don't lose the event — proceed

    async def _mark_finished(self, event: Event, *, status: str, consumer: str, error: Optional[str] = None) -> None:
        if self._db is None:
            return
        try:
            await self._db[PROCESSED_COLLECTION].update_one(
                {"event_id": event.event_id},
                {"$set": {
                    "status": status,
                    "consumer": consumer,
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                    "error_log": error,
                }},
            )
        except Exception as exc:
            log.warning("mark_finished failed: %s", exc)

    # ── Inspection helpers ──────────────────────────────────────────────
    async def stream_info(self) -> dict:
        """Return DLQ / stream metrics for observability."""
        c = await self._get_client()
        if c is None:
            return {"available": False}
        out: dict = {"available": True, "consumer": self._consumer_name}
        try:
            out["stream_len"] = await c.xlen(STREAM_KEY)
        except Exception:
            out["stream_len"] = 0
        try:
            out["dlq_len"] = await c.xlen(DLQ_STREAM)
        except Exception:
            out["dlq_len"] = 0
        try:
            pending = await c.xpending(STREAM_KEY, GROUP_NAME)
            out["pending"] = pending.get("pending", 0) if isinstance(pending, dict) else pending[0]
        except Exception:
            out["pending"] = 0
        return out


# Singleton — import from anywhere
event_bus = RedisEventBus()


__all__ = ["RedisEventBus", "event_bus", "STREAM_KEY", "GROUP_NAME", "DLQ_STREAM", "PROCESSED_COLLECTION"]
