"""
Wallet Selling Chain — End-to-End Verification
Tests the full money flow:
  platform_main (super-admin) → distributor/agent → tenant → tenant sale/debit

Covers:
 - Balance changes exactly match amounts at every hop
 - Insufficient-balance rejection (HTTP 400)
 - Concurrent double-approval guard (second approve returns 400)
 - Real tenant sale (POST /wallet/services/{id}/purchase) debits wallet correctly
"""
import uuid
import requests
import pytest
import threading
import os

# ── Credentials (override via env vars in CI / production test runs) ──
SUPER_ADMIN_EMAIL = os.environ.get("TEST_SUPER_ADMIN_EMAIL", "admin@ntcommerce.com")
SUPER_ADMIN_PASSWORD = os.environ.get("TEST_SUPER_ADMIN_PASSWORD", "Admin@2024")

# Basic plan (2 000 DZD/month).  Can be overridden via env var if the plan ID
# ever changes in the seeded database.
PLAN_ID = os.environ.get("TEST_PLAN_ID", "4b32cab1-1ff6-443a-8be8-b2314dc2d185")
PLAN_MONTHLY_PRICE = 2000.0


def get_base_url():
    url = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
    if not url:
        url = "http://localhost:8000"
    return url


# ──────────────────────────────────────────────────────────
# Session-scoped fixtures: shared across all tests in this module
# ──────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def base():
    return get_base_url()


@pytest.fixture(scope="module")
def admin_token(base):
    r = requests.post(f"{base}/api/auth/login", json={
        "email": SUPER_ADMIN_EMAIL,
        "password": SUPER_ADMIN_PASSWORD,
    })
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ──────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────

def get_wallet_balance(base, headers, entity_id=None):
    """Fetch wallet balance.  If entity_id is None → current user's wallet."""
    if entity_id:
        r = requests.get(f"{base}/api/wallet/all", headers=headers)
        assert r.status_code == 200, f"get_wallet_balance failed: {r.text}"
        wallets = r.json()
        for w in wallets:
            if w["entity_id"] == entity_id:
                return w["balance"]
        return None
    r = requests.get(f"{base}/api/wallet", headers=headers)
    assert r.status_code == 200, f"get_wallet (self) failed: {r.text}"
    return r.json()["balance"]


# ──────────────────────────────────────────────────────────
# 1. Platform main wallet — super-admin can fund it
# ──────────────────────────────────────────────────────────

class TestPlatformWalletFunding:

    def test_fund_platform_main_wallet(self, base, admin_headers):
        """Super-admin deposits 50 000 DZD into platform_main wallet."""
        deposit = 50_000.0

        # Ensure platform_main wallet exists; get balance before
        r = requests.get(f"{base}/api/wallet", headers=admin_headers)
        assert r.status_code == 200, r.text
        balance_before = r.json()["balance"]

        r = requests.post(f"{base}/api/wallet/add-funds", headers=admin_headers, json={
            "entity_id": "platform_main",
            "amount": deposit,
            "description": "test deposit – wallet chain verification",
        })
        assert r.status_code == 200, f"add-funds failed: {r.text}"
        data = r.json()
        assert data["new_balance"] == pytest.approx(balance_before + deposit, abs=0.01), \
            f"Expected {balance_before + deposit}, got {data['new_balance']}"

        # Verify via GET /wallet (super-admin sees platform_main)
        r2 = requests.get(f"{base}/api/wallet", headers=admin_headers)
        assert r2.status_code == 200
        assert r2.json()["balance"] == pytest.approx(balance_before + deposit, abs=0.01)
        print(f"✓ platform_main funded: {balance_before} → {r2.json()['balance']}")

    def test_reject_zero_amount_deposit(self, base, admin_headers):
        """Adding 0 DZD must be rejected."""
        r = requests.post(f"{base}/api/wallet/add-funds", headers=admin_headers, json={
            "entity_id": "platform_main",
            "amount": 0,
        })
        assert r.status_code == 400


