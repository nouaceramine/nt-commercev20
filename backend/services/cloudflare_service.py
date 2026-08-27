"""p328: Cloudflare DNS automation — store subdomains <slug>.nt-commerce.net.

Token + zone id live (AES-256-GCM) in main_db.platform_settings
(_id='cloudflare_settings'), managed via /api/saas/cloudflare-settings.
Failures are logged, never raised — store settings must save even if CF is down.
"""
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

CF_API = "https://api.cloudflare.com/client/v4"
BASE_DOMAIN = "nt-commerce.net"


async def _cf_config():
    from config.database import main_db
    from services.crypto_fields import decrypt_field as _dec
    doc = await main_db.platform_settings.find_one({"_id": "cloudflare_settings"}) or {}
    token = _dec(doc.get("api_token", "") or "")
    zone_id = doc.get("zone_id") or ""
    return token, zone_id


async def cf_configured() -> bool:
    token, zone_id = await _cf_config()
    return bool(token and zone_id)


async def _find_record_id(slug: str) -> Optional[str]:
    token, zone_id = await _cf_config()
    if not (token and zone_id):
        return None
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{CF_API}/zones/{zone_id}/dns_records",
            headers={"Authorization": f"Bearer {token}"},
            params={"name": f"{slug}.{BASE_DOMAIN}", "type": "CNAME"},
        )
        for rec in (r.json().get("result") or []):
            return rec.get("id")
    return None


async def ensure_store_subdomain(slug: str) -> bool:
    """Idempotent: proxied CNAME <slug>.<base> -> <base> (edge SSL via Universal SSL)."""
    token, zone_id = await _cf_config()
    if not (token and zone_id and slug):
        return False
    try:
        if await _find_record_id(slug):
            return True
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(
                f"{CF_API}/zones/{zone_id}/dns_records",
                headers={"Authorization": f"Bearer {token}"},
                json={"type": "CNAME", "name": slug, "content": BASE_DOMAIN,
                      "proxied": True, "ttl": 1, "comment": "p328: store subdomain (auto)"},
            )
            ok = bool(r.json().get("success"))
            if not ok:
                logger.warning("p328 CF create failed for %s: %s", slug, r.text[:200])
            return ok
    except Exception as exc:  # noqa: BLE001
        logger.warning("p328 ensure_store_subdomain(%s) failed: %s", slug, exc)
        return False


async def remove_store_subdomain(slug: str) -> bool:
    token, zone_id = await _cf_config()
    if not (token and zone_id and slug):
        return False
    try:
        rec_id = await _find_record_id(slug)
        if not rec_id:
            return True
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.delete(
                f"{CF_API}/zones/{zone_id}/dns_records/{rec_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            return bool(r.json().get("success"))
    except Exception as exc:  # noqa: BLE001
        logger.warning("p328 remove_store_subdomain(%s) failed: %s", slug, exc)
        return False
