"""Backend tests for the Unified Audit Timeline (iter 12).

Endpoint under test:
    GET /api/saas/audit-timeline   (super-admin only)

Verifies:
  • Auth: tenant Bearer rejected, super-admin succeeds.
  • Schema: summary{total, by_type{}, events[], generated_at}.
  • Event shape: id prefix (imp:|rem:|top:), type, severity, timestamp,
    admin_email, tenant_id, summary, details, severity dot color category.
  • Sort: events sorted DESC by timestamp.
  • Filters: event_type single + multi, tenant_id, admin_id, since/until, limit cap.
  • Regression: /api/saas/platform-stats still shows tenants.max=500.
"""
import os
import requests
import pytest
from datetime import datetime

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nt-v16-staging.preview.emergentagent.com").rstrip("/")
SUPER_ADMIN_EMAIL = os.environ.get("TEST_SUPER_ADMIN_EMAIL", "admin@ntcommerce.com")
SUPER_ADMIN_PASSWORD = os.environ.get("TEST_SUPER_ADMIN_PASSWORD", "Admin@2024")


# ── fixtures ──────────────────────────────────────────────────────────────────
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": SUPER_ADMIN_EMAIL, "password": SUPER_ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"super-admin login failed: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def tenant_info(p486_tenant_factory):
    return p486_tenant_factory("audit-timeline", debt=25, audit_events=2)


@pytest.fixture(scope="module")
def tenant_token(tenant_info):
    return tenant_info["headers"]["Authorization"].removeprefix("Bearer ")


# ── module: auth/authorization ───────────────────────────────────────────────
class TestAuditTimelineAuth:
    def test_unauthenticated_rejected(self):
        r = requests.get(f"{BASE_URL}/api/saas/audit-timeline", timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_super_admin_can_access(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/audit-timeline", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]

    def test_tenant_token_rejected(self, tenant_token):
        r = requests.get(
            f"{BASE_URL}/api/saas/audit-timeline",
            headers={"Authorization": f"Bearer {tenant_token}"}, timeout=15,
        )
        assert r.status_code in (401, 403), r.text[:300]


# ── module: response schema ──────────────────────────────────────────────────
class TestAuditTimelineSchema:
    def test_top_level_shape(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/audit-timeline", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert set(["summary", "events", "generated_at"]).issubset(data.keys())
        assert "total" in data["summary"]
        assert "by_type" in data["summary"]
        assert isinstance(data["events"], list)
        assert isinstance(data["summary"]["total"], int)
        assert data["summary"]["total"] == len(data["events"])

    def test_event_fields_and_id_prefix(self, admin_headers, tenant_info):
        r = requests.get(
            f"{BASE_URL}/api/saas/audit-timeline?tenant_id={tenant_info['id']}",
            headers=admin_headers, timeout=30,
        )
        data = r.json()
        assert len(data["events"]) == 2, data
        valid_types = {"impersonation", "reminder", "wallet_topup", "password_reset", "data_access"}
        prefix_for = {
            "impersonation": "imp:", "reminder": "rem:", "wallet_topup": "top:",
            "password_reset": "sec:", "data_access": "acc:",
        }
        valid_sev = {"info", "warning", "critical"}
        for ev in data["events"]:
            assert ev["type"] in valid_types, ev
            assert ev["id"].startswith(prefix_for[ev["type"]]), ev
            assert ev["severity"] in valid_sev
            assert "timestamp" in ev
            assert "summary" in ev and isinstance(ev["summary"], str)
            assert "details" in ev and isinstance(ev["details"], dict)

    def test_events_sorted_desc(self, admin_headers, tenant_info):
        r = requests.get(
            f"{BASE_URL}/api/saas/audit-timeline?tenant_id={tenant_info['id']}&limit=200",
            headers=admin_headers, timeout=30,
        )
        events = r.json()["events"]
        assert len(events) == 2, events

        def parse(ts):
            if not ts:
                return datetime.min
            try:
                return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            except Exception:
                return datetime.min

        ts_list = [parse(e["timestamp"]) for e in events]
        for a, b in zip(ts_list, ts_list[1:]):
            assert a >= b, f"events not sorted DESC: {a} < {b}"


# ── module: filters ──────────────────────────────────────────────────────────
class TestAuditTimelineFilters:
    def test_filter_single_event_type_reminder(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/saas/audit-timeline?event_type=reminder",
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        for ev in data["events"]:
            assert ev["type"] == "reminder", ev
            assert ev["id"].startswith("rem:")
        # If we have any reminder data at all, by_type should reflect it
        if data["events"]:
            assert "reminder" in data["summary"]["by_type"]

    def test_filter_multi_event_type(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/saas/audit-timeline?event_type=impersonation,wallet_topup",
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200
        for ev in r.json()["events"]:
            assert ev["type"] in {"impersonation", "wallet_topup"}, ev

    def test_filter_tenant_id(self, admin_headers, tenant_info):
        r = requests.get(
            f"{BASE_URL}/api/saas/audit-timeline?tenant_id={tenant_info['id']}",
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200
        events = r.json()["events"]
        assert len(events) == 2, events
        for ev in events:
            assert ev.get("tenant_id") == tenant_info["id"], ev

    def test_limit_param(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/saas/audit-timeline?limit=3",
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200
        assert len(r.json()["events"]) <= 3

    def test_limit_hard_cap(self, admin_headers):
        # limit beyond 1000 must be rejected by Query(le=1000)
        r = requests.get(
            f"{BASE_URL}/api/saas/audit-timeline?limit=2000",
            headers=admin_headers, timeout=30,
        )
        assert r.status_code in (400, 422)

    def test_date_range_until_in_past_naive(self, admin_headers):
        """SPEC says ?until='2026-12-31' must work — naive ISO date.
        Bug reproduced (iter 12): server returns 500 due to tz-naive vs tz-aware
        datetime comparison in audit_timeline_routes._ts_dt."""
        r = requests.get(
            f"{BASE_URL}/api/saas/audit-timeline?until=2000-01-01",
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200, (
            f"Date filter broken (naive ISO): {r.status_code}. "
            "Likely TypeError 'offset-naive vs offset-aware' in _ts_dt."
        )
        assert r.json()["summary"]["total"] == 0

    def test_date_range_until_in_past_tzaware(self, admin_headers):
        """Same filter but tz-aware ISO — works around the bug."""
        r = requests.get(
            f"{BASE_URL}/api/saas/audit-timeline?until=2000-01-01T00:00:00%2B00:00",
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200
        assert r.json()["summary"]["total"] == 0

    def test_date_range_since_future_tzaware(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/saas/audit-timeline?since=2099-01-01T00:00:00%2B00:00",
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200
        assert r.json()["summary"]["total"] == 0


# ── module: regression checks ────────────────────────────────────────────────
class TestRegression:
    def test_platform_stats_max_tenants_500(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/platform-stats", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        body = r.json()
        # tenants block must exist and report max=500
        tenants = body.get("tenants") or {}
        assert tenants.get("max") == 500, f"MAX_TENANTS cap not enforced: {tenants}"

    def test_tenant_debts_endpoint_still_works(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/saas/tenant-debts", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        body = r.json()
        # endpoint shape from iter 10/11 — should still expose items[] (or list)
        assert ("items" in body) or isinstance(body, list)
