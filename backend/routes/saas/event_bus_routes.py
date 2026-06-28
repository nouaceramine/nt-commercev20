"""Saas-Admin Event Bus Observability Routes (Phase 4).

Exposes the Redis event-bus state + the centralised processed_events audit log
through a small REST surface. Powers the `/saas-admin/event-bus` dashboard
(DLQ, retries, processed events, real-time stream length).

All endpoints are super-admin gated.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query

from config.database import main_db
from routes.saas.helpers import get_super_admin
from services.event_bus import event_bus, PROCESSED_COLLECTION

router = APIRouter(prefix="/admin/event-bus", tags=["saas-event-bus"])


@router.get("/stats")
async def event_bus_stats(_admin: dict = Depends(get_super_admin)):
    """Live stream metrics + audit-log aggregates."""
    info = await event_bus.stream_info()

    # Aggregate by status (last 24h)
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    pipeline = [
        {"$match": {"started_at": {"$gte": since}}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    by_status: dict[str, int] = {"ok": 0, "failed": 0, "dlq": 0, "processing": 0}
    async for row in main_db[PROCESSED_COLLECTION].aggregate(pipeline):
        by_status[row["_id"]] = row["count"]

    # Top event types
    pipeline_types = [
        {"$match": {"started_at": {"$gte": since}}},
        {"$group": {"_id": "$event_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    by_type = []
    async for row in main_db[PROCESSED_COLLECTION].aggregate(pipeline_types):
        by_type.append({"event_type": row["_id"], "count": row["count"]})

    return {
        **info,
        "last_24h": by_status,
        "top_event_types": by_type,
    }


@router.get("/processed")
async def list_processed_events(
    status: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    tenant_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    _admin: dict = Depends(get_super_admin),
):
    q: dict = {}
    if status:
        q["status"] = status
    if event_type:
        q["event_type"] = event_type
    if tenant_id:
        q["tenant_id"] = tenant_id
    cursor = main_db[PROCESSED_COLLECTION].find(q, {"_id": 0}).sort("started_at", -1).limit(limit)
    return await cursor.to_list(limit)


@router.post("/replay/{event_id}")
async def replay_event(event_id: str, _admin: dict = Depends(get_super_admin)):
    """Re-publish an event that was sent to DLQ. The processed_events doc is
    deleted first so idempotency doesn't short-circuit the retry."""
    doc = await main_db[PROCESSED_COLLECTION].find_one({"event_id": event_id}, {"_id": 0})
    if not doc:
        return {"ok": False, "error": "event not found"}
    await main_db[PROCESSED_COLLECTION].delete_one({"event_id": event_id})
    new_id = await event_bus.publish(
        doc["event_type"],
        doc.get("payload_snapshot") or {},
        doc.get("tenant_id", "platform"),
        correlation_id=doc.get("correlation_id"),
        source="replay",
    )
    return {"ok": True, "replayed_as": new_id}


@router.get("/dlq")
async def list_dlq(limit: int = Query(50, ge=1, le=500), _admin: dict = Depends(get_super_admin)):
    cursor = main_db[PROCESSED_COLLECTION].find({"status": "dlq"}, {"_id": 0}).sort("started_at", -1).limit(limit)
    return await cursor.to_list(limit)


@router.get("/movements")
async def list_inventory_movements(
    tenant_id: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    _admin: dict = Depends(get_super_admin),
):
    """WMS-Lite movement audit — read the cross-tenant inventory_movements
    collection populated by the event consumers."""
    q: dict = {}
    if tenant_id:
        q["tenant_id"] = tenant_id
    if event_type:
        q["event_type"] = event_type
    cursor = main_db.inventory_movements.find(q, {"_id": 0}).sort("created_at", -1).limit(limit)
    return await cursor.to_list(limit)


__all__ = ["router"]
