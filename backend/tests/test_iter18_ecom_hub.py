"""Integration smoke tests for E-Commerce Hub (iter 18).

Validates:
  1. Super-admin can enable `ecommerce_hub` feature flag for a tenant.
  2. Tenant with flag OFF gets 403 on /api/ecom/* endpoints.
  3. Tenant with flag ON can:
     - List channels catalogue
     - CRUD integrations
     - Create manual orders, list with filters, update status (state machine), delete cancelled
     - Get orders summary aggregates
     - CRUD leads
     - Create mock shipping label → order moves to 'shipped'
"""
import os
import asyncio
import pytest
import httpx

BASE_URL = "http://localhost:8001/api"
SUPER_EMAIL = "admin@ntcommerce.com"
SUPER_PASS = "Admin@2024"


async def _login(email: str, password: str) -> str:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
        return r.json()["access_token"]


@pytest.mark.asyncio
async def test_ecom_hub_full_flow():
    super_token = await _login(SUPER_EMAIL, SUPER_PASS)
    super_h = {"Authorization": f"Bearer {super_token}"}

    async with httpx.AsyncClient(timeout=15) as client:
        # ── Locate a tenant to use ─────────────────────────────────────────
        r = await client.get(f"{BASE_URL}/saas/tenants", headers=super_h)
        assert r.status_code == 200
        tenants = r.json()
        assert tenants, "Need at least one tenant for the test"
        tenant = tenants[0]
        tenant_id = tenant["id"]
        tenant_email = tenant["email"]
        tenant_pass = "TenantPass@2024"  # may not match — we'll impersonate instead

        # ── Verify the feature flag exists in the resolved features ───────
        # First clear any prior override from this test so we observe the default.
        await client.put(
            f"{BASE_URL}/saas/tenants/{tenant_id}/features",
            headers=super_h,
            json={},  # empty body = wipe features_override entirely
        )
        r = await client.get(f"{BASE_URL}/saas/tenants/{tenant_id}/features", headers=super_h)
        assert r.status_code == 200
        resolved = r.json()["resolved"]
        assert "ecommerce_hub" in resolved, "ecommerce_hub flag must be in resolved features"
        # Should default to FALSE (opt-in)
        assert resolved["ecommerce_hub"] is False, "ecommerce_hub must default to False"

        # ── Enable the flag for this tenant ───────────────────────────────
        r = await client.put(
            f"{BASE_URL}/saas/tenants/{tenant_id}/features",
            headers=super_h,
            json={"ecommerce_hub": True},
        )
        assert r.status_code == 200
        assert r.json()["features_override"]["ecommerce_hub"] is True

        # ── Impersonate the tenant to obtain a tenant-scoped JWT ──────────
        r = await client.post(f"{BASE_URL}/saas/impersonate/{tenant_id}", headers=super_h)
        assert r.status_code == 200, r.text
        tenant_token = r.json()["access_token"]
        tenant_h = {"Authorization": f"Bearer {tenant_token}"}
        # Sanity: the user payload should now have ecommerce_hub: true
        user_features = r.json()["user"]["features"]
        assert user_features.get("ecommerce_hub") is True

        # ── Channels catalogue ────────────────────────────────────────────
        r = await client.get(f"{BASE_URL}/ecom/channels", headers=tenant_h)
        assert r.status_code == 200
        channel_keys = [c["key"] for c in r.json()["channels"]]
        for expected in ("shopify", "facebook", "instagram", "tiktok", "whatsapp", "telegram", "viber"):
            assert expected in channel_keys, f"missing channel: {expected}"

        # ── Integrations CRUD ────────────────────────────────────────────
        r = await client.post(
            f"{BASE_URL}/ecom/integrations",
            headers=tenant_h,
            json={
                "channel": "shopify",
                "name": "متجرنا الرئيسي",
                "credentials": {"api_key": "test_shop_secret_12345"},
            },
        )
        assert r.status_code == 200, r.text
        integration = r.json()
        integration_id = integration["id"]
        # Credentials should be REDACTED (no plaintext secret in response)
        assert "test_shop_secret_12345" not in str(integration.get("credentials"))

        r = await client.get(f"{BASE_URL}/ecom/integrations", headers=tenant_h)
        assert r.status_code == 200
        assert any(i["id"] == integration_id for i in r.json()["items"])

        r = await client.post(f"{BASE_URL}/ecom/integrations/{integration_id}/test", headers=tenant_h)
        assert r.status_code == 200
        assert r.json()["ok"] is True

        # ── Manual order entry ────────────────────────────────────────────
        r = await client.post(
            f"{BASE_URL}/ecom/orders",
            headers=tenant_h,
            json={
                "channel": "manual",
                "customer": {
                    "name": "أحمد بن علي",
                    "phone": "0555-12-34-56",
                    "city": "وهران",
                    "wilaya": "Oran",
                },
                "items": [
                    {"name": "قميص", "qty": 2, "price": 1500},
                    {"name": "بنطلون", "qty": 1, "price": 2500},
                ],
                "shipping_fee": 400,
            },
        )
        assert r.status_code == 200, r.text
        order = r.json()
        order_id = order["id"]
        assert order["total"] == 1500 * 2 + 2500 + 400  # 5900
        assert order["status"] == "new"
        assert order["order_code"].startswith("ECO-")

        # ── State machine: new → confirmed → packed ──────────────────────
        r = await client.put(
            f"{BASE_URL}/ecom/orders/{order_id}/status",
            headers=tenant_h,
            json={"status": "confirmed"},
        )
        assert r.status_code == 200
        r = await client.put(
            f"{BASE_URL}/ecom/orders/{order_id}/status",
            headers=tenant_h,
            json={"status": "packed"},
        )
        assert r.status_code == 200

        # ── Invalid transition: packed → delivered (must go via shipped) ─
        r = await client.put(
            f"{BASE_URL}/ecom/orders/{order_id}/status",
            headers=tenant_h,
            json={"status": "delivered"},
        )
        assert r.status_code == 400

        # ── Create mock shipping label → status auto-bumps to shipped ───
        r = await client.post(
            f"{BASE_URL}/ecom/shipping/labels",
            headers=tenant_h,
            json={"order_id": order_id, "provider": "yalidine"},
        )
        assert r.status_code == 200, r.text
        label = r.json()
        assert label["tracking_number"].startswith("YAL-")

        r = await client.get(f"{BASE_URL}/ecom/orders/{order_id}", headers=tenant_h)
        assert r.json()["status"] == "shipped"
        assert r.json()["tracking_number"] == label["tracking_number"]

        # ── Filter list by channel ────────────────────────────────────────
        r = await client.get(f"{BASE_URL}/ecom/orders?channel=manual&limit=10", headers=tenant_h)
        assert r.status_code == 200
        assert r.json()["total"] >= 1

        # ── Summary aggregates ────────────────────────────────────────────
        r = await client.get(f"{BASE_URL}/ecom/orders/summary", headers=tenant_h)
        assert r.status_code == 200
        summary = r.json()
        assert summary["total_all_time"] >= 1
        assert "manual" in summary["by_channel"]

        # ── Lead CRUD ─────────────────────────────────────────────────────
        r = await client.post(
            f"{BASE_URL}/ecom/leads",
            headers=tenant_h,
            json={
                "channel": "facebook",
                "name": "Yacine Boudiaf",
                "phone": "0660-99-88-77",
                "message": "هل المنتج متوفر؟",
            },
        )
        assert r.status_code == 200
        lead_id = r.json()["id"]

        r = await client.put(
            f"{BASE_URL}/ecom/leads/{lead_id}",
            headers=tenant_h,
            json={"status": "qualified"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "qualified"

        r = await client.get(f"{BASE_URL}/ecom/leads?channel=facebook", headers=tenant_h)
        assert r.json()["total"] >= 1

        # ── Cleanup leads + integration ───────────────────────────────────
        r = await client.delete(f"{BASE_URL}/ecom/leads/{lead_id}", headers=tenant_h)
        assert r.status_code == 200
        r = await client.delete(f"{BASE_URL}/ecom/integrations/{integration_id}", headers=tenant_h)
        assert r.status_code == 200

        # ── Order delete guard: only cancelled/refunded allowed ──────────
        r = await client.delete(f"{BASE_URL}/ecom/orders/{order_id}", headers=tenant_h)
        assert r.status_code == 400  # shipped — not deletable

        # ── Refund + delete ──────────────────────────────────────────────
        r = await client.put(
            f"{BASE_URL}/ecom/orders/{order_id}/status",
            headers=tenant_h,
            json={"status": "refunded"},
        )
        assert r.status_code == 200
        r = await client.delete(f"{BASE_URL}/ecom/orders/{order_id}", headers=tenant_h)
        assert r.status_code == 200

        # ── Disable flag again → tenant should get 403 ───────────────────
        # First close the impersonation log so we have a clean state.
        session_id = (await client.post(f"{BASE_URL}/saas/impersonate/{tenant_id}", headers=super_h)).json()["impersonation_session_id"]
        # Disable the flag
        await client.put(
            f"{BASE_URL}/saas/tenants/{tenant_id}/features",
            headers=super_h,
            json={"ecommerce_hub": False},
        )
        # Get a fresh tenant token after the flag was flipped
        r = await client.post(f"{BASE_URL}/saas/impersonate/{tenant_id}", headers=super_h)
        new_token = r.json()["access_token"]
        r = await client.get(f"{BASE_URL}/ecom/channels", headers={"Authorization": f"Bearer {new_token}"})
        assert r.status_code == 403, f"expected 403 when flag OFF, got {r.status_code}"

        # Stop the open impersonation session(s) to keep test_credentials clean.
        await client.post(f"{BASE_URL}/saas/impersonate/{session_id}/stop", headers=super_h)


if __name__ == "__main__":
    asyncio.run(test_ecom_hub_full_flow())
