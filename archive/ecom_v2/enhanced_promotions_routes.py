"""
Enhanced Promotions Routes - NT Commerce v16
Section 7: Promotions, Discounts & Loyalty Enhancement
Provides 32 endpoints for coupons, flash sales, bundles, loyalty points, and promo analytics
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Body, status
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
import uuid
import traceback
import random
import string


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class CouponCreate(BaseModel):
    code: Optional[str] = None  # auto-generated if not provided
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    discount_type: Literal["percentage", "fixed_amount", "free_shipping", "buy_x_get_y"]
    discount_value: float = Field(ge=0)
    min_order_amount: Optional[float] = 0
    max_discount: Optional[float] = None
    applies_to: Literal["all", "categories", "products", "collections"] = "all"
    target_ids: Optional[List[str]] = Field(default_factory=list)
    usage_limit: Optional[int] = None
    usage_limit_per_customer: Optional[int] = 1
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_active: bool = True
    auto_apply: bool = False

class CouponUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    discount_value: Optional[float] = None
    min_order_amount: Optional[float] = None
    max_discount: Optional[float] = None
    usage_limit: Optional[int] = None
    usage_limit_per_customer: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_active: Optional[bool] = None
    auto_apply: Optional[bool] = None

class FlashSaleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    product_ids: List[str] = Field(min_length=1)
    discount_type: Literal["percentage", "fixed_amount"] = "percentage"
    discount_value: float = Field(ge=0)
    start_date: str
    end_date: str
    max_quantity_per_customer: Optional[int] = None
    total_stock_limit: Optional[int] = None
    is_active: bool = True

class FlashSaleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    max_quantity_per_customer: Optional[int] = None
    total_stock_limit: Optional[int] = None
    is_active: Optional[bool] = None

class DiscountRuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    condition_type: Literal["cart_total", "item_count", "customer_segment", "first_order", "payment_method", "wilaya"]
    condition_value: Dict[str, Any] = Field(default_factory=dict)
    discount_type: Literal["percentage", "fixed_amount", "free_shipping"] = "percentage"
    discount_value: float = Field(ge=0)
    priority: int = Field(default=0, ge=0, le=100)
    is_active: bool = True

class LoyaltyPointsAward(BaseModel):
    customer_id: str
    points: int = Field(gt=0)
    reason: str = "purchase"
    order_id: Optional[str] = None

class LoyaltyPointsRedeem(BaseModel):
    customer_id: str
    points: int = Field(gt=0)
    reason: Optional[str] = "discount"

class LoyaltyTierCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    min_points: int = Field(ge=0)
    discount_percentage: float = Field(default=0, ge=0, le=100)
    color: Optional[str] = "#FFD700"
    benefits: Optional[List[str]] = Field(default_factory=list)

class BundleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    product_ids: List[str] = Field(min_length=2)
    bundle_price: float = Field(gt=0)
    original_total: Optional[float] = None
    is_active: bool = True
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class PromoAnalyticsFilter(BaseModel):
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    promo_type: Optional[str] = None


# ============================================================================
# FACTORY FUNCTION
# ============================================================================

def create_enhanced_promotions_routes(db, get_current_user, require_permission, cache=None, event_bus=None):
    router = APIRouter(prefix="/promotions", tags=["Promotions v2 - Discounts & Loyalty"])

    async def log_activity(action: str, details: str, user_id: str = "system", metadata: Dict = None):
        entry = {"id": str(uuid.uuid4()), "action": action, "details": details, "user_id": user_id, "created_at": datetime.utcnow().isoformat(), "metadata": metadata or {}}
        await db.promo_activity_log.insert_one(entry)
        if event_bus:
            await event_bus.publish("promo.activity", {"action": action, "details": details})

    def now_iso():
        return datetime.utcnow().isoformat()

    def paginate(page: int, limit: int):
        return (page - 1) * limit, limit + 1

    def gen_code(length=10):
        return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))

    async def get_coupon_or_404(coupon_id: str):
        c = await db.coupons.find_one({"id": coupon_id}, {"_id": 0})
        if not c:
            raise HTTPException(status_code=404, detail="Coupon not found")
        return c

    # ===== 1. COUPON CRUD (5 endpoints) =====

    @router.post("/coupons", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_coupon(coupon: CouponCreate, current_user: dict = Depends(get_current_user)):
        """Create a coupon code. Auto-generates code if not provided."""
        try:
            c_id = str(uuid.uuid4())
            code = (coupon.code or gen_code()).upper()
            doc = {
                "id": c_id, "code": code, "name": coupon.name,
                "description": coupon.description,
                "discount_type": coupon.discount_type,
                "discount_value": coupon.discount_value,
                "min_order_amount": coupon.min_order_amount or 0,
                "max_discount": coupon.max_discount,
                "applies_to": coupon.applies_to,
                "target_ids": coupon.target_ids,
                "usage_limit": coupon.usage_limit,
                "usage_limit_per_customer": coupon.usage_limit_per_customer,
                "usage_count": 0,
                "start_date": coupon.start_date,
                "end_date": coupon.end_date,
                "is_active": coupon.is_active,
                "auto_apply": coupon.auto_apply,
                "created_at": now_iso(),
                "created_by": current_user.get("id", "")
            }
            await db.coupons.insert_one(doc)
            doc.pop("_id", None)
            await log_activity("coupon_created", f"Coupon {code} created", current_user.get("id", ""))
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/coupons", response_model=Dict[str, Any])
    async def list_coupons(is_active: Optional[bool] = None, page: int = Query(1, ge=1), limit: int = Query(50, ge=1), current_user: dict = Depends(get_current_user)):
        """List coupons with filters."""
        try:
            query = {}
            if is_active is not None:
                query["is_active"] = is_active
            skip, _ = paginate(page, limit)
            total = await db.coupons.count_documents(query)
            items = await db.coupons.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"coupons": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/coupons/{coupon_id}", response_model=Dict[str, Any])
    async def get_coupon(coupon_id: str, current_user: dict = Depends(get_current_user)):
        """Get coupon with usage stats."""
        try:
            coupon = await get_coupon_or_404(coupon_id)
            usage = await db.coupon_usage.find({"coupon_id": coupon_id}, {"_id": 0}).sort("used_at", -1).limit(20).to_list(None)
            coupon["recent_usage"] = usage
            return coupon
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/coupons/{coupon_id}", response_model=Dict[str, Any])
    async def update_coupon(coupon_id: str, update: CouponUpdate, current_user: dict = Depends(get_current_user)):
        """Update coupon settings."""
        try:
            existing = await db.coupons.find_one({"id": coupon_id})
            if not existing:
                raise HTTPException(status_code=404, detail="Coupon not found")
            changes = {k: v for k, v in update.model_dump().items() if v is not None}
            if changes:
                changes["updated_at"] = now_iso()
                await db.coupons.update_one({"id": coupon_id}, {"$set": changes})
            doc = await db.coupons.find_one({"id": coupon_id}, {"_id": 0})
            return doc
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/coupons/{coupon_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_coupon(coupon_id: str, current_user: dict = Depends(get_current_user)):
        """Deactivate coupon."""
        try:
            await db.coupons.update_one({"id": coupon_id}, {"$set": {"is_active": False, "updated_at": now_iso()}})
            return None
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 2. COUPON VALIDATION & APPLICATION (2 endpoints) =====

    @router.post("/coupons/validate", response_model=Dict[str, Any])
    async def validate_coupon(code: str = Body(...), cart_total: float = Body(...), customer_id: Optional[str] = Body(None), current_user: dict = Depends(get_current_user)):
        """Validate a coupon code against cart total and customer."""
        try:
            code = code.upper().strip()
            coupon = await db.coupons.find_one({"code": code}, {"_id": 0})
            if not coupon:
                raise HTTPException(status_code=404, detail="Coupon code not found")
            if not coupon.get("is_active"):
                raise HTTPException(status_code=400, detail="Coupon is inactive")

            now = now_iso()
            if coupon.get("start_date") and now < coupon["start_date"]:
                raise HTTPException(status_code=400, detail="Coupon not yet active")
            if coupon.get("end_date") and now > coupon["end_date"]:
                raise HTTPException(status_code=400, detail="Coupon expired")
            if coupon.get("usage_limit") and coupon.get("usage_count", 0) >= coupon["usage_limit"]:
                raise HTTPException(status_code=400, detail="Coupon usage limit reached")
            if coupon.get("min_order_amount", 0) > cart_total:
                raise HTTPException(status_code=400, detail=f"Minimum order amount is {coupon['min_order_amount']} DZD")

            if customer_id and coupon.get("usage_limit_per_customer"):
                customer_usage = await db.coupon_usage.count_documents({"coupon_id": coupon["id"], "customer_id": customer_id})
                if customer_usage >= coupon["usage_limit_per_customer"]:
                    raise HTTPException(status_code=400, detail="Usage limit per customer reached")

            # Calculate discount
            if coupon["discount_type"] == "percentage":
                discount = cart_total * (coupon["discount_value"] / 100)
                if coupon.get("max_discount") and discount > coupon["max_discount"]:
                    discount = coupon["max_discount"]
            elif coupon["discount_type"] == "fixed_amount":
                discount = min(coupon["discount_value"], cart_total)
            elif coupon["discount_type"] == "free_shipping":
                discount = 0  # shipping handled separately
            else:
                discount = 0

            return {
                "valid": True,
                "coupon_id": coupon["id"],
                "code": code,
                "discount_type": coupon["discount_type"],
                "discount_value": round(discount, 2),
                "final_total": round(cart_total - discount, 2),
                "coupon": coupon
            }
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/coupons/{coupon_id}/apply", response_model=Dict[str, Any])
    async def apply_coupon(coupon_id: str, order_id: str = Body(...), customer_id: str = Body(...), cart_total: float = Body(...), current_user: dict = Depends(get_current_user)):
        """Record coupon usage on an order."""
        try:
            coupon = await get_coupon_or_404(coupon_id)
            usage_id = str(uuid.uuid4())
            await db.coupon_usage.insert_one({
                "id": usage_id, "coupon_id": coupon_id, "code": coupon["code"],
                "order_id": order_id, "customer_id": customer_id,
                "cart_total": cart_total, "used_at": now_iso()
            })
            await db.coupons.update_one({"id": coupon_id}, {"$inc": {"usage_count": 1}})
            await log_activity("coupon_applied", f"Coupon {coupon['code']} applied to order {order_id}", current_user.get("id", ""))
            return {"coupon_id": coupon_id, "order_id": order_id, "usage_recorded": True}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 3. FLASH SALES (5 endpoints) =====

    @router.post("/flash-sales", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_flash_sale(sale: FlashSaleCreate, current_user: dict = Depends(get_current_user)):
        """Create a flash sale / limited-time offer."""
        try:
            s_id = str(uuid.uuid4())
            doc = {
                "id": s_id, "name": sale.name, "description": sale.description,
                "product_ids": sale.product_ids,
                "discount_type": sale.discount_type,
                "discount_value": sale.discount_value,
                "start_date": sale.start_date,
                "end_date": sale.end_date,
                "max_quantity_per_customer": sale.max_quantity_per_customer,
                "total_stock_limit": sale.total_stock_limit,
                "sold_count": 0,
                "is_active": sale.is_active,
                "created_at": now_iso(),
                "created_by": current_user.get("id", "")
            }
            await db.flash_sales.insert_one(doc)
            doc.pop("_id", None)
            await log_activity("flash_sale_created", f"Flash sale {sale.name} created", current_user.get("id", ""))
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/flash-sales", response_model=Dict[str, Any])
    async def list_flash_sales(active_only: bool = False, current_user: dict = Depends(get_current_user)):
        """List flash sales. active_only filters currently running sales."""
        try:
            query = {}
            if active_only:
                now = now_iso()
                query = {"is_active": True, "start_date": {"$lte": now}, "end_date": {"$gte": now}}
            sales = await db.flash_sales.find(query, {"_id": 0}).sort("start_date", -1).to_list(100)
            # Enrich with product info
            for s in sales:
                products = await db.products.find({"id": {"$in": s.get("product_ids", [])}}, {"_id": 0, "id": 1, "name": 1, "retail_price": 1, "image_url": 1}).to_list(None)
                s["products"] = products
            return {"flash_sales": sales, "total": len(sales)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/flash-sales/{sale_id}", response_model=Dict[str, Any])
    async def get_flash_sale(sale_id: str, current_user: dict = Depends(get_current_user)):
        """Get flash sale details with product info."""
        try:
            sale = await db.flash_sales.find_one({"id": sale_id}, {"_id": 0})
            if not sale:
                raise HTTPException(status_code=404, detail="Flash sale not found")
            products = await db.products.find({"id": {"$in": sale.get("product_ids", [])}}, {"_id": 0, "id": 1, "name": 1, "retail_price": 1, "image_url": 1}).to_list(None)
            sale["products"] = products
            return sale
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/flash-sales/{sale_id}", response_model=Dict[str, Any])
    async def update_flash_sale(sale_id: str, update: FlashSaleUpdate, current_user: dict = Depends(get_current_user)):
        """Update flash sale."""
        try:
            existing = await db.flash_sales.find_one({"id": sale_id})
            if not existing:
                raise HTTPException(status_code=404, detail="Flash sale not found")
            changes = {k: v for k, v in update.model_dump().items() if v is not None}
            if changes:
                changes["updated_at"] = now_iso()
                await db.flash_sales.update_one({"id": sale_id}, {"$set": changes})
            doc = await db.flash_sales.find_one({"id": sale_id}, {"_id": 0})
            return doc
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/flash-sales/{sale_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_flash_sale(sale_id: str, current_user: dict = Depends(get_current_user)):
        """Deactivate flash sale."""
        try:
            await db.flash_sales.update_one({"id": sale_id}, {"$set": {"is_active": False, "updated_at": now_iso()}})
            return None
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 4. DISCOUNT RULES (3 endpoints) =====

    @router.post("/discount-rules", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_discount_rule(rule: DiscountRuleCreate, current_user: dict = Depends(get_current_user)):
        """Create an automatic discount rule (e.g., free shipping over X DZD)."""
        try:
            r_id = str(uuid.uuid4())
            doc = {
                "id": r_id, "name": rule.name,
                "condition_type": rule.condition_type,
                "condition_value": rule.condition_value,
                "discount_type": rule.discount_type,
                "discount_value": rule.discount_value,
                "priority": rule.priority,
                "is_active": rule.is_active,
                "trigger_count": 0,
                "created_at": now_iso(),
                "created_by": current_user.get("id", "")
            }
            await db.discount_rules.insert_one(doc)
            doc.pop("_id", None)
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/discount-rules", response_model=Dict[str, Any])
    async def list_discount_rules(is_active: Optional[bool] = None, current_user: dict = Depends(get_current_user)):
        """List discount rules."""
        try:
            query = {}
            if is_active is not None:
                query["is_active"] = is_active
            rules = await db.discount_rules.find(query, {"_id": 0}).sort("priority", -1).to_list(100)
            return {"rules": rules, "total": len(rules)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/discount-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_discount_rule(rule_id: str, current_user: dict = Depends(get_current_user)):
        """Deactivate discount rule."""
        try:
            await db.discount_rules.update_one({"id": rule_id}, {"$set": {"is_active": False, "updated_at": now_iso()}})
            return None
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 5. LOYALTY POINTS (5 endpoints) =====

    @router.post("/loyalty/award", response_model=Dict[str, Any])
    async def award_loyalty_points(req: LoyaltyPointsAward, current_user: dict = Depends(get_current_user)):
        """Award loyalty points to a customer."""
        try:
            customer = await db.customers.find_one({"id": req.customer_id}, {"_id": 0, "id": 1, "name": 1})
            if not customer:
                raise HTTPException(status_code=404, detail="Customer not found")

            txn_id = str(uuid.uuid4())
            await db.loyalty_transactions.insert_one({
                "id": txn_id, "customer_id": req.customer_id,
                "points": req.points, "type": "earn",
                "reason": req.reason, "order_id": req.order_id,
                "created_at": now_iso(), "created_by": current_user.get("id", "")
            })

            # Update customer balance
            await db.customers.update_one(
                {"id": req.customer_id},
                {"$inc": {"loyalty_points": req.points}, "$set": {"updated_at": now_iso()}}
            )

            return {"customer_id": req.customer_id, "points_awarded": req.points, "reason": req.reason, "transaction_id": txn_id}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/loyalty/redeem", response_model=Dict[str, Any])
    async def redeem_loyalty_points(req: LoyaltyPointsRedeem, current_user: dict = Depends(get_current_user)):
        """Redeem loyalty points from a customer."""
        try:
            customer = await db.customers.find_one({"id": req.customer_id}, {"_id": 0, "loyalty_points": 1, "name": 1})
            if not customer:
                raise HTTPException(status_code=404, detail="Customer not found")

            current_points = customer.get("loyalty_points", 0) or 0
            if current_points < req.points:
                raise HTTPException(status_code=400, detail=f"Insufficient points. Available: {current_points}")

            txn_id = str(uuid.uuid4())
            await db.loyalty_transactions.insert_one({
                "id": txn_id, "customer_id": req.customer_id,
                "points": -req.points, "type": "redeem",
                "reason": req.reason,
                "created_at": now_iso(), "created_by": current_user.get("id", "")
            })

            await db.customers.update_one(
                {"id": req.customer_id},
                {"$inc": {"loyalty_points": -req.points}, "$set": {"updated_at": now_iso()}}
            )

            # 100 points = 1 DZD discount
            discount_value = req.points / 100
            return {"customer_id": req.customer_id, "points_redeemed": req.points, "discount_value": round(discount_value, 2), "remaining_points": current_points - req.points}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/loyalty/customers/{customer_id}/balance", response_model=Dict[str, Any])
    async def get_loyalty_balance(customer_id: str, current_user: dict = Depends(get_current_user)):
        """Get loyalty points balance for a customer."""
        try:
            customer = await db.customers.find_one({"id": customer_id}, {"_id": 0, "id": 1, "name": 1, "loyalty_points": 1, "total_purchases": 1})
            if not customer:
                raise HTTPException(status_code=404, detail="Customer not found")

            points = customer.get("loyalty_points", 0) or 0
            # Determine tier
            tier = "bronze"
            if points >= 5000:
                tier = "platinum"
            elif points >= 2000:
                tier = "gold"
            elif points >= 500:
                tier = "silver"

            recent_txns = await db.loyalty_transactions.find({"customer_id": customer_id}, {"_id": 0}).sort("created_at", -1).limit(10).to_list(None)
            return {"customer_id": customer_id, "name": customer.get("name", ""), "points": points, "tier": tier, "points_value_dzd": round(points / 100, 2), "recent_transactions": recent_txns}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/loyalty/tiers", response_model=Dict[str, Any])
    async def list_loyalty_tiers(current_user: dict = Depends(get_current_user)):
        """List loyalty tiers with point thresholds."""
        try:
            tiers = [
                {"name": "Bronze", "min_points": 0, "discount_percentage": 0, "color": "#CD7F32", "benefits": ["Base rewards"]},
                {"name": "Silver", "min_points": 500, "discount_percentage": 3, "color": "#C0C0C0", "benefits": ["3% discount", "Early access to sales"]},
                {"name": "Gold", "min_points": 2000, "discount_percentage": 7, "color": "#FFD700", "benefits": ["7% discount", "Free shipping", "Priority support"]},
                {"name": "Platinum", "min_points": 5000, "discount_percentage": 12, "color": "#E5E4E2", "benefits": ["12% discount", "Free shipping", "VIP support", "Exclusive offers"]},
            ]
            return {"tiers": tiers}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/loyalty/transactions", response_model=Dict[str, Any])
    async def list_loyalty_transactions(customer_id: Optional[str] = None, page: int = Query(1, ge=1), limit: int = Query(50, ge=1), current_user: dict = Depends(get_current_user)):
        """List loyalty point transactions."""
        try:
            query = {}
            if customer_id:
                query["customer_id"] = customer_id
            skip, _ = paginate(page, limit)
            total = await db.loyalty_transactions.count_documents(query)
            items = await db.loyalty_transactions.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"transactions": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 6. BUNDLES (3 endpoints) =====

    @router.post("/bundles", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_bundle(bundle: BundleCreate, current_user: dict = Depends(get_current_user)):
        """Create a product bundle with special price."""
        try:
            b_id = str(uuid.uuid4())
            doc = {
                "id": b_id, "name": bundle.name, "description": bundle.description,
                "product_ids": bundle.product_ids,
                "bundle_price": bundle.bundle_price,
                "original_total": bundle.original_total,
                "is_active": bundle.is_active,
                "start_date": bundle.start_date,
                "end_date": bundle.end_date,
                "created_at": now_iso(),
                "created_by": current_user.get("id", "")
            }
            await db.product_bundles.insert_one(doc)
            doc.pop("_id", None)
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/bundles", response_model=Dict[str, Any])
    async def list_bundles(is_active: Optional[bool] = None, current_user: dict = Depends(get_current_user)):
        """List product bundles with product info."""
        try:
            query = {}
            if is_active is not None:
                query["is_active"] = is_active
            bundles = await db.product_bundles.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
            for b in bundles:
                products = await db.products.find({"id": {"$in": b.get("product_ids", [])}}, {"_id": 0, "id": 1, "name": 1, "retail_price": 1, "image_url": 1}).to_list(None)
                b["products"] = products
                if b.get("original_total") and b["original_total"] > 0:
                    b["savings"] = round(b["original_total"] - b["bundle_price"], 2)
                    b["savings_percentage"] = round((b["savings"] / b["original_total"]) * 100, 1)
            return {"bundles": bundles, "total": len(bundles)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/bundles/{bundle_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_bundle(bundle_id: str, current_user: dict = Depends(get_current_user)):
        """Deactivate bundle."""
        try:
            await db.product_bundles.update_one({"id": bundle_id}, {"$set": {"is_active": False, "updated_at": now_iso()}})
            return None
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 7. PROMO ANALYTICS (4 endpoints) =====

    @router.get("/analytics/overview", response_model=Dict[str, Any])
    async def get_promo_analytics(current_user: dict = Depends(get_current_user)):
        """Promotions analytics dashboard overview."""
        try:
            total_coupons = await db.coupons.count_documents({})
            active_coupons = await db.coupons.count_documents({"is_active": True})
            total_coupon_usage = await db.coupon_usage.count_documents({})
            active_flash = await db.flash_sales.count_documents({"is_active": True})
            active_bundles = await db.product_bundles.count_documents({"is_active": True})
            active_rules = await db.discount_rules.count_documents({"is_active": True})

            # Total discount given
            pipeline = [
                {"$group": {"_id": None, "total_discount": {"$sum": "$discount_value"}}}
            ]
            discount_result = await db.coupon_usage.aggregate(pipeline).to_list(1)
            total_discount = discount_result[0]["total_discount"] if discount_result else 0

            # Top coupons
            top_pipeline = [
                {"$group": {"_id": "$coupon_id", "code": {"$first": "$code"}, "usage_count": {"$sum": 1}}},
                {"$sort": {"usage_count": -1}},
                {"$limit": 5}
            ]
            top_coupons = await db.coupon_usage.aggregate(top_pipeline).to_list(None)

            return {
                "total_coupons": total_coupons,
                "active_coupons": active_coupons,
                "total_coupon_usage": total_coupon_usage,
                "active_flash_sales": active_flash,
                "active_bundles": active_bundles,
                "active_discount_rules": active_rules,
                "total_discount_given": round(total_discount, 2),
                "top_coupons": [{"coupon_id": c["_id"], "code": c["code"], "usage": c["usage_count"]} for c in top_coupons]
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/coupons", response_model=Dict[str, Any])
    async def get_coupon_analytics(days: int = Query(30, ge=1, le=365), current_user: dict = Depends(get_current_user)):
        """Coupon usage analytics over time."""
        try:
            since = (datetime.utcnow() - timedelta(days=days)).isoformat()
            pipeline = [
                {"$match": {"used_at": {"$gte": since}}},
                {"$group": {"_id": {"$substr": ["$used_at", 0, 10]}, "usage": {"$sum": 1}, "total_discount": {"$sum": "$cart_total"}}},
                {"$sort": {"_id": 1}}
            ]
            daily = await db.coupon_usage.aggregate(pipeline).to_list(None)
            return {"period_days": days, "daily_usage": [{"date": d["_id"], "uses": d["usage"], "cart_total": round(d.get("total_discount", 0), 2)} for d in daily]}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/loyalty", response_model=Dict[str, Any])
    async def get_loyalty_analytics(current_user: dict = Depends(get_current_user)):
        """Loyalty program analytics."""
        try:
            total_customers = await db.customers.count_documents({"loyalty_points": {"$gt": 0}})
            total_points_issued = await db.loyalty_transactions.count_documents({"type": "earn"})
            total_points_redeemed = await db.loyalty_transactions.count_documents({"type": "redeem"})

            # Points by tier
            pipeline = [
                {"$match": {"loyalty_points": {"$gt": 0}}},
                {"$group": {"_id": {
                    "$switch": {
                        "branches": [
                            {"case": {"$gte": ["$loyalty_points", 5000]}, "then": "platinum"},
                            {"case": {"$gte": ["$loyalty_points", 2000]}, "then": "gold"},
                            {"case": {"$gte": ["$loyalty_points", 500]}, "then": "silver"},
                        ],
                        "default": "bronze"
                    }
                }, "count": {"$sum": 1}, "total_points": {"$sum": "$loyalty_points"}}}
            ]
            tier_dist = await db.customers.aggregate(pipeline).to_list(None)

            return {
                "total_loyalty_customers": total_customers,
                "total_points_issued_transactions": total_points_issued,
                "total_points_redeemed_transactions": total_points_redeemed,
                "tier_distribution": [{"tier": t["_id"], "customers": t["count"], "total_points": t["total_points"]} for t in tier_dist]
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/revenue-impact", response_model=Dict[str, Any])
    async def get_promo_revenue_impact(days: int = Query(30, ge=1, le=365), current_user: dict = Depends(get_current_user)):
        """Calculate revenue impact of promotions."""
        try:
            since = (datetime.utcnow() - timedelta(days=days)).isoformat()

            # Orders with coupons
            coupon_orders = await db.ecom_orders.count_documents({"coupon_code": {"$exists": True}, "created_at": {"$gte": since}})
            total_orders = await db.ecom_orders.count_documents({"created_at": {"$gte": since}})

            # Revenue from coupon orders
            rev_pipeline = [
                {"$match": {"coupon_code": {"$exists": True}, "created_at": {"$gte": since}}},
                {"$group": {"_id": None, "revenue": {"$sum": "$total"}, "count": {"$sum": 1}}}
            ]
            rev_result = await db.ecom_orders.aggregate(rev_pipeline).to_list(1)
            coupon_revenue = rev_result[0]["revenue"] if rev_result else 0
            coupon_count = rev_result[0]["count"] if rev_result else 0

            # Avg order value with vs without coupon
            all_rev_pipeline = [
                {"$match": {"created_at": {"$gte": since}}},
                {"$group": {"_id": {"$cond": [{"$ifNull": ["$coupon_code", False]}, "with_coupon", "without_coupon"]}, "avg": {"$avg": "$total"}, "count": {"$sum": 1}}}
            ]
            avg_results = await db.ecom_orders.aggregate(all_rev_pipeline).to_list(None)
            avg_map = {r["_id"]: {"avg": r["avg"], "count": r["count"]} for r in avg_results}

            return {
                "period_days": days,
                "orders_with_coupon": coupon_count,
                "total_orders": total_orders,
                "coupon_attachment_rate": round(coupon_count / total_orders * 100, 1) if total_orders > 0 else 0,
                "coupon_revenue": round(coupon_revenue, 2),
                "avg_order_with_coupon": round(avg_map.get("with_coupon", {}).get("avg", 0), 2),
                "avg_order_without_coupon": round(avg_map.get("without_coupon", {}).get("avg", 0), 2),
                "avg_lift": round(avg_map.get("with_coupon", {}).get("avg", 0) - avg_map.get("without_coupon", {}).get("avg", 0), 2)
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 8. ACTIVE PROMOS LOOKUP (2 endpoints) =====

    @router.get("/active", response_model=Dict[str, Any])
    async def get_all_active_promotions(current_user: dict = Depends(get_current_user)):
        """Get all currently active promotions (coupons + flash sales + bundles + rules)."""
        try:
            now = now_iso()
            active_coupons = await db.coupons.find({"is_active": True, "start_date": {"$lte": now}, "$or": [{"end_date": {"$gte": now}}, {"end_date": None}]}, {"_id": 0, "id": 1, "code": 1, "name": 1, "discount_type": 1, "discount_value": 1}).to_list(None)
            active_flash = await db.flash_sales.find({"is_active": True, "start_date": {"$lte": now}, "end_date": {"$gte": now}}, {"_id": 0, "id": 1, "name": 1, "discount_type": 1, "discount_value": 1, "end_date": 1}).to_list(None)
            active_bundles = await db.product_bundles.find({"is_active": True}, {"_id": 0, "id": 1, "name": 1, "bundle_price": 1, "original_total": 1}).to_list(None)
            active_rules = await db.discount_rules.find({"is_active": True}, {"_id": 0, "id": 1, "name": 1, "condition_type": 1, "discount_type": 1, "discount_value": 1}).to_list(None)

            return {
                "coupons": active_coupons,
                "flash_sales": active_flash,
                "bundles": active_bundles,
                "discount_rules": active_rules,
                "total_active": len(active_coupons) + len(active_flash) + len(active_bundles) + len(active_rules)
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/evaluate-cart", response_model=Dict[str, Any])
    async def evaluate_cart_promotions(cart_total: float = Body(...), item_count: int = Body(...), customer_id: Optional[str] = Body(None), wilaya_code: Optional[str] = Body(None), current_user: dict = Depends(get_current_user)):
        """Evaluate all applicable promotions for a cart. Returns best discounts."""
        try:
            applicable = []
            now = now_iso()

            # Check discount rules
            rules = await db.discount_rules.find({"is_active": True}, {"_id": 0}).sort("priority", -1).to_list(None)
            for rule in rules:
                condition = rule.get("condition_type", "")
                cond_val = rule.get("condition_value", {})
                applies = False

                if condition == "cart_total" and cart_total >= cond_val.get("min", 0):
                    applies = True
                elif condition == "item_count" and item_count >= cond_val.get("min", 0):
                    applies = True
                elif condition == "first_order" and customer_id:
                    order_count = await db.ecom_orders.count_documents({"customer.id": customer_id})
                    applies = order_count == 0
                elif condition == "wilaya" and wilaya_code and wilaya_code in cond_val.get("codes", []):
                    applies = True

                if applies:
                    if rule["discount_type"] == "percentage":
                        discount = cart_total * (rule["discount_value"] / 100)
                    elif rule["discount_type"] == "fixed_amount":
                        discount = min(rule["discount_value"], cart_total)
                    elif rule["discount_type"] == "free_shipping":
                        discount = 0
                    else:
                        discount = 0

                    applicable.append({
                        "type": "rule",
                        "name": rule["name"],
                        "discount": round(discount, 2),
                        "discount_type": rule["discount_type"],
                        "final_total": round(cart_total - discount, 2)
                    })

            # Sort by best discount
            applicable.sort(key=lambda x: x["discount"], reverse=True)
            best = applicable[0] if applicable else None

            return {
                "cart_total": cart_total,
                "applicable_promotions": applicable,
                "best_discount": best,
                "savings": round(sum(a["discount"] for a in applicable[:1]), 2) if applicable else 0
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 9. COUPON GENERATOR (1 endpoint) =====

    @router.post("/coupons/generate-batch", response_model=Dict[str, Any])
    async def generate_coupon_batch(count: int = Body(10, ge=1, le=100), prefix: Optional[str] = Body(None), coupon_template: CouponCreate = Body(...), current_user: dict = Depends(get_current_user)):
        """Generate a batch of unique coupon codes."""
        try:
            generated = []
            for _ in range(count):
                code = f"{prefix or ''}{gen_code(8)}"
                c_id = str(uuid.uuid4())
                doc = {
                    "id": c_id, "code": code.upper(), "name": coupon_template.name,
                    "description": coupon_template.description,
                    "discount_type": coupon_template.discount_type,
                    "discount_value": coupon_template.discount_value,
                    "min_order_amount": coupon_template.min_order_amount,
                    "max_discount": coupon_template.max_discount,
                    "applies_to": coupon_template.applies_to,
                    "target_ids": coupon_template.target_ids,
                    "usage_limit": coupon_template.usage_limit or 1,
                    "usage_limit_per_customer": coupon_template.usage_limit_per_customer,
                    "usage_count": 0,
                    "start_date": coupon_template.start_date,
                    "end_date": coupon_template.end_date,
                    "is_active": True,
                    "auto_apply": False,
                    "batch_generated": True,
                    "created_at": now_iso(),
                    "created_by": current_user.get("id", "")
                }
                await db.coupons.insert_one(doc)
                doc.pop("_id", None)
                generated.append(doc)

            return {"generated_count": len(generated), "coupons": [{"id": c["id"], "code": c["code"]} for c in generated]}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 10. FLASH SALE CHECK (1 endpoint) =====

    @router.post("/flash-sales/check", response_model=Dict[str, Any])
    async def check_flash_sale_eligibility(product_id: str = Body(...), customer_id: Optional[str] = Body(None), current_user: dict = Depends(get_current_user)):
        """Check if a product is in an active flash sale and if customer can purchase."""
        try:
            now = now_iso()
            sale = await db.flash_sales.find_one({
                "product_ids": product_id,
                "is_active": True,
                "start_date": {"$lte": now},
                "end_date": {"$gte": now}
            }, {"_id": 0})

            if not sale:
                return {"in_flash_sale": False}

            # Check per-customer limit
            can_purchase = True
            remaining = sale.get("total_stock_limit")
            if remaining is not None:
                remaining = remaining - sale.get("sold_count", 0)
                if remaining <= 0:
                    can_purchase = False

            return {
                "in_flash_sale": True,
                "sale_id": sale["id"],
                "sale_name": sale["name"],
                "discount_type": sale["discount_type"],
                "discount_value": sale["discount_value"],
                "end_date": sale["end_date"],
                "can_purchase": can_purchase,
                "remaining_stock": remaining,
                "max_per_customer": sale.get("max_quantity_per_customer")
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))


    # ===== 11. CUSTOMER COUPON HISTORY (1 endpoint) =====

    @router.get("/coupons/customer/{customer_id}/history", response_model=Dict[str, Any])
    async def get_customer_coupon_history(customer_id: str, current_user: dict = Depends(get_current_user)):
        """Get coupon usage history for a specific customer."""
        try:
            usage = await db.coupon_usage.find({"customer_id": customer_id}, {"_id": 0}).sort("used_at", -1).to_list(50)
            total_saved = sum(u.get("cart_total", 0) * 0.1 for u in usage)  # estimated savings
            return {
                "customer_id": customer_id,
                "total_coupons_used": len(usage),
                "estimated_savings": round(total_saved, 2),
                "usage_history": usage
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    return router
