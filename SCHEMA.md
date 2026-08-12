# NT Commerce — مخطط قاعدة بيانات المستأجر

> مولّد تلقائياً من القاعدة الذهبية `template_tenant` — 2026-08-12 16:45 UTC

## دورة حياة قاعدة المستأجر

1. **القالب الذهبي** `template_tenant`: المرجع الوحيد للمخطط (مجموعات + فهارس + بيانات أساسية).
2. **التسجيل**: `copy_template_to_tenant()` تنسخ القالب لقاعدة `tenant_<id>` ثم `migrate_database()` تطبق الترقيات المعلقة فوراً.
3. **الترقيات المرقمة** `backend/migrations/NNN_*.py`: تُطبق بالترتيب وتُسجل في `migration_log` لكل قاعدة.
4. **الطبيب**: فحص أسبوعي تلقائي (روبوت سلامة البيانات) + يدوي عبر `/api/saas/template/doctor-all?fix=true`.
5. **الحذف المتتالي**: أرشفة JSON كاملة في `/backups/` ثم حذف القاعدة وكل المراجع، مع سجل تدقيق.
6. **اختبار الاستعادة**: شهري تلقائياً أو يدوياً عبر `/api/saas/restore-test`.

## المجموعات (144)

| المجموعة | الفهارس | مستندات البذور | الوصف |
|---|---|---|---|
| `accounts` | 3 | — |  |
| `ai_action_logs` | 2 | — |  |
| `ai_insights` | 4 | — |  |
| `ai_pricing_rules` | 3 | — |  |
| `api_keys` | 2 | — |  |
| `appearance_settings` | 1 | — |  |
| `audit_logs_v2` | 4 | — |  |
| `automation_rules` | 2 | — |  |
| `backups` | 2 | — |  |
| `blog_posts` | 5 | — |  |
| `cash_boxes` | 0 | 4 | الصناديق المالية (نقدي/بنكي/أجل/أخرى) |
| `channel_sync_log` | 5 | — |  |
| `chat_sessions` | 2 | — |  |
| `chatbot_configs` | 2 | — |  |
| `cms_pages` | 3 | — |  |
| `commissions` | 7 | — |  |
| `counters` | 0 | 4 | عدّادات الترقيم التسلسلي (migration 001) |
| `coupon_usage` | 4 | — |  |
| `coupons` | 4 | — |  |
| `couriers` | 4 | — |  |
| `currencies` | 1 | 3 | العملات (DZD/USD/EUR) |
| `currency_rate_history` | 1 | — |  |
| `currency_settings` | 1 | 1 | إعدادات العملة الافتراضية |
| `customer_addresses` | 3 | — |  |
| `customer_families` | 0 | 1 | عائلات العملاء |
| `customer_interactions` | 4 | — |  |
| `customer_segments` | 3 | — |  |
| `customer_wishlists` | 4 | — |  |
| `customers` | 2 | 1 | بيانات أساسية |
| `daily_reports` | 2 | — |  |
| `daily_sessions` | 2 | — |  |
| `dashboard_widgets` | 2 | — |  |
| `defect_categories` | 0 | 5 | تصنيفات عيوب الصيانة |
| `delivery_routes` | 4 | — |  |
| `delivery_schedules` | 3 | — |  |
| `delivery_zones` | 3 | — |  |
| `discount_rules` | 2 | — |  |
| `ecom_integrations` | 2 | — |  |
| `ecom_leads` | 5 | — |  |
| `ecom_orders` | 6 | — |  |
| `ecom_shipping_labels` | 8 | — |  |
| `email_templates` | 2 | — |  |
| `expenses` | 4 | — |  |
| `export_jobs` | 2 | — |  |
| `family_capital` | 4 | — |  |
| `faq_entries` | 3 | — |  |
| `financial_transactions` | 10 | — |  |
| `flash_sales` | 2 | — |  |
| `import_jobs` | 2 | — |  |
| `integration_configs` | 2 | — |  |
| `integration_logs` | 1 | — |  |
| `integrations` | 2 | — |  |
| `inventory` | 4 | — |  |
| `inventory_counts` | 2 | — |  |
| `inventory_movements` | 4 | — |  |
| `inventory_sync_rules` | 1 | — |  |
| `invoice_templates` | 0 | 3 | قوالب الفواتير (بسيط/مفصل/حراري) |
| `invoices` | 11 | — |  |
| `ip_allowlist` | 2 | — |  |
| `journal_entries` | 4 | — |  |
| `lead_activity_log` | 3 | — |  |
| `lead_campaigns` | 2 | — |  |
| `lead_distribution_rules` | 2 | — |  |
| `lead_notes` | 3 | — |  |
| `login_history` | 1 | — |  |
| `loyalty_members` | 1 | — |  |
| `loyalty_programs` | 2 | — |  |
| `loyalty_rewards` | 2 | — |  |
| `loyalty_settings` | 0 | 1 | إعدادات نقاط الولاء |
| `loyalty_transactions` | 2 | — |  |
| `media_gallery` | 2 | — |  |
| `migration_log` | 0 | 1 | سجل الترقيات المنفذة على هذه القاعدة |
| `notification_delivery_log` | 4 | — |  |
| `notification_inbox` | 3 | — |  |
| `notification_preferences` | 1 | — |  |
| `notification_schedules` | 2 | — |  |
| `notification_settings` | 2 | — |  |
| `notification_templates` | 4 | — |  |
| `order_refunds` | 2 | — |  |
| `order_returns` | 3 | — |  |
| `order_templates` | 2 | — |  |
| `order_timelines` | 2 | — |  |
| `payment_methods` | 5 | — |  |
| `payment_settings` | 1 | — |  |
| `payments` | 4 | — |  |
| `payouts` | 5 | — |  |
| `pickup_requests` | 2 | — |  |
| `points_transactions` | 2 | — |  |
| `price_history` | 3 | — |  |
| `processed_events` | 4 | — |  |
| `product_audit_log` | 4 | — |  |
| `product_bundles` | 2 | — |  |
| `product_families` | 0 | 1 | عائلات المنتجات |
| `product_promotions` | 3 | — |  |
| `product_ratings` | 2 | — |  |
| `product_reviews` | 6 | — |  |
| `product_tags` | 2 | — |  |
| `product_variants` | 4 | — |  |
| `products` | 5 | — |  |
| `profitability_settings` | 1 | — |  |
| `promo_activity_log` | 2 | — |  |
| `purchase_orders` | 4 | — |  |
| `purchases` | 3 | — |  |
| `refunds` | 5 | — |  |
| `related_products` | 3 | — |  |
| `review_reports` | 3 | — |  |
| `review_requests` | 3 | — |  |
| `review_votes` | 2 | — |  |
| `reviews` | 5 | — |  |
| `reward_redemptions` | 1 | — |  |
| `roles` | 2 | — |  |
| `sales` | 3 | — |  |
| `scheduled_reports` | 2 | — |  |
| `search_history` | 1 | — |  |
| `settings` | 0 | 1 | الإعدادات العامة للنظام |
| `shipping_activity_log` | 2 | — |  |
| `shipping_settings` | 2 | — |  |
| `stock_adjustments` | 2 | — |  |
| `stock_alerts` | 3 | — |  |
| `stock_history` | 3 | — |  |
| `stock_movements` | 5 | — |  |
| `stock_transfers` | 3 | — |  |
| `subscription_plans` | 2 | — |  |
| `subscriptions` | 3 | — |  |
| `supplier_families` | 0 | 1 | عائلات الموردين |
| `suppliers` | 2 | 1 | بيانات أساسية |
| `sync_schedules` | 3 | — |  |
| `tax_declarations` | 2 | — |  |
| `tax_rates` | 2 | 3 | معدلات الضريبة (VAT 19%/9% + TAP 1.5%) |
| `transactions` | 2 | — |  |
| `usage_records` | 2 | — |  |
| `user_groups` | 2 | — |  |
| `user_sessions` | 2 | — |  |
| `vendor_orders` | 2 | — |  |
| `vendor_payouts` | 2 | — |  |
| `vendor_products` | 3 | — |  |
| `vendor_reviews` | 2 | — |  |
| `vendors` | 3 | — |  |
| `warehouses` | 3 | 1 | المستودع الرئيسي |
| `webhook_deliveries` | 1 | — |  |
| `webhooks` | 2 | — |  |
| `whatsapp_messages` | 4 | — |  |
| `workflow_executions` | 1 | — |  |
| `workflows` | 2 | — |  |

