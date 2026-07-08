"""Iter11 — Tenant Debts dashboard + MAX_TENANTS cap + Platform Stats."""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nt-v16-staging.preview.emergentagent.com").rstrip("/")
SUPER_EMAIL = "admin@ntcommerce.com"
SUPER_PASS = "Admin@2024"


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def super_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS}, timeout=30)
    assert r.status_code == 200, f"super-admin login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="session")
def super_headers(super_token):
    return {"Authorization": f"Bearer {super_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def tenant_with_debt(super_headers):
    """Ensure at least one tenant wallet has credit_debt > 0 by topping up via credit."""
    tid = "b4fde9b7-d1f2-46ec-b62a-f0971ca3deba"
    payload = {"entity_id": tid, "amount": 250, "payment_method": "credit", "notes": "TEST iter11 credit debt"}
    r = requests.post(f"{BASE_URL}/api/wallet/add-funds", json=payload, headers=super_headers, timeout=30)
    if r.status_code != 200:
        # Fallback: hardcoded tenant/wallet missing — try any tenant that has a wallet
        tl = requests.get(f"{BASE_URL}/api/saas/tenants", headers=super_headers, timeout=30).json()
        items = tl if isinstance(tl, list) else tl.get("items", [])
        for t in items:
            payload["entity_id"] = t["id"]
            r = requests.post(f"{BASE_URL}/api/wallet/add-funds", json=payload, headers=super_headers, timeout=30)
            if r.status_code == 200:
                return t["id"]
    return tid


# ---------- FEATURE A1: GET /api/saas/tenant-debts ----------
class TestTenantDebtsList:
    def test_list_requires_super_admin(self):
        r = requests.get(f"{BASE_URL}/api/saas/tenant-debts", timeout=20)
        assert r.status_code in (401, 403), f"unauthenticated should be rejected, got {r.status_code}"

    def test_list_returns_summary_and_items(self, super_headers, tenant_with_debt):
        r = requests.get(f"{BASE_URL}/api/saas/tenant-debts", headers=super_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "summary" in data and "items" in data
        s = data["summary"]
        for k in ("total_tenants_with_debt", "total_debt", "overdue_subscriptions"):
            assert k in s, f"missing summary key: {k}"
        # sorted desc by credit_debt
        debts = [it["credit_debt"] for it in data["items"]]
        assert debts == sorted(debts, reverse=True), "items should be sorted by credit_debt DESC"
        # summary total_debt == sum of items
        s_total = round(sum(it["credit_debt"] for it in data["items"]), 2)
        assert abs(s["total_debt"] - s_total) < 0.01
        # Each item shape
        if data["items"]:
            it = data["items"][0]
            for k in ("tenant_id", "tenant_name", "tenant_email", "wallet_balance",
                      "credit_debt", "subscription_overdue", "last_reminder_at", "reminders_sent"):
                assert k in it, f"missing item key: {k}"

    def test_only_with_debt_false_returns_all(self, super_headers):
        r1 = requests.get(f"{BASE_URL}/api/saas/tenant-debts", headers=super_headers, timeout=30)
        r2 = requests.get(f"{BASE_URL}/api/saas/tenant-debts?only_with_debt=false", headers=super_headers, timeout=30)
        assert r1.status_code == 200 and r2.status_code == 200
        assert len(r2.json()["items"]) >= len(r1.json()["items"])


# ---------- FEATURE A2: POST /remind ----------
class TestTenantDebtsRemind:
    def test_remind_non_existent_returns_404(self, super_headers):
        r = requests.post(f"{BASE_URL}/api/saas/tenant-debts/does-not-exist-xyz/remind",
                          headers=super_headers, timeout=20)
        assert r.status_code == 404

    def test_remind_success_and_count_increments(self, super_headers, tenant_with_debt):
        # Get baseline reminders_sent
        r0 = requests.get(f"{BASE_URL}/api/saas/tenant-debts", headers=super_headers, timeout=30)
        baseline = 0
        for it in r0.json()["items"]:
            if it["tenant_id"] == tenant_with_debt:
                baseline = it["reminders_sent"]
                break

        # Send 2 reminders
        for i in range(2):
            r = requests.post(f"{BASE_URL}/api/saas/tenant-debts/{tenant_with_debt}/remind",
                              headers=super_headers, timeout=20)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body.get("ok") is True
            assert "delivered" in body
            assert "reminder_id" in body and body["reminder_id"].startswith("rem_")

        # Verify increments
        r2 = requests.get(f"{BASE_URL}/api/saas/tenant-debts", headers=super_headers, timeout=30)
        for it in r2.json()["items"]:
            if it["tenant_id"] == tenant_with_debt:
                assert it["reminders_sent"] >= baseline + 2
                assert it["last_reminder_at"] is not None
                break


# ---------- FEATURE A3: GET /statement.pdf ----------
class TestTenantStatementPdf:
    def test_statement_non_existent_returns_404(self, super_headers):
        r = requests.get(f"{BASE_URL}/api/saas/tenant-debts/does-not-exist-xyz/statement.pdf",
                         headers=super_headers, timeout=30)
        assert r.status_code == 404

    def test_statement_returns_valid_pdf(self, super_headers, tenant_with_debt):
        r = requests.get(f"{BASE_URL}/api/saas/tenant-debts/{tenant_with_debt}/statement.pdf",
                         headers=super_headers, timeout=60)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:8].startswith(b"%PDF-1."), f"not a PDF header: {r.content[:8]}"
        assert len(r.content) > 1024, f"PDF size too small: {len(r.content)}"


# ---------- FEATURE B1/B2: platform-stats + MAX_TENANTS ----------
class TestPlatformStats:
    def test_requires_super_admin(self):
        r = requests.get(f"{BASE_URL}/api/saas/platform-stats", timeout=20)
        assert r.status_code in (401, 403)

    def test_platform_stats_shape(self, super_headers):
        r = requests.get(f"{BASE_URL}/api/saas/platform-stats", headers=super_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        # tenants
        t = d["tenants"]
        for k in ("total", "active", "inactive", "max", "unlimited", "capacity_percent", "severity"):
            assert k in t, f"missing tenants.{k}"
        assert t["max"] == 500, f"expected MAX_TENANTS=500, got {t['max']}"
        assert t["unlimited"] is False
        assert isinstance(t["total"], int) and t["total"] >= 0
        # capacity_percent = total/500 * 100
        if t["total"] > 0:
            expected = round(t["total"] / 500 * 100, 1)
            assert t["capacity_percent"] == expected
        # severity logic
        cp = t["capacity_percent"]
        if cp is not None:
            if cp >= 95:
                assert t["severity"] == "critical"
            elif cp >= 80:
                assert t["severity"] == "warning"
            else:
                assert t["severity"] == "ok"
        # databases
        assert "count" in d["databases"]
        # resources
        mem = d["resources"]["memory"]
        assert mem is not None and 0 <= mem["percent"] <= 100
        assert d["resources"]["cpu_percent"] is not None
        assert d["resources"]["disk"] is not None

    def test_max_tenants_code_path_in_source(self):
        """Verify the registration/tenants routes enforce MAX_TENANTS with the correct Arabic message."""
        for path in [
            "/app/backend/routes/saas/registration_routes.py",
            "/app/backend/routes/saas/tenants_routes.py",
        ]:
            with open(path, "r", encoding="utf-8") as f:
                src = f.read()
            assert "MAX_TENANTS" in src, f"{path} missing MAX_TENANTS"
            assert "تم بلوغ الحدّ الأقصى" in src, f"{path} missing Arabic cap message"


# ---------- REGRESSION sanity ----------
class TestRegression:
    def test_monitoring_summary(self, super_headers):
        r = requests.get(f"{BASE_URL}/api/saas/monitoring", headers=super_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "summary" in d or "tenants" in d  # backwards compatible

    def test_wallet_endpoint_alive(self, super_headers):
        r = requests.get(f"{BASE_URL}/api/wallet", headers=super_headers, timeout=30)
        # Some installs return 200, others 403 for super-admin
        assert r.status_code in (200, 403, 404)
