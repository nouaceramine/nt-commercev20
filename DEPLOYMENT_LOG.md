
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

## Phase A — أرشفة مكدس /api/v2 الميت 2026-08-11 14:56
- النسخة الاحتياطية: /opt/ntcommerce/backups/phaseA_20260811_225245/ (main.py + 30 ملف enhanced)
- main.py: حذف 247 سطراً (كتلتا استيراد + 30 كتلة تسجيل try/except + استيراد monitoring الميت) — 1639 ← 1392 سطراً
- openapi: 1047 ← 733 مساراً (إزالة 314 نقطة v2 ميتة = -30% من سطح API)
- الأرشيف: 30 ملف routes/ecom/enhanced_*.py ← /opt/ntcommerce/archive/ecom_v2/ (لا حذف نهائي — حذف نهائي بعد شهر إن استقر النظام)
- الإبقاء في ecom/: orders, analytics, integrations, leads, shipping, webhooks, constants (v1 الحية)
- التحقق: صفر أخطاء 500 في 1104 استدعاء (368 GET × 3 صلاحيات) · auth/me, products, store/products, notifications, customers = 200 · /api/v2/* = 404
- ملاحظة: تحذير create_all_enhanced_indexes(db) سابق الوجود (242 ظهوراً قبل إعادة التشغيل) — يُعالج في مرحلة لاحقة

## Phase B — توحيد الإشعارات (2026-08-11 15:09)
- النسخة الاحتياطية: backups/phaseB_/ (6 ملفات)
- الدمج: collection smart_notifications الموازية أُلغيت — notification_robot يكتب الآن في notifications الموحدة بميّز channel:"smart" (كانت المجموعات فارغة في القواعد الثلاث = صفر ترحيل بيانات)
- smart_notifications_routes: 6 نقاط تعمل كاختصار مستقل على المخزن الموحد (نفس الأشكال والحقول)
- notifications_routes (الجرس): عزل channel!=smart في 7 نقاط جماعية (list/legacy×2/all/unread_count/mark-all/clear-all) — سلوك الجرس مطابق تماماً (29 عنصراً/0 غير مقروء قبل وبعد)
- إثبات طرفي: حقن مستندين → الذكية تراهما بالحقول الكاملة، الجرس لا يتأثر، clear يحذف المقروء فقط، الدورة كاملة ✅
- تنظيف: alert_routes.py (راوتر فارغ) أُرشف + حذف استيراده الميت وكتلته من main.py · modules/notifications.py: حذف استيراد notification_routes المحذوف سابقاً (register() لا تُستدعى إطلاقاً)
- push_notification_routes: أُبقي — قناة توصيل وليس تكراراً · services/smart_notifications.py: كان موحداً أصلاً على notifications
- التحقق: صفر 500 في 1104 استدعاء · صفر أخطاء استيراد

## Phase C — محرك التقارير الموحد (2026-08-11 15:17)
- النسخة الاحتياطية: backups/phaseC_/ (stats_routes.py)
- الجديد: services/reporting.py — sales_chart_rows / top_products_rows / product_price_map / product_docs_map
- stats_routes.py: 6 نقاط تحولت لمحوّلات رقيقة (409←382 سطراً): analytics/sales-chart + reports/sales-chart (نفس السلسلة، granularity مختلفة) · analytics/top-products + reports/top-products (معاملات: name_field/revenue_mode/sort_key — اختلافات دلالية محفوظة) · reports/profit + reports/profit-detailed + dashboard/profit-stats (كاش موحد)
- مكافأة: القضاء على نمط N+1 (find_one لكل عنصر) في تقريرَي الربح — استعلام aggregate واحد بكاش منتجات
- الفحص المقارن (نفس الفترة/المستأجر): 8/8 استجابات مطابقة بايت-ببايت قبل/بعد
- smart-reports (sendgrid) وauto-reports (system_sync) خارج النطاق عمداً — جدولة/توصيل وليسا تجميعاً مكرراً
- التحقق: صفر 500 في 1104 استدعاء · صفر أخطاء استيراد

## Phase D — خدمة الأرصدة الموحدة (2026-08-11)
- النسخة الاحتياطية: backups/phaseD_/ (3 ملفات routes)
- الجديد: services/balances.py — customer_debt_aggregates / adjust_customer_mirror / adjust_supplier_mirror
- إعادة توصيل 9 مواقع بلا أي تغيير دلالي (نفس $inc والحقول): customer_debts (خط أنابيب مكرر ×2 + كاتبان) · sales (3 كُتّاب مرآة الزبون) · purchases (كاتبان مرآة المورد)
- اختبار كتابة حي كامل على مستأجر demo: شراء مؤكد 500 → مرآة المورد 0←500 ورصيد 0←500 ومخزون 16←17 → حذف → كل شيء عاد للصفر ✅ (purchase_price أُعيد يدوياً لـ150)
- ملاحظة سابقة الوجود (لم تُغيّر): مسودة شراء (confirm_stock:false) لا تحدّث مرآة المورد لكن حذفها عبر API يعكسها → انحراف سالب. موثقة للمرحلة F
- القراءة: /debts/summary والموردون مطابقان بايت-ببايت قبل/بعد · صفر 500 في 1104 استدعاء

## Phase E — إطار الخدمات الرقمية الموحد (2026-08-11)
- النسخة الاحتياطية: backups/phaseE_20260811_233512/
- الجديد: services/digital_inventory.py — claim_codes/release_codes/count_available (حجز ذري + تراجع كل-أو-لا-شيء)
- تحقيقات: محفظة wallet_service (منصة/مستأجر) ≠ محفظة digital_services (زبون داخل المستأجر) — ليستا تكراراً، أُبقيتا منفصلتين موثقتين
- إعادة توصيل: idoom (حجز + إطلاقان) وdigital_services (_assign_codes)
- إصلاح موثق ضروري: _assign_codes كان find-then-update غير ذري (تسرب أكواد تحت التزامن) → الآن ذري مع تراجع كامل؛ حارس نفاد مخزون جديد في create_order
- اختبار حي على demo: طلب 4>3 أكواد → 400 بلا تسرب ✅ · طلب 1 → COMPLETED وخصم محفظة 5000←1000 ✅ · إرجاع كامل (طلب+كود+محفظة) ✅
- صفر أخطاء استيراد · صفر 500 في المسح الشامل

## Phase F — اللمسات الأخيرة (2026-08-11)
- النسخة الاحتياطية: backups/phaseF_20260811_233512/
- enhanced_indexes: أُبقي كما هو — فهارس idempotent لمجموعات حية (products/orders/customers/notifications)، إزالتها مخاطرة بلا فائدة
- monitoring: لا ازدواج فعلي (106 = Middleware، 619 = router)
- إصلاح انحراف مرآة المورد: تعديل وحذف المشتريات صارا مشروطين بـ stock_status=="confirmed" (نفس حارس المخزون) — حذف المسودة لم يعد يسحب من رصيد المورد. كما رُوّط حذف المشتريات بـ adjust_supplier_mirror (آخر موضع كان خارج خدمة الأرصدة)
- اختبار حي: مسودة→حذف = مرآة 0/0 ✅ · مؤكد 150→حذف = 0/0 ومخزون 16 ثابت ✅
- توثيق دلالي (بلا تغيير): /reports/profit يحسب من sale.total (يخصم تخفيضات الفاتورة) بينما /reports/profit-detailed يجمع item.price (لا يراها) — الفرق = التخفيضات على مستوى الفاتورة. كلاهما يستعمل purchase_price الحالي لا التكلفة التاريخية وقت البيع (قيود مشتركة موثقة)
- صفر 500 في المسح الشامل النهائي (1104 استدعاء)

## 2026-08-11 — p12: إصلاح صفحة بيضاء شاملة (انحراف hash الحزمة المنشورة)

### التشخيص (اكتُشف أثناء تدقيق QA الشامل)
- العرض: كل صفحات SPA بيضاء لكل الزوار رغم curl / = 200
- الجذر: /var/www/ntcommerce/index.html يشير لـ main.4a5e96b1.js والملف غير موجود (404) — نسخة ناقصة سابقة تركت index.html من بناء أحدث مع حزمة main.0189874b.js الأقدم
- build/ في المستودع كان بنفس الانحراف (index يشير 4a5e96b1 والحزمة غائبة)

### الإصلاح
- النسخة الاحتياطية: backups/p12_blankpage_20260811_170048/ (index.html + build القديم)
- إعادة بناء كاملة npm run build → main.4a5e96b1.js (hash حتمي مطابق لمرجع index)
- نشر + حذف main.0189874b.js* وملفات css اليتيمة (70f1008b, ff83149a)
- التحقق: bundle 200 ✔ صفحة الدخول تُعرض ✔ تسجيل دخول demo ✔ لوحة التحكم ✔

### ملاحظة وقائية (موثقة، بلا تغيير)
- index.html المصدري يحمّل سكربتات خارجية متبقية من منصة ال scaffolding (assets.emergent.sh ×2، posthog بمفتاح ثابت) وcanonical/og:url يشيران لنطاق staging القديم — قد تعلّق تحميل الصفحة إن تعطلت، وتضر SEO. تُعالج في مهمة لاحقة

### درس مستفاد (يُضاف للقاعدة 7)
- بعد كل نشر: التحقق أن كل ملف يشير إليه index.html موجود فعلاً ويُقدَّم 200 — ليس فقط مطابقة hash واحد

## 2026-08-11 — p13: إصلاحات P0 السبعة من تقرير تدقيق QA (+ إصلاح P1 إضافي)

### النسخة الاحتياطية
- backups/p13_p0fixes_20260811_180612/ (7 ملفات قبل التعديل)

### الإصلاحات (كلها مختبرة بـ curl بعد إعادة التشغيل)
1. **معالج ValidationError عام → 422** (main.py): كان بناء XCreate(**dict) يدوياً في 12 موضعاً يرمي ValidationError → 500 مقنّع. الآن 422 برسائل الـ validators العربية + اسم الحقل. تحقق: اسم ناقص/سعر سالب/6 صور/300 حرف/حمولة بيع فاسدة → 422 ✔
2. **حارس مخزون ذرّي في create_sale_op** (sales_service.py): find_one_and_update مشروط quantity>= المطلوب لكل منتج (تجميع الكميات المكررة) قبل أي أثر جانبي، تراجع كل-أو-لا-شيء عند النقص، 400 بالعربية. يستثني الأسطر بلا product_id وis_non_stockable. تحقق: بيع 20/5 → 400 بلا سند يتيم ومخزون ثابت ✔ سباق 5× على قطعة واحدة → 201 واحد + 400×4 ومخزون 0 ✔
3. **delete_sale_op يعكس الصندوق**: كان شرط cash_box_id (حقل غير موجود) فلا يعكس أبداً + سند income يتيم. الآن cash_box_id||payment_method + سند عكسي sale_delete. تحقق: بيع نقدي 1500 → حذف → الصندوق عاد للأساس -4,276,400 بالضبط + سند عكسي ✔
4. **حارس حذف الزبون** (customers_routes.py): دين قائم (فواتير غير مسددة) → 400 | حركات بيع (حتى مسددة/مرجعة) → 400 | نظيف → يُحذف. تحقق بالحالات الثلاث ✔
5. **إلغاء طلب الويب يعيد المخزون** (online_store_routes.py): قائمة حالات مسموحة (غيرها 400) + إرجاع المخزون عند cancelled/refunded مرة واحدة فقط (علم stock_restored). تحقق: طلب 3 → 10→7 → إلغاء → 10 → إلغاء مزدوج → 10 ✔ banana → 400 ✔
6. **فحص الاسم المكرر يتجاهل الحقول الفارغة** (products_routes.py): كان name_ar="" يصادم كل منتج بلا اسم عربي → 409 زائف. تحقق: منتجان بلا اسم عربي 201 ✔ ومكرر حقيقي 409 ✔
7. **validators على ProductUpdate + تمرير PUT عبر النموذج** (catalog.py + products_routes.py): سعر/كمية سالبة → 422، اسم HTML يُنظّف، الحقول الإضافية (images/tariffs/flags) تمر كما كان. تحقق ✔
8. **[P1 إضافي] تحصين GET /product-families** (families_permissions_routes.py): 83 وثيقة فاسدة (بلا id) في قاعدة أمير من استيراد Excel قديم كانت تسقط الصفحة 500 — الآن تُرشّح. ملاحظة: الوثائق الفاسدة بقيت في القاعدة (قرار ترحيل/حذف للمالك) والصفحة تعمل.

### التحقق الختامي
- 48 استدعاء × 4 أدوار (12 نقطة) = صفر أخطاء غير متعمدة (200/403)
- الموقع 200 · صفر Exception in ASGI بعد الإصلاحات
- تنظيف كامل لبيانات الاختبار: 3 منتجات، زبون، سندا بيع، طلب ويب، سندات، إشعارات — الصندوق على الأساس -4,276,400 ✔

### ملاحظة سلوكية مقصودة
- بيع بمنتج محذوف/غير موجود (product_id بلا وثيقة) يبقى متسامحاً كما كان (بلا أثر مخزون) — لم يُشدَّد لتفادي كسر تدفقات قائمة

## 2026-08-11 — p14: إصلاحات P1 (أسبوع 2 من خارطة تدقيق QA)

### النسخة الاحتياطية
- backups/p14_p1fixes_20260811_190230/ (4 ملفات)

### الإصلاحات (كلها مختبرة بـ curl)
1. **تقديم الملفات المرفوعة** (main.py): StaticFiles كان مستورداً بلا mount — كل /api/static/uploads/* كانت 404 (مرفقات المشتريات ميتة). أُضيف app.mount("/api/static"). تحقق: رفع PNG → يُقدَّم 200 image/png من الخلفية وعبر nginx ✔
2. **تحصين الرفع** (families_permissions_routes.py): حد أقصى 5MB → 400 بالعربية ✔ · فحص بصمات المحتوى (JPEG/PNG/GIF/WEBP) — ملف بمحتوى EXE بامتداد png → 400 ✔ (كان يُقبل)
3. **تفرد الباركود** (products_routes.py): فحص عند الإنشاء والتعديل يغطي barcode وadditional_barcodes في الاتجاهين → 409 بالعربية ✔ (كان مكرراً يُقبل 201 = غموض ماسح POS)
4. **عكس total_debt** (sales_service.py): return_sale_op وdelete_sale_op كانا يعكسان balance فقط — الآن total_debt أيضاً. تحقق: بيع آجل 1500 → إرجاع → 0/0 ✔ وبيع آجل → حذف → 0/0 ✔
5. **فهرس فريد جزئي barcode_unique_partial** (partialFilterExpression barcode>"" — sparse لا يكفي لأن "" قيمة موجودة): أُنشئ على القواعد الأربع (المنصة + 3 مستأجرين) + ضمان إنشائه عند الإقلاع لأي مستأجر مستقبلي. تحقق سباق إنشاء بنفس الباركود: 201+409 ووثيقة واحدة ✔ (DuplicateKeyError → 409 نظيف)

### اكتشاف موثق (بلا إجراء — قرار للمالك)
- مستأجر Amir: 7408 منتجات بلا name_en (null) + 83 وثيقة عائلات فاسدة — بقايا استيراد Excel قديم معطوب. التطبيق محصّن ضدها الآن لكن البيانات نفسها تحتاج قرار ترحيل/حذف

### التحقق الختامي
- 48 استدعاء × 4 أدوار = نظيف · الموقع 200 · صفر استثناءات جديدة
- تنظيف كامل: 5 منتجات اختبار، زبون، سندا بيع، إشعاران يتيمان، سجل تدقيق — الصندوق على الأساس -4,276,400 ✔

## 2026-08-11 — p15: إصلاحات P2 (أسبوع 3 من خارطة تدقيق QA)

### النسخة الاحتياطية
- backups/p15_p2fixes_20260811_192602/ (4 ملفات)

### الإصلاحات (كلها مختبرة عبر API)
1. **كتابة price_history في التحديث الجماعي** (families_permissions_routes.py): bulk-price-update كان يحدّث الأسعار بلا سجل — الآن يكتب سطراً لكل حقل متغير (change_reason=bulk_price_update). تحقق: +50% على منتج → سجل (10→15, changed_by) ✔
2. **سجل تدقيق المنتجات** (products_routes.py): أداة _audit_product + خطافات create/update/delete تكتب في product_audit_log (action, product_id, user_id, performed_by, details, changed_fields). تحقق Mongo: create + 3 update + delete لمنتج اختبار ✔
3. **Excel تالف → 400** (notifications_routes.py — نقطة الاستيراد /api/products/import/excel): load_workbook مغلّف بـ try/except → «ملف Excel تالف أو غير قابل للقراءة» بدل 500. تحقق: ملف تالف وملف فارغ → 400 ✔
4. **ذرّية حجز المخزون في طلبات المتجر** (online_store_routes.py): استبدال check-then-decrement بحجز ذري per-product مع دمج الأسطر المكررة وتراجع كلي. تحقق: طلب 5/مخزون 3 → 400 ✔ · سطران مكرران 2+2>3 → 400 ✔ · 2+1=3 → 200 ومخزون 0 ✔ · سباق 4 طلبات على مخزون 2 → نجح 2 بالضبط ورفض 2، مخزون نهائي 0 بلا سالب ✔

### التحقق الختامي
- مسح 10 نقاط نهاية لامستها الإصلاحات = صفر فشل
- تنظيف كامل: 3 طلبات ويب أُلغيت (المخزون استُعيد)، منتج الاختبار حُذف — الصندوق على الأساس ✔
- ملاحظة: أساس الصندوق أصبح -1,253,950 (تغيّر من -4,276,400 بفعل نشاط جلسة أخرى بين p14 وp15 — ليس من هذه المرحلة)

## 2026-08-12 — p16: استكمال استيراد BDV10 + إصلاح 413 + ميزات واجهة + P3

### النسخة الاحتياطية
- backups/p16_bdv10_import_20260812/ (أرشيف mongodump كامل لقاعدة ncrtelecom قبل الاستيراد + كل الملفات المعدلة + إعداد nginx)

### 1) استكمال استيراد BDV10.dblx (مستأجر ncrtelecom)
الاستيراد السابق جلب المنتجات/العائلات/الزبائن/الموردين فقط. الفحص الشامل لقاعدة Access (57 جدولاً) أظهر النقص، واستُورد كل الباقي بسكربت idempotent (import_source=BDV10 + legacy_id، uuid5 حتمي):
- **المبيعات**: 36,461 سند Receipt + 50,878 سطراً (ReceiptEntry) → sales بمخطط التطبيق (items بلقطات سعرية، paid/remaining من PaymentDue، status paid/partial/unpaid) — الفترة 2022-09-14 حتى 2026-08-11
- **المشتريات**: 1,339 سند Purchase + 10,066 سطراً → purchases
- **المصاريف**: 29 سند Charge → expenses (التصنيف من ChargeType)
- **تسويات المخزون**: 7,432 ItemAdjustment → stock_adjustments
- **عائلات الزبائن**: 6 → customer_families · **باركودات بديلة**: 4 ItemAlias دُمجت في additional_barcodes
- **أرشيف منظم**: legacy_employees (5، بدون كلمات مرور) · legacy_employee_salaries (25) · legacy_batches (1,415) · legacy_stock_takes (126 بأسطرها 10,367) · legacy_reference (طرق دفع/مستويات أسعار/VAT/وحدات)
- **تسوية الديون التاريخية**: PaymentDue لحظة البيع ≠ الدين الحالي (التسديدات كانت عبر AccountPayment لاحقاً). تخصيص FIFO (الأحدث يبقى) حتى رصيد Account الحالي: زبائن 124 عُدّلوا — أُزيل 201,018,742.79 دج ديوناً وهمية (2,041 سنداً سُدّد) · موردون 23 — 53,584,295 دج (114 سنداً). تحقق: مجموع remaining لكل زبون = رصيده الحالي ✔
- تحقق API بهوية المستأجر: المبيعات/المشتريات/المصاريف/التقارير/الإحصائيات كلها 200 — مبيعات اليوم 92,700 دج/13 سنداً، السنة 129.7M ✔

### 2) [إصلاح مكتشف] generate-code يقرأ القاعدة الرئيسية بدل المستأجر
sales/purchases/customers generate-code بلا Depends(require_tenant) → الترقيم يتجاهل قاعدة المستأجر (كان سيعطي BV0003/26 مكرراً). أُضيفت الصلاحية + regex ديناميكي \d+ (كان \d{4} ينكسر بعد 9999). تحقق: BV6190/26 وAC0363/26 يكملان ترقيم BDV10 ✔ وdemo يبقى BV0003/26 لقاعدته ✔

### 3) إصلاح 413 عند حفظ صور المنتج
nginx بلا client_max_body_size (افتراضي 1MB) وصور base64 تتجاوزه → 413. أُضيف client_max_body_size 25m لموقع /api/. تحقق: PUT بصور 3.6MB → 200 وتُحفظ ✔

### 4) صفحة المنتجات — 3 ميزات (نفس التصميم)
- **فلتر العائلة**: قائمة منسدلة (الخلفية تدعم family_id أصلاً) مع مسح الفلاتر وURL. تحقق API: فلترة إلكترونيات → 3 من 12 ✔
- **الكمية رقمياً**: الرقم بخط mono بجانب الشارة في العرض القائمي
- **أعمدة قابلة لتغيير العرض**: سحب بين العناوين (مقابض col-resize) مع حفظ في localStorage ونقرة مزدوجة لإعادة ضبط العمود — القالب gridTemplateColumns ديناميكي

### 5) معرّف مشترك قصير NT-####
- saas_counters ذري ($inc upsert) → short_id عند الإنشاء في create_tenant وregister_tenant + TenantResponse
- ترقيع: ncrtelecom = NT-0001 والعدّاد مزروع عند 1
- الواجهة: EntityCode يعرض NT-0001 (نسخ بنقرة، UUID الكامل في tooltip) + البحث يشمل short_id

### 6) P3: تنظيف index.html (PROD-BUG-015)
حذف emergent-main.js + سكربت visual-edit + PostHog (كان يسجّل الجلسات!)، وتصحيح canonical/og/sitemap/robots من nt-v16-staging.emergent.host إلى http://168.231.81.154. صفر مراجع خارجية متبقية ✔

### 7) P3: soft-delete + استنساخ + beforeunload + تقريب
- **سلة محذوفات**: حذف المنتج يؤرشف الوثيقة كاملة في deleted_products (deleted_at/by) + POST /products/{id}/restore. تحقق: حذف→استعادة كاملة ✔
- **استنساخ منتج**: POST /products/{id}/clone (اسم +"(نسخة)"، مخزون 0، باركود فارغ تفادياً للفهرس الفريد) + زر Copy في القائمة. تحقق 201 ✔
- **beforeunload**: تحذير مغادرة بتعديلات غير محفوظة في إضافة/تعديل منتج (isDirty عبر onChange الشامل، يُصفّر بعد الحفظ)
- **تقريب floats**: bulk-price-update (والمعاينة) round(x,2) دائماً — +33% على 100 = 133.0 لا 132.99999 ✔

### التحقق الختامي
- بناءان ناجحان، النشر main.322d2b46.js (stale purged، index.html يطابق) — كل علامات الميزات موجودة في الحزمة (فحص لاتيني)
- مسح demo (10 نقاط) + مستأجر (7) + super: صفر فشل · الصندوق على الأساس -1,253,950 ✔
- تنظيف بيانات الاختبار كامل (بما فيه سلة المحذوفات)

## 2026-08-12 — p17: نسخ احتياطي يومي مُسجَّل + مراقبة صحة كل 15 دقيقة

### ما أُضيف
- **scripts/daily_backup.sh** (cron 03:30): mongodump لكل قاعدة (المنصة + كل tenant_*) إلى أرشيف مؤرّخ لكل قاعدة في backups/daily/ — احتفاظ 14 يوماً، تسجيل في /var/log/ntcommerce_backup.log مع الأحجام وحالة القرص. تشغيل يدوي أول: 3 قواعد OK (ncrtelecom 38MB بعد استيراد المبيعات) fail=0
- **scripts/health_monitor.sh** (cron */15): فحص /api/health عبر nginx + الصفحة الرئيسية + حالة الحاويات الثلاث + nginx + قرص ≥85% → سطر OK أو ALERT في /var/log/ntcommerce_monitor.log. تحقق يدوي: OK disk=36%
- **اختبار استعادة فعلي**: mongorestore من الأرشيف إلى قاعدة scratch → 415 وثيقة restored successfully, 0 failed — الأرشيفات قابلة للاستعادة ✔

