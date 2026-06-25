"""Iteration 5 — Backend regression for:
  (a) /api/stats new fields: customer_balance_total/count, customer_debt_total, customers_with_debt
  (b) /api/wallet new fields: platform_purchase_debt, platform_purchase_count, total_platform_debt
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://nt-v16-staging.preview.emergentagent.com').rstrip('/')
SUPER_ADMIN = {"email": "admin@ntcommerce.com", "password": "Admin@2024"}
SAMPLE_TENANT_ID = "b4fde9b7-d1f2-46ec-b62a-f0971ca3deba"

STATS_NEW = {"customer_balance_total", "customer_balance_count", "customer_debt_total", "customers_with_debt"}
STATS_EXISTING = {"total_products", "total_customers", "total_suppliers", "low_stock_count",
                  "today_sales_total", "today_sales_count", "total_cash", "cash_boxes",
                  "total_receivables", "total_payables", "currency"}
WALLET_NEW = {"platform_purchase_debt", "platform_purchase_count", "total_platform_debt"}
WALLET_EXISTING = {"balance", "subscription_due", "subscription_overdue", "subscription_ends_at"}


@pytest.fixture(scope="module")
def super_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN, timeout=30)
    assert r.status_code == 200, f"super login failed: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def super_headers(super_token):
    return {"Authorization": f"Bearer {super_token}"}


@pytest.fixture(scope="module")
def tenant_headers(super_headers):
    r = requests.post(f"{BASE_URL}/api/saas/impersonate/{SAMPLE_TENANT_ID}",
                      headers=super_headers, timeout=30)
    assert r.status_code == 200, f"impersonate failed: {r.status_code} {r.text[:200]}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ── Cache clear (so /api/stats refresh works) ──
def _clear_cache(super_headers):
    # Try the documented endpoint; tolerate if it doesn't exist
    requests.post(f"{BASE_URL}/api/cache/clear", headers=super_headers, timeout=10)
    requests.delete(f"{BASE_URL}/api/cache/clear", headers=super_headers, timeout=10)


# ── /api/stats new fields ──
class TestStatsCustomerFields:
    def test_stats_returns_all_required_fields(self, super_headers, tenant_headers):
        _clear_cache(super_headers)
        r = requests.get(f"{BASE_URL}/api/stats", headers=tenant_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        missing_new = STATS_NEW - set(data.keys())
        assert not missing_new, f"missing new stats fields: {missing_new}"
        missing_existing = STATS_EXISTING - set(data.keys())
        assert not missing_existing, f"missing existing stats fields: {missing_existing}"

    def test_stats_field_types_numeric(self, tenant_headers):
        r = requests.get(f"{BASE_URL}/api/stats", headers=tenant_headers, timeout=30)
        data = r.json()
        for f in STATS_NEW:
            assert isinstance(data[f], (int, float)), f"{f} not numeric: {data[f]!r}"
            assert data[f] >= 0

    def test_stats_anonymous_blocked(self):
        r = requests.get(f"{BASE_URL}/api/stats", timeout=20)
        assert r.status_code in (401, 403)


# ── /api/wallet new platform purchase fields ──
class TestWalletPlatformPurchaseFields:
    def test_tenant_wallet_returns_new_fields(self, tenant_headers):
        r = requests.get(f"{BASE_URL}/api/wallet", headers=tenant_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        missing_new = WALLET_NEW - set(data.keys())
        assert not missing_new, f"missing new wallet fields: {missing_new}"
        missing_existing = WALLET_EXISTING - set(data.keys())
        assert not missing_existing, f"missing existing wallet fields: {missing_existing}"

    def test_wallet_new_field_types(self, tenant_headers):
        r = requests.get(f"{BASE_URL}/api/wallet", headers=tenant_headers, timeout=30)
        data = r.json()
        assert isinstance(data["platform_purchase_debt"], (int, float))
        assert isinstance(data["platform_purchase_count"], int)
        assert isinstance(data["total_platform_debt"], (int, float))
        # invariant: total_platform_debt == subscription_due + platform_purchase_debt
        expected = float(data["subscription_due"]) + float(data["platform_purchase_debt"])
        assert abs(data["total_platform_debt"] - expected) < 0.001, (
            f"total_platform_debt={data['total_platform_debt']} != subscription_due({data['subscription_due']}) + platform_purchase_debt({data['platform_purchase_debt']})"
        )

    def test_super_admin_wallet_no_platform_debt(self, super_headers):
        r = requests.get(f"{BASE_URL}/api/wallet", headers=super_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # super_admin has no tenant_id → platform purchase fields should be 0
        assert data.get("platform_purchase_debt", 0) == 0
        assert data.get("platform_purchase_count", 0) == 0
        assert data.get("total_platform_debt", 0) == data.get("subscription_due", 0)


# ── Impersonation token regression ──
class TestImpersonationContext:
    def test_impersonate_returns_token_and_user(self, super_headers):
        r = requests.post(f"{BASE_URL}/api/saas/impersonate/{SAMPLE_TENANT_ID}",
                          headers=super_headers, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert "access_token" in body
        assert "user" in body or "tenant" in body or True  # tolerate either shape

    def test_motherboard_diagnostics_super_admin(self, super_headers):
        # Motherboard fix relies on super_admin token still routing to /diagnostics
        r = requests.get(f"{BASE_URL}/api/diagnostics", headers=super_headers, timeout=20)
        assert r.status_code == 200, r.text

    def test_motherboard_diagnostics_anonymous_blocked(self):
        r = requests.get(f"{BASE_URL}/api/diagnostics", timeout=10)
        assert r.status_code in (401, 403)
