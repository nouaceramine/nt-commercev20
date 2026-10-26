import os
os.environ.setdefault("JWT_SECRET_KEY", "p480-test-only-jwt-secret-with-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "cd" * 32)
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "ntcommerce_test")

from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient


class FakeCursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, *args):
        return self

    def skip(self, *args):
        return self

    def limit(self, *args):
        return self

    async def to_list(self, length=None):
        values = deepcopy(self.documents)
        return values if length is None else values[:length]


class FakeCollection:
    def __init__(self, documents=()):
        self.documents = [deepcopy(document) for document in documents]

    @classmethod
    def _matches(cls, document, query):
        for key, expected in query.items():
            if key == "$or":
                if not any(cls._matches(document, branch) for branch in expected):
                    return False
            elif isinstance(expected, dict) and "$in" in expected:
                if document.get(key) not in expected["$in"]:
                    return False
            elif document.get(key) != expected:
                return False
        return True

    def _find(self, query):
        return [document for document in self.documents if self._matches(document, query)]

    async def find_one(self, query, projection=None):
        documents = self._find(query)
        return deepcopy(documents[0]) if documents else None

    def find(self, query, projection=None):
        return FakeCursor(self._find(query))

    async def count_documents(self, query):
        return len(self._find(query))

    def aggregate(self, pipeline):
        match = next((stage["$match"] for stage in pipeline if "$match" in stage), {})
        documents = self._find(match)
        group = next(stage["$group"] for stage in pipeline if "$group" in stage)
        grouped = {"_id": None}
        for key, operation in group.items():
            if key == "_id":
                continue
            if "$sum" in operation:
                source = operation["$sum"]
                grouped[key] = (
                    sum(document.get(source[1:], 0) for document in documents)
                    if isinstance(source, str) and source.startswith("$")
                    else len(documents) * source
                )
        return FakeCursor([grouped] if documents else [])

    async def update_one(self, query, update, upsert=False):
        documents = self._find(query)
        if not documents:
            return SimpleNamespace(matched_count=0, modified_count=0)
        documents[0].update(deepcopy(update.get("$set", {})))
        return SimpleNamespace(matched_count=1, modified_count=1)

    async def delete_one(self, query):
        before = len(self.documents)
        self.documents = [document for document in self.documents if not self._matches(document, query)]
        return SimpleNamespace(deleted_count=before - len(self.documents))

    async def insert_one(self, document):
        self.documents.append(deepcopy(document))
        return SimpleNamespace(inserted_id="fake")


def _backup_client(user, backups, schedules):
    from routes.backup_routes import create_backup_routes

    main_db = SimpleNamespace(
        backups=backups,
        backup_schedules=schedules,
        backup_downloads=FakeCollection(),
        system_meta=FakeCollection([{"key": "schema_version", "version": "2.0.0"}]),
    )
    super_user = {"id": "root", "role": "super_admin", "user_type": "super_admin"}
    router = create_backup_routes(None, main_db, lambda: user, lambda: user, lambda: super_user)
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


@pytest.fixture
def backup_data():
    backups = FakeCollection([
        {"id": "a-backup", "entity_type": "tenant", "entity_id": "tenant-a", "file_name": "a.json.gz", "file_size": 10, "records_count": 2},
        {"id": "b-backup", "entity_type": "tenant", "entity_id": "tenant-b", "file_name": "b.json.gz", "file_size": 20, "records_count": 3},
        {"id": "global", "entity_type": "global", "entity_id": "tenant-b", "file_name": "global.json.gz", "file_size": 1000, "records_count": 100},
    ])
    schedules = FakeCollection([
        {"id": "a-schedule", "entity_type": "tenant", "entity_id": "tenant-a", "is_active": True},
        {"id": "b-schedule", "entity_type": "tenant", "entity_id": "tenant-b", "is_active": True},
    ])
    return backups, schedules


def test_backup_list_stats_and_global_records_are_tenant_scoped(backup_data):
    backups, schedules = backup_data
    user_b = {"id": "user-b", "tenant_id": "tenant-b", "role": "admin"}
    client = _backup_client(user_b, backups, schedules)
    response = client.get("/backup/list")
    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == ["b-backup"]
    stats = client.get("/backup/stats/summary").json()
    assert stats["total_backups"] == 1 and stats["total_records"] == 3
    assert stats["active_schedules"] == 1 and stats["disk_files_count"] == 0


def test_backup_get_download_restore_and_delete_deny_other_tenant(backup_data):
    backups, schedules = backup_data
    user_b = {"id": "user-b", "tenant_id": "tenant-b", "role": "admin"}
    client = _backup_client(user_b, backups, schedules)
    for method, path in [
        ("get", "/backup/a-backup"),
        ("get", "/backup/a-backup/download"),
        ("post", "/backup/a-backup/restore"),
        ("delete", "/backup/a-backup"),
        ("get", "/backup/global"),
    ]:
        response = getattr(client, method)(path)
        assert response.status_code == 404, (method, path, response.text)
    assert any(document["id"] == "a-backup" for document in backups.documents)