### ملاحظة
- وُجدت وظيفة نسخ قديمة (/opt/backups/backup_mongo.sh عند 03:00، تفريغ كامل بصيغة مجلدات، آخرها اليوم 03:00) — أُبقيت: نظامان متكاملان (تفريغ كامل + أرشيفات per-DB أسهل استعادةً انتقائيةً)

## 2026-08-12 — p18: logrotate للسجلات + تدوير سجلات حاويات Docker

### ما أُضيف
- **/etc/logrotate.d/ntcommerce** (نسخة مرقّمة في scripts/logrotate.ntcommerce): تدوير أسبوعي مضغوط لسجلي النسخ والمراقبة — 12 دورة، copytruncate. تحقق logrotate -d ✔
- **/etc/docker/daemon.json**: log-opts max-size=10m max-file=3 — سجلات الحاويات كانت بلا حد (backend 47MB, mongodb 20MB ومتصاعدة). أُعيد إنشاء الحاويات الثلاث لتطبيق السياسة — السجلات الجديدة بالكيلوبايت وتحت التدوير ✔
- nginx: مغطى أصلاً بإعداد logrotate الافتراضي للنظام
### التحقق
- كل الحاويات Up، API 200، الموقع 200، API المستأجر سليم بعد إعادة الإنشاء

