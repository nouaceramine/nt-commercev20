"""
Enhanced Inventory & Warehouse Routes - NT Commerce v16
Section 11: Inventory & Warehouse Management (المخزون والمستودعات)
"""

import traceback
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════════
# PYDANTIC SCHEMAS
# ═══════════════════════════════════════════════════════════

class WarehouseCreate(BaseModel):
    name: str
    code: str
    address: Optional[str] = None
    city: Optional[str] = None
    manager_name: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool = True
    is_default: bool = False

class WarehouseUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    manager_name: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None

class StockTransferCreate(BaseModel):
    from_warehouse_id: str
    to_warehouse_id: str
    items: List[Dict[str, Any]]
    notes: Optional[str] = None

class StockTransferStatusUpdate(BaseModel):
    status: str

class StockAdjustmentCreate(BaseModel):
    product_id: str
    warehouse_id: str
    quantity_change: int
    reason: str
    notes: Optional[str] = None

class StockAlertCreate(BaseModel):
    product_id: str
    warehouse_id: str
    alert_type: str
    threshold: int
    is_active: bool = True

class StockAlertUpdate(BaseModel):
    threshold: Optional[int] = None
    is_active: Optional[bool] = None

class InventoryCountCreate(BaseModel):
    warehouse_id: str
    product_ids: Optional[List[str]] = None
    notes: Optional[str] = None


# ═══════════════════════════════════════════════════════════
# FACTORY FUNCTION
# ═══════════════════════════════════════════════════════════