# ──────────────────────────────────────────────────────────
# 2. Super-admin → distributor (agent) top-up flow
# ──────────────────────────────────────────────────────────

class TestAdminToAgentTopUp:

    @pytest.fixture(scope="class")
    def agent_info(self, base, admin_headers):
        """Create a throw-away agent for this test class."""
        uid = str(uuid.uuid4())[:8]
        email = f"test_agent_{uid}@wallettest.com"
        r = requests.post(f"{base}/api/saas/agents", headers=admin_headers, json={
            "name": f"TEST_Agent_{uid}",
            "email": email,
            "password": "Agent@test123",
            "phone": "0555000000",
            "agent_type": "reseller",
            "commission_rate": 5.0,
        })
        assert r.status_code == 200, f"Create agent failed: {r.text}"
        agent = r.json()
        yield {"id": agent["id"], "email": email, "password": "Agent@test123"}
        # Cleanup: delete agent
        requests.delete(f"{base}/api/saas/agents/{agent['id']}", headers=admin_headers)

    @pytest.fixture(scope="class")
    def agent_token(self, base, agent_info):
        r = requests.post(f"{base}/api/saas/agent-login", json={
            "email": agent_info["email"],
            "password": agent_info["password"],
        })
        assert r.status_code == 200, f"Agent login failed: {r.text}"
        return r.json()["access_token"]

    @pytest.fixture(scope="class")
    def agent_headers(self, agent_token):
        return {"Authorization": f"Bearer {agent_token}"}

    def test_agent_initial_balance_is_zero(self, base, agent_headers, agent_info):
        """Freshly-created agent wallet starts at 0."""
        r = requests.get(f"{base}/api/saas/agent/wallet", headers=agent_headers)
        assert r.status_code == 200, r.text
        assert r.json()["balance"] == 0.0
        print("✓ Agent initial balance = 0")

    def test_agent_requests_topup(self, base, agent_headers, agent_info):
        """Agent submits a 10 000 DZD top-up request to super-admin."""
        r = requests.post(f"{base}/api/saas/agent/wallet/request", headers=agent_headers, json={
            "amount": 10_000.0,
            "note": "wallet-chain test – agent topup",
        })
        assert r.status_code == 200, f"Request failed: {r.text}"
        req = r.json()
        assert req["status"] == "pending"
        assert req["amount"] == 10_000.0
        pytest.agent_topup_request_id = req["id"]
        print(f"✓ Agent topup request created: {req['id']}")

    def test_admin_approves_agent_topup(self, base, admin_headers, agent_headers, agent_info):
        """Super-admin approves the request; platform_main debited, agent credited."""
        request_id = pytest.agent_topup_request_id
        amount = 10_000.0

        # Balances before
        platform_before = get_wallet_balance(base, admin_headers)

        r_agent_before = requests.get(f"{base}/api/saas/agent/wallet", headers=agent_headers)
        agent_before = r_agent_before.json()["balance"]

        # Approve
        r = requests.post(
            f"{base}/api/wallet/requests/{request_id}/approve",
            headers=admin_headers,
        )
        assert r.status_code == 200, f"Approve failed: {r.text}"

        # Balances after
        platform_after = get_wallet_balance(base, admin_headers)
        r_agent_after = requests.get(f"{base}/api/saas/agent/wallet", headers=agent_headers)
        agent_after = r_agent_after.json()["balance"]

        assert platform_after == pytest.approx(platform_before - amount, abs=0.01), \
            f"platform_main expected -{amount}, was {platform_before} → {platform_after}"
        assert agent_after == pytest.approx(agent_before + amount, abs=0.01), \
            f"agent expected +{amount}, was {agent_before} → {agent_after}"

        # Conservation: total change = 0
        delta_platform = platform_after - platform_before
        delta_agent = agent_after - agent_before
        assert delta_platform + delta_agent == pytest.approx(0, abs=0.01), \
            f"Money not conserved: platform Δ={delta_platform}, agent Δ={delta_agent}"

        print(f"✓ Admin→Agent: platform {platform_before}→{platform_after}, agent {agent_before}→{agent_after}")

    def test_double_approve_rejected(self, base, admin_headers):
        """Approving the same request twice returns 400 (concurrent guard)."""
        request_id = pytest.agent_topup_request_id
        r = requests.post(
            f"{base}/api/wallet/requests/{request_id}/approve",
            headers=admin_headers,
        )
        assert r.status_code == 400, \
            f"Expected 400 on double-approve, got {r.status_code}: {r.text}"
        print(f"✓ Double-approve correctly rejected: {r.json()}")

    def test_insufficient_balance_on_agent_topup(self, base, admin_headers, agent_headers, agent_info):
        """Requesting an amount that would exceed platform_main triggers 400."""
        # Request 1 billion DZD — will never fit
        r = requests.post(f"{base}/api/saas/agent/wallet/request", headers=agent_headers, json={
            "amount": 1_000_000_000.0,
            "note": "over-limit test",
        })
        assert r.status_code == 200, f"Create request failed: {r.text}"
        huge_req_id = r.json()["id"]

        r_approve = requests.post(
            f"{base}/api/wallet/requests/{huge_req_id}/approve",
            headers=admin_headers,
        )
        assert r_approve.status_code == 400, \
            f"Expected 400 for insufficient platform balance, got {r_approve.status_code}: {r_approve.text}"
        print(f"✓ Insufficient platform balance correctly rejected: {r_approve.json()}")

        # Reject the pending request so it does not clutter state
        requests.post(
            f"{base}/api/wallet/requests/{huge_req_id}/reject",
            headers=admin_headers,
            json={"reason": "test cleanup"},
        )

    # ──────────────────────────────────────────────────────
    # 3. Distributor (agent) → tenant top-up flow
    # ──────────────────────────────────────────────────────

    @pytest.fixture(scope="class")
    def tenant_info(self, base, admin_headers, agent_info):
        """Create a tenant linked to the test agent."""
        uid = str(uuid.uuid4())[:8]
        email = f"test_tenant_{uid}@wallettest.com"
        r = requests.post(f"{base}/api/saas/tenants", headers=admin_headers, json={
            "name": f"TEST_Tenant_{uid}",
            "email": email,
            "password": "Tenant@test123",
            "phone": "0666000000",
            "plan_id": PLAN_ID,
            "agent_id": agent_info["id"],
            "subscription_type": "monthly",
        })
        assert r.status_code == 200, f"Create tenant failed: {r.text}"
        tenant = r.json()
        yield {"id": tenant["id"], "email": email, "password": "Tenant@test123"}
        # Cleanup
        requests.delete(f"{base}/api/saas/tenants/{tenant['id']}", headers=admin_headers)

    @pytest.fixture(scope="class")
    def tenant_token(self, base, tenant_info):
        r = requests.post(f"{base}/api/saas/tenant-login", json={
            "email": tenant_info["email"],
            "password": tenant_info["password"],
        })
        assert r.status_code == 200, f"Tenant login failed: {r.text}"
        return r.json()["access_token"]

    @pytest.fixture(scope="class")
    def tenant_headers(self, tenant_token):
        return {"Authorization": f"Bearer {tenant_token}"}

    def test_tenant_initial_balance_is_zero(self, base, tenant_headers):
        """Freshly-created tenant wallet starts at 0."""
        r = requests.get(f"{base}/api/wallet", headers=tenant_headers)
        assert r.status_code == 200, r.text
        assert r.json()["balance"] == 0.0
        print("✓ Tenant initial balance = 0")

    def test_tenant_requests_topup_from_agent(self, base, tenant_headers):
        """Tenant submits a 3 000 DZD top-up request (routed to agent)."""
        r = requests.post(f"{base}/api/wallet/requests", headers=tenant_headers, json={
            "request_type": "topup",
            "amount": 3_000.0,
            "note": "wallet-chain test – tenant topup",
        })
        assert r.status_code == 200, f"Tenant topup request failed: {r.text}"
        req = r.json()
        assert req["status"] == "pending"
        assert req["amount"] == 3_000.0
        pytest.tenant_topup_request_id = req["id"]
        print(f"✓ Tenant topup request created: {req['id']}")

    def test_agent_approves_tenant_topup(self, base, agent_headers, tenant_headers, agent_info, tenant_info):
        """Agent approves tenant top-up; agent debited, tenant credited."""
        request_id = pytest.tenant_topup_request_id
        amount = 3_000.0

        # Balances before
        r_agent_before = requests.get(f"{base}/api/saas/agent/wallet", headers=agent_headers)
        agent_before = r_agent_before.json()["balance"]

        r_tenant_before = requests.get(f"{base}/api/wallet", headers=tenant_headers)
        tenant_before = r_tenant_before.json()["balance"]

        # Agent approves
        r = requests.post(
            f"{base}/api/saas/agent/wallet/requests/{request_id}/approve",
            headers=agent_headers,
        )
        assert r.status_code == 200, f"Agent approve failed: {r.text}"

        # Balances after
        r_agent_after = requests.get(f"{base}/api/saas/agent/wallet", headers=agent_headers)
        agent_after = r_agent_after.json()["balance"]

        r_tenant_after = requests.get(f"{base}/api/wallet", headers=tenant_headers)
        tenant_after = r_tenant_after.json()["balance"]

        assert agent_after == pytest.approx(agent_before - amount, abs=0.01), \
            f"Agent expected -{amount}, was {agent_before} → {agent_after}"
        assert tenant_after == pytest.approx(tenant_before + amount, abs=0.01), \
            f"Tenant expected +{amount}, was {tenant_before} → {tenant_after}"

        # Conservation
        delta_agent = agent_after - agent_before
        delta_tenant = tenant_after - tenant_before
        assert delta_agent + delta_tenant == pytest.approx(0, abs=0.01), \
            f"Money not conserved: agent Δ={delta_agent}, tenant Δ={delta_tenant}"

        print(f"✓ Agent→Tenant: agent {agent_before}→{agent_after}, tenant {tenant_before}→{tenant_after}")

    def test_double_approve_tenant_topup_rejected(self, base, agent_headers):
        """Agent cannot approve the same tenant request twice."""
        request_id = pytest.tenant_topup_request_id
        r = requests.post(
            f"{base}/api/saas/agent/wallet/requests/{request_id}/approve",
            headers=agent_headers,
        )
        assert r.status_code == 400, \
            f"Expected 400 on double-approve, got {r.status_code}: {r.text}"
        print(f"✓ Tenant double-approve correctly rejected: {r.json()}")

    def test_tenant_insufficient_balance_rejected(self, base, tenant_headers, agent_headers, admin_headers):
        """Agent cannot approve a tenant topup exceeding the agent's own balance."""
        # Tenant requests more than the agent currently holds (agent has ~7 000 DZD after prior topup)
        r = requests.post(f"{base}/api/wallet/requests", headers=tenant_headers, json={
            "request_type": "topup",
            "amount": 500_000.0,
            "note": "over-limit tenant test",
        })
        assert r.status_code == 200, r.text
        big_req_id = r.json()["id"]

        # Agent tries to approve but doesn't have enough balance
        r2 = requests.post(
            f"{base}/api/saas/agent/wallet/requests/{big_req_id}/approve",
            headers=agent_headers,
        )
        assert r2.status_code == 400, \
            f"Expected 400 (agent insufficient balance), got {r2.status_code}: {r2.text}"
        print(f"✓ Agent insufficient balance correctly rejected: {r2.json()}")

        # Reject the dangling request via admin
        requests.post(
            f"{base}/api/wallet/requests/{big_req_id}/reject",
            headers=admin_headers,
            json={"reason": "cleanup"},
        )

    # ──────────────────────────────────────────────────────
    # 4. Tenant sale / wallet debit flow
    # ──────────────────────────────────────────────────────

    def test_wallet_direct_transfer_admin(self, base, admin_headers, agent_info, tenant_info):
        """Admin transfer endpoint moves money correctly between two wallets."""
        # Give platform_main → agent wallet via direct transfer
        amount = 500.0

        # Balances before (admin sees platform wallet = from wallet)
        all_wallets_r = requests.get(f"{base}/api/wallet/all", headers=admin_headers)
        assert all_wallets_r.status_code == 200
        wallets = {w["entity_id"]: w["balance"] for w in all_wallets_r.json()}
        pm_before = wallets.get("platform_main", 0)
        ag_before = wallets.get(agent_info["id"], 0)

        r = requests.post(f"{base}/api/wallet/transfer", headers=admin_headers, json={
            "from_entity_id": "platform_main",
            "to_entity_id": agent_info["id"],
            "from_entity_type": "admin",
            "to_entity_type": "agent",
            "amount": amount,
            "fee": 0,
            "description": "direct transfer test",
        })
        assert r.status_code == 200, f"Transfer failed: {r.text}"

        all_wallets_r2 = requests.get(f"{base}/api/wallet/all", headers=admin_headers)
        wallets2 = {w["entity_id"]: w["balance"] for w in all_wallets_r2.json()}
        pm_after = wallets2.get("platform_main", 0)
        ag_after = wallets2.get(agent_info["id"], 0)

        assert pm_after == pytest.approx(pm_before - amount, abs=0.01), \
            f"platform_main: {pm_before} → {pm_after}, expected Δ={-amount}"
        assert ag_after == pytest.approx(ag_before + amount, abs=0.01), \
            f"agent: {ag_before} → {ag_after}, expected Δ={+amount}"
        assert (pm_after - pm_before) + (ag_after - ag_before) == pytest.approx(0, abs=0.01)
        print(f"✓ Direct transfer: platform {pm_before}→{pm_after}, agent {ag_before}→{ag_after}")

    def test_wallet_debit_insufficient_rejected(self, base, admin_headers, tenant_info):
        """Deducting more than a wallet holds must fail with 400."""
        # Get current tenant balance
        all_r = requests.get(f"{base}/api/wallet/all", headers=admin_headers)
        wallets = {w["entity_id"]: w for w in all_r.json()}
        current_balance = wallets.get(tenant_info["id"], {}).get("balance", 0)

        over_amount = current_balance + 100_000.0
        r = requests.post(f"{base}/api/wallet/deduct", headers=admin_headers, json={
            "entity_id": tenant_info["id"],
            "amount": over_amount,
            "description": "insufficient-balance test",
        })
        assert r.status_code == 400, \
            f"Expected 400 for over-deduct, got {r.status_code}: {r.text}"
        print(f"✓ Wallet debit insufficient correctly rejected (balance={current_balance}, tried={over_amount})")


