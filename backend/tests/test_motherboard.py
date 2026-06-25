"""Backend tests for Motherboard (diagnostics) endpoints - iteration 3."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nt-v16-staging.preview.emergentagent.com").rstrip("/")
SUPER_EMAIL = "admin@ntcommerce.com"
SUPER_PASS = "Admin@2024"


@pytest.fixture(scope="module")
def super_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    assert body["user"]["role"] == "super_admin"
    return body["access_token"]


@pytest.fixture
def auth_headers(super_token):
    return {"Authorization": f"Bearer {super_token}"}


# --- Motherboard / diagnostics endpoints (the fix in main.py 867-868) ---

class TestMotherboardEndpoints:
    def test_diagnostics_overview(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/diagnostics", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
        data = r.json()
        # Should at least contain some structure (counts, components, etc.)
        assert isinstance(data, dict)

    def test_diagnostics_modules(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/diagnostics/modules", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
        data = r.json()
        # Could be a list or dict with components
        assert data is not None

    def test_diagnostics_metrics(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/diagnostics/metrics", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"

    def test_diagnostics_robots(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/diagnostics/robots", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"

    def test_diagnostics_tenant_health(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/diagnostics/tenant-health", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"

    def test_platform_features(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/platform/features", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"

    def test_diagnostics_requires_auth(self):
        # Without token - should NOT be 200
        r = requests.get(f"{BASE_URL}/api/diagnostics", timeout=30)
        assert r.status_code in (401, 403), f"expected auth-required, got {r.status_code}"


# --- Regression: login + key routes still work ---

class TestRegression:
    def test_login_super_admin(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS}, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert "access_token" in body
        assert body["user"]["role"] == "super_admin"

    def test_saas_plans_public(self):
        r = requests.get(f"{BASE_URL}/api/saas/plans/public", timeout=30)
        assert r.status_code == 200
        plans = r.json()
        assert isinstance(plans, list)
        assert len(plans) > 0

    def test_saas_tenants_admin(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/saas/tenants", headers=auth_headers, timeout=30)
        assert r.status_code == 200