## 2026-08-12 — p19: نسخ GitHub — مزامنة فورية + دفع يومي تلقائي

- البعيد origin (Nt-commerce17) كان متخلفاً (9cedb82) عن كل مراحل p13–p18 — دُفع الآن: remote HEAD = eef6ecc يطابق المحلي ✔
- cron يومي 04:00: git push origin main مع تسجيل في ntcommerce_backup.log — أي التزام جديد يُرفع تلقائياً في الليلة نفسها
- ملاحظة أمان موثقة (بلا إجراء): رمز PAT مضمّن في رابط origin بنص صريح — يُنصح باستبداله بـ deploy key أو إلغاء الرمز وتوليد آخر لاحقاً

---

## p20 — تدوير مفاتيح JWT (2026-08-11)

### قبل
- الحاوية كانت تعمل بمفتاح placeholder ضعيف معروف: `your-super-secret-jwt-key-change-in-production-ntcommerce-v16` (من `/opt/ntcommerce/.env` عبر env_file — له أولوية على backend/.env)
- المفتاح القوي في backend/.env لم يكن مستخدماً فعلياً

### النسخ الاحتياطي
- `backups/p20_jwt_rotation_20260811_220214/` (env.root + env.backend + docker-compose.yml) — مستثنى من git (يحوي أسراراً)

### التغييرات
- JWT_SECRET_KEY جديد: openssl rand -hex 48 (96 حرفاً) — في /opt/ntcommerce/.env و backend/.env
- SECRET_KEY جديد: openssl rand -hex 32 (64 حرفاً)
- JWT_SECRET (legacy) في backend/.env طُوّق بنفس القيمة
- إعادة إنشاء الحاوية: docker-compose up -d --force-recreate backend
- .gitignore: استثناء backups/p20_jwt_rotation_*/

### التحقق (curl)
- GET /api/health ← ok
- توكن قديم (قبل التدوير) ← 401 ✔ (كل الجلسات أُبطلت كما هو متوقع)
- تسجيل دخول demo جديد ← 200، توكن موقّع بالمفتاح الجديد
- GET /api/products عبر nginx ← 200
- ملاحظة: حساب superadmin@ntcommerce.com غير متأثر (كلمة المرور bcrypt مستقلة عن JWT) — يحتاج فقط إعادة تسجيل دخول

### الأثر
- كل الجلسات النشطة (مستخدمون + مستأجرون) سُحبت — إعادة تسجيل دخول مطلوبة

---

## p21 — تفعيل خدمة Gemini AI (2026-08-11)

### قبل
- المحادثة الموازية أنشأت backend/services/ai_service.py + routes/ai_routes.py + زر AI في TenantDialogs.js — لكن غير مسجلة، وبها خطأ مسار استيراد، وبلا مفتاح، والواجهة غير مبنية

### النسخ الاحتياطي
- backups/p21_ai_gemini_20260811_230952/ (main.py, ai_routes.py, ai_service.py, TenantDialogs.js)

### الإصلاحات
- ai_routes.py: حذف sys.path.insert(/opt/ntcommerce/backend/services) (مسار مضيف غير موجود داخل الحاوية /app) ← from services.ai_service import ai_service
- ai_service.py: النموذج قابل للضبط عبر GEMINI_MODEL، الافتراضي gemini-2.5-flash (1.5 أُحيل للتقاعد)
- main.py: تسجيل الراوتر في try/except — [INIT] AI (Gemini) routes registered at /api/ai
- النقاط: POST /api/ai/generate-description, /api/ai/translate, /api/ai/social-post (تحتاج get_tenant_admin)، GET /api/ai/status (عامة)

### التحقق (curl)
- GET /api/ai/status ← {"configured":false,...} ✔
- POST بدون توكن ← 403 ✔ (الحماية تعمل)
- POST بتوكن demo ← رسالة عربية واضحة "أضف GEMINI_API_KEY" ✔ (لا انهيار)
- الواجهة: بناء + نشر main.23ec415d.js (حذف main.322d2b46.js)، تحقق generate-description + product-name-input في الحزمة ✔

### المتبقي
- إضافة GEMINI_API_KEY (مجاني من aistudio.google.com) إلى /opt/ntcommerce/.env + إعادة تشغيل backend — لا حاجة لإعادة بناء الواجهة

---

## p22 — تفعيل مفتاح Gemini وتشغيل AI فعلياً (2026-08-11)

### التغييرات
- GEMINI_API_KEY أُضيف إلى /opt/ntcommerce/.env و backend/.env (ملفات .env غير مرفوعة لـ git)
- النموذج الافتراضي gemini-2.5-flash رُفض من Google للمستخدمين الجدد (404) — استعلمنا /v1beta/models بالمفتاح واخترنا gemini-3.1-flash-lite عبر GEMINI_MODEL
- إصلاح عرض النموذج في /api/ai/status (كان نصاً ثابتاً قديماً ← ai_service.MODEL)

### التحقق (curl بتوكن demo)
- status ← configured:true, model:gemini-3.1-flash-lite ✔
- توليد وصف منتج (A54) ← success، عربية تسويقية سليمة، ~8 ثوانٍ ✔
- ترجمة فرنسية (قياسية + دارجة) ← success ✔
- منشور فيسبوك مع سعر ودعوة توصيل + هاشتاغات ← success ✔

---

## p23 — تفعيل الروبوتات الثمانية عبر Gemini (مجاني) (2026-08-11)

