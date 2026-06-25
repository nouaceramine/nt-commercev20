"""Test the new wallet subscription enrichment fields (iteration 4).

GET /api/wallet must return:
  - subscription_due (number)
  - subscription_overdue (bool)
  - subscription_ends_at (ISO string or None)
plus existing fields. Verified through both super_admin and impersonated tenant.
"""
import os
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://nt-v16-staging.preview.emergentagent.com').rstrip('/')
SUPER_ADMIN = {"email": "admin@ntcommerce.com", "password": "Admin@2024"}
SAMPLE_TENANT_ID = "b4fde9b7-d1f2-46ec-b62a-f0971ca3deba"

EXPECTED_BASE_FIELDS = {
    "id", "entity_type", "entity_id", "balance", "currency",
    "low_balance_threshold", "auto_pay_subscription", "low_balance",
}
EXPECTED_NEW_FIELDS = {"subscription_due", "subscription_overdue", "subscription_ends_at"}


@pytest.fixture(scope="module")
def super_token():
    r = requests.post(f"{BASE_URL}/api/saas/login", json=SUPER_ADMIN, timeout=30)
    if r.status_code != 200:
        # fallback to unified auth
        r = requests.post(f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN, timeout=30)
    assert r.status_code == 200, f"super login failed: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def super_headers(super_token):
    return {"Authorization": f"Bearer {super_token}"}


@pytest.fixture(scope="module")
def tenant_token(super_headers):
    r = requests.post(f"{BASE_URL}/api/saas/impersonate/{SAMPLE_TENANT_ID}",
                      headers=super_headers, timeout=30)
    assert r.status_code == 200, f"impersonate failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    assert "access_token" in data
    return data["access_token"]


@pytest.fixture(scope="module")
def tenant_headers(tenant_token):
    return {"Authorization": f"Bearer {tenant_token}"}


# ── Tenant wallet enrichment ──
class TestTenantWalletEnrichment:
    def test_tenant_wallet_returns_all_fields(self, tenant_headers):
        r = requests.get(f"{BASE_URL}/api/wallet", headers=tenant_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        missing_base = EXPECTED_BASE_FIELDS - set(data.keys())
        assert not missing_base, f"missing existing fields: {missing_base}"
        missing_new = EXPECTED_NEW_FIELDS - set(data.keys())
        assert not missing_new, f"missing new fields: {missing_new}"

    def test_tenant_wallet_field_types(self, tenant_headers):
        r = requests.get(f"{BASE_URL}/api/wallet", headers=tenant_headers, timeout=30)
        data = r.json()
        assert isinstance(data["subscription_due"], (int, float))
        assert isinstance(data["subscription_overdue"], bool)
        # subscription_ends_at can be None or ISO string
        sea = data["subscription_ends_at"]
        assert sea is None or isinstance(sea, str)
        assert data["entity_type"] == "tenant"
        assert data["entity_id"] == SAMPLE_TENANT_ID

    def test_tenant_overdue_logic_consistent(self, tenant_headers):
        r = requests.get(f"{BASE_URL}/api/wallet", headers=tenant_headers, timeout=30)
        data = r.json()
        sea = data.get("subscription_ends_at")
        overdue = data["subscription_overdue"]
        due = data["subscription_due"]
        if sea:
            end_dt = datetime.fromisoformat(sea.replace("Z", "+00:00"))
            now = datetime.now(timezone.utc)
            expected_overdue = end_dt < now
            assert overdue == expected_overdue, (
                f"overdue flag wrong: ends_at={sea} expected={expected_overdue} got={overdue}"
            )
        # When not overdue, due must be 0
        if not overdue:
            assert due == 0
        else:
            # when overdue, due is the plan price for subscription_type — must be >= 0
            assert due >= 0


# ── Super-admin wallet (no tenant_id) ──
class TestSuperAdminWalletEnrichment:
    def test_super_wallet_returns_zero_due(self, super_headers):
        r = requests.get(f"{BASE_URL}/api/wallet", headers=super_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert EXPECTED_NEW_FIELDS.issubset(set(data.keys()))
        assert data["subscription_due"] == 0
        assert data["subscription_overdue"] is False


# ── Regression: existing wallet sub-routes still work ──
class TestWalletRegression:
    def test_wallet_transactions(self, tenant_headers):
        r = requests.get(f"{BASE_URL}/api/wallet/transactions", headers=tenant_headers, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_wallet_requests_list(self, tenant_headers):
        r = requests.get(f"{BASE_URL}/api/wallet/requests", headers=tenant_headers, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_wallet_add_funds_requires_super(self, tenant_headers):
        # tenant calling add-funds should be 403
        r = requests.post(f"{BASE_URL}/api/wallet/add-funds",
                          headers=tenant_headers,
                          json={"entity_id": SAMPLE_TENANT_ID, "amount": 1},
                          timeout=30)
        assert r.status_code in (401, 403)

    def test_impersonate_token_usable_on_protected_routes(self, tenant_headers):
        # /api/auth/me should resolve using the impersonation token
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=tenant_headers, timeout=30)
        assert r.status_code == 200, r.text


# ── Overdue end-to-end (mutate tenant subscription_ends_at to past, verify, restore) ──
class TestOverdueE2E:
    def test_force_overdue_then_restore(self, super_headers, tenant_headers):
        # TenantUpdate model doesn't expose subscription_ends_at, so we mutate it directly in Mongo.
        # This validates the get_wallet endpoint correctly flips overdue=True when ends_at < now.
        from pymongo import MongoClient
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "nt_commerce")
        client = MongoClient(mongo_url)
        coll = client[db_name].saas_tenants
        tenant_doc = coll.find_one({"id": SAMPLE_TENANT_ID})
        if not tenant_doc:
            pytest.skip("tenant not present in DB")
        original = tenant_doc.get("subscription_ends_at")

        past = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
        coll.update_one({"id": SAMPLE_TENANT_ID}, {"$set": {"subscription_ends_at": past}})
        try:
            r = requests.get(f"{BASE_URL}/api/wallet", headers=tenant_headers, timeout=30)
            assert r.status_code == 200
            data = r.json()
            assert data["subscription_overdue"] is True, data
            assert data["subscription_due"] >= 0
            assert data["subscription_ends_at"] == past
        finally:
            if original is not None:
                coll.update_one({"id": SAMPLE_TENANT_ID}, {"$set": {"subscription_ends_at": original}})
            client.close()
