"""Iter 18.2 smoke tests — P2 Shopify webhook + Yalidine fallback + AI insights + Email settings.

These tests validate the new endpoints without requiring real Shopify/Yalidine keys —
they assert HMAC verification, mock fallback, and proper authn.
"""
import asyncio
import base64
import hashlib
import hmac
import json

import httpx
import pytest

BASE_URL = "http://localhost:8001/api"
SUPER_EMAIL = "admin@ntcommerce.com"
SUPER_PASS = "Admin@2024"


async def _login(email: str, password: str) -> str:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200, f"login failed: {r.text}"
        return r.json()["access_token"]


@pytest.mark.asyncio
async def test_ai_insights_endpoint():
    """GET /api/saas/ai-insights returns a well-shaped payload (LLM or heuristic)."""
    token = await _login(SUPER_EMAIL, SUPER_PASS)
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{BASE_URL}/saas/ai-insights", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
        body = r.json()
        # Required shape
        assert "headline" in body
        assert "health_score" in body and 0 <= int(body["health_score"]) <= 100
        assert isinstance(body.get("highlights"), list)
        assert isinstance(body.get("risks"), list)
        assert isinstance(body.get("recommendations"), list)
        assert body.get("source") in ("llm", "heuristic")
        assert "metrics" in body and "total_tenants" in body["metrics"]


@pytest.mark.asyncio
async def test_email_settings_round_trip():
    """Super-admin can GET/PUT email settings — keys are masked in GET response."""
    token = await _login(SUPER_EMAIL, SUPER_PASS)
    h = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=10) as c:
        # GET baseline
        r = await c.get(f"{BASE_URL}/saas/email-settings", headers=h)
        assert r.status_code == 200
        # PUT a fake key
        r = await c.put(
            f"{BASE_URL}/saas/email-settings",
            headers=h,
            json={"resend_api_key": "re_test_ABCDEFGHIJ1234", "sender_email": "test@example.com"},
        )
        assert r.status_code == 200
        # GET again — masked
        r = await c.get(f"{BASE_URL}/saas/email-settings", headers=h)
        data = r.json()
        assert data["has_resend_key"] is True
        assert data["resend_api_key_masked"].endswith("1234")
        assert "re_test_ABCDEFGHIJ1234" not in data["resend_api_key_masked"]
        assert data["sender_email"] == "test@example.com"
        # Cleanup — wipe the key
        await c.put(f"{BASE_URL}/saas/email-settings", headers=h, json={"resend_api_key": "", "sendgrid_api_key": "", "sender_email": ""})


