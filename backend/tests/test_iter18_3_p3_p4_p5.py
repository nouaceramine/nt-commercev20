"""Iter 18.3 smoke tests — P3 messaging webhooks + P4 channels + P5 analytics + AI categorize.

Validates each new route end-to-end without requiring real third-party keys.
"""
import json
import time

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


async def _impersonate_tenant_with_ecom_on():
    super_token = await _login(SUPER_EMAIL, SUPER_PASS)
    super_h = {"Authorization": f"Bearer {super_token}"}
    async with httpx.AsyncClient(timeout=15) as c:
        ts = (await c.get(f"{BASE_URL}/saas/tenants", headers=super_h)).json()
        tid = ts[0]["id"]
        await c.put(f"{BASE_URL}/saas/tenants/{tid}/features", headers=super_h, json={"ecommerce_hub": True})
        imp = (await c.post(f"{BASE_URL}/saas/impersonate/{tid}", headers=super_h)).json()
        return tid, imp["access_token"]


@pytest.mark.asyncio
async def test_whatsapp_webhook_verify_and_create_lead():
    tenant_id, tenant_token = await _impersonate_tenant_with_ecom_on()
    th = {"Authorization": f"Bearer {tenant_token}"}
    async with httpx.AsyncClient(timeout=15) as c:
        # Create WhatsApp integration with verify_token
        integ = (await c.post(
            f"{BASE_URL}/ecom/integrations",
            headers=th,
            json={
                "channel": "whatsapp",
                "name": "Test WA",
                "credentials": {
                    "phone_number_id": "PHONE_ID_X",
                    "access_token": "EAA_FAKE_TOKEN",
                    "verify_token": "secret_verify_18_3",
                },
            },
        )).json()
        integration_id = integ["id"]
        webhook_path = f"/ecom/webhooks/whatsapp/{tenant_id}/{integration_id}"

        # 1) GET handshake with correct token → returns challenge
        r = await c.get(
            f"{BASE_URL}{webhook_path}",
            params={"hub.mode": "subscribe", "hub.verify_token": "secret_verify_18_3", "hub.challenge": "12345"},
        )
        assert r.status_code == 200
        assert "12345" in r.text

        # 2) GET with wrong token → 403
        r = await c.get(
            f"{BASE_URL}{webhook_path}",
            params={"hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "99"},
        )
        assert r.status_code == 403

        # 3) POST incoming message → creates a lead
        wa_payload = {
            "entry": [{
                "changes": [{
                    "value": {
                        "contacts": [{"profile": {"name": "أحمد الزبون"}}],
                        "messages": [{
                            "id": f"wamid_{int(time.time())}",
                            "from": "213555111222",
                            "type": "text",
                            "text": {"body": "مرحبا، هل المنتج متوفر؟"},
                            "timestamp": "1700000000",
                        }],
                    },
                }],
            }],
        }
        r = await c.post(f"{BASE_URL}{webhook_path}", json=wa_payload)
        assert r.status_code == 200, r.text
        assert r.json()["lead_created"] is True

        leads = (await c.get(f"{BASE_URL}/ecom/leads?channel=whatsapp", headers=th)).json()
        assert leads["total"] >= 1
        wa_lead = [l for l in leads["items"] if l["phone"] == "213555111222"][-1]
        assert "هل المنتج متوفر" in wa_lead["message"]

        # 4) Idempotent — same external_id (msg id) won't duplicate
        r2 = await c.post(f"{BASE_URL}{webhook_path}", json=wa_payload)
        assert r2.status_code == 200
        leads2 = (await c.get(f"{BASE_URL}/ecom/leads?channel=whatsapp", headers=th)).json()
        assert leads2["total"] == leads["total"]

        # Cleanup
        await c.delete(f"{BASE_URL}/ecom/integrations/{integration_id}", headers=th)
        await c.delete(f"{BASE_URL}/ecom/leads/{wa_lead['id']}", headers=th)


@pytest.mark.asyncio
async def test_telegram_and_viber_webhooks():
    tenant_id, tenant_token = await _impersonate_tenant_with_ecom_on()
    th = {"Authorization": f"Bearer {tenant_token}"}
    async with httpx.AsyncClient(timeout=15) as c:
        # Telegram
        tg_integ = (await c.post(
            f"{BASE_URL}/ecom/integrations",
            headers=th,
            json={"channel": "telegram", "name": "TG Test", "credentials": {"bot_token": "FAKE:TOKEN"}},
        )).json()
        tg_id = tg_integ["id"]
        msg_id = int(time.time() * 1000)
        tg_payload = {
            "message": {
                "message_id": msg_id,
                "from": {"id": 9999, "first_name": "يوسف", "last_name": "كريم"},
                "text": "أريد الطلب رقم 5",
            }
        }
        r = await c.post(f"{BASE_URL}/ecom/webhooks/telegram/{tenant_id}/{tg_id}", json=tg_payload)
        assert r.status_code == 200 and r.json()["lead_created"] is True
        leads = (await c.get(f"{BASE_URL}/ecom/leads?channel=telegram", headers=th)).json()
        assert any("يوسف كريم" in l.get("name", "") for l in leads["items"])

        # Viber
        vb_integ = (await c.post(
            f"{BASE_URL}/ecom/integrations",
            headers=th,
            json={"channel": "viber", "name": "Viber Test", "credentials": {"bot_token": "FAKE_VIBER"}},
        )).json()
        vb_id = vb_integ["id"]
        vb_payload = {
            "event": "message",
            "message_token": f"vbm_{msg_id}",
            "sender": {"id": "vb1", "name": "Viber User"},
            "message": {"text": "السلام عليكم"},
        }
        r = await c.post(f"{BASE_URL}/ecom/webhooks/viber/{tenant_id}/{vb_id}", json=vb_payload)
        assert r.status_code == 200 and r.json()["lead_created"] is True

        # Cleanup integrations
        await c.delete(f"{BASE_URL}/ecom/integrations/{tg_id}", headers=th)
        await c.delete(f"{BASE_URL}/ecom/integrations/{vb_id}", headers=th)


@pytest.mark.asyncio
async def test_meta_lead_webhook():
    tenant_id, tenant_token = await _impersonate_tenant_with_ecom_on()
    th = {"Authorization": f"Bearer {tenant_token}"}
    async with httpx.AsyncClient(timeout=15) as c:
        integ = (await c.post(
            f"{BASE_URL}/ecom/integrations",
            headers=th,
            json={
                "channel": "facebook",
                "name": "FB Test",
                "credentials": {"page_id": "PG1", "access_token": "FAKE", "verify_token": "vt_18_3"},
            },
        )).json()
        integration_id = integ["id"]

        # GET handshake
        r = await c.get(
            f"{BASE_URL}/ecom/webhooks/meta/{tenant_id}/{integration_id}",
            params={"hub.mode": "subscribe", "hub.verify_token": "vt_18_3", "hub.challenge": "555"},
        )
        assert r.status_code == 200

        # POST lead-gen
        ts = int(time.time() * 1000)
        meta_payload = {
            "entry": [{
                "changes": [{
                    "value": {
                        "leadgen_id": f"lead_{ts}",
                        "form_id": "form_abc",
                        "page_id": "PG1",
                        "field_data": [
                            {"name": "full_name", "values": ["Mohamed Test"]},
                            {"name": "phone_number", "values": ["+213555000111"]},
                            {"name": "email", "values": ["test@example.com"]},
                        ],
                    },
                }],
            }],
        }
        r = await c.post(f"{BASE_URL}/ecom/webhooks/meta/{tenant_id}/{integration_id}", json=meta_payload)
        assert r.status_code == 200 and r.json()["lead_created"] is True

        await c.delete(f"{BASE_URL}/ecom/integrations/{integration_id}", headers=th)


@pytest.mark.asyncio
async def test_tiktok_order_webhook():
    tenant_id, tenant_token = await _impersonate_tenant_with_ecom_on()
    th = {"Authorization": f"Bearer {tenant_token}"}
    async with httpx.AsyncClient(timeout=15) as c:
        integ = (await c.post(
            f"{BASE_URL}/ecom/integrations",
            headers=th,
            json={"channel": "tiktok", "name": "TT", "credentials": {"shop_id": "S1", "access_token": "FAKE"}},
        )).json()
        integration_id = integ["id"]

        oid = f"tt_{int(time.time()*1000)}"
        tt_payload = {
            "data": {
                "order_id": oid,
                "payment_amount": 3200,
                "line_items": [
                    {"product_name": "TikTok Item", "sku_id": "TT-1", "quantity": 2, "sku_price": 1500},
                ],
                "recipient_address": {
                    "name": "TikTok Buyer", "phone": "0555111000", "city": "وهران", "region": "Oran",
                    "address_line": "Rue X",
                },
            },
        }
        r = await c.post(f"{BASE_URL}/ecom/webhooks/tiktok/{tenant_id}/{integration_id}", json=tt_payload)
        assert r.status_code == 200, r.text
        assert r.json()["created"] is True
        # idempotent
        r2 = await c.post(f"{BASE_URL}/ecom/webhooks/tiktok/{tenant_id}/{integration_id}", json=tt_payload)
        assert r2.json().get("duplicate") is True

        orders = (await c.get(f"{BASE_URL}/ecom/orders?channel=tiktok", headers=th)).json()
        match = [o for o in orders["items"] if o["external_id"] == oid]
        assert len(match) == 1
        assert match[0]["total"] == 3200

        await c.delete(f"{BASE_URL}/ecom/integrations/{integration_id}", headers=th)


@pytest.mark.asyncio
async def test_analytics_endpoints():
    tenant_id, tenant_token = await _impersonate_tenant_with_ecom_on()
    th = {"Authorization": f"Bearer {tenant_token}"}
    async with httpx.AsyncClient(timeout=15) as c:
        # Create at least one order so totals aren't zero
        await c.post(
            f"{BASE_URL}/ecom/orders",
            headers=th,
            json={
                "channel": "manual",
                "customer": {"name": "Test Analytics", "phone": "0500"},
                "items": [{"name": "Widget Analytics", "qty": 3, "price": 500}],
                "shipping_fee": 100,
            },
        )

        # revenue
        r = await c.get(f"{BASE_URL}/ecom/analytics/revenue?days=30", headers=th)
        assert r.status_code == 200
        rev = r.json()
        assert rev["grand_total_orders"] >= 1
        assert rev["grand_total_revenue"] >= 1500
        assert any(c["channel"] == "manual" for c in rev["channels"])

        # funnel
        r = await c.get(f"{BASE_URL}/ecom/analytics/funnel?days=30", headers=th)
        assert r.status_code == 200
        fun = r.json()
        assert len(fun["stages"]) == 5
        assert {s["key"] for s in fun["stages"]} == {"leads", "orders", "confirmed", "shipped", "delivered"}

        # top products
        r = await c.get(f"{BASE_URL}/ecom/analytics/top-products?days=30&limit=5", headers=th)
        assert r.status_code == 200
        top = r.json()
        names = [it["name"] for it in top["items"]]
        assert any("Widget" in n for n in names)


@pytest.mark.asyncio
async def test_ai_categorize_lead():
    tenant_id, tenant_token = await _impersonate_tenant_with_ecom_on()
    th = {"Authorization": f"Bearer {tenant_token}"}
    async with httpx.AsyncClient(timeout=60) as c:
        lead = (await c.post(
            f"{BASE_URL}/ecom/leads",
            headers=th,
            json={
                "channel": "whatsapp",
                "name": "AI Test Lead",
                "phone": "0550",
                "message": "كم سعر هذا المنتج بالضبط؟",
            },
        )).json()
        lead_id = lead["id"]
        r = await c.post(f"{BASE_URL}/ecom/leads/{lead_id}/ai-categorize", headers=th)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["category"] in ("interested", "price_inquiry", "support", "complaint", "spam", "other")
        assert 0 <= body["score"] <= 100

        # Second call should be cached on the doc.
        r2 = await c.post(f"{BASE_URL}/ecom/leads/{lead_id}/ai-categorize", headers=th)
        assert r2.json()["cached"] is True

        await c.delete(f"{BASE_URL}/ecom/leads/{lead_id}", headers=th)