def create_enhanced_inventory_routes(db, get_current_user, require_permission=None, **kwargs):
    router = APIRouter(prefix="/inventory", tags=["Enhanced Inventory v2"])

    def now_iso():
        return datetime.utcnow().isoformat()

    def paginate(page: int, limit: int):
        return (page - 1) * limit, page * limit

    async def log_activity(action: str, details: str, user_id: str):
        try:
            await db.activities.insert_one({
                "id": str(uuid.uuid4()),
                "action": action,
                "details": details,
                "user_id": user_id,
                "created_at": now_iso(),
                "type": "inventory",
            })
        except Exception:
            pass

    # ═══════════════════════════════════════════════════════
    # 1. WAREHOUSE CRUD (5 endpoints)
    # ═══════════════════════════════════════════════════════

    @router.post("/warehouses", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_warehouse(warehouse: WarehouseCreate, current_user: dict = Depends(get_current_user)):
        """Create a new warehouse."""
        try:
            existing = await db.warehouses.find_one({"code": warehouse.code})
            if existing:
                raise HTTPException(status_code=409, detail="Warehouse code already exists")
            w_id = str(uuid.uuid4())
            doc = {
                "id": w_id,
                "name": warehouse.name,
                "code": warehouse.code,
                "address": warehouse.address,
                "city": warehouse.city,
                "manager_name": warehouse.manager_name,
                "phone": warehouse.phone,
                "is_active": warehouse.is_active,
                "is_default": warehouse.is_default,
                "created_at": now_iso(),
                "created_by": current_user.get("id", ""),
            }
            await db.warehouses.insert_one(doc)
            doc.pop("_id", None)
            return doc
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/warehouses", response_model=Dict[str, Any])
    async def list_warehouses(
        is_active: Optional[bool] = None,
        page: int = Query(1, ge=1),
        limit: int = Query(50, ge=1, le=100),
        current_user: dict = Depends(get_current_user),
    ):
        """List all warehouses."""
        try:
            query = {}
            if is_active is not None:
                query["is_active"] = is_active
            skip, _ = paginate(page, limit)
            total = await db.warehouses.count_documents(query)
            items = await db.warehouses.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"warehouses": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/warehouses/{warehouse_id}", response_model=Dict[str, Any])
    async def get_warehouse(warehouse_id: str, current_user: dict = Depends(get_current_user)):
        """Get a warehouse with stock summary."""
        try:
            warehouse = await db.warehouses.find_one({"id": warehouse_id}, {"_id": 0})
            if not warehouse:
                raise HTTPException(status_code=404, detail="Warehouse not found")
            product_count = await db.inventory.count_documents({"warehouse_id": warehouse_id})
            low_stock = await db.inventory.count_documents({"warehouse_id": warehouse_id, "$expr": {"$lte": ["$quantity", "$min_stock"]}})
            warehouse["product_count"] = product_count
            warehouse["low_stock_count"] = low_stock
            return warehouse
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/warehouses/{warehouse_id}", response_model=Dict[str, Any])
    async def update_warehouse(warehouse_id: str, update: WarehouseUpdate, current_user: dict = Depends(get_current_user)):
        """Update a warehouse."""
        try:
            changes = {k: v for k, v in update.model_dump().items() if v is not None}
            if not changes:
                raise HTTPException(status_code=400, detail="No fields to update")
            changes["updated_at"] = now_iso()
            result = await db.warehouses.update_one({"id": warehouse_id}, {"$set": changes})
            if result.matched_count == 0:
                raise HTTPException(status_code=404, detail="Warehouse not found")
            doc = await db.warehouses.find_one({"id": warehouse_id}, {"_id": 0})
            return doc
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/warehouses/{warehouse_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_warehouse(warehouse_id: str, current_user: dict = Depends(get_current_user)):
        """Soft-delete a warehouse."""
        try:
            await db.warehouses.update_one(
                {"id": warehouse_id},
                {"$set": {"is_active": False, "deleted_at": now_iso()}},
            )
            return None
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 2. INVENTORY STOCK (6 endpoints)
    # ═══════════════════════════════════════════════════════

    @router.get("/stock", response_model=Dict[str, Any])
    async def get_stock(
        warehouse_id: Optional[str] = None,
        product_id: Optional[str] = None,
        low_stock: bool = Query(False),
        page: int = Query(1, ge=1),
        limit: int = Query(50, ge=1, le=100),
        current_user: dict = Depends(get_current_user),
    ):
        """Get inventory stock levels with optional filters."""
        try:
            query = {}
            if warehouse_id:
                query["warehouse_id"] = warehouse_id
            if product_id:
                query["product_id"] = product_id
            if low_stock:
                query["$expr"] = {"$lte": ["$quantity", "$min_stock"]}
            skip, _ = paginate(page, limit)
            total = await db.inventory.count_documents(query)
            items = await db.inventory.find(query, {"_id": 0}).sort("updated_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"stock": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/stock/product/{product_id}", response_model=Dict[str, Any])
    async def get_product_stock(product_id: str, current_user: dict = Depends(get_current_user)):
        """Get stock levels for a product across all warehouses."""
        try:
            items = await db.inventory.find({"product_id": product_id}, {"_id": 0}).to_list(None)
            total_quantity = sum(i.get("quantity", 0) for i in items)
            return {"product_id": product_id, "total_quantity": total_quantity, "warehouse_stock": items}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/stock/adjust", response_model=Dict[str, Any])
    async def adjust_stock(adjustment: StockAdjustmentCreate, current_user: dict = Depends(get_current_user)):
        """Adjust stock quantity for a product in a warehouse."""
        try:
            user_id = current_user.get("id", "")
            result = await db.inventory.update_one(
                {"product_id": adjustment.product_id, "warehouse_id": adjustment.warehouse_id},
                {"$inc": {"quantity": adjustment.quantity_change}, "$set": {"updated_at": now_iso(), "last_adjusted_by": user_id}},
            )
            if result.matched_count == 0:
                await db.inventory.insert_one({
                    "id": str(uuid.uuid4()),
                    "product_id": adjustment.product_id,
                    "warehouse_id": adjustment.warehouse_id,
                    "quantity": adjustment.quantity_change,
                    "min_stock": 0,
                    "max_stock": None,
                    "updated_at": now_iso(),
                    "last_adjusted_by": user_id,
                })
            adj_id = str(uuid.uuid4())
            await db.stock_adjustments.insert_one({
                "id": adj_id,
                "product_id": adjustment.product_id,
                "warehouse_id": adjustment.warehouse_id,
                "quantity_change": adjustment.quantity_change,
                "reason": adjustment.reason,
                "notes": adjustment.notes,
                "adjusted_by": user_id,
                "created_at": now_iso(),
            })
            await log_activity("stock_adjust", f"Adjusted {adjustment.product_id} by {adjustment.quantity_change} in {adjustment.warehouse_id}", user_id)
            return {"adjustment_id": adj_id, "product_id": adjustment.product_id, "quantity_change": adjustment.quantity_change}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/stock/{inventory_id}/min-stock", response_model=Dict[str, Any])
    async def set_min_stock(inventory_id: str, min_stock: int = Body(..., ge=0), current_user: dict = Depends(get_current_user)):
        """Set minimum stock level for an inventory item."""
        try:
            await db.inventory.update_one(
                {"id": inventory_id},
                {"$set": {"min_stock": min_stock, "updated_at": now_iso()}},
            )
            return {"inventory_id": inventory_id, "min_stock": min_stock}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/stock/{inventory_id}/max-stock", response_model=Dict[str, Any])
    async def set_max_stock(inventory_id: str, max_stock: int = Body(..., ge=0), current_user: dict = Depends(get_current_user)):
        """Set maximum stock level for an inventory item."""
        try:
            await db.inventory.update_one(
                {"id": inventory_id},
                {"$set": {"max_stock": max_stock, "updated_at": now_iso()}},
            )
            return {"inventory_id": inventory_id, "max_stock": max_stock}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/stock/alerts", response_model=Dict[str, Any])
    async def get_stock_alerts(current_user: dict = Depends(get_current_user)):
        """Get current stock alerts (low stock items)."""
        try:
            pipeline = [
                {"$match": {"$expr": {"$lte": ["$quantity", "$min_stock"]}}},
                {"$lookup": {"from": "products", "localField": "product_id", "foreignField": "id", "as": "product"}},
                {"$lookup": {"from": "warehouses", "localField": "warehouse_id", "foreignField": "id", "as": "warehouse"}},
            ]
            alerts = await db.inventory.aggregate(pipeline).to_list(None)
            for a in alerts:
                a.pop("_id", None)
            return {"alerts": alerts, "total_alerts": len(alerts)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 3. STOCK TRANSFERS (5 endpoints)
    # ═══════════════════════════════════════════════════════

    @router.post("/transfers", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_transfer(transfer: StockTransferCreate, current_user: dict = Depends(get_current_user)):
        """Create a stock transfer between warehouses."""
        try:
            user_id = current_user.get("id", "")
            t_id = str(uuid.uuid4())
            doc = {
                "id": t_id,
                "from_warehouse_id": transfer.from_warehouse_id,
                "to_warehouse_id": transfer.to_warehouse_id,
                "items": transfer.items,
                "notes": transfer.notes,
                "status": "pending",
                "created_by": user_id,
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }
            await db.stock_transfers.insert_one(doc)
            doc.pop("_id", None)
            await log_activity("transfer_create", f"Transfer {t_id} created", user_id)
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/transfers", response_model=Dict[str, Any])
    async def list_transfers(
        status: Optional[str] = None,
        from_warehouse: Optional[str] = None,
        page: int = Query(1, ge=1),
        limit: int = Query(50, ge=1, le=100),
        current_user: dict = Depends(get_current_user),
    ):
        """List stock transfers."""
        try:
            query = {}
            if status:
                query["status"] = status
            if from_warehouse:
                query["from_warehouse_id"] = from_warehouse
            skip, _ = paginate(page, limit)
            total = await db.stock_transfers.count_documents(query)
            items = await db.stock_transfers.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"transfers": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/transfers/{transfer_id}", response_model=Dict[str, Any])
    async def get_transfer(transfer_id: str, current_user: dict = Depends(get_current_user)):
        """Get a transfer with details."""
        try:
            transfer = await db.stock_transfers.find_one({"id": transfer_id}, {"_id": 0})
            if not transfer:
                raise HTTPException(status_code=404, detail="Transfer not found")
            return transfer
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/transfers/{transfer_id}/status", response_model=Dict[str, Any])
    async def update_transfer_status(transfer_id: str, update: StockTransferStatusUpdate, current_user: dict = Depends(get_current_user)):
        """Update transfer status and adjust stock accordingly."""
        try:
            transfer = await db.stock_transfers.find_one({"id": transfer_id})
            if not transfer:
                raise HTTPException(status_code=404, detail="Transfer not found")
            old_status = transfer.get("status", "pending")
            new_status = update.status
            if new_status == "completed" and old_status != "completed":
                for item in transfer.get("items", []):
                    await db.inventory.update_one(
                        {"product_id": item["product_id"], "warehouse_id": transfer["from_warehouse_id"]},
                        {"$inc": {"quantity": -item["quantity"]}, "$set": {"updated_at": now_iso()}},
                    )
                    result = await db.inventory.update_one(
                        {"product_id": item["product_id"], "warehouse_id": transfer["to_warehouse_id"]},
                        {"$inc": {"quantity": item["quantity"]}, "$set": {"updated_at": now_iso()}},
                    )
                    if result.matched_count == 0:
                        await db.inventory.insert_one({
                            "id": str(uuid.uuid4()),
                            "product_id": item["product_id"],
                            "warehouse_id": transfer["to_warehouse_id"],
                            "quantity": item["quantity"],
                            "min_stock": 0,
                            "updated_at": now_iso(),
                        })
            await db.stock_transfers.update_one(
                {"id": transfer_id},
                {"$set": {"status": new_status, "updated_at": now_iso(), "status_changed_by": current_user.get("id", "")}},
            )
            return {"transfer_id": transfer_id, "status": new_status}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/transfers/{transfer_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def cancel_transfer(transfer_id: str, current_user: dict = Depends(get_current_user)):
        """Cancel a pending transfer."""
        try:
            await db.stock_transfers.update_one(
                {"id": transfer_id, "status": "pending"},
                {"$set": {"status": "cancelled", "updated_at": now_iso()}},
            )
            return None
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 4. STOCK HISTORY & MOVEMENTS (4 endpoints)
    # ═══════════════════════════════════════════════════════

    @router.get("/history", response_model=Dict[str, Any])
    async def get_stock_history(
        product_id: Optional[str] = None,
        warehouse_id: Optional[str] = None,
        movement_type: Optional[str] = None,
        page: int = Query(1, ge=1),
        limit: int = Query(50, ge=1, le=100),
        current_user: dict = Depends(get_current_user),
    ):
        """Get stock movement history."""
        try:
            query = {}
            if product_id:
                query["product_id"] = product_id
            if warehouse_id:
                query["warehouse_id"] = warehouse_id
            if movement_type:
                query["movement_type"] = movement_type
            skip, _ = paginate(page, limit)
            total = await db.stock_history.count_documents(query)
            items = await db.stock_history.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"history": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/history/product/{product_id}", response_model=Dict[str, Any])
    async def get_product_stock_history(
        product_id: str,
        days: int = Query(30, ge=1, le=365),
        current_user: dict = Depends(get_current_user),
    ):
        """Get stock history for a specific product."""
        try:
            since = (datetime.utcnow() - timedelta(days=days)).isoformat()
            items = await db.stock_history.find(
                {"product_id": product_id, "created_at": {"$gte": since}},
                {"_id": 0},
            ).sort("created_at", -1).to_list(None)
            return {"product_id": product_id, "history": items, "total": len(items)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/movements/overview", response_model=Dict[str, Any])
    async def get_movements_overview(current_user: dict = Depends(get_current_user)):
        """Get stock movements overview (in/out totals)."""
        try:
            today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
            in_pipeline = [{"$match": {"movement_type": "in", "created_at": {"$gte": today}}}, {"$group": {"_id": None, "total": {"$sum": "$quantity"}}}]
            out_pipeline = [{"$match": {"movement_type": "out", "created_at": {"$gte": today}}}, {"$group": {"_id": None, "total": {"$sum": "$quantity"}}}]
            today_in = await db.stock_history.aggregate(in_pipeline).to_list(None)
            today_out = await db.stock_history.aggregate(out_pipeline).to_list(None)
            type_pipeline = [{"$group": {"_id": "$movement_type", "count": {"$sum": 1}}}]
            by_type = await db.stock_history.aggregate(type_pipeline).to_list(None)
            return {
                "today_in": today_in[0]["total"] if today_in else 0,
                "today_out": today_out[0]["total"] if today_out else 0,
                "by_type": [{"type": b["_id"] or "unknown", "count": b["count"]} for b in by_type],
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/stock/valuation", response_model=Dict[str, Any])
    async def get_inventory_valuation(warehouse_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
        """Get total inventory valuation."""
        try:
            pipeline = []
            match_stage = {}
            if warehouse_id:
                match_stage["warehouse_id"] = warehouse_id
            if match_stage:
                pipeline.append({"$match": match_stage})
            pipeline.extend([
                {"$lookup": {"from": "products", "localField": "product_id", "foreignField": "id", "as": "product"}},
                {"$unwind": {"path": "$product", "preserveNullAndEmptyArrays": True}},
                {"$group": {"_id": None, "total_value": {"$sum": {"$multiply": ["$quantity", {"$ifNull": ["$product.purchase_price", 0]}]}}, "total_items": {"$sum": "$quantity"}}},
            ])
            result = await db.inventory.aggregate(pipeline).to_list(None)
            if result:
                return {"total_value": round(result[0]["total_value"], 2), "total_items": result[0]["total_items"]}
            return {"total_value": 0, "total_items": 0}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 5. ALERTS CONFIGURATION (4 endpoints)
    # ═══════════════════════════════════════════════════════

    @router.post("/alerts", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_alert(alert: StockAlertCreate, current_user: dict = Depends(get_current_user)):
        """Create a stock alert configuration."""
        try:
            a_id = str(uuid.uuid4())
            doc = {
                "id": a_id,
                "product_id": alert.product_id,
                "warehouse_id": alert.warehouse_id,
                "alert_type": alert.alert_type,
                "threshold": alert.threshold,
                "is_active": alert.is_active,
                "created_at": now_iso(),
                "created_by": current_user.get("id", ""),
            }
            await db.stock_alerts.insert_one(doc)
            doc.pop("_id", None)
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/alerts", response_model=Dict[str, Any])
    async def list_alerts(
        is_active: Optional[bool] = None,
        alert_type: Optional[str] = None,
        page: int = Query(1, ge=1),
        limit: int = Query(50, ge=1, le=100),
        current_user: dict = Depends(get_current_user),
    ):
        """List configured stock alerts."""
        try:
            query = {}
            if is_active is not None:
                query["is_active"] = is_active
            if alert_type:
                query["alert_type"] = alert_type
            skip, _ = paginate(page, limit)
            total = await db.stock_alerts.count_documents(query)
            items = await db.stock_alerts.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"alerts": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/alerts/{alert_id}", response_model=Dict[str, Any])
    async def update_alert(alert_id: str, update: StockAlertUpdate, current_user: dict = Depends(get_current_user)):
        """Update a stock alert."""
        try:
            changes = {k: v for k, v in update.model_dump().items() if v is not None}
            if changes:
                await db.stock_alerts.update_one({"id": alert_id}, {"$set": changes})
            doc = await db.stock_alerts.find_one({"id": alert_id}, {"_id": 0})
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/alerts/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_alert(alert_id: str, current_user: dict = Depends(get_current_user)):
        """Delete a stock alert."""
        try:
            await db.stock_alerts.delete_one({"id": alert_id})
            return None
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 6. INVENTORY COUNT / AUDIT (3 endpoints)
    # ═══════════════════════════════════════════════════════

    @router.post("/counts", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_inventory_count(count: InventoryCountCreate, current_user: dict = Depends(get_current_user)):
        """Create a physical inventory count task."""
        try:
            c_id = str(uuid.uuid4())
            query = {"warehouse_id": count.warehouse_id}
            if count.product_ids:
                query["product_id"] = {"$in": count.product_ids}
            stock_items = await db.inventory.find(query, {"_id": 0, "product_id": 1, "quantity": 1}).to_list(None)
            items = [{"product_id": s["product_id"], "expected": s["quantity"], "actual": None} for s in stock_items]
            doc = {
                "id": c_id,
                "warehouse_id": count.warehouse_id,
                "items": items,
                "notes": count.notes,
                "status": "in_progress",
                "created_by": current_user.get("id", ""),
                "created_at": now_iso(),
            }
            await db.inventory_counts.insert_one(doc)
            doc.pop("_id", None)
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/counts/{count_id}/item", response_model=Dict[str, Any])
    async def update_count_item(count_id: str, product_id: str = Body(...), actual: int = Body(...), current_user: dict = Depends(get_current_user)):
        """Update actual count for a product during inventory count."""
        try:
            await db.inventory_counts.update_one(
                {"id": count_id, "items.product_id": product_id},
                {"$set": {"items.$.actual": actual, "items.$.counted_at": now_iso(), "items.$.counted_by": current_user.get("id", "")}},
            )
            return {"count_id": count_id, "product_id": product_id, "actual": actual}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/counts/{count_id}/complete", response_model=Dict[str, Any])
    async def complete_inventory_count(count_id: str, current_user: dict = Depends(get_current_user)):
        """Complete inventory count and generate variance report."""
        try:
            count = await db.inventory_counts.find_one({"id": count_id})
            if not count:
                raise HTTPException(status_code=404, detail="Count not found")
            variances = []
            for item in count.get("items", []):
                expected = item.get("expected", 0)
                actual = item.get("actual", 0)
                if actual is not None and expected != actual:
                    variances.append({
                        "product_id": item["product_id"],
                        "expected": expected,
                        "actual": actual,
                        "variance": actual - expected,
                    })
            await db.inventory_counts.update_one(
                {"id": count_id},
                {"$set": {"status": "completed", "completed_at": now_iso(), "variances": variances}},
            )
            return {"count_id": count_id, "status": "completed", "variances_found": len(variances), "variances": variances}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 7. ANALYTICS (4 endpoints)
    # ═══════════════════════════════════════════════════════

    @router.get("/analytics/overview", response_model=Dict[str, Any])
    async def get_inventory_analytics(current_user: dict = Depends(get_current_user)):
        """Inventory analytics dashboard."""
        try:
            total_products = await db.inventory.count_documents({})
            total_warehouses = await db.warehouses.count_documents({"is_active": True})
            low_stock = await db.inventory.count_documents({"$expr": {"$lte": ["$quantity", "$min_stock"]}})
            out_of_stock = await db.inventory.count_documents({"quantity": 0})
            top_pipeline = [{"$sort": {"quantity": -1}}, {"$limit": 10}, {"$project": {"_id": 0, "product_id": 1, "quantity": 1, "warehouse_id": 1}}]
            top_products = await db.inventory.aggregate(top_pipeline).to_list(None)
            return {
                "total_products": total_products,
                "total_warehouses": total_warehouses,
                "low_stock_count": low_stock,
                "out_of_stock_count": out_of_stock,
                "top_products": top_products,
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/warehouse/{warehouse_id}", response_model=Dict[str, Any])
    async def get_warehouse_analytics(warehouse_id: str, current_user: dict = Depends(get_current_user)):
        """Analytics for a specific warehouse."""
        try:
            total = await db.inventory.count_documents({"warehouse_id": warehouse_id})
            low = await db.inventory.count_documents({"warehouse_id": warehouse_id, "$expr": {"$lte": ["$quantity", "$min_stock"]}})
            zero = await db.inventory.count_documents({"warehouse_id": warehouse_id, "quantity": 0})
            pipeline = [
                {"$match": {"warehouse_id": warehouse_id}},
                {"$lookup": {"from": "products", "localField": "product_id", "foreignField": "id", "as": "p"}},
                {"$unwind": "$p"},
                {"$group": {"_id": "$p.family_name", "count": {"$sum": 1}}},
            ]
            by_family = await db.inventory.aggregate(pipeline).to_list(None)
            return {
                "warehouse_id": warehouse_id,
                "total_products": total,
                "low_stock": low,
                "out_of_stock": zero,
                "by_family": [{"family": b["_id"], "count": b["count"]} for b in by_family],
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/top-moving", response_model=Dict[str, Any])
    async def get_top_moving_products(days: int = Query(30, ge=1, le=365), current_user: dict = Depends(get_current_user)):
        """Get top moving products (most stock movements)."""
        try:
            since = (datetime.utcnow() - timedelta(days=days)).isoformat()
            pipeline = [
                {"$match": {"created_at": {"$gte": since}}},
                {"$group": {"_id": "$product_id", "movements": {"$sum": 1}, "total_quantity": {"$sum": "$quantity"}}},
                {"$sort": {"movements": -1}},
                {"$limit": 20},
            ]
            items = await db.stock_history.aggregate(pipeline).to_list(None)
            return {"period_days": days, "top_moving": [{"product_id": i["_id"], "movements": i["movements"], "total_quantity": i["total_quantity"]} for i in items]}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/stock-trend", response_model=Dict[str, Any])
    async def get_stock_level_trend(
        product_id: str,
        warehouse_id: str,
        days: int = Query(30, ge=1, le=365),
        current_user: dict = Depends(get_current_user),
    ):
        """Get stock level trend for a product in a warehouse."""
        try:
            since = (datetime.utcnow() - timedelta(days=days)).isoformat()
            items = await db.stock_history.find(
                {"product_id": product_id, "warehouse_id": warehouse_id, "created_at": {"$gte": since}},
                {"_id": 0, "quantity": 1, "balance_after": 1, "created_at": 1, "movement_type": 1},
            ).sort("created_at", 1).to_list(None)
            return {"product_id": product_id, "warehouse_id": warehouse_id, "trend": items}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 8. BULK OPERATIONS (2 endpoints)
    # ═══════════════════════════════════════════════════════

    @router.post("/stock/adjust/bulk", response_model=Dict[str, Any])
    async def bulk_adjust_stock(items: List[StockAdjustmentCreate] = Body(...), current_user: dict = Depends(get_current_user)):
        """Bulk adjust stock quantities."""
        try:
            user_id = current_user.get("id", "")
            updated = 0
            for item in items[:100]:
                result = await db.inventory.update_one(
                    {"product_id": item.product_id, "warehouse_id": item.warehouse_id},
                    {"$inc": {"quantity": item.quantity_change}, "$set": {"updated_at": now_iso(), "last_adjusted_by": user_id}},
                )
                if result.matched_count == 0 and item.quantity_change > 0:
                    await db.inventory.insert_one({
                        "id": str(uuid.uuid4()),
                        "product_id": item.product_id,
                        "warehouse_id": item.warehouse_id,
                        "quantity": item.quantity_change,
                        "min_stock": 0,
                        "updated_at": now_iso(),
                        "last_adjusted_by": user_id,
                    })
                adj_id = str(uuid.uuid4())
                await db.stock_adjustments.insert_one({
                    "id": adj_id,
                    "product_id": item.product_id,
                    "warehouse_id": item.warehouse_id,
                    "quantity_change": item.quantity_change,
                    "reason": item.reason,
                    "notes": item.notes,
                    "adjusted_by": user_id,
                    "created_at": now_iso(),
                })
                updated += 1
            return {"updated": updated}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/stock/set", response_model=Dict[str, Any])
    async def set_stock_quantity(product_id: str = Body(...), warehouse_id: str = Body(...), quantity: int = Body(..., ge=0), current_user: dict = Depends(get_current_user)):
        """Set absolute stock quantity (not increment)."""
        try:
            user_id = current_user.get("id", "")
            result = await db.inventory.update_one(
                {"product_id": product_id, "warehouse_id": warehouse_id},
                {"$set": {"quantity": quantity, "updated_at": now_iso(), "last_adjusted_by": user_id}},
            )
            if result.matched_count == 0:
                await db.inventory.insert_one({
                    "id": str(uuid.uuid4()),
                    "product_id": product_id,
                    "warehouse_id": warehouse_id,
                    "quantity": quantity,
                    "min_stock": 0,
                    "updated_at": now_iso(),
                    "last_adjusted_by": user_id,
                })
            return {"product_id": product_id, "warehouse_id": warehouse_id, "quantity": quantity}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 9. ADMIN ENDPOINTS (3 endpoints)
    # ═══════════════════════════════════════════════════════

    @router.get("/admin/all-stock", response_model=Dict[str, Any])
    async def get_all_stock(
        warehouse_id: Optional[str] = None,
        page: int = Query(1, ge=1),
        limit: int = Query(100, ge=1, le=500),
        current_user: dict = Depends(get_current_user),
    ):
        """Admin: get all stock records."""
        try:
            query = {}
            if warehouse_id:
                query["warehouse_id"] = warehouse_id
            skip, _ = paginate(page, limit)
            total = await db.inventory.count_documents(query)
            items = await db.inventory.find(query, {"_id": 0}).sort("updated_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"stock": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/admin/adjustments", response_model=Dict[str, Any])
    async def get_adjustments(
        product_id: Optional[str] = None,
        warehouse_id: Optional[str] = None,
        page: int = Query(1, ge=1),
        limit: int = Query(50, ge=1, le=100),
        current_user: dict = Depends(get_current_user),
    ):
        """Admin: view all stock adjustments."""
        try:
            query = {}
            if product_id:
                query["product_id"] = product_id
            if warehouse_id:
                query["warehouse_id"] = warehouse_id
            skip, _ = paginate(page, limit)
            total = await db.stock_adjustments.count_documents(query)
            items = await db.stock_adjustments.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"adjustments": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/admin/counts", response_model=Dict[str, Any])
    async def get_all_inventory_counts(
        status: Optional[str] = None,
        page: int = Query(1, ge=1),
        limit: int = Query(50, ge=1, le=100),
        current_user: dict = Depends(get_current_user),
    ):
        """Admin: view all inventory counts."""
        try:
            query = {}
            if status:
                query["status"] = status
            skip, _ = paginate(page, limit)
            total = await db.inventory_counts.count_documents(query)
            items = await db.inventory_counts.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"counts": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 10. PRODUCT AVAILABILITY (1 endpoint)
    # ═══════════════════════════════════════════════════════

    @router.post("/check-availability", response_model=Dict[str, Any])
    async def check_availability(items: List[Dict[str, Any]] = Body(...), warehouse_id: Optional[str] = Body(None), current_user: dict = Depends(get_current_user)):
        """Check if products are available in requested quantities."""
        try:
            results = []
            for item in items:
                pid = item.get("product_id")
                qty = item.get("quantity", 0)
                query = {"product_id": pid}
                if warehouse_id:
                    query["warehouse_id"] = warehouse_id
                stock_items = await db.inventory.find(query, {"_id": 0, "quantity": 1, "warehouse_id": 1}).to_list(None)
                available = sum(s.get("quantity", 0) for s in stock_items)
                results.append({
                    "product_id": pid,
                    "requested": qty,
                    "available": available,
                    "sufficient": available >= qty,
                    "shortage": max(0, qty - available),
                })
            return {"checks": results, "all_available": all(r["sufficient"] for r in results)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    return router
