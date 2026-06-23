"""
LLM Service for NT Commerce AI-Powered Accounting Platform
Handles all AI/LLM interactions using OpenAI via Replit AI Integrations.

Blueprint: python_openai_ai_integrations — uses Replit AI Integrations, which
provides OpenAI-compatible API access without requiring your own API key
(billed to Replit credits). Credentials come from the env vars
AI_INTEGRATIONS_OPENAI_API_KEY and AI_INTEGRATIONS_OPENAI_BASE_URL, which are
set automatically when the blueprint is installed — never ask the user for them.

# the newest OpenAI model is "gpt-5" which was released August 7, 2025.
# do not change this unless explicitly requested by the user
"""
import os
import json
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Default OpenAI model used for financial analysis / chat
AI_MODEL = "gpt-5"


class UserMessage:
    """Lightweight message wrapper kept for backward compatibility with existing call sites."""

    def __init__(self, text: str = "", file_contents=None):
        self.text = text
        self.file_contents = file_contents or []


def _get_openai_client():
    """Build a fresh AsyncOpenAI client backed by Replit AI Integrations.

    Returns None if the integration is not configured or the package is missing,
    so the backend never crashes on import when the blueprint isn't set up yet.
    """
    base_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")
    if not base_url:
        logger.warning("AI_INTEGRATIONS_OPENAI_BASE_URL not set — AI integration not configured")
        return None
    try:
        from openai import AsyncOpenAI
    except ImportError:
        logger.error("openai package not installed — install the OpenAI integration")
        return None
    return AsyncOpenAI(
        api_key=os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or "dummy",
        base_url=base_url,
    )


class _ChatAdapter:
    """Adapter exposing send_message() so existing LLMService methods keep working unchanged."""

    def __init__(self, system_message: str):
        self.system_message = system_message

    async def send_message(self, message) -> str:
        text = message.text if hasattr(message, "text") else str(message)
        client = _get_openai_client()
        if client is None:
            raise RuntimeError("AI integration not configured")
        response = await client.chat.completions.create(
            model=AI_MODEL,
            messages=[
                {"role": "system", "content": self.system_message},
                {"role": "user", "content": text},
            ],
            max_completion_tokens=8192,
        )
        return response.choices[0].message.content or ""


