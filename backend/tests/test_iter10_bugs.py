"""Iteration 10 — verify 6 super-admin bug fixes + regressions."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://nt-v16-staging.preview.emergentagent.com').rstrip('/')
ADMIN_EMAIL = "admin@ntcommerce.com"
ADMIN_PASS = "Admin@2024"
TENANT_ID = "b4fde9b7-d1f2-46ec-b62a-f0971ca3deba"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/saas/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    if r.status_code != 200:
        # Try alternate path
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"Super admin login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ── BUG #2 — /saas/monitoring summary ──
class TestMonitoring:
    def test_monitoring_includes_summary(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/monitoring", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "summary" in body, "summary missing"
        s = body["summary"]
        for k in ("total_tenants", "active_tenants", "total_products",
                  "total_customers", "total_sales", "total_revenue"):
            assert k in s, f"summary.{k} missing"
            assert isinstance(s[k], (int, float)), f"summary.{k} not numeric"
        assert "alerts" in body and isinstance(body["alerts"], list)
        assert "tenants" in body and isinstance(body["tenants"], list)
        if body["tenants"]:
            t0 = body["tenants"][0]
            for f in ("tenant_name", "total_revenue", "users_count", "last_activity"):
                assert f in t0, f"per-tenant field {f} missing"


# ── BUG #3 — AI Assistant for super_admin ──
class TestAIAssistant:
    def test_ai_chat_super_admin_basic(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/ai-assistant/chat",
                          headers=admin_headers,
                          json={"message": "مرحبا", "session_id": "sa-test"}, timeout=60)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "response" in data and isinstance(data["response"], str) and len(data["response"]) > 0

    def test_ai_chat_with_sales_context_graceful(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/ai-assistant/chat",
                          headers=admin_headers,
                          json={"message": "ما هي المبيعات؟", "session_id": "sa-ctx", "context": "sales"},
                          timeout=60)
        assert r.status_code == 200, f"context fallback failed: {r.status_code} {r.text}"
        assert len(r.json().get("response", "")) > 0


# ── BUG #6 — Wallet Add-Funds with payment_method credit + Settle-Credit ──
class TestWalletCredit:
    def test_credit_topup_and_settle_flow(self, admin_headers):
        # Read initial wallet state
        r = requests.get(f"{BASE_URL}/api/wallet/all", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        wallets = r.json()
        tenant_wallet = next((w for w in wallets if w.get("entity_id") == TENANT_ID), None)
        assert tenant_wallet, f"Tenant wallet not found for {TENANT_ID}"
        bal0 = float(tenant_wallet.get("balance", 0))
        debt0 = float(tenant_wallet.get("credit_debt") or 0)

        # ── add 500 credit
        r = requests.post(f"{BASE_URL}/api/wallet/add-funds",
                          headers=admin_headers,
                          json={"entity_id": TENANT_ID, "amount": 500, "payment_method": "credit"},
                          timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("payment_method") == "credit"
        assert float(r.json().get("new_balance")) == bal0 + 500

        # ── verify credit_debt incremented
        r = requests.get(f"{BASE_URL}/api/wallet/all", headers=admin_headers, timeout=30)
        tw = next(w for w in r.json() if w.get("entity_id") == TENANT_ID)
        assert float(tw.get("credit_debt") or 0) == debt0 + 500
        assert float(tw.get("balance")) == bal0 + 500

        # ── settle 200
        r = requests.post(f"{BASE_URL}/api/wallet/settle-credit",
                          headers=admin_headers,
                          json={"entity_id": TENANT_ID, "amount": 200},
                          timeout=30)
        assert r.status_code == 200, r.text
        assert float(r.json().get("credit_debt_remaining")) == debt0 + 300

        # ── try to settle more than owed → 400
        excessive = debt0 + 500
        r = requests.post(f"{BASE_URL}/api/wallet/settle-credit",
                          headers=admin_headers,
                          json={"entity_id": TENANT_ID, "amount": excessive},
                          timeout=30)
        assert r.status_code == 400, f"expected 400, got {r.status_code}"

        # cleanup: settle remaining debt to restore state
        remaining = debt0 + 300
        if remaining > debt0:
            requests.post(f"{BASE_URL}/api/wallet/settle-credit",
                          headers=admin_headers,
                          json={"entity_id": TENANT_ID, "amount": remaining - debt0}, timeout=30)

    def test_add_funds_invalid_payment_method(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/wallet/add-funds",
                          headers=admin_headers,
                          json={"entity_id": TENANT_ID, "amount": 10, "payment_method": "bogus"},
                          timeout=30)
        assert r.status_code == 400

    def test_settle_credit_unauthorized(self):
        r = requests.post(f"{BASE_URL}/api/wallet/settle-credit",
                          json={"entity_id": TENANT_ID, "amount": 10}, timeout=30)
        assert r.status_code in (401, 403)


# ── REGRESSION — total_platform_debt on /api/wallet ──
class TestWalletRegression:
    def test_wallet_returns_total_platform_debt(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/wallet", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert "total_platform_debt" in r.json()
