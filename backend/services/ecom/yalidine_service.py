"""Yalidine (Algerian shipping carrier) API client (iter 18.2 — P2 real integration)

API docs: https://yalidine.app/app/api/

Auth: every request needs two HTTP headers:
  X-API-ID:    api_id
  X-API-TOKEN: api_token

Both are stored per-integration in db.ecom_integrations[*].credentials.

When credentials are missing/blank, the service raises a typed exception that
the caller catches to fall back to mock mode. This keeps the P1 mock path alive
while P2 real integration is opt-in per tenant.
"""
import asyncio
import json
import logging
from typing import Optional
import httpx

logger = logging.getLogger(__name__)

YALIDINE_BASE_URL = "https://api.yalidine.app/v1"


class YalidineCredentialsMissing(Exception):
    """Raised when the integration doesn't have api_id/api_token configured."""


class YalidineAPIError(Exception):
    """Raised when Yalidine returns a non-2xx response."""


def _extract_creds(integration: Optional[dict]) -> tuple[str, str]:
    if not integration:
        raise YalidineCredentialsMissing("no integration row")
    from services.crypto_fields import decrypt_credentials as _dc  # p272
    creds = _dc(integration.get("credentials") or {})
    api_id = (creds.get("api_id") or "").strip()
    api_token = (creds.get("api_token") or "").strip()
    if not api_id or not api_token:
        raise YalidineCredentialsMissing("api_id and api_token are required")
    return api_id, api_token



YALIDINE_PROXY = "http://172.20.0.1:8899"  # host-side IPv6 egress proxy (ntcommerce-yalproxy.service)


async def _proxy_get_json(url: str, api_id: str, api_token: str) -> tuple[int, dict]:
    """GET via the host IPv6 proxy — Yalidine's WAF blocks this server's IPv4."""
    path = url[url.index("/v1/"):]
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.get(
                YALIDINE_PROXY + path,
                headers={"X-API-ID": api_id, "X-API-TOKEN": api_token},
            )
    except httpx.HTTPError as exc:
        raise YalidineAPIError(f"proxy network error: {exc}") from exc
    try:
        return resp.status_code, resp.json()
    except ValueError:
        return resp.status_code, {}


async def ping(integration: dict) -> dict:
    """Lightweight connectivity check — fetches Yalidine's wilayas list.

    Returns {ok: True, wilayas_count, sample_wilaya} on success.
    Raises YalidineCredentialsMissing or YalidineAPIError on failure.
    """
    api_id, api_token = _extract_creds(integration)
    headers = {"X-API-ID": api_id, "X-API-TOKEN": api_token}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{YALIDINE_BASE_URL}/wilayas/", headers=headers)
    except httpx.HTTPError as exc:
        raise YalidineAPIError(f"Network error: {exc}") from exc

    if resp.status_code == 401 or resp.status_code == 403:
        raise YalidineAPIError("مفاتيح Yalidine غير صحيحة (401/403)")
    if resp.status_code >= 400:
        raise YalidineAPIError(f"Yalidine returned HTTP {resp.status_code}: {resp.text[:200]}")

    data = resp.json()
    # Response shape: {"data": [{id, name, ...}], "total_data": N} OR a plain list
    wilayas = data.get("data") if isinstance(data, dict) else data
    if not isinstance(wilayas, list):
        raise YalidineAPIError("Unexpected Yalidine response shape")
    sample = wilayas[0] if wilayas else None
    return {
        "ok": True,
        "wilayas_count": len(wilayas),
        "sample_wilaya": (sample or {}).get("name") if isinstance(sample, dict) else None,
    }



