# NT Commerce 12.0 - البطاقة الأم للنظام
# خريطة شاملة لجميع الوحدات والميزات

> آخر تحديث: فبراير 2026
> الإحصائيات: 26,293 سطر Backend | 62,506 سطر Frontend | 64 ملف Route | 92 صفحة | 11 روبوت | 145 مجموعة بيانات

---

## 1. الأمان والمصادقة (Security & Auth)

| # | الميزة | Backend | Frontend | قاعدة البيانات | الحالة |
|---|--------|---------|----------|---------------|--------|
| 1.1 | تسجيل الدخول الموحد | `auth_users_routes.py` (497 سطر) | `UnifiedLoginPage.js` | `users`, `login_attempts` | ✅ |
| 1.2 | إدارة المستخدمين | `auth_users_routes.py` | `UsersPage.js` | `users`, `roles` | ✅ |
| 1.3 | الصلاحيات (RBAC) | `permissions_routes.py` (365 سطر) | `PermissionsPage.js` | `users.permissions` | ✅ |
| 1.4 | صلاحيات المبيعات | `families_permissions_routes.py` (891 سطر) | `SalesPermissionsPage.js` | `product_families` | ✅ |
| 1.5 | التحقق بخطوتين (2FA) | `security_routes.py` | `TwoFactorPage.js` | `user_sessions` | ✅ |
| 1.6 | لوحة الأمان | `security_routes.py` | `SecurityDashboardPage.js` | `security_logs`, `blocked_ips`, `fraud_alerts` | ✅ |
| 1.7 | تقييد الطلبات (Rate Limiting) | `main.py` (slowapi) | - | - | ✅ |
| 1.8 | مفاتيح API | `auth_users_routes.py` | `ApiKeysPage.js` | `api_keys` | ✅ |

---

## 2. SaaS متعدد المستأجرين (Multi-Tenant SaaS)

| # | الميزة | Backend | Frontend | قاعدة البيانات | الحالة |
|---|--------|---------|----------|---------------|--------|
| 2.1 | لوحة تحكم SaaS | `saas_routes.py` (1117 سطر), `saas_admin.py` (422 سطر), `saas.py` | `admin/SaasAdminPage.js` | `saas_tenants`, `saas_plans`, `saas_agents` | ✅ |
| 2.2 | إدارة الخطط | `saas_routes.py` | `admin/SaasAdminPage.js` | `saas_plans` | ✅ |
| 2.3 | إدارة المستأجرين | `saas_routes.py` | `admin/SaasAdminPage.js` | `saas_tenants` | ✅ |
| 2.4 | إدارة الوكلاء | `saas_routes.py` | `admin/SaasAdminPage.js` | `saas_agents`, `saas_agent_transactions` | ✅ |
| 2.5 | إدارة الميزات (Feature Flags) | `saas_routes.py` | `admin/FeatureFlagsPage.js` | `saas_tenants.features` | ✅ |
| 2.6 | أخطاء النظام | `system_errors.py` (319 سطر) | `admin/SaasAdminPage.js` | `system_errors` | ✅ |
| 2.7 | المدفوعات / الاشتراكات | `stripe_routes.py`, `saas_routes.py` | `admin/SaasAdminPage.js` | `saas_payments` | ✅ |
| 2.8 | لوحة تحكم المستأجر | - | `TenantDashboardPage.js` (1350 سطر) | - | ✅ |
| 2.9 | لوحة تحكم الوكيل | - | `AgentDashboardPage.js` (876 سطر) | - | ✅ |

---

## 3. نقطة البيع (POS)

