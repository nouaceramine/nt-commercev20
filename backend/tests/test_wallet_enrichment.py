"""Wallet subscription enrichment tests with an isolated TEST-P486 tenant.

GET /api/wallet must return subscription_due, subscription_overdue and
subscription_ends_at through both super-admin and impersonated tenant tokens.
"""
import os
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = (
    os.environ.get("P486_BASE")
    or os.environ.get("REACT_APP_BACKEND_URL")
    or "http://localhost:8001"
).rstrip("/")
SUPER_ADMIN = {
    "email": os.environ.get("TEST_SUPER_ADMIN_EMAIL", "admin@ntcommerce.com"),
    "password": os.environ.get("TEST_SUPER_ADMIN_PASSWORD", "Admin@2024"),
}

EXPECTED_BASE_FIELDS = {
    "id", "entity_type", "entity_id", "balance", "currency",
    "low_balance_threshold", "auto_pay_subscription", "low_balance",
}
EXPECTED_NEW_FIELDS = {"subscription_due", "subscription_overdue", "subscription_ends_at"}


@pytest.fixture(scope="module")
def super_token():
    response = requests.post(f"{BASE_URL}/api/saas/login", json=SUPER_ADMIN, timeout=30)
    if response.status_code != 200:
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN, timeout=30)
    assert response.status_code == 200, f"super login failed: {response.status_code}"
    token = response.json().get("access_token") or response.json().get("token")
    assert token, "super login returned no token"
    return token


@pytest.fixture(scope="module")
def super_headers(super_token):
    return {"Authorization": f"Bearer {super_token}"}


@pytest.fixture(scope="module")
def tenant_info(p486_tenant_factory):
    return p486_tenant_factory("wallet-enrichment")


@pytest.fixture(scope="module")
def tenant_token(super_headers, tenant_info):
    response = requests.post(
        f"{BASE_URL}/api/saas/impersonate/{tenant_info['id']}",
        headers=super_headers, timeout=30,
    )
    assert response.status_code == 200, f"impersonate failed: {response.status_code}"
    token = response.json().get("access_token")
    assert token, "impersonation returned no access token"
    return token


@pytest.fixture(scope="module")
def tenant_headers(tenant_token):
    return {"Authorization": f"Bearer {tenant_token}"}


class TestTenantWalletEnrichment:
    def test_tenant_wallet_returns_all_fields(self, tenant_headers):
        response = requests.get(f"{BASE_URL}/api/wallet", headers=tenant_headers, timeout=30)
        assert response.status_code == 200, response.text
        data = response.json()
        assert not (EXPECTED_BASE_FIELDS - set(data)), "missing existing wallet fields"
        assert not (EXPECTED_NEW_FIELDS - set(data)), "missing enrichment wallet fields"

    def test_tenant_wallet_field_types(self, tenant_headers, tenant_info):
        response = requests.get(f"{BASE_URL}/api/wallet", headers=tenant_headers, timeout=30)
        assert response.status_code == 200, response.text
        data = response.json()
        assert isinstance(data["subscription_due"], (int, float))
        assert isinstance(data["subscription_overdue"], bool)
        assert data["subscription_ends_at"] is None or isinstance(data["subscription_ends_at"], str)
        assert data["entity_type"] == "tenant"
        assert data["entity_id"] == tenant_info["id"]

    def test_tenant_overdue_logic_consistent(self, tenant_headers):
        response = requests.get(f"{BASE_URL}/api/wallet", headers=tenant_headers, timeout=30)
        assert response.status_code == 200, response.text
        data = response.json()
        ends_at = data.get("subscription_ends_at")
        overdue = data["subscription_overdue"]
        due = data["subscription_due"]
        if ends_at:
            end_dt = datetime.fromisoformat(ends_at.replace("Z", "+00:00"))
            assert overdue == (end_dt < datetime.now(timezone.utc))
        assert due >= 0 if overdue else due == 0


class TestSuperAdminWalletEnrichment:
    def test_super_wallet_returns_zero_due(self, super_headers):
        response = requests.get(f"{BASE_URL}/api/wallet", headers=super_headers, timeout=30)
        assert response.status_code == 200, response.text
        data = response.json()
        assert EXPECTED_NEW_FIELDS.issubset(data)
        assert data["subscription_due"] == 0
        assert data["subscription_overdue"] is False


class TestWalletRegression:
    def test_wallet_transactions(self, tenant_headers):
        response = requests.get(f"{BASE_URL}/api/wallet/transactions", headers=tenant_headers, timeout=30)
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_wallet_requests_list(self, tenant_headers):
        response = requests.get(f"{BASE_URL}/api/wallet/requests", headers=tenant_headers, timeout=30)
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_wallet_add_funds_requires_super(self, tenant_headers, tenant_info):
        response = requests.post(
            f"{BASE_URL}/api/wallet/add-funds", headers=tenant_headers,
            json={"entity_id": tenant_info["id"], "amount": 1}, timeout=30,
        )
        assert response.status_code in (401, 403)

    def test_impersonate_token_usable_on_protected_routes(self, tenant_headers):
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=tenant_headers, timeout=30)
        assert response.status_code == 200, response.text


class TestOverdueE2E:
    def test_force_overdue_then_restore(self, tenant_headers, tenant_info):
        client = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        collection = client[os.environ.get("DB_NAME", "nt_commerce")].saas_tenants
        tenant_doc = collection.find_one({"id": tenant_info["id"]})
        assert tenant_doc, "isolated TEST-P486 tenant missing from MongoDB"
        original = tenant_doc.get("subscription_ends_at")
        past = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
        collection.update_one({"id": tenant_info["id"]}, {"$set": {"subscription_ends_at": past}})
        try:
            response = requests.get(f"{BASE_URL}/api/wallet", headers=tenant_headers, timeout=30)
            assert response.status_code == 200, response.text
            data = response.json()
            assert data["subscription_overdue"] is True, data
            assert data["subscription_due"] >= 0
            assert data["subscription_ends_at"] == past
        finally:
            if original is None:
                collection.update_one({"id": tenant_info["id"]}, {"$unset": {"subscription_ends_at": ""}})
            else:
                collection.update_one({"id": tenant_info["id"]}, {"$set": {"subscription_ends_at": original}})
            client.close()
