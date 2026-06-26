"""Iter 15 — Backend tests: Redis caching, Resend integration, sales reprint, regression."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nt-v16-staging.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@ntcommerce.com"
ADMIN_PASSWORD = "Admin@2024"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ── P1: Redis caching ──
class TestRedisCaching:
    def test_platform_stats_redis_ok(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/platform-stats", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "services" in data
        assert "redis" in data["services"]
        # Should be 'ok' now since redis is installed
        assert data["services"]["redis"]["status"] == "ok", f"redis status: {data['services']['redis']}"
        assert data["services"]["mongodb"]["status"] == "ok"
        assert data["services"]["backend"]["status"] == "ok"

    def test_platform_stats_cached_on_second_call(self, admin_headers):
        # Make 5 successive requests and confirm none crash, at least one returns cached=true
        cached_seen = False
        for i in range(5):
            r = requests.get(f"{BASE_URL}/api/saas/platform-stats", headers=admin_headers, timeout=15)
            assert r.status_code == 200, f"call {i} failed: {r.status_code}"
            data = r.json()
            if data.get("cached") is True:
                cached_seen = True
            time.sleep(0.2)
        assert cached_seen, "Expected at least one cached=true response across 5 successive calls"


# ── P1: Resend / email_service ──
class TestEmailProvider:
    def test_get_email_provider_returns_mock_when_keys_empty(self):
        from services.email_service import get_email_provider
        provider = get_email_provider()
        # RESEND_API_KEY is empty in current env so provider should be 'mock'
        assert provider in ("mock", "resend", "sendgrid")
        # In this environment we know keys are blank
        assert provider == "mock", f"Expected mock, got {provider}"

    def test_send_email_mock_returns_true(self):
        import asyncio
        from services.email_service import send_email
        ok = asyncio.run(send_email(to="test@example.com", subject="TEST_iter15", body="hello"))
        assert ok is True

    def test_debt_reminder_email_does_not_crash(self, admin_headers):
        # Find a tenant with credit_debt
        r = requests.get(f"{BASE_URL}/api/saas/tenant-debts", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        debts = r.json()
        items = debts if isinstance(debts, list) else debts.get("items", debts.get("debts", []))
        if not items:
            pytest.skip("no tenant debts available")
        tenant_id = items[0].get("tenant_id") or items[0].get("id")
        assert tenant_id
        r = requests.post(
            f"{BASE_URL}/api/saas/tenant-debts/{tenant_id}/remind",
            headers=admin_headers,
            json={"channel": "email"},
            timeout=20,
        )
        # Should not 500 — may be 200 with delivered=true or 400 if email missing
        assert r.status_code in (200, 400, 404), f"reminder failed: {r.status_code} {r.text[:200]}"


# ── P3: Platform Cards sales reprint ──
class TestPlatformCardsSales:
    def test_platform_cards_sales_endpoint(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/platform-cards/sales", headers=admin_headers, timeout=15)
        # endpoint should exist and return 200 (possibly empty)
        # admin token may not have tenant context — 200/401/403 acceptable, but not 500
        assert r.status_code != 500, f"sales endpoint crashed: {r.text[:200]}"


# ── Regression: extracted sub-route endpoints + settle-debt ──
class TestRegressionRoutes:
    def test_saas_stats(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/stats", headers=admin_headers, timeout=15)
        assert r.status_code == 200

    def test_payments_list(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/payments", headers=admin_headers, timeout=15)
        assert r.status_code == 200

    def test_plans_list(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/plans?include_inactive=true", headers=admin_headers, timeout=15)
        assert r.status_code == 200

    def test_tenant_debts_list(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/tenant-debts", headers=admin_headers, timeout=15)
        assert r.status_code == 200

    def test_audit_timeline(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/audit-timeline?since=2026-01-01&until=2027-01-01", headers=admin_headers, timeout=15)
        assert r.status_code == 200

    def test_subscribers_tenants(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/tenants", headers=admin_headers, timeout=15)
        assert r.status_code == 200

    def test_agents_list(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/agents", headers=admin_headers, timeout=15)
        assert r.status_code == 200

    def test_settle_debt_flow(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/tenant-debts", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        debts = r.json()
        items = debts if isinstance(debts, list) else debts.get("items", debts.get("debts", []))
        if not items:
            pytest.skip("no tenant debts")
        tenant_id = items[0].get("tenant_id") or items[0].get("id")
        # Settle 1 DZD — endpoint expects entity_id
        r = requests.post(
            f"{BASE_URL}/api/wallet/settle-credit",
            headers=admin_headers,
            json={"entity_id": tenant_id, "amount": 1, "description": "TEST_iter15 regression"},
            timeout=15,
        )
        assert r.status_code in (200, 201, 400), f"settle-credit unexpected: {r.status_code} {r.text[:200]}"
        # 400 is acceptable if debt already 0 from prior tests; 200 is the success path
