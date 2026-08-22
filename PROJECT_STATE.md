# PROJECT_STATE.md — حالة مشروع NT Commerce ونقطة الاستئناف

> **للمحادثة الجديدة: اقرأ هذا الملف كاملاً أولاً، ثم آخر 5 إدخالات في DEPLOYMENT_LOG.md.**
> آخر تحديث: 2026-08-21 بعد p223–p228 (التقرير الاستشاري: قواعد الهامش، فوترة AI، تصنيف أخطاء AutoHeal، تشفير الأسرار AES-256-GCM، السوق الموحد — النشر، إصلاح expense_number) وp232 (فجوة تراجع البيع الآجل) وp233 (قياس صور AI) وp234 (تحقق DLQ/أرشفة + أول replay ناجح) وp235 (كشف الحالات الشاذة — المستوى 2) وp236 (إنذارات تنبؤية — المستوى 3) وp237–p238 (السوق الموحد: الطلبات العابرة + التسويات) وp239 (قيد تحصيل ecom أصبح مسجلاً دفترياً). **المسار 1 أُغلق تحققياً في p232؛ المتبقي: مسار 2 (المالك)، DLQ/أرشفة outbox من مسار 3، self-healing مستوى 2/3، مسار 4 (✅ مكتمل p227/p237/p238). **كل المهام البرمجية المخططة مكتملة؛ المتبقي بنود المالك فقط.** → p240 ✅ كشف المكررات (duplicate detection) + إصلاح فهرس ecom_leads → p241 ✅ SMS حالات التوصيل + رصيد SMS → p242 ✅ إسناد مركز الاتصال → p243 ✅ رفع طلبات Excel/CSV بالجملة → p244 ✅ صفحة التتبع العامة /track → p245 ✅ برنامج الإحالات → p246 ✅ تذاكر الدعم → p247 ✅ واجهة السائق /driver/:token → p251 ✅ ويب هوك الاستقبال (YouCan/LightFunnels/Sheets/مخصص) → p248 ✅ إطار مزامنة الناقلين العام (6 ناقلين، mock+generic_http) → p249 ✅ صندوق الوارد الاجتماعي + التحويل لطلب → p250 ✅ تعدد المتاجر. → p252 ✅ شاشتا السائقين والإحالات في لوحة التحكم → p253 ✅ شاشة الوارد الاجتماعي → p254 ✅ شاشتا تذاكر الدعم (مستأجر + منصة) → p255 ✅ شاشتا مصادر الاستقبال والمتاجر الفرعية + بطاقة مزامنة الناقلين **برنامج فجوات المنافسين مكتمل 12/12** (المتبقي: مفاتيح SMS/Meta/الناقلين — بنود المالك)

---

## 1) القواعد غير القابلة للكسر ( verbatim )

1. لا تغيّر التصميم/الألوان/الخطوط/التخطيط — نفس الشكل، وظائف جديدة فقط
2. لا تحذف أو تعدّل شيئاً قبل إنشاء backup في /opt/ntcommerce/backups/
3. اختبر كل API بـ curl قبل الانتقال للتالي
4. سجّل كل تغيير في DEPLOYMENT_LOG.md (قبل/بعد) والتزم في git بعد كل مرحلة
5. openapi.json + curl هما مصدر الحقيقة للمسارات الحية
6. **ممنوع قطعياً تثبيت حزمة PyPI "emergentintegrations" — برمجية خبيثة مؤكدة (MAL-2026-2702). استدعاءات LLM تمر عبر services/ai/openai_llm.py**
7. الواجهة: البناء >120 ثانية → `nohup npm run build > /tmp/buildXXX.log 2>&1 &` ثم استطلاع؛ **عدم حذف الحزم المجزّأة القديمة أثناء النشر إطلاقاً — cp -r فقط وindex.html يشير للهاش الجديد**
8. Terser يشفّر العربية في الحزم — تحقق من الميزات عبر سلاسل لاتينية أو data-testid أو سلاسل تقنية لا عبر grep عربي
9. قاعدة المستأجرين: `_TenantDBProxy` عبر ContextVar — لا تلتقط collections وقت الإنشاء؛ حُلّ `db.collection` داخل كل handler (انتُهكت مرة في p186 وأُصلحت)

