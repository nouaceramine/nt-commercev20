"""
Supplier Tracking Routes
Collections: supplier_goods, supplier_goods_orders

p493 hardening:
- goods: ghost supplier/product rejected (404), price/rating validated (400),
  blind delete now 404 on ghost
- orders: ghost supplier rejected (404), items validated (qty>0, price>=0),
  order_number from the atomic counter (no count+1 race), PUT is whitelisted
  (status/notes/expected_delivery/items — total_amount and status_history are
  server-owned), receive claims the transition atomically inside a
  transaction so stock is incremented exactly once, received orders cannot be
  cancelled or deleted (stock/history integrity)
"""
import asyncio
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from pymongo.errors import PyMongoError


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

    def _validate_items(items):
        for it in items:
            if float(it.get("quantity", 0) or 0) <= 0:
                raise HTTPException(status_code=400, detail="الكمية يجب أن تكون أكبر من صفر")
            if float(it.get("unit_price", 0) or 0) < 0:
                raise HTTPException(status_code=400, detail="السعر غير صالح")

    # ── Supplier Goods ──
    @router.post("/goods")
    async def add_supplier_goods(data: SupplierGoodsCreate, admin: dict = Depends(get_tenant_admin)):
        if not await db.suppliers.find_one({"id": data.supplier_id}, {"_id": 0, "id": 1}):
            raise HTTPException(status_code=404, detail="المورد غير موجود")
        if not await db.products.find_one({"id": data.product_id}, {"_id": 0, "id": 1}):
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        if data.purchase_price < 0:
            raise HTTPException(status_code=400, detail="السعر غير صالح")
        if not 0 <= data.quality_rating <= 5:
            raise HTTPException(status_code=400, detail="التقييم يجب أن يكون بين 0 و 5")
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
        result = await db.supplier_goods.delete_one({"id": item_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="العنصر غير موجود")
        return {"message": "تم الحذف"}

    # ── Supplier Orders ──
    @router.post("/orders")
    async def create_order(data: SupplierOrderCreate, admin: dict = Depends(get_tenant_admin)):
        supplier = await db.suppliers.find_one({"id": data.supplier_id}, {"_id": 0, "name": 1})
        if not supplier:
            raise HTTPException(status_code=404, detail="المورد غير موجود")
        _validate_items(data.items)
        # p493: atomic counter — count+1 raced concurrent creates and collided
        # after deletions
        from services.code_generator import next_code
        order_number = await next_code(
            db, "supplier_goods_orders", "SPO-", 5, False, field="order_number")
        total = sum(float(i.get("quantity", 0)) * float(i.get("unit_price", 0)) for i in data.items)
        order = {
            "id": str(uuid.uuid4()),
            "order_number": order_number,
            **data.dict(),
            "status": "pending",
            "total_amount": total,
            "created_by": admin.get("name", admin.get("email", "")),
            "status_history": [{"status": "pending", "at": datetime.now(timezone.utc).isoformat(), "by": admin.get("name", "")}],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "supplier_name": supplier.get("name", ""),
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

    ORDER_FLOW = ["pending", "confirmed", "shipped", "received", "cancelled"]
    UPDATABLE_FIELDS = {"status", "expected_delivery", "notes", "items"}

    class _AlreadyReceived(Exception):
        pass

    @router.put("/orders/{order_id}")
    async def update_order(order_id: str, data: dict, admin: dict = Depends(get_tenant_admin)):
        now = datetime.now(timezone.utc).isoformat()
        current = await db.supplier_goods_orders.find_one({"id": order_id}, {"_id": 0})
        if not current:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")
        # server-owned fields (id, order_number, total_amount, status_history,
        # created_*) can never arrive from the client
        updates = {k: v for k, v in data.items() if k in UPDATABLE_FIELDS}
        new_status = updates.get("status")
        if new_status and new_status != current.get("status"):
            if new_status not in ORDER_FLOW:
                raise HTTPException(status_code=400, detail="حالة غير صالحة")
            if new_status == "cancelled" and current.get("status") == "received":
                raise HTTPException(status_code=400, detail="لا يمكن إلغاء طلبية مستلمة — أجرِ مرتجع شراء")
        if "items" in updates:
            if current.get("status") == "received":
                raise HTTPException(status_code=400, detail="لا يمكن تعديل بنود طلبية مستلمة")
            _validate_items(updates["items"])
            updates["total_amount"] = sum(
                float(i.get("quantity", 0)) * float(i.get("unit_price", 0))
                for i in updates["items"])
        updates["updated_at"] = now

        if new_status == "received" and current.get("status") != "received":
            # claim the transition atomically, then apply stock inside the same
            # transaction — concurrent receives increment exactly once
            from config.database import client as _client
            history_entry = {"status": "received", "at": now, "by": admin.get("name", "")}
            for attempt in range(5):
                try:
                    async with await _client.start_session() as _tx:
                        async with _tx.start_transaction():
                            claim = await db.supplier_goods_orders.find_one_and_update(
                                {"id": order_id, "status": {"$ne": "received"}},
                                {"$set": updates,
                                 "$push": {"status_history": history_entry}},
                                session=_tx)
                            if not claim:
                                raise _AlreadyReceived()
                            for it in current.get("items", []):
                                pid, qty = it.get("product_id"), float(it.get("quantity", 0) or 0)
                                if not pid or qty <= 0:
                                    continue
                                product = await db.products.find_one({"id": pid}, {"_id": 0}, session=_tx)
                                if not product:
                                    continue
                                field = "quantity" if "quantity" in product else "stock"
                                upd = {"$inc": {field: qty}}
                                if it.get("unit_price"):
                                    upd["$set"] = {"purchase_price": float(it["unit_price"])}
                                await db.products.update_one({"id": pid}, upd, session=_tx)
                    break
                except _AlreadyReceived:
                    # idempotent: another request already received this order
                    return await db.supplier_goods_orders.find_one({"id": order_id}, {"_id": 0})
                except PyMongoError:
                    if attempt == 4:
                        raise
                    await asyncio.sleep(0.2 * (attempt + 1))
        else:
            if new_status and new_status != current.get("status"):
                updates["status_history"] = (current.get("status_history") or []) + [
                    {"status": new_status, "at": now, "by": admin.get("name", "")}
                ]
            await db.supplier_goods_orders.update_one({"id": order_id}, {"$set": updates})
        return await db.supplier_goods_orders.find_one({"id": order_id}, {"_id": 0})

    @router.delete("/orders/{order_id}")
    async def delete_order(order_id: str, admin: dict = Depends(get_tenant_admin)):
        order = await db.supplier_goods_orders.find_one({"id": order_id}, {"_id": 0, "status": 1})
        if not order:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")
        if order.get("status") == "received":
            raise HTTPException(status_code=400, detail="لا يمكن حذف طلبية مستلمة — أثرها دخل المخزون")
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
