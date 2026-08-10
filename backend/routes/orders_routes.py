
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from repositories.base_repository import BaseRepository
import logging

logger = logging.getLogger(__name__)

def create_orders_routes(db, get_current_user):
    repo = BaseRepository(db["orders"])
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
    async def create_order(data: dict, user=Depends(get_current_user)):
        return await repo.create(data)

    @router.patch("/{id}")
    async def update_order(id: str, data: dict, user=Depends(get_current_user)):
        success = await repo.update(id, data)
        if not success:
            raise HTTPException(status_code=404, detail="Order not found")
        return {"success": True}

    @router.delete("/{id}")
    async def delete_order(id: str, user=Depends(get_current_user)):
        success = await repo.delete(id)
        if not success:
            raise HTTPException(status_code=404, detail="Order not found")
        return {"success": True}

    return router
