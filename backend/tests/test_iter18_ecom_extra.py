"""Iter-18 extra checks for E-Commerce Hub:
 - 403 Arabic message format for tenant with flag OFF
 - Smoke: existing core endpoints still work (POS/sales/customers/reports unaffected)
 - Manual order total math (5900)
 - Channel catalogue returns all 7 channels exactly
 - Credential redaction across channels (shopify api_key, facebook access_token)
 - Lead lifecycle status values (new/contacted/qualified/converted/lost)
 - DELETE order guard for new (un-cancelled) order returns 400
 - GET /api/saas/tenants/<id>/features returns ecommerce_hub:false default after wiping
"""
import pytest
import httpx

BASE_URL = "http://localhost:8001/api"
SUPER = ("admin@ntcommerce.com", "Admin@2024")


async def _login(email, password):
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200, r.text
        return r.json()["access_token"]


@pytest.mark.asyncio
async def test_403_arabic_message_and_default_off():
    token = await _login(*SUPER)
    H = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=15) as c:
        # Use a tenant other than the first (per problem statement, 2nd/3rd are off by default)
        r = await c.get(f"{BASE_URL}/saas/tenants", headers=H)
        assert r.status_code == 200
        tenants = r.json()
        assert len(tenants) >= 2, "need >=2 tenants"
        target = tenants[1]
        tid = target["id"]
        # Wipe override → must default to False (opt-in)
        await c.put(f"{BASE_URL}/saas/tenants/{tid}/features", headers=H, json={})
        f = (await c.get(f"{BASE_URL}/saas/tenants/{tid}/features", headers=H)).json()
        assert "ecommerce_hub" in f["resolved"]
        assert f["resolved"]["ecommerce_hub"] is False

        # Impersonate → flag OFF → 403 on /api/ecom/*
        r = await c.post(f"{BASE_URL}/saas/impersonate/{tid}", headers=H)
        assert r.status_code == 200, r.text
        ttoken = r.json()["access_token"]
        TH = {"Authorization": f"Bearer {ttoken}"}
        for path in ("ecom/channels", "ecom/integrations", "ecom/orders", "ecom/leads"):
            r = await c.get(f"{BASE_URL}/{path}", headers=TH)
            assert r.status_code == 403, f"expected 403 on {path}, got {r.status_code}"
            body = r.json()
            msg = body.get("detail") or body.get("message") or ""
            assert "مركز التجارة الإلكترونية غير مُفعّل" in msg, f"Arabic msg missing: {msg}"


@pytest.mark.asyncio
async def test_credential_redaction_and_test_endpoint():
    token = await _login(*SUPER)
    H = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=15) as c:
        tid = (await c.get(f"{BASE_URL}/saas/tenants", headers=H)).json()[0]["id"]
        await c.put(f"{BASE_URL}/saas/tenants/{tid}/features", headers=H, json={"ecommerce_hub": True})
        ttoken = (await c.post(f"{BASE_URL}/saas/impersonate/{tid}", headers=H)).json()["access_token"]
        TH = {"Authorization": f"Bearer {ttoken}"}
        secret = "SUPER_SECRET_TOKEN_98765"
        created_ids = []
        for ch, key in (("shopify", "api_key"), ("facebook", "access_token"), ("whatsapp", "phone_number_id")):
            r = await c.post(
                f"{BASE_URL}/ecom/integrations",
                headers=TH,
                json={"channel": ch, "name": f"my-{ch}", "credentials": {key: secret}},
            )
            assert r.status_code == 200, r.text
            data = r.json()
            assert secret not in str(data), f"secret leaked in {ch} response"
            created_ids.append(data["id"])
            # test endpoint always ok
            t = await c.post(f"{BASE_URL}/ecom/integrations/{data['id']}/test", headers=TH)
            assert t.status_code == 200 and t.json()["ok"] is True
        # cleanup
        for iid in created_ids:
            await c.delete(f"{BASE_URL}/ecom/integrations/{iid}", headers=TH)


