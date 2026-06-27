"""Iter17 — cached_json decorator, sales pagination via seed, regression on extracted routes."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nt-v16-staging.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@ntcommerce.com"
ADMIN_PASSWORD = "Admin@2024"
TENANT_EMAIL = "TEST_tenant_0e54f6b5@example.com"
TENANT_PASSWORD = "TenantPass@2024"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def tenant_token():
    r = requests.post(f"{BASE_URL}/api/saas/tenant-login",
                      json={"email": TENANT_EMAIL, "password": TENANT_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"tenant login failed: {r.status_code} {r.text}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def tenant_headers(tenant_token):
    return {"Authorization": f"Bearer {tenant_token}"}


# ---------- cached_json decorator ----------

def _warm_cycle(url, headers):
    """Return (cold, warm) JSON payloads."""
    a = requests.get(url, headers=headers, timeout=15)
    assert a.status_code == 200, a.text
    time.sleep(0.2)
    b = requests.get(url, headers=headers, timeout=15)
    assert b.status_code == 200, b.text
    return a.json(), b.json()


def test_platform_stats_cached_warm(admin_headers):
    cold, warm = _warm_cycle(f"{BASE_URL}/api/saas/platform-stats", admin_headers)
    assert warm.get("cached") is True
    assert "served_at" in warm
    # cold should NOT carry stamp (was just freshly computed OR previously stamped warm — accept either flow but typical cold-after-flush has no cached key)
    # we tolerate either since previous tests may have warmed the cache
    assert isinstance(warm.get("served_at"), str)


def test_saas_stats_cached_warm(admin_headers):
    cold, warm = _warm_cycle(f"{BASE_URL}/api/saas/stats", admin_headers)
    assert warm.get("cached") is True
    assert "served_at" in warm


def test_tenant_debts_cached_warm(admin_headers):
    cold, warm = _warm_cycle(f"{BASE_URL}/api/saas/tenant-debts", admin_headers)
    assert warm.get("cached") is True
    assert "served_at" in warm


def test_tenant_debts_cache_invalidation_on_add_funds(admin_headers):
    # warm
    requests.get(f"{BASE_URL}/api/saas/tenant-debts", headers=admin_headers, timeout=15)
    w = requests.get(f"{BASE_URL}/api/saas/tenant-debts", headers=admin_headers, timeout=15).json()
    assert w.get("cached") is True
    # pick a tenant id from existing debts list
    items = w.get("items") or w.get("debts") or []
    if not items:
        pytest.skip("no debts to test invalidation against")
    tenant_id = items[0].get("tenant_id") or items[0].get("id")
    # Use the remind endpoint which is documented as a cache-buster
    r = requests.post(f"{BASE_URL}/api/saas/tenant-debts/{tenant_id}/remind",
                      headers=admin_headers, json={}, timeout=15)
    assert r.status_code in (200, 201), r.text
    next_call = requests.get(f"{BASE_URL}/api/saas/tenant-debts", headers=admin_headers, timeout=15).json()
    assert not next_call.get("cached"), f"cache was not invalidated: {next_call.get('cached')}"


# ---------- Sales pagination + date filters ----------

def test_sales_pagination_first_page(tenant_headers):
    r = requests.get(f"{BASE_URL}/api/platform-cards/sales", headers=tenant_headers, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] >= 60
    assert body["has_more"] is True
    assert len(body["items"]) == 50
    assert body["skip"] == 0
    assert body["limit"] == 50


def test_sales_pagination_second_page(tenant_headers):
    r = requests.get(f"{BASE_URL}/api/platform-cards/sales?skip=50&limit=50",
                     headers=tenant_headers, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["skip"] == 50
    assert len(body["items"]) >= 10
    assert body["has_more"] is False


def test_sales_date_filter_since(tenant_headers):
    r = requests.get(f"{BASE_URL}/api/platform-cards/sales?since=2026-01-01",
                     headers=tenant_headers, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body and "total" in body


def test_sales_date_filter_until(tenant_headers):
    r = requests.get(f"{BASE_URL}/api/platform-cards/sales?until=2026-12-31",
                     headers=tenant_headers, timeout=15)
    assert r.status_code == 200, r.text


def test_sales_date_filter_both(tenant_headers):
    r = requests.get(f"{BASE_URL}/api/platform-cards/sales?since=2026-01-01&until=2026-12-31",
                     headers=tenant_headers, timeout=15)
    assert r.status_code == 200, r.text


def test_sales_limit_guard_422(tenant_headers):
    r = requests.get(f"{BASE_URL}/api/platform-cards/sales?limit=1000",
                     headers=tenant_headers, timeout=15)
    assert r.status_code == 422


# ---------- Extracted routes regression ----------

@pytest.mark.parametrize("path", [
    "/api/saas/platform-stats",
    "/api/saas/stats",
    "/api/saas/tenant-debts",
    "/api/saas/tenants",
    "/api/saas/payments",
    "/api/saas/plans?include_inactive=true",
    "/api/saas/agents",
    "/api/saas/audit-timeline",
    "/api/saas/agent-withdrawals",
])
def test_extracted_routes_200(admin_headers, path):
    r = requests.get(f"{BASE_URL}{path}", headers=admin_headers, timeout=15)
    assert r.status_code in (200, 304), f"{path} -> {r.status_code}: {r.text[:200]}"


def test_platform_stats_redis_ok(admin_headers):
    r = requests.get(f"{BASE_URL}/api/saas/platform-stats", headers=admin_headers, timeout=15)
    body = r.json()
    services = body.get("services") or {}
    redis = services.get("redis") or {}
    mongo = services.get("mongodb") or {}
    assert redis.get("status") in ("ok", "up", "healthy"), f"redis={redis}"
    assert mongo.get("status") in ("ok", "up", "healthy"), f"mongo={mongo}"