## تفاصيل الفهارس غير الافتراضية

| المجموعة | الفهرس | المفاتيح | فريد |
|---|---|---|---|
| `accounts` | `id_1` | id:1 | نعم |
| `accounts` | `code_1` | code:1 | نعم |
| `accounts` | `account_type_1` | account_type:1 |  |
| `ai_action_logs` | `tenant_id_1` | tenant_id:1 |  |
| `ai_action_logs` | `created_at_1` | created_at:1 |  |
| `ai_insights` | `id_1` | id:1 | نعم |
| `ai_insights` | `insight_type_1` | insight_type:1 |  |
| `ai_insights` | `priority_1` | priority:1 |  |
| `ai_insights` | `is_dismissed_1` | is_dismissed:1 |  |
| `ai_pricing_rules` | `id_1` | id:1 | نعم |
| `ai_pricing_rules` | `tenant_id_1` | tenant_id:1 |  |
| `ai_pricing_rules` | `tenant_id_1_is_active_1` | tenant_id:1, is_active:1 |  |
| `api_keys` | `id_1` | id:1 | نعم |
| `api_keys` | `tenant_id_1_key_1` | tenant_id:1, key:1 | نعم |
| `appearance_settings` | `tenant_id_1` | tenant_id:1 | نعم |
| `audit_logs_v2` | `id_1` | id:1 | نعم |
| `audit_logs_v2` | `tenant_id_1_entity_type_1_entity_id_1` | tenant_id:1, entity_type:1, entity_id:1 |  |
| `audit_logs_v2` | `tenant_id_1_created_at_-1` | tenant_id:1, created_at:-1 |  |
| `audit_logs_v2` | `tenant_id_1_user_id_1` | tenant_id:1, user_id:1 |  |
| `automation_rules` | `id_1` | id:1 | نعم |
| `automation_rules` | `is_active_1_priority_-1` | is_active:1, priority:-1 |  |
| `backups` | `id_1` | id:1 | نعم |
| `backups` | `tenant_id_1_created_at_-1` | tenant_id:1, created_at:-1 |  |
| `blog_posts` | `id_1` | id:1 | نعم |
| `blog_posts` | `slug_1` | slug:1 |  |
| `blog_posts` | `is_published_1_created_at_-1` | is_published:1, created_at:-1 |  |
| `blog_posts` | `category_1` | category:1 |  |
| `blog_posts` | `tags_1` | tags:1 |  |
| `channel_sync_log` | `id_1` | id:1 | نعم |
| `channel_sync_log` | `integration_id_1_created_at_-1` | integration_id:1, created_at:-1 |  |
| `channel_sync_log` | `channel_1_created_at_-1` | channel:1, created_at:-1 |  |
| `channel_sync_log` | `action_1` | action:1 |  |
| `channel_sync_log` | `status_1` | status:1 |  |
| `chat_sessions` | `id_1` | id:1 | نعم |
| `chat_sessions` | `user_id_1` | user_id:1 |  |
| `chatbot_configs` | `id_1` | id:1 | نعم |
| `chatbot_configs` | `tenant_id_1` | tenant_id:1 |  |
| `cms_pages` | `id_1` | id:1 | نعم |
| `cms_pages` | `slug_1` | slug:1 |  |
| `cms_pages` | `is_published_1` | is_published:1 |  |
| `commissions` | `id_1` | id:1 | نعم |
| `commissions` | `tenant_id_1` | tenant_id:1 |  |
| `commissions` | `agent_id_1` | agent_id:1 |  |
| `commissions` | `sale_id_1` | sale_id:1 |  |
| `commissions` | `status_1` | status:1 |  |
| `commissions` | `created_at_1` | created_at:1 |  |
| `commissions` | `tenant_id_1_agent_id_1_status_1` | tenant_id:1, agent_id:1, status:1 |  |
| `coupon_usage` | `id_1` | id:1 | نعم |
| `coupon_usage` | `coupon_id_1_used_at_-1` | coupon_id:1, used_at:-1 |  |
| `coupon_usage` | `customer_id_1` | customer_id:1 |  |
| `coupon_usage` | `order_id_1` | order_id:1 |  |
| `coupons` | `id_1` | id:1 | نعم |
| `coupons` | `code_1` | code:1 |  |
| `coupons` | `is_active_1` | is_active:1 |  |
| `coupons` | `start_date_1_end_date_1` | start_date:1, end_date:1 |  |
| `couriers` | `id_1` | id:1 | نعم |
| `couriers` | `is_active_1` | is_active:1 |  |
| `couriers` | `wilaya_codes_1` | wilaya_codes:1 |  |
| `couriers` | `phone_1` | phone:1 |  |
| `currencies` | `code_1` | code:1 | نعم |
| `currency_rate_history` | `code_1` | code:1 |  |
| `currency_settings` | `tenant_id_1` | tenant_id:1 |  |
| `customer_addresses` | `id_1` | id:1 | نعم |
| `customer_addresses` | `customer_id_1` | customer_id:1 |  |
| `customer_addresses` | `customer_id_1_is_default_-1` | customer_id:1, is_default:-1 |  |
| `customer_interactions` | `id_1` | id:1 | نعم |
| `customer_interactions` | `customer_id_1_created_at_-1` | customer_id:1, created_at:-1 |  |
| `customer_interactions` | `interaction_type_1` | interaction_type:1 |  |
| `customer_interactions` | `created_by_1` | created_by:1 |  |
| `customer_segments` | `id_1` | id:1 | نعم |
| `customer_segments` | `is_active_1` | is_active:1 |  |
| `customer_segments` | `name_1` | name:1 |  |
| `customer_wishlists` | `id_1` | id:1 | نعم |
| `customer_wishlists` | `customer_id_1_created_at_-1` | customer_id:1, created_at:-1 |  |
| `customer_wishlists` | `product_id_1` | product_id:1 |  |
| `customer_wishlists` | `customer_id_1_product_id_1` | customer_id:1, product_id:1 | نعم |
| `customers` | `id_1` | id:1 | نعم |
| `customers` | `phone_1` | phone:1 |  |
| `daily_reports` | `id_1` | id:1 | نعم |
| `daily_reports` | `date_1` | date:1 | نعم |
| `daily_sessions` | `id_1` | id:1 | نعم |
| `daily_sessions` | `status_1` | status:1 |  |
| `dashboard_widgets` | `id_1` | id:1 | نعم |
| `dashboard_widgets` | `tenant_id_1` | tenant_id:1 |  |
| `delivery_routes` | `id_1` | id:1 | نعم |
| `delivery_routes` | `courier_id_1` | courier_id:1 |  |
| `delivery_routes` | `scheduled_date_1` | scheduled_date:1 |  |
| `delivery_routes` | `status_1` | status:1 |  |
| `delivery_schedules` | `id_1` | id:1 | نعم |
| `delivery_schedules` | `order_id_1_created_at_-1` | order_id:1, created_at:-1 |  |
| `delivery_schedules` | `scheduled_date_1` | scheduled_date:1 |  |
| `delivery_zones` | `id_1` | id:1 | نعم |
| `delivery_zones` | `wilaya_codes_1` | wilaya_codes:1 |  |
| `delivery_zones` | `is_active_1` | is_active:1 |  |
| `discount_rules` | `id_1` | id:1 | نعم |
| `discount_rules` | `is_active_1_priority_-1` | is_active:1, priority:-1 |  |
| `ecom_integrations` | `id_1` | id:1 | نعم |
| `ecom_integrations` | `channel_1` | channel:1 |  |
| `ecom_leads` | `id_1` | id:1 | نعم |
| `ecom_leads` | `created_at_1` | created_at:1 |  |
| `ecom_leads` | `channel_1_status_1` | channel:1, status:1 |  |
| `ecom_leads` | `ai_category_1` | ai_category:1 |  |
| `ecom_leads` | `channel_1_external_id_1` | channel:1, external_id:1 | نعم |
| `ecom_orders` | `id_1` | id:1 | نعم |
| `ecom_orders` | `order_code_1` | order_code:1 | نعم |
| `ecom_orders` | `created_at_1` | created_at:1 |  |
| `ecom_orders` | `channel_1_status_1` | channel:1, status:1 |  |
| `ecom_orders` | `customer.phone_1` | customer.phone:1 |  |
| `ecom_orders` | `integration_id_1` | integration_id:1 |  |
| `ecom_shipping_labels` | `id_1` | id:1 | نعم |
| `ecom_shipping_labels` | `tracking_number_1` | tracking_number:1 |  |
| `ecom_shipping_labels` | `order_id_1` | order_id:1 |  |
| `ecom_shipping_labels` | `courier_id_1` | courier_id:1 |  |
| `ecom_shipping_labels` | `status_1` | status:1 |  |
| `ecom_shipping_labels` | `provider_1` | provider:1 |  |
| `ecom_shipping_labels` | `wilaya_1` | wilaya:1 |  |
| `ecom_shipping_labels` | `created_at_-1` | created_at:-1 |  |
| `email_templates` | `id_1` | id:1 | نعم |
| `email_templates` | `tenant_id_1_id_1` | tenant_id:1, id:1 |  |
| `expenses` | `id_1` | id:1 | نعم |
| `expenses` | `expense_number_1` | expense_number:1 | نعم |
| `expenses` | `category_1` | category:1 |  |
| `expenses` | `expense_date_1` | expense_date:1 |  |
| `export_jobs` | `id_1` | id:1 | نعم |
| `export_jobs` | `tenant_id_1_created_at_-1` | tenant_id:1, created_at:-1 |  |
| `family_capital` | `id_1` | id:1 | نعم |
| `family_capital` | `family_id_1_tenant_id_1` | family_id:1, tenant_id:1 | نعم |
| `family_capital` | `tenant_id_1` | tenant_id:1 |  |
| `family_capital` | `created_at_1` | created_at:1 |  |
| `faq_entries` | `id_1` | id:1 | نعم |
| `faq_entries` | `is_published_1_order_index_1` | is_published:1, order_index:1 |  |
| `faq_entries` | `category_1` | category:1 |  |
| `financial_transactions` | `id_1` | id:1 | نعم |
| `financial_transactions` | `tenant_id_1` | tenant_id:1 |  |
| `financial_transactions` | `order_id_1` | order_id:1 |  |
| `financial_transactions` | `customer_id_1` | customer_id:1 |  |
| `financial_transactions` | `payment_method_id_1` | payment_method_id:1 |  |
| `financial_transactions` | `type_1` | type:1 |  |
| `financial_transactions` | `status_1` | status:1 |  |
| `financial_transactions` | `created_at_1` | created_at:1 |  |
| `financial_transactions` | `tenant_id_1_type_1_status_1` | tenant_id:1, type:1, status:1 |  |
| `financial_transactions` | `tenant_id_1_created_at_-1` | tenant_id:1, created_at:-1 |  |
| `flash_sales` | `id_1` | id:1 | نعم |
| `flash_sales` | `is_active_1_start_date_1_end_date_1` | is_active:1, start_date:1, end_date:1 |  |
| `import_jobs` | `id_1` | id:1 | نعم |
| `import_jobs` | `tenant_id_1_created_at_-1` | tenant_id:1, created_at:-1 |  |
| `integration_configs` | `id_1` | id:1 | نعم |
| `integration_configs` | `tenant_id_1_integration_1` | tenant_id:1, integration:1 | نعم |
| `integration_logs` | `tenant_id_1_integration_id_1_created_at_-1` | tenant_id:1, integration_id:1, created_at:-1 |  |
| `integrations` | `id_1` | id:1 | نعم |
| `integrations` | `tenant_id_1_provider_1` | tenant_id:1, provider:1 | نعم |
| `inventory` | `id_1` | id:1 | نعم |
| `inventory` | `product_id_1_warehouse_id_1` | product_id:1, warehouse_id:1 | نعم |
| `inventory` | `warehouse_id_1_quantity_1` | warehouse_id:1, quantity:1 |  |
| `inventory` | `product_id_1` | product_id:1 |  |
| `inventory_counts` | `id_1` | id:1 | نعم |
| `inventory_counts` | `warehouse_id_1_status_1` | warehouse_id:1, status:1 |  |
| `inventory_movements` | `id_1` | id:1 | نعم |
| `inventory_movements` | `tenant_id_1` | tenant_id:1 |  |
| `inventory_movements` | `event_type_1` | event_type:1 |  |
| `inventory_movements` | `created_at_1` | created_at:1 |  |
| `inventory_sync_rules` | `id_1` | id:1 | نعم |
| `invoices` | `id_1` | id:1 | نعم |
| `invoices` | `invoice_number_1` | invoice_number:1 | نعم |
| `invoices` | `tenant_id_1` | tenant_id:1 |  |
| `invoices` | `customer_id_1` | customer_id:1 |  |
| `invoices` | `status_1` | status:1 |  |
| `invoices` | `created_at_1` | created_at:1 |  |
| `invoices` | `tenant_id_1_status_1` | tenant_id:1, status:1 |  |
| `invoices` | `invoice_type_1` | invoice_type:1 |  |
| `invoices` | `issue_date_1` | issue_date:1 |  |
| `invoices` | `due_date_1` | due_date:1 |  |
| `invoices` | `supplier_id_1` | supplier_id:1 |  |
| `ip_allowlist` | `id_1` | id:1 | نعم |
| `ip_allowlist` | `tenant_id_1_ip_address_1` | tenant_id:1, ip_address:1 | نعم |
| `journal_entries` | `id_1` | id:1 | نعم |
| `journal_entries` | `entry_number_1` | entry_number:1 | نعم |
| `journal_entries` | `date_1` | date:1 |  |
| `journal_entries` | `status_1` | status:1 |  |
| `lead_activity_log` | `id_1` | id:1 | نعم |
| `lead_activity_log` | `lead_id_1_created_at_-1` | lead_id:1, created_at:-1 |  |
| `lead_activity_log` | `action_1` | action:1 |  |
| `lead_campaigns` | `id_1` | id:1 | نعم |
| `lead_campaigns` | `is_active_1` | is_active:1 |  |
| `lead_distribution_rules` | `id_1` | id:1 | نعم |
| `lead_distribution_rules` | `is_active_1` | is_active:1 |  |
| `lead_notes` | `id_1` | id:1 | نعم |
| `lead_notes` | `lead_id_1_created_at_-1` | lead_id:1, created_at:-1 |  |
| `lead_notes` | `follow_up_date_1` | follow_up_date:1 |  |
| `login_history` | `tenant_id_1_user_id_1_created_at_-1` | tenant_id:1, user_id:1, created_at:-1 |  |
| `loyalty_members` | `tenant_id_1_customer_id_1` | tenant_id:1, customer_id:1 | نعم |
| `loyalty_programs` | `id_1` | id:1 | نعم |
| `loyalty_programs` | `tenant_id_1` | tenant_id:1 |  |
| `loyalty_rewards` | `id_1` | id:1 | نعم |
| `loyalty_rewards` | `tenant_id_1` | tenant_id:1 |  |
| `loyalty_transactions` | `id_1` | id:1 | نعم |
| `loyalty_transactions` | `customer_id_1_created_at_-1` | customer_id:1, created_at:-1 |  |
| `media_gallery` | `id_1` | id:1 | نعم |
| `media_gallery` | `folder_1_uploaded_at_-1` | folder:1, uploaded_at:-1 |  |
| `notification_delivery_log` | `id_1` | id:1 | نعم |
| `notification_delivery_log` | `notification_id_1` | notification_id:1 |  |
| `notification_delivery_log` | `user_id_1_sent_at_-1` | user_id:1, sent_at:-1 |  |
| `notification_delivery_log` | `channel_1` | channel:1 |  |
| `notification_inbox` | `id_1` | id:1 | نعم |
| `notification_inbox` | `tenant_id_1_user_id_1_read_1` | tenant_id:1, user_id:1, read:1 |  |
| `notification_inbox` | `tenant_id_1_created_at_-1` | tenant_id:1, created_at:-1 |  |
| `notification_preferences` | `user_id_1` | user_id:1 | نعم |
| `notification_schedules` | `id_1` | id:1 | نعم |
| `notification_schedules` | `status_1_scheduled_at_1` | status:1, scheduled_at:1 |  |
| `notification_settings` | `user_id_1` | user_id:1 | نعم |
| `notification_settings` | `tenant_id_1` | tenant_id:1 | نعم |
| `notification_templates` | `id_1` | id:1 | نعم |
| `notification_templates` | `channel_1_language_1` | channel:1, language:1 |  |
| `notification_templates` | `is_active_1` | is_active:1 |  |
| `notification_templates` | `tenant_id_1_channel_1` | tenant_id:1, channel:1 |  |
| `order_refunds` | `id_1` | id:1 | نعم |
| `order_refunds` | `order_id_1_status_1` | order_id:1, status:1 |  |
| `order_returns` | `id_1` | id:1 | نعم |
| `order_returns` | `order_id_1_status_1` | order_id:1, status:1 |  |
| `order_returns` | `type_1_status_1` | type:1, status:1 |  |
| `order_templates` | `id_1` | id:1 | نعم |
| `order_templates` | `is_active_1_usage_count_-1` | is_active:1, usage_count:-1 |  |
| `order_timelines` | `order_id_1_created_at_-1` | order_id:1, created_at:-1 |  |
| `order_timelines` | `event_type_1_created_at_-1` | event_type:1, created_at:-1 |  |
| `payment_methods` | `id_1` | id:1 | نعم |
| `payment_methods` | `code_1` | code:1 | نعم |
| `payment_methods` | `tenant_id_1` | tenant_id:1 |  |
| `payment_methods` | `type_1` | type:1 |  |
| `payment_methods` | `is_active_1` | is_active:1 |  |
| `payment_settings` | `tenant_id_1` | tenant_id:1 | نعم |
| `payments` | `id_1` | id:1 | نعم |
| `payments` | `payment_number_1` | payment_number:1 | نعم |
| `payments` | `payment_type_1` | payment_type:1 |  |
| `payments` | `payment_date_1` | payment_date:1 |  |
| `payouts` | `id_1` | id:1 | نعم |
| `payouts` | `tenant_id_1` | tenant_id:1 |  |
| `payouts` | `agent_id_1` | agent_id:1 |  |
| `payouts` | `status_1` | status:1 |  |
| `payouts` | `created_at_1` | created_at:1 |  |
| `pickup_requests` | `id_1` | id:1 | نعم |
| `pickup_requests` | `provider_1_status_1` | provider:1, status:1 |  |
| `points_transactions` | `id_1` | id:1 | نعم |
| `points_transactions` | `tenant_id_1_customer_id_1` | tenant_id:1, customer_id:1 |  |
| `price_history` | `id_1` | id:1 | نعم |
| `price_history` | `product_id_1_created_at_-1` | product_id:1, created_at:-1 |  |
| `price_history` | `field_1` | field:1 |  |
| `processed_events` | `event_id_1` | event_id:1 | نعم |
| `processed_events` | `event_type_1` | event_type:1 |  |
| `processed_events` | `status_1` | status:1 |  |
| `processed_events` | `started_at_1` | started_at:1 |  |
| `product_audit_log` | `id_1` | id:1 | نعم |
| `product_audit_log` | `product_id_1_created_at_-1` | product_id:1, created_at:-1 |  |
| `product_audit_log` | `action_1` | action:1 |  |
| `product_audit_log` | `user_id_1` | user_id:1 |  |
| `product_bundles` | `id_1` | id:1 | نعم |
| `product_bundles` | `is_active_1` | is_active:1 |  |
| `product_promotions` | `id_1` | id:1 | نعم |
| `product_promotions` | `is_active_1_start_date_1_end_date_1` | is_active:1, start_date:1, end_date:1 |  |
| `product_promotions` | `product_ids_1` | product_ids:1 |  |
| `product_ratings` | `product_id_1` | product_id:1 | نعم |
| `product_ratings` | `average_rating_-1` | average_rating:-1 |  |
| `product_reviews` | `id_1` | id:1 | نعم |
| `product_reviews` | `product_id_1_is_approved_1` | product_id:1, is_approved:1 |  |
| `product_reviews` | `product_id_1_rating_-1` | product_id:1, rating:-1 |  |
| `product_reviews` | `customer_id_1` | customer_id:1 |  |
| `product_reviews` | `product_id_1_created_at_-1` | product_id:1, created_at:-1 |  |
| `product_reviews` | `status_1` | status:1 |  |
| `product_tags` | `id_1` | id:1 | نعم |
| `product_tags` | `name_1` | name:1 | نعم |
| `product_variants` | `product_id_1_is_active_1` | product_id:1, is_active:1 |  |
| `product_variants` | `sku_1` | sku:1 |  |
| `product_variants` | `barcode_1` | barcode:1 |  |
| `product_variants` | `id_1` | id:1 | نعم |
| `products` | `id_1` | id:1 | نعم |
| `products` | `family_id_1` | family_id:1 |  |
| `products` | `barcode_1` | barcode:1 |  |
| `products` | `article_code_1` | article_code:1 |  |
| `products` | `barcode_unique_partial` | barcode:1 | نعم |
| `profitability_settings` | `tenant_id_1` | tenant_id:1 | نعم |
| `promo_activity_log` | `id_1` | id:1 | نعم |
| `promo_activity_log` | `action_1_created_at_-1` | action:1, created_at:-1 |  |
| `purchase_orders` | `id_1` | id:1 | نعم |
| `purchase_orders` | `tenant_id_1_po_number_1` | tenant_id:1, po_number:1 | نعم |
| `purchase_orders` | `tenant_id_1_supplier_id_1` | tenant_id:1, supplier_id:1 |  |
| `purchase_orders` | `tenant_id_1_status_1` | tenant_id:1, status:1 |  |
| `purchases` | `id_1` | id:1 | نعم |
| `purchases` | `created_at_1` | created_at:1 |  |
| `purchases` | `items.product_id_1` | items.product_id:1 |  |
| `refunds` | `id_1` | id:1 | نعم |
| `refunds` | `tenant_id_1` | tenant_id:1 |  |
| `refunds` | `transaction_id_1` | transaction_id:1 |  |
| `refunds` | `status_1` | status:1 |  |
| `refunds` | `created_at_1` | created_at:1 |  |
| `related_products` | `id_1` | id:1 | نعم |
| `related_products` | `product_id_1_relation_type_1` | product_id:1, relation_type:1 |  |
| `related_products` | `related_product_id_1` | related_product_id:1 |  |
| `review_reports` | `id_1` | id:1 | نعم |
| `review_reports` | `review_id_1` | review_id:1 |  |
| `review_reports` | `status_1_created_at_-1` | status:1, created_at:-1 |  |
| `review_requests` | `id_1` | id:1 | نعم |
| `review_requests` | `order_id_1` | order_id:1 |  |
| `review_requests` | `status_1` | status:1 |  |
| `review_votes` | `id_1` | id:1 | نعم |
| `review_votes` | `review_id_1` | review_id:1 |  |
| `reviews` | `id_1` | id:1 | نعم |
| `reviews` | `product_id_1_status_1_created_at_-1` | product_id:1, status:1, created_at:-1 |  |
| `reviews` | `user_id_1_status_1` | user_id:1, status:1 |  |
| `reviews` | `status_1_created_at_-1` | status:1, created_at:-1 |  |
| `reviews` | `product_id_1_rating_1` | product_id:1, rating:1 |  |
| `reward_redemptions` | `id_1` | id:1 | نعم |
| `roles` | `id_1` | id:1 | نعم |
| `roles` | `tenant_id_1_name_1` | tenant_id:1, name:1 | نعم |
| `sales` | `id_1` | id:1 | نعم |
| `sales` | `customer_id_1` | customer_id:1 |  |
| `sales` | `created_at_1` | created_at:1 |  |
| `scheduled_reports` | `id_1` | id:1 | نعم |
| `scheduled_reports` | `tenant_id_1` | tenant_id:1 |  |
| `search_history` | `tenant_id_1_user_id_1_created_at_-1` | tenant_id:1, user_id:1, created_at:-1 |  |
| `shipping_activity_log` | `id_1` | id:1 | نعم |
| `shipping_activity_log` | `action_1_created_at_-1` | action:1, created_at:-1 |  |
| `shipping_settings` | `id_1` | id:1 | نعم |
| `shipping_settings` | `tenant_id_1` | tenant_id:1 | نعم |
| `stock_adjustments` | `id_1` | id:1 | نعم |
| `stock_adjustments` | `product_id_1_warehouse_id_1_created_at_-1` | product_id:1, warehouse_id:1, created_at:-1 |  |
| `stock_alerts` | `id_1` | id:1 | نعم |
| `stock_alerts` | `product_id_1_warehouse_id_1` | product_id:1, warehouse_id:1 |  |
| `stock_alerts` | `is_active_1_alert_type_1` | is_active:1, alert_type:1 |  |
| `stock_history` | `id_1` | id:1 | نعم |
| `stock_history` | `product_id_1_warehouse_id_1_created_at_-1` | product_id:1, warehouse_id:1, created_at:-1 |  |
| `stock_history` | `movement_type_1_created_at_-1` | movement_type:1, created_at:-1 |  |
| `stock_movements` | `id_1` | id:1 | نعم |
| `stock_movements` | `product_id_1_created_at_-1` | product_id:1, created_at:-1 |  |
| `stock_movements` | `movement_type_1` | movement_type:1 |  |
| `stock_movements` | `variant_id_1` | variant_id:1 |  |
| `stock_movements` | `warehouse_id_1` | warehouse_id:1 |  |
| `stock_transfers` | `id_1` | id:1 | نعم |
| `stock_transfers` | `from_warehouse_id_1_status_1` | from_warehouse_id:1, status:1 |  |
| `stock_transfers` | `to_warehouse_id_1_status_1` | to_warehouse_id:1, status:1 |  |
| `subscription_plans` | `id_1` | id:1 | نعم |
| `subscription_plans` | `tenant_id_1_is_active_1` | tenant_id:1, is_active:1 |  |
| `subscriptions` | `id_1` | id:1 | نعم |
| `subscriptions` | `tenant_id_1_customer_id_1` | tenant_id:1, customer_id:1 |  |
| `subscriptions` | `tenant_id_1_status_1` | tenant_id:1, status:1 |  |
| `suppliers` | `tenant_id_1_name_1` | tenant_id:1, name:1 |  |
| `suppliers` | `id_1` | id:1 | نعم |
| `sync_schedules` | `id_1` | id:1 | نعم |
| `sync_schedules` | `integration_id_1` | integration_id:1 |  |
| `sync_schedules` | `is_active_1_frequency_1` | is_active:1, frequency:1 |  |
| `tax_declarations` | `id_1` | id:1 | نعم |
| `tax_declarations` | `year_1` | year:1 |  |
| `tax_rates` | `id_1` | id:1 | نعم |
| `tax_rates` | `type_1` | type:1 |  |
| `transactions` | `created_at_1` | created_at:1 |  |
| `transactions` | `cash_box_id_1` | cash_box_id:1 |  |
| `usage_records` | `id_1` | id:1 | نعم |
| `usage_records` | `tenant_id_1_subscription_id_1` | tenant_id:1, subscription_id:1 |  |
| `user_groups` | `id_1` | id:1 | نعم |
| `user_groups` | `tenant_id_1_name_1` | tenant_id:1, name:1 | نعم |
| `user_sessions` | `id_1` | id:1 | نعم |
| `user_sessions` | `tenant_id_1_user_id_1_status_1` | tenant_id:1, user_id:1, status:1 |  |
| `vendor_orders` | `id_1` | id:1 | نعم |
| `vendor_orders` | `tenant_id_1_vendor_id_1` | tenant_id:1, vendor_id:1 |  |
| `vendor_payouts` | `id_1` | id:1 | نعم |
| `vendor_payouts` | `tenant_id_1_vendor_id_1` | tenant_id:1, vendor_id:1 |  |
| `vendor_products` | `id_1` | id:1 | نعم |
| `vendor_products` | `tenant_id_1_vendor_id_1` | tenant_id:1, vendor_id:1 |  |
| `vendor_products` | `tenant_id_1_product_id_1_vendor_id_1` | tenant_id:1, product_id:1, vendor_id:1 | نعم |
| `vendor_reviews` | `id_1` | id:1 | نعم |
| `vendor_reviews` | `tenant_id_1_vendor_id_1` | tenant_id:1, vendor_id:1 |  |
| `vendors` | `id_1` | id:1 | نعم |
| `vendors` | `tenant_id_1_email_1` | tenant_id:1, email:1 | نعم |
| `vendors` | `tenant_id_1_status_1` | tenant_id:1, status:1 |  |
| `warehouses` | `id_1` | id:1 | نعم |
| `warehouses` | `code_1` | code:1 | نعم |
| `warehouses` | `is_active_1` | is_active:1 |  |
| `webhook_deliveries` | `tenant_id_1_webhook_id_1_created_at_-1` | tenant_id:1, webhook_id:1, created_at:-1 |  |
| `webhooks` | `id_1` | id:1 | نعم |
| `webhooks` | `tenant_id_1_url_1` | tenant_id:1, url:1 |  |
| `whatsapp_messages` | `id_1` | id:1 | نعم |
| `whatsapp_messages` | `from_number_1` | from_number:1 |  |
| `whatsapp_messages` | `processed_1` | processed:1 |  |
| `whatsapp_messages` | `tenant_id_1` | tenant_id:1 |  |
| `workflow_executions` | `tenant_id_1_workflow_id_1_created_at_-1` | tenant_id:1, workflow_id:1, created_at:-1 |  |
| `workflows` | `id_1` | id:1 | نعم |
| `workflows` | `tenant_id_1_trigger_1` | tenant_id:1, trigger:1 |  |
