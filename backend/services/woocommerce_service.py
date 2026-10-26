"""Real WooCommerce REST API adapter. No simulated publish or sync success."""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException


def _base_url(settings: dict) -> str:
    raw = (settings.get("store_url") or "").strip().rstrip("/")
    parsed = urlparse(raw)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise HTTPException(status_code=400, detail="رابط WooCommerce يجب أن يكون HTTPS صالحًا دون بيانات دخول")
    host = parsed.hostname
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(host, parsed.port or 443, type=socket.SOCK_STREAM)}
    except socket.gaierror:
        raise HTTPException(status_code=400, detail="تعذر حل اسم نطاق WooCommerce")
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if not ip.is_global:
            raise HTTPException(status_code=400, detail="عنوان WooCommerce الداخلي أو الخاص غير مسموح")
    return raw


def _credentials(settings: dict) -> tuple[str, str]:
    key = (settings.get("consumer_key") or "").strip()
    secret = (settings.get("consumer_secret") or "").strip()
    if not key or not secret:
        raise HTTPException(status_code=400, detail="مفاتيح WooCommerce غير مكتملة")
    return key, secret


async def request(settings: dict, method: str, path: str, **kwargs) -> dict:
    base = _base_url(settings)
    auth = _credentials(settings)
    try:
        async with httpx.AsyncClient(timeout=25, follow_redirects=False) as client:
            response = await client.request(method, base + path, auth=auth, **kwargs)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"تعذر الاتصال بـWooCommerce: {type(exc).__name__}")
    if response.status_code in (301, 302, 303, 307, 308):
        raise HTTPException(status_code=502, detail="WooCommerce أعاد توجيهًا غير متوقع")
    try:
        data = response.json()
    except ValueError:
        data = {}
    if response.status_code >= 400:
        message = data.get("message") if isinstance(data, dict) else None
        raise HTTPException(status_code=502, detail=f"WooCommerce HTTP {response.status_code}: {message or 'request failed'}")
    return data


async def test_connection(settings: dict) -> dict:
    data = await request(settings, "GET", "/wp-json/wc/v3/system_status")
    environment = data.get("environment") or {}
    return {
        "name": (data.get("settings") or {}).get("title") or urlparse(settings["store_url"]).hostname,
        "url": settings["store_url"],
        "version": environment.get("version") or "",
    }


def _product_id(product: dict) -> int | None:
    value = product.get("woocommerce_id")
    if value in (None, ""):
        return None
    try:
        product_id = int(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="معرّف منتج WooCommerce غير صالح")
    if product_id <= 0:
        raise HTTPException(status_code=400, detail="معرّف منتج WooCommerce غير صالح")
    return product_id


def product_payload(product: dict) -> dict:
    price = product.get("retail_price", product.get("price", 0)) or 0
    quantity = product.get("quantity", product.get("stock", 0)) or 0
    payload = {
        "name": product.get("name_en") or product.get("name_ar") or product.get("name") or "Product",
        "type": "simple",
        "regular_price": str(price),
        "manage_stock": True,
        "stock_quantity": int(quantity),
        "sku": str(product.get("article_code") or product.get("barcode") or ""),
    }
    return payload


async def publish_product(settings: dict, product: dict) -> dict:
    existing_id = _product_id(product)
    if existing_id:
        data = await request(settings, "PUT", f"/wp-json/wc/v3/products/{existing_id}", json=product_payload(product))
    else:
        data = await request(settings, "POST", "/wp-json/wc/v3/products", json=product_payload(product))
    if not data.get("id"):
        raise HTTPException(status_code=502, detail="WooCommerce لم يُرجع معرّف المنتج")
    return {"id": data["id"], "url": data.get("permalink") or "", "status": data.get("status") or "publish"}


async def unpublish_product(settings: dict, product: dict) -> None:
    existing_id = _product_id(product)
    if not existing_id:
        return
    await request(settings, "DELETE", f"/wp-json/wc/v3/products/{existing_id}?force=false")


async def sync_inventory(settings: dict, product: dict) -> None:
    existing_id = _product_id(product)
    if not existing_id:
        raise HTTPException(status_code=400, detail="المنتج غير مرتبط بـWooCommerce")
    quantity = int(product.get("quantity", product.get("stock", 0)) or 0)
    await request(settings, "PUT", f"/wp-json/wc/v3/products/{existing_id}", json={"manage_stock": True, "stock_quantity": quantity})
