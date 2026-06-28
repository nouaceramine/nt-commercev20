"""Unified Event Schema for Event-Driven Architecture (EDA).

This module defines the canonical Pydantic models used by every event that
flows through the Redis Streams event bus.

Spec reference: Event_Driven_Sync_System_Requirements.docx

Event shape (everything is a flat dict on the wire because Redis Streams
fields must be primitive — we JSON-encode the payload+metadata fields):

    {
        "event_id":     "uuid",
        "event_type":   "purchase.created",
        "tenant_id":    "uuid|platform",
        "payload":      { ... domain-specific ... },
        "metadata": {
            "correlation_id": "uuid",   # links related events in a saga
            "version":        1,        # schema version for forward-compat
            "priority":       "normal", # low|normal|high|critical
            "retries":        0,        # incremented by consumer on retry
            "source":         "purchase_routes",
            "created_at":     "isoformat-utc",
        }
    }
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Optional
import uuid

from pydantic import BaseModel, Field


# Canonical event types — keep this list in sync with consumer handlers.
# Naming convention: <domain>.<past-tense-action>
EventType = Literal[
    # Platform supplier finance
    "purchase.created",
    "purchase.deleted",
    "purchase.codes_uploaded",
    # Tenant POS
    "sale.completed",
    "sale.refunded",
    # E-commerce hub
    "ecom_order.confirmed",
    "ecom_order.cancelled",
    # Tenant subscription
    "tenant.subscription.expired",
    "tenant.subscription.renewed",
    # Inventory (consumer-emitted on stock change for audit downstream)
    "inventory.adjusted",
    # Generic — for future use
    "test.ping",
]


Priority = Literal["low", "normal", "high", "critical"]


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class EventMetadata(BaseModel):
    correlation_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    version: int = 1
    priority: Priority = "normal"
    retries: int = 0
    source: str = ""
    created_at: str = Field(default_factory=_utc_now_iso)


class Event(BaseModel):
    """Canonical event envelope. Every published event must conform."""
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_type: str  # one of EventType — kept as `str` to allow forward-compat
    tenant_id: str = "platform"  # 'platform' for cross-tenant events
    payload: dict[str, Any] = Field(default_factory=dict)
    metadata: EventMetadata = Field(default_factory=EventMetadata)

    def to_wire(self) -> dict[str, str]:
        """Serialize for Redis XADD — all values must be strings."""
        import json
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "tenant_id": self.tenant_id,
            "payload": json.dumps(self.payload, default=str),
            "metadata": json.dumps(self.metadata.model_dump(), default=str),
        }

    @classmethod
    def from_wire(cls, fields: dict[str, Any]) -> "Event":
        """Deserialize from Redis XREAD response."""
        import json
        payload_raw = fields.get("payload", "{}")
        metadata_raw = fields.get("metadata", "{}")
        return cls(
            event_id=fields.get("event_id", str(uuid.uuid4())),
            event_type=fields.get("event_type", "test.ping"),
            tenant_id=fields.get("tenant_id", "platform"),
            payload=json.loads(payload_raw) if isinstance(payload_raw, str) else payload_raw,
            metadata=EventMetadata(**(json.loads(metadata_raw) if isinstance(metadata_raw, str) else metadata_raw)),
        )


class ProcessedEvent(BaseModel):
    """Audit-log/idempotency record stored in MongoDB `processed_events`."""
    event_id: str
    event_type: str
    tenant_id: str
    status: Literal["processing", "ok", "failed", "dlq"] = "processing"
    consumer: str = ""
    attempts: int = 0
    error_log: Optional[str] = None
    started_at: str = Field(default_factory=_utc_now_iso)
    finished_at: Optional[str] = None
    correlation_id: Optional[str] = None
    payload_snapshot: Optional[dict[str, Any]] = None


__all__ = ["Event", "EventMetadata", "ProcessedEvent", "EventType", "Priority"]
