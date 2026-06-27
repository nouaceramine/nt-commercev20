"""Iter-19 bug-fix regression tests.

Covers 4 fixes:
  (1) /ecom-hub/channels render fix — backend supports listing channels (catalogue).
  (2) Manual order Wilaya+Commune from algeriaGeo (FE only, smoke via order create).
  (3) Manual order accepts items with `product_id` and the GET response carries it back.
  (4) POST /api/purchases syncs purchase_price AND selling_price on products when
      items[].selling_price > 0 (price-sync on purchase).
"""
import os
import uuid
import pytest
import httpx

BASE_URL = "http://localhost:8001/api"
SUPER_EMAIL = "admin@ntcommerce.com"
SUPER_PASS = "Admin@2024"
FOAD_TENANT_ID = "f2e36d2d-2a58-47c1-bdf5-c87f4bd7ae54"


async def _login(email: str, password: str) -> str:
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
        return r.json()["access_token"]


async def _impersonate_foad() -> dict:
    super_token = await _login(SUPER_EMAIL, SUPER_PASS)
    super_h = {"Authorization": f"Bearer {super_token}"}
    async with httpx.AsyncClient(timeout=20) as client:
        # Ensure feature flag is ON for FOAD tenant
        await client.put(
            f"{BASE_URL}/saas/tenants/{FOAD_TENANT_ID}/features",
            headers=super_h,
            json={"ecommerce_hub": True},
        )
        r = await client.post(f"{BASE_URL}/saas/impersonate/{FOAD_TENANT_ID}", headers=super_h)
        assert r.status_code == 200, r.text
        data = r.json()
        return {
            "Authorization": f"Bearer {data['access_token']}",
        }


# (1) /ecom-hub/channels backend smoke
@pytest.mark.asyncio
async def test_ecom_channels_catalogue_includes_all_supported():
    tenant_h = await _impersonate_foad()
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{BASE_URL}/ecom/channels", headers=tenant_h)
        assert r.status_code == 200, r.text
        keys = [c["key"] for c in r.json()["channels"]]
        for expected in ("shopify", "facebook", "instagram", "tiktok", "whatsapp", "telegram", "viber"):
            assert expected in keys, f"missing sales channel: {expected}"


# (3) Manual order accepts product_id and persists it
@pytest.mark.asyncio
async def test_manual_order_links_pos_product_id():
    tenant_h = await _impersonate_foad()
    async with httpx.AsyncClient(timeout=20) as client:
        # Fetch one POS product from this tenant
        rp = await client.get(f"{BASE_URL}/products", headers=tenant_h)
        assert rp.status_code == 200, rp.text
        products = rp.json()
        if not products:
            pytest.skip("FOAD tenant has no POS products to link")
        prod = products[0]
        prod_id = prod["id"]

        payload = {
            "channel": "manual",
            "customer": {
                "name": "TEST_iter19 ProductLink",
                "phone": "0555000111",
                "wilaya": "الجزائر",
                "city": "الجزائر الوسطى",
                "address": "rue test",
            },
            "items": [{
                "name": prod.get("name_ar") or prod.get("name_en") or "Test",
                "sku": prod.get("barcode") or "",
                "qty": 1,
                "price": float(prod.get("retail_price") or 100),
                "product_id": prod_id,
            }],
            "shipping_fee": 0,
            "notes": "iter-19 product_id link test",
        }
        rc = await client.post(f"{BASE_URL}/ecom/orders", headers=tenant_h, json=payload)
        assert rc.status_code == 200, rc.text
        order = rc.json()
        order_id = order["id"]
        # product_id must round-trip
        assert order["items"][0].get("product_id") == prod_id, \
            f"product_id not retained: {order['items'][0]}"

        # GET to re-confirm persistence
        rg = await client.get(f"{BASE_URL}/ecom/orders/{order_id}", headers=tenant_h)
        assert rg.status_code == 200
        got = rg.json()
        assert got["items"][0].get("product_id") == prod_id

        # Cleanup: cancel + delete
        await client.put(
            f"{BASE_URL}/ecom/orders/{order_id}/status",
            headers=tenant_h,
            json={"status": "cancelled"},
        )
        await client.delete(f"{BASE_URL}/ecom/orders/{order_id}", headers=tenant_h)


# (4) Purchases price-sync (purchase_price AND selling_price)
@pytest.mark.asyncio
async def test_purchase_syncs_both_prices_on_product():
    tenant_h = await _impersonate_foad()
    async with httpx.AsyncClient(timeout=20) as client:
        # Pick a product
        rp = await client.get(f"{BASE_URL}/products", headers=tenant_h)
        assert rp.status_code == 200
        products = rp.json()
        if not products:
            pytest.skip("FOAD tenant has no products")
        prod = products[0]
        prod_id = prod["id"]
        original_purchase_price = prod.get("purchase_price")
        original_selling_price = prod.get("selling_price") or prod.get("retail_price")

        # Need a supplier — fetch or create
        rs = await client.get(f"{BASE_URL}/suppliers", headers=tenant_h)
        suppliers = rs.json() if rs.status_code == 200 else []
        if not suppliers:
            cs = await client.post(
                f"{BASE_URL}/suppliers",
                headers=tenant_h,
                json={"name": f"TEST_iter19_supplier_{uuid.uuid4().hex[:6]}", "phone": "0555"},
            )
            assert cs.status_code in (200, 201), cs.text
            supplier_id = cs.json()["id"]
        else:
            supplier_id = suppliers[0]["id"]

        # Use a unique new purchase price + selling price
        new_purchase_price = 999.99
        new_selling_price = 1499.99

        # Need a cash_box for payment_method
        rcb = await client.get(f"{BASE_URL}/cash-boxes", headers=tenant_h)
        cash_boxes = rcb.json() if rcb.status_code == 200 else []
        payment_method = cash_boxes[0]["id"] if cash_boxes else "cash"

        purchase_payload = {
            "supplier_id": supplier_id,
            "items": [{
                "product_id": prod_id,
                "product_name": prod.get("name_ar") or prod.get("name_en") or "TEST_iter19",
                "quantity": 1,
                "unit_price": new_purchase_price,
                "total": new_purchase_price,
                "selling_price": new_selling_price,
                "update_product_prices": True,
            }],
            "total": new_purchase_price,
            "paid_amount": 0,
            "payment_method": payment_method,
            "notes": "TEST_iter19_price_sync",
        }
        rpost = await client.post(f"{BASE_URL}/purchases", headers=tenant_h, json=purchase_payload)
        assert rpost.status_code in (200, 201), rpost.text

        # Re-GET the product
        rget = await client.get(f"{BASE_URL}/products/{prod_id}", headers=tenant_h)
        assert rget.status_code == 200
        updated = rget.json()

        assert float(updated["purchase_price"]) == pytest.approx(new_purchase_price, rel=1e-3), \
            f"purchase_price did not sync: {updated.get('purchase_price')}"
        assert float(updated["selling_price"]) == pytest.approx(new_selling_price, rel=1e-3), \
            f"selling_price did not sync: {updated.get('selling_price')}"

        # Restore (best-effort)
        if original_purchase_price is not None and original_selling_price is not None:
            try:
                await client.put(
                    f"{BASE_URL}/products/{prod_id}",
                    headers=tenant_h,
                    json={"purchase_price": original_purchase_price, "selling_price": original_selling_price},
                )
            except Exception:
                pass
