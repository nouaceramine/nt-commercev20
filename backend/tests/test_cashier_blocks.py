"""
Test: Cashier role 403 enforcement on all guarded API routes.

Uses FastAPI TestClient + dependency_overrides to inject a fake user dict
directly (bypasses DB lookup) so the cashier/admin role check in
block_cashier / get_tenant_admin is tested in isolation.
"""
import sys
import os
import pytest

# Ensure backend package root is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient

# ── App import ─────────────────────────────────────────────────────────────────
from main import app, get_current_user

# ── Fake user factories ────────────────────────────────────────────────────────

CASHIER_USER = {
    "id": "test-cashier-id",
    "name": "Test Cashier",
    "role": "cashier",
    "tenant_id": "test-tenant-123",
    "user_type": "tenant",
    "features": {},
}

ADMIN_USER = {
    "id": "test-admin-id",
    "name": "Test Admin",
    "role": "admin",
    "tenant_id": "test-tenant-123",
    "user_type": "tenant",
    "features": {},
}


def _cashier_client() -> TestClient:
    async def _override():
        return CASHIER_USER
    app.dependency_overrides[get_current_user] = _override
    return TestClient(app, raise_server_exceptions=False)


def _admin_client() -> TestClient:
    async def _override():
        return ADMIN_USER
    app.dependency_overrides[get_current_user] = _override
    return TestClient(app, raise_server_exceptions=False)


# ── Blocked paths table ────────────────────────────────────────────────────────
# (method, path) — cashier must receive 403 for ALL of these
BLOCKED_ROUTES = [
    # main.py inline robot_router  (fixed in this task)
    ("GET",  "/api/robots/status"),
    ("POST", "/api/robots/stop-all"),
    ("POST", "/api/robots/start-all"),

    # banking_routes.py  (fixed in this task)
    ("GET",  "/api/banking/accounts"),
    ("GET",  "/api/banking/transactions"),
    ("GET",  "/api/banking/summary"),
    ("GET",  "/api/banking/reconciliations"),

    # currency_routes.py  (fixed in this task)
    ("GET",  "/api/currencies/"),
    ("GET",  "/api/currencies/settings"),

    # wallet_routes.py  (pre-existing block, regression guard)
    ("GET",  "/api/wallet"),

    # stats_routes.py  (pre-existing block, regression guard)
    ("GET",  "/api/stats"),
]

# ── Tests ──────────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def clear_overrides():
    """Reset dependency overrides after each test."""
    yield
    app.dependency_overrides.clear()


@pytest.mark.parametrize("method,path", BLOCKED_ROUTES)
def test_cashier_is_blocked(method: str, path: str):
    """Cashier user must receive HTTP 403 on every admin-only route."""
    client = _cashier_client()
    resp = client.request(method, path)
    assert resp.status_code == 403, (
        f"Expected 403 for cashier on {method} {path}, "
        f"got {resp.status_code}: {resp.text[:200]}"
    )


def test_admin_can_access_robot_status():
    """Admin must NOT be blocked (non-403) on GET /api/robots/status."""
    client = _admin_client()
    resp = client.get("/api/robots/status")
    assert resp.status_code != 403, (
        f"Admin should not be blocked on GET /api/robots/status, "
        f"got {resp.status_code}"
    )


def test_admin_can_access_banking():
    """Admin must NOT be blocked (non-403) on GET /api/banking/accounts."""
    client = _admin_client()
    resp = client.get("/api/banking/accounts")
    assert resp.status_code != 403, (
        f"Admin should not be blocked on GET /api/banking/accounts, "
        f"got {resp.status_code}"
    )


def test_admin_can_access_currencies():
    """Admin must NOT be blocked (non-403) on GET /api/currencies/."""
    client = _admin_client()
    resp = client.get("/api/currencies/")
    assert resp.status_code != 403, (
        f"Admin should not be blocked on GET /api/currencies/, "
        f"got {resp.status_code}"
    )


def test_admin_can_access_wallet():
    """Admin must NOT be blocked (non-403) on GET /api/wallet."""
    client = _admin_client()
    resp = client.get("/api/wallet")
    assert resp.status_code != 403, (
        f"Admin should not be blocked on GET /api/wallet, "
        f"got {resp.status_code}"
    )
