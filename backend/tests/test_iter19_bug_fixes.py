"""Iter-19 regressions using only an isolated TEST-P486 tenant.

Covers e-commerce channel catalogue, manual-order product links and purchase
price synchronization without reading or mutating any production tenant.
"""
import os

import httpx
import pytest
import requests

BASE_URL = (
    os.environ.get("P486_BASE")
    or os.environ.get("REACT_APP_BACKEND_URL")
    or "http://localhost:8001"
).rstrip("/") + "/api"


@pytest.fixture(scope="module")
def tenant_info(p486_tenant_factory):
    return p486_tenant_factory("iter19-pos", ecommerce_hub=True)


@pytest.fixture(scope="module")
def tenant_h(tenant_info):
    return tenant_info["headers"]


@pytest.fixture(scope="module")
def test_product(tenant_h):
    response = requests.post(
        f"{BASE_URL}/products", headers=tenant_h,
        json={
            "name_en": "TEST-P486 Product",
            "name_ar": "TEST-P486 Product",
            "purchase_price": 100,
            "retail_price": 200,
            "quantity": 10,
            "barcode": "TEST-P486-PRODUCT",
        },
        timeout=20,
    )
    assert response.status_code == 201, response.text[:400]
    product = response.json()
    assert product["id"]
    return product


@pytest.fixture(scope="module")
def test_supplier(tenant_h):
    response = requests.post(
        f"{BASE_URL}/suppliers", headers=tenant_h,
        json={"name": "TEST-P486 Supplier", "phone": "0555000486"}, timeout=20,
    )
    assert response.status_code in (200, 201), response.text[:400]
    supplier = response.json()
    assert supplier["id"]
    return supplier


@pytest.mark.asyncio
async def test_ecom_channels_catalogue_includes_all_supported(tenant_h):
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(f"{BASE_URL}/ecom/channels", headers=tenant_h)
        assert response.status_code == 200, response.text
        keys = [channel["key"] for channel in response.json()["channels"]]
        for expected in ("shopify", "facebook", "instagram", "tiktok", "whatsapp", "telegram", "viber"):
            assert expected in keys, f"missing sales channel: {expected}"


@pytest.mark.asyncio
async def test_manual_order_links_pos_product_id(tenant_h, test_product):
    async with httpx.AsyncClient(timeout=20) as client:
        payload = {
            "channel": "manual",
            "customer": {
                "name": "TEST-P486 ProductLink",
                "phone": "0555000486",
                "wilaya": "الجزائر",
                "city": "الجزائر الوسطى",
                "address": "TEST-P486",
            },
            "items": [{
                "name": test_product.get("name_ar") or test_product["name_en"],
                "sku": test_product.get("barcode") or "",
                "qty": 1,
                "price": float(test_product.get("retail_price") or 100),
                "product_id": test_product["id"],
            }],
            "shipping_fee": 0,
            "notes": "TEST-P486 product_id link",
        }
        created = await client.post(f"{BASE_URL}/ecom/orders", headers=tenant_h, json=payload)
        assert created.status_code == 200, created.text
        order = created.json()
        order_id = order["id"]
        try:
            assert order["items"][0].get("product_id") == test_product["id"]
            fetched = await client.get(f"{BASE_URL}/ecom/orders/{order_id}", headers=tenant_h)
            assert fetched.status_code == 200, fetched.text
            assert fetched.json()["items"][0].get("product_id") == test_product["id"]
        finally:
            await client.put(
                f"{BASE_URL}/ecom/orders/{order_id}/status",
                headers=tenant_h, json={"status": "cancelled"},
            )
            await client.delete(f"{BASE_URL}/ecom/orders/{order_id}", headers=tenant_h)


@pytest.mark.asyncio
async def test_purchase_syncs_both_prices_on_product(tenant_h, test_product, test_supplier):
    async with httpx.AsyncClient(timeout=20) as client:
        cash_boxes_response = await client.get(f"{BASE_URL}/cash-boxes", headers=tenant_h)
        assert cash_boxes_response.status_code == 200, cash_boxes_response.text
        cash_boxes = cash_boxes_response.json()
        payment_method = cash_boxes[0]["id"] if cash_boxes else "cash"
        new_purchase_price = 999.99
        new_retail_price = 1499.99
        purchase_payload = {
            "supplier_id": test_supplier["id"],
            "items": [{
                "product_id": test_product["id"],
                "product_name": test_product.get("name_ar") or test_product["name_en"],
                "quantity": 1,
                "unit_price": new_purchase_price,
                "total": new_purchase_price,
                "retail_price": new_retail_price,
                "update_product_prices": True,
            }],
            "total": new_purchase_price,
            "paid_amount": 0,
            "payment_method": payment_method,
            "notes": "TEST-P486 price sync",
        }
        created = await client.post(f"{BASE_URL}/purchases", headers=tenant_h, json=purchase_payload)
        assert created.status_code in (200, 201), created.text

        updated_response = await client.get(f"{BASE_URL}/products/{test_product['id']}", headers=tenant_h)
        assert updated_response.status_code == 200, updated_response.text
        updated = updated_response.json()
        assert float(updated["purchase_price"]) == pytest.approx(new_purchase_price, rel=1e-3)
        assert float(updated["retail_price"]) == pytest.approx(new_retail_price, rel=1e-3)