| # | الميزة | Backend | Frontend | قاعدة البيانات | الحالة |
|---|--------|---------|----------|---------------|--------|
| 3.1 | نقطة البيع الرئيسية | `sales.py`, `sales_routes.py` (216 سطر) | `POSPage.js` (2314 سطر) ⚠️ | `sales`, `counters` | ✅ |
| 3.2 | تقارير المبيعات المتقدمة | `advanced_sales_routes.py` | `AdvancedSalesReportPage.js` (621 سطر) | `sales` | ✅ |
| 3.3 | سجل المبيعات | `sales_routes.py` | `SalesHistoryPage.js` | `sales`, `sale_audit_logs` | ✅ |
| 3.4 | حصص البيع اليومية | `daily_sessions_routes.py` | `DailySessionsPage.js` (1196 سطر) | `daily_sessions` | ✅ |
| 3.5 | إدارة الصندوق | `cashbox_routes.py` | `CashManagementPage.js` | `cash_boxes`, `transactions` | ✅ |

---

## 4. المنتجات والمخزون (Products & Inventory)

| # | الميزة | Backend | Frontend | قاعدة البيانات | الحالة |
|---|--------|---------|----------|---------------|--------|
| 4.1 | إدارة المنتجات | `products.py`, `products_routes.py` (381 سطر) | `ProductsPage.js` (773 سطر) | `products` | ✅ |
| 4.2 | إضافة/تعديل منتج | `products_routes.py` | `AddProductPage.js`, `EditProductPage.js` | `products` | ✅ |
| 4.3 | تفاصيل المنتج | `products_routes.py` | `ProductDetailPage.js` (611 سطر) | `products` | ✅ |
| 4.4 | عائلات المنتجات | `families_permissions_routes.py` | `ProductFamiliesPage.js` | `product_families`, `categories` | ✅ |
| 4.5 | المخازن | `warehouses.py`, `warehouse_core_routes.py` | `WarehousesPage.js` (647 سطر) | `warehouses`, `stock_transfers` | ✅ |
| 4.6 | جرد المخزون | `products_routes.py` | `InventoryCountPage.js` (1411 سطر) | `inventory_sessions` | ✅ |
| 4.7 | الباركود والطباعة | `printing_routes.py` | `BarcodePrintPage.js` (494 سطر) | `barcode_scans`, `label_designs`, `print_templates` | ✅ |
| 4.8 | تحديث الأسعار بالجملة | `products_routes.py` | `BulkPriceUpdatePage.js` (732 سطر) | `products`, `price_update_logs` | ✅ |
| 4.9 | سجل الأسعار | `products_routes.py` | `PriceHistoryPage.js` | `price_history` | ✅ |
| 4.10 | البضائع المعيبة | `defective_routes.py` (264 سطر) | `DefectiveGoodsPage.js` | `defective_goods`, `defective_inspections`, `disposal_records`, `defect_categories` | ✅ |

---

## 5. المشتريات والموردين (Purchases & Suppliers)

| # | الميزة | Backend | Frontend | قاعدة البيانات | الحالة |
|---|--------|---------|----------|---------------|--------|
| 5.1 | المشتريات | `purchases.py`, `purchases_routes.py` (217 سطر) | `PurchasesPage.js` (1773 سطر) | `purchases` | ✅ |
| 5.2 | الموردين | `suppliers.py`, `suppliers_core_routes.py` | `SuppliersPage.js` (757 سطر) | `suppliers` | ✅ |
| 5.3 | عائلات الموردين | `suppliers_core_routes.py` | `SupplierFamiliesPage.js` | `supplier_families` | ✅ |
| 5.4 | تتبع الموردين | `supplier_tracking_routes.py` | `SupplierTrackingPage.js` | `supplier_goods`, `supplier_goods_orders`, `supplier_returns`, `supplier_advance_payments` | ✅ |

---

## 6. الزبائن والمالية (Customers & Finance)

