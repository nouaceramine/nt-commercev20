"""Iter 14 — SaaS Admin page-split + Platform-card invoice backend regression tests.

Targets:
  • /api/saas/payments  → 200 OK
  • /api/saas/plans?include_inactive=true → 200 OK
  • /api/saas/tenant-debts → 200 OK
  • /api/saas/audit-timeline (naive ISO since) → must NOT 500 (iter 12 fix retained)
  • /api/saas/stats → still 200 (monitoring regression)
  • /api/saas/platform-stats → still 200
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "admin@ntcommerce.com"
ADMIN_PASSWORD = "Admin@2024"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, "no token in login response"
    return tok


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ─── SaaS sub-route endpoints behind the 4 newly extracted pages ───
class TestSaasSubRouteEndpoints:
    def test_payments_endpoint(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/payments", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        # Should be a list (possibly empty) or an object with payments key
        assert isinstance(data, (list, dict))

    def test_plans_endpoint_include_inactive(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/plans?include_inactive=true",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        # We know Mubtada plan exists from seeds
        codes = [p.get("code") or p.get("name") for p in data]
        assert len(codes) >= 1, "expected at least 1 plan seeded"

    def test_tenant_debts_endpoint(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/tenant-debts", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, (list, dict))

    def test_audit_timeline_endpoint_basic(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/audit-timeline", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text

    def test_audit_timeline_naive_since_does_not_500(self, admin_headers):
        """Iter 12 regression — naive ISO date in ?since must NOT crash (tz-naive vs tz-aware)."""
        r = requests.get(f"{BASE_URL}/api/saas/audit-timeline?since=2026-01-01",
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200, f"naive since crashed with {r.status_code}: {r.text[:300]}"

    def test_audit_timeline_naive_until_does_not_500(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/audit-timeline?until=2027-01-01",
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text[:300]

    def test_audit_timeline_with_filter_type(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/audit-timeline?type=all&since=2026-01-01",
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200


# ─── Monitoring dashboard regression ───
class TestMonitoringRegression:
    def test_saas_stats(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/stats", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("total_tenants", "active_tenants"):
            assert k in d

    def test_platform_stats(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/platform-stats", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "services" in d
        assert "tenants" in d


# ─── Auth gating on the newly-extracted page endpoints ───
class TestAuthGating:
    def test_payments_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/saas/payments", timeout=10)
        assert r.status_code in (401, 403)

    def test_tenant_debts_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/saas/tenant-debts", timeout=10)
        assert r.status_code in (401, 403)

    def test_audit_timeline_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/saas/audit-timeline", timeout=10)
        assert r.status_code in (401, 403)
