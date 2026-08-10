"""
Loyalty Points Service
نظام النقاط وولاء العملاء
"""
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

class LoyaltyService:
    """إدارة نقاط الولاء"""

    POINTS_PER_CURRENCY = 100  # 100 دج = 1 نقطة
    POINTS_VALUE = 500  # 100 نقطة = 500 دج
    VIP_THRESHOLD = 3  # عدد الطلبات للـ VIP

    @staticmethod
    async def get_or_create_customer(db, phone: str, name: str = "") -> Dict[str, Any]:
        """جلب أو إنشاء حساب ولاء للزبون"""
        customer = await db.loyalty_customers.find_one({"phone": phone})
        if not customer:
            customer = {
                "id": str(uuid.uuid4()),
                "phone": phone,
                "name": name,
                "points": 0,
                "total_orders": 0,
                "total_spent": 0,
                "tier": "bronze",  # bronze | silver | gold | vip
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.loyalty_customers.insert_one(customer)
        return {k: v for k, v in customer.items() if k != "_id"}

    @staticmethod
    async def add_points(db, phone: str, order_total: float, order_id: str) -> Dict[str, Any]:
        """إضافة نقاط من طلب جديد"""
        points_earned = int(order_total / LoyaltyService.POINTS_PER_CURRENCY)

        await db.loyalty_customers.update_one(
            {"phone": phone},
            {
                "$inc": {"points": points_earned, "total_orders": 1, "total_spent": order_total},
                "$set": {"last_order_at": datetime.now(timezone.utc).isoformat()}
            }
        )

        # Record transaction
        await db.loyalty_transactions.insert_one({
            "id": str(uuid.uuid4()),
            "phone": phone,
            "type": "earn",
            "points": points_earned,
            "order_id": order_id,
            "amount": order_total,
            "created_at": datetime.now(timezone.utc).isoformat()
        })

        # Update tier
        customer = await db.loyalty_customers.find_one({"phone": phone})
        orders = customer.get("total_orders", 0)
        spent = customer.get("total_spent", 0)

        new_tier = "bronze"
        if orders >= 20 or spent >= 200000:
            new_tier = "vip"
        elif orders >= 10 or spent >= 100000:
            new_tier = "gold"
        elif orders >= 5 or spent >= 50000:
            new_tier = "silver"

        if new_tier != customer.get("tier", "bronze"):
            await db.loyalty_customers.update_one(
                {"phone": phone},
                {"$set": {"tier": new_tier, "tier_updated_at": datetime.now(timezone.utc).isoformat()}}
            )
            logger.info(f"Customer {phone} upgraded to {new_tier}")

        return {
            "points_earned": points_earned,
            "total_points": customer.get("points", 0) + points_earned,
            "tier": new_tier
        }

    @staticmethod
    async def redeem_points(db, phone: str, points_to_redeem: int, order_id: str) -> Dict[str, Any]:
        """استبدال نقاط بخصم"""
        customer = await db.loyalty_customers.find_one({"phone": phone})
        if not customer:
            return {"success": False, "error": "لا يوجد حساب ولاء"}

        current_points = customer.get("points", 0)
        if current_points < points_to_redeem:
            return {"success": False, "error": f"نقاطك غير كافية (لديك {current_points})"}

        discount = (points_to_redeem / 100) * LoyaltyService.POINTS_VALUE

        await db.loyalty_customers.update_one(
            {"phone": phone},
            {"$inc": {"points": -points_to_redeem}}
        )

        await db.loyalty_transactions.insert_one({
            "id": str(uuid.uuid4()),
            "phone": phone,
            "type": "redeem",
            "points": -points_to_redeem,
            "order_id": order_id,
            "discount_value": discount,
            "created_at": datetime.now(timezone.utc).isoformat()
        })

        return {
            "success": True,
            "points_redeemed": points_to_redeem,
            "discount": discount,
            "remaining_points": current_points - points_to_redeem
        }

    @staticmethod
    async def get_customer_points(db, phone: str) -> Dict[str, Any]:
        """جلب نقاط الزبون"""
        customer = await db.loyalty_customers.find_one({"phone": phone}, {"_id": 0})
        if not customer:
            return {"points": 0, "tier": "bronze", "total_orders": 0, "total_spent": 0}

        tier_benefits = {
            "bronze": {"discount": 0, "free_shipping_threshold": 5000},
            "silver": {"discount": 0.05, "free_shipping_threshold": 3000},
            "gold": {"discount": 0.10, "free_shipping_threshold": 1500},
            "vip": {"discount": 0.15, "free_shipping_threshold": 0}
        }

        tier = customer.get("tier", "bronze")
        return {
            **customer,
            "tier_benefits": tier_benefits.get(tier, tier_benefits["bronze"]),
            "next_tier": LoyaltyService._get_next_tier(tier)
        }

    @staticmethod
    def _get_next_tier(current: str) -> Optional[Dict[str, Any]]:
        tiers = ["bronze", "silver", "gold", "vip"]
        idx = tiers.index(current) if current in tiers else -1
        if idx >= 0 and idx < len(tiers) - 1:
            next_t = tiers[idx + 1]
            requirements = {
                "silver": {"orders": 5, "spent": 50000},
                "gold": {"orders": 10, "spent": 100000},
                "vip": {"orders": 20, "spent": 200000}
            }
            return {"tier": next_t, "requirements": requirements.get(next_t, {})}
        return None

    @staticmethod
    async def get_transactions(db, phone: str) -> List[Dict[str, Any]]:
        """جلب سجل النقاط"""
        transactions = await db.loyalty_transactions.find(
            {"phone": phone},
            {"_id": 0}
        ).sort("created_at", -1).to_list(100)
        return transactions

loyalty_service = LoyaltyService()
