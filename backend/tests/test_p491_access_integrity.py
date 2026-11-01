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


class _RegisterUsers:
    def __init__(self, existing=None, fail_insert=False):
        self.existing = existing
        self.fail_insert = fail_insert
        self.documents = []

    async def find_one(self, query, projection=None):
        return self.existing

    async def insert_one(self, document):
        if self.fail_insert:
            raise RuntimeError("injected insert failure")
        self.documents.append(dict(document))
        return type("Result", (), {"inserted_id": "test-object-id"})()


class _RegisterDB:
    def __init__(self, users):
        self.users = users


def _register_endpoint(db):
    import inspect
    from routes.simple_auth_routes import create_auth_routes

    async def current_user():
        return {"id": "admin", "role": "admin"}

    async def admin_user():
        return {"id": "admin", "role": "admin"}

    router = create_auth_routes(db, current_user, admin_user)
    endpoint = next(route.endpoint for route in router.routes
                    if route.path == "/auth/register" and "POST" in route.methods)
    return inspect.unwrap(endpoint)


def _register_body(**overrides):
    from routes.simple_auth_routes import RegisterRequest

    values = {"email": "new@example.com", "password": "valid-password", "name": "New User"}
    values.update(overrides)
    return RegisterRequest(**values)


@pytest.mark.asyncio
@pytest.mark.parametrize("name_field", ["name", "full_name"])
async def test_register_is_admin_user_creation_without_token(monkeypatch, name_field):
    users = _RegisterUsers()
    endpoint = _register_endpoint(_RegisterDB(users))
    reserved = []
    removed = []

    async def assert_free(email):
        return None

    async def reserve(email, kind, user_id, tenant_id=None, name="", is_active=True):
        reserved.append({"email": email, "kind": kind, "user_id": user_id,
                         "tenant_id": tenant_id, "name": name})

    async def remove(user_id):
        removed.append(user_id)

    monkeypatch.setattr(identity, "assert_email_globally_free", assert_free)
    monkeypatch.setattr(identity, "reserve_identity", reserve)
    monkeypatch.setattr(identity, "remove_identity", remove)
    body = _register_body(**{name_field: "Compatible Name", "name" if name_field == "full_name" else "full_name": None})
    result = await endpoint(None, body, {"id": "owner", "role": "admin", "tenant_id": "tenant-a"})
    assert result["user"]["role"] == "user"
    assert result["user"]["name"] == "Compatible Name"
    assert "access_token" not in result
    assert len(users.documents) == 1
    assert users.documents[0]["name"] == "Compatible Name"
    assert reserved[0]["kind"] == "employee"
    assert reserved[0]["tenant_id"] == "tenant-a"
    assert removed == []


@pytest.mark.asyncio
async def test_register_rejects_super_admin_for_non_super_admin():
    users = _RegisterUsers()
    endpoint = _register_endpoint(_RegisterDB(users))
    with pytest.raises(HTTPException) as exc:
        await endpoint(None, _register_body(role="super_admin"),
                       {"id": "owner", "role": "admin", "tenant_id": "tenant-a"})
    assert exc.value.status_code == 403
    assert users.documents == []


@pytest.mark.asyncio
async def test_register_removes_reserved_identity_when_insert_fails(monkeypatch):
    users = _RegisterUsers(fail_insert=True)
    endpoint = _register_endpoint(_RegisterDB(users))
    reserved = []
    removed = []

    async def assert_free(email):
        return None

    async def reserve(email, kind, user_id, tenant_id=None, name="", is_active=True):
        reserved.append(user_id)

    async def remove(user_id):
        removed.append(user_id)

    monkeypatch.setattr(identity, "assert_email_globally_free", assert_free)
    monkeypatch.setattr(identity, "reserve_identity", reserve)
    monkeypatch.setattr(identity, "remove_identity", remove)
    with pytest.raises(RuntimeError):
        await endpoint(None, _register_body(), {"id": "admin", "role": "admin"})
    assert removed == reserved


@pytest.mark.asyncio
async def test_utils_admin_gate_rejects_ordinary_user():
    from utils.auth import get_admin_user

    with pytest.raises(HTTPException) as exc:
        await get_admin_user({"id": "u1", "role": "user", "is_active": True})
    assert exc.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("flag", ["is_active", "active"])
async def test_legacy_login_rejects_disabled_user_without_token(monkeypatch, flag):
    import inspect
    from routes.simple_auth_routes import LoginRequest, create_auth_routes
    from services.auth_service import AuthService

    async def current_user():
        return {"id": "admin", "role": "admin"}

    async def admin_user():
        return {"id": "admin", "role": "admin"}

    async def disabled_user(self, email, password):
        return {"id": "u1", "email": email, "role": "user", flag: False}

    monkeypatch.setattr(AuthService, "authenticate", disabled_user)
    router = create_auth_routes(_RegisterDB(_RegisterUsers()), current_user, admin_user)
    endpoint = next(route.endpoint for route in router.routes
                    if route.path == "/auth/login" and "POST" in route.methods)
    with pytest.raises(HTTPException) as exc:
        await inspect.unwrap(endpoint)(None, LoginRequest(email="disabled@example.com", password="secret"))
    assert exc.value.status_code == 403