## 2) الوصول والنشر

- **الخادم**: `ssh -i /mnt/agents/.ssh/id_ed25519 -o StrictHostKeyChecking=accept-new root@168.231.81.154`
  (إعادة تعيين sandbox تمسح known_hosts و/tmp المحلي — أعد القبول كل دور؛ ملفات /tmp المحلية تحتاج `chmod 666` أحياناً)
- **النطاق**: nt-commerce.net (Cloudflare → nginx → backend :8001)
- **إعادة تشغيل الخلفية**: `docker restart ntcommerce-backend-1` → انتظر 28ث → `curl localhost:8001/api/health` يجب 200
- **نشر الواجهة**: `cd /opt/ntcommerce/frontend && nohup npm run build > /tmp/buildXXX.log 2>&1 &` → استطلاع ~115ث → `bash /opt/ntcommerce/scripts/deploy.sh` → تحقق: `curl -s https://nt-commerce.net/ | grep -o 'main\.[a-z0-9]*\.js'` ثم grep لسلاسل لاتينية في الحزمة (القاعدة 8)
- **git**: المستودع github.com/nouaceramine/nt-commercev20.git — الالتزام والرفع من الخادم: `cd /opt/ntcommerce && git add -A && git commit -q -m '...' && git push -q origin HEAD`
- **openapi**: `http://localhost:8001/openapi.json` (وليس /api/openapi.json)
- **تنبيه**: قد تعمل جلسة محادثة موازية على المشروع — قبل أي تعديل افحص `git status` وطوابع الملفات الزمنية؛ إن وُجد عمل غير ملتزم به، راجعه واختبره وثبّته بدل إعادة تنفيذه (حدث في p196)

## 3) المستأجر والمصادقة

- المستأجر: id `a24f0b7e-88ea-43c0-9f27-b5d459fe28d6`، قاعدة `tenant_a24f0b7e_88ea_43c0_9f27_b5d459fe28d6`، المالك "Nouacer Telecom"
- settings: business_type='retailer' و features_override={'has_woocommerce': true} — **يجب أن تبقى**
- رمز المستأجر admin: على الخادم `/tmp/p162_tok.txt`
- رمز super admin: عبر سكربت PyJWT داخل الحاوية مع `JWT_SECRET_KEY` (utils/auth.py: SECRET_KEY من env، HS256)
- **المستأجر في استخدام حقيقي**: قيد بيع حقيقي JE000001 (فاتورة INV-20260820-0005 آجلة 140,580 دج). الصندوق 'cash' القيمة المرجعية الحالية **11300.88**. أي اختبار يجب أن يكون موسوماً ويُنظَّف بدقة دون المساس بالبيانات الحقيقية، وتُستعاد الصناديق لقيم اللقطة لا لقيم ثابتة

## 4) البنية الحرجة