@pytest.mark.asyncio
async def test_shopify_webhook_hmac_verification():
    """Shopify webhook endpoint rejects bad HMAC, accepts good HMAC, is idempotent."""
    super_token = await _login(SUPER_EMAIL, SUPER_PASS)
    super_h = {"Authorization": f"Bearer {super_token}"}
    async with httpx.AsyncClient(timeout=15) as c:
        # 1) Pick a tenant with ecommerce_hub enabled
        tenants = (await c.get(f"{BASE_URL}/saas/tenants", headers=super_h)).json()
        tenant = tenants[0]
        tenant_id = tenant["id"]
        # Ensure flag is ON
        await c.put(
            f"{BASE_URL}/saas/tenants/{tenant_id}/features",
            headers=super_h,
            json={"ecommerce_hub": True},
        )
        # 2) Impersonate, create a Shopify integration with a known webhook_secret
        imp = (await c.post(f"{BASE_URL}/saas/impersonate/{tenant_id}", headers=super_h)).json()
        th = {"Authorization": f"Bearer {imp['access_token']}"}
        webhook_secret = "test_secret_iter18_2"
        integration = (await c.post(
            f"{BASE_URL}/ecom/integrations",
            headers=th,
            json={
                "channel": "shopify",
                "name": "Test Shopify Store",
                "credentials": {
                    "shop_domain": "test.myshopify.com",
                    "admin_api_key": "shpat_xxxxxxxxxxxx",
                    "webhook_secret": webhook_secret,
                },
            },
        )).json()
        integration_id = integration["id"]

        # 3) Build a minimal Shopify order payload (random ID to avoid cross-run pollution)
        import random, time
        unique_id = int(time.time() * 1000) + random.randint(0, 999)
        payload = {
            "id": unique_id,
            "order_number": unique_id % 100000,
            "total_price": "3500.00",
            "financial_status": "paid",
            "note": "اختبار webhook",
            "tags": "test,iter18",
            "customer": {"first_name": "محمد", "last_name": "بن سعيد", "phone": "0555111222"},
            "shipping_address": {"address1": "شارع X", "city": "وهران", "province": "Oran", "phone": "0555111222"},
            "line_items": [
                {"name": "قميص أزرق", "sku": "SH-BLU-M", "quantity": 2, "price": "1500.00"},
                {"name": "حذاء", "sku": "SH-001", "quantity": 1, "price": "500.00"},
            ],
            "shipping_lines": [{"price": "500.00"}],
        }
        raw_body = json.dumps(payload).encode("utf-8")

        # 4) BAD HMAC → 401
        webhook_url = f"{BASE_URL}/ecom/webhooks/shopify/{tenant_id}/{integration_id}/orders"
        r = await c.post(
            webhook_url,
            content=raw_body,
            headers={"X-Shopify-Hmac-SHA256": "wronghmac", "Content-Type": "application/json"},
        )
        assert r.status_code == 401, f"expected 401 for bad HMAC, got {r.status_code}"

        # 5) GOOD HMAC → 200 + order created
        good_hmac = base64.b64encode(
            hmac.new(webhook_secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
        ).decode("utf-8")
        r = await c.post(
            webhook_url,
            content=raw_body,
            headers={
                "X-Shopify-Hmac-SHA256": good_hmac,
                "X-Shopify-Topic": "orders/create",
                "X-Shopify-Shop-Domain": "test.myshopify.com",
                "Content-Type": "application/json",
            },
        )
        assert r.status_code == 200, r.text
        first_result = r.json()
        assert first_result["created"] is True
        expected_code = f"SHO-{unique_id % 100000}"
        assert first_result["order_code"] == expected_code

        # 6) IDEMPOTENT — re-deliver the same payload → 200 with created=False
        r = await c.post(
            webhook_url,
            content=raw_body,
            headers={
                "X-Shopify-Hmac-SHA256": good_hmac,
                "X-Shopify-Topic": "orders/create",
                "Content-Type": "application/json",
            },
        )
        assert r.status_code == 200
        assert r.json()["created"] is False

        # 7) Verify the order is queryable via the regular tenant API
        orders = (await c.get(f"{BASE_URL}/ecom/orders?channel=shopify", headers=th)).json()
        match = [o for o in orders["items"] if o["order_code"] == expected_code]
        assert len(match) == 1
        order = match[0]
        assert order["customer"]["name"] == "محمد بن سعيد"
        assert len(order["items"]) == 2
        # Shipping fee parsed correctly
        assert float(order["shipping_fee"]) == 500.0
        # Total uses Shopify's authoritative value
        assert float(order["total"]) == 3500.0

        # 8) Integration mode flipped to 'live'
        integrations = (await c.get(f"{BASE_URL}/ecom/integrations", headers=th)).json()["items"]
        match = [i for i in integrations if i["id"] == integration_id][0]
        assert match["mode"] == "live"

        # Cleanup the integration (order persists for visibility)
        await c.delete(f"{BASE_URL}/ecom/integrations/{integration_id}", headers=th)


@pytest.mark.asyncio
async def test_yalidine_mock_fallback_when_no_creds():
    """Shipping label with provider=yalidine but no creds → mock fallback path."""
    super_token = await _login(SUPER_EMAIL, SUPER_PASS)
    super_h = {"Authorization": f"Bearer {super_token}"}
    async with httpx.AsyncClient(timeout=15) as c:
        tenants = (await c.get(f"{BASE_URL}/saas/tenants", headers=super_h)).json()
        tenant_id = tenants[0]["id"]
        await c.put(f"{BASE_URL}/saas/tenants/{tenant_id}/features", headers=super_h, json={"ecommerce_hub": True})
        imp = (await c.post(f"{BASE_URL}/saas/impersonate/{tenant_id}", headers=super_h)).json()
        th = {"Authorization": f"Bearer {imp['access_token']}"}

        # Wipe any prior Yalidine integration so we exercise the no-creds path
        ints = (await c.get(f"{BASE_URL}/ecom/integrations", headers=th)).json()["items"]
        for i in ints:
            if i["channel"] == "yalidine":
                await c.delete(f"{BASE_URL}/ecom/integrations/{i['id']}", headers=th)

        order = (await c.post(
            f"{BASE_URL}/ecom/orders",
            headers=th,
            json={
                "channel": "manual",
                "customer": {"name": "Yalidine Test Customer", "phone": "0555111000", "wilaya": "Alger"},
                "items": [{"name": "Widget", "qty": 1, "price": 1000}],
                "shipping_fee": 400,
            },
        )).json()
        order_id = order["id"]
        # Move to confirmed → packed
        await c.put(f"{BASE_URL}/ecom/orders/{order_id}/status", headers=th, json={"status": "confirmed"})
        await c.put(f"{BASE_URL}/ecom/orders/{order_id}/status", headers=th, json={"status": "packed"})

        # Create yalidine label without creds → must mock-fallback (not 500)
        r = await c.post(
            f"{BASE_URL}/ecom/shipping/labels",
            headers=th,
            json={"order_id": order_id, "provider": "yalidine"},
        )
        assert r.status_code == 200, r.text
        label = r.json()
        assert label["mode"] in ("mock", "mock_real_provider_pending")
        assert label["tracking_number"].startswith("YAL-")


if __name__ == "__main__":
    asyncio.run(test_ai_insights_endpoint())
    asyncio.run(test_email_settings_round_trip())
    asyncio.run(test_shopify_webhook_hmac_verification())
    asyncio.run(test_yalidine_mock_fallback_when_no_creds())