| # | الميزة | Backend | Frontend | قاعدة البيانات | الحالة |
|---|--------|---------|----------|---------------|--------|
| 6.1 | إدارة الزبائن | `customers.py`, `customers_routes.py` | `CustomersPage.js` (1070 سطر) | `customers` | ✅ |
| 6.2 | عائلات الزبائن | `customers_routes.py` | `CustomerFamiliesPage.js` | `customer_families` | ✅ |
| 6.3 | ديون الزبائن | `customer_debts_routes.py` | `CustomerDebtsPage.js` (890 سطر) | `debts`, `debt_payments` | ✅ |
| 6.4 | الديون العامة | `debts_routes.py` | `DebtsPage.js` | `debts`, `debt_payments`, `debt_reminder_dismissals` | ✅ |
| 6.5 | المدفوعات | `sales_routes.py` | `PaymentsPage.js` (652 سطر) | `payments`, `payment_transactions` | ✅ |
| 6.6 | المصاريف | `expenses_routes.py` | `ExpensesPage.js` (749 سطر) | `expenses` | ✅ |
| 6.7 | المحفظة | `wallet_routes.py` (205 سطر) | `WalletPage.js` | `wallets`, `wallet_transactions`, `wallet_transfers` | ✅ |
| 6.8 | العملات | `currency_routes.py` | `CurrenciesPage.js` | `currencies`, `currency_settings`, `currency_rate_history` | ✅ |
| 6.9 | البنك | `banking_routes.py` (218 سطر) | `BankingPage.js` | `bank_accounts`, `bank_transactions`, `bank_reconciliations` | ✅ |
| 6.10 | الضرائب | `tax_routes.py` (315 سطر) | `TaxReportsPage.js` | `tax_rates`, `tax_declarations` | ✅ |
| 6.11 | نسب الربح | `stats_routes.py` | `ProfitRatesPage.js` | `sales`, `products` | ✅ |

---

## 7. الذكاء الاصطناعي (AI)

| # | الميزة | Backend | Frontend | الحالة |
|---|--------|---------|----------|--------|
| 7.1 | المحاسب الذكي (Chat) | `ai_assistant_routes.py` | `AIChatPage.js` | ✅ |
| 7.2 | الوكلاء الذكيين | `ai_assistant_routes.py` | `AIAgentsPage.js` | ✅ |
| 7.3 | التقارير الذكية | `ai_assistant_routes.py` | `SmartReportsPage.js` | ✅ |
| 7.4 | لوحة التحكم الذكية | `stats_routes.py` | `SmartDashboardPage.js` | ✅ |
| 7.5 | التقارير التلقائية | `ai_assistant_routes.py` | `AutoReportsPage.js` | ✅ |

### 7.6 الروبوتات الذكية (11 روبوت)

| # | الروبوت | الملف | الوظيفة |
|---|---------|-------|---------|
| 7.6.1 | روبوت العملاء | `customer_robot.py` | تحليل سلوك العملاء والتوصيات |
| 7.6.2 | روبوت الديون | `debt_robot.py` | متابعة الديون والتذكيرات |
| 7.6.3 | روبوت المخزون | `inventory_robot.py` | تنبيهات النقص وإعادة الطلب |
| 7.6.4 | روبوت الصيانة | `maintenance_robot.py` | متابعة طلبات الإصلاح |
| 7.6.5 | روبوت الإشعارات | `notification_robot.py` | إرسال الإشعارات التلقائية |
| 7.6.6 | روبوت التوقعات | `prediction_robot.py` | توقعات المبيعات والطلب |
| 7.6.7 | روبوت التسعير | `pricing_robot.py` | اقتراحات تسعير ذكية |
| 7.6.8 | روبوت الأرباح | `profit_robot.py` | تحليل الأرباح والخسائر |
| 7.6.9 | روبوت الإصلاح | `repair_robot.py` | تحليل بيانات الإصلاح |
| 7.6.10 | روبوت التقارير | `report_robot.py` | إنشاء تقارير تلقائية |
| 7.6.11 | روبوت الموردين | `supplier_robot.py` | تقييم الموردين والأداء |

**المدير**: `robot_manager.py` - تشغيل/إيقاف/إعادة تشغيل الروبوتات

---

