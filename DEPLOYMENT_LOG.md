
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

## p242 — إسناد مركز الاتصال (Call-Center Assignment)

**التاريخ:** 2026-08-21
**الدافع:** فجوة EcoManager: توزيع طلبات التأكيد والعملاء المحتملين على موظفي
النداء بدل العمل الجماعي الفوضوي على نفس القائمة.

### ما أُضيف
- `routes/ecom/assignment_routes.py`:
  - `GET /api/ecom/agents` — حسابات الموظفين القابلة للإسناد (أدمن).
  - `POST /api/ecom/assign` — إسناد جماعي (حتى 200) طلبات/عملاء لموظف؛ فقط الحالات المفتوحة
    (طلبات: new/awaiting_confirmation/needs_review/confirmed/packed — عملاء: new/contacted/qualified).
  - `POST /api/ecom/unassign` — سحب الإسناد.
  - `GET /api/ecom/my-queue` — قائمة عمل الموظف الحالي (طلبات + عملاء مفتوحة مسندة إليه).
  - `GET /api/ecom/assignments/summary` — عبء العمل لكل موظف (توزيع متوازن).
- الحقول: `assigned_to` / `assigned_to_name` / `assigned_at` / `assigned_by` — ميتاداتا فقط،
  لا تغيّر الحالة ولا ترسل إشعارات.
- فلتر `assigned_to=<id|none>` في `GET /api/ecom/orders` و `GET /api/ecom/leads`.
- فهارس `assigned_to` على ecom_orders و ecom_leads.
- الصلاحيات: الإسناد/السحب/الملخص للأدمن فقط (موظف agent يُختبر 403)، my-queue لأي مستخدم.

### الاختبار
- 15/15 E2E (TEST-P242): قائمة الوكلاء، إسناد طلبين وعميل، قائمة الموظف، الملخص (3)،
  الفلاتر (assigned_to/none)، 404 لموظف غير موجود، 403 لغير الأدمن، سحب الإسناد.
- تنظيف دقيق: حذف المستخدم التجريبي وكل الآثار الجانبية؛ الثوابت سليمة
  (journal=2، cash=11300.88، ecom_store=2650، لا إسنادات يتيمة).

## p241 — SMS تلقائي للزبون مع كل حالة توصيل + رصيد SMS (SuiviSMS parity)

**التاريخ:** 2026-08-21
**الدافع:** جوهر منتج SuiviSMS: إشعار الزبون برسالة SMS عند التأكيد/الشحن/التسليم
يخفض نسبة الرفض عند الاستلام (يدّعون رفع التسليم إلى ~75%).

### ما أُضيف
- `services/ecom/sms_gateway.py`: تجريد مزوّد قابل للتبديل —
  `mock` (افتراضي: تسجيل فقط، لا حساب مزوّد بعد) أو `http` (أي بوابة SMS بـ REST POST بسيط
  تُربَط بالإعدادات دون كود: url/token/phone_field/message_field/headers/extra).
- `services/ecom/status_sms_service.py`: قوالب عربية قابلة للتعديل لكل حالة
  (confirmed/packed/shipped/delivered/cancelled/returned) بمتغيرات
  {customer_name} {order_code} {total} {store_name} {tracking_number} {courier}.
  خصم ذري: رسالة = رصيد 1 من `main_db.wallets.sms_credits`؛ فشل المزوّد ⇒ استرجاع تلقائي؛
  عدم كفاية الرصيد ⇒ تسجيل `skipped_no_credit` دون إرسال؛ dedup لكل (طلب، حالة).
- ربط fail-open داخل انتقال حالة الطلب (نفس نمط إشعار واتساب — لا يعيق الانتقال أبداً).
- `routes/ecom/status_sms_routes.py`:
  - المستأجر: GET/PUT `/api/ecom/sms/settings`، GET `/api/ecom/sms/status` (الرصيد+السعر)،
    GET `/api/ecom/sms/logs`، POST `/api/ecom/sms/test`.
  - المنصة (سوبر أدمن): POST `/api/admin/sms/credits/grant` (مع قيد PF في wallet_transactions)،
    GET `/api/admin/sms/credits/{tenant_id}`، PUT `/api/admin/sms/price`
    (سعر الرصيد في platform_config، الافتراضي 8 دج).

### الاختبار
- 18/18 E2E (TEST-P241): إعدادات افتراضية معطلة، منع الإرسال بدون رصيد (402)، منح 3 أرصدة
  (PF00001/26)، SMS عند shipped فقط دون الحالات المعطلة، تقدير القالب بالمتغيرات، خصم الرصيد،
  skipped_no_credit عند نفاد الرصيد، إرجاع الإعدادات.
- 4/4 unit: استرجاع الرصيد عند فشل المزوّد، الخصم عند النجاح، dedup، تصفير الرصيد.
- تنظيف دقيق + استعادة المحفظة من لقطة: journal=2، الصناديق كما هي، wallet_transactions=0،
  credit_debt=0، marketplace/commissions فارغة.

## p240 — كشف الطلبات والعملاء المحتملين المكررين (Duplicate Detection)

**التاريخ:** 2026-08-21
**الدافع:** فجوة منافسين (SuiviSMS/EcoManager): الزبون يطلب نفس المنتج مرتين خلال ساعات
(من المتجر + واتساب مثلًا) فيُشحن الطلب مرتين ويُرجع أحدهما على حساب التاجر.

### ما أُضيف
- `backend/services/ecom/duplicate_detector.py`: كاشف غير مانع (non-blocking):
  - تطبيع الهاتف الجزائري عبر `normalize_phone` (00213/213/05x/06x/07x).
  - نافذة زمنية 48 ساعة (قابلة للضبط عبر `ECOM_DUP_WINDOW_HOURS`).
  - تجاهل الطلبات الملغاة/المرجعة والعملاء المفقودين/المحوَّلين (إعادة الطلب بعد الإلغاء مشروعة).
  - عند التطابق يُوسم المستند: `duplicate_warning: true` + `duplicate_of {kind, id, code, status, created_at}`.
- ربط الكاشف بكل مسارات الإنشاء: الطلبات اليدوية، طلبات المتجر الإلكتروني (وسم داخلي فقط —
  رد العميل العام لا يتغير)، طلبات السوق الموحد، webhook تيك توك، العملاء اليدويون وعملاء webhooks.
- عميل محتمل بنفس هاتف طلب مفتوح ⇒ يُوسم كمكرر عن طلب (طلب مزدوج عبر قناتين).
- endpoint جديد: `GET /api/ecom/duplicates?days=N` يعيد الطلبات والعملاء الموسومين.

### إصلاح bug قديم اكتُشف أثناء الاختبار
- فهرس `ecom_leads (channel, external_id)` الفريد كان يرفض ثاني عميل يدوي (`external_id=""`)
  بخطأ E11000 — أي عميل يدوي ثانٍ كان يعطي 500 دائمًا.
- الحل: تحويله إلى فهرس جزئي فريد `partialFilterExpression: {external_id: {"$gt": ""}}`
  في main.py + ترحيل فوري للفهارس في قواعد المستأجرين الأربعة (webhooks تبقى محمية من التكرار).

### الاختبار
- 12/12 E2E (وسم TEST-P240): طلب أول نظيف، تكرار بنفس الهاتف، تطبيع +213، عميل مكرر عن عميل،
  عميل مكرر عن طلب مفتوح، إلغاء الطلبات يزيل الوسم، endpoint الفهرسة يعرض الموسومين فقط.
- تنظيف دقيق + تحقق من الثوابت: journal_entries=2، الصناديق (cash=11300.88, ecom_store=2650)،
  المحفظة (credit_debt=0)، marketplace/commissions فارغة، سمعة الشبكة بدون بقايا.

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

## p47 — تنظيف تحذيرات الإقلاع (2026-08-13)
**النسخ الاحتياطية:** mongodump لـ platform_sim_catalog (14 وثيقة) في backups/p47_sim_catalog/ + backups/main.py.bak.p47

### A) تكرارات platform_sim_catalog
- **قبل:** 14 وثيقة مع 5 مجموعات مكررة (Ooredoo/retail ×3، Mobilis/retail ×3، Djezzy/retail ×2، Mobilis/wholesale ×2، Djezzy/wholesale ×2) → فشل بناء الفهرس الفريد sim_operator_tier_unique عند كل إقلاع (E11000).
- **الإصلاح:** الإبقاء على أول وثيقة لكل (operator, tier) وحذف 7 زائدة → 7 وثائق، ثم بناء الفهرس الفريد يدوياً.
- **بعد:** E11000 اختفى نهائياً؛ /api/admin/supplier/catalog/sims → 200 بالكتالوج الصحيح.

### B) create_all_enhanced_indexes() بلا وسيط
- **قبل:** main.py يستدعيها بدون الوسيط db المطلوب → TypeError يُبتلع كتحذير عند كل إقلاع؛ فهارس الوحدات المحسّنة لم تُنشأ قط منذ إدخالها.
- **الإصلاح (main.py):** حلقة على main_db + كل قواعد المستأجرين (نمط barcode المجاور) مع try/except لكل قاعدة وتسجيل "created on X/Y databases".
- **بعد:** إقلاعان متتاليان نظيفان: "Enhanced indexes created on 4/4 databases" + بذر SIM بدون أي تحذير. (ملاحظة: أول إقلاع بعد الترقيع أظهر "connection closed" عابر في بذر SIM بسبب عبء بناء الفهارس الأول؛ اختفى في الإقلاع الثاني ولم يتكرر.)
- صحّة الخدمة بعد الإقلاع: /api/health → 200.

## p48 — شهادة origin + تحويل www + إنهاء المهام المؤجلة (2026-08-13)
**النسخ الاحتياطية:** backups/nginx-ntcommerce.bak.p48 + bak2.p48 + nginx-www.bak.p48 + le-renewal.bak.p48

### A) شهادة Let's Encrypt على الخادم الأصلي (تؤهل لـ Full Strict)
- أُصدرت شهادة موثوقة عبر certbot --nginx للدومينين nt-commerce.net + www (تنتهي 2026-11-11).
- **بدون --no-redirect:** لم تُضف أي إعادة توجيه 80→443 (Flexible يتصل بالأصل عبر HTTP — إعادة التوجيه تسبب حلقة). المنفذان 80 و443 يقدّمان نفس المحتوى.
- فشلت تجربة التجديد الأولى (dry-run) لـ www: كتلة www الجديدة حوّلت طلب ACME → 403. **الإصلاح:** تحويل التجديد إلى webroot (/var/www/letsencrypt) في /etc/letsencrypt/renewal/nt-commerce.net.conf + `location ^~ /.well-known/acme-challenge/` في الكتلتين → dry-run نجح: "all simulated renewals succeeded". مؤقّت certbot.timer يومي نشط.
- إصلاح جانبي: الكتلة الرئيسية أصبحت `default_server` لـ 80/443 (كانت كتلة www تلتقط المضيفين غير المطابقين مثل 127.0.0.1).

### B) تحويل www → الدومين الرئيسي (301)
- كتلة جديدة /etc/nginx/conf.d/ntcommerce-www.conf: 301 https://nt-commerce.net$request_uri على 80+443 (مسار ACME مستثنى).

### C) مفتاح GitHub الكلاسيكي القديم (ghp_VBd0...)
- فُحص عبر API: **401 — ملغى/غير صالح بالفعل**. لا خطر. البادئة موجودة في سجلات نصية قديمة (غير ضارة لأنه ميت).

### D) حالة حساب NT-0011 (BorexDz)
- saas_tenants: initialized=true + تجزئة كلمة مرور موجودة؛ مستخدم admin في قاعدة المستأجر موجود.
- انتحال E2E: POST /api/saas/impersonate/{tenant_id} → رمز → /me → المستخدم + 18 ميزة (منها ecommerce_hub) → إغلاق الجلسة 200. الحساب جاهز لدخول المشترك.

### التحقق النهائي الشامل
CF apex 200 | CF www 301→apex | CF API 200 | origin 443 ssl_verify=0 | IP مباشر 200 | localhost 200

## p49 — استبدال IP بالدومين + تقييد الجدار على Cloudflare + تنظيف شامل (2026-08-13)
**النسخ الاحتياطية:** .bak.p49 لكل ملف معدّل + backups/main.py.bak2.p49 + backups/git-config.bak.p49 + backups/ufw.bak.p49

### A) IP → الدومين (SEO ومشاركة الروابط)
- 8 ملفات: public/index.html (canonical/og:url/og:image/twitter:image) + robots.txt + sitemap.xml (5 روابط) + UnifiedLoginPage/LandingPage/RegisterPage/useDocumentMeta (canonical الافتراضية) + online_store_routes.py (عرض slug المتجر + رسالة Conversions API).
- main.py: CORS وسّع بإضافة https://nt-commerce.net + www (الإبقاء على أصلي IP).
- بناء + نشر main.6b9ef438.js (cp -r بلا حذف) — تحقق عبر CF: canonical/og/sitemap كلها بالدومين، صفر مراجع IP، ويبهوك TikTok 200.

### B) تنظيف الحزم القديمة
- حذف 5 حزم main قديمة + 17 ملفاً يتيماً (maps/LICENSE/chunks) بعد التأكد من asset-manifest — حرّر 66.5MB (static من 171M إلى 20M). الموقع والحزمة 200.

### C) مفتاح GitHub خارج رابط remote
- انتقل إلى /root/.git-credentials (600) + credential.helper store — الرابط نظيف، git ls-remote ناجح.

### D) الجدار: 80/443 لعناوين Cloudflare فقط
- /usr/local/sbin/cf_ufw_sync.sh (idempotent): 44 قاعدة allow لنطاقات CF الرسمية v4+v6، حذف القواعد العامة 80/443 + القواعد الرمادية 8000/3000 (حقبة التطوير).
- cron أسبوعي (الاثنين 04:17) لتحديث النطاقات.
- **تحقق: عبر CF apex 200 / www 301 / API 200 / webhook 200 — IP مباشر 80 و443 محجوبان (000) — localhost 200 — SSH سليم.**
- ملاحظة: الوصول عبر http://168.231.81.154 توقف بالتصميم — الدومين هو المدخل الوحيد.

### E) إصلاحان خفيان ظهرا بعد تفعيل فهارس p47
1. **tracking_number_1 IndexKeySpecsConflict**: main.py:633 يطلب unique+sparse وenhanced_shipping_indexes.py يطلب عادياً — كل واحد يتعارض مع الآخر كل إقلاع. الحل: توحيد المواصفة unique+sparse في الملفين (القواعد الأربع أُعيد بناء فهارسها يدوياً — المجموعة فارغة، صفر مخاطرة).
2. **FeatureFlagManager.ensure_defaults غير موجود**: استدعاء قديم في main.py يرمي AttributeError يبتلعه try ← **set_feature_flag_manager لم يُنفَّذ قط منذ كتابته** (المدير لم يُسجَّل). حُذف السطر — /api/platform/features يعمل 200.
- إقلاع نهائي نظيف 100% (صفر تحذيرات عدا FutureWarning تجميلي في ai_routes).

## p50 — إغلاق سلسلة الأمان: Full (Strict) + Always Use HTTPS (2026-08-13)
- المالك فعّل من لوحة Cloudflare: SSL/TLS ← **Full (Strict)** ثم Edge Certificates ← **Always Use HTTPS**.
- تحقق كامل: http apex → 301 https ✔ | http www → 301 https apex ✔ | https apex 200 ✔ | API حي ✔ | www 301 ✔ | webhook 200 ✔.
- البنية النهائية: زائر ← إجبار HTTPS عند الحافة → Cloudflare ← Full Strict (شهادة LE مُتحقق منها) → الأصل :443 ← التطبيق. الجدار يقبل 80/443 من عناوين Cloudflare فقط. شهادة LE تتجدد تلقائياً (webroot عبر CF — مُثبت بـ dry-run).
- **لا مهام أمنية مؤجلة متبقية.**

## p51 — جولة تصفح شاملة عبر الدومين + إصلاح صور عائلات demo (2026-08-13)
- تصفح 11 صفحة عبر https://nt-commerce.net بثلاث جلسات (زائر/مشترك NT2/سوبر أدمن): الرئيسية، /portal، /register، /shop/demo-shop، /shop/nt، /tenant/dashboard، /ecom-hub (4 أقسام)، /pos، /saas-admin — كلها 200 بلا أخطاء console/صفحة.
- **اكتشاف وإصلاح:** بطاقات عائلات متجر demo (إلكترونيات/هواتف ذكية/إكسسوارات/حواسيب) كانت تشير كلها لنفس صورة Unsplash ميتة (404) في حقل image_url ← مسح الحقل في 4 وثائق (product_families) ← الواجهة تعرض الأيقونة البديلة. إعادة تصفح: صفر طلبات فاشلة.

## p52 — إصلاح حلقة "يدخل ثم يخرج" في /saas-admin (2026-08-14)
**التشخيص (من سجل nginx):** دخول ناجح (unified-login 200) ← /me 200 لكن كل /api/saas/* ← **401** ← طرد إلى /portal. السبب الجذري: `apiClient.js` كان يستخدم `super_admin_token` لمسارات /saas/* بمجرد **وجوده** في localStorage — بقايا جلسة انتحال قديمة (المتصفح أُغلق أثناء الانتحال) تختطف الطلبات برمز منتهٍ (24h TTL) بينما /me يعمل بالرمز الطازج.
**الإصلاح (3 نقاط):**
1. apiClient.js: super_admin_token يُستخدم فقط عند is_impersonating==="1".
2. UnifiedLoginPage.js: أي دخول جديد يمسح كل بقايا الانتحال (4 مفاتيح).
3. AuthContext.js: التنظيف الافتتاحي صار يكشف حالة الانتحال المكتملة-لكن-المنتهية (فك ترميز exp) ويمسحها — التعافي الذاتي دون تدخل.
**التحقق (متصفح حقيقي ×3):** حالة المتصفح المعطلة (رمز منتهٍ+علم) ← تعافى وبقي في /saas-admin بصفر 401 ✔ · انتحال نشط برمز صالح يعمل كما صُمم ✔ · دخول فعلي من النموذج مع بقايا قديمة ← مُسحت ودخل /tenant/dashboard ✔. بناء main.46096d3a.js. حذف مستأجر الاختبار (cascade 200).

## p53 — حزمة صفحة الدخول (2026-08-14)

### الهدف
1. نسيت كلمة المرور (استعادة برمز 6 أرقام)
2. فرض 2FA عند تسجيل الدخول
3. رسائل قفل واضحة + عدّاد محاولات متبقية

### قبل
- unified-login يصدر التوكن فوراً دون التحقق من two_fa_enabled (2FA موجود للإعداد فقط، لا يُفرض عند الدخول)
- لا توجد أي آلية لاستعادة كلمة المرور
- القفل 429 يظهر كـ toast فقط، ورسالة 401 بلا عدّاد
- حالة القفل `_login_attempts` في الذاكرة لكل worker — مع 4 uvicorn workers العدّاد غير متسق والقفل يحتاج حتى 20 محاولة

### بعد
**Backend (routes/auth_users_routes.py + services/email_service.py):**
- `_2fa_gate()`: بعد نجاح كلمة المرور في الفروع الأربعة (مدير/وكيل/موظف/مشترك)، إن كان 2FA مفعّلاً يُخزَّن payload النهائي في main_db.pending_2fa_logins (TTL 5 دقائق، استعمال واحد) ويُعاد `{requires_2fa, pending_token}`
- POST /api/auth/2fa/login-verify: تحقق TOTP (valid_window=1)، 5 محاولات كحد أقصى، يُصدر نفس payload الدخول
- POST /api/auth/forgot-password: رمز 6 أرقام (15 دقيقة)، يبحث في users/saas_tenants/saas_agents/tenant_user_directory، ردّ عام دائماً (لا كشف للحسابات)، يحاول الإرسال عبر email_service (mock حالياً)
- POST /api/auth/reset-password: تحقق الرمز (5 محاولات)، يحدّث كلمة المرور في المخزن الصحيح (bcrypt)، يمسح القفل
- GET /api/auth/password-reset-requests (admin): قائمة الطلبات — الرمز يظهر فقط للطلبات الفعّالة غير المستعملة (لوضع mock)
- 401 يتضمن المحاولات المتبقية؛ 429 فوري عند بلوغ الحد
- **p53b**: حالة القفل انتقلت إلى Redis (bf_cnt:/bf_lock:) مشتركة بين العمّال الأربعة مع سقوط للذاكرة
- email_service: إضافة get_active_provider() العامة

**Frontend:**
- UnifiedLoginPage.js: 4 عروض (دخول/2FA/نسيت/إعادة تعيين) بنفس التصميم، صندوق خطأ مضمّن أحمر للقفل وبيانات خاطئة، رابط "نسيت كلمة المرور؟"
- admin/components/PasswordResetRequestsCard.js: بطاقة في /saas-admin/alerts تعرض الطلبات المعلّقة مع الرمز وزر نسخ (تختفي عند عدم وجود طلبات)
- bundle: main.40e48539.js

### اختبارات
- curl: 401 بعدّاد (4→3→2→1→429) متسق عبر العمّال بعد p53b؛ forgot عام للمعروف/المجهول؛ reset E2E برمز حقيقي + دخول ناجح + استعادة كلمة المرور الأصلية
- 2FA E2E (curl + متصفح): requires_2fa بلا توكن → رمز خاطئ 401 بعدّاد → رمز صحيح يصدر access_token → إعادة الاستعمال مرفوضة
- متصفح: رابط نسيت + عروض forgot/reset + تحقق عدم التطابق + بطاقة الأدمن تعرض الرمز — كلها PASS بلا أخطاء JS
- demo@ntcommerce.com أُعيد لحالته الأصلية بعد كل اختبار

### نسخ احتياطية
routes/auth_users_routes.py.bak.p53/.bak.p53b, services/email_service.py.bak.p53, frontend/src/pages/UnifiedLoginPage.js.bak.p53, frontend/src/pages/admin/SaasAdminPage.js.bak.p53

## AutoHeal SCAN-2026-08-14 — إصلاح انهيار MongoDB المزمن (2026-08-14)

### المكتشف
- mongodb انهار 16 مرة تاريخياً (RestartCount=16) — آخرها 17:22:46: WT_PANIC "Too many open files"
- السبب الجذري: soft nofile=1024 في الحاوية (لا ulimits في docker-compose.yml)

### الإصلاح (تلقائي — درجة 3: Service Restart/Config)
- docker-compose.yml: إضافة ulimits.nofile soft/hard=65536 لخدمة mongodb
- إعادة إنشاء الحاوية (الحجم mongodb_data محفوظ) → الحدود الجديدة 65536/65536 مؤكدة
- backend أعاد الاتصال تلقائياً (health 200)، صفر panics بعد الإصلاح
- نسخة احتياطية: /opt/ntcommerce/backups/docker-compose.yml.bak.autoheal

## AutoHeal ERR-004 — إلغاء نشر منافذ قواعد البيانات (2026-08-14)

### قبل
- mongodb (27017) و redis (6379) منشوران على 0.0.0.0 عبر docker-proxy — محميان بـ UFW لكنه انكشاف زائد

### بعد
- حُذفت كتلة ports من خدمتي mongodb و redis في docker-compose.yml وأُعيد إنشاء الحاويتين
- المنفذان داخل شبكة ntcommerce الداخلية فقط (backend يصل عبر أسماء الخدمات — لا تأثير)
- تحقق: 0 مستمع خارجي، health 200، جولة DB+Redis عبر API تعمل (عدّاد القفل 4→3)
- نسخة احتياطية: /opt/ntcommerce/backups/docker-compose.yml.bak.portharden

## p54 — نظام AutoHeal Engine الدائم (2026-08-14)

### الهدف
تحويل وثيقة AutoHeal من مسح يدوي لمرة واحدة إلى نظام مراقبة وإصلاح ذاتي دائم داخل المنصة

### Backend
- **services/autoheal_service.py** (جديد): محرك المسح AutoHealEngine
  - 11 فحصاً: MongoDB ping، Redis ping، القرص، الذاكرة، حمل CPU، وصول الموقع عبر HTTPS، أخطاء نظام حرجة نشطة، حداثة النسخ اليومي (/backups/daily > 36س)، اشتراكات منتهية نشطة، وضع البريد mock، موجة قفل brute-force
  - Smart retry (درجة 1) للفحوصات العابرة؛ تنظيف آمن تلقائي (درجة 2): مذكرات 2FA/استعادة منتهية
  - إصلاحات بموافقة (درجات 4-6): deactivate_expired_tenants / resolve_critical_system_errors / clear_bruteforce_locks
  - dedupe بالتوقيع (signature) + عدّاد تكرار؛ المُتجاهَل Low/Medium لا يعود (لا سبام)، Critical/High يعاود الظهور
  - Known Issues: الحرجة/العالية تُرقّى تلقائياً مع قاعدة منع
  - نقاط الصحة: 100 − 25×حرج − 10×عالي − 5×متوسط − 2×منخفض
  - النتائج الحرجة الجديدة تُدرج في system_errors فتظهر في /saas-admin/alerts الموجودة
  - مجدول كل 300 ثانية مع **Redis leader lock** (4 عمّال uvicorn — واحد فقط يمسح)
- **routes/saas/autoheal_routes.py** (جديد، 7 نقاط): health / scans / findings / scan (يدوي) / findings/{id}/approve / dismiss / known-issues — مسجّلة عبر _AUTO_REG_MODULES
- **main.py**: تسجيل المسار + تشغيل المجدول في startup_event

### Frontend
- **pages/admin/saas/AutoHealPage.js** (جديد): نقاط الصحة + عدّادات الخطورة + جدول النتائج بأزرار موافقة/تجاهل + سجل المسحات + المشاكل المعروفة + زر "تشغيل مسح الآن"
- App.js: route /saas-admin/autoheal (superAdminOnly)
- Layout.js: عنصر قائمة يمنى "الإصلاح الذاتي" (أيقونة Activity) بعد سجل الأخطاء
- bundle: main.d22f072d.js

### اختبارات
- curl: تسجيل المسارات ✓، مسح يدوي reactive ✓، health ✓ (score 98)، findings/scans/known-issues ✓، 403 بدون توكن ✓
- دورة الموافقة E2E: مستأجر تجريبي منتهي → فُحص Medium awaiting_approval → approve → عُطّل مع أثر تدقيق → حُذف التجريبي ✓
- leader lock مؤكد بالسجلات: pid واحد acquired، الباقي skipped ✓
- إصلاحا أثناء التطوير: ObjectId في استجابة /scan + إصرار التجاهل
- متصفح: الصفحة تعرض النقاط والجداول وزر المسح + عنصر القائمة — PASS بلا أخطاء JS

### نسخ احتياطية
main.py.bak.p54, modules/saas.py.bak.p54 (أُعيدت — آلية ميتة), App.js.bak.p54, Layout.js.bak.p54

## p55 — ربط نظام اللوغات بـ AutoHeal Engine (2026-08-14)

### القنوات المضافة
1. **جسر فوري (Channel 1)**: core/error_handler.py — كل استثناء غير معالَج يستدعي emit_exception_finding ← finding لحظي (scan_id="realtime") بتوقيع (نوع الاستثناء+المكوّن+المسار المطبّع). Critical للمكونات الحساسة (auth/payments/sales/finance/wallet/customers) مع إدراج تلقائي في system_errors (يظهر في /saas-admin/alerts)، High للباقي
2. **قارئ أنماط errors.log (Channel 2)**: _check_error_log_patterns — قراءة تزايدية بـ offset محفوظ في autoheal_state (أول تشغيل يتخطى التاريخ)، تحليل تنسيق "ts | LEVEL | nt.comp | msg"، تطبيع الرسائل (أرقام/UUIDs→#)، ≥5 تكرار=Medium، ≥20=High، يتعامل مع rotation
3. **أخطاء الواجهات (Channel 3)**: _check_client_logs — system_logs (level=error آخر 10 دقائق) مجمّعة حسب المصدر، ≥5=Medium
4. **مقاييس registry**: _check_component_metrics — error_rate ≥20٪=High / ≥5٪=Medium (من 20 طلباً)، avg>3000ms=Medium (من 10 طلبات)

### اختبارات
- القناة 2: 6 أسطر ERROR اصطناعية (nt.pos) ← finding "نمط أخطاء متكرر في pos (6×)" ✓
- القناة 3: 5 سجلات frontend ← finding "5 أخطاء واجهة (frontend)" ✓
- القناة 1: emit مباشر بنفس مسار الخطاف ← Critical فوري في auth + ظهر في system_errors ✓
- محاولة 500 حقيقي عبر API: pydantic تصدّى (422) — حماية موجودة
- تنظيف كل البيانات الاصطناعية؛ النقاط عادت 98

### نسخ احتياطية
services/autoheal_service.py.bak.p55, core/error_handler.py.bak.p55


---

## p56 — حزمة تحسينات UX + صيانة (2026-08-14)

### قبل
- صفحة الدخول: عربية فقط، بدون تحذير Caps Lock، سنة التذييل ثابتة 2024، بدون رابط عودة للرئيسية.
- لا يوجد تنبيه للمستأجر عند قرب انتهاء الاشتراك/الفترة التجريبية.
- `/api/auth/me` لا يعيد `is_trial`/`subscription_ends_at` → الحقول تضيع بعد تحديث الصفحة.
- لا يوجد تنظيف دوري للحاويات/الصور الميتة في docker.

### التغييرات
1. **backend/routes/auth_users_routes.py** (.bak موجود مسبقاً p56): حمولة دخول المستأجر تتضمن `is_trial` (تم في وقت سابق من p56).
2. **backend/routes/simple_auth_routes.py** (.bak.p56): `/auth/me` يعيد الآن `is_trial` + `subscription_ends_at` للمستأجرين (تثري من saas_tenants).
3. **frontend/src/components/Layout.js** (.bak.p56): بانر انتهاء الاشتراك داخل `<main>` بعد بانر الانتحال — كهرماني عند ≤7 أيام، أحمر عند انتهاء فعلي، نص ثنائي اللغة يميّز التجريبي عن المدفوع، `data-testid="subscription-banner"`.
4. **frontend/src/pages/UnifiedLoginPage.js** (.bak.p56): إعادة كتابة كاملة —
   - مبدّل لغة AR/FR (Globe) أعلى الصفحة عبر useLanguage، كل النصوص ثنائية اللغة (قاموس STR).
   - تحذير Caps Lock على حقول كلمة المرور الثلاثة (`getModifierState('CapsLock')`, `data-testid="capslock-warning"`).
   - تذييل بسنة ديناميكية `© {new Date().getFullYear()}` + رابط «العودة للرئيسية» (`data-testid="back-home-link"`).
5. **crontab root** (/tmp/cron.bak.p56): تنظيف أسبوعي الأحد 04:30 — `docker container prune -f && docker image prune -f` → /var/log/docker_prune.log.

### التحقق
- curl: `/api/auth/me` يعيد `subscription_ends_at` + `is_trial` (200). الصحة 200.
- متصفح (puppeteer, data-testid): مبدّل اللغة يبدّل AR↔FR فعلياً؛ التذييل © 2026؛ رابط الرئيسية موجود؛ تحذير Caps Lock يظهر/يختفي; البانر: ‎+3 أيام → كهرماني «تبقّى 3 أيام على نهاية الفترة التجريبية»؛ منتهٍ → أحمر «انتهت الفترة التجريبية…»؛ ‎+30 يوم → لا بانر. (تم تغيير تاريخ انتهاء المستأجر التجريبي مؤقتاً ثم أعيد إلى 2026-08-26، وكلمة المرور أعيدت لأصلها).
- الحزمة الجديدة: main.4bea96ac.js منشورة في /var/www/ntcommerce.

### بعد
- الموقع 200، API 200، الحاويات سليمة.


---

## p57 — تنظيف شامل: حذف الميت والمؤقت والتجريبي (2026-08-14)

### قبل
- مستأجر تجريبي demo@ntcommerce.com (is_demo=true) + قاعدته (4.3MB) + 354 وثيقة مرتبطة في القاعدة الرئيسية.
- حزمة `backend/modules/` (124KB) طبقة "motherboard" ميتة — لا يستدعيها main.py (تسببت سابقاً في لبس p54).
- 16 ملف .bak.pXX ملاصقاً لملفات المصدر + سكربتات خطرة على الإنتاج (reset_db.py، reset_system.py).
- /tmp على الخادم: 110MB / 303 ملفات (tsv، رموز، سكربتات استيراد قديمة).
- 4 حزم JS قديمة في /var/www (~17MB) لا يشير إليها index.html + ملفات js/css يتيمة.
- صور docker ميتة: ntcommerce-frontend، nginx:alpine، وسم mongo:7 المكرر.
- مجموعة platform_restore_tests (11 وثيقة اختبار)، مفتاح redis يتيم "x"، 25 مجلد __pycache__.

### الحذف (بعد backup في /opt/ntcommerce/backups/p57_cleanup/)
1. **demo@ntcommerce.com** (بموافقة المستخدم الصريحة): mongodump كامل + وثيقة المستأجر → backup، ثم حذف وثيقة saas_tenants + إسقاط tenant_c24e3b19... + حذف المراجع في impersonation_logs(2)، auto_reports(16)، push_notifications(322)، platform_db_tree(1)، collection_reports(1).
2. **modules/** + reset_db.py + reset_system.py → أرشيف tgz في backup ثم حذف من الشجرة (التاريخ محفوظ في git).
3. **ملفات .bak الملاصقة** → نُقلت (لم تُحذف) إلى backups/p57_cleanup/inline_baks/.
4. **/tmp** مسح كامل (110MB → 0).
5. **الحزم القديمة**: أبقيت فقط ملفات js/css الموجودة في البناء الحالي (main.4bea96ac.js) — الحذف بعد النشر وليس أثناءه.
6. **الصور الميتة**: ntcommerce-frontend + nginx:alpine + mongo:7 حُذفت؛ أُبقيت قواعد البناء (python:3.11-slim، node:20-alpine) والصور الحية.
7. **بيانات**: platform_restore_tests أُسقطت، مفتاح redis "x" حُذف، __pycache__ نظّفت.

### أبقيت (حيّة)
- template_tenant + store_template (تستخدمهما خدمة التزويد services/tenant_template.py).
- قاعدتا المستأجرَين الحقيقيَّين + القاعدة الرئيسية.
- /opt/ntcommerce/backups/ كاملة (قاعدة: لا حذف للنسخ الاحتياطية).

### التحقق
- backend أعيد تشغيله بعد حذف modules/ → openapi 769 مساراً (autoheal 7، auth 17) — لا شيء تأثر.
- متصفح: /portal يعمل بدون أي خطأ تحميل (pageerror/reqfail: none).
- AutoHeal بعد التنظيف: **98/100** (Low وحيد = البريد بالمحاكاة بانتظار مفتاح Brevo).
- القرص: 13% مستخدم (85G متاحة).

### بعد
- الموقع 200، API 200، القاعدة تحوي فقط بيانات حية.


---

## p58 — تدقيق محاسبي شامل + إصلاح مرآة ديون الزبائن (2026-08-14)

### التدقيق (قراءة فقط، القاعدتان الحيتان)
فُحص الترابط الكامل: مشتريات↔موردون↔منتجات، مبيعات↔زبائن، مدفوع+متبقّي=إجمالي، حالة الفاتورة↔المتبقّي، مراجع يتيمة (منتج/زبون/مورد)، باركودات مكررة، مخزون سالب، إعادة بناء المخزون من الحركات، طلبات ecom/store (إجماليات+مراجع+ملغاة)، محافظ/صناديق/حركات.

### المشاكل المكتشفة
1. **دين يتيم (NT-0011)**: فاتورة INV-20260812-0001 للزبون bob — إجمالي 3600، مدفوع 100، متبقٍّ 3500، حالة partial — لكن سجل الزبون balance=0 وtotal_debt=0.
   - **الجذر** (`services/application/sales_service.py:81`): `debt_amount = remaining if payment_type in [credit, partial, installment] else 0` — الفاتورة أُرسلت payment_type="cash" مع دفع جزئي، فسُجّل المتبقّي على الفاتورة دون مرآة الدين على الزبون.
2. **مخزون بدا ناقصاً 3 وحدات** (NT-0011، cable samsuge) — تبيّن بعد التتبع أنه **سليم**: الطلبات بحالة "new" تحجز المخزون فوراً (20 − 3 بيع − 6 محجوز/مُسلَّم = 11 = الفعلي). الطلبات الملغاة تُسترجع صحيحاً ✓
3. **ملاحظة ثانوية**: تسجيل دفعة إضافية على فاتورة (`sales_routes.py update_sale`) كان ينقّص `balance` فقط دون `total_debt` — انجراف محتمل بين الحقلين.
4. **ملاحظة معلوماتية**: طلب ecom واحد (NT-0011، awaiting_confirmation) بلا product_id — صنف حر غير مربوط بالكتالوج؛ لا أثر محاسبي لكنه غير قابل لتتبع المخزون.

### الإصلاحات (backup في /opt/ntcommerce/backups/p58_debt_fix/ قبل التعديل)
1. `sales_service.py` (.bak.p58): debt_amount = remaining متى وُجد customer_id وكان remaining>0 — بغض النظر عن تسمية payment_type.
2. `sales_routes.py`: تسجيل الدفعة ينقّص balance **و** total_debt معاً.
3. بيانات bob: balance=0→3500، total_debt=0→3500 (total_purchases=3600 كان صحيحاً أصلاً).

### التحقق
- إعادة التدقيق الكامل على القاعدتين: **صفر مشاكل** — كل المعادلات متوازنة (فواتير/أرصدة/مخزون/مراجع).
- API 200 بعد إعادة التشغيل.

### بعد
- أي بيع ناقص الدفع مع زبون سيُسجَّل دينه فوراً مهما كانت تسمية طريقة الدفع.


---

## p59 — دورة المحاسبة الكاملة للتجارة الإلكترونية (2026-08-14)

### قبل
- طلبات مركز التجارة (ecom hub) كانت تُخصم من المخزون عند "التأكيد" فقط (طلبات متجر الويب تُخصم عند الدخول — ازدواج في السلوك).
- لا توجد أي قيود محاسبية للطلبات: لا فائدة، لا تكلفة، لا خسائر إرجاع، ولا سعر إرجاع لشركات الشحن.

### المواصفة المطلوبة (من المستخدم) والتنفيذ
1. **دخول الطلب → انتظار + نقص المخزون فوراً**: `create_order` يستدعي الآن `deduct_order_inventory()` (مُستخرجة كدالة عامة idempotent) — التأكيد صار no-op للمخزون، والإلغاء من "new" يسترجع صحيحاً.
2. **التأكيد → قيد محاسبي + فائدة بعد خصم الشحن**: مجموعة جديدة `ecom_order_financials` — عند confirmed يُنشأ/يُحدَّث قيد: revenue − COGS (من purchase_price للمنتجات المربوطة) − shipping_fee = expected_profit.
3. **التسليم → تحقّق**: delivered يحوّل القيد إلى realized (realized_profit = expected_profit).
4. **الإرجاع (refunded) → استرجاع المخزون (موجود) + عكس الفائدة + الخسائر**: losses = shipping_fee (ذهاب) + return_fee (إياب من إعداد شركة الشحن)، realized_profit = −losses، ويُخزَّن return_fee/return_losses على الطلب نفسه. الإلغاء قبل الشحن يبطل القيد بلا خسارة.
5. **سعر إرجاع لكل شركة شحن**: حقل `return_fee` في تكاملات القنوات (create + update) — يالدين/ZR/Maystro لكلٍّ سعره.
6. **حذف الطلب** يحذف قيده المالي (لا يتيمات في الدفتر).

### API الجديد
- GET `/api/ecom/orders/{id}/financials` — تفصيل القيد لكل طلب
- GET `/api/ecom/financials/summary` — مجمّع: متوقّع/محقّق/خسائر/رسوم إرجاع/صافي

### الواجهة
- EcomChannelsPage: حقل «سعر الإرجاع (دج)» يظهر فقط لقنوات الشحن (kind==='shipping')
- EcomOrderDetailDialog: بطاقة «القيد المحاسبي» — إيراد/تكلفة/شحن/فائدة متوقعة أو محققة، وعند الإرجاع: سعر الإرجاع + الخسارة الإجمالية بالأحمر

### التحقق (E2E حقيقي على API + متصفح)
- دورة كاملة: إنشاء (10→8) → تأكيد (قيد: 2500−600−500=**1400**) → بطاقة يالدين (shipped + courier) → إرجاع (8→**10**، خسائر **900** = 500+400، ربح −900، return_fee على الطلب) ✓
- دورة ثانية حتى delivered: realized_profit=**700** ✓ · المجمّع: net=realized−losses ✓
- المتصفح: حقل سعر الإرجاع يظهر ليالدين ويختفي لـ Shopify ✓
- كل بيانات الاختبار نُظّفت (طلبات/منتج/تكامل/قيود)
- الحزمة: main.96766be7.js منشورة

### بعد
- كل طلب إلكتروني له أثر محاسبي دقيق: فائدة محققة عند التسليم، خسارة موثقة (شحن ذهاب + إرجاع) عند الاسترجاع — معطيات الربحية صحيحة ودقيقة.


---

## p60 — 2026-08-15 — توحيد مساري بذر المستأجرين + إغلاق آخر المهام المؤجلة القابلة للتنفيذ

### قبل
- مسارا بذر منفصلان غير متزامنين (مؤجل منذ السطر 540): `init_tenant_database` (3 بذور: خزائن/مستودع/إعدادات) مقابل `init_default_data` (6 بذور: عائلات + زبون/مورد/منتج افتراضي) — كل مستأجر يولد مختلفاً حسب المسار.
- مسار أول دخول موحّد (auth_users_routes) لا يجرّب القالب الذهبي إطلاقاً، بعكس مساري التسجيل وإنشاء المستأجر.
- تحذير بدء التشغيل `sim catalog index create failed ... E11000 duplicate key {operator:"Djezzy",tier:"retail"}` (مؤجل منذ السطر 877).
- روابط IP قديمة hardcoded غير حرجة (مؤجل منذ p44): canonical/og:image في الواجهة + رسالة Conversions API + عرض store slug في backend.

### التغيير
1. **نسخ احتياطي أولاً**: `/opt/ntcommerce/backups/p60_seed_unify/` (database.py + main.py + auth_users_routes.py).
2. **`config/database.py`**: دالة مشتركة جديدة `seed_default_entities(tenant_db)` (المصدر الوحيد للحقيقة للكيانات الستة الافتراضية، idempotent بفحوص find_one) + تُستدعى في نهاية `init_tenant_database` — مسار البذر الاحتياطي (legacy fallback) ينتج الآن نفس المجموعة الكاملة (9 بذور).
3. **`main.py`**: `init_default_data` أصبحت تفويضاً للدالة المشتركة — استحال انحراف المسارين مجدداً.
4. **`routes/auth_users_routes.py`**: أول دخول موحّد يجرّب `copy_template_to_tenant` أولاً (مثل مساري التسجيل/saas) مع fallback للبذر القديم عند الفشل.
5. **sim_catalog**: تحقق — لا تكرارات حالياً (7 وثائق، dupe scan فارغ)، الفهرس الفريد `sim_operator_tier_unique` موجود، ولا تحذير في إقلاع هذا اليوم. التكرارات أُزيلت ضمن تنظيف p57. **أُغلق دون تدخل.**
6. **روابط IP القديمة**: تحقق شامل — صفر occurrence لـ `168.231` في frontend/src و frontend/public، ولا شيء في backend سوى CORS allow_origins في main.py (مقصود: إبقاء الوصول المباشر القديم يعمل). رسالة Conversions API تبني روابط Facebook/TikTok فقط. **أُغلق دون تدخل.**

### بعد (تم التحقق)
- إعادة تشغيل backend: startup نظيف، openapi.json ← 200 ✅
- اختبار المسار الموحّد على مستأجر scratch `p60test-seed-unify`: التشغيل الأول ← 9/9 بذور (4 خزائن + مستودع + إعدادات + 3 عائلات + زبون + مورد + منتج) ✅؛ التشغيل الثاني idempotent (نفس الأعداد) ✅؛ قاعدة scratch حُذفت ✅
- `POST /api/auth/unified-login` بكلمة خاطئة ← 401 (المسار حي) ✅
- `https://nt-commerce.net/` ← 200 و `/api/shop/nt` ← 200 عبر Cloudflare ✅
- المستأجران الحيّان لم يُمسّا (يفتقدان default-product لأن المستخدمين حذفاه — لا فرض للبذور على قواعد قائمة)

### المتبقي (جهة المستخدم فقط — لا يمكن تنفيذها من الخادم)
- مفتاح Brevo API في /saas-admin/email-settings (وضع البريد mock).
- تفعيل 2FA لحساب superadmin@ntcommerce.com.
- شهادة Cloudflare Origin → Full (Strict) (لوحة Cloudflare).
- تدوير GitHub PAT (حساب GitHub).
- NT-0011 يؤكد دخوله (اشتراكه ينتهي 2026-08-26).


---

## p60b — 2026-08-15 — إظهار AutoHeal في لوحة المراقبة (كان مخفياً عن المستخدم)

### قبل
- صفحة AutoHeal موجودة ومنشورة (`/saas-admin/autoheal` في الحزمة، ورابطها في القائمة الجانبية ضمن قسم «التقارير والتدقيق») — لكن الشريط الجانبي مطويّ على أيقونات فقط افتراضياً، ولوحة المراقبة (المكان الأول الذي يراه المشرف) لا تحوي أي مدخل لها: أزرار الترويسة الأربعة (الروبوتات/التقارير/سجل الأخطاء/المنصة كمورد) وشبكة الوصول السريع (15 رابطاً) كلها بلا AutoHeal.

### التغيير
- نسخة احتياطية: `backups/p60_seed_unify/MonitoringDashboard.js.bak.p60`.
- `pages/admin/components/MonitoringDashboard.js`:
  - زر ترويسة خامس «الإصلاح الذاتي» (أيقونة HeartPulse، نفس variant/نمط الأزرار الأربعة، data-testid=`go-to-autoheal-btn`) → ينقل إلى `/saas-admin/autoheal`.
  - بطاقة «الإصلاح الذاتي» في شبكة الوصول السريع QUICK_LINKS (نفس نمط البطاقات).
- لا تغيير في التصميم/الألوان/التخطيط — إدخالات تنقّل جديدة بنفس الأنماط الموجودة.

### بعد (تحقق متصفح حقيقي — Chromium)
- دخول superadmin → لوحة المراقبة: زر «الإصلاح الذاتي» ظاهر في الترويسة ✅ (لقطة محفوظة)
- النقر عليه → `/saas-admin/autoheal` تعمل كاملة: نقاط الصحة 98/100، النتائج المكتشفة، سجل المسحات ✅
- الحزمة الجديدة `main.a9ab61c7.js` منشورة و index.html يشير إليها ✅ (الحزمة القديمة 96766be7 محفوظة كاحتياط كاش — مساحة القرص 85G متاحة)
- الموقع ← 200 عبر Cloudflare ✅
- كلمة مرور superadmin المؤقتة أُعيدت إلى الأصل بعد الاختبار ✅


---

## p61 — 2026-08-15 — إصلاح بطء /smart-dashboard (عنق الزجاجة: توقّع الإيرادات عبر LLM)

### قبل (قياسات حقيقية بتوكن المستأجر NT-0011)
- `GET /api/ai/financial-health` ← 14-21ms ✅
- `GET /api/ai/insights` ← 17-26ms ✅
- `GET /api/ai/daily-summary` ← 8-12ms ✅
- `GET /api/ai/forecast/revenue?periods=6` ← **2.6-6.2 ثانية** ❌ — استدعاء LLM متزامن بلا كاش ولا مهلة، والواجهة تنتظر الأربعة معاً (Promise.all) فتتجمد الصفحة كلها على أبطأهم.

### التغيير
- نسخة احتياطية: `backups/p61_forecast_perf/chat_routes.py.bak`.
- `routes/ai/chat_routes.py` — endpoint التوقّع فقط:
  1. **كاش Redis** لكل مستأجر+نوع+فترات (`forecast:{tenant}:{type}:{periods}`) بـ TTL 30 دقيقة — بيانات التوقّع تتغير ببطء فلا حاجة لاستدعاء LLM كل زيارة. لا يُخزَّن أي رد فاشل/فارغ.
  2. **سقف 12 ثانية** على انتظار LLM (`asyncio.wait_for`) — عند تجاوزه أو فشل المزوّد: **بديل إحصائي حتمي** (استقراء خطي من نفس تجميعات التاريخ) بنفس بنية الرد تماماً، مع insight توضيحية وconfidence=0.4.
- لا تغيير تصميم/واجهة — تحسين خلفي بحت.

### بعد (تم التحقق)
- مسار LLM سليم: أول طلب بعد مسح الكاش ← 4.26s بنتيجة ذكية حقيقية (trend/insights من النموذج) ✅
- طلب مؤقَّت (مزوّد بطيء لحظتها) ← 12.02s سقف ثم البديل الإحصائي (6 توقعات، trend: stable) ✅ — مستحيل أن تتجمد الصفحة بعد الآن
- من الكاش: **8-26ms** ✅ (تحسّن ~500x للزيارات المتكررة خلال 30 دقيقة)
- الصفحة كاملة في المتصفح (Chromium حقيقي، دخول NT-0011): **~1.9-2.0 ثانية** حتى العرض الكامل، مرتين متتاليتين ✅ (كانت ≥6s)
- openapi ← 200 بعد إعادة التشغيل ✅
- كلمة مرور NT-0011 المؤقتة أُعيدت لأصلها، ملفات الاختبار حُذفت ✅

### ملاحظة
- نتائج التوقّع قد تتأخر 30 دقيقة عن آخر عملية بيع (مقبول لودجت توقعات). عند الحاجة لتحديث فوري: حذف مفتاح `forecast:*` من Redis أو زر «تحديث» الموجود أصلاً في الصفحة.


---

## p62 — 2026-08-15 — مصدر الدفع في المشتريات: 5 صناديق + خصم تلقائي من إدارة المال + إصلاح مرآة المورد

### قبل
- نموذج «شراء جديد» يعرض 3 مصادر دفع فقط (نقداً/بنك/محفظة — وزر المحفظة بلا تسمية أصلاً)، بدون **الخزنة** وبدون **مال خاص**.
- الـ backend كان يخصم فعلاً من الصندوق عبر `payment_method` — لكن المخطط (schema) يقبل cash/bank/wallet فقط، فأي قيمة جديدة كانت سترفض 422.
- **علة محاسبية** في `POST /supplier-debts/pay`: تسديد الدين كان ينقّص `total_purchases` (إجمالي المشتريات التاريخي يتضاءل مع كل تسديد!) بدل إنقاص `balance` (ما ندين به).

### التغيير
- نسخ احتياطية: `backups/p62_purchase_paymethod/` (5 ملفات).
- **backend:**
  - `models/schemas/trading.py`: `payment_method` للمشتريات يقبل الآن `cash/bank/wallet/safe/personal`.
  - `purchases_routes.py`: حارس `!= "personal"` في الإنشاء/التعديل/الحذف — المال الخاص لا يمسّ أي صندوق ولا يولّد حركة (خارج إدارة المال).
  - `customer_debts_routes.py` (pay_supplier_debt): نفس الحارس + **إصلاح المرآة**: `balance=-payment` بدل `total_purchases=-payment`.
- **frontend:**
  - نموذج شراء جديد: صف مصدر الدفع أصبح 5 أزرار بنفس النمط (نقداً/بنك/محفظة إلكترونية/خزنة/مال خاص، أيقونات Banknote/CreditCard/Wallet/Vault/PiggyBank) + تسمية المحفظة المفقودة + تلميح توضيحي عند اختيار «مال خاص» («لن يُخصم أي مبلغ من الصناديق») — testids: `purchase-payment-source`, `pay-source-safe`, `pay-source-personal`, `personal-money-hint`.
  - نموذج تسديد دين المورد: نفس الأزرار الخمسة (كانت نقداً/بنك فقط) — testid: `debt-payment-source`.
  - `LanguageContext.js`: مفاتيح `safe` (خزنة/Coffre) و`personalMoney` (مال خاص/Argent personnel).

### بعد (تم التحقق بـ curl على مستأجر NT-0011 + متصفح حقيقي)
- شراء 1000 من **الخزنة**: safe 4800→3800 ✓ + حركة expense موثقة ✓ + المخزون +1 ✓
- شراء 500 من **مال خاص**: لا حركة صناديق إطلاقاً ✓ + المخزون +1 ✓ + total_purchases +500 ✓
- شراء دين 800 ثم تسديده من **مال خاص**: `balance` المورد 800→0 ✓ و`total_purchases` **بقي 7300** (قبل الإصلاح كان سيهبط 6500) ✓ ولا حركة صناديق ✓
- حذف الفواتير الثلاث: كل شيء عاد لأصله (safe 4800، مخزون 7، مرآة 0/5000) ✓ — مخلفات الاختبار نُظفت (3 حركات + سعر شراء المنتج)
- المتصفح: الأزرار الخمسة ظاهرة بترجماتها، زر «مال خاص» يُظهر التلميح ✓
- الحزمة الجديدة `main.35db7f73.js` منشورة و index.html يشير إليها ✓ (الحزمتان القديمتان محفوظتان كاحتياط كاش)
- كلمة مرور NT-0011 المؤقتة أُعيدت لأصلها ✓

### الترابط المحاسبي الناتج
شراء (نقدي/جزئي) → خصم فوري من الصندوق المختار + حركة موثقة في إدارة المال + مرآة المورد (balance/total_purchases) + المخزون. دين → لا خصم حتى التسديد، والتسديد يخصم من الصندوق المختار ويصحّح المرآة. مال خاص → مسار موازٍ خارج الصناديق تماماً.


---

## p63 — 2026-08-15 — توحيد كامل: مخزون قطع الغيار = مخزون المنتجات

### قبل
- بنيتان متوازيتان: `spare_parts` (منفصلة، فارغة كلياً لدى المستأجرين — 0 وثيقة) مقابل `products` (المخزون الحقيقي). صفحة /repairs/parts تقرأ الفارغة، بينما تذكرة الصيانة تبحث فعلياً في /products — ازدواجية ميتة.
- إحصائيات الصفحة كانت تعرض 0 دائماً: frontend يقرأ مفاتيح `total/low_stock/total_sell_value` بينما API يرجع `total_parts/low_stock_count/total_inventory_value` (عدم تطابق صامت).

### التغيير (واجهة فقط — backend المنتجات كان جاهزاً)
- نسخة احتياطية: `backups/p63_parts_unify/SparePartsPage.js.bak`.
- `SparePartsPage.js` أُعيد توصيله بالكامل إلى `/products`:
  - **القراءة**: GET /products مع خريطة حقول (name_ar/name_en، retail_price→sell_price، purchase_price، quantity، low_stock_threshold، family_name→category، part_category/compatible_brands/supplier كحقول مخصصة).
  - **الإحصائيات**: تُحسب محلياً من المخزون الموحّد (إصلاح عدم تطابق المفاتيح القديم).
  - **الإضافة**: POST /products (name_en إلزامي في المخطط) ثم PUT للحقول المخصصة (part_category/compatible_brands/supplier — تمر عبر pass-through).
  - **التعديل**: PUT واحد /products/{id} بكل الحقول.
  - **الحذف**: DELETE /products/{id} — يرث حماية المنتجات (يمنع حذف ما عليه مخزون أو حركات) + أرشفة deleted_products + عرض رسالة الخطأ الحقيقية في toast.
- التصميم لم يتغير إطلاقاً — نفس الصفحة والنموذج والفلاتر، تغيّرت طبقة البيانات فقط.

### بعد (تم التحقق بمتصفح حقيقي على NT-0011)
- الصفحة تعرض منتجَي المخزون الحقيقيين (cable samsuge + Automobile & Transport) مع الفئة (Cable من family_name) والأسعار والكميات ✓
- البحث «cable» ← الجدول يفلتر ويعرض الكابل فقط ✓ (شريط «مخزون منخفض» الأصفر يعرض الناقص دائماً — سلوك مقصود أصيل)
- الإحصائيات صحيحة: إجمالي 2، قيمة المخزون 1,750 دج، مخزون منخفض 2 ✓
- نموذج «إضافة قطعة» يفتح ويُملأ ✓ (الإضافة نفسها تمر عبر POST /products المختبر سابقاً في p59/p62)
- الترابط الناتج: قطعة تُستخدم في صيانة → تنقص من نفس المخزون الظاهر في /products وPOS والتقارير ✓ (مسار use-part يدعم products من قبل)
- الحزمة `main.220d6fcf.js` منشورة ✓، كلمة المرور المؤقتة أُعيدت ✓

### ملاحظة
- مجموعة `spare_parts` الفارغة ومسارات /spare-parts القديمة بقيت كما هي (غير مستخدمة، لا ضرر منها) — لم تُحذف حفاظاً على الاستقرار.

## p64 — إصلاح صفحة الديون /debts (2026-08-15)
**المشكلة:** /debts تعرض مستحقات 0.00 وديون 0.00 رغم وجود دين 3500 على الزبون bob.
**الجذر:** الصفحة تقرأ مجموعة debts (اليدوية الفارغة) فقط؛ ديون المبيعات/المشتريات الآجلة تعيش في أرصدة customers/suppliers. إضافةً: تجميع customer_debt_aggregates يقرأ debt_amount بينما المبيعات تكتب remaining؛ وpay_customer_debt لم يكن يحدّث الصناديق.
**قبل:** GET /debts → []؛ summary → 0؛ pay_customer_debt → 400 رغم وجود دين.
**التغييرات (backup: /opt/ntcommerce/backups/p64_debts_fix/):**
- routes/debts_routes.py: دمج ديون افتراضية حية من أرصدة الزبائن/الموردين (virt-customer-/virt-supplier-) في GET /debts؛ دفعها يوزّع FIFO على الفواتير المفتوحة + يحدّث المرآة + الصندوق (personal لا يلمس الصناديق).
- services/balances.py: إصلاح customer_debt_aggregates ليقرأ max(remaining, debt_amount)؛ إضافة allocate_customer_payment و allocate_supplier_payment.
- routes/customer_debts_routes.py: pay_customer_debt يستخدم الموزّع الجديد + يودع المبلغ في الصندوق ويسجل معاملة؛ pay_supplier_debt يستخدم الموزّع + شكل معاملة قياسي (cash_box_id).
- models/schemas/trading.py: DebtPaymentCreate يقبل safe و personal.
- frontend DebtsPage.js: حوار الدفع يعرض الخزنة والمال الخاص.
**بعد (curl على NT-0011):** /debts → bob 3500؛ دفع 500+500+200 → المرآة=الفاتورة=summary=القائمة=2300 ونقدي=1200؛ ثم استعادة كاملة للحالة الأصلية وكلمة مرور المستأجر.

## p65 — إصلاح /ai-chat: تنفيذ فعلي للاستعلامات (2026-08-15)
**المشكلة:** المحادثة تكتفي بنص "سأقوم بتنفيذ استعلام..." دون جلب أي بيانات — الـ LLM يسمّي query_type لكن لا أحد ينفّذه.
**التغيير (backup: /opt/ntcommerce/backups/p65_aichat/):** routes/ai/chat_routes.py — إضافة _execute_ai_query (تنفيذ حقيقي على MongoDB لأنواع: get_revenue/get_expenses/get_profit/get_top_customers/get_top_products/get_overdue_invoices/get_cash_balance)، _detect_query_type (كشف بالكلمات المفتاحية العربية عندما لا يسمّي الـ LLM النوع)، _format_answer (صياغة عربية حتمية بالأرقام الحقيقية). المال الخاص مستثنى من إجمالي رأس المال.
**اختبار curl:** مصروفات الشهر → 0.00 دج (صحيح، لا مصروفات)؛ أرصدة الصناديق → 4,800 دج بالتفصيل؛ أفضل المنتجات → قائمة حقيقية.
**ملاحظة:** كسر مؤقت في المسار أثناء الترقيع (indentation) اكتُشف وأُصلح في نفس المرحلة؛ openapi يؤكد تسجيل /api/ai/chat.

## p66+p67 — فحص شامل للنظام وإصلاحات محاسبية (2026-08-15)
**الفحص:** سكربت sweep (/root/p66_sweep.py) ينفّذ عمليات مستأجر حقيقي على NT-0011 عبر API: إنشاء منتج، شراء مدفوع من الخزنة، شراء بالدين، بيع نقدي، بيع جزئي لزبون جديد، تحقق من /debts و/debts/summary، سداد دين مورد من الخزنة، سداد دين زبون نقداً، مصروف، تحويل بين الصناديق، تذكرة إصلاح + استخدام قطعة، ai-chat، تقارير الربح — ثم حذف/عكس كل شيء والتحقق من عودة الحالة الأصلية.
**الأخطاء المكتشفة والمُصلحة (backup: /opt/ntcommerce/backups/p66_sweep_fixes/):**
1. المصروفات لا تنقص أي صندوق → expenses_routes.py: حقل payment_method (cash/bank/wallet/safe/personal)، إنقاص الصندوق + معاملة عند الإنشاء، عكس عند التعديل، استرجاع عند الحذف (فقط للمصروفات التي أنقصت فعلاً). الواجهة: ExpensesPage منتقِي مصدر الدفع.
2. استخدام قطعة في الإصلاح يسجل سعر 0 للمنتجات الموحّدة → repair_routes.py use-part: fallbacks (selling_price→retail_price→sell_price) و(name_ar→name_en→name).
3. حذف شراء/بيع يسترجع المبلغ لطريقة الدفع الأصلية حتى لو سُددت دفعات من صناديق أخرى (انحراف 200 دج اكتشفه الفحص) → p67: سجل payments لكل فاتورة {amount, method, at} يُملأ عند الإنشاء/السداد/الدفعة الإضافية، والحذف يعكس كل دفعة لصندوقها الحقيقي.
4. ai-chat: regex الشهر كان ^YYYY-MM-01 (اليوم الأول فقط) → ^YYYY-MM.
**النتيجة:** 18/18 PASS، الحالة النهائية = الحالة الابتدائية (نقدي 0، بنك 0، محفظة 0، خزنة 4800، bob 3500، المورد 0/5000).
**الواجهة:** main.a31675a5.js (سابقاً main.8e445d5d.js مع تعديل /debts).

## p68 — صندوق «المال الخاص» (2026-08-15)
**المطلوب:** صندوق خامس في /cash؛ التحويل من صناديق الشركة إليه ينقص رأس المال الإجمالي؛ تطبيق في كل الأماكن اللازمة.
**التنفيذ (backup: /opt/ntcommerce/backups/p68_personal_box/):**
- main.py init_cash_boxes: صندوق personal (المال الخاص/Argent personnel) — يُزرع تلقائياً لكل المستأجرين الحاليين عند أول زيارة لـ /cash؛ زُرع يدوياً في store_template و template_tenant للمستأجرين الجدد.
- stats_routes: total_cash يستثني personal (رأس المال = الصناديق الأربعة فقط).
- المال الخاص أصبح دفتراً حقيقياً: الشراء/المصروف/سداد دين مورد بـ«مال خاص» ينقصه، وتحصيل دين زبون إليه يزيده، والحذف/الاسترجاع يعكسه (أُزيلت استثناءات p62/p66/p67 للصناديق، مع بقاء الحماية للوثائق القديمة بلا سجل payments).
- ai-chat get_cash_balance كان يستثني personal من الإجمالي مسبقاً (p65).
- الواجهة CashManagementPage: البطاقة الخامسة (أيقونة PiggyBank، لون وردي)، الإجمالي المعروض يستثني المال الخاص، تلميح «خارج رأس المال الإجمالي» على البطاقة، تلميحان في حوار التحويل (إليه = ينقص رأس المال / منه = يزيد رأس المال). ExpensesPage: إضافة منتقِي مصدر الدفع (كان مفقوداً من p66 بسبب توقف السكربت) + تصحيح تلميح المال الخاص. PurchaseDialogs: تحديث تلميح المال الخاص.
**اختبار curl على NT-0011:** 5 صناديق تظهر؛ تحويل 500 خزنة→مال خاص: الخزنة 4300 و/stats total_cash=4300 (ينقص رأس المال)؛ شراء 300 بمال خاص: الرصيد الشخصي 500→200؛ حذف الشراء: استرجع إلى 500؛ تحويل عكسي: عاد كل شيء (خزنة 4800، شخصي 0). تنظيف: حُذفت 20 قيد اختبار، واستُعيد قيد تحويل المستخدم الشرعي (نقدي→خزنة 4800) الذي حُذف بالخطأ أثناء التنظيف — السجل الآن 6 قيود شرعية فقط.
**الواجهة:** main.30501617.js

## p69 — نوع التوصيل + أسعار التوصيل حسب الولاية (2026-08-15)
**المطلوب:** فورم الزبون: تحديد الشحن للمكتب/للمنزل، إخفاء العنوان التفصيلي للمكتب؛ أسعار توصيل تلقائية/يدوية في واجهة المشترك تظهر في الفورم وتُضاف للإجمالي.
**التنفيذ (backup: /opt/ntcommerce/backups/p69_delivery/):**
- online_store_routes.py: جدول DEFAULT_DELIVERY_RATES لـ 58 ولاية بأسعار تقريبية (شمال 350-750، هضاب 550-950، جنوب 700-1800)؛ مسارات GET/PUT /api/store/delivery-rates (إدارة المشترك) وGET /api/shop/{slug}/delivery-rates (عام)؛ StoreOrder: delivery_address اختياري + delivery_type (home/office)؛ إنشاء الطلب يحسب الرسوم في الخادم من جدول الأسعار (يتجاهل ما يرسله المتصفح) ويصفّر العنوان للمكتب: total = subtotal + fee.
- PublicStorePage.js: قائمة الولايات أصبحت 58 من جدول الأسعار (كانت 10 فقط)؛ بعد اختيار الولاية يظهر خيارا التوصيل بالسعرين؛ اختيار المكتب يخفي خانة العنوان؛ الملخص يعرض سطر «رسوم التوصيل» + «الإجمالي مع التوصيل».
- EcomShippingTab.js: بطاقة «أسعار التوصيل حسب الولاية» — جدول 58 ولاية بخانتي منزل/مكتب، تعبئة جماعية، حفظ جماعي، ملاحظة عند عرض الافتراضيات.
**اختبار curl:** GET افتراضي 58 ولاية؛ PUT مخصص (ولاية 16: 600/400) saved=58؛ طلب عام مكتب بلا عنوان: العميل أرسل fee=9999 فخُزّن 400 (سعر الخادم) والعنوان فُرّغ، total=1600؛ طلب منزل: fee=600, total=1800؛ المخزون حُسم 7→5 ثم أُعيد بعد حذف الطلبين ومزامنة ecom_orders؛ أُعيد تعطيل متجر bob.
**الواجهة:** main.f2ec69d1.js

## p70 — خصائص المنتج: اللون/الأحجام/المتغيرات + تنبيهات انتهاء الصلاحية (2026-08-15)
- **قبل**: لا توجد حقول لون/أحجام/متغيرات في المنتج؛ دُفعات انتهاء الصلاحية (lots) موجودة لكن غير مربوطة بصندوق التنبيهات.
- **بعد**:
  - backend/models/schemas/catalog.py: حقول جديدة في ProductCreate (color, sizes, has_variants, variants) و ProductUpdate.
  - backend/routes/products_routes.py: POST يخزّن الحقول الجديدة ويحسب quantity = مجموع كميات المتغيرات عند has_variants=true؛ PUT يعيد التطبيع والحساب عند تعديل المتغيرات.
  - backend/routes/notifications_routes.py: قسم 4 في /notifications/generate — مسح product_lots وتوليد تنبيه expiry_warning عند remaining_days <= alert_days (مع dedup لكل دُفعة غير مقروءة).
  - frontend Add/EditProductPage: تبويب جديد "الخصائص" — لون، أحجام، مفتاح "مخزون مستقل لكل متغير" + محرر متغيرات (لون/حجم/كمية) مع الإجمالي التلقائي.
- **اختبارات curl**: إنشاء منتج بمتغيرين → qty=8 تلقائياً ✓؛ PUT متغير واحد → qty=10 ✓؛ دُفعة تنتهي خلال 10 أيام → توليد تنبيه expiry_warning ✓؛ dedup (0 جديد عند إعادة التوليد) ✓؛ حذف منتج عليه مخزون مرفوض (حماية قائمة) ✓؛ تنظيف كامل للبيانات التجريبية.
- **النشر**: main.f4dd0fe6.js — cp -r (الحزم القديمة محفوظة). backup: backups/p70_product_attributes/

## p71 — ربحية التجارة الإلكترونية الدقيقة (COD) (2026-08-15)
- **قبل**: دورة الحالات والقيود المحاسبية الأساسية موجودة (p59) لكن: لا تكلفة تغليف، حق الاسترداد يُقرأ فقط من إعداد شركة الشحن، مصاريف الإعلانات غير محفوظة (حاسبة مؤقتة)، لا تقرير ربحية شامل.
- **بعد**:
  - ecom_order_service.py: expected_profit = إيراد − تكلفة − شحن − تغليف؛ خسائر الإرجاع = شحن + تغليف + حق استرداد (مع override يدوي لكل طلب عبر return_fee في body).
  - orders_routes.py: حقل packaging_cost في إنشاء/تعديل الطلب؛ /status يمرّر return_fee.
  - analytics_routes.py: endpoint جديد GET /ecom/analytics/profitability?days=N — نسب التأكيد/التسليم/الإرجاع، الإيراد المُسلَّم، التكاليف، صافي الربح = محقق − خسائر − إعلانات، ROAS حقيقي، ROI، تكلفة الإعلان لكل طلب مُسلَّم. مصاريف الإعلانات تُقرأ من expenses بفئة "إعلانات ممولة".
  - EcomOrderDetailDialog: لوحة حق الاسترداد عند اختيار "مُستردّ" (إدخال يدوي) + حقل تكلفة التغليف قابل للتعديل (جديد/مؤكد/محضَّر) + سطر التغليف في القيد المحاسبي.
  - EcomAnalyticsPage: بطاقة "الربحية الحقيقية (COD)" بثمانية مؤشرات.
  - EcomAdsTab: بطاقة تسجيل صرف إعلاني (منصة/مبلغ/تاريخ/صندوق الدفع) — تسجّل كمصروف حقيقي يُخصم من الصندوق + قائمة آخر الأصرفات.
- **اختبارات curl**: طلب أ (سعر 3000، شحن 500، تغليف 100، تكلفة 1221): جديد→مؤكد→محضَّر→مشحون→مُسلَّم → realized=1679 ✓؛ طلب ب → مُستردّ بحق 250 → خسارة=850 ✓؛ مخزون 10→9→9 مع استعادة ✓؛ مصروف إعلان 2000 → التقرير net=-1171، ROAS=1.75، ROI=-58.6% ✓؛ تنظيف كامل (مصروف استُرد للصندوق، طلبات وقيود حُذفت، مخزون أُعيد لـ10).
- **إصلاح أثناء البناء**: بطاقة الربحية أُدرجت داخل كتلة digital بخطأ JSX — نُقلت خارجها.
- **النشر**: main.6cd65e4f.js — backup: backups/p71_ecom_profit/

## p72 — فرادة اسم المتجر + نوع التوصيل في صفحة المنتج (2026-08-15)
- **شكوى**: مشتركان بنفس اسم المتجر؛ صفحة المنتج المنفردة /shop/{slug}/product/{id} لا تعرض اختيار مكتب/منزل.
- **بعد**:
  - online_store_routes.py: PUT /store/settings يرفض store_name مستخدماً من مستأجر آخر (فحص case-insensitive على store_slugs، قبل الحفظ) — 400 برسالة عربية واضحة.
  - ProductDetailPage.js: جلب /shop/{slug}/delivery-rates (تُعيد قائمة بـ wilaya_id — أُصلح التحليل والبحث ليقبل id||wilaya_id)، أزرار اختيار 🏠 منزل/🏢 مكتب بأسعار الولاية، إخفاء العنوان التفصيلي عند المكتب، إرسال delivery_type (الخادم يعيد حساب الرسوم ويمسح العنوان للمكتب — p69).
  - PublicStorePage (p69) كان سليماً — لا تغيير.
- **اختبارات**: رفض اسم "NT" من حساب NT-0011 (400) ✓؛ اسم "BOB" الخاص يُحفظ ✓؛ rates العامة 58 ولاية (16: 500/350) ✓؛ p71 profitability حي ✓؛ p70 notifications حي ✓.
- **النشر**: main.0f30d600.js — backup: backups/p72_storefix/

## p73+p74 — متغيرات المنتج في البيع + مزامنة يالدين التلقائية (2026-08-15)
- **p73 — اختيار المتغير عند الطلب من المتجر**:
  - ProductDetailPage: قائمة اختيار اللون/الحجم للمنتجات ذات has_variants (المتغيرات النافدة تُخفى)، نص التوفر حسب المتغير المختار، حدّ الكمية = مخزون المتغير، إلزامية الاختيار.
  - online_store_routes create_public_order: حسم ذري على مستوى المتغير (variant_index) مع فحص التوفر لكل متغير + تراجع كامل عند أي نقص؛ الطلب يخزّن variant_label ويظهر في صندوق الطلبات كـ "اسم (أحمر / L)".
  - استعادة المخزون عند الإلغاء/الاسترداد تعيد كمية المتغير أيضاً (store cancel + ecom_order_service).
- **p74 — مزامنة يالدين**:
  - yalidine_service: fetch_parcel_status (GET /v1/parcels/{tracking}) + map_yalidine_status (Livrée→delivered، Retourné/Echec→refunded، En livraison→بلا تغيير).
  - POST /ecom/shipping/sync-yalidine: يفحص الطلبات shipped بقناة يالدين ويقدّمها عبر آلة الحالات (القيود المحاسبية والمخزون تلقائياً).
  - EcomShippingTab: زر "تحديث الطلبات المشحونة" + ملخص النتيجة.
- **اختبارات حية**: منتج بمتغيرين (3+5=8) → طلب عام بمتغير L×2 → المنتج 6 والمتغير L=3 وM=3 ✓؛ محاولة 99 من متغير فيه 3 → 400 برسالة عربية ✓؛ إلغاء → استعادة كاملة (8، M:3، L:5) ✓؛ ترميز الحالات: Livrée→delivered، En livraison→None، Retourné/Echec→refunded ✓؛ sync حي: checked=0 (لا طرود مشحونة) ✓؛ تنظيف كامل + إيقاف متجر bob.
- **النشر**: main.d950a057.js — backups: p73_variants/, p74_yalidine_sync/

## p75 — بكسلات التتبع للإعلانات الممولة (2026-08-15)
- **قبل**: لا تتبع إعلاني في المتجر العام — الإعلانات الممولة تعمل عمياء.
- **بعد**:
  - StoreSettings: حقلا fb_pixel_id و tiktok_pixel_id؛ يُكشفان تلقائياً في /shop/{slug} العام.
  - ملف جديد frontend/src/lib/pixel.js: تحميل fbq/ttq عند وجود المعرفات فقط + trackPixel موحّد (Purchase → CompletePayment لتيك توك)؛ أخطاء التتبع لا تكسر المتجر.
  - الأحداث: PublicStorePage — PageView عند الفتح، AddToCart، InitiateCheckout عند فتح فورم الطلب، Purchase عند نجاح الطلب (بالقيمة دج)؛ ProductDetailPage — ViewContent عند فتح المنتج + Purchase عند الطلب.
  - StoreManagementPage: بطاقة "بكسلات التتبع" بحقلي الإدخال (data-testid: fb-pixel-input / tiktok-pixel-input).
- **اختبار**: حفظ/قراءة المعرفات عبر API ✓ (أُعيدت فارغة — المستأجر يملؤها من الواجهة)؛ الحزمة تحمل fbevents.js + analytics.tiktok.com + الأحداث ✓.
- **النشر**: main.e242c395.js — backup: backups/p75_pixels/

## p76 — سحب أسعار التوصيل الحقيقية من يالدين (2026-08-15)
- **قبل**: delivery_rates أسعار افتراضية تقريبية؛ return_fee = 0؛ لا ربط بحساب يالدين الفعلي.
- **بعد**:
  - POST /api/ecom/shipping/yalidine/pull-rates {from_wilaya_id}: يسحب الرسوم الحقيقية (منزل/مكتب/إرجاع) لكل الولايات الـ58 من /v1/fees/ — تسلسلي مع مهلة 1.5ث وإعادة عند 429، upsert غير هدّام لكل ولاية؛ يحفظ return_fee (الأكثر شيوعاً) + sender_wilaya_id على التكامل.
  - **وسيط IPv6 على المضيف** (ntcommerce-yalproxy.service، /opt/ntcommerce/yalidine_proxy.py على 172.20.0.1:8899): جدار يالدين حظر IPv4 الخادم (403 لكل الطلبات) بينما IPv6 سليم — الخدمة تجرّب httpx أولاً ثم تسقط تلقائياً على الوسيط (fetch_fees_for_wilaya + fetch_parcel_status). قاعدة ufw: سماح 8899 من 172.20.0.0/16 فقط.
  - EcomShippingTab: صف السحب (sender-wilaya-input + pull-yalidine-rates-btn + pull-rates-msg) فوق جدول الأسعار.
- **حوادث أثناء التنفيذ**: سحب موازٍ سابق أثار 429 جماعي ثم 403 لـ IPv4؛ استُعيدت delivery_rates كاملة (58) قبل إعادة السحب الآمن.
- **اختبارات حية**: fetch_fees_for_wilaya عبر الوسيط ✓ (ولاية 09: 700/550)؛ سحبان كاملان متتاليان: saved=58, failed=[] ✓؛ الأسعار الفعلية في القاعدة (أدرار 1050/850، الشلف 900/650…) ✓؛ retour_fee=0 من حساب يالدين (مسجّل) ✓.
- **النشر**: main.e0e089fa.js — backup: backups/p76_yalidine_rates/

## p77 — القائمة السوداء للمشاغبين (2026-08-15)
- **قبل**: لا تنبيه ضد الزبائن كثيري الإرجاع — نفس الرقم المشاغب يطلب مجدداً بلا أي تحذير.
- **بعد**:
  - تمييز تلقائي: هاتف لديه طلبان مُستردّان (refunded/returned) أو أكثر يُعلَّم تلقائياً في كل القوائم.
  - قائمة يدوية: مجموعة ecom_blacklist — POST /api/ecom/blacklist {phone, reason}، DELETE /api/ecom/blacklist/{phone}، GET /api/ecom/blacklist (auto + manual + threshold).
  - الطلبات تُبَوَّب بـ blacklist {flagged, returned_count, manual, reason} في GET /ecom/orders و /ecom/orders/{id} — يشمل طلبات المتجر الإلكتروني تلقائياً (لا حاجة لوسم عند الإنشاء).
  - الواجهة: شارة حمراء «⚠ مُرجِع ×N / محظور» في جدول الطلبات (blacklist-badge)؛ لافتة تحذير حمراء في نافذة الطلب قبل التأكيد (blacklist-warning)؛ زر «🚫 حظر هذا الرقم / إزالة» تحت الهاتف (blacklist-toggle-btn).
- **اختبارات حية**: طلبان مسترجعان لرقم تجريبي → ظهر في auto وفي التبويب للقائمة والطلب المفرد ✓؛ إضافة يدوية ✓؛ رفض رقم قصير (400) ✓؛ حذف ✓ وحذف المفقود 404 ✓؛ حذف بيانات الاختبار ✓.
- **النشر**: main.dd0781e5.js — backup: backups/p77_blacklist/

## p78 — تتبع UTM في الطلبات (2026-08-15)
- **قبل**: لا معرفة بمصدر طلبات المتجر — الإعلانات تُصرف بلا عزو للحملات.
- **بعد**:
  - ملف جديد frontend/src/lib/utm.js: التقاط utm_source/medium/campaign/content/term من رابط الوصول إلى sessionStorage (يعيش خلال التنقل داخل المتجر، لكل تبويب)، وأخطاء التتبع لا تكسر المتجر.
  - PublicStorePage + ProductDetailPage: captureUtm() عند الفتح + utm: getUtm() في حمولة الطلب.
  - الخادم: _sanitize_utm (يبقي مفاتيح utm_* الخمسة المعروفة فقط، حد 100 حرف — جرّد مفاتيح خبيثة في الاختبار)؛ StoreOrder.utm؛ يُحفظ في store_orders + ecom_orders مع utm_source مُسطَّح؛ الطلبات اليدوية تقبل utm اختيارياً.
  - تقرير الربحية: utm_sources — لكل مصدر: طلبات/مُسلَّمة/مُرجعة/إيراد مُسلَّم/ربح محقق (direct = مباشر بدون حملة).
  - الواجهة: جدول «الأداء حسب مصدر الحملة» في صفحة التحليلات (utm-sources-card)؛ سطر المصدر في نافذة الطلب (utm-source-line).
- **اختبار حي**: طلب WEB000009 بـ utm facebook/cpc/p78-test + مفاتيح خبيثة → حُفظ معقّماً في المجموعتين ✓؛ utm_sources أظهر facebook ✓؛ إلغاء + حذف + استعادة المخزون (9) ✓؛ المتجر أُعيد موقّفاً ✓.
- **النشر**: main.0c0358af.js — backup: backups/p78_utm/

## p79 — سجل محاولات التأكيد بالاتصال (2026-08-15)
- **قبل**: موظف التأكيد يتصل بالزبون ولا يُترك أي أثر — لا معرفة بعدد المحاولات أو نتائجها.
- **بعد**:
  - POST /api/ecom/orders/{id}/call-attempt {result, note}: النتائج no_answer/confirmed/postponed/wrong_number/cancelled_by_phone؛ تُدفع إلى confirmation_attempts على الطلب {at, result, result_ar, note, by, by_name}.
  - تحويل تلقائي عبر آلة الحالات: confirmed → الطلب يتأكد (قيود الربح المتوقع تُسجَّل)؛ cancelled_by_phone → إلغاء (استعادة المخزون) — والمحاولة تبقى مسجلة حتى لو فشل التحويل.
  - الواجهة (EcomOrderDetailDialog): قسم «📞 محاولات التأكيد بالاتصال» (call-log-section) — سجل زمني بالشارات الملوّنة + قائمة نتيجة (call-result-select) + ملاحظة + زر تسجيل (call-log-submit)؛ النموذج يظهر فقط للحالات القابلة للتأكيد.
- **اختبار حي**: نتيجة غير صالحة → 400 ✓؛ no_answer يُسجَّل بلا تحويل ✓؛ confirmed → status=confirmed + قيد expected ✓؛ إلغاء + حذف + تنظيف ✓.
- **النشر**: main.40d0cd9b.js — backup: backups/p79_calllog/

## p80 — مزامنة يالدين الدورية التلقائية (2026-08-15)
- **قبل**: تحديث حالات الطرود يدوي بزر فقط (p74).
- **بعد**: خدمة خلفية services/ecom/yalidine_scheduler.py تُقلع مع التطبيق: كل ساعتين تمرّ على كل المستأجرين النشطين، ومن لديه تكامل يالدين فعّال تسحب حالات الطرود المشحونة وتقدّمها عبر آلة الحالات (delivered → ربح محقق / refunded → خسائر + استعادة مخزون)، مع إشعار في صندوق الإشعارات عند كل تسليم/إرجاع. مهلة 1ث بين الطرود و2ث بين المستأجرين رفقاً بحدود يالدين. الزر اليدوي يبقى للفحص الفوري.
- **اختبار حي**: المجدول بدأ مع الإقلاع (log) ✓؛ دورة يدوية كاملة على كل المستأجرين بلا أخطاء ✓ (لا طرود مشحونة حالياً).
- **النشر**: backend فقط — backup: backups/p80_yalidine_autosync/

## p81 — Conversions API لكل متجر (2026-08-15)
- **قبل**: خدمة CAPI موجودة لكنها تقرأ مفاتيح من متغيرات بيئة عامة فارغة — معطّلة فعلياً لكل المستأجرين.
- **بعد**:
  - store_settings: fb_access_token + tiktok_access_token (سرّيان) بجانب معرّفي البكسل (p75)؛ إدخالهما من بطاقة البكسلات (fb-token-input / tiktok-token-input، نوع password).
  - conversions_api_service: send_event/send_purchase/send_page_view تقبل pixels لكل مستأجر مع رجوع لمتغيرات البيئة؛ event_id لإلغاء الازدواج مع بكسل المتصفح (Purchase يرسل eventID=order_number من الجهتين).
  - حماية: _public_settings يجرد التوكنات من /shop/{slug} و /shop/{slug}/product/{id} العامين (المعرّفات تبقى — عامة بطبيعتها).
  - تبويب الشحن: ملاحظة «مزامنة تلقائية كل ساعتين» (p80, yalidine-autosync-note).
- **اختبار حي**: PUT يحفظ التوكن ✓؛ طلب عام → سجل الخادم «Facebook CAPI Purchase: 400» (توكن تجريبي — يثبت وصول بيانات المستأجر لفيسبوك) ✓؛ /shop/bob العام نظيف من التوكنات ويُظهر fb_pixel_id ✓؛ إلغاء + تنظيف ✓.
- **النشر**: main.68733380.js — backup: backups/p81_capi/

## p85 — طباعة جماعية لبوليصات الشحن (2026-08-15)
- **قبل**: طباعة كل بوليصة على حدة.
- **بعد**: GET /api/ecom/shipping/labels-bulk?date=YYYY-MM-DD (افتراضياً اليوم بتوقيت الجزائر) يرجع بوليصات اليوم مع label_url وعلم real (يميّز mock://)؛ تبويب الشحن ← بطاقة الطرود: حقل تاريخ + زر «🖨 طباعة جماعية» (bulk-print-btn) يفتح نافذة RTL فيها جدول البوليصات وزر «فتح الكل» يفتح كل PDF في تبويب للطباعة.
- **اختبار حي**: labels-bulk أرجع بوليصتي اليوم التجريبيتين مع real=false ✓.
- **النشر**: main.a8099216.js — backup: backups/p85_bulk_labels/

## p83 — السلة المهجورة (2026-08-15)
- **قبل**: زائر يملأ هاتفه ولا يكمل الطلب = ضائع بلا أثر.
- **بعد**:
  - POST /shop/{slug}/cart-lead (عام): upsert بـ (phone, converted=false) — هاتف + اسم + محتوى السلة + الإجمالي + first/last_seen؛ تحقق من صحة الهاتف وحدود الأحجام.
  - الالتقاط من الواجهة: مراقب مؤجَّل (1.5ث) لحقل الهاتف في صفحة المتجر وصفحة المنتج — يُرسل مرة واحدة لكل (هاتف+سلة) في الجلسة.
  - التحويل التلقائي: عند نجاح طلب عام بنفس الهاتف تُعلَّم السلة converted مع order_number وتختفي من القائمة.
  - الإدارة: GET /store/cart-leads + بطاقة «🛒 سلات مهجورة» أعلى تبويب الطلبات في إدارة المتجر (abandoned-carts-card) — هاتف قابل للاتصال المباشر + المحتوى + الإجمالي + آخر ظهور.
- **اختبار حي**: التقاط ×2 → سجل واحد محدَّث ✓؛ هاتف قصير → 400 ✓؛ القائمة الإدارية تعرضه ✓؛ طلب بنفس الهاتف → converted ويختفي ✓؛ تنظيف كامل والمخزون سليم ✓.
- **النشر**: main.bbe20bde.js — backup: backups/p83_abandoned_cart/

## p84 — ملخص يومي عبر تيليجرام (2026-08-15)
- **قبل**: لا ملخص يومي آلي.
- **بعد**:
  - store_settings: telegram_bot_token (سري — يُجرد من النقاط العامة) + telegram_chat_id + telegram_daily_enabled؛ telegram_last_daily لمنع التكرار.
  - services/telegram_daily.py: حلقة تفحص كل 5 دقائق — الساعة 21:00 بتوقيت الجزائر يرسل لكل مستأجر مفعّل: طلبات اليوم (جديدة/بانتظار)، المُسلَّم مع الإيراد، المُرجع مع الخسائر، صافي ربح اليوم من دفتر القيود.
  - POST /api/store/telegram/test: رسالة اختبار بالمفاتيح المحفوظة/المرسلة.
  - الواجهة: بطاقة «📊 الملخص اليومي عبر تيليجرام» في إدارة المتجر (telegram-daily-card) — توكن + chat id + تفعيل + زر اختبار.
- **اختبار حي**: المجدول يقلع مع التطبيق ✓؛ النقطة ترفض بلا مفاتيح برسالة عربية ✓؛ api.telegram.org متاح من الحاوية (401 لتوكن وهمي = اتصال سليم) ✓.
- **ملاحظة للمستخدم**: يحتاج إنشاء بوت من @BotFather وإدخال التوكن والمعرف.
- **النشر**: main.6e0e0166.js — backup: backups/p84_telegram/

## p82 — صفحة هبوط مستقلة لكل منتج (2026-08-15)
- **قبل**: صفحة المنتج الوحيدة هي صفحة المتجر العامة — لا صفحات مبيعات مخصصة للحملات.
- **بعد**:
  - store_landing_pages (لكل منتج): enabled + headline + offer_text + video_url + old_price + fb_pixel_id/tiktok_pixel_id خاصان بالصفحة؛ GET/PUT /api/store/landing/{product_id} (إداري).
  - GET /api/shop/{slug}/lp/{product_id} (عام): المنتج + إعداد الصفحة + بيانات المتجر العامة — 404 إن لم تكن الصفحة مفعّلة؛ أسرار البكسلات مجردة.
  - الواجهة العامة: /shop/:slug/lp/:productId — صفحة RTL سريعة مستقلة: فيديو (يوتيوب/mp4) أو صورة المنتج، عنوان مخصص، سعر قديم مشطوب + شارة التوفير، شارات ثقة، فورم طلب مباشر (متغير/كمية/اسم/هاتف/ولاية/بلدية/منزل-مكتب مع أسعار التوصيل) يُرسل لنفس POST /shop/{slug}/order مع utm + eventID للـ Purchase، بكسل الصفحة يطغى على بكسل المتجر، التقاط سلة مهجورة (p83)، شاشة نجاح.
  - الإدارة: عمود «صفحة هبوط» في جدول منتجات المتجر (landing-config-btn للمنتجات المعروضة) يفتح حوار الإعداد (landing-dialog): تفعيل + عنوان + عرض + فيديو + سعر قديم + بكسلان + رابط قابل للنسخ (lp-url/lp-copy-btn).
- **اختبار حي**: PUT يحفظ الإعداد ✓؛ GET الإداري يرجعه ✓؛ العام يرجع المنتج+الإعداد ✓؛ لا تسريب لأسرار البكسل ✓؛ تعطيل الصفحة → 404 ✓؛ تنظيف كامل + متجر bob معطّل من الجانبين ✓.
- **النشر**: main.9ab97fb9.js — backup: backups/p82_landing/

## p86 — ربط حسابات المتجر بلوحة التحكم والمحفظة (2026-08-15)
- **تشخيص سؤال «لماذا السالب»**: الحساب كان صحيحاً — منتج تجريبي سعر بيعه 0 دج (تكلفته 1221) بِيع في طلبين WEB000007/8 + مصروف إعلانات 10 000 دج → صافي −12 971. صُفّرت بيانات الاختبار (حذف الطلبين + قيودهما + store_orders وإرجاع وحدتين للمخزون) بموافقة المستخدم.
- **قبل**: طلبات المتجر ecom_orders غير مرئية للوحة التحكم ولا تلمس أي صندوق؛ /cash فيه 5 صناديق فقط.
- **بعد**:
  - صندوق جديد «محفظة المتجر الإلكتروني» (ecom_store, نوع ecom بأيقونة سلة) — يمثل المال المحصَّل لدى شركة التوصيل: عند التسليم قيد دخل بـ (الإجمالي − الشحن)، عند الإرجاع عكس التحصيل + خصم رسوم الناقل. التحويل للنقدي/البنكي عند صرف يالدين للمستحقات بميزة التحويل الموجودة. upsert ذاتي إن لم يُهيَّأ الصندوق بعد.
  - مصاريف تلقائية في إدارة المال (بلا حركة صندوق — الناقل يخصمها من المستحقات): «شحن المتجر الإلكتروني» عند الشحن، «مرتجعات المتجر» (رسوم إرجاع + تغليف) عند الإرجاع — مع code/expense_number عبر generate_code (الفهرس الفريد كان يمنع الإدراج).
  - كل القيود idempotent بأعلام على الطلب (wallet_booked / wallet_reversed / return_deducted / shipping_expensed / return_expensed) ولا تعطّل تغيير الحالة عند فشلها.
  - لوحة التحكم: مبيعات اليوم/الشهر/السنة = POS + طلبات المتجر (تُحتسب عند الإنشاء، باستثناء الملغاة — قرار المستخدم) مع سطر تفصيلي «منها المتجر: X دج (n)» تحت كل بطاقة (store-share-today/month/year)؛ الفوائد الشهرية تضيف إيراد وتكلفة المتجر (ecom_revenue/ecom_cogs في profit-stats) والمصاريف التلقائية تدخل ضمن التكاليف.
- **اختبار حي (NT-0011)**: طلب 3000 (شحن 500): شحن → مصروف CH00002/26 ✓؛ تسليم → محفظة +2500 + قيد income ✓؛ لوحة التحكم اليوم 16150→19150 ومنها المتجر 6350→9350 ✓؛ profit-stats ecom_rev ظهر ✓؛ إرجاع → عكس −2500 + رسوم ناقل −500 ✓؛ إعادة نفس الانتقال = بلا ازدواج ✓؛ تنظيف كامل (رصيد 0، بلا مصاريف تجريبية) ✓؛ المخزون 9→11 بعد إزالة الاختبارات ✓.
- **النشر**: main.4628e64d.js — backup: backups/p86_store_accounting/

## p87 — تسجيل طلبات المتجر في سجل المبيعات /sales (2026-08-15)
- **قبل**: p86 ربط الطلبات بالإحصائيات والمحفظة، لكن صفحة /sales (سجل المبيعات) تقرأ db.sales فقط — طلبات المتجر لم تظهر فيها.
- **بعد**:
  - sync_sale_doc (ecom_order_service): مرآة idempotent لكل طلب متجر في سجل المبيعات بمفتاح ecom-{order_id} — invoice_number=order_code، الزبون، العناصر مع purchase_price (لحساب التكلفة)، delivery_fee=الشحن، payment_type=cod، source=webstore. الحالة: جديد→unpaid (COD لم يُحصَّل)، مُسلَّم→paid بـ paid_amount وpayment_method=ecom_store، ملغي/مرتجع→returned (يُستبعد من الإحصائيات تلقائياً).
  - التسجيل يعمل عند الإنشاء (قرار المستخدم) — من المسارين: إنشاء يدوي في مركز التجارة + طلبات المتجر العامة (online_store_routes)؛ ويتحدث مع كل تغيير حالة.
  - الإحصائيات عادت تقرأ sales فقط (بلا ازدواجية): نصف POS يستبعد source=webstore والتفصيل «منها المتجر» يُحسب من sales حيث source=webstore؛ profit-stats يشملها تلقائياً (التكلفة من purchase_price المخزَّن في العناصر) مع ecom_revenue/ecom_cogs للشفافية.
  - حماية: إرجاع/حذف مستندات webstore من /sales مرفوض (400) — المخزون تديره آلة حالات مركز التجارة؛ الواجهة تخفي زر الإرجاع لهذه الصفوف وتعرض شارة «متجر» (webstore-badge) بجانب رقم الفاتورة.
  - ترحيل رجعي: كل الطلبات الموجودة سُجّلت (NT-0002: 5، NT-0011: 8).
- **اختبار حي (NT-0011)**: الطلبات الثمانية ظاهرة في /sales ✓؛ طلب جديد يظهر فوراً unpaid ✓؛ لوحة التحكم تحتسبه عند الإنشاء (4150→6550) ✓؛ التسليم → paid + ecom_store ✓؛ الإرجاع من /sales مرفوض 400 ✓؛ الإلغاء → returned ويُستبعد ✓؛ تنظيف كامل والأرقام عادت للأساس ✓.
- **النشر**: main.e0f6ae75.js — backup: backups/p87_sales_register/

## p88 — محفظة مستقلة لكل شركة شحن (2026-08-15)
- **السبب**: المستخدم يتعامل مع عدة شركات شحن؛ المحفظة الواحدة المجمّعة تمنع معرفة أي شركة نقصت عند الصرف.
- **النموذج المعتمد (بعد شرح COD)**: الدين في COD هو ذمة شركة الشحن (هي من يقبض من الزبون) وليس دين زبون؛ رأس المال لا ينقص بل يتحوّل: بضاعة → مستحقات لدى الناقل → نقد. المحفظة = حساب ذمة الناقل.
- **بعد**: _courier_box في ecom_order_service — كل شركة شحن لها صندوق ecom_store_{courier} باسم «محفظة {اسم الشركة من التكامل}» يُنشأ تلقائياً (upsert) عند أول قيد؛ التسليم يضيف (الإجمالي − الشحن) لصندوق شركة الطلب، والإرجاع يعكس التحصيل ويخصم رسوم الناقل من نفس الصندوق. الطلبات بلا شركة شحن تبقى على المحفظة العامة ecom_store. عند صرف الشركة للمستحقات: تحويل عادي من محفظتها إلى النقدي/البنكي — والفرق بين الرصيد والمبلغ المصروف يكشف أي نقص.
- **اختبار حي (NT-0011)**: طلب يالدين 3500 (شحن 500) → محفظة يالدين +3000 ✓؛ طلب بلا شركة → المحفظة العامة +1500 ✓؛ إرجاع طلب يالدين → عكس −3000 + رسوم ناقل −500 من صندوق يالدين فقط (العامة لم تُمسّ) ✓؛ تنظيف كامل ✓. لا تغيير واجهة (الصناديق ديناميكية بنوع ecom وأيقونتها من p86).
- **النشر**: باكند فقط — backup: backups/p88_courier_wallets/

## p89 — نسخ احتياطي تلقائي يومي (2026-08-15)
- **قبل**: لا نسخ مجدولة — أي عطل في القرص = فقدان كل البيانات.
- **بعد**: scripts/daily_backup.sh يعمل يومياً 04:00 (cron) — mongodump مضغوط gzip لكل القواعد + backend/.env + frontend/.env + docker-compose.yml + yalidine_proxy.py في backups/daily/YYYY-MM-DD_HHMM/ مع احتفاظ 14 يوماً وسجل backup.log.
- **اختبار حي**: أول نسخة نجحت — mongo.archive.gz بحجم 9.1MB + كل الإعدادات ✓؛ cron مثبت ✓.

## p90 — بطاقة تسوية مستحقات شركات الشحن (2026-08-15)
- **بعد**: GET /api/ecom/shipping/settlements — لكل شركة: رصيد محفظتها (ما تدين به الآن) + عدد الطرود المسلمة وإجماليها + المرتجعات + صناديق التحويل المتاحة. بطاقة «تسوية مستحقات شركات الشحن» في تبويب الشحن (settlements-card): لكل شركة سطر برصيدها وزر «تم الصرف» (settle-btn-{courier}) يفتح نموذجاً: المبلغ (معبأ بالرصيد) + اختيار الصندوق الهدف + تأكيد → تحويل عبر /cash-boxes/transfer الموجود.
- **اختبار حي (NT-0011)**: النقطة ترجع المحفظتين (يدوية: طرد مسلم 2400 ✓ / يالدين ✓) والأهداف ✓.

## p91 — إشعار تيليجرام فوري عند كل طلب جديد (2026-08-15)
- **بعد**: store_settings.telegram_notify_new_order + notify_new_order في telegram_daily — عند أي طلب جديد (متجر عام أو يدوي في المركز) رسالة فورية: رقم الطلب + الإجمالي + الزبون والهاتف + الولاية + المحتوى. fire-and-forget لا يبطئ الطلب. مفتاح «إشعار فوري عند كل طلب جديد» (tg-instant-toggle) في بطاقة تيليجرام بإدارة المتجر.
- **اختبار حي**: استدعاء مباشر أنتج النص العربي الصحيح ✓؛ إنشاء طلب عبر API أطلق POST حقيقياً إلى api.telegram.org (404 للتوكن التجريبي = الوصلة تعمل) ✓؛ تنظيف ✓.

## p92 — خريطة مخاطر الولايات (2026-08-15)
- **بعد**: GET /api/ecom/analytics/wilaya-risk?days=90 — لكل ولاية: الطلبات/المُسلَّم/المرتجع/نسبة الإرجاع/مستوى الخطر (مرتفع ≥40%، متوسط ≥20%، منخفض، بيانات قليلة <3 نتائج). بطاقة «خريطة مخاطر الولايات» في تحليلات التجارة (wilaya-risk-card) بجدول ملوّن مرتب بالأخطر.
- **اختبار حي**: النقطة ترجع ولايات NT-0011 مع التصنيف الصحيح ✓.
- **النشر**: main.9a966bbb.js — backups: backups/p89..p92 (النسخ اليومي سكربت مضيف لا يُنسخ احتياطياً)

## p93 — إزالة صفحة حالة التكاملات القديمة من مسار يالدين (2026-08-15)
- **سؤال المستخدم**: «إدارة ومراقبة جميع التكاملات الخارجية» في /ecom-hub/shipping/yalidine — ما الغرض وهل تعمل؟ هي تعمل لكنها صفحة مراقبة سلبية قديمة (5 شارات مُعد/غير مُعد لـ Stripe/SendGrid/WhatsApp/Yalidine/Push) بلا أي إدارة فعلية.
- **بعد**: حُذف رابط «Yalidine» من القائمة الجانبية (الإدارة الحقيقية في «الشحن الموحَّد»)؛ المسار القديم /ecom-hub/shipping/yalidine يوجّه تلقائياً إلى /ecom-hub/shipping. صفحة حالة التكاملات تبقى في مكانها الصحيح /ecom-hub/channels/status.
- **النشر**: main.986b67d7.js — backup: backups/p93_yalidine_menu/

## p94 — نقل شركات الشحن من قنوات البيع إلى قسم الشحن (2026-08-15)

**الطلب**: yalidine / zrexpress / maystro في /ecom-hub/channels ليست في مكانها — مكانها مع الشحن.

**قبل**: SUPPORTED_CHANNELS في EcomChannelsPage.js خلط قنوات البيع بشركات الشحن (تظهر في شبكة الربط + قائمة التكاملات + قائمة الحوار). زر «الإعدادات» في بطاقة يالدين بصفحة الشحن كان يشير إلى /integrations/yalidine (مسار ميت بعد p93).

**بعد**:
- EcomChannelsPage.js: إزالة yalidine/zr/maystro من SUPPORTED_CHANNELS؛ قائمة التكاملات المُعدَّة تُرشّح kind===shipping (salesIntegrations) — لم يعد أي تكامل شحن يظهر في قنوات البيع.
- EcomShippingTab.js: بطاقة جديدة «ربط شركات الشحن» (couriers-card) تعرض يالدين/ZR Express/Maystro مع حالة الربط (مفاتيح محفوظة/محاكاة/غير مربوط) وشارة مُفعَّل؛ حوار إعدادات لكل شركة (courier-dialog): حقول المفاتيح (password، تُركِ الحقل فارغاً للإبقاء) + سعر الإرجاع + مفتاح التفعيل؛ حفظ عبر POST/PUT /ecom/integrations (لا تغيير في الباك إند).
- زر «الإعدادات» في بطاقة تكامل Yalidine يفتح الآن نفس الحوار (yalidine-settings-btn) بدل الرابط الميت؛ أُزيل استيراد Link غير المستخدم.
- الحزمة: main.d2531b68.js (نُشرت عبر cp -r دون حذف الحزم القديمة).
- اختبار حي: GET /ecom/integrations (NT-0011) → yalidine | kind=shipping | live | return_fee=0 → ستظهر في البطاقة الجديدة وتُخفى من قنوات البيع.

Backup: /opt/ntcommerce/backups/p94_couriers_to_shipping/

## p95 — دليل إعداد Webhooks العملاء المحتملين + توسعة شركات الشحن الجزائرية (2026-08-16)

**الطلب**: (1) خطوات إعداد Webhooks العملاء المحتملين (فيسبوك/تيك توك) في /ecom-hub/channels؛ (2) صفحة /ecom-hub/shipping/companies لا تعرض كل شركات الشحن الجزائرية.

**قبل**: بطاقة LeadWebhooksCard تعرض الرابطين وشارات HMAC وآخر العملاء دون أي شرح للإعداد. قائمة شركات الشحن 7 فقط. علاوة على ذلك: روابط الويبهوك العمومية /webhooks/{facebook,tiktok}-leads تكتب في القاعدة الرئيسية بينما GET /webhooks/leads يقرأ قاعدة المستأجر — أي أن العملاء القادمين فعلياً لن يظهروا في الواجهة أبداً (خلل قائم).

**بعد**:
- backend/shipping_loyalty_routes.py: ALGERIAN_SHIPPING_COMPANIES من 7 إلى 17 شركة (+نوست إكسبريس، أندرسون، مايلرز، إيكوم ديليفري، إيلوجيستيا، ياليتيك، DHD، كونيكسلوغ، كويوت إكسبريس، بريد الجزائر EMS) + أسعار تقديرية لكل شركة في calculate-rate + رفع حد to_list الإعدادات إلى 100.
- backend/ad_webhooks_routes.py: روابط جديدة مرتبطة بالمستأجر POST/GET /webhooks/facebook-leads/{tenant_id} و POST /webhooks/tiktok-leads/{tenant_id} تكتب عبر get_tenant_db في قاعدة المستأجر (العملاء + الزبائن + الإشعارات). الروابط القديمة بلا tenant_id تبقى تعمل (كتابة في القاعدة الرئيسية) للتوافق.
- frontend/EcomChannelsPage.js: بطاقة Webhooks العملاء المحتملين تعرض الآن الرابطين مع tenant_id، وقسم «📖 خطوات الإعداد» القابل للطي (webhook-guide / guide-facebook / guide-tiktok): فيسبوك 6 خطوات (تطبيق ميتا، Webhooks/Page، Callback+Verify Token، حقل leadgen، وسيط Make/Zapier لجلب field_data، FB_APP_SECRET، أداة الاختبار) وتيك توك 5 خطوات (حملة Lead Generation، Custom Webhook يرسل البيانات مباشرة، TIKTOK_APP_SECRET، Test Lead).
- اختبارات حية: POST tiktok-tenant → lead+customer في قاعدة NT-0011 ✓، GET /webhooks/leads يراه ✓، handshake فيسبوك يرفض رمزاً خاطئاً 403 ✓، فحص عبر الدومين العام ✓ (بيانات الاختبار حُذفت). GET /shipping/companies → 17 شركة ✓.
- الحزمة: main.b5bec3a1.js (cp -r دون حذف القديمة).

ملاحظة: FB_VERIFY_TOKEN/FB_APP_SECRET/TIKTOK_APP_SECRET غير مضبوطة في backend.env — الويبهوك يعمل بوضع التطوير حتى ضبطها.

Backup: /opt/ntcommerce/backups/p95_webhooks_guide_companies/

## p96 — ربط فيسبوك المباشر للعملاء المحتملين بدون وسيط (2026-08-16)
- ad_webhooks_routes.py: فصل الحفظ إلى _save_lead؛ إضافة _resolve_fb_leads — إشعار ميتا الأصلي (leadgen_id فقط) يُجلب تلقائياً من Graph API v21.0 باستخدام access_token المحفوظ في تكامل فيسبوك (قناة البيع) لنفس المستأجر؛ يدعم عدة leads في إشعار واحد؛ بدون توكن يُتخطّى مع تحذير. حمولات الوسيط (field_data) ما تزال تعمل.
- دليل فيسبوك في الواجهة حُدّث: الخطوة 4 أصبحت «احفظ Page Access Token بصلاحية leads_retrieval» بدل Make/Zapier.
- اختبارات حية: بدون توكن → تخطّي نظيف ✓؛ توكن وهمي → اتصال HTTPS حقيقي بميتا (OAuthException 190) ✓؛ حمولة مباشرة → lead+customer ✓ (نظّفت بيانات الاختبار).
- Commit a2840cf.

## p97 — مزامنة يالدين التلقائية الدورية (2026-08-16)
- backend/scripts/auto_sync_yalidine.py جديد: يمر على كل المستأجرين (saas_tenants)، لكل من لديه تكامل يالدين نشط يزامن الطرود المشحونة عبر نفس state machine (محاسبة كاملة: دخل المحفظة/عكس+رسوم/مخزون).
- cron على المضيف: 15 * * * * docker exec ntcommerce-backend-1 python3 /app/scripts/auto_sync_yalidine.py >> backups/yalidine_sync.log
- اختبار يدوي: tenants=2, synced=1 (bob) ✓ — بلا أخطاء.
- Commit b5db684.

## p98 — رسالة الزبون عند الشحن مع رابط التتبع (2026-08-16)
- ecom_order_service.py: رسالة shipped عبر واتساب تتضمن الآن اسم شركة الشحن + رقم التتبع + رابط التتبع الرسمي (يالدين: yalidine.com/suivi/?tracking= — ZR: zrexpress.dz/suivi ✓200 — مايسترو: maystro-delivery.com ✓200). الاستدعاء محمي من الأخطاء (لا يعطّل تغيير الحالة).
- اختبار بالتقاط الرسائل لأربع حالات (yalidine/zr/maystro/بدون شركة) — المحتوى صحيح ✓. تتطلب تكامل واتساب مضبوطاً (phone_number_id + access_token).
- Commit 8c35833.

## p99 — اقتراح أرخص شركة شحن لكل ولاية (2026-08-16)
- backend: GET /ecom/shipping/cheapest?wilaya=<name>&desk= — لكل تكامل شحن نشط سعر الولاية (يالدين من delivery_rates المسحوبة حقيقياً، البقية من ecom_courier_prices اليدوية) + أرخص شركة. PUT /ecom/shipping/courier-prices/{courier} لرفع جدول أسعار يدوي (upsert بالجملة).
- frontend: حوار الطلب (EcomOrderDetailDialog) يجلب الأرخص لولاية الطلب عند فتحه، يعرض سطر «💡 الأرخص لولاية X» مع المقارنة (cheapest-suggestion)، ويحدّد الشركة الأرخص تلقائياً في قائمة الناقل (قابل للتغيير).
- اختبارات حية: يالدين فقط (الأغواط 950/750 حقيقي) ✓؛ إضافة جدول ZR تجريبي أرخص → cheapest=zr ✓؛ desk=true → أسعار المكتب ✓؛ نظّفت بيانات الاختبار.
- الحزمة: main.c4975d61.js (تشمل أيضاً تحديث دليل p96).

## p100 — شبكة كشف الزبائن المُرجِعين عبر المتاجر (2026-08-16)
**الفكرة**: سمعة مشتركة لكل رقم هاتف عبر كل متاجر المنصة (عدادات مجمّعة فقط — بلا بيانات شخصية).
- backend: main_db.customer_reputation (مفتاحها الهاتف المُطبَّع): orders/delivered/returned/tenants. normalize_phone يوحّد +213/00213/بدون صفر.
- تغذية تلقائية: عند إنشاء الطلب (يدوي + متجر ويب) orders++، وعند shipped→delivered/refunded تُسجَّل النتيجة (استلام/إرجاع فعلي فقط).
- إنشاء الطلبات اليدوية: يُرفق doc.network_trust، والمُرجِع المتسلسل (return_rate ≥40% مع ≥2 نتيجة) يُصعَّد تلقائياً إلى «بانتظار تأكيد الزبون» + سطر في أسباب cod_risk.
- إصلاح خلل قائم: needs_review/awaiting_confirmation لم تكن في STATUS_TRANSITIONS — كانت الطلبات المصعَّدة تعلق بلا إمكانية انتقال. أضيفت للباك إند والواجهة معاً.
- endpoint: GET /ecom/customer-lookup?phone= → {trust: good/warn/risk/unknown, orders, delivered, returned, return_rate, tenants}.
- تيليجرام p91: سطر تحذير «⚠️ مُرجِع متسلسل» يُلحق بالتنبيه الفوري.
- الواجهة: شارة ثقة في حوار الطلب (customer-trust-badge) 🟢/🟡/🔴/⚪ + تحذير فوري عند إدخال الهاتف في حوار الطلب اليدوي (manual-phone-trust).
- Backfill: scripts/backfill_reputation.py — 13 طلباً تاريخياً من المستأجرين → 10 أرقام، ورقم واحد ثبت ظهوره في المتجرين معاً.
- اختبارات حية: lookup مع +213 طبّع صح ✓؛ رقم مزروع (3 إرجاع/4) → طلب جديد اصطعد لـ awaiting_confirmation مع network_trust ✓؛ الانتقال منها إلى cancelled يعمل ✓؛ نظّفت كل بيانات الاختبار.
- الحزمة: main.d4530382.js
Backup: /opt/ntcommerce/backups/p100_reputation/

## p101 — تأكيد الطلبات تلقائياً عبر واتساب قبل الشحن (2026-08-16)
- إعداد جديد store_settings.wa_confirm_enabled + مفتاح تفعيل في صفحة إدارة المتجر (wa-confirm-toggle) مع شرح الاعتماد على تكامل واتساب.
- إنشاء طلب متجر الويب: إن كان التفعيل شغالاً وتكامل واتساب مضبوطاً → الطلب يدخل مباشرة «بانتظار تأكيد الزبون» وتُرسل رسالة: «مرحباً X، استلمنا طلبك CODE بقيمة Y دج — ردّ بـ 1 للتأكيد أو 2 للإلغاء» (fire-and-forget).
- ويبهوك واتساب: ردود «1/نعم/ok/oui…» تؤكد أحدث طلب بانتظار التأكيد لنفس الرقم (مطابقة بعد normalize_phone)، و«2/لا/non…» تلغيه — عبر change_order_status فيسري كل شيء تلقائياً (الرد القالب للزبون، المخزون، المحاسبة). الردود لا تُسجَّل كـ leads.
- اختبار حي كامل: طلبان تجريبيان + رد «1» عبر ويبهوك ميتا-الشكل → confirmed ✓، رد «2» → cancelled ✓ (سجل التاريخ: «تأكيد/إلغاء الزبون عبر واتساب»). نظّفت كل بيانات الاختبار.
- الحزمة: main.31bc6051.js
Backup: /opt/ntcommerce/backups/p101_wa_confirm/

## p102 — ROAS الحقيقي + كاشف الحملات النازفة (2026-08-16)
- endpoint جديد: GET /ecom/analytics/campaign-roas?days=90 — لكل مصدر (utm_source أو «بدون تتبع»): طلبات/مُسلَّم/مُرجع/إرجاع%/إيراد مُسلَّم فعلي/ربح محقق/إنفاق/ROAS. الإنفاق يُلتقط من المصاريف الإعلانية ويُنسب للمصدر بالكلمات المفتاحية في العنوان (facebook/فيسبوك/tiktok/تيك توك/google/…). bleeding = إرجاع ≥40% مع ≥5 طلبات أو ربح سالب مع إنفاق.
- الملخص اليومي لتيليجرام (p84) يلحق الآن سطر «🔥 مصدر نازف — أوقف إعلانه» عند تجاوز مصدرٍ العتبة خلال 30 يوماً.
- الواجهة: بطاقة «📣 ROAS الحقيقي» في /ecom-hub/analytics (campaign-roas-card) بجدول كامل + شارة 🔥 نازف.
- اختبار حي: نفقة «إعلان ممول — facebook» (10,000 دج حقيقية) نُسبت تلقائياً → ROAS=0.5 (الإنفاق أعلى من المُسلَّم!) ✓؛ 6 طلبات تيك توك (4 مُرجعة) → نازف ✓؛ سطر تيليجرام ظهر ✓. نظّفت البيانات التجريبية.
- الحزمة: main.db5a86d2.js
Backup: /opt/ntcommerce/backups/p102_roas/

---

## p103 — التسوية الذكية + توقع التدفق النقدي (2026-08-16)

### قبل
- التسوية (p90) تعرض رصيد كل شركة فقط — بلا توقع للنقد القادم، وبلا طريقة لمطابقة كشف دفع شركة الشحن مع النظام (الفروقات تُكتشف يدوياً أو لا تُكتشف).

### بعد
- **Backend** (`routes/ecom/shipping_routes.py`):
  - `GET /ecom/shipping/cash-forecast` — لكل شركة شحن: owed_now (رصيد المحفظة) + in_transit (Σ(total−shipping_fee) للطُرود المشحونة) + delivery_rate تاريخي (delivered/(delivered+refunded)) + expected = in_transit × rate.
  - `POST /ecom/shipping/reconcile` — لصق أرقام التتبع من كشف الدفع (نص/قائمة، فواصل: مسافة/سطر/فاصلة/؛) → مقارنة case-insensitive مع الطلبات المسلّمة: matched / missing_in_statement (مع المبالغ و gap_amount) / unknown_in_statement. حارس 400 عند الإدخال الفارغ، 403 بلا توكن.
- **Frontend** (`pages/ecom/EcomShippingTab.js`):
  - سطر توقع داخل كل صف تسوية (forecast-line-{courier}): في الطريق + معدل التسليم + المتوقع تحصيله.
  - بطاقة «📄 مطابقة كشف شركة الشحن» (reconcile-card): أزرار اختيار الشركة + textarea (reconcile-input) + زر reconcile-btn + نتائج (reconcile-summary/gap/missing/unknown/perfect).

### اختبار curl
- cash-forecast: shipped 3500 دج × معدل 0.75 → expected 2625 دج ✓
- reconcile: كشف من 3 أرقام → matched 2، ناقص YDN-P103-C بمبلغ 1400 دج (gap_amount=1400)، مجهول YDN-P103-X ✓
- حارس فارغ 400 ✓ · بلا توكن 403 ✓ · تنظيف بيانات الاختبار ✓

### نشر
- main.9bf1823f.js — cp -r فقط، الحزم القديمة محفوظة.
- backup: /opt/ntcommerce/backups/p103_reconcile_forecast/

---

## p104 — إصلاح القائمة الجانبية على الهاتف (2026-08-16)

### قبل
- القائمة الجانبية على الهاتف تفتح بوضع الأيقونات فقط (w-16) لأن sidebarCollapsed الافتراضي true ويُحفظ في localStorage ويُطبَّق على الهاتف أيضاً — وشريط التوسيع مخفي على الهاتف (hidden md:flex) فيعلق المستخدم بلا عناوين.

### بعد
- `Layout.js`: حالة isDesktop عبر matchMedia("(min-width: 768px)") مع مستمع تغيير + `collapsed = sidebarCollapsed && isDesktop` — وضع الأيقونات أصبح للحاسوب فقط، وعلى الهاتف تظهر القائمة كاملة بالعناوين دائماً (23 موضع عرض حُوّل). سلوك الحاسوب لم يتغير إطلاقاً.

### نشر
- main.dfcc5e08.js — cp -r فقط. backup: /opt/ntcommerce/backups/p104_mobile_sidebar/

---

## p105 — P&L الحقيقي لكل منتج (2026-08-16)

### قبل
- التحليلات تعرض الإيراد وROAS لكل مصدر، لكن لا يوجد ربح/خسارة حقيقي لكل منتج بعد كل التكاليف.

### بعد
- **Backend** (`analytics_routes.py`): `GET /ecom/analytics/product-pnl?days=90` — لكل منتج: طلبات/مُسلَّم/مُرجَع/نسبة الإرجاع، الإيراد (من المُسلَّم فقط)، التكلفة (purchase_price × الكمية)، الشحن الموزَّع نسبياً على عناصر الطلب، كلفة الإرجاع، حصة الإعلان (توزيع نسبي حسب الإيراد)، صافي الربح والهامش %.
- **Frontend** (`EcomAnalyticsPage.js`): بطاقة product-pnl-card — جدول الربح الحقيقي لكل منتج مع تلوين الصافي (أحمر سالب/أخضر موجب) وتنبيه للإرجاع ≥30% والهامش <10%.
- **تنظيف**: مصروف 10000 دج متبقٍّ من اختبار p102 حُذف من قاعدة bob.

### اختبار curl
- cable: 6000 − 775 − 1500 − 666.67 = صافي 3058.33 (هامش 51%) ✓ · منتج ثانٍ: 3000 − 600 − 333.33 = 2066.67 ✓ · توزيع الإعلان 2:1 حسب الإيراد ✓ · بيانات الاختبار نُظّفت ✓

### نشر
- main.a1dbfb4d.js — backup: /opt/ntcommerce/backups/p105_product_pnl/

---

## p106 — التسعير الذكي المقترح (2026-08-16)

### قبل
- لا يوجد أي إرشاد لتسعير منتجات COD — التاجر يسعّر عشوائياً ثم يكتشف الخسارة بعد شهر.

### بعد
- **Backend** (`analytics_routes.py`): `GET /ecom/analytics/pricing-suggestions?days=90` — لكل منتج (≥3 طلبات منتهية): الكلفة الحقيقية للقطعة المُسلَّمة = سعر الشراء + (متوسط الشحن ÷ معدل التسليم) + حصة الإعلان لكل قطعة؛ السعر المقترح = الكلفة × 1.30 مقرَّباً لأقرب 50؛ الحكم: losing (السعر تحت الكلفة) / raise / ok / no_price.
- **Frontend**: بطاقة pricing-card في صفحة التحليلات — جدول بأعمدة السعر الحالي/معدل التسليم/الكلفة الحقيقية/المقترح/القرار مع شارات ملونة.

### اختبار curl
- منتج بسعر شراء 1000 ومعدل تسليم 50% وشحن 500 → كلفة حقيقية 2000، مقترح 2600 ✓ · سعر 2000 → raise ✓ · سعر 1500 → losing ✓ · منتج بأقل من 3 طلبات يُستبعد ✓ · بيانات الاختبار نُظّفت ✓

### نشر
- main.bc5a6374.js — cp -r فقط — backup: /opt/ntcommerce/backups/p106_smart_pricing/

---

## p107 — استرجاع السلات المتروكة (2026-08-16)

### قبل
- نظام p83 يلتقط هواتف من بدأوا الطلب لكن: (1) السلات الملتقطة لا تحمل حقل converted فلا تظهر إطلاقاً في القائمة ولا تُلغى تكرارها — خلل كامن؛ (2) لا يوجد أي إجراء استرجاع.

### بعد
- **إصلاح**: capture_cart_lead يضبط converted:false + reminder_sent:false عند الإدراج — السلات تظهر الآن وتُزال تكراراتها.
- **Backend**: GET /store/cart-leads يعيد أيضاً recovered (عدد السلات المسترجعة) · StoreSettings يضيف cart_recovery_enabled (افتراضي true) + cart_recovery_delay_hours (3).
- **سكربت cron جديد** scripts/cart_recovery.py (كل ساعة :25): لكل مستأجر فعّل الاسترجاع ولديه تكامل واتساب نشط → تذكير تلقائي بالسلات الأقدم من المهلة وغير المُذكَّرة، مع رابط المتجر، ثم reminder_sent=true.
- **Frontend** (StoreManagementPage): زر «💬 ذكّره واتساب» (wa.me جاهز برسالة معبأة — يعمل بدون API) + شارة «✓ ذُكّر تلقائياً» + عداد «استُرجعت X» في العنوان.

### اختبار
- التقاط سلة ×2 بنفس الهاتف → وثيقة واحدة (dedupe ✓) وتظهر في القائمة (الإصلاح ✓) · سكربت cron يعمل (tenants=2، تخطّى بلا واتساب) ✓ · تنبيه: ظهرت سلة حقيقية لزائر فعلي كانت مخفية قبل الإصلاح ✓ · بيانات الاختبار نُظّفت ✓

### نشر
- main.7748d550.js — cp -r فقط — backup: /opt/ntcommerce/backups/p107_cart_recovery/

---

## p108 — مركز اتصال للمؤكدين (2026-08-16)

### قبل
- تسجيل محاولات الاتصال موجود (p79) داخل تفاصيل الطلب فقط — لا توجد قائمة عمل تجيب: «من أتصل به الآن؟».

### بعد
- **Backend** (`orders_routes.py`): `GET /ecom/call-queue` — طلبات new/awaiting_confirmation/needs_review مرتَّبة بأولوية = عمر×2 + قيمة/1000 + بلا محاولات(+10) + بانتظار تأكيد(+8) + مراجعة(+8) + مُرجِع شبكة(+15) + 3+ محاولات(+10)؛ مع الأسباب وشارة عاجل (score≥30).
- **Frontend** (`EcomHubPage.js`): بطاقة call-queue-card أعلى صفحة الطلبات — هاتف (tel:)، واتساب (wa.me)، أزرار سريعة: لم يردّ / ✓ تأكيد / ✕ إلغاء (تمر عبر call-attempt → آلة الحالات تلقائياً).

### اختبار curl
- الترتيب بالأولوية ✓ (طلب حقيقي عمره 84 ساعة في القمة) · تأكيد سريع عبر call-attempt → الطلب غادر القائمة (new_status: confirmed) ✓ · بيانات الاختبار نُظّفت ✓

### نشر
- main.d97a3092.js — cp -r فقط — backup: /opt/ntcommerce/backups/p108_call_center/

---

## p109 — قاعدة «لا تشحن» الآلية (2026-08-16)

### قبل
- القائمة السوداء (p77) تعرض شارات تحذير فقط — يمكن إنشاء بوليصة شحن لمُرجِع متسلسل بلا أي مانع.

### بعد
- **Backend** (`shipping_routes.py` create_label): حارس «لا تشحن» قبل إنشاء أي بوليصة — يمنع (400 برسالة واضحة) إذا: الرقم في القائمة اليدوية، أو له ≥2 مرتجعات في المتجر، أو مُرجِع متسلسل عبر شبكة المتاجر (p100). استثناء طارئ: body.force=true. المطابقة عبر صيغ الهاتف المتعددة (خام/مُنظَّف/مُوحَّد 0xxx).
- **Frontend**: سطر توضيحي تحت زر الحظر في تفاصيل الطلب بأن الحظر يمنع البوليصة تلقائياً.

### اختبار curl
- حظر يدوي → منع ✓ · مرتجعان تلقائي → منع ✓ · زبون سليم → بوليصة أُنشئت ✓ · force=true → تجاوز ✓ · بيانات الاختبار نُظّفت ✓

### نشر
- main.3f8d6d64.js — cp -r فقط — backup: /opt/ntcommerce/backups/p109_do_not_ship/

---

## p110 — توليد صفحات الهبوط بالذكاء الاصطناعي (2026-08-16)

### قبل
- صفحات الهبوط (p82) تُملأ يدوياً — عنوان ونص عرض وسعر مرجعي.

### بعد
- **Backend** (`online_store_routes.py`): `POST /store/landing/{product_id}/ai-generate` — يولّد headline + offer_text + old_price من اسم المنتج ووصفه وسعره عبر services/ai/openai_llm.py (llm_chat، JSON صارم، حدود طول، old_price لا يقل عن السعر×1.4). لا يحفظ — التاجر يراجع ثم يحفظ. حارس 404 للمنتج، 503 بلا مفتاح AI، 502 عند ردّ غير قابل للفهم. يقبل hint اختيارية من التاجر.
- **Frontend** (StoreManagementPage): زر «✨ ولّد بالذكاء الاصطناعي» أعلى حوار صفحة الهبوط يملأ الحقول الثلاثة.

### اختبار
- توليد حقيقي على منتج «cable samsuge type c» (1200 دج): headline «كابل سامسونج Type-C أصلي.. شحن صاروخي لهاتفك!» + عرض + old_price 1800 ✓ · حارس 404 ✓ · لا كتابة في القاعدة ✓

### نشر
- main.6bbadde7.js — cp -r فقط — backup: /opt/ntcommerce/backups/p110_ai_landing/

---

## p111 — محفظة الدولار للإعلانات + إصلاح فهرس expense_number (2026-08-16)

### قبل
- المصاريف بالدينار فقط — الإعلانات تُشترى بالدولار من السوق بسعر مختلف كل مرة، فتُسجَّل الكلفة تقديرياً ويختلط ROAS.
- خلل كامن: فهرس unique غير sparse على expenses.expense_number (حقل لم يعد يُملأ) → ثاني مصروف يفشل بـ E11000.

### بعد
- **Backend** (`expenses_routes.py`):
  - ExpenseCreate يقبل currency=USD + exchange_rate — المبلغ يُدخل بالدولار ويُخزَّن بالدينار بسعر الشراء الحقيقي (amount_usd/exchange_rate تُحفظ للمرجع) → كل التحليلات (ROAS p102، P&L p105، التسعير p106) تعمل بالكلفة الحقيقية دون أي تغيير.
  - `POST /expenses/usd-purchase` — تسجيل شراء دولار بسعره، يخصم الإجمالي من الصندوق المختار (قيود transactions).
  - `GET /expenses/usd-wallet` — مشترى/مصروف/متبقٍّ + متوسط سعر المتبقي بطريقة FIFO + suggested_rate.
- **إصلاح**: فهرس expense_number أصبح sparse unique في قاعدتي المستأجرين — المصاريف المتتالية تعمل.
- **Frontend** (ExpensesPage): بطاقة محفظة الدولار (المتبقي + المتوسط) + زر «شراء دولار» (حوار بكمية/سعر/صندوق) + مبدّل عملة دج/$ في نموذج المصروف مع حقل سعر (يُملأ تلقائياً بسعر المتبقي) ومعاينة «= X دج كلفة حقيقية» + سطر «$X × rate» تحت المبلغ في الجدول.

### اختبار curl
- شراء 100$@240 ثم 50$@260 ✓ · مصروف 60$@245 → 14700 دج ✓ · FIFO: المتبقي 90$ بمتوسط 251.11 ✓ · بلا سعر → 400 ✓ · مصروفان DZD متتاليان بعد إصلاح الفهرس ✓ · بيانات الاختبار نُظّفت ✓

### نشر
- main.159e4d14.js — cp -r فقط — backup: /opt/ntcommerce/backups/p111_usd_wallet/

---

## p112 — صفحة الإعلانات بالدولار + منع الخصم المزدوج (2026-08-16)

### قبل
- /ecom-hub/ads سجّل الصرف الإعلاني بالدينار فقط ويخصم من الصندوق دائماً — بمعزل عن محفظة الدولار (p111).
- خطر محاسبي: مصروف USD مع «الدفع من: الصندوق» = خصم مزدوج (مرة عند شراء الدولار ومرة عند الصرف).

### بعد
- **Backend** (`expenses_routes.py`): مصروف currency=USD لا يخصم من أي صندوق إطلاقاً (لا عند الإنشاء ولا عند التعديل) — الخصم حدث عند usd-purchase.
- **Frontend** (`EcomAdsTab.js`): مبدّل «$ دولار (سكوار) / دج DZD» (الافتراضي دولار) + حقل سعر الصرف (يُملأ تلقائياً بسعر المتبقي) + معاينة الكلفة بالدينار + سطر رصيد المحفظة مع تحذير عند نقصه + إخفاء «الدفع من» للدولار + عرض «(X$ × rate)» في قائمة المصاريف.
- **Frontend** (`ExpensesPage.js`): إخفاء «مصدر الدفع» عند اختيار الدولار + سطر توضيحي «لا خصم مزدوج».

### اختبار curl
- مصروف USD بـ payment_method=cash → الصندوق ثابت (لا خصم مزدوج) ✓ · المبلغ يُخزَّن بالدينار بسعره ✓ · مسارات الصفحة (leads/usd-wallet) 200 ✓ · بيانات الاختبار نُظّفت ✓

### نشر
- main.30f07df8.js — cp -r فقط — backup: /opt/ntcommerce/backups/p112_ads_usd/

## p113 — منع تكرار الإيميل/اسم المنتج + إصلاح توليد الباركود (2026-08-16)

**الطلب**: منع تكرار الإيميل عند التسجيل، منع تكرار اسم المنتج، إصلاح مشكلة توليد الباركود.

### قبل
- `/auth/register` (simple_auth_routes) و `POST /users` (auth_users_routes): فحص تكرار حساس لحالة الأحرف + تخزين الإيميل كما كُتب → `Admin@x.com` و`admin@x.com` حسابان مختلفان
- `create_product`: فحص تكرار الاسم exact case-sensitive → التكرار يتسلل عبر اختلاف الحالة/الفراغات
- `GET /products/generate-barcode`: مسار article_code حتمي **بدون فحص uniqueness** → بيانات الإنتاج الفعلية: منتجان بنفس الباركود `2130001000032` + باركودات 14 خانة مشوهة — والمسار العشوائي يفحص `barcode` فقط دون `additional_barcodes`
- **جذر خفي**: endpoints التوليد الثلاثة (barcode/sku/article-code) **بدون أي auth dependency** → وسيط سياق المستأجر لا يعمل → الاستعلامات تضرب main_db بدل قاعدة المستأجر (الفحص كان يبحث في القاعدة الخاطئة أصلاً)

### بعد
- `services/auth_service.py`: `get_user_by_email` → `email_ci` (غير حساس للحالة) — يصلح login+register معاً
- `simple_auth_routes.py` register: تطبيع `strip().lower()` قبل الفحص والتخزين
- `auth_users_routes.py` POST /users: فحص `email_ci` + تخزين lowercase
- `products_routes.py` create_product: فحص تكرار مُطبَّع (trim + regex case-insensitive) على name_en و name_ar
- `generate-barcode`: دالة `_mk(num)` موحدة + `_is_free` يفحص `barcode` و`additional_barcodes`؛ مسار article_code يتدرّج (+1) حتى إيجاد باركود حر؛ تقييد num بـ 5 خانات (mod 100000) يمنع الباركودات المشوهة
- إضافة `Depends(get_current_user)` للمولدات الثلاثة → تفعيل سياق المستأجر + حماية

### اختبارات curl (كلها ✓)
- T1: `generate-barcode?article_code=AR0003` → `2130001000049` (تخطّى المكرر) | T2: عشوائي `2130001961005`
- T3: اسم منتج بحالة مختلفة → 409 | T4/T8b: إيميل موظف بحالة مختلفة → 400
- T5: SKU `SG-00006` (عدّ المستأجر) | T6: `AR0004` | T7: بلا توكن → 403
- T8: `Test.P113@Example.COM` خُزّن `test.p113@example.com` | T9: register بنسخة حالة من admin@ntcommerce.com → 400

### ملفات
- backend: services/auth_service.py, routes/simple_auth_routes.py, routes/auth_users_routes.py, routes/products_routes.py
- backup: /opt/ntcommerce/backups/p113_dedup_barcode/
- لا تغيير واجهة (backend فقط)

## p115 — لوحة التحكم: ديون اليوم + رأس المال (2026-08-16)
- /stats: +customer_debt_today(+count), supplier_debt_today(+count), supplier_debt_total (purchases.remaining اليوم / suppliers.balance)
- DashboardPage: «رصيد محفظة الزبون»→«رصيد ديون الزبائن»، بطاقة 2→«ديون الزبائن اليوم»، +بطاقة «ديون الموردين اليوم»، «إجمالي النقد»→«رأس المال»
- اختبار حي: دين زبون 777 + دين مورد 333 ظهرا بدقة ثم نُظّفا. backup: backups/p115_dashboard/

## p116 — صفحة المنتجات: أيقونة حذف فردي (2026-08-16)
- زر حذف أحمر لكل منتج (قائمة+شبكة) يعيد استخدام حوار الحذف الجماعي الموجود؛ التحديد المتعدد موجود مسبقاً (bulk-select-btn)
- تحقق: DELETE /products/{id} حذف+أرشفة deleted_products ✓ (id 81f93021). backup: backups/p116_products_delete/

## p117 — POS: إصلاح غلق الحصة + تكبير البحث (2026-08-16)
- **جذر العطل**: fetchSessionStats كانت تُستدعى فقط بعد إتمام بيع → sessionStats=null عند فتح صفحة جديدة → حوار الغلق يشترط currentSession && sessionStats → حوار فارغ بلا زر تأكيد
- الإصلاح: checkOpenSession يزرع stats افتراضية صفرية فوراً + زر «غلق الحصة» يحدّث الأرقام الحقيقية عند الفتح (fetchSessionStats)
- خانة البحث: h-9 text-sm → h-14 text-base (+أيقونة أكبر)
- أُغلقت حصة S003/26 العالقة منذ 2026-08-15 (مبيعات 5650) عبر اختبار حي للـ endpoint
- backup: backups/p117_pos_fixes/

## p118 — AI Chat: حذف المحادثات (2026-08-16)
- backend: DELETE /ai/chat/sessions/{id} (user-scoped) + DELETE /ai/chat/sessions (الكل) + title في قائمة الجلسات
- frontend: أيقونة حذف لكل محادثة + حذف المحادثة الحالية في الرأس + حذف الكل في الشريط
- اختبار حي: إنشاء→حذف ✓، 404 لغير موجود ✓، حذف الكل (11 محادثة قديمة) ✓
- backup: backups/p118_aichat_delete/

## p119 — التقرير اليومي الشامل (2026-08-16)
- backend: GET /reports/daily-full?date= — 5 أنشطة: POS (بدون مرآة webstore) / متجر إلكتروني (جديد+مُسلَّم اليوم عبر status_history+قيد التوصيل+ملغي) / شحن رصيد (count+amount+profit) / خدمات رقمية IPTV (completed+pending+by_type) / صيانة (استلام+تسليم+final_cost+قيد العمل) + مصاريف اليوم + رأس المال + إجمالي الدخل
- frontend: قسم «كل الأنشطة اليوم» بـ 6 بطاقات في /daily-report
- **تدقيق حسابي**: /stats=sales-stats=daily-full=4150 بعد حذف بيعة اختبار p108 متروكة (ECO-P108-2, 1500 دج)؛ sales-stats.today يدمج POS+متجر عمداً (p86) مع فصل store.* — لا تسريب
- backup: backups/p119_daily_report/

**الحزمة المنشورة: main.ddb76b31.js** (p115-p119)

## p120 — نظام الهوية الموحد العالمي (2026-08-16)

**الهدف**: الجميع (صاحب المنصة/مشترك/وكيل/موظف) يدخلون من /portal بإيميلاتهم دون أي تضارب حسابات أو قواعد.

### الجذر المكتشف
`tenant_user_directory` كان فارغاً تماماً وبلا فهارس — يُكتب فقط من employees_routes. موظفو POST /users **لم يكن بإمكانهم الدخول إطلاقاً**، ونفس الإيميل كان يمكن تسجيله كموظف في متجرين (تضارب توجيه صامت).

### التنفيذ
- `utils/identity.py` جديد: identity_registry {email*, kind: platform/agent/owner/employee, user_id, tenant_id} + assert_email_globally_free + register_identity + remove_identity + فهرس فريد email_1
- **نقاط الإنشاء الخمس كلها** تمر بالبوابة العالمية: POST /users، employee create-account، /saas/register (+فحص الوكلاء الجديد +تخزين lowercase)، إنشاء/تعديل الوكيل، /auth/register
- **المزامنة**: DELETE /users + delete-account + حذف الوكيل تنظّف السجل؛ تعديل إيميل الوكيل يتحقق ويحدّث
- **الدخول**: unified-login خطوة الموظفين تقرأ identity_registry أولاً (fallback للدليل القديم)؛ إعادة تعيين كلمة المرور كذلك
- **الهجرة**: scripts/identity_migration.py — 4 هويات (2 platform + 2 owner)، مرآة المالك تُتخطى، **صفر تضاربات**

### اختبارات حية (7/7 ✓)
1. موظف عبر /users → سُجّل عالمياً 2. **دخوله عبر unified-login نجح → /tenant/dashboard is_employee=true** (كان مستحيلاً قبل اليوم) 3. نفس الإيميل في متجر آخر → 400 «موظف في متجر آخر» 4. إيميل المالك → 400 5. إيميل المنصة → 400 «مستخدم المنصة» 6. تسجيل مشترك بإيميل موظف → 400 7. حذف الموظف → السجل نظّف نفسه

backup: backups/p120_identity/ — لا تغيير واجهة

## p121 — POS تخطيط صفحة واحدة بلا سحب (2026-08-17)
**قبل:** شبكة md:grid-cols-12 بأعمدة 2+3+7+2=14 → الاختصارات تلتف لسطر ثانٍ خارج الشاشة (يجب سحب الفأرة للوصول إليها).
**بعد:** 2(شريط جانبي)+4(عمود وسط)+6(سلة)=12. السلة أصبحت العمود الأيمن الثابت (md:col-span-7→6). الاختصارات انتقلت من نهاية الشبكة إلى أعلى العمود الأوسط مباشرة (shrink-0 ثابتة)، وقائمة المنتجات/الفليكسي وحدها تُسحب داخلياً عبر div#pos-middle-scroll (md:flex-1 md:overflow-y-auto). ملفات: POSPage.js, pos/POSCart.js, pos/POSShortcuts.js. نسخة احتياطية: backups/p121_pos_layout/. الحزمة: main.ddb76b31.js → main.14f5d25f.js.

## p122 — قوالب طباعة عصرية مع QR (2026-08-17)
**قبل:** لا قوالب مخصصة جاهزة؛ إيصال الصيانة المدمج يعرض «QR» كنص داخل مربع منقّط وليس رمزاً حقيقياً؛ لا نوع مستند «صيانة» في محرر القوالب.
**بعد:**
- lib/modernTemplatePresets.js (جديد): 3 قوالب عصرية جاهزة — فاتورة بيع +QR (رقم الفاتورة للتحقق)، بطاقة منتج +QR (باركود)، تذكرة صيانة +QR (رقم التذكرة للتتبع).
- CustomTemplatesTable: زر «قوالب عصرية جاهزة» (import-modern-templates-btn) يستورد الثلاثة دفعة واحدة عبر TemplateService.saveTemplate مع تخطّي الموجود مسبقاً؛ DOC_LABELS_MAP += repair.
- customTemplateRenderer: FIELD_BINDINGS += repair (11 حقل: ticket_number/customer_phone/device_brand...)، resolveField += حالات الصيانة، statusLabel += حالات التذاكر (received/in_progress/completed/delivered/cancelled).
- RepairTrackingPage.printRepairReceipt: أصبح async — يستخدم قالب الصيانة المخصص الافتراضي عند وجوده (buildCustomTemplateHTML)، وإلا الإيصال المدمج الذي استُبدل فيه مربع النص بـ QR حقيقي (canvas + qrcode@1.5.3 CDN مع طباعة بعد اكتمال الرسم ومهلة أمان 3 ثوانٍ).
- PrinterTab: onImported={fetchCustomTemplates}.
نسخة احتياطية: backups/p122_templates_qr/. الحزمة: main.14f5d25f.js → main.6499f406.js.

## p123 — اختبار استعادة أسبوعي حقيقي (2026-08-16)
**قبل:** خدمة restore_test.py (p33) لم تُشغَّل قط (platform_restore_tests = 0) والنسخ اليومية غير مثبتة القابلية للاستعادة.
**بعد:** scripts/weekly_restore_test.sh يستعيد أحدث أرشيف mongodump يومي حقيقي إلى قاعدة scratch داخل الحاوية (--nsInclude/--nsFrom/--nsTo لعزل الاستعادة عن القواعد الحية)، يقارن أعداد المستندات مع ما أبلغ عنه mongorestore نفسه من الأرشيف (ليس مع القاعدة الحية التي تنجرف بعد وقت النسخ)، يسقط الـ scratch، ويسجّل النتيجة في main_db.platform_restore_tests. **أول تشغيل: نجح — 163 مجموعة / 897 مستند / 0 اختلاف** من أرشيف 2026-08-16_0400. cron: كل أحد 05:00. ملاحظة: التشغيل اليدوي الأول كشف انحراف فهرس حقيقي (expense_number_1 sparse في الحي مقابل non-sparse في الكود) — لا يؤثر على الاستعادة لقاعدة جديدة.

## p124 — تنبيهات تيليغرام للمراقبة (2026-08-16)
**قبل:** health_monitor وdaily_backup وweekly_restore_test يكتبون ALERT في ملفات log فقط — لا يصل شيء لأحد.
**بعد:** scripts/alert.sh مرسل موحد يقرأ /opt/ntcommerce/.alert.env (TELEGRAM_BOT_TOKEN/CHAT_ID) ويرسل عبر Telegram Bot API؛ no-op صامت بدون الإعداد. رُبط في: health_monitor (عند ALERT)، daily_backup (عند فشل mongodump)، weekly_restore_test (4 مسارات فشل). bash -n سليم للكل. **التفعيل ينتظر توكن البوت من المالك.**

## p125 — تدوير الأسرار وتحصين JWT (2026-08-16)
**قبل:** أسرار JWT وُجدت في تاريخ git (commit قديم)؛ utils/auth.py فيه fallback ثابت مكشوف؛ .env بصلاحيات 644.
**بعد:** تدوير JWT_SECRET_KEY + JWT_SECRET + SECRET_KEY (openssl rand 48 بايت) — كل الجلسات القديمة أُبطلت (إعادة دخول مطلوبة). إزالة الـ fallbacks الثابتة من utils/auth.py وservices/auth_service.py — التطبيق الآن يرفض الإقلاع بدون JWT_SECRET_KEY (fail-closed). chmod 600 للـ .env. مفاتيح التشفير عند التخزين (CODE/FIELD_ENCRYPTION_KEY) لم تُدوَّر عمداً — تدويرها يعطّل البيانات المشفرة القائمة. GEMINI/AI keys يجب تدويرها من لوحات مزوديها (بند على المالك). تحقق: openapi 200 + endpoint محمي بتوكن جديد 200. نسخة: backups/p125_secrets/.

## p126 — رؤوس الأمان (2026-08-16)
nginx: HSTS (سنة + subdomains), X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy — في مستوى server + snippet /etc/nginx/snippets/ntc-security-headers.conf مضمَّن في كل location لها add_header خاص (قاعدة nginx: add_header في location يلغي الوراثة). تحقق حي: 5/5 رؤوس عبر Cloudflare + api/health 200.

## p127 — MongoDB Replica Set (2026-08-16)
**قبل:** standalone — لا transactions ولا oplog ولا PITR.
**بعد:** command: --replSet rs0 في compose + rs.initiate (host mongodb:27017) + MONGO_URL?replicaSet=rs0. الحالة PRIMARY(1). تحقق: openapi 200، البيانات سليمة (2 مستأجرين)، endpoint محمي 200، HTTPS 200. نسخة: backups/p127_replicaset/. ملاحظة تقنية: الأداة على السيرفر هي docker-compose (v5.3.1) وليست docker compose plugin.

## p128 — نسخة خارجية مشفرة (2026-08-16)
**قبل:** نسخ Mongo لا تغادر الـ VPS — احتراق السيرفر = ضياع كل شيء.
**بعد:** scripts/offsite_backup.sh (يومي 04:30): يشفّر أحدث mongodump بـ GPG AES256 (passphrase في /opt/ntcommerce/.backup_key بصلاحيات 600) ثم يرفعه عبر rclone إلى remote باسم offsite: — **الـ remote ينتظر بيانات التخزين السحابي من المالك** (حتى_then_ تُخزَّن المشفَّرة محلياً في backups/offsite_ready/ مع تنبيه). تحقق: أول نسخة مشفرة 9.1M + فك التشفير وgzip -t ناجحان. احتفاظ: 7 محلياً / 30 يوماً عن بُعد. rclone v1.75.0 مثبت.

## p129 — CI كامل (2026-08-16)
**قبل:** workflow واحد lint-only؛ الاختبارات لا تُشغَّل آلياً؛ حالة الحقيقية للسويت: 167 ناجح / 80 فاشل / 68 خطأ (اختبارات قديمة انجرفت بعد 122 مرحلة).
**بعد:** .github/workflows/ci.yml بخمس بوابات: ESLint + **بناء frontend إنتاجي** (يكشف كسر البناء قبل السيرفر) + ruff (قواعد كارثية) + **bandit** (الخطورة العالية تمنع الدمج) + **السويت الأخضر** tests/green_suite.txt = 6 ملفات تنجح 100% اليوم (59 اختباراً: auth, cashier blocks, repository, email x3). إصلاح بقية الـ 148 اختباراً المتدهورة مسجّل كدَين تقني.

## p130 — بيئة Staging منفصلة (2026-08-16)
docker-compose.staging.yml: backend-staging (127.0.0.1:8002) + mongodb-staging (RS rsStaging) + redis-staging على شبكة ntc-staging معزولة. الكود من نسخة git منفصلة /opt/ntcommerce-staging (يمكن تجربة أي فرع). البيانات بُذرت من نسخة الإنتاج اليومية. nginx vhost على :8443 (منفذ ضمن قائمة Cloudflare) مع noindex + رؤوس الأمان؛ UFW يقبل 8443 من نطاقات Cloudflare فقط (أُضيف لـ cf_ufw_sync.sh ليبقى دائماً). تحقق: https://nt-commerce.net:8443 → 200 + /api/health → 200.

## p125-fix — تصحيح تدوير الأسرار (2026-08-16)
اكتشف أثناء p130 أن التدوير الأول كتب في backend/.env (غير المستخدم من الإنتاج) بينما compose يقرأ /opt/ntcommerce/.env الجذري — أُعيد التدوير في الملفين معاً (بصمة جديدة، طول 96 hex) مع chmod 600 للاثنين. تحقق: prod openapi 200 + endpoint محمي بتوكن بالمفتاح الجديد 200 + fail-closed أثبت نفسه (staging رفض الإقلاع بمفتاح فارغ). الدرس الموثق: restart لا يعيد قراءة env_file — يلزم up -d لإعادة الإنشاء.

## p133 — تتبع الأخطاء الخلفية (2026-08-16)
general_exception_handler يحفظ كل استثناء غير معالج في main_db.system_logs (source=backend, type=exception, stack) مع dedup 5 دقائق (عداد occurrences) + إرسال تيليغرام مباشر عند ضبط TELEGRAM_ALERT_BOT_TOKEN/CHAT_ID.

## p134 — Dozzle سجلات مركزية (2026-08-16)
حاوية amir20/dozzle:v8 على 127.0.0.1:9999 --base /logs --auth-provider simple (users.yml بكلمة مرور bcrypt في /opt/ntcommerce/.dozzle_pass بصلاحيات 600). nginx يخدم /logs/ مع websocket upgrade. الوصول: https://nt-commerce.net/logs/ (admin). تحقق: 200 حي.

## p135 — APM-lite (2026-08-16)
middleware/apm.py: قياس زمن كل طلب في الذاكرة + تصريف كل 60 ثانية إلى main_db.apm_stats (count/avg/max/slow>2s/errors لكل route) + GET /api/system/apm (super admin). تحقق حي: 6+ مسارات متتبعة بأرقام فعلية.

## p136 — Runbooks (2026-08-16)
docs/RUNBOOKS.md: 5 سيناريوهات طوارئ (API down، Mongo down، قرص ممتلئ، استعادة من نسخة، تراجع frontend) + مرجع سريع.

## p137 — فحص OWASP ZAP baseline (2026-08-16)
الفحص الأول: 0 FAIL / 8 WARN — أبرزها غياب CSP. أُضيف Content-Security-Policy لـ snippets/ntc-security-headers.conf. إعادة الفحص: **0 FAIL / 58 PASS** والتحذيرات الباقية معلوماتية (cacheable content, SRI للـ CDN, COEP). التقرير: docs/security/zap_baseline_2026-08-16.log.

## p138-p140 — ecom-hub: معلومات الزبون + نوع التوصيل + صوت الطلبات + بطاقات KPI تفاعلية (2026-08-16)

### p138 — الولاية/البلدية/العنوان + نوع التوصيل (مكتب/باب المنزل)
- قبل: قائمة التأكيد (call-queue) تعرض الولاية فقط؛ لا يوجد حقل delivery_type في ecom_orders؛ لا يمكن تغيير نوع التوصيل.
- بعد:
  - backend/routes/ecom/orders_routes.py: call-queue يُرجع city + address + delivery_type؛ PUT /ecom/orders/{id} يقبل delivery_type (home|office، 400 لغيرها) ويزامنه إلى store_orders المتوأم.
  - backend/routes/online_store_routes.py: ecom_doc يحفظ delivery_type عند إنشاء طلب webstore؛ endpoint جديد PUT /store/orders/{id}/delivery-type مع مزامنة عكسية إلى ecom_orders.
  - frontend EcomHubPage: صف قائمة التأكيد يعرض ولاية·بلدية·عنوان + زرّا 🏠 باب المنزل / 🏢 مكتب؛ جدول الطلبات الموحَّد يعرض الولاية·البلدية + أيقونة نوع التوصيل.
  - frontend StoreManagementPage (/store orders): عمود الزبون يعرض الولاية·البلدية·العنوان؛ قائمة منسدلة لنوع التوصيل تحت حالة الطلب.
- اختبار curl: PUT ecom → 200 + mirror في store_orders ✓؛ PUT store → 200 + mirror في ecom_orders ✓؛ قيمة غير صالحة → 400 ✓ (الاتجاهان).
- backup: /opt/ntcommerce/backups/p138_ecom_delivery/

### p139 — إصلاح أصوات الطلبات الجديدة
- السبب الجذري: useEcomOrderNotifications لم يكن فيه أي صوت إطلاقاً، وكان يخرج مبكراً إن لم يكن إذن Notification ممنوحاً (لا polling أصلاً).
- بعد: رنين WebAudio ثنائي النغمة (playNewOrderChime) يعمل بغض النظر عن إذن الإشعارات؛ فكّ قفل AudioContext عند أول نقرة (سياسة autoplay)؛ التنبيه مُفعَّل افتراضياً (localStorage ecom_notif_enabled)؛ إشعار سطح المكتب يُرسَل فقط عند منح الإذن؛ زر التفعيل يعزف الرنين فوراً للتأكيد.

### p140 — بطاقات KPI قابلة للنقر
- قبل: البطاقات الأربع (طلبات اليوم / آخر 7 أيام / الإجمالي / جديدة) عرض فقط.
- بعد: النقر يفتح Dialog يعرض الطلبات المصفّاة (since=اليوم / since=7 أيام / الكل / status=new) عبر GET /ecom/orders، والنقر على طلب يفتح تفاصيله.
- النشر: release 20260816_203309، main.d212db89.js — تم التحقق علناً عبر curl.

## p141 — إصلاح أخطاء autoheal الحرجة (2026-08-16)
- السبب الجذري لـ PUT /api/shipping/settings/{company_id} → 500 E11000:
  1) فهرس tenant_id_1 الفريد على shipping_settings في قواعد المستأجرين حيث tenant_id=null دائماً → أول upsert ينجح وثانيها يصطدم.
  2) الـ upsert لا يولّد id → اصطدام id_1 على id:null.
- الإصلاح: حذف tenant_id_1 من (template_tenant + كل المستأجرين + ntcommerce)، إنشاء company_id unique sparse بدلاً منه؛ تعديل enhanced_remaining_indexes.py؛ endpoint يولّد id عبر $setOnInsert.
- تحقق: PUT yalidine/zr_express/maystro → 200 كلها ✓
- تحقق من بقية findings: labels-bulk 200 ✓، analytics/revenue 200 ✓، pull-rates 422 (يتطلب body — طبيعي) ✓، POST /api/expenses 200 ✓ — كلها مُصلحة سلفاً في p123/p132.
- backup: /opt/ntcommerce/backups/p138_ecom_delivery/*.bak

## p142 — تصفير النظام لأول استعمال حقيقي (2026-08-16)
- نسخة احتياطية كاملة قبل الحذف: /opt/ntcommerce/backups/pre_purge_20260816_205435/ (mongo_full.archive 28MB + env + nginx config) — تم التحقق بـ mongorestore --dryRun ✓
- حُذفت قواعد: tenant_1c16c29a (Nouacer Telecom), tenant_45e398b9 (bob), 3× ecomtest, exptest, rt2 — من الإنتاج والستيجنغ
- ntcommerce الرئيسية: 75 مجموعة معاملات/بيانات تجريبية مُسحت؛ أُبقي فقط: superadmin + saas_plans(3) + القوالب (whatsapp/invoice) + الكتالوجات المنصّية + currencies/tax_rates + system settings
- saas_counters أُعيد للصفر → أول مستأجر حقيقي يحصل NT-0001
- Redis FLUSHALL على البيئتين
- كلمة مرور superadmin أُعيد تعيينها (سُلّمت للمالك في المحادثة)
- تنظيف ملفات: baseline_p122 (819MB) + نسخ www_before_p38/44/46 (289MB) + أرشيفات المستأجرين المحذوفين + deleted_tenants + p29 + /tmp junk + docker images (51MB) + logs قديمة → المساحة 22G→20G
- تحقق بعد التصفير: تسجيل مستأجر جديد تجريبي نجح (NT-0001 + قاعدة من القالب الذهبي + كل الواجهات 200) ثم حُذف وأُعيد العداد للصفر
- autoheal: 0 findings، health_score=100

## p143/p144 — الأفكار الذكية: الـ backend (2026-08-16)
- routes/smart_routes.py جديد: 15 مسار /api/smart/* —
  (1) call-script/{order_id}: سكربت مكالمة تأكيد عربي بالذكاء الاصطناعي (openai_llm) مع بديل حتمي مرقّم + حقائق الزبون (تسليماته/مرتجعاته/ثقة الشبكة/المحاولات)
  (2) courier-scorecard + auto-dispatch: أفضل ناقل = السعر ÷ (0.5 + نسبة نجاح الولاية)، dry_run مدعوم، إنشاء البوليصة عبر create_label المجرّب
  (3) wa-bot/settings + log: بوت مبيعات واتساب (تفعيل/ترحيب/حد الاقتراحات)
  (4) cart-leak-analysis: نسبة الهجر + القيمة القابلة للاسترجاع + اقتراحات (عتبة توصيل مجاني / تذكيرات)
  (5) stock-forecast: سرعة البيع 14 يوماً → أيام النفاد + كمية إعادة الطلب + urgency (critical≤3، warning≤7)
  (6) competitor-watch: CRUD كامل + تنبيه فوري عند خفض المنافس سعره
  (9) wilaya-risk-map: خريطة مرتجعات الولايات (خاصة + شبكة المنصة مجهولة) — red≥30% amber≥15%
  (10) flash-day: GET/PUT + تقرير نهاية اليوم (طلبات + إيراد النافذة)
  (12) morning-report: تقرير صباحي عربي منطوق (مبيعات الأمس + المعلّق + أفضل منتج + مخزون حرج)
  (13) return-by-tracking: استرجاع بمسح QR البوليصة — refunded عبر آلة الحالات + إعادة مخزون + سجل ecom_returns_log
- webhooks_routes.py: بعد معالجة تأكيد/إلغاء p101 يُستدعى handle_wa_sales_bot (يبحث بالاسم/الباركود ويرد بمنتجات + رابط المتجر) قبل _upsert_lead
- main.py: تسجيل الراوترين في try-block مع طباعة "✅ Smart features router loaded"
- تحقق curl (مستأجر تجريبي): كل المسارات 200/400/404 متوقعة ✓ — LLM يعمل (سكربت مولّد فعلياً)
- backup: /opt/ntcommerce/backups/p143_smart/

## p145 — الأفكار الذكية: الواجهة + POS أوفلاين (2026-08-16)
- (11) POSPage.js: طابور أوفلاين — فشل الشبكة عند البيع يحفظ العملية في localStorage (pos_offline_queue) + شارة «بدون اتصال» + عداد المعلّق + مزامنة تلقائية عند عودة الاتصال وكل 60ث (إعادة محاولة بلاحقة -O عند رفض الخادم)
- (1) EcomHubPage: زر 🤖 سكربت في كل صف بقائمة الاتصال → حوار بالسكربت المولّد
- شريط «🧠 مساعد ذكي»: التقرير الصباحي + تنبيهات نفاد المخزون الحرجة + تحليل السلال المهجورة + الولايات الحمراء
- (2) EcomOrderDetailDialog: زر «⚡ إرسال تلقائي» بجانب إنشاء البوليصة + سطر نتيجة الاختيار
- (13) EcomShippingTab: حقل «استرجاع بمسح البوليصة (QR)» — تتبع/كود طلب → استرداد + إعادة مخزون
- (10/3/6) StoreManagementPage: بطاقة «أدوات ذكية» — تبديل Flash Day (+نسبة الخصم + تقرير)، تبديل بوت واتساب (+رسالة الترحيب)، مراقبة المنافسين (إضافة/تحديث سعر/حذف + حكم السعر)
- (10) PublicStorePage: شريط Flash Day + أسعار مخفّضة (الأصلي مشطوب) + السعر المخفّض يدخل السلة والطلب
- البناء: main.fc6441d9.js — كل العلامات اللاتينية التسع موجودة في الحزمة ✓ — النشر release 20260816_221907
- تحقق curl بعد النشر: 9×GET 200 ✓، flash-day تفعيل→ظهور عام في /api/shop→إيقاف ✓، wa-bot ON/OFF ✓، competitor-watch إضافة→تنبيه خفض→حذف ✓
- backup: /opt/ntcommerce/backups/p145_offline_pos/ + p145_frontend/

## p146 — حساب تجريبي دائم (2026-08-16)
- demo@nt-commerce.net (NT-0001) خطة Enterprise، علامة is_permanent_test=true في saas_tenants — يُستثنى من أي تصفير مستقبلي
- كلمة المرور في /root/DEMO_ACCOUNT.txt على الخادم (خارج git) وسُلّمت للمالك في المحادثة
- تحقق: tenant-login ✓، قاعدة tenant_83c323d4... (145 مجموعة من القالب الذهبي) ✓، ecom/products/sales/smart/dashboard كلها 200 ✓

## p147 — إصلاح ملاحة + مسح شامل للروابط (2026-08-16)
- علة 1: زر «شحن المحفظة» في /tenant/dashboard ينتقل إلى /wallet (غير موجود) — الصحيح /wallet-management. أُصلح في موضعين (TenantDashboardPage.js)
- علة 2: /tenant/dashboard بلا عنصر في القائمة اليمنى — أُضيف «لوحة تحكم المشترك» في قسم الرئيسية (Layout.js)
- مسح شامل (288 ملف JS): 143 مساراً في App.js، 106 عناصر قائمة — صفر روابط قائمة مكسورة، /wallet كان الهدف المكسور الوحيد في كل الكود (navigate + Link + template literals)
- بلا عنصر قائمة وبمبرر: صفحات عامة (/shop/*، /landing، /pricing، /portal...)، تحويلات alias (/shipping، /store، /loyalty...)، تبويبات ecom-hub الداخلية، مسارات بمعرّف (/products/:id)، /whatsapp و/products/add (تُفتح من داخل الصفحات)، /agent/dashboard (قائمة الوكيل)
- تحقق من الحزمة main.470dd403.js: wallet-management 9 (كانت 7)، tenant/dashboard 4 (كانت 3)، التسمية العربية المشفّرة موجودة — النشر release 20260816_235507
- backup: /opt/ntcommerce/backups/p147_nav_fix/

## p148 — تدقيق بطاقات KPI الشامل + إصلاح 5 علل حسابية (2026-08-17)
- مسح كودي: 124 ملفاً فيها بطاقات KPI، 44 صفحة KPI رئيسية — ربط كل بطاقة بنقطة النهاية المغذّية لها
- مسح نقاط النهاية: 265 مسار GET حياً (openapi) — 236 سليمة (200/204)، 29 مفسّرة وليست عللاً: 13×307 (شرطة مائلة)، 3×422 (معامل مطلوب: price-preview/check-slug/tax/report)، 8×403 (مسارات وكيل فقط)، 5×404 (مسارات بمعرّف فارغ)
- حقن بيانات مرجعية على الحساب التجريبي (منتج 1000/400 كمية 10، مبيعتان ×2000، مصروف 300) ثم تحقق رقمي — كشف 5 علل حقيقية:
  (1) stats_routes.py analytics/top-products: كان يمرر name_field="name" + revenue_mode="price_qty" (حقل $items.price غير موجود) → أسماء null وإيراد 0 — الإصلاح: product_name + total + sort total_revenue
  (2) stats_routes.py daily-full: ربح POS كان it.get("price") والحقل الصحيح unit_price → الربح سالب دائماً — الإصلاح: (unit_price أو price) − purchase_price × quantity
  (3) stats_routes.py daily-full: المصروفات تُطابخ date بنص يوم كامل بينما المخزّن ISO datetime → 0 دائماً — الإصلاح: مطابقة نطاق اليوم
  (4) main.py dashboard_sales_chart: مصروفات الرسم البياني كانت hardcoded 0 — الإصلاح: تجميع مصروفات حقيقي لكل يوم
  (5) main.py dashboard_alerts: مخزون منخفض كان يقرأ $stock/$min_stock (حقول غير موجودة) → يعلّم كل المنتجات بـ«(0)» — الإصلاح: $expr على quantity/low_stock_threshold مع إسقاط name_ar/quantity
- تحقق مباشر بعد الإصلاح: daily-full ربح 3200 (=4000−800 تكلفة) ✓ مصروفات 300/1 ✓ top-products «منتج اختبار KPI» 2000×2 ✓ alerts منتج واحد حقيقي «(8)» والمنتج السليم غائب ✓ sales-chart اثنين: مبيعات 4000 مصروفات 300 ✓
- تنظيف: حذف بيانات الاختبار (2 مبيعة KPI-TEST-1 + مصروف + منتجان) وتصفير كل cash_boxes — الحساب التجريبي عاد نقياً (مبيعات 0 منتجات 0 مصروفات 0)
- backup: /opt/ntcommerce/backups/p148_daily_full/ (main.py + stats_routes.py + reporting.py)

## p149 — المرحلة 1 من خطة المتجر: صور AI + باركود بالكاميرا + دفع إلكتروني لكل منتج + عائلات المتجر (2026-08-17)
- (9) صور AI: المكوّن AiImagePicker كان يعمل خلفياً لكن برسائل خطأ عامة — الآن: رسالة الخطأ الحقيقية من الخادم تظهر للمستخدم + زر جديد «توليد AI» بجانب «صور AI»
- endpoint جديد POST /api/ai/generate-product-image — سلسلة: نماذج صور Gemini ← OpenAI Images — يحفظ الناتج في static/uploads ويرجع /api/static/uploads/... — حالياً يرجع 503 برسالة عربية دقيقة (الحصة مستنفدة) ويُفعَّل تلقائياً عند فوترة المفتاح
- (2) مسح الباركود بالكاميرا: مكوّن جديد CameraBarcodeScanner (html5-qrcode، كاميرا environment، يدعم EAN/Code128/QR) — زر 📷 في: بحث POS (تطابق تام يضيف للسلة وإلا يعبّئ البحث)، حقل الباركود في إضافة/تعديل منتج
- (4) الدفع الإلكتروني لكل منتج: حقل allow_online_payment في المنتج (افتراضي true؛ كان ينسخ صريحاً في product_doc — أُضيف) + مفتاح online_payment_enabled في إعدادات المتجر + محدد طريقة الدفع في checkout العام (يُخفى الإلكتروني إن منعته أي منتجات في السلة) + تحقق خادمي في /shop/{slug}/order (400 برسالة عربية)
- (5) عائلات المتجر: visible_family_ids في إعدادات المتجر — /shop/{slug} يعرض اتحاد (المنتجات المختارة يدوياً ∪ منتجات العائلات المختارة) + واجهة chips في إعدادات المتجر
- اختبارات curl حية (8/8): إعدادات roundtrip ✓ منتج بعلم false ✓ اتحاد العائلة في المتجر العام ✓ طلب online مع منتج مانع → 400 ✓ cod → 200 ✓ بعد السماح online → 200 ✓ تنظيف كامل ✓
- الحزمة: main.cfee3800.js — 11 علامة لاتينية موجودة — النشر release 20260817_140457
- ملاحظة: التكرار في المنتجات يُفحص على name_en وأيضاً name_ar (اكتُشف أثناء الاختبار)
- backup: /opt/ntcommerce/backups/p149_stage1/

## p150 — المرحلة 2: شركات الشحن للمتجر + OCR فواتير الشراء (2026-08-17)

### قبل
- إصلاح خطأ بناء: تعليق `// p149,` ابتلع فاصلة في PublicStorePage.js:1118 → Syntax error (1119:8). أُصلحت الفاصلة وأُعيد البناء.
- demo tenant بدون store_slug (المتجر لم يُفعّل له أصلاً) — سلوك 404 على /api/shop/demo/* صحيح.

### التغييرات (منشورة سابقاً على القرص، هذا النشر للواجهة)
- Backend online_store_routes.py: store_shipping_companies في StoreSettings، GET /api/shop/{slug}/shipping-options?wilaya=&desk= (أسعار كل شركة من delivery_rates/ecom_courier_prices)، التحقق من الشركة server-side عند إنشاء الطلب (400 لشركة غير مفعّلة، السعر من قائمة الشركة لا من العميل).
- Backend purchases_routes.py: POST /api/purchases/scan-invoice — رفع صورة فاتورة شراء (base64 ≤8MB، jpeg/png/webp) → Gemini vision → JSON {supplier, invoice_number, date, items} + مطابقة منتجات/مورد.
- Frontend PurchasesPage.js: زر scan-invoice-btn (كاميرا/رفع) يملأ سلة الشراء تلقائياً.
- Frontend StoreManagementPage.js: shipping-companies-card (chips اختيار الشركات المعروضة).
- Frontend PublicStorePage.js: shipping-company-group — الزبون يرى الشركات والأسعار ويختار؛ قفل الشركة إذا حدّدها المنتج.
- Frontend Add/EditProductPage: shipping-provider-select لتحديد شركة شحن افتراضية للمنتج.

### بعد (اختبارات حية)
- GET /api/shop/{slug}/shipping-options → [{key:zr,label,price:400.0}] ✓
- طلب متجر بشركة zr برسوم مزيّفة=1 → التخزين delivery_fee=400.0 total=1400.0 ✓ (السعر من الخادم)
- طلب بشركة وهمية → 400 ✓
- POST /api/purchases/scan-invoice بفاتورة تجريبية → استخراج المورد/الرقم/التاريخ/3 عناصر بدقة ✓
- build main.244b1982.js — markers: scan-invoice-btn, shipping-company-group, courier-chip-, shipping-provider-select, ship-opt- ✓
- release 20260817_145515؛ https://nt-commerce.net/ 200 بالحزمة الجديدة ✓
- demo tenant نظيف: products 0, sales 0, orders 0, store_products 0 ✓

## p151 — المرحلة 3: فوترة الصيانة + الاستيراد الذكي (2026-08-17)

### التغييرات
- Backend repair_routes.py: POST /api/repairs/tickets/{id}/invoice — يحوّل تذكرة الصيانة إلى فاتورة بيع:
  القطع المستعملة (part_usage) تُضاف كعناصر دون إعادة خصم المخزون (خُصمت عند use-part)،
  سطر خدمة بسعر قابل للتعديل، خصم، دفع كلي/جزئي، ربط الزبون بالهاتف أو إنشاؤه تلقائياً عند وجود دين،
  ترقيم INV مشترك، تحديث cash_boxes + transactions، سجل repair_invoices، ربط التذكرة بالفاتورة (idempotent 400)،
  حدث sale.completed قناة repair. صلاحية repairs.edit.
- Backend import_export_routes.py: نقل EXPORTABLE_COLLECTIONS إلى module-level (إعادة استخدام، بلا تغيير سلوك — regression OK).
- Backend ai_routes.py: POST /api/ai/map-columns — مطابقة أعمدة ملفات برامج محاسبة أجنبية بالحقول عبر Gemini + heuristic fallback.
- Frontend RepairTrackingPage.js: زر "تحويل إلى فاتورة" (repair-invoice-btn) للتذاكر الجاهزة + حوار السعر/الخصم/الدفع + شارة رقم الفاتورة.
- Frontend ImportDataPage.js (جديد): معالج 4 خطوات — اختيار القسم، رفع CSV/Excel (تحليل xlsx محلياً)، مطابقة AI قابلة للتعديل، معاينة + استيراد append/replace عبر /api/data/import الموجود.
- App.js route /import-wizard + Layout.js عنصر "الاستيراد الذكي" في قسم الإعدادات.

### اختبارات حية (demo tenant)
- فاتورة صيانة: قطعتان 3000 + خدمة 500 = 3500، مدفوع 2000 → remaining 1500، status partial، source=repair ✓
- المخزون لم يُخصم مرتين (8 قبل وبعد) ✓ | زبون أُنشئ تلقائياً balance/total_debt=1500 ✓
- إعادة POST → 400 ✓ | cash box +2000 ومعاملة "صيانة - فاتورة" ✓ | التنظيف الكامل بعدها ✓
- map-columns: عناوين فرنسية/عربية أجنبية → مطابقة 6/6 صحيحة ai_used=true ✓
- import/customers regression: Imported 1 records ✓ (ثم حُذف)
- build main.b8c474e2.js markers كاملة؛ release 20260817_152303؛ الموقع 200 ✓

## p152 — المرحلة 4: الدومينات الخاصة للمتاجر (2026-08-17)

### المعمارية
- nginx يخدم أي Host عبر default_server — لا تعديل مطلوب.
- CORS: allow_origin_regex يقبل أي دومين https (المصادقة Bearer بلا كوكيز — خطر CSRF معدوم).
- TLS للدومين الخاص يتطلب إضافة Custom Hostname في لوحة Cloudflare (يدوياً حتى يزوّدنا المستخدم بـ CF API token — عندها تُؤتمت).

### التغييرات
- Backend online_store_routes.py: سجل custom_domains في main_db +
  GET/POST/DELETE /api/store/custom-domain + POST .../check (فحص DNS بـ getaddrinfo) +
  GET /api/shop/by-domain?host= (عام، يحوّل الدومين → store_slug، يدعم www، تفعيل تلقائي عند أول وصول).
  ملاحظة: /shop/by-domain سُجّل قبل /shop/{store_slug} (ترتيب المسارات).
  إصلاح: Request أُضيف للاستيراد العلوي (استيراد محلي كان يكسر التحميل → AUTO-SKIP).
- Backend main.py: allow_origin_regex=https أي دومين.
- Frontend App.js: CustomDomainStore — أي hostname غير nt-commerce.net يعرض متجر المشترك على / تلقائياً.
- Frontend PublicStorePage.js: prop overrideSlug.
- Frontend StoreManagementPage.js: بطاقة "دومين خاص بالمتجر" — إدخال/حفظ/فحص DNS/إزالة + تعليمات CNAME + شارة الحالة (بانتظار/جاهز/مفعّل).

### اختبارات حية (demo tenant، نُظّف بالكامل)
- تسجيل دومين (تطبيع https://www/… → host) → pending + تعليمات ✓
- by-domain?host= (بدون www) وجد سجل www.{h} → store_slug صحيح + تحوّل active ✓
- DNS check على دومين وهمي → resolved:false بأمانة ✓ | صيغة خاطئة → 400 ✓
- OPTIONS بأصل https://shop.example.dz → access-control-allow-origin مطابق ✓
- الموقع 200 بالحزمة main.626ec8e7.js — release 20260817_154559 ✓
- demo tenant: slugs 0, domains 0, settings 0, products 0, sales 0 ✓

## p153 — إصلاح دخول السوبر أدمن + ربط البريد وتنبيهات Telegram (2026-08-17)

### 1. دخول السوبر أدمن
- السبب: كلمة مرور خاطئة (محاولات فاشلة متراكمة في Redis bf_cnt) — لا خطأ برمجي.
- الإجراء: إعادة تعيين bcrypt hash + حذف الحقل القديم password + تصفير عدّاد القفل.
- تحقق: unified-login → user_type=admin role=super_admin redirect=/saas-admin token ✓

### 2. البريد الإلكتروني (تشخيص Resend)
- مفتاح Resend صالح (re_fH43q…) لكن: sender gmail مرفوض (403 domain not verified) + وضع الاختبار يسمح فقط لبريد مالك حساب Resend (nouaceramine017@gmail.com).
- مفتاح Brevo المخزّن ميت (401 Key not found) وكان preference=brevo → كل الإيميلات تفشل.
- الإصلاح: platform_settings → provider_preference=resend + sender=onboarding@resend.dev → إرسال تجريبي ناجح لبريد المالك ✓
- المتبقي (يدوي): توثيق nt-commerce.net في لوحة Resend + سجلات DNS في Cloudflare → sender=noreply@nt-commerce.net للإرسال للجميع.

### 3. تنبيهات Telegram عبر واجهة SaaS
- Backend email_settings_routes.py: GET/PUT /api/saas/alert-settings (platform_settings/_id=alert_settings، التوكن masked) + POST .../test (إرسال حقيقي مع تفاصيل خطأ Telegram) + GET /api/internal/alert-config (محمي بـ ALERT_INTERNAL_KEY في .env).
- scripts/alert.sh: fallback — إذا غاب .alert.env يجلب الإعداد من الـ API الداخلي (المصدر الآن واجهة SaaS).
- Frontend EmailSettingsPage.js: بطاقة "تنبيهات Telegram للمنصة" — توكن/Chat ID/حفظ/اختبار/شارة حالة + روابط BotFather وuserinfobot.
- ملاحظة تشغيلية: تعديل .env يتطلب docker-compose up -d backend (وليس restart) لالتقاط المتغيرات.

### تحقق
- internal/alert-config بمفتاح صحيح → {token,chat_id} فارغان (لم يُدخلا بعد) ✓ | بمفتاح خاطئ → 404 ✓
- build main.18965468.js markers كاملة؛ release 20260817_172246؛ الموقع 200 ✓

## p153b — توثيق دومين Resend + تفعيل المرسل الرسمي (2026-08-17)
- سجلات Hostinger (MX×2, SPF, DKIM×3 CNAME) مضافة من المستخدم ومتحقق منها عبر dig ✓
- سجلات Resend (DKIM TXT resend._domainkey, MX/TXT send) مضافة ومتحقق منها ✓
- Domain nt-commerce.net في Resend: status=verified (region eu-west-1) — فُعّل عبر POST /domains/{id}/verify
- platform_settings: sender_email=noreply@nt-commerce.net — إرسال تجريبي خارجي ناجح (gmail) ✓
- البريد الآن: استقبال يدوي عبر Hostinger (support@) + إرسال آلي للجميع عبر Resend (noreply@)

## p154 — إيميل المالك الحقيقي + تحقق بكود البريد عند الدخول (2026-08-17)
- users: superadmin@ntcommerce.com → nouaceramine017@gmail.com + two_fa_email_enabled=true (لا تعارض في users/saas_agents/tenants)
- auth_users_routes.py: مسار Email OTP في _2fa_gate — كود 6 أرقام (secrets)، صلاحية 10 دقائق، 5 محاولات، استخدام واحد، يُرسل عبر noreply@nt-commerce.net (Resend الموثّق)؛ login_verify_2fa يقارن compare_digest أو TOTP حسب نوع الطلب
- UnifiedLoginPage.js: رسالة الخادم («أرسلنا رمز تحقق إلى بريدك») تظهر في خطوة الرمز بدل نص تطبيق المصادقة
- اختبار e2e: دخول → requires_2fa method=email ✓ | كود خاطئ 401 ✓ | صحيح → توكن super_admin ✓ | إعادة الاستخدام 401 ✓
- release main.675f71a7.js ✓

## p155 — توحيد 2FA عبر البريد للوكلاء + وكيل تجريبي دائم (2026-08-17)

### قبل
- الوكلاء (saas_agents) يسجلون الدخول بكلمة مرور فقط — بدون تحقق ثنائي.
- لا يوجد حساب وكيل تجريبي لعرض لوحة الوكيل.

### بعد
1. **auth_users_routes.py** — فرع الوكلاء في unified-login: إضافة سطر واحد
   `agent["two_fa_email_enabled"] = True` قبل `_2fa_gate` ← كل الوكلاء (الحاليين والمستقبليين)
   يمرون إجبارياً برمز بريد 6 أرقام (TTL 10 دقائق، 5 محاولات، استخدام واحد) — بدون ترحيل بيانات.
2. **وكيل تجريبي دائم**: nouaceramine017+agent@gmail.com (gmail plus-alias ← الرموز تصل لبريد المالك)
   كلمة المرور: Agent@2026 — الاسم: وكيل تجريبي — نوع: reseller — صلاحيات كاملة — id: ea47eb2d-cc68-408a-a7b5-3240a6b580d7

### اختبار (curl/e2e عبر سكربت داخل الحاوية)
1. كلمة مرور خاطئة ← 401 + عداد المحاولات ✓
2. دخول صحيح ← requires_2fa + method=email ✓
3. الرمز موجود في pending_2fa_logins مع expires_at ✓
4. رمز خاطئ ← 401 ✓
5. رمز صحيح ← 200 + type=agent + redirect=/agent/dashboard ✓
6. إعادة استخدام الرمز ← 401 ✓

### نسخة احتياطية
/opt/ntcommerce/backups/p155_agents/auth_users_routes.py

## p156 — تأكيد بريد المشتركين الجدد برمز تحقق (2026-08-17)

### قبل
- التسجيل في /saas/register ينشئ الحساب ويدخل المشترك مباشرة دون أي تحقق من ملكية البريد.

### بعد
1. **registration_routes.py**:
   - tenant_doc يُنشأ بـ `email_verified: False`.
   - بعد التهيئة تُرسل رسالة رمز 6 أرقام (collection `email_verifications`، TTL 10 دقائق، 5 محاولات، حذف الرموز القديمة عند كل طلب).
   - الرد يتضمن `requires_email_verification: true`.
   - `POST /saas/verify-email` — تحقق compare_digest + عداد محاولات + تعيين email_verified.
   - `POST /saas/resend-verification` (محدود 3/دقيقة، رد عام ضد الاستكشاف).
   - `tenant_login` يرفض غير المؤكدين 403 (الحسابات القديمة بدون الحقل غير متأثرة).
2. **auth_users_routes.py**: نفس المنع في unified-login (فرع المستأجرين).
3. **RegisterPage.js**: خطوة ثالثة «تأكيد البريد» — لا يدخل المشترك لوحته قبل إدخال الرمز (testids: reg-verify-code-input/submit/resend).
4. **VerifyEmailPage.js** جديدة على /verify-email — مسار استرجاع لمن فقد الرمز (إدخال بريد+رمز+إعادة إرسال).
5. **App.js**: مسار /verify-email.

### اختبار (10/10 عبر سكربت داخل الحاوية)
تسجيل ← requires_verif ✓ | الحقل False ✓ | tenant-login محظور 403 ✓ | unified-login محظور 403 ✓ | الرمز في DB مع انتهاء ✓ | رمز خاطئ 400 ✓ | رمز صحيح 200 ✓ | الحقل True ✓ | الدخول بعد التأكيد 200 ✓ | إعادة الإرسال على حساب مؤكد: رد عام بدون إرسال ✓
الرسالة وصلت فعلياً إلى بريد المالك (plus-alias). مستأجر الاختبار حُذف بالكامل (وثيقة + قاعدة + identity_registry).

### نسخة احتياطية
/opt/ntcommerce/backups/p156_emailverify/ — النشر: release 20260817_192604

## p157 — إصلاح تجربة تأكيد البريد + حذف مشترك NT-0003 (2026-08-17)

### التشخيص
- حساب «Nouacer Telecom» (NT-0003) أُنشئ 19:32 والرمز أُرسل وسلّمته Gmail (last_event=delivered عبر Resend API) لكن attempts=0 — لم يصل أي رمز للخادم: البريد ضاع (سبام/تأخير) وانتهت صلاحية 10 دقائق قبل أن يجده المستخدم.
- الخادم والمسار العام والواجهة كلها سليمة (تحقق curl من الخارج: 200 verified).

### الإصلاحات
1. **TTL الرمز 10 → 30 دقيقة** (تسجيل فقط؛ 2FA يبقى 10) — registration_routes.py + نص البريد + نص الواجهة.
2. **إعادة إرسال تلقائية عند الدخول المحظور**: أي محاولة دخول لحساب غير مؤكد بلا رمز صالح ← يُرسل رمز جديد تلقائياً والرسالة تخبره (tenant_login + unified-login). لو يوجد رمز صالح لا يُرسل مكرر (منع إغراق).
3. **اسم المرسل**: From يصبح `NT Commerce <noreply@nt-commerce.net>` بدل العنوان المجرد (تحسين التعرف والتسليم) — email_service.py.
4. nginx: تحققنا أن index.html أصلاً no-cache — لا تعديل لازم.

### اختبار (6/6)
دخول محظور ← 403 + إرسال تلقائي ✓ | رمز بصلاحية 30 دقيقة ✓ | محاولة ثانية بلا إرسال مكرر ✓ | وثيقة واحدة فقط ✓ | تحقق ناجح ✓ | دخول موحد ناجح بعد التأكيد ✓ | سجل Resend يؤكد الإرسال بالاسم الجديد ✓

### حذف NT-0003 (كامل)
وثيقة saas_tenants ✓ | identity_registry ✓ | قاعدة tenant_e68d8464_… أُسقطت ✓ | لا بقايا (remaining=0). البريد nouacertelecom05@gmail.com حر لإعادة التسجيل.

### نسخة احتياطية
/opt/ntcommerce/backups/p157_verifyfix/ — النشر: release 20260817_194948

## p158 — حساب المالك NT-0004 غير محدود بكل المزايا (2026-08-17)

- المستأجر «Nouacer Telecom» (nouacertelecom05@gmail.com، short_id NT-0004، id a24f0b7e-…) — المتجر الحقيقي لمالك المنصة.
- plan_id ← Enterprise (المؤسسات).
- features_override: has_woocommerce=true (العلم الوحيد الناقص في Enterprise) → كل الأعلام true.
- limits_override: max_products/users/warehouses = -1 (غير محدود).
- is_trial=false، subscription_ends_at=2099-12-31 (بلا انتهاء)، subscription_type=yearly.
- notes توثيقية على الوثيقة.
- تحقق: effective features كلها مفعّلة، disabled=NONE، limited=NONE.
- ملاحظة: المزايا تُحمَّل عند تسجيل الدخول — يلزم خروج/دخول لتظهر كل القوائم.

## p159 — استيراد قاعدة BDV10 كاملة إلى مشترك المالك NT-0004 (2026-08-17)

### المصدر
BDV10.dblx (Microsoft Access، 46MB، نسخة حديثة من حاسوب المالك بتاريخ اليوم) عبر Google Drive → فك RAR → mdbtools export لكل الجداول الـ58 → TSV.

### المستورد إلى tenant_a24f0b7e_… (كل وثيقة موسومة import_source="BDV10" + legacy_id)
| البيان | العدد |
|---|---|
| عائلات المنتجات | 84 |
| عائلات الزبائن | 6 |
| المنتجات (اسم/كود/باركود/شراء/تجزئة/4 تعريفات/مخزون) | 7,415 |
| الزبائن | 192 |
| الموردون | 111 |
| المبيعات (منها 855 إرجاعاً) | 36,695 |
| بنود المبيعات | 51,172 |
| المشتريات (+4 أرصدة افتتاحية موردين) | 1,357 |
| بنود المشتريات | 10,093 |
| الحصص اليومية | 1,422 |
| عمليات الجرد (بـ10,367 بنداً) | 126 |
| حركات تسوية المخزون | 7,435 |
| سدادات ديون مخصصة FIFO | 1,735 (1,613 زبون + 122 مورد) |

### نموذج الديون الأمين
- دين الفاتورة = CreditAccount؛ المدفوع = Total − CreditAccount
- AccountPayment وقيم الإرجاعات السالبة تُخصم FIFO من أقدم الفواتير المفتوحة (debt_payments موثقة)
- رصيد الزبون/المورد = مجموع المفتوح بعد التخصيص، ثم فُرض ليطابق BDV Account حرفياً (17 زبوناً + 3 موردين كان فيهم فرق داخلي في النظام القديم — وثّقوا في import_report.json)
- عائلات الموردين غير موجودة أصلاً في قاعدة المصدر (لا جدول SupplierFamily)
- المخزون الحالي من Item.Stock مباشرة — المبيعات/المشتريات المستوردة تاريخية ولا تُحرك المخزون ولا الصناديق

### التحقق (bdv_verify_p3.py — كل الفحوصات ناجحة)
أعداد كل المجموعات ✓ | Σ الكميات 13,498.36 ✓ | قيمة المخزون 15,094,930.41 دج ✓ | Σ المبيعات 669,663,395.19 دج ✓ | حفظ الدين (مفتوح+مسدد=203,389,031) ✓ | الباركود 672 ✓ | Σ المشتريات 494,406,852.45 دج ✓ | أرصدة الزبائن 1,811,238.21 والموردين 8,714,532 ✓ | فحص عشوائي بند-ببند ✓ | اختبار API لكل الشاشات 200 ✓

### النسخ الاحتياطية
/opt/ntcommerce/backups/p159_bdvimport/ (mongodump قبل الاستيراد + TSV المصدر + السكربتات + التقرير)

## p160 — Unified tenant dashboard (2026-08-18)
**Request**: merge the 3 tenant dashboards (لوحة التحكم /, لوحة تحكم المشترك /tenant/dashboard, لوحة التحكم الذكية /smart-dashboard) into ONE page without duplications.
**Backup**: /opt/ntcommerce/backups/p160_dashboard/ (6 files)
**Changes**:
- pages/SmartDashboardPage.js: extracted SmartDashboardContent (no Layout wrapper; bare-spinner loading); default export now thin Layout wrapper (backward compat)
- pages/DashboardPage.js: imports SmartDashboardContent, renders it before DashboardCustomizer dialog → single unified dashboard at /
- components/Layout.js: removed /tenant/dashboard + /smart-dashboard menu entries (home section now has only /)
- config/sidebarMenu.js: removed smart-dashboard item (canonical menu mirror)
- App.js: /tenant/dashboard and /smart-dashboard → <Navigate to="/" replace>; DashboardRouter no longer redirects tenants to /tenant/dashboard; removed unused imports
- pages/UnifiedLoginPage.js: tenant/tenant_admin post-login target /tenant/dashboard → /
**Tests**: build Compiled with warnings (source-map noise only); live main.704bee88.js — menu labels 'Tableau abonné'/'Dashboard Intelligent' = 0 hits, legacy paths present only as redirect routes; API smoke (owner tenant JWT): /ai/financial-health, /ai/insights, /ai/daily-summary, /ai/forecast/revenue all 200; https://nt-commerce.net/ + /tenant/dashboard + /smart-dashboard all 200 on new bundle
**Deploy**: release 20260818_082911 via scripts/deploy.sh (rollback available)

## p160-hotfix — ReferenceError: Can't find variable TenantDashboardPage (2026-08-18 09:08)
**Bug**: previous release removed the component imports but left stale route elements referencing TenantDashboardPage/SmartDashboardPage → runtime crash on load.
**Fix**: App.js route block replaced with <Navigate to="/" replace /> redirects for /tenant/dashboard and /smart-dashboard.
**Tests**: live main.2370959c.js — TenantDashboardPage=0, SmartDashboardPage=0 refs; /, /tenant/dashboard, /smart-dashboard all 200.
**Deploy**: release 20260818_090818 via scripts/deploy.sh

## p162 — Barcode-linked search + POS server search + real capital + orders auto-refresh (2026-08-18)
**Backup**: /opt/ntcommerce/backups/p162_search_pos/ (products_routes.py, POSPage.js, POSSidebar.js, stats_routes.py, DashboardPage.js, EcomHubPage.js)
**p162a — barcode search everywhere**: products_routes.py — added additional_barcodes regex to /products search, /products/paginated search, /products/quick-search $or; projection now returns additional_barcodes; sort_key ranks exact barcode/alias/article_code first
**p162b — POS search across full DB**: POSPage.js — search effect = instant local filter + debounced (250ms) server quick-search (race-guarded), barcode scanner Enter falls back to server lookup when product not in locally loaded 1000; grid filter includes additional_barcodes
**p162c — real capital algorithm**: stats_routes.py /stats + daily-report — capital = Σ(purchase_price × quantity) [stock_value] + Σ cash_boxes excl. personal − today's expenses NOT charged to any box (boxed expenses already reduced balances — no double count; USD expenses excluded — deducted at purchase). Response adds stock_value, unboxed_expenses_today, capital. DashboardPage capital card now shows stats.capital
**p162d — ecom orders auto-appear**: EcomHubPage.js — silent refresh (orders+summary) every 20s, skips when tab hidden, no spinner (StoreManagementPage already had it)
**Tests**: quick-search exact barcode=1 hit, alias barcode=1 hit w/ aliases in payload, name search=57; /products?search=<alias>=1; /api/stats capital=15,327,181.80 (stock 15,327,181.80 + boxes 0 − unboxed 0); openapi: verify-email, resend-verification, quick-search, stats LIVE; bundle main.f3f46a1b.js — quick-search, document.hidden, capital-card, additional_barcodes present; TenantDashboardPage=0
**Deploy**: release 20260818_100522
**Audit (7 days)**: demo agent active in saas_agents (5 perms); p155 2FA line present; email verification endpoints live (all 4 tenants verified=True); owner NT-0004 Enterprise+override; BDV10 import intact (7,415 products, 36,695 sales, 1,357 purchases, 1,422 sessions, 126 counts, 7,435 movements, 1,735 debt_payments); p160 unified dashboard live

## p163 — POS search results fill sidebar as large cards (2026-08-18)
**Problem**: POS search box cramped in narrow col-span-2 sidebar (icons only visible), results as small dropdown — user could not search products to add to cart.
**Fix (user-chosen option 1)**: POSSidebar.js — while typing, the مهام البيع card switches to نتائج البحث mode: large clear product cards (bold name, code/barcode, bold price, stock badge), one tap adds to cart + toast; ✕ clears search; empty state keeps create-product link; old small dropdown removed; decorative Barcode icon removed (more input room); sidebar widened col-span-2→3, middle column 4→3; POSPage server search limit 12→20
**Backup**: /opt/ntcommerce/backups/p162_search_pos/ (POSSidebar.js, POSPage.js)
**Tests**: esbuild JSX parse OK; bundle main.540097e0.js — pos-search-results-list=1, pos-search-clear-btn=1
**Deploy**: release 20260818_104811

## p164 — POS column rearrangement per user sketch (2026-08-18)
**Change**: POS grid columns reordered — [search sidebar 3] [middle 6: sell-card + QuickFlexy above the cart] [shortcuts pad 3 to the RIGHT of the cart]. POSCart wrapped in flex-1 filler; POSCart root gained flex-1. Mobile stacks: cart column then shortcuts.
**Backup**: /opt/ntcommerce/backups/p164_poslayout/
**Tests**: esbuild parse OK; bundle main.094cc78e.js — pos-shortcuts-col=1, pos-cart-wrap=1
**Deploy**: release 20260818_125820

## p164b — POS layout exact match to user sketch (2026-08-18)
**Changes**: POSSidebar search card = input only (removed family chips + add-product button + family dropdown logic); POSCart accepts children + onAddProduct — blue '+ إضافة منتج' button at end of cart header row; sell-card + QuickFlexy moved INSIDE the cart column between header controls and items table (pos-flexy-strip); shortcuts remain separate column right of cart (p164)
**Backup**: /opt/ntcommerce/backups/p164_poslayout/
**Tests**: esbuild parse OK x3; bundle main.93d00754.js — pos-add-product-btn=1, pos-flexy-strip=1, pos-shortcuts-col=1
**Deploy**: release 20260818_131406

## p164c — POS one-screen layout (2026-08-18, release 20260818_135235)
**Before**: session bar was a separate full-width row under the header; QuickFlexyPanel used 4+ rows (h-10 inputs, separate payment row); cart items table started too low → page required vertical scroll.
**After**:
- QuickFlexyPanel.js: new `compact` prop — flexy mode collapses to 2 rows (row1: phone flex-1 h-8 + amount w-20 h-8 + send h-8; row2: quick-amount chips h-7 + الدفع نقدي/آجل + conditional credit customer select inline). Payment row hidden in compact flexy mode (merged). Recent list tighter (pt-1). Idoom mode unchanged.
- POSSessionBar.js: new `compact` prop — removes mb-2, CardContent p-1.5.
- POSPage.js: POSSessionBar(compact) merged into the page header row between title/badges and the total box (standalone row removed); flexy strip = narrow vertical sell-card button (pos-sell-card-btn) + compact panel side-by-side (flex items-stretch).
**Verification**: esbuild syntax OK ×3; bundle main.a0a561ac.js contains pos-sell-card-btn, quick-flexy-panel, pos-flexy-strip, pos-shortcuts-col, flexy-phone-input, pay-credit, credit-customer-select, compact.

## p165 — Recharge/IPTV journaling + SIM offers + scale support (2026-08-18, release 20260818_162440)
**Before**: cash recharges never appeared in the sales journal (only credit ones did); IPTV subscriptions appeared nowhere (no sale row, no cashbox, no session counters); SIM slot balances existed but were invisible in POS and excluded from capital; no scale support; no SIM-card offer/activation workflow.
**After**:
- Backend:
  - recharge_service.py: cash recharges now also insert a sales row (type recharge_cash, purchase_price=cost so profit = commission) with full saga rollback.
  - digital_panel_routes.py: create_subscription journals a sales row (type digital_subscription, purchase_price=cost), cash box + transaction for cash, customer debt mirror for debt, daily-session counters (failure logged, subscription kept).
  - sim_routes.py: GET /sim/balances (require_tenant) — platform wallet + SIM slots + bonus totals; default slots gain bonus_balance/empty_sims/sim_unit_cost.
  - NEW routes/recharge/sim_offers_routes.py: offers CRUD (/sim/offers[/all]) + POST/GET /sim/activations — profit = sale_price + bonus − offer_value − sim_cost; deducts offer_value from operator SIM balance, adds bonus to bonus_balance, decrements empty_sims (blocks at 0), journals sale (purchase_price = offer_value+sim_cost−bonus), cashbox/debt, session counters, balance logs, full rollback.
  - stats_routes.py: capital += flexy/IPTV platform wallet + Σ SIM (balance+bonus) + Σ empty-SIM stock value; response gains flexy_wallet_balance/sim_balance_total/sim_stock_value; daily-full report: POS section excludes service-sale types (fixes old recharge_credit double-count), digital section gains subs_* (IPTV), new sim_activations section, same capital formula, total_revenue includes IPTV subs + SIM activations.
  - catalog.py/trading.py: product sold_by_weight + scale_plu fields; quantities float (kg decimals).
  - products.py: quick-search matches scale_plu, projects scale fields, ranks exact PLU first.
  - pos_settings_routes.py: GET/PUT /pos/scale-config (prefix/plu/weight digits/decimals).
- Frontend:
  - QuickFlexyPanel: balances row (wallet + SIMs incl. bonus) refreshed after every op; new "شريحة" tab — operator chips, offer chips, editable offer-value/sale-price/bonus/cost, live profit preview, cash/credit + customer, submit → /sim/activations.
  - POSPage: scale barcode parsing in scanner path (prefix+PLU+weight → add with kg quantity); sold_by_weight products open a weight-entry dialog; all add paths routed via addProductSmart.
  - Add/EditProductPage: "يُباع بالوزن" switch + PLU input (vente tab).
  - SimManagementPage: empty-SIM stock + unit cost per slot, bonus display, new "عروض التفعيل" tab (CRUD).
  - SettingsPage: new "الميزان" tab (ScaleTab) for scale barcode config.
**Verification**: curl — /sim/balances ✓, /sim/slots defaults ✓, offer CRUD ✓, activation (offer 2500/bonus 500/sale 2300/cost 100 → profit 200, slot 5000→2500+500 bonus, stock 10→9, sale row, cashbox +2300) ✓, IPTV sub (price 500 cost 0 → sale row + cashbox) ✓, /stats capital includes wallet+SIMs+SIM stock ✓, daily-full sections ✓, /pos/scale-config ✓. Test data fully reverted after verification. Bundle markers verified (main.3eefc87a.js + ScaleTab chunk 236.bac5138e).

### p165-hotfix (2026-08-18, release 20260818_165751)
POS crashed with "Cannot access lexical declaration before initialization" — addProductSmart useCallback was declared AFTER the barcode-scanner useEffect that lists it in its deps (TDZ). Moved the helper block above the scanner effect. Bundle main.fe2d3591.js.

## p166 — Telecom stock hub: cards/SIMs/transfers + IPTV prepaid panel (2026-08-18, release 20260818_180243)
**Before**: no stock tracking for physical scratch/idoom cards; no way to buy empty SIMs through the system; no SIM↔SIM/wallet balance transfers; no SIM topup from a cash box; IPTV cost could only be debited from the platform wallet (pay-per-sale); card stock/panel balance absent from capital and daily report.
**After**:
- Backend:
  - NEW routes/recharge/card_stock_routes.py (auto-registered): card types CRUD (/cards/stock), POST /cards/purchase (تموين — weighted-average unit_cost, cash box −= total + expense transaction + card_purchases log), POST /cards/sell (atomic stock guard, sales row type card_sale with purchase_price=unit_cost → exact profit, cash box/customer debt mirror, daily session, full rollback), GET /cards/purchases.
  - sim_routes.py: POST /sim/purchase (empty SIMs per slot, weighted-avg cost, cash box), POST /sim/slots/{id}/topup (cash box → SIM balance + balance log), POST /sim/transfer (1:1 slot↔slot, slot↔platform wallet with atomic source guard + compensation + audit logs).
  - digital_panel_routes.py: prepaid IPTV panel balance (db.digital_panel_balance) — GET /digital-panel/panel-balance, POST .../topup (cash box → asset), GET .../transactions; create_subscription accepts cost_source=panel (debits prepaid balance instead of wallet, blocks when insufficient, refund on failure).
  - stats_routes.py: capital += card stock value (Σ qty×unit_cost) + iptv_panel_balance; daily-full gains cards section (count/revenue/profit), excludes card_sale from POS section, total_revenue includes card sales; /stats response gains card_stock_value + iptv_panel_balance.
- Frontend:
  - NEW pages/TelecomStockPage.js (/telecom-stock, menu item مخزون الشحن under خدمة شحن رصيد الجوال): summary strip (wallet/SIMs/card stock/empty SIMs), tabs — cards (CRUD + تموين + sell with profit preview), empty SIMs purchase per operator, transfers + SIM topup.
  - QuickFlexyPanel: new كروت mode — card chips with live stock, qty/price, profit preview, cash/credit sale.
  - IptvSubscriptionsPage: panel balance chip + topup dialog; cost_source select (محفظة المنصة / رصيد البانل المسبق) on new subscriptions.
**Verification**: curl — card CRUD ✓, تموين weighted avg (10@460 + 10@480 → avg 470) ✓, sell 2@500 → profit 60, invoice CARD00001/26, oversell blocked ✓, stats card_stock_value 8460 ✓; sim purchase/topup/transfer + insufficient-balance guards ✓; panel topup 2000, subscription cost_source=panel (balance 2000→1500, profit 300), insufficient guard ✓; daily-full cards section {count 1, revenue 1000, profit 60} ✓. Test data reverted (note: owner made a real SIM activation SIM00001 +2000 and reset the cash box mid-testing — his data preserved; a cleanup overreach on 2 unrelated open sessions was repaired). Bundle main.a798b85d.js markers verified.

### p166-fix1 (2026-08-18, release 20260818_181934)
مخزون الشحن لم يظهر في القائمة الجانبية: القائمة الفعلية تُبنى من tenantNavSections داخل Layout.js (وليس config/sidebarMenu.js الذي يُستخدم لصلاحيات الكاشير فقط). أُضيف العنصر /telecom-stock في قسم services داخل Layout.js ضمن كتلة isAdmin (يطابق ProtectedRoute adminOnly). لا توجد sidebar_order محفوظة في user_settings لهذا المستأجر. Bundle main.30b4053e.js.

### p166-fix2 (2026-08-18, release 20260818_183115)
لوحة التحكم — إحصاءات سريعة: بطاقة جديدة «فوائد اليوم» (today-profit-card) تجمع ربح كل الأقسام من /reports/daily-full (pos.profit + recharge.profit + digital.subs_profit + sim_activations.profit + cards.profit)، رابطها /daily-report. المربعات صُغّرت لأربعة في السطر (grid-cols-2/3/4، gap-3، p-3، قيم text-base، أيقونات h-4) بدل 3 × p-6. Bundle main.dda0f67b.js.

### p166-fix3 (2026-08-18, release 20260818_185047)
اختصار «الولاء» (/ecom-hub/store/loyalty) في قسم الزبائن بالقائمة الجانبية (Layout.js، داخل isAdmin + featureKey loyalty_points ليطابق حماية المسار). Bundle main.92ea8986.js.

## p167 — 2026-08-18 (release 20260818_195834)

### الطلبات الستة للمستخدم
1. أيقونات سريعة في الشريط العلوي (الجرس + صندوق الطلبات الموحد) على كل الصفحات
2. صناديق نقدية إضافية مربوطة بالعمال (مبيعات العامل النقدية تدخل صندوقه تلقائياً)
3. توحيد قائمة شركات الشحن (18 شركة) في كل الأماكن
4. فترة تكلفة «كل 3 أشهر» + بطاقتا «صافي الفوائد اليوم» و«صافي فوائد الشهر» (خصم تقديري للعرض فقط)
5. نقل WhatsApp من الصيانة إلى الرسائل والإشعارات
6. نقل قطع الغيار من المنتجات إلى الصيانة

### قبل
- ربط شركات الشحن (ecom) يعرض 4 شركات فقط مقابل 17 في إدارة التوصيل
- لا صناديق نقدية إضافية — 6 صناديق نظام ثابتة فقط
- فترات التكرار: أسبوعي/شهري/سنوي فقط
- الشريط العلوي للجوال بلا جرس ولا صندوق طلبات
- WhatsApp تحت الصيانة، قطع الغيار تحت المنتجات

### بعد
- backend/routes/ecom/constants.py + frontend/src/pages/ecom/ecomConstants.js: SHIPPING_PROVIDERS = 18 شركة (mock, yalidine, zr, maystro, ecotrack, guepex, procolis, noest, anderson, mylers, ecom_delivery, elogistia, yalitec, dhd, conexlog, coyote, algerie_poste, other)
- backend/routes/cashbox_routes.py: POST /cash-boxes (201)، PUT /cash-boxes/{id}/assign، DELETE /cash-boxes/{id} (حماية صناديق النظام + رصيد صفري)
- backend/services/application/sales_service.py: البيع النقدي للعامل يُقيَّد في صندوقه المربوط (cash_box_id على وثيقة البيع → المرتجعات ترد للصندوق الصحيح)
- backend/routes/expenses_routes.py: فترة quarterly (90 يوم) في التذكيرات + GET /expenses/estimated-cost {daily_cost, monthly_cost}
- ExpensesPage.js: خيار «كل 3 أشهر» + شارة
- DashboardPage.js: بطاقتا صافي الفوائد اليوم/الشهر (net-today-profit-card / net-month-profit-card)
- CashManagementPage.js: زر «إضافة صندوق» (add-box-btn) + شارة العامل + حذف الصندوق المخصص
- Layout.js: نقل WhatsApp وقطع الغيار في القائمة الجانبية + أيقونتا الطلبات/الإشعارات في شريط الجوال (mobile-orders-shortcut-btn)

### الاختبارات (curl)
- GET /ecom/shipping/providers → 18 شركة ✓
- POST /cash-boxes → 201 box_4ecc4672؛ DELETE /cash-boxes/cash → 400 محمي؛ DELETE الاختبار → 200 ✓
- مصروف quarterly 900: estimated-cost = 10/يوم و300/شهر؛ حذف → عودة 0؛ رصيد personal ثابت -30600 ✓
- الحزمة الحية main.6372595f.js تحوي كل testids الجديدة ✓

### النسخ الاحتياطية
/opt/ntcommerce/backups/p167/

## p168 — 2026-08-18 (release 20260818_214528)

### الطلبان ٣ و ٤
3. خانة «سعر البيع» مباشرة في شراء جديد → تحدّث سعر التجزئة + تُسجَّل في سجل الأسعار
4. تفعيل نظام انتهاء الصلاحية (كان موجوداً بلا مدخل): خانة «تاريخ الانتهاء» في الشراء → دفعة تلقائية → إشعارات

### قبل
- سعر البيع مدفون في نافذة «تعديل الأسعار»، والتحديث من الشراء لا يصل سجل الأسعار ويكتب في حقل selling_price الثانوي
- الدُفعات (product_lots) تُدار فقط من تبويب مخفي في تعديل المنتج → لا دفعات → لا إشعارات صلاحية

### بعد
- backend/models/schemas/trading.py: PurchaseItem يقبل retail_price + expiry_date + alert_days
- backend/routes/purchases_routes.py: _sync_item_extras — retail_price → تحديث + سطر price_history (source: "purchase", reference: رقم الفاتورة)؛ expiry_date → إنشاء product_lots تلقائياً؛ يعمل في الإنشاء المباشر وتأكيد المسودات
- PurchasesPage.js: patchCartItem + expiryDate في السلة + الحقول الجديدة في الـ payload
- PurchaseDialogs.js: سطر فرعي تحت كل صنف: «سعر البيع» (retail-price-{id}) و«ينتهي في» (expiry-date-{id})

### الاختبارات (curl، منتج/شراء تجريبيان حُذفا بعدها)
- شراء 5×60 مع retail 150 وexpiry 2026-09-01: الكمية 5 ✓، purchase_price 60 ✓، retail_price 100→150 ✓
- price_history: old 100 new 150 (+50%) source=purchase ✓
- الدفعة أُنشئت (remaining 14 يوم) ✓ والإشعار تولّد: «تنتهي صلاحيتها خلال 14 يوم» ✓
- التنظيف: 0 بقايا (منتج/شراء/دفعة/سجل/إشعار)

### النسخ الاحتياطية
/opt/ntcommerce/backups/p168/ (PurchasesPage.js, PurchaseDialogs.js, purchases_routes.py, trading.py)

### مراحل لاحقة متفق عليها
- تقرير «المنتجات القريبة من الانتهاء» + اقتراح تصريف
- فئات الزبائن الخمس (وسوم sources + وسم تلقائي + تعبئة رجعية + ملف 360°)
- توحيد المصدر (selling_price/retail_price/sell_price → مرجع واحد) على 5 مراحل

## p169 — 2026-08-19 (release 20260819_011835)

### تقرير «انتهاء صلاحية المنتجات»
- backend/routes/products_routes.py: GET /products/expiring-report?days=N — يجمع دفعات product_lots مع بيانات المنتج، يحسب الأيام المتبقية والحالة (منتهية/حرجة ≤7/تحذير ≤30/قادمة) وقيمة المخزون المهدد (كمية الدفعة × سعر الشراء) — مُسجَّل قبل /{product_id} لتفادي التظليل
- frontend/src/pages/ExpiryReportPage.js (جديد): بطاقات ملخصة + فلتر مدة (30/60/90) + بحث + جدول الدفعات + زر «تصريف بخصم» يطبق نسبة خصم على retail_price عبر PUT /products (يُسجَّل في سجل الأسعار تلقائياً)
- App.js: مسار /expiry-report (featureKey: inventory)؛ Layout.js: إدخال «انتهاء الصلاحية» في قسم المنتجات بعد سجل الأسعار (أيقونة CalendarClock)

### الاختبارات
- curl /products/expiring-report?days=90 → 200 بنية rows+summary ✓ (فارغ — لا دفعات حالياً)
- الحزمة الحية main.70fbe73f.js تحوي expiry-report-page وexpiring-report ✓

### النسخ الاحتياطية
/opt/ntcommerce/backups/p169/ (products_routes.py, App.js, Layout.js)

## p170 — 2026-08-19 (release 20260819_014346)

### فئات الزبائن الخمس (pos / recharge / digital / repairs / ecom)
- backend/services/customer_sources.py (جديد): tag_customer_source — وسم بالهوية أو الهاتف، إنشاء سجل مصغّر عند الهاتف+الاسم (ecom)، لا يرمي استثناءات أبداً (لا يكسر العمليات)
- وسم تلقائي عند: البيع POS (sales_service)، شحن الرصيد نقد/آجل (recharge_service)، اشتراك IPTV (digital_panel)، تفعيل SIM (sim_offers)، بيع البطاقات (card_stock)، تذكرة الصيانة إنشاء+دفع (repair_routes، والوثيقة المُنشأة تلقائياً تحمل sources:["repairs"])، طلبات المتجر والويب هوك (ecom orders + webhooks — إنشاء الزبون إن لم يوجد)
- customers_routes: GET /customers و /paginated يقبلان ?source= ; الإنشاء اليدوي يهيئ sources: []
- التعبئة الرجعية (/tmp/backfill_sources.py): tagged=179 (pos) + created=1 (ecom)؛ العدّادات: pos 179، ecom 1، بدون فئة 13
- CustomersPage.js: شريط فلاتر الفئات (customer-source-filters) + شارات ملونة لكل فئة في الجدول والبطاقات (SourceBadges)

### الاختبارات
- GET /customers/paginated?source=pos → total 179 ✓
- import services.customer_sources داخل الحاوية ✓
- الحزمة الحية تحوي customer-source-filters ✓

### النسخ الاحتياطية
/opt/ntcommerce/backups/p170/ (9 ملفات backend + CustomersPage.js)

## p171 — 2026-08-19 (release 20260819_015936)

### توحيد المصدر — المرحلة الأولى: سعر البيع الموحد (retail_price هو المرجع الوحيد)
الجرد: 7415 منتجاً، صفر يحمل selling_price — الازدواجية كودية فقط، لا بيانات للترحيل.
sell_price في النطاقات الأخرى (بطاقات/قطع/منصات رقمية) حقول أصلية لنطاقاتها — ليست ازدواجية.

### التغييرات
- purchases_routes.py: إيقاف كتابة selling_price نهائياً؛ الحمولات القديمة (selling_price فقط) تُوجَّه إلى retail_price عبر _sync_item_extras + سطر price_history — طبقة التوافق
- search_routes.py: الإسقاط يقرأ retail_price
- database_routes.py: الاستيراد القديم يكتب retail_price (مع fallback)
- repair_routes.py: ترتيب القراءة retail_price ← selling_price ← sell_price
- ProductsPage.js + GlobalSearchModal.js: قراءة retail_price أولاً
- المتجر العام (ProductDetail/PublicStore/StoreLanding) كان يقرأ retail_price أولاً أصلاً — لا تغيير

### الاختبارات (curl، بيانات تجريبية حُذفت)
- شراء بحمولة قديمة selling_price=33 → retail_price أصبح 33، selling_price لم يُخزَّن، price_history سجّل 20→33 بمصدر purchase ✓
- صحة النظام 200 بعد إعادة التشغيل ✓

### القاعدة المستقبلية
أي كود جديد يقرأ/يكتب سعر البيع للمنتجات يستعمل retail_price حصرياً. حذف حقول selling_price من المخططات مؤجل لمرحلة استقرار لاحقة.

### النسخ الاحتياطية
/opt/ntcommerce/backups/p171/ (4 backend + ProductsPage.js + GlobalSearchModal.js)

## p172 — 2026-08-19 (release 20260819_093255)

### ملف الزبون 360° + رادار البيع المتقاطع
- customers_routes.py: GET /customers/{id}/overview — نشاط الزبون عبر الفئات الخمس (مبيعات مقسمة pos/recharge/digital حسب type، تذاكر الصيانة وطلبات المتجر بالهاتف) + الديون + آخر نشاط
- customers_routes.py: GET /customers/cross-sell/summary (مصفوفة) و GET /customers/cross-sell?have=X&missing=Y — أهداف البيع المتقاطع ($all + $ne)
- CustomersPage.js: زر عين (👁) لكل زبون → نافذة 360° (5 بطاقات فئات + الدين + آخر نشاط + رابط WhatsApp)؛ زر «رادار البيع المتقاطع» في الترويسة → نافذة بمعيارين (لديهم/ليس لديهم) + قائمة الأهداف مع روابط WhatsApp جاهزة (wa.me/213)

### الاختبارات (curl)
- cross-sell/summary: pos=179, ecom=1, بدون فئة=13 ✓
- cross-sell?have=pos&missing=ecom → 3 نتائج صحيحة ✓
- overview لزبون نشط: pos count=1000 total=19,350,535 ✓

### النسخ الاحتياطية
/opt/ntcommerce/backups/p172/ (customers_routes.py, CustomersPage.js)

## p173 — 2026-08-19 (release 20260819_112153)

### استكمال الفئة التقنية المتبقية (3 بنود)
1. **تنظيف selling_price (مرحلة توحيد المصدر الأخيرة):** حُذف من PurchaseItem (trading.py) ومن حمولة الشراء في PurchasesPage.js — لم يعد أحد يكتبه أو يرسله. الحقول المشابهة في repair.py/bdv.py/extra_schemas.py تخص قطع الغيار/BDV (نطاقات أصلية، ليست ازدواجية) — تُركت. القراءات الدفاعية .get("selling_price") بقيت للمسودات القديمة المخزنة.
2. **تلميح FEFO في نقطة البيع:** عند إضافة منتج له دفعة تقترب من الانتهاء (ضمن نافذة التنبيه)، يظهر تنبيه: «بِع من الدفعة X أولاً — تنتهي خلال N يوم» — مرة واحدة لكل منتج في الجلسة، صامت عند الخطأ.
3. **ضجيج customer_robot E11000:** الجذر = insert_many بلا حقل id على collection بفهرس id فريد (تصادم null). الإصلاح: id فريد لكل قطعة + ordered=False + ابتلاع duplicates بسجل info. سجلات الإقلاع بعد النشر: 0×E11000.

### الاختبارات (curl)
- شراء بالحمولة الرسمية retail_price=25 + expiry → retail حُدّث ودفعة أُنشئت (17 يوم) ✓
- حمولة قديمة selling_price=99 → 201 بلا كسر، والحقل يُتجاهل (retail بقي 25) ✓
- التنظيف: عكس المخزون والمورد، حذف الشراء/المنتج/السجل/الدفعة — صفر بقايا ✓

### النسخ الاحتياطية
/opt/ntcommerce/backups/p173/ (trading.py, customer_robot.py, POSPage.js, PurchasesPage.js)

## p174 — توحيد خانات البحث + إصلاح حدّ الـ20 منتجاً (2026-08-19, release 20260819_120022)
**قبل:** نقطة البيع: quick-search limit=20 (لا يظهر أكثر من 20 نتيجة رغم وجود مئات المطابقات). حوار الشراء: slice(0,20) فوق مصفوفة محلية محدودة بـ1000 منتج. GET /products يتجاهل بارامتر limit (to_list(1000) ثابت).
**بعد:**
- backend/routes/products_routes.py: GET /products يحترم limit (افتراضي 1000، سقف 10000). اختبار curl: ?limit=5 → 5 نتائج ✓
- POSPage.js: quick-search limit=20 → limit=50 (خانة البحث فقط؛ الباركود يبقى limit=5)
- PurchasesPage.js: بحث خادمي مؤجّل (250ms) عبر quick-search limit=50 مع remoteProducts + حارس تسابق — البحث الآن يشمل كامل الكتالوج (7415 منتجاً) وليس أول 1000 فقط؛ الفلترة المحلية تبقى احتياطاً
- PurchaseDialogs.js: slice(0,20) → slice(0,50)
- quick-search هو المسار الموحّد الوحيد للبحث الغني (باركود/PLU/كود/اسم regex) — مستخدم في POS + المشتريات + البحث الشامل
**اختبار:** quick-search بمقطع اسم حقيقي limit=50 → 50 نتيجة من أصل 625 مطابقة ✓؛ الحزمة الحية main.67a5cbbd.js تحوي limit=50 ×5 ✓
**النسخ الاحتياطية:** /opt/ntcommerce/backups/p174/

## p175 — نتائج بحث بلا سقف + فلتر العائلات لمنتجات المتجر + أيقونة POS بالشريط العلوي (2026-08-19, release 20260819_122814)
**قبل:** quick-search مقيد بـlimit صغير من الواجهة (50) والحوار يقطع عند 50. منتجات المتجر: GET /products بأول 1000 فقط، store/products مقيد 1000، ولا فلتر عائلات في قائمة الاختيار. لا أيقونة POS في الشريط العلوي.
**بعد:**
- quick-search: limit مُثبَّت بسقف 50000 — يرجع كل المطابقات (اختبار: 625/625) ✓
- GET /products: سقف limit مرفوع 10000 → 50000 (اختبار: ?limit=50000 → 7415 منتجاً = الكتالوج كاملاً) ✓
- POSPage + PurchasesPage: quick-search limit=50000 — كل النتائج تظهر. PurchaseDialogs: بلا slice — كل نتيجة تُعرض. UnifiedSearch (البحث الشامل): 15 → 100
- online_store_routes: GET /store/products + منتجات المتجر العام /shop — to_list 1000 → 100000 (تفعيل منتجات المتجر غير محدود فعلياً)
- StoreManagementPage: جلب ?limit=50000 + خانة «عائلة المنتجات» (store-products-family-filter) فوق جدول الاختيار — تحديد العائلة يعرض منتجاتها فقط مع عدّاد
- Layout: أيقونة نقطة البيع (header-pos-btn) في الشريط العلوي المكتبي بجانب FR/عربي + نسخة للجوال (mobile-header-pos-btn)
**الحزمة الحية:** main.96d4519b.js — تحوي header-pos-btn وstore-products-family-filter وlimit=50000 ✓
**النسخ الاحتياطية:** /opt/ntcommerce/backups/p175/

## p176 — اختصارات POS: شبكة 2×8 (2026-08-19, release 20260819_123840)
**قبل:** شبكة الاختصارات 3 أعمدة × 6 صفوف (18 خانة).
**بعد:** عمودان أفقياً × 8 صفوف عمودياً (16 خانة) — grid-cols-2 + slice(0,16). الحزمة الحية main.6e68bc88.js تحوي grid-cols-2 ✓
**النسخة الاحتياطية:** /opt/ntcommerce/backups/p176/

## p177 — لوحة مهام البيع: نافذة ثابتة بأسهم تمرير + مهام داخلية بلا نوافذ (2026-08-19, release 20260819_130816)
**قبل:** نتائج البحث اللامحدودة (p175) مدّدت صفحة POS كلها فهبطت إعدادات الدفع للقاع. أزرار مهام البيع تفتح نوافذ منبثقة (products/customers/reports/history/print dialogs).
**بعد:**
- POSPage: صف الشبكة ثابت md:grid-rows-[minmax(0,1fr)] — الصفحة لا تتمدد إطلاقاً؛ لوحة المهام flex-col min-h-0 مع تمرير داخلي فقط
- سهما تمرير ▲▼ (sidebar-scroll-up/down) في ترويسة اللوحة — scrollBy سلس 280px
- taskHandlers: articles/families/customers/customer-families/reports/history → inlineTask داخل اللوحة مع زر رجوع (inline-task-back-btn)؛ print-last → طباعة حرارية مباشرة بلا نافذة
- POSSidebar: لوحات داخلية — قائمة منتجات بفلتر (تبقى مفتوحة بعد كل إضافة)، عائلات→منتجات العائلة بزر رجوع، زبائن ببحث+اختيار يربط بالفاتورة، عائلات الزبائن بشرائح، تقارير الحصة (4 بطاقات+المتوقع بالصندوق)، السجل (فواتير → SaleDetailDialog)
- البحث يطغى على اللوحة الداخلية مؤقتاً؛ مسحه يعيد المهمة المفتوحة. اختصارات Ctrl تشتغل كما هي
**الحزمة الحية:** main.cde7ccca.js — كل testids موجودة ✓
**النسخ الاحتياطية:** /opt/ntcommerce/backups/p177/

## p178 — تصغير اختصارات POS (2026-08-19, release 20260819_131811)
**قبل:** أزرار الاختصارات h-12 في عمود col-span-3 ببطاقة h-full — تملأ ربع الواجهة وكامل ارتفاعها.
**بعد:** أزرار مدمجة h-9 (أيقونة h-3، فجوات 0.5)، البطاقة fit-content، العمود col-span-3 → col-span-2 والمساحة المكتسبة لعمود السلة (6 → 7). الشبكة تبقى 2×8 كما طلب المستخدم في p176.
**الحزمة الحية:** main.4ceafd93.js ✓ | **النسخ:** /opt/ntcommerce/backups/p178/

## p179 — السجل بفلسفة R.Lynx: فترات → معاملات → وصل داخل اللوحة (2026-08-19, release 20260819_135057)
**قبل:** «السجل» يعرض آخر 20 فاتورة كبطاقات، بلا فترات زمنية ولا بحث، والتفاصيل في نافذة منبثقة.
**بعد (تقليد R.Lynx Point De Vente حسب صور المستخدم):**
- المستوى 1: «السجل» → قائمة 10 فترات: اليوم/أمس/هذا الأسبوع/آخر 7 أيام/آخر 15 يوماً/هذا الشهر/آخر 30 يوماً/الحصة الحالية (من opened_at)/آخر حصة مغلقة (من /daily-sessions أول status=closed)/بفترة مخصصة
- المستوى 2: بفترة مخصصة → منتقي تاريخين من/إلى + تأكيد/إلغاء
- المستوى 3: قائمة المعاملات للفترة عبر GET /sales?start_date&end_date + خانة «بحث في المعاملات» (زبون/رقم فاتورة) — كل سطر: زبون، مبلغ، رقم، تاريخ|وقت
- المستوى 4: نقرة → GET /sales/{id} ومعاينة الوصل داخل اللوحة (بنود، مجموع فرعي، تخفيض، توصيل، إجمالي) + زر طباعة حرارية مباشر
- زر الرجوع يتدرج في المستويات (وصل→قائمة→فترات→مهام البيع) والعنوان يعرض الفترة النشطة «السجل | اليوم»
**الحزمة الحية:** main.f3cc5f2e.js — كل testids موجودة ✓ | **النسخ:** /opt/ntcommerce/backups/p179/

## p180 — حزمة POS الست: تعديل سريع، وصل آخر فاتورة، شريط إرجاع، سحب/إيداع بالمال الخاص، انتظار بالزبون، ديون+نقاط (2026-08-19, release 20260819_164704)
**اكتشافات:** زرا سحب/إيداع كانا معطلين (POST /cash/deposit|withdraw → 404 غير موجودة). وضع الإرجاع كان يضيف −1 فعلاً لكن بلا مؤشر بصري. السلة المؤقتة كانت موجودة لكن لا تحفظ الزبون.
**التغييرات:**
1. قلم تعديل سريع (edit-product-*) على كل منتج في قوائم اللوحة ونتائج البحث → نافذة quick-edit-dialog (اسم/باركود/3 أسعار/كمية) → PUT /products/{id} + تحديث محلي
2. طباعة آخر فاتورة → inlineTask 'lastreceipt' يعرض وصل آخر فاتورة داخل اللوحة (renderReceipt مشترك مع السجل) + زر طباعة
3. شريط أحمر عريض return-mode-banner أعلى POS أثناء وضع الإرجاع + زر خروج
4. handleCashOperation → POST /cash-boxes/transfer: سحب cash→personal، إيداع personal→cash؛ الخادم يرخّي شرط الرصيد لصندوق personal (يجوز السالب)؛ النافذة تعرض رصيدي الصندوقين (cash-boxes-balances) — اختبار حي 1دج بالاتجاهين ✓ + تنظيف السجلات ✓
5. parkCart(customerId) يحفظ الزبون في السلة المؤقتة + استرجاعه عند الاستئناف + مهمة «وضع في الانتظار» (id:park) في قائمة المهام
6. قائمة الزبائن: شارة دين حمراء (debtsMap من /debts مجمّعة) + شارة نقاط ⭐ (loyalty_points)؛ وشارة النقاط أيضاً في منطقة الزبون المختار أعلى السلة
**الحزمة الحية:** main.48c86a36.js ✓ | **النسخ:** /opt/ntcommerce/backups/p180/

---

## p181 — 2026-08-19 — الاقتراحات الثلاثة الإضافية في نقطة البيع
**Release:** 20260819_170253 — Bundle: main.ba35d5ed.js

### قبل
- نقاط الولاء كانت تُعرض فقط (شارة في اختيار الزبون) دون إمكانية صرفها عند الدفع.
- وضع الإرجاع: كان يمكن إتمام فاتورة بمبلغ موجب أثناء تفعيل وضع الإرجاع (خطأ محاسبي محتمل).
- السلات المؤجلة (الانتظار) لا تُظهر مدة الانتظار.
- تفاصيل الدفع (payment_details) كانت تسجل المبلغ المدفوع قبل خصم أي شيء إضافي.

### بعد
1. **صرف نقاط الولاء كخصم عند الدفع**: عند اختيار زبون يملك نقاطاً كافية يظهر زر ⭐ بجانب الإجمالي (`loyalty-redeem-toggle`)؛ الضغط عليه يخصم قيمة النقاط من الإجمالي وفق إعدادات /loyalty/settings (0.1 دج/نقطة، حد أدنى 100 نقطة)، وعند إتمام البيع تُستدعى POST /loyalty/redeem وتُحدَّث النقاط محلياً. خصم النقاط يُضاف إلى حقل discount وتُسجَّل تفاصيله في loyalty_redeem داخل الفاتورة.
2. **حارس وضع الإرجاع**: إتمام البيع ممنوع إذا كان الوضع إرجاعاً والإجمالي ≥ 0 (رسالة خطأ توضح ضرورة أن يكون الإجمالي سالباً في الإرجاع).
3. **مدة الانتظار**: كل سلة مؤجلة تُظهر منذ متى أُجّلت (الآن / منذ X د / منذ Xس Yد — il y a X min بالفرنسية).
4. **payment_details**: المبلغ النقدي الافتراضي أصبح الإجمالي بعد خصم النقاط.

### الملفات
- frontend/src/pages/POSPage.js (loyalty settings/redeem + return guard + payment fix)
- frontend/src/pages/pos/POSCart.js (زر الصرف + مدة الانتظار)
- Backups: /opt/ntcommerce/backups/p181/

### التحقق
- esbuild على الملفين ✓
- الحزمة الحية: loyalty-redeem-toggle ✓، loyalty/redeem ✓، il y a ✓، paidAmount ✓، points_value ✓

---

## p182 — 2026-08-19 — وحدة الشركاء وتوزيع الأرباح
**Release:** 20260819_200404 — Bundle: main.aa5fb549.js

### قبل
- لا يوجد أي نظام لإدارة شركاء المحل أو حساب حصصهم من الأرباح.

### بعد
وحدة جديدة كاملة «الشركاء والأرباح» في قسم المالية (/partners):
1. **سجل الشركاء**: اسم + مبلغ المشاركة (رأس المال) + هاتف + ملاحظات؛ النسبة تُحسب تلقائياً (رأس مال الشريك ÷ إجمالي رؤوس أموال النشطين).
2. **حركات رأس المال**: إيداع/سحب مع سجل كامل (capital_in/capital_out)؛ ممنوع سحب أكثر من الرصيد.
3. **تقرير الأرباح لفترة مختارة**: صافي الربح = (المبيعات − تكلفة البضاعة المباعة COGS) − المصاريف، مع عدد الفواتير، وأزرار الشهر الحالي/الماضي.
4. **تسجيل التوزيع**: يوزّع صافي الربح على الشركاء النشطين حسب نسبهم ويحفظه في سجل التوزيعات (حماية من التكرار 409 + تأكيد force).
5. **سحب الأرباح**: تسجيل محاسبي (profit_withdrawal) لا يتجاوز المستحقات؛ مستحقات كل شريك = مجموع التوزيعات − السحوبات، تظهر في بطاقته.
6. **حماية**: حذف الشريك ممنوع إذا له حركات/توزيعات (يُعطَّل بدلاً منه)؛ كل المسارات tenant-admin فقط.
- التوزيع تقرير/تسجيل فقط بلا حركات كاش تلقائية (حسب التوصية المتفق عليها) — حركات الكاش تُسجَّل يدوياً من صناديق النقد.

### الملفات
- backend/routes/partners_routes.py (جديد — مسجل في _AUTO_REG_MODULES بـ main.py)
- frontend/src/pages/PartnersPage.js (جديد)
- frontend/src/App.js (مسار /partners)، frontend/src/components/Layout.js (أيقونة Handshake + عنصر قائمة المالية)
- Backups: /opt/ntcommerce/backups/p182/

### الاختبار (curl مباشر)
- إنشاء شريكين 600k/400k ثم سحب 100k → النسب 66.67%/33.33% ✓
- تقرير أوت 2026 الحقيقي: 598 فاتورة، مبيعات 8,104,593.50، تكلفة 4,383,776.21، صافي 3,720,817.29 ✓
- توزيع كامل بحصص صحيحة ✓، حماية التكرار 409 ✓
- سحب أرباح 50k ✓، منع السحب فوق المستحقات ✓، منع حذف شريك له تاريخ ✓، تعطيل شريك ينقل 100% للنشط ✓
- تنظيف كل بيانات الاختبار من القاعدة بعدها ✓

---

## p183 — 2026-08-19 — المرحلة 1: ملفات النشاط التجاري (Business Profiles)
**Release:** 20260819_205729 — Bundle: main.74600a25.js

### قبل
- حقل business_type موجود لكنه مجرد ملصق (3 قيم: retailer/wholesaler/distributor) لا يغيّر أي ميزة.
- حقل business_type غير موجود أصلاً في TenantUpdate — قائمة «التصنيف» في صفحة المشتركين كانت ميتة.

### بعد
1. **core/business_profiles.py**: 23 ملف نشاط (22 فئة مستهدفة + تجزئة عامة)، كل ملف: اسم عربي/فرنسي + أيقونة + features_off/features_on (مفاتيح قوائم الواجهة) + عائلات منتجات أولية + أسماء مستعارة للقيم القديمة (retailer→retail...).
2. **endpoints جديدة**: GET /saas/business-profiles (عمومي)، GET/POST /saas/tenants/{id}/business-profile (مشرف عام).
3. **التسجيل العام (/register)**: خطوة «نوع النشاط التجاري» → يُحفظ ويُطبَّق ملفه فوراً: features_override على وثيقة المشترك + بذر عائلات المنتجات إن كانت القاعدة فارغة.
4. **إنشاء مشترك من لوحة المشرف**: نفس التطبيق التلقائي.
5. **تغيير النشاط لمشترك قائم** (PUT /saas/tenants/{id}): يعيد تكييف الميزات تلقائياً (دمج — مفاتيح الملف تغلب، تعديلات المشرف اليدوية الأخرى محفوظة).
6. TenantUpdate يقبل business_type الآن.
7. صفحة المشتركين: قائمة 23 نشاطاً ديناميكية من API + تنبيه أن التغيير يكيّف الميزات.

### الاختبار
- GET العمومي: 23 ملفاً ✓
- apply electronics على المشترك الحقيقي: {recharge:false, iptv:false, maintenance:true} ✓ ثم **استعادة وثيقته الأصلية فوراً** (retailer + {has_woocommerce:true}) ✓
- PUT business_type=restaurant → تكييف تلقائي ✓ ثم استعادة ✓
- قيمة غير معروفة → 400 ✓

### الملفات
- backend/core/business_profiles.py (جديد)، backend/routes/saas/business_profiles_routes.py (جديد، مسجل في main.py)
- backend/routes/saas/registration_routes.py، tenants_routes.py، schemas.py
- frontend: SubscribersPage.js، landing/RegisterPage.js
- Backups: /opt/ntcommerce/backups/p183/

### ملاحظة تشغيلية
- تطبيق ملف على مشترك قائم يعطّل ميزات قد يستخدمها — واجهة المشرف تنبّه لذلك، والاستعادة يدوية عبر تبديل الميزات.

---

## p184 — 2026-08-19 — المرحلة 2.1: بيع المتغيرات (لون/مقاس) من POS مع مخزون لكل متغير
**Release:** 20260819_211911 — Bundle: main.f543f341.js

### قبل
- نموذج المنتج يدعم variants [{color,size,quantity}] ونماذج الإضافة/التعديل تعرض محرر المتغيرات، لكن البيع **لم يكن يعرف المتغيرات إطلاقاً**: الخصم من إجمالي المنتج فقط، وبلا منتقي في POS → انجراف مضمون بين مخزون المتغيرات والواقع.

### بعد
1. **POS — منتقي المتغيرات**: إضافة منتج له متغيرات تفتح نافذة اختيار (variant-picker-dialog) تعرض كل لون/مقاس مع مخزونه؛ المتغير الفارغ معطّل (إلا في وضع الإرجاع). يعمل من البحث وقائمة المنتجات والاختصارات (كلها تمر عبر addProductSmart).
2. **سلة واعية بالمتغير**: كل متغير سطر مستقل (مفتاح product_id+color|size) واسم السطر «المنتج - لون / مقاس» يظهر في الفاتورة والإيصال.
3. **مسار البيع (sales_service)**: الحجز الذري أصبح طبقتين — إجمالي المنتج ثم المتغير (elemMatch + $gte)؛ رسالة عربية دقيقة عند نقص متغير («مخزون غير كافٍ للمتغير أحمر / M: المتاح 3 والمطلوب 4») مع تراجع كامل عن كل الحجوزات.
4. **الحذف/الإرجاع** يعيدان مخزون المتغير أيضاً. SaleItem.variant في المخطط.
- نهج التصميم: المتغيرات داخل وثيقة المنتج (وليست منتجات فرعية) — المشتريات والجرد تبقى على مستوى المنتج، وكميات المتغيرات تُدار من نموذج المنتج.

### الاختبار (curl حي)
- منتج بمتغيرين (5+3=8) → بيع 2× أحمر/M: الإجمالي 6 والمتغير 3 ✓
- بيع 10× أزرق/L → رفض على مستوى الإجمالي ✓
- بيع 4× أحمر/M (بقي 3) → رفض على مستوى المتغير برسالة واضحة ✓ والتراجع صحيح ✓
- حذف البيع → استرجاع الإجمالي (8) والمتغير (5) ✓
- تنظيف كامل: المنتج التجريبي حُذف (بعد تصفير مخزونه — حماية الحذف تعمل) ✓

### الملفات
- backend/models/schemas/trading.py، backend/services/application/sales_service.py
- frontend/src/hooks/usePOSCart.js، frontend/src/pages/POSPage.js
- Backups: /opt/ntcommerce/backups/p184/

---

## p185 — 2026-08-19 — المرحلة 2.2: وحدة الكراء (سيارات + عقارات)
**Release:** 20260819_221600 — Bundle: main.b01f0eba.js

### قبل
- لا توجد أي وحدة كراء — وكالات كراء السيارات والمنازل لا تستطيع استعمال النظام لنشاطها.

### بعد
وحدة «الكراء» كاملة (/rentals) — قسم قائمة مستقل بمفتاح ميزة opt-in جديد `rental`:
1. **الأصول**: سيارة/عقار، مرجع (تسجيل/عنوان)، سعر يومي/شهري، وديعة افتراضية، حالات (متاح/مؤجّر/صيانة)؛ منع حذف أصل مؤجّر أو له عقود؛ منع تغيير حالة أصل مؤجّر.
2. **العقود**: رقم تلقائي RNT-YYYYMMDD-XXXX؛ حساب المدة تلقائياً (يومي/شهري بسقف 30 يوماً للشهر)؛ السعر من الأصل أو مخصص؛ دفعة أولى + وديعة تدخلان الصندوق المختار فوراً (transactions بفئات rental_payment/rental_deposit).
3. **منع الحجز المزدوج**: الأصل المؤجّر يرفض عقداً جديداً.
4. **التمديد**: يعيد حساب المدة والمستحق تلقائياً.
5. **الدفعات**: تُقيَّد في العقد والصندوق معاً.
6. **الإغلاق/الاسترجاع**: غرامة تأخير تلقائية (أيام × اليومي أو الشهري/30)، قرار الوديعة (تُرجع ← تُخصم من الصندوق / تُحتفظ بها)، الباقي غير المدفوع يتحول **ديناً على الزبون** (مرآة customers)، والأصل يعود متاحاً.
7. **الحالة المتأخرة افتراضية**: عقد نشط تجاوز نهايته يظهر «متأخر» دون تخزين.
8. **إحصائيات**: متاح/مؤجّر/صيانة، نشطة/متأخرة/مغلقة، إيرادات الشهر.
- ربط الملفات: ملفا car_rental وproperty_rental يفعّلان `rental` تلقائياً (p183)؛ الميزة opt-in في الواجهتين (backend main.py + frontend AuthContext) فلا تظهر لغير وكالات الكراء.

### الاختبار (curl حي — سيناريو كامل)
- سيارة 5000/يوم → عقد 9 أيام = 45000 + وديعة 20000 + دفعة أولى 20000 → الصندوق 11300→51300 ✓
- منع الحجز المزدوج ✓؛ تمديد يومين (+10000 → 55000) ✓؛ دفعة 10000 ✓
- إغلاق متأخر 3 أيام → غرامة 15000، مستحق 70000، مدفوع 30000، باقٍ 40000 ✓؛ الوديعة رُدّت (−20000) ✓؛ الأصل عاد متاحاً ✓
- تنظيف كامل: العقد/الأصل/4 قيود معاملات حُذفت ورصيد الصندوق أُعيد إلى 11300 بدقة ✓

### الملفات
- backend/routes/rental_routes.py (جديد، مسجل في main.py + OPT_IN_FEATURES)
- backend/core/business_profiles.py (rental في KNOWN_FEATURE_KEYS + features_on للملفين)
- frontend/src/pages/RentalsPage.js (جديد)، App.js، Layout.js (قسم الكراء)، contexts/AuthContext.js (opt-in)
- Backups: /opt/ntcommerce/backups/p185/

## p186 — وضع المطعم: طاولات + طلبات المطبخ (2026-08-19)
**قبل:** لا يوجد أي دعم للمطاعم — POS بيع مباشر فقط.
**بعد:**
- backend/routes/restaurant_routes.py (جديد، مُسجّل في _AUTO_REG_MODULES): طاولات CRUD (كتابة admin) + طلبات مطبخ (إنشاء/إلحاق تلقائي بنفس الطاولة/حالات pending→preparing→served|cancelled) + checkout يربط البيع ويحرّر الطاولة. حذف طاولة مشغولة ممنوع.
- FIX أثناء الاختبار: collections كانت تُلتقط وقت إنشاء المصنع → كانت ترتبط بـ main_db (كشفها اختبار حي: طلبان في ntcommerce بدل قاعدة المستأجر، حُذفا). الآن تُحلّ لكل طلب عبر db.restaurant_tables / db.kitchen_orders.
- ميزة "restaurant" opt-in: main.py OPT_IN_FEATURES + AuthContext + KNOWN_FEATURE_KEYS؛ ملف المطعم يفعّلها تلقائياً.
- POSPage: زر "طاولة" (مُبرز عند الاختيار) + زر "إرسال للمطبخ" + نافذة اختيار الطاولات (إنشاء طاولة للأدمن) + تذكرة مطبخ قابلة للطباعة + تحرير الطاولة تلقائياً بعد إتمام البيع.
- اختبارات curl: دورة كاملة (إنشاء/إلحاق/حالة/checkout/حظر حذف مشغولة) + تحقق من التوجيه لقاعدة المستأجر. بدون بيانات تجريبية متبقية.
- release 20260819_224313 — bundle main.4bdeb721.js

## p187 — تتبع IMEI/السيريال (2026-08-19)
**قبل:** مفتاح serial_number_tracking موجود في المنتج لكن بلا أي تتبع فعلي — السيريال لا يصل الخادم.
**بعد:**
- مجموعة product_serials (قاعدة المستأجر): {serial, product_id, status in_stock|sold, sale_id, sold_at}.
- routes/serials_routes.py (جديد): GET /serials/product/{id}، POST /serials/register (إدخال جماعي + تجاهل المكرر)، GET /serials/lookup (ضمان: المنتج + الفاتورة + الزبون)، DELETE محمي ضد حذف المُباع.
- sales_service: بيع بسيريال مُباع مسبقاً → 400 مع rollback كامل للمخزون/المتغيرات؛ سطر إرجاع (كمية سالبة) يعيد السيريال للمخزون؛ حذف/إرجاع الفاتورة يحرّر سيريالاتها. SaleItem.serial_number جديد.
- POS: المنتج المتتبع يفتح نافذة إدخال السيريال (مسح/كتابة، Enter) — كل وحدة سطر مستقل. sale items تحمل serial_number.
- EditProductPage: تبويب «الأرقام التسلسلية» (يظهر فقط عند تفعيل التتبع) — إضافة جماعية + قائمة بالحالة + حذف.
- اختبارات curl: تسجيل مع dedupe (2 أُضيفا/1 مكرر)، بيع → sold + lookup بالفاتورة، إعادة بيع محظورة، حذف الفاتورة → in_stock، رصيد الصندوق 11300 سليم، التوجيه لقاعدة المستأجر صحيح (main_db=0).
- release 20260819_231010 — bundle main.836fde3c.js

## p188 — وصفات الإنتاج BOM (2026-08-19) — نهاية المرحلة 2
**قبل:** لا يوجد أي دعم للإنتاج/تحويل المواد.
**بعد:**
- routes/production_routes.py (جديد): وصفات (منتج نهائي + مكوّنات بكميات لكل دفعة، وصفة واحدة لكل منتج، تكلفة وحدة محسوبة من purchase_price) + تشغيل إنتاج بمطالبات مخزون ذرّية مع rollback (نفس نمط المبيعات) + حذف الوصفة محظور إن لها أوامر + max-batches يحسب الحد الأقصى من المخزون الحالي.
- التشغيل: ينقّص المكوّنات، يزيد مخزون المنتج النهائي، يحدّث purchase_price للمنتج النهائي بالتكلفة الفعلية، يسجّل أمر PRD-YYYYMMDD-XXXX بلقطة كاملة.
- ميزة "production" opt-in (main.py + AuthContext + KNOWN_FEATURE_KEYS)؛ ملف «مؤسسات الإنتاج» يفعّلها.
- ProductionPage.js (جديد): تبويبا الوصفات/الأوامر، حوارات إنشاء/تعديل/تشغيل مع معاينة التوفر؛ قسم قائمة جديد بأيقونة Factory؛ مسار /production محمي featureKey=production.
- اختبارات curl: تكلفة 35 دج صحيحة (0.3×50+0.1×200)، حركات مخزون دقيقة، منع التجاوز بدون أي خصم، منع وصفة مكررة، منع حذف وصفة لها أوامر، التوجيه لقاعدة المستأجر صحيح.
- release 20260819_232911 — bundle main.b1d3280b.js

## p189 — المرحلة 3.1: معاملات ACID + Outbox حدثي للبيع (2026-08-19)
**قبل:** البيع سلسلة كتابات غير ذرّية — انقطاع في المنتصف يترك مخزوناً منقصاً بلا فاتورة أو مالاً بلا قيد؛ الحدث يُنشر مباشرة (dual-write) ويضيع إن تعطل Redis لحظتها؛ حقل price في الحمولة كان خاطئاً (AttributeError مبتلع).
**بعد:**
- services/outbox.py (جديد): outbox_write يكتب الحدث في main_db.outbox **بنفس معاملة** العملية (معاملات MongoDB عابرة للقواعد على replica set)؛ مرحّل خلفي (كل 2 ثانية، دفعات 50) ينشر للـRedis Streams ويعلّم published؛ تعطّل Redis لا يفقد أي حدث. المستهلكون idempotent فالتكرار النادر غير ضار.
- sales_service: create_sale_op / delete_sale_op / return_sale_op أصبحت أغلفة ACID — كل الآثار الجانبية (مخزون، متغيرات، سيريالات، فاتورة، أقساط، إشعارات، إحصاءات زبون، صندوق، حدث) في معاملة واحدة تُجهض بالكامل عند أي فشل. أُضيف session=_tx لكل كتابة (~25 موضعاً).
- أحداث جديدة عبر الـoutbox: sale.deleted و sale.refunded (الأخير له مستهلك موجود).
- main.py: تشغيل مرحّل الـoutbox عند الإقلاع بعد event_bus.
- اختبارات حية: بيع → حدث published:true خلال ثوانٍ؛ تجاوز مخزون → رفض + المخزون ثابت 1.0 + صفر مستندات شاردة + outbox فارغ (برهان الذرّية)؛ إرجاع → مخزون 2.0 + sale.refunded published؛ الصندوق 11300 سليم.
- لا تغيير واجهة أمامية (بنية خلفية خالصة).

## p190 — المرحلة 3.2: قيود محاسبية تلقائية من الأحداث + إصلاح الناقل (2026-08-20)
**قبل:** المحاسبة جزيرة يدوية؛ والأخطر: الناقل الحدثي لم يكن يعمل إطلاقاً — main.py كان ينادي event_bus.start() دون await/معاملات (coroutine ميتة) وregister_handlers لا يُستدعى في أي مكان → لا مستهلكين منذ وجود الناقل.
**بعد:**
- إصلاح الإقلاع: register_handlers + await event_bus.start(main_db) + consume_loop كمهمة خلفية — 10 معالجات مسجلة فعلياً الآن.
- services/accounting_auto.py (جديد): دليل حسابات تلقائي كسول لكل مستأجر (530 صندوق/514 بنك/531 محفظة/532 خزنة/533 مال خاص/534 متجر/411 زبائن/380 مخزون/700 إيرادات/600 تكلفة مبيعات) + post_sale_entry (مدين: الصندوق بالمدفوع + الزبائن بالمتبقي / دائن: الإيرادات بالإجمالي + مدين تكلفة/دائن مخزون) + post_sale_reversal للإرجاع/الحذف؛ القيود approved فوراً، متوازنة، idempotent لكل فاتورة، تحدث أرصدة الحسابات.
- المستهلكون: sale.completed → قيد + audit؛ sale.refunded/sale.deleted → قيد عكسي (معالج sale.deleted جديد مسجّل).
- حمولات الأحداث أُثريت: remaining, cash_box_id, cogs, customer_id.
- إدارة إعادة التشغيل: مجموعة المستهلك أُنشئت من id=0 فأعادت معالجة 8 أحداث قديمة (كلها اختبارات) — نُظفت قيودها وصُفّرت الأرصدة؛ الدليل (10 حسابات) بقي.
- اختبار حي نهائي: بيع 500 (مدفوع 200) → قيد متوازن (530:200 مدين، 411:300 مدين، 700:500 دائن، 600:200/380:200)؛ إرجاع → قيد عكسي مطابق؛ الصندوق 11300 سليم.

## p191 — المرحلة 3.3: قناة SSE للتزامن الفوري (2026-08-20)
**قبل:** الواجهة تستطلع (polling) فقط — بيع من كاشير آخر لا يظهر إلا بعد تحديث يدوي.
**بعد:**
- routes/events_routes.py (جديد): GET /api/events/stream?token= — SSE بمصادقة JWT يدوية (EventSource بلا ترويسات)، عزل كامل بين المستأجرين، نبض كل 25 ثانية، تنظيف الاشتراك عند الانقطاع.
- مرحّل الـoutbox يبث كل حدث منشور على قناة Redis Pub/Sub nt:events_feed (fire-and-forget) — نقطة عبور واحدة لكل الأحداث.
- nginx: location مخصص للـSSE (proxy_buffering off، timeout ساعة) — مُختبر عبر Cloudflare.
- frontend lib/realtime.js (جديد): singleton EventSource بإعادة اتصال تلقائية + onEvent/subscribe.
- POSPage: يشترك في sale.completed/refunded/deleted → تحديث المخزون لحظياً عند بيع أي كاشير آخر (تعدد نقاط البيع).
- اختبار حي: اتصال → بيع تجريبي وصل كـSSE خلال أقل من 10 ثوانٍ عبر localhost وعبر nt-commerce.net؛ الصندوق 11300؛ أرصدة الحسابات صُفّرت بعد التنظيف.
- release 20260820_004454 — bundle main.94dccdb8.js

## p192 — المرحلة 3.4: منسّق Sagas + saga تجهيز الطلبات الإلكترونية (2026-08-20) — نهاية المرحلة 3
**قبل:** لا تنسيق للتدفقات متعددة الخطوات؛ ومعالج ecom_order.confirmed كان يخصم حقل stock وهمياً (خلل حقيقي — المخزون الفعلي quantity لا يُخصم أبداً عبر EDA).
**بعد:**
- services/saga.py (جديد): SagaStep(action, compensate) + run_saga بحالة مُديمة في مجموعة sagas لكل مستأجر (running/completed/compensating/compensated/compensation_failed + حالة كل خطوة ووقتها وخطأها) + compensate_saga لتعويض saga مكتملة لاحقاً (إلغاء). الخطوة الفاشلة نفسها تُعوَّض أيضاً (آثار جزئية) — أُصلح بعد اختبار حي كشف تسريب خصم.
- saga ecom_fulfillment: deduct_stock (خصم ذرّي محروس $gte على quantity — إصلاح خلل stock) → mark_order (stock_reserved) → notify (إشعار)؛ التعويضات: إرجاع المخزون / إلغاء التعليم / حذف الإشعار. idempotent: saga واحدة running/completed لكل طلب.
- الإلغاء: compensate_saga تستعيد كل العناصر (المسار المُديم بلا _deducted) — أُصلح بعد اختبار كشف أن التقدم كان في الذاكرة فقط.
- اختبارات حية: نجاح كامل (3 خطوات done + حجز + إشعار)؛ فشل جزئي (نقص مكوّن ثانٍ → compensated وصفر تسريب)؛ إلغاء بعد الاكتمال (استعادة كاملة 5/5 + cancelled + حذف الإشعار).
- لا تغيير واجهة. تنظيف كامل لبيانات الاختبار.

## p193 — قيود تلقائية للمشتريات والمصاريف + إصلاح تكرار متعدد العمال (2026-08-20)
**قبل:** المشتريات والمصاريف بلا قيود تلقائية.
**بعد:**
- حسابان جديدان في الدليل التلقائي: 401 الموردون (liability)، 610 مصاريف التشغيل (expense).
- purchases_routes: حدث purchase.recorded عبر outbox → قيد (مدين 380 المخزون بالإجمالي / دائن الصندوق بالمدفوع + دائن 401 بالمتبقي).
- expenses_routes: حدثا expense.created (مدين 610 / دائن الصندوق) وexpense.deleted (قيد عكسي)؛ مصاريف USD تُتخطى (الصندوق حُسم لحظة شراء الدولار).
- إصلاحان اكتشفهما الاختبار الحي تحت 4 عمال uvicorn:
  1. ensure_accounts سباق بذر الدليل (E11000) → إعادة جلب الفائز عند التكرار.
  2. مرحّل الـoutbox كان ينشر الصف نفسه من عدة عمال → ادّعاء ذرّي find_one_and_update (in_progress + استرداد بعد 60 ث) + فهرس فريد sparse على journal_entries(reference_id, source_tag).
- اختبار حي نهائي: شراء 500 نقدي → قيد واحد فقط (380:500/530:500)؛ مصروف 50 → قيد واحد (610:50/530:50)؛ المجموع 2 بالضبط. حذف المصروف → قيد عكسي مطابق.
- الصندوق 11300 سليم، القيود والأرصدة نظيفة، الدليل (12 حساباً) محفوظ.
- لا تغيير واجهة.

## p194 — توسيع التزامن الفوري (SSE): صفحة المنتجات + لوحة التحكم — 2026-08-20

**قبل:** الاشتراك في أحداث SSE كان محصوراً في صفحة نقطة البيع (p191)؛ صفحة المنتجات ولوحة التحكم تتطلبان تحديثاً يدوياً لرؤية تغيّر المخزون/الإحصاءات بعد أي عملية.

**بعد:**
- `ProductsPage.js`: اشتراك في `sale.completed` / `sale.refunded` / `sale.deleted` / `purchase.recorded` → إعادة جلب المنتجات فورياً؛ استخدام `useRef` لأحدث نسخة من `fetchProducts` لتفادي الـ stale closure مع الفلاتر/الترقيم.
- `DashboardPage.js`: اشتراك في `sale.completed` / `sale.refunded` / `sale.deleted` / `purchase.recorded` / `expense.created` / `expense.deleted` → إعادة جلب بيانات اللوحة صامتاً (دون spinner).
- لا تغيير في الخلفية؛ نقطة `/api/events/stream` (p191) هي المصدر.
- نسخة احتياطية: `/opt/ntcommerce/backups/p194/`
- إصدار الواجهة: **20260820_111100** — الحزمة `main.e5c5947f.js`
- تحقق: esbuild OK للصفحتين؛ الحزمة المباشرة تحتوي سلاسل `events/stream` و`purchase.recorded` و`sale.refunded`؛ `/api/events/stream` يرد 200 text/event-stream عبر Cloudflare/nginx؛ `/api/health` = ok.

## p195 — القيود الآلية لتسوية الديون + تغليفة ACID لمساري التسوية — 2026-08-20

**قبل:** تحصيل دين عميل أو سداد مورد كان يحرّك الصندوق والذمم دون أي قيد يومية — الحلقة الأخيرة الناقصة في سير العمل المحاسبي المتكامل. مسارا التسوية غير ذرّيين (كتابات متعددة بلا معاملة).

**بعد:**
- `services/balances.py`: معامل `session=None` اختياري في `allocate_customer_payment` / `allocate_supplier_payment` / `adjust_customer_mirror` / `adjust_supplier_mirror` (توافق كامل مع كل المستدعين الحاليين).
- `routes/customer_debts_routes.py`: المساران `POST /customers/{id}/debt/pay` و`POST /supplier-debts/pay` مغلّفان بمعاملة Mongo ذرّية (تخصيص FIFO + سجل الدفعة + حركة الصندوق + حدث outbox يلتزم أو يُجهض معاً)؛ حدثا `customer.payment_received` و`supplier.payment_made`؛ حقل `settlement_id` إضافي على معاملة المورد للتتبع.
- `services/accounting_auto.py`: `post_customer_payment_entry` (مدين الصندوق / دائن 411) و`post_supplier_payment_entry` (مدين 401 / دائن الصندوق) — منع التكرار عبر (reference_id, source_tag).
- `services/event_consumers.py`: معالجان جديدان — الإجمالي **15 معالجاً**.
- `DashboardPage.js`: اشتراك الحدثين الجديدين → تحديث اللوحة لحظياً عند أي تسوية.
- نسخة احتياطية: `/opt/ntcommerce/backups/p195/` — إصدار الواجهة: **20260820_112849** — الحزمة `main.ca5b855d.js`

**الاختبار الحي (curl):** تجهيزات مباشرة (عميل + بيع آجل 300، مورد + شراء آجل 500) → تحصيل 300 نقداً: قيد متوازن Dr 530 / Cr 411، الصندوق 11300→11600، البيع `paid` → سداد 500 من البنك: قيد متوازن Dr 401 / Cr 514، البنك −500، الشراء `paid` → الاختباران السالبان (دفع بلا دين) 400 مع **صفر كتابات جزئية** (إجهاض ذرّي) → قيدان فقط رغم 4 عمال (منع التكرار يعمل) → تنظيف كامل: قيود=0، أرصدة الحسابات=0، الصندوق=11300، صفر مخلفات.

## p196 — ميزان المراجعة من قيود اليومية + توسيع أحداث التسوية لوحدة الديون — 2026-08-20

**قبل:** `/api/accounting/reports/trial-balance` كان يقرأ مرآة أرصدة الحسابات الحية دون احترام تاريخ `as_of_date`؛ وحدة الديون العامة `/api/debts/{id}/pay` (المسار الافتراضي virt- واليدوي) كانت خارج التغليفة الذرّية وبلا قيود آلية؛ لا صفحة واجهة لميزان المراجعة؛ فهرس `expense_number` الفريد كان يتصادم على null لمصاريف الواجهة.

**بعد:**
- `routes/accounting/accounting_routes.py`: ميزان المراجعة يُحسب من **سطور قيود اليومية** مع `date <= as_of_date` (تجميع مجاميع مدين/دائن لكل حساب + عدد السطور + تفصيل آلي/يدوي + `is_balanced`)؛ إصلاح 500 عند إنشاء قيد يدوي (pop _id).
- `routes/debts_routes.py`: مسارا الدفع (الافتراضي المرتبط برصيد الطرف، واليدوي على سجل دين) مغلّفان بمعاملة Mongo ذرّية + حدثا `customer.payment_received` / `supplier.payment_made` عبر outbox — يعيدان استخدام معالجَي p195 وقيدَيه (411/الصندوق، 401/الصندوق).
- `main.py`: فهرس `expense_number` الفريد أصبح `sparse` (المستندات بلا الحقل لا تتصادم على null).
- الواجهة: صفحة جديدة `AccountingPage.js` (اختيار التاريخ + جدول الميزان + شارة التوازن + عدادات القيود) على المسار `/accounting`، وعنصر قائمة «ميزان المراجعة» في قسم المالية.
- نسخة احتياطية: `/opt/ntcommerce/backups/p196/` — إصدار الواجهة: الحزمة `main.7b996ab5.js`

**التحقق الحي (curl):** ميزان فارغ متوازن (0 قيود) → مصروف 200 من الخزنة: 610 مدين/532 دائن → سداد دين افتراضي 100 نقداً: 530 مدين/411 دائن → دين يدوي 150 + سداده: قيد ثانٍ → السالب (دفع يتجاوز المتبقي) 400 → الميزان متوازن في كل خطوة (entries=4) → تاريخ سابق 2026-08-19 يعيد 0 قيود (التاريخ مُحتَرم) → الحزمة المباشرة تحمل `trial-balance-table` → تنظيف دقيق: بقي القيد الحقيقي JE000001 (فاتورة INV-20260820-0005)، الصندوق 11300.88، صفر مخلفات.

**ملاحظة:** مرآة `accounts.balance` أُعيد تصفيرها سابقاً وتنحرف عن سطور اليومية — الميزان الجديد لا يعتمد عليها؛ مزامنتها إصلاح بيانات مستقل مؤجل.

## p197 — قائمة الدخل من سطور اليومية — 2026-08-20

**قبل:** لا قائمة دخل مبنية على القيود؛ التقارير القديمة (SmartReporterAgent) تحسب من مستندات البيع/المصاريف لا من اليومية.

**بعد:**
- `routes/accounting/accounting_routes.py`: مسار جديد `GET /api/accounting/reports/income-statement?start_date&end_date` — يجمع سطور القيود في النافذة الزمنية: فئة 7 إيرادات (دائن−مدين)، فئة 60x تكلفة بضاعة مباعة، باقي فئة 6 مصاريف تشغيل؛ يعيد `revenue_total / cogs_total / gross_profit / operating_total / net_profit` مع تفصيل الحسابات و`entries_count` و`basis=journal_lines`.
- `AccountingPage.js`: بطاقة «قائمة الدخل» بين الميزان والقيود — نطاق شهر-حتى-التاريخ مشتق من منتقي التاريخ نفسه (لا عناصر تصميم جديدة)؛ تتحدث لحظياً عبر اشتراك SSE القائم.
- نسخة احتياطية: `/opt/ntcommerce/backups/p197/` — إصدار الواجهة: **20260820_145619** — الحزمة `main.5c21d506.js`

**الاختبار الحي (curl):** البيانات الحقيقية وحدها: إيرادات 140,580 / تكلفة 142,000 / مجمل −1,420 / صافي −1,420 (قيد واحد) → مصروف تجريبي 300 من الخزنة: مصاريف تشغيل 300 وصافي −1,720 (قيدان) → تنظيف دقيق: بقي JE000001 الحقيقي فقط، الخزنة 0، الصندوق 11300.88 → الحزمة المباشرة تحمل كل testid الخاصة بقائمة الدخل وCSS/JS بـ 200.

## p198 — الميزانية العمومية من سطور اليومية + مزامنة مرايا أرصدة الحسابات — 2026-08-20

**قبل:** لا ميزانية عمومية مبنية على القيود؛ مرآة `accounts.balance` منحرفة عن سطور اليومية (تصفير/حذفات تجريبية سابقة لم تُرخِ أثرها على المرايا).

**بعد:**
- إصلاح بيانات: إعادة حساب `accounts.balance` لكل حساب = مجموع (مدين−دائن) من سطور اليومية — 4 حسابات صُحّحت (530/532/610 إلى 0، 411 إلى 140,580) والمرايا الآن تطابق اليومية تماماً.
- `routes/accounting/accounting_routes.py`: مسار جديد `GET /api/accounting/reports/balance-sheet-journal?as_of_date` — أصول (3xx/4xx مدينة الطبيعة/5xx صناديق)، التزامات (401)، حقوق ملكية = نتيجة الفترة (7xx−6xx)، مع `is_balanced` حي.
- `AccountingPage.js`: بطاقة «الميزانية العمومية» بشارة توازن وجدول أصول/التزامات/حقوق ملكية — تتحدث لحظياً عبر SSE.
- نسخة احتياطية: `/opt/ntcommerce/backups/p198/` — إصدار الواجهة: **20260820_150746** — الحزمة `main.938a48a9.js`

**الاختبار الحي (curl):** البيانات الحقيقية: أصول = مخزون −142,000 + زبائن +140,580 = −1,420 = نتيجة الفترة −1,420 → متوازنة ✓ (المخزون السالب يكشف غياب الأرصدة الافتتاحية لما قبل عصر القيود الآلية) → تاريخ سابق يعيد صفراً متوازناً → الحزمة المباشرة تحمل كل testid الخاصة بالميزانية.

**ملاحظة:** المخزون المحاسبي سالب لأن المخزون الفعلي أُدخل قبل p190 دون قيد افتتاحي — الترشيح القادم: قيود الأرصدة الافتتاحية.

## p199 — قيود الأرصدة الافتتاحية + حساب رأس المال 101 — 2026-08-20

**قبل:** الميزانية العمومية (p198) أظهرت مخزوناً محاسبياً سالباً (−142,000) لأن مخزون المستأجر وأرصدة صناديقه وذممه أُدخلت قبل p190 بلا قيود افتتاحية؛ لا حساب رأس مال في المخطط؛ مسار الميزانية يتجاهل حسابات الفئة 1xx.

**بعد:**
- `services/accounting_auto.py`: حساب جديد في DEFAULT_ACCOUNTS — `("101", "رأس المال", "equity", None)` (يُزرع كسولاً عبر ensure_accounts الآمن ضد السباق).
- `routes/accounting/accounting_routes.py`:
  - `_compute_opening(tdb)`: أهداف اليومية = الواقع الفعلي — مخزون (Σ qty × purchase_price للمنتجات المخزّنة) + أرصدة الصناديق الحية + ذمم العملاء (Σ remaining>0 على المبيعات) + ذمم الموردين (Σ remaining>0 على المشتريات)؛ كل سطر = الهدف − صافي اليومية الحالي (**لا عدّ مزدوج** لما سجلته القيود الآلية)؛ رأس المال = الفرق الموازِن للقيد نفسه.
  - `GET /api/accounting/opening-balance/preview` — معاينة بلا كتابة: القيم الفعلية + سطور القيد + in_sync/already_applied.
  - `POST /api/accounting/opening-balance/apply` — قيد واحد approved/auto بعلامة source_tag="opening" ومرجع OPENING-n؛ حماية ثلاثية من التكرار: فحص مسبق 409 ← already_posted، والفهرس الفريد auto_entry_unique يلتقط سباق العمال الأربعة (DuplicateKeyError ← 409)، وforce=true يولّد قيد تسوية بالفرق تحت مرجع جديد (ويرفض 400 إن كانت الأرصدة متطابقة).
  - الميزانية العمومية: الفئة 1xx أُضيفت إلى حقوق الملكية (`equity_accounts` + `equity_capital` + نتيجة الفترة).
- الواجهة `AccountingPage.js`: بطاقة «الأرصدة الافتتاحية» — شارة حالة، شارات القيم الفعلية الأربع، جدول السطور مدين/دائن، زر الترحيل (تأكيد + تعطيل أثناء التنفيذ)، ورسالة تطابق عند in_sync؛ تتحدث مع باقي البطاقات.
- نسخة احتياطية: `/opt/ntcommerce/backups/p199/` — إصدار الواجهة: **20260820_162334** — الحزمة `main.f32f609f.js`

**الاختبار الحي (curl):** معاينة: مخزون 15,152,476.80 (7,411 منتجاً) + صناديق −19,299.12 + ذمم عملاء 6,866,726.83 (149 مبيعاً) + ذمم موردين 10,175,692 (32 شراءً) ← القيد JE000002 متوازن 22,031,924.51 = مدين 380 (15,294,476.80)/411 (6,726,146.83)/530 (11,300.88)، دائن 401 (10,175,692)/533 (30,600)/101 (11,825,632.51) ← الميزانية: أصول 21,999,904.51 = التزامات 10,175,692 + حقوق ملكية 11,824,212.51 (رأس مال 11,825,632.51 + نتيجة −1,420) متوازنة والمخزون **موجب** ← تطبيق ثانٍ 409 ← force بلا فرق 400 ← معاينة بعد الترحيل in_sync=true بلا سطور ← ميزان المراجعة متوازن (قيدان) ← قائمة الدخل دون تغيير (صافي −1,420) ← مرايا accounts تطابق اليومية ← الحزمة المباشرة تحمل كل testid الخاصة بالبطاقة.

**ملاحظة:** الصندوق «المال الخاص» (533) برصيد فعلي سالب (−30,600) رُحّل كما هو بسطر دائن — يعكس الواقع التشغيلي ولا يُجمَّل.

## p200 — دفتر الأستاذ العام من سطور اليومية + صفوف ميزان قابلة للضغط — 2026-08-20

**قبل:** ميزان المراجعة (p196) يعرض مجاميع الحسابات فقط بلا تفصيل حركة كل حساب؛ لا سبيل لرؤية سطور قيود حساب معيّن برصيد جارٍ.

**بعد:**
- `routes/accounting/accounting_routes.py`: مسار جديد `GET /api/accounting/ledger/{account_code}?start_date&end_date` — رصيد افتتاحي (صافي سطور الحساب قبل start_date)، ثم كل سطر في النافذة (تاريخ/رقم قيد/وصف/مصدر/مدين/دائن) مرتباً بـ (date, created_at) مع **رصيد جارٍ**، ومجاميع مدين/دائن ورصيد ختامي؛ basis=journal_lines (لا مرايا)؛ 404 لحساب مجهول، 400 لنطاق زمني مقلوب، end_date افتراضياً اليوم.
- الواجهة `AccountingPage.js`: صفوف ميزان المراجعة قابلة للضغط (تمييز الصف المحدد + ضغطة ثانية للإغلاق) ← بطاقة «دفتر الأستاذ» بين الميزان وقائمة الدخل — سطر رصيد افتتاحي + جدول السطور بالرصيد الجارٍ + سطر ختامي بالمجاميع؛ تُعيد الجلب عند تغيّر التاريخ/الحساب وتتحدث عبر اشتراك SSE القائم.
- نسخة احتياطية: `/opt/ntcommerce/backups/p200/` — إصدار الواجهة: **20260820_164905** — الحزمة `main.45bc23c6.js`

**الاختبار الحي (curl):** 380: افتتاحي 0 + JE000001 (دائن 142,000 ← −142,000) + JE000002 (مدين 15,294,476.80 ← ختامي 15,152,476.80 يطابق الميزانية) ← 530 ختامي 11,300.88 يطابق القيمة المرجعية ← 411: 140,580 (بيع حقيقي) + 6,726,146.83 (افتتاحي) ← 6,866,726.83 ← 101 ختامي −11,825,632.51 (دائن الطبيعة) ← نافذة سابقة (حتى 2026-08-19) صفر سطور متوازنة ← حساب مجهول 999 ← 404 ← نطاق مقلوب ← 400 ← esbuild OK ← الحزمة المباشرة تحمل ledger-card/ledger-table/ledger-opening-balance/ledger-closing-balance/ledger-row- ← /api/health = ok. **صفر لمس للبيانات الحقيقية (قراءة فقط).**

## p201 — سد ثغرة تعديل المصروف: قيد تسوية آلي + تغليفة ACID لمسار PUT — 2026-08-20

**قبل:** `PUT /api/expenses/{id}` كان يعكس الصندوق ويخصم من جديد عند تغيّر المبلغ/الصندوق لكنه يترك قيد p193 القديم بلا تحديث — اليومية تنحرف عن الواقع؛ والكتابات الأربع بلا معاملة.

**بعد:**
- `routes/expenses_routes.py`: مسار التعديل مغلّف بمعاملة Mongo ذرّية (عكس الصندوق + خصم جديد + تحديث المصروف + حدث outbox تلتزم أو تُجهض معاً)؛ عند أي تغيير مالي يُصدر `expense.updated` بحمولة (adjustment_id فريد + المبلغ/الصندوق القديم والجديد + العملة).
- `services/accounting_auto.py`: `post_expense_adjustment` — قيد واحد متوازن = عكس القيد القديم (إن وُجد) + قيد بالقيم الجديدة (إن انطبقت: DZD + صندوق)؛ منع تكرار عبر adjustment_id؛ مصاريف USD تبقى خارج اليومية اتساقاً مع p193.
- `services/event_consumers.py`: معالج `handle_expense_updated` — الإجمالي **16 معالجاً**.
- الواجهة `AccountingPage.js`: اشتراك `expense.updated` في SSE ← بطاقات المحاسبة تتحدث لحظياً عند تعديل مصروف.
- نسخة احتياطية: `/opt/ntcommerce/backups/p201/` — إصدار الواجهة: **20260820_172114** — الحزمة `main.2c8bbdb1.js`

**الاختبار الحي (curl، موسوم TEST-P201 على الخزنة):** إنشاء 300 من الخزنة ← JE قيد expense متوازن (610/532) والخزنة −300 ← تعديل المبلغ 500 ← قيد expense_adjustment متوازن (عكس 300 + قيد 500) والخزنة −500 و610 = 500 ← تغيير الصندوق إلى المحفظة ← تسوية ثانية تنقل 500 من 532 إلى 531 (الخزنة 0، المحفظة −500) ← تعديل عنوان فقط ← **صفر قيود جديدة** ← حذف المصروف ← عكسي 500 يصفّر المحفظة و610 ← صافي القيود التجريبية = 0 لكل حساب ← تنظيف دقيق: حُذفت 4 قيود + 6 حركات تجريبية، بقي JE000001/JE000002 الحقيقيان فقط، الصناديق على لقطتها (cash 11300.88)، المرايا تطابق اليومية، ميزان المراجعة متوازن.

**ملاحظة:** سلوك قديم محفوظ عن قصد — المصروف بلا payment_method لا يُزامَن مع الصناديق ولا اليومية حتى بعد التعديل (sync_boxes يشترط صندوقاً سابقاً).

## p202 — سد ثغرة دفعات عقود التأجير: قيد آلي (الصندوق/701) + تغليفة ACID — 2026-08-20

**قبل:** `POST /api/rentals/contracts/{id}/payment` كان يحدّث العقد ويحرّك الصندوق بلا قيد يومية؛ لا حساب لإيراد التأجير في المخطط.

**بعد:**
- `services/accounting_auto.py`: حساب جديد في DEFAULT_ACCOUNTS — `("701", "إيرادات التأجير", "revenue", None)` (يُزرع كسولاً)؛ `post_rental_payment_entry` — مدين الصندوق / دائن 701، منع تكرار عبر payment_id بعلامة rental_payment. **قرار المعالجة**: العقود لا تولّد ذمماً أصلاً، فالإيراد يُثبَت عند التحصيل (دائن 701 لا 411).
- `routes/rental_routes.py`: `_add_cash` يقبل session اختيارياً (توافق كامل مع المستدعين)؛ مسار الدفع مغلّف بمعاملة Mongo ذرّية (تحديث العقد + الصندوق + حدث outbox تلتزم أو تُجهض معاً) يُصدر `rental.payment_received`.
- `services/event_consumers.py`: معالج `handle_rental_payment_received` — الإجمالي **17 معالجاً**.
- الواجهة `AccountingPage.js`: اشتراك `rental.payment_received` في SSE.
- نسخة احتياطية: `/opt/ntcommerce/backups/p202/` — إصدار الواجهة: **20260820_173304** — الحزمة `main.9aeaf01b.js`

**الاختبار الحي (curl، موسوم TEST-P202 على الخزنة):** أصل + عقد تجريبي (متوقع 500، بلا دفعة أولى/وديعة) ← دفعة 700: JE متوازن (مدين 532 / دائن 701)، الخزنة 700، العقد paid=700 ← دفعة 300: قيد ثانٍ متوازن، 701 = −1,000 ← قائمة الدخل تلتقط 701 تلقائياً (إيرادات 141,580 = 140,580 + 1,000؛ صافي −420) ← تنظيف دقيق: حُذف قيدان + حركتان + العقد + الأصل، الخزنة 0، الصندوق النقدي 11300.88، مرايا 532/701 أُعيدت لصافي اليومية (0)، بقي JE000001/JE000002 فقط، الميزان متوازن وقائمة الدخل عادت لصافي −1,420.

**ثغرات مكتشفة مجاورة (للخارطة):** الدفعة الأولى عند إنشاء العقد والوديعة (held/refund) ومسار الإغلاق (رسوم التأخير + تحويل المتبقي لدين عميل) كلها تحرّك مالاً/ذمماً بلا قيود بعد.

## p203 — سد ثغرة الدفعات المسبقة للموردين: خصم صندوق حقيقي + قيد آلي (402/الصندوق) + ACID — 2026-08-20

**قبل:** `POST /api/suppliers/{id}/advance-payment` كان يسجّل الدفعة ويحدّث `advance_balance` **دون خصم أي صندوق** (فجوة وظيفية — المال لا يغادر دفتر الصناديق) وبلا قيد يومية؛ لا حساب للسلف في المخطط. (الميزة غير مستخدمة بعد لدى المستأجر: 0 سجل.)

**بعد:**
- `routes/suppliers_core_routes.py`: الدفعة المسبقة تُخصم فعلياً من الصندوق المختار (+ سجل حركة supplier_advance)؛ تحقق: مبلغ > 0 (400)، صندوق موجود (404)؛ كل العمليات (صندوق + حركة + رصيد المورد + السجل + حدث outbox) في معاملة Mongo ذرّية واحدة.
- `services/accounting_auto.py`: حساب جديد `("402", "سلف الموردين", "asset", None)`؛ `post_supplier_advance_entry` — مدين 402 / دائن الصندوق، منع تكرار عبر payment_id بعلامة supplier_advance. **قرار المعالجة**: السلفة أصل مدفوع مقدماً (تُتتبع لكل مورد ولا تُقاص ضد المشتريات في النموذج الحالي) وليست تسوية دين (لها supplier.payment_made).
- `services/event_consumers.py`: معالج `handle_supplier_advance_paid` — الإجمالي **18 معالجاً**.
- الواجهة `AccountingPage.js`: اشتراك `supplier.advance_paid` في SSE.
- نسخة احتياطية: `/opt/ntcommerce/backups/p203/` — إصدار الواجهة: **20260820_174729** — الحزمة `main.5329b9d6.js`

**الاختبار الحي (curl، موسوم TEST-P203 على الخزنة):** مورد تجريبي ← دفعة 800 من الخزنة: الخزنة −800 + حركة مسجلة + المورد advance=800 + JE متوازن (مدين 402 / دائن 532) ← الميزانية تظهر 402 ضمن الأصول (800) وتبقى متوازنة ← مبلغ 0 ← 400 ← صندوق وهمي ← 404 ← تنظيف دقيق: قيد + حركة + سجل + مورد حُذفت، الخزنة 0، النقدي 11300.88، مرايا 402/532 أُعيدت لصافي اليومية (0)، بقي JE000001/JE000002 فقط والميزان متوازن.

## p204 — سد ثغرة دفع الأقساط (مدين الصندوق/دائن 411) + حسم طبيعة ثغرتين — 2026-08-20

**فحص الثغرتين المدرجتين أولاً:** `/wallet/settle-credit` (wallet_billing) و`/payments/records` (stripe_routes) كلاهما **على مستوى المنصة** (super admin، main_db — فوترة SaaS للمستأجرين) ولا يحرّكان مالاً في دفاتر المستأجر ← **لا قيد مطلوب في يومية المستأجر**؛ حُسما توثيقياً بلا تعديل كود.

**الثغرة الحقيقية الباقية كانت:** `POST /api/installments/{id}/pay` يحرّك الصندوق ورصيد العميل والبيع بلا قيد — بيع التقسيط كان يرحّل ذمته عبر sale.completed (مدين 411)، وتحصيل القسط بقي بلا قيد.

**بعد:**
- `routes/installments_routes.py`: مسار الدفع مغلّف بمعاملة Mongo ذرّية (القسط + الصندوق + الحركة + رصيد العميل + البيع + حدث outbox تلتزم أو تُجهض معاً)؛ يُصدر `installment.paid` فقط عندما يدخل مال فعلي لصندوق (طرق credit/none لا قيد لها — اتساقاً مع عدم حركة الصندوق).
- `services/accounting_auto.py`: `post_installment_payment_entry` — مدين الصندوق / دائن 411 (تحصيل ذمة، نفس شكل p195)؛ منع تكرار عبر installment_id (القسط يُدفع مرة) بعلامة installment_payment.
- `services/event_consumers.py`: معالج `handle_installment_paid` — الإجمالي **19 معالجاً**.
- الواجهة `AccountingPage.js`: اشتراك `installment.paid` في SSE.
- نسخة احتياطية: `/opt/ntcommerce/backups/p204/` — إصدار الواجهة: **20260820_180539** — الحزمة `main.7511c2de.js`

**الاختبار الحي (curl، تجهيزة موسومة TEST-P204: عميل + بيع تقسيط 600 + قسط معلّق):** دفع القسط إلى الخزنة: القسط paid، الخزنة +600، البيع remaining=0 ← status=paid، رصيد العميل 0، JE متوازن (مدين 532 / دائن 411) ← إعادة الدفع ← 400 (مدفوع مسبقاً) ← تنظيف دقيق: قيد + حركة + قسط + بيع + عميل حُذفت، الخزنة 0، النقدي 11300.88، مرآة 411 أُعيدت لصافي اليومية (6,866,726.83)، بقي JE000001/JE000002 فقط والميزان متوازن.

**بهذا تُسدّ ثغرات التغطية الخمس الأصلية كلها** (تعديل المصروف p201، دفعات التأجير p202، سلف الموردين p203، settle-credit/payments منصوية لا مستأجرة، الأقساط p204) — تبقى ثغرات التأجير المجاورة المكتشفة في p202.

## p205 — محرك عمولة المنصة: سجل أرباح الوساطة (شحن الجوال أولاً) — 2026-08-20

**قبل:** عمولة المشغّل (3%) كانت تمرّ كاملة للمشترك — المنصة لا تكسب شيئاً من كل عملية شحن تتوسطها، ولا يوجد أي سجل لأرباح المنصة من الوساطة. نموذج المالك: «أبيع للمشتركين بالجملة وهم يبيعون لزبائنهم وآخذ عمولة».

**بعد:**
- `services/commission_engine.py` (جديد): سجل `platform_commissions` في main_db — لكل عملية وساطة سجل واحد idempotent (فهرس فريد sparse `platform_commission_unique` على (reference_type, reference_id) في main.py)؛ الهامش = (عمولة المنصة% − عمولة المشترك%) × المبلغ؛ صفر هامش ← لا سجل. `reverse_platform_commission` يعكس السجل عند الفشل (idempotent).
- إعدادات المشغّلين: حقل جديد `platform_commission` لكل مشغّل (افتراضي = عمولة المشترك ← هامش صفر حتى يضبط المالك صفقته الحقيقية مع المشغّل) في `recharge_config_routes.py` (GET/PUT) ودمجه في `_get_effective_config` للشحن.
- `services/application/recharge_service.py`: بعد خصم المحفظة الناجح يُسجَّل هامش المنصة (meta: الهاتف + كود الشحنة)؛ وفي تراجع الـ saga تُعكس العمولة مع استرجاع المحفظة.
- `routes/recharge/bridge_routes.py`: عند نتيجة failed من الجسر ← استرجاع المحفظة + **عكس العمولة تلقائياً**.
- مساران لـ super admin في `saas/commission_routes.py`: `GET /api/saas/platform-commissions/summary?days=N` (الإجمالي + تفصيل بالخدمة + اليوم — earned فقط) و`GET /api/saas/platform-commissions/history`.
- نسخة احتياطية: `/opt/ntcommerce/backups/p205/` — لا تغيير واجهة (خلفية فقط).

**الاختبار الحي (curl، موسوم TEST-P205):** ضبط mobilis platform_commission=5 (المشترك 3) ← شحن محفظة المستأجر 500 تجريبي ← شحنة 100 دج (RE00001/26): تكلفة المشترك 97 محفوظة + **سجل PCOM-00001: هامش منصة 2.00 دج** (5%−3%) ← الملخص: total=2.0/count=1 ← المحفظة 403 ← تقرير فشل عبر الجسر: المحفظة تعود 500 + العمولة status=reversed + الملخص يصفّر ← إعادة تقرير الفشل: idempotent بلا أثر مزدوج ← **تنظيف دقيق**: حُذفت (شحنة + بيع FLEXY + حركة صندوق + مهمة جسر + سر الجسر التجريبي + 3 حركات محفظة + تنبيه رصيد + سجل العمولة + تجاوز الإعدادات)، الصندوق النقدي أُعيد لـ **11300.88** بالضبط، محفظة المستأجر 0، الجلسات اليومية أُعيدت لقيمها (خصم التنظيف طال 3 جلسات بدل واحدة فرُدَّ الفرق للجلستين غير المعنيتين: 0/0 و32 عملية كما كانتا).

**ملاحظات:** الهامش يُحسب عند الإنشاء ويُعكس عند الفشل — لا يوجد مسار نجاح صريح (الشحنة pending حتى يؤكدها الجسر)، فالهامش «مكتسب مبدئياً» ويُسحب عند الفشل. الخطوة الطبيعية التالية لتعميم النموذج: خدمات IPTV (digital_panel) وAI (قياس تكلفة التوكنز لكل مستأجر) بنفس المحرك عبر record_platform_commission.

## p206 — محاسبة دورة التأجير كاملة (وديعة 203 + دفعة أولى + إغلاق) + إصلاح سباق ترقيم القيود — 2026-08-20

(الرقم p205 حجزته جلسة موازية لمحرك عمولات المنصة — ef11a5c — فأخذت هذه المرحلة الرقم p206 لتفادي التصادم.)

**قبل:** الدفعة الأولى والوديعة عند إنشاء العقد ومسار الإغلاق (استرجاع/مصادرة الوديعة + تحويل المتبقي لدين) كلها تحرّك مالاً/ذمماً بلا قيود؛ إنشاء العقد والإغلاق بلا معاملات ذرّية؛ الميزانية لا تعرض الفئة 2xx.

**بعد:**
- `services/accounting_auto.py`: حساب جديد `("203", "ودائع أمانات العملاء", "liability", None)`؛ أربع دوال: `post_rental_deposit_held` (الصندوق/203)، `post_rental_deposit_refund` (203/الصندوق)، `post_rental_deposit_kept` (203/701 — المصادرة إيراد)، `post_rental_close_billed` (411/701 — المتبقي غير المحصّل مع رسوم التأخير)؛ كلها بمنع تكرار.
- **إصلاح سباق حقيقي**: `_insert_entry` كان يحسب entry_number=count+1 — حدثان متزامنان (دفعة+وديعة عند الإنشاء) التقطا الرقم نفسه فرفض الفهرس الفريد أحدهما وضاع قيد الوديعة (E11000). الآن إعادة محاولة بعدد جديد (حتى 4) مع إبقاء تعارض auto_entry_unique يتصاعد لمنع التكرار.
- `routes/rental_routes.py`: إنشاء العقد وإغلاقه مغلّفان بمعاملتي Mongo ذرّيتين؛ أحداث outbox: الدفعة الأولى تعيد استخدام `rental.payment_received` (p202)، وجديدة: `rental.deposit_held` / `rental.deposit_refunded` / `rental.deposit_kept` / `rental.close_billed`؛ المتبقي بلا عميل لا يولّد قيداً (اتساقاً مع المرآة).
- `services/event_consumers.py`: 4 معالجات جديدة — الإجمالي **23 معالجاً**.
- `accounting_routes.py`: الميزانية تعرض التزامات الفئة 2xx (203).
- الواجهة: اشتراك SSE للأحداث الأربعة.
- نسخة احتياطية: `/opt/ntcommerce/backups/p206/` — إصدار الواجهة: **20260820_190800** — الحزمة `main.aed9ecb5.js`

**الاختبار الحي (curl، موسوم TEST-P206 على الخزنة):** عقد بدفعة أولى 200 + وديعة 300 ← قيدا (532/701) و(532/203) ← دفعة 100 ← قيد ثالث ← إغلاق باسترجاع الوديعة: قيد استرجاع (203/532) + قيد متبقٍّ (411/701 بـ200) — إيراد 701 = 500 = إجمالي العقد بلا عدّ مزدوج، ذمة 411 = 200 تطابق مرآة العميل ← عقد ثانٍ بوديعة 150 مصادَرة: (532/203) ثم (203/701) ← كل القيود السبعة متوازنة ← تنظيف دقيق: صفر مخلفات، الخزنة 0، النقدي 11300.88، مرآة 411 = 6,866,726.83، الميزان متوازن (قيدان حقيقيان فقط).

**ملاحظة:** حدثا p202 التجريبيان ظهرا في الـ outbox بنفس رقم العقد (RNT-20260820-0001 يُعاد توليده يومياً) — منع التكرار عبر payment_id تصدّى لهما فلم تتكرر قيودهما.

## p207 — الملخص الضريبي من سطور اليومية (استبدال حساب المستندات) — 2026-08-20

**قبل:** `/api/accounting/reports/tax-summary` مرّر لـ TaxAssistantAgent الذي جمع **كل مستندات البيع للسنة** (131,543,503.50 — لا علاقة له بالقيود) وطابقت مصاريفه على حقل `expense_date` غير الموجود (مصاريف = 0 دائماً) وتجاهل period الشهري (2026-08 = السنة كلها).

**بعد:** `routes/accounting/accounting_routes.py`: المسار يُحسب من سطور اليومية في النافذة — إيرادات 7xx (دائن−مدين)، تكلفة 600، مصاريف 6xx الأخرى؛ الدخل الخاضع = max(0, إيرادات − تكلفة − تشغيل)؛ period = YYYY أو YYYY-MM (400 لغيرهما)؛ نفس مفاتيح الاستجابة القديمة + window/cogs_total/operating_total/تفصيل الحسابات/entries_count/basis=journal_lines. لا واجهة (لا مستهلك أمامي للمسار).

**الاختبار الحي (curl):** قبل: 2026-08 ← إيراد 131.5M ومصاريف 0 (خاطئ) ← بعد: 2026-08 ← إيراد 140,580 (700 فقط) وتكلفة 142,000 وخاضع 0 وتقدير 0 — يطابق قائمة الدخل تماماً ← 2026 (سنوي) نفس القيم (القيود كلها في أوت) ← period=20 ← 400 ← صفر لمس للبيانات.

## p208 — واجهة القيد اليدوي في صفحة المحاسبة — 2026-08-21

**قبل:** القيود اليدوية كانت ممكنة عبر API فقط (POST /accounting/journal-entries موجود منذ p196) — لا نموذج في الواجهة، ولا زر اعتماد للقيود المعلّقة.

**بعد:** `frontend/src/pages/AccountingPage.js` فقط (لا تغيير خلفية — الفحص أكد أن الإنشاء يحدّث مرايا الأرصدة فوراً وأن approve يقلب الحالة فقط، والتقارير كلها من سطور القيود فتتجاهل الحالة: السلوك متسق):
- زر «قيد يدوي جديد» في ترويسة بطاقة اليومية (je-new-button) يفتح حواراً (je-dialog): تاريخ + مرجع + وصف + سطور ديناميكية (حساب من قائمة /accounting/accounts + مدين + دائن)، إضافة/حذف سطور (بحد أدنى سطرين)، إجماليان حيّان وشارة توازن (je-total-debit / je-total-credit / je-balance-status)، ولا يُرسل إلا قيداً متوازناً بوصف.
- القيد يُولد pending؛ عمود «إجراء» جديد في جدول القيود به زر اعتماد (je-approve-*) للمعلّقة فقط عبر PUT /journal-entries/{id}/approve.
- السطور تُرسل بـ account_id + account_code + account_name حتى تلتقطها التقارير (الميزان/الدفتر) والمرايا معاً.
- نسخة احتياطية: `/opt/ntcommerce/backups/p208/` (الحالة قبل p208 مستعادة من git HEAD) — إصدار الواجهة: **20260820_193229** — الحزمة `main.6ba2e05a.js` (تحقق من السلاسل اللاتينية: je-new-button/je-dialog/je-total-debit/je-balance-status/je-submit/je-approve-/je-add-line كلها موجودة).

**الاختبار الحي (curl، موسوم TEST-P208):** قيد غير متوازن (100/90) ← 400 ← متوازن 100 (610 مدين / 532 دائن) ← 201 JE000003 بحالة pending ← يظهر فوراً في ميزان المراجعة (610 مدين 100) وفي دفتر 610 برصيد جارٍ 100 ← اعتماد ← 200 ← إعادة الاعتماد ← 404 ← تنظيف دقيق: حذف القيد + إعادة مزامنة مرآتي 610/532 إلى 0 — بقيت القيود الحقيقية فقط (JE000001/JE000002)، الميزان متوازن (22,172,504.51 = 22,172,504.51)، النقدي 11300.88 بلا مساس.

## p209 — قفل السنة المالية (ترحيل النتيجة إلى رأس المال + قفل الفترة) — 2026-08-21

**قبل:** لا يوجد إقفال سنوي — حسابات النتائج 6xx/7xx تتراكم عبر السنوات ولا شيء يمنع قيوداً بتاريخ فترة منتهية.

**بعد:**
- `services/accounting_auto.py`: `_insert_entry` يقبل الآن `date=` (تجاوز تاريخ اليوم — قيد الإقفال يؤرخ YYYY-12-31) و`extra=` (حقول إضافية مثل fiscal_year). لا تغيير على أي مستدعٍ حالي.
- `routes/accounting/accounting_routes.py`:
  - `GET /accounting/fiscal-close` ← السنوات المقفلة؛ `GET /fiscal-close/preview?year=YYYY` ← نتيجة السنة (7xx − 6xx من سطور اليومية، باستثناء قيود الإقفال نفسها حتى تبقى المعاينة ثابتة) + تفصيل الحسابات؛ `POST /fiscal-close {year}` ← قيد إقفال واحد معتمد: كل 7xx يُمدَّن بصافيه الدائن، كل 6xx يُدان بصافيه المدين، والفرق (ربح/خسارة) إلى 101 رأس المال. منع تكرار لكل سنة (409) عبر reference_id=CLOSE-YYYY + الفهرس الفريد؛ القيد نفسه هو القفل (fiscal_year على الوثيقة).
  - **قفل فعلي**: إنشاء قيد (create_journal_entry) أو اعتماد قيد معلّق بتاريخ داخل سنة مقفلة ← 403.
- الواجهة /accounting: بطاقة «إقفال السنة المالية» (fiscal-close-card) — حقل سنة + شارة حالة (مقفلة/مفتوحة) + إيرادات/مصاريف/نتيجة + زر ترحيل بتأكيد؛ جلب المعاينة منفصل عن fetchAll حتى لا يجمّد إدخال سنة ناقصة بقية البطاقات.
- نسخة احتياطية: `/opt/ntcommerce/backups/p209/` — إصدار الواجهة: **20260820_194511** — الحزمة `main.7f6e9607.js`.

**الاختبار الحي (curl، موسوم TEST-P209 على سنة 2025 الفارغة):** قيدان معلقان (مصروف 500 + إيراد 1500) ← المعاينة: إيراد 1500 / مصروف 500 / نتيجة 1000 ← الإقفال: JE000005 مؤرخ 2025-12-31 معتمد ومتوازن (700 مدين 1500، 610 دائن 500، 101 دائن 1000) ← إعادة الإقفال 409 ← إنشاء قيد في 2025 ← 403 ← اعتماد القيد المعلّق من 2025 ← 403 ← صافي 6xx/7xx لسنة 2025 بعد الإقفال = 0 والميزان متوازن ← year=20 ← 400 ← تنظيف دقيق: حذف القيود الثلاثة + مزامنة المرايا (101: −11,825,632.51، 411: 6,866,726.83، 532/610: 0، 700: −140,580 — كلها طابقت) — بقيا القيدان الحقيقيان فقط، النقدي 11300.88.

## p210 — تنبيه DLQ الاستباقي (إكمال مراقبة ناقل الأحداث) — 2026-08-21

**قبل:** مراقبة DLQ موجودة (stats/dlq/replay/لوحة /saas-admin/event-bus) لكن **بلا تنبيه استباقي** — الحدث الفاشل بعد 3 محاولات يسقط في nt:events:dlq ولا يعلم أحد حتى يفتح المالك اللوحة صدفة.

**بعد:**
- `services/event_bus.py`: عند انتقال حدث إلى DLQ تُكتب وثيقة `platform_alerts` (type=event_dlq، الخطأ، المستأجر، acknowledged=false) — **بمنع تكرار**: تنبيه واحد مفتوح لكل event_id.
- `routes/saas/event_bus_routes.py`: `GET /admin/event-bus/alerts` (فلتر acknowledged + عداد المفتوحة) و`POST /admin/event-bus/alerts/{id}/ack` — كلاهما super-admin فقط؛ **إعادة التشغيل replay تُغلق تنبيهات الحدث تلقائياً** (resolved_by=replay).
- لوحة /saas-admin/event-bus: بطاقة تنبيهات حمراء أعلى الصفحة تظهر فقط عند وجود تنبيهات مفتوحة — لكل تنبيه زرّا «إعادة» (replay) و«تأكيد» (ack) — تُجلب مع التحديث التلقائي كل 5ث.
- نسخة احتياطية: `/opt/ntcommerce/backups/p210/` — إصدار الواجهة: **20260820_195732** — الحزمة `main.8af8a9e8.js`.

**الاختبار الحي:** حدث اصطناعي موسوم TEST-P210 ← _raise_dlq_alert كتب تنبيهاً واحداً والاستدعاء الثاني لم يكرره (منع التكرار يعمل) ← رمز المستأجر العادي ← 403 ← super admin: القائمة (مفتوحة=1) ← ack ← 200 ومفتوحة=0 ← إعادة ack لمعرّف وهمي ← 404 ← stats سليمة (dlq_len=0، ok 53/24س) ← تنظيف: حذف التنبيه الاصطناعي — صفر مخلفات.

## p211 — أرشفة دورية للـ outbox المنشور — 2026-08-21

**قبل:** أحداث outbox المنشورة (published) تبقى في الجدول للأبد — ينمو بلا حد ويثقل استعلامات relay (33 منشوراً حالياً، سيتضاعف مع الزمن).

**بعد:** `services/outbox.py`:
- `archive_published(main_db, older_than_days=30)`: ينقل المنشور الأقدم من 30 يوماً (OUTBOX_ARCHIVE_DAYS) إلى `outbox_archive` مع archived_at — upsert بـ $setOnInsert (لا نسخ مكررة) ثم حذف من outbox. **آمن مع 4 عمال**: كل صف يُحجز ذرّياً (published: True → "archiving") قبل النقل، والعالق "archiving" > 10د (عامل سقط) يُسترد. الصفوف المعلّقة/قيد النشر لا تُمس إطلاقاً.
- حلقة `_archive_loop` كل ساعة (OUTBOX_ARCHIVE_INTERVAL) تبدأ مع start_outbox_relay بعد 60ث استقرار.
- لا تغيير واجهة. نسخة احتياطية: `/opt/ntcommerce/backups/p211/`.

**الاختبار الحي (موسوم TEST-P211):** 4 وثائق اصطناعية (منشور 44ي + منشور 40ي + منشور يومان + معلّق 50ي) ← archive_published نقل الاثنين القديمين فقط إلى outbox_archive كاملين (payload + published=True + archived_at) ← الحديث والمعلّق بقيا في outbox ← تنظيف: حذف الوثائق الأربع من المجموعتين — outbox عاد إلى 33 (المنشورات الحقيقية بلا مساس)، archive فارغ.

## p212 — توحيد تقارير SmartReporterAgent مع تقارير اليومية — 2026-08-21

**قبل:** ثلاثة مسارات تقارير في accounting_routes كانت تفوّض لـ SmartReporterAgent بحساب مستندي خاطئ: profit-loss يجمع **كل مستندات البيع** في النافذة ويطابق المصاريف على حقل `expense_date` غير الموجود (= 0 دائماً)؛ balance-sheet لقطة مرايا لحظية **تتجاهل as_of_date**؛ cash-flow بنفس علة expense_date. لا مستهلك أمامي لهذه المسارات (الواجهة تستخدم balance-sheet-journal فقط).

**بعد:** `routes/accounting/accounting_routes.py`:
- مساعد مشترك `_jl_window_nets(tdb, start, end)` — صافي مدين لكل حساب من سطور اليومية في النافذة.
- `/reports/profit-loss` ← من السطور: إيرادات 7xx (دائن−مدين)، تكلفة 600، مصاريف 6xx الأخرى — **نفس مفاتيح الاستجابة القديمة** + تفصيل الحسابات + basis=journal_lines.
- `/reports/balance-sheet` ← من السطور حتى as_of_date فعلياً: نقدية 5xx + ذمم 411 + مخزون 380 + سلف 402 / موردون 401 + ودائع 2xx / رأس مال 1xx + نتيجة الفترة — نفس المفاتيح + prepaid/deposits/capital + balanced + basis.
- `/reports/cash-flow` ← كل حركة على حسابات الصناديق 5xx مُصنّفة بحسب حسابات المقابل في قيدها: تمويلي (1xx)، استثماري (3xx)، وإلا تشغيلي (مفصّل: مبيعات/تحصيل ذمم/مصاريف/مشتريات/ودائع) — نفس المفاتيح + basis.
- `services/ai/agents.py`: SmartReporterAgent وُسم **LEGACY** في docstring — يبقى فقط لسجل وكلاء AI، ممنوع للتقارير الجديدة.
- نسخة احتياطية: `/opt/ntcommerce/backups/p212/` — لا تغيير واجهة.

**الاختبار الحي (curl، قراءة فقط على البيانات الحقيقية):** profit-loss(أوت 2026): إيراد 140,580 / تكلفة 142,000 / صافي −1,420 — يطابق income-statement (net_profit −1,420) تماماً ← balance-sheet: أصول 21,999,904.51 = التزامات 10,175,692 + حقوق 11,824,212.51، balanced=true — يطابق balance-sheet-journal رقماً برقم ← cash-flow: صافي −19,299.12 = مجموع أرصدة الصناديق بالضبط (11,300.88 − 30,600)، مُصنّف تمويلياً (قيد الافتتاحي مقابل 101 — تصنيف صحيح) ← صفر كتابة على البيانات.

## p213 — إصلاح صفحة /auto-reports (القائمة الجانبية + الفرنسية) — 2026-08-21

**قبل (بَلاغ المالك):** صفحة https://nt-commerce.net/auto-reports تختفي فيها القائمة الجانبية اليسرى — لأن الصفحة **لم تكن مغلّفة بـ Layout إطلاقاً** (الصفحة الوحيدة بدونه)؛ وكل نصوصها عربية ثابتة — تبديل اللغة للفرنسية لا يغيّر شيئاً لأنها لا تستعمل useLanguage.

**بعد:** `frontend/src/pages/AutoReportsPage.js` أُعيدت كتابتها: مغلّفة بـ `<Layout>` في كل حالات العرض (بما فيها حالة التحميل — فالقائمة لا تختفي أبداً) + دعم كامل للغتين عبر useLanguage: العناوين، الشارات (يومي/Quotidien...)، الإحصاءات، التوست، التواريخ والأرقام (ar-DZ/fr-FR)، والعملة (دج/DA). لا تغيير تصميم — نفس البطاقات والألوان.

**الاختبار:** esbuild سليم ← بناء + نشر ← الحزمة `main.504e9605.js` تحوي السلاسل الفرنسية (Rapport quotidien / Actualiser / Hebdomadaire / Total rapports / Performance employés) ← API /auto-reports يستجيب 200 ← الموقع 200. إصدار الواجهة: **20260820_201637**. نسخة احتياطية: `/opt/ntcommerce/backups/p213/`.

## p214 — زر الرجوع للخلف في التنقل — 2026-08-21

**بعد:** `frontend/src/components/Layout.js`: زر «رجوع/Retour» في ترويسة سطح المكتب (قبل البحث) وفي ترويسة الجوال (قبل زر القائمة) — navigate(-1)، يختفي في الصفحة الرئيسية، واتجاه السهم يتبع RTL (يمين في العربية). الحزمة: `main.504e9605.js` ثم أُعيد بناؤها ضمن p216 — إصدار **20260820_203734**. نسخة: backups/p214.

## p215 — السلة تبقى عند التنقل بين الصفحات — 2026-08-21

**قبل (بَلاغ المالك):** إضافة منتجات للسلة في POS ثم الانتقال لصفحة أخرى والعودة = سلة فارغة — الحالة كانت useState محلية تموت مع الخروج من الصفحة.

**بعد:** `frontend/src/hooks/usePOSCart.js`: السلة النشطة (الأصناف + الخصم + نمطه + المدفوع + طريقة/نوع الدفع + المبالغ المختلطة + وضع الإرجاع + الملاحظة) تُحفظ في localStorage عند كل تغيير وتُستعاد عند فتح POS — مفتاح `posActiveCart:<user_id>` (معزول لكل مستخدم على نفس المتصفح)؛ تُمسح عند clear/إتمام البيع. منفصلة عن ميزة السلات المعلّقة الموجودة (posParkedCarts). لا تغيير تصميم.

## p216 — سداد الدين في الحصة المفتوحة + اختيار الصندوق — 2026-08-21

**قبل (بَلاغ المالك):** سداد الدين لا يُسجَّل في حصة اليوم المفتوحة (عند الإغلاق يظهر فائض غير مفسَّر) واختيار الصندوق مقتصر على ثلاثة أزرار ثابتة.

**بعد:**
- `routes/customer_debts_routes.py`: سداد دين الزبون يتحقق أن الوجهة **صندوق حقيقي** (400 لغير الموجود)، ويلحق الدفعة وسجل الصندوق **بحصة الموظف المفتوحة** (session_id على السجلين) ويعيد session_attached في الاستجابة — كله داخل المعاملة الذرّية الموجودة.
- `routes/daily_sessions_routes.py`: عند الإغلاق تُحسب حركات الديون على الصندوق النقدي داخل نافذة الحصة (تحصيلات الزبائن تُضاف، مدفوعات الموردين تُطرح) — expected_cash = افتتاحي + مبيعات نقدية + تحصيلات − مدفوعات؛ نفس التصحيح في ملخص الحصص.
- الواجهة: قائمة منسدلة بكل الصناديق الحقيقية الستة مع أرصدتها (debt-pay-box-select) بدل الأزرار الثلاثة، والتوست يذكر «سُجّل في حصتك المفتوحة» عند الإلحاق.
- نسخة: backups/p216 — إصدار الواجهة **20260820_203734** — الحزمة `main.93a42659.js`.

**الاختبار الحي (موسوم TEST-P216):** صندوق وهمي ← 400 ← دفع 400 في «الخزنة» ← أُلحق تلقائياً بحصة المستأجر الحقيقية المفتوحة + قيد آلي (532/411 بـ400) ← دفع 300 في «النقدي» ← session_attached=true + قيد (530/411) ← استعلام نافذة الإغلاق الجديد يلتقط الحركتين فعلاً (300 التجريبية + 0.88 حقيقية) ← تنظيف دقيق: حذف قيدين + دفعتين + حركتين + الزبون والبيعة التجريبيان، الصناديق عادت للقطة (النقدي 11300.88، الخزنة 0)، المرايا مزامَنة (530/532/411)، القيدان الحقيقيان فقط باقيان. **لم تُغلق حصة المستأجر الحقيقية — بقيت مفتوحة كما هي.**

## p217 — العلامة التجارية (الماركة) للمنتجات — 2026-08-21

**قبل (بَلاغ المالك):** صفحة المنتجات فيها عائلات المنتجات لكن **الماركة/العلامة التجارية غير موجودة** إطلاقاً.

**بعد:**
- `models/schemas/catalog.py`: حقل `brand_id` الاختياري في ProductCreate وProductUpdate.
- `routes/products_routes.py`: الإنشاء والتعديل يحلّلان الماركة (400 «الماركة المحددة غير موجودة» لمعرّف وهمي) ويخزّنان brand_id + مرآة brand_name على المنتج.
- `routes/families_permissions_routes.py`: CRUD كامل `/product-brands` — قائمة مع عدّاد منتجات حي، إنشاء (409 للمكرر)، إعادة تسمية **تزامن مرآة brand_name** في كل المنتجات، حذف ممنوع (400) طالما منتجات تستخدمها.
- الواجهة (`AddProductPage.js` + `EditProductPage.js`): قائمة منسدلة للماركة بجانب العائلة (brand-select) + زر **إضافة سريعة** (quick-add-brand-btn) بنافذة تنشئ الماركة وتختارها فوراً — نفس نمط العائلات تماماً، ثنائية اللغة.
- نسخة: backups/p217 — إصدار الواجهة **20260820_205647** — الحزمة `main.565fb57a.js`.

**الاختبار الحي (موسوم TEST-P217):** إنشاء ماركة 201 ← مكرر 409 ← منتج بماركة يخزّن brand_id/brand_name ← ماركة وهمية 400 ← إعادة التسمية تزامن المرايا في المنتجات ← حذف محظور 400 مع وجود منتجات ← إزالة الماركة من المنتج + حذف المنتج + حذف الماركة ← القائمة عادت فارغة `[]`. الواجهة: بناء + نشر، الحزمة تحوي brand-select وquick-add-brand-btn، /product-brands يستجيب 200، الموقع 200. لم تُمسّ أي بيانات حقيقية.

## p218 — سجل النشاط لكل كيان (زبون/منتج/مورد) — 2026-08-21

**بعد (طلب المالك: «ملف لكل زبون/منتج/مورد فيه جميع العمليات مع فلترة بفترة أو عرض الكل»):**
- `routes/activity_routes.py`: ثلاث نقاط قراءة فقط تحت `/activity`:
  - `GET /activity/customer/{id}` — مبيعات، تسديدات ديون، تذاكر تصليح (بالهاتف)، طلبات المتجر الإلكتروني.
  - `GET /activity/product/{id}` — مبيعات (كمية/مبلغ الصنف من كل فاتورة)، مشتريات، تغييرات السعر (price_history)، تدقيق المنتج (product_audit_log)، سلع تالفة، دُفعات.
  - `GET /activity/supplier/{id}` — مشتريات، دفعات المورد (من سجل payments داخل فواتير الشراء)، دفعات مسبقة.
  - كلها: start_date/end_date (أو الكل)، حد 500، ترتيب تنازلي، by_type ملخص، 404 لكيان غير موجود، صلاحيات customers/products/suppliers.view.
- مكوّن واجهة موحّد جديد `components/EntityActivityTimeline.js`: فلتر فترة (الكل/7/30 يوم/مخصصة)، أيقونة ولون لكل نوع عملية، مبالغ منسّقة، ثنائي اللغة، data-testid لكل عنصر.
- الدمج: نافذة نظرة الزبون 360 (CustomersPage) ← بطاقة تاريخ المنتج في صفحة تعديل المنتج ← زر سجل جديد في صفحة الموردين (جدول + بطاقات) مع نافذة خاصة.
- نسخة: backups/p218 — إصدار الواجهة **20260820_211810** — الحزمة `main.114652d5.js`.

**الاختبار الحي (قراءة فقط على بيانات حقيقية — لم يُنشأ أي مستند اختباري):** زبون حقيقي ← 5 مبيعات مرتبة صح؛ منتج حقيقي (REALME C11) ← مبيعات 2023 بكميات ومبالغ الأصناف؛ مورد حقيقي ← شراءان + دفعتان مستخرجتان من سجل payments؛ فلتر 2026 على مورد 2022 ← total=0؛ فلتر محدد البداية/النهاية يقيّد فعلاً؛ كيان وهمي ← 404. الحزمة تحوي supplier-activity وJournal d'activité. الموقع 200.

## p219 — دخول سريع برمز PIN للموظفين (بند 2 من قائمة المالك) — 2026-08-21

**بعد:** `routes/pin_auth_routes.py` (يُسجَّل تلقائياً):
- `GET /auth/pin/users/{shop_code}` — عام: يرجع موظفي المتجر أصحاب PIN المفعّل (id/name/role فقط)، المتجر يُحلّ عبر short_id (مثل NT-0004) أو id، 30/دقيقة.
- `POST /auth/pin/login` — {shop_code, user_id, pin}؛ قفل 10 دقائق بعد 5 محاولات خاطئة (main_db.pin_login_attempts — آمن عبر العمال الأربعة)، 10/دقيقة؛ التوكن بنفس شكل unified-login للموظفين (type=tenant + tenant_id) فتنطبق الصلاحيات نفسها.
- `POST /auth/pin/set` (بكلمة المرور الحالية) و`/disable` ذاتيان؛ `POST /auth/pin/admin-set` لمدير المتجر (تعيين/تعطيل + مسح القفل في الحالتين).
- UserResponse يضاف إليه pin_enabled.

**الواجهة:** UnifiedLoginPage: وضع «دخول سريع برمز PIN» (pin-mode-link) — رمز المتجر (يُحفظ في posShopCode) ← بطاقات الموظفين مع شارة الدور (مدير/بائع/أمين صندوق/موظف) ← لوحة أرقام لمسية مع نقاط الإدخال ← completeLogin الموجودة. UsersPage: زر مفتاح لكل مستخدم (أخضر عند التفعيل) بنافذة تعيين/تعطيل PIN.

**الاختبار الحي (TEST-P219، تنظيف دقيق):** admin-set ← المنتقي يسرد المستخدم ← PIN خاطئ 401 ← PIN صحيح يرجع توكن tenant صالح (products 200) ← 5 محاولات خاطئة ← 429 «مقفل 10 دقيقة» ← admin-set فارغ يعطّل **ويمسح القفل** (أصلحنا إغفال مسح القفل في فرع التعطيل وأُعيد الاختبار: 401 بدل 429) ← المنتقي فارغ ← pin_hash أزيلت ← pin_login_attempts صفر. نسخة: backups/p219 — إصدار **20260821_042800** — الحزمة `main.b71b097f.js`.

## p220 — تدقيق مزايا المشتركين حسب النشاط التجاري (بند 3) — 2026-08-21

**الموجود (p183):** مصفوفة الأنشطة core/business_profiles.py (13 نشاطاً، features_off/on لكل نشاط) + تطبيقها عند التسجيل ومن لوحة المشرف + الحلّ في الواجهة (isFeatureEnabled — الميزة غير المذكورة مفعّلة افتراضياً).

**الجديد:**  (مشرف عام) — يمر على كل المشتركين النشطين ويقارن features_override بمصفوفة نشاطهم: انحراف (drift)، مفاتيح ناقصة، تجاوزات يدوية، مفاتيح غير معروفة، مع ملخص counts.

**الاختبار الحي:** 4 مشتركين نشطين كلهم ok بلا انحراف؛ كشف المفتاح غير المعروف has_woocommerce لدى المستأجر الحقيقي (مفتاح ecom شرعي خارج مفاتيح القوائم — معلوماتي فقط). لم تُعدَّل أي بيانات.

## p221 — محرك العمولة التلقائي (بند 5 من قائمة المالك) — 2026-08-21

**بعد:**
- `services/commissions.py`: قواعد عمولة لكل مستأجر (نطاق: كل المبيعات/عائلة/قناة؛ نسبة أو مبلغ ثابت؛ حد أدنى للفاتورة) تُطبَّق على حدث sale.completed عبر الناقل — سجل عمولة (متوازن التكرار لكل بيع+قاعدة) + قيد آلي Dr 658/Cr 421؛ الإرجاع/الحذف يلغي العمولة معلقة + قيد عكسي.
- `services/accounting_auto.py`: حسابان جديدان في الدليل الافتراضي (658 مصاريف العمولات، 421 عمولات مستحقة الدفع) + post/reverse/payout للعمولات.
- `routes/commissions_routes.py`: CRUD للقواعد (sales.edit) + سجل وتقرير لكل مستفيد (reports.view) + دفع معلّقة من صندوق حقيقي داخل معاملة ذرّية (قيد Dr 421/Cr صندوق + حركة صندوق).
- الواجهة: صفحة /commissions (قائمة «المبيعات»، مفتاح reports) — بطاقات مستحقات لكل مستفيد، إدارة القواعد، سجل بفلتر حالة، نافذة دفع باختيار الصندوق.
- نسخة: backups/p221 — إصدار **20260821_045416** — الحزمة `main.9125247d.js`.

**الاختبار الحي (TEST-P221، عبر الناقل الحقيقي):** قاعدة 10% ← حدث sale.completed بـ1000 ← عمولة 100 معلقة + قيد COM (658/421) ← حدث مكرر ← صفر ازدواج (idempotent) ← sale.refunded ← ملغاة + قيد عكسي ← CRUD عبر API (400 لنسبة >100، 404 لإعادة الحذف) ← تنظيف دقيق: القاعدة والعمولات والقيود الاختبارية حُذفت، 530=11300.88 و700=-140580 كما هما، الحسابان الجديدان 0.0، القيدان الحقيقيان فقط باقيان، الصناديق على اللقطة.

## p223 — هوامش أسعار لكل مشترك (Per-subscriber price margins) — 2026-08-21

**الهدف (تقرير استشاري §3.3):** قاعدة تسعير «سعر التكلفة + هامش المشترك» لكل فئة خدمة وسيطة.

### Backend
- `services/pricing_engine.py` (جديد): محرك التسعير — `get_active_margin_rule` (main_db.margin_rules، أحدث قاعدة مفعّلة)، `apply_margin_rule` (percent/fixed، لا يبيع تحت التكلفة)، `quote_sale_price`، فئات معروفة recharge/digital/iptv/ai + slugs حرة.
- `routes/margin_rules_routes.py` (جديد): CRUD للمستأجر `/margin-rules` (قاعدة واحدة لكل فئة — 409 عند التكرار، تحقق percent≤100)، `/margin-rules/quote` تجربة جافة، `/margin-rules/all` للسوبر أدمن مع أسماء المستأجرين.
- `services/application/recharge_service.py`: بعد حساب cost/profit يُطبَّق هامش المستأجر — `sale_price = cost × (1+margin)`؛ عند عدم وجود قاعدة يبقى sale_price = القيمة الاسمية (سلوك قديم حرفياً). سعر البيع يدخل: cashbox income، سند transactions، سجل المبيعات (نقدي/آجل + face_amount)، daily_sessions، والتراجع (rollback) — بينما USSD/bridge/خصم المحفظة/عمولة المنصة (p205) تبقى على القيمة الاسمية. حقول جديدة على سند الشحن: sale_price, margin_rule_id, margin_extra.
- `main.py`: تسجيل routes.margin_rules_routes في _AUTO_REG_MODULES.

### Frontend
- `pages/MarginRulesPage.js` (جديد): قائمة القواعد (تفعيل/تعطيل/تعديل/حذف)، حوار إضافة (فئة+نوع+قيمة)، حاسبة سعر تفاعلية. ثنائية اللغة. testids: margin-rules-page, add-margin-rule-btn, margin-category/type/value, margin-save-btn, quote-cost, quote-run-btn, quote-result.
- `App.js`: مسار /margin-rules (adminOnly + featureKey=recharge). `Layout.js`: عنصر «هوامش الأسعار» في قسم خدمات الشحن (admin).

### الاختبار (TEST-P223 — موسوم ومنظَّف)
- 15 اختبار curl ناجحاً: CRUD كامل، quote percent 10% على 97→106.7، fixed 25 على 97→122، تعطيل→سعر التكلفة، 409 تكرار، 400 نسبة>100، 403 بدون صلاحية، 404 حذف مكرر، super-admin يرى القاعدة مع اسم المستأجر.
- لم تُنشأ أي قاعدة بفئة «recharge» للمستأجر الحقيقي — سلوك الشحن الإنتاجي لم يتغير. margin_rules فارغة بعد التنظيف.

Release: 20260821_052844 — Bundle: main.fc2818a5.js

## p224 — محاسبة تكلفة توكنات الذكاء الاصطناعي (AI usage billing) — 2026-08-21

**الهدف (تقرير استشاري §3.4):** استغلال usage_records — تقرير شهري لكل مشترك (تكلفة + هامش المالك) ← فاتورة تُخصم من محفظته، مع سقف شهري اختياري.

### Backend
- `services/ai/usage_meter.py` (جديد): `check_ai_cap` (429 عند تجاوز ai_monthly_cap_usd للمستأجر — fail-open عدا خرق السقف)، `record_ai_usage` (صف في main_db.usage_records {tenant_id, month, model, tokens_in/out, cost_usd, feature})، جدول أسعار افتراضي لكل مليون توكن (gpt-5/4o/4o-mini) مع تجاوز من ai_billing_config، حلّ المستأجر عبر tenant_id_ctx (platform لا يُقيَّد ولا يُفوتر).
- خطافات القياس في كل مواضع استدعاء LLM: `services/ai/llm_service.py` (send_message)، `routes/ai_assistant_routes.py` (_llm_answer)، `services/ai/openai_llm.py` (llm_chat + llm_vision) — فحص السقف قبل النداء وتسجيل الاستهلاك بعده. توليد الصور (images.generate) غير مشمول بفوترة التوكنات.
- `routes/saas/ai_billing_routes.py` (جديد): `/saas/ai-billing/config` GET/PUT (margin_pct + usd_dzd_rate + model_prices)، `/saas/ai-billing/cap` (سقف شهري لكل مستأجر على saas_tenants.ai_monthly_cap_usd)، `/saas/ai-usage/summary` (تجميع شهري لكل مستأجر مع سعر البيع والحالة)، `/saas/ai-billing/run` {month} (فاتورة AIB-YYYYMM-NNNN لكل مستأجر: billed_usd = cost × (1+margin)، amount_dzd = ×rate، خصم wallet بنوع ai_billing؛ رصيد غير كافٍ → failed قابلة لإعادة المحاولة؛ billed تُتخطى — idempotent لكل (tenant, month) بفهرس فريد)، `/saas/ai-billing/invoices`.
- `main.py`: تسجيل الراوتر + فهارس usage_records(tenant_id,month) و ai_invoices UNIQUE(tenant_id,month).

### Frontend
- `pages/admin/PlatformFinanceTab/AiBillingCard.js` (جديد): تبويب فرعي «🤖 فوترة الذكاء» في /saas-admin/finance — إعدادات (هامش/سعر صرف)، جدول استهلاك المشتركين مع حقل سقف لكل مشترك، زر تشغيل الفوترة، جدول الفواتير. testids: ai-billing-tab, ai-cfg-margin/rate/save, ai-month, ai-run-billing, ai-usage-{tid}, ai-cap-{tid}, ai-invoice-{id}.

### الاختبار (TEST-P224 — موسوم ومنظَّف)
- وحدة الميتر داخل الحاوية: حساب التكلفة (0.45$ لـ gpt-4o-mini 1M+0.5M)، تسجيل صفين بالشهر الصحيح، السقف يحجب بـ 429 ويُلغى بالصفر، platform لا يُحجب.
- E2E عبر API بمستأجر TEST: بذر استهلاك 0.135$ → summary يعرض billed 0.1755$ / 23.69 دج → run مع محفظة فارغة → فاتورة failed («الرصيد غير كافي») → شحن محفظة TEST → إعادة run → billed مع خصم 23.69 → run ثالثة → skipped. تحقق: 400 سعر صرف سالب، 404 سقف لمستأجر وهمي، 403 لتوكن مستأجر على saas.
- التنظيف الدقيق: حذف صفوف usage/الفواتير/محفظة ومعاملات TEST (2/1/2/1)، لا بقايا، محفظة المستأجر الحقيقي سليمة (0.0 / عتبة 1000).

Release: 20260821_134533 — Bundle: main.cdb5772a.js

## p225 — شفاء ذاتي المستوى 1 (Rule-based self-healing) — 2026-08-21

**الهدف (تقرير استشاري §4.1):** تصنيف الأخطاء + runbooks + تقرير صباحي فوق محرك AutoHeal (p54). القاعدة الذهبية مطبَّقة: الإصلاح الآلي يُقترح ولا يُفرض على البيانات المالية.

### Backend
- `services/autoheal_level1.py` (جديد):
  - مصنّف الأخطاء: 6 فئات (database/cache/network/auth/validation/integration + application) بكلمات مفتاحية على type+message؛ `normalize_signature` يوحّد الرسائل (إخفاء UUID/أرقام)؛ `classify_system_errors` يوسم system_errors.classification ويحدّث autoheal_error_signatures (تكرار/أول وآخر ظهور/عينة).
  - RUNBOOKS: دليل معالجة عربي لكل فئة (مثال cache: إعادة تشغيل Redis + ping + إعادة backend — لا docker.sock داخل الحاوية لذا الخطوات إرشادية للمالك).
  - `generate_morning_report`: ملخص 24 ساعة (مسحات + أدنى/متوسط النقاط، نتائج جديدة/محلولة/مُصلحة آلياً، أخطاء حسب الفئة، أكثر التواقيع تكراراً، قائمة «يحتاج تدخلك») في autoheal_morning_reports — idempotent لكل تاريخ.
- `services/autoheal_service.py`: فحصان جديدان في run_scan — `_check_error_classification` (تصنيف مستمر + نتيجة High/Medium عند ≥10/≥5 أخطاء بنفس الفئة خلال ساعة مع خطوات الـ runbook) و `_check_tenant_data_advisories` (بوابة ساعية عبر autoheal_state: مخزون سالب + قيود يومية غير متوازنة لكل مستأجر نشط — نتائج إرشادية بلا remediation_key أبداً). التقرير الصباحي يُولَّد في حلقة المجدول مرة يومياً من 06:00 بتوقيت الجزائر.
- `routes/saas/autoheal_routes.py`: GET /error-classes، POST /classify، GET /runbooks، GET /morning-report، POST /morning-report/generate.

### Frontend
- `pages/admin/saas/AutoHealPage.js`: بطاقة «التقرير الصباحي» (عدادات مسحات/جديدة/مُصلحة/تحتاجك + قائمة المنتظرة + زر توليد) وبطاقة «تصنيف الأخطاء» (شرائح الفئات + أكثر التواقيع). testids: autoheal-morning-report, morning-report-generate, mr-scans/new/fixed/needs, mr-needs-list, autoheal-error-classes, errcat-*.

### الاختبار (قراءة فقط على البيانات الحقيقية — بلا TEST data)
- POST /classify: صنّف خطأً قائماً (DuplicateKeyError → database بعد تصحيح كلمة مفتاحية)، remaining=0.
- error-classes/runbooks (7 أدلة)/morning-report: توليد وجلب MR-2026-08-21 (146 مسحاً/24س، متوسط 35، needs_owner=1 — الحرج القائم يُعرض صحيحاً).
- المسح التفاعلي يشغّل الفحصين الجديدين دون أخطاء؛ لا مخزون سالب ولا قيود غير متوازنة لدى المستأجر الحقيقي (لا نتائج جديدة — البيانات سليمة).
- لم تُعدّل أي بيانات مالية؛ الفحصان الجديدان قراءة فقط.

Release: 20260821_140243 — Bundle: main.f47f1ccc.js

## p226 — تشفير على مستوى الحقل (AES-256-GCM) — 2026-08-21

**الهدف (تقرير استشاري §7):** تشفير الحقول الحساسة فقط — «شفّر الهوية والأسرار، اترك الأرقام التشغيلية مفهرسة». لا ترحيل لأي بيانات تشغيلية حية، ولا تشفير لحقول مفهرسة.

### Backend
- `services/crypto_fields.py` (جديد): AES-256-GCM — المفتاح من FIELD_ENCRYPTION_KEY (موجود مسبقاً في .env: hex64/base64-32B/عبارة→SHA-256). الصيغة: v1. + b64(nonce‖ct‖tag). decrypt_field يمرّر القيم غير المشفرة (توافق رجعي). key_fingerprint للتحقق التشغيلي دون كشف المفتاح.
- الحقول المُدارة (أسرار at-rest فقط): `bridge_secret` في settings المستأجر و `self_bridge_api_key` في saas_tenants — تشفير عند الكتابة وفكّ شفاف عند القراءة في كل المواضع: verify_bridge (مصادقة الجسر)، GET/PUT bridge/secret، تحديث المستأجر، test-bridge، تسليم مهام الجسر في recharge saga، ومصدق pydantic على TenantResponse.
- `routes/saas/security_routes.py` (جديد): GET /saas/security/encryption-status (توفر المفتاح + بصمته + تغطية الأسرار مشفرة/نصية) و POST /saas/security/encrypt-secrets-now (ترحيل لمرة واحدة للأسرار النصية القائمة — idempotent، نطاق أسرار فقط).
- `main.py`: تسجيل راوتر الأمان.

### الاختبار (TEST-P226 — موسوم ومنظَّف)
- وحدة: round-trip عربي/لاتيني، passthrough للنصوص القديمة، بصمة مفتاح 57d1339f16cb.
- E2E على المستأجر الحقيقي: وضع bridge secret تجريبي → المخزَّن v1. مشفراً (87 حرفاً) → GET يعيد النص الأصلي → مصادقة الجسر بالنص الصريح تعمل (200) → secret خاطئ 403 → حذف وثيقة الاختبار (لم تكن موجودة قبل) — لا بقايا.
- regression: قائمة المستأجرين تُسلسل سليمة مع المصدق الجديد؛ migration endpoint no-op (0/0).

Release: backend only (لا واجهة — بنية تحتية)

## p227 — الكتالوج المركزي للسوق الموحد (Unified marketplace catalog) — 2026-08-21

**الهدف (تقرير استشاري §8):** كتالوج مركزي في main_db يغذّيه حدث product.published_to_marketplace عبر الناقل الموجود — المشترك يختار منتجاته وهامشه. (توجيه الطلبات والدفع عند الاستلام مرحلة لاحقة §3.5).

### Backend
- `routes/marketplace_routes.py` (جديد): جانب المستأجر — POST /marketplace/publish {product_id, margin_pct} (السعر في السوق = سعر التجزئة × (1+الهامش)، تحقق 0–200% ورفض منتج بلا سعر تجزئة) يخزّن marketplace_listings في قاعدة المستأجر ويكتب الحدث في outbox؛ POST /unpublish؛ GET /my (المنشورات + بيانات المنتج). جانب عام بلا مصادقة — GET /marketplace/catalog (بحث q، فلتر فئة، صفحات ≤60، لا يكشف tenant_id).
- `services/event_consumers.py`: handle_product_published (upsert في main_db.marketplace_catalog بمفتاح tenant+product) و handle_product_unpublished (active=False) — مسجّلان في الناقل. إصلاح: استيراد uuid كان مفقوداً.
- `main.py`: تسجيل routes.marketplace_routes + فهرس فريد marketplace_catalog(tenant_id, product_id).

### Frontend
- `pages/MarketplacePage.js` (جديد): قائمة منشوراتي (سعر أساسي ← سعر السوق، شارة نفاد المخزون)، حوار نشر (اختيار منتج من غير المنشورة + هامش %)، سحب من السوق. مسار /marketplace + عنصر «السوق الموحد» في قائمة المبيعات. testids: marketplace-page, publish-product-btn/select/margin/confirm-btn, listing-{pid}, unpublish-{pid}.

### الاختبار (TEST-P227 — موسوم ومنظَّف)
- E2E عبر الناقل الحقيقي: إنشاء منتج اختبار (تجزئة 500) → نشر بهامش 20% → الكتالوج العام يعرضه بسعر 600 خلال ثوانٍ → سحب → يختفي من العام. تحقق: 400 هامش 300%، 404 منتج وهمي، 404 سحب مكرر، الكتالوج العام 200 بلا توكن.
- التنظيف الدقيق: حذف المنتج/الإدراج/صف الكتالوج/3 أحداث outbox؛ journal_entries=2 (الحقيقيان فقط) وcash=11300.88 — لا مساس بالبيانات الحقيقية.

Release: 20260821_142922 — Bundle: main.9059a4cb.js

## p228 — تدقيق شامل للنظام + إصلاح جذري لخطإ المصاريف — 2026-08-21

**فحص كامل:** حاويات (8/8)، API، الموقع 200، git، DLQ=0، outbox=0 معلق، نسخ يومية 03:00، push GitHub حتى p228، قرص 35%.

**errors.log — 4 أنماط أخطاء:**
1. expenses DuplicateKeyError (expense_number=null) — **أُصلح جذرياً**: create_expense يضبط expense_number=code (المؤشر الفريد كان قد أُسقط، لكن التناسق يمنع عودته).
2. shipping settings E11000/company_id — مُصلح سابقاً (p141) — تحقق حي 200 (وحُذف مستند الاختبار فوراً).
3. sim/transfer NameError — مُصلح سابقاً — تحقق حي: 400 سليمة.
4. journal-entries ObjectId — مُصلح سابقاً (p196) — GET 200 و400 للقيد غير المتوازن.

**تنظيف AutoHeal:** اعتماد إصلاح الأخطاء الحرجة (resolve_critical_system_errors أغلق سجل system_errors) + تجاهل 5 نتائج راكدة بعد التحقق من إصلاح جذورها → مسح جديد: **health_score=100**.


---

## p232 — إصلاح فجوة التراجع في مسار البيع الآجل للشحن (Recharge Saga Rollback Gap)

**التاريخ:** 2026-08-21

**الخلفية:** الجرد الشامل (p228) كشف أن `execute_recharge_saga` في `services/application/recharge_service.py`
يُدرج سجل بيع آجل (`recharge_credit`, فاتورة FLEXY-) دون علم تراجع — بخلاف المسار النقدي الذي يملك
`sale_cash_inserted`. أي فشل في إرسال مهمة الجسر بعد الإدراج كان يترك سجل بيع يتيماً + مجاميع جلسة يومية منتفخة.

**التغييرات:**
- علم `sale_credit_inserted` جديد يُضبط بعد إدراج البيع الآجل.
- كتلة التراجع تحذف سجل البيع الآجل وتعكس مجاميع الجلسة اليومية (`total_sales/credit_sales/sales_count`).
- المسار النقدي: إضافة عكس مجاميع الجلسة اليومية (`cash_sales`) عند التراجع (نفس فئة الخلل، لم تكن تعكس أيضاً).

**الاختبار:** سكربت تكامل داخل الحاوية — فرض فشل في إدراج مهمة الجسر بعد إدراج البيع، للمسارين (آجل + نقدي):
- النتيجة: HTTPException 500 كما هو متوقع، **صفر** بقايا في recharges/sales، مجاميع الجلسة اليومية لم تتغير،
  رصيد الصندوق النقدي 11300.88 دج دون تغيير، journal_entries = 2.
- كل بيانات الاختبار موسومة TEST-P232 وحُذفت بدقة.

**التحقق من فجوات محاسبية أخرى (المسار 1 من تقرير الجرد) — اتضح أنها مغطاة أصلاً:**
- تعديل المصروف (PUT): معالج `expense.updated` موجود منذ p201 — قيد عكس + إعادة ترحيل idempotent.
- تسوية الدين (settle-credit): مسجلة دفترياً في wallet_transactions برمز PF (جانب المنصة).
- سجلات الدفع اليدوية (/payments/records): سجلات إيراد اشتراكات على جانب المنصة في payment_transactions — ليست قيود مستأجر.

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p232/


---

## p233 — قياس استهلاك توليد صور المنتجات بالذكاء الاصطناعي (Image AI Metering)

**التاريخ:** 2026-08-21

**الخلفية:** جرد p228 وجد أن `/ai/generate-product-image` يستهلك Gemini/OpenAI Images دون أي قياس —
كل مسارات LLM الأخرى رُبطت بـ usage_meter في p224 إلا الصور (لا ترجع tokens).

**التغييرات:**
- `services/ai/usage_meter.py`: جدول `DEFAULT_IMAGE_PRICING` (gpt-image-1 = 0.04$/صورة، نماذج Gemini
  المجانية = 0) + دالة `record_ai_image_usage` (سعر ثابت للصورة، قابل للتجاوز عبر
  ai_billing_config.model_prices.{model}.per_image) — fail-open مثل بقية الخطافات.
- `routes/ai_routes.py`: `check_ai_cap` قبل التوليد (429 عند تجاوز السقف الشهري) و
  `record_ai_image_usage` بعد النجاح مع تتبع النموذج الفعلي المستخدم (used_model) —
  السجلات تدخل نفس usage_records فتظهر في /saas/ai-usage/summary وتدخل فواتير AIB الشهرية.

**الاختبار:** سكربت داخل الحاوية — تسجيل صورة gpt-image-1 (cost_usd=0.04 بالضبط)، نموذج مجهول
(fallback 0.05 × 2 = 0.10)، سقف غير مُعدّ → مسموح. السجلات TEST-P233 حُذفت بدقة (leftover=0).
فحص حي: 400 «أدخل اسم المنتج» و /ai/status تعمل.

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p233/


---

## p234 — تنبيهات DLQ وأرشفة الـ outbox: تحقق + معالجة أول حدث DLQ (المسار 3)

**التاريخ:** 2026-08-21

**التحقق — البندان منفذان فعلاً منذ p210/p211:**
- تنبيه DLQ: `_raise_dlq_alert` (p210) يكتب platform_alerts بلا تكرار، ويُعرض عبر
  /api/admin/event-bus/alerts مع acknowledge، وفي /api/saas/health-alerts — **مُتحقق حياً**.
- أرشفة outbox: `_archive_loop` (p211) يعمل (سجل الإقلاع: «Outbox archival started (>30d, every 3600s)»)؛
  الأرشيف فارغ لأن أقدم حدث منشور عمره يومان فقط (< 30 يوماً) — سلوك صحيح بالتصميم.

**المعالجة الفعلية:** وُجد حدث واحد في DLQ — `product.published_to_marketplace` الذي سقط أثناء p227
بخلل «name 'uuid' is not defined» (أُصلح حينها بإضافة الاستيراد). تمت معالجته عبر مسار الاسترداد
الرسمي: POST /api/admin/event-bus/replay/{event_id} → نجح، DLQ = 0، والتنبيه حُلّ تلقائياً
(resolved_by=replay). السجل الجانبي الوحيد (سطر كتالوج TEST-P227 أعاده الـreplay) حُذف بدقة —
كتالوج المستأجر عاد إلى 0 سطر كما كان.

**لا تغيير برمجي** — توثيق تحقق + أول عملية replay ناجحة من DLQ في تاريخ المنصة.


---

## p235 — الشفاء الذاتي المستوى 2: كشف الحالات الشاذة إحصائياً (Business Anomaly Detection)

**التاريخ:** 2026-08-21

**التغيير:** فحص `_check_business_anomalies` جديد في autoheal_service.py (بوابة يومية عبر autoheal_state،
استشاري فقط — بلا remediation_key وبلا أي كتابة على بيانات المستأجرين)، ثلاثة كواشف لكل مستأجر:
1. **هبوط المبيعات** — آخر 7 أيام مقابل الأسبوع السابق؛ إنذار عند هبوط >60% مع أساس ≥5 مبيعات.
2. **ارتفاع المرتجعات** — قيمة مرتجعات آخر 7 أيام >25% من مبيعات الفترة مع ≥3 مرتجعات.
3. **فرق الصندوق** — للجلسات المغلقة حديثاً: |الإغلاق المصرّح − (الافتتاح + cash_sales + حركات
   الصندوق النقدي في النافذة)| > max(1000 دج، 10%) — توقيع لكل جلسة، حد أقصى 3 لكل مستأجر.

**الاختبار (داخل الحاوية، تجهيزات TEST-P235 دقيقة الحذف):**
- كشف فرق الصندوق: جلسة بفجوة +9000 دج أُبلغ عنها؛ جلسة سليمة لم تُبلَّغ ✓
- كشف المرتجعات: 70 مرتجعاً تجريبياً (34% من مبيعات الفترة) أُبلغ ✓
- كشف هبوط المبيعات أُبلغ ✓ — **وملاحظة: الكاشف رصد هبوطاً حقيقياً لدى المستأجر الفعلي**
  (الأسبوع السابق 225 بيعاً / 2.58 مليون دج ← الحالي 150 بيعاً / 1.04 مليون دج، −60%)
  سيظهر كإنذار استشاري في صفحة AutoHeal عند أول مسح يومي قادم.
- الثوابت بعد التنظيف: journal_entries=2، الصندوق النقدي 11300.88 دج، صفر بقايا TEST-P235.

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p235/


---

## p236 — الشفاء الذاتي المستوى 3: إنذارات تنبؤية (Predictive Advisories)

**التاريخ:** 2026-08-21

**التغيير:** فحص `_check_predictive_advisories` جديد في autoheal_service.py (بوابة يومية، استشاري فقط،
بلا أي كتابة على بيانات المستأجرين)، ثلاثة توقعات أمامية لكل مستأجر:
1. **نفاد المخزون** — أيام المتبقي = الكمية ÷ وتيرة البيع (14 يوماً)؛ إنذار لمن بقي له < 7 أيام (أعلى 5).
2. **نفاد المحفظة** — الرصيد ÷ معدل الحرق (خصومات 14 يوماً من wallet_transactions)؛ إنذار < 5 أيام.
3. **اتجاه المبيعات** — انحدار خطي على 28 يوماً؛ إنذار إذا توقّع الأسبوع القادم < 50% من الأسبوع الأخير.

**الاختبار (تجهيزات TEST-P236، حذف دقيق):**
- منتج تجريبي (5 متبقٍ، وتيرة 20 وحدة/14يوم ≈ 3.5 يوم) أُبلغ ✓ — والكاشف رصد أيضاً صنفاً حقيقياً:
  **CHARJ MASTER TYPE C TO C 25W: متبقٍ 1 فقط ≈ 3 أيام بالوتيرة الحالية** (سيظهر في صفحة AutoHeal).
- نفاد المحفظة: رصيد موكّل 1000 دج + حرق تجريبي 4000/14يوم → إنذار ≈4 أيام ✓
  (المحفظة الحقيقية رصيدها 0 فلا يُختبر عليها — والتوبوب بند مالك معروف).
- الثوابت: journal_entries=2، الصندوق 11300.88 دج، wallet_transactions عادت فارغة كما كانت، صفر بقايا.

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p236/


---

## p237 — السوق الموحد، المرحلة 2: الطلبات العابرة للمستأجرين (Cross-Tenant Marketplace Orders)

**التاريخ:** 2026-08-21

**التغييرات:**
- `routes/marketplace_routes.py`: مسار عام `POST /api/marketplace/order` (بلا مصادقة — زبون السوق):
  تحقق من الكتالوج النشط ← حارس مخزون ذري (`$gte` + `$inc`) ← طلب في `ecom_orders` الخاص بالمستأجر
  المالك (channel="marketplace", status="new", رمز MP00001+) ← سجل منصة في `main_db.marketplace_orders`
  (أساس التسويات في المرحلة 3) ← حدث `marketplace.order_placed` عبر الـ outbox؛ تعويض المخزون عند أي فشل.
- `services/event_consumers.py`: معالج `handle_marketplace_order_placed` — إشعار فوري في
  `notifications` الخاصة بالمستأجر المالك. **الطلبات تظهر تلقائياً في بريد التجارة الإلكترونية
  الموجود** (/ecom/orders?channel=marketplace) — لا واجهة جديدة مطلوبة.
- **إصلاح أثناء المرحلة:** النسخة الأولى من التعديل وضعت سطور التسجيل داخل جسم المعالج بالخطأ —
  اكتُشف فوراً (معالجة الحدث بلا consumer)، أُعيد الملف من نسخة p237 الاحتياطية وأُعيد التعديل ببنية
  صحيحة متحقق منها (26 معالجاً مسجلاً).

**الاختبار E2E عبر API العام الحقيقي (تجهيزات TEST-P237):**
- طلب ناجح: MP00001 بإجمالي 2400 دج، المخزون 10→8 ✓ • طلب ثانٍ MP00002 بعد الإصلاح، المخزون →7 ✓
- حارس المخزون: 409 «نفد المخزون» عند طلب 50 ✓ • منتج مجهول 404 ✓ • حقول ناقصة 422 ✓
- سجل المنصة marketplace_orders ✓ • إشعار المستأجر وصل عبر outbox→bus→consumer ✓
- التنظيف الدقيق: حُذف كل شيء تجريبي؛ الطلب الحقيقي WEB000001 سليم، القيود=2،
  الصناديق على قيم اللقطة (cash 11300.88)، صفر بقايا.

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p237/
**المرحلة 3 المتبقية:** التسويات بين المنصة والمستأجرين على طلبات السوق (عمولة الطلب).


---

## p238 — السوق الموحد، المرحلة 3: التسويات (Marketplace Settlements)

**التاريخ:** 2026-08-21

**النموذج:** الزبون يدفع COD للمستأجر البائع مباشرة؛ عند انتقال الطلب إلى «تم التسليم»
تستحق عمولة المنصة وتُرحَّل إلى دين المستأجر (credit_debt) — يُسدَّد لاحقاً عبر settle-credit الموجود.

**التغييرات:**
- `ecom_order_service.py`: إصدار حدث `ecom_order.delivered` جديد (مع channel وtotal).
- `event_consumers.py`: معالج `handle_marketplace_settlement` على ecom_order.delivered/cancelled:
  عمولة = total × marketplace_fee_pct (من main_db.platform_config، افتراضي 5%) →
  credit_debt المستأجر + سجل wallet_transactions برمز PF (transaction_type="marketplace_fee") +
  قيد platform_commissions (idempotent لكل طلب) + تحديث marketplace_orders (settled_at).
  الإلغاء قبل التسوية يعلّم الطلب cancelled دون أي عمولة.

**الاختبار E2E كامل عبر المسارات الحقيقية (تجهيزات TEST-P238):**
- طلب سوق MP00001 (1200 دج) ← انتقالات الحالة الحقيقية new→confirmed→packed→shipped→delivered ✓
- التسوية: platform_fee=60 دج (5%) • credit_debt 0→60 • سجل PF00001/26 • قيد PCOM-00001 •
  marketplace_orders status=delivered+settled_at ✓
- **PASS** ثم تنظيف دقيق: ecom_store أُعيد إلى 2650، credit_debt إلى 0، كل السجلات التجريبية
  حُذفت (بما فيها سمعة الزبون التجريبي)، القيود=2، wallet_transactions/platform_commissions/
  marketplace_orders عادت فارغة، الطلب الحقيقي WEB000001 سليم.
- ملاحظة موثقة: قيد تحصيل ecom عند التسليم `$inc` مباشر على الصندوق بلا سجل حركة — سلوك قديم
  قائم (ليس من هذه المرحلة)، مرشح لتحسين مستقبلي.

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p238/
**بهذا اكتملت مراحل السوق الموحد الثلاث** (النشر p227 ← الطلبات p237 ← التسويات p238).


---

## p239 — إصلاح قيد تحصيل ecom: حركة دفترية رسمية بدل $inc الصامت

**التاريخ:** 2026-08-21

**الخلل:** `_cash_tx` في ecom_order_service.py كان توثيقه يعد بالترحيل («and journal it») لكنه ينفّذ
`$inc` صامتاً على الصندوق فقط — حركات تحصيل/عكس طلبات المتجر الإلكتروني لا تظهر في سجل حركات
الصناديق، فتتعذر المطابقة (اكتُشف أثناء اختبار p238).

**الإصلاح:** كل حركة تكتب الآن سطراً في `transactions` بنفس بنية مسار الشحن
{type, amount, cash_box_id, description, reference_type, reference_id, created_by} —
يشمل التحصيل عند التسليم والعكس عند الإرجاع ورسوم الناقل.

**الاختبار E2E (تجهيزات TEST-P239):** طلب سوق MP00001 عبر آلة الحالات الحقيقية حتى delivered ←
سطر income 1200 دج بمرجع ecom_delivery ظهر في transactions ✓ وتسوية p238 (60 دج) عملت دون تأثر ✓
— **PASS**. التنظيف الدقيق أعاد كل الثوابت: الصناديق على اللقطة (ecom_store=2650)، القيود=2،
المحفظة credit_debt=0، صفر بقايا في كل المجموعات.

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p239/


---

## p243 — رفع طلبات Excel/CSV بالجملة إلى صندوق ecom الموحد

**التاريخ:** 2026-08-21

**الهدف (فجوة منافسين — EcoManager):** التجار الذين يستلمون الطلبات هاتفياً/بإكسل كانوا يدخلونها
طلباً طلباً؛ الآن يرفعون الملف دفعة واحدة.

**الإضافة:** `routes/ecom/bulk_import_routes.py`:
- `POST /api/ecom/import/orders` — multipart xlsx/csv (حتى 5MB، حد 1000 صف/دفعة).
  ترويسة عربية أو إنجليزية (أعمدة بدائل: الاسم/الهاتف/الولاية/البلدية/العنوان/المنتج/الكمية/السعر/ملاحظات).
  الصفوف الناقصة (اسم/هاتف/أرقام فاسدة) تُتخطّى وتُبلَّغ برقم الصف دون إسقاط الدفعة.
  كل طلب يمر بنفس مسار الإدخال اليدوي: كشف المكرر p240 (بما فيه التكرار داخل الملف نفسه)،
  مخاطر COD، السمعة الشبكية، مرآة البيع POS، وسوم excel-import + batch-<id>.
- `GET /api/ecom/import/template` — قالب xlsx جاهز بالترويسة العربية + صف مثال.
- `GET /api/ecom/import-batches` و`/{id}` — سجل الدفعات وتفاصيلها (أخطاء + طلبات).
- قناة جديدة `excel` في CHANNELS (+ إضافة `marketplace` الناقصة)، فهارس ecom_import_batches
  و`import_batch_id` على ecom_orders.

**الاختبار E2E (تجهيزات TEST-P243):** تنزيل القالب ✓ • رفع xlsx بـ6 صفوف (3 صالحة + 3 فاسدة +
تكرار داخلي بالهاتف 00213 599 000 247 → طُبِّع إلى 0599000247 وأُعلِّم مكرراً) ✓ •
رفع csv بترميز utf-8-sig ✓ • تصفية channel=excel (4 طلبات) ✓ • ترويسة ناقصة → 400 ✓
— **11/11 PASS**. التنظيف الدقيق حذف 4 طلبات + 4 مرايا بيع + دفعتين + 3 سمعة شبكية؛
الثوابت سليمة: القيود=2، الصناديق على اللقطة، الطلب الحقيقي WEB000001 delivered.

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p243/


---

## p244 — صفحة تتبع عامة شاملة لكل المستأجرين

**التاريخ:** 2026-08-21

**الهدف (فجوة منافسين — Vozare / MDM Express):** زبون أي تاجر يتتبع طرده برقم الطلب أو رقم
تتبع الناقل من صفحة عمومية واحدة — بلا تسجيل دخول وبلا معرفة رابط المتجر (صفحة المتجر
`/shop/:slug/track/:orderId` تبقى قائمة كما هي).

**الخلفية — `routes/ecom/public_track_routes.py`:**
- `GET /api/track/{code}` عام بلا auth؛ الرمز 3–40 محرفاً [A-Za-z0-9-] وإلا 400.
- مسار سريع: طلبات السوق عبر main_db.marketplace_orders (يحمل tenant_id).
- مسار عام: مسح المستأجرين النشطين (حد 50، **استبعاد is_permanent_test** كي لا يحجب الحساب
  التجريبي طلباً حقيقياً بنفس الرمز)؛ عند تطابق الرمز في أكثر من مستأجر يفوز **الأحدث إنشاءً**.
- **خصوصية:** الحمولة بلا أي بيانات شخصية (لا اسم/هاتف/عنوان) — فقط رقم الطلب، الحالة
  بترجمة عربية، الخط الزمني، الناقل، رقم التتبع، الإجمالي، عدد القطع، اسم المتجر.

**الواجهة:** صفحة `pages/store/GlobalTrackingPage.js` على المسار العام `/track` — حقل بحث،
شريط تقدم بخمس مراحل (مراجعة→تأكيد→تجهيز→شحن→تسليم)، بطاقات (المتجر/الإجمالي/رقم التتبع/
القطع)، وسجل حالات زمني. data-testid: track-code-input / track-submit-btn / track-result /
track-not-found.

**الاختبار:** `GET /api/track/WEB000001` محلياً وعبر النطاق ← الطلب الحقيقي delivered بخمس
محطات ✓ (قبل الإصلاح كان يظهر طلب الحساب التجريبي بنفس الرمز) • رمز وهمي → found:false ✓ •
رمز فاسد → 400 ✓ • `/track` يخدم الحزمة الجديدة main.5a2836b5.js ✓.
قراءة فقط على بيانات حقيقية — لا تجهيزات، لا تنظيف.

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p244/ • **النشر:** release 20260821_212821


---

## p245 — برنامج الإحالات (Referrals) لمركز التجارة

**التاريخ:** 2026-08-21

**الهدف (فجوة منافسين — EcoManager affiliates):** التاجر يسلّم رموز إحالة لشركائه/زبائنه؛
الطلبات الواردة بالرمز تُربط بالمُحيل وتُحجز مكافأته آلياً عند التسليم وتُسوّى بدفعات.

**الإضافات:**
- `routes/ecom/referral_routes.py`: إنشاء (رمز تلقائي REF-XXXX أو مخصص، فريد لكل مستأجر،
  مكافأة fixed/percent ≤100%)، قائمة بإحصاءات حية (طلبات/مُسلَّمة/مستحق/مدفوع/ملغى)،
  تعديل وتعطيل، حذف (فقط بلا طلبات — وإلا 409)، دفتر المكافآت، و`payout` يسوّي كل
  المستحق ويؤرشف الدفعة بمعرّفات مكافآتها.
- ربط الطلبات: حقل `referral_code` اختياري في الإدخال اليدوي (orders_routes) وطلب السوق
  الموحد (OrderIn) — رفض 400 للرمز غير الصالح (قبل حسم المخزون في مسار السوق)، ولقطة
  شروط المكافأة تُخزَّن على الطلب فلا تتأثر الطلبات القديمة بتعديلات لاحقة. الأكواد
  case-insensitive.
- `event_consumers.handle_referral_outcome` على ecom_order.delivered/cancelled:
  التسليم يحجز المكافأة (idempotent لكل طلب — فهرس order_id فريد)، والإلغاء/الاسترجاع
  يلغي المكافآت غير المدفوعة فقط.
- فهارس: ecom_referrals(code unique)، ecom_referral_rewards(order_id unique)،
  ecom_referral_payouts.

**الاختبار E2E (TEST-P245، 16/16 PASS):** إنشاء fixed 200 وpercent 10% ✓ تكرار الرمز 409 ✓
نسبة >100% ‏400 ✓ طلب يدوي بالرمز وربطه ✓ رمز فاسد 400 ✓ مسار الحالات الكامل حتى delivered
→ مكافأة 200 due ✓ طلب 1000 دج برمز percent بأحرف صغيرة → مكافأة 100 ✓ إلغاء بلا مكافأة ✓
الإحصاءات الحية ✓ الدفتر ✓ التسوية payout (due→paid 200) ✓ تسوية فارغة 400 ✓ حذف غير
المستخدم ✓ حذف المستخدم 409 ✓ **إعادة تشغيل حدث delivered لا تكرر المكافأة** ✓.
التنظيف الدقيق: 3 طلبات + 3 مرايا بيع + حركتا صندوق + مكافأتان + دفعة + رمزان + 3 سمعة؛
ecom_store أُعيد 5150→2650، القيود=2، WEB000001 سليم.

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p245/


---

## p246 — نظام تذاكر الدعم للمستأجرين

**التاريخ:** 2026-08-21

**الهدف (فجوة منافسين — دعم داخل التطبيق):** المستأجر يفتح تذكرة دعم من داخل المنصة، وفريق
المنصة يرد من لوحة المشرف العام — بلا واتساب/بريد خارجي.

**الإضافة — `routes/support_routes.py`** (مجموعة main_db، محادثة مضمّنة في وثيقة التذكرة):
- جهة المستأجر: فتح تذكرة (موضوع/رسالة/تصنيف تقني-فوترة-اقتراح-أخرى/أولوية، رمز تلقائي
  TKT%05d)، قائمة تذاكره، قراءة المحادثة (تمسح علم tenant_unread)، رد (يعيد فتح المحلولة)،
  إغلاق.
- جهة المنصة (get_super_admin): قائمة كل التذاكر مع مرشحات status/tenant_id وعدّاد
  platform_unread_count، قراءة (تمسح platform_unread)، رد (open→in_progress تلقائياً ويعلّم
  tenant_unread)، تعديل حالة/أولوية.
- علما unread باتجاهين + عزل كامل بين المستأجرين (التذكرة لغيرك = 404) + رفض الرد على
  المغلقة من الجهتين.
- فهارس: id/code فريدان، tenant_id+status، platform_unread.

**الاختبار E2E (TEST-P246، 18/18):** فتح TKT00001 ✓ تحققات 400 (فارغ/تصنيف فاسد) ✓ ظهورها
للمشرف مع عدّاد غير مقروء ✓ القراءة تمسح العلم ✓ منع المستأجر من مسارات المشرف (403) ✓ رد
المشرف → in_progress + tenant_unread ✓ رد المستأجر على المحلولة → reopen ✓ حالة فاسدة 400 ✓
إغلاق ثم منع الرد من الجهتين ✓ عزل 404 ✓. التنظيف: حذف التذكرة، المجموعة عادت فارغة.
لا حركات مالية — الثوابت لم تُمسّ.

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p246/


---

## p247 — واجهة السائق المحمولة (رابط برمز، بلا حساب)

**التاريخ:** 2026-08-21

**الهدف (فجوة منافسين — تطبيقات السائقين):** التاجر ينشئ سائقاً ويسلّمه رابطاً برمز سري؛
السائق يفتحه على هاتفه فيرى مشاويره (بيانات الزبون + مبلغ COD)، يمسح QR الطرد أو يدخل
رمزه، ويعلّم تسليم/فشل.

**الخلفية — `routes/ecom/driver_routes.py`:**
- جهة التاجر: إنشاء/تعديل/تعطيل/حذف سائقين (رمز DRV-24hex، تدوير الرمز، حذف فقط بلا
  مشاوير مفتوحة)، إسناد/فك إسناد الطلبات (فقط packed/shipped/out_for_delivery)،
  إحصاءات (مشاوير مفتوحة + إجمالي المُسلَّم).
- جهة السائق (عامة بالرمز): قائمة المشاوير + عدّاد اليوم، `scan` يجد الطرد برقم الطلب أو
  رقم التتبع ضمن مشاويره فقط، `result`:
  - **delivered** — يمر عبر آلة الحالات الحقيقية `change_order_status` (shipped→delivered)
    فتشتغل كل الآليات: تحصيل COD بسطر دفتري (p239)، SMS الزبون (p241)، السمعة، عمولات
    الإحالة (p245)، تسوية السوق (p238). الرفض خارج shipped برسالة عربية.
  - **failed** — لا يغيّر الحالة: يسجّل محاولة (+delivery_attempts) بملاحظة السائق في
    status_history.
- البحث عن الرمز عبر المستأجرين النشطين (استبعاد التجريبي الدائم)، فهارس token/driver_id.

**الواجهة:** `/driver/:token` — صفحة محمولة: ترويسة باسم السائق/المتجر، عدّادا اليوم،
مسح QR بالكاميرا (html5-qrcode، يفك URLs بصيغة ?code=) أو إدخال يدوي، بطاقات الطرود
(اتصال مباشر tel:، العنوان، مبلغ التحصيل، تنبيه المحاولات الفاشلة)، زرا تسليم/فشل
مع تأكيد/سبب. data-testid: driver-code-input / driver-lookup-btn / driver-scan-toggle /
deliver-btn-* / fail-btn-*.

**الاختبار E2E (TEST-P247، 16/16 PASS):** إنشاء سائق ✓ منع الإسناد قبل packed ✓ الإسناد ✓
قائمة السائق وscan ✓ رموز فاسدة/رابط ميت 404 ✓ منع التسليم من packed ✓ فشل يسجّل محاولة
بلا تغيير حالة ✓ بعد ship التسليم من الواجهة نجح (ECO-AE872F6B → delivered، +800 دج بسطر
دفتري) ✓ المشوار اختفى وعدّاد اليوم=1 ✓ إحصاءات التاجر ✓ حذف السائق الحر ✓ موت الرمز ✓.
التنظيف الدقيق: الطلب + مرآة البيع + حركة الصندوق + السمعة حُذفت، ecom_store 3450→2650،
القيود=2، WEB000001 سليم.

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p247/ • **النشر:** release 20260821_215339


---

## p251 — ويب هوك استقبال الطلبات (YouCan / LightFunnels / Google Sheets / مخصص)

**التاريخ:** 2026-08-21

**الهدف (فجوة منافسين — موصّلات EcoManager):** التاجر ينشئ «مصدر استقبال» لكل متجر خارجي
ويوجّه ويب هوك المنصة (أو Apps Script للشيتات) إلى الرابط الصادر؛ كل حمولة تُطبَّع عبر
خريطة حقول للمصدر وتهبط في صندوق ecom الموحد بنفس مسار الإدخال اليدوي الكامل.

**الإضافة — `routes/ecom/intake_routes.py`:**
- جهة التاجر: إنشاء مصدر (نوع youcan/lightfunnels/sheets/custom، رمز INT-24hex سري)،
  قائمة بروابط الويب هوك الجاهزة + إحصاءات (received/created/duplicates/rejected)،
  تعديل/تعطيل/حذف، وخريطة حقول مخصصة.
- الطرف العام: `POST /api/ecom/intake/{tenant_id}/{token}` — استخراج dot-path مع بدائل
  «|» وفهرسة مصفوفات «.0»؛ خرائط افتراضية لبنى YouCan وLightFunnels والشيتات المسطّحة.
- إلغاء التكرار: حمولة بمعرّف طلب خارجي تُحدَّث بدل التكرار — إعادة الإرسال ترجع
  created:false بلا حجز مزدوج.
- الطلبات تمر بـ: كشف المكرر p240 + مخاطر COD + السمعة الشبكية + مرآة البيع POS،
  بقناة النوع (أضيفت youcan/lightfunnels/sheets/custom-intake إلى CHANNELS) وأكواد IN-XXXXXXXX.

**الاختبار E2E (TEST-P251، 16/16 PASS):** إنشاء الأنواع الأربعة ✓ منع custom بلا خريطة ✓
حمولة YouCan متداخلة → IN-85A02CFD ✓ إعادة نفس external_id → dedup ✓ LightFunnels
ببنية products.0 ✓ شيت مسطّح ✓ خريطة مخصصة (buyer.full_name/amount) ✓ حمولة غير قابلة
للتطبيع 422 + عدّاد rejected ✓ رمز فاسد/معطّل 404 ✓ الإحصاءات الدقيقة ✓.
التنظيف: 4 طلبات + مراياها + المصادر + السمعة؛ الثوابت سليمة (القيود=2، الصناديق على اللقطة).

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p251/


---

## p248 — إطار مزامنة الحالات العام للناقلين (ZR/Maystro/Noest/Ecotrack/Guepex)

**التاريخ:** 2026-08-21

**الهدف (فجوة منافسين — EcoManager يزامن عدة ناقلين):** المزامنة الآلية كانت حكراً على
يالدين (p74). الآن إطار عام بمحوّلات: أي ناقل جديد يُوصَّل ببيانات اعتماد فقط بلا كود.

**الإضافة — `services/ecom/courier_sync.py`:**
- سجل `COURIER_ADAPTERS`: yalidine (محوّل حقيقي يلف خدمة p74 القائمة كما هي) +
  generic_http لكل من ZR Express وMaystro وNoest وEcotrack وGuepex.
- المحوّل العام تصريحي بالكامل من credentials التكامل (المشفّرة p226): base_url،
  api_token، tracking_style (path/param)، auth_header/prefix، status_path (dot-path) —
  و`status_map` اختياري على التكامل يعلو على الاستدلال بالكلمات المفتاحية الافتراضي
  (livrée/delivered/تم التسليم → delivered؛ retour/échec/refus/مرتجع → refunded؛
  حالات «قيد التوصيل» لا تُسلَّم خطأً).
- وضع mock (`credentials.mock_status`) للاختبار والعرض بلا HTTP.
- `sync_courier_orders` يكرر حلقة p74: طلبات shipped برقم تتبع ← جلب الحالة ← ترجمة ←
  `change_order_status` الحقيقية (delivered يحصّل COD دفترياً في محفظة الناقل ويحقق
  الربح، refunded يرحّل الإرجاع)، وخطأ طرد واحد لا يوقف الدفعة.

**المسارات:** `GET /api/ecom/shipping/courier-adapters` (جاهزية كل ناقل) و
`POST /api/ecom/shipping/sync/{courier}` (400 برسالة عربية عند ناقل مجهول أو غير مُعَدّ).

**الاختبار E2E (TEST-P248، 8/8 PASS):** تكاملا guepex/noest بوضع mock + طلبان shipped
بتتبع ✓ قائمة المحوّلات (guepex جاهز / zr غير مُعَدّ) ✓ مزامنة guepex ← delivered عبر
آلة الحالات الحقيقية (تحصيل 700 دج في محفظة الناقل ecom_store_guepex بسطر دفتري) ✓
noest «En cours» ← بلا تغيير ✓ ناقل مجهول/غير مُعَدّ 400 ✓ إعادة المزامنة checked=0 ✓.
**ملاحظة توثيقية:** تحصيل COD يذهب لمحفظة الناقل `_courier_box` (ecom_store_{courier})
وليس محفظة المتجر العامة — سلوك قائم منذ p74.
التنظيف الدقيق: الطلبان + مرآة البيع + سطرا الحركات + التكاملان + السمعة + محفظة
الناقل الاختبارية حُذفت؛ ecom_store أُعيد إلى 2650 بالضبط، القيود=2، WEB000001 سليم.

**اعتماديات الناقلين الحقيقية تبقى من بنود المالك** (مفاتيح API لكل ناقل في صفحة التكاملات).

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p248/


---

## p249 — صندوق الوارد الاجتماعي الموحد + تحويل المحادثة إلى طلب

**التاريخ:** 2026-08-21

**الهدف (فجوة منافسين — social inbox):** محادثات Messenger/Instagram/WhatsApp تجتمع في
صندوق واحد؛ الموظف يرد من مكانه ويحوّل المحادثة إلى طلب مؤكد بلا إعادة كتابة.
**اعتماديات Meta/WhatsApp الحقيقية تبقى من بنود المالك** — هذه المرحلة تسلّم الإطار كاملاً
بويب هوك استقبال مُطبَّع مؤمَّن برمز (يغذّيه أي وسيط أو ويب هوك Meta الحقيقي) وإرسالاً
صادرة mock موثّقاً (sent_via=mock).

**الإضافة — `routes/ecom/social_inbox_routes.py`:**
- مصادر لكل قناة (رمز SOC-24hex سري، رابط ويب هوك جاهز، إحصاءات رسائل/محادثات).
- الويب هوك العام: upsert محادثة لكل (مصدر، external_user_id)، إلغاء تكرار التسليمات
  المعادة بـ external_message_id، عدّاد unread لكل محادثة، 422 للحمولات الناقصة.
- الصندوق: قائمة بمرشحات status/channel + عدّاد محادثات غير مقروءة، قراءة الثريد (تصفّر
  unread)، رد صادر، إغلاق.
- **التحويل:** `convert` يبني الطلب بنفس مسار الإدخال اليدوي الكامل (كشف مكرر p240، مخاطر
  COD، السمعة الشبكية، مرآة البيع POS) بقناة المحادثة نفسها (messenger/instagram/whatsapp —
  أُضيف messenger إلى CHANNELS) وربط conversation_id، ويمنع التحويل المزدوج (409).

**الاختبار E2E (TEST-P249، 15/15 PASS):** إنشاء مصدر ✓ قناة فاسدة 400 ✓ رسالتان من نفس
المستخدم → محادثة واحدة ✓ إعادة الرسالة → dedup ✓ حمولة ناقصة 422 ✓ رمز فاسد 404 ✓
الصندوق (unread=2، آخر رسالة) ✓ القراءة تصفّر ✓ الرد الصادر mock ✓ التحويل → SOC-56692136
بقناة messenger وإجمالي 3900 ✓ التحويل المزدوج 409 ✓ الإغلاق ✓.
التنظيف: الطلب + مرآته + 3 رسائل + المحادثة + المصدر + السمعة؛ الثوابت سليمة تماماً.

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p249/


---

## p250 — تعدد المتاجر لكل مستأجر (Sub-stores)

**التاريخ:** 2026-08-22

**الهدف (فجوة منافسين — EcoManager multi-boutique):** المستأجر يدير عدة واجهات متاجر
بعلامات مختلفة — لكل منها رابط slug واسم ووصف وكتالوج فرعي — فوق نفس المخزون والطلبات.

**التصميم (توافقية كاملة مع المتجر الافتراضي):**
- `routes/store_multi_routes.py`: إنشاء (slug بصيغة صارمة، فريد عالمياً عبر
  main_db.store_slugs، واسم فريد عبر المستأجرين كقاعدة p72)، قائمة بعدد المنتجات،
  تعديل (إعادة تسمية/وصف/تعطيل — مزامنة سجل الروابط آلياً)، حذف (يفصل الكتالوج دون
  مساس بالمنتجات ويحرّر الرابط)، ربط/فصل منتجات (تخطّي المكرر والمجهول)، كتالوج المتجر.
- الواجهة العامة: `get_public_store` في online_store_routes — الرابط الحامل store_id
  يحل المتجر الفرعي (404 إن عُطّل)، يعلو اسمه/وصفه على الإعدادات المعروضة، وكتالوجه =
  مدخلات store_products بـ store_id الخاص به **فقط** (تُجاوز رؤية العائلات p149 —
  مفهوم المتجر الافتراضي). الرابط بلا store_id = المتجر الافتراضي بسلوكه السابق حرفياً
  (المدخلات القديمة بلا store_id).
- فهارس: stores(id/slug فريدان)، store_products(store_id+product_id).

**الاختبار E2E (TEST-P250، 17/17 PASS):** المتجر الافتراضي nouacer-telecom ثابت (56 منتجاً
ظاهراً قبل وأثناء وبعد) ✓ إنشاء فرع test-p250-shop ✓ تعارض الرابط/الاسم 409 ✓ صيغة رابط
فاسدة 400 ✓ الفرع الفارغ يعرض 0 منتج باسمه المستقل ✓ الربط (+تخطّي التكرار) → كتالوج=1 ✓
التعطيل → 404 علناً ✓ الفصل → كتالوج فارغ ✓ الحذف يحرّر الرابط (إعادة إنشاء بنفس slug) ✓.
التنظيف عبر API نفسه؛ تحقق ختامي: صفر بقايا، المتجر الافتراضي سليم (18 مدخلاً نشطاً)،
الصناديق على اللقطة، القيود=2.

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p250/

---

## ✅ ختام برنامج فجوات المنافسين (12/12)

اكتمل تنفيذ كل بنود تقرير المقارنة: p240 المكررات • p241 SMS الحالات • p242 إسناد مركز
الاتصال • p243 رفع Excel • p244 التتبع العام /track • p245 الإحالات • p246 تذاكر الدعم •
p247 واجهة السائق • p248 مزامنة الناقلين • p249 الوارد الاجتماعي • p250 تعدد المتاجر •
p251 ويب هوك الاستقبال. **بنود المالك المتبقية:** مفاتيح بوابة SMS الحقيقية (p241)،
اعتماديات Meta للوارد الاجتماعي (p249)، مفاتيح API للناقلين الإضافيين (p248).
---

## p252 — شاشتا الإدارة: السائقون + الإحالات (واجهة لِـ p247/p245)

**الهدف:** أول شاشتي إدارة من الشاشات السبع المتبقية — إدارة السائقين وبرنامج الإحالات —
بنفس نظام التصميم الحالي دون أي تغيير في الشكل (القاعدة 1).

**الواجهة:**
- `frontend/src/pages/ecom/EcomDriversPage.js` — مسار `/ecom-hub/shipping/drivers` (adminOnly):
  قائمة السائقين (مشاوير مفتوحة / إجمالي المُسلَّم)، إنشاء سائق (يُصدر رابط token تلقائياً)،
  نسخ رابط `/driver/{token}`، تفعيل/تعطيل، تدوير الرابط (يبطل القديم وينسخ الجديد)، حذف
  (يرفضه الـ backend عند وجود مشاوير مفتوحة).
- `frontend/src/pages/ecom/EcomReferralsPage.js` — مسار `/ecom-hub/store/referrals` (adminOnly):
  قائمة الإحالات مع إحصاءات (طلبات/مُسلَّمة/مستحقة/مدفوعة)، إنشاء (fixed/percent، رمز تلقائي
  أو يدوي)، نسخ الرمز، تفعيل/تعطيل، حذف، سجل المكافآت والدفعات في نافذة، زر دفع المستحق.
- `EcomHubShell.js`: تبويبان فرعيان جديدان — «السائقون» ضمن الشحن، «الإحالات» ضمن المتجر.
- `App.js`: استيرادان + مساران جديدان تحت /ecom-hub.

**النشر:** build جديد (main.9eaa67a8.js) عبر nohup + scripts/deploy.sh — الإصدار
20260822_002357. الحِزم القديمة محفوظة (cp -r فقط). التحقق من الحزمة المخدومة عبر سلاسل
Latin/data-testid (drivers-page, referral-create-btn, shipping/drivers, store/referrals) ✓.

**الاختبار:** الـ backend نفسه مُختبَر E2E في p245 (الإحالات 14/14) وp247 (السائقون) بنفس
الـ endpoints التي تستهلكها الشاشتان. اختبار دخان حي برمز المستأجر: GET /ecom/drivers →
200 []، GET /ecom/referrals → 200 [] (المستأجر الحقيقي فارغ — لا بيانات اختبار عليه).

**البيانات الحقيقية:** لم تُمَس — لا أوامر CREATE على المستأجر الحقيقي في هذه المرحلة.

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p252/ (App.js, EcomHubShell.js, EcomHubTabs.js)


---

## p253 — شاشة الوارد الاجتماعي (واجهة لِـ p249)

**الواجهة:** `frontend/src/pages/ecom/EcomSocialInboxPage.js` — مسار `/ecom-hub/channels/social-inbox`،
تبويب فرعي «الوارد الاجتماعي» ضمن القنوات:
- بطاقة المصادر: إنشاء مصدر (ماسنجر/إنستغرام/واتساب) مع نسخ رابط الويب هوك الكامل، حذف.
- صندوق الوارد: فلاتر قناة/حالة، شارة عدد غير المقروء، شارات unread لكل محادثة.
- نافذة المحادثة: فقاعات رسائل (وارد/صادر)، رد (وضع محاكاة — الإرسال الحقيقي بانتظار
  اعتماديات Meta من المالك)، إغلاق، تحويل لطلب بنموذج كامل (زبون/منتج/كمية/سعر/شحن/ولاية).

**النشر:** main.a0201916.js — الإصدار 20260822_003243. التحقق عبر testids اللاتينية ✓.
**اختبار الدخان:** GET /ecom/social/sources → 200 []، GET /ecom/social/conversations → 200.
**البيانات الحقيقية:** لم تُمَس.
**النسخ الاحتياطي:** /opt/ntcommerce/backups/p253/

---

## p254 — شاشتا تذاكر الدعم (واجهة لِـ p246)

**الواجهة:**
- `frontend/src/pages/SupportTicketsPage.js` — مسار `/support` للمستأجر: قائمة تذاكره مع
  شارة «رد جديد»، إنشاء تذكرة (موضوع/تصنيف/أولوية/وصف)، نافذة المحادثة بفقاعات (المستأجر ↔
  فريق المنصة)، الرد يعيد فتح المحلولة، الإغلاق. دخول من القائمة الجانبية «الرسائل
  والإشعارات → تذاكر الدعم».
- `frontend/src/pages/admin/saas/SaasSupportPage.js` — مسار `/saas-admin/support`
  (superAdminOnly): كل تذاكر المشتركين مع فلتر حالة وشارة «بلا رد»، نافذة التذكرة مع تغيير
  الحالة/الأولوية والرد (open → in_progress تلقائياً). دخول من «إدارة SaaS → تذاكر الدعم».

**النشر:** main.4dbee887.js — الإصدار 20260822_004120. التحقق عبر testids ✓.
**اختبار الدخان:** GET /support/tickets (مستأجر) → 200 []، GET /admin/support/tickets
(منصة) → 200 + عدّاد. منطق الحالات الكامل مُختبَر E2E في p246 (18/18).
**البيانات الحقيقية:** لم تُمَس.
**النسخ الاحتياطي:** /opt/ntcommerce/backups/p254/ (App.js, Layout.js)

---

## p255 — شاشتا الاستقبال والمتاجر الفرعية + بطاقة مزامنة الناقلين (واجهة لِـ p251/p250/p248)

**الواجهة:**
- `frontend/src/pages/ecom/EcomIntakeSourcesPage.js` — مسار `/ecom-hub/channels/intake`
  (adminOnly)، تبويب «استقبال الطلبات» ضمن القنوات: إنشاء مصدر (YouCan/LightFunnels/Sheets/
  مخصص مع محرر خريطة JSON)، نسخ رابط الويب هوك، عدادات (وارد/أُنشئ/مكرر/مرفوض)، تفعيل/حذف.
- `frontend/src/pages/ecom/EcomMultiStorePage.js` — مسار `/ecom-hub/store/multi`
  (adminOnly)، تبويب «المتاجر الفرعية» ضمن المتجر: إنشاء (اسم/رابط/وصف)، فتح /shop/slug،
  تفعيل/تعطيل، حذف، نافذة كتالوج كاملة (المرتبطة + بحث وربط جماعي بالعلامات + فصل).
- `EcomShippingTab.js`: بطاقة «مزامنة حالات الناقلين» (CourierSyncCard) — تعرض الناقلين الستة
  المسجلين مع جاهزية المزامنة وزر «مزامنة الآن» لكل ناقل وملخص آخر نتيجة
  (delivered/returned/unchanged/errors).

**النشر:** main.a55e57ec.js — الإصدار 20260822_004718. التحقق عبر testids ✓.
**اختبار الدخان:** GET /ecom/intake-sources → []، GET /store/multi → []،
GET /ecom/shipping/courier-adapters → الناقلون الستة (غير مهيأين على المستأجر الحقيقي —
بانتظار مفاتيح المالك). المنطق مُختبَر E2E في p248/p250/p251.
**البيانات الحقيقية:** لم تُمَس.
**النسخ الاحتياطي:** /opt/ntcommerce/backups/p255/

---

## p256 — سجل شركات الشحن الجزائرية الكامل (78 شركة) في كل أنحاء نظام الشحن

**السجل الموحد الجديد:** `backend/services/ecom/algerian_couriers.py` — 61 شركة جديدة
(عائلة Ecotrack + شركات مستقلة: Abex, World Express, Allo Livraison, Zimou, Easy & Speed,
Nord Ouest, Sogex…) بمعرّفات snake_case ثابتة + أسماء عربية — مصدر واحد تستورده كل المواضع.

**المواضع الموسّعة (backend):**
- `shipping_loyalty_routes.ALGERIAN_SHIPPING_COMPANIES`: 17 → 78 (كتالوج /shipping/companies،
  إعدادات /shipping/settings، مقارنة الأسعار /shipping/calculate-rate).
- `ecom/constants.py`: CHANNELS — كل شركة تحصل على مدخل kind='shipping' (تخزين الاعتماديات
  في ecom_integrations — مسار الإنشاء يتحقق من CHANNEL_KEYS) + SHIPPING_PROVIDERS (18 → 79).
- `courier_sync.COURIER_ADAPTERS`: 6 → 67 — كل شركة جديدة بمحوّل generic_http؛ إدخال
  base_url + api_token في تكاملها يفعّل المزامنة دون أي كود.
- `shipping_routes.COURIER_DISPLAY_NAMES` و`online_store_routes.PROVIDER_LABELS`: أسماء عربية
  للسجل كاملاً (التسويات، خيارات شحن واجهة المتجر).

**الواجهة:** `EcomShippingTab.COURIER_SCHEMA`: 3 → 64 صف ربط في بطاقة «ربط شركات الشحن»
(الجديدة بحقول api_token + base_url)؛ بطاقة «مزامنة حالات الناقلين» (p255) تعرض الـ 67
تلقائياً؛ `ecomConstants.SHIPPING_PROVIDERS` موسّع للتسميات.

**الاختبار الحي (المستأجر الحقيقي):** /shipping/companies=78 ✓ courier-adapters=67 ✓
/shipping/settings=79 ✓ calculate-rate لكل الـ78 ✓ مزامنة ناقل غير مهيأ → 400 بالعربية ✓
تكامل TEST-P256 على قناة abex الجديدة → يُقبل (kind=shipping) ✓ mock_status → sync_ready
والمزامنة تعمل (0 طلبات مشحونة) ✓ الحذف → صفر بقايا ✓.

**البيانات الحقيقية:** القيود=2، ecom_store=2650، WEB000001=delivered. ملاحظة: لوحظ تحويل
11300 دج من الصندوق النقدي إلى الخزنة بين الجلسات — عملية يدوية للمستأجر (الإجمالي ثابت)،
لم تُمَس.

**النشر:** main.33acc64f.js — الإصدار 20260823_133324.
**النسخ الاحتياطي:** /opt/ntcommerce/backups/p256/

### p256 (تدقيق شامل + تغطية موضعين إضافيين)
تدقيق دقيق لظهور الـ 61 شركة الجديدة في كل طبقة: (1) داخل الكود — CHANNELS shipping=64،
SHIPPING_PROVIDERS=79، COURIER_ADAPTERS=67، COURIER_DISPLAY_NAMES=64 — السجل مغطى 61/61
في الجميع بلا تناقض تسميات؛ (2) عبر API الحي — /shipping/companies=78 فريدة بلا اسم عربي
فارغ، /shipping/settings=79 (78 + سجل main الموجود مسبقاً)، calculate-rate=78،
/ecom/channels=79 كلها kind=shipping، courier-adapters=67؛ (3) سلوكياً — شحن طلب بمزود
جديد (sogex/nord_ouest/khotwa) يتجاوز تحقق المزود (404 لطلب وهمي) بينما مزود مختلق يُرفض
400، وإنشاء/حذف تكامل على قنوات world_express/lynx/allo_livraison/abex ينجح بلا بقايا؛
(4) الواجهة المنشورة — COURIER_SCHEMA=61/61 وSHIPPING_PROVIDERS=61/61 والأسماء اللاتينية
كلها في main.33acc64f.js المخدومة من index.html. وأثناء التدقيق اكتُشف موضعان إضافيان
فغُطّيا: اقتراح أرخص ناقل (smart_routes) صار يمسح كل تكاملات الشحن النشطة بدل الثلاثة
الأولى، ورسالة «تم الشحن» (ecom_order_service) تعرض اسم أي ناقل من السجل بالعربية.

---

## p257 — محرك الأكواد الذري: لا تشابك ولا تكرار في كل كيانات النظام

**المشكلة:** كل المولدات كانت «اقرأ الأكبر + 1» — سباق تزامن يعطي نفس الرقم لطلبين
(وُجد فعلاً على المستأجر الحقيقي: sales.code = MP00001 مكررة مرتين).

**الحل:** `services/code_generator.py` أُعيد كتابته — كل كود يُسحب من عدّاد ذري
(`_code_counters` + findOneAndUpdate $inc) لكل (collection, field, prefix, سنة).
التهيئة الأولى من الأقصى الموجود فلا يُعاد إصدار أي رقم قديم، والصيغة لم تتغير إطلاقاً.
`generate_code` القديمة صارت غلافاً — كل مستدعيها الـ19 حصلوا على الذرية دون تعديل.

**الترحيل للمولدات المضمّنة (كانت aggregation منفصلة):** المبيعات BV، المشتريات AC،
الزبائن CL، كود المنتج AR (field=article_code)، SKU (كان count+1 يتصادم بعد الحذف —
صار عدّاداً لكل بادئة عائلة)، ومولدات utility الخمسة: الموردون FR، المصاريف CH،
الجرد IN، سجلات تحديث الأسعار MT، الجلسات اليومية S — كلها بنفس الصيغة تماماً.

**الفهارس الفريدة (شبكة أمان):** main.py يضمن partial unique index على code/article_code/
sku لكل الكيانات (14 مجموعة) في كل قواعد المستأجرين — يتسامح مع الحقول الفارغة ولا يكسر
الإقلاع عند أي فشل. sales.code أُبقي فهرساً عادياً مؤقتاً بسبب التكرار الموجود مسبقاً
(MP00001×2 — بانتظار قرار المالك).

**الاختبار (المستأجر التجريبي):** سباق 20 سحباً متزامناً → 20 فريداً متسلسلاً ✓ صيغة
بلا سنة ✓ تسلسل جديد يبدأ من 1 ✓ الاستمرارية تتخطى المُدرج ✓ field مخصص ✓ تنظيف كامل.
**المستأجر الحقيقي (قراءة فقط):** التسلسل التالي صحيح — BV0005/26، CL0194، AR9219،
CH00002/26 — وصفر كتابة (0 مستندات عدّادات).

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p257/

---

## 2026-08-23 — p258: أكواد عامة مختومة بالمستأجر (tenant-stamped public codes)

**المشكلة:** الأكواد العامة (متجر إلكتروني WEB، سوق موحد MP، طلبات ecom بقنواتها
ECO/XL/SOC/IN) كانت فريدة داخل المستأجر فقط — نفس الكود قد يوجد عدة مرات عبر
المستأجرين، فتضطر صفحة التتبع العامة لمسح كل قواعد المستأجرين (حتى 50).

**الحل:** ختم المستأجر من short_id: ‏NT-0004‏ → ‏NT4 (تحويل ثنائي الاتجاه:
`stamp_to_short_id`). كل كود عام جديد يحمل الختم:
- `WEB-NT4-000123` — طلبات المتجر (متسلسل ذري، يكمل من الأقصى القديم WEB000002)
- `MP-NT4-00002` — طلبات السوق الموحد (متسلسل ذري بدل count+retry بثلاث محاولات)
- `ECO-NT4-A1B2C3D4` / `XL-NT1-...` / `SOC-...` / `IN-...` — hex عشوائي مختوم
- المستأجر المجهول/المنصة يسقط تلقائياً للصيغة القديمة غير المختومة (توافق تام)

**الملفات:**
- services/code_generator.py: ‏`tenant_stamp` (مع cache)، `db_stamp` (يستخرج
  المستأجر من اسم قاعدة البيانات)، `public_order_code` (ذري متسلسل مختوم)،
  `public_hex_code` (عشوائي مختوم)
- online_store_routes.py: WEB count+1 → public_order_code(store_orders, order_number)
- marketplace_routes.py: MP count+retry → public_order_code(ecom_orders, order_code)
- ecom/orders_routes.py: ‏_generate_order_code صارت async مختومة (ECO)
- ecom/bulk_import_routes.py (XL) / intake_routes.py (IN) / social_inbox_routes.py (SOC)
- ecom/public_track_routes.py: مسار سريع O(1) — الكود المختوم يسمّي مستأجره
  (يستثني is_permanent_test مثل المسح القديم)، مع سقوط كامل للمسح القديم
  فالأكواد القديمة (WEB000001) تبقى قابلة للتتبع

**الاختبار:**
- وظيفي (حاوية، مستأجر تجريبي): الختم NT1/NT4 ✓ العكس ✓ cache ✓ تسلسل ذري
  ‏20/20 فريداً تحت التزامن ✓ hex مختوم ✓ سقوط المنصة ✓ حل المسار السريع ✓
  تنظيف كامل (0 بقايا، 0 عدادات)
- قراءة فقط (المستأجر الحقيقي): الأقصى القديم WEB=2 (المالك أنشأ WEB000002
  بنفسه في 2026-08-22) → التالي WEB-NT4-000003 ✓ MP=0 → التالي MP-NT4-00001 ✓
- API: إنشاء طلب ecom برمز المستأجر التجريبي → ‏ECO-NT1-52892AAF ✓
  (ورمز المستأجر الحقيقي يختم NT4 — تأكد أثناء اختبار عرضي، حُذف فوراً
  بدقة: cancel→delete، 0 بقايا، القيود=2 والصناديق دون تغيير)
- ‏GET /track/WEB000001 → found (المسح القديم) ✓
  ‏GET /track/ECO-NT1-... (تجريبي) → found:false (مستبعد) ✓
  ‏GET /track/MP-NT4-99999 → found:false فوري (مسار سريع) ✓

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p258/

---

## 2026-08-23 — p259: الهوية المركبة لمنتجات السوق الموحد (listing codes)

**الوضع قبل:** كتالوج السوق الموحد (main_db.marketplace_catalog) كان يُعرَف بـ
(tenant_id + product_id) — فهرس فريد مركب موجود منذ p227، لكن بلا معرّف علني
فريد عالمياً يمكن لزبون أو نظام خارجي الإشارة به لمنتج معين عند مستأجر معين.

**الحل:** كل صف كتالوج تحمل الآن `listing_code` عاماً مختوماً بالمستأجر:
‏MPR-NT1-00001 (منصة-واسع، عدّاد ذري في main_db._code_counters، الختم من
short_id للمستأجر الناشر). يُسحب مرة واحدة عند أول نشر ويبقى ثابتاً عبر
إعادة النشر (idempotent — إعادة النشر تحدّث الهامش/السعر فقط).

**الملفات:**
- services/code_generator.py: ‏`public_order_code` قبل معامل `stamp` صريحاً
  (لمجموعات المنصة في main_db حيث المستأجر معروف من السياق) + ‏`short_id_to_stamp`
  علنية
- services/event_consumers.py (handle_product_published): سحب listing_code عند
  أول upsert والاحتفاظ به لاحقاً
- routes/marketplace_routes.py: ‏POST /marketplace/order يقبل `listing_code`
  (المسار الأساسي) أو `product_id` (توافق مع الروابط القديمة) أو 400؛ صف
  marketplace_orders يسجّل listing_code؛ الكتالوج العام يعرضه
- main.py: فهرس فريد جزئي `marketplace_listing_code_unique` على listing_code
  (يتسامح مع الصفوف القديمة بلا كود)

**الاختبار (المستأجر التجريبي، تنظيف دقيق كامل):**
- نشر منتج → صف الكتالوج listing_code=MPR-NT1-00001 ✓ short_id=NT-0001 ✓
- إعادة نشر بهامش مختلف → نفس الكود، سعر محدّث (110→120) ✓
- طلب عام بـ listing_code → order_code=MP-NT1-00001، مخزون 5→3، صف تسوية
  المنصة يحمل listing_code ✓
- طلب عام بـ product_id (توافق قديم) → MP-NT1-00002 ✓
- طلب بلا معرّف → 400 «معرّف المنتج مطلوب» ✓
- التنظيف: حذف الطلبين + صفوف التسوية + صف الكتالوج + الإدراج + المنتج +
  العدادين — 0 بقايا، الكتالوج والتسويات فارغة كما كانت ✓

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p259/

---

## 2026-08-23 — p260: البحث الشامل بكل الأكواد (global search over all entity codes)

**اكتشاف:** ‏/api/search/global كان **كوداً ميتاً** — main.py يستورد `router`
من routes.search_routes بينما الملف يعرّف مصنعاً فقط، ففشل الاستيراد silently
مرتين ولم يُسجَّل المسار إطلاقاً. الواجهة (GlobalSearchModal) كانت تستدعي
/products /customers /sales منفصلة — أي أن البحث بأي كود آخر كان مستحيلاً.

**الحل:**
- routes/search_routes.py: إعادة كتابة /search/global — مواصفات ‏19 نوع كيان
  (منتج AR/باركود/SKU، زبون CL، مورد FR، بيع BV/رقم فاتورة، شراء AC، مصروف CH،
  موظف، مستخدم، صيانة RP/ticket/IMEI، طلب ecom ECO/WEB/MP + رقم تتبع الناقل +
  هاتف الزبون، طلب متجر WEB، جلسة يومية S، جرد IN، سجل أسعار MT، شريك، مخزن،
  قسط، شحن رصيد، اشتراك رقمي) — حقول الأكواد تُطابَق ببادئة (index-friendly)
  والأسماء باحتواء؛ sales/purchases الضخمة (36.7 ألف) prefix فقط حتى لا يحدث
  مسح كامل. الاستعلامات الـ19 متوازية (asyncio.gather)، كل مجموعة 5 نتائج،
  وكل نتيجة تحمل `link` جاهزاً للتنقل. الرد: groups + results (توافق قديم)
- main.py: تسجيل routes.search_routes في _AUTO_REG_MODULES (المصنع يستلم
  db + get_current_user من السياق) + فهرسا p260_invoice_number على
  sales/purchases
- frontend GlobalSearchModal.js: انتقال من 3 استدعاءات إلى /search/global واحد —
  يعرض المجموعات التي يرجعها الخادم بترتيبه، نفس التصميم تماماً (نفس Section/
  الصفوف/التذييل)، أيقونة وتسمية عربية لكل نوع، التنقل عبر item.link

**الاختبار (curl على المستأجر الحقيقي — قراءة فقط):**
- BV0004 → sales ✓ CL0193 → customers ✓ AR9218 → products ✓
- WEB000001 → sale + ecom_order + store_order معاً ✓ CH00001 → expenses ✓
  FR0112 → suppliers ✓ AZIZ (اسم) → customer + sale ✓
- الزمن 60–90ms رغم 36.7 ألف بيع ✓ suggestions/history يعملان ✓ q<2 → فارغ ✓
- تنظيف دقيق لسجلات البحث التي أحدثها الاختبار (7+7 → 0) ✓
- الواجهة: build → deploy → main.55f0a2ba.js يحمل search/global +
  global-search-input ✓

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p260/

---

## 2026-08-23 — p261: باركود + QR على الفواتير والوصولات

**الهدف:** كل كود نظام يُطبع على مستنداته قابلاً للمسح — QR لكاميرا الهاتف
وCode128 خطي لقارئات الباركود في نقطة البيع.

**المكونات:**
- backend/routes/qr_routes.py (جديد، مسجَّل في _AUTO_REG_MODULES):
  ‏GET /api/qr.png?text=...&size=140 — توليد QR PNG عام (qrcode==8.2)، بلا
  مصادقة (يرسّم نصاً فقط، لا يكشف بيانات)، حد 300 حرف، حجم 60–400px،
  Cache-Control يوم كامل
- frontend/src/lib/docCodes.js (جديد): ‏`barcodeDataURL` (Code128 عبر JsBarcode
  على canvas مخفي — يعمل دون اتصال)، `qrImgUrl` (نفس الأصل /api/qr.png)،
  `docCodesHtml` (كتلة موحّدة QR+باركود لكل القوالب)
- الوصولات الحرارية (ReceiptService): كتلة QR+باركود لكود الفاتورة قبل التذييل
- المستندات العامة (printDocuments — بيع/شراء/مصروف/زبون/منتج، 58/80مم وA4):
  ‏showCodes افتراضياً true (قابلة للإيقاف بـ options.showCodes=false)
- فاتورة طلب التجارة الإلكترونية (ecomOrderInvoice): QR يفتح صفحة التتبع
  العامة ‏{origin}/track/{order_code} على هاتف الزبون + باركود الكود

**الاختبار:**
- ‏GET /api/qr.png?text=https://nt-commerce.net/track/WEB-NT4-000003 → PNG
  ‏140×140 ✓ نص فارغ → 400 ✓ health 200 بعد الإقلاع ✓
- esbuild سليم للملفات الأربعة ✓
- build → deploy: main.1e5ed5cd.js منشور ويحمل qr.png?text= و doc-codes ✓
- لم تُلمس أي بيانات (تغيير كود بحت)

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p261/

---

## 2026-08-23 — p262: البريد — مزوّد واحد يكفي

**الشكوى:** المالك أضاف مفتاح Resend لكن الصفحة توحي أن Brevo مطلوب.
**الواقع:** الخلفية أصلاً بها تسلسل تلقائي (Brevo ← Resend ← SendGrid ← mock) —
أي مفتاح واحد يكفي ويُستعمل على كامل النظام. المشكلة كانت عرضية بحتة.
**الإصلاح (EmailSettingsPage):** المزودات غير المُعدّة تظهر «غير مُعَدّ (اختياري)»
بالرمادي بدل الأحمر المُنذِر + لافتة خضراء «مزوّد واحد يكفي…» عند وجود أي مفتاح +
توضيح في العنوان وعنصر «تلقائي» لسلسلة الاختيار الفعلية.

## 2026-08-23 — p263: إصلاحات واجهة السوبر أدمن

- **اختفاء القائمة الجانبية في «المنصة كمورد»:** السبب — SupplierAdminPage كان
  الصفحة الوحيدة بدون غلاف `<Layout>`؛ أُضيف الغلاف فتبقى القائمة ظاهرة دائماً.
- **نوع النشاط في المشتركين:** الشارة كانت تغطي 3 أنواع فقط (وبها خطأ
  wholesaler/wholesale)؛ الآن تجلب الـ23 ملفاً من GET /saas/business-profiles
  وتعرض الاسم العربي الدقيق لأي نوع نشاط.
- النشر: main.27f65811.js (one-provider-enough-note ✓ business-profiles ✓)

**النسخ الاحتياطي:** /opt/ntcommerce/backups/p262, p263

## p264 — إدارة الميزات في الخطط + توحيد مفاتيح الأنشطة (2026-08-23)

### المشكلات المكتشفة والمُصلحة
1. **فقدان صامت لبيانات الخطط**: نموذج PlansPage كان يرسل مفاتيح قديمة (price_monthly, limits.max_products, features.pos/ai_tips) لا تطابق مخطط PlanCreate/PlanFeatures — pydantic كان يحذفها بصمت، فلم تُحفظ أي ميزة تُعدَّل من الواجهة إطلاقاً.
2. **مفتاح نشاط غير صالح**: القيمة الافتراضية "retailer" ليست مفتاحاً صالحاً في BUSINESS_PROFILES (الصحيح: "retail") — كانت الشارات لا تُعرض بشكل صحيح.

### التغييرات
- backend/routes/saas/schemas.py: إضافة business_type إلى PlanCreate/PlanUpdate/PlanResponse؛ تصحيح الافتراضي retailer→retail (موضعان).
- backend/routes/saas/tenants_routes.py: عند إنشاء مشترك، نوع النشاط يُرث من خطة الاشتراك (plan.business_type) كقيمة افتراضية؛ تطبيع retailer→retail وwholesaler→wholesale.
- backend/routes/saas/agent_self_service_routes.py: نفس التطبيع في مسار الوكيل.
- backend/models/schemas/saas.py: تصحيح الافتراضي في المخطط القديم (موضعان).
- **ترحيل بيانات**: 4 مستأجرين business_type: retailer→retail (NT-0001, NT-0004, NT-0005, NT-0006). features_override لمُستأجر الإنتاج {has_woocommerce:true} سليم. (ملاحظة: business_profiles.py يملك خريطة أسماء مستعارة تدعم retailer أصلاً، فالسلوك متطابق).
- frontend PlansPage.js: إعادة كتابة كاملة — مفاتيح المخطط الحقيقية (monthly_price/six_month_price/yearly_price/features.max_*/14 ميزة has_*) + قائمة نوع النشاط من /saas/business-profiles (23 نشاطاً) + شارات ∞ للحدود غير المقيدة + testids (plan-monthly-price, plan-max-products, plan-business-type, plan-feature-{key}, save-plan-btn).
- frontend AgentDashboardPage.js: قيم select الأنشطة retailer→retail وwholesaler→wholesale (التسميات العربية دون تغيير).
- frontend SubscribersPage.js: القيم الافتراضية retailer→retail.

### الاختبارات
- إنشاء خطة TEST-P264 بـ business_type=pharmacy + features → استرجاع → تحديث (repair, max_products=999, has_pos=false) → تحقق من mongo مباشرة → حذف → بقايا TEST: 0.
- الثوابت: journal_entries=2، store_orders=2، cash_boxes دون تغيير.
- bundle main.c6900a45.js منشور؛ العلامات: plan-business-type ✓، plan-monthly-price ✓، save-plan-btn ✓، plan-feature- (ديناميكي) ✓، business-profiles ✓.

## p265 — حسابات تجريبية دائمة لكل نوع نشاط (2026-08-23)

### التنفيذ
- إنشاء 23 حساباً تجريبياً دائماً (NT-0007 → NT-0029) — حساب لكل نشاط من BUSINESS_PROFILES الـ23 عبر POST /saas/tenants (تهيئة كاملة: نسخ قاعدة القالب + تطبيق ملف النشاط features_override + عائلات منتجات مبدئية).
- تعليمها is_permanent_test=true + notes موثقة؛ بيانات الدخول الموحدة: demo-{profile}@nt-commerce.net / Demo@2026 (مثال: demo-pharmacy@nt-commerce.net).
- TenantResponse أضيف is_permanent_test؛ شارة «تجريبي دائم» في قائمة المشتركين (data-testid=perm-test-badge) بنفس نمط الشارات الحالي.

### الاختبارات
- 23/23 مُهيأة بالكامل (database_initialized + عائلات > 0).
- دخول demo-pharmacy ناجح.
- التتبع العام يستثني الحسابات التجريبية: WEB-NT7-000001 → found:false دون تسريب؛ WEB000001 (حقيقي) يعمل.
- /saas/tenants يعرض 24 حساباً دائماً (23 + NT-0001).
- bundle main.9b73d965.js منشور؛ العلامة perm-test-badge ✓؛ الثوابت المالية سليمة.

## p266 — أكواد ذرية للمحافظ والمدفوعات وكيانات السوبر أدمن + تدقيق الأكواد (2026-08-23)

### التغييرات
- **توحيد مصانع المحافظ**: 4 نسخ get_or_create_wallet متناثرة (wallet_service + 3 مضمنة في wallet routes) كانت تُنشئ بلا كود ومعرضة لتعارض السباق → كلها تفوِّض الآن للمصنع القانوني في services/wallet_service.py: كود WL ذري + إعادة قراءة آمنة عند DuplicateKeyError.
- أكواد جديدة عند كل نقطة إنشاء: المحافظ WL-XXXXXX (main + كل قاعدة مستأجر)، طلبات الشحن/السحب WR-XXXXXX (مسارا المستأجر والوكيل)، الوكلاء AG-XXXX، مدفوعات الاشتراكات PAY-XXXXXX، مدفوعات الموردين SP-XXXXXX (موضعان).
- **فهارس فريدة** (main.py): wallets.code + wallet_requests.code + saas_agents.agent_code + saas_payments.payment_code + supplier_payments.payment_code على القاعدة الرئيسية؛ wallets.code + (entity_type, entity_id) على كل قاعدة مستأجر. (فهرس (entity_type, entity_id) الفريد على main موجود منذ p205.)
- **ملء رجعي**: 5 محافظ رئيسية (WL000001–5)، طلبان (WR000001–2)، وكيل (AG0001)، محافظ المستأجرين — كلها بالعدّاد الذري public_order_code.
- **endpoint تدقيق جديد**: GET /saas/id-audit (سوبر أدمن) — تقرير تغطية الأكواد والمكررات للقاعدة الرئيسية وكل قواعد المستأجرين.
- الواجهة: عمود «الكود» في صفحة مدفوعات الاشتراكات (data-testid=payment-code) + كود الطلب في بطاقات المحفظة (req-code). payment_code أضيف إلى SubscriptionPaymentResponse.

### الاختبارات
- E2E: طلب شحن جديد عبر واجهة API للمستأجر التجريبي حصل على WR000003 ذرياً → حُذف → بقايا 0.
- id-audit: total_missing=0، total_duplicate_codes=0 عبر 27 مستأجراً.
- الثوابت المالية سليمة. bundle main.8b2f8a2e.js منشور، العلامات payment-code/req-code ✓.

## p267 — عمولات المنصة في إدارة SaaS + أكواد ذرية للعمولات (2026-08-23)

### الوضع المكتشف
- فوترة AI كموزِّع كانت مكتملة (خلفية + واجهة AiBillingCard): هامش %، سعر صرف USD→DZD، أسقف شهرية لكل مستأجر، تشغيل فوترة وخصم من المحافظ — لا حاجة لإعادة بناء.
- سحوبات الوكلاء واعتمادها موجودة في SaasAdminPage.
- **الفجوة الوحيدة**: عمولات المنصة (أرباح المالك من الخدمات المتوسَّط فيها: فرق سعر السوق الموحد/الشحن...) — endpoints موجودة (summary/history) بلا أي واجهة.

### التغييرات
- PlatformCommissionsCard.js جديدة: 3 بطاقات ملخص (الفترة/اليوم/عدد العمليات) + تفصيل حسب الخدمة + جدول أحدث 50 عمولة + مبدّل فترة 7/30/90 يوماً. تبويب جديد «💰 عمولات المنصة» في /saas-admin/finance.
- **إصلاح سباق**: commission_engine كان يولّد PCOM-NNNNN بـ count+1 (غير ذري — ازدواج محتمل تحت التزامن) → public_order_code الذري.

### الاختبارات
- GET /saas/platform-commissions/summary?days=30 ✓ (200، بنية كاملة) | history ✓.
- bundle main.c32848f5.js؛ العلامات finance-tab-pcom / pcom-total / pcom-history-table ✓.

## p268 — متصفح بيانات المشتركين للسوبر أدمن (قراءة فقط + تدقيق) (2026-08-23)

### التغييرات
- backend/routes/saas/data_browser_routes.py (جديد): 5 endpoints للسوبر أدمن فقط —
  search شامل داخل مستأجر (منتجات/عملاء/مبيعات/موردون)، products بأسعار الشراء والبيع والجملة والمخزون مع ترقيم (skip/limit≤200)، sales، customers، access-log.
- **كل عملية اطلاع تُدوَّن** في main_db.saas_data_access_log (admin_email + tenant + action + query + وقت) + فهرس p268_access_log.
- frontend: صفحة /saas-admin/data-browser — اختيار المشترك، بحث فوري مجمّع، تبويبات منتجات/مبيعات/عملاء/سجل الوصول، ترقيم صفحات، شريط تحذير «قراءة فقط». دخول «متصفح البيانات» في قائمة السوبر أدمن.

### الاختبارات (على المستأجر الحقيقي NT-0004 — قراءة فقط)
- products: 7,415 منتجاً مع الأسعار ✓ | search «BV»: 10 مبيعات + 3 منتجات ✓
- access-log سجّل القراءتين ببريد المشرف ✓
- bundle main.d61d6335.js؛ العلامات db-* ✓ | لا كتابة إطلاقاً (لا يوجد أي POST/PUT في الوحدة).

## p269 — انتحال الوكلاء + إعادة تعيين كلمات المرور + توسيع خط المراقبة (2026-08-23)

### التغييرات
- backend/routes/saas/account_control_routes.py (جديد):
  - POST /saas/impersonate-agent/{id} — نفس تجربة انتحال المشتركين (token بصيغة agent + impersonated_by، جلسة مُدوَّنة في impersonation_logs مع target_type=agent + IP + UA).
  - POST /saas/tenants/{id}/reset-password — يحدّث saas_tenants.password + مزامنة users.hashed_password في قاعدة المستأجر (نفس البريد).
  - POST /saas/agents/{id}/reset-password.
  - ملاحظة مبدئية: «عرض» كلمة المرور مستحيل تقنياً (bcrypt أحادي الاتجاه) — الواجهة تعرض «تعيين كلمة جديدة» فقط مع توضيح ذلك.
- audit_timeline_routes.py: نوعان جديدان — password_reset (من saas_security_events) وdata_access (من سجل متصفح البيانات p268) → مراقبة موحدة لعمليات المشتركين والوكلاء.
- AgentResponse يعرض agent_code (كان محذوفاً من الاستجابة رغم وجوده في القاعدة).
- الواجهة: زر «دخول كوكيل» + زر «تغيير كلمة المرور» في جدول الوكلاء؛ زر «تغيير كلمة المرور» في جدول المشتركين؛ حوارات بنفس نمط التصميم.

### الاختبارات
- انتحال الوكيل: token + session صادران ✓ (يظهر في الخط الزمني).
- دورة كاملة على المستأجر التجريبي NT-0013: تعيين كلمة مؤقتة → استعادة Demo@2026 → دخول موحد ناجح عبر /auth/unified-login ✓ (تحقق bcrypt مباشرة من القاعدة ✓).
- الخط الزمني: by_type يضم password_reset + impersonation (وكيل) + data_access ✓.
- bundle main.15c39ff9.js؛ العلامات agent-impersonate/agent-reset-dialog/resetpw-btn/tenant-reset-dialog ✓.

## p270 — تدقيق القائمة الجانبية ومزامنة محرر الترتيب (2026-08-23)

### التدقيق
- 156 مساراً في App.js مقابل 123 عنصر قائمة — الفحص أثبت أن كل الفروقات الباقية مقصودة (صفحات عامة/دخول/تحويلات/صفحات داخلية لـ ecom-hub لها تنقلها الخاص).
- **اكتشاف حقيقي**: صفحة /features (إدارة الميزات للمستأجر) مثبتة وغير ظاهرة في أي قائمة → أُضيفت لقسم الإعدادات.
- **انحراف خطير في sidebarMenu.js** (مصدر محرر «ترتيب القائمة»): 19 عنصراً حقيقياً غائباً عن المحرر (الكراء، الإنتاج، التقارير اليومية/التلقائية، العمولات، السوق، الشركاء، المحاسبة، الأقساط، تقرير الانتهاء، نشاط الموظفين، قواعد الهامش، قطع الغيار، الاستيراد الذكي، التاريخ والوقت، قوالب الطباعة، الدعم، WhatsApp، ecom-hub...) + قسمان كاملان مفقودان (الكراء، الإنتاج) + 9 عناصر ميتة لمسارات قديمة تحوّل إلى /ecom-hub (store, loyalty, shipping, api-keys, two-factor, woocommerce, integrations/*).

### التغييرات
- Layout.js: /features في قسم الإعدادات + توحيد عنوان قسم التجارة الإلكترونية (إزالة الإيموجي ليتطابق مع باقي العناوين).
- sidebarMenu.js: +19 عنصراً و+2 قسم (الكراء/الإنتاج) بمزامنة آلية موثقة بوسم p270؛ إزالة 9 عناصر ميتة.

### الاختبارات
- esbuild ✓ | bundle main.bb3e0d93.js منشور | علامات المسارات الجديدة موجودة ✓.

## p271 — AutoHeal: موقع العطل الدقيق في كل تنبيه (2026-08-23)

### المشكلة
تنبيهات AutoHeal كانت تقول «يوجد خطأ في المخزون» دون تحديد أين بالضبط — لا المستأجر، لا المجموعة، لا السجلات المتأثرة.

### التغييرات
- services/autoheal_service.py:
  - _finding() يقبل معاملاً جديداً location (اختياري) ويحفظه في وثيقة التنبيه.
  - كاشف المخزون السالب (negstock): location = {module_ar: «المنتجات / المخزون», collection: products, tenant_id, tenant_name, records:[{id, code, name, value}]}.
  - كاشف قيود اليومية غير المتوازنة: location = {module_ar: «المحاسبة / قيود اليومية», collection: journal_entries, records مع entry_number + «مدين X ≠ دائن Y»}.
  - emit_exception: location = {module_ar: اسم المكوّن, component, endpoint: «METHOD /path», error_id, log_file}.
  - _upsert_finding: عند تكرار توقيع موجود قديم بلا location، يُنسخ location الجديد إليه (backfill للسجلات القديمة).
- AutoHealPage.js: خريطة MODULE_AR + عرض الموقع تحت سطر الوحدة — module_ar • tenant_name، endpoint (font-mono ltr)، collection، السجلات كشارات Badge (data-testid=autoheal-record)، وerror_id.

### الاختبارات
- إنشاء تنبيه تجريبي TEST-P271 عبر محرك AutoHeal نفسه داخل الحاوية → حُفظ location كاملاً ✓.
- GET /api/saas/autoheal/findings يُرجع location بالبنية الكاملة ✓.
- ملاحظة: كاشف negstock لا يمكن اختباره بإدخال كمية سالبة — خدمة النزاهة الخلفية تصححها إلى 0 خلال ثانيتين (سلوك مرغوب).
- تنظيف دقيق: حذف تنبيه TEST-P271، بقايا 0 ✓.
- عطل عابر: docker daemon توقف أثناء الاختبار (Start request repeated too quickly) — استُعيد بـ systemctl reset-failed + start، كل الحاويات عادت تلقائياً، health 200.
- bundle main.3bde6f31.js منشور؛ العلامات autoheal-location/autoheal-record ✓؛ health 200 ✓.

## p272 — تدقيق التشفير: تعميم AES-256-GCM على كل الأسرار المخزنة (2026-08-23)

### التدقيق
جرد كامل لمسارات تخزين الأسرار كشف أن التشفير (p226) كان يغطي bridge_secret وself_bridge_api_key فقط، بينما بقيت مخازن رئيسية بنص صريح:
- ecom_integrations.credentials (مفاتيح الناقلين/القنوات: api_token, access_token, webhook_secret...)
- store_settings: fb_access_token / tiktok_access_token / telegram_bot_token
- whatsapp_settings.access_token (إشعارات الصيانة)
- email_integration_settings.api_key + system_settings (SendGrid/Resend على مستوى المستأجر)
- platform_settings: مفاتيح البريد (resend/sendgrid/brevo) + توكن بوت التنبيهات

### التغييرات (15 ملف backend + 1 frontend)
- crypto_fields.py: SENSITIVE_CRED_KEYS + encrypt_credentials()/decrypt_credentials() (تشفير/فك قواميس الاعتماد، idempotent، النص الصريح يمرّ للتوافق).
- الكتابة: إنشاء/تحديث تكاملات ecom (مع دمج آمن: فك→دمج→إعادة تشفير)، إعدادات SendGrid/Resend للمستأجر، whatsapp_settings (مع حماية من استبدال التوكن بقناع «***»)، store_settings، مفاتيح بريد المنصة، توكن تنبيهات Telegram.
- القراءة: courier_sync, yalidine_service, whatsapp_service, webhooks (HMAC), ad_webhooks (leadgen), sendgrid (_get_sendgrid_config + الإرسال + الإخفاء)، إرسال WhatsApp، get_store_settings (round-trip للواجهة)، test_telegram، telegram_daily، conversions_api (فك مركزي في send_event)، email_service (مفاتيح المنصة)، /internal/alert-config (alert.sh يستلم نصاً مفكوكاً).
- security_routes.py: encryption-status يغطي الآن 10 مخازن (عدّ encrypted/plaintext لكل مخزن)؛ encrypt-secrets-now يرحّلها كلها (idempotent). إصلاح 3 إسقاطات mongo كانت ترجع _id فقط.
- الواجهة: بطاقة «تشفير الأسرار المخزنة» في صفحة إعدادات البريد (عدّادات + زر ترحيل يظهر فقط عند وجود نص صريح).

### الاختبارات
- دورة كاملة على NT-0001: إنشاء تكامل yalidine بتوكن تجريبي → التخزين v1. (مشفر) ✓ والإخفاء يعرض آخر 4 من الأصل ✓ → تحديث جزئي (webhook_secret) نجا التوكن القديم ✓ → حذف، بقايا 0 ✓ (TEST-P272).
- الترحيل الفعلي: 1 تكامل + 2 توكن متجر + 2 مفتاح بريد منصة → الحالة النهائية: encrypted=5, plaintext=0 عبر كل المخازن ✓.
- فك أسرار المستأجر الحقيقي (fb_access_token + yalidine api_token) داخل الحاوية: decrypt_ok=True ✓ (التكاملات الحية لن تتعطل).
- إخفاء مفاتيح المنصة في GET /saas/email-settings يعرض الآخر 4 الحقيقية (فك قبل الإخفاء) ✓.
- bundle main.ac8c4647.js منشور؛ العلامات encryption-status-card/enc-migrate-btn ✓؛ health 200 ✓.

## p273 — الأداء: تخزين مؤقت + فهارس + تقسيم الحزمة (2026-08-23)

### التدقيق
- /stats كان مخزَّناً مسبقاً (Redis, cache_service) — لكن /dashboard/sales-stats (6 تجميعات) و/dashboard/profit-stats (حتى 6000 وثيقة بيع) و/reports/daily-full (قوائم ×5000) تُحسب من الصفر كل طلب.
- لوحة التحكم كانت تحمّل كل المنتجات (7,415 وثيقة عند المستأجر الحقيقي) لعرض 6 منتجات فقط + احتياطي إحصائيات (اتضح أنه كود ميت: {} من catch قيمة truthy).
- فهرس expenses على expense_date بينما الاستعلامات الفعلية تستخدم الحقل date → فحص كامل.
- الواجهة: حزمة واحدة 5.4MB لكل 139 صفحة.

### التغييرات
- stats_routes.py: كاش Redis (60 ثانية) لـ sales-stats وprofit-stats؛ daily-full بكاش 60 ثانية لليوم الحالي و3600 ثانية للأيام الماضية (ثابتة تاريخياً). نقطة جديدة خفيفة GET /stats/stock-summary (عدّادان فقط عبر count_documents).
- sales_service.py: إبطال كاشات لوحة التحكم فور إنشاء بيع (delete بالأنماط، محمي بـ try).
- main.py: فهرس expenses.date.
- DashboardPage.js: /products/paginated?page_size=6 بدل التحميل الكامل؛ إصلاح شرط الاحتياطي الميت + ربطه بـ stock-summary.
- App.js: تحويل 139 استيراد صفحة إلى React.lazy + Suspense (fallback spinner بنمط lucide الموجود) — تقسيم تلقائي لكل مسار.

### القياسات (المستأجر الحقيقي 36,708 مبيعات / 7,415 منتج)
- sales-stats: 78ms → 14ms | profit-stats: 32ms → 9ms | daily-full: 66ms → 10ms.
- الحزمة الرئيسية: 5,485,830 → 452,343 بايت (12× أصغر) + 97 chunk تُحمَّل عند الحاجة.
- إبطال الكاش مثبت E2E على NT-0001: بيع TEST-P273 → مفاتيح stats:* للمستأجر اختفت فوراً → حذف البيع، المخزون عاد 6، بقايا 0 ✓.
- تحقق عرض فعلي (headless): الصفحة الرئيسية + /login + /track كلها render بنجاح مع الحزم المقسّمة ✓؛ health 200 ✓؛ bundle main.820c8ca0.js.

## p274 — معالج ربط القنوات الاجتماعية (WhatsApp/Messenger/Instagram) (2026-08-23)

### التغييرات
- ecom/integrations_routes.py:
  - _ping_meta_channel(): فحص اتصال حقيقي عبر Graph API v21.0 — whatsapp (GET /{phone_number_id} display_phone_number+verified_name)، facebook/messenger (GET /{page_id} name)، instagram (GET /{account_id} username). يفك التشفير تلقائياً (p272) ويعيد ok/error برسالة عربية واضحة.
  - test endpoint يوجّه قنوات Meta الأربع للفحص الحقيقي (كان «وضع المحاكاة» لكل ما عدا shopify/yalidine).
  - GET /ecom/social-setup-info: تعليمات خطوة-بخطوة لكل قناة + رابط الويب هوك للمنصة (/api/integrations/whatsapp/webhook) + الحقول المطلوبة.
- SocialConnectWizard.js (جديد): معالج 3 خطوات (تعليمات ← بيانات ← اختبار حقيقي) بمؤشر خطوات، نسخ رابط الويب هوك، إنشاء التكامل ثم فحصه فوراً وعرض النتيجة (نجاح أخضر / فشل أحمر مع خطأ Meta) وإمكانية الرجوع للتعديل.
- EcomChannelsPage.js: القنوات الأربع تفتح المعالج بدل حوار البيانات الخام (باقي القنوات دون تغيير).

### الاختبارات
- E2E على NT-0001: إنشاء تكامل whatsapp بتوكن وهمي → الفحص الحقيقي وصل Meta فعلاً وأعاد «Invalid OAuth access token» (مسار كامل: تشفير p272 عند التخزين → فك عند الفحص → طلب Graph API) ✓ → حذف، بقايا 0 ✓.
- /ecom/social-setup-info: 4 قنوات، 5 خطوات لواتساب، رابط الويب هوك صحيح ✓.
- bundle main.3c7ddcaf.js؛ المعالج في chunk كسول مستقل (4727.*) ✓؛ health 200 ✓.

### المتبقي (بند المالك)
- مفاتيح تطبيق Meta على مستوى المنصة (App ID/Secret + Embedded Signup + مراجعة التطبيق) لتحويل الربط اليدوي إلى OAuth تلقائي — الواجهة جاهزة وتعمل بالتوكنات اليدوية إلى حينها.

## p275 — وثيقة خطة واجهة الجوال/التابلت (للموافقة قبل التنفيذ) (2026-08-23)

- جرد ميداني: الهيكل العام جاهز للجوال (هامبرغر + درج + ترويسة md:hidden)؛ 120/139 صفحة فيها تجاوب جزئي؛ الجداول تعتمد التمرير الأفقي؛ سجل المبيعات صفر تجاوب؛ الحزمة الابتدائية صارت 452KB بعد p273.
- الناتج: MOBILE_UI_PLAN.md — نقاط كسر معتمدة (جوال <768 / تابلت 768-1024 / سطح مكتب بلا أي تغيير)، 5 مراحل (تنقل سفلي ← جداول→بطاقات ← POS لمسي ← تابلت master-detail ← لمسات)، معايير قبول لكل مرحلة (سطح المكتب مطابق بكسلياً).
- لم يُنفَّذ أي تغيير تصميمي — الوثيقة بانتظار موافقة المالك.

## p276 — خطة الجوال: المرحلتان أ+ب (شريط تنقل سفلي + جداول متجاوبة) (2026-08-23)

### التغييرات
- components/MobileBottomBar.js (جديد): شريط تنقل سفلي للجوال فقط (md:hidden، fixed bottom، safe-area-inset) — 5 عناصر (الرئيسية/الكاشير/المبيعات/المنتجات/المزيد) مع تمييز الصفحة النشطة؛ الكاشير يرى (الكاشير/المنتجات/المزيد) فقط؛ «المزيد» يفتح الدرج الجانبي الموجود.
- components/ResponsiveTable.js (جديد): مكوّن جدول متجاوب — جدول حقيقي على md+ (نفس الأصناف = نفس الشكل بكسلياً) وبطاقات مكدسة على الجوال؛ يدعم render لكل عمود، cardHidden/cardFull، onRowClick، وأصناف table/thead/th/td/row قابلة للتمرير.
- Layout.js: استيراد الشريط السفلي وعرضه قبل Global Search Modal؛ main اكتسب pb-24 md:pb-8 (مسافة للشريط على الجوال، سطح المكتب دون تغيير).
- SalesHistoryPage.js: جدول المبيعات (9 أعمدة: فاتورة/رمز/زبون/إجمالي/مدفوع/متبقٍ/دفع/تاريخ/إجراءات) → ResponsiveTable مع كل الشارات والأزرار (عرض/طباعة/إرجاع) وشارة الحالة.
- ecom/EcomHubPage.js: جدول الطلبات (8 أعمدة) → ResponsiveTable مع شارات القناة/الحالة/القائمة السوداء/مخاطر COD؛ النقر على البطاقة/الصف يفتح تفاصيل الطلب (زر العرض e.stopPropagation).
- إصلاح قديم ظهر أثناء الاختبار: صف أزرار ترويسة ecom-hub (تحديث/تنبيهات/تحليلات/دليل/قنوات/طلب يدوي) كان يسبب تمريراً أفقياً 490px على الجوال → flex-wrap (سطح المكتب يتسع في صف واحد = بلا تغيير بصري).

### الاختبارات (headless حقيقي على nt-commerce.net، مستأجر NT-0001)
- 375px /sales: الشريط السفلي ظاهر، البطاقات ظاهرة (2)، الجدول مخفي، scrollW=375 (صفر تمرير أفقي) ✓.
- 375px /ecom-hub تبويب الطلبات: 3 بطاقات، النقر يفتح حوار التفاصيل، scrollW=375 ✓ (كان 865 قبل إصلاح flex-wrap).
- 1440px /sales: الشريط السفلي مخفي، الجدول الأصلي ظاهر — مطابق بكسلياً لما قبل p276 ✓.
- 768px (تابلت): لا شريط سفلي (md:hidden يخفيه من 768)، الجدول الكامل ظاهر ✓.
- health 200 ✓؛ العلامات mobile-bottom-bar/responsive-cards/bottom-nav-more موجودة في الحزم المنشورة (release 20260823_232129) ✓.

## p277 — خطة الجوال: المرحلة ج (POS لمسي) (2026-08-23)

### التغييرات (كلها max-sm/sm:hidden — سطح المكتب والتابلت مطابقان بكسلياً)
- pos/POSCart.js:
  - بطاقات عناصر السلة على الجوال (sm:hidden): زر الحذف 24→44px، زرا الكمية −/+ 28→44px، حقل الكمية 28→44px بخط 16px (يمنع تكبير iOS التلقائي)، حقل الملاحظة →44px.
  - أزرار نوع الدفع (نقدي/جزئي/بنك/مختلط/آجل/أقساط): max-sm:min-h-[48px].
  - أزرار حفظ/إلغاء/تأكيد: max-sm:min-h-[48px].
  - تذييل الدفع: max-sm:sticky فوق الشريط السفلي (bottom-16) مع ظل — زر التأكيد يبقى مرئياً أثناء التمرير (data-testid=pos-payment-footer).
- POSPage.js: أزرار الإجراءات السريعة على الجوال (منتج/إرجاع/زبون) min-h-[44px].

### الاختبارات (headless على nt-commerce.net، NT-0001)
- 375px /pos: scrollW=375 ✓؛ زرا تأكيد/إلغاء 48px ✓؛ التذييل لاصق ومرئي بعد التمرير للأسفل (top=544<800) ✓؛ لقطتان بصريتان (أعلى/أسفل) ✓.
- 1440px /pos: زر تأكيد 36px كما كان، التذييل static، اللقطة مطابقة لما قبل p277 ✓.
- health 200 ✓؛ release 20260823_233401 ✓.

## p278 — خطة الجوال: المرحلة د (تابلت master-detail) (2026-08-23)

### التغييرات
- hooks/useMediaQuery.js (جديد): خطاف matchMedia مشترك.
- SupportTicketsPage.js: على التابلت+ (≥768px) فتح تذكرة يعرض لوح تفاصيل بجانب القائمة (شبكة عمودين، اللوح sticky) بدل الحوار؛ الجوال (<768) يبقى على الحوار دون تغيير. اللوح فيه الرسائل + الرد + إغلاق التذكرة + زر X لإلغاء الاختيار (testids: ticket-detail-pane/ticket-messages-pane/ticket-reply-*-pane).
- ecom/EcomSocialInboxPage.js: نفس النمط — قائمة المحادثات + لوح المحادثة (رسائل/رد/تحويل لطلب/إغلاق) جنباً إلى جنب على التابلت+ (testids: conversation-pane/conversation-messages-pane/reply-*-pane/conv-convert-btn-pane).
- المبيعات/المنتجات: تقييم مقصود — حوار تفاصيل البيع (max-w-2xl, 534 سطراً مع حوارات متداخلة) مناسب لعرض التابلت كما هو، وصفحة المنتجات شبكة بطاقات أصلاً؛ تحويلهما للوح جانبي كان سيكون جراحة عالية المخاطر بلا فائدة ملموسة — وُثِّق القرار.
- الدرج الجانبي المصغّر (أيقونات فقط) كان أصلاً الافتراضي على md+ مع إمكانية التوسيع — لا تغيير مطلوب (تحقق بصري في اللقطات).

### الاختبارات (headless على nt-commerce.net، NT-0001، بيانات TEST-P278)
- 900px /support: نقرة على التذكرة → اللوح ظهر بجانب القائمة، الحوار لم يظهر ✓؛ 375px: الحوار ظهر واللوح لم يظهر ✓.
- 900px /ecom-hub/channels/social-inbox: اللوح ظهر مع الرسالتين والرد والتحويل ✓.
- scrollW = العرض في كل الحالات (لا تمرير أفقي) ✓؛ health 200 ✓؛ release 20260823_234958 ✓.
- التنظيف: تذكرة TKT00001 + المحادثة + رسالتان حُذفت — بقايا 0 في ntcommerce وقاعدة المستأجر ✓.
