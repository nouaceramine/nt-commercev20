"""
Enhanced Shipping Routes - NT Commerce v16
Section 4: Shipping & Delivery Enhancement
Provides 30 endpoints for advanced shipping/delivery operations (Algeria-first)
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Body, status
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
import uuid
import traceback


# ============================================================================
# ALGERIA WILAYAS - Delivery Fee Reference
# ============================================================================

ALGERIA_WILAYAS = {
    "01": {"name_ar": "أدرار", "name_en": "Adrar", "desk_fee": 600, "home_fee": 800},
    "02": {"name_ar": "الشلف", "name_en": "Chlef", "desk_fee": 400, "home_fee": 600},
    "03": {"name_ar": "الأغواط", "name_en": "Laghouat", "desk_fee": 500, "home_fee": 700},
    "04": {"name_ar": "أم البواقي", "name_en": "Oum El Bouaghi", "desk_fee": 450, "home_fee": 650},
    "05": {"name_ar": "باتنة", "name_en": "Batna", "desk_fee": 400, "home_fee": 600},
    "06": {"name_ar": "بجاية", "name_en": "Béjaïa", "desk_fee": 400, "home_fee": 600},
    "07": {"name_ar": "بسكرة", "name_en": "Biskra", "desk_fee": 450, "home_fee": 650},
    "08": {"name_ar": "بشار", "name_en": "Béchar", "desk_fee": 600, "home_fee": 800},
    "09": {"name_ar": "البليدة", "name_en": "Blida", "desk_fee": 300, "home_fee": 450},
    "10": {"name_ar": "البويرة", "name_en": "Bouira", "desk_fee": 350, "home_fee": 500},
    "11": {"name_ar": "تمنراست", "name_en": "Tamanrasset", "desk_fee": 800, "home_fee": 1000},
    "12": {"name_ar": "تبسة", "name_en": "Tébessa", "desk_fee": 500, "home_fee": 700},
    "13": {"name_ar": "تلمسان", "name_en": "Tlemcen", "desk_fee": 500, "home_fee": 700},
    "14": {"name_ar": "تيارت", "name_en": "Tiaret", "desk_fee": 450, "home_fee": 650},
    "15": {"name_ar": "تيزي وزو", "name_en": "Tizi Ouzou", "desk_fee": 350, "home_fee": 500},
    "16": {"name_ar": "الجزائر", "name_en": "Algiers", "desk_fee": 250, "home_fee": 400},
    "17": {"name_ar": "الجلفة", "name_en": "Djelfa", "desk_fee": 450, "home_fee": 650},
    "18": {"name_ar": "جيجل", "name_en": "Jijel", "desk_fee": 400, "home_fee": 600},
    "19": {"name_ar": "سطيف", "name_en": "Sétif", "desk_fee": 350, "home_fee": 500},
    "20": {"name_ar": "سعيدة", "name_en": "Saïda", "desk_fee": 500, "home_fee": 700},
    "21": {"name_ar": "سكيكدة", "name_en": "Skikda", "desk_fee": 400, "home_fee": 600},
    "22": {"name_ar": "سيدي بلعباس", "name_en": "Sidi Bel Abbès", "desk_fee": 500, "home_fee": 700},
    "23": {"name_ar": "عنابة", "name_en": "Annaba", "desk_fee": 400, "home_fee": 600},
    "24": {"name_ar": "قالمة", "name_en": "Guelma", "desk_fee": 450, "home_fee": 650},
    "25": {"name_ar": "قسنطينة", "name_en": "Constantine", "desk_fee": 350, "home_fee": 500},
    "26": {"name_ar": "المدية", "name_en": "Médéa", "desk_fee": 350, "home_fee": 500},
    "27": {"name_ar": "مستغانم", "name_en": "Mostaganem", "desk_fee": 450, "home_fee": 650},
    "28": {"name_ar": "المسيلة", "name_en": "M'sila", "desk_fee": 400, "home_fee": 600},
    "29": {"name_ar": "معسكر", "name_en": "Mascara", "desk_fee": 500, "home_fee": 700},
    "30": {"name_ar": "ورقلة", "name_en": "Ouargla", "desk_fee": 600, "home_fee": 800},
    "31": {"name_ar": "وهران", "name_en": "Oran", "desk_fee": 500, "home_fee": 700},
    "32": {"name_ar": "البيض", "name_en": "El Bayadh", "desk_fee": 600, "home_fee": 800},
    "33": {"name_ar": "إليزي", "name_en": "Illizi", "desk_fee": 800, "home_fee": 1000},
    "34": {"name_ar": "برج بوعريريج", "name_en": "Bordj Bou Arréridj", "desk_fee": 400, "home_fee": 600},
    "35": {"name_ar": "بومرداس", "name_en": "Boumerdès", "desk_fee": 300, "home_fee": 450},
    "36": {"name_ar": "الطارف", "name_en": "El Tarf", "desk_fee": 400, "home_fee": 600},
    "37": {"name_ar": "تندوف", "name_en": "Tindouf", "desk_fee": 900, "home_fee": 1100},
    "38": {"name_ar": "تيسمسيلت", "name_en": "Tissemsilt", "desk_fee": 450, "home_fee": 650},
    "39": {"name_ar": "الوادي", "name_en": "El Oued", "desk_fee": 550, "home_fee": 750},
    "40": {"name_ar": "خنشلة", "name_en": "Khenchela", "desk_fee": 450, "home_fee": 650},
    "41": {"name_ar": "سوق أهراس", "name_en": "Souk Ahras", "desk_fee": 450, "home_fee": 650},
    "42": {"name_ar": "تيبازة", "name_en": "Tipaza", "desk_fee": 300, "home_fee": 450},
    "43": {"name_ar": "ميلة", "name_en": "Mila", "desk_fee": 400, "home_fee": 600},
    "44": {"name_ar": "عين الدفلى", "name_en": "Aïn Defla", "desk_fee": 400, "home_fee": 600},
    "45": {"name_ar": "النعامة", "name_en": "Naâma", "desk_fee": 600, "home_fee": 800},
    "46": {"name_ar": "عين تموشنت", "name_en": "Aïn Témouchent", "desk_fee": 500, "home_fee": 700},
    "47": {"name_ar": "غرداية", "name_en": "Ghardaïa", "desk_fee": 600, "home_fee": 800},
    "48": {"name_ar": "غليزان", "name_en": "Relizane", "desk_fee": 450, "home_fee": 650},
    "49": {"name_ar": "المغير", "name_en": "El Mghair", "desk_fee": 600, "home_fee": 800},
    "50": {"name_ar": "المنيعة", "name_en": "El Menia", "desk_fee": 700, "home_fee": 900},
    "51": {"name_ar": "أولاد جلال", "name_en": "Ouled Djellal", "desk_fee": 550, "home_fee": 750},
    "52": {"name_ar": "بسكرة", "name_en": "Biskra", "desk_fee": 450, "home_fee": 650},
    "53": {"name_ar": "تقرت", "name_en": "Touggourt", "desk_fee": 600, "home_fee": 800},
    "54": {"name_ar": "جانت", "name_en": "Djanet", "desk_fee": 900, "home_fee": 1100},
    "55": {"name_ar": "إن صالح", "name_en": "In Salah", "desk_fee": 800, "home_fee": 1000},
    "56": {"name_ar": "إن قزام", "name_en": "In Guezzam", "desk_fee": 900, "home_fee": 1100},
    "57": {"name_ar": "تيميمون", "name_en": "Timimoun", "desk_fee": 700, "home_fee": 900},
    "58": {"name_ar": "برج باجي مختار", "name_en": "Bordj Badji Mokhtar", "desk_fee": 900, "home_fee": 1100},
}

SHIPPING_PROVIDERS = {
    "yalidine": {"label_ar": "يالدين", "label_en": "Yalidine", "has_api": True},
    "zr": {"label_ar": "ZR Express", "label_en": "ZR", "has_api": False},
    "maystro": {"label_ar": "Maystro", "label_en": "Maystro", "has_api": False},
    "noest": {"label_ar": "NOEST", "label_en": "NOEST", "has_api": False},
    "manual": {"label_ar": "توصيل ذاتي", "label_en": "Self Delivery", "has_api": False},
}

SHIPPING_STATUSES = ["created", "picked_up", "in_transit", "out_for_delivery", "delivered", "failed", "returned", "cancelled"]


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class CourierCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    phone: str = Field(min_length=1, max_length=20)
    email: Optional[str] = None
    vehicle_type: Optional[str] = "car"
    vehicle_plate: Optional[str] = None
    wilaya_codes: List[str] = Field(default_factory=list)
    is_active: bool = True
    notes: Optional[str] = None

class CourierUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    vehicle_type: Optional[str] = None
    vehicle_plate: Optional[str] = None
    wilaya_codes: Optional[List[str]] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None

class CourierAssignment(BaseModel):
    courier_id: str
    order_ids: List[str] = Field(min_length=1)
    delivery_date: Optional[str] = None
    notes: Optional[str] = None

class DeliveryRouteCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    courier_id: str
    order_ids: List[str] = Field(default_factory=list)
    scheduled_date: str
    wilaya_codes: List[str] = Field(default_factory=list)
    notes: Optional[str] = None

class DeliveryRouteUpdate(BaseModel):
    name: Optional[str] = None
    courier_id: Optional[str] = None
    scheduled_date: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None

class TrackingStatusUpdate(BaseModel):
    status: Literal["created", "picked_up", "in_transit", "out_for_delivery", "delivered", "failed", "returned", "cancelled"]
    location: Optional[str] = None
    notes: Optional[str] = None
    notify_customer: bool = True

class BulkLabelCreate(BaseModel):
    order_ids: List[str] = Field(min_length=1)
    provider: str = "yalidine"
    delivery_type: Optional[str] = "desk"

class ShippingSettingsUpdate(BaseModel):
    default_provider: Optional[str] = "yalidine"
    auto_create_label: Optional[bool] = False
    auto_status_shipped: Optional[bool] = True
    default_delivery_type: Optional[str] = "desk"
    free_shipping_threshold: Optional[float] = None
    cash_on_delivery_enabled: Optional[bool] = True
    provider_credentials: Optional[Dict[str, Any]] = None

class PickupRequestCreate(BaseModel):
    provider: str = "yalidine"
    pickup_date: str
    pickup_address: str
    wilaya_code: str
    estimated_parcels: int = 1
    notes: Optional[str] = None

class DeliveryZoneCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    wilaya_codes: List[str] = Field(min_length=1)
    delivery_days: List[str] = Field(default_factory=list)
    cut_off_time: Optional[str] = "16:00"
    notes: Optional[str] = None

class CODReconciliationRequest(BaseModel):
    provider: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None


# ============================================================================
# FACTORY FUNCTION
# ============================================================================

def create_enhanced_shipping_routes(db, get_current_user, require_permission, cache=None, event_bus=None):
    router = APIRouter(prefix="/shipping", tags=["Shipping v2 - Delivery"])

    async def log_activity(action: str, details: str, user_id: str = "system", metadata: Dict = None):
        entry = {
            "id": str(uuid.uuid4()),
            "action": action,
            "details": details,
            "user_id": user_id,
            "created_at": datetime.utcnow().isoformat(),
            "metadata": metadata or {}
        }
        await db.shipping_activity_log.insert_one(entry)
        if event_bus:
            await event_bus.publish("shipping.activity", {"action": action, "details": details})
        return entry

    async def get_order_or_404(order_id: str):
        order = await db.ecom_orders.find_one({"id": order_id}, {"_id": 0})
        if not order:
            raise HTTPException(status_code=404, detail=f"Order {order_id} not found")
        return order

    def now_iso():
        return datetime.utcnow().isoformat()

    def paginate(page: int, limit: int):
        return (page - 1) * limit, limit + 1

    # ===== 1. COURIER MANAGEMENT (5 endpoints) =====

    @router.post("/couriers", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_courier(courier: CourierCreate, current_user: dict = Depends(get_current_user)):
        """Register a new delivery courier/agent."""
        try:
            c_id = str(uuid.uuid4())
            doc = {
                "id": c_id, "name": courier.name, "phone": courier.phone,
                "email": courier.email or "", "vehicle_type": courier.vehicle_type,
                "vehicle_plate": courier.vehicle_plate or "",
                "wilaya_codes": courier.wilaya_codes,
                "is_active": courier.is_active, "notes": courier.notes or "",
                "total_deliveries": 0, "success_rate": 100.0,
                "created_at": now_iso(), "created_by": current_user.get("id", "")
            }
            await db.couriers.insert_one(doc)
            doc.pop("_id", None)
            await log_activity("courier_created", f"Courier {courier.name} created", current_user.get("id", ""))
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/couriers", response_model=Dict[str, Any])
    async def list_couriers(
        is_active: Optional[bool] = None,
        wilaya_code: Optional[str] = None,
        page: int = Query(1, ge=1),
        limit: int = Query(50, ge=1, le=200),
        current_user: dict = Depends(get_current_user)
    ):
        """List delivery couriers with filters."""
        try:
            query = {}
            if is_active is not None:
                query["is_active"] = is_active
            if wilaya_code:
                query["wilaya_codes"] = wilaya_code
            skip, _ = paginate(page, limit)
            total = await db.couriers.count_documents(query)
            items = await db.couriers.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"couriers": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/couriers/{courier_id}", response_model=Dict[str, Any])
    async def get_courier(courier_id: str, current_user: dict = Depends(get_current_user)):
        """Get courier details with recent deliveries."""
        try:
            courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0})
            if not courier:
                raise HTTPException(status_code=404, detail="Courier not found")
            recent_deliveries = await db.ecom_shipping_labels.find(
                {"courier_id": courier_id}, {"_id": 0}
            ).sort("created_at", -1).limit(20).to_list(None)
            courier["recent_deliveries"] = recent_deliveries
            return courier
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/couriers/{courier_id}", response_model=Dict[str, Any])
    async def update_courier(courier_id: str, courier: CourierUpdate, current_user: dict = Depends(get_current_user)):
        """Update courier info."""
        try:
            existing = await db.couriers.find_one({"id": courier_id})
            if not existing:
                raise HTTPException(status_code=404, detail="Courier not found")
            update = {k: v for k, v in courier.model_dump().items() if v is not None}
            if update:
                update["updated_at"] = now_iso()
                await db.couriers.update_one({"id": courier_id}, {"$set": update})
            doc = await db.couriers.find_one({"id": courier_id}, {"_id": 0})
            return doc
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/couriers/{courier_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_courier(courier_id: str, current_user: dict = Depends(get_current_user)):
        """Deactivate a courier."""
        try:
            await db.couriers.update_one({"id": courier_id}, {"$set": {"is_active": False, "updated_at": now_iso()}})
            return None
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 2. COURIER ASSIGNMENT & DELIVERY ROUTES (4 endpoints) =====

    @router.post("/couriers/assign", response_model=Dict[str, Any])
    async def assign_courier_to_orders(req: CourierAssignment, current_user: dict = Depends(get_current_user)):
        """Assign a courier to multiple orders."""
        try:
            courier = await db.couriers.find_one({"id": req.courier_id})
            if not courier:
                raise HTTPException(status_code=404, detail="Courier not found")

            assigned = []
            for order_id in req.order_ids:
                order = await db.ecom_orders.find_one({"id": order_id})
                if order:
                    await db.ecom_orders.update_one(
                        {"id": order_id},
                        {"$set": {
                            "courier_id": req.courier_id,
                            "courier_name": courier.get("name", ""),
                            "assigned_at": now_iso(),
                            "delivery_date": req.delivery_date,
                            "updated_at": now_iso()
                        }}
                    )
                    # Update shipping label if exists
                    await db.ecom_shipping_labels.update_one(
                        {"order_id": order_id},
                        {"$set": {"courier_id": req.courier_id, "courier_name": courier.get("name", ""), "updated_at": now_iso()}}
                    )
                    assigned.append(order_id)

            await log_activity("courier_assigned", f"Courier {courier['name']} assigned to {len(assigned)} orders", current_user.get("id", ""))
            return {"courier_id": req.courier_id, "assigned_count": len(assigned), "order_ids": assigned}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/couriers/{courier_id}/orders", response_model=Dict[str, Any])
    async def get_courier_orders(courier_id: str, status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
        """Get all orders assigned to a courier."""
        try:
            query = {"courier_id": courier_id}
            if status:
                query["status"] = status
            orders = await db.ecom_orders.find(query, {"_id": 0}).sort("assigned_at", -1).to_list(100)
            return {"courier_id": courier_id, "orders": orders, "total": len(orders)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/routes", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_delivery_route(route: DeliveryRouteCreate, current_user: dict = Depends(get_current_user)):
        """Create a delivery route (tournee) for a courier."""
        try:
            courier = await db.couriers.find_one({"id": route.courier_id})
            if not courier:
                raise HTTPException(status_code=404, detail="Courier not found")

            route_id = str(uuid.uuid4())
            doc = {
                "id": route_id, "name": route.name,
                "courier_id": route.courier_id, "courier_name": courier.get("name", ""),
                "order_ids": route.order_ids,
                "scheduled_date": route.scheduled_date,
                "wilaya_codes": route.wilaya_codes,
                "notes": route.notes or "",
                "status": "planned",
                "completed_count": 0, "failed_count": 0,
                "created_at": now_iso(), "created_by": current_user.get("id", "")
            }
            await db.delivery_routes.insert_one(doc)

            # Link orders to route
            for oid in route.order_ids:
                await db.ecom_orders.update_one(
                    {"id": oid},
                    {"$set": {"delivery_route_id": route_id, "courier_id": route.courier_id}}
                )

            doc.pop("_id", None)
            return doc
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/routes", response_model=Dict[str, Any])
    async def list_delivery_routes(
        courier_id: Optional[str] = None,
        status: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        current_user: dict = Depends(get_current_user)
    ):
        """List delivery routes with filters."""
        try:
            query = {}
            if courier_id:
                query["courier_id"] = courier_id
            if status:
                query["status"] = status
            if date_from or date_to:
                query["scheduled_date"] = {}
                if date_from:
                    query["scheduled_date"]["$gte"] = date_from
                if date_to:
                    query["scheduled_date"]["$lte"] = date_to
            routes = await db.delivery_routes.find(query, {"_id": 0}).sort("scheduled_date", -1).to_list(100)
            return {"routes": routes, "total": len(routes)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 3. TRACKING MANAGEMENT (3 endpoints) =====

    @router.post("/labels/{label_id}/tracking", response_model=Dict[str, Any])
    async def update_tracking_status(label_id: str, update: TrackingStatusUpdate, current_user: dict = Depends(get_current_user)):
        """Update tracking status for a shipping label. Logs history."""
        try:
            label = await db.ecom_shipping_labels.find_one({"id": label_id})
            if not label:
                raise HTTPException(status_code=404, detail="Shipping label not found")

            now = now_iso()
            history_entry = {
                "status": update.status,
                "location": update.location,
                "notes": update.notes,
                "updated_at": now,
                "updated_by": current_user.get("id", "")
            }

            await db.ecom_shipping_labels.update_one(
                {"id": label_id},
                {"$set": {
                    "status": update.status,
                    "current_location": update.location,
                    "updated_at": now
                }, "$push": {"tracking_history": history_entry}}
            )

            # Sync order status if delivered
            order_id = label.get("order_id")
            if order_id and update.status == "delivered":
                await db.ecom_orders.update_one(
                    {"id": order_id},
                    {"$set": {"status": "delivered", "delivered_at": now, "updated_at": now}}
                )
                # Update courier stats
                courier_id = label.get("courier_id")
                if courier_id:
                    await db.couriers.update_one(
                        {"id": courier_id},
                        {"$inc": {"total_deliveries": 1}}
                    )

            await log_activity("tracking_updated", f"Label {label_id} -> {update.status}", current_user.get("id", ""))
            return {"label_id": label_id, "status": update.status, "history_entry": history_entry}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/labels/{label_id}/tracking", response_model=Dict[str, Any])
    async def get_tracking_history(label_id: str, current_user: dict = Depends(get_current_user)):
        """Get full tracking history for a label."""
        try:
            label = await db.ecom_shipping_labels.find_one({"id": label_id}, {"_id": 0})
            if not label:
                raise HTTPException(status_code=404, detail="Label not found")
            return {
                "label_id": label_id,
                "tracking_number": label.get("tracking_number", ""),
                "provider": label.get("provider", ""),
                "current_status": label.get("status", ""),
                "history": label.get("tracking_history", [])
            }
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/tracking/{tracking_number}", response_model=Dict[str, Any])
    async def track_by_number(tracking_number: str, current_user: dict = Depends(get_current_user)):
        """Track shipment by tracking number across all providers."""
        try:
            label = await db.ecom_shipping_labels.find_one({"tracking_number": tracking_number}, {"_id": 0})
            if not label:
                raise HTTPException(status_code=404, detail="Tracking number not found")
            return {
                "tracking_number": tracking_number,
                "provider": label.get("provider", ""),
                "status": label.get("status", ""),
                "order_id": label.get("order_id", ""),
                "customer_name": label.get("customer_name", ""),
                "customer_phone": label.get("customer_phone", ""),
                "city": label.get("city", ""),
                "wilaya": label.get("wilaya", ""),
                "current_location": label.get("current_location", ""),
                "history": label.get("tracking_history", [])
            }
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 4. WILAYA PRICING (2 endpoints) =====

    @router.get("/wilayas", response_model=Dict[str, Any])
    async def list_wilaya_pricing(current_user: dict = Depends(get_current_user)):
        """List all 58 Algerian wilayas with delivery fees."""
        try:
            results = []
            for code, info in ALGERIA_WILAYAS.items():
                results.append({"code": code, **info})
            return {"wilayas": results, "total": len(results)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/wilayas/{wilaya_code}/fee", response_model=Dict[str, Any])
    async def calculate_shipping_fee(wilaya_code: str, delivery_type: str = Query("desk", enum=["desk", "home"]), weight_kg: float = Query(1.0, ge=0.1), current_user: dict = Depends(get_current_user)):
        """Calculate shipping fee for a wilaya with weight."""
        try:
            if wilaya_code not in ALGERIA_WILAYAS:
                raise HTTPException(status_code=404, detail="Wilaya code not found")
            wilaya = ALGERIA_WILAYAS[wilaya_code]
            base_fee = wilaya["home_fee"] if delivery_type == "home" else wilaya["desk_fee"]
            # Weight surcharge: +20% per kg over 1kg
            if weight_kg > 1:
                weight_surcharge = base_fee * 0.20 * (weight_kg - 1)
            else:
                weight_surcharge = 0
            total = base_fee + weight_surcharge
            return {
                "wilaya_code": wilaya_code,
                "wilaya_name_ar": wilaya["name_ar"],
                "wilaya_name_en": wilaya["name_en"],
                "delivery_type": delivery_type,
                "weight_kg": weight_kg,
                "base_fee": base_fee,
                "weight_surcharge": round(weight_surcharge, 2),
                "total_fee": round(total, 2)
            }
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 5. BULK LABEL OPERATIONS (2 endpoints) =====

    @router.post("/labels/bulk", response_model=Dict[str, Any])
    async def bulk_create_labels(req: BulkLabelCreate, current_user: dict = Depends(get_current_user)):
        """Create shipping labels for multiple orders at once."""
        try:
            created = []
            failed = []
            for order_id in req.order_ids:
                order = await db.ecom_orders.find_one({"id": order_id})
                if not order:
                    failed.append({"order_id": order_id, "reason": "Order not found"})
                    continue

                label_id = str(uuid.uuid4())
                tracking = f"{req.provider.upper()}-{uuid.uuid4().hex[:10].upper()}"
                now = now_iso()
                doc = {
                    "id": label_id,
                    "order_id": order_id,
                    "order_code": order.get("order_code", ""),
                    "provider": req.provider,
                    "delivery_type": req.delivery_type,
                    "tracking_number": tracking,
                    "customer_name": order.get("customer", {}).get("name", ""),
                    "customer_phone": order.get("customer", {}).get("phone", ""),
                    "wilaya": order.get("customer", {}).get("wilaya", ""),
                    "city": order.get("customer", {}).get("city", ""),
                    "total": order.get("total", 0),
                    "status": "created",
                    "tracking_history": [{"status": "created", "notes": "Label created (bulk)", "updated_at": now, "updated_by": current_user.get("id", "")}],
                    "created_at": now,
                    "created_by": current_user.get("id", "")
                }
                await db.ecom_shipping_labels.insert_one(doc)

                # Update order
                await db.ecom_orders.update_one(
                    {"id": order_id},
                    {"$set": {
                        "shipping_label_id": label_id,
                        "tracking_number": tracking,
                        "courier": req.provider,
                        "updated_at": now
                    }}
                )
                doc.pop("_id", None)
                created.append(doc)

            await log_activity("bulk_labels_created", f"Created {len(created)} labels for {req.provider}", current_user.get("id", ""))
            return {"created": created, "failed": failed, "created_count": len(created), "failed_count": len(failed)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/labels/{label_id}/void", response_model=Dict[str, Any])
    async def void_shipping_label(label_id: str, current_user: dict = Depends(get_current_user)):
        """Void/cancel a shipping label."""
        try:
            label = await db.ecom_shipping_labels.find_one({"id": label_id})
            if not label:
                raise HTTPException(status_code=404, detail="Label not found")
            if label.get("status") == "delivered":
                raise HTTPException(status_code=400, detail="Cannot void a delivered label")

            await db.ecom_shipping_labels.update_one(
                {"id": label_id},
                {"$set": {"status": "cancelled", "voided_at": now_iso(), "voided_by": current_user.get("id", "")}}
            )

            # Clear order shipping info
            order_id = label.get("order_id")
            if order_id:
                await db.ecom_orders.update_one(
                    {"id": order_id},
                    {"$unset": {"shipping_label_id": "", "tracking_number": ""}}
                )

            await log_activity("label_voided", f"Label {label_id} voided", current_user.get("id", ""))
            return {"label_id": label_id, "status": "cancelled"}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 6. SHIPPING SETTINGS (2 endpoints) =====

    @router.get("/settings", response_model=Dict[str, Any])
    async def get_shipping_settings(current_user: dict = Depends(get_current_user)):
        """Get shipping settings for the tenant."""
        try:
            settings = await db.shipping_settings.find_one({}, {"_id": 0})
            if not settings:
                return {
                    "default_provider": "yalidine",
                    "auto_create_label": False,
                    "auto_status_shipped": True,
                    "default_delivery_type": "desk",
                    "free_shipping_threshold": None,
                    "cash_on_delivery_enabled": True,
                    "providers": SHIPPING_PROVIDERS
                }
            settings["providers"] = SHIPPING_PROVIDERS
            return settings
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/settings", response_model=Dict[str, Any])
    async def update_shipping_settings(settings: ShippingSettingsUpdate, current_user: dict = Depends(get_current_user)):
        """Update shipping settings."""
        try:
            update = {k: v for k, v in settings.model_dump().items() if v is not None}
            update["updated_at"] = now_iso()
            update["updated_by"] = current_user.get("id", "")

            existing = await db.shipping_settings.find_one({})
            if existing:
                await db.shipping_settings.update_one({}, {"$set": update})
            else:
                update["id"] = str(uuid.uuid4())
                update["created_at"] = now_iso()
                await db.shipping_settings.insert_one(update)

            return await get_shipping_settings(current_user)
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 7. PICKUP REQUESTS (3 endpoints) =====

    @router.post("/pickups", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_pickup_request(req: PickupRequestCreate, current_user: dict = Depends(get_current_user)):
        """Request a parcel pickup from a shipping provider."""
        try:
            pickup_id = str(uuid.uuid4())
            doc = {
                "id": pickup_id,
                "provider": req.provider,
                "pickup_date": req.pickup_date,
                "pickup_address": req.pickup_address,
                "wilaya_code": req.wilaya_code,
                "wilaya_name": ALGERIA_WILAYAS.get(req.wilaya_code, {}).get("name_ar", ""),
                "estimated_parcels": req.estimated_parcels,
                "notes": req.notes or "",
                "status": "requested",
                "created_at": now_iso(),
                "created_by": current_user.get("id", "")
            }
            await db.pickup_requests.insert_one(doc)
            doc.pop("_id", None)
            await log_activity("pickup_requested", f"Pickup {pickup_id} for {req.provider}", current_user.get("id", ""))
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/pickups", response_model=Dict[str, Any])
    async def list_pickup_requests(
        provider: Optional[str] = None,
        status: Optional[str] = None,
        current_user: dict = Depends(get_current_user)
    ):
        """List pickup requests."""
        try:
            query = {}
            if provider:
                query["provider"] = provider
            if status:
                query["status"] = status
            items = await db.pickup_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
            return {"pickups": items, "total": len(items)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/pickups/{pickup_id}/status", response_model=Dict[str, Any])
    async def update_pickup_status(pickup_id: str, status: str = Body(..., embed=True), current_user: dict = Depends(get_current_user)):
        """Update pickup request status."""
        try:
            pickup = await db.pickup_requests.find_one({"id": pickup_id})
            if not pickup:
                raise HTTPException(status_code=404, detail="Pickup request not found")
            await db.pickup_requests.update_one(
                {"id": pickup_id},
                {"$set": {"status": status, "updated_at": now_iso()}}
            )
            return {"pickup_id": pickup_id, "status": status}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 8. DELIVERY ZONES (3 endpoints) =====

    @router.post("/zones", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_delivery_zone(zone: DeliveryZoneCreate, current_user: dict = Depends(get_current_user)):
        """Create a delivery zone (group of wilayas with delivery schedule)."""
        try:
            zone_id = str(uuid.uuid4())
            doc = {
                "id": zone_id,
                "name": zone.name,
                "wilaya_codes": zone.wilaya_codes,
                "wilaya_names": [ALGERIA_WILAYAS.get(c, {}).get("name_ar", c) for c in zone.wilaya_codes],
                "delivery_days": zone.delivery_days,
                "cut_off_time": zone.cut_off_time,
                "notes": zone.notes or "",
                "is_active": True,
                "created_at": now_iso(),
                "created_by": current_user.get("id", "")
            }
            await db.delivery_zones.insert_one(doc)
            doc.pop("_id", None)
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/zones", response_model=Dict[str, Any])
    async def list_delivery_zones(current_user: dict = Depends(get_current_user)):
        """List all delivery zones."""
        try:
            zones = await db.delivery_zones.find({"is_active": True}, {"_id": 0}).sort("created_at", -1).to_list(100)
            return {"zones": zones, "total": len(zones)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/zones/{zone_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_delivery_zone(zone_id: str, current_user: dict = Depends(get_current_user)):
        """Deactivate a delivery zone."""
        try:
            await db.delivery_zones.update_one({"id": zone_id}, {"$set": {"is_active": False, "updated_at": now_iso()}})
            return None
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 9. COD RECONCILIATION (1 endpoint) =====

    @router.post("/cod/reconcile", response_model=Dict[str, Any])
    async def cod_reconciliation(req: CODReconciliationRequest = Depends(), current_user: dict = Depends(get_current_user)):
        """Reconcile Cash on Delivery (COD) shipments."""
        try:
            query = {"status": "delivered"}
            if req.provider:
                query["provider"] = req.provider
            if req.date_from or req.date_to:
                query["created_at"] = {}
                if req.date_from:
                    query["created_at"]["$gte"] = req.date_from
                if req.date_to:
                    query["created_at"]["$lte"] = req.date_to

            labels = await db.ecom_shipping_labels.find(query, {"_id": 0}).to_list(None)
            total_cod = sum(l.get("total", 0) for l in labels)
            total_fees = sum(l.get("shipping_fee", 0) for l in labels if l.get("shipping_fee"))
            provider_breakdown = {}
            for l in labels:
                prov = l.get("provider", "unknown")
                if prov not in provider_breakdown:
                    provider_breakdown[prov] = {"count": 0, "cod_total": 0, "fee_total": 0}
                provider_breakdown[prov]["count"] += 1
                provider_breakdown[prov]["cod_total"] += l.get("total", 0)
                provider_breakdown[prov]["fee_total"] += l.get("shipping_fee", 0) or 0

            return {
                "total_delivered": len(labels),
                "total_cod_amount": round(total_cod, 2),
                "total_shipping_fees": round(total_fees, 2),
                "net_receivable": round(total_cod - total_fees, 2),
                "provider_breakdown": [
                    {"provider": k, **{m: round(v, 2) if isinstance(v, float) else v for m, v in vals.items()}} for k, vals in provider_breakdown.items()
                ]
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 10. SHIPPING ANALYTICS (3 endpoints) =====

    @router.get("/analytics/overview", response_model=Dict[str, Any])
    async def get_shipping_analytics(current_user: dict = Depends(get_current_user)):
        """Shipping analytics dashboard overview."""
        try:
            total_labels = await db.ecom_shipping_labels.count_documents({})
            status_pipeline = [
                {"$group": {"_id": "$status", "count": {"$sum": 1}}}
            ]
            status_counts = await db.ecom_shipping_labels.aggregate(status_pipeline).to_list(None)
            status_map = {s["_id"]: s["count"] for s in status_counts}

            # Provider breakdown
            provider_pipeline = [
                {"$group": {"_id": "$provider", "count": {"$sum": 1}, "avg_total": {"$avg": "$total"}}}
            ]
            provider_stats = await db.ecom_shipping_labels.aggregate(provider_pipeline).to_list(None)

            # Today
            today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
            today_count = await db.ecom_shipping_labels.count_documents({"created_at": {"$gte": today_start}})

            # Delivery performance
            delivered = status_map.get("delivered", 0)
            failed = status_map.get("failed", 0) + status_map.get("returned", 0)
            success_rate = (delivered / (delivered + failed) * 100) if (delivered + failed) > 0 else 0

            return {
                "total_labels": total_labels,
                "today_created": today_count,
                "status_breakdown": status_map,
                "provider_breakdown": [{"provider": p["_id"], "count": p["count"], "avg_order_value": round(p.get("avg_total", 0), 2)} for p in provider_stats],
                "delivery_success_rate": round(success_rate, 1),
                "courier_count": await db.couriers.count_documents({"is_active": True})
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/performance", response_model=Dict[str, Any])
    async def get_delivery_performance(days: int = Query(30, ge=1, le=365), current_user: dict = Depends(get_current_user)):
        """Delivery performance over time."""
        try:
            since = (datetime.utcnow() - timedelta(days=days)).isoformat()
            pipeline = [
                {"$match": {"created_at": {"$gte": since}}},
                {"$group": {
                    "_id": {"$substr": ["$created_at", 0, 10]},
                    "total": {"$sum": 1},
                    "delivered": {"$sum": {"$cond": [{"$eq": ["$status", "delivered"]}, 1, 0]}},
                    "failed": {"$sum": {"$cond": [{"$in": ["$status", ["failed", "returned"]]}, 1, 0]}}
                }},
                {"$sort": {"_id": 1}}
            ]
            daily = await db.ecom_shipping_labels.aggregate(pipeline).to_list(None)
            return {
                "period_days": days,
                "daily": [{"date": d["_id"], "total": d["total"], "delivered": d["delivered"], "failed": d["failed"]} for d in daily]
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/couriers", response_model=Dict[str, Any])
    async def get_courier_performance(current_user: dict = Depends(get_current_user)):
        """Performance stats per courier."""
        try:
            couriers = await db.couriers.find({"is_active": True}, {"_id": 0}).to_list(None)
            results = []
            for c in couriers:
                cid = c["id"]
                labels = await db.ecom_shipping_labels.find({"courier_id": cid}, {"status": 1, "total": 1}).to_list(None)
                delivered = len([l for l in labels if l.get("status") == "delivered"])
                failed = len([l for l in labels if l.get("status") in ["failed", "returned"]])
                total = len(labels)
                results.append({
                    "courier_id": cid,
                    "name": c.get("name", ""),
                    "phone": c.get("phone", ""),
                    "total_assigned": total,
                    "delivered": delivered,
                    "failed": failed,
                    "success_rate": round(delivered / total * 100, 1) if total > 0 else 0,
                    "total_value": round(sum(l.get("total", 0) for l in labels), 2)
                })
            results.sort(key=lambda x: x["success_rate"], reverse=True)
            return {"couriers": results}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 11. SHIPPING LABEL SEARCH & LIST (1 endpoint) =====

    @router.get("/labels", response_model=Dict[str, Any])
    async def list_shipping_labels(
        provider: Optional[str] = None,
        status: Optional[str] = None,
        courier_id: Optional[str] = None,
        wilaya: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        page: int = Query(1, ge=1),
        limit: int = Query(50, ge=1, le=200),
        current_user: dict = Depends(get_current_user)
    ):
        """Advanced shipping label search with filters."""
        try:
            query = {}
            if provider:
                query["provider"] = provider
            if status:
                query["status"] = status
            if courier_id:
                query["courier_id"] = courier_id
            if wilaya:
                query["wilaya"] = wilaya
            if date_from or date_to:
                query["created_at"] = {}
                if date_from:
                    query["created_at"]["$gte"] = date_from
                if date_to:
                    query["created_at"]["$lte"] = date_to

            skip, _ = paginate(page, limit)
            total = await db.ecom_shipping_labels.count_documents(query)
            items = await db.ecom_shipping_labels.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"labels": items, "total": total, "page": page, "limit": limit, "pages": (total + limit - 1) // limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    return router
