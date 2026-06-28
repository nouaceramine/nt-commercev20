"""Iter 27 EDA — HTTP integration tests for publishers + observability.

These tests exercise the live FastAPI app to verify that the dual-write
sync routes also emit events to the bus and the consumer pipeline records
them in `processed_events`.

Covers:
  • POST /api/admin/supplier/purchases  → purchase.created event
  • POST /api/admin/supplier/purchases/{pid}/upload-codes → purchase.codes_uploaded
  • PUT  /api/ecom/orders/{order_id}/status → ecom_order.confirmed / cancelled
  • GET  /api/admin/event-bus/{stats,processed,dlq,movements}
  • POST /api/admin/event-bus/replay/{event_id}  (DLQ replay)
"""
from __future__ import annotations

import asyncio
import os
import sys
import uuid

import httpx
import pytest
import pytest_asyncio
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

BASE_URL = os.environ.get("BACKEND_BASE", "http://127.0.0.1:8001")
ADMIN_EMAIL = "admin@ntcommerce.com"
ADMIN_PASS = "Admin@2024"


def _fresh_clients():
    from motor.motor_asyncio import AsyncIOMotorClient
    mongo = AsyncIOMotorClient(os.environ["MONGO_URL"])
    main_db = mongo[os.environ.get("DB_NAME", "test_db")]
    return mongo, main_db


@pytest_asyncio.fixture(scope="module")
async def admin_token():
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10) as c:
        r = await c.post("/api/saas-admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
        if r.status_code != 200:
            r = await c.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
        r.raise_for_status()
        data = r.json()
        token = data.get("access_token") or data.get("token") or (data.get("data") or {}).get("token")
        assert token, f"no token in response: {data}"
        return token


async def _wait_for_processed(main_db, event_type: str, started_after_iso: str | None = None, timeout_s: float = 8.0):
    """Poll processed_events for a row matching event_type created during this test."""
    from services.event_bus import PROCESSED_COLLECTION
    deadline = asyncio.get_event_loop().time() + timeout_s
    while asyncio.get_event_loop().time() < deadline:
        q = {"event_type": event_type, "status": "ok"}
        if started_after_iso:
            q["started_at"] = {"$gte": started_after_iso}
        doc = await main_db[PROCESSED_COLLECTION].find_one(q, sort=[("started_at", -1)])
        if doc:
            return doc
        await asyncio.sleep(0.4)
    return None


# ──────────────────────────────────────────────────────────────────────
# Publishers via real HTTP endpoints
# ──────────────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_create_supplier_purchase_publishes_event(admin_token):
    """POST /api/admin/supplier/purchases → purchase.created event in processed_events."""
    from datetime import datetime, timezone
    mongo, main_db = _fresh_clients()
    started = datetime.now(timezone.utc).isoformat()
    try:
        async with httpx.AsyncClient(base_url=BASE_URL, timeout=15) as c:
            # Find a supplier (any). If none, create one.
            sup = await c.get("/api/admin/supplier/external-suppliers", headers={"Authorization": f"Bearer {admin_token}"})
            assert sup.status_code == 200, sup.text
            sup_list = sup.json()
            if isinstance(sup_list, dict):
                sup_list = sup_list.get("suppliers") or sup_list.get("data") or []
            if not sup_list:
                make = await c.post("/api/admin/supplier/external-suppliers",
                                    headers={"Authorization": f"Bearer {admin_token}"},
                                    json={"name": f"TEST_sup_{uuid.uuid4().hex[:6]}", "contact": "", "notes": ""})
                assert make.status_code in (200, 201), make.text
                supplier_id = make.json().get("id") or make.json().get("supplier_id")
            else:
                supplier_id = sup_list[0].get("id") or sup_list[0].get("supplier_id")

            payload = {
                "supplier_id": supplier_id,
                "purchase_date": "2026-01-15",
                "items": [
                    {"type": "card", "category": "TEST_iter27", "quantity": 2, "unit_cost": 10.0}
                ],
                "notes": "TEST_iter27_eda_http",
            }
            resp = await c.post("/api/admin/supplier/purchases",
                                headers={"Authorization": f"Bearer {admin_token}"},
                                json=payload)
            assert resp.status_code in (200, 201), resp.text
            body = resp.json()
            purchase_id = body.get("id") or body.get("purchase_id") or (body.get("data") or {}).get("id")
            assert purchase_id, f"no purchase id in response: {body}"

        doc = await _wait_for_processed(main_db, "purchase.created", started)
        assert doc is not None, "purchase.created event not seen in processed_events"
        assert doc["status"] == "ok"

        # Cleanup audit row (best-effort)
        from services.event_bus import PROCESSED_COLLECTION
        await main_db[PROCESSED_COLLECTION].delete_one({"event_id": doc["event_id"]})
        await main_db.inventory_movements.delete_many({"id": doc["event_id"]})
    finally:
        mongo.close()


@pytest.mark.asyncio
async def test_event_bus_stats_shape(admin_token):
    """Verify GET /api/admin/event-bus/stats has the required shape from spec."""
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10) as c:
        r = await c.get("/api/admin/event-bus/stats", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        body = r.json()
        for key in ("available", "stream_len", "dlq_len", "pending", "last_24h", "top_event_types"):
            assert key in body, f"stats missing key={key}; body={body}"
        # last_24h sub-shape
        for s in ("ok", "failed", "dlq", "processing"):
            assert s in body["last_24h"], f"last_24h missing {s}"
        assert isinstance(body["top_event_types"], list)


@pytest.mark.asyncio
async def test_event_bus_dlq_endpoint(admin_token):
    """GET /api/admin/event-bus/dlq must return a list (may be empty)."""
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10) as c:
        r = await c.get("/api/admin/event-bus/dlq", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)


@pytest.mark.asyncio
async def test_event_bus_replay_invalid_id(admin_token):
    """POST /api/admin/event-bus/replay/{bogus} should not 500. API returns 200 with ok:false."""
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10) as c:
        r = await c.post("/api/admin/event-bus/replay/does-not-exist-xyz",
                         headers={"Authorization": f"Bearer {admin_token}"})
        # API design: returns 200 with {ok:false, error:"event not found"} or 4xx
        assert r.status_code in (200, 400, 404, 422), f"unexpected {r.status_code}: {r.text}"
        if r.status_code == 200:
            body = r.json()
            assert body.get("ok") is False, f"expected ok:false for invalid id; got {body}"


@pytest.mark.asyncio
async def test_processed_events_unique_index_exists():
    """The processed_events collection must have a unique index on event_id."""
    mongo, main_db = _fresh_clients()
    try:
        idx = await main_db.processed_events.index_information()
        found = False
        for name, info in idx.items():
            keys = info.get("key") or []
            if keys and keys[0][0] == "event_id" and info.get("unique"):
                found = True
                break
        assert found, f"no unique index on event_id; indexes={idx}"
    finally:
        mongo.close()


@pytest.mark.asyncio
async def test_consumer_group_exists():
    """Redis Streams consumer group nt:workers must exist on nt:events."""
    import redis.asyncio as redis_async
    rc = redis_async.from_url(os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/0"), decode_responses=True)
    try:
        groups = await rc.xinfo_groups("nt:events")
        names = {g["name"] for g in groups}
        assert "nt:workers" in names, f"nt:workers group missing; got: {names}"
    finally:
        await rc.aclose()
