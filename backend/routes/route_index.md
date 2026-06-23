# NT Commerce - هيكل الـ Backend (الهيكل المعياري الحالي)

## البنية الحالية: main.py + routes/ منفصلة

### main.py (757 سطر)
يحتوي على: auth helpers، JWT، middleware، robot/cache endpoints، startup.

### ملفات routes/ (الوحدات المنفصلة)

| الملف | الوصف |
|-------|-------|
| `products_routes.py` | CRUD المنتجات، lots، suppliers، history، barcode |
| `sales_routes.py` | المبيعات، إرجاع، ترقيم الصفحات |
| `purchases_routes.py` | المشتريات، رصيد الموردين |
| `customers_routes.py` | العملاء، القائمة السوداء |
| `suppliers_core_routes.py` | الموردين CRUD |
| `expenses_routes.py` | المصروفات |
| `daily_sessions_routes.py` | الجلسات اليومية (POS) |
| `cashbox_routes.py` | الصناديق النقدية |
| `installments_routes.py` | التقسيط |
| `debts_routes.py` | الديون والمتابعة |
| `customer_debts_routes.py` | ديون العملاء |
| `employees_routes.py` | الموظفين |
| `permissions_routes.py` | الصلاحيات والأدوار |
| `auth_users_routes.py` | إدارة المستخدمين |
| `warehouse_core_routes.py` | المخازن |
| `stats_routes.py` | الإحصائيات والتقارير |
| `advanced_sales_routes.py` | تقارير المبيعات المتقدمة |
| `search_routes.py` | البحث الموحد |
| `import_export_routes.py` | استيراد/تصدير البيانات |
| `settings_routes.py` | الإعدادات |
| `notification_routes.py` | Push notifications |
| `notifications_routes.py` | إشعارات النظام |
| `smart_notifications_routes.py` | الإشعارات الذكية |
| `families_permissions_routes.py` | صلاحيات العائلات |
| `tax_routes.py` | الضرائب |
| `currency_routes.py` | العملات |
| `banking_routes.py` | البنوك |
| `repair_routes.py` | ورشة الإصلاح |
| `defective_routes.py` | المنتجات المعيبة |
| `digital_panel_routes.py` | اللوحة الرقمية (IPTV/بطاقات) |
| `recharge_sim_routes.py` | شحن الرصيد |
| `shipping_loyalty_routes.py` | الشحن والولاء |
| `wallet_routes.py` | المحافظ |
| `saas_routes.py` | إدارة SaaS/المستأجرين |
| `agent_hierarchy_routes.py` | تسلسل الوكلاء |
| `stripe_routes.py` | Stripe |
| `online_store_routes.py` | المتجر الإلكتروني |
| `security_routes.py` | لوحة الأمان |
| `backup_routes.py` | النسخ الاحتياطي |
| `database_routes.py` | إدارة قاعدة البيانات |
| `performance_routes.py` | قياس الأداء |
| `printing_routes.py` | الطباعة |
| `ocr_invoice_routes.py` | OCR للفواتير |
| `task_chat_routes.py` | المهام والمحادثة الداخلية |
| `sms_marketing_routes.py` | SMS |
| `whatsapp_routes.py` | WhatsApp |
| `whatsapp_integration_routes.py` | WhatsApp integration |
| `sendgrid_email_routes.py` | SendGrid |
| `sendgrid_integration_routes.py` | SendGrid integration |
| `yalidine_integration_routes.py` | Yalidine |
| `system_sync_routes.py` | المزامنة |
| `system_errors.py` | أخطاء النظام |
| `push_notification_routes.py` | Browser push |
| `utility_routes.py` | أدوات متنوعة |
| `ai_assistant_routes.py` | مساعد AI |
| `supplier_tracking_routes.py` | تتبع الموردين |
| `saas/` | مسارات SaaS المتقدمة (tenants, agents, catalog, recharge) |
| `accounting/` | المحاسبة |
| `ai/` | AI chat |
