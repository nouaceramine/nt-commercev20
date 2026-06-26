"""Iter 13 — SaaS Admin refactor backend tests.

Covers:
  • /api/saas/platform-stats includes services block (backend/mongodb/redis)
  • /api/wallet/settle-credit happy path + over-amount negative path
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nt-v16-staging.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@ntcommerce.com"
ADMIN_PASSWORD = "Admin@2024"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, "no token in login response"
    return tok


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ─── /api/saas/platform-stats services block ───
class TestPlatformStatsServices:
    def test_platform_stats_has_services(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/platform-stats", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "services" in data, "missing services block"
        svc = data["services"]
        for key in ("backend", "mongodb", "redis"):
            assert key in svc, f"missing services.{key}"
            assert "status" in svc[key]
            assert "label" in svc[key]

    def test_backend_status_ok(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/platform-stats", headers=admin_headers, timeout=15)
        assert r.json()["services"]["backend"]["status"] == "ok"

    def test_mongodb_status_ok(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/platform-stats", headers=admin_headers, timeout=15)
        assert r.json()["services"]["mongodb"]["status"] == "ok"

    def test_redis_status_disabled_when_no_url(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/platform-stats", headers=admin_headers, timeout=15)
        # REDIS_URL is unset in env → must be 'disabled'
        assert r.json()["services"]["redis"]["status"] == "disabled"

    def test_capacity_block_intact(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/platform-stats", headers=admin_headers, timeout=15)
        d = r.json()
        assert "tenants" in d and "total" in d["tenants"]
        assert d["tenants"]["max"] == 500, f"expected MAX_TENANTS=500, got {d['tenants'].get('max')}"


# ─── Settle Debt flow ───
class TestSettleCredit:
    @pytest.fixture(scope="class")
    def tenant_with_debt(self, admin_headers):
        # Look up tenants with credit_debt > 0 via /api/wallet/all
        r = requests.get(f"{BASE_URL}/api/wallet/all", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        wallets = r.json()
        debtors = [w for w in wallets if float(w.get("credit_debt") or 0) > 0 and w.get("entity_type") == "tenant"]
        if not debtors:
            pytest.skip("No tenant wallet with credit_debt > 0 available for test")
        return debtors[0]

    def test_settle_credit_happy_path(self, admin_headers, tenant_with_debt):
        entity_id = tenant_with_debt["entity_id"]
        current_debt = float(tenant_with_debt.get("credit_debt") or 0)
        amount = min(1.0, current_debt)  # tiny payment so we don't blow the debt
        payload = {"entity_id": entity_id, "amount": amount, "description": "TEST_iter13 settle"}
        r = requests.post(f"{BASE_URL}/api/wallet/settle-credit", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "message" in d
        assert "credit_debt_remaining" in d
        assert "transaction" in d
        # Persistence assertion: GET /api/wallet/all and verify debt decreased
        r2 = requests.get(f"{BASE_URL}/api/wallet/all", headers=admin_headers, timeout=15)
        wallets = r2.json()
        new = next((w for w in wallets if w.get("entity_id") == entity_id), None)
        assert new is not None
        assert abs(float(new.get("credit_debt") or 0) - (current_debt - amount)) < 0.01

    def test_settle_credit_over_amount_400(self, admin_headers, tenant_with_debt):
        entity_id = tenant_with_debt["entity_id"]
        # Fetch fresh debt
        r = requests.get(f"{BASE_URL}/api/wallet/all", headers=admin_headers, timeout=15)
        wallets = r.json()
        cur = next((w for w in wallets if w.get("entity_id") == entity_id), None) or {}
        debt = float(cur.get("credit_debt") or 0)
        payload = {"entity_id": entity_id, "amount": debt + 1000, "description": "TEST_iter13 over"}
        r2 = requests.post(f"{BASE_URL}/api/wallet/settle-credit", json=payload, headers=admin_headers, timeout=15)
        assert r2.status_code == 400, r2.text

    def test_settle_credit_zero_amount_400(self, admin_headers, tenant_with_debt):
        entity_id = tenant_with_debt["entity_id"]
        payload = {"entity_id": entity_id, "amount": 0}
        r = requests.post(f"{BASE_URL}/api/wallet/settle-credit", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code == 400

    def test_settle_credit_unknown_entity_404(self, admin_headers):
        payload = {"entity_id": "TEST_does_not_exist_xyz", "amount": 10}
        r = requests.post(f"{BASE_URL}/api/wallet/settle-credit", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code == 404


# ─── Sub-route auth gating sanity (smoke) ───
class TestSaasStatsAccess:
    def test_platform_stats_unauthorized(self):
        r = requests.get(f"{BASE_URL}/api/saas/platform-stats", timeout=15)
        assert r.status_code in (401, 403)

    def test_saas_stats_ok(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/stats", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("total_tenants", "active_tenants", "trial_tenants", "expiring_soon", "monthly_revenue", "total_revenue"):
            assert k in d, f"missing stats field {k}"
