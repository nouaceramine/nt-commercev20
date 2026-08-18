"""
POS user preferences — per-tenant-per-user storage for things like the
draggable shortcuts grid layout. Lightweight: a single document per user.

Collections:
    (tenant DB)   pos_user_settings              { user_id, shortcuts, updated_at }
    (main DB)     platform_default_pos_shortcuts { id='default', shortcuts, updated_at, updated_by }

If a tenant user has no `pos_user_settings` row yet, GET /pos/shortcuts falls
back to the platform-default shortcuts so cashiers get a sensible starter grid.
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel


class ShortcutItem(BaseModel):
    productId: Optional[str] = None
    color: Optional[str] = None
    label: Optional[str] = None


class ShortcutsPayload(BaseModel):
    shortcuts: List[ShortcutItem]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_pos_settings_routes(db, main_db, get_current_user, get_super_admin, get_tenant_admin=None) -> APIRouter:
    """db is the tenant_db (each call uses the request-scoped context)."""
    router = APIRouter(tags=["pos-settings"])

    @router.get("/pos/shortcuts")
    async def get_shortcuts(user: dict = Depends(get_current_user)) -> dict:
        user_id = user.get("id")
        doc = await db.pos_user_settings.find_one({"user_id": user_id}, {"_id": 0})
        if doc:
            return {"shortcuts": doc.get("shortcuts", []), "source": "user"}
        # Fall back to the platform-wide default grid (defined by super-admin).
        default_doc = await main_db.platform_default_pos_shortcuts.find_one({"id": "default"}, {"_id": 0})
        if default_doc and default_doc.get("shortcuts"):
            return {"shortcuts": default_doc.get("shortcuts", []), "source": "default"}
        return {"shortcuts": [], "source": "empty"}

    @router.put("/pos/shortcuts")
    async def save_shortcuts(payload: ShortcutsPayload, user: dict = Depends(get_current_user)) -> dict:
        user_id = user.get("id")
        cleaned = [s.model_dump(exclude_none=False) for s in payload.shortcuts]
        await db.pos_user_settings.update_one(
            {"user_id": user_id},
            {"$set": {
                "user_id": user_id,
                "shortcuts": cleaned,
                "updated_at": _now(),
            }},
            upsert=True,
        )
        return {"ok": True, "count": len(cleaned)}

    # ── Super-admin: platform-wide default shortcuts grid ──
    @router.get("/saas/default-pos-shortcuts")
    async def get_default_shortcuts(admin: dict = Depends(get_super_admin)) -> dict:
        doc = await main_db.platform_default_pos_shortcuts.find_one({"id": "default"}, {"_id": 0})
        if not doc:
            return {"shortcuts": [], "updated_at": None, "updated_by": None}
        return {
            "shortcuts": doc.get("shortcuts", []),
            "updated_at": doc.get("updated_at"),
            "updated_by": doc.get("updated_by"),
        }

    @router.put("/saas/default-pos-shortcuts")
    async def save_default_shortcuts(payload: ShortcutsPayload, admin: dict = Depends(get_super_admin)) -> dict:
        cleaned = [s.model_dump(exclude_none=False) for s in payload.shortcuts]
        await main_db.platform_default_pos_shortcuts.update_one(
            {"id": "default"},
            {"$set": {
                "id": "default",
                "shortcuts": cleaned,
                "updated_at": _now(),
                "updated_by": admin.get("email") or admin.get("id"),
            }},
            upsert=True,
        )
        return {"ok": True, "count": len(cleaned)}

    # ── p165: weight-scale barcode configuration (per tenant) ──
    # Label scales print EAN-13: prefix (2 digits) + PLU + weight + check digit.

    @router.get("/pos/scale-config")
    async def get_scale_config(user: dict = Depends(get_current_user)) -> dict:
        doc = await db.pos_scale_config.find_one({"id": "default"}, {"_id": 0})
        if not doc:
            return {"enabled": False, "prefix": "21", "plu_digits": 5, "weight_digits": 5, "weight_decimals": 3}
        return doc

    @router.put("/pos/scale-config")
    async def save_scale_config(payload: dict, user: dict = Depends(get_current_user)) -> dict:
        doc = {
            "id": "default",
            "enabled": bool(payload.get("enabled", False)),
            "prefix": str(payload.get("prefix", "21"))[:2],
            "plu_digits": int(payload.get("plu_digits", 5)),
            "weight_digits": int(payload.get("weight_digits", 5)),
            "weight_decimals": int(payload.get("weight_decimals", 3)),
            "updated_at": _now(),
        }
        await db.pos_scale_config.update_one({"id": "default"}, {"$set": doc}, upsert=True)
        doc.pop("_id", None)
        return doc

    return router
