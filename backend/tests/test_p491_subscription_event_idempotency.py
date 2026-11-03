from types import SimpleNamespace

import pytest

from models.events import Event
from services import event_consumers


class IdempotentCollection:
    def __init__(self):
        self.docs = {}

    async def update_one(self, query, update, upsert=False, **kwargs):
        if "$setOnInsert" in update:
            assert upsert is True
            key = query["id"]
            self.docs.setdefault(key, dict(update["$setOnInsert"]))
            return
        doc = self.docs.setdefault(query["id"], {"id": query["id"]})
        doc.update(update.get("$set", {}))

    async def find_one(self, query, projection=None):
        return self.docs.get(query["id"])


@pytest.mark.asyncio
async def test_expired_handler_retry_keeps_one_audit(monkeypatch):
    tenants = IdempotentCollection()
    audits = IdempotentCollection()
    tenants.docs["t1"] = {"id": "t1", "email": "", "is_active": True}
    monkeypatch.setattr(event_consumers, "main_db", SimpleNamespace(saas_tenants=tenants, inventory_movements=audits))
    event = Event(event_id="expiry-1", event_type="tenant.subscription.expired", tenant_id="t1")

    await event_consumers.handle_tenant_subscription_expired(event)
    await event_consumers.handle_tenant_subscription_expired(event)

    assert tenants.docs["t1"]["is_active"] is False
    assert tenants.docs["t1"]["subscription_status"] == "expired"
    assert len(audits.docs) == 1
    assert audits.docs["expiry-1"]["event_type"] == "tenant.subscription.expired"


@pytest.mark.asyncio
async def test_renewed_handler_retry_keeps_one_audit(monkeypatch):
    tenants = IdempotentCollection()
    audits = IdempotentCollection()
    tenants.docs["t1"] = {"id": "t1", "is_active": False}
    monkeypatch.setattr(event_consumers, "main_db", SimpleNamespace(saas_tenants=tenants, inventory_movements=audits))
    event = Event(event_id="renewal-1", event_type="tenant.subscription.renewed", tenant_id="t1",
                  payload={"expires_at": "2027-01-01T00:00:00+00:00"})

    await event_consumers.handle_tenant_subscription_renewed(event)
    await event_consumers.handle_tenant_subscription_renewed(event)

    assert tenants.docs["t1"]["is_active"] is True
    assert tenants.docs["t1"]["subscription_status"] == "active"
    assert tenants.docs["t1"]["expires_at"] == "2027-01-01T00:00:00+00:00"
    assert len(audits.docs) == 1
    assert audits.docs["renewal-1"]["event_type"] == "tenant.subscription.renewed"
