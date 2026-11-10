
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from repositories.base_repository import BaseRepository
import uuid
import logging

logger = logging.getLogger(__name__)

def create_suppliers_routes(db, get_current_user):
    # p492: permission parity — writes on suppliers (a money-linked party) require
    # suppliers.edit, same as the core update/delete paths and customers.delete.
    from utils.permissions import create_permission_checker
    require_permission = create_permission_checker(db, get_current_user)
    repo = BaseRepository(lambda: db["suppliers"])  # lazy: resolve per-request (tenant-aware)
    router = APIRouter(prefix="/suppliers", tags=["Suppliers"])

    @router.get("")
    async def list_items(skip: int = 0, limit: int = 1000, search: str = None, user=Depends(get_current_user)):
        # Frontend expects a plain array (legacy contract).
        # p492: default limit raised 100 -> 1000 (parity with GET /customers) —
        # tenants with >100 suppliers silently lost rows in SuppliersPage.
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
    async def create_item(data: dict, user=Depends(require_permission("suppliers.edit"))):
        # p492: was raw `repo.create(data)` — any authenticated role could insert
        # arbitrary unvalidated docs (empty/HTML name, ghost family_id, no
        # family_name, datetime created_at, missing balances). Now: schema
        # validation (pydantic -> 422 via the global handler), ghost family 404,
        # family_name resolution and normalized defaults (parity with customers).
        from models.schemas import SupplierCreate
        s = SupplierCreate(**data)
        family_name = ""
        if s.family_id:
            family = await db["supplier_families"].find_one({"id": s.family_id}, {"_id": 0, "name": 1})
            if not family:
                raise HTTPException(status_code=404, detail="عائلة الموردين غير موجودة")
            family_name = family["name"]
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": str(uuid.uuid4()),
            "name": s.name,
            "phone": s.phone or "",
            "email": s.email or "",
            "address": s.address or "",
            "notes": s.notes or "",
            "code": s.code or "",
            "family_id": s.family_id or "",
            "family_name": family_name,
            "advance_balance": 0,
            "balance": 0,
            "total_purchases": 0,
            "created_at": now,
        }
        await db["suppliers"].insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.delete("/{id}")
    async def delete_item(id: str, user=Depends(require_permission("suppliers.edit"))):
        # p492: was any-authenticated-user hard delete with no guards — an agent
        # could delete a supplier that has purchases history or a prepaid
        # advance balance, orphaning both. Guards mirror delete_customer.
        supplier = await db["suppliers"].find_one({"id": id}, {"_id": 0, "name": 1, "advance_balance": 1})
        if not supplier:
            raise HTTPException(status_code=404, detail="المورد غير موجود")
        advance = float(supplier.get("advance_balance") or 0)
        if advance > 0:
            raise HTTPException(
                status_code=400,
                detail=f"لا يمكن حذف '{supplier.get('name', '')}': له رصيد دفعات مسبقة قائم ({advance})",
            )
        purchases_count = await db["purchases"].count_documents({"supplier_id": id})
        if purchases_count:
            raise HTTPException(
                status_code=400,
                detail=f"لا يمكن حذف '{supplier.get('name', '')}': مورد حقيقي له {purchases_count} حركة شراء مسجلة",
            )
        result = await db["suppliers"].delete_one({"id": id})
        if result.deleted_count == 0:
            # lost a concurrent delete race (parity with delete_customer)
            raise HTTPException(status_code=404, detail="المورد غير موجود")
        return {"success": True}

    return router