## 8. الإصلاحات والصيانة (Repairs)

| # | الميزة | Backend | Frontend | قاعدة البيانات | الحالة |
|---|--------|---------|----------|---------------|--------|
| 8.1 | استقبال أجهزة | `repair_routes.py` (237 سطر) | `RepairReceptionPage.js` (586 سطر) | `repair_tickets` | ✅ |
| 8.2 | تتبع الإصلاحات | `repair_routes.py` | `RepairTrackingPage.js` (895 سطر) | `repair_tickets`, `repair_history`, `technicians` | ✅ |
| 8.3 | قطع الغيار | `repair_routes.py` | `SparePartsPage.js` (654 سطر) | `spare_parts`, `part_usage` | ✅ |

---

## 9. الخدمات (Services)

| # | الميزة | Backend | Frontend | قاعدة البيانات | الحالة |
|---|--------|---------|----------|---------------|--------|
| 9.1 | فليكسي (Flexy) | `recharge_sim_routes.py` (431 سطر) | `FlexyServicePage.js` | `recharges`, `recharge_logs` | ✅ |
| 9.2 | أيدوم (Idoom) | `recharge_sim_routes.py` | `IdoomServicePage.js` | `recharges` | ✅ |
| 9.3 | البطاقات | `recharge_sim_routes.py` | `CardsServicePage.js` | `recharges` | ✅ |
| 9.4 | إدارة الشرائح (SIM) | `recharge_sim_routes.py` | `SimManagementPage.js` (503 سطر) | `sim_slots`, `sim_balance_logs` | ✅ |
| 9.5 | العمليات | - | `OperationsPage.js` | - | ✅ |
| 9.6 | التحويلات | - | `TransfersPage.js` | - | ✅ |
| 9.7 | الدليل الهاتفي | - | `PhoneDirectoryPage.js` | - | ✅ |
| 9.8 | الشحن والتوصيل | `shipping_loyalty_routes.py` (511 سطر) | `ShippingPage.js` | `shipping_settings` | ✅ |
| 9.9 | برنامج الولاء | `shipping_loyalty_routes.py` | `LoyaltyPage.js` (504 سطر) | `loyalty_settings`, `loyalty_transactions` | ✅ |
| 9.10 | خدمات بالجملة | - | `WholesaleServicesPage.js` | - | ✅ |

---

## 10. التقارير والإحصائيات (Reports & Analytics)

| # | الميزة | Backend | Frontend | الحالة |
|---|--------|---------|----------|--------|
| 10.1 | التقارير العامة | `reports.py` | `ReportsPage.js` (558 سطر) | ✅ |
| 10.2 | الإحصائيات المتقدمة | `stats_routes.py` (380 سطر) | `AdvancedAnalyticsPage.js` | ✅ |
| 10.3 | تقارير المبيعات المتقدمة | `advanced_sales_routes.py` | `AdvancedSalesReportPage.js` | ✅ |
| 10.4 | لوحة التحكم الرئيسية | `stats_routes.py` | `DashboardPage.js` | ✅ |

---

## 11. الإشعارات والتواصل (Notifications & Communication)

| # | الميزة | Backend | Frontend | قاعدة البيانات | الحالة |
|---|--------|---------|----------|---------------|--------|
| 11.1 | الإشعارات | `notification_routes.py`, `notifications_routes.py` (494 سطر) | `NotificationsPage.js` (563 سطر) | `notifications`, `notification_logs` | ✅ |
| 11.2 | الإشعارات الذكية | `smart_notifications_routes.py` | `SmartNotificationsPage.js` | `smart_notifications` | ✅ |
| 11.3 | Push Notifications | `push_notification_routes.py` | - | `push_notifications`, `push_subscriptions` | ✅ |
| 11.4 | إشعارات البريد | `sendgrid_email_routes.py` (376 سطر), `sendgrid_integration_routes.py` | `EmailNotificationsPage.js` | `email_logs`, `email_integration_settings` | ⏳ مفتاح مطلوب |
| 11.5 | واتساب | `whatsapp_routes.py` (249 سطر), `whatsapp_integration_routes.py` (207 سطر) | `WhatsAppPage.js` | `whatsapp_messages`, `whatsapp_config`, `whatsapp_logs` | ⏳ مفتاح مطلوب |
| 11.6 | SMS التسويقي | `sms_marketing_routes.py` | - | `sms_campaigns`, `sms_logs`, `sms_settings` | ✅ |
| 11.7 | تنبيهات الموظفين | - | `EmployeeAlertsPage.js` | `employee_alerts` | ✅ |
| 11.8 | تحديثات النظام | - | `SystemUpdatesPage.js` (507 سطر) | `system_announcements` | ✅ |

