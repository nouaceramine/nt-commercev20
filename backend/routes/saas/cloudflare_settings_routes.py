"""p328: Cloudflare settings (super-admin) — token مشفر AES-256-GCM + اختبار حقيقي."""
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException

from config.database import main_db
from .helpers import get_super_admin

router = APIRouter()


def _mask(v: str) -> str:
    if not v:
        return ""
    return "••••" + v[-4:] if len(v) > 4 else "••••"


@router.get("/saas/cloudflare-settings")
async def get_cf_settings(admin: dict = Depends(get_super_admin)):
    from services.crypto_fields import decrypt_field as _dec
    doc = await main_db.platform_settings.find_one({"_id": "cloudflare_settings"}) or {}
    return {
        "api_token_masked": _mask(_dec(doc.get("api_token", "") or "")),
        "zone_id": doc.get("zone_id") or "",
        "has_token": bool(doc.get("api_token")),
        "updated_at": doc.get("updated_at"),
    }


@router.put("/saas/cloudflare-settings")
async def put_cf_settings(body: dict, admin: dict = Depends(get_super_admin)):
    updates = {"updated_at": datetime.now(timezone.utc).isoformat(), "updated_by": admin.get("id")}
    if "api_token" in body:
        tok = str(body.get("api_token") or "").strip()
        if tok:
            from services.crypto_fields import encrypt_field as _ef
            updates["api_token"] = _ef(tok)
        else:
            updates["api_token"] = ""
    if "zone_id" in body:
        updates["zone_id"] = str(body.get("zone_id") or "").strip()
    existing = await main_db.platform_settings.find_one({"_id": "cloudflare_settings"}) or {}
    merged = {**existing, **updates, "_id": "cloudflare_settings"}
    await main_db.platform_settings.update_one(
        {"_id": "cloudflare_settings"}, {"$set": merged}, upsert=True
    )
    return {"ok": True, "saved": [k for k in ("api_token", "zone_id") if k in updates]}


@router.post("/saas/cloudflare-settings/test")
async def test_cf_settings(admin: dict = Depends(get_super_admin)):
    """تحقق حقيقي: tokens/verify + اسم الـ zone."""
    from services.cloudflare_service import _cf_config, CF_API
    token, zone_id = await _cf_config()
    if not (token and zone_id):
        raise HTTPException(status_code=400, detail="الرمز أو Zone ID غير مضبوط")
    async with httpx.AsyncClient(timeout=20) as c:
        v = await c.get(f"{CF_API}/user/tokens/verify", headers={"Authorization": f"Bearer {token}"})
        ok = bool(v.json().get("success"))
        zone_name = ""
        if ok:
            z = await c.get(f"{CF_API}/zones/{zone_id}", headers={"Authorization": f"Bearer {token}"})
            zone_name = (z.json().get("result") or {}).get("name") or ""
    return {"ok": ok, "zone": zone_name}
