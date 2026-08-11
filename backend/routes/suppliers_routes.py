
from fastapi import APIRouter, Depends, HTTPException
from repositories.base_repository import BaseRepository
import logging

logger = logging.getLogger(__name__)

def create_suppliers_routes(db, get_current_user):
    repo = BaseRepository(lambda: db["suppliers"])  # lazy: resolve per-request (tenant-aware)
    router = APIRouter(prefix="/suppliers", tags=["Suppliers"])

    @router.get("")
    async def list_items(skip: int = 0, limit: int = 100, search: str = None, user=Depends(get_current_user)):
        # Frontend expects a plain array (legacy contract)
        if search:
            docs = await db["suppliers"].find(
                {"$or": [{"name": {"$regex": search, "$options": "i"}},
                         {"phone": {"$regex": search, "$options": "i"}},
                         {"email": {"$regex": search, "$options": "i"}}]},
                {"_id": 0},
            ).skip(skip).limit(limit).to_list(limit)
            return docs
        items = await repo.find_all(skip=skip, limit=limit, sort_field="created_at")
        return items

    @router.post("")
    async def create_item(data: dict, user=Depends(get_current_user)):
        return await repo.create(data)

    @router.delete("/{id}")
    async def delete_item(id: str, user=Depends(get_current_user)):
        success = await repo.delete(id)
        if not success:
            raise HTTPException(status_code=404, detail="Not found")
        return {"success": True}

    return router