---

## 12. الموارد البشرية (HR)

| # | الميزة | Backend | Frontend | قاعدة البيانات | الحالة |
|---|--------|---------|----------|---------------|--------|
| 12.1 | إدارة الموظفين | `employees_routes.py` (211 سطر) | `EmployeesPage.js` (574 سطر) | `employees`, `employee_attendance`, `employee_advances` | ✅ |
| 12.2 | إدارة المهام | `task_chat_routes.py` | `TaskManagementPage.js` | `tasks`, `task_comments` | ✅ |
| 12.3 | الدردشة الداخلية | `task_chat_routes.py` | `InternalChatPage.js` | `chat_rooms`, `chat_messages` | ✅ |

---

## 13. الإعدادات والنظام (Settings & System)

| # | الميزة | Backend | Frontend | قاعدة البيانات | الحالة |
|---|--------|---------|----------|---------------|--------|
| 13.1 | الإعدادات العامة | `settings_routes.py` (203 سطر) | `SettingsPage.js` (2757 سطر) ⚠️ | `settings`, `system_settings`, `user_settings` | ✅ |
| 13.2 | إعدادات الطباعة | `printing_routes.py` | `SettingsPage.js` (tab: printer) | `printer_settings`, `print_logs` | ✅ |
| 13.3 | إعدادات الصوت | - | `SettingsPage.js` (tab: sound) | - | ✅ |
| 13.4 | إعدادات USB | - | `SettingsPage.js` (tab: usb) | - | ✅ |
| 13.5 | إعدادات التاريخ/الوقت | - | `DateTimeSettingsPage.js` | - | ✅ |
| 13.6 | النسخ الاحتياطي | `backup_routes.py` (211 سطر) | `BackupSystemPage.js` | `backups`, `backup_requests`, `backup_schedules`, `database_backups` | ✅ |
| 13.7 | ترتيب القائمة الجانبية | `settings_routes.py` | `SidebarSettingsPage.js` (1153 سطر) | `settings` | ✅ |
| 13.8 | قاعدة البيانات | `database_routes.py` (483 سطر) | - | `database_operation_logs` | ✅ |
| 13.9 | مزامنة النظام | `system_sync_routes.py` (861 سطر) | - | `sync_configs`, `sync_logs` | ✅ |
| 13.10 | الأداء | `performance_routes.py` | - | - | ✅ |

---

## 14. التكاملات الخارجية (Integrations)

| # | التكامل | Backend | Frontend | الحالة |
|---|---------|---------|----------|--------|
| 14.1 | Stripe (الدفع) | `stripe_routes.py` | `admin/SaasAdminPage.js` | ✅ مفعّل |
| 14.2 | OpenAI GPT-4o | `ai_assistant_routes.py` | `AIChatPage.js` | ✅ مفعّل |
| 14.3 | Redis Cache | `services/cache_service.py` | - | ✅ مفعّل |
| 14.4 | SendGrid (Email) | `sendgrid_email_routes.py`, `sendgrid_integration_routes.py` | `EmailNotificationsPage.js` | ⏳ بانتظار المفتاح |
| 14.5 | WhatsApp Business | `whatsapp_integration_routes.py` | `WhatsAppPage.js` | ⏳ بانتظار المفتاح |
| 14.6 | Yalidine (الشحن) | `yalidine_integration_routes.py` (221 سطر) | `ShippingPage.js` | ⏳ بانتظار المفتاح |
| 14.7 | WooCommerce | `online_store_routes.py` (260 سطر) | `WooCommercePage.js` | ✅ |
| 14.8 | OCR الفواتير | `ocr_invoice_routes.py` (239 سطر) | - | ✅ |
| 14.9 | حالة التكاملات | - | `IntegrationStatusPage.jsx` | ✅ |

