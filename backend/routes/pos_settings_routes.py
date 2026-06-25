"""
POS user preferences — per-tenant-per-user storage for things like the
draggable shortcuts grid layout. Lightweight: a single document per user.

Collection (in each tenant DB):
    pos_user_settings  { user_id, shortcuts: [{productId, color, label?}], updated_at }
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


def create_pos_settings_routes(db, get_current_user) -> APIRouter:
    """db is the tenant_db (each call uses the request-scoped context)."""
    router = APIRouter(tags=["pos-settings"])

    @router.get("/pos/shortcuts")
    async def get_shortcuts(user: dict = Depends(get_current_user)) -> dict:
        user_id = user.get("id")
        doc = await db.pos_user_settings.find_one({"user_id": user_id}, {"_id": 0})
        if not doc:
            return {"shortcuts": []}
        return {"shortcuts": doc.get("shortcuts", [])}

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

    return router
