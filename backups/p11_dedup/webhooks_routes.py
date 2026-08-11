
from fastapi import APIRouter, Depends, HTTPException
from repositories.base_repository import BaseRepository
import logging

logger = logging.getLogger(__name__)

def create_webhooks_routes(db, get_current_user):
    repo = BaseRepository(lambda: db["webhooks"])  # lazy: resolve per-request (tenant-aware)
    router = APIRouter(prefix="/webhooks", tags=["Webhooks"])

    @router.get("")
    async def list_items(skip: int = 0, limit: int = 100, user=Depends(get_current_user)):
        items = await repo.find_all(skip=skip, limit=limit, sort_field="created_at")
        return {"items": items}

    @router.post("")
    async def create_item(data: dict, user=Depends(get_current_user)):
        return await repo.create(data)

    @router.patch("/{id}")
    async def update_item(id: str, data: dict, user=Depends(get_current_user)):
        success = await repo.update(id, data)
        if not success:
            raise HTTPException(status_code=404, detail="Not found")
        return {"success": True}

    @router.delete("/{id}")
    async def delete_item(id: str, user=Depends(get_current_user)):
        success = await repo.delete(id)
        if not success:
            raise HTTPException(status_code=404, detail="Not found")
        return {"success": True}

    return router