def test_backup_schedules_cannot_be_read_modified_or_deleted_across_tenants(backup_data):
    backups, schedules = backup_data
    user_b = {"id": "user-b", "tenant_id": "tenant-b", "role": "admin"}
    client = _backup_client(user_b, backups, schedules)
    assert [item["id"] for item in client.get("/backup/schedules/list").json()] == ["b-schedule"]
    response = client.put("/backup/schedules/a-schedule", json={"entity_id": "tenant-b", "is_active": False})
    assert response.status_code == 404
    assert client.delete("/backup/schedules/a-schedule").status_code == 404
    original = next(document for document in schedules.documents if document["id"] == "a-schedule")
    assert original["entity_id"] == "tenant-a" and original["is_active"] is True

    user_a = {"id": "user-a", "tenant_id": "tenant-a", "role": "admin"}
    owner_client = _backup_client(user_a, backups, schedules)
    updated = owner_client.put("/backup/schedules/a-schedule", json={"entity_id": "tenant-b", "is_active": False})
    assert updated.status_code == 200
    assert updated.json()["entity_id"] == "tenant-a" and updated.json()["is_active"] is False


def test_backup_file_path_cannot_escape_storage_root():
    from routes.backup_routes import _backup_path
    with pytest.raises(HTTPException) as exc:
        _backup_path("../outside.json.gz")
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_feature_gate_fails_closed_when_resolution_fails(monkeypatch):
    import middleware.feature_gate as feature_gate

    monkeypatch.setattr(feature_gate.registry, "find_by_path", lambda path: SimpleNamespace(gate="ecommerce_hub", key="ecom", name_ar="متجر"))
    monkeypatch.setattr(feature_gate.jwt, "decode", lambda *args, **kwargs: {"type": "tenant", "tenant_id": "tenant-a"})
    monkeypatch.setattr(feature_gate, "get_effective_features", AsyncMock(side_effect=RuntimeError("database unavailable")))
    middleware = feature_gate.FeatureGateMiddleware(Mock())
    request = SimpleNamespace(url=SimpleNamespace(path="/api/ecom/orders"), headers={"authorization": "Bearer token"})
    call_next = AsyncMock()
    response = await middleware.dispatch(request, call_next)
    assert response.status_code == 503
    call_next.assert_not_awaited()


def test_sync_profile_rejects_unsafe_identifiers_and_insecure_server():
    from agents.rlynx.nt_sync_agent import profile, push
    bad_profile = {
        "Receipt": {"table": "VENTES] ; DROP TABLE users; --", "columns": {"ID": "ID"}},
        "Item": {"table": "ITEMS", "columns": {"ID": "ID"}},
    }
    with pytest.raises(RuntimeError):
        profile({"engine": "mssql", "profile": bad_profile})
    with pytest.raises(RuntimeError):
        push({"server": "http://nt-commerce.net", "token": "test"}, {})


def test_generated_image_validation_rejects_fake_or_oversized_content():
    from routes.ai_routes import _image_extension
    assert _image_extension(b"\x89PNG\r\n\x1a\n" + b"x" * 20) == "png"
    with pytest.raises(ValueError):
        _image_extension(b"<html>not an image</html>")


def test_stripe_status_denies_cross_tenant_before_provider_call(monkeypatch):
    import routes.stripe_routes as routes

    payments = FakeCollection([{
        "id": "transaction-a", "session_id": "cs_test_owned_by_a",
        "tenant_id": "tenant-a", "created_by": "user-a",
    }])
    main_db = SimpleNamespace(payment_transactions=payments)
    user_b = {"id": "user-b", "tenant_id": "tenant-b", "role": "admin"}
    router = routes.create_stripe_routes(
        None, main_db, lambda: user_b, lambda: user_b, lambda: None, lambda: None,
    )
    provider = Mock(side_effect=AssertionError("provider must not be called"))
    monkeypatch.setattr(routes, "_stripe_client", provider)
    app = FastAPI()
    app.include_router(router)
    response = TestClient(app).get("/payments/status/cs_test_owned_by_a")
    assert response.status_code == 404
    provider.assert_not_called()


