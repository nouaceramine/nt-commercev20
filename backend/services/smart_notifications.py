"""Smart Notifications — central helper for auto-generated in-app notifications."""
import logging
import uuid
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


async def notify(db, ntype: str, title: str, message: str, user_id: str = None, link: str = None, extra: dict = None):
    """Insert a notification document. user_id=None means visible to all admins."""
    try:
        doc = {
            "id": str(uuid.uuid4()),
            "type": ntype,  # info | warning | error | success
            "title": title,
            "message": message,
            "user_id": user_id,
            "link": link,
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if extra:
            doc.update(extra)
        await db.notifications.insert_one(doc)
        return doc["id"]
    except Exception as e:
        logger.warning("notify failed: %s", e)
        return None


async def notify_new_order(db, order: dict):
    total = order.get("total", 0)
    await notify(
        db, "info",
        "طلب جديد",
        f"طلب جديد {order.get('order_code', '')} بقيمة {total} دج",
        link="/ecom/orders",
    )


async def notify_low_stock(db, product_name: str, quantity):
    await notify(
        db, "warning",
        "مخزون منخفض",
        f"المنتج {product_name} وصل إلى {quantity}",
        link="/products",
    )


async def notify_shipment_delivered(db, order: dict):
    await notify(
        db, "success",
        "شحنة وصلت",
        f"تم توصيل الطلب {order.get('order_code', order.get('id', ''))}",
        link="/ecom/orders",
    )


async def notify_debt_due(db, customer_name: str, amount):
    await notify(
        db, "warning",
        "ديون مستحقة",
        f"تذكير: {customer_name} مدين بـ {amount} دج",
        link="/customer-debts",
    )