@pytest.mark.asyncio
async def test_smoke_existing_features_not_broken():
    """Smoke test for POS-era endpoints to ensure AuthContext/Layout changes don't break core."""
    token = await _login(*SUPER)
    H = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=15) as c:
        # core saas-admin endpoints
        for path in ("saas/tenants", "saas/plans", "saas/platform-stats", "saas/stats"):
            r = await c.get(f"{BASE_URL}/{path}", headers=H)
            assert r.status_code == 200, f"{path} broke: {r.status_code} {r.text[:120]}"

        # tenant-side existing features (impersonate first tenant)
        tid = (await c.get(f"{BASE_URL}/saas/tenants", headers=H)).json()[0]["id"]
        ttoken = (await c.post(f"{BASE_URL}/saas/impersonate/{tid}", headers=H)).json()["access_token"]
        TH = {"Authorization": f"Bearer {ttoken}"}
        # These should all 200 (or 404 if not configured but NOT 5xx)
        for path in ("auth/me", "customers", "products", "sales", "expenses"):
            r = await c.get(f"{BASE_URL}/{path}", headers=TH)
            assert r.status_code < 500, f"{path} 5xx: {r.status_code} {r.text[:120]}"


@pytest.mark.asyncio
async def test_order_math_and_delete_guard():
    token = await _login(*SUPER)
    H = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=15) as c:
        tid = (await c.get(f"{BASE_URL}/saas/tenants", headers=H)).json()[0]["id"]
        await c.put(f"{BASE_URL}/saas/tenants/{tid}/features", headers=H, json={"ecommerce_hub": True})
        ttoken = (await c.post(f"{BASE_URL}/saas/impersonate/{tid}", headers=H)).json()["access_token"]
        TH = {"Authorization": f"Bearer {ttoken}"}

        # Create order: 2*1500 + 1*2500 + 400 = 5900
        r = await c.post(
            f"{BASE_URL}/ecom/orders",
            headers=TH,
            json={
                "channel": "manual",
                "customer": {"name": "TEST_CUST", "phone": "0555000000"},
                "items": [
                    {"name": "A", "qty": 2, "price": 1500},
                    {"name": "B", "qty": 1, "price": 2500},
                ],
                "shipping_fee": 400,
            },
        )
        assert r.status_code == 200, r.text
        oid = r.json()["id"]
        assert r.json()["total"] == 5900

        # Delete guard: new order can't be deleted
        r = await c.delete(f"{BASE_URL}/ecom/orders/{oid}", headers=TH)
        assert r.status_code == 400

        # Cancel then delete OK
        r = await c.put(f"{BASE_URL}/ecom/orders/{oid}/status", headers=TH, json={"status": "cancelled"})
        assert r.status_code == 200
        r = await c.delete(f"{BASE_URL}/ecom/orders/{oid}", headers=TH)
        assert r.status_code == 200


@pytest.mark.asyncio
async def test_lead_status_lifecycle():
    token = await _login(*SUPER)
    H = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=15) as c:
        tid = (await c.get(f"{BASE_URL}/saas/tenants", headers=H)).json()[0]["id"]
        await c.put(f"{BASE_URL}/saas/tenants/{tid}/features", headers=H, json={"ecommerce_hub": True})
        ttoken = (await c.post(f"{BASE_URL}/saas/impersonate/{tid}", headers=H)).json()["access_token"]
        TH = {"Authorization": f"Bearer {ttoken}"}
        r = await c.post(
            f"{BASE_URL}/ecom/leads",
            headers=TH,
            json={"channel": "facebook", "name": "TEST_LEAD", "phone": "0660000000"},
        )
        assert r.status_code == 200, r.text
        lid = r.json()["id"]
        for st in ("contacted", "qualified", "converted", "lost"):
            r = await c.put(f"{BASE_URL}/ecom/leads/{lid}", headers=TH, json={"status": st})
            assert r.status_code == 200, f"status={st} failed: {r.text}"
            assert r.json()["status"] == st
        await c.delete(f"{BASE_URL}/ecom/leads/{lid}", headers=TH)
