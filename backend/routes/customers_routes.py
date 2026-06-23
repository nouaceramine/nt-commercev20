"""
Customer Routes - Extracted from server.py
Full CRUD, pagination, blacklist management
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid


def create_customers_routes(db, get_current_user, get_tenant_admin, require_tenant) -> dict:
    from utils.permissions import create_permission_checker
    require_permission = create_permission_checker(db, get_current_user)
    router = APIRouter(prefix="/customers", tags=["customers"])

    # ── Create Customer ──
    @router.post("", status_code=201)
    async def create_customer(customer: dict, user: dict = Depends(require_permission("customers.view"))):
        from models.schemas import CustomerCreate, CustomerResponse
        c = CustomerCreate(**customer)
        customer_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        if c.phone:
            existing = await db.customers.find_one({"phone": c.phone})
            if existing:
                raise HTTPException(status_code=409, detail=f"زبون برقم الهاتف هذا موجود مسبقاً: {existing.get('name')}")

        family_name = ""
        if c.family_id:
            family = await db.customer_families.find_one({"id": c.family_id}, {"_id": 0, "name": 1})
            if family:
                family_name = family["name"]

        customer_doc = {
            "id": customer_id, "name": c.name,
            "phone": c.phone or "", "email": c.email or "",
            "address": c.address or "", "notes": c.notes or "",
            "code": c.code or "",
            "family_id": c.family_id or "", "family_name": family_name,
            "total_purchases": 0, "balance": 0, "created_at": now
        }
        await db.customers.insert_one(customer_doc)
        customer_doc.pop("_id", None)
        return customer_doc

    # ── Get Customers ──
    @router.get("")
    async def get_customers(search: Optional[str] = None, family_id: Optional[str] = None, user: dict = Depends(require_permission("customers.view"))):
        query = {}
        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"phone": {"$regex": search, "$options": "i"}},
                {"code": {"$regex": search, "$options": "i"}}
            ]
        if family_id:
            query["family_id"] = family_id

        customers = await db.customers.find(query, {"_id": 0}).to_list(1000)

        # Batch fetch families to avoid N+1
        family_ids = list(set(c.get("family_id") for c in customers if c.get("family_id") and not c.get("family_name")))
        families_map = {}
        if family_ids:
            families = await db.customer_families.find({"id": {"$in": family_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(family_ids))
            families_map = {f["id"]: f.get("name", "") for f in families}

        for customer in customers:
            if customer.get("family_id") and not customer.get("family_name"):
                customer["family_name"] = families_map.get(customer["family_id"], "")
            elif not customer.get("family_name"):
                customer["family_name"] = ""
            if not customer.get("family_id"):
                customer["family_id"] = ""
            if not customer.get("code"):
                customer["code"] = ""
        return customers

    # ── Paginated Customers ──
    @router.get("/paginated")
    async def get_customers_paginated(
        search: Optional[str] = None, family_id: Optional[str] = None,
        page: int = 1, page_size: int = 20,
        user: dict = Depends(require_tenant)
    ):
        query = {}
        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"phone": {"$regex": search, "$options": "i"}},
                {"code": {"$regex": search, "$options": "i"}}
            ]
        if family_id:
            query["family_id"] = family_id

        total = await db.customers.count_documents(query)
        total_pages = (total + page_size - 1) // page_size if page_size > 0 else 1
        skip = (page - 1) * page_size
        customers = await db.customers.find(query, {"_id": 0}).skip(skip).limit(page_size).to_list(page_size)

        # Batch fetch families to avoid N+1
        family_ids = list(set(c.get("family_id") for c in customers if c.get("family_id") and not c.get("family_name")))
        families_map = {}
        if family_ids:
            families = await db.customer_families.find({"id": {"$in": family_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(family_ids))
            families_map = {f["id"]: f.get("name", "") for f in families}

        for customer in customers:
            if customer.get("family_id") and not customer.get("family_name"):
                customer["family_name"] = families_map.get(customer["family_id"], "")
            elif not customer.get("family_name"):
                customer["family_name"] = ""
            if not customer.get("family_id"):
                customer["family_id"] = ""
            if not customer.get("code"):
                customer["code"] = ""

        return {"items": customers, "total": total, "page": page, "page_size": page_size, "total_pages": total_pages}

    # ── Generate Customer Code ──
    @router.get("/generate-code")
    async def generate_customer_code():
        pipeline = [
            {"$match": {"code": {"$regex": "^CL\\d{4}$"}}},
            {"$project": {"num": {"$toInt": {"$substr": ["$code", 2, 4]}}}},
            {"$sort": {"num": -1}},
            {"$limit": 1}
        ]
        result = await db.customers.aggregate(pipeline).to_list(1)
        next_num = result[0]["num"] + 1 if result else 1
        return {"code": f"CL{str(next_num).zfill(4)}"}

    # ── Get Single Customer ──
    @router.get("/{customer_id}")
    async def get_customer(customer_id: str, user: dict = Depends(require_permission("customers.view"))):
        customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        if customer.get("family_id") and not customer.get("family_name"):
            family = await db.customer_families.find_one({"id": customer["family_id"]}, {"_id": 0, "name": 1})
            customer["family_name"] = family["name"] if family else ""
        elif not customer.get("family_name"):
            customer["family_name"] = ""
        if not customer.get("family_id"):
            customer["family_id"] = ""
        return customer

    # ── Update Customer ──
    @router.put("/{customer_id}")
    async def update_customer(customer_id: str, updates: dict, user: dict = Depends(require_permission("customers.view"))):
        customer = await db.customers.find_one({"id": customer_id})
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        update_data = {k: v for k, v in updates.items() if v is not None and k != "id"}
        if "family_id" in update_data:
            if update_data["family_id"]:
                family = await db.customer_families.find_one({"id": update_data["family_id"]}, {"_id": 0, "name": 1})
                update_data["family_name"] = family["name"] if family else ""
            else:
                update_data["family_name"] = ""
        if update_data:
            await db.customers.update_one({"id": customer_id}, {"$set": update_data})
        updated = await db.customers.find_one({"id": customer_id}, {"_id": 0})
        if not updated.get("family_id"):
            updated["family_id"] = ""
        if not updated.get("family_name"):
            updated["family_name"] = ""
        return updated

    # ── Delete Customer ──
    @router.delete("/{customer_id}")
    async def delete_customer(customer_id: str, admin: dict = Depends(require_permission("customers.edit"))):
        result = await db.customers.delete_one({"id": customer_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Customer not found")
        return {"message": "Customer deleted successfully"}

    return router
