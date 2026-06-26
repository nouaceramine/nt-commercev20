"""Iter-16 regression suite: SaasAdminPage cleanup + caching on
/saas/stats & /saas/tenant-debts + pagination on /platform-cards/sales +
agents extraction.

The Playwright UI checks live in the test runner; this file focuses on
the contract: response shape, cache semantics, invalidation, filters.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "admin@ntcommerce.com"
ADMIN_PASSWORD = "Admin@2024"
TENANT_EMAIL = "TEST_tenant_0e54f6b5@example.com"
TENANT_PASSWORD = "TenantPass@2024"


# ── Auth fixtures ────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip(f"super-admin login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}",
                      "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def tenant_token():
    r = requests.post(
        f"{BASE_URL}/api/saas/tenant-login",
        json={"email": TENANT_EMAIL, "password": TENANT_PASSWORD},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip(f"tenant login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def tenant_client(tenant_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tenant_token}",
                      "Content-Type": "application/json"})
    return s


# ── /saas/stats caching ──────────────────────────────────────────────
class TestSaasStatsCache:
    def test_first_call_returns_payload(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/saas/stats", timeout=15)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        # tolerant: just need the payload to be a dict with at least 1 key
        assert isinstance(data, dict)

    def test_second_call_is_cached(self, admin_client):
        # warm
        admin_client.get(f"{BASE_URL}/api/saas/stats", timeout=15)
        time.sleep(0.3)
        r = admin_client.get(f"{BASE_URL}/api/saas/stats", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("cached") is True, f"expected cached=true on 2nd call, got {data}"
        assert "served_at" in data


# ── /saas/tenant-debts caching + invalidation ────────────────────────
class TestTenantDebtsCache:
    def test_warm_then_cached(self, admin_client):
        r1 = admin_client.get(f"{BASE_URL}/api/saas/tenant-debts", timeout=15)
        assert r1.status_code == 200, r1.text[:300]
        time.sleep(0.3)
        r2 = admin_client.get(f"{BASE_URL}/api/saas/tenant-debts", timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("cached") is True, "2nd call should be cached"

    def test_settle_credit_invalidates_cache(self, admin_client):
        # warm
        admin_client.get(f"{BASE_URL}/api/saas/tenant-debts", timeout=15)
        time.sleep(0.3)
        # find a tenant with debt
        debts = admin_client.get(
            f"{BASE_URL}/api/saas/tenant-debts", timeout=15
        ).json()
        items = debts.get("items", [])
        tenant_with_debt = next(
            (i for i in items if i.get("credit_debt", 0) > 0), None
        )
        if not tenant_with_debt:
            pytest.skip("no tenant with credit_debt available to test invalidation")
        # settle 1 dz
        settle = admin_client.post(
            f"{BASE_URL}/api/wallet/settle-credit",
            json={"entity_id": tenant_with_debt["tenant_id"], "amount": 1},
            timeout=15,
        )
        # tolerant — some implementations need entity_type; if 400 ask payload
        if settle.status_code not in (200, 201):
            # Try with entity_type
            settle = admin_client.post(
                f"{BASE_URL}/api/wallet/settle-credit",
                json={
                    "entity_id": tenant_with_debt["tenant_id"],
                    "entity_type": "tenant",
                    "amount": 1,
                },
                timeout=15,
            )
        assert settle.status_code in (200, 201), f"settle-credit failed: {settle.status_code} {settle.text[:300]}"
        # Next call must NOT be cached (cache invalidated)
        time.sleep(0.3)
        r = admin_client.get(f"{BASE_URL}/api/saas/tenant-debts", timeout=15)
        assert r.status_code == 200
        assert r.json().get("cached") is not True, "cache should have been invalidated after settle-credit"


# ── /platform-cards/sales pagination + filters ───────────────────────
class TestPlatformCardsSalesPagination:
    def test_default_shape(self, tenant_client):
        r = tenant_client.get(f"{BASE_URL}/api/platform-cards/sales", timeout=15)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        for k in ("items", "total", "limit", "skip", "has_more"):
            assert k in data, f"missing {k} in {data.keys()}"
        assert isinstance(data["items"], list)
        assert isinstance(data["total"], int)
        assert data["limit"] == 50
        assert data["skip"] == 0
        if data["total"] <= 50:
            assert data["has_more"] is False

    def test_limit_query_param(self, tenant_client):
        r = tenant_client.get(f"{BASE_URL}/api/platform-cards/sales?limit=5", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["limit"] == 5
        assert len(d["items"]) <= 5

    def test_search_filter(self, tenant_client):
        # search param should not 500
        r = tenant_client.get(
            f"{BASE_URL}/api/platform-cards/sales?search=Mobilis", timeout=15
        )
        assert r.status_code == 200
        assert "items" in r.json()

    def test_operator_and_method_and_since(self, tenant_client):
        r = tenant_client.get(
            f"{BASE_URL}/api/platform-cards/sales?operator=Mobilis&payment_method=cash&since=2026-01-01",
            timeout=15,
        )
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert isinstance(d["items"], list)

    def test_limit_out_of_range_rejected(self, tenant_client):
        r = tenant_client.get(
            f"{BASE_URL}/api/platform-cards/sales?limit=1000", timeout=15
        )
        # Query(le=500) → 422
        assert r.status_code in (400, 422)


# ── Regressions on extracted routes ──────────────────────────────────
class TestExtractedRouteEndpoints:
    def test_platform_stats_redis_ok(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/saas/platform-stats", timeout=15)
        assert r.status_code == 200
        d = r.json()
        # services.redis.status == 'ok'
        services = d.get("services") or {}
        redis_block = services.get("redis") or {}
        assert redis_block.get("status") == "ok", f"redis not ok: {redis_block}"

    def test_multi_poll_resilience(self, admin_client):
        results = []
        for _ in range(5):
            r = admin_client.get(f"{BASE_URL}/api/saas/platform-stats", timeout=15)
            assert r.status_code == 200
            results.append(r.json())
        cached_hits = sum(1 for r in results if r.get("cached") is True)
        assert cached_hits >= 3, f"expected >=3 cached hits in 5 polls, got {cached_hits}"

    def test_payments(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/saas/payments", timeout=15)
        assert r.status_code == 200

    def test_plans(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/saas/plans?include_inactive=true", timeout=15)
        assert r.status_code == 200

    def test_audit_timeline(self, admin_client):
        r = admin_client.get(
            f"{BASE_URL}/api/saas/audit-timeline?since=2026-01-01T00:00:00",
            timeout=15,
        )
        assert r.status_code == 200

    def test_tenants_list(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/saas/tenants", timeout=15)
        assert r.status_code == 200

    def test_agents_list(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/saas/agents", timeout=15)
        assert r.status_code == 200