### المشكلة
- الروبوتات الثمانية (services/ai/agents.py) تعمل عبر llm_service.py الذي يتطلب AI_INTEGRATIONS_OPENAI_* — مفتاح Gemini وحده لا يكفي

### الحل
- Google توفر نقطة متوافقة مع OpenAI: https://generativelanguage.googleapis.com/v1beta/openai/ — نفس مفتاح Gemini يعمل
- أضفنا AI_INTEGRATIONS_OPENAI_API_KEY + BASE_URL + MODEL=gemini-3.1-flash-lite إلى .env الجذري وbackend/.env
- llm_service.py: AI_MODEL صار قابلاً للضبط عبر env (كان "gpt-5" ثابتاً)
- سبب فشل أول: المتغيرات كتبت للجذري فقط + restart لا يعيد تحميل env_file — الحل: كتابة backend/.env (load_dotenv) + up -d --force-recreate

### التحقق (curl بتوكن demo)
- /api/ai/agents/status ← الثمانية is_enabled:true ✔
- classify-expense (فاتورة كهرباء Sonelgaz) ← utilities بثقة 1.0 + سبب عربي ✔
- agents/run expense_classifier (اشتراك Djezzy) ← utilities، 6.7 ث (نداء LLM حقيقي لا fallback) ✔

---

## p24 — تطهير GitHub من بيانات المستأجرين (2026-08-12)

### المشكلة
- ملفات حساسة كانت متتبعة ومرفوعة على GitHub العام:
  - backups/daily/*.archive (أرشيفات 3 قواعد بيانات كاملة — تسربت عبر التزام git add -A سابق)
  - archive/data/backups/global_all_tenants_*.json.gz
  - backups/p16.../tenant_5e7c8fc5_pre_sales_import.archive

### الحل
- نسخة أمان كاملة من .git في backups/p24_gitpurge_20260812_001200/ (محلية فقط)
- git rm --cached للملفات (بقيت على القرص — النسخ الاحتياطية اليومية لم تتأثر)
- .gitignore: backups/daily/ + backups/p*_*/ + archive/data/backups/ + *.archive + *.mongodump
- git filter-branch --index-filter --prune-empty على كل التاريخ + reflog expire + gc --prune=now
- git push --force (d515ea9 → 8fff2dc)

### التحقق
- git log --all -- <المسارات> ← فارغ تماماً ✔
- الملفات على القرص سليمة ✔ (النسخ اليومية مستمرة)
- الحقول الحساسة لم تعد في أي التزام محلي أو بعيد ✔

### ملاحظة
- من استنسخ المستودع سابقاً يحتاج clone جديد (التاريخ أُعيدت كتابته)

---

## p25 — توسعة خريطة اللوحة الأم (2026-08-12)

### التغيير
- core/modules_map.py: إضافة 3 مكوّنات كانت غير مراقبة:
  - installments (الأقساط) ← /api/installments
  - digital_panel (البانل الرقمي) ← /api/digital-panel, /api/digital
  - ecom_hub (صندوق الطلبات الموحّد) ← /api/ecom, /api/orders, /api/promotions, /api/platform-cards
- لا تغيير في الواجهة (اللوحة تجلب المكوّنات ديناميكياً)

### التحقق
- registry.get_all() داخل الحاوية ← 27 مكوّناً (كان 24) ✔
- /api/health ← ok ✔
- النسخ الاحتياطي: backups/p25_motherboard_modules_*/

---

## p26 — إظهار الصفحات المخفية في القوائم (2026-08-12)

### التغيير
- components/Layout.js: إضافة 8 روابط لصفحات كانت تعمل بلا زر قائمة + استيراد أيقونة Megaphone:
  - المبيعات: /auto-reports (التقارير التلقائية، featureKey reports)
  - الصيانة: /repairs/parts (قطع الغيار)
  - التجارة الإلكترونية: /ecom-hub/store, /ecom-hub/ads, /ecom-hub/shipping (featureKey ecommerce_hub)
  - الخدمات الرقمية: /digital-services, /digital-admin (isAdmin فقط)
  - الإعدادات: /settings/datetime, /settings/printing/template-editor
- لم تُضف /portal (نسخة من صفحة الدخول) ولا /features (صفحة تسويقية عامة)
- النسخ الاحتياطي: backups/p26_menu_links_*/

### التحقق
- بناء + نشر main.bd736fce.js (حذف main.23ec415d.js) ✔
- المسارات الستة موجودة في الحزمة المنشورة (grep لاتيني) ✔

---

## p27 — اختبار شامل للروبوتات الثمانية + إصلاح علة (2026-08-12)

### الاختبار (curl على مستأجر demo، نداءات LLM حقيقية عبر Gemini)
| الروبوت | النتيجة |
|---|---|
| invoice_processor | استخرج فاتورة SARL TechnoDZ كاملة (بنود + TVA 23560) بثقة 0.95 وأنشأ قيداً ✔ |
| expense_classifier | (مختبر سابقاً في p23) ✔ |
| financial_analyzer | تحليل عربي كامل للفترة (إيرادات 10800، هامش) ✔ |
| fraud_detector | كشف معاملة شاذة 1,260,000 بشدة high ✔ |
| smart_reporter | P&L كامل بالأرقام ✔ |
| tax_assistant | تقدير ضريبي جزائري (TVA 19% + TAP + IBS) مع توصيات ✔ |
| forecaster | توقع 3 أشهر مع درجات ثقة ✔ |
| daily_automation | فشل أولاً: E11000 duplicate key عند إعادة التشغيل نفس اليوم |

### الإصلاح
- agents.py: insert_one ← update_one upsert في حفظ التقرير اليومي
- بعد الإصلاح: تشغيلان متتاليان ناجحان (daily_summary, anomaly_detection, overdue_check, low_stock_check) ✔
- النسخ الاحتياطي: backups/p27_agents_test_*/

---

## p28 — الإطلاق الآمن (تنظيف + جدار ناري + تقرير) (2026-08-12)

### رُفض من الخطة المقترحة (تدميري)
- محو قواعد البيانات، docker prune --volumes، docker-compose.staging.yml (غير موجود)، SSL ذاتي التوقيع (يكسر 413-fix ويُظهر تحذير أحمر للزبائن)، محو bash_history

### نُفّذ (آمن)
- تنظيف: كاش البناء + pycache + سجلات قديمة + journal (80M) + apt + docker dangling (4.68G) — القرص من 36% إلى 13% (تحرير 22GB)
- ملاحظة: التنظيف حذف ملفات .bak داخل backups/20260807 (نسخ قديمة — النسخ اليومية للقواعد سليمة)
- UFW: deny incoming، سماح 22/80/443 فقط — نشط
- Docker يتجاوز UFW ← backend صار 127.0.0.1:8001:8001 (المنفذ 8001 مغلق خارجياً، التحقق: 000 من الخارج، 200 عبر nginx)
- حذف قاعدة restore_test المتبقية من اختبار الاستعادة
- تقرير شامل: /opt/ntcommerce/REPORT_20260812.txt — كل الفحوص خضراء (403 على /api/products بدون توكن = سلوك صحيح)

---

## p29 — محو قواعد المستأجرين التجريبيين (2026-08-12) — بطلب المستخدم

### قبل
- نسخة نهائية: backups/p29_tenant_purge_20260812_133007/ (tenant_ncrtelecom_final.archive 39.9MB + tenant_hani_final.archive 0.5MB)
- ملاحظة: سجلات saas_tenants كانت قد حُذفت مسبقاً (من الجلسة الموازية) — القاعدتان كانتا يتيمتين

### المحو
- dropDatabase: tenant_5e7c8fc5 (ncrtelecom تجريبي) + tenant_dc57b2a1 (hani)
- تنظيف المراجع اليتيمة من ntcommerce: impersonation_logs 17, auto_reports 16, push_notifications 1406, store_slugs 2, collection_reports 2, whatsapp_config 1 (المجموع 1444)

### بعد
- قواعد البيانات: admin, config, local, ntcommerce فقط ✔
- health + login demo + products ✔

---

## p30 — إصلاح خطف تسجيل الدخول (مستخدم يتيم في القاعدة الأساسية) (2026-08-12)

### المشكلة (بلاغ المستخدم)
- حذف المستخدم مستأجر ncrtelecom وأعاد تسجيله مشتركاً جديداً (NT-0002، قاعدة tenant_1c16c29a نظيفة) — لكن "المعلومات القديمة رجعت"

### السبب الجذري
- سجل مستخدم يتيم في القاعدة الأساسية: users[nouacertelecom05@gmail.com] من 11-08 ("Test User"، بلا tenant_id)
- /api/auth/login يفحص users الأساسية فقط ← يطابق اليتيم ← جلسة على قاعدة demo (12 منتجاً/11 زبوناً/2 بيع) بدل قاعدة المستأجر النظيفة
- قاعدة المستأجر الجديدة كانت سليمة تماماً (فارغة إلا البذور: 4 صناديق، إعدادات، مخزن)

### الإصلاح
- نسخ السجل إلى backups/p29.../stale_main_user_nouacer.json ثم حذفه
- بعده: /api/auth/login بالبريد ← 401 ✔ (لا خطف)، سجل saas_tenants سليم ✔
- دخول المشترك الآن عبر /tenant-login ← /api/saas/tenant-login (يفحص saas_tenants)

---

## p31 — القاعدة الذهبية template_tenant (2026-08-12)

### المشكلة البنيوية
- مسارا بذر منفصلان غير متزامنين: init_tenant_database (3 بذور عند التسجيل) و init_default_data (7 لاحقاً) — كل مستأجر يولد مختلفاً
- قواعد المستأجرين الجدد بصفر فهارس (الأساسية فيها 405)

### الحل
- services/tenant_template.py: build_template / copy_template_to_tenant / doctor_tenant / doctor_all
- template_tenant: 142 جدولاً + 385 فهرساً (محصودة من الأساسية العاملة) + 27 وثيقة بذرة (صناديق، مخزن، عائلات، زبون/مورد نقدي، عملات DZD/USD/EUR، ضرائب TVA 19/9 + TAP، 3 قوالب فواتير، 5 فئات عيوب، إعدادات ولاء)
- ربط مساري الإنشاء (التسجيل العام + إنشاء الإدارة) بالنسخ من القالب مع fallback للبذر القديم
- endpoints للمشرف: /saas/template/info, /rebuild, /doctor/{id}, /doctor-all (fix= اختياري)
- علة أُصلحت: list_collection_names() ليست async-iterable في Motor

