
## 2026-08-11 — وحدة الخدمات الرقمية (Digital Services)

### التغييرات
- backend/utils/code_crypto.py (جديد): تشفير AES-256-GCM للأكواد (CODE_ENCRYPTION_KEY في .env)
- backend/routes/digital_services_routes.py (جديد): /digital — منتجات، أكواد (JSON/CSV)، طلبات، محفظة، إحالة
- backend/main.py: تسجيل routes.digital_services_routes في _AUTO_REG_MODULES
- frontend/src/pages/digital/DigitalServicesPage.js (جديد): متجر + محفظة + طلبات + إحالة
- frontend/src/pages/digital/DigitalAdminPage.js (جديد): إدارة المنتجات/الأكواد/الطلبات
- frontend/src/App.js: مسارا /digital-services و /digital-admin
- frontend/src/config/sidebarMenu.js: عنصرا قائمة جديدان في قسم التجارة الإلكترونية
- npm: qrcode.react@4.2.0 (--legacy-peer-deps)

### الأوامر المنفذة
- cd /opt/ntcommerce/frontend && npm run build  (bundle: main.26ce1ba8.js)
- rm -rf /var/www/html/* && cp -r build/* /var/www/html/
- (الواجهة الخلفية كانت قد أعيد تشغيلها سابقاً: docker restart ntcommerce-backend-1)

### الاختبارات (curl)
- POST /digital/wallet/deposit {1000} → balance 1000 ✓
- POST /digital/orders (wallet) → DIG-000001 COMPLETED + تعيين كود ✓
- GET /digital/orders/{id}/codes → فك التشفير DJ-AAAA-1111 ✓
- رصيد غير كافٍ → 400 برسالة عربية ✓
- تنظيف بيانات الاختبار بالكامل (orders/txns/code S001/wallet=0) ✓

## 2026-08-11 — تحقق شامل + سد ثغرة قوالب واتساب
- تحقق بند-ببند من مواصفة التطوير (20 بنداً) — كلها تعمل
- أضيفت CRUD لقوالب واتساب: GET/POST/PUT/DELETE /api/whatsapp/templates
- أضيفت بطاقة "قوالب رسائل واتساب" في /ecom-hub/channels
- build: main.96ea6b83.js → /var/www/html

## 2026-08-11 — إظهار Webhooks العملاء المحتملين في الواجهة
- backend/routes/ad_webhooks_routes.py: GET /webhooks/leads + GET /webhooks/config (المصنع يقبل get_current_user الآن)
- frontend EcomChannelsPage.js: بطاقة "Webhooks العملاء المحتملون" (روابط قابلة للنسخ + حالة HMAC + آخر 10 leads)
- build: main.1b73c5e9.js → /var/www/html

## 2026-08-11 — Git + نسخ احتياطي
- git commit e3aec80: كل تعديلات الجلسات (181 ملفاً) محفوظة في /opt/ntcommerce
- نسخة احتياطية كاملة: /opt/backups/mongodb/dump_20260810_2010 (4.4M، كل القواعد)
- cron يومي 03:00: /opt/backups/backup_mongo.sh (الاحتفاظ بآخر 14 نسخة)

## 2026-08-11 — إظهار الميزات الخلفية بلا واجهة
- ai_assistant_routes: _llm يستخدم openai الرسمية (AI_INTEGRATIONS_OPENAI_API_KEY/BASE_URL) — إزالة مسار emergentintegrations الخبيث؛ GET /ai-assistant/status
- digital_services_routes: _notify_order_completed (إشعار داخلي + SMS عند الضبط) بعد الشراء/التسليم؛ GET /digital/stats (إيراد/تكلفة/ربح)
- main.py: قيد فريد wallets (entity_type, entity_id)
- واجهة: شارة مخاطر COD في قائمة الطلبات + لوحة تفاصيلها؛ بطاقة AI + بطاقة واتساب للأعمال في /ecom-hub/channels؛ بطاقات أرباح + ملاحظة DIRECT_TOPUP في /digital-admin
- build: main.d54b53c1.js — اختبار حي: إشعار digital_order + ربح 100 (1000-900) ✓

## 2026-08-11 — إصلاحات SMS
- sms_service: if self.db → if self.db is not None (motor لا يدعم truth-testing)
- repair_routes: sms.send → sms.send_sms (الاسم الصحيح) + main_db is not None
- اختبار حي: SMS-MOCK + sms_log بدون أخطاء ✓

## 2026-08-11 — إصلاح اختفاء ecom-hub
- السبب: ecommerce_hub ميزة opt-in؛ تسجيل دخول admin (simple_auth_routes) لم يكن يعيد features → القائمة والصفحات محظورة
- simple_auth_routes + auth_users_routes: إرجاع user.features في login و /me
- demo: features.ecommerce_hub=true في القاعدة

## 2026-08-11 — تفعيل ecom-hub لكل الحسابات
- saas_plans: features.ecommerce_hub=true للخطط الثلاث (كانت فارغة → المستأجرون لا يرون القائمة)
- online_store_routes: إصلاح 500 عند حفظ إعدادات المتجر (upsert يصطدم بقيد store_slug الفريد) + رسالة واضحة عند تضارب الرابط
- التحقق: PUT /store/settings ✓، /shop/demo-shop ✓، login + /me يعيدان features ✓
- 2026-08-10 23:21 — p3: products-families hardening (400 on invalid family_id, family_name sync/clear on update, unified name field); verified families counts + invalid-family rejection
- 2026-08-10 23:31 — p5: unified LLM on official openai lib (services/ai/openai_llm.py); removed all emergentintegrations LLM call sites (copilot, insights, llm_service, OCR, log-analyzer); deleted dead emergent_wrapper.py; removed EMERGENT_LLM_KEY from backend/.env; verified heuristic fallbacks + clean OCR 503; zero orphan frontend pages
