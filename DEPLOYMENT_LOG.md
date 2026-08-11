
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
- 2026-08-11 00:00 — p6/p7: full 504-endpoint sweep x3 roles; fixed _get_db TypeError breaking all /api/v2/financial/* (26 endpoints); tolerant family/price-history response models; atomic seed upsert (killed 4-worker dupe race) + deduped defaults; store slug ownership guard (was no-op); CRITICAL multi-tenancy fix — main.py get_current_user now routes db proxy to tenant DB (cross-tenant leak in /store/settings found+repaired); simple_auth /me returns full session incl. plan features; zero 500s remaining
- 2026-08-11 00:10 — p8: frontend rebuilt (main.8cd85796.js, includes digital-profits analytics card) + deployed; final sweep 504 endpoints x3 roles = ZERO 500s (remaining: 403 role-gating, 422 params, 400 hardware — all by design)
- 2026-08-11 01:30 — p9: dropped 7 orphan DBs (backed up to /opt/backups/deleted_dbs_20260811_011234 first): old-hani-dup, amine, walid, ecomtest, exptest, ecommerce, staging; cleaned exptest platform records (saas_tenants, store_slugs, whatsapp_config, auto_reports...); removed dead shadowed /api/saas/subscribers stub (referenced deleted tenant); downgraded AI-not-configured robot logs ERROR->INFO; re-verified: 503 endpoints x3 roles = ZERO 500s, ZERO backend ERRORs after restart, remaining DBs: ntcommerce + 2 real tenants (hani, Amir)
- 2026-08-11 13:10 — wilayas spec: verified algeria-wilayas.json (58 wilayas/1541 communes) served via nginx; dynamic commune dropdown live in bundle; seeded demo supplier SUP-001 + set product qty=100 in Amir tenant; removed orphan duplicate pages/ProductDetailPage.js; redeployed build to /var/www/ntcommerce; checklist: JSON OK, /shop/Ncr OK (live sales already decremented stock 100->82 — stock engine works), product page OK


## 2026-08-11 13:45 — p10: إصلاح رفض تأكيد المشتريات (تسريب التوجيه بين المستأجرين)

### التشخيص
- شكوى: صفحة /purchases ترفض تأكيد الشراء (404 Supplier not found) لحساب amir@amir.com
- الجذر: 4 مصانع مسارات (suppliers/orders/webhooks/promotions) تلتقط `db["collection"]` عند التسجيل (startup) — البروكسي بلا سياق مستأجر وقتها فيُثبَّت على main_db للأبد
- النتيجة: مورّدو أمير كُتبوا في قاعدة المنصة، بينما /purchases (مصحح في p9) يقرأ من قاعدة المستأجر → 404

### الإصلاح
- backend/repositories/base_repository.py: collection أصبح property يحلّل callable عند كل وصول (lazy resolver)
- 4 مصانع: `BaseRepository(lambda: db["x"])` بدل الالتقاط المباشر
- نقل مورّد "العلمة فون" من ntcommerce → tenant_2ee8a3fd (مع تصفير balance/total_purchases)
- تنظيف مشتريتي التجريبية PUR-20260811-0011: حذف السند، إرجاع purchase_price=1200 (من سجلات البيع)، quantity -1، تصفير رصيد SUP-001، إرجاع العدّاد لـ 10

### التحقق (curl)
- GET /suppliers كأمير → مورّديه فقط | كأدمن المنصة → مورّدو المنصة فقط (عزل ثنائي ✔)
- POST /purchases بنفس حمولة أمير الفاشلة → 201 ✔ (ثم حُذف الاختبار)
- POST /suppliers → يكتب في قاعدة المستأجر ✔
- مسح شامل: 503 نقطة GET × 3 أدوار → صفر 500

### النسخ الاحتياطية
- backups/p10_20260811_213508/ (5 ملفات) + mongodump داخل الحاوية /tmp/dump_p10_*


## 2026-08-11 14:45 — p11: ميزات المنتجات/POS/الزبائن + إزالة التكرارات

### الميزات الجديدة
- صفحة المنتجات: أيقونتا تفعيل على المتجر (Store) وWooCommerce (Globe) لكل منتج (قائمة + بطاقات)، خضراء عند التفعيل — تستعمل POST/DELETE /store/products و/woocommerce/publish|unpublish-product
- حماية الحذف: منتج عليه مخزون أو له مشتريات/مبيعات = "حقيقي" → DELETE /products/{id} يرفض برسالة عربية واضحة + تنظيف store_products عند الحذف المسموح
- الضغط على اسم/كود المنتج → صفحة التعديل (للأدمن)
- 5 صور للمنتج: حقل images[] في المخطط (حد أقصى 5) + مكوّن مشترك ProductImagesInput في الإضافة/التعديل (image_url يبقى الغلاف)
- POS: 7 فئات سعر (تجزئة/جملة/سوبر جملة/تعريفات A-D) من مصدر واحد lib/priceTiers.js — القائمة + اختصار 5 يدور عليها + سعر الزبون
- الزبائن: حقل price_tier (افتراضي retail) في النموذج + تطبيقه تلقائياً في POS عند اختيار الزبون + إصلاح حقول كانت تُسقط صامتة (customer_type, national_id...)
- تحقق المتاجر: 3 متاجر عامة + تتبع + إدارة = 200، المخزون مربوط بالمبيعات

### إزالة التكرارات (18 معالجاً ميتاً + 3 ملفات)
- router_registry.py (نظام تسجيل مكرر غير مستعمل) + webhooks_routes.py (غير مسجل) + notification_routes.py (ميت 100% — لا يظهر في openapi)
- suppliers_core: GET/POST "" + generate-code + DELETE ميتة (suppliers_routes/utility يسبقان) | suppliers_routes: PATCH غير مستعمل (PUT هو المستعمل)
- auth_users: login/register/me ميتة (simple_auth عبر auth_router هو الحي)
- notifications_routes: نسختان v2 مكررتان داخلياً (وبعد التصحيح: أُعيدت 4 معالجات حية كانت تخدم NotificationBell فعلاً)
- permissions/roles + whatsapp/send + users/{id}/permissions + health: توأم ميت في permissions/whatsapp/system_sync (families_permissions يسبقها)
- واجهة: 4 مكونات يتيمة (SyncManager/FeatureGate/SaveButtons/SalesHistoryDialog) — كلها في backups/p11_dedup/
- المتبقي: 7 "تكرارات" شكلية /api مقابل /api/v2 = إصدارات API مقصودة

### التحقق
- 503 نقاط GET × 3 أدوار: صفر 500 | login/me/suppliers CRUD/notifications/roles/whatsapp/generate-code كلها 200
- حذف منتج عليه مخزون → 400 بالعربية ✔ | منتج بلا مخزون → يُحذف ✔ | price_tier يُحفظ ✔ | images تُحفظ ✔
- النسخ الاحتياطية: backups/p11_files/ + backups/p11_dedup/
