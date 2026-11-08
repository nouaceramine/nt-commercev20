"""Warehouse, stock-transfer and inventory-session routes."""
import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError, PyMongoError

from config.database import client
from services.warehouse_stock import adjust_warehouse_stock


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
        doc = {
            "id": wid, "code": code, "name": w.name, "address": w.address or "",
            "phone": w.phone or "", "manager": w.manager or "", "notes": w.notes or "",
            "is_main": w.is_main, "created_at": now,
        }
        await db.warehouses.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.get("/warehouses")
    async def get_warehouses(user: dict = Depends(require_permission("warehouses.view"))):
        return await db.warehouses.find({}, {"_id": 0}).to_list(100)

    @router.put("/warehouses/{warehouse_id}")
    async def update_warehouse(warehouse_id: str, updates: dict, admin: dict = Depends(require_permission("warehouses.edit"))):
        from models.schemas import WarehouseUpdate
        wh = await db.warehouses.find_one({"id": warehouse_id})
        if not wh:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        update_data = WarehouseUpdate(**updates).model_dump(exclude_unset=True, exclude_none=True)
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
        linked_transfer = await db.stock_transfers.find_one({
            "$or": [{"from_warehouse": warehouse_id}, {"to_warehouse": warehouse_id}],
        }, {"_id": 1})
        linked_stock = await db.warehouse_stock.find_one({"warehouse_id": warehouse_id}, {"_id": 1})
        linked_purchase = await db.purchases.find_one({"warehouse_id": warehouse_id}, {"_id": 1})
        linked_sale = await db.sales.find_one({"warehouse_id": warehouse_id}, {"_id": 1})
        if linked_transfer or linked_stock or linked_purchase or linked_sale:
            raise HTTPException(status_code=400, detail="Cannot delete a warehouse with linked stock or movements")
        await db.warehouses.delete_one({"id": warehouse_id})
        return {"message": "Warehouse deleted successfully"}

    # ── Stock Transfers ──
    async def _create_stock_transfer_impl(t, session):
        if t.from_warehouse == t.to_warehouse:
            raise HTTPException(status_code=400, detail="Cannot transfer to the same warehouse")
        from_wh = await db.warehouses.find_one({"id": t.from_warehouse}, session=session)
        to_wh = await db.warehouses.find_one({"id": t.to_warehouse}, session=session)
        if not from_wh or not to_wh:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        product = await db.products.find_one({"id": t.product_id}, session=session)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        product_quantity = float(product.get("quantity", 0) or 0)
        if product_quantity < t.quantity:
            raise HTTPException(status_code=400, detail="Insufficient quantity")
        source_quantity = await adjust_warehouse_stock(
            db, t.product_id, t.from_warehouse, -t.quantity,
            product_quantity_before=product_quantity, session=session,
            initialize_from_product=True,
        )
        destination_quantity = await adjust_warehouse_stock(
            db, t.product_id, t.to_warehouse, t.quantity,
            product_quantity_before=0, session=session,
            initialize_from_product=False,
        )
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": str(uuid.uuid4()), "from_warehouse": t.from_warehouse,
            "from_warehouse_name": from_wh["name"], "to_warehouse": t.to_warehouse,
            "to_warehouse_name": to_wh["name"], "product_id": t.product_id,
            "product_name": product.get("name_ar", product.get("name_en", "")),
            "quantity": t.quantity, "from_quantity": source_quantity,
            "to_quantity": destination_quantity, "created_at": now,
        }
        await db.stock_transfers.insert_one(doc, session=session)
        doc.pop("_id", None)
        return doc

    @router.post("/stock-transfers")
    async def create_stock_transfer(transfer: dict, admin: dict = Depends(require_permission("warehouses.edit"))):
        from models.schemas import StockTransferCreate
        t = StockTransferCreate(**transfer)
        for attempt in range(5):
            try:
                async with await client.start_session() as tx_session:
                    async with tx_session.start_transaction():
                        return await _create_stock_transfer_impl(t, tx_session)
            except DuplicateKeyError:
                if attempt == 4:
                    raise
                await asyncio.sleep(0.02 * (2 ** attempt))
            except PyMongoError as exc:
                if attempt == 4 or not exc.has_error_label("TransientTransactionError"):
                    raise
                await asyncio.sleep(0.02 * (2 ** attempt))

    @router.get("/stock-transfers")
    async def get_stock_transfers(user: dict = Depends(require_permission("warehouses.view"))):
        return await db.stock_transfers.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)

    # ── Inventory Sessions ──
    async def _create_inventory_session_impl(s, session):
        existing = await db.inventory_sessions.find_one({"status": "active"}, session=session)
        if existing:
            raise HTTPException(status_code=400, detail="An active inventory session already exists")
        sid = str(uuid.uuid4())
        await db.inventory_session_claims.insert_one(
            {"_id": "active", "session_id": sid}, session=session,
        )
        doc = {
            "id": sid, "name": s.name, "code": s.code or "",
            "family_filter": s.family_filter, "status": "active", "started_at": s.started_at,
            "completed_at": None, "applied_changes": False, "counted_items": s.counted_items or {},
        }
        await db.inventory_sessions.insert_one(doc, session=session)
        doc.pop("_id", None)
        return doc

    @router.post("/inventory-sessions")
    async def create_inventory_session(session: dict, admin: dict = Depends(require_permission("warehouses.edit"))):
        from models.schemas import InventorySessionCreate
        s = InventorySessionCreate(**session)
        for attempt in range(5):
            try:
                async with await client.start_session() as tx_session:
                    async with tx_session.start_transaction():
                        return await _create_inventory_session_impl(s, tx_session)
            except DuplicateKeyError:
                raise HTTPException(status_code=400, detail="An active inventory session already exists")
            except PyMongoError as exc:
                if attempt == 4 or not exc.has_error_label("TransientTransactionError"):
                    raise
                await asyncio.sleep(0.02 * (2 ** attempt))

    @router.get("/inventory-sessions")
    async def get_inventory_sessions(user: dict = Depends(require_permission("warehouses.view"))):
        return await db.inventory_sessions.find({}, {"_id": 0}).sort("started_at", -1).to_list(100)

    async def _update_inventory_session_impl(session_id: str, updates: dict, session):
        current = await db.inventory_sessions.find_one({"id": session_id}, session=session)
        if not current:
            raise HTTPException(status_code=404, detail="Inventory session not found")
        if current.get("status") != "active":
            # Completion is exactly once. A repeated request returns the
            # committed session without rewriting products or location stock.
            current.pop("_id", None)
            return current

        from models.schemas import InventorySessionUpdate
        update_data = InventorySessionUpdate(**updates).model_dump(exclude_unset=True, exclude_none=True)
        completing = update_data.get("status") == "completed"
        apply_changes = completing and update_data.get("applied_changes") is True
        counted_items = update_data.get("counted_items", current.get("counted_items", {}))
        if completing:
            update_data["completed_at"] = update_data.get("completed_at") or datetime.now(timezone.utc).isoformat()
            update_data["counted_items"] = counted_items
            update_data["applied_changes"] = apply_changes

        if apply_changes:
            now = datetime.now(timezone.utc).isoformat()
            products = {}
            for product_id in counted_items:
                product = await db.products.find_one({"id": product_id}, session=session)
                if not product:
                    raise HTTPException(status_code=404, detail=f"Inventory product not found: {product_id}")
                products[product_id] = product
            main_warehouse = await db.warehouses.find_one({"is_main": True}, session=session)
            adjustments = []
            for product_id, counted_quantity in counted_items.items():
                product = products[product_id]
                old_quantity = float(product.get("quantity", 0) or 0)
                counted_quantity = float(counted_quantity)
                if main_warehouse:
                    await adjust_warehouse_stock(
                        db, product_id, main_warehouse["id"], counted_quantity - old_quantity,
                        product_quantity_before=old_quantity, session=session,
                        initialize_from_product=True,
                    )
                await db.products.update_one(
                    {"id": product_id},
                    {"$set": {"quantity": counted_quantity, "updated_at": now}}, session=session,
                )
                adjustments.append({
                    "product_id": product_id, "old_quantity": old_quantity,
                    "counted_quantity": counted_quantity, "difference": counted_quantity - old_quantity,
                })
            update_data["adjustments"] = adjustments

        if update_data:
            result = await db.inventory_sessions.update_one(
                {"id": session_id, "status": "active"}, {"$set": update_data}, session=session,
            )
            if result.matched_count != 1:
                raise HTTPException(status_code=409, detail="Inventory session changed concurrently")
        if completing:
            await db.inventory_session_claims.delete_one(
                {"_id": "active", "session_id": session_id}, session=session,
            )
        updated = await db.inventory_sessions.find_one({"id": session_id}, {"_id": 0}, session=session)
        return updated

    @router.put("/inventory-sessions/{session_id}")
    async def update_inventory_session(session_id: str, updates: dict, admin: dict = Depends(require_permission("warehouses.edit"))):
        # Validate before opening a transaction so malformed counts are 422,
        # including non-finite numbers and negative quantities.
        from models.schemas import InventorySessionUpdate
        InventorySessionUpdate(**updates)
        for attempt in range(5):
            try:
                async with await client.start_session() as tx_session:
                    async with tx_session.start_transaction():
                        return await _update_inventory_session_impl(session_id, updates, tx_session)
            except (DuplicateKeyError, PyMongoError) as exc:
                if attempt == 4 or (
                    not isinstance(exc, DuplicateKeyError)
                    and not exc.has_error_label("TransientTransactionError")
                ):
                    raise
                await asyncio.sleep(0.02 * (2 ** attempt))

    async def _delete_inventory_session_impl(session_id: str, session):
        result = await db.inventory_sessions.delete_one({"id": session_id}, session=session)
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Inventory session not found")
        await db.inventory_session_claims.delete_one(
            {"_id": "active", "session_id": session_id}, session=session,
        )
        return {"message": "Inventory session deleted successfully"}

    @router.delete("/inventory-sessions/{session_id}")
    async def delete_inventory_session(session_id: str, admin: dict = Depends(require_permission("warehouses.edit"))):
        for attempt in range(5):
            try:
                async with await client.start_session() as tx_session:
                    async with tx_session.start_transaction():
                        return await _delete_inventory_session_impl(session_id, tx_session)
            except PyMongoError as exc:
                if attempt == 4 or not exc.has_error_label("TransientTransactionError"):
                    raise
                await asyncio.sleep(0.02 * (2 ** attempt))

    return router
