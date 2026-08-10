"""
Shipping Tracker Service
تتبع الشحن لشركات التوصيل الجزائرية
"""
import requests
import os
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

class ShippingTracker:
    """تتبع الشحن عبر شركات التوصيل"""

    CARRIERS = {
        "yalidine": {
            "name": "Yalidine",
            "track_url": "https://yalidine.com/api/v1/tracking",
            "api_key_env": "YALIDINE_API_KEY"
        },
        "ecom": {
            "name": "Ecom Express",
            "track_url": "https://api.ecom.dz/tracking",
            "api_key_env": "ECOM_API_KEY"
        },
        "proxi": {
            "name": "Proxi Livraison",
            "track_url": "https://api.proxi.dz/track",
            "api_key_env": "PROXI_API_KEY"
        },
        "manual": {
            "name": "توصيل يدوي",
            "track_url": None,
            "api_key_env": None
        }
    }

    @staticmethod
    async def create_tracking(db, order_id: str, carrier: str, 
                              tracking_number: str, 
                              status: str = "pending") -> Dict[str, Any]:
        """إنشاء سجل تتبع"""
        tracking = {
            "id": str(__import__('uuid').uuid4()),
            "order_id": order_id,
            "carrier": carrier,
            "tracking_number": tracking_number,
            "status": status,  # pending | processing | shipped | in_transit | out_for_delivery | delivered | cancelled | returned
            "history": [{
                "status": status,
                "location": "",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "note": "تم إنشاء طلب التتبع"
            }],
            "estimated_delivery": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

        await db.shipping_tracking.insert_one(tracking)

        # Update order
        await db.store_orders.update_one(
            {"id": order_id},
            {"$set": {
                "shipping_carrier": carrier,
                "tracking_number": tracking_number,
                "shipping_status": status,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )

        logger.info(f"Tracking created for order {order_id}: {carrier} {tracking_number}")
        return {k: v for k, v in tracking.items() if k != "_id"}

    @staticmethod
    async def update_status(db, order_id: str, new_status: str, 
                            location: str = "", note: str = "") -> bool:
        """تحديث حالة الشحن"""
        tracking = await db.shipping_tracking.find_one({"order_id": order_id})
        if not tracking:
            return False

        history_entry = {
            "status": new_status,
            "location": location,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "note": note
        }

        await db.shipping_tracking.update_one(
            {"order_id": order_id},
            {
                "$set": {
                    "status": new_status,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                },
                "$push": {"history": history_entry}
            }
        )

        # Update order status
        await db.store_orders.update_one(
            {"id": order_id},
            {"$set": {
                "shipping_status": new_status,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )

        logger.info(f"Order {order_id} shipping status: {new_status}")
        return True

    @staticmethod
    async def get_tracking(db, order_id: str) -> Optional[Dict[str, Any]]:
        """جلب تفاصيل التتبع"""
        tracking = await db.shipping_tracking.find_one(
            {"order_id": order_id}, 
            {"_id": 0}
        )
        return tracking

    @staticmethod
    async def get_customer_trackings(db, customer_phone: str) -> List[Dict[str, Any]]:
        """جلب كل شحنات الزبون"""
        # Get orders by customer phone
        orders = await db.store_orders.find(
            {"customer_phone": customer_phone},
            {"id": 1}
        ).to_list(100)

        order_ids = [o["id"] for o in orders]
        trackings = await db.shipping_tracking.find(
            {"order_id": {"$in": order_ids}},
            {"_id": 0}
        ).sort("updated_at", -1).to_list(100)

        return trackings

    @staticmethod
    def get_status_display(status: str) -> Dict[str, str]:
        """ترجمة حالة الشحن"""
        statuses = {
            "pending": {"ar": "قيد المراجعة", "icon": "⏳", "color": "#f39c12"},
            "processing": {"ar": "جاري التجهيز", "icon": "📦", "color": "#3498db"},
            "shipped": {"ar": "خرج للتوصيل", "icon": "🚚", "color": "#9b59b6"},
            "in_transit": {"ar": "في الطريق", "icon": "🛣️", "color": "#e67e22"},
            "out_for_delivery": {"ar": "قيد التوصيل", "icon": "📍", "color": "#2ecc71"},
            "delivered": {"ar": "تم التوصيل", "icon": "✅", "color": "#27ae60"},
            "cancelled": {"ar": "ملغي", "icon": "❌", "color": "#e74c3c"},
            "returned": {"ar": "مرتجع", "icon": "↩️", "color": "#95a5a6"}
        }
        return statuses.get(status, {"ar": status, "icon": "📦", "color": "#7f8c8d"})

    @staticmethod
    async def fetch_external_tracking(carrier: str, tracking_number: str) -> Dict[str, Any]:
        """جلب التتبع من API شركة الشحن (placeholder)"""
        carrier_info = ShippingTracker.CARRIERS.get(carrier)
        if not carrier_info or not carrier_info["track_url"]:
            return {"success": False, "error": "API غير متوفر"}

        api_key = os.environ.get(carrier_info["api_key_env"], "")
        if not api_key:
            return {"success": False, "error": "API key غير مضبوط"}

        try:
            # Placeholder - actual implementation depends on carrier API
            response = requests.get(
                f"{carrier_info['track_url']}/{tracking_number}",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=10
            )
            return {
                "success": response.status_code == 200,
                "data": response.json() if response.status_code == 200 else response.text
            }
        except Exception as e:
            logger.error(f"Tracking fetch error: {e}")
            return {"success": False, "error": str(e)}

shipping_tracker = ShippingTracker()
