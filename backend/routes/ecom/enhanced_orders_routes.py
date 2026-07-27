"""
Enhanced Orders Routes - NT Commerce v16
Section 2: Orders Management Enhancement
Provides 36 new endpoints for advanced order operations
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Body, status
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
import uuid
import traceback

from routes.ecom.constants import (
    ECOM_NEW, ECOM_CONFIRMED, ECOM_CANCELLED, ECOM_PREPARING,
    ECOM_SHIPPED, ECOM_ON_THE_WAY, ECOM_DELIVERED,
    ECOM_IN_TRANSIT, ECOM_DELIVERY_EXCEPTION
)

VALID_STATUS_TRANSITIONS = {
    ECOM_NEW: [ECOM_CONFIRMED, ECOM_CANCELLED],
    ECOM_CONFIRMED: [ECOM_PREPARING, ECOM_CANCELLED],
    ECOM_PREPARING: [ECOM_SHIPPED, ECOM_CANCELLED],
    ECOM_SHIPPED: [ECOM_ON_THE_WAY, ECOM_IN_TRANSIT, ECOM_DELIVERY_EXCEPTION],
    ECOM_ON_THE_WAY: [ECOM_DELIVERED, ECOM_DELIVERY_EXCEPTION],
    ECOM_IN_TRANSIT: [ECOM_DELIVERED, ECOM_DELIVERY_EXCEPTION],
    ECOM_DELIVERY_EXCEPTION: [ECOM_ON_THE_WAY, ECOM_SHIPPED, ECOM_CANCELLED],
}

REFUNDABLE_STATUSES = [ECOM_CONFIRMED, ECOM_PREPARING, ECOM_SHIPPED, ECOM_ON_THE_WAY, ECOM_DELIVERED]
RETURNABLE_STATUSES = [ECOM_DELIVERED]
SPLITABLE_STATUSES = [ECOM_NEW, ECOM_CONFIRMED, ECOM_PREPARING]

class OrderTemplateItem(BaseModel):
    product_id: str
    quantity: int = Field(gt=0)
    unit_price: Optional[float] = None
    notes: Optional[str] = None

class OrderTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    items: List[OrderTemplateItem]
    customer_defaults: Optional[Dict[str, Any]] = None
    is_active: bool = True

class RefundItemRequest(BaseModel):
    order_item_id: str
    quantity: int = Field(gt=0)
    reason: Optional[str] = None

class RefundRequest(BaseModel):
    items: List[RefundItemRequest]
    reason: str
    refund_shipping: bool = False
    notes: Optional[str] = None

class RefundResponse(BaseModel):
    refund_id: str
    order_id: str
    items_refunded: List[Dict[str, Any]]
    subtotal_refund: float
    shipping_refund: float
    total_refund: float
    status: str
    processed_at: str
    processed_by: str

class SplitOrderRequest(BaseModel):
    item_groups: List[List[str]]
    reasons: Optional[List[str]] = None

class DeliveryScheduleRequest(BaseModel):
    scheduled_date: str
    time_window: Optional[str] = None
    notes: Optional[str] = None
    courier_id: Optional[str] = None

class DuplicateOrderRequest(BaseModel):
    customer_id: Optional[str] = None
    modifications: Optional[Dict[str, Any]] = None

class ReturnRequest(BaseModel):
    items: List[RefundItemRequest]
    reason: str
    condition: Literal["new", "opened", "damaged", "defective"] = "new"
    preferred_resolution: Literal["refund", "exchange", "store_credit"] = "refund"
    notes: Optional[str] = None

class ExchangeRequest(BaseModel):
    items: List[RefundItemRequest]
    exchange_for: List[Dict[str, Any]]
    reason: str
    notes: Optional[str] = None

class BulkStatusUpdateRequest(BaseModel):
    order_ids: List[str]
    new_status: str
    note: Optional[str] = None
    send_notification: bool = True

class BulkAssignCourierRequest(BaseModel):
    order_ids: List[str]
    courier_id: str
    notes: Optional[str] = None

class PrintLabelsRequest(BaseModel):
    order_ids: List[str]
    template: Optional[str] = "default"

class AdvancedSearchRequest(BaseModel):
    query: Optional[str] = None
    status: Optional[List[str]] = None
    channel: Optional[List[str]] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None
    customer_id: Optional[str] = None
    product_id: Optional[str] = None
    city: Optional[str] = None
    tags: Optional[List[str]] = None
    sort_by: Optional[str] = "created_at"
    sort_order: Optional[str] = "desc"
    page: int = 1
    limit: int = 50

class AutomationRule(BaseModel):
    id: str
    name: str
    trigger: str
    conditions: List[Dict[str, Any]]
    actions: List[Dict[str, Any]]
    is_active: bool
    priority: int = 0

class CustomerOrderAnalytics(BaseModel):
    customer_id: str
    total_orders: int
    total_revenue: float
    average_order_value: float
    orders_by_status: Dict[str, int]
    favorite_products: List[Dict[str, Any]]
    order_frequency_days: Optional[float]
    last_order_date: Optional[str]
    customer_tier: str

class OrderDashboardMetrics(BaseModel):
    total_orders_today: int
    total_orders_this_week: int
    total_orders_this_month: int
    revenue_today: float
    revenue_this_week: float
    revenue_this_month: float
    average_order_value: float
    pending_orders: int
    confirmed_orders: int
    preparing_orders: int
    shipped_orders: int
    delivery_exception_orders: int
    cancelled_orders_today: int
    top_products: List[Dict[str, Any]]
    top_cities: List[Dict[str, Any]]
    conversion_rate: Optional[float]


def create_enhanced_orders_routes(db, get_current_user, require_permission, cache=None, event_bus=None):
    router = APIRouter(prefix="/orders", tags=["Orders v2 - Enhanced"])

    async def log_activity(order_id: str, event_type: str, description: str,
                          user_id: str = "system", metadata: Dict = None):
        event = {
            "event_id": str(uuid.uuid4()), "order_id": order_id,
            "event_type": event_type, "description": description,
            "created_by": user_id, "created_at": datetime.utcnow().isoformat(),
            "metadata": metadata or {}
        }
        await db.order_timelines.insert_one(event)
        await db.ecom_orders.update_one({"id": order_id}, {"$push": {"activity_log": event}})
        if event_bus:
            await event_bus.publish("order.activity", {"order_id": order_id, "event": event})
        return event

    async def get_order_or_404(order_id: str):
        order = await db.ecom_orders.find_one({"id": order_id})
        if not order:
            raise HTTPException(status_code=404, detail=f"Order {order_id} not found")
        return order

    async def validate_status_transition(current_status: str, new_status: str):
        allowed = VALID_STATUS_TRANSITIONS.get(current_status, [])
        if new_status not in allowed:
            raise HTTPException(status_code=400, detail=f"Invalid status transition from '{current_status}' to '{new_status}'")

    def generate_order_code():
        return f"ORD-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    # ===== ORDER TEMPLATES =====
    @router.post("/templates", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_order_template(template: OrderTemplateCreate, current_user: dict = Depends(get_current_user)):
        try:
            template_doc = {
                "id": str(uuid.uuid4()), "name": template.name, "description": template.description,
                "items": [item.model_dump() for item in template.items],
                "customer_defaults": template.customer_defaults, "is_active": template.is_active,
                "created_by": current_user.get("id", "system"),
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(), "usage_count": 0
            }
            await db.order_templates.insert_one(template_doc)
            await log_activity(template_doc["id"], "template_created", f"Template '{template.name}' created",
                current_user.get("id", "system"), {"template_name": template.name})
            return {"success": True, "template_id": template_doc["id"], "message": f"Template '{template.name}' created", "data": template_doc}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/templates", response_model=Dict[str, Any])
    async def list_order_templates(search: Optional[str] = None, is_active: Optional[bool] = None,
                                    page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200),
                                    current_user: dict = Depends(get_current_user)):
        try:
            query = {}
            if is_active is not None: query["is_active"] = is_active
            if search:
                query["$or"] = [{"name": {"$regex": search, "$options": "i"}},
                               {"description": {"$regex": search, "$options": "i"}}]
            total = await db.order_templates.count_documents(query)
            templates = await db.order_templates.find(query).sort("usage_count", -1).skip((page - 1) * limit).limit(limit).to_list(None)
            return {"success": True, "total": total, "page": page, "pages": (total + limit - 1) // limit, "data": templates}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/templates/{template_id}", response_model=Dict[str, Any])
    async def get_order_template(template_id: str, current_user: dict = Depends(get_current_user)):
        template = await db.order_templates.find_one({"id": template_id})
        if not template: raise HTTPException(status_code=404, detail="Template not found")
        return {"success": True, "data": template}

    @router.put("/templates/{template_id}", response_model=Dict[str, Any])
    async def update_order_template(template_id: str, template_update: OrderTemplateCreate,
                                     current_user: dict = Depends(get_current_user)):
        existing = await db.order_templates.find_one({"id": template_id})
        if not existing: raise HTTPException(status_code=404, detail="Template not found")
        await db.order_templates.update_one({"id": template_id}, {"$set": {
            "name": template_update.name, "description": template_update.description,
            "items": [item.model_dump() for item in template_update.items],
            "customer_defaults": template_update.customer_defaults,
            "is_active": template_update.is_active, "updated_at": datetime.utcnow().isoformat()}})
        await log_activity(template_id, "template_updated", "Template updated", current_user.get("id", "system"))
        return {"success": True, "message": "Template updated"}

    @router.delete("/templates/{template_id}", response_model=Dict[str, Any])
    async def delete_order_template(template_id: str, current_user: dict = Depends(get_current_user)):
        result = await db.order_templates.delete_one({"id": template_id})
        if result.deleted_count == 0: raise HTTPException(status_code=404, detail="Template not found")
        return {"success": True, "message": "Template deleted"}

    @router.post("/templates/{template_id}/apply", response_model=Dict[str, Any])
    async def apply_order_template(template_id: str, overrides: Optional[Dict[str, Any]] = Body(None),
                                    current_user: dict = Depends(get_current_user)):
        try:
            template = await db.order_templates.find_one({"id": template_id})
            if not template: raise HTTPException(status_code=404, detail="Template not found")
            await db.order_templates.update_one({"id": template_id}, {"$inc": {"usage_count": 1}})
            customer = template.get("customer_defaults", {})
            if overrides and "customer" in overrides: customer.update(overrides["customer"])
            items = template.get("items", [])
            if overrides and "items" in overrides: items = overrides["items"]
            subtotal = sum(item.get("quantity", 1) * item.get("unit_price", 0) for item in items)
            shipping_fee = overrides.get("shipping_fee", 0) if overrides else 0
            order = {
                "id": str(uuid.uuid4()), "order_code": generate_order_code(), "status": ECOM_NEW,
                "customer": customer, "items": items, "channel": overrides.get("channel", "manual") if overrides else "manual",
                "subtotal": subtotal, "shipping_fee": shipping_fee, "total": subtotal + shipping_fee,
                "status_history": [{"status": ECOM_NEW, "at": datetime.utcnow().isoformat(),
                    "by": current_user.get("full_name", "System"),
                    "note": f"Created from template: {template['name']}"}],
                "activity_log": [], "notes": overrides.get("notes", "") if overrides else "",
                "tags": overrides.get("tags", []) if overrides else [],
                "created_by": current_user.get("id", "system"),
                "created_at": datetime.utcnow().isoformat(), "updated_at": datetime.utcnow().isoformat()
            }
            await db.ecom_orders.insert_one(order)
            await log_activity(order["id"], "order_created", f"Order created from template '{template['name']}'",
                current_user.get("id", "system"), {"template_id": template_id})
            if event_bus:
                await event_bus.publish("order.created", {"order_id": order["id"], "order_code": order["order_code"]})
            return {"success": True, "order_id": order["id"], "order_code": order["order_code"], "data": order}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== ACTIVITY TIMELINE =====
    @router.get("/{order_id}/timeline", response_model=Dict[str, Any])
    async def get_order_timeline(order_id: str, event_type: Optional[str] = None,
                                  page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200),
                                  current_user: dict = Depends(get_current_user)):
        try:
            order = await get_order_or_404(order_id)
            query = {"order_id": order_id}
            if event_type: query["event_type"] = event_type
            total = await db.order_timelines.count_documents(query)
            events = await db.order_timelines.find(query).sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(None)
            return {"success": True, "order_id": order_id, "order_code": order.get("order_code"),
                "current_status": order.get("status"), "total_events": total, "page": page,
                "pages": (total + limit - 1) // limit, "status_history": order.get("status_history", []), "timeline": events}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/{order_id}/timeline/notes", response_model=Dict[str, Any])
    async def add_order_note(order_id: str, note: str = Body(..., min_length=1), is_internal: bool = Body(False),
                              current_user: dict = Depends(get_current_user)):
        try:
            order = await get_order_or_404(order_id)
            event = await log_activity(order_id, "note_added", note, current_user.get("id", "system"),
                {"is_internal": is_internal, "note": note})
            await db.ecom_orders.update_one({"id": order_id},
                {"$push": {"notes_list": {"note": note, "is_internal": is_internal,
                    "created_by": current_user.get("full_name", "Unknown"), "created_at": datetime.utcnow().isoformat()}}})
            return {"success": True, "message": "Note added", "event": event}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== PARTIAL REFUNDS =====
    @router.post("/{order_id}/refund", response_model=RefundResponse)
    async def process_refund(order_id: str, refund_req: RefundRequest, current_user: dict = Depends(get_current_user)):
        try:
            order = await get_order_or_404(order_id)
            if order.get("status") not in REFUNDABLE_STATUSES:
                raise HTTPException(status_code=400, detail=f"Cannot refund order with status '{order.get('status')}'")
            existing = await db.order_refunds.find_one({"order_id": order_id, "status": {"$in": ["pending", "processing"]}})
            if existing: raise HTTPException(status_code=400, detail="Order already has pending refund")
            order_items = {item.get("id"): item for item in order.get("items", [])}
            refunded_items = []; subtotal_refund = 0.0
            for ri in refund_req.items:
                item = order_items.get(ri.order_item_id)
                if not item: raise HTTPException(status_code=400, detail=f"Item {ri.order_item_id} not found")
                if ri.quantity > item.get("quantity", 0): raise HTTPException(status_code=400, detail="Refund qty exceeds order qty")
                unit_price = item.get("price", item.get("unit_price", 0))
                item_refund = unit_price * ri.quantity
                subtotal_refund += item_refund
                refunded_items.append({"order_item_id": ri.order_item_id, "product_name": item.get("name_en") or item.get("name", "Unknown"),
                    "quantity": ri.quantity, "unit_price": unit_price, "refund_amount": item_refund, "reason": ri.reason})
            shipping_refund = order.get("shipping_fee", 0) if refund_req.refund_shipping else 0.0
            total_refund = subtotal_refund + shipping_refund
            refund_id = str(uuid.uuid4())
            refund_record = {"id": refund_id, "order_id": order_id, "order_code": order.get("order_code"),
                "items": refunded_items, "subtotal_refund": subtotal_refund, "shipping_refund": shipping_refund,
                "total_refund": total_refund, "reason": refund_req.reason, "notes": refund_req.notes, "status": "pending",
                "processed_by": current_user.get("id", "system"), "processed_by_name": current_user.get("full_name", "Unknown"),
                "processed_at": datetime.utcnow().isoformat(), "created_at": datetime.utcnow().isoformat()}
            await db.order_refunds.insert_one(refund_record)
            await log_activity(order_id, "refund_requested", f"Refund {total_refund:.2f} for {len(refunded_items)} items",
                current_user.get("id", "system"), {"refund_id": refund_id, "total_refund": total_refund})
            await db.ecom_orders.update_one({"id": order_id},
                {"$set": {"has_pending_refund": True, "refund_status": "pending", "updated_at": datetime.utcnow().isoformat()},
                 "$push": {"refunds": {"refund_id": refund_id, "amount": total_refund, "status": "pending", "at": datetime.utcnow().isoformat()}}})
            if event_bus:
                await event_bus.publish("order.refund_requested", {"order_id": order_id, "refund_id": refund_id, "amount": total_refund})
            return RefundResponse(refund_id=refund_id, order_id=order_id, items_refunded=refunded_items,
                subtotal_refund=subtotal_refund, shipping_refund=shipping_refund, total_refund=total_refund,
                status="pending", processed_at=datetime.utcnow().isoformat(), processed_by=current_user.get("full_name", "Unknown"))
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/refunds/{refund_id}/process", response_model=Dict[str, Any])
    async def process_refund_decision(refund_id: str, decision: Literal["approved", "rejected"] = Body(...),
                                       notes: Optional[str] = Body(None), current_user: dict = Depends(get_current_user)):
        try:
            refund = await db.order_refunds.find_one({"id": refund_id})
            if not refund: raise HTTPException(status_code=404, detail="Refund not found")
            if refund["status"] != "pending": raise HTTPException(status_code=400, detail=f"Refund already {refund['status']}")
            await db.order_refunds.update_one({"id": refund_id},
                {"$set": {"status": decision, "decision_notes": notes, "decided_by": current_user.get("id", "system"),
                 "decided_by_name": current_user.get("full_name", "Unknown"), "decided_at": datetime.utcnow().isoformat(),
                 "updated_at": datetime.utcnow().isoformat()}})
            if decision == "approved":
                for item in refund.get("items", []):
                    await db.inventory.update_one({"product_id": item.get("product_id")},
                        {"$inc": {"quantity": item.get("quantity", 0)}})
                await db.ecom_orders.update_one({"id": refund["order_id"]},
                    {"$set": {"refund_status": "approved", "has_pending_refund": False, "updated_at": datetime.utcnow().isoformat()}})
            await log_activity(refund["order_id"], f"refund_{decision}", f"Refund {decision}", current_user.get("id", "system"),
                {"refund_id": refund_id, "decision": decision})
            return {"success": True, "message": f"Refund {decision}", "refund_id": refund_id, "decision": decision}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{order_id}/refunds", response_model=Dict[str, Any])
    async def list_order_refunds(order_id: str, current_user: dict = Depends(get_current_user)):
        try:
            order = await get_order_or_404(order_id)
            refunds = await db.order_refunds.find({"order_id": order_id}).sort("created_at", -1).to_list(None)
            return {"success": True, "order_id": order_id, "order_code": order.get("order_code"), "total_refunds": len(refunds), "refunds": refunds}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== ORDER SPLITTING =====
    @router.post("/{order_id}/split", response_model=Dict[str, Any])
    async def split_order(order_id: str, split_req: SplitOrderRequest, current_user: dict = Depends(get_current_user)):
        try:
            order = await get_order_or_404(order_id)
            if order.get("status") not in SPLITABLE_STATUSES:
                raise HTTPException(status_code=400, detail=f"Cannot split order with status '{order.get('status')}'")
            if order.get("is_split"): raise HTTPException(status_code=400, detail="Order already split")
            items = order.get("items", [])
            item_map = {item.get("id"): item for item in items}
            all_ids = []
            for group in split_req.item_groups: all_ids.extend(group)
            if set(all_ids) != set(item_map.keys()):
                raise HTTPException(status_code=400, detail="All items must be included exactly once")
            child_orders = []
            for i, group in enumerate(split_req.item_groups):
                group_items = [item_map[gid] for gid in group]
                subtotal = sum(item.get("total", item.get("quantity", 1) * item.get("price", 0)) for item in group_items)
                shipping_split = order.get("shipping_fee", 0) / len(split_req.item_groups)
                child = {
                    "id": str(uuid.uuid4()), "order_code": f"{order.get('order_code')}-S{i+1}",
                    "parent_order_id": order_id, "status": ECOM_NEW, "customer": order.get("customer", {}),
                    "items": group_items, "channel": order.get("channel", "manual"),
                    "subtotal": subtotal, "shipping_fee": round(shipping_split, 2),
                    "total": round(subtotal + shipping_split, 2),
                    "status_history": [{"status": ECOM_NEW, "at": datetime.utcnow().isoformat(),
                        "by": current_user.get("full_name", "System"),
                        "note": f"Created from split of {order.get('order_code')} (group {i+1})"}],
                    "activity_log": [],
                    "notes": split_req.reasons[i] if split_req.reasons and i < len(split_req.reasons) else "",
                    "tags": order.get("tags", []), "split_group": i + 1,
                    "created_by": current_user.get("id", "system"),
                    "created_at": datetime.utcnow().isoformat(), "updated_at": datetime.utcnow().isoformat()
                }
                await db.ecom_orders.insert_one(child)
                child_orders.append(child)
            await db.ecom_orders.update_one({"id": order_id},
                {"$set": {"status": ECOM_PREPARING, "is_split": True, "child_order_ids": [c["id"] for c in child_orders],
                 "updated_at": datetime.utcnow().isoformat()},
                 "$push": {"status_history": {"status": ECOM_PREPARING, "at": datetime.utcnow().isoformat(),
                    "by": current_user.get("full_name", "System"), "note": f"Order split into {len(child_orders)} child orders"}}})
            await log_activity(order_id, "order_split", f"Split into {len(child_orders)} orders", current_user.get("id", "system"),
                {"child_order_ids": [c["id"] for c in child_orders]})
            if event_bus:
                await event_bus.publish("order.split", {"order_id": order_id, "child_orders": [{"id": c["id"], "order_code": c["order_code"]} for c in child_orders]})
            return {"success": True, "message": f"Order split into {len(child_orders)} orders", "child_orders": child_orders}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== DELIVERY SCHEDULING =====
    @router.post("/{order_id}/schedule-delivery", response_model=Dict[str, Any])
    async def schedule_delivery(order_id: str, schedule: DeliveryScheduleRequest, current_user: dict = Depends(get_current_user)):
        try:
            order = await get_order_or_404(order_id)
            try:
                scheduled_dt = datetime.fromisoformat(schedule.scheduled_date.replace('Z', '+00:00'))
            except ValueError: raise HTTPException(status_code=400, detail="Invalid date format")
            if scheduled_dt < datetime.utcnow(): raise HTTPException(status_code=400, detail="Scheduled date must be in future")
            schedule_record = {"id": str(uuid.uuid4()), "order_id": order_id, "order_code": order.get("order_code"),
                "scheduled_date": schedule.scheduled_date, "time_window": schedule.time_window, "notes": schedule.notes,
                "courier_id": schedule.courier_id, "status": "scheduled",
                "created_by": current_user.get("id", "system"), "created_by_name": current_user.get("full_name", "Unknown"),
                "created_at": datetime.utcnow().isoformat(), "updated_at": datetime.utcnow().isoformat()}
            await db.delivery_schedules.insert_one(schedule_record)
            update_data = {"delivery_schedule": {"schedule_id": schedule_record["id"], "date": schedule.scheduled_date,
                "time_window": schedule.time_window, "status": "scheduled"}, "updated_at": datetime.utcnow().isoformat()}
            if schedule.courier_id: update_data["courier_id"] = schedule.courier_id
            await db.ecom_orders.update_one({"id": order_id}, {"$set": update_data})
            await log_activity(order_id, "delivery_scheduled", f"Delivery scheduled for {schedule.scheduled_date}",
                current_user.get("id", "system"), {"schedule_id": schedule_record["id"]})
            return {"success": True, "message": "Delivery scheduled", "schedule": schedule_record}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{order_id}/delivery-schedule", response_model=Dict[str, Any])
    async def get_delivery_schedule(order_id: str, current_user: dict = Depends(get_current_user)):
        try:
            order = await get_order_or_404(order_id)
            schedule = await db.delivery_schedules.find_one({"order_id": order_id}, sort=[("created_at", -1)])
            if not schedule: return {"success": True, "order_id": order_id, "has_schedule": False, "message": "No schedule found"}
            return {"success": True, "order_id": order_id, "has_schedule": True, "schedule": schedule}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/delivery-schedules/{schedule_id}", response_model=Dict[str, Any])
    async def update_delivery_schedule(schedule_id: str, schedule: DeliveryScheduleRequest, current_user: dict = Depends(get_current_user)):
        try:
            existing = await db.delivery_schedules.find_one({"id": schedule_id})
            if not existing: raise HTTPException(status_code=404, detail="Schedule not found")
            await db.delivery_schedules.update_one({"id": schedule_id},
                {"$set": {"scheduled_date": schedule.scheduled_date, "time_window": schedule.time_window,
                 "notes": schedule.notes, "courier_id": schedule.courier_id, "status": "rescheduled",
                 "updated_at": datetime.utcnow().isoformat()}})
            return {"success": True, "message": "Delivery schedule updated"}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== ORDER DUPLICATION =====
    @router.post("/{order_id}/duplicate", response_model=Dict[str, Any])
    async def duplicate_order(order_id: str, dup_req: Optional[DuplicateOrderRequest] = None,
                               current_user: dict = Depends(get_current_user)):
        try:
            original = await get_order_or_404(order_id)
            new_order = dict(original)
            new_order.pop("_id", None)
            new_order.update({
                "id": str(uuid.uuid4()), "order_code": generate_order_code(), "status": ECOM_NEW,
                "is_duplicate": True, "original_order_id": order_id,
                "status_history": [{"status": ECOM_NEW, "at": datetime.utcnow().isoformat(),
                    "by": current_user.get("full_name", "System"), "note": f"Duplicated from {original.get('order_code')}"}],
                "activity_log": [],
                "notes": f"Duplicated from {original.get('order_code')}",
                "refunds": [], "has_pending_refund": False, "refund_status": None,
                "is_split": False, "child_order_ids": [],
                "created_by": current_user.get("id", "system"),
                "created_at": datetime.utcnow().isoformat(), "updated_at": datetime.utcnow().isoformat()
            })
            if dup_req:
                if dup_req.customer_id:
                    customer = await db.customers.find_one({"id": dup_req.customer_id})
                    if customer:
                        new_order["customer"] = {"id": customer["id"], "full_name": customer.get("full_name", ""),
                            "phone": customer.get("phone", ""), "address": customer.get("address", {})}
                if dup_req.modifications:
                    for k, v in dup_req.modifications.items():
                        if k in ["shipping_fee", "channel", "notes", "tags"]: new_order[k] = v
            await db.ecom_orders.insert_one(new_order)
            await log_activity(new_order["id"], "order_created", f"Duplicated from {original.get('order_code')}",
                current_user.get("id", "system"), {"original_order_id": order_id})
            if event_bus:
                await event_bus.publish("order.created", {"order_id": new_order["id"], "order_code": new_order["order_code"], "is_duplicate": True})
            return {"success": True, "order_id": new_order["id"], "order_code": new_order["order_code"], "data": new_order}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== RETURNS & EXCHANGES =====
    @router.post("/{order_id}/return", response_model=Dict[str, Any])
    async def initiate_return(order_id: str, return_req: ReturnRequest, current_user: dict = Depends(get_current_user)):
        try:
            order = await get_order_or_404(order_id)
            if order.get("status") not in RETURNABLE_STATUSES:
                raise HTTPException(status_code=400, detail="Order must be delivered to return")
            existing = await db.order_returns.find_one({"order_id": order_id, "status": {"$in": ["pending", "approved", "in_transit"]}})
            if existing: raise HTTPException(status_code=400, detail="Pending return already exists")
            order_items = {item.get("id"): item for item in order.get("items", [])}
            return_items = []
            for ri in return_req.items:
                item = order_items.get(ri.order_item_id)
                if not item: raise HTTPException(status_code=400, detail=f"Item {ri.order_item_id} not found")
                if ri.quantity > item.get("quantity", 0): raise HTTPException(status_code=400, detail="Qty exceeds order")
                return_items.append({"order_item_id": ri.order_item_id, "product_id": item.get("product_id"),
                    "product_name": item.get("name_en") or item.get("name", "Unknown"), "quantity": ri.quantity,
                    "unit_price": item.get("price", item.get("unit_price", 0)), "reason": ri.reason})
            return_record = {"id": str(uuid.uuid4()), "order_id": order_id, "order_code": order.get("order_code"),
                "type": "return", "items": return_items, "reason": return_req.reason,
                "condition": return_req.condition, "preferred_resolution": return_req.preferred_resolution,
                "notes": return_req.notes, "status": "pending",
                "customer_id": order.get("customer", {}).get("id"),
                "created_by": current_user.get("id", "system"), "created_by_name": current_user.get("full_name", "Unknown"),
                "created_at": datetime.utcnow().isoformat(), "updated_at": datetime.utcnow().isoformat()}
            await db.order_returns.insert_one(return_record)
            await db.ecom_orders.update_one({"id": order_id}, {"$set": {"return_status": "pending", "updated_at": datetime.utcnow().isoformat()}})
            await log_activity(order_id, "return_requested", return_req.reason, current_user.get("id", "system"),
                {"return_id": return_record["id"]})
            return {"success": True, "return_id": return_record["id"], "status": "pending", "data": return_record}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/{order_id}/exchange", response_model=Dict[str, Any])
    async def initiate_exchange(order_id: str, exchange_req: ExchangeRequest, current_user: dict = Depends(get_current_user)):
        try:
            order = await get_order_or_404(order_id)
            if order.get("status") not in RETURNABLE_STATUSES: raise HTTPException(status_code=400, detail="Order must be delivered")
            order_items = {item.get("id"): item for item in order.get("items", [])}
            exchange_items = []
            for ei in exchange_req.items:
                item = order_items.get(ei.order_item_id)
                if not item: raise HTTPException(status_code=400, detail="Item not found")
                exchange_items.append({"order_item_id": ei.order_item_id, "product_name": item.get("name_en") or item.get("name", "Unknown"),
                    "quantity": ei.quantity, "reason": ei.reason})
            for ni in exchange_req.exchange_for:
                product = await db.products.find_one({"id": ni.get("product_id")})
                if not product: raise HTTPException(status_code=400, detail=f"Product {ni.get('product_id')} not found")
            exchange_record = {"id": str(uuid.uuid4()), "order_id": order_id, "order_code": order.get("order_code"),
                "type": "exchange", "items": exchange_items, "exchange_for": exchange_req.exchange_for,
                "reason": exchange_req.reason, "notes": exchange_req.notes, "status": "pending",
                "customer_id": order.get("customer", {}).get("id"),
                "created_by": current_user.get("id", "system"), "created_by_name": current_user.get("full_name", "Unknown"),
                "created_at": datetime.utcnow().isoformat(), "updated_at": datetime.utcnow().isoformat()}
            await db.order_returns.insert_one(exchange_record)
            await log_activity(order_id, "exchange_requested", exchange_req.reason, current_user.get("id", "system"),
                {"exchange_id": exchange_record["id"]})
            return {"success": True, "exchange_id": exchange_record["id"], "status": "pending", "data": exchange_record}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{order_id}/returns", response_model=Dict[str, Any])
    async def list_order_returns(order_id: str, current_user: dict = Depends(get_current_user)):
        try:
            order = await get_order_or_404(order_id)
            returns = await db.order_returns.find({"order_id": order_id}).sort("created_at", -1).to_list(None)
            return {"success": True, "order_id": order_id, "total_returns": len(returns), "returns": returns}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/returns/{return_id}/{decision}", response_model=Dict[str, Any])
    async def process_return_decision(return_id: str, decision: Literal["approve", "reject", "receive", "complete"],
                                       notes: Optional[str] = Body(None), current_user: dict = Depends(get_current_user)):
        try:
            ret = await db.order_returns.find_one({"id": return_id})
            if not ret: raise HTTPException(status_code=404, detail="Return/Exchange not found")
            status_map = {"approve": "approved", "reject": "rejected", "receive": "items_received", "complete": "completed"}
            new_status = status_map.get(decision)
            if not new_status: raise HTTPException(status_code=400, detail="Invalid decision")
            await db.order_returns.update_one({"id": return_id},
                {"$set": {"status": new_status, "decision_notes": notes, "decided_by": current_user.get("id", "system"),
                 "decided_by_name": current_user.get("full_name", "Unknown"), "decided_at": datetime.utcnow().isoformat(),
                 "updated_at": datetime.utcnow().isoformat()}})
            if decision == "complete" and ret["type"] == "return":
                for item in ret.get("items", []):
                    await db.products.update_one({"id": item.get("product_id")}, {"$inc": {"stock_quantity": item.get("quantity", 0)}})
                await db.ecom_orders.update_one({"id": ret["order_id"]}, {"$set": {"return_status": "completed", "updated_at": datetime.utcnow().isoformat()}})
            await log_activity(ret["order_id"], f"return_{decision}d", f"Return {decision}d", current_user.get("id", "system"),
                {"return_id": return_id})
            return {"success": True, "message": f"Return {decision}d", "status": new_status}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== BULK OPERATIONS =====
    @router.post("/bulk/status-update", response_model=Dict[str, Any])
    async def bulk_status_update(bulk_req: BulkStatusUpdateRequest, current_user: dict = Depends(get_current_user)):
        try:
            if len(bulk_req.order_ids) > 100: raise HTTPException(status_code=400, detail="Max 100 orders")
            results = {"success": [], "failed": []}
            for oid in bulk_req.order_ids:
                try:
                    order = await db.ecom_orders.find_one({"id": oid})
                    if not order: results["failed"].append({"order_id": oid, "reason": "Not found"}); continue
                    cs = order.get("status")
                    if bulk_req.new_status not in VALID_STATUS_TRANSITIONS.get(cs, []):
                        results["failed"].append({"order_id": oid, "reason": f"Invalid transition {cs}->{bulk_req.new_status}"}); continue
                    await db.ecom_orders.update_one({"id": oid},
                        {"$set": {"status": bulk_req.new_status, "updated_at": datetime.utcnow().isoformat()},
                         "$push": {"status_history": {"status": bulk_req.new_status, "at": datetime.utcnow().isoformat(),
                            "by": current_user.get("full_name", "System"), "note": f"Bulk: {bulk_req.note or 'No note'}"}}})
                    results["success"].append({"order_id": oid, "order_code": order.get("order_code"), "new_status": bulk_req.new_status})
                except Exception as ex: results["failed"].append({"order_id": oid, "reason": str(ex)})
            if event_bus:
                await event_bus.publish("order.bulk_status_updated", {"updated_count": len(results["success"]), "failed_count": len(results["failed"])})
            return {"success": True, "message": f"{len(results['success'])} success, {len(results['failed'])} failed", "results": results}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/bulk/assign-courier", response_model=Dict[str, Any])
    async def bulk_assign_courier(bulk_req: BulkAssignCourierRequest, current_user: dict = Depends(get_current_user)):
        try:
            if len(bulk_req.order_ids) > 100: raise HTTPException(status_code=400, detail="Max 100 orders")
            courier = await db.users.find_one({"id": bulk_req.courier_id})
            if not courier: raise HTTPException(status_code=400, detail="Courier not found")
            results = {"success": [], "failed": []}
            for oid in bulk_req.order_ids:
                try:
                    order = await db.ecom_orders.find_one({"id": oid})
                    if not order: results["failed"].append({"order_id": oid, "reason": "Not found"}); continue
                    await db.ecom_orders.update_one({"id": oid},
                        {"$set": {"courier_id": bulk_req.courier_id, "courier_name": courier.get("full_name", "Unknown"), "updated_at": datetime.utcnow().isoformat()}})
                    results["success"].append({"order_id": oid, "order_code": order.get("order_code")})
                except Exception as ex: results["failed"].append({"order_id": oid, "reason": str(ex)})
            return {"success": True, "message": f"{len(results['success'])} success, {len(results['failed'])} failed",
                "courier_name": courier.get("full_name"), "results": results}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/bulk/print-labels", response_model=Dict[str, Any])
    async def bulk_print_labels(print_req: PrintLabelsRequest, current_user: dict = Depends(get_current_user)):
        try:
            if len(print_req.order_ids) > 50: raise HTTPException(status_code=400, detail="Max 50 labels")
            labels = []; failed = []
            for oid in print_req.order_ids:
                try:
                    order = await db.ecom_orders.find_one({"id": oid})
                    if not order: failed.append({"order_id": oid, "reason": "Not found"}); continue
                    customer = order.get("customer", {}); address = customer.get("address", {})
                    labels.append({"order_id": oid, "order_code": order.get("order_code"), "template": print_req.template,
                        "to": {"full_name": customer.get("full_name", ""), "phone": customer.get("phone", ""),
                            "city": address.get("city", ""), "country": address.get("country", "Algeria")},
                        "package": {"items_count": len(order.get("items", [])), "declared_value": order.get("total", 0)},
                        "generated_at": datetime.utcnow().isoformat()})
                except Exception as ex: failed.append({"order_id": oid, "reason": str(ex)})
            return {"success": True, "total": len(labels), "failed_count": len(failed), "labels": labels, "failed": failed}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== ANALYTICS =====
    @router.get("/analytics/dashboard", response_model=OrderDashboardMetrics)
    async def get_dashboard_metrics(date_range: Optional[str] = Query("today", enum=["today", "week", "month", "quarter", "year"]),
                                     current_user: dict = Depends(get_current_user)):
        try:
            now = datetime.utcnow()
            if date_range == "today": start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            elif date_range == "week": start = now - timedelta(days=7)
            elif date_range == "month": start = now - timedelta(days=30)
            elif date_range == "quarter": start = now - timedelta(days=90)
            else: start = now - timedelta(days=365)
            si = start.isoformat()
            pipeline = [
                {"$match": {"created_at": {"$gte": si}}},
                {"$group": {"_id": None, "total_orders": {"$sum": 1}, "total_revenue": {"$sum": "$total"}, "avg_order": {"$avg": "$total"},
                    "pending": {"$sum": {"$cond": [{"$eq": ["$status", ECOM_NEW]}, 1, 0]}},
                    "confirmed": {"$sum": {"$cond": [{"$eq": ["$status", ECOM_CONFIRMED]}, 1, 0]}},
                    "preparing": {"$sum": {"$cond": [{"$eq": ["$status", ECOM_PREPARING]}, 1, 0]}},
                    "shipped": {"$sum": {"$cond": [{"$eq": ["$status", ECOM_SHIPPED]}, 1, 0]}},
                    "exception": {"$sum": {"$cond": [{"$eq": ["$status", ECOM_DELIVERY_EXCEPTION]}, 1, 0]}},
                    "cancelled": {"$sum": {"$cond": [{"$eq": ["$status", ECOM_CANCELLED]}, 1, 0]}}}}]
            r = await db.ecom_orders.aggregate(pipeline).to_list(None)
            m = r[0] if r else {}
            tsi = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
            tr = await db.ecom_orders.aggregate([
                {"$match": {"created_at": {"$gte": tsi}}},
                {"$group": {"_id": None, "orders_today": {"$sum": 1}, "revenue_today": {"$sum": "$total"},
                    "cancelled_today": {"$sum": {"$cond": [{"$eq": ["$status", ECOM_CANCELLED]}, 1, 0]}}}}]).to_list(None)
            tm = tr[0] if tr else {}
            wsi = (now - timedelta(days=7)).isoformat()
            wr = await db.ecom_orders.aggregate([
                {"$match": {"created_at": {"$gte": wsi}}},
                {"$group": {"_id": None, "orders_week": {"$sum": 1}, "revenue_week": {"$sum": "$total"}}}]).to_list(None)
            wm = wr[0] if wr else {}
            msi = (now - timedelta(days=30)).isoformat()
            mr = await db.ecom_orders.aggregate([
                {"$match": {"created_at": {"$gte": msi}}},
                {"$group": {"_id": None, "orders_month": {"$sum": 1}, "revenue_month": {"$sum": "$total"}}}]).to_list(None)
            mm = mr[0] if mr else {}
            tp = await db.ecom_orders.aggregate([
                {"$match": {"created_at": {"$gte": si}}}, {"$unwind": "$items"},
                {"$group": {"_id": "$items.product_id", "name": {"$first": "$items.name_en"},
                    "total_sold": {"$sum": "$items.quantity"}, "total_revenue": {"$sum": "$items.total"}}},
                {"$sort": {"total_sold": -1}}, {"$limit": 10}]).to_list(None)
            tc = await db.ecom_orders.aggregate([
                {"$match": {"created_at": {"$gte": si}}},
                {"$group": {"_id": "$customer.address.city", "order_count": {"$sum": 1}, "revenue": {"$sum": "$total"}}},
                {"$sort": {"order_count": -1}}, {"$limit": 10}]).to_list(None)
            return OrderDashboardMetrics(
                total_orders_today=tm.get("orders_today", 0), total_orders_this_week=wm.get("orders_week", 0),
                total_orders_this_month=mm.get("orders_month", 0), revenue_today=round(tm.get("revenue_today", 0), 2),
                revenue_this_week=round(wm.get("revenue_week", 0), 2), revenue_this_month=round(mm.get("revenue_month", 0), 2),
                average_order_value=round(m.get("avg_order", 0), 2), pending_orders=m.get("pending", 0),
                confirmed_orders=m.get("confirmed", 0), preparing_orders=m.get("preparing", 0),
                shipped_orders=m.get("shipped", 0), delivery_exception_orders=m.get("exception", 0),
                cancelled_orders_today=tm.get("cancelled_today", 0),
                top_products=[{"product_id": p.get("_id"), "name": p.get("name"), "total_sold": p.get("total_sold"), "revenue": round(p.get("total_revenue", 0), 2)} for p in tp],
                top_cities=[{"city": c.get("_id"), "orders": c.get("order_count"), "revenue": round(c.get("revenue", 0), 2)} for c in tc],
                conversion_rate=None)
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/trends", response_model=Dict[str, Any])
    async def get_order_trends(period: Optional[str] = Query("daily", enum=["hourly", "daily", "weekly", "monthly"]),
                                days: int = Query(30, ge=1, le=365), current_user: dict = Depends(get_current_user)):
        try:
            now = datetime.utcnow(); s = (now - timedelta(days=days)).isoformat()
            df = {"hourly": "%Y-%m-%d %H:00", "daily": "%Y-%m-%d", "weekly": "%Y-W%U", "monthly": "%Y-%m"}[period]
            trends = await db.ecom_orders.aggregate([
                {"$match": {"created_at": {"$gte": s}}},
                {"$group": {"_id": {"$dateToString": {"format": df, "date": {"$dateFromString": {"dateString": "$created_at"}}}},
                    "orders": {"$sum": 1}, "revenue": {"$sum": "$total"}, "avg_value": {"$avg": "$total"}}},
                {"$sort": {"_id": 1}}]).to_list(None)
            sd = await db.ecom_orders.aggregate([{"$match": {"created_at": {"$gte": s}}}, {"$group": {"_id": "$status", "count": {"$sum": 1}}}]).to_list(None)
            cd = await db.ecom_orders.aggregate([{"$match": {"created_at": {"$gte": s}}}, {"$group": {"_id": "$channel", "count": {"$sum": 1}, "revenue": {"$sum": "$total"}}}]).to_list(None)
            return {"success": True, "period": period, "days": days,
                "trends": [{"date": t["_id"], "orders": t["orders"], "revenue": round(t["revenue"], 2), "avg_value": round(t["avg_value"], 2)} for t in trends],
                "status_distribution": [{"status": s["_id"], "count": s["count"]} for s in sd],
                "channel_distribution": [{"channel": c["_id"], "count": c["count"], "revenue": round(c["revenue"], 2)} for c in cd]}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/customer/{customer_id}/analytics", response_model=CustomerOrderAnalytics)
    async def get_customer_analytics(customer_id: str, current_user: dict = Depends(get_current_user)):
        try:
            orders = await db.ecom_orders.find({"customer.id": customer_id}).sort("created_at", -1).to_list(None)
            if not orders: raise HTTPException(status_code=404, detail="No orders found")
            to = len(orders); tr = sum(o.get("total", 0) for o in orders)
            aov = tr / to if to > 0 else 0
            obs = {}
            for o in orders:
                st = o.get("status", "unknown")
                obs[st] = obs.get(st, 0) + 1
            pc = {}
            for o in orders:
                for item in o.get("items", []):
                    pid = item.get("product_id", "unknown")
                    if pid not in pc:
                        pc[pid] = {"product_id": pid, "name": item.get("name_en") or item.get("name", "Unknown"), "quantity": 0, "revenue": 0}
                    pc[pid]["quantity"] += item.get("quantity", 1)
                    pc[pid]["revenue"] += item.get("total", item.get("price", 0) * item.get("quantity", 1))
            fp = sorted(pc.values(), key=lambda x: x["quantity"], reverse=True)[:10]
            od = [datetime.fromisoformat(o["created_at"].replace('Z', '+00:00')) for o in orders if o.get("created_at")]
            ofd = None
            if len(od) > 1:
                dd = [(od[i] - od[i+1]).days for i in range(len(od)-1)]
                ofd = sum(dd) / len(dd)
            tier = "platinum" if tr >= 500000 else "gold" if tr >= 200000 else "silver" if tr >= 50000 else "bronze"
            return CustomerOrderAnalytics(
                customer_id=customer_id, total_orders=to, total_revenue=round(tr, 2), average_order_value=round(aov, 2),
                orders_by_status=obs, favorite_products=[{"product_id": p["product_id"], "name": p["name"], "quantity": p["quantity"], "revenue": round(p["revenue"], 2)} for p in fp],
                order_frequency_days=round(ofd, 1) if ofd else None, last_order_date=orders[0].get("created_at") if orders else None, customer_tier=tier)
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/customer/{customer_id}/orders", response_model=Dict[str, Any])
    async def get_customer_orders(customer_id: str, status: Optional[str] = None,
                                   page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200),
                                   current_user: dict = Depends(get_current_user)):
        try:
            query = {"customer.id": customer_id}
            if status: query["status"] = status
            total = await db.ecom_orders.count_documents(query)
            orders = await db.ecom_orders.find(query).sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(None)
            return {"success": True, "customer_id": customer_id, "total": total, "page": page, "pages": (total + limit - 1) // limit, "orders": orders}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== ADVANCED SEARCH =====
    @router.post("/search/advanced", response_model=Dict[str, Any])
    async def advanced_search(search_req: AdvancedSearchRequest, current_user: dict = Depends(get_current_user)):
        try:
            query = {}
            if search_req.query:
                query["$or"] = [{"order_code": {"$regex": search_req.query, "$options": "i"}},
                    {"customer.full_name": {"$regex": search_req.query, "$options": "i"}},
                    {"customer.phone": {"$regex": search_req.query, "$options": "i"}},
                    {"notes": {"$regex": search_req.query, "$options": "i"}},
                    {"items.name_en": {"$regex": search_req.query, "$options": "i"}},
                    {"items.name_ar": {"$regex": search_req.query, "$options": "i"}}]
            if search_req.status: query["status"] = {"$in": search_req.status}
            if search_req.channel: query["channel"] = {"$in": search_req.channel}
            if search_req.date_from or search_req.date_to:
                dq = {}
                if search_req.date_from: dq["$gte"] = search_req.date_from
                if search_req.date_to: dq["$lte"] = search_req.date_to
                query["created_at"] = dq
            if search_req.min_amount is not None or search_req.max_amount is not None:
                aq = {}
                if search_req.min_amount is not None: aq["$gte"] = search_req.min_amount
                if search_req.max_amount is not None: aq["$lte"] = search_req.max_amount
                query["total"] = aq
            if search_req.customer_id: query["customer.id"] = search_req.customer_id
            if search_req.product_id: query["items.product_id"] = search_req.product_id
            if search_req.city: query["customer.address.city"] = {"$regex": search_req.city, "$options": "i"}
            if search_req.tags: query["tags"] = {"$in": search_req.tags}
            sf = search_req.sort_by; sd = 1 if search_req.sort_order == "asc" else -1
            total = await db.ecom_orders.count_documents(query)
            skip = (search_req.page - 1) * search_req.limit
            orders = await db.ecom_orders.find(query).sort(sf, sd).skip(skip).limit(search_req.limit).to_list(None)
            return {"success": True, "total": total, "page": search_req.page, "pages": (total + search_req.limit - 1) // search_req.limit,
                "filters_applied": {k: v for k, v in search_req.model_dump().items() if v is not None}, "orders": orders}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== WORKFLOW AUTOMATION =====
    @router.get("/automation/rules", response_model=Dict[str, Any])
    async def get_automation_rules(current_user: dict = Depends(get_current_user)):
        try:
            rules = await db.automation_rules.find().sort("priority", -1).to_list(None)
            return {"success": True, "total_rules": len(rules), "rules": rules}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/automation/rules", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_automation_rule(rule: AutomationRule, current_user: dict = Depends(get_current_user)):
        try:
            rule_doc = {"id": str(uuid.uuid4()), "name": rule.name, "trigger": rule.trigger,
                "conditions": rule.conditions, "actions": rule.actions, "is_active": rule.is_active,
                "priority": rule.priority, "created_by": current_user.get("id", "system"),
                "created_at": datetime.utcnow().isoformat(), "updated_at": datetime.utcnow().isoformat()}
            await db.automation_rules.insert_one(rule_doc)
            return {"success": True, "rule_id": rule_doc["id"], "message": f"Rule '{rule.name}' created", "data": rule_doc}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/automation/rules/{rule_id}", response_model=Dict[str, Any])
    async def update_automation_rule(rule_id: str, rule: AutomationRule, current_user: dict = Depends(get_current_user)):
        try:
            r = await db.automation_rules.update_one({"id": rule_id},
                {"$set": {"name": rule.name, "trigger": rule.trigger, "conditions": rule.conditions,
                 "actions": rule.actions, "is_active": rule.is_active, "priority": rule.priority,
                 "updated_at": datetime.utcnow().isoformat()}})
            if r.matched_count == 0: raise HTTPException(status_code=404, detail="Rule not found")
            return {"success": True, "message": "Rule updated"}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/automation/rules/{rule_id}", response_model=Dict[str, Any])
    async def delete_automation_rule(rule_id: str, current_user: dict = Depends(get_current_user)):
        try:
            r = await db.automation_rules.delete_one({"id": rule_id})
            if r.deleted_count == 0: raise HTTPException(status_code=404, detail="Rule not found")
            return {"success": True, "message": "Rule deleted"}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/automation/rules/{rule_id}/toggle", response_model=Dict[str, Any])
    async def toggle_automation_rule(rule_id: str, current_user: dict = Depends(get_current_user)):
        try:
            rule = await db.automation_rules.find_one({"id": rule_id})
            if not rule: raise HTTPException(status_code=404, detail="Rule not found")
            ns = not rule.get("is_active", True)
            await db.automation_rules.update_one({"id": rule_id}, {"$set": {"is_active": ns, "updated_at": datetime.utcnow().isoformat()}})
            return {"success": True, "is_active": ns, "message": f"Rule {'enabled' if ns else 'disabled'}"}
        except HTTPException: raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== ORDER EXPORT =====
    @router.post("/export", response_model=Dict[str, Any])
    async def export_orders(filters: Optional[Dict[str, Any]] = Body(None), format: Literal["json", "csv"] = Body("json"),
                            current_user: dict = Depends(get_current_user)):
        try:
            query = filters or {}
            orders = await db.ecom_orders.find(query).sort("created_at", -1).to_list(None)
            if format == "csv":
                import csv, io
                out = io.StringIO(); w = csv.writer(out)
                w.writerow(["order_code", "status", "customer_name", "customer_phone", "items_count", "subtotal", "shipping", "total", "channel", "created_at"])
                for o in orders:
                    w.writerow([o.get("order_code", ""), o.get("status", ""), o.get("customer", {}).get("full_name", ""),
                        o.get("customer", {}).get("phone", ""), len(o.get("items", [])), str(o.get("subtotal", 0)),
                        str(o.get("shipping_fee", 0)), str(o.get("total", 0)), o.get("channel", ""), o.get("created_at", "")])
                return {"success": True, "format": "csv", "total_records": len(orders), "data": out.getvalue()}
            return {"success": True, "format": "json", "total_records": len(orders),
                "data": [{k: v for k, v in o.items() if k != "_id"} for o in orders]}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== COURIER STATS =====
    @router.get("/stats/by-courier", response_model=Dict[str, Any])
    async def get_courier_stats(courier_id: Optional[str] = None, days: int = Query(30, ge=1, le=365),
                                 current_user: dict = Depends(get_current_user)):
        try:
            s = (datetime.utcnow() - timedelta(days=days)).isoformat()
            ms = {"created_at": {"$gte": s}}
            if courier_id: ms["courier_id"] = courier_id
            stats = await db.ecom_orders.aggregate([
                {"$match": ms},
                {"$group": {"_id": "$courier_id", "courier_name": {"$first": "$courier_name"}, "total_assigned": {"$sum": 1},
                    "delivered": {"$sum": {"$cond": [{"$eq": ["$status", ECOM_DELIVERED]}, 1, 0]}},
                    "in_transit": {"$sum": {"$cond": [{"$in": ["$status", [ECOM_SHIPPED, ECOM_ON_THE_WAY]]}, 1, 0]}},
                    "exceptions": {"$sum": {"$cond": [{"$eq": ["$status", ECOM_DELIVERY_EXCEPTION]}, 1, 0]}}}},
                {"$sort": {"total_assigned": -1}}]).to_list(None)
            return {"success": True, "days": days, "total_couriers": len(stats),
                "couriers": [{"courier_id": s.get("_id"), "courier_name": s.get("courier_name", "Unassigned"),
                    "total_assigned": s.get("total_assigned", 0), "delivered": s.get("delivered", 0),
                    "in_transit": s.get("in_transit", 0), "exceptions": s.get("exceptions", 0),
                    "delivery_rate": round(s.get("delivered", 0) / s.get("total_assigned", 1) * 100, 1)} for s in stats]}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== ABANDONED ORDER RECOVERY =====
    @router.get("/recovery/abandoned", response_model=Dict[str, Any])
    async def get_abandoned_orders(hours: int = Query(24, ge=1, le=168), page: int = Query(1, ge=1),
                                    limit: int = Query(50, ge=1, le=200), current_user: dict = Depends(get_current_user)):
        try:
            c = (datetime.utcnow() - timedelta(hours=hours)).isoformat()
            q = {"status": ECOM_NEW, "created_at": {"$lte": c}, "is_split": {"$ne": True}, "is_duplicate": {"$ne": True}}
            total = await db.ecom_orders.count_documents(q)
            orders = await db.ecom_orders.find(q).sort("created_at", 1).skip((page - 1) * limit).limit(limit).to_list(None)
            pr = sum(o.get("total", 0) for o in orders)
            return {"success": True, "hours_threshold": hours, "total_abandoned": total, "showing": len(orders),
                "potential_revenue": round(pr, 2), "page": page, "pages": (total + limit - 1) // limit, "orders": orders}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    return router
