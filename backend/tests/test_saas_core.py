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

SUPER_ADMIN_EMAIL = os.environ.get("TEST_SUPER_ADMIN_EMAIL", "admin@ntcommerce.com")
SUPER_ADMIN_PASSWORD = os.environ.get("TEST_SUPER_ADMIN_PASSWORD", "Admin@2024")


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
    assert r.status_code == 200, f"Super admin login failed: {r.status_code} {r.text[:200]}"
    token = r.json().get("access_token")
    assert token, "Super admin login returned no access token"
    return token


@pytest.fixture(scope="session")
def admin_client(api_client, super_admin_token):
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {super_admin_token}",
    })
    return s


@pytest.fixture(scope="module")
def plans(api_client, p486_default_plans):
    r = api_client.get(f"{BASE_URL}/api/saas/plans", timeout=15)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def created_tenant(p486_tenant_factory):
    return p486_tenant_factory("saas-core")


@pytest.fixture(scope="module")
def tenant_token(api_client, created_tenant):
    payload = {"email": created_tenant["email"], "password": created_tenant["password"]}
    response = api_client.post(f"{BASE_URL}/api/auth/login", json=payload, timeout=15)
    if response.status_code != 200:
        response = api_client.post(f"{BASE_URL}/api/saas/tenant-login", json=payload, timeout=15)
    assert response.status_code == 200, f"Tenant login failed: {response.status_code} {response.text[:300]}"
    token = response.json().get("access_token")
    assert token, "Tenant login returned no access token"
    return token


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
    def test_list_tenants(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/saas/tenants", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_tenant(self, created_tenant):
        # The fixture performs the actual POST and owns cascade cleanup.
        assert created_tenant["id"]
        assert created_tenant["email"].startswith("test-p486-saas-core-")
        assert created_tenant["db_name"]

    def test_created_tenant_appears_in_list(self, admin_client, created_tenant):
        r = admin_client.get(f"{BASE_URL}/api/saas/tenants", timeout=15)
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert created_tenant["id"] in ids


# ---------------- Tenant login + products ----------------

class TestTenantLogin:
    def test_tenant_can_login(self, tenant_token):
        assert isinstance(tenant_token, str)
        assert len(tenant_token.split(".")) == 3

    def test_tenant_products_empty(self, api_client, tenant_token):
        s = requests.Session()
        s.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {tenant_token}",
        })
        r = s.get(f"{BASE_URL}/api/products", timeout=15)
        assert r.status_code == 200, f"Products GET failed: {r.status_code} {r.text[:300]}"
        items = r.json()
        # response may be a list or paginated dict
        if isinstance(items, dict):
            items = items.get("items") or items.get("data") or []
        assert isinstance(items, list)
        assert len(items) == 0, f"Expected empty product list for new tenant, got {len(items)}"