---

## 15. المتجر الإلكتروني (Online Store)

| # | الميزة | Backend | Frontend | قاعدة البيانات | الحالة |
|---|--------|---------|----------|---------------|--------|
| 15.1 | المتجر العام | `online_store_routes.py` | `store/PublicStorePage.js` | `store_products`, `store_orders`, `store_settings`, `store_slugs` | ✅ |
| 15.2 | إدارة المتجر | `online_store_routes.py` | `store/StoreManagementPage.js` | `store_products`, `branding_settings` | ✅ |

---

## 16. الصفحات العامة (Landing Pages)

| # | الميزة | Frontend | الحالة |
|---|--------|----------|--------|
| 16.1 | الصفحة الرئيسية | `landing/LandingPage.js` | ✅ |
| 16.2 | صفحة الأسعار | `landing/PricingPage.js` | ✅ |
| 16.3 | صفحة التسجيل | `landing/RegisterPage.js` | ✅ |

---

## البنية التحتية (Infrastructure)

| العنصر | الملف | الوصف |
|--------|-------|-------|
| نقطة الدخول Backend | `main.py` (942 سطر) | FastAPI + middleware + startup |
| نقطة الدخول Server | `server.py` | Supervisor stub |
| النماذج الأساسية | `models/schemas.py` | Pydantic models |
| النماذج الإضافية | `models/extra_schemas.py` (228 سطر) | نماذج مستخرجة |
| Pagination | `utils/pagination.py` | مساعد الصفحات |
| Password Validator | `utils/password_validator.py` | قواعد قوة كلمة المرور |
| Cache Service | `services/cache_service.py` | مدير Redis |
| API Client | `lib/apiClient.js` | عميل Axios مركزي |
| Error Boundary | `components/ErrorBoundary.js` | التعامل مع أخطاء React |
| Layout/Sidebar | `components/Layout.js` | القائمة الجانبية (7 أقسام) |
| DB Reset | `reset_db.py` | إعادة تعيين قاعدة البيانات |

---

## مجموعات قاعدة البيانات (145 Collection)

### الأساسية
`users`, `roles`, `settings`, `system_settings`, `user_settings`, `counters`

### المبيعات والمشتريات
`sales`, `sale_audit_logs`, `purchases`, `invoices`, `invoice_templates`, `daily_sessions`

### المنتجات والمخزون
`products`, `product_families`, `categories`, `warehouses`, `stock_transfers`, `inventory_sessions`, `price_history`, `price_update_logs`, `barcode_scans`, `label_designs`

### الزبائن
`customers`, `customer_families`, `customer_blacklist`

### الموردين
`suppliers`, `supplier_families`, `supplier_goods`, `supplier_goods_orders`, `supplier_returns`, `supplier_advance_payments`

### المالية
`debts`, `debt_payments`, `debt_reminder_dismissals`, `expenses`, `payments`, `payment_transactions`, `payment_gateways`, `transactions`, `cash_boxes`, `wallets`, `wallet_transactions`, `wallet_transfers`

### البنك والعملات
`bank_accounts`, `bank_transactions`, `bank_reconciliations`, `currencies`, `currency_settings`, `currency_rate_history`

### الضرائب
`tax_rates`, `tax_declarations`, `journal_entries`

