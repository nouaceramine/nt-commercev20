"""
Supplier Routes - Extracted from server.py
CRUD, advance payments, debt payment
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid


def create_suppliers_routes(db, get_current_user, get_tenant_admin, require_tenant) -> dict:
    from utils.permissions import create_permission_checker
    require_permission = create_permission_checker(db, get_current_user)
    router = APIRouter(prefix="/suppliers", tags=["suppliers"])

    class SupplierAdvancePayment(BaseModel):
        amount: float
        payment_method: str = "cash"
        notes: str = ""

    @router.post("", status_code=201)
    async def create_supplier(supplier: dict, admin: dict = Depends(require_permission("suppliers.edit"))):
        from models.schemas import SupplierCreate, SupplierResponse
        s = SupplierCreate(**supplier)
        sid = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        if s.phone:
            existing = await db.suppliers.find_one({"phone": s.phone})
            if existing:
                raise HTTPException(status_code=409, detail=f"مورد برقم الهاتف هذا موجود مسبقاً: {existing.get('name')}")
        family_name = ""
        if s.family_id:
            family = await db.supplier_families.find_one({"id": s.family_id}, {"_id": 0, "name": 1})
            if family:
                family_name = family["name"]
        doc = {"id": sid, "name": s.name, "phone": s.phone or "", "email": s.email or "", "address": s.address or "", "notes": s.notes or "", "code": s.code or "", "family_id": s.family_id or "", "family_name": family_name, "total_purchases": 0, "balance": 0, "created_at": now}
        await db.suppliers.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.get("")
    async def get_suppliers(search: Optional[str] = None, family_id: Optional[str] = None, admin: dict = Depends(require_permission("suppliers.edit"))):
        query = {}
        if search:
            query["$or"] = [{"name": {"$regex": search, "$options": "i"}}, {"phone": {"$regex": search, "$options": "i"}}, {"code": {"$regex": search, "$options": "i"}}]
        if family_id:
            query["family_id"] = family_id
        suppliers = await db.suppliers.find(query, {"_id": 0}).to_list(1000)

        # Batch fetch families to avoid N+1
        fam_ids = list(set(s.get("family_id") for s in suppliers if s.get("family_id") and not s.get("family_name")))
        fam_map = {}
        if fam_ids:
            fams = await db.supplier_families.find({"id": {"$in": fam_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(fam_ids))
            fam_map = {f["id"]: f.get("name", "") for f in fams}

        for s in suppliers:
            if s.get("family_id") and not s.get("family_name"):
                s["family_name"] = fam_map.get(s["family_id"], "")
            for field in ["family_name", "family_id", "code"]:
                if not s.get(field):
                    s[field] = ""
        return suppliers

    @router.get("/paginated")
    async def get_suppliers_paginated(
        search: Optional[str] = None, family_id: Optional[str] = None,
        page: int = 1, page_size: int = 20,
        admin: dict = Depends(require_permission("suppliers.edit"))
    ):
        from utils.pagination import paginate
        query = {}
        if search:
            query["$or"] = [{"name": {"$regex": search, "$options": "i"}}, {"phone": {"$regex": search, "$options": "i"}}, {"code": {"$regex": search, "$options": "i"}}]
        if family_id:
            query["family_id"] = family_id
        result = await paginate(db.suppliers, query, page, page_size)

        # Batch fetch families
        fam_ids = list(set(s.get("family_id") for s in result["items"] if s.get("family_id") and not s.get("family_name")))
        fam_map = {}
        if fam_ids:
            fams = await db.supplier_families.find({"id": {"$in": fam_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(fam_ids))
            fam_map = {f["id"]: f.get("name", "") for f in fams}
        for s in result["items"]:
            if s.get("family_id") and not s.get("family_name"):
                s["family_name"] = fam_map.get(s["family_id"], "")
            for field in ["family_name", "family_id", "code"]:
                if not s.get(field):
                    s[field] = ""
        return result

    @router.get("/generate-code")
    async def generate_supplier_code():
        pipeline = [{"$match": {"code": {"$regex": "^FR\\d{4}$"}}}, {"$project": {"num": {"$toInt": {"$substr": ["$code", 2, 4]}}}}, {"$sort": {"num": -1}}, {"$limit": 1}]
        result = await db.suppliers.aggregate(pipeline).to_list(1)
        next_num = result[0]["num"] + 1 if result else 1
        return {"code": f"FR{str(next_num).zfill(4)}"}

    @router.get("/{supplier_id}")
    async def get_supplier(supplier_id: str, admin: dict = Depends(require_permission("suppliers.edit"))):
        s = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
        if not s:
            raise HTTPException(status_code=404, detail="Supplier not found")
        for field in ["family_name", "family_id"]:
            if not s.get(field):
                s[field] = ""
        return s

    @router.put("/{supplier_id}")
    async def update_supplier(supplier_id: str, updates: dict, admin: dict = Depends(require_permission("suppliers.edit"))):
        s = await db.suppliers.find_one({"id": supplier_id})
        if not s:
            raise HTTPException(status_code=404, detail="Supplier not found")
        update_data = {k: v for k, v in updates.items() if v is not None and k != "id"}
        if "family_id" in update_data:
            if update_data["family_id"]:
                family = await db.supplier_families.find_one({"id": update_data["family_id"]}, {"_id": 0, "name": 1})
                update_data["family_name"] = family["name"] if family else ""
            else:
                update_data["family_name"] = ""
        if update_data:
            await db.suppliers.update_one({"id": supplier_id}, {"$set": update_data})
        updated = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
        return updated

    @router.delete("/{supplier_id}")
    async def delete_supplier(supplier_id: str, admin: dict = Depends(require_permission("suppliers.edit"))):
        result = await db.suppliers.delete_one({"id": supplier_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Supplier not found")
        return {"message": "Supplier deleted successfully"}

    @router.post("/{supplier_id}/advance-payment")
    async def add_supplier_advance_payment(supplier_id: str, payment: SupplierAdvancePayment, user: dict = Depends(require_permission("suppliers.view"))):
        supplier = await db.suppliers.find_one({"id": supplier_id})
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")
        current_advance = supplier.get("advance_balance", 0)
        new_advance = current_advance + payment.amount
        await db.suppliers.update_one({"id": supplier_id}, {"$set": {"advance_balance": new_advance, "updated_at": datetime.now(timezone.utc).isoformat()}})
        advance_record = {"id": str(uuid.uuid4()), "supplier_id": supplier_id, "supplier_name": supplier["name"], "amount": payment.amount, "payment_method": payment.payment_method, "notes": payment.notes, "user_id": user["id"], "user_name": user.get("name", ""), "created_at": datetime.now(timezone.utc).isoformat()}
        await db.supplier_advance_payments.insert_one(advance_record)
        advance_record.pop("_id", None)
        return {"message": "Advance payment recorded", "new_advance_balance": new_advance}

    @router.get("/{supplier_id}/advance-payments")
    async def get_supplier_advance_payments(supplier_id: str, user: dict = Depends(require_permission("suppliers.view"))):
        return await db.supplier_advance_payments.find({"supplier_id": supplier_id}, {"_id": 0}).sort("created_at", -1).to_list(100)

    return router