- **تعدد المستأجرين**: `config/database.py` — `_TenantDBProxy` يحل عبر `_tenant_db_ctx` ContextVar مع سقوط إلى main_db؛ `client` و`main_db` و`get_tenant_db` مصدّرة من هناك؛ `get_current_user` في main.py يضبط سياق القاعدة
- **التسجيل التلقائي**: main.py `_AUTO_REG_MODULES` مع مطابقة أسماء معاملات المصانع (db, get_current_user, get_tenant_admin, require_tenant...)
- **الفعّاليات الاختيارية**: OPT_IN_FEATURES في main.py + AuthContext.js: ("ecommerce_hub","rental","restaurant","production") — المفتاح الغائب = مفعّل افتراضياً عدا هذه
- **ناقل الأحداث**: `services/event_bus.py` Redis Streams (nt:events، مجموعة مستهلكين، idempotency عبر processed_events، MAX_RETRIES=3، DLQ)؛ **4 عمال uvicorn — السباقات حقيقية**
- **Outbox (p189)**: `services/outbox.py` — `outbox_write(main_db, type, payload, tenant_id, source, session=None)`؛ مرحّل كل 2ث مع ادعاء ذرّي (in_progress + استرداد 60ث)؛ النشر يرافقه fan-out لقناة pub/sub `nt:events_feed`
- **المحاسبة الآلية (p190/p193/p195/p196/p199)**: `services/accounting_auto.py` — مخطط 13 حساباً (101 رأس مال، 530 نقدية، 514 بنك، 531 محفظة، 532 خزنة، 533 خاص، 534 متجر، 401 موردون، 411 زبائن، 380 مخزون، 700 إيرادات، 600 تكلفة، 610 مصاريف)؛ BOX_ACCOUNT؛ قيود approved/auto؛ فهرس فريد sparse `auto_entry_unique` على (reference_id, source_tag)؛ `already_posted` لمنع التكرار؛ `ensure_accounts` آمن ضد السباق
- **المستهلكون**: `services/event_consumers.py` — **15 معالجاً**: sale.completed/refunded/deleted، purchase.created/codes_uploaded/recorded، expense.created/deleted، customer.payment_received، supplier.payment_made، ecom_order.confirmed/cancelled (saga)، tenant.subscription.*، test.ping
- **Sagas (p192)**: `services/saga.py` — SagaStep(name, action, compensate)، حالة لكل خطوة في مجموعة sagas؛ **الخطوة الفاشلة تُعوَّض أيضاً**؛ الاسترجاع يتفرع على `"_deducted" in ctx`
- **ACID**: create/delete/return sale + مسارا تسوية الديون في customer_debts_routes + مسارا debts_routes كلها مغلّفة بمعاملات Mongo (عبر القواعد مسموح — replica set) مع outbox داخل المعاملة
- **SSE (p191)**: GET /api/events/stream?token= — nginx block خاص قبل /api/ (proxy_buffering off)؛ الواجهة `lib/realtime.js` (startRealtime/onEvent/stopRealtime)
- **صفحات تتحدث لحظياً**: POS (p191)، المنتجات + لوحة التحكم (p194)، المحاسبة (p196-p198)

## 5) ما أُنجز (التفاصيل في DEPLOYMENT_LOG.md)

