"""
Warehouse, Stock Transfer, Inventory Session Routes - Extracted from server.py
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from datetime import datetime, timezone
import uuid


def create_warehouse_routes(db, get_current_user, get_tenant_admin, require_tenant) -> dict:
    from utils.permissions import create_permission_checker
    require_permission = create_permission_checker(db, get_current_user)
    router = APIRouter(tags=["warehouses"])

    # ── Warehouses CRUD ──
    @router.post("/warehouses", status_code=201)
    async def create_warehouse(warehouse: dict, admin: dict = Depends(require_permission("warehouses.edit"))):
        from models.schemas import WarehouseCreate
        w = WarehouseCreate(**warehouse)
        wid = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        if w.is_main:
            await db.warehouses.update_many({"is_main": True}, {"$set": {"is_main": False}})
        from services.code_generator import generate_code
        code = await generate_code(db, "warehouses", "DP", 5, with_year=False)
        doc = {"id": wid, "code": code, "name": w.name, "address": w.address or "", "phone": w.phone or "", "manager": w.manager or "", "notes": w.notes or "", "is_main": w.is_main, "created_at": now}
        await db.warehouses.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.get("/warehouses")
    async def get_warehouses(user: dict = Depends(require_permission("warehouses.view"))):
        return await db.warehouses.find({}, {"_id": 0}).to_list(100)

    @router.put("/warehouses/{warehouse_id}")
    async def update_warehouse(warehouse_id: str, updates: dict, admin: dict = Depends(require_permission("warehouses.edit"))):
        wh = await db.warehouses.find_one({"id": warehouse_id})
        if not wh:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        update_data = {k: v for k, v in updates.items() if v is not None and k != "id"}
        if update_data.get("is_main"):
            await db.warehouses.update_many({"is_main": True}, {"$set": {"is_main": False}})
        if update_data:
            await db.warehouses.update_one({"id": warehouse_id}, {"$set": update_data})
        return await db.warehouses.find_one({"id": warehouse_id}, {"_id": 0})

    @router.delete("/warehouses/{warehouse_id}")
    async def delete_warehouse(warehouse_id: str, admin: dict = Depends(require_permission("warehouses.edit"))):
        wh = await db.warehouses.find_one({"id": warehouse_id})
        if not wh:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        if wh.get("is_main"):
            raise HTTPException(status_code=400, detail="Cannot delete main warehouse")
        await db.warehouses.delete_one({"id": warehouse_id})
        return {"message": "Warehouse deleted successfully"}

    # ── Stock Transfers ──
    @router.post("/stock-transfers")
    async def create_stock_transfer(transfer: dict, admin: dict = Depends(require_permission("warehouses.edit"))):
        from models.schemas import StockTransferCreate
        t = StockTransferCreate(**transfer)
        from_wh = await db.warehouses.find_one({"id": t.from_warehouse})
        to_wh = await db.warehouses.find_one({"id": t.to_warehouse})
        if not from_wh or not to_wh:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        product = await db.products.find_one({"id": t.product_id})
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        if product.get("quantity", 0) < t.quantity:
            raise HTTPException(status_code=400, detail="Insufficient quantity")
        doc = {"id": str(uuid.uuid4()), "from_warehouse": t.from_warehouse, "from_warehouse_name": from_wh["name"], "to_warehouse": t.to_warehouse, "to_warehouse_name": to_wh["name"], "product_id": t.product_id, "product_name": product.get("name_ar", product.get("name_en", "")), "quantity": t.quantity, "created_at": datetime.now(timezone.utc).isoformat()}
        await db.stock_transfers.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.get("/stock-transfers")
    async def get_stock_transfers(user: dict = Depends(require_permission("warehouses.view"))):
        return await db.stock_transfers.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)

    # ── Inventory Sessions ──
    @router.post("/inventory-sessions")
    async def create_inventory_session(session: dict, admin: dict = Depends(require_permission("warehouses.edit"))):
        from models.schemas import InventorySessionCreate
        s = InventorySessionCreate(**session)
        existing = await db.inventory_sessions.find_one({"status": "active"})
        if existing:
            raise HTTPException(status_code=400, detail="An active inventory session already exists")
        doc = {"id": str(uuid.uuid4()), "name": s.name, "family_filter": s.family_filter, "status": "active", "started_at": s.started_at, "completed_at": None, "applied_changes": False, "counted_items": s.counted_items or {}}
        await db.inventory_sessions.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.get("/inventory-sessions")
    async def get_inventory_sessions(user: dict = Depends(require_permission("warehouses.view"))):
        return await db.inventory_sessions.find({}, {"_id": 0}).sort("started_at", -1).to_list(100)

    @router.put("/inventory-sessions/{session_id}")
    async def update_inventory_session(session_id: str, updates: dict, admin: dict = Depends(require_permission("warehouses.edit"))):
        session = await db.inventory_sessions.find_one({"id": session_id})
        if not session:
            raise HTTPException(status_code=404, detail="Inventory session not found")
        update_data = {k: v for k, v in updates.items() if v is not None and k != "id"}
        if update_data:
            await db.inventory_sessions.update_one({"id": session_id}, {"$set": update_data})
        return await db.inventory_sessions.find_one({"id": session_id}, {"_id": 0})

    @router.delete("/inventory-sessions/{session_id}")
    async def delete_inventory_session(session_id: str, admin: dict = Depends(require_permission("warehouses.edit"))):
        result = await db.inventory_sessions.delete_one({"id": session_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Inventory session not found")
        return {"message": "Inventory session deleted successfully"}

    return router