async def create_parcel(integration: dict, order: dict) -> dict:
    """Create a parcel/shipment in Yalidine for the given order.

    Returns a normalised dict: {tracking_number, label_url, provider_response}.
    Raises YalidineCredentialsMissing or YalidineAPIError on failure.
    """
    api_id, api_token = _extract_creds(integration)
    customer = order.get("customer") or {}

    payload = [{
        "order_id": order.get("order_code") or order.get("id"),
        "from_wilaya_name": "Alger",   # tenant-configurable in P3; sane default for now
        "firstname": (customer.get("name") or "").split(" ", 1)[0] or "Client",
        "familyname": " ".join((customer.get("name") or "").split(" ")[1:]) or "—",
        "contact_phone": customer.get("phone") or "0000000000",
        "address": customer.get("address") or "—",
        "to_commune_name": customer.get("city") or "",
        "to_wilaya_name": customer.get("wilaya") or "Alger",
        "product_list": ", ".join((it.get("name") or "") for it in (order.get("items") or []))[:200],
        "price": int(order.get("total") or 0),
        "do_insurance": False,
        "declared_value": int(order.get("total") or 0),
        "length": 10,
        "width": 10,
        "height": 10,
        "weight": 1,
        "freeshipping": False,
        "is_stopdesk": False,
        "has_exchange": False,
    }]

    headers = {"X-API-ID": api_id, "X-API-TOKEN": api_token, "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(f"{YALIDINE_BASE_URL}/parcels/", headers=headers, json=payload)
    except httpx.HTTPError as exc:
        raise YalidineAPIError(f"Network error contacting Yalidine: {exc}") from exc

    if resp.status_code >= 400:
        logger.warning("Yalidine API %s: %s", resp.status_code, resp.text[:300])
        raise YalidineAPIError(f"Yalidine returned {resp.status_code}")

    data = resp.json()
    # Yalidine returns a dict keyed by the order_id we sent.
    first_key = next(iter(data), None)
    parcel = (data or {}).get(first_key) or {}
    tracking = parcel.get("tracking") or parcel.get("tracking_number") or ""
    label_url = parcel.get("label") or parcel.get("label_url") or ""

    if not tracking:
        raise YalidineAPIError("Yalidine response missing tracking number")

    return {
        "tracking_number": tracking,
        "label_url": label_url,
        "provider_response": data,
    }


async def fetch_parcel_status(integration: dict, tracking: str) -> dict:
    """Fetch a parcel's current status from Yalidine by tracking number.

    Returns {tracking, last_status}. Raises YalidineCredentialsMissing /
    YalidineAPIError on failure.
    """
    api_id, api_token = _extract_creds(integration)
    headers = {"X-API-ID": api_id, "X-API-TOKEN": api_token}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{YALIDINE_BASE_URL}/parcels/{tracking}/", headers=headers)
    except httpx.HTTPError as exc:
        raise YalidineAPIError(f"Network error: {exc}") from exc

    if resp.status_code >= 400:
        logger.warning("Yalidine parcel httpx %s for %s — retrying via IPv6 proxy", resp.status_code, tracking)
        code, data = await _proxy_get_json(f"{YALIDINE_BASE_URL}/parcels/{tracking}/", api_id, api_token)
        if code >= 400:
            raise YalidineAPIError(f"Yalidine returned HTTP {code} for {tracking}")
    else:
        data = resp.json()
    parcel = data.get("data") if isinstance(data, dict) else data
    if isinstance(parcel, list):
        parcel = parcel[0] if parcel else {}
    return {"tracking": tracking, "last_status": (parcel or {}).get("last_status", "") or ""}


def map_yalidine_status(last_status: str):
    """Map a Yalidine last_status string to an internal order status.

    'Livrée' → delivered ; return/failure variants → refunded ; else None.
    NB: 'En livraison' (out for delivery) is intentionally NOT delivered.
    """
    s = (last_status or "").strip().lower()
    if not s:
        return None
    if "livrée" in s or "livre" in s and "en livraison" not in s or s == "delivered":
        return "delivered"
    if "retourn" in s or "retour" in s or "échec" in s or "echec" in s or "failed" in s:
        return "refunded"
    return None


async def fetch_fees_for_wilaya(integration: dict, from_wilaya_id: int, to_wilaya_id: int) -> dict:
    """Fetch delivery fees from Yalidine for one destination wilaya.

    Returns {home, desk, retour} — representative prices = the most common
    commune price (fees are normally uniform inside a wilaya).
    """
    api_id, api_token = _extract_creds(integration)
    headers = {
        "X-API-ID": api_id, "X-API-TOKEN": api_token,
        # Yalidine throttles/blocks the default httpx UA on /fees/ — send a browser UA
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "application/json",
    }
    url = f"{YALIDINE_BASE_URL}/fees/?from_wilaya_id={from_wilaya_id}&to_wilaya_id={to_wilaya_id}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers=headers)
    except httpx.HTTPError as exc:
        raise YalidineAPIError(f"Network error: {exc}") from exc
    if resp.status_code >= 400:
        logger.warning("Yalidine fees httpx %s for wilaya %s — retrying via IPv6 proxy", resp.status_code, to_wilaya_id)
        code, data = await _proxy_get_json(url, api_id, api_token)
        if code >= 400:
            raise YalidineAPIError(f"Yalidine fees HTTP {code} for wilaya {to_wilaya_id}")
    else:
        data = resp.json() or {}
    communes = (data.get("per_commune") or {}).values()

    def _mode(values):
        vals = [v for v in values if isinstance(v, (int, float)) and v > 0]
        if not vals:
            return 0
        from collections import Counter
        return Counter(vals).most_common(1)[0][0]

    home = _mode([c.get("express_home") or c.get("economic_home") for c in communes])
    desk = _mode([c.get("express_desk") or c.get("economic_desk") for c in communes])
    return {"home": int(home), "desk": int(desk), "retour": int(data.get("retour_fee") or 0)}
