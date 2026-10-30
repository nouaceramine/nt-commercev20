"""p491 regression tests for role administration and atomic identity reservation."""
import pytest
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from main import get_tenant_admin
from routes.permissions_routes import create_permissions_routes
from utils import identity


@pytest.mark.asyncio
async def test_main_tenant_admin_rejects_ordinary_user():
    with pytest.raises(HTTPException) as exc:
        await get_tenant_admin({"id": "u1", "tenant_id": "t1", "role": "user", "is_active": True})
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_main_tenant_admin_accepts_manager():
    user = {"id": "m1", "tenant_id": "t1", "role": "manager", "is_active": True}
    assert await get_tenant_admin(user) == user


class _Roles:
    def __init__(self, role):
        self.role = role
        self.deleted = False

    async def find_one(self, query, projection=None):
        return dict(self.role) if self.role and self.role["id"] == query["id"] else None

    async def delete_one(self, query):
        self.deleted = True
        return type("Result", (), {"deleted_count": 1})()


class _Users:
    def __init__(self, user=None, assigned=0):
        self.user = user
        self.assigned = assigned

    async def find_one_and_update(self, query, update):
        return dict(self.user) if self.user and self.user["id"] == query["id"] else None

    async def count_documents(self, query):
        return self.assigned


class _DB:
    def __init__(self, role, user=None, assigned=0):
        self.roles = _Roles(role)
        self.users = _Users(user, assigned)


def _endpoint(db, path, method):
    async def current_user():
        return {"id": "admin", "role": "admin"}

    async def tenant_admin():
        return {"id": "admin", "role": "admin"}

    router = create_permissions_routes(db, object(), current_user, tenant_admin)
    return next(route.endpoint for route in router.routes
                if route.path == path and method in route.methods)


@pytest.mark.asyncio
async def test_assign_role_to_missing_user_returns_404():
    db = _DB({"id": "r1", "name_ar": "Role"}, user=None)
    endpoint = _endpoint(db, "/permissions/users/{user_id}/role", "POST")
    with pytest.raises(HTTPException) as exc:
        await endpoint("missing", {"role_id": "r1"}, {"id": "admin"})
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_delete_assigned_role_is_rejected_without_delete():
    db = _DB({"id": "r1", "name_ar": "Role", "is_system": False}, assigned=1)
    endpoint = _endpoint(db, "/permissions/roles/{role_id}", "DELETE")
    with pytest.raises(HTTPException) as exc:
        await endpoint("r1", {"id": "admin"})
    assert exc.value.status_code == 400
    assert db.roles.deleted is False


@pytest.mark.asyncio
async def test_delete_unassigned_role_succeeds():
    db = _DB({"id": "r1", "name_ar": "Role", "is_system": False}, assigned=0)
    endpoint = _endpoint(db, "/permissions/roles/{role_id}", "DELETE")
    result = await endpoint("r1", {"id": "admin"})
    assert result["message"]
    assert db.roles.deleted is True


class _IdentityCollection:
    def __init__(self, existing=False, index_ok=True):
        self.existing = existing
        self.index_ok = index_ok
        self.inserted = 0

    async def create_index(self, field, unique=False):
        if not self.index_ok:
            raise RuntimeError("index unavailable")
        return "email_1"

    async def insert_one(self, document):
        if self.existing:
            raise DuplicateKeyError("duplicate")
        self.inserted += 1


class _MainDB:
    def __init__(self, collection):
        self.collection = collection

    def __getitem__(self, name):
        assert name == identity.COLLECTION
        return self.collection


@pytest.mark.asyncio
async def test_identity_reservation_rejects_duplicate_without_overwrite(monkeypatch):
    collection = _IdentityCollection(existing=True)
    monkeypatch.setattr(identity, "main_db", _MainDB(collection))
    with pytest.raises(HTTPException) as exc:
        await identity.reserve_identity("User@Example.com", "owner", "t1")
    assert exc.value.status_code == 400
    assert collection.inserted == 0


@pytest.mark.asyncio
async def test_identity_reservation_fails_closed_without_unique_index(monkeypatch):
    collection = _IdentityCollection(index_ok=False)
    monkeypatch.setattr(identity, "main_db", _MainDB(collection))
    with pytest.raises(HTTPException) as exc:
        await identity.reserve_identity("user@example.com", "owner", "t1")
    assert exc.value.status_code == 503
    assert collection.inserted == 0
