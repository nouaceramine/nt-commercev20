"""
Enhanced Customers Routes - NT Commerce v16
Section 3: eCom CRM - Customer Management Enhancement
Provides 30 new endpoints for advanced customer relationship management
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Body, status
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
import uuid
import traceback


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class CustomerSegmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None
    color: Optional[str] = "#3B82F6"
    criteria: Optional[Dict[str, Any]] = Field(default_factory=dict)
    is_active: bool = True

class CustomerSegmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    criteria: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None

class CustomerTagRequest(BaseModel):
    tags: List[str] = Field(min_length=1)

class CustomerInteractionCreate(BaseModel):
    interaction_type: Literal["call", "email", "whatsapp", "sms", "meeting", "note", "ticket", "visit"]
    description: str = Field(min_length=1)
    direction: Literal["inbound", "outbound"] = "inbound"
    status: Optional[str] = "completed"
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)

class CustomerMergeRequest(BaseModel):
    primary_customer_id: str
    duplicate_customer_ids: List[str] = Field(min_length=1)
    keep_primary_data: bool = True

class CustomerAddressCreate(BaseModel):
    label: Optional[str] = "رئيسي"
    address: str = Field(min_length=1)
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    phone: Optional[str] = None
    is_default: bool = False
    coordinates: Optional[Dict[str, float]] = None

class CustomerAddressUpdate(BaseModel):
    label: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    phone: Optional[str] = None
    is_default: Optional[bool] = None
    coordinates: Optional[Dict[str, float]] = None

class CustomerWishlistItem(BaseModel):
    product_id: str
    notes: Optional[str] = None

class BulkTagRequest(BaseModel):
    customer_ids: List[str] = Field(min_length=1)
    tags: List[str] = Field(min_length=1)
    operation: Literal["add", "remove", "replace"] = "add"

class BulkSegmentRequest(BaseModel):
    customer_ids: List[str] = Field(min_length=1)
    segment_id: str
    operation: Literal["add", "remove"] = "add"

class AdvancedCustomerSearch(BaseModel):
    query: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    segment_id: Optional[str] = None
    tags: Optional[List[str]] = None
    min_purchases: Optional[float] = None
    max_purchases: Optional[float] = None
    has_debt: Optional[bool] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    sort_by: Optional[str] = "created_at"
    sort_order: Optional[str] = "desc"
    page: int = 1
    limit: int = 50

class CustomerProfileResponse(BaseModel):
    customer_id: str
    name: str
    phone: str
    email: str
    address: str
    code: str
    family_id: str
    family_name: str
    balance: float
    total_purchases: float
    segment_ids: List[str]
    tags: List[str]
    addresses_count: int
    wishlist_count: int
    interactions_count: int
    orders_summary: Dict[str, Any]
    debt_summary: Dict[str, Any]
    channel_history: List[Dict[str, Any]]
    created_at: str
    last_order_date: Optional[str] = None
    days_since_last_order: Optional[int] = None
    customer_tier: str = "new"
    churn_risk_score: float = 0.0

class CustomerAnalyticsOverview(BaseModel):
    total_customers: int
    new_customers_this_month: int
    active_customers_this_month: int
    customers_with_debt: int
    total_debt: float
    average_customer_value: float
    top_customer_tiers: List[Dict[str, Any]]
    segment_distribution: List[Dict[str, Any]]
    channel_distribution: List[Dict[str, Any]]
    churn_risk_distribution: List[Dict[str, Any]]

class CustomerRFMRequest(BaseModel):
    recency_days: int = 30
    customer_limit: int = 500


# ============================================================================
# FACTORY FUNCTION
# ============================================================================

def create_enhanced_customers_routes(db, get_current_user, require_permission, cache=None, event_bus=None):
    router = APIRouter(prefix="/customers", tags=["Customers v2 - eCom CRM"])

    async def log_activity(customer_id: str, action: str, details: str, user_id: str = "system", metadata: Dict = None):
        entry = {
            "id": str(uuid.uuid4()),
            "customer_id": customer_id,
            "action": action,
            "details": details,
            "user_id": user_id,
            "created_at": datetime.utcnow().isoformat(),
            "metadata": metadata or {}
        }
        await db.customer_interactions.insert_one(entry)
        if event_bus:
            await event_bus.publish("customer.activity", {"customer_id": customer_id, "action": action})
        return entry

    async def get_customer_or_404(customer_id: str):
        customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
        if not customer:
            raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found")
        return customer

    def now_iso():
        return datetime.utcnow().isoformat()

    def paginate(page: int, limit: int):
        skip = (page - 1) * limit
        return skip, limit + 1

    # ===== 1. UNIFIED CUSTOMER PROFILE =====

    @router.get("/{customer_id}/profile", response_model=Dict[str, Any])
    async def get_customer_profile(customer_id: str, current_user: dict = Depends(get_current_user)):
        """Get unified customer profile with orders, debts, interactions across all channels."""
        try:
            customer = await get_customer_or_404(customer_id)

            # Count orders from all channels
            orders_query = {"$or": [
                {"customer.id": customer_id},
                {"customer_id": customer_id}
            ]}
            orders = await db.ecom_orders.find(orders_query, {"_id": 0, "id": 1, "total": 1, "status": 1, "channel": 1, "created_at": 1}).sort("created_at", -1).to_list(100)

            # POS sales
            pos_sales = await db.sales.find({"customer_id": customer_id}, {"_id": 0, "id": 1, "total": 1, "created_at": 1}).sort("created_at", -1).to_list(100)

            # Count addresses
            addresses_count = await db.customer_addresses.count_documents({"customer_id": customer_id})

            # Count wishlist
            wishlist_count = await db.customer_wishlists.count_documents({"customer_id": customer_id})

            # Count interactions
            interactions_count = await db.customer_interactions.count_documents({"customer_id": customer_id})

            # Debt info
            debt_sales = await db.sales.find({"customer_id": customer_id, "debt_amount": {"$gt": 0}}, {"_id": 0, "debt_amount": 1, "total": 1}).to_list(None)
            total_debt = sum(s.get("debt_amount", 0) for s in debt_sales)

            # Channel history
            channel_history = []
            all_orders = orders + [{"channel": "pos", "total": s.get("total", 0), "created_at": s.get("created_at", "")} for s in pos_sales]
            channel_totals = {}
            for o in all_orders:
                ch = o.get("channel", "manual")
                channel_totals[ch] = channel_totals.get(ch, {"count": 0, "total": 0})
                channel_totals[ch]["count"] += 1
                channel_totals[ch]["total"] += o.get("total", 0)
            for ch, data in channel_totals.items():
                channel_history.append({"channel": ch, **data})

            # Customer tier
            total_orders = len(all_orders)
            total_revenue = sum(o.get("total", 0) for o in all_orders)
            last_order = max((o.get("created_at", "") for o in all_orders), default="")
            days_since = (datetime.utcnow() - datetime.fromisoformat(last_order.replace("Z", "+00:00").replace("+00:00", ""))).days if last_order else None

            if total_revenue > 100000:
                tier = "vip"
            elif total_revenue > 50000:
                tier = "gold"
            elif total_revenue > 20000:
                tier = "silver"
            elif total_orders > 0:
                tier = "bronze"
            else:
                tier = "new"

            # Churn risk
            churn_risk = 0.0
            if days_since is not None:
                if days_since > 90:
                    churn_risk = 0.9
                elif days_since > 60:
                    churn_risk = 0.7
                elif days_since > 30:
                    churn_risk = 0.4
                elif days_since > 14:
                    churn_risk = 0.2

            return {
                "customer_id": customer_id,
                "name": customer.get("name", ""),
                "phone": customer.get("phone", ""),
                "email": customer.get("email", ""),
                "address": customer.get("address", ""),
                "code": customer.get("code", ""),
                "family_id": customer.get("family_id", ""),
                "family_name": customer.get("family_name", ""),
                "balance": customer.get("balance", 0),
                "total_purchases": customer.get("total_purchases", 0),
                "segment_ids": customer.get("segment_ids", []),
                "tags": customer.get("tags", []),
                "addresses_count": addresses_count,
                "wishlist_count": wishlist_count,
                "interactions_count": interactions_count,
                "orders_summary": {
                    "total_orders": total_orders,
                    "total_revenue": round(total_revenue, 2),
                    "ecom_orders": len(orders),
                    "pos_sales": len(pos_sales)
                },
                "debt_summary": {
                    "total_debt": round(total_debt, 2),
                    "unpaid_sales_count": len(debt_sales)
                },
                "channel_history": channel_history,
                "created_at": customer.get("created_at", ""),
                "last_order_date": last_order or None,
                "days_since_last_order": days_since,
                "customer_tier": tier,
                "churn_risk_score": churn_risk
            }
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 2. CUSTOMER SEGMENTS (5 endpoints) =====

    @router.post("/segments", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_customer_segment(segment: CustomerSegmentCreate, current_user: dict = Depends(get_current_user)):
        """Create a new customer segment (e.g., VIP, churn-risk, high-value)."""
        try:
            seg_id = str(uuid.uuid4())
            doc = {
                "id": seg_id,
                "name": segment.name,
                "description": segment.description,
                "color": segment.color,
                "criteria": segment.criteria,
                "is_active": segment.is_active,
                "customer_count": 0,
                "created_at": now_iso(),
                "created_by": current_user.get("id", "system")
            }
            await db.customer_segments.insert_one(doc)
            doc.pop("_id", None)
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/segments", response_model=Dict[str, Any])
    async def list_customer_segments(is_active: Optional[bool] = None, current_user: dict = Depends(get_current_user)):
        """List all customer segments with customer counts."""
        try:
            query = {}
            if is_active is not None:
                query["is_active"] = is_active
            segments = await db.customer_segments.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
            # Count customers per segment
            for seg in segments:
                seg["customer_count"] = await db.customers.count_documents({"segment_ids": seg["id"]})
            return {"segments": segments, "total": len(segments)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/segments/{segment_id}", response_model=Dict[str, Any])
    async def get_customer_segment(segment_id: str, current_user: dict = Depends(get_current_user)):
        """Get a specific segment with its customers."""
        try:
            seg = await db.customer_segments.find_one({"id": segment_id}, {"_id": 0})
            if not seg:
                raise HTTPException(status_code=404, detail="Segment not found")
            seg["customer_count"] = await db.customers.count_documents({"segment_ids": segment_id})
            customers = await db.customers.find({"segment_ids": segment_id}, {"_id": 0, "id": 1, "name": 1, "phone": 1, "total_purchases": 1}).to_list(100)
            seg["customers"] = customers
            return seg
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/segments/{segment_id}", response_model=Dict[str, Any])
    async def update_customer_segment(segment_id: str, segment: CustomerSegmentUpdate, current_user: dict = Depends(get_current_user)):
        """Update a customer segment."""
        try:
            existing = await db.customer_segments.find_one({"id": segment_id})
            if not existing:
                raise HTTPException(status_code=404, detail="Segment not found")
            update = {k: v for k, v in segment.model_dump().items() if v is not None}
            if update:
                update["updated_at"] = now_iso()
                await db.customer_segments.update_one({"id": segment_id}, {"$set": update})
            seg = await db.customer_segments.find_one({"id": segment_id}, {"_id": 0})
            return seg
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/segments/{segment_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_customer_segment(segment_id: str, current_user: dict = Depends(get_current_user)):
        """Delete a segment and remove it from all customers."""
        try:
            result = await db.customer_segments.delete_one({"id": segment_id})
            if result.deleted_count == 0:
                raise HTTPException(status_code=404, detail="Segment not found")
            # Remove segment from all customers
            await db.customers.update_many({"segment_ids": segment_id}, {"$pull": {"segment_ids": segment_id}})
            return None
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 3. CUSTOMER TAGS (3 endpoints) =====

    @router.post("/{customer_id}/tags", response_model=Dict[str, Any])
    async def add_customer_tags(customer_id: str, req: CustomerTagRequest, current_user: dict = Depends(get_current_user)):
        """Add tags to a customer."""
        try:
            customer = await get_customer_or_404(customer_id)
            existing_tags = set(customer.get("tags", []))
            new_tags = set(req.tags)
            merged = list(existing_tags | new_tags)
            await db.customers.update_one({"id": customer_id}, {"$set": {"tags": merged, "updated_at": now_iso()}})
            await log_activity(customer_id, "tags_added", f"Added tags: {req.tags}", current_user.get("id", ""))
            return {"customer_id": customer_id, "tags": merged, "added": list(new_tags - existing_tags)}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/{customer_id}/tags/{tag}", response_model=Dict[str, Any])
    async def remove_customer_tag(customer_id: str, tag: str, current_user: dict = Depends(get_current_user)):
        """Remove a tag from a customer."""
        try:
            customer = await get_customer_or_404(customer_id)
            existing_tags = customer.get("tags", [])
            if tag not in existing_tags:
                raise HTTPException(status_code=404, detail=f"Tag '{tag}' not found on customer")
            existing_tags.remove(tag)
            await db.customers.update_one({"id": customer_id}, {"$set": {"tags": existing_tags, "updated_at": now_iso()}})
            await log_activity(customer_id, "tag_removed", f"Removed tag: {tag}", current_user.get("id", ""))
            return {"customer_id": customer_id, "tags": existing_tags, "removed": tag}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/tags/list", response_model=Dict[str, Any])
    async def list_all_customer_tags(current_user: dict = Depends(get_current_user)):
        """Get all unique tags used across customers with counts."""
        try:
            pipeline = [
                {"$match": {"tags": {"$exists": True, "$ne": []}}},
                {"$unwind": "$tags"},
                {"$group": {"_id": "$tags", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}}
            ]
            results = await db.customers.aggregate(pipeline).to_list(None)
            return {"tags": [{"name": r["_id"], "count": r["count"]} for r in results], "total": len(results)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 4. CUSTOMER INTERACTIONS & TIMELINE (3 endpoints) =====

    @router.post("/{customer_id}/interactions", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_customer_interaction(customer_id: str, interaction: CustomerInteractionCreate, current_user: dict = Depends(get_current_user)):
        """Log a customer interaction (call, email, whatsapp, note, etc.)."""
        try:
            await get_customer_or_404(customer_id)
            inter_id = str(uuid.uuid4())
            doc = {
                "id": inter_id,
                "customer_id": customer_id,
                "interaction_type": interaction.interaction_type,
                "description": interaction.description,
                "direction": interaction.direction,
                "status": interaction.status,
                "metadata": interaction.metadata,
                "created_at": now_iso(),
                "created_by": current_user.get("id", "system"),
                "created_by_name": current_user.get("name", "")
            }
            await db.customer_interactions.insert_one(doc)
            doc.pop("_id", None)
            return doc
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{customer_id}/interactions", response_model=Dict[str, Any])
    async def list_customer_interactions(
        customer_id: str,
        interaction_type: Optional[str] = None,
        page: int = Query(1, ge=1),
        limit: int = Query(50, ge=1, le=200),
        current_user: dict = Depends(get_current_user)
    ):
        """List all interactions for a customer."""
        try:
            await get_customer_or_404(customer_id)
            query = {"customer_id": customer_id}
            if interaction_type:
                query["interaction_type"] = interaction_type
            skip, limit_p1 = paginate(page, limit)
            total = await db.customer_interactions.count_documents(query)
            items = await db.customer_interactions.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {
                "items": items,
                "total": total,
                "page": page,
                "limit": limit,
                "pages": (total + limit - 1) // limit
            }
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{customer_id}/timeline", response_model=Dict[str, Any])
    async def get_customer_timeline(customer_id: str, limit: int = Query(50, ge=1, le=200), current_user: dict = Depends(get_current_user)):
        """Get unified timeline: orders + interactions + notes + debt payments."""
        try:
            await get_customer_or_404(customer_id)
            events = []

            # Ecom orders
            orders = await db.ecom_orders.find(
                {"$or": [{"customer.id": customer_id}, {"customer_id": customer_id}]},
                {"_id": 0, "id": 1, "total": 1, "status": 1, "channel": 1, "created_at": 1}
            ).sort("created_at", -1).limit(limit).to_list(None)
            for o in orders:
                events.append({
                    "type": "order",
                    "subtype": o.get("status", ""),
                    "title": f"Order {o.get('id', '')[:8]}",
                    "description": f"{o.get('channel', 'ecom')} order - {o.get('total', 0)} DZD",
                    "timestamp": o.get("created_at", ""),
                    "data": {"order_id": o.get("id"), "total": o.get("total", 0), "channel": o.get("channel", "")}
                })

            # POS sales
            sales = await db.sales.find(
                {"customer_id": customer_id},
                {"_id": 0, "id": 1, "total": 1, "created_at": 1}
            ).sort("created_at", -1).limit(limit).to_list(None)
            for s in sales:
                events.append({
                    "type": "sale",
                    "subtype": "pos",
                    "title": f"POS Sale",
                    "description": f"{s.get('total', 0)} DZD",
                    "timestamp": s.get("created_at", ""),
                    "data": {"sale_id": s.get("id"), "total": s.get("total", 0)}
                })

            # Interactions
            interactions = await db.customer_interactions.find(
                {"customer_id": customer_id},
                {"_id": 0, "id": 1, "interaction_type": 1, "description": 1, "created_at": 1, "created_by_name": 1}
            ).sort("created_at", -1).limit(limit).to_list(None)
            for i in interactions:
                events.append({
                    "type": "interaction",
                    "subtype": i.get("interaction_type", ""),
                    "title": i.get("interaction_type", "").capitalize(),
                    "description": i.get("description", ""),
                    "timestamp": i.get("created_at", ""),
                    "data": {"interaction_id": i.get("id"), "by": i.get("created_by_name", "")}
                })

            # Debt payments
            payments = await db.debt_payments.find(
                {"customer_id": customer_id},
                {"_id": 0, "id": 1, "amount": 1, "payment_method": 1, "created_at": 1}
            ).sort("created_at", -1).limit(limit).to_list(None)
            for p in payments:
                events.append({
                    "type": "payment",
                    "subtype": "debt",
                    "title": "Debt Payment",
                    "description": f"{p.get('amount', 0)} DZD via {p.get('payment_method', '')}",
                    "timestamp": p.get("created_at", ""),
                    "data": {"payment_id": p.get("id"), "amount": p.get("amount", 0)}
                })

            # Sort by timestamp desc
            events.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
            events = events[:limit]

            return {"customer_id": customer_id, "events": events, "total_events": len(events)}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 5. CUSTOMER MERGE (1 endpoint) =====

    @router.post("/merge", response_model=Dict[str, Any])
    async def merge_customers(req: CustomerMergeRequest, current_user: dict = Depends(get_current_user)):
        """Merge duplicate customers into a primary customer. Transfers orders, sales, debts, interactions."""
        try:
            primary = await get_customer_or_404(req.primary_customer_id)
            merged_count = 0
            transfer_log = []

            for dup_id in req.duplicate_customer_ids:
                if dup_id == req.primary_customer_id:
                    continue
                dup = await db.customers.find_one({"id": dup_id})
                if not dup:
                    transfer_log.append({"customer_id": dup_id, "status": "not_found"})
                    continue

                # Transfer ecom orders
                orders_result = await db.ecom_orders.update_many(
                    {"$or": [{"customer.id": dup_id}, {"customer_id": dup_id}]},
                    {"$set": {"customer.id": req.primary_customer_id}}
                )

                # Transfer POS sales
                sales_result = await db.sales.update_many(
                    {"customer_id": dup_id},
                    {"$set": {"customer_id": req.primary_customer_id}}
                )

                # Transfer debt payments
                payments_result = await db.debt_payments.update_many(
                    {"customer_id": dup_id},
                    {"$set": {"customer_id": req.primary_customer_id}}
                )

                # Transfer interactions
                interactions_result = await db.customer_interactions.update_many(
                    {"customer_id": dup_id},
                    {"$set": {"customer_id": req.primary_customer_id}}
                )

                # Transfer addresses
                await db.customer_addresses.update_many(
                    {"customer_id": dup_id},
                    {"$set": {"customer_id": req.primary_customer_id}}
                )

                # Transfer wishlist
                await db.customer_wishlists.update_many(
                    {"customer_id": dup_id},
                    {"$set": {"customer_id": req.primary_customer_id}}
                )

                # Merge tags
                dup_tags = dup.get("tags", [])
                primary_tags = set(primary.get("tags", []))
                new_tags = list(primary_tags | set(dup_tags))
                if new_tags:
                    await db.customers.update_one({"id": req.primary_customer_id}, {"$set": {"tags": new_tags}})

                # Merge segments
                dup_segments = dup.get("segment_ids", [])
                primary_segments = set(primary.get("segment_ids", []))
                new_segments = list(primary_segments | set(dup_segments))
                if new_segments:
                    await db.customers.update_one({"id": req.primary_customer_id}, {"$set": {"segment_ids": new_segments}})

                # Delete duplicate
                await db.customers.delete_one({"id": dup_id})

                transfer_log.append({
                    "customer_id": dup_id,
                    "status": "merged",
                    "orders_updated": orders_result.modified_count,
                    "sales_updated": sales_result.modified_count,
                    "payments_updated": payments_result.modified_count,
                    "interactions_updated": interactions_result.modified_count
                })
                merged_count += 1

            await log_activity(req.primary_customer_id, "customers_merged",
                f"Merged {merged_count} customers: {req.duplicate_customer_ids}",
                current_user.get("id", ""))

            return {
                "primary_customer_id": req.primary_customer_id,
                "merged_count": merged_count,
                "details": transfer_log
            }
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 6. CUSTOMER ANALYTICS (5 endpoints) =====

    @router.get("/analytics/overview", response_model=Dict[str, Any])
    async def get_customers_analytics_overview(current_user: dict = Depends(get_current_user)):
        """Customer analytics dashboard overview."""
        try:
            total_customers = await db.customers.count_documents({})

            # This month
            month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            new_this_month = await db.customers.count_documents({"created_at": {"$gte": month_start.isoformat()}})

            # Active this month (have orders)
            active_ids = await db.ecom_orders.distinct("customer.id", {"created_at": {"$gte": month_start.isoformat()}})
            active_pos = await db.sales.distinct("customer_id", {"created_at": {"$gte": month_start.isoformat()}})
            active_customers = len(set(active_ids + active_pos))

            # Debt
            debt_pipeline = [
                {"$match": {"debt_amount": {"$gt": 0}}},
                {"$group": {"_id": "$customer_id", "total_debt": {"$sum": "$debt_amount"}}}
            ]
            debt_results = await db.sales.aggregate(debt_pipeline).to_list(None)
            customers_with_debt = len(debt_results)
            total_debt = sum(d["total_debt"] for d in debt_results)

            # Average customer value
            revenue_pipeline = [
                {"$match": {"status": {"$nin": ["cancelled"]}}},
                {"$group": {"_id": "$customer.id", "total": {"$sum": "$total"}}}
            ]
            revenue_results = await db.ecom_orders.aggregate(revenue_pipeline).to_list(None)
            pos_revenue = await db.sales.aggregate([
                {"$group": {"_id": "$customer_id", "total": {"$sum": "$total"}}}
            ]).to_list(None)
            all_values = [r["total"] for r in revenue_results + pos_revenue]
            avg_value = sum(all_values) / len(all_values) if all_values else 0

            # Segment distribution
            seg_pipeline = [
                {"$match": {"segment_ids": {"$exists": True, "$ne": []}}},
                {"$unwind": "$segment_ids"},
                {"$group": {"_id": "$segment_ids", "count": {"$sum": 1}}}
            ]
            seg_dist = await db.customers.aggregate(seg_pipeline).to_list(None)
            segments_map = {}
            for s in await db.customer_segments.find({}, {"_id": 0, "id": 1, "name": 1, "color": 1}).to_list(None):
                segments_map[s["id"]] = s
            segment_distribution = [{"segment": segments_map.get(d["_id"], {}).get("name", d["_id"]), "count": d["count"], "color": segments_map.get(d["_id"], {}).get("color", "#999")} for d in seg_dist]

            # Channel distribution
            channel_pipeline = [
                {"$match": {"status": {"$nin": ["cancelled"]}}},
                {"$group": {"_id": "$channel", "count": {"$sum": 1}, "total": {"$sum": "$total"}}}
            ]
            channel_dist = await db.ecom_orders.aggregate(channel_pipeline).to_list(None)
            channel_distribution = [{"channel": d["_id"] or "unknown", "count": d["count"], "total": d["total"]} for d in channel_dist]

            # Churn risk distribution
            customers = await db.customers.find({}, {"_id": 0, "id": 1, "total_purchases": 1, "created_at": 1}).to_list(None)
            churn_counts = {"low": 0, "medium": 0, "high": 0, "critical": 0}
            for c in customers:
                orders = await db.ecom_orders.find({"customer.id": c["id"]}, {"created_at": 1}).sort("created_at", -1).limit(1).to_list(1)
                if orders and orders[0].get("created_at"):
                    last_date = orders[0]["created_at"]
                    try:
                        days = (datetime.utcnow() - datetime.fromisoformat(last_date.replace("Z", "+00:00").replace("+00:00", ""))).days
                    except:
                        days = 999
                elif c.get("total_purchases", 0) > 0:
                    days = 60
                else:
                    days = 999

                if days > 90:
                    churn_counts["critical"] += 1
                elif days > 60:
                    churn_counts["high"] += 1
                elif days > 30:
                    churn_counts["medium"] += 1
                else:
                    churn_counts["low"] += 1

            return {
                "total_customers": total_customers,
                "new_customers_this_month": new_this_month,
                "active_customers_this_month": active_customers,
                "customers_with_debt": customers_with_debt,
                "total_debt": round(total_debt, 2),
                "average_customer_value": round(avg_value, 2),
                "segment_distribution": segment_distribution,
                "channel_distribution": channel_distribution,
                "churn_risk_distribution": [
                    {"risk": k, "count": v} for k, v in churn_counts.items()
                ]
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{customer_id}/analytics", response_model=Dict[str, Any])
    async def get_single_customer_analytics(customer_id: str, current_user: dict = Depends(get_current_user)):
        """Detailed analytics for a single customer."""
        try:
            customer = await get_customer_or_404(customer_id)

            # Monthly order history (last 12 months)
            months = []
            for i in range(11, -1, -1):
                d = datetime.utcnow() - timedelta(days=i * 30)
                month_start = d.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                month_end = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
                orders = await db.ecom_orders.find({
                    "$or": [{"customer.id": customer_id}, {"customer_id": customer_id}],
                    "created_at": {"$gte": month_start.isoformat(), "$lt": month_end.isoformat()}
                }, {"total": 1}).to_list(None)
                months.append({
                    "month": month_start.strftime("%Y-%m"),
                    "order_count": len(orders),
                    "revenue": round(sum(o.get("total", 0) for o in orders), 2)
                })

            # Product preferences
            order_items_pipeline = [
                {"$match": {"$or": [{"customer.id": customer_id}, {"customer_id": customer_id}]}},
                {"$unwind": "$items"},
                {"$group": {"_id": "$items.product_id", "name": {"$first": "$items.name"}, "quantity": {"$sum": "$items.quantity"}, "total": {"$sum": "$items.total"}}},
                {"$sort": {"total": -1}},
                {"$limit": 10}
            ]
            try:
                preferences = await db.ecom_orders.aggregate(order_items_pipeline).to_list(None)
            except:
                preferences = []

            # Days between orders
            order_dates = await db.ecom_orders.find({
                "$or": [{"customer.id": customer_id}, {"customer_id": customer_id}]
            }, {"created_at": 1}).sort("created_at", 1).to_list(None)
            dates = [datetime.fromisoformat(o["created_at"].replace("Z", "+00:00").replace("+00:00", "")) for o in order_dates if o.get("created_at")]
            if len(dates) > 1:
                gaps = [(dates[i+1] - dates[i]).days for i in range(len(dates)-1)]
                avg_gap = sum(gaps) / len(gaps)
            else:
                avg_gap = None

            return {
                "customer_id": customer_id,
                "name": customer.get("name", ""),
                "monthly_history": months,
                "top_products": [{"product_id": p["_id"], "name": p.get("name", ""), "quantity": p.get("quantity", 0), "total": round(p.get("total", 0), 2)} for p in preferences],
                "avg_days_between_orders": round(avg_gap, 1) if avg_gap else None,
                "total_orders": len(order_dates)
            }
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/rfm", response_model=Dict[str, Any])
    async def get_rfm_analysis(req: CustomerRFMRequest = Depends(), current_user: dict = Depends(get_current_user)):
        """RFM analysis: Recency, Frequency, Monetary value per customer."""
        try:
            customers = await db.customers.find({}, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(req.customer_limit)
            rfm_results = []

            for cust in customers:
                cid = cust["id"]
                orders = await db.ecom_orders.find(
                    {"$or": [{"customer.id": cid}, {"customer_id": cid}]},
                    {"total": 1, "created_at": 1}
                ).sort("created_at", -1).to_list(None)

                pos_sales = await db.sales.find(
                    {"customer_id": cid},
                    {"total": 1, "created_at": 1}
                ).sort("created_at", -1).to_list(None)

                all_transactions = sorted(
                    [(o.get("created_at", ""), o.get("total", 0)) for o in orders + pos_sales],
                    key=lambda x: x[0],
                    reverse=True
                )

                if not all_transactions:
                    continue

                # Recency (days since last order)
                try:
                    last_date = datetime.fromisoformat(all_transactions[0][0].replace("Z", "+00:00").replace("+00:00", ""))
                    recency = (datetime.utcnow() - last_date).days
                except:
                    recency = 999

                # Frequency (order count)
                frequency = len(all_transactions)

                # Monetary
                monetary = sum(t[1] for t in all_transactions)

                # Scores (1-5)
                r_score = 5 if recency <= 7 else 4 if recency <= 14 else 3 if recency <= 30 else 2 if recency <= 60 else 1
                f_score = min(5, max(1, frequency // 2 + 1))
                m_score = min(5, max(1, int(monetary // 20000) + 1))

                segment = ""
                if r_score >= 4 and f_score >= 4 and m_score >= 4:
                    segment = "champions"
                elif r_score >= 3 and f_score >= 3 and m_score >= 3:
                    segment = "loyal"
                elif r_score >= 4 and f_score <= 2:
                    segment = "new"
                elif r_score <= 2 and f_score >= 3 and m_score >= 3:
                    segment = "at_risk"
                elif r_score <= 2 and f_score <= 2 and m_score >= 3:
                    segment = "hibernating"
                elif monetary == 0:
                    segment = "no_purchases"
                else:
                    segment = "others"

                rfm_results.append({
                    "customer_id": cid,
                    "name": cust.get("name", ""),
                    "phone": cust.get("phone", ""),
                    "recency_days": recency,
                    "frequency": frequency,
                    "monetary": round(monetary, 2),
                    "r_score": r_score,
                    "f_score": f_score,
                    "m_score": m_score,
                    "rfm_segment": segment
                })

            # Summary
            summary = {}
            for seg in ["champions", "loyal", "new", "at_risk", "hibernating", "no_purchases", "others"]:
                count = len([r for r in rfm_results if r["rfm_segment"] == seg])
                total_value = sum(r["monetary"] for r in rfm_results if r["rfm_segment"] == seg)
                summary[seg] = {"count": count, "total_value": round(total_value, 2)}

            return {
                "customers": rfm_results,
                "summary": summary,
                "total_analyzed": len(rfm_results)
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/churn-risk", response_model=Dict[str, Any])
    async def get_churn_risk_analysis(limit: int = Query(50, ge=1, le=200), current_user: dict = Depends(get_current_user)):
        """Identify customers at risk of churning (no recent orders)."""
        try:
            customers = await db.customers.find({}, {"_id": 0, "id": 1, "name": 1, "phone": 1, "total_purchases": 1, "created_at": 1}).sort("total_purchases", -1).limit(500).to_list(None)
            risk_list = []

            for cust in customers:
                cid = cust["id"]
                last_order = await db.ecom_orders.find(
                    {"$or": [{"customer.id": cid}, {"customer_id": cid}]},
                    {"created_at": 1, "total": 1}
                ).sort("created_at", -1).limit(1).to_list(1)

                last_pos = await db.sales.find(
                    {"customer_id": cid},
                    {"created_at": 1}
                ).sort("created_at", -1).limit(1).to_list(1)

                dates = []
                if last_order and last_order[0].get("created_at"):
                    dates.append((last_order[0]["created_at"], last_order[0].get("total", 0)))
                if last_pos and last_pos[0].get("created_at"):
                    dates.append((last_pos[0]["created_at"], 0))

                if dates:
                    dates.sort(key=lambda x: x[0], reverse=True)
                    last_date_str = dates[0][0]
                    last_total = dates[0][1]
                    try:
                        last_date = datetime.fromisoformat(last_date_str.replace("Z", "+00:00").replace("+00:00", ""))
                        days = (datetime.utcnow() - last_date).days
                    except:
                        days = 999
                else:
                    days = 999 if cust.get("total_purchases", 0) > 0 else 0
                    last_total = 0

                if days > 30 and cust.get("total_purchases", 0) > 0:
                    if days > 90:
                        risk = "critical"
                    elif days > 60:
                        risk = "high"
                    else:
                        risk = "medium"

                    risk_list.append({
                        "customer_id": cid,
                        "name": cust.get("name", ""),
                        "phone": cust.get("phone", ""),
                        "days_since_order": days,
                        "total_purchases": cust.get("total_purchases", 0),
                        "last_order_value": last_total,
                        "risk_level": risk
                    })

            risk_list.sort(key=lambda x: x["days_since_order"], reverse=True)
            return {"at_risk_customers": risk_list[:limit], "total_at_risk": len(risk_list)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/segments", response_model=Dict[str, Any])
    async def get_segment_analytics(current_user: dict = Depends(get_current_user)):
        """Analytics per segment: revenue, order count, avg value."""
        try:
            segments = await db.customer_segments.find({}, {"_id": 0}).to_list(None)
            results = []
            for seg in segments:
                customers = await db.customers.find({"segment_ids": seg["id"]}, {"_id": 0, "id": 1}).to_list(None)
                cids = [c["id"] for c in customers]
                if not cids:
                    results.append({"segment": seg, "customer_count": 0, "total_revenue": 0, "avg_order_value": 0})
                    continue

                orders = await db.ecom_orders.find(
                    {"customer.id": {"$in": cids}, "status": {"$nin": ["cancelled"]}},
                    {"total": 1}
                ).to_list(None)
                total_rev = sum(o.get("total", 0) for o in orders)
                results.append({
                    "segment": seg,
                    "customer_count": len(cids),
                    "total_revenue": round(total_rev, 2),
                    "avg_order_value": round(total_rev / len(orders), 2) if orders else 0
                })
            return {"segments": results}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 7. CUSTOMER WISHLIST (3 endpoints) =====

    @router.post("/{customer_id}/wishlist", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def add_to_wishlist(customer_id: str, item: CustomerWishlistItem, current_user: dict = Depends(get_current_user)):
        """Add a product to customer wishlist."""
        try:
            await get_customer_or_404(customer_id)
            # Check if product exists
            product = await db.products.find_one({"id": item.product_id}, {"_id": 0, "id": 1, "name": 1, "retail_price": 1, "image_url": 1})
            if not product:
                raise HTTPException(status_code=404, detail="Product not found")

            existing = await db.customer_wishlists.find_one({"customer_id": customer_id, "product_id": item.product_id})
            if existing:
                return {"status": "already_in_wishlist", "customer_id": customer_id, "product": product}

            doc = {
                "id": str(uuid.uuid4()),
                "customer_id": customer_id,
                "product_id": item.product_id,
                "product_name": product.get("name", ""),
                "product_price": product.get("retail_price", 0),
                "product_image": product.get("image_url", ""),
                "notes": item.notes,
                "created_at": now_iso()
            }
            await db.customer_wishlists.insert_one(doc)
            doc.pop("_id", None)
            return doc
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{customer_id}/wishlist", response_model=Dict[str, Any])
    async def get_customer_wishlist(customer_id: str, page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200), current_user: dict = Depends(get_current_user)):
        """Get customer wishlist."""
        try:
            await get_customer_or_404(customer_id)
            skip, _ = paginate(page, limit)
            total = await db.customer_wishlists.count_documents({"customer_id": customer_id})
            items = await db.customer_wishlists.find({"customer_id": customer_id}, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"items": items, "total": total, "page": page, "limit": limit, "pages": (total + limit - 1) // limit}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/{customer_id}/wishlist/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def remove_from_wishlist(customer_id: str, product_id: str, current_user: dict = Depends(get_current_user)):
        """Remove a product from customer wishlist."""
        try:
            await get_customer_or_404(customer_id)
            await db.customer_wishlists.delete_one({"customer_id": customer_id, "product_id": product_id})
            return None
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 8. CUSTOMER ADDRESS BOOK (5 endpoints) =====

    @router.post("/{customer_id}/addresses", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def add_customer_address(customer_id: str, addr: CustomerAddressCreate, current_user: dict = Depends(get_current_user)):
        """Add an address to customer address book."""
        try:
            await get_customer_or_404(customer_id)
            addr_id = str(uuid.uuid4())

            # If setting as default, unset others
            if addr.is_default:
                await db.customer_addresses.update_many({"customer_id": customer_id}, {"$set": {"is_default": False}})

            doc = {
                "id": addr_id,
                "customer_id": customer_id,
                "label": addr.label,
                "address": addr.address,
                "city": addr.city,
                "state": addr.state,
                "postal_code": addr.postal_code,
                "phone": addr.phone,
                "is_default": addr.is_default,
                "coordinates": addr.coordinates,
                "created_at": now_iso()
            }
            await db.customer_addresses.insert_one(doc)
            doc.pop("_id", None)
            return doc
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{customer_id}/addresses", response_model=Dict[str, Any])
    async def list_customer_addresses(customer_id: str, current_user: dict = Depends(get_current_user)):
        """List all addresses for a customer."""
        try:
            await get_customer_or_404(customer_id)
            addresses = await db.customer_addresses.find({"customer_id": customer_id}, {"_id": 0}).sort("is_default", -1).to_list(None)
            return {"addresses": addresses, "total": len(addresses)}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/{customer_id}/addresses/{address_id}", response_model=Dict[str, Any])
    async def update_customer_address(customer_id: str, address_id: str, addr: CustomerAddressUpdate, current_user: dict = Depends(get_current_user)):
        """Update a customer address."""
        try:
            await get_customer_or_404(customer_id)
            existing = await db.customer_addresses.find_one({"id": address_id, "customer_id": customer_id})
            if not existing:
                raise HTTPException(status_code=404, detail="Address not found")

            if addr.is_default:
                await db.customer_addresses.update_many({"customer_id": customer_id}, {"$set": {"is_default": False}})

            update = {k: v for k, v in addr.model_dump().items() if v is not None}
            if update:
                update["updated_at"] = now_iso()
                await db.customer_addresses.update_one({"id": address_id}, {"$set": update})
            address = await db.customer_addresses.find_one({"id": address_id}, {"_id": 0})
            return address
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/{customer_id}/addresses/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_customer_address(customer_id: str, address_id: str, current_user: dict = Depends(get_current_user)):
        """Delete a customer address."""
        try:
            await get_customer_or_404(customer_id)
            result = await db.customer_addresses.delete_one({"id": address_id, "customer_id": customer_id})
            if result.deleted_count == 0:
                raise HTTPException(status_code=404, detail="Address not found")
            return None
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/{customer_id}/addresses/{address_id}/default", response_model=Dict[str, Any])
    async def set_default_address(customer_id: str, address_id: str, current_user: dict = Depends(get_current_user)):
        """Set an address as the default."""
        try:
            await get_customer_or_404(customer_id)
            existing = await db.customer_addresses.find_one({"id": address_id, "customer_id": customer_id})
            if not existing:
                raise HTTPException(status_code=404, detail="Address not found")
            await db.customer_addresses.update_many({"customer_id": customer_id}, {"$set": {"is_default": False}})
            await db.customer_addresses.update_one({"id": address_id}, {"$set": {"is_default": True, "updated_at": now_iso()}})
            address = await db.customer_addresses.find_one({"id": address_id}, {"_id": 0})
            return address
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 9. BULK OPERATIONS (2 endpoints) =====

    @router.post("/bulk/tag", response_model=Dict[str, Any])
    async def bulk_tag_customers(req: BulkTagRequest, current_user: dict = Depends(get_current_user)):
        """Bulk add/remove/replace tags on multiple customers."""
        try:
            matched = 0
            modified = 0

            if req.operation == "replace":
                result = await db.customers.update_many(
                    {"id": {"$in": req.customer_ids}},
                    {"$set": {"tags": req.tags, "updated_at": now_iso()}}
                )
                matched = result.matched_count
                modified = result.modified_count
            elif req.operation == "add":
                result = await db.customers.update_many(
                    {"id": {"$in": req.customer_ids}},
                    {"$addToSet": {"tags": {"$each": req.tags}}, "$set": {"updated_at": now_iso()}}
                )
                matched = result.matched_count
                modified = result.modified_count
            elif req.operation == "remove":
                result = await db.customers.update_many(
                    {"id": {"$in": req.customer_ids}},
                    {"$pull": {"tags": {"$in": req.tags}}, "$set": {"updated_at": now_iso()}}
                )
                matched = result.matched_count
                modified = result.modified_count

            return {"operation": req.operation, "matched": matched, "modified": modified, "customer_ids": len(req.customer_ids), "tags": req.tags}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/bulk/segment", response_model=Dict[str, Any])
    async def bulk_segment_customers(req: BulkSegmentRequest, current_user: dict = Depends(get_current_user)):
        """Bulk add/remove segment for multiple customers."""
        try:
            # Verify segment exists
            seg = await db.customer_segments.find_one({"id": req.segment_id})
            if not seg:
                raise HTTPException(status_code=404, detail="Segment not found")

            if req.operation == "add":
                result = await db.customers.update_many(
                    {"id": {"$in": req.customer_ids}},
                    {"$addToSet": {"segment_ids": req.segment_id}, "$set": {"updated_at": now_iso()}}
                )
            else:
                result = await db.customers.update_many(
                    {"id": {"$in": req.customer_ids}},
                    {"$pull": {"segment_ids": req.segment_id}, "$set": {"updated_at": now_iso()}}
                )

            return {"operation": req.operation, "segment": seg.get("name", ""), "matched": result.matched_count, "modified": result.modified_count}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 10. ADVANCED CUSTOMER SEARCH (1 endpoint) =====

    @router.post("/search/advanced", response_model=Dict[str, Any])
    async def advanced_customer_search(search: AdvancedCustomerSearch, current_user: dict = Depends(get_current_user)):
        """Advanced customer search with filters, sorting, and pagination."""
        try:
            query = {}

            if search.query:
                query["$or"] = [
                    {"name": {"$regex": search.query, "$options": "i"}},
                    {"phone": {"$regex": search.query, "$options": "i"}},
                    {"email": {"$regex": search.query, "$options": "i"}},
                    {"code": {"$regex": search.query, "$options": "i"}}
                ]
            if search.phone:
                query["phone"] = {"$regex": search.phone, "$options": "i"}
            if search.email:
                query["email"] = {"$regex": search.email, "$options": "i"}
            if search.city:
                query["$or"] = query.get("$or", []) + [{"address": {"$regex": search.city, "$options": "i"}}, {"city": {"$regex": search.city, "$options": "i"}}]
            if search.segment_id:
                query["segment_ids"] = search.segment_id
            if search.tags:
                query["tags"] = {"$in": search.tags}
            if search.min_purchases is not None or search.max_purchases is not None:
                query["total_purchases"] = {}
                if search.min_purchases is not None:
                    query["total_purchases"]["$gte"] = search.min_purchases
                if search.max_purchases is not None:
                    query["total_purchases"]["$lte"] = search.max_purchases
            if search.has_debt is not None:
                if search.has_debt:
                    query["balance"] = {"$gt": 0}
                else:
                    query["$or"] = [{"balance": {"$lte": 0}}, {"balance": {"$exists": False}}]
            if search.date_from or search.date_to:
                query["created_at"] = {}
                if search.date_from:
                    query["created_at"]["$gte"] = search.date_from
                if search.date_to:
                    query["created_at"]["$lte"] = search.date_to

            skip, limit_p1 = paginate(search.page, search.limit)
            sort_dir = -1 if search.sort_order == "desc" else 1
            sort_field = search.sort_by if search.sort_by in ["name", "created_at", "total_purchases", "balance"] else "created_at"

            total = await db.customers.count_documents(query)
            items = await db.customers.find(query, {"_id": 0}).sort(sort_field, sort_dir).skip(skip).limit(search.limit).to_list(search.limit)

            return {
                "customers": items,
                "total": total,
                "page": search.page,
                "limit": search.limit,
                "pages": (total + search.limit - 1) // search.limit,
                "filters_applied": {k: v for k, v in search.model_dump().items() if v is not None}
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 11. DUPLICATE DETECTION (1 endpoint) =====

    @router.get("/duplicates/find", response_model=Dict[str, Any])
    async def find_duplicate_customers(threshold: int = Query(2, ge=1, le=10), current_user: dict = Depends(get_current_user)):
        """Find potential duplicate customers by phone or name similarity."""
        try:
            pipeline = [
                {"$match": {"phone": {"$exists": True, "$ne": ""}}},
                {"$group": {"_id": "$phone", "customers": {"$push": {"id": "$id", "name": "$name", "email": "$email", "created_at": "$created_at"}}, "count": {"$sum": 1}}},
                {"$match": {"count": {"$gte": threshold}}}
            ]
            phone_dups = await db.customers.aggregate(pipeline).to_list(None)

            duplicates = []
            for d in phone_dups:
                duplicates.append({
                    "match_type": "phone",
                    "match_value": d["_id"],
                    "customer_count": d["count"],
                    "customers": d["customers"]
                })

            return {"duplicates": duplicates, "total_groups": len(duplicates), "total_affected": sum(d["customer_count"] for d in duplicates)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    return router
