"""Ad Lead Webhooks — Facebook & TikTok Lead Ads.

Public endpoints (no JWT). Signature verification via env secrets:
  FB_APP_SECRET     -> X-Hub-Signature-256 (facebook)
  TIKTOK_APP_SECRET -> X-Tt-Signature / X-Signature (tiktok)
If the secret env var is not set, verification is skipped (dev mode).
"""
import hashlib
import hmac
import logging
import os
import uuid
from datetime import datetime, timezone

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


def create_ad_webhooks_routes(db, main_db, get_current_user) -> APIRouter:
    router = APIRouter(prefix="/webhooks", tags=["ad-lead-webhooks"])

    async def _handle_lead(source: str, request: Request, secret_env: str, sig_header: str, prefix: str = "sha256="):
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
        await db.leads.insert_one(dict(lead))

        # Add to customers if new (by phone)
        customer_created = False
        if phone:
            existing = await db.customers.find_one({"phone": phone}, {"_id": 0, "id": 1})
            if not existing:
                await db.customers.insert_one({
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
        await db.notifications.insert_one({
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
