"""Generic courier status-sync framework (p248).

p74 wired Yalidine only; competitors (EcoManager) auto-sync many Algerian
couriers. This module generalises the sync loop:

- `yalidine` adapter: wraps the existing real service (services/ecom/
  yalidine_service.py) — unchanged behaviour.
- `generic_http` adapter: declarative per-courier config kept on the
  integration's credentials, so ZR Express / Maystro / Noest / Ecotrack /
  Guepex plug in WITHOUT code changes once the tenant enters credentials:
    {
      "api_token":  "...",                 # secret (encrypted at rest, p226)
      "base_url":   "https://api.<courier>.dz",
      "tracking_style": "path"|"param",    # /{base}/{tracking} or ?tracking=
      "auth_header": "Authorization",
      "auth_prefix": "Bearer ",
      "status_path": "status|data.status"  # dot path to raw status string
    }
- `status_map` on the integration maps raw courier statuses to internal
  targets (delivered|refunded); sane keyword defaults included.
- Mock mode: credentials {"mock_status": "Livrée"} → no HTTP, for tests/demo.

The sync loop itself mirrors sync-yalidine: shipped orders with a tracking
number are advanced through the REAL state machine (change_order_status) so
delivered collects COD + realizes profit and refunded books the return.
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# couriers known to the platform (constants.py CHANNELS) and their adapter
COURIER_ADAPTERS = {
    "yalidine": {"adapter": "yalidine", "label_ar": "يالدين"},
    "zr":       {"adapter": "generic_http", "label_ar": "ZR Express"},
    "maystro":  {"adapter": "generic_http", "label_ar": "Maystro"},
    "noest":    {"adapter": "generic_http", "label_ar": "Noest"},
    "ecotrack": {"adapter": "generic_http", "label_ar": "Ecotrack"},
    "guepex":   {"adapter": "generic_http", "label_ar": "Guepex"},
}

# p256: every other registered courier defaults to the generic_http adapter —
# entering base_url + api_token in its integration activates sync with no
# code changes. Single source: services/ecom/algerian_couriers.py
from .algerian_couriers import EXTRA_COURIERS as _EXTRA_COURIERS
for _c in _EXTRA_COURIERS:
    COURIER_ADAPTERS.setdefault(_c["id"], {"adapter": "generic_http", "label_ar": _c["name_ar"]})

DELIVERED_KEYWORDS = ("livrée", "livre", "delivered", "تم التسليم", "delivred")
RETURN_KEYWORDS = ("retourn", "retour", "échec", "echec", "failed", "return",
                   "refus", "مرتجع", "أرجع")


def map_generic_status(raw_status: str, status_map: Optional[dict] = None):
    """raw courier status -> 'delivered' | 'refunded' | None (leave as-is).
    Explicit integration status_map wins; keyword heuristics are the default.
    'En livraison' style transit states are intentionally NOT delivered."""
    s = (raw_status or "").strip()
    if not s:
        return None
    if status_map and s in status_map:
        return status_map[s]
    low = s.lower()
    if "en livraison" in low or "out for delivery" in low or "en cours" in low:
        return None
    if any(k in low for k in RETURN_KEYWORDS):
        return "refunded"
    if any(k in low for k in DELIVERED_KEYWORDS):
        return "delivered"
    return None


class CourierNotConfigured(Exception):
    pass


async def fetch_courier_status(courier: str, integration: dict, tracking: str) -> str:
    """-> raw status string from the courier. Mock mode short-circuits HTTP."""
    creds = (integration or {}).get("credentials") or {}
    from services.crypto_fields import decrypt_credentials as _dc  # p272
    creds = _dc(creds)
    if creds.get("mock_status"):
        return str(creds["mock_status"])

    meta = COURIER_ADAPTERS.get(courier)
    if not meta:
        raise CourierNotConfigured(f"ناقل غير معروف: {courier}")

    if meta["adapter"] == "yalidine":
        from services.ecom.yalidine_service import fetch_parcel_status
        res = await fetch_parcel_status(integration, tracking)
        return str(res.get("last_status") or "")

    # generic_http
    base_url = (creds.get("base_url") or "").rstrip("/")
    token = creds.get("api_token") or creds.get("api_key") or ""
    if not base_url or not token:
        raise CourierNotConfigured(
            f"تكامل {meta['label_ar']} غير مُعَدّ — أدخل base_url و api_token في بيانات التكامل")
    auth_header = creds.get("auth_header") or "Authorization"
    auth_prefix = creds.get("auth_prefix")
    if auth_prefix is None:
        auth_prefix = "Bearer "
    status_path = creds.get("status_path") or "status"
    tracking_style = creds.get("tracking_style") or "path"

    import httpx
    url = f"{base_url}/{tracking}" if tracking_style == "path" else base_url
    params = {} if tracking_style == "path" else {"tracking": tracking}
    headers = {auth_header: f"{auth_prefix}{token}"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers=headers, params=params)
    if resp.status_code != 200:
        raise CourierNotConfigured(f"{meta['label_ar']} API ردّ {resp.status_code}")
    data = resp.json()
    cur = data
    for part in status_path.split("|")[0].split("."):
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            cur = None
            break
    return str(cur or "")


async def sync_courier_orders(db, courier: str, user: dict) -> dict:
    """Generic version of sync-yalidine for any registered courier."""
    meta = COURIER_ADAPTERS.get(courier)
    if not meta:
        raise CourierNotConfigured(f"ناقل غير معروف: {courier}")
    integration = await db.ecom_integrations.find_one(
        {"channel": courier, "is_active": True}, {"_id": 0})
    if not integration:
        raise CourierNotConfigured(f"تكامل {meta['label_ar']} غير موجود أو معطّل")
    creds = integration.get("credentials") or {}
    from services.crypto_fields import decrypt_credentials as _dc  # p272
    creds = _dc(creds)
    if not creds.get("mock_status") and meta["adapter"] == "generic_http" \
            and not (creds.get("base_url") and (creds.get("api_token") or creds.get("api_key"))):
        raise CourierNotConfigured(
            f"تكامل {meta['label_ar']} غير مُعَدّ — أدخل بيانات الاعتماد من صفحة التكاملات أولاً")
    if meta["adapter"] == "yalidine" and not creds.get("mock_status") and not creds.get("api_id"):
        raise CourierNotConfigured("تكامل يالدين غير مُعَدّ — أدخل المفاتيح من صفحة التكاملات أولاً")

    orders = await db.ecom_orders.find(
        {"status": "shipped", "courier": courier, "tracking_number": {"$nin": [None, ""]}},
        {"_id": 0},
    ).to_list(500)

    from services.application.ecom_order_service import change_order_status
    status_map = integration.get("status_map") or {}
    results = {"courier": courier, "checked": 0, "delivered": 0, "returned": 0,
               "unchanged": 0, "errors": []}
    for o in orders:
        results["checked"] += 1
        try:
            raw = await fetch_courier_status(courier, integration, o["tracking_number"])
            target = map_generic_status(raw, status_map)
            if target == "delivered":
                await change_order_status(db, o["id"], "delivered",
                                          f"مزامنة {meta['label_ar']} التلقائية", user)
                results["delivered"] += 1
            elif target == "refunded":
                await change_order_status(db, o["id"], "refunded",
                                          f"مزامنة {meta['label_ar']} — رفض الاستلام / إرجاع", user)
                results["returned"] += 1
            else:
                results["unchanged"] += 1
        except Exception as exc:  # noqa: BLE001 — one parcel must not stop the batch
            logger.warning("courier sync %s failed for %s: %s", courier, o.get("order_code"), exc)
            results["errors"].append({"order_code": o.get("order_code"), "error": str(exc)[:200]})
    return results
