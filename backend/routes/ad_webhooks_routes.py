"""Ad Lead Webhooks — Facebook & TikTok Lead Ads.

Public endpoints (no JWT). Signature verification via env secrets:
  FB_APP_SECRET     -> X-Hub-Signature-256 (facebook)
  TIKTOK_APP_SECRET -> X-Tt-Signature / X-Signature (tiktok)
If the secret env var is not set, verification is skipped (dev mode).
"""
import hashlib
import hmac
import json
import logging
import os
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Request, HTTPException, Depends

logger = logging.getLogger(__name__)


def _verify_signature(raw_body: bytes, signature: str, secret: str, prefix: str = "sha256=") -> bool:
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(f"{prefix}{expected}", signature or "")


def _extract_fields(field_data: list) -> dict:
    """Turn FB field_data [{name, values:[..]}] into a flat dict."""
    out = {}
    for f in field_data or []:
        name = f.get("name", "")
        values = f.get("values", [])
        out[name] = values[0] if values else ""
    return out


def create_ad_webhooks_routes(db, main_db, get_current_user, get_tenant_db=None) -> APIRouter:
    router = APIRouter(prefix="/webhooks", tags=["ad-lead-webhooks"])

    async def _handle_lead(source: str, request: Request, secret_env: str, sig_header: str, prefix: str = "sha256=", target_db=None):
        tdb = target_db if target_db is not None else db  # p95b: tenant-scoped writes
        raw = await request.body()
        secret = os.environ.get(secret_env, "")
        if secret:
            sig = request.headers.get(sig_header, "")
            if not sig or not _verify_signature(raw, sig, secret, prefix):
                raise HTTPException(status_code=401, detail="توقيع غير صالح")
        try:
            payload = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="حمولة JSON غير صالحة")
        return await _save_lead(tdb, source, payload)

    async def _save_lead(tdb, source: str, payload: dict) -> dict:
        """p96: extract contact fields from a lead payload and persist (lead + customer + notification)."""
        # Facebook shape: field_data list; TikTok shape: flat fields
        if isinstance(payload.get("field_data"), list):
            fields = _extract_fields(payload["field_data"])
        else:
            fields = payload.get("fields") or payload

        name = fields.get("full_name") or fields.get("name") or fields.get("customer_name") or ""
        phone = fields.get("phone_number") or fields.get("phone") or fields.get("telephone") or ""
        email = fields.get("email") or ""
        if not (name or phone):
            return {"success": False, "skipped": "no_contact_info"}

        now = datetime.now(timezone.utc).isoformat()
        lead = {
            "id": str(uuid.uuid4()),
            "source": source,
            "name": name,
            "phone": phone,
            "email": email,
            "status": "new",
            "lead_id": payload.get("lead_id", ""),
            "form_id": payload.get("form_id", ""),
            "raw": {k: v for k, v in fields.items() if k not in ("raw",)},
            "created_at": now,
        }
        await tdb.leads.insert_one(dict(lead))

        # Add to customers if new (by phone)
        customer_created = False
        if phone:
            existing = await tdb.customers.find_one({"phone": phone}, {"_id": 0, "id": 1})
            if not existing:
                await tdb.customers.insert_one({
                    "id": str(uuid.uuid4()),
                    "name": name or f"زبون {source}",
                    "phone": phone,
                    "email": email,
                    "source": source,
                    "balance": 0,
                    "total_purchases": 0,
                    "created_at": now,
                })
                customer_created = True

        # Notification for admins
        await tdb.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "type": "info",
            "title": f"Lead جديد من {source}",
            "message": f"Lead جديد: {name or 'بدون اسم'} — {phone or 'بدون هاتف'}",
            "read": False,
            "created_at": now,
        })

        logger.info("Ad lead saved: source=%s phone=%s", source, phone)
        return {"success": True, "lead_created": True, "customer_created": customer_created}

    @router.post("/facebook-leads")
    async def facebook_leads(request: Request):
        return await _handle_lead("facebook", request, "FB_APP_SECRET", "X-Hub-Signature-256")

    @router.get("/facebook-leads")
    async def facebook_verify(request: Request):
        """Meta webhook handshake (hub.challenge)."""
        params = request.query_params
        verify_token = os.environ.get("FB_VERIFY_TOKEN", "")
        if verify_token and params.get("hub.verify_token") == verify_token:
            return int(params.get("hub.challenge", "0")) if params.get("hub.challenge", "").isdigit() else params.get("hub.challenge", "")
        raise HTTPException(status_code=403, detail="رمز التحقق غير صالح")

    @router.post("/tiktok-leads")
    async def tiktok_leads(request: Request):
        return await _handle_lead("tiktok", request, "TIKTOK_APP_SECRET", "X-Tt-Signature")

    async def _resolve_fb_leads(tdb, payload: dict) -> list:
        """p96: Meta leadgen webhooks carry only leadgen_id — fetch each lead from Graph API
        using the tenant's facebook channel access_token. Returns payloads with field_data."""
        ids = []
        for entry in (payload.get("entry") or []):
            for change in (entry.get("changes") or []):
                v = change.get("value") or {}
                lid = v.get("leadgen_id")
                if lid:
                    ids.append((lid, v.get("form_id", "")))
        if not ids:
            return []
        intg = await tdb.ecom_integrations.find_one(
            {"channel": "facebook", "is_active": True},
            {"_id": 0, "credentials": 1},
        )
        token = ((intg or {}).get("credentials") or {}).get("access_token", "")
        if not token:
            logger.warning("FB leadgen received but no facebook access_token saved for this tenant")
            return []
        out = []
        async with httpx.AsyncClient(timeout=15) as client:
            for lid, form_id in ids:
                try:
                    r = await client.get(f"https://graph.facebook.com/v21.0/{lid}", params={"access_token": token})
                    data = r.json()
                    if r.status_code == 200 and isinstance(data.get("field_data"), list):
                        data["lead_id"] = lid
                        if form_id and not data.get("form_id"):
                            data["form_id"] = form_id
                        out.append(data)
                    else:
                        logger.warning("FB lead fetch failed id=%s: %s", lid, data)
                except Exception as exc:
                    logger.warning("FB lead fetch error id=%s: %s", lid, exc)
        return out

    # ── p95b: tenant-scoped variants — leads land in the tenant DB the UI lists ──
    @router.post("/facebook-leads/{tenant_id}")
    async def facebook_leads_tenant(tenant_id: str, request: Request):
        tdb = get_tenant_db(tenant_id) if get_tenant_db else db
        raw = await request.body()
        secret = os.environ.get("FB_APP_SECRET", "")
        if secret:
            sig = request.headers.get("X-Hub-Signature-256", "")
            if not sig or not _verify_signature(raw, sig, secret):
                raise HTTPException(status_code=401, detail="توقيع غير صالح")
        try:
            payload = json.loads(raw)
        except Exception:
            raise HTTPException(status_code=400, detail="حمولة JSON غير صالحة")
        if isinstance(payload.get("field_data"), list):
            # connector-style payload (fields already inside) — save directly
            return await _save_lead(tdb, "facebook", payload)
        # p96: native Meta notification — resolve leadgen_id(s) via Graph API, no middleman
        resolved = await _resolve_fb_leads(tdb, payload)
        results = [await _save_lead(tdb, "facebook", p) for p in resolved]
        return {"success": True, "fetched": len(resolved), "results": results}

    @router.get("/facebook-leads/{tenant_id}")
    async def facebook_verify_tenant(tenant_id: str, request: Request):
        return await facebook_verify(request)

    @router.post("/tiktok-leads/{tenant_id}")
    async def tiktok_leads_tenant(tenant_id: str, request: Request):
        tdb = get_tenant_db(tenant_id) if get_tenant_db else db
        return await _handle_lead("tiktok", request, "TIKTOK_APP_SECRET", "X-Tt-Signature", target_db=tdb)

    # ── Admin: leads list + webhook config status ──
    @router.get("/leads")
    async def list_leads(source: str = None, limit: int = 50, user: dict = Depends(get_current_user)):
        query = {"source": source} if source else {}
        return await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 200))

    @router.get("/config")
    async def webhook_config(user: dict = Depends(get_current_user)):
        return {
            "facebook_verify_token": os.environ.get("FB_VERIFY_TOKEN", ""),
            "facebook_app_secret_set": bool(os.environ.get("FB_APP_SECRET")),
            "tiktok_app_secret_set": bool(os.environ.get("TIKTOK_APP_SECRET")),
            "hmac_note": "إن لم تُضبط الأسرار (APP_SECRET) يعمل الويبهوك في وضع التطوير بدون تحقق HMAC",
        }

    return router
