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
    creds = integration.get("credentials") or {}
    api_id = (creds.get("api_id") or "").strip()
    api_token = (creds.get("api_token") or "").strip()
    if not api_id or not api_token:
        raise YalidineCredentialsMissing("api_id and api_token are required")
    return api_id, api_token


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
