"""Platform Catalog Routes — Admin manages IPTV/digital packages for tenants to buy."""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
import uuid

from config.database import db
from .helpers import get_super_admin

router = APIRouter(tags=["Platform Catalog"])


def _to_float(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


@router.get("/saas/platform-catalog")
async def list_platform_catalog(admin: dict = Depends(get_super_admin)):
    """List all platform catalog items (admin view — includes inactive)."""
    items = await db.platform_digital_catalog.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items


@router.post("/saas/platform-catalog", status_code=201)
async def create_platform_catalog_item(payload: dict, admin: dict = Depends(get_super_admin)):
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="اسم الباقة مطلوب")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "category": payload.get("category") or "iptv",
        "server_name": payload.get("server_name") or "",
        "supplier_name": payload.get("supplier_name") or "",
        "duration_months": payload.get("duration_months"),
        "cost_price": _to_float(payload.get("cost_price")),
        "sell_price": _to_float(payload.get("sell_price")),
        "description": payload.get("description") or "",
        "active": payload.get("active", True),
        "created_by": admin.get("email", ""),
        "created_at": now,
        "updated_at": now,
    }
    await db.platform_digital_catalog.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.put("/saas/platform-catalog/{item_id}")
async def update_platform_catalog_item(item_id: str, payload: dict, admin: dict = Depends(get_super_admin)):
    item = await db.platform_digital_catalog.find_one({"id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="الباقة غير موجودة")
    update = {k: v for k, v in payload.items() if k not in ("id", "_id", "created_at", "created_by")}
    for fld in ("cost_price", "sell_price"):
        if fld in update:
            update[fld] = _to_float(update[fld])
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.platform_digital_catalog.update_one({"id": item_id}, {"$set": update})
    return await db.platform_digital_catalog.find_one({"id": item_id}, {"_id": 0})


@router.delete("/saas/platform-catalog/{item_id}")
async def delete_platform_catalog_item(item_id: str, admin: dict = Depends(get_super_admin)):
    res = await db.platform_digital_catalog.delete_one({"id": item_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الباقة غير موجودة")
    return {"ok": True}