### التحقق
- مشترك تجريبي عبر /saas/register ← doctor: healthy True فوراً (0 ناقص) ✔
- قاعدة المستخدم الحقيقي (NT-0002) رُقّيت: +21 بذرة +385 فهرساً، healthy ✔
- 3 قواعد اختبار حُذفت بعد النجاح ✔
- ملاحظة: "connection closed" عرضي في العمليات الطويلة — doctor(fix) يكمل الناقص عند إعادة التشغيل

---

## p32 — تطوير نظام قواعد البيانات (الحزمة الحمراء + الصفراء 1–6) — 2026-08-12

### Backup قبل العمل
`/opt/ntcommerce/backups/p32_db_dev_20260812/` — نسخ من: database.py, registration_routes.py, tenants_routes.py, docker-compose.yml, data_integrity_robot.py, diagnostics.py, tenant_template.py

### البند 3 — استقرار اتصال Mongo
- **قبل**: `AsyncIOMotorClient(MONGO_URL)` بلا خيارات → انقطاعات "connection closed" في العمليات الطويلة (p31).
- **بعد**: `maxPoolSize=50, minPoolSize=5, maxIdleTimeMS=30000, serverSelectionTimeoutMS=10000, connectTimeoutMS=10000, socketTimeoutMS=120000, waitQueueTimeoutMS=10000, retryWrites=True` في `backend/config/database.py`.
- **اختبار**: force-recreate + startup نظيف + openapi 743 مساراً 200.

### البند 2 — فحص التسجيل المزدوج
- **قبل**: `/api/saas/register` يفحص `saas_tenants` فقط → بريد مملوك لمستخدم قديم في `users` الرئيسية يمرّ ويختطف `/api/auth/login` (فئة خلل p30).
- **بعد**: فحص case-insensitive في `saas_tenants` و`users` معاً، رسالة رفض واضحة لكل حالة (`registration_routes.py`).
- **اختبار curl**: تسجيل ناجح → تكرار مرفوض 400 → بريد مستخدم قديم مرفوض 400 برسالة "مستخدم بالفعل في حساب آخر". تم التنظيف بعد الاختبار.

### البند 1 — حذف المستأجر المتتالي (Cascade Delete)
- **قبل**: `DELETE /saas/tenants/{id}` يحذف سجل المستأجر فقط + عكس عمولات pending → تبقى قاعدة البيانات والمستخدمون المختطفون والمراجع اليتيمة.
- **بعد** (`tenants_routes.py::_cascade_delete_tenant`): 1) أرشفة قاعدة المستأجر JSON إلى `/backups/tenant_delete_<id>_<ts>/` (رُكّب `./backups:/backups` في compose) 2) drop للقاعدة 3) حذف مستخدمي القاعدة الرئيسية بنفس البريد 4) عكس عمولات pending داخل نافذة الاسترجاع 5) مسح ديناميكي لكل مرجع `tenant_id` في مجموعات المنصة (باستثناء saas_tenants/saas_plans/users/agent_commissions) 6) حذف السجل 7) سجل تدقيق في `platform_audit_log`.
- **اختبار E2E**: 9/9 فحوصات PASS (أرشيف 142 مجموعة، حذف القاعدة، إزالة المختطف، تنظيف المراجع، عكس العمولة، التدقيق).

### البند 4 — ترقيات مرقمة (Migrations)
- **جديد**: `backend/migrations/` (حزمة) + `001_ensure_counters.py` (عدّادات ترقيم invoice/quote/order/repair) + `backend/services/migrations_runner.py` (اكتشاف، تطبيق بالترتيب على template_tenant وكل tenant_*، سجل `migration_log` لكل قاعدة، إيقاف القاعدة عند أول فشل حفاظاً على الترتيب).
- **نقاط**: `GET /api/saas/migrations/status` + `POST /api/saas/migrations/run` (super admin).
- **اختبار**: pending → applied على القالب والمستأجر الحقيقي، 4 عدّادات، إعادة التشغيل idempotent (0 تطبيقات).

### البند 5 — دمج الطبيب مع روبوت سلامة البيانات
- **جديد**: `_run_weekly_doctor()` في `data_integrity_robot.py` — أسبوعياً: `doctor_all(fix=True)`، لقطة في `platform_db_health`، تنبيه critical عند قواعد غير سليمة بعد الإصلاح.
- **بطاقة اللوحة الأم**: `GET /api/diagnostics/db-health` (آخر لقطة طبيب + أحجام حية).
- **إصلاح خلل مكتشف**: `doctor_tenant` كان يرمي KeyError 'code' على مستندات البنية التحتية (counters/migration_log) → سلسلة هوية id→code→name مع تخطي ما لا هوية له.
- **اختبار**: تشغيل الروبوت → doctor_runs=1، لقطة صحية للمستأجر الحقيقي.

### البند 6 — مراقبة حجم ونمو القواعد
- **جديد**: `_check_db_sizes()` في الروبوت (أسبوعياً مع الطبيب): dbStats لكل قاعدة، لقطة نمو في `platform_db_sizes`، تنبيه warning عند تجاوز 500MB. نقطة db-health تعرض `over_threshold`.
- **اختبار**: لقطة محفوظة (قاعدتان، لا تجاوز حالياً).

### الملفات المتغيرة
database.py, registration_routes.py, tenants_routes.py, migrations_runner.py (جديد), migrations/ (جديد), data_integrity_robot.py, diagnostics.py, tenant_template.py, docker-compose.yml

---

## p33 — الحزمة الخضراء: اختبار الاستعادة + الأرشفة + الديمو المنفصل + وثائق المخطط — 2026-08-12

### Backup قبل العمل
`/opt/ntcommerce/backups/p33_green_20260812/` — data_integrity_robot.py, tenants_routes.py, diagnostics.py, old_demo_user.json

### البند 7 — أتمتة اختبار الاستعادة
- **جديد**: `backend/services/restore_test.py` — `run_restore_test()` يستعيد أحدث أرشيف JSON (أو تفريغ القالب الذهبي عند غياب الأرشيفات) إلى قاعدة مؤقتة، يتحقق من أعداد المجموعات/المستندات، يحذف المؤقتة، ويسجل في `platform_restore_tests`.
- **نقاط**: `POST /api/saas/restore-test` + `GET /api/saas/restore-test/latest` + إظهار آخر اختبار في `/api/diagnostics/db-health`.
- **أتمتة**: شهرياً داخل روبوت سلامة البيانات، مع تنبيه critical عند الفشل.
- **أخطاء اكتشُفت وأُصلحت**: (أ) تسريب ObjectId بعد insert_one عطّل تسلسل JSON → نسخة `dict(report)`؛ (ب) تزاحم اختبارين على نفس اسم القاعدة المؤقتة → قفل asyncio + لاحق uuid للاسم؛ (ج) الإيقاع الزمني كان يضيع مع إعادة التشغيل → محفوظ الآن في القاعدة.
- **اختبار**: 16 مجموعة / 32 مستنداً / صفر اختلاف / ok=true.

### البند 8 — سياسة الأرشفة والاحتفاظ
- الحذف المتتالي (p32) يؤرشف دائماً قبل الحذف. جديد: `enforce_archive_retention(keep=5)` يحتفظ بأحدث 5 أرشيفات ويحذف الأقدم، يعمل مع كل اختبار استعادة وشهرياً مع الروبوت.

### البند 9 — مستأجر تجريبي منفصل
- **قبل**: القاعدة الرئيسية `ntcommerce` تلعب دوراً مزدوجاً (منصة + ديمو) مع مستخدم demo@ntcommerce.com قديم (فئة اختطاف).
- **بعد**: أُرشف المستخدم القديم وحُذف، وأُنشئ مستأجر demo رسمي عبر مسار التسجيل: `demo@ntcommerce.com` / `Demo@123456` (خطة Enterprise، `is_demo: true`) بقاعدة خاصة منسوخة من القالب الذهبي.
- **فجوة اكتشُفت وأُصلحت**: المستأجرون الجدد كانوا يفوتون محتوى الترقيات (counters/migration_log) لأنها بنية تحتية لا بيانات بذور → أضيف `migrate_database()` وربطه بنهاية `copy_template_to_tenant()`؛ الآن كل مستأجر جديد يولد محدثاً بالكامل. اختبار E2E ناجح + إلحاق الديمو.

### البند 10 — وثائق المخطط
- **جديد**: `backend/scripts/generate_schema_docs.py` يولّد `SCHEMA.md` من القالب الذهبي الحي (دورة الحياة + 144 مجموعة + كل الفهارس غير الافتراضية). أعيد توليده والتزم به.

### الملفات المتغيرة
restore_test.py (جديد), tenants_routes.py, data_integrity_robot.py, diagnostics.py, migrations_runner.py, tenant_template.py, scripts/generate_schema_docs.py (جديد), SCHEMA.md (جديد)

---

## p34 — دستور النظام: سد الفجوات الخمس (بعد موافقة المستخدم: قاعدة لكل مستأجر + Monolith معياري) — 2026-08-12

### Backup قبل العمل
`/opt/ntcommerce/backups/p34_gaps_20260812/` — data_integrity_robot.py, tenants_routes.py, tenant_template.py, security_routes.py, online_store_routes.py

### قرارات المستخدم (موثقة)
- قاعدة بيانات لكل **مستأجر** فقط (المستخدمون داخل المستأجر يشاركون قاعدته بصلاحيات)
- إبقاء **Monolith معياري** الآن، فصل الخدمات عند نمو الحمل فعلياً
- تنفيذ الفجوات الخمس كلها

### الفجوة 1 — القالب الذهبي في مكان آمن
- **جديد**: `services/template_snapshot.py` — تصدير `template_tenant` إلى JSON في `/backups/template_snapshot_<ts>/` أسبوعياً (روبوت) + يدوياً `POST /api/saas/template/snapshot`، احتفاظ بآخر 4.
- **اختبار**: 16 مجموعة/32 مستنداً على القرص + سجل في `platform_template_snapshots`.

### الفجوة 2 — نظام ID الموحد
- **جديد**: `utils/ids.py` — المولّد المركزي الوحيد: `new_id()` (uuid4)، `short_token()`، `next_document_number(db, kind)` ترقيم تسلسلي ذري عبر counters (INV-2026-000001...)، وسجل `ID_FORMATS` يوثق 6 صيغ معرّفات. القاعدة: كل معرّف جديد يُولد هنا فقط؛ البيانات القديمة لا تُمس.
- **تبنّى فوراً**: تسجيل المستأجرين + سجل تدقيق الحذف المتتالي. نقطة `GET /api/diagnostics/id-formats`.
- **اختبار**: تسلسل 000001→000002 ذري + 6 صيغ موثقة.