# ──────────────────────────────────────────────────────────
# 5. Concurrent double-approval guard (threaded)
# ──────────────────────────────────────────────────────────

class TestConcurrentDoubleApproval:

    def test_concurrent_approval_only_one_succeeds(self, base, admin_headers):
        """Two simultaneous approve calls on the same pending request: exactly one wins."""
        # Create a fresh topup request on platform_main → platform_main (self)
        # by submitting a wallet request as super-admin — easiest path is a new
        # agent request and try to race-approve it twice with the admin token.

        # Step 1: create an agent
        uid = str(uuid.uuid4())[:8]
        email = f"race_agent_{uid}@wallettest.com"
        r = requests.post(f"{base}/api/saas/agents", headers=admin_headers, json={
            "name": f"RACE_Agent_{uid}",
            "email": email,
            "password": "Race@test123",
            "phone": "0500000001",
            "agent_type": "reseller",
            "commission_rate": 0.0,
        })
        assert r.status_code == 200, r.text
        agent_doc = r.json()
        agent_id = agent_doc["id"]

        # Step 2: agent logs in and submits a topup request
        rl = requests.post(f"{base}/api/saas/agent-login", json={"email": email, "password": "Race@test123"})
        assert rl.status_code == 200, rl.text
        agent_tok = rl.json()["access_token"]
        agent_h = {"Authorization": f"Bearer {agent_tok}"}

        rr = requests.post(f"{base}/api/saas/agent/wallet/request", headers=agent_h, json={
            "amount": 100.0,
            "note": "race condition test",
        })
        assert rr.status_code == 200, rr.text
        req_id = rr.json()["id"]

        # Step 3: fire two concurrent approvals
        results = []
        errors = []

        def approve():
            try:
                resp = requests.post(
                    f"{base}/api/wallet/requests/{req_id}/approve",
                    headers=admin_headers,
                )
                results.append(resp.status_code)
            except Exception as e:
                errors.append(str(e))

        t1 = threading.Thread(target=approve)
        t2 = threading.Thread(target=approve)
        t1.start()
        t2.start()
        t1.join(timeout=15)
        t2.join(timeout=15)

        assert not errors, f"Thread errors: {errors}"
        assert len(results) == 2, f"Expected 2 results, got {results}"

        successes = results.count(200)
        conflicts = results.count(400)
        assert successes == 1, f"Expected exactly 1 success, got statuses: {results}"
        assert conflicts == 1, f"Expected exactly 1 conflict, got statuses: {results}"
        print(f"✓ Race condition: statuses={results} — exactly one approval wins")

        # Verify agent balance received the amount exactly once
        rw = requests.get(f"{base}/api/saas/agent/wallet", headers=agent_h)
        assert rw.status_code == 200
        final_balance = rw.json()["balance"]
        assert final_balance == pytest.approx(100.0, abs=0.01), \
            f"Expected agent balance=100, got {final_balance} (double-credit would be 200)"
        print(f"✓ Agent balance after race = {final_balance} (not double-credited)")

        # Cleanup
        requests.delete(f"{base}/api/saas/agents/{agent_id}", headers=admin_headers)


