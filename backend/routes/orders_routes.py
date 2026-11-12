"""
Generic orders CRUD (tenant `orders` collection).

p494i: writes are admin-only and payload-sanitised — previously any
authenticated role (e.g. agent) could POST/PATCH/DELETE arbitrary docs,
including overwriting `_id`/`tenant_id`.
"""
from fastapi import APIRouter, Depends, HTTPException
from repositories.base_repository import BaseRepository
import logging

logger = logging.getLogger(__name__)

# Fields a client may never set/overwrite through the generic CRUD.
_PROTECTED_KEYS = {"_id", "id", "tenant_id", "created_at"}


def _sanitize(data: dict) -> dict:
    return {k: v for k, v in (data or {}).items() if k not in _PROTECTED_KEYS}


def create_orders_routes(db, get_current_user, get_tenant_admin):
    repo = BaseRepository(lambda: db["orders"])  # lazy: resolve per-request (tenant-aware)
    router = APIRouter(prefix="/orders", tags=["Orders"])

    @router.get("")
    async def list_orders(skip: int = 0, limit: int = 100, status: str = None, user=Depends(get_current_user)):
        query = {}
        if status:
            query["status"] = status
        items = await repo.collection.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        for item in items:
            item["_id"] = str(item.get("_id", ""))
        return {"items": items, "total": await repo.count(query)}

    @router.post("")
    async def create_order(data: dict, admin=Depends(get_tenant_admin)):
        return await repo.create(_sanitize(data))

    @router.patch("/{id}")
    async def update_order(id: str, data: dict, admin=Depends(get_tenant_admin)):
        success = await repo.update(id, _sanitize(data))
        if not success:
            raise HTTPException(status_code=404, detail="Order not found")
        return {"success": True}

    @router.delete("/{id}")
    async def delete_order(id: str, admin=Depends(get_tenant_admin)):
        success = await repo.delete(id)
        if not success:
            raise HTTPException(status_code=404, detail="Order not found")
        return {"success": True}

    return router