- p182-p188: شركاء/أرباح، 23 ملف نشاط تجاري، variants، تأجير، مطعم، IMEI/serials، إنتاج BOM
- p189-p192: ACID + outbox، محاسبة آلية، SSE، sagas
- p193: قيود مشتريات/مصاريف + إصلاحات سباق العمال الأربعة
- p194: اشتراكات SSE للمنتجات/اللوحة
- p195: تسوية ديون ذرّية + قيدا 411/401
- p196: ميزان مراجعة من سطور اليومية + وحدة الديون ذرّية + صفحة /accounting (عُثر عليها منفّذة غير موثقة — رُوجعت واختُبرت وثُبّتت)
- p197: قائمة دخل من سطور اليومية + بطاقة عرض
- p198: ميزانية عمومية من سطور اليومية + مزامنة مرايا accounts.balance مع اليومية
- p199: قيود الأرصدة الافتتاحية — preview/apply بعلامة opening + حساب 101 + فئة 1xx في الميزانية + بطاقة في /accounting؛ JE000002 مرحّل فعلياً
- p200: دفتر أستاذ عام من سطور اليومية — GET /accounting/ledger/{code} برصيد افتتاحي/جارٍ/ختامي + صفوف ميزان قابلة للضغط وبطاقة تفصيل في /accounting
- p201: تعديل المصروف مغطّى محاسبياً — expense.updated + post_expense_adjustment (عكس+جديد بقيد واحد) + PUT المصروف ذرّي
- p202: دفعات عقود التأجير مغطاة — حساب 701 + post_rental_payment_entry + مسار الدفع ذرّي (17 معالجاً)
- p203: الدفعات المسبقة للموردين — خصم صندوق حقيقي (كان مفقوداً) + حساب 402 + post_supplier_advance_entry + مسار ذرّي (18 معالجاً)
- p204: دفع الأقساط مغطّى — post_installment_payment_entry (الصندوق/411) + مسار ذرّي (19 معالجاً)؛ settle-credit وpayments/records = منصوية لا مستأجرة (حُسمت)
- p205: محرك عمولات المنصة (platform_commissions + هوك الشحن + ملخص المالك) — جلسة موازية ef11a5c
- p206: دورة التأجير كاملة — حساب 203 + قيود الإيداع/الاسترجاع/المصادرة/الإقفال + إنشاء/إغلاق ذرّيان + إصلاح سباق entry_number + فئة 2xx في الميزانية (23 معالجاً)
- p207: tax-summary من سطور اليومية — نافذة YYYY/YYYY-MM + تفصيل حسابات + نفس مفاتيح الاستجابة
- p208: واجهة القيد اليدوي في /accounting — حوار بسطور ديناميكية وتحقق توازن حي + زر اعتماد للمعلّقة (الخلفية لم تُمس: الإنشاء يحدّث المرايا والتقارير تتجاهل الحالة)
- p209: قفل السنة المالية — GET/POST /fiscal-close + preview + قيد إقفال إلى 101 (مؤرخ YYYY-12-31) + منع إنشاء/اعتماد داخل سنة مقفلة + بطاقة واجهة
- p210: تنبيه DLQ — platform_alerts عند الإسقاط + alerts/ack endpoints + بطاقة في لوحة event-bus + replay يحلّ التنبيه تلقائياً
- p211: أرشفة outbox — المنشور >30ي ينتقل إلى outbox_archive بحلقة ساعوية آمنة متعددة العمال
- p212: توحيد التقارير — profit-loss/balance-sheet/cash-flow من سطور اليومية (نفس مفاتيح الاستجابة) + SmartReporterAgent موسوم LEGACY
- p213: إصلاح /auto-reports — كانت بلا Layout (القائمة تختفي) وبلا i18n (عربية دائماً) — الآن مغلّفة وثنائية اللغة
- p214: زر رجوع في Layout (سطح مكتب + جوال، يتبع RTL)
- p215: سلة POS النشطة تُحفظ في localStorage لكل مستخدم وتُستعاد عند العودة
- p216: سداد الدين يلحق بالحصة المفتوحة + اختيار الصندوق الحقيقي + إغلاق الحصة يحسب تحصيلات/مدفوعات الديون النقدية
- p217: العلامة التجارية للمنتجات — brand_id + مرآة brand_name، CRUD /product-brands مع تزامن إعادة التسمية، قائمة ماركة + إضافة سريعة في صفحتي إضافة/تعديل المنتج
- p218: سجل نشاط لكل كيان — /activity/customer|product|supplier/{id} مع فلترة فترة، مكوّن EntityActivityTimeline موحّد مدمج في نظرة الزبون 360 وصفحة المنتج وصفحة الموردين
- p227: محرك عمولة تلقائي — قواعد لكل مستأجر على sale.completed، سجل + تقرير + دفع من الصندوق، قيود 658/421، إلغاء عند الإرجاع، صفحة /commissions
- p219: دخول سريع برمز PIN — /auth/pin/users|login|set|admin-set مع قفل محاولات (Mongo)، منتقٍ ببطاقات الموظفين في صفحة الدخول، إدارة PIN من صفحة المستخدمين

## 6) الخطوة التالية — المسار 3: تحصينات تقنية (بالترتيب)

1. ~~مراقبة/تنبيه DLQ~~ — **تم في p210**
2. ~~أرشفة دورية للـ outbox المنشور~~ — **تم في p211**
3. ~~توحيد تقارير SmartReporterAgent~~ — **تم في p212 — المسار 3 مكتمل بالكامل**

## 6-ب) ما اكتمل في p205 (مرجع سريع — محرك عمولة المنصة)

نموذج المالك التجاري: وساطة خدمات (شحن جوال/IPTV/AI) — يبيع للمشتركين بالجملة ويأخذ عمولة من كل بيعة. `services/commission_engine.py`: سجل platform_commissions في main_db (فهرس فريد على reference) — الهامش = (platform_commission% − commission%) × المبلغ؛ الإعداد لكل مشغّل عبر PUT /saas/recharge-config/{op}؛ العكس التلقائي عند فشل الشحن؛ الملخص/السجل: GET /saas/platform-commissions/summary|history (super admin). التوسعة التالية: ربط IPTV والـ AI بنفس المحرك.