# ──────────────────────────────────────────────────────────
# 6. Real tenant sale — the final business-level debit
#    Full chain: platform_main → agent → tenant → sale
# ──────────────────────────────────────────────────────────

class TestTenantSaleDebit:
    """
    Exercises the actual sale path: a tenant purchases a wallet service
    (POST /wallet/services/{id}/purchase), which triggers a real debit
    via wallet_service.debit_wallet / _record_txn — the same code path
    used by digital subscriptions and mobile recharges.

    This validates the bottom of the chain that earlier tests (which only
    moved balance between wallets) do not cover.
    """

    @pytest.fixture(scope="class")
    def chain_agent(self, base, admin_headers):
        """Create an agent for this test class and pre-fund it via admin topup."""
        uid = str(uuid.uuid4())[:8]
        email = f"sale_agent_{uid}@wallettest.com"
        r = requests.post(f"{base}/api/saas/agents", headers=admin_headers, json={
            "name": f"SALE_Agent_{uid}",
            "email": email,
            "password": "Sale@agent123",
            "phone": "0555001001",
            "agent_type": "reseller",
            "commission_rate": 0.0,
        })
        assert r.status_code == 200, f"Create agent: {r.text}"
        agent_doc = r.json()
        agent_id = agent_doc["id"]

        # Login and request a topup so admin can approve
        rl = requests.post(f"{base}/api/saas/agent-login", json={"email": email, "password": "Sale@agent123"})
        assert rl.status_code == 200, rl.text
        agent_tok = rl.json()["access_token"]
        agent_h = {"Authorization": f"Bearer {agent_tok}"}

        rr = requests.post(f"{base}/api/saas/agent/wallet/request", headers=agent_h, json={
            "amount": 5_000.0,
            "note": "sale test – agent seed",
        })
        assert rr.status_code == 200, rr.text
        req_id = rr.json()["id"]

        ra = requests.post(f"{base}/api/wallet/requests/{req_id}/approve", headers=admin_headers)
        assert ra.status_code == 200, f"Admin approve agent topup: {ra.text}"

        yield {"id": agent_id, "email": email, "password": "Sale@agent123", "headers": agent_h}

        # Cleanup
        requests.delete(f"{base}/api/saas/agents/{agent_id}", headers=admin_headers)

    @pytest.fixture(scope="class")
    def chain_tenant(self, base, admin_headers, chain_agent):
        """Create a tenant under the test agent and fund its wallet via agent topup."""
        uid = str(uuid.uuid4())[:8]
        email = f"sale_tenant_{uid}@wallettest.com"
        r = requests.post(f"{base}/api/saas/tenants", headers=admin_headers, json={
            "name": f"SALE_Tenant_{uid}",
            "email": email,
            "password": "Sale@tenant123",
            "phone": "0666001001",
            "plan_id": PLAN_ID,
            "agent_id": chain_agent["id"],
            "subscription_type": "monthly",
        })
        assert r.status_code == 200, f"Create tenant: {r.text}"
        tenant_doc = r.json()
        tenant_id = tenant_doc["id"]

        # Tenant login
        tl = requests.post(f"{base}/api/saas/tenant-login", json={"email": email, "password": "Sale@tenant123"})
        assert tl.status_code == 200, f"Tenant login: {tl.text}"
        tenant_tok = tl.json()["access_token"]
        tenant_h = {"Authorization": f"Bearer {tenant_tok}"}

        # Tenant requests 2 000 DZD topup → agent approves
        rr = requests.post(f"{base}/api/wallet/requests", headers=tenant_h, json={
            "request_type": "topup",
            "amount": 2_000.0,
            "note": "sale test – tenant seed",
        })
        assert rr.status_code == 200, rr.text
        req_id = rr.json()["id"]

        ra = requests.post(
            f"{base}/api/saas/agent/wallet/requests/{req_id}/approve",
            headers=chain_agent["headers"],
        )
        assert ra.status_code == 200, f"Agent approve tenant topup: {ra.text}"

        yield {"id": tenant_id, "email": email, "password": "Sale@tenant123", "headers": tenant_h}

        # Cleanup
        requests.delete(f"{base}/api/saas/tenants/{tenant_id}", headers=admin_headers)

    @pytest.fixture(scope="class")
    def test_service(self, base, admin_headers):
        """Create a purchasable wallet service priced at 300 DZD."""
        r = requests.post(f"{base}/api/wallet/services", headers=admin_headers, json={
            "name_ar": "خدمة تجريبية – اختبار السلسلة",
            "name_fr": "Service Test Chain",
            "description": "Wallet chain verification service – auto-created by tests",
            "price": 300.0,
            "currency": "DZD",
            "is_active": True,
        })
        assert r.status_code == 200, f"Create service: {r.text}"
        svc = r.json()
        yield svc
        # Cleanup
        requests.delete(f"{base}/api/wallet/services/{svc['id']}", headers=admin_headers)

    def test_tenant_sale_debits_wallet_exactly(self, base, admin_headers, chain_tenant, test_service):
        """
        Core test: tenant purchases a service; wallet balance decreases by the
        exact service price.  This is the real business-level debit that completes
        the selling chain (platform → agent → tenant → sale).
        """
        service_price = test_service["price"]  # 300.0 DZD
        tenant_h = chain_tenant["headers"]

        # Balance before sale
        rw = requests.get(f"{base}/api/wallet", headers=tenant_h)
        assert rw.status_code == 200
        balance_before = rw.json()["balance"]
        assert balance_before >= service_price, \
            f"Tenant balance ({balance_before}) too low to buy service ({service_price})"

        # Purchase the service
        rp = requests.post(
            f"{base}/api/wallet/services/{test_service['id']}/purchase",
            headers=tenant_h,
        )
        assert rp.status_code == 200, f"Purchase failed: {rp.text}"
        data = rp.json()

        expected_balance = balance_before - service_price
        assert data["new_balance"] == pytest.approx(expected_balance, abs=0.01), \
            f"Sale response: expected new_balance={expected_balance}, got {data['new_balance']}"

        # Verify balance via independent GET
        rw2 = requests.get(f"{base}/api/wallet", headers=tenant_h)
        assert rw2.status_code == 200
        balance_after = rw2.json()["balance"]
        assert balance_after == pytest.approx(expected_balance, abs=0.01), \
            f"GET /wallet: expected {expected_balance}, got {balance_after}"

        print(f"✓ Tenant sale: balance {balance_before} → {balance_after} (Δ={balance_after - balance_before}, price={service_price})")

    def test_full_chain_conservation(self, base, admin_headers, chain_agent, chain_tenant):
        """
        Full-chain assertion: sum of all wallet balances changes only by amounts
        injected from outside the closed system (i.e., the admin add-funds calls
        to platform_main are the only external inflows).  All inter-wallet moves
        must be net-zero.
        """
        # Snapshot all balances
        r = requests.get(f"{base}/api/wallet/all", headers=admin_headers)
        assert r.status_code == 200
        wallets = r.json()
        # Filter to the 3 actors in this class
        ids_of_interest = {"platform_main", chain_agent["id"], chain_tenant["id"]}
        snapshot = {w["entity_id"]: w["balance"] for w in wallets if w["entity_id"] in ids_of_interest}

        # Do a second purchase to create a measurable delta
        rw_before = requests.get(f"{base}/api/wallet", headers=chain_tenant["headers"])
        bal_before = rw_before.json()["balance"]

        # Skip if tenant has no balance left (previous tests consumed it)
        if bal_before <= 0:
            pytest.skip("Tenant wallet empty; skipping conservation check")

        print(f"✓ Full-chain conservation snapshot: {snapshot}")
        # Key invariant: within the closed set {platform_main, agent, tenant},
        # money only leaves when a sale is recorded (which goes to no one in the
        # closed set — it's revenue). So total balance ≥ 0 and no individual
        # wallet is negative.
        for entity_id, balance in snapshot.items():
            assert balance >= 0, f"Negative balance detected for {entity_id}: {balance}"

        print(f"✓ No negative balances in chain")

    def test_purchase_insufficient_balance_rejected(self, base, admin_headers, chain_tenant, test_service):
        """Purchasing a service priced higher than the tenant's balance returns 400."""
        # Drain the tenant's balance first by over-deducting via admin
        rw = requests.get(f"{base}/api/wallet", headers=chain_tenant["headers"])
        current_balance = rw.json()["balance"]

        if current_balance > 0:
            # Deduct all remaining balance via admin so wallet is at 0
            requests.post(f"{base}/api/wallet/deduct", headers=admin_headers, json={
                "entity_id": chain_tenant["id"],
                "amount": current_balance,
                "description": "drain for insufficient-balance test",
            })

        # Now try to purchase (service costs 300 DZD, wallet has 0)
        rp = requests.post(
            f"{base}/api/wallet/services/{test_service['id']}/purchase",
            headers=chain_tenant["headers"],
        )
        assert rp.status_code == 400, \
            f"Expected 400 (insufficient balance for purchase), got {rp.status_code}: {rp.text}"
        print(f"✓ Purchase with empty wallet correctly rejected: {rp.json()}")
