"""Iteration 7 — Impersonation audit-log feature tests."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nt-v16-staging.preview.emergentagent.com").rstrip("/")
SUPER_EMAIL = "admin@ntcommerce.com"
SUPER_PASS = "Admin@2024"
TENANT_ID = "b4fde9b7-d1f2-46ec-b62a-f0971ca3deba"


@pytest.fixture(scope="module")
def super_token():
    r = requests.post(f"{BASE_URL}/api/saas/auth/login",
                      json={"email": SUPER_EMAIL, "password": SUPER_PASS}, timeout=20)
    if r.status_code != 200:
        # try generic auth/login
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": SUPER_EMAIL, "password": SUPER_PASS}, timeout=20)
    assert r.status_code == 200, f"super login failed: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def session_data(super_token):
    """Create a fresh impersonation session for the rest of the tests."""
    h = {"Authorization": f"Bearer {super_token}",
         "X-Forwarded-For": "203.0.113.42, 10.0.0.1"}
    r = requests.post(f"{BASE_URL}/api/saas/impersonate/{TENANT_ID}",
                      headers=h, timeout=20)
    assert r.status_code == 200, f"impersonate failed: {r.status_code} {r.text[:200]}"
    return r.json()


# ── Impersonation start ──
class TestImpersonateStart:

    def test_response_shape_has_session_id(self, session_data):
        # Standard fields still present
        assert "access_token" in session_data
        assert session_data.get("tenant_id") == TENANT_ID
        assert "user" in session_data
        # New: impersonation_session_id
        sid = session_data.get("impersonation_session_id")
        assert sid and isinstance(sid, str) and len(sid) >= 32

    def test_log_entry_created(self, super_token, session_data):
        sid = session_data["impersonation_session_id"]
        h = {"Authorization": f"Bearer {super_token}"}
        r = requests.get(f"{BASE_URL}/api/saas/impersonation-logs?limit=200",
                         headers=h, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "total_active" in data and "items" in data
        match = next((it for it in data["items"] if it["id"] == sid), None)
        assert match is not None, "log entry not found"
        assert match["status"] == "active"
        assert match["admin_email"] == SUPER_EMAIL
        assert match["tenant_id"] == TENANT_ID
        assert match.get("tenant_name")  # non-empty
        assert match.get("tenant_email")  # non-empty
        assert match.get("ip"), "ip must be non-empty"
        # X-Forwarded-For first IP picked up
        assert match["ip"] == "203.0.113.42"
        assert match.get("started_at")
        assert match.get("stopped_at") is None


# ── Stop impersonation ──
class TestImpersonateStop:

    def test_stop_returns_ok_and_duration(self, super_token, session_data):
        sid = session_data["impersonation_session_id"]
        h = {"Authorization": f"Bearer {super_token}"}
        r = requests.post(f"{BASE_URL}/api/saas/impersonate/{sid}/stop",
                          headers=h, timeout=20)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert data.get("ok") is True
        assert isinstance(data.get("duration_seconds"), int)
        assert data["duration_seconds"] >= 0

    def test_log_now_closed_via_list(self, super_token, session_data):
        sid = session_data["impersonation_session_id"]
        h = {"Authorization": f"Bearer {super_token}"}
        r = requests.get(f"{BASE_URL}/api/saas/impersonation-logs?limit=200",
                         headers=h, timeout=20)
        assert r.status_code == 200
        match = next((it for it in r.json()["items"] if it["id"] == sid), None)
        assert match is not None
        assert match["status"] == "closed"
        assert match.get("stopped_at")
        assert isinstance(match.get("duration_seconds"), int)

    def test_stop_idempotent(self, super_token, session_data):
        sid = session_data["impersonation_session_id"]
        h = {"Authorization": f"Bearer {super_token}"}
        r = requests.post(f"{BASE_URL}/api/saas/impersonate/{sid}/stop",
                          headers=h, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data.get("ok") is True
        assert data.get("already_closed") is True

    def test_stop_unknown_session_404(self, super_token):
        h = {"Authorization": f"Bearer {super_token}"}
        r = requests.post(f"{BASE_URL}/api/saas/impersonate/does-not-exist-xyz/stop",
                          headers=h, timeout=20)
        assert r.status_code == 404

    def test_stop_unauthenticated_rejected(self, session_data):
        sid = session_data["impersonation_session_id"]
        r = requests.post(f"{BASE_URL}/api/saas/impersonate/{sid}/stop", timeout=20)
        assert r.status_code in (401, 403)

    def test_stop_tenant_token_rejected(self, session_data):
        # use the tenant access_token (impersonated) — not a super admin
        h = {"Authorization": f"Bearer {session_data['access_token']}"}
        r = requests.post(f"{BASE_URL}/api/saas/impersonate/{session_data['impersonation_session_id']}/stop",
                          headers=h, timeout=20)
        assert r.status_code in (401, 403)


# ── List logs ──
class TestImpersonationLogsList:

    def test_unauth_rejected(self):
        r = requests.get(f"{BASE_URL}/api/saas/impersonation-logs", timeout=20)
        assert r.status_code in (401, 403)

    def test_tenant_token_rejected(self, session_data):
        h = {"Authorization": f"Bearer {session_data['access_token']}"}
        r = requests.get(f"{BASE_URL}/api/saas/impersonation-logs", headers=h, timeout=20)
        assert r.status_code in (401, 403)

    def test_shape_and_sort(self, super_token):
        h = {"Authorization": f"Bearer {super_token}"}
        r = requests.get(f"{BASE_URL}/api/saas/impersonation-logs?limit=50",
                         headers=h, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data["total_active"], int)
        assert isinstance(data["items"], list)
        if len(data["items"]) >= 2:
            for a, b in zip(data["items"], data["items"][1:]):
                assert a["started_at"] >= b["started_at"], "items not DESC by started_at"
        # field check on first item
        if data["items"]:
            it = data["items"][0]
            for f in ("id", "tenant_id", "tenant_name", "tenant_email", "admin_id",
                      "admin_email", "admin_name", "ip", "user_agent", "started_at",
                      "stopped_at", "duration_seconds", "status"):
                assert f in it, f"missing field {f}"

    def test_tenant_filter(self, super_token):
        h = {"Authorization": f"Bearer {super_token}"}
        r = requests.get(f"{BASE_URL}/api/saas/impersonation-logs?tenant_id={TENANT_ID}&limit=50",
                         headers=h, timeout=20)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["tenant_id"] == TENANT_ID
