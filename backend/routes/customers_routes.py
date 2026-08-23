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
            "price_tier": c.price_tier or "retail",
            "national_id": c.national_id or "", "commercial_register": c.commercial_register or "",
            "birthdate": c.birthdate or "", "customer_type": c.customer_type or "regular",
            "max_debt_limit": c.max_debt_limit or 0, "special_discount": c.special_discount or 0,
            "total_purchases": 0, "balance": 0, "sources": [], "created_at": now
        }
        await db.customers.insert_one(customer_doc)
        customer_doc.pop("_id", None)
        return customer_doc

    # ── Get Customers ──
    @router.get("")
    async def get_customers(search: Optional[str] = None, family_id: Optional[str] = None, source: Optional[str] = None, user: dict = Depends(require_permission("customers.view"))):
        query = {}
        if source:
            query["sources"] = source
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
        source: Optional[str] = None,
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
        if source:
            query["sources"] = source  # p170: فئة الزبون (pos/recharge/digital/repairs/ecom)

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
    async def generate_customer_code(user: dict = Depends(require_tenant)):
        # p257: atomic counter
        from services.code_generator import next_code
        return {"code": await next_code(db, "customers", "CL", 4, False)}

    # ── p172: Customer 360° overview — activity across all five categories ──
    @router.get("/cross-sell/summary")
    async def cross_sell_summary(user: dict = Depends(require_permission("customers.view"))):
        """Counts per source + pairwise matrix (customers with X also having Y)."""
        sources = ["pos", "recharge", "digital", "repairs", "ecom"]
        per = {}
        matrix = {}
        for src in sources:
            per[src] = await db.customers.count_documents({"sources": src})
            row = {}
            for other in sources:
                if other == src:
                    continue
                row[other] = await db.customers.count_documents({"sources": {"$all": [src], "$ne": other}})
            matrix[src] = row
        uncategorized = await db.customers.count_documents({"$or": [{"sources": {"$exists": False}}, {"sources": {"$size": 0}}]})
        return {"per_source": per, "have_without": matrix, "uncategorized": uncategorized}

    @router.get("/cross-sell")
    async def cross_sell(have: str, missing: str, limit: int = 100, user: dict = Depends(require_permission("customers.view"))):
        """Customers in category `have` but NOT in category `missing` — cross-sell targets."""
        rows = await db.customers.find(
            {"sources": {"$all": [have], "$ne": missing}},
            {"_id": 0, "id": 1, "name": 1, "phone": 1, "sources": 1, "balance": 1}
        ).limit(min(limit, 500)).to_list(min(limit, 500))
        return {"have": have, "missing": missing, "count": len(rows), "customers": rows}

    # ── p172: Customer 360° overview ──
    @router.get("/{customer_id}/overview")
    async def customer_overview(customer_id: str, user: dict = Depends(require_permission("customers.view"))):
        customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
        if not customer:
            raise HTTPException(status_code=404, detail="الزبون غير موجود")
        phone = (customer.get("phone") or "").strip()
        RECHARGE_TYPES = ("recharge_credit", "recharge_cash", "idoom_credit", "sim_activation", "card_sale")

        pos = {"count": 0, "total": 0.0}
        recharge = {"count": 0, "total": 0.0}
        digital = {"count": 0, "total": 0.0}
        last_activity = ""
        sales = await db.sales.find(
            {"customer_id": customer_id, "status": {"$ne": "returned"}},
            {"_id": 0, "total": 1, "type": 1, "created_at": 1}
        ).to_list(1000)
        for s in sales:
            t = s.get("type") or ""
            bucket = digital if t == "digital_subscription" else (recharge if t in RECHARGE_TYPES else pos)
            bucket["count"] += 1
            bucket["total"] += float(s.get("total") or 0)
            if (s.get("created_at") or "") > last_activity:
                last_activity = s.get("created_at") or ""

        repairs = {"count": 0, "total": 0.0, "open": 0}
        if phone:
            async for tk in db.repair_tickets.find({"customer_phone": phone}, {"_id": 0, "status": 1, "final_cost": 1, "estimated_cost": 1, "created_at": 1}):
                repairs["count"] += 1
                repairs["total"] += float(tk.get("final_cost") or tk.get("estimated_cost") or 0)
                if tk.get("status") != "delivered":
                    repairs["open"] += 1
                if (tk.get("created_at") or "") > last_activity:
                    last_activity = tk.get("created_at") or ""

        ecom = {"count": 0, "total": 0.0, "delivered": 0, "returned": 0}
        if phone:
            async for o in db.ecom_orders.find({"customer.phone": phone}, {"_id": 0, "total": 1, "status": 1, "created_at": 1}):
                ecom["count"] += 1
                ecom["total"] += float(o.get("total") or 0)
                if o.get("status") == "delivered":
                    ecom["delivered"] += 1
                if o.get("status") == "returned":
                    ecom["returned"] += 1
                if (o.get("created_at") or "") > last_activity:
                    last_activity = o.get("created_at") or ""

        for b in (pos, recharge, digital, repairs, ecom):
            b["total"] = round(b["total"], 2)

        return {
            "customer": customer,
            "categories": {"pos": pos, "recharge": recharge, "digital": digital, "repairs": repairs, "ecom": ecom},
            "debts": {
                "balance": float(customer.get("balance") or 0),
                "total_debt": float(customer.get("total_debt") or 0),
                "max_debt_limit": float(customer.get("max_debt_limit") or 0),
            },
            "last_activity": last_activity,
        }

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
        customer = await db.customers.find_one({"id": customer_id}, {"_id": 0, "name": 1, "balance": 1})
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        # Guard: outstanding debt (open sales) — deleting would orphan the debt
        # and hide it from every aggregate view (/debts/summary drops unknown customers)
        open_debt = await db.sales.count_documents({
            "customer_id": customer_id, "status": {"$ne": "returned"}, "remaining": {"$gt": 0}
        })
        if open_debt:
            raise HTTPException(
                status_code=400,
                detail=f"لا يمكن حذف '{customer.get('name', '')}': عليه دين قائم في {open_debt} فاتورة غير مسددة. سوّ الدين أولاً",
            )
        # Guard: any sales history — deleting orphans the records (same policy as products)
        sales_count = await db.sales.count_documents({"customer_id": customer_id})
        if sales_count:
            raise HTTPException(
                status_code=400,
                detail=f"لا يمكن حذف '{customer.get('name', '')}': زبون حقيقي له {sales_count} حركة بيع مسجلة",
            )
        result = await db.customers.delete_one({"id": customer_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Customer not found")
        return {"message": "Customer deleted successfully"}

    return router