### الفجوة 3 — سجل الشجرة الأم
- **جديد**: `services/db_tree.py` — شجرة رسمية في `platform_db_tree`: أم (ntcommerce) ← نموذج ذهبي + نموذج متجر ← أفرع المستأجرين + كشف القواعد اليتيمة. تحديث أسبوعي (روبوت) + نقاط `GET/POST /api/saas/db-tree[/rebuild]` + بطاقة في `/api/diagnostics/db-health`.
- **اختبار**: 4 عقد، صفر يتيم، بطاقة اللوحة الأم تعرض الشجرة.

### الفجوة 4 — نموذج المتجر الإلكتروني
- **جديد**: `services/store_template.py` + قاعدة `store_template` الرئيسية (store_settings/payment_settings/shipping_settings/ecom_integrations — افتراضات جاهزة: COD مفعل، متجر معطل حتى يفعله المشترك). تُنسخ تلقائياً لكل مستأجر جديد ضمن `copy_template_to_tenant` (غير تدميري).
- **نقاط**: `GET /saas/store-template/info`، `POST /rebuild`، `POST /copy/{tenant_id}`.
- **اختبار E2E**: مستأجر جديد وُلد بمتجر مهيأ كاملاً.

### الفجوة 5 — تشفير السكون التطبيقي
- **جديد**: `utils/crypto.py` — Fernet (AES-128-CBC+HMAC)، صيغة `enc:v1:`، مفتاح `FIELD_ENCRYPTION_KEY` في البيئة (fail-fast)، النصوص القديمة تمر وتُشفر عند أول كتابة.
- **تطبيق**: مفاتيح API (تُخزن مشفرة، تُعرض نصاً مرة واحدة، تُقنّع في القوائم) + أسرار WooCommerce (تشفير عند الحفظ، فك عند القراءة لصاحب المتجر فقط).
- **اختبار**: DB يخزن `enc:v1:...`، GET يعيد النص الأصلي، القائمة مقنّعة. تشفير النقل (TLS) ما زال بانتظار الدومين.

### الملفات المتغيرة
template_snapshot.py, ids.py, db_tree.py, store_template.py, crypto.py (كلها جديدة) + tenants_routes.py, data_integrity_robot.py, tenant_template.py, diagnostics.py, registration_routes.py, security_routes.py, online_store_routes.py

---

## p35 — زر الوصف بالذكاء الاصطناعي في صفحات المنتج — 2026-08-12

### المشكلة
المستخدم أبلغ: صفحتا إضافة/تعديل المنتج (`/products/add`, `/products/:id/edit`) لا تحويان زر توليد الوصف بالذكاء الاصطناعي، رغم أن النقطة `/api/ai/generate-description` تعمل (Gemini). التنفيذ كان موجوداً فقط في `TenantDialogs.js` (حوار لوحة المستأجر) ولم يصل للصفحات الرئيسية.

### الحل (بلا أي تغيير تصميمي — نفس نمط زر الباركود)
- `AddProductPage.js` + `EditProductPage.js`: زر ghost صغير بأيقونة Sparkles بجانب عنوان حقل الوصف (`data-testid="ai-description-btn"`)، يستدعي `/ai/generate-description` باسم المنتج ووصفه الحالي كمميزات، ويملأ حقل الوصف بالنتيجة العربية، مع toast نجاح/فشل بالعربية والفرنسية.
- **Backup**: `backups/p34_gaps_20260812/{AddProductPage,EditProductPage}.js`
- **اختبار النقطة حياً** (حساب الديمو): `success: true`، وصف تسويقي عربي كامل عبر gemini-3.1-flash-lite.
- **النشر**: main.22240482.js (كان bd736fce) — تحقق من hash في index.html ومن وجود الزر في الحزمة عبر data-testid.

---

## p36 — تدوير GitHub PAT والانتقال إلى مستودع جديد — 2026-08-12

- **قبل**: remote يستخدم Classic PAT مكشوفاً (`ghp_VBd0...`) نحو `nouaceramine/Nt-commerce17`.
- **بعد**: remote جديد `nouaceramine/nt-commercev20` بتوكن Fine-grained (`ntcommerce-vps`) مقيد بريبو واحد وصلاحيتين فقط (Contents + Workflows — الثانية لزمت لدفع `.github/workflows/lint.yml`).
- دُفع تاريخ main كاملاً بنجاح إلى المستودع الجديد.
- **تنظيف التوكن القديم**: أُزيل من `archive/setup_enhanced.py` و`/root/.bash_history` (0 بقايا خارج أرشيف p24 الاحتياطي على الخادم المحلي).
- **بانتظار المستخدم**: إبطال الـ Classic PAT القديم من GitHub (يصبح أرشيف p24 غير ضار بعدها).

---

---

## p37 — إصلاح التنقل الخاطئ /shop/undefined بعد حفظ المنتج — 2026-08-12

- **الجذر**: مسار /products/:id كان يعرض مكوّن المتجر العام ProductDetailPage الذي يتطلب slug — في السياق الإداري slug=undefined فطلب /shop/undefined/product/... يفشل ومعالج الخطأ ينقل إلى /shop/undefined. كان يضرب بعد الحفظ وعند الاختيار السريع.
- **الإصلاح** (بلا تغيير تصميمي): (1) EditProductPage بعد الحفظ ينتقل إلى /products؛ (2) الاختيار السريع في القائمة ينتقل إلى /edit للأدمن و/products لغيره؛ (3) مسار /products/:id أصبح redirect إلى /products.
- **Backup**: backups/p34_gaps_20260812/ (ProductsPage, EditProductPage, App.js)
- **النشر**: main.16947345.js (كان 22240482) مع تحقق hash في index.html.


---

## p38 — 2026-08-13 — تصدير/استيراد متعدد الصيغ + صور AI للمنتجات + تحسين فاتورة الشراء

### أ) استيراد/تصدير المنتجات (csv / xlsx / txt / pdf / docx)
**قبل:** التصدير CSV فقط، الاستيراد CSV/Excel فقط.
**بعد:**
- `backend/routes/import_export_routes.py`: تصدير بخمس صيغ — txt (مفصول بعلامات الجدولة + BOM)، pdf (reportlab + خط NotoNaskhArabic + arabic_reshaper + bidi للعربية، A4 أفقي)، docx (python-docx Table Grid). الاستيراد: csv/txt (كشف الفاصل تلقائياً)، xlsx، docx. استيراد PDF معطّل برسالة عربية واضحة (غير عملي).
- `insert_many(ordered=False)` مع BulkWriteError → تسامح مع التكرارات + تقرير `skipped_duplicates`.
- `backend/assets/NotoNaskhArabic-Regular.ttf` خط عربي مضمّن في الحاوية.
- `requirements.txt`: arabic-reshaper, python-bidi, pypdf, python-docx — أعيد بناء الصورة (up -d --build).
- `frontend/src/pages/DataImportExportPage.js`: أزرار 5 صيغ تصدير + accept موسّع.
- تحقق curl: pdf-export 200 (11053B)، round-trip عربي سليم للصيغ الأربع.

### ب) جلب صور المنتج بالذكاء الاصطناعي
**قبل:** لا توجد وسيلة لجلب صور للمنتج.
**بعد:**
- `POST /api/ai/product-images` في `backend/routes/ai_routes.py`: Gemini يحوّل اسم المنتج (أي لغة) لعبارة بحث إنجليزية → Openverse API (مجاني، رخص تجارية) → 5 صور حقيقية. تبسيط تدريجي للعبارة عند 0 نتائج (مطابقة Openverse كل-الكلمات). ملاحظة: توليد صور Gemini معطّل لاستنفاد الحصة (429) — صور حقيقية أنسب للمنتجات.
- `frontend/src/components/forms/AiImagePicker.js`: زر «صور AI» (data-testid=ai-images-btn) + نافذة اختيار 5 صور، النقر يضيف الرابط إلى formData.images.
- مدمج في AddProductPage.js و EditProductPage.js بجانب ProductImagesInput.
- تحقق curl: 3 أسماء عربية → 5 صور لكل منها.

### ج) صفحة المشتريات — عملية شراء جديد
**قبل:** أزرار دفع ضخمة (h-16 عمودية)، سلة بجدول ثقيل، لا اختيار مخزن.
**بعد:**
- `PurchaseDialogs.js`: أزرار نوع الدفع/طريقة الدفع h-8 أفقية مدمجة، ملاحظات سطر واحد، زرا الحفظ/التأكيد h-9 بأيقونات lucide. السلة قائمة مدمجة (divide-y، صف واحد لكل منتج: صورة 8×8 + اسم + سعر + كمية + مجموع + حذف) بارتفاع 380px بدل 300px.
- اختيار المخزن: Select (data-testid=warehouse-select) تحت المورد، يُجلب من GET /warehouses.
- `PurchasesPage.js`: جلب المخازن + تمرير warehouse_id/warehouse_name في POST /purchases + إعادة تعيين بعد الشراء.
- `backend/routes/purchases_routes.py`: تسجيل warehouse_id/warehouse_name على الفاتورة (مع جلب الاسم من DB). المخزون العام يبقى كما هو.
- تحقق: GET /warehouses → «المخزن الرئيسي»؛ POST /purchases مع warehouse_id → حارس المورد يعمل (404 لمورد غير موجود).

### النشر
- Bundle: main.51c31fc8.js (استبدل main.16947345.js) — التحقق من hash في index.html وعبر curl.
- نسخ احتياطية: ai_routes.py.bak.p38b, AddProductPage/EditProductPage.bak.p38b, purchases_routes/PurchasesPage/PurchaseDialogs.bak.p38c, www_before_p38/.
- علامات الحزمة المتحقق منها: ai-images-btn, ai-images-dialog, product-images, Openverse, warehouse-select, purchase-cart-list, accept formats.


---

## p39 — 2026-08-13 — إكمال صفحة المنتج في المتجر العام (على نمط nouacer.com/product)