def test_wallet_stats_include_only_own_current_and_legacy_records():
    from routes.wallet.wallet_core_routes import create_wallet_core_routes

    main_db = SimpleNamespace(
        wallets=FakeCollection([
            {"id": "wallet-a", "entity_id": "tenant-a", "balance": 10},
            {"id": "wallet-b", "entity_id": "tenant-b", "balance": 20},
        ]),
        wallet_transactions=FakeCollection([
            {"id": "tx-a", "entity_id": "tenant-a"},
            {"id": "tx-a-legacy", "wallet_id": "wallet-a"},
            {"id": "tx-b", "entity_id": "tenant-b"},
        ]),
        wallet_transfers=FakeCollection([
            {"id": "transfer-a", "from_entity_id": "tenant-a", "to_entity_id": "platform"},
            {"id": "transfer-b", "from_entity_id": "tenant-b", "to_entity_id": "platform"},
        ]),
    )
    user = {"id": "user-a", "tenant_id": "tenant-a", "role": "admin"}
    router = create_wallet_core_routes(main_db, lambda: user, lambda: user, lambda: user)
    app = FastAPI()
    app.include_router(router)
    stats = TestClient(app).get("/wallet/stats").json()
    assert stats == {
        "total_wallets": 1, "total_balance": 10,
        "total_transactions": 2, "total_transfers": 1,
    }


@pytest.mark.asyncio
async def test_sim_seed_creates_unique_index_first_and_handles_worker_race():
    from pymongo.errors import DuplicateKeyError
    from services.sim_catalog_seed import seed_sim_catalog

    catalog = SimpleNamespace(
        create_index=AsyncMock(), find_one=AsyncMock(return_value=None),
        insert_one=AsyncMock(side_effect=DuplicateKeyError("duplicate", 11000)),
    )
    stock = SimpleNamespace(create_index=AsyncMock())
    result = await seed_sim_catalog(SimpleNamespace(
        platform_sim_catalog=catalog, platform_sim_stock=stock,
    ))
    assert result == {"inserted": 0, "skipped": 7}
    assert catalog.create_index.await_count == 1
    assert catalog.insert_one.await_count == 7
    assert stock.create_index.await_count == 1


@pytest.mark.asyncio
async def test_event_for_deleted_tenant_is_acknowledged_without_running_handlers():
    from models.events import Event
    from services.event_bus import RedisEventBus

    class FakeMainDB:
        def __init__(self):
            self.saas_tenants = FakeCollection()
            self.processed = FakeCollection()

        def __getitem__(self, name):
            assert name == "processed_events"
            return self.processed

    bus = RedisEventBus()
    bus._client = SimpleNamespace(xack=AsyncMock())
    bus._db = FakeMainDB()
    handler = AsyncMock()
    event = Event(event_type="sale.completed", tenant_id="deleted-tenant")
    bus._handlers = {event.event_type: [handler]}
    await bus._handle_message("1-1", event.to_wire())
    handler.assert_not_awaited()
    bus._client.xack.assert_awaited_once()
    assert bus._db.processed.documents[0]["status"] == "ok"
    assert bus._db.processed.documents[0]["consumer"] == "<tenant_deleted>"


@pytest.mark.asyncio
async def test_prediction_robot_removes_db_recreated_by_delete_race(monkeypatch):
    from robots.prediction_robot import PredictionRobot

    class FakeClient:
        def __init__(self):
            self.reports = SimpleNamespace(
                create_index=AsyncMock(), update_one=AsyncMock(), delete_many=AsyncMock(),
            )
            self.drop_database = AsyncMock()

        async def list_database_names(self):
            return ["nt_rt_9999"]

        def __getitem__(self, name):
            assert name == "nt_rt_9999"
            return SimpleNamespace(auto_reports=self.reports)

    client = FakeClient()
    main_db = SimpleNamespace(saas_tenants=SimpleNamespace(
        find_one=AsyncMock(side_effect=[{"is_active": True}, None]),
    ))
    robot = PredictionRobot(main_db, client, None)
    monkeypatch.setattr(robot, "_predict_sales", AsyncMock(return_value={}))
    monkeypatch.setattr(robot, "_analyze_trends", AsyncMock(return_value={}))
    monkeypatch.setattr(robot, "_detect_seasonal", AsyncMock(return_value={}))
    await robot.run_checks()
    client.reports.update_one.assert_awaited_once()
    client.drop_database.assert_awaited_once_with("nt_rt_9999")


@pytest.mark.asyncio
async def test_event_handler_cleans_db_when_tenant_deleted_mid_dispatch():
    from models.events import Event
    from services.event_bus import RedisEventBus

    class FakeMainDB:
        def __init__(self):
            self.saas_tenants = SimpleNamespace(find_one=AsyncMock(side_effect=[
                {"id": "tenant-race", "db_name": "nt_rt_9999", "is_active": True},
                None,
            ]))
            self.processed = FakeCollection()
            self.client = SimpleNamespace(drop_database=AsyncMock())

        def __getitem__(self, name):
            assert name == "processed_events"
            return self.processed

    bus = RedisEventBus()
    bus._client = SimpleNamespace(xack=AsyncMock())
    bus._db = FakeMainDB()
    handler = AsyncMock()
    event = Event(event_type="sale.completed", tenant_id="tenant-race")
    bus._handlers = {event.event_type: [handler]}
    await bus._handle_message("1-1", event.to_wire())
    handler.assert_awaited_once()
    bus._db.client.drop_database.assert_awaited_once_with("nt_rt_9999")
    bus._client.xack.assert_awaited_once()
