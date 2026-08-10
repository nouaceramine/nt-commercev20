"""
WhatsApp Notification Service
إشعارات تلقائية عبر WhatsApp للطلبات
"""
import requests
import os
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

class WhatsAppService:
    """WhatsApp Business API / Local Gateway"""

    def __init__(self):
        # يمكن استخدام WhatsApp Business API أو بوابة محلية
        self.api_url = os.environ.get("WHATSAPP_API_URL", "")
        self.api_key = os.environ.get("WHATSAPP_API_KEY", "")
        self.enabled = bool(self.api_url and self.api_key)

    async def send_message(self, phone: str, message: str) -> Dict[str, Any]:
        """إرسال رسالة WhatsApp"""
        if not self.enabled:
            logger.warning("WhatsApp not configured")
            return {"sent": False, "error": "Not configured"}

        try:
            # تنظيف رقم الهاتف (إضافة 213 إذا لم يكن موجوداً)
            clean_phone = phone.replace(" ", "").replace("-", "")
            if not clean_phone.startswith("+") and not clean_phone.startswith("213"):
                clean_phone = "213" + clean_phone.lstrip("0")

            payload = {
                "phone": clean_phone,
                "message": message,
                "api_key": self.api_key
            }

            response = requests.post(
                self.api_url,
                json=payload,
                timeout=15
            )

            result = {
                "sent": response.status_code == 200,
                "status": response.status_code,
                "response": response.json() if response.status_code == 200 else response.text
            }

            logger.info(f"WhatsApp to {phone}: {result['sent']}")
            return result

        except Exception as e:
            logger.error(f"WhatsApp error: {e}")
            return {"sent": False, "error": str(e)}

    async def send_order_confirmation(self, phone: str, order_number: str, 
                                       customer_name: str, total: float,
                                       products: list) -> Dict[str, Any]:
        """رسالة تأكيد الطلب"""
        products_text = "\\n".join([
            f"• {p.get('name', 'منتج')} × {p.get('quantity', 1)} = {p.get('price', 0) * p.get('quantity', 1):,.0f} دج"
            for p in products[:5]
        ])

        message = f"""🎉 تم استلام طلبك بنجاح!

مرحباً {customer_name}،

رقم طلبك: #{order_number}
الإجمالي: {total:,.0f} دج

📦 المنتجات:
{products_text}

سنتواصل معك قريباً لتأكيد الطلب.

شكراً لثقتك! 🙏"""

        return await self.send_message(phone, message)

    async def send_shipping_update(self, phone: str, order_number: str,
                                    status: str, tracking_url: Optional[str] = None) -> Dict[str, Any]:
        """تحديث حالة الشحن"""
        status_messages = {
            "pending": "⏳ طلبك قيد المراجعة",
            "processing": "📦 جاري تجهيز طلبك",
            "shipped": "🚚 طلبك خرج للتوصيل!",
            "delivered": "✅ تم توصيل طلبك بنجاح",
            "cancelled": "❌ تم إلغاء طلبك"
        }

        msg = status_messages.get(status, f"📦 حالة طلبك: {status}")

        message = f"""{msg}

رقم الطلب: #{order_number}

{tracking_url if tracking_url else ""}

شكراً لثقتك! 🙏"""

        return await self.send_message(phone, message)

    async def send_delivery_reminder(self, phone: str, order_number: str,
                                     delivery_date: str) -> Dict[str, Any]:
        """تذكير قبل التوصيل بـ 24 ساعة"""
        message = f"""📦 تذكير بالتوصيل

رقم طلبك: #{order_number}

سيتم توصيل طلبك غداً إن شاء الله ({delivery_date}).

يرجى التأكد من تواجدك في العنوان المسجل.

شكراً! 🙏"""

        return await self.send_message(phone, message)

    async def send_cod_confirmation(self, phone: str, order_number: str,
                                   total: float) -> Dict[str, Any]:
        """طلب تأكيد الدفع عند الاستلام"""
        message = f"""💰 تأكيد طلب COD

رقم طلبك: #{order_number}
المبلغ: {total:,.0f} دج (عند الاستلام)

هل تؤكد استلام الطلب؟

رد بـ "نعم" للتأكيد."""

        return await self.send_message(phone, message)

# Singleton
whatsapp_service = WhatsAppService()