### الموظفين
`employees`, `employee_attendance`, `employee_advances`, `employee_alerts`, `attendance`, `advances`

### الإصلاحات
`repair_tickets`, `repairs`, `repair_history`, `spare_parts`, `part_usage`, `technicians`

### البضائع المعيبة
`defective_goods`, `defective_inspections`, `disposal_records`, `defect_categories`

### الخدمات (شحن/فليكسي)
`recharges`, `recharge_logs`, `sim_slots`, `sim_balance_logs`

### SaaS
`saas_tenants`, `saas_plans`, `saas_agents`, `saas_agent_transactions`, `saas_payments`, `tenants`

### الإشعارات
`notifications`, `notification_logs`, `notification_preferences`, `notification_settings`, `smart_notifications`, `push_notifications`, `push_notification_logs`, `push_subscriptions`

### البريد والواتساب
`email_logs`, `email_integration_settings`, `whatsapp_messages`, `whatsapp_config`, `whatsapp_incoming`, `whatsapp_logs`, `whatsapp_settings`, `whatsapp_integration_settings`

### SMS
`sms_campaigns`, `sms_logs`, `sms_settings`

### الذكاء الاصطناعي
`ai_chat_history`, `ai_insights`, `chat_sessions`, `smart_reports_log`, `auto_reports`, `daily_reports`

### المهام والدردشة
`tasks`, `task_comments`, `agent_tasks`, `chat_rooms`, `chat_messages`

### النسخ الاحتياطي والأمان
`backups`, `backup_requests`, `backup_schedules`, `backup_downloads`, `database_backups`, `database_operation_logs`, `security_logs`, `blocked_ips`, `fraud_alerts`, `login_attempts`, `user_sessions`, `audit_logs`, `system_logs`

### المتجر الإلكتروني
`store_products`, `store_orders`, `store_settings`, `store_slugs`, `branding_settings`

### الشحن والولاء
`shipping_settings`, `loyalty_settings`, `loyalty_transactions`

### WooCommerce
`woocommerce_settings`

### Yalidine
`yalidine_settings`, `yalidine_parcels`

### النظام
`system_errors`, `system_announcements`, `sync_configs`, `sync_logs`, `api_keys`, `search_history`, `search_suggestions`, `import_logs`, `print_templates`, `print_logs`, `printer_settings`, `collection_reports`, `reorder_recommendations`, `return_tracking`, `accounts`

---

## ⚠️ ملفات تحتاج إعادة هيكلة

| الملف | الأسطر | السبب |
|-------|--------|-------|
| `SettingsPage.js` | 2,757 | 8 تبويبات في ملف واحد |
| `POSPage.js` | 2,314 | 10 أقسام في ملف واحد |
| `PurchasesPage.js` | 1,773 | كبير جداً |
| `InventoryCountPage.js` | 1,411 | كبير |
| `TenantDashboardPage.js` | 1,350 | كبير |
| `DailySessionsPage.js` | 1,196 | كبير |
| `SidebarSettingsPage.js` | 1,153 | كبير |
| `saas_routes.py` | 1,117 | أكبر ملف route |
| `families_permissions_routes.py` | 891 | كبير |
| `system_sync_routes.py` | 861 | كبير |

---

## القائمة الجانبية (7 أقسام)

```
1. الرئيسية         → لوحة التحكم، لوحة التحكم الذكية
2. المبيعات والمشتريات → POS، فواتير، حصص، مشتريات، موردين
3. المخزون           → منتجات، عائلات، مخازن، جرد، باركود
4. الزبائن والمالية   → زبائن، ديون، صندوق، مصاريف، ضرائب، بنك
5. الذكاء الاصطناعي   → محاسب ذكي، وكلاء، روبوتات، تقارير
6. الخدمات           → فليكسي، أيدوم، بطاقات، إصلاحات، متجر
7. الإعدادات والإدارة → مستخدمين، صلاحيات، موظفين، إشعارات، نسخ احتياطي
```

