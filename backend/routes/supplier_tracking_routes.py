"""
Supplier Tracking Routes
Collections: supplier_goods, supplier_goods_orders
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid


def create_supplier_tracking_routes(db, get_current_user, get_tenant_admin) -> dict:
    router = APIRouter(prefix="/supplier-tracking", tags=["supplier-tracking"])

    class SupplierGoodsCreate(BaseModel):
        supplier_id: str
        product_id: str
        purchase_price: float = 0
        quality_rating: float = 5.0
        is_preferred: bool = False

    class SupplierOrderCreate(BaseModel):
        supplier_id: str
        items: List[dict] = []
        expected_delivery: Optional[str] = None
        notes: str = ""

    # ── Supplier Goods ──
    @router.post("/goods")
    async def add_supplier_goods(data: SupplierGoodsCreate, admin: dict = Depends(get_tenant_admin)):
        existing = await db.supplier_goods.find_one(
            {"supplier_id": data.supplier_id, "product_id": data.product_id}, {"_id": 0}
        )
        if existing:
            await db.supplier_goods.update_one(
                {"id": existing["id"]},
                {"$set": {**data.dict(), "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
            return await db.supplier_goods.find_one({"id": existing["id"]}, {"_id": 0})
        entry = {
            "id": str(uuid.uuid4()),
            **data.dict(),
            "last_purchase_date": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.supplier_goods.insert_one(entry)
        entry.pop("_id", None)
        return entry

    @router.get("/goods")
    async def get_supplier_goods(
        supplier_id: Optional[str] = None,
        product_id: Optional[str] = None,
        user: dict = Depends(get_current_user)
    ):
        query = {}
        if supplier_id:
            query["supplier_id"] = supplier_id
        if product_id:
            query["product_id"] = product_id
        return await db.supplier_goods.find(query, {"_id": 0}).to_list(500)

    @router.get("/goods/best-price/{product_id}")
    async def get_best_price(product_id: str, user: dict = Depends(get_current_user)):
        suppliers = await db.supplier_goods.find(
            {"product_id": product_id}, {"_id": 0}
        ).sort("purchase_price", 1).to_list(20)
        return {"product_id": product_id, "suppliers": suppliers}

    @router.delete("/goods/{item_id}")
    async def delete_supplier_goods(item_id: str, admin: dict = Depends(get_tenant_admin)):
        await db.supplier_goods.delete_one({"id": item_id})
        return {"message": "تم الحذف"}

    # ── Supplier Orders ──
    @router.post("/orders")
    async def create_order(data: SupplierOrderCreate, admin: dict = Depends(get_tenant_admin)):
        count = await db.supplier_goods_orders.count_documents({}) + 1
        total = sum(i.get("quantity", 0) * i.get("unit_price", 0) for i in data.items)
        order = {
            "id": str(uuid.uuid4()),
            "order_number": f"SPO-{count:05d}",
            **data.dict(),
            "status": "pending",
            "total_amount": total,
            "created_by": admin.get("name", admin.get("email", "")),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.supplier_goods_orders.insert_one(order)
        order.pop("_id", None)
        return order

    @router.get("/orders")
    async def get_orders(
        status: Optional[str] = None,
        supplier_id: Optional[str] = None,
        user: dict = Depends(get_current_user)
    ):
        query = {}
        if status:
            query["status"] = status
        if supplier_id:
            query["supplier_id"] = supplier_id
        return await db.supplier_goods_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)

    @router.put("/orders/{order_id}")
    async def update_order(order_id: str, data: dict, admin: dict = Depends(get_tenant_admin)):
        data.pop("id", None)
        data.pop("order_number", None)
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.supplier_goods_orders.update_one({"id": order_id}, {"$set": data})
        return await db.supplier_goods_orders.find_one({"id": order_id}, {"_id": 0})

    @router.delete("/orders/{order_id}")
    async def delete_order(order_id: str, admin: dict = Depends(get_tenant_admin)):
        await db.supplier_goods_orders.delete_one({"id": order_id})
        return {"message": "تم حذف الطلب"}

    # ── Stats ──
    @router.get("/stats")
    async def get_supplier_stats(user: dict = Depends(get_current_user)):
        total_goods = await db.supplier_goods.count_documents({})
        total_orders = await db.supplier_goods_orders.count_documents({})
        pending_orders = await db.supplier_goods_orders.count_documents({"status": "pending"})
        preferred = await db.supplier_goods.count_documents({"is_preferred": True})
        return {
            "total_goods": total_goods,
            "total_orders": total_orders,
            "pending_orders": pending_orders,
            "preferred_suppliers": preferred,
        }

    return router