## 6-أ) ما اكتمل في p199 (مرجع سريع)

قيد افتتاحي واحد لكل مستأجر عبر `GET/POST /api/accounting/opening-balance/*`؛ كل سطر = الواقع الفعلي − صافي اليومية الحالي (لا عدّ مزدوج لقيود p190+)؛ رأس المال 101 يوازن القيد نفسه فقط (وليس صافي 101 التراكمي)؛ force=true ← قيد تسوية بالفرق تحت مرجع OPENING-n جديد؛ الصناديق السالبة (533 = −30,600) تُرحَّل بسطور دائنة كما هي بلا تجميل.

## 7) خريطة العمل المتبقي الكاملة (بعد p199 — بالترتيب)

### المسار 1: إكمال الدورة المحاسبية — **مُغلق تحققياً (p232، 2026-08-21)**
- تعديل المصروف PUT: مغطى منذ p201 (معالج expense.updated — عكس + إعادة ترحيل idempotent).
- دفعات التأجير / الدفعات المسبقة للموردين: مفحوصة في جرد p228 (مقيّدة عبر الأحداث).
- سداد ائتمان المحفظة settle-credit: مقيّد في wallet_transactions برمز PF (جانب المنصة).
- سجلات الدفع اليدوية /payments/records: سجلات إيراد المنصة في payment_transactions — ليست قيود مستأجر.
- فجوة تراجع البيع الآجل في saga الشحن: **أُصلحت في p232** (علم sale_credit_inserted + عكس مجاميع الجلسة اليومية للمسارين).

### المسار 2: أعمال تحتاج المالك (لا تُخمَّن — تُسأل)
- رمز بوت Telegram (BotFather) | نسخ احتياطي خارجي rclone (يحتاج حساب تخزين سحابي — **أولوية أمان قصوى**: النسخ كلها على الخادم نفسه) | رمز Cloudflare API (أتمتة النطاقات الفرعية) | مفتاح Brevo جديد (الحالي ميت — البريد معطّل)

### المسار 3: تحصينات تقنية
- ~~مراقبة/تنبيه DLQ~~ (p210 — تحقق p234: أول replay ناجح) | ~~أرشفة دورية للـ outbox~~ (p211 — حلقة الأرشفة تعمل، عتبة 30 يوماً) | ~~توحيد تقارير SmartReporterAgent~~ (p212) — **المسار 3 مكتمل بالكامل**

### المسار 4: السوق الموحّد — **مكتمل بالمراحل الثلاث** (p227 النشر/الكتالوج ← p237 الطلبات COD العابرة ← p238 التسويات: عمولة 5% افتراضية قابلة للضبط عبر platform_config.marketplace_fee_pct، تُرحَّل لدين المستأجر عند التسليم وتُسدَّد عبر settle-credit)

### أسلوب العمل
مرحلة واحدة كاملة في كل مرة (backup → تعديل → curl → نشر → توثيق → التزام) ثم تقرير عربي موجز؛ كل «اكمل» = المرحلة التالية بالترتيب. **عند ثقل المحادثة: حدّث هذا الملف، افتح محادثة جديدة، والصق برومبت الاستئناف — التدوير هو وسيلة السرعة الدائمة.**

## 8) تحذيرات تقنية متكررة

- هروب `$` في docker exec المضمّن ينكسر — استخدم ملفات سكربت عبر `docker cp` (`$set` فشل سطراً مرتين)
- MONGO_URL متاح داخل الحاوية (وليس localhost:27017)
- ecom_orders لها فهرس فريد على order_code (الإدخالات التجريبية تحتاجه)
- سكربتات التعديل: `assert s.count(old) == 1` قبل الاستبدال؛ تحقق `ast.parse` للبايثون و`npx -y esbuild FILE --loader:.js=jsx --outfile=/dev/null` للجافاسكربت
- النسخ الاحتياطية: /opt/ntcommerce/backups/p182..p207
