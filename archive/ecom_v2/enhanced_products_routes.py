"""
Enhanced Products Routes - NT Commerce v16
Section 1: Product Management Enhancement
Provides 32 new endpoints for advanced product operations
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Body, status, UploadFile, File
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
import uuid
import traceback
import csv
import io


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class ProductVariantCreate(BaseModel):
    name: str
    sku: Optional[str] = None
    barcode: Optional[str] = None
    attributes: Dict[str, str] = Field(default_factory=dict)
    retail_price: Optional[float] = None
    wholesale_price: Optional[float] = None
    purchase_price: Optional[float] = None
    quantity: int = 0
    image_url: Optional[str] = None
    is_active: bool = True

class BundleItemCreate(BaseModel):
    product_id: str
    quantity: int = Field(gt=0)
    unit_price: Optional[float] = None

class ProductBundleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    items: List[BundleItemCreate]
    bundle_price: float = Field(gt=0)
    is_active: bool = True

class BulkPriceUpdate(BaseModel):
    product_ids: List[str]
    field: Literal["retail_price", "wholesale_price", "purchase_price", "super_wholesale_price"]
    value: float
    is_percentage: bool = False

class BulkStockUpdate(BaseModel):
    product_ids: List[str]
    operation: Literal["set", "add", "subtract"]
    quantity: int = Field(ge=0)
    reason: Optional[str] = "Bulk stock update"

class BulkStatusUpdate(BaseModel):
    product_ids: List[str]
    field: Literal["is_blocked", "is_non_stockable", "serial_number_tracking", "force_qty_entry"]
    value: bool

class ProductReviewCreate(BaseModel):
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None
    order_id: Optional[str] = None

class ProductTagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    color: Optional[str] = "#3B82F6"
    description: Optional[str] = None

class ProductSEOMetadata(BaseModel):
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    meta_keywords: Optional[str] = None
    slug: Optional[str] = None
    canonical_url: Optional[str] = None
    og_image_url: Optional[str] = None
    structured_data_type: Optional[str] = "Product"

class RelatedProductLink(BaseModel):
    related_product_id: str
    relation_type: Literal["related", "cross_sell", "up_sell", "accessory"]
    priority: int = 0

class CostAnalysisResponse(BaseModel):
    product_id: str
    product_name: str
    current_purchase_price: float
    current_retail_price: float
    current_wholesale_price: float
    avg_purchase_price: float
    avg_selling_price: float
    profit_margin_retail: float
    profit_margin_wholesale: float
    total_sold: int
    total_revenue: float
    total_cost: float
    total_profit: float
    price_history_count: int

class PromotionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    product_ids: List[str]
    discount_type: Literal["percentage", "fixed_amount"]
    discount_value: float = Field(gt=0)
    start_date: str
    end_date: str
    min_quantity: int = 1
    max_discount: Optional[float] = None
    is_active: bool = True


# ============================================================================
# FACTORY FUNCTION
# ============================================================================

def create_enhanced_products_routes(db, get_current_user, require_permission, cache=None, event_bus=None):
    router = APIRouter(prefix="/products", tags=["Products v2 - Enhanced"])

    async def log_activity(product_id: str, action: str, details: str, user_id: str = "system", metadata: Dict = None):
        entry = {
            "id": str(uuid.uuid4()), "product_id": product_id,
            "action": action, "details": details, "user_id": user_id,
            "created_at": datetime.utcnow().isoformat(), "metadata": metadata or {}
        }
        await db.product_audit_log.insert_one(entry)
        await db.products.update_one({"id": product_id}, {"$push": {"audit_log": {"action": action, "details": details, "at": datetime.utcnow().isoformat()}}})
        if event_bus:
            await event_bus.publish("product.activity", {"product_id": product_id, "action": action})
        return entry

    async def get_product_or_404(product_id: str):
        product = await db.products.find_one({"id": product_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {product_id} not found")
        return product

    def now_iso():
        return datetime.utcnow().isoformat()

    # ===== 1. PRODUCT VARIANTS (5 endpoints) =====
    @router.post("/{product_id}/variants", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_variant(product_id: str, variant: ProductVariantCreate, current_user: dict = Depends(get_current_user)):
        try:
            product = await get_product_or_404(product_id)
            variant_doc = {
                "id": str(uuid.uuid4()), "product_id": product_id,
                "name": variant.name, "sku": variant.sku or f"{product.get('barcode', product_id)}-V{uuid.uuid4().hex[:4].upper()}",
                "barcode": variant.barcode, "attributes": variant.attributes,
                "retail_price": variant.retail_price if variant.retail_price is not None else product.get("retail_price", 0),
                "wholesale_price": variant.wholesale_price if variant.wholesale_price is not None else product.get("wholesale_price", 0),
                "purchase_price": variant.purchase_price if variant.purchase_price is not None else product.get("purchase_price", 0),
                "quantity": variant.quantity, "image_url": variant.image_url,
                "is_active": variant.is_active, "created_at": now_iso(), "updated_at": now_iso()
            }
            await db.product_variants.insert_one(variant_doc)
            await log_activity(product_id, "variant_added", f"Variant '{variant.name}' added",
                current_user.get("id", "system"), {"variant_id": variant_doc["id"], "attributes": variant.attributes})
            return {"success": True, "variant_id": variant_doc["id"], "data": variant_doc}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{product_id}/variants", response_model=Dict[str, Any])
    async def list_variants(product_id: str, active_only: bool = False, current_user: dict = Depends(get_current_user)):
        try:
            await get_product_or_404(product_id)
            query = {"product_id": product_id}
            if active_only: query["is_active"] = True
            variants = await db.product_variants.find(query, {"_id": 0}).sort("created_at", -1).to_list(None)
            return {"success": True, "product_id": product_id, "total": len(variants), "variants": variants}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/{product_id}/variants/{variant_id}", response_model=Dict[str, Any])
    async def update_variant(product_id: str, variant_id: str, updates: ProductVariantCreate, current_user: dict = Depends(get_current_user)):
        try:
            existing = await db.product_variants.find_one({"id": variant_id, "product_id": product_id})
            if not existing: raise HTTPException(status_code=404, detail="Variant not found")
            update_doc = {k: v for k, v in updates.model_dump().items() if v is not None}
            update_doc["updated_at"] = now_iso()
            await db.product_variants.update_one({"id": variant_id}, {"$set": update_doc})
            updated = await db.product_variants.find_one({"id": variant_id}, {"_id": 0})
            await log_activity(product_id, "variant_updated", f"Variant '{updates.name}' updated",
                current_user.get("id", "system"), {"variant_id": variant_id})
            return {"success": True, "data": updated}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/{product_id}/variants/{variant_id}", response_model=Dict[str, Any])
    async def delete_variant(product_id: str, variant_id: str, current_user: dict = Depends(get_current_user)):
        try:
            result = await db.product_variants.delete_one({"id": variant_id, "product_id": product_id})
            if result.deleted_count == 0: raise HTTPException(status_code=404, detail="Variant not found")
            await log_activity(product_id, "variant_deleted", f"Variant {variant_id} deleted",
                current_user.get("id", "system"), {"variant_id": variant_id})
            return {"success": True, "message": "Variant deleted"}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{product_id}/variants/{variant_id}/stock-history", response_model=Dict[str, Any])
    async def get_variant_stock_history(product_id: str, variant_id: str,
                                         page: int = Query(1, ge=1), limit: int = Query(50, ge=1),
                                         current_user: dict = Depends(get_current_user)):
        try:
            total = await db.stock_movements.count_documents({"variant_id": variant_id, "product_id": product_id})
            movements = await db.stock_movements.find({"variant_id": variant_id, "product_id": product_id}, {"_id": 0})\
                .sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(None)
            return {"success": True, "total": total, "page": page, "movements": movements}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 2. PRODUCT BUNDLES (3 endpoints) =====
    @router.post("/bundles", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_bundle(bundle: ProductBundleCreate, current_user: dict = Depends(get_current_user)):
        try:
            bundle_items = []
            bundle_cost = 0.0
            for item in bundle.items:
                product = await db.products.find_one({"id": item.product_id}, {"_id": 0, "name_ar": 1, "name_en": 1, "purchase_price": 1, "retail_price": 1})
                if not product:
                    raise HTTPException(status_code=400, detail=f"Product {item.product_id} not found")
                unit_price = item.unit_price if item.unit_price is not None else product.get("purchase_price", 0)
                bundle_cost += unit_price * item.quantity
                bundle_items.append({
                    "product_id": item.product_id,
                    "product_name": product.get("name_ar") or product.get("name_en", "Unknown"),
                    "quantity": item.quantity, "unit_price": unit_price,
                    "total": unit_price * item.quantity
                })
            bundle_doc = {
                "id": str(uuid.uuid4()), "name": bundle.name, "description": bundle.description,
                "items": bundle_items, "bundle_price": bundle.bundle_price,
                "bundle_cost": round(bundle_cost, 2),
                "profit_margin": round((bundle.bundle_price - bundle_cost) / bundle.bundle_price * 100, 1) if bundle.bundle_price > 0 else 0,
                "is_active": bundle.is_active, "bundle_type": "custom",
                "created_by": current_user.get("id", "system"),
                "created_at": now_iso(), "updated_at": now_iso()
            }
            await db.product_bundles.insert_one(bundle_doc)
            await log_activity(bundle_doc["id"], "bundle_created", f"Bundle '{bundle.name}' created",
                current_user.get("id", "system"), {"bundle_id": bundle_doc["id"]})
            return {"success": True, "bundle_id": bundle_doc["id"], "data": bundle_doc}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/bundles", response_model=Dict[str, Any])
    async def list_bundles(search: Optional[str] = None, is_active: Optional[bool] = None,
                           page: int = Query(1, ge=1), limit: int = Query(50, ge=1),
                           current_user: dict = Depends(get_current_user)):
        try:
            query = {}
            if is_active is not None: query["is_active"] = is_active
            if search:
                query["$or"] = [{"name": {"$regex": search, "$options": "i"}}, {"description": {"$regex": search, "$options": "i"}}]
            total = await db.product_bundles.count_documents(query)
            bundles = await db.product_bundles.find(query, {"_id": 0}).sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(None)
            return {"success": True, "total": total, "page": page, "bundles": bundles}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/bundles/{bundle_id}", response_model=Dict[str, Any])
    async def get_bundle(bundle_id: str, current_user: dict = Depends(get_current_user)):
        try:
            bundle = await db.product_bundles.find_one({"id": bundle_id}, {"_id": 0})
            if not bundle: raise HTTPException(status_code=404, detail="Bundle not found")
            for item in bundle.get("items", []):
                product = await db.products.find_one({"id": item["product_id"]}, {"_id": 0, "quantity": 1})
                item["current_stock"] = product.get("quantity", 0) if product else 0
                item["can_fulfill"] = item["current_stock"] >= item["quantity"]
            return {"success": True, "data": bundle}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 3. BULK OPERATIONS (3 endpoints) =====
    @router.post("/bulk/price-update", response_model=Dict[str, Any])
    async def bulk_price_update(bulk: BulkPriceUpdate, current_user: dict = Depends(get_current_user)):
        try:
            if len(bulk.product_ids) > 500: raise HTTPException(status_code=400, detail="Max 500 products")
            results = {"success": [], "failed": []}
            for pid in bulk.product_ids:
                try:
                    product = await db.products.find_one({"id": pid})
                    if not product: results["failed"].append({"id": pid, "reason": "Not found"}); continue
                    old_price = product.get(bulk.field, 0)
                    new_price = old_price * (1 + bulk.value / 100) if bulk.is_percentage else bulk.value
                    await db.price_history.insert_one({
                        "id": str(uuid.uuid4()), "product_id": pid,
                        "field": bulk.field, "old_price": old_price, "new_price": round(new_price, 2),
                        "changed_by": current_user.get("full_name", "System"), "change_type": "bulk",
                        "created_at": now_iso()
                    })
                    await db.products.update_one({"id": pid}, {"$set": {bulk.field: round(new_price, 2), "updated_at": now_iso()}})
                    await log_activity(pid, "price_updated", f"{bulk.field}: {old_price} -> {round(new_price, 2)} (bulk)",
                        current_user.get("id", "system"), {"field": bulk.field, "old": old_price, "new": round(new_price, 2)})
                    results["success"].append({"id": pid, "field": bulk.field, "old": old_price, "new": round(new_price, 2)})
                except Exception as ex: results["failed"].append({"id": pid, "reason": str(ex)})
            if event_bus:
                await event_bus.publish("product.bulk_price_updated", {"count": len(results["success"]), "field": bulk.field})
            return {"success": True, "message": f"{len(results['success'])} updated, {len(results['failed'])} failed", "results": results}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/bulk/stock-update", response_model=Dict[str, Any])
    async def bulk_stock_update(bulk: BulkStockUpdate, current_user: dict = Depends(get_current_user)):
        try:
            if len(bulk.product_ids) > 500: raise HTTPException(status_code=400, detail="Max 500 products")
            results = {"success": [], "failed": []}
            for pid in bulk.product_ids:
                try:
                    product = await db.products.find_one({"id": pid})
                    if not product: results["failed"].append({"id": pid, "reason": "Not found"}); continue
                    old_qty = product.get("quantity", 0)
                    if bulk.operation == "set": new_qty = bulk.quantity
                    elif bulk.operation == "add": new_qty = old_qty + bulk.quantity
                    else: new_qty = max(0, old_qty - bulk.quantity)
                    await db.products.update_one({"id": pid}, {"$set": {"quantity": new_qty, "updated_at": now_iso()}})
                    await db.stock_movements.insert_one({
                        "id": str(uuid.uuid4()), "product_id": pid, "movement_type": "adjustment",
                        "quantity_change": new_qty - old_qty, "old_quantity": old_qty, "new_quantity": new_qty,
                        "reason": bulk.reason, "user_id": current_user.get("id", "system"),
                        "user_name": current_user.get("full_name", "System"), "created_at": now_iso()
                    })
                    await log_activity(pid, "stock_adjusted", f"Stock: {old_qty} -> {new_qty} (bulk {bulk.operation})",
                        current_user.get("id", "system"), {"operation": bulk.operation, "old": old_qty, "new": new_qty})
                    results["success"].append({"id": pid, "old": old_qty, "new": new_qty})
                except Exception as ex: results["failed"].append({"id": pid, "reason": str(ex)})
            return {"success": True, "message": f"{len(results['success'])} updated, {len(results['failed'])} failed", "results": results}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/bulk/status-update", response_model=Dict[str, Any])
    async def bulk_status_update(bulk: BulkStatusUpdate, current_user: dict = Depends(get_current_user)):
        try:
            if len(bulk.product_ids) > 500: raise HTTPException(status_code=400, detail="Max 500 products")
            result = await db.products.update_many({"id": {"$in": bulk.product_ids}}, {"$set": {bulk.field: bulk.value, "updated_at": now_iso()}})
            for pid in bulk.product_ids:
                await log_activity(pid, "status_changed", f"{bulk.field} set to {bulk.value} (bulk)",
                    current_user.get("id", "system"), {"field": bulk.field, "value": bulk.value})
            return {"success": True, "message": f"{result.modified_count} products updated", "field": bulk.field, "value": bulk.value}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 4. PRODUCT REVIEWS (2 endpoints) =====
    @router.post("/{product_id}/reviews", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def add_review(product_id: str, review: ProductReviewCreate, current_user: dict = Depends(get_current_user)):
        try:
            await get_product_or_404(product_id)
            review_doc = {
                "id": str(uuid.uuid4()), "product_id": product_id,
                "customer_id": review.customer_id, "customer_name": review.customer_name,
                "rating": review.rating, "comment": review.comment, "order_id": review.order_id,
                "is_approved": False, "is_verified_purchase": bool(review.order_id),
                "created_at": now_iso(), "updated_at": now_iso()
            }
            await db.product_reviews.insert_one(review_doc)
            pipeline = [
                {"$match": {"product_id": product_id, "is_approved": True}},
                {"$group": {"_id": None, "avg_rating": {"$avg": "$rating"}, "count": {"$sum": 1}}}
            ]
            stats = await db.product_reviews.aggregate(pipeline).to_list(None)
            if stats:
                await db.products.update_one({"id": product_id}, {"$set": {"rating": round(stats[0]["avg_rating"], 1), "review_count": stats[0]["count"]}})
            return {"success": True, "review_id": review_doc["id"], "data": review_doc}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{product_id}/reviews", response_model=Dict[str, Any])
    async def list_reviews(product_id: str, approved_only: bool = True, min_rating: Optional[int] = None,
                            page: int = Query(1, ge=1), limit: int = Query(50, ge=1),
                            current_user: dict = Depends(get_current_user)):
        try:
            await get_product_or_404(product_id)
            query = {"product_id": product_id}
            if approved_only: query["is_approved"] = True
            if min_rating: query["rating"] = {"$gte": min_rating}
            total = await db.product_reviews.count_documents(query)
            stats_pipeline = [
                {"$match": {"product_id": product_id, "is_approved": True}},
                {"$group": {"_id": None, "avg": {"$avg": "$rating"}, "count": {"$sum": 1},
                    "r5": {"$sum": {"$cond": [{"$eq": ["$rating", 5]}, 1, 0]}},
                    "r4": {"$sum": {"$cond": [{"$eq": ["$rating", 4]}, 1, 0]}},
                    "r3": {"$sum": {"$cond": [{"$eq": ["$rating", 3]}, 1, 0]}},
                    "r2": {"$sum": {"$cond": [{"$eq": ["$rating", 2]}, 1, 0]}},
                    "r1": {"$sum": {"$cond": [{"$eq": ["$rating", 1]}, 1, 0]}}}}
            ]
            stats = await db.product_reviews.aggregate(stats_pipeline).to_list(None)
            reviews = await db.product_reviews.find(query, {"_id": 0}).sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(None)
            return {"success": True, "total": total, "page": page,
                "stats": stats[0] if stats else None, "reviews": reviews}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 5. PRODUCT TAGS (3 endpoints) =====
    @router.post("/tags", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_tag(tag: ProductTagCreate, current_user: dict = Depends(get_current_user)):
        try:
            existing = await db.product_tags.find_one({"name": tag.name})
            if existing: raise HTTPException(status_code=409, detail="Tag already exists")
            tag_doc = {"id": str(uuid.uuid4()), "name": tag.name, "color": tag.color, "description": tag.description,
                "product_count": 0, "created_at": now_iso()}
            await db.product_tags.insert_one(tag_doc)
            return {"success": True, "tag_id": tag_doc["id"], "data": tag_doc}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/tags", response_model=Dict[str, Any])
    async def list_tags(search: Optional[str] = None, current_user: dict = Depends(get_current_user)):
        try:
            query = {}
            if search: query["name"] = {"$regex": search, "$options": "i"}
            tags = await db.product_tags.find(query, {"_id": 0}).sort("name", 1).to_list(None)
            return {"success": True, "total": len(tags), "tags": tags}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/{product_id}/tags", response_model=Dict[str, Any])
    async def assign_tags(product_id: str, tag_ids: List[str] = Body(...), current_user: dict = Depends(get_current_user)):
        try:
            product = await get_product_or_404(product_id)
            tags = await db.product_tags.find({"id": {"$in": tag_ids}}, {"_id": 0, "id": 1, "name": 1, "color": 1}).to_list(None)
            await db.products.update_one({"id": product_id}, {"$set": {"tags": [{"id": t["id"], "name": t["name"], "color": t["color"]} for t in tags], "updated_at": now_iso()}})
            await log_activity(product_id, "tags_updated", f"Tags assigned: {len(tags)}", current_user.get("id", "system"), {"tag_ids": tag_ids})
            return {"success": True, "product_id": product_id, "tags": tags}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 6. STOCK MOVEMENTS (2 endpoints) =====
    @router.post("/{product_id}/stock-movements", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def record_stock_movement(product_id: str, movement: Dict[str, Any] = Body(...),
                                     current_user: dict = Depends(get_current_user)):
        try:
            product = await get_product_or_404(product_id)
            mtype = movement.get("movement_type", "adjustment")
            qty_change = int(movement.get("quantity_change", 0))
            old_qty = product.get("quantity", 0)
            new_qty = max(0, old_qty + qty_change)
            movement_doc = {
                "id": str(uuid.uuid4()), "product_id": product_id,
                "variant_id": movement.get("variant_id"),
                "movement_type": mtype,
                "quantity_change": qty_change, "old_quantity": old_qty, "new_quantity": new_qty,
                "reference_id": movement.get("reference_id"),
                "reference_type": movement.get("reference_type"),
                "reason": movement.get("reason", ""),
                "warehouse_id": movement.get("warehouse_id"),
                "notes": movement.get("notes", ""),
                "user_id": current_user.get("id", "system"),
                "user_name": current_user.get("full_name", "System"),
                "created_at": now_iso()
            }
            await db.stock_movements.insert_one(movement_doc)
            await db.products.update_one({"id": product_id}, {"$set": {"quantity": new_qty, "updated_at": now_iso()}})
            await log_activity(product_id, f"stock_{mtype}", f"Stock {mtype}: {qty_change:+d} (new: {new_qty})",
                current_user.get("id", "system"), {"old": old_qty, "new": new_qty, "change": qty_change})
            return {"success": True, "movement_id": movement_doc["id"], "old_quantity": old_qty, "new_quantity": new_qty}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{product_id}/stock-movements", response_model=Dict[str, Any])
    async def get_stock_movements(product_id: str, movement_type: Optional[str] = None,
                                   date_from: Optional[str] = None, date_to: Optional[str] = None,
                                   page: int = Query(1, ge=1), limit: int = Query(50, ge=1),
                                   current_user: dict = Depends(get_current_user)):
        try:
            query = {"product_id": product_id}
            if movement_type: query["movement_type"] = movement_type
            if date_from or date_to:
                d = {}
                if date_from: d["$gte"] = date_from
                if date_to: d["$lte"] = date_to
                query["created_at"] = d
            total = await db.stock_movements.count_documents(query)
            movements = await db.stock_movements.find(query, {"_id": 0}).sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(None)
            pipeline = [
                {"$match": {"product_id": product_id}},
                {"$group": {"_id": "$movement_type", "total": {"$sum": "$quantity_change"}, "count": {"$sum": 1}}}
            ]
            summary = await db.stock_movements.aggregate(pipeline).to_list(None)
            return {"success": True, "total": total, "page": page,
                "summary": {s["_id"]: {"total_change": s["total"], "count": s["count"]} for s in summary},
                "movements": movements}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 7. IMPORT/EXPORT (2 endpoints) =====
    @router.post("/import/csv", response_model=Dict[str, Any])
    async def import_products_csv(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
        try:
            if not file.filename.endswith('.csv'): raise HTTPException(status_code=400, detail="CSV file required")
            content = await file.read()
            decoded = content.decode('utf-8')
            reader = csv.DictReader(io.StringIO(decoded))
            results = {"created": 0, "updated": 0, "failed": [], "rows": 0}
            for row in reader:
                results["rows"] += 1
                try:
                    barcode = row.get('barcode', '')
                    existing = await db.products.find_one({"barcode": barcode}) if barcode else None
                    product_doc = {
                        "name_en": row.get('name_en', ''), "name_ar": row.get('name_ar', ''),
                        "description_en": row.get('description_en', ''), "description_ar": row.get('description_ar', ''),
                        "purchase_price": float(row.get('purchase_price', 0) or 0),
                        "wholesale_price": float(row.get('wholesale_price', 0) or 0),
                        "retail_price": float(row.get('retail_price', 0) or 0),
                        "quantity": int(row.get('quantity', 0) or 0),
                        "barcode": barcode, "article_code": row.get('article_code', ''),
                        "family_id": row.get('family_id', ''), "updated_at": now_iso()
                    }
                    if existing:
                        await db.products.update_one({"id": existing["id"]}, {"$set": product_doc})
                        results["updated"] += 1
                    else:
                        product_doc["id"] = str(uuid.uuid4())
                        product_doc["created_at"] = now_iso()
                        await db.products.insert_one(product_doc)
                        results["created"] += 1
                except Exception as ex:
                    results["failed"].append({"row": results["rows"], "reason": str(ex)})
            return {"success": True, "message": f"Import: {results['created']} created, {results['updated']} updated, {len(results['failed'])} failed", "results": results}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/export/csv", response_model=Dict[str, Any])
    async def export_products_csv(filters: Optional[Dict[str, Any]] = Body(None), current_user: dict = Depends(get_current_user)):
        try:
            query = filters or {}
            products = await db.products.find(query, {"_id": 0}).sort("name_ar", 1).to_list(None)
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(["id", "name_en", "name_ar", "barcode", "article_code", "purchase_price", "wholesale_price",
                "retail_price", "quantity", "family_id", "family_name", "is_blocked", "created_at"])
            for p in products:
                writer.writerow([p.get("id", ""), p.get("name_en", ""), p.get("name_ar", ""), p.get("barcode", ""),
                    p.get("article_code", ""), p.get("purchase_price", 0), p.get("wholesale_price", 0),
                    p.get("retail_price", 0), p.get("quantity", 0), p.get("family_id", ""),
                    p.get("family_name", ""), p.get("is_blocked", False), p.get("created_at", "")])
            return {"success": True, "total": len(products), "csv": output.getvalue()}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 8. SEO METADATA (2 endpoints) =====
    @router.put("/{product_id}/seo", response_model=Dict[str, Any])
    async def update_seo_metadata(product_id: str, seo: ProductSEOMetadata, current_user: dict = Depends(get_current_user)):
        try:
            product = await get_product_or_404(product_id)
            seo_doc = seo.model_dump(exclude_none=True)
            seo_doc["updated_at"] = now_iso()
            await db.products.update_one({"id": product_id}, {"$set": {"seo": seo_doc, "updated_at": now_iso()}})
            await log_activity(product_id, "seo_updated", "SEO metadata updated", current_user.get("id", "system"), seo_doc)
            return {"success": True, "message": "SEO metadata updated", "data": seo_doc}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{product_id}/seo", response_model=Dict[str, Any])
    async def get_seo_metadata(product_id: str, current_user: dict = Depends(get_current_user)):
        try:
            product = await get_product_or_404(product_id)
            return {"success": True, "product_id": product_id, "seo": product.get("seo", {})}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 9. RELATED PRODUCTS (2 endpoints) =====
    @router.post("/{product_id}/related", response_model=Dict[str, Any])
    async def add_related_product(product_id: str, link: RelatedProductLink, current_user: dict = Depends(get_current_user)):
        try:
            await get_product_or_404(product_id)
            related = await db.products.find_one({"id": link.related_product_id}, {"_id": 0, "name_ar": 1, "name_en": 1})
            if not related: raise HTTPException(status_code=404, detail="Related product not found")
            link_doc = {
                "id": str(uuid.uuid4()), "product_id": product_id,
                "related_product_id": link.related_product_id,
                "related_product_name": related.get("name_ar") or related.get("name_en", ""),
                "relation_type": link.relation_type, "priority": link.priority, "created_at": now_iso()
            }
            await db.related_products.insert_one(link_doc)
            return {"success": True, "link_id": link_doc["id"], "data": link_doc}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{product_id}/related", response_model=Dict[str, Any])
    async def get_related_products(product_id: str, relation_type: Optional[str] = None,
                                    current_user: dict = Depends(get_current_user)):
        try:
            await get_product_or_404(product_id)
            query = {"product_id": product_id}
            if relation_type: query["relation_type"] = relation_type
            links = await db.related_products.find(query, {"_id": 0}).sort("priority", -1).to_list(None)
            return {"success": True, "product_id": product_id, "total": len(links), "related": links}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 10. COST ANALYSIS (1 endpoint) =====
    @router.get("/{product_id}/cost-analysis", response_model=CostAnalysisResponse)
    async def get_cost_analysis(product_id: str, current_user: dict = Depends(get_current_user)):
        try:
            product = await get_product_or_404(product_id)
            sales_pipeline = [
                {"$match": {"items.product_id": product_id}},
                {"$unwind": "$items"},
                {"$match": {"items.product_id": product_id}},
                {"$group": {"_id": None, "total_sold": {"$sum": "$items.quantity"},
                    "total_revenue": {"$sum": "$items.total"}, "avg_price": {"$avg": "$items.price"}}}
            ]
            sales_stats = await db.sales.aggregate(sales_pipeline).to_list(None)
            ss = sales_stats[0] if sales_stats else {"total_sold": 0, "total_revenue": 0, "avg_price": 0}
            ph = await db.price_history.find({"product_id": product_id}, {"_id": 0}).sort("created_at", -1).to_list(None)
            avg_purchase = sum(p.get("new_price", 0) for p in ph if p.get("field") == "purchase_price") / len([p for p in ph if p.get("field") == "purchase_price"]) if ph else product.get("purchase_price", 0)
            pp = product.get("purchase_price", 0)
            rp = product.get("retail_price", 0)
            wp = product.get("wholesale_price", 0)
            return CostAnalysisResponse(
                product_id=product_id, product_name=product.get("name_ar") or product.get("name_en", ""),
                current_purchase_price=pp, current_retail_price=rp, current_wholesale_price=wp,
                avg_purchase_price=round(avg_purchase, 2), avg_selling_price=round(ss.get("avg_price", 0), 2),
                profit_margin_retail=round((rp - pp) / rp * 100, 1) if rp > 0 else 0,
                profit_margin_wholesale=round((wp - pp) / wp * 100, 1) if wp > 0 else 0,
                total_sold=ss.get("total_sold", 0), total_revenue=round(ss.get("total_revenue", 0), 2),
                total_cost=round(ss.get("total_sold", 0) * pp, 2),
                total_profit=round(ss.get("total_revenue", 0) - ss.get("total_sold", 0) * pp, 2),
                price_history_count=len(ph)
            )
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 11. PROMOTIONS (3 endpoints) =====
    @router.post("/promotions", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_promotion(promo: PromotionCreate, current_user: dict = Depends(get_current_user)):
        try:
            for pid in promo.product_ids:
                p = await db.products.find_one({"id": pid}, {"_id": 0, "name_ar": 1})
                if not p: raise HTTPException(status_code=400, detail=f"Product {pid} not found")
            promo_doc = {
                "id": str(uuid.uuid4()), "name": promo.name, "product_ids": promo.product_ids,
                "discount_type": promo.discount_type, "discount_value": promo.discount_value,
                "start_date": promo.start_date, "end_date": promo.end_date,
                "min_quantity": promo.min_quantity, "max_discount": promo.max_discount,
                "is_active": promo.is_active, "created_by": current_user.get("id", "system"),
                "created_at": now_iso(), "updated_at": now_iso()
            }
            await db.product_promotions.insert_one(promo_doc)
            return {"success": True, "promotion_id": promo_doc["id"], "data": promo_doc}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/promotions/active", response_model=Dict[str, Any])
    async def get_active_promotions(product_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
        try:
            now = datetime.utcnow().isoformat()
            query = {"is_active": True, "start_date": {"$lte": now}, "end_date": {"$gte": now}}
            if product_id: query["product_ids"] = product_id
            promos = await db.product_promotions.find(query, {"_id": 0}).sort("created_at", -1).to_list(None)
            return {"success": True, "total": len(promos), "promotions": promos}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{product_id}/promotions", response_model=Dict[str, Any])
    async def get_product_promotions(product_id: str, current_user: dict = Depends(get_current_user)):
        try:
            await get_product_or_404(product_id)
            now = datetime.utcnow().isoformat()
            promos = await db.product_promotions.find(
                {"product_ids": product_id, "is_active": True, "start_date": {"$lte": now}, "end_date": {"$gte": now}},
                {"_id": 0}).sort("discount_value", -1).to_list(None)
            return {"success": True, "product_id": product_id, "promotions": promos}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 12. AUDIT LOG (1 endpoint) =====
    @router.get("/{product_id}/audit-log", response_model=Dict[str, Any])
    async def get_audit_log(product_id: str, action: Optional[str] = None,
                             page: int = Query(1, ge=1), limit: int = Query(50, ge=1),
                             current_user: dict = Depends(get_current_user)):
        try:
            await get_product_or_404(product_id)
            query = {"product_id": product_id}
            if action: query["action"] = action
            total = await db.product_audit_log.count_documents(query)
            entries = await db.product_audit_log.find(query, {"_id": 0}).sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(None)
            return {"success": True, "total": total, "page": page, "entries": entries}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 13. BARCODE MANAGEMENT (1 endpoint) =====
    @router.post("/{product_id}/barcodes", response_model=Dict[str, Any])
    async def add_additional_barcode(product_id: str, barcode: str = Body(..., min_length=3), is_primary: bool = Body(False),
                                      current_user: dict = Depends(get_current_user)):
        try:
            product = await get_product_or_404(product_id)
            existing = await db.products.find_one({"$or": [{"barcode": barcode}, {"additional_barcodes": barcode}]})
            if existing and existing["id"] != product_id:
                raise HTTPException(status_code=409, detail="Barcode already used by another product")
            if is_primary:
                old_primary = product.get("barcode", "")
                await db.products.update_one({"id": product_id},
                    {"$set": {"barcode": barcode, "updated_at": now_iso()},
                     "$push": {"additional_barcodes": old_primary}})
            else:
                await db.products.update_one({"id": product_id},
                    {"$push": {"additional_barcodes": barcode}, "$set": {"updated_at": now_iso()}})
            await log_activity(product_id, "barcode_added", f"Barcode added: {barcode}",
                current_user.get("id", "system"), {"barcode": barcode, "is_primary": is_primary})
            return {"success": True, "product_id": product_id, "barcode": barcode, "is_primary": is_primary}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 14. LOW STOCK ENHANCED (1 endpoint) =====
    @router.get("/alerts/low-stock/enhanced", response_model=Dict[str, Any])
    async def get_low_stock_enhanced(threshold_override: Optional[int] = None,
                                      page: int = Query(1, ge=1), limit: int = Query(50, ge=1),
                                      current_user: dict = Depends(get_current_user)):
        try:
            match_stage = {"$expr": {"$lte": ["$quantity", {"$ifNull": ["$low_stock_threshold", threshold_override or 5]}]}} if threshold_override else {"$expr": {"$lte": ["$quantity", {"$ifNull": ["$low_stock_threshold", 5]}]}}
            pipeline = []
            pipeline.append({"$match": match_stage})
            pipeline.append({"$match": {"quantity": {"$gt": 0}}})
            pipeline.append({"$lookup": {"from": "product_families", "localField": "family_id", "foreignField": "id", "as": "family"}})
            pipeline.append({"$addFields": {"family_name": {"$arrayElemAt": ["$family.name_ar", 0]}}})
            count_pipeline = pipeline.copy()
            count_pipeline.append({"$count": "total"})
            total_result = await db.products.aggregate(count_pipeline).to_list(None)
            total = total_result[0]["total"] if total_result else 0
            pipeline.append({"$project": {"_id": 0, "id": 1, "name_ar": 1, "name_en": 1, "barcode": 1,
                "quantity": 1, "low_stock_threshold": 1, "family_name": 1, "retail_price": 1,
                "purchase_price": 1, "image_url": 1, "article_code": 1}})
            pipeline.append({"$sort": {"quantity": 1}})
            pipeline.append({"$skip": (page - 1) * limit})
            pipeline.append({"$limit": limit})
            products = await db.products.aggregate(pipeline).to_list(None)
            thirty_days_ago = (datetime.utcnow() - timedelta(days=30)).isoformat()
            for p in products:
                pid = p["id"]
                sales_pipeline = [
                    {"$match": {"created_at": {"$gte": thirty_days_ago}, "items.product_id": pid}},
                    {"$unwind": "$items"}, {"$match": {"items.product_id": pid}},
                    {"$group": {"_id": None, "total_sold": {"$sum": "$items.quantity"}}}
                ]
                sales_result = await db.sales.aggregate(sales_pipeline).to_list(None)
                avg_daily = sales_result[0]["total_sold"] / 30 if sales_result and sales_result[0]["total_sold"] else 0
                p["avg_daily_sales"] = round(avg_daily, 1)
                p["days_until_stockout"] = int(p["quantity"] / avg_daily) if avg_daily > 0 else 999
            return {"success": True, "total": total, "page": page, "products": products}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 15. ANALYTICS DASHBOARD (1 endpoint) =====
    @router.get("/analytics/overview", response_model=Dict[str, Any])
    async def get_products_analytics(current_user: dict = Depends(get_current_user)):
        try:
            now = datetime.utcnow()
            total_products = await db.products.count_documents({})
            total_active = await db.products.count_documents({"is_blocked": {"$ne": True}})
            total_blocked = await db.products.count_documents({"is_blocked": True})
            low_stock = await db.products.count_documents({"$expr": {"$lte": ["$quantity", {"$ifNull": ["$low_stock_threshold", 5]}]}})
            out_of_stock = await db.products.count_documents({"quantity": {"$lte": 0}})
            month_start = (now - timedelta(days=30)).isoformat()
            new_this_month = await db.products.count_documents({"created_at": {"$gte": month_start}})
            family_pipeline = [
                {"$match": {"family_id": {"$exists": True, "$ne": ""}}},
                {"$group": {"_id": "$family_id", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}}, {"$limit": 10}
            ]
            by_family = await db.products.aggregate(family_pipeline).to_list(None)
            families = await db.product_families.find({"id": {"$in": [f["_id"] for f in by_family]}}, {"_id": 0, "id": 1, "name_ar": 1}).to_list(None)
            family_map = {f["id"]: f.get("name_ar", "") for f in families}
            top_pipeline = [
                {"$match": {"created_at": {"$gte": month_start}}},
                {"$unwind": "$items"},
                {"$group": {"_id": "$items.product_id", "name": {"$first": "$items.name_ar"}, "total_sold": {"$sum": "$items.quantity"}, "revenue": {"$sum": "$items.total"}}},
                {"$sort": {"total_sold": -1}}, {"$limit": 10}
            ]
            top_selling = await db.sales.aggregate(top_pipeline).to_list(None)
            return {"success": True, "total_products": total_products, "total_active": total_active,
                "total_blocked": total_blocked, "low_stock": low_stock, "out_of_stock": out_of_stock,
                "new_this_month": new_this_month,
                "by_family": [{"family_id": f["_id"], "family_name": family_map.get(f["_id"], ""), "count": f["count"]} for f in by_family],
                "top_selling": [{"product_id": t["_id"], "name": t["name"], "total_sold": t["total_sold"], "revenue": round(t["revenue"], 2)} for t in top_selling]}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    return router
