
from fastapi import APIRouter, Depends, HTTPException
import re
from repositories.base_repository import BaseRepository
import logging

logger = logging.getLogger(__name__)

# p492: fields a client may never write — identity and timestamps are
# server-owned (mass-assignment guard for the raw-dict payloads below).
_PROTECTED_FIELDS = {"id", "_id", "created_at", "updated_at"}


def create_promotions_routes(db, require_tenant, get_tenant_admin):
    repo = BaseRepository(lambda: db["promotions"])  # lazy: resolve per-request (tenant-aware)
    router = APIRouter(prefix="/promotions", tags=["Promotions"])

    async def _assert_code_available(code: str, exclude_id: str = ""):
        """p565: coupon codes are unique case-insensitively — the restaurant
        consumer matches case-insensitively, so two codes differing only by
        case would collide at lookup time."""
        query = {"code": {"$regex": f"^{re.escape(code)}$", "$options": "i"}}
        if exclude_id:
            query["id"] = {"$ne": exclude_id}
        clash = await db["promotions"].find_one(query, {"_id": 0, "id": 1})
        if clash:
            raise HTTPException(status_code=409, detail="رمز الكوبون مستعمل مسبقاً")

    @router.get("")
    async def list_items(skip: int = 0, limit: int = 100, user=Depends(require_tenant)):
        items = await repo.find_all(skip=skip, limit=limit, sort_field="created_at")
        return {"items": items}

    @router.post("")
    async def create_item(data: dict, admin=Depends(get_tenant_admin)):
        # p492: writes are admin-only; identity/timestamps are server-owned.
        payload = {k: v for k, v in (data or {}).items() if k not in _PROTECTED_FIELDS}
        if not payload:
            raise HTTPException(status_code=400, detail="بيانات العرض الترويجي فارغة")
        if isinstance(payload.get("code"), str) and payload["code"].strip():
            payload["code"] = payload["code"].strip()
            await _assert_code_available(payload["code"])
        return await repo.create(payload)

    @router.patch("/{id}")
    async def update_item(id: str, data: dict, admin=Depends(get_tenant_admin)):
        # p492: 404 only when the document is truly absent — previously a
        # no-op PATCH returned 404 because modified_count was 0.
        existing = await repo.find_by_id(id)
        if not existing:
            raise HTTPException(status_code=404, detail="Not found")
        payload = {k: v for k, v in (data or {}).items() if k not in _PROTECTED_FIELDS}
        if not payload:
            raise HTTPException(status_code=400, detail="لا توجد حقول قابلة للتحديث")
        if isinstance(payload.get("code"), str) and payload["code"].strip():
            payload["code"] = payload["code"].strip()
            await _assert_code_available(payload["code"], exclude_id=id)
        await repo.update(id, payload)
        return {"success": True}

    @router.delete("/{id}")
    async def delete_item(id: str, admin=Depends(get_tenant_admin)):
        success = await repo.delete(id)
        if not success:
            raise HTTPException(status_code=404, detail="Not found")
        return {"success": True}

    return router
