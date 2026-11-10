"""
Defective Goods Management System
Collections: defective_goods, defective_inspections, supplier_returns,
return_tracking, disposal_records, defect_categories, return_reasons, disposal_methods
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import uuid


def create_defective_routes(db, get_current_user, get_tenant_admin) -> dict:
    router = APIRouter(prefix="/defective", tags=["defective-goods"])

    async def _next_number(prefix: str, collection: str, session=None) -> str:
        # p492: atomic per-tenant counter (same pattern as purchase invoices) —
        # the old count_documents()+1 produced duplicate DEF/RET/DSP numbers under
        # concurrency. Seed from the legacy count so pre-fix records keep unique numbers.
        key = f"defective_{prefix}"
        if await db.counters.find_one({"_id": key}, session=session) is None:
            legacy = await db[collection].count_documents({}, session=session)
            await db.counters.update_one({"_id": key}, {"$setOnInsert": {"seq": legacy}},
                                         upsert=True, session=session)
        doc = await db.counters.find_one_and_update(
            {"_id": key}, {"$inc": {"seq": 1}},
            upsert=True, return_document=True, session=session,
        )
        return f"{prefix}-{doc['seq']:05d}"

    # ── Models ──
    class DefectiveCreate(BaseModel):
        product_id: str = ""
        product_name: str
        supplier_id: Optional[str] = None
        supplier_name: Optional[str] = None
        defect_type: str = "manufacturing"
        defect_severity: str = "medium"
        description: str = ""
        quantity: int = Field(default=1, ge=1)
        unit_cost: float = Field(default=0, ge=0)

    class InspectionCreate(BaseModel):
        defective_goods_id: str
        confirmed_defective: bool = True
        actual_defect_type: str = ""
        actual_quantity: int = 1
        recommended_action: str = "return_to_supplier"

    class SupplierReturnCreate(BaseModel):
        supplier_id: str
        supplier_name: str
        items: List[dict] = []
        notes: str = ""

    class DisposalCreate(BaseModel):
        items: List[dict] = []
        disposal_method: str = "destroy"
        reason: str = ""

    # ── Defect Categories ──
    @router.get("/categories")
    async def get_defect_categories(user: dict = Depends(get_current_user)):
        cats = await db.defect_categories.find({}, {"_id": 0}).to_list(100)
        if not cats:
            defaults = [
                {"id": str(uuid.uuid4()), "code": "MFG", "name_ar": "عيب تصنيع", "name_fr": "Défaut de fabrication", "severity": "high"},
                {"id": str(uuid.uuid4()), "code": "TRN", "name_ar": "تلف أثناء النقل", "name_fr": "Dommage de transport", "severity": "medium"},
                {"id": str(uuid.uuid4()), "code": "STR", "name_ar": "تلف أثناء التخزين", "name_fr": "Dommage de stockage", "severity": "low"},
                {"id": str(uuid.uuid4()), "code": "EXP", "name_ar": "منتهي الصلاحية", "name_fr": "Expiré", "severity": "high"},
                {"id": str(uuid.uuid4()), "code": "PKG", "name_ar": "عيب في التغليف", "name_fr": "Défaut d'emballage", "severity": "low"},
            ]
            await db.defect_categories.insert_many([dict(d) for d in defaults])
            return defaults
        return cats

    @router.post("/categories")
    async def create_category(data: dict, admin: dict = Depends(get_tenant_admin)):
        cat = {
            "id": str(uuid.uuid4()),
            "code": data.get("code", ""),
            "name_ar": data.get("name_ar", ""),
            "name_fr": data.get("name_fr", ""),
            "description_ar": data.get("description_ar", ""),
            "description_fr": data.get("description_fr", ""),
            "severity": data.get("severity", "medium"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.defect_categories.insert_one(cat)
        cat.pop("_id", None)
        return cat

    # ── Defective Goods ──
    @router.post("/goods")
    async def create_defective(data: DefectiveCreate, admin: dict = Depends(get_tenant_admin)):
        # p492: stock deduction + record + loss expense are ONE atomic operation,
        # with a stock-sufficiency guard (previously stock could go negative and a
        # failed expense insert was silently swallowed).
        from config.database import client
        from pymongo.errors import PyMongoError
        now = datetime.now(timezone.utc).isoformat()
        item = None
        for attempt in range(5):
            try:
                async with await client.start_session() as tx_session:
                    async with tx_session.start_transaction():
                        product = None
                        stock_field = "quantity"
                        if data.product_id:
                            product = await db.products.find_one({"id": data.product_id}, {"_id": 0}, session=tx_session)
                            if not product:
                                raise HTTPException(status_code=404, detail="المنتج غير موجود")
                            stock_field = "quantity" if "quantity" in product else "stock"
                            available = product.get(stock_field, 0) or 0
                            if available < data.quantity:
                                raise HTTPException(status_code=400, detail="الكمية المتاحة غير كافية")
                        unit_cost = data.unit_cost
                        product_name = data.product_name
                        if product:
                            if not product_name:
                                product_name = product.get("name_ar") or product.get("name_en") or product.get("name", "")
                            if not unit_cost:
                                unit_cost = product.get("purchase_price", 0) or 0
                        item = {
                            "id": str(uuid.uuid4()),
                            "defective_number": await _next_number("DEF", "defective_goods", session=tx_session),
                            "product_id": data.product_id,
                            "product_name": product_name,
                            "supplier_id": data.supplier_id,
                            "supplier_name": data.supplier_name,
                            "defect_type": data.defect_type,
                            "defect_severity": data.defect_severity,
                            "description": data.description,
                            "quantity": data.quantity,
                            "unit_cost": unit_cost,
                            "total_cost": data.quantity * unit_cost,
                            "status": "pending_inspection",
                            "inspected_by": None,
                            "inspected_at": None,
                            "action_taken": None,
                            "created_by": admin.get("name", admin.get("email", "")),
                            "created_at": now,
                        }
                        if product:
                            await db.products.update_one(
                                {"id": data.product_id}, {"$inc": {stock_field: -data.quantity}},
                                session=tx_session)
                        await db.defective_goods.insert_one(item, session=tx_session)
                        # Record the loss as an expense (inside the same transaction)
                        if item["total_cost"] > 0:
                            await db.expenses.insert_one({
                                "id": str(uuid.uuid4()),
                                "type": "defective_goods",
                                "category": "منتجات معيبة",
                                "amount": item["total_cost"],
                                "description": f"خسارة منتج معيب: {item.get('product_name', '')} × {data.quantity}",
                                "reference_type": "defective_goods",
                                "reference_id": item["id"],
                                "created_by": admin.get("name", ""),
                                "created_at": now,
                            }, session=tx_session)
                break
            except HTTPException:
                raise
            except PyMongoError:
                if attempt == 4:
                    raise
                continue
        item.pop("_id", None)
        return item

    @router.get("/goods")
    async def get_defective_goods(
        status: Optional[str] = None,
        severity: Optional[str] = None,
        search: Optional[str] = None,
        user: dict = Depends(get_current_user)
    ):
        query = {}
        if status:
            query["status"] = status
        if severity:
            query["defect_severity"] = severity
        if search:
            query["$or"] = [
                {"defective_number": {"$regex": search, "$options": "i"}},
                {"product_name": {"$regex": search, "$options": "i"}},
            ]
        return await db.defective_goods.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

    @router.get("/goods/{item_id}")
    async def get_defective_item(item_id: str, user: dict = Depends(get_current_user)):
        item = await db.defective_goods.find_one({"id": item_id}, {"_id": 0})
        if not item:
            raise HTTPException(status_code=404, detail="العنصر غير موجود")
        inspections = await db.defective_inspections.find({"defective_goods_id": item_id}, {"_id": 0}).to_list(20)
        item["inspections"] = inspections
        return item

    @router.put("/goods/{item_id}")
    async def update_defective(item_id: str, data: dict, admin: dict = Depends(get_tenant_admin)):
        data.pop("id", None)
        data.pop("defective_number", None)
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        res = await db.defective_goods.update_one({"id": item_id}, {"$set": data})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="العنصر غير موجود")
        return await db.defective_goods.find_one({"id": item_id}, {"_id": 0})

    @router.delete("/goods/{item_id}")
    async def delete_defective(item_id: str, restore_stock: bool = False, admin: dict = Depends(get_tenant_admin)):
        # p492: 404 on ghosts, cascade the linked inspections AND the loss expense
        # (previously the expense stayed as a phantom loss), optional stock restore.
        from config.database import client
        from pymongo.errors import PyMongoError
        for attempt in range(5):
            try:
                async with await client.start_session() as tx_session:
                    async with tx_session.start_transaction():
                        goods = await db.defective_goods.find_one({"id": item_id}, session=tx_session)
                        if not goods:
                            raise HTTPException(status_code=404, detail="العنصر غير موجود")
                        if restore_stock and goods.get("product_id"):
                            product = await db.products.find_one({"id": goods["product_id"]}, {"_id": 0}, session=tx_session)
                            if product:
                                stock_field = "quantity" if "quantity" in product else "stock"
                                await db.products.update_one(
                                    {"id": goods["product_id"]},
                                    {"$inc": {stock_field: goods.get("quantity", 0)}},
                                    session=tx_session)
                        await db.defective_goods.delete_one({"id": item_id}, session=tx_session)
                        await db.defective_inspections.delete_many({"defective_goods_id": item_id}, session=tx_session)
                        await db.expenses.delete_many(
                            {"reference_type": "defective_goods", "reference_id": item_id},
                            session=tx_session)
                break
            except HTTPException:
                raise
            except PyMongoError:
                if attempt == 4:
                    raise
                continue
        return {"message": "تم الحذف"}

    # ── Inspections ──
    @router.post("/inspections")
    async def create_inspection(data: InspectionCreate, admin: dict = Depends(get_tenant_admin)):
        # p492: ghost goods 404; a cleared (not defective) item returns its quantity
        # to stock and reverses the loss expense — previously both leaked.
        from config.database import client
        from pymongo.errors import PyMongoError
        inspection = None
        for attempt in range(5):
            try:
                async with await client.start_session() as tx_session:
                    async with tx_session.start_transaction():
                        goods = await db.defective_goods.find_one({"id": data.defective_goods_id}, session=tx_session)
                        if not goods:
                            raise HTTPException(status_code=404, detail="العنصر غير موجود")
                        inspection = {
                            "id": str(uuid.uuid4()),
                            **data.dict(),
                            "inspector_id": admin.get("id", ""),
                            "inspector_name": admin.get("name", admin.get("email", "")),
                            "created_at": datetime.now(timezone.utc).isoformat(),
                        }
                        await db.defective_inspections.insert_one(inspection, session=tx_session)
                        new_status = "confirmed_defective" if data.confirmed_defective else "not_defective"
                        await db.defective_goods.update_one(
                            {"id": data.defective_goods_id},
                            {"$set": {
                                "status": new_status,
                                "inspected_by": inspection["inspector_name"],
                                "inspected_at": inspection["created_at"],
                            }},
                            session=tx_session,
                        )
                        if not data.confirmed_defective and goods.get("status") != "not_defective":
                            pid = goods.get("product_id")
                            if pid:
                                product = await db.products.find_one({"id": pid}, {"_id": 0}, session=tx_session)
                                if product:
                                    stock_field = "quantity" if "quantity" in product else "stock"
                                    await db.products.update_one(
                                        {"id": pid}, {"$inc": {stock_field: goods.get("quantity", 0)}},
                                        session=tx_session)
                            await db.expenses.delete_many(
                                {"reference_type": "defective_goods", "reference_id": goods["id"]},
                                session=tx_session)
                break
            except HTTPException:
                raise
            except PyMongoError:
                if attempt == 4:
                    raise
                continue
        inspection.pop("_id", None)
        return inspection

    # ── Supplier Returns ──
    @router.post("/returns")
    async def create_return(data: SupplierReturnCreate, admin: dict = Depends(get_tenant_admin)):
        total_qty = sum(i.get("quantity", 0) for i in data.items)
        total_val = sum(i.get("quantity", 0) * i.get("unit_cost", 0) for i in data.items)
        ret = {
            "id": str(uuid.uuid4()),
            "return_number": await _next_number("RET", "supplier_returns"),
            **data.dict(),
            "total_quantity": total_qty,
            "total_value": total_val,
            "status": "pending",
            "request_date": datetime.now(timezone.utc).isoformat(),
            "refund_amount": 0,
            "created_by": admin.get("name", admin.get("email", "")),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.supplier_returns.insert_one(ret)
        await db.return_tracking.insert_one({
            "id": str(uuid.uuid4()),
            "return_request_id": ret["id"],
            "event_type": "created",
            "event_description": "تم إنشاء طلب الإرجاع",
            "event_date": datetime.now(timezone.utc).isoformat(),
        })
        ret.pop("_id", None)
        return ret

    @router.get("/returns")
    async def get_returns(status: Optional[str] = None, user: dict = Depends(get_current_user)):
        query = {"status": status} if status else {}
        return await db.supplier_returns.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)

    @router.put("/returns/{return_id}")
    async def update_return(return_id: str, data: dict, admin: dict = Depends(get_tenant_admin)):
        old = await db.supplier_returns.find_one({"id": return_id}, {"_id": 0})
        if not old:
            raise HTTPException(status_code=404, detail="طلب الإرجاع غير موجود")
        data.pop("id", None)
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        new_status = data.get("status")
        if new_status and new_status != old.get("status"):
            await db.return_tracking.insert_one({
                "id": str(uuid.uuid4()),
                "return_request_id": return_id,
                "event_type": f"status_changed_to_{new_status}",
                "event_description": data.get("notes", f"تغيير الحالة إلى {new_status}"),
                "event_date": datetime.now(timezone.utc).isoformat(),
            })
        await db.supplier_returns.update_one({"id": return_id}, {"$set": data})
        return await db.supplier_returns.find_one({"id": return_id}, {"_id": 0})

    @router.get("/returns/{return_id}/tracking")
    async def get_return_tracking(return_id: str, user: dict = Depends(get_current_user)):
        return await db.return_tracking.find({"return_request_id": return_id}, {"_id": 0}).sort("event_date", -1).to_list(50)

    # ── Disposals ──
    @router.post("/disposals")
    async def create_disposal(data: DisposalCreate, admin: dict = Depends(get_tenant_admin)):
        total_qty = sum(i.get("quantity", 0) for i in data.items)
        total_val = sum(i.get("quantity", 0) * i.get("unit_cost", 0) for i in data.items)
        disp = {
            "id": str(uuid.uuid4()),
            "disposal_number": await _next_number("DSP", "disposal_records"),
            **data.dict(),
            "total_quantity": total_qty,
            "total_value": total_val,
            "authorized_by": admin.get("name", admin.get("email", "")),
            "execution_date": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.disposal_records.insert_one(disp)
        disp.pop("_id", None)
        return disp

    @router.get("/disposals")
    async def get_disposals(user: dict = Depends(get_current_user)):
        return await db.disposal_records.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

    # ── Stats ──
    @router.get("/stats")
    async def get_defective_stats(user: dict = Depends(get_current_user)):
        total = await db.defective_goods.count_documents({})
        pending = await db.defective_goods.count_documents({"status": "pending_inspection"})
        confirmed = await db.defective_goods.count_documents({"status": "confirmed_defective"})
        returned = await db.supplier_returns.count_documents({})
        disposed = await db.disposal_records.count_documents({})
        cost_agg = await db.defective_goods.aggregate([
            {"$group": {"_id": None, "total": {"$sum": "$total_cost"}}}
        ]).to_list(1)
        return {
            "total_defective": total,
            "pending_inspection": pending,
            "confirmed_defective": confirmed,
            "total_returns": returned,
            "total_disposals": disposed,
            "total_cost": cost_agg[0]["total"] if cost_agg else 0,
        }

    return router