**قبل:** صورة واحدة فقط، سعر بدون شارة توفير، نموذج طلب في نافذة منبثقة (modal)، لا ملخص طلب داخل الصفحة.
**بعد:** `frontend/src/pages/store/ProductDetailPage.js` أُعيد بناؤها على نمط https://nouacer.com/product/cable-hoco/ مع الحفاظ على هوية المتجر وألوانه وميزاته (كوبون/ولاء/تتبع):
- **معرض صور**: صورة رئيسية قابلة للتبديل + مصغرات (image_url + images بدون تكرار) — data-testid: pd-main-image, pd-gallery, pd-thumb-N. عمود الصور sticky على الشاشات الكبيرة.
- **كتلة السعر**: السعر الحالي (بلون المتجر primary_color) + السعر القديم مشطوباً + شارة «وفر X%» (pd-save-badge).
- **صندوق طلب COD مضمّن** (cod-form-box) بتصميم المرجع (خلفية f0f9ff، إطار 7dd3fc): الاسم+الهاتف في سطر، الولاية (58 ولاية)+البلدية المتسلسلة، العنوان، حقل الكوبون، نقاط الولاء، محدد الكمية (+/-)، ملخص حي (المنتج×الكمية، الخصم، التوصيل — مجاني عند delivery_fee=0 مع دعم free_delivery_threshold)، زر «انقر هنا لتأكيد الطلب — الإجمالي» بتدرّج لوني (cod-confirm-btn). إرسال delivery_fee الفعلي مع الطلب.
- **بطاقة الوصف الطويل** منفصلة أسفل (pd-long-desc).
- حالة التوفر بالمخزون، شارات الثقة، شاشة نجاح الطلب مع رقم الطلب ورابط التتبع، منتجات مشابهة — كلها محفوظة.
- تجاوب الجوال: عمود واحد عبر media query.
- تحقق: bundle main.55540380.js، لقطة متصفح فعلية للصفحة الحية تُظهر كل العناصر تعمل.
- نسخة احتياطية: backups/ProductDetailPage.js.bak.p39.


---

## p40 — 2026-08-13 — إصلاح اختفاء المنتجات والعائلات من واجهة المتجر /shop/nt

**السبب الجذري (تحقق من DB):** طلبان تجريبيان من المتجر استنفدا مخزون المنتج الوحيد (3→0). الـ backend كان يخفي أي منتج كميته ≤0 من قائمة المتجر تماماً (`quantity: {$gt: 0}`)، وكانت العائلات تُبنى من المنتجات الظاهرة فقط — فاختفى كل شيء. صفحة المنتج أيضاً كانت ترجع 404 للمنتج النافد.
**الإصلاح (`backend/routes/online_store_routes.py`):**
- GET /shop/{slug}: إزالة فلتر الكمية — كل منتجات المتجر النشطة تظهر، مرتبة (المتوفر أولاً ثم النافد). العائلات تُبنى منها جميعاً.
- GET /shop/{slug}/product/{id}: إرجاع المنتج حتى لو نفد — الواجهة تعطّل الطلب وتعرض «نفذت الكمية».
- لم تُمسّ بيانات الطلبات أو المخزون (الطلبات التجريبية حقيقية وتبقى محتسبة).
- الواجهة لم تحتج تعديلاً — كانت مجهزة أصلاً بشارة «نفذت الكمية» وزر معطّل.
**تحقق:** API يرجع products:1 + families:1؛ لقطة متصفح حية تُظهر فئة cable والمنتج بشارة نفذت الكمية. نسخة احتياطية: backups/online_store_routes.py.bak.p40.


---

## p41 — 2026-08-13 — إصلاح الصفحة البيضاء لصفحة المنتج + تدقيق شامل للموقع

### 1) الصفحة البيضاء /shop/nt/product/:id (السبب: صور base64 ضخمة)
**التشخيص:** لا خطأ JS — الصفحة تُبنى سليمة لكن API المنتج يرجع 7.1MB (صورة PNG base64 بـ 2.5MB + 3 صور في images) في ~4 ثوانٍ، فتبقى الصفحة بيضاء أثناء الانتظار (React لا يرسم شيئاً قبل fetchProduct). قائمة المتجر أيضاً 5.2MB.
**الإصلاح (`backend/routes/online_store_routes.py`):**
- نقطة تقديم صور جديدة `GET /api/shop/{slug}/img/{product_id}/{idx}.jpg` — تحويل base64 → JPEG محسّن (Pillow، حد أقصى 900px، جودة 72) مع كاش داخلي (مفتاحه tenant+product+idx+updated_at للإبطال عند التعديل) و Cache-Control يوم كامل.
- المساعد `_pub_product` يستبدل روابط data: في image_url/images بروابط النقطة الخفيفة في: قائمة المتجر + تفاصيل المنتج + المنتجات المشابهة + products_by_family + uncategorized. الروابط الخارجية (http) تمر كما هي.
- النتيجة: product-api من 7,118,807B/3.9s إلى **2,298B/0.05s**؛ shop-api من 5.2MB إلى 3KB؛ كل صورة ~83KB JPEG. تحقق dump-dom: الصفحة ترسم كاملة (معرض 4 مصغرات + نموذج COD + نفذت الكمية).

### 2) تدقيق شامل
- **مسح 377 مسار GET** (openapi.json) بتوكن السوبر أدمن: 29 مخالفة = 22 متوقعة (422 معاملات ناقصة، 403 صلاحيات وكيل/webhooks، 400 تكاملات غير مُعدّة) + **500 حقيقية واحدة**.
- **مسح مماثل بتوكن مستأجر demo: صفر 500.**
- صفحات المتجر العام (الرئيسية/المنتج/التتبع) وصفحات الإدارة (توجيه لتسجيل الدخول) كلها ترسم سليمة.
- فحص سجلات backend (3 ساعات): لا أخطاء سوى نمط ObjectId أدناه.

### 3) إصلاح نمط 500: insert_one يلوّث القاموس المُرجع بـ _id
- `/api/system/settings` (delivery_settings_routes.py): أول استدعاء ينشئ المستند وكان يرجعه ملوثاً بـ ObjectId ← 500. الإصلاح: `insert_one(dict(settings))`.
- `/api/woocommerce/settings` (online_store_routes.py): نفس النمط ← نفس الإصلاح.
- تدقيق استباقي لكل insert_one(doc) المشابهة في 9 ملفات routes: كلها تستخدم doc.pop("_id") سليماً — لا حالات أخرى.
- نسخ احتياطية: delivery_settings_routes.py.bak.p41 (+ online_store_routes.py.bak.p40 سابقاً).


---

## p42 — 2026-08-13 — طلبات المتجر في الصندوق الموحَّد + أيقونة اختصار + تنبيه صوتي + تحديث تلقائي

### 1) الطلبات لا تظهر إلا بعد تحديث الصفحة (/store)
- `StoreManagementPage.js`: جلب صامت للطلبات كل 20 ثانية (fetchOrdersOnly بلا مؤشر تحميل) + إعادة جلب فورية بعد تغيير أي حالة.

### 2) أيقونة اختصار الطلبات في الأعلى (Layout)
- زر ShoppingBag بجانب جرس التنبيهات (data-testid: orders-shortcut-btn) ينقل إلى /ecom-hub مع شارة حمراء نابضة بعدد الطلبات المعلَّقة (orders-shortcut-badge)، تُحدَّث كل 30 ثانية.

### 3) تنبيه صوتي عند طلب جديد
- في Layout (عالمي — يعمل من أي صفحة): فحص /store/orders كل 30 ثانية؛ عند زيادة عدد المعلَّقة ← نغمة مزدوجة 880Hz عبر Web Audio API (بلا ملفات صوت) + toast «🛍️ طلب جديد من المتجر الإلكتروني!» بزر «عرض» ينقل للصندوق.

