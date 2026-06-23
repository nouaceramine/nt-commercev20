"""
SendGrid Email Notifications & Email Reports & Smart Reports Routes
Extracted from server.py
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from utils.inventory_queries import low_stock_filter
import uuid
import os
import logging
import asyncio

logger = logging.getLogger(__name__)

# Try imports
try:
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail, Email, To, Content
    SENDGRID_AVAILABLE = True
except ImportError:
    SENDGRID_AVAILABLE = False

try:
    import resend
    RESEND_AVAILABLE = True
except ImportError:
    RESEND_AVAILABLE = False


def create_sendgrid_email_routes(db, main_db, get_current_user, get_tenant_admin, require_tenant, get_super_admin) -> dict:
    router = APIRouter(tags=["email-notifications"])

    # ── Models ──

    class SendGridSettings(BaseModel):
        enabled: bool = False
        api_key: str = ""
        sender_email: str = ""
        sender_name: str = "NT Commerce"
        new_sale_notification: bool = True
        low_stock_notification: bool = True
        daily_report: bool = False
        weekly_report: bool = False
        notification_email: str = ""

    class EmailNotificationRequest(BaseModel):
        notification_type: str
        recipient_email: str
        subject: str = ""
        data: dict = {}

    class EmailSettings(BaseModel):
        enabled: bool = False
        resend_api_key: str = ""
        sender_email: str = "onboarding@resend.dev"
        sender_name: str = "NT POS System"

    class SessionReportEmail(BaseModel):
        recipient_email: EmailStr
        session_id: str
        report_data: dict

    class SmartReportSettings(BaseModel):
        daily_report_enabled: bool = False
        daily_report_time: str = "08:00"
        daily_report_recipients: str = ""
        include_ai_tips: bool = True
        include_sales_summary: bool = True
        include_low_stock_alerts: bool = True
        include_debt_reminders: bool = True

    # ── Helper functions ──

    async def send_email_with_sendgrid(to_email: str, subject: str, html_content: str, settings: dict = None) -> None:
        if not SENDGRID_AVAILABLE:
            raise HTTPException(status_code=500, detail="SendGrid غير متوفر")
        if not settings:
            settings = await main_db.system_settings.find_one({"type": "sendgrid_settings"})
        if not settings or not settings.get("api_key"):
            raise HTTPException(status_code=400, detail="يرجى إعداد مفتاح SendGrid أولاً")
        try:
            sg = SendGridAPIClient(settings["api_key"])
            from_email = Email(settings.get("sender_email", "noreply@ntcommerce.com"), settings.get("sender_name", "NT Commerce"))
            to_email_obj = To(to_email)
            content = Content("text/html", html_content)
            mail = Mail(from_email, to_email_obj, subject, content)
            response = sg.send(mail)
            return response.status_code == 202
        except Exception as e:
            logger.error(f"SendGrid error: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal server error")

    def generate_sale_notification_html(sale_data: dict) -> dict:
        return f"""<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;"><div style="background: white; border-radius: 12px; padding: 30px;"><div style="text-align: center; margin-bottom: 20px;"><h1 style="color: #22c55e;">عملية بيع جديدة</h1></div><div style="background: #f0fdf4; border-radius: 8px; padding: 15px;"><p><strong>رقم الفاتورة:</strong> {sale_data.get('invoice_number', 'N/A')}</p><p><strong>الزبون:</strong> {sale_data.get('customer_name', 'زبون عام')}</p><p><strong>المبلغ:</strong> <span style="color: #16a34a; font-size: 1.2em; font-weight: bold;">{sale_data.get('total', 0):,.2f} دج</span></p><p><strong>طريقة الدفع:</strong> {sale_data.get('payment_method', 'نقداً')}</p></div></div></div>"""

    def generate_low_stock_notification_html(products: list) -> dict:
        rows = "".join([f"<tr><td style='padding:8px;border-bottom:1px solid #e5e7eb;'>{p.get('name','N/A')}</td><td style='padding:8px;text-align:center;color:{'#dc2626' if p.get('stock',0)==0 else '#f59e0b'};'>{p.get('stock',0)}</td><td style='padding:8px;text-align:center;'>{p.get('min_quantity',10)}</td></tr>" for p in products[:20]])
        return f"""<div dir="rtl" style="font-family: Arial; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;"><div style="background: white; border-radius: 12px; padding: 30px;"><h1 style="color: #f59e0b; text-align: center;">تنبيه انخفاض المخزون</h1><p style="text-align:center;color:#6b7280;">يوجد {len(products)} منتج بحاجة إلى إعادة تزويد</p><table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f3f4f6;"><th style="padding:10px;text-align:right;">المنتج</th><th style="padding:10px;text-align:center;">الكمية</th><th style="padding:10px;text-align:center;">الحد الأدنى</th></tr></thead><tbody>{rows}</tbody></table></div></div>"""

    def generate_daily_report_html(report_data: dict) -> dict:
        return f"""<div dir="rtl" style="font-family: Arial; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;"><div style="background: white; border-radius: 12px; padding: 30px;"><h1 style="color: #3b82f6; text-align: center;">التقرير اليومي</h1><p style="text-align:center;color:#6b7280;">{report_data.get('date', '')}</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;margin:20px 0;"><div style="background:#f0fdf4;border-radius:8px;padding:15px;text-align:center;"><p style="color:#6b7280;font-size:12px;">إجمالي المبيعات</p><p style="color:#16a34a;font-size:1.5em;font-weight:bold;">{report_data.get('total_sales',0):,.2f} دج</p></div><div style="background:#eff6ff;border-radius:8px;padding:15px;text-align:center;"><p style="color:#6b7280;font-size:12px;">عدد الفواتير</p><p style="color:#3b82f6;font-size:1.5em;font-weight:bold;">{report_data.get('sales_count',0)}</p></div></div></div></div>"""

    def generate_session_report_html(report: dict, language: str = 'ar') -> dict:
        def fmt(amount) -> dict:
            return f"{amount:,.2f}"
        currency = "دج"
        diff = report.get('cashDifference', 0)
        diff_color = '#22c55e' if diff >= 0 else '#ef4444'
        diff_sign = '+' if diff >= 0 else ''
        return f"""<div dir="rtl" style="font-family: 'Segoe UI', Tahoma, sans-serif; background: #f3f4f6; padding: 20px;"><div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden;"><div style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: 30px; text-align: center;"><h1 style="color: white;">تقرير غلق الحصة</h1></div><div style="padding: 20px;"><div style="margin-top: 15px; padding: 15px; background: {'#dcfce7' if diff >= 0 else '#fee2e2'}; border-radius: 8px;"><span>الفرق</span><span style="color: {diff_color}; font-size: 20px; font-weight: bold;">{diff_sign}{fmt(diff)} {currency}</span></div></div></div></div>"""

    # ── SendGrid Settings Routes ──

    @router.get("/notifications/sendgrid/settings")
    async def get_sendgrid_settings(user: dict = Depends(require_tenant)):
        settings = await db.system_settings.find_one({"type": "sendgrid_settings"}, {"_id": 0})
        if not settings:
            return SendGridSettings().model_dump()
        if settings.get("api_key"):
            key = settings["api_key"]
            settings["api_key"] = key[:8] + "..." + key[-4:] if len(key) > 12 else "***configured***"
        return settings

    @router.put("/notifications/sendgrid/settings")
    async def update_sendgrid_settings(settings: SendGridSettings, user: dict = Depends(require_tenant)):
        if user.get("role") not in ["admin", "manager"]:
            raise HTTPException(status_code=403, detail="غير مصرح لك")
        existing = await db.system_settings.find_one({"type": "sendgrid_settings"})
        settings_dict = settings.model_dump()
        if settings.api_key and ("..." in settings.api_key or settings.api_key == "***configured***"):
            if existing and existing.get("api_key"):
                settings_dict["api_key"] = existing["api_key"]
        await db.system_settings.update_one(
            {"type": "sendgrid_settings"},
            {"$set": {**settings_dict, "type": "sendgrid_settings", "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )
        return {"success": True, "message": "تم حفظ إعدادات الإشعارات"}

    @router.post("/notifications/sendgrid/test")
    async def test_sendgrid(user: dict = Depends(require_tenant)):
        settings = await db.system_settings.find_one({"type": "sendgrid_settings"})
        if not settings or not settings.get("api_key"):
            raise HTTPException(status_code=400, detail="يرجى إعداد مفتاح SendGrid أولاً")
        user_record = await db.users.find_one({"id": user["id"]})
        if not user_record or not user_record.get("email"):
            raise HTTPException(status_code=400, detail="لم يتم العثور على بريدك الإلكتروني")
        test_html = '<div dir="rtl" style="font-family:Arial;padding:20px;background:#f3f4f6;"><div style="max-width:400px;margin:0 auto;background:white;border-radius:8px;padding:30px;text-align:center;"><h2 style="color:#22c55e;">SendGrid يعمل بنجاح!</h2></div></div>'
        try:
            await send_email_with_sendgrid(user_record["email"], "اختبار SendGrid - NT Commerce", test_html, settings)
            return {"success": True, "message": f"تم إرسال بريد اختباري إلى {user_record['email']}"}
        except Exception as e:
            raise HTTPException(status_code=500, detail="Internal server error")

    @router.post("/notifications/send")
    async def send_notification(request: EmailNotificationRequest, user: dict = Depends(require_tenant)):
        settings = await db.system_settings.find_one({"type": "sendgrid_settings"})
        if not settings or not settings.get("enabled"):
            raise HTTPException(status_code=400, detail="إشعارات البريد غير مفعلة")
        subject = request.subject
        html_content = ""
        if request.notification_type == "new_sale":
            subject = subject or f"عملية بيع جديدة - {request.data.get('invoice_number', '')}"
            html_content = generate_sale_notification_html(request.data)
        elif request.notification_type == "low_stock":
            subject = subject or "تنبيه انخفاض المخزون"
            html_content = generate_low_stock_notification_html(request.data.get("products", []))
        elif request.notification_type == "daily_report":
            subject = subject or f"التقرير اليومي - {datetime.now().strftime('%Y-%m-%d')}"
            html_content = generate_daily_report_html(request.data)
        else:
            html_content = request.data.get("html_content", "<p>إشعار من NT Commerce</p>")
        try:
            await send_email_with_sendgrid(request.recipient_email, subject, html_content, settings)
            await db.notification_logs.insert_one({"id": str(uuid.uuid4()), "type": request.notification_type, "recipient": request.recipient_email, "subject": subject, "status": "sent", "sent_at": datetime.now(timezone.utc).isoformat(), "sent_by": user["id"]})
            return {"success": True, "message": "تم إرسال الإشعار بنجاح"}
        except Exception as e:
            raise HTTPException(status_code=500, detail="Internal server error")

    @router.post("/notifications/check-low-stock")
    async def check_and_notify_low_stock(user: dict = Depends(require_tenant)):
        settings = await db.system_settings.find_one({"type": "sendgrid_settings"})
        if not settings or not settings.get("enabled") or not settings.get("low_stock_notification"):
            return {"success": False, "message": "إشعارات انخفاض المخزون غير مفعلة"}
        low_stock_products = await db.products.find({"$expr": {"$lte": ["$stock", "$min_quantity"]}}).to_list(100)
        if not low_stock_products:
            return {"success": True, "message": "لا توجد منتجات منخفضة المخزون"}
        products_list = [{"name": p.get("name", ""), "stock": p.get("stock", 0), "min_quantity": p.get("min_quantity", 10)} for p in low_stock_products]
        recipient = settings.get("notification_email")
        if not recipient:
            return {"success": False, "message": "يرجى إعداد بريد الإشعارات"}
        html_content = generate_low_stock_notification_html(products_list)
        try:
            await send_email_with_sendgrid(recipient, "تنبيه انخفاض المخزون - NT Commerce", html_content, settings)
            return {"success": True, "message": f"تم إرسال تنبيه بـ {len(products_list)} منتج منخفض المخزون"}
        except Exception as e:
            raise HTTPException(status_code=500, detail="Internal server error")

    @router.post("/notifications/send-daily-report")
    async def send_daily_report(user: dict = Depends(require_tenant)):
        settings = await db.system_settings.find_one({"type": "sendgrid_settings"})
        if not settings or not settings.get("enabled"):
            raise HTTPException(status_code=400, detail="إشعارات البريد غير مفعلة")
        recipient = settings.get("notification_email")
        if not recipient:
            raise HTTPException(status_code=400, detail="يرجى إعداد بريد الإشعارات")
        today = datetime.now(timezone.utc).date()
        today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
        sales = await db.sales.find({"created_at": {"$gte": today_start.isoformat()}}).to_list(1000)
        expenses = await db.expenses.find({"created_at": {"$gte": today_start.isoformat()}}).to_list(1000)
        total_sales = sum(s.get("total", 0) for s in sales)
        total_profit = sum(s.get("profit", 0) for s in sales)
        total_expenses = sum(e.get("amount", 0) for e in expenses)
        product_sales = {}
        for s in sales:
            for item in s.get("items", []):
                pid = item.get("product_id", "")
                product_sales[pid] = product_sales.get(pid, 0) + item.get("quantity", 0)
        top_product_id = max(product_sales, key=product_sales.get) if product_sales else None
        top_product = await db.products.find_one({"id": top_product_id}) if top_product_id else None
        report_data = {"date": today.strftime('%Y-%m-%d'), "total_sales": total_sales, "sales_count": len(sales), "total_profit": total_profit, "total_expenses": total_expenses, "top_product": top_product.get("name", "N/A") if top_product else "N/A", "new_customers": await db.customers.count_documents({"created_at": {"$gte": today_start.isoformat()}}), "new_debts": sum(s.get("remaining", 0) for s in sales if s.get("payment_status") == "partial"), "collected_debts": 0}
        html_content = generate_daily_report_html(report_data)
        try:
            await send_email_with_sendgrid(recipient, f"التقرير اليومي - {today.strftime('%Y-%m-%d')}", html_content, settings)
            return {"success": True, "message": "تم إرسال التقرير اليومي"}
        except Exception as e:
            raise HTTPException(status_code=500, detail="Internal server error")

    # ── Email Settings (Resend) ──

    @router.get("/email/settings")
    async def get_email_settings(user: dict = Depends(require_tenant)):
        settings = await db.system_settings.find_one({"type": "email_settings"}, {"_id": 0})
        if not settings:
            return EmailSettings().model_dump()
        if settings.get("resend_api_key"):
            key = settings["resend_api_key"]
            settings["resend_api_key"] = key[:8] + "..." + key[-4:] if len(key) > 12 else "***configured***"
        return settings

    @router.put("/email/settings")
    async def update_email_settings(settings: EmailSettings, user: dict = Depends(require_tenant)):
        if user.get("role") not in ["admin", "manager"]:
            raise HTTPException(status_code=403, detail="غير مصرح لك بتعديل إعدادات البريد")
        existing = await db.system_settings.find_one({"type": "email_settings"})
        settings_dict = settings.model_dump()
        if settings.resend_api_key and ("..." in settings.resend_api_key or settings.resend_api_key == "***configured***"):
            if existing and existing.get("resend_api_key"):
                settings_dict["resend_api_key"] = existing["resend_api_key"]
        await db.system_settings.update_one(
            {"type": "email_settings"},
            {"$set": {**settings_dict, "type": "email_settings", "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )
        if settings_dict.get("resend_api_key") and "..." not in settings_dict["resend_api_key"]:
            os.environ['RESEND_API_KEY'] = settings_dict["resend_api_key"]
            if RESEND_AVAILABLE:
                resend.api_key = settings_dict["resend_api_key"]
        if settings_dict.get("sender_email"):
            os.environ['SENDER_EMAIL'] = settings_dict["sender_email"]
        return {"success": True, "message": "تم حفظ إعدادات البريد بنجاح"}

    @router.post("/email/test")
    async def test_email(user: dict = Depends(require_tenant)):
        if not RESEND_AVAILABLE:
            raise HTTPException(status_code=500, detail="مكتبة Resend غير متوفرة")
        settings = await db.system_settings.find_one({"type": "email_settings"})
        if not settings or not settings.get("resend_api_key"):
            raise HTTPException(status_code=400, detail="يرجى إدخال مفتاح API أولاً")
        resend.api_key = settings.get("resend_api_key")
        user_record = await db.users.find_one({"id": user["id"]})
        if not user_record or not user_record.get("email"):
            raise HTTPException(status_code=400, detail="لم يتم العثور على بريدك الإلكتروني")
        try:
            params = {"from": settings.get("sender_email", "onboarding@resend.dev"), "to": [user_record["email"]], "subject": "اختبار إعدادات البريد - NT POS", "html": '<div dir="rtl" style="font-family:Arial;padding:20px;background:#f3f4f6;"><div style="max-width:400px;margin:0 auto;background:white;border-radius:8px;padding:30px;text-align:center;"><h2 style="color:#22c55e;">إعدادات البريد تعمل بنجاح!</h2></div></div>'}
            await asyncio.to_thread(resend.Emails.send, params)
            return {"success": True, "message": f"تم إرسال بريد اختباري إلى {user_record['email']}"}
        except Exception as e:
            raise HTTPException(status_code=500, detail="Internal server error")

    @router.post("/email/send-session-report")
    async def send_session_report_email(report_email: SessionReportEmail, user: dict = Depends(require_tenant)):
        if not RESEND_AVAILABLE:
            raise HTTPException(status_code=500, detail="خدمة البريد الإلكتروني غير متوفرة")
        api_key = os.environ.get('RESEND_API_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="مفتاح API للبريد غير موجود")
        sender_email = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
        html_content = generate_session_report_html(report_email.report_data)
        params = {"from": sender_email, "to": [report_email.recipient_email], "subject": f"تقرير غلق الحصة - {datetime.now().strftime('%Y-%m-%d %H:%M')}", "html": html_content}
        try:
            email = await asyncio.to_thread(resend.Emails.send, params)
            await db.email_logs.insert_one({"id": str(uuid.uuid4()), "type": "session_report", "recipient": report_email.recipient_email, "session_id": report_email.session_id, "status": "sent", "sent_at": datetime.now(timezone.utc).isoformat(), "sent_by": user["id"]})
            return {"success": True, "message": f"تم إرسال التقرير إلى {report_email.recipient_email}", "email_id": email.get("id")}
        except Exception as e:
            logger.error(f"Failed to send email: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal server error")

    # ── Smart Reports ──

    @router.get("/smart-reports/settings")
    async def get_smart_report_settings(user: dict = Depends(require_tenant)):
        settings = await db.system_settings.find_one({"type": "smart_reports"}, {"_id": 0})
        if not settings:
            return SmartReportSettings().model_dump()
        return settings

    @router.put("/smart-reports/settings")
    async def update_smart_report_settings(settings: SmartReportSettings, user: dict = Depends(require_tenant)):
        if user.get("role") not in ["admin", "manager"]:
            raise HTTPException(status_code=403, detail="غير مصرح")
        await db.system_settings.update_one(
            {"type": "smart_reports"},
            {"$set": {**settings.model_dump(), "type": "smart_reports", "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )
        return {"success": True}

    @router.get("/smart-reports/last")
    async def get_last_smart_report(user: dict = Depends(require_tenant)):
        report = await db.smart_reports_log.find_one({}, {"_id": 0}, sort=[("sent_at", -1)])
        return report

    @router.get("/smart-reports/preview")
    async def preview_smart_report(user: dict = Depends(require_tenant)):
        today = datetime.now(timezone.utc).date()
        yesterday = today - timedelta(days=1)
        today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
        yesterday_start = datetime.combine(yesterday, datetime.min.time()).replace(tzinfo=timezone.utc)
        today_sales = await db.sales.find({"created_at": {"$gte": today_start.isoformat()}}).to_list(1000)
        yesterday_sales = await db.sales.find({"created_at": {"$gte": yesterday_start.isoformat(), "$lt": today_start.isoformat()}}).to_list(1000)
        today_total = sum(s.get("total", 0) for s in today_sales)
        yesterday_total = sum(s.get("total", 0) for s in yesterday_sales)
        today_profit = sum(s.get("profit", 0) for s in today_sales)
        change = ((today_total - yesterday_total) / yesterday_total) * 100 if yesterday_total > 0 else 0
        low_stock = await db.products.find(low_stock_filter(), {"_id": 0, "name_ar": 1, "name_en": 1, "quantity": 1}).to_list(20)
        low_stock_list = [{"name": p.get("name_ar") or p.get("name_en"), "quantity": p.get("quantity", 0)} for p in low_stock]
        tips = []
        if len(low_stock) > 5:
            tips.append("لديك العديد من المنتجات منخفضة المخزون.")
        if today_total > yesterday_total:
            tips.append(f"مبيعات اليوم أفضل من الأمس بنسبة {change:.1f}%.")
        if today_total < yesterday_total and yesterday_total > 0:
            tips.append("مبيعات اليوم أقل من الأمس. جرب تقديم عروض خاصة.")
        if len(today_sales) > 0:
            tips.append(f"متوسط قيمة الفاتورة اليوم: {today_total / len(today_sales):.2f} دج")
        return {"sales": {"today_total": today_total, "today_count": len(today_sales), "today_profit": today_profit, "change": change}, "low_stock": low_stock_list, "ai_tips": " | ".join(tips) if tips else "لا توجد نصائح حالياً."}

    @router.post("/smart-reports/send-now")
    async def send_smart_report_now(user: dict = Depends(require_tenant)):
        if not RESEND_AVAILABLE:
            raise HTTPException(status_code=500, detail="مكتبة Resend غير متوفرة")
        email_settings = await db.system_settings.find_one({"type": "email_settings"})
        if not email_settings or not email_settings.get("enabled"):
            raise HTTPException(status_code=400, detail="البريد غير مفعل")
        report_settings = await db.system_settings.find_one({"type": "smart_reports"})
        recipients = report_settings.get("daily_report_recipients", "") if report_settings else ""
        if not recipients:
            user_record = await db.users.find_one({"id": user["id"]})
            recipients = user_record.get("email", "") if user_record else ""
        if not recipients:
            raise HTTPException(status_code=400, detail="لا يوجد مستلمين محددين")
        preview = await preview_smart_report(user)
        html_content = f'<div dir="rtl" style="font-family:Arial;max-width:600px;margin:0 auto;padding:20px;"><h1 style="color:#3b82f6;">التقرير اليومي الذكي</h1><p style="color:#666;">{datetime.now().strftime("%Y-%m-%d")}</p><div style="background:#f0fdf4;padding:15px;border-radius:8px;margin:15px 0;"><h3 style="color:#166534;">ملخص المبيعات</h3><p>إجمالي اليوم: <strong>{preview["sales"]["today_total"]:.2f} دج</strong></p><p>عدد المبيعات: <strong>{preview["sales"]["today_count"]}</strong></p></div><div style="background:#f3e8ff;padding:15px;border-radius:8px;margin:15px 0;"><h3 style="color:#7e22ce;">نصائح ذكية</h3><p>{preview["ai_tips"]}</p></div></div>'
        resend.api_key = email_settings.get("resend_api_key")
        try:
            params = {"from": email_settings.get("sender_email", "onboarding@resend.dev"), "to": [r.strip() for r in recipients.split(",")], "subject": f"التقرير اليومي الذكي - {datetime.now().strftime('%Y-%m-%d')}", "html": html_content}
            await asyncio.to_thread(resend.Emails.send, params)
            await db.smart_reports_log.insert_one({"id": str(uuid.uuid4()), "status": "sent", "recipients": recipients, "sent_at": datetime.now(timezone.utc).isoformat()})
            return {"success": True, "message": "تم إرسال التقرير بنجاح"}
        except Exception as e:
            await db.smart_reports_log.insert_one({"id": str(uuid.uuid4()), "status": "failed", "recipients": recipients, "error": str(e), "sent_at": datetime.now(timezone.utc).isoformat()})
            raise HTTPException(status_code=500, detail="Internal server error")

    return router
