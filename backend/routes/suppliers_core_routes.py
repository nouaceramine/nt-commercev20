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

    @router.post("/{supplier_id}/advance-payment")
    async def add_supplier_advance_payment(supplier_id: str, payment: SupplierAdvancePayment, user: dict = Depends(require_permission("suppliers.view"))):
        supplier = await db.suppliers.find_one({"id": supplier_id})
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")
        amount = round(float(payment.amount or 0), 2)
        if amount <= 0:
            raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون أكبر من صفر")
        method = payment.payment_method or "cash"
        if not await db.cash_boxes.find_one({"id": method}):
            raise HTTPException(status_code=404, detail="الصندوق غير موجود")
        now = datetime.now(timezone.utc).isoformat()
        advance_record = {"id": str(uuid.uuid4()), "supplier_id": supplier_id, "supplier_name": supplier["name"], "amount": amount, "payment_method": method, "notes": payment.notes, "user_id": user["id"], "user_name": user.get("name", ""), "created_at": now}
        # p203: the advance actually leaves the chosen cash box (it never did
        # before), and everything commits or aborts together (pattern p195)
        from config.database import client as _client, main_db as _main_db
        from services.outbox import outbox_write
        async with await _client.start_session() as _tx:
            async with _tx.start_transaction():
                await db.cash_boxes.update_one({"id": method}, {"$inc": {"balance": -amount}, "$set": {"updated_at": now}}, session=_tx)
                await db.transactions.insert_one({"id": str(uuid.uuid4()), "cash_box_id": method, "type": "expense", "amount": amount, "description": f"دفعة مسبقة للمورد - {supplier['name']}", "reference_type": "supplier_advance", "reference_id": advance_record["id"], "created_at": now, "created_by": user.get("name", "")}, session=_tx)
                await db.suppliers.update_one({"id": supplier_id}, {"$inc": {"advance_balance": amount}, "$set": {"updated_at": now}}, session=_tx)
                await db.supplier_advance_payments.insert_one(advance_record, session=_tx)
                # p203: outbox → auto journal entry (Dr 402 / Cr box)
                await outbox_write(
                    _main_db, "supplier.advance_paid",
                    {
                        "payment_id": advance_record["id"],
                        "supplier_id": supplier_id,
                        "supplier_name": supplier["name"],
                        "amount": amount,
                        "payment_method": method,
                    },
                    tenant_id=user.get("tenant_id") or "platform",
                    source="suppliers_core_routes",
                    session=_tx,
                )
        advance_record.pop("_id", None)
        return {"message": "Advance payment recorded", "new_advance_balance": round(float(supplier.get("advance_balance", 0)) + amount, 2)}

    @router.get("/{supplier_id}/advance-payments")
    async def get_supplier_advance_payments(supplier_id: str, user: dict = Depends(require_permission("suppliers.view"))):
        return await db.supplier_advance_payments.find({"supplier_id": supplier_id}, {"_id": 0}).sort("created_at", -1).to_list(100)

    return router