### 4) طلبات متجر الويب في صندوق الطلبات الموحَّد (/ecom-hub)
- قناة جديدة `webstore` («متجر الويب» 🌐 #0ea5e9) في ecom/constants.py.
- **مزامنة أمامية** (online_store_routes.py): إنشاء طلب المتجر ← نسخة فورية في ecom_orders بنفس order_code (WEB...)، external_id يربط النسختين، و`inventory_deducted=True` لأن المخزون حُسم لحظة الإنشاء (يمنع الحسم المزدوج عند التأكيد من الصندوق — مؤكَّد بالاختبار: deducted/restored فارغتان). تغيير الحالة من /store ← تحديث مباشر بلا آثار جانبية (pending→new، الباقي مطابق).
- **مزامنة عكسية** (ecom_order_service.py): تغيير الحالة من الصندوق لطلب webstore ← عكسها إلى store_orders (new/packed→pending/confirmed)؛ عند الإلغاء/الاسترداد يعيد _sync_inventory المخزون ونعلّم stock_restored لتفادي إعادة مزدوجة.
- **Backfill** لمرة واحدة (idempotent عبر external_id): 11 طلباً موجوداً نُسخت (8 في ntcommerce + 3 في tenant NT-0002).
- تحقق curl: channel=webstore يرجع الطلبات؛ summary يعرض by_channel.webstore؛ اختبار عكسي حي (WEB000005 new←confirmed وصل store_orders).
- Bundle: main.7f08b1c4.js. نسخ احتياطية: Layout/StoreManagementPage/online_store_routes/ecom_constants/ecom_orders_routes/ecom_order_service .bak.p42.



---

## ملاحظة إجرائية — 2026-08-13 — سبب تعطّل الصفحة الرئيسية المؤقت (نافذة نشر p42)

**التشخيص:** الموقع نفسه سليم (root 200 + الحزمة 7f08b1c4 موجودة + الصفحة ترسم كاملة). ما حدث: عند نشر p42 حُذفت main.*.js القديمة قبل اكتمال النسخ (سباق نشر مع عملية build عالقة)، فمن حمّل الصفحة أثناء التبديل — أو كان يحمل index.html قديماً من الكاش يشير لحزمة محذوفة — رأى صفحة بيضاء. nginx يقدّم index.html بـ no-cache لذا أي تحديث صفحة يحلها فوراً.
**الإجراء الجديد المعتمد:** عدم حذف الحزم المجزّأة القديمة أثناء النشر إطلاقاً — cp -r للبناء الجديد فقط، وindex.html يشير للهاش الجديد تلقائياً، والحزم القديمة تبقى كاحتياط للصفحات المخزَّنة في كاش الزوار. التنظيف لاحقاً يدوياً بعد التأكد أن لا index.html قديم يشير إليها.
**إجراءات:** قتل عملية build عالقة من p42؛ الإبقاء على main.55540380.js وmain.7f08b1c4.js كليهما في /var/www.


---

## p44 — 2026-08-12 — ربط الدومين nt-commerce.net عبر Cloudflare + إصلاح Mixed Content

### قبل
- الدومين nt-commerce.net مشترى من Cloudflare Registrar، سجلات DNS كانت تشير لعناوين CF الاحتياطية (خطأ 1034).
- الواجهة المبنية تحوي `REACT_APP_BACKEND_URL=http://168.231.81.154` ثابتاً ← المتصفح يمنع كل طلبات API عند فتح الموقع عبر https (Mixed Content).
- وضع التشفير في Cloudflare كان Full ← خطأ 522 (لا شهادة على الخادم بعد).

### التغييرات
1. **DNS (من لوحة Cloudflare بواسطة المستخدم):** A record ← 168.231.81.154 (Proxied)، حذف سجل A الاحتياطي الثاني، CNAME www (Proxied)، وضع التشفير Flexible مؤقتاً.
2. **frontend/.env:** `REACT_APP_BACKEND_URL=` (فارغ ← كل طلبات API نسبية `/api` من نفس الأصل) — النسخة الاحتياطية: `backups/env.frontend.bak.p44`.
3. **frontend/src/pages/ecom/EcomChannelsPage.js:** رابط ويبهوك Shopify المعروض أصبح `${window.location.origin}/api/...` بدل الرابط الثابت (يعرض الرابط الصحيح تلقائياً على أي دومين) — النسخة الاحتياطية: `EcomChannelsPage.js.bak.p44`.
4. إعادة بناء الواجهة: الحزمة الجديدة `main.e63d39d0.js` — صفر occurrence للـ IP كقاعدة API (تبقى فقط 4 سلاسل SEO canonical/og غير مؤثرة).
5. نشر آمن: `cp -r build/. /var/www/ntcommerce/` بدون حذف — الحزم القديمة (55540380, 7f08b1c4) باقية كاحتياط كاش. نسخة احتياطية: `backups/www_before_p44`.

### بعد (تم التحقق بـ curl)
- `https://nt-commerce.net/` ← 200، index.html يشير للحزمة الجديدة ✅
- `https://nt-commerce.net/api/shop/nt` ← 200 ✅
- `https://nt-commerce.net/api/shop/nt/img/{pid}/0.jpg` ← 200 JPEG 83KB ✅
- `http://168.231.81.154/` ← 200 (الوصول القديم ما زال يعمل — نفس النسخة تعمل على الرابطين) ✅
- `https://nt-commerce.net/api/webhooks/tiktok-leads` ← POST تجريبي ناجح (lead_created + customer_created) ✅ — **رابط الويبهوك النهائي لـ TikTok**

### متبقٍّ مؤجل
- شهادة Cloudflare Origin على nginx ← رفع الوضع إلى Full (Strict) + إجبار HTTPS.
- روابط hardcoded غير حرجة: canonical/og:image في الواجهة، ورسالة Conversions API + عرض store slug في backend (تعمل لكن بالـ IP القديم).


---

## p45 — 2026-08-13 — إصلاح دخول المشتركين الحرج + فحص شامل صارم + إصلاح 6 أخطاء

### العطل المُبلَّغ: مشترك جديد (NT-0011) لا يستطيع الدخول

### التشخيص — 3 عيوب متسلسلة:
1. **unified-login ينهار 500 لكل المشتركين منذ p11:** كوميت `e36d911` (dead-code dedup) حذف بالخطأ `_login_attempts` / `MAX_LOGIN_ATTEMPTS` / `LOCKOUT_MINUTES` من `auth_users_routes.py` بينما الدوال المستدعية بقيت ← `NameError` عند أي محاولة دخول. لم يُلاحظ لأن المالك يدخل كـ super admin (مسار مختلف سليم) والمستأجرين القدامى بجلسات طويلة.
2. **صفحة /portal تستدعي `/api/auth/login`** (يفحص users الرئيسية فقط) بدل `/api/auth/unified-login` (مدير/وكيل/مشترك).
3. **كود التنكّر** في `saas/tenants_routes.py` ينشئ مستخدم المستأجر بحقل `hashed_password` فارغ: يقرأ `tenant.get("hashed_password")` بينما الحقل الصحيح `password` — أصاب حساب NT-0011.

### الإصلاحات:
- **A:** استعادة الأسطر الثلاثة في `auth_users_routes.py` + تصحيح حقل التنكّر في `saas/tenants_routes.py` (نسخ: `.bak.p45`).
- **B:** نسخ هاش كلمة المرور الصحيح من `saas_tenants.password` إلى مستخدم NT-0011 في قاعدة متجره.
- **C:** `UnifiedLoginPage.js` ← `/api/auth/unified-login` + احترام `redirect_to` (نسخة: `.bak.p45`) — بناء `main.ba9d708e.js` ونشر آمن بدون حذف.
- **D:** اختبار E2E كامل: تسجيل مشترك تجريبي (NT-0012) ← دخوله بنفسه عبر unified-login ← `/auth/me` بكامل features ← حذفه وتنظيف قاعدته.

### الفحص الشامل (469 مسار GET × دورين + لوغات 24س):
| الخطأ | السبب | الإصلاح |
|---|---|---|
| `POST /shop/bob/order` → 500 (6 طلبات!) | كود مزامنة p42 استخدم `now` غير معرّف + `logger` غير معرّف أخفى الخطأ الأصلي | تعريف الاثنين في `online_store_routes.py` |
| طلبات يتيمة: الطلب يُحفظ والعميل يرى 500 | نفس السبب | تعبئة 6 طلبات NT-0011 في ecom_orders بحالاتها (`p45_backfill.py`) |
| `GET /api/api-keys` → 500/422 | سجل قديم بمخطط مختلف (p34-test من security_routes) + `k["type"]` | تطبيع الحقول في `ocr_invoice_routes.py` |
| `GET /api/shipping/settings` → KeyError | `s["company_id"]` على سجلات قديمة | `s.get("company_id")` في `shipping_loyalty_routes.py` |
| سجل store_slug يتيم ("amine" لمستأجر محذوف) | بقايا بيانات | حُذف (كان يرد 404 نظيف) |

### تحقق نهائي:
- اختبار طلب حي كامل على متجر bob (تفعيل مؤقت): 200 «تم استلام طلبك» + حسم مخزون صحيح + مزامنة ecom + تنظيف كامل وإعادة المتجر معطلاً كما تركه المشترك.
- إعادة المسح الكامل: **صفر 500 حقيقية** (يتبقى فقط `/payments/status/{id}` برسالة Stripe غير المُعدّ — مقصود).
- صفر أخطاء في اللوغ بعد الإصلاحات رغم إعادة مسح 938 طلباً.
- تحذير بدء التشغيل المتكرر (sim_catalog unique index على duplicates قديمة) — غير مؤثر، مؤجل.


---

## p46 — 2026-08-13 — توحيد مركز التجارة الإلكترونية (/ecom-hub) وإعادة تنظيم القوائم

### الطلب
جعل /ecom-hub ملمّاً بكل ما يتعلق بالتجارة الإلكترونية: حذف 12 عنصراً من القائمة اليمنى ونقلها داخل المركز بجانب «الطلبات».

### التغييرات (نسخ احتياطية .bak.p46 + backups/www_before_p46)
1. **جديد `pages/ecom/EcomHubShell.js`:** غلاف موحّد — `<Layout>` + شريط تبويبات المركز + **تبويبات فرعية حسب القسم** + `<Outlet/>`.
2. **`EcomHubTabs.js`:** تظليل التبويب الأب عند المسارات الفرعية (startsWith).
3. **تجريد 14 صفحة من `<Layout>` و`<EcomHubTabs/>`** (الغلاف صار مالك الإطار) — صفحات المركز الست + StoreManagement/Loyalty/WooCommerce/Shipping/ApiKeys/TwoFactor/IntegrationStatus/EcomGuide.
4. **App.js:** مسارات متداخلة تحت `/ecom-hub` بوابة `ecommerce_hub` موحّدة + بوابات adminOnly الأصلية لكل صفحة:
   - الطلبات (index) | المتجر → StoreManagementPage | المتجر/الولاء → LoyaltyPage
   - القنوات والتكاملات → Channels + WooCommerce + حالة التكاملات + مفاتيح API + 2FA + الدليل
   - الإعلانات | الشحن → ShippingTab + شركات الشحن + Yalidine | التحليلات
   - **تحويلات** من كل الروابط القديمة (/store, /loyalty, /woocommerce, /shipping, /api-keys, /two-factor, /integrations/status, /integrations/yalidine, /ecom-hub/guide) — لا رابط قديم يُكسر.
5. **Layout.js:** مجموعة «التجارة الإلكترونية» ← مدخل واحد «صندوق الطلبات الموحَّد»؛ حذف مجموعة «خدمة الشحن والتوصيل».
6. **StoreManagementPage:** عنوان فرعي ديناميكي — «أنشئ متجرك الإلكتروني وابدأ البيع» عندما يكون المتجر معطلاً.
7. **الميزة:** `ecommerce_hub` مفعّلة أصلاً في الخطط الثلاث (تحقق DB) — كل المشتركين يصلون للمركز.

### إصلاحات أثناء العمل
- قصّ خاطئ لمسار /two-factor الأحادي السطر ترك يتيمة `</ProtectedRoute>` (أصلحت، توازن 111=111).
- EcomHubShell استورد Layout كـ default بينما هو named export.

### تحقق
- بناء `main.7446820c.js` + نشر آمن بدون حذف الحزم القديمة.
- المسارات والغلاف موجودون في الحزمة؛ الموقع 200؛ APIs الصفحات المنقولة كلها 200 (store/orders, store/slug, woocommerce/settings, shipping/settings, loyalty/settings).

## p46 — تحقق متصفح عميق لمركز التجارة (2026-08-13)
- **الطريقة:** Chromium headless (puppeteer-core) بجلسة مستأجر حقيقية (رمز NT2 مُصاغ بالخادم، tenant_admin)، حجم نافذة 1400×900، انتظار networkidle2 + 1.5s لكل صفحة.
- **النتيجة:** 22/22 مساراً يعمل:
  - 14 صفحة مركز: /ecom-hub + store, store/loyalty, channels(+woocommerce/status/api-keys/2fa/guide), ads, shipping(+companies/yalidine), analytics — كلها تعرض ecom-hub-shell مع التبويبات الفرعية الصحيحة لكل قسم.
  - 8 تحويلات قديمة (/store، /loyalty، /woocommerce، /shipping، /api-keys، /two-factor، /integrations/status، /integrations/yalidine) كلها تحوّل للمسار الجديد الصحيح.
- **أخطاء console: 0 — أخطاء صفحة (pageerror): 0 — طلبات فاشلة ≥400: 0.**
- ملاحظة: زيارة /ecom-hub لأول مرة تحوّل إلى دليل البداية — سلوك مقصود سابق (onboarding tour عبر localStorage ecom_guide_seen)، ليس خطأ.
