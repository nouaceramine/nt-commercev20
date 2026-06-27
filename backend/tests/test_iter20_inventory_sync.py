"""Iter-20 — POS↔E-com inventory sync regression test.

When an ecom_order with product_id-linked items is transitioned to 'confirmed':
  • Each linked product's stock decreases by item.qty (atomic, one-time).
  • Order doc gets inventory_deducted=true and inventory_deductions[] for traceability.
  • Response includes {inventory: {deducted, restored, warnings}}.

When the same order is later transitioned to 'cancelled' (or 'refunded'):
  • Stock is restored exactly to its previous value.
  • inventory_deducted flips back to false.

Idempotent: replaying 'confirmed' on an already-deducted order is a no-op.
"""
import uuid
import pytest
import httpx

BASE_URL = "http://localhost:8001/api"
SUPER_EMAIL = "admin@ntcommerce.com"
SUPER_PASS = "Admin@2024"
FOAD_TENANT_ID = "f2e36d2d-2a58-47c1-bdf5-c87f4bd7ae54"


async def _login(email, password):
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200, r.text
        return r.json()["access_token"]


async def _impersonate_foad():
    super_token = await _login(SUPER_EMAIL, SUPER_PASS)
    super_h = {"Authorization": f"Bearer {super_token}"}
    async with httpx.AsyncClient(timeout=20) as client:
        await client.put(
            f"{BASE_URL}/saas/tenants/{FOAD_TENANT_ID}/features",
            headers=super_h,
            json={"ecommerce_hub": True},
        )
        r = await client.post(f"{BASE_URL}/saas/impersonate/{FOAD_TENANT_ID}", headers=super_h)
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.mark.asyncio
async def test_inventory_deduct_on_confirm_and_restore_on_cancel():
    tenant_h = await _impersonate_foad()
    async with httpx.AsyncClient(timeout=20) as client:
        # ── Create a dedicated test product so we control initial stock ──
        seed_qty = 20
        suffix = uuid.uuid4().hex[:6]
        cp = await client.post(
            f"{BASE_URL}/products",
            headers=tenant_h,
            json={
                "name_ar": f"TEST_iter20 منتج {suffix}",
                "name_en": f"TEST_iter20 product {suffix}",
                "barcode": f"ITER20-{suffix}",
                "retail_price": 500,
                "wholesale_price": 400,
                "purchase_price": 300,
                "quantity": seed_qty,
                "low_stock_threshold": 5,
                "compatible_models": [],
            },
        )
        assert cp.status_code in (200, 201), cp.text
        prod = cp.json()
        prod_id = prod["id"]

        # ── Create a manual order linked to that product ──
        order_qty = 3
        po = await client.post(
            f"{BASE_URL}/ecom/orders",
            headers=tenant_h,
            json={
                "channel": "manual",
                "customer": {"name": "TEST_iter20 Customer", "phone": "0555", "wilaya": "الجزائر", "city": "الجزائر الوسطى"},
                "items": [{
                    "name": prod["name_ar"],
                    "sku": prod.get("barcode") or "",
                    "qty": order_qty,
                    "price": 500,
                    "product_id": prod_id,
                }],
                "shipping_fee": 0,
            },
        )
        assert po.status_code == 200, po.text
        order_id = po.json()["id"]

        # ── Transition new → confirmed: stock must drop by order_qty ──
        rt = await client.put(
            f"{BASE_URL}/ecom/orders/{order_id}/status",
            headers=tenant_h,
            json={"status": "confirmed"},
        )
        assert rt.status_code == 200, rt.text
        body = rt.json()
        assert body["status"] == "confirmed"
        inv = body.get("inventory") or {}
        assert len(inv.get("deducted", [])) == 1
        assert inv["deducted"][0]["qty"] == order_qty
        assert inv["deducted"][0]["stock_after"] == seed_qty - order_qty

        # Verify on the product directly
        rp = await client.get(f"{BASE_URL}/products/{prod_id}", headers=tenant_h)
        assert rp.json()["quantity"] == seed_qty - order_qty

        # Order doc has the flag + audit trail
        rget = await client.get(f"{BASE_URL}/ecom/orders/{order_id}", headers=tenant_h)
        order = rget.json()
        assert order.get("inventory_deducted") is True
        assert len(order.get("inventory_deductions", [])) == 1

        # ── Idempotency: PUT same status again is no-op (state-machine blocks confirmed→confirmed) ──
        # state machine returns "unchanged"
        rt2 = await client.put(
            f"{BASE_URL}/ecom/orders/{order_id}/status",
            headers=tenant_h,
            json={"status": "confirmed"},
        )
        assert rt2.json().get("unchanged") is True

        # Stock still at seed - order_qty
        rp2 = await client.get(f"{BASE_URL}/products/{prod_id}", headers=tenant_h)
        assert rp2.json()["quantity"] == seed_qty - order_qty

        # ── Transition confirmed → cancelled: stock must be RESTORED ──
        rc = await client.put(
            f"{BASE_URL}/ecom/orders/{order_id}/status",
            headers=tenant_h,
            json={"status": "cancelled"},
        )
        assert rc.status_code == 200
        rbody = rc.json()
        assert rbody["status"] == "cancelled"
        inv2 = rbody.get("inventory") or {}
        assert len(inv2.get("restored", [])) == 1
        assert inv2["restored"][0]["qty"] == order_qty

        rp3 = await client.get(f"{BASE_URL}/products/{prod_id}", headers=tenant_h)
        assert rp3.json()["quantity"] == seed_qty, "stock did not fully restore"

        # Order flag flipped back
        rget2 = await client.get(f"{BASE_URL}/ecom/orders/{order_id}", headers=tenant_h)
        assert rget2.json().get("inventory_deducted") is False

        # ── Cleanup ──
        await client.delete(f"{BASE_URL}/ecom/orders/{order_id}", headers=tenant_h)
        await client.delete(f"{BASE_URL}/products/{prod_id}", headers=tenant_h)


@pytest.mark.asyncio
async def test_items_without_product_id_are_skipped():
    """Manual items without product_id should NOT touch inventory and not error."""
    tenant_h = await _impersonate_foad()
    async with httpx.AsyncClient(timeout=20) as client:
        po = await client.post(
            f"{BASE_URL}/ecom/orders",
            headers=tenant_h,
            json={
                "channel": "manual",
                "customer": {"name": "TEST_iter20 NoLink", "phone": "0555"},
                "items": [{"name": "Ad-hoc item", "qty": 2, "price": 100}],
                "shipping_fee": 0,
            },
        )
        assert po.status_code == 200
        order_id = po.json()["id"]

        rt = await client.put(
            f"{BASE_URL}/ecom/orders/{order_id}/status",
            headers=tenant_h,
            json={"status": "confirmed"},
        )
        assert rt.status_code == 200
        inv = rt.json().get("inventory") or {}
        assert inv.get("deducted") == []
        assert inv.get("warnings") == []

        # Order flag NOT set because nothing to deduct
        rget = await client.get(f"{BASE_URL}/ecom/orders/{order_id}", headers=tenant_h)
        assert rget.json().get("inventory_deducted", False) is False

        # Cleanup
        await client.put(
            f"{BASE_URL}/ecom/orders/{order_id}/status",
            headers=tenant_h,
            json={"status": "cancelled"},
        )
        await client.delete(f"{BASE_URL}/ecom/orders/{order_id}", headers=tenant_h)
