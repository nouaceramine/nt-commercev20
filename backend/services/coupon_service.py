"""
Coupon/Discount Service
نظام الكوبونات والخصومات لكل متجر
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

class CouponService:
    """إدارة الكوبونات والخصومات"""

    @staticmethod
    async def create_coupon(db, coupon_data: Dict[str, Any]) -> Dict[str, Any]:
        """إنشاء كوبون جديد (مع تحقق صارم من المدخلات)"""
        import math
        value = coupon_data.get("value", 0)
        ctype = coupon_data.get("type", "percentage")
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(float(value)):
            raise ValueError("قيمة الكوبون غير صالحة")
        if value < 0:
            raise ValueError("قيمة الكوبون لا يمكن أن تكون سالبة")
        if ctype == "percentage" and value > 100:
            raise ValueError("نسبة الخصم لا يمكن أن تتجاوز 100%")
        if ctype not in ("percentage", "fixed", "free_shipping"):
            raise ValueError("نوع الكوبون غير مدعوم")
        min_order = coupon_data.get("min_order", 0)
        if min_order is not None and (not isinstance(min_order, (int, float)) or min_order < 0):
            raise ValueError("الحد الأدنى للطلب غير صالح")
        usage_limit = coupon_data.get("usage_limit", None)
        if usage_limit is not None and (not isinstance(usage_limit, int) or usage_limit < 1):
            raise ValueError("حد الاستخدام يجب أن يكون عدداً صحيحاً >= 1")
        start_date = coupon_data.get("start_date")
        end_date = coupon_data.get("end_date")
        if start_date and end_date:
            try:
                sd = datetime.fromisoformat(str(start_date).replace("Z", "+00:00"))
                ed = datetime.fromisoformat(str(end_date).replace("Z", "+00:00"))
                if ed <= sd:
                    raise ValueError("DATE_ORDER")
            except ValueError as ve:
                if "DATE_ORDER" in str(ve):
                    raise ValueError("تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء")
                raise ValueError("صيغة التاريخ غير صالحة")
        code_u = str(coupon_data.get("code", "")).upper().strip()
        if not code_u:
            raise ValueError("كود الكوبون مطلوب")
        dup = await db.coupons.find_one({"code": code_u, "is_active": True})
        if dup:
            raise LookupError("كود الكوبون موجود مسبقاً")
        coupon = {
            "id": str(uuid.uuid4()),
            "code": coupon_data["code"].upper().strip(),
            "type": coupon_data.get("type", "percentage"),  # percentage | fixed | free_shipping
            "value": coupon_data.get("value", 0),  # نسبة أو قيمة
            "min_order": coupon_data.get("min_order", 0),
            "max_discount": coupon_data.get("max_discount", None),
            "usage_limit": coupon_data.get("usage_limit", None),  # None = unlimited
            "usage_count": 0,
            "per_customer_limit": coupon_data.get("per_customer_limit", 1),  # مرات لكل زبون
            "start_date": coupon_data.get("start_date", datetime.now(timezone.utc).isoformat()),
            "end_date": coupon_data.get("end_date", None),
            "applies_to": coupon_data.get("applies_to", "all"),  # all | categories | products
            "applicable_ids": coupon_data.get("applicable_ids", []),  # IDs if not all
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }

        await db.coupons.insert_one(coupon)
        logger.info(f"Coupon created: {coupon['code']}")
        return {k: v for k, v in coupon.items() if k != "_id"}

    @staticmethod
    async def validate_coupon(db, code: str, subtotal: float, 
                              customer_phone: str = "",
                              product_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        """التحقق من صلاحية الكوبون"""
        if product_ids is None:
            product_ids = []
        coupon = await db.coupons.find_one({
            "code": code.upper().strip(),
            "is_active": True
        })

        if not coupon:
            return {"valid": False, "error": "الكوبون غير موجود"}

        # Check dates
        now = datetime.now(timezone.utc)
        if coupon.get("end_date") and datetime.fromisoformat(coupon["end_date"].replace('Z', '+00:00')) < now:
            return {"valid": False, "error": "انتهت صلاحية الكوبون"}

        # Check min order
        if subtotal < coupon.get("min_order", 0):
            return {"valid": False, "error": f"الحد الأدنى للطلب: {coupon['min_order']:,.0f} دج"}

        # Check usage limit
        if coupon.get("usage_limit") and coupon.get("usage_count", 0) >= coupon["usage_limit"]:
            return {"valid": False, "error": "تم استنفاد الكوبون"}

        # Check per-customer limit
        if customer_phone and coupon.get("per_customer_limit"):
            customer_usage = await db.coupon_usage.count_documents({
                "coupon_id": coupon["id"],
                "customer_phone": customer_phone
            })
            if customer_usage >= coupon["per_customer_limit"]:
                return {"valid": False, "error": "لقد استخدمت هذا الكوبون من قبل"}

        # Check applicable products
        if coupon.get("applies_to") == "products" and product_ids:
            if not any(pid in coupon.get("applicable_ids", []) for pid in product_ids):
                return {"valid": False, "error": "الكوبون لا ينطبق على هذه المنتجات"}

        # Calculate discount
        discount = 0
        if coupon["type"] == "percentage":
            discount = subtotal * (coupon["value"] / 100)
            if coupon.get("max_discount"):
                discount = min(discount, coupon["max_discount"])
            discount = min(discount, subtotal)
        elif coupon["type"] == "fixed":
            discount = min(coupon["value"], subtotal)
        elif coupon["type"] == "free_shipping":
            discount = -1  # marker for free shipping

        return {
            "valid": True,
            "coupon_id": coupon["id"],
            "code": coupon["code"],
            "type": coupon["type"],
            "discount": round(discount, 2) if discount != -1 else 0,
            "free_shipping": discount == -1,
            "message": f"تم تطبيق خصم {discount:,.0f} دج" if discount > 0 else "شحن مجاني!"
        }

    @staticmethod
    async def apply_coupon(db, coupon_id: str, order_id: str, 
                          customer_phone: str) -> bool:
        """تسجيل استخدام الكوبون بشكل ذرّي — False عند بلوغ حد الاستخدام"""
        res = await db.coupons.update_one(
            {"id": coupon_id, "is_active": True,
             "$or": [{"usage_limit": None}, {"usage_limit": {"$exists": False}},
                     {"$expr": {"$lt": ["$usage_count", "$usage_limit"]}}]},
            {"$inc": {"usage_count": 1}}
        )
        if res.modified_count == 0:
            logger.warning(f"Coupon {coupon_id} usage limit reached - claim rejected")
            return False
        await db.coupon_usage.insert_one({
            "coupon_id": coupon_id,
            "order_id": order_id,
            "customer_phone": customer_phone,
            "used_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"Coupon {coupon_id} applied to order {order_id}")
        return True

    @staticmethod
    async def get_coupons(db, active_only: bool = True) -> List[Dict[str, Any]]:
        """جلب كل الكوبونات"""
        query = {"is_active": True} if active_only else {}
        coupons = await db.coupons.find(query, {"_id": 0}).to_list(1000)
        return coupons

    @staticmethod
    async def delete_coupon(db, coupon_id: str) -> bool:
        """حذف/تعطيل كوبون"""
        result = await db.coupons.update_one(
            {"id": coupon_id},
            {"$set": {"is_active": False, "deleted_at": datetime.now(timezone.utc).isoformat()}}
        )
        return result.modified_count > 0

coupon_service = CouponService()
