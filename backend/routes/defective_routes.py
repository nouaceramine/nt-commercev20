"""
Defective Goods Management System
Collections: defective_goods, defective_inspections, supplier_returns,
return_tracking, disposal_records, defect_categories, return_reasons, disposal_methods
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid


def create_defective_routes(db, get_current_user, get_tenant_admin) -> dict:
    router = APIRouter(prefix="/defective", tags=["defective-goods"])

    # ── Models ──
    class DefectiveCreate(BaseModel):
        product_id: str = ""
        product_name: str
        supplier_id: Optional[str] = None
        supplier_name: Optional[str] = None
        defect_type: str = "manufacturing"
        defect_severity: str = "medium"
        description: str = ""
        quantity: int = 1
        unit_cost: float = 0

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
            await db.defect_categories.insert_many(defaults)
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
        count = await db.defective_goods.count_documents({}) + 1
        item = {
            "id": str(uuid.uuid4()),
            "defective_number": f"DEF-{count:05d}",
            **data.dict(),
            "total_cost": data.quantity * data.unit_cost,
            "status": "pending_inspection",
            "inspected_by": None,
            "inspected_at": None,
            "action_taken": None,
            "created_by": admin.get("name", admin.get("email", "")),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.defective_goods.insert_one(item)
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
        await db.defective_goods.update_one({"id": item_id}, {"$set": data})
        return await db.defective_goods.find_one({"id": item_id}, {"_id": 0})

    @router.delete("/goods/{item_id}")
    async def delete_defective(item_id: str, admin: dict = Depends(get_tenant_admin)):
        await db.defective_goods.delete_one({"id": item_id})
        await db.defective_inspections.delete_many({"defective_goods_id": item_id})
        return {"message": "تم الحذف"}

    # ── Inspections ──
    @router.post("/inspections")
    async def create_inspection(data: InspectionCreate, admin: dict = Depends(get_tenant_admin)):
        inspection = {
            "id": str(uuid.uuid4()),
            **data.dict(),
            "inspector_id": admin.get("id", ""),
            "inspector_name": admin.get("name", admin.get("email", "")),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.defective_inspections.insert_one(inspection)
        new_status = "confirmed_defective" if data.confirmed_defective else "not_defective"
        await db.defective_goods.update_one(
            {"id": data.defective_goods_id},
            {"$set": {
                "status": new_status,
                "inspected_by": inspection["inspector_name"],
                "inspected_at": inspection["created_at"],
            }}
        )
        inspection.pop("_id", None)
        return inspection

    # ── Supplier Returns ──
    @router.post("/returns")
    async def create_return(data: SupplierReturnCreate, admin: dict = Depends(get_tenant_admin)):
        count = await db.supplier_returns.count_documents({}) + 1
        total_qty = sum(i.get("quantity", 0) for i in data.items)
        total_val = sum(i.get("quantity", 0) * i.get("unit_cost", 0) for i in data.items)
        ret = {
            "id": str(uuid.uuid4()),
            "return_number": f"RET-{count:05d}",
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
        count = await db.disposal_records.count_documents({}) + 1
        total_qty = sum(i.get("quantity", 0) for i in data.items)
        total_val = sum(i.get("quantity", 0) * i.get("unit_cost", 0) for i in data.items)
        disp = {
            "id": str(uuid.uuid4()),
            "disposal_number": f"DSP-{count:05d}",
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