class LLMService:
    """Service for handling LLM interactions"""
    
    def __init__(self, session_id: str = None):
        self.session_id = session_id or f"session_{datetime.now(timezone.utc).timestamp()}"

    def _get_chat_instance(self, system_message: str) -> "_ChatAdapter":
        """Create a new chat instance with the specified system message"""
        return _ChatAdapter(system_message)
    
    async def analyze_financial_data(self, data: Dict[str, Any], query: str) -> str:
        """Analyze financial data and provide insights"""
        system_message = """أنت محاسب ذكاء اصطناعي خبير في التحليل المالي.
        مهمتك هي تحليل البيانات المالية وتقديم رؤى واضحة ومفيدة.
        قدم إجاباتك باللغة العربية مع أرقام دقيقة.
        كن موجزاً ومباشراً في إجاباتك."""
        
        chat = self._get_chat_instance(system_message)
        
        prompt = f"""البيانات المالية:
{json.dumps(data, ensure_ascii=False, indent=2)}

السؤال: {query}

قدم تحليلاً واضحاً ومختصراً."""
        
        try:
            response = await chat.send_message(UserMessage(text=prompt))
            return response
        except Exception as e:
            logger.error(f"Error analyzing financial data: {e}")
            return f"عذراً، حدث خطأ في التحليل: {str(e)}"
    
    async def classify_expense(self, description: str, amount: float, vendor: str = "") -> Dict[str, Any]:
        """Classify an expense into a category"""
        system_message = """أنت نظام تصنيف مصروفات ذكي.
        صنف المصروفات إلى الفئات التالية:
        - office_supplies (مستلزمات مكتبية)
        - utilities (مرافق - كهرباء، ماء، إنترنت)
        - rent (إيجار)
        - salaries (رواتب)
        - transportation (نقل ومواصلات)
        - marketing (تسويق وإعلان)
        - maintenance (صيانة)
        - insurance (تأمين)
        - taxes (ضرائب ورسوم)
        - other (أخرى)
        
        أجب بصيغة JSON فقط."""
        
        chat = self._get_chat_instance(system_message)
        
        prompt = f"""صنف هذا المصروف:
الوصف: {description}
المبلغ: {amount}
المورد: {vendor or 'غير محدد'}

أجب بصيغة JSON التالية:
{{"category": "اسم_الفئة", "confidence": 0.0-1.0, "reason": "سبب التصنيف"}}"""
        
        try:
            response = await chat.send_message(UserMessage(text=prompt))
            # Parse JSON from response
            response_text = response.strip()
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
            return json.loads(response_text)
        except Exception as e:
            logger.error(f"Error classifying expense: {e}")
            return {"category": "other", "confidence": 0.5, "reason": "تصنيف تلقائي"}
    
    async def detect_anomalies(self, transactions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Detect anomalies in transactions"""
        system_message = """أنت نظام كشف الاحتيال والشذوذ في المعاملات المالية.
        حلل المعاملات وحدد أي أنماط غير طبيعية أو مشبوهة.
        أجب بصيغة JSON فقط."""
        
        chat = self._get_chat_instance(system_message)
        
        prompt = f"""حلل هذه المعاملات واكتشف أي شذوذ:
{json.dumps(transactions, ensure_ascii=False, indent=2)}

أجب بصيغة JSON:
[{{"transaction_id": "...", "anomaly_type": "...", "severity": "low/medium/high", "description": "..."}}]

إذا لم يوجد شذوذ، أجب بـ []"""
        
        try:
            response = await chat.send_message(UserMessage(text=prompt))
            response_text = response.strip()
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
            return json.loads(response_text)
        except Exception as e:
            logger.error(f"Error detecting anomalies: {e}")
            return []
    
    async def generate_forecast(self, historical_data: List[Dict[str, Any]], 
                                forecast_type: str, periods: int = 3) -> Dict[str, Any]:
        """Generate financial forecast"""
        system_message = """أنت خبير في التنبؤ المالي.
        استخدم البيانات التاريخية للتنبؤ بالاتجاهات المستقبلية.
        قدم تنبؤات واقعية مع نسب الثقة.
        أجب بصيغة JSON فقط."""
        
        chat = self._get_chat_instance(system_message)
        
        prompt = f"""بناءً على البيانات التاريخية التالية:
{json.dumps(historical_data, ensure_ascii=False, indent=2)}

توقع {forecast_type} للـ {periods} فترات القادمة.

أجب بصيغة JSON:
{{
    "forecasts": [{{"period": "...", "value": 0.0, "confidence": 0.0-1.0}}],
    "trend": "up/down/stable",
    "insights": ["..."]
}}"""
        
        try:
            response = await chat.send_message(UserMessage(text=prompt))
            response_text = response.strip()
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
            return json.loads(response_text)
        except Exception as e:
            logger.error(f"Error generating forecast: {e}")
            return {"forecasts": [], "trend": "stable", "insights": ["تعذر إنشاء التنبؤ"]}
    
    async def process_chat_query(self, query: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Process a chat query from the AI accountant chat"""
        system_message = """أنت محاسب ذكي يساعد في الإجابة على الأسئلة المالية.
        لديك وصول إلى بيانات الشركة المالية.
        قدم إجابات دقيقة ومفيدة باللغة العربية.
        إذا كان السؤال يتطلب استعلام قاعدة البيانات، حدد نوع الاستعلام المطلوب.
        
        أنواع الاستعلامات المتاحة:
        - get_revenue: إجمالي الإيرادات
        - get_expenses: إجمالي المصروفات
        - get_profit: صافي الربح
        - get_top_customers: أفضل العملاء
        - get_top_products: أفضل المنتجات
        - get_overdue_invoices: الفواتير المتأخرة
        - get_cash_balance: رصيد النقدية
        - general_query: استعلام عام"""
        
        chat = self._get_chat_instance(system_message)
        
        prompt = f"""سياق البيانات:
{json.dumps(context, ensure_ascii=False, indent=2)}

سؤال المستخدم: {query}

أجب بصيغة JSON:
{{
    "response": "الإجابة النصية",
    "query_type": "نوع الاستعلام إذا لزم",
    "data_needed": true/false,
    "suggestions": ["اقتراحات للأسئلة المتابعة"]
}}"""
        
        try:
            response = await chat.send_message(UserMessage(text=prompt))
            response_text = response.strip()
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
            return json.loads(response_text)
        except Exception as e:
            logger.error(f"Error processing chat query: {e}")
            return {
                "response": f"عذراً، حدث خطأ: {str(e)}",
                "query_type": "error",
                "data_needed": False,
                "suggestions": []
            }
    
    async def extract_invoice_data(self, text: str) -> Dict[str, Any]:
        """Extract invoice data from OCR text"""
        system_message = """أنت نظام استخراج بيانات الفواتير.
        استخرج المعلومات التالية من نص الفاتورة:
        - اسم المورد
        - رقم الفاتورة
        - التاريخ
        - تاريخ الاستحقاق
        - المبلغ الإجمالي
        - الضريبة
        - العناصر
        
        أجب بصيغة JSON فقط."""
        
        chat = self._get_chat_instance(system_message)
        
        prompt = f"""استخرج بيانات الفاتورة من النص التالي:
{text}

أجب بصيغة JSON:
{{
    "vendor_name": "...",
    "invoice_number": "...",
    "invoice_date": "YYYY-MM-DD",
    "due_date": "YYYY-MM-DD",
    "total_amount": 0.0,
    "tax_amount": 0.0,
    "items": [{{"description": "...", "quantity": 1, "unit_price": 0.0, "total": 0.0}}],
    "confidence": 0.0-1.0
}}"""
        
        try:
            response = await chat.send_message(UserMessage(text=prompt))
            response_text = response.strip()
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
            return json.loads(response_text)
        except Exception as e:
            logger.error(f"Error extracting invoice data: {e}")
            return {"confidence": 0, "error": str(e)}
    
    async def generate_daily_summary(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate daily financial summary with insights"""
        system_message = """أنت محلل مالي يومي.
        قدم ملخصاً يومياً شاملاً مع تحليلات ورؤى مفيدة.
        ركز على الأرقام المهمة والتغيرات الملحوظة.
        أجب بصيغة JSON."""
        
        chat = self._get_chat_instance(system_message)
        
        prompt = f"""حلل البيانات المالية اليومية التالية:
{json.dumps(data, ensure_ascii=False, indent=2)}

قدم ملخصاً بصيغة JSON:
{{
    "summary": "ملخص نصي قصير",
    "highlights": ["أبرز النقاط"],
    "alerts": [{{"type": "...", "message": "...", "severity": "low/medium/high"}}],
    "recommendations": ["توصيات"]
}}"""
        
        try:
            response = await chat.send_message(UserMessage(text=prompt))
            response_text = response.strip()
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
            return json.loads(response_text)
        except Exception as e:
            logger.error(f"Error generating daily summary: {e}")
            return {"summary": "تعذر إنشاء الملخص", "highlights": [], "alerts": [], "recommendations": []}
    
    async def parse_whatsapp_message(self, message: str) -> Dict[str, Any]:
        """Parse WhatsApp message to extract financial command"""
        system_message = """أنت نظام معالجة رسائل واتساب للمحاسبة.
        حلل الرسائل واستخرج الأوامر المالية.
        
        أنواع الأوامر:
        - expense: تسجيل مصروف (مثل: "دفعت 500 دج للوقود")
        - income: تسجيل دخل (مثل: "استلمت 1000 دج من زبون")
        - balance: استعلام الرصيد (مثل: "كم رصيدي؟")
        - report: طلب تقرير (مثل: "أعطني تقرير المبيعات")
        - query: سؤال عام (مثل: "ما هي أرباح اليوم؟")
        
        أجب بصيغة JSON فقط."""
        
        chat = self._get_chat_instance(system_message)
        
        prompt = f"""حلل هذه الرسالة:
"{message}"

أجب بصيغة JSON:
{{
    "command_type": "expense/income/balance/report/query",
    "parsed_data": {{
        "amount": 0.0,
        "description": "...",
        "category": "...",
        "customer": "...",
        "period": "..."
    }},
    "confidence": 0.0-1.0,
    "response_text": "رد مناسب للمستخدم"
}}"""
        
        try:
            response = await chat.send_message(UserMessage(text=prompt))
            response_text = response.strip()
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
            return json.loads(response_text)
        except Exception as e:
            logger.error(f"Error parsing WhatsApp message: {e}")
            return {
                "command_type": "query",
                "parsed_data": {},
                "confidence": 0,
                "response_text": "عذراً، لم أفهم رسالتك. حاول مرة أخرى."
            }


# Singleton instance
_llm_service: Optional[LLMService] = None


def get_llm_service(session_id: str = None) -> LLMService:
    """Get LLM service instance"""
    global _llm_service
    if _llm_service is None or session_id:
        _llm_service = LLMService(session_id=session_id)
    return _llm_service
