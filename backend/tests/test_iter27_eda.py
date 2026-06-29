"""Iter 27 — Event-Driven Architecture (EDA) test suite.

Covers all 4 phases of the EDA transition:
  Phase 1: Bus infrastructure (publish/consume/idempotency/DLQ)
  Phase 2: purchase.created consumer pipeline
  Phase 3: sale.completed, ecom_order.confirmed, tenant.subscription.expired
  Phase 4: /admin/event-bus observability endpoints

These tests exercise the live FastAPI app via httpx — they assume:
  • Backend is running on localhost:8001
  • Redis is up on REDIS_URL
  • Super-admin credentials in /app/memory/test_credentials.md
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import uuid

import pytest
import pytest_asyncio
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from models.events import Event, EventMetadata, ProcessedEvent
from services.event_bus import RedisEventBus, STREAM_KEY, GROUP_NAME, PROCESSED_COLLECTION


# ──────────────────────────────────────────────────────────────────────
# Unit tests — Event schema
# ──────────────────────────────────────────────────────────────────────
class TestEventSchema:
    def test_event_default_factory(self):
        e = Event(event_type="test.ping")
        assert e.event_id  # uuid
        assert e.tenant_id == "platform"
        assert e.metadata.version == 1
        assert e.metadata.retries == 0
        assert e.metadata.priority == "normal"

    def test_wire_roundtrip(self):
        e = Event(
            event_type="purchase.created",
            tenant_id="t123",
            payload={"purchase_id": "p1", "total_cost": 1234.5, "items": [{"q": 1}]},
        )
        wire = e.to_wire()
        # All values are strings (Redis Streams requirement)
        assert all(isinstance(v, str) for v in wire.values())
        # Round-trip
        e2 = Event.from_wire(wire)
        assert e2.event_id == e.event_id
        assert e2.event_type == e.event_type
        assert e2.tenant_id == e.tenant_id
        assert e2.payload["purchase_id"] == "p1"
        assert e2.payload["total_cost"] == 1234.5
        assert e2.metadata.version == 1

    def test_processed_event_schema(self):
        p = ProcessedEvent(event_id="e1", event_type="x.y", tenant_id="t1")
        assert p.status == "processing"
        assert p.attempts == 0
        d = p.model_dump()
        assert "started_at" in d
        assert "finished_at" in d


# ──────────────────────────────────────────────────────────────────────
# Integration tests — Redis bus end-to-end
# ──────────────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def bus():
    from motor.motor_asyncio import AsyncIOMotorClient
    redis_url = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/0")
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "test_db")
    assert mongo_url, "MONGO_URL required"
    client = AsyncIOMotorClient(mongo_url)
    main_db = client[db_name]
    # Use a private stream key so this test doesn't pollute live nt:events
    test_stream = f"nt:test:{uuid.uuid4().hex[:8]}"
    os.environ["EVENT_STREAM_KEY"] = test_stream
    # Need to reload the module-level constant — easier: build a custom bus
    b = RedisEventBus(redis_url=redis_url)
    # Patch stream key on the instance via module override
    import services.event_bus as eb_mod
    original_key = eb_mod.STREAM_KEY
    eb_mod.STREAM_KEY = test_stream
    await b.start(main_db)
    yield b, main_db, test_stream
    # Cleanup
    eb_mod.STREAM_KEY = original_key
    try:
        c = await b._get_client()
        if c:
            await c.delete(test_stream)
    except Exception:
        pass
    client.close()


@pytest.mark.asyncio
async def test_publish_and_consume_basic(bus):
    b, main_db, stream = bus
    received: list[Event] = []

    async def capture(event: Event):
        received.append(event)

    b.register("test.ping", capture)
    eid = await b.publish("test.ping", {"hello": "world"}, tenant_id="tA", source="pytest")
    assert eid

    # Run a single iteration of the consumer for ~2s
    task = asyncio.create_task(b.consume_loop())
    await asyncio.sleep(2.0)
    b.stop()
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

    assert len(received) >= 1
    ev = received[0]
    assert ev.event_type == "test.ping"
    assert ev.payload.get("hello") == "world"
    assert ev.tenant_id == "tA"

    # Check processed_events audit row
    doc = await main_db[PROCESSED_COLLECTION].find_one({"event_id": eid}, {"_id": 0})
    assert doc is not None
    assert doc["status"] == "ok"
    # Cleanup
    await main_db[PROCESSED_COLLECTION].delete_one({"event_id": eid})


@pytest.mark.asyncio
async def test_idempotency_duplicate_event_id(bus):
    b, main_db, _stream = bus
    # Manually insert a 'processing' row first
    eid = str(uuid.uuid4())
    await main_db[PROCESSED_COLLECTION].insert_one({
        "event_id": eid, "event_type": "test.ping", "tenant_id": "tX", "status": "ok",
    })
    e = Event(event_id=eid, event_type="test.ping", tenant_id="tX", payload={})
    claimed = await b._claim_processing(e)
    assert claimed is False  # Duplicate detected
    await main_db[PROCESSED_COLLECTION].delete_one({"event_id": eid})


@pytest.mark.asyncio
async def test_retry_on_handler_failure(bus):
    b, main_db, _stream = bus
    attempts = {"n": 0}

    async def failing(event: Event):
        attempts["n"] += 1
        raise RuntimeError("intentional failure")

    b.register("test.ping", failing)
    eid = await b.publish("test.ping", {"x": 1}, tenant_id="retryTest")

    task = asyncio.create_task(b.consume_loop())
    await asyncio.sleep(4.0)  # Allow 3 retries
    b.stop()
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

    # Should have attempted ≥1 time (DLQ after MAX_RETRIES=3)
    assert attempts["n"] >= 1
    # Cleanup any audit rows
    await main_db[PROCESSED_COLLECTION].delete_many({"event_id": eid})


# Helper: per-test fresh clients (the singleton event_bus._client is bound to
# the backend's loop and won't work cross-loop in tests).
def _fresh_clients():
    from motor.motor_asyncio import AsyncIOMotorClient
    import redis.asyncio as redis_async
    mongo = AsyncIOMotorClient(os.environ["MONGO_URL"])
    main_db = mongo[os.environ.get("DB_NAME", "test_db")]
    redis_url = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/0")
    r = redis_async.from_url(redis_url, decode_responses=True)
    return mongo, main_db, r


async def _publish_raw(redis_client, event_type: str, payload: dict, tenant_id: str = "platform") -> str:
    """Publish directly to the live stream without using the singleton bus."""
    e = Event(event_type=event_type, tenant_id=tenant_id, payload=payload, metadata=EventMetadata(source="pytest"))
    await redis_client.xadd(STREAM_KEY, e.to_wire(), maxlen=100_000, approximate=True)
    return e.event_id


# ──────────────────────────────────────────────────────────────────────
# Phase-specific consumer tests (against live event_bus singleton)
# ──────────────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_purchase_created_consumer_writes_movement():
    """Publish purchase.created → expect an inventory_movements row."""
    mongo, main_db, r = _fresh_clients()
    try:
        purchase_id = f"test-pur-{uuid.uuid4().hex[:8]}"
        eid = await _publish_raw(r, "purchase.created", {
            "purchase_id": purchase_id,
            "supplier_id": "sup1",
            "total_cost": 500,
            "items": [{"type": "card", "quantity": 10}, {"type": "sim", "quantity": 5}],
        })
        row = None
        for _ in range(20):
            await asyncio.sleep(0.5)
            row = await main_db.inventory_movements.find_one({"id": eid}, {"_id": 0})
            if row:
                break
        assert row is not None, "consumer didn't write inventory_movements"
        assert row["event_type"] == "purchase.created"
        assert row["by_type"]["card"] == 10
        await main_db.inventory_movements.delete_one({"id": eid})
        await main_db[PROCESSED_COLLECTION].delete_many({"event_id": eid})
    finally:
        try:
            await r.aclose()
        except AttributeError:
            await r.close()
        mongo.close()


@pytest.mark.asyncio
async def test_sale_completed_consumer_writes_movement():
    mongo, main_db, r = _fresh_clients()
    try:
        sale_id = f"test-sale-{uuid.uuid4().hex[:8]}"
        eid = await _publish_raw(r, "sale.completed", {
            "sale_id": sale_id, "total": 250.5, "items": [{"product_id": "p1", "quantity": 2}],
        }, tenant_id="tenantTest")
        row = None
        for _ in range(20):
            await asyncio.sleep(0.5)
            row = await main_db.inventory_movements.find_one({"id": eid}, {"_id": 0})
            if row:
                break
        assert row is not None
        assert row["sale_id"] == sale_id
        await main_db.inventory_movements.delete_one({"id": eid})
        await main_db[PROCESSED_COLLECTION].delete_many({"event_id": eid})
    finally:
        try:
            await r.aclose()
        except AttributeError:
            await r.close()
        mongo.close()


@pytest.mark.asyncio
async def test_ecom_order_confirmed_deducts_stock_idempotent():
    """Publish ecom_order.confirmed twice → stock deducted exactly once via _eda_stock_deducted flag."""
    from config.database import get_tenant_db
    mongo, main_db, r = _fresh_clients()
    try:
        tenant_id = "ecomtest_" + uuid.uuid4().hex[:6]
        # Tenant DB lives on same Mongo cluster; use fresh client's database lookup
        tdb_name = f"tenant_{tenant_id.replace('-', '_')}"
        tdb = mongo[tdb_name]
        pid = "prod-" + uuid.uuid4().hex[:6]
        oid = "ord-" + uuid.uuid4().hex[:6]
        await tdb.products.insert_one({"id": pid, "name": "T", "stock": 50})
        await tdb.ecom_orders.insert_one({"id": oid, "status": "confirmed"})

        eid1 = await _publish_raw(r, "ecom_order.confirmed", {
            "order_id": oid, "items": [{"product_id": pid, "quantity": 3}],
        }, tenant_id=tenant_id)
        eid2 = await _publish_raw(r, "ecom_order.confirmed", {
            "order_id": oid, "items": [{"product_id": pid, "quantity": 3}],
        }, tenant_id=tenant_id)

        prod = None
        for _ in range(20):
            await asyncio.sleep(0.5)
            flag = await tdb.ecom_orders.find_one({"id": oid}, {"_id": 0, "_eda_stock_deducted": 1})
            if flag and flag.get("_eda_stock_deducted"):
                prod = await tdb.products.find_one({"id": pid}, {"_id": 0, "stock": 1})
                break
        assert prod is not None, "deduction flag never set"
        assert prod["stock"] == 47, f"Expected 47, got {prod['stock']}"
        # Cleanup
        await mongo.drop_database(tdb_name)
        await main_db.inventory_movements.delete_many({"id": {"$in": [eid1, eid2]}})
        await main_db[PROCESSED_COLLECTION].delete_many({"event_id": {"$in": [eid1, eid2]}})
    finally:
        try:
            await r.aclose()
        except AttributeError:
            await r.close()
        mongo.close()


@pytest.mark.asyncio
async def test_tenant_subscription_expired_disables_tenant():
    mongo, main_db, r = _fresh_clients()
    try:
        tid = "exptest_" + uuid.uuid4().hex[:6]
        await main_db.saas_tenants.insert_one({
            "id": tid, "name": "Test Co", "email": "noreply@example.com",
            "subscription_status": "active", "is_active": True,
        })
        eid = await _publish_raw(r, "tenant.subscription.expired", {}, tenant_id=tid)
        row = None
        for _ in range(20):
            await asyncio.sleep(0.5)
            row = await main_db.saas_tenants.find_one(
                {"id": tid}, {"_id": 0, "subscription_status": 1, "is_active": 1},
            )
            if row and row.get("subscription_status") == "expired":
                break
        assert row is not None
        assert row["subscription_status"] == "expired"
        assert row["is_active"] is False
        await main_db.saas_tenants.delete_one({"id": tid})
        await main_db.inventory_movements.delete_many({"id": eid})
        await main_db[PROCESSED_COLLECTION].delete_many({"event_id": eid})
    finally:
        try:
            await r.aclose()
        except AttributeError:
            await r.close()
        mongo.close()


# ──────────────────────────────────────────────────────────────────────
# HTTP integration tests — Phase 4 observability endpoints
# ──────────────────────────────────────────────────────────────────────
import httpx

BASE_URL = os.environ.get("BACKEND_BASE", "http://127.0.0.1:8001")
ADMIN_EMAIL = "admin@ntcommerce.com"
ADMIN_PASS = "Admin@2024"


@pytest_asyncio.fixture(scope="module")
async def admin_token():
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10) as c:
        r = await c.post("/api/saas-admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
        if r.status_code != 200:
            # Some installs use /api/auth/login
            r = await c.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
        r.raise_for_status()
        data = r.json()
        token = data.get("access_token") or data.get("token") or (data.get("data") or {}).get("token")
        assert token, f"no token in response: {data}"
        return token


@pytest.mark.asyncio
async def test_event_bus_stats_endpoint(admin_token):
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10) as c:
        r = await c.get("/api/admin/event-bus/stats", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "available" in body
        assert "last_24h" in body
        assert "top_event_types" in body


@pytest.mark.asyncio
async def test_event_bus_processed_endpoint(admin_token):
    # First push a test ping so there's data
    mongo, main_db, r = _fresh_clients()
    try:
        eid = await _publish_raw(r, "test.ping", {"src": "endpoint-test"}, tenant_id="platform")
        await asyncio.sleep(2)
        async with httpx.AsyncClient(base_url=BASE_URL, timeout=10) as c:
            resp = await c.get("/api/admin/event-bus/processed?limit=10", headers={"Authorization": f"Bearer {admin_token}"})
            assert resp.status_code == 200, resp.text
            rows = resp.json()
            assert isinstance(rows, list)
        await main_db[PROCESSED_COLLECTION].delete_many({"event_id": eid})
        await main_db.inventory_movements.delete_many({"id": eid})
    finally:
        try:
            await r.aclose()
        except AttributeError:
            await r.close()
        mongo.close()


@pytest.mark.asyncio
async def test_event_bus_movements_endpoint(admin_token):
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10) as c:
        r = await c.get("/api/admin/event-bus/movements?limit=5", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)
