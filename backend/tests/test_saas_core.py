"""
End-to-end backend tests for NT Commerce SaaS core flows.

Covers:
- Health endpoint
- SaaS plans listing (Starter / Professional / Enterprise) and field shape
- Super admin login + JWT
- Products endpoint auth requirement
- Super admin: list tenants, create a fresh tenant
- Tenant login + tenant's products endpoint returns empty list
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # Fallback to frontend .env if not exported in shell
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"')
                    break
    except Exception:
        pass
BASE_URL = (BASE_URL or "").rstrip("/")

SUPER_ADMIN_EMAIL = "admin@ntcommerce.com"
SUPER_ADMIN_PASSWORD = "Admin@2024"


# ---------------- Fixtures ----------------

@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def super_admin_token(api_client):
    r = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": SUPER_ADMIN_EMAIL, "password": SUPER_ADMIN_PASSWORD},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip(f"Super admin login failed: {r.status_code} {r.text[:200]}")
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_client(api_client, super_admin_token):
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {super_admin_token}",
    })
    return s


@pytest.fixture(scope="session")
def plans(api_client):
    r = api_client.get(f"{BASE_URL}/api/saas/plans", timeout=15)
    assert r.status_code == 200
    return r.json()


# ---------------- Health ----------------

class TestHealth:
    def test_root_api(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/", timeout=10)
        assert r.status_code == 200
        assert "NT" in r.text or "running" in r.text.lower()


# ---------------- SaaS Plans ----------------

class TestPlans:
    def test_plans_returns_three(self, plans):
        assert isinstance(plans, list)
        assert len(plans) == 3, f"Expected 3 plans, got {len(plans)}"

    def test_plan_names(self, plans):
        names = sorted([p["name"] for p in plans])
        assert names == ["Enterprise", "Professional", "Starter"], names

    def test_plan_fields(self, plans):
        required = {"id", "name", "monthly_price", "yearly_price", "six_month_price", "features"}
        for p in plans:
            missing = required - set(p.keys())
            assert not missing, f"Plan {p.get('name')} missing fields: {missing}"
            assert isinstance(p["monthly_price"], (int, float))
            assert isinstance(p["yearly_price"], (int, float))
            assert isinstance(p["six_month_price"], (int, float))
            assert isinstance(p["features"], dict)
            for fkey in ["max_products", "max_users", "has_pos", "has_reports"]:
                assert fkey in p["features"], f"Plan {p['name']} features missing {fkey}"

    def test_yearly_cheaper_than_12x_monthly(self, plans):
        # Yearly should give a discount versus 12 monthly payments
        for p in plans:
            assert p["yearly_price"] < p["monthly_price"] * 12, (
                f"Yearly should be cheaper than 12*monthly for {p['name']}"
            )


# ---------------- Auth ----------------

class TestAuth:
    def test_super_admin_login(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPER_ADMIN_EMAIL, "password": SUPER_ADMIN_PASSWORD},
            timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["user"]["role"] == "super_admin"
        assert data["user"]["email"] == SUPER_ADMIN_EMAIL

    def test_login_invalid(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPER_ADMIN_EMAIL, "password": "WrongPassword!"},
            timeout=15,
        )
        assert r.status_code in (400, 401)


# ---------------- Products auth requirement ----------------

class TestProductsAuthRequired:
    def test_products_requires_auth(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/products", timeout=15)
        assert r.status_code in (401, 403)


# ---------------- Tenants CRUD ----------------

class TestTenantsCRUD:
    created_tenant = {}

    def test_list_tenants(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/saas/tenants", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_tenant(self, admin_client, plans):
        starter = next((p for p in plans if p["name"] == "Starter"), plans[0])
        suffix = uuid.uuid4().hex[:8]
        email = f"TEST_tenant_{suffix}@example.com"
        password = "TenantPass@2024"
        payload = {
            "name": f"TEST Tenant {suffix}",
            "email": email,
            "password": password,
            "phone": "0555000000",
            "company_name": f"TEST Co {suffix}",
            "plan_id": starter["id"],
            "subscription_type": "monthly",
            "business_type": "retailer",
        }
        r = admin_client.post(f"{BASE_URL}/api/saas/tenants", json=payload, timeout=30)
        assert r.status_code == 200, f"Create tenant failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert data["email"] == email.lower()
        assert data["name"] == payload["name"]
        assert "id" in data
        TestTenantsCRUD.created_tenant = {
            "id": data["id"],
            "email": email,
            "password": password,
        }

    def test_created_tenant_appears_in_list(self, admin_client):
        if not TestTenantsCRUD.created_tenant:
            pytest.skip("Tenant not created")
        r = admin_client.get(f"{BASE_URL}/api/saas/tenants", timeout=15)
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert TestTenantsCRUD.created_tenant["id"] in ids


# ---------------- Tenant login + products ----------------

class TestTenantLogin:
    def test_tenant_can_login(self, api_client):
        info = TestTenantsCRUD.created_tenant
        if not info:
            pytest.skip("No tenant created in previous step")
        # Try common endpoints
        login_payload = {"email": info["email"], "password": info["password"]}
        # Primary endpoint based on auth_users_routes / unified login
        r = api_client.post(f"{BASE_URL}/api/auth/login", json=login_payload, timeout=15)
        if r.status_code != 200:
            # Fallback to dedicated tenant-login route
            r = api_client.post(f"{BASE_URL}/api/saas/tenant-login", json=login_payload, timeout=15)
        assert r.status_code == 200, f"Tenant login failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert "access_token" in data
        TestTenantLogin.tenant_token = data["access_token"]

    def test_tenant_products_empty(self, api_client):
        token = getattr(TestTenantLogin, "tenant_token", None)
        if not token:
            pytest.skip("Tenant login not available")
        s = requests.Session()
        s.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        })
        r = s.get(f"{BASE_URL}/api/products", timeout=15)
        assert r.status_code == 200, f"Products GET failed: {r.status_code} {r.text[:300]}"
        items = r.json()
        # response may be a list or paginated dict
        if isinstance(items, dict):
            items = items.get("items") or items.get("data") or []
        assert isinstance(items, list)
        assert len(items) == 0, f"Expected empty product list for new tenant, got {len(items)}"
