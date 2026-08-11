"""
AI Service — Google Gemini API
كتابة وصف منتج + ترجمة تلقائية
"""
import os
import google.generativeai as genai
from typing import Optional

# Configure with free API key (user needs to set this)
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

class AIService:
    """خدمة AI للمتجر"""

    MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")  # مجاني + سريع، قابل للتغيير عبر env

    @staticmethod
    def is_configured() -> bool:
        """هل المفتاح مضبوط؟"""
        return bool(GEMINI_API_KEY)

    @staticmethod
    async def generate_product_description(name: str, category: str = "", features: str = "") -> dict:
        """
        يولد وصفاً تسويقياً للمنتج بالعربية
        """
        if not AIService.is_configured():
            return {"success": False, "error": "لم يتم ضبط مفتاح Gemini. أضف GEMINI_API_KEY في .env"}

        try:
            model = genai.GenerativeModel(AIService.MODEL)

            prompt = f"""
            أنت كاتب محتوى تسويقي متخصص في التجارة الإلكترونية في الجزائر.

            اكتب وصفاً تسويقياً قصيراً وجذاباً باللغة العربية الفصحى (مع بعض الكلمات الدارجة الجزائرية) للمنتج التالي:

            اسم المنتج: {name}
            الفئة: {category or "عام"}
            المميزات: {features or "غير محدد"}

            المتطلبات:
            - 2-3 جمل فقط
            - ابدأ بفائدة المنتج للزبون
            - استخدم لغة بسيطة ومقنعة
            - لا تستخدم رموزاً أو إيموجي
            - انتهِ بدعوة للشراء ضمنية

            الوصف:
            """

            response = await model.generate_content_async(prompt)
            description = response.text.strip()

            return {
                "success": True,
                "description": description,
                "model": AIService.MODEL
            }

        except Exception as e:
            return {"success": False, "error": f"خطأ في AI: {str(e)}"}

    @staticmethod
    async def translate_to_french(text: str) -> dict:
        """
        يترجم النص إلى الفرنسية (الجزائرية)
        """
        if not AIService.is_configured():
            return {"success": False, "error": "لم يتم ضبط مفتاح Gemini"}

        try:
            model = genai.GenerativeModel(AIService.MODEL)

            prompt = f"""
            ترجم النص التالي إلى الفرنسية (اللهجة الجزائرية/الفرنسية القياسية):

            {text}

            المتطلبات:
            - احتفظ بنفس المعنى التسويقي
            - استخدم مصطلحات الجزائر إن أمكن
            - لا تضف شيئاً غير موجود في النص الأصلي

            الترجمة:
            """

            response = await model.generate_content_async(prompt)
            translation = response.text.strip()

            return {
                "success": True,
                "translation": translation,
                "original": text
            }

        except Exception as e:
            return {"success": False, "error": str(e)}

    @staticmethod
    async def generate_social_media_post(product_name: str, price: float, store_name: str) -> dict:
        """
        ينشئ منشوراً جاهزاً لفيسبوك/تيك توك
        """
        if not AIService.is_configured():
            return {"success": False, "error": "لم يتم ضبط مفتاح Gemini"}

        try:
            model = genai.GenerativeModel(AIService.MODEL)

            prompt = f"""
            اكتب منشوراً تسويقياً قصيراً لمتجر "{store_name}" في الجزائر:

            المنتج: {product_name}
            السعر: {price:,.0f} دج

            المتطلبات:
            - منشور جذاب + هاشتاغات
            - دعوة للطلب (توصيل + دفع عند الاستلام)
            - لا يتجاوز 5 أسطر

            المنشور:
            """

            response = await model.generate_content_async(prompt)
            post = response.text.strip()

            return {
                "success": True,
                "post": post,
                "hashtags": "#الجزائر #تسوق_اونلاين #" + store_name.replace(" ", "_")
            }

        except Exception as e:
            return {"success": False, "error": str(e)}

# Singleton
ai_service = AIService()
