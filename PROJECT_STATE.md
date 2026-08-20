# PROJECT_STATE.md — حالة مشروع NT Commerce ونقطة الاستئناف

> **للمحادثة الجديدة: اقرأ هذا الملف كاملاً أولاً، ثم آخر 5 إدخالات في DEPLOYMENT_LOG.md، ثم قل «اكمل» لمواصلة p199.**
> آخر تحديث: 2026-08-20 بعد إتمام p198 (الالتزام `8acdd0c`).

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
- **المحاسبة الآلية (p190/p193/p195/p196)**: `services/accounting_auto.py` — مخطط 12 حساباً (530 نقدية، 514 بنك، 531 محفظة، 532 خزنة، 533 خاص، 534 متجر، 401 موردون، 411 زبائن، 380 مخزون، 700 إيرادات، 600 تكلفة، 610 مصاريف)؛ BOX_ACCOUNT؛ قيود approved/auto؛ فهرس فريد sparse `auto_entry_unique` على (reference_id, source_tag)؛ `already_posted` لمنع التكرار؛ `ensure_accounts` آمن ضد السباق
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

## 6) الخطوة التالية — p199: قيود الأرصدة الافتتاحية

**الدافع**: الميزانية العمومية تظهر مخزوناً محاسبياً سالباً (−142,000) لأن مخزون المستأجر وأرصدة صناديقه وذممه أُدخلت قبل p190 بلا قيود افتتاحية.

**الخطة**:
1. `GET /api/accounting/opening-balance/preview` — يحسب: قيمة المخزون الفعلي (Σ quantity × purchase_price)، أرصدة الصناديق الفعلية، ذمم العملاء القائمة (Σ remaining على المبيعات)، ذمم الموردين (Σ remaining على المشتريات)، ورأس المال = الفرق الموازِن
2. `POST /api/accounting/opening-balance/apply` — قيد افتتاح واحد approved/auto بعلامة source_tag="opening" (مرجع ثابت "OPENING-1" → already_posted يمنع التكرار): مدين 380/5xx/411 بالقيم الفعلية، دائن 401 + حساب رأس مال جديد (مثلاً 101 «رأس المال» — إضافته لـ DEFAULT_ACCOUNTS مع ensure_accounts)
3. حماية: رفض إن وُجد قيد opening سابق (إلا بـ force=true يولّد قيد تسوية بالفرق)
4. بطاقة في AccountingPage تعرض المعاينة وزر التطبيق (نفس مكوّنات التصميم القائمة)
5. اختبار curl: معاينة → تطبيق → ميزانية متوازنة ومخزون موجب → تطبيق ثانٍ مرفوض → توثيق والتزام

## 7) ترشيحات لاحقة

- سوق موحّد (خطة مؤجلة من 3 مراحل)
- عناصر بيد المالك: رمز بوت Telegram، نسخ احتياطي خارجي rclone، رمز Cloudflare API، مفتاح Brevo ميت
- تقارير ضريبية محسّنة من اليومية

## 8) تحذيرات تقنية متكررة

- هروب `$` في docker exec المضمّن ينكسر — استخدم ملفات سكربت عبر `docker cp` (`$set` فشل سطراً مرتين)
- MONGO_URL متاح داخل الحاوية (وليس localhost:27017)
- ecom_orders لها فهرس فريد على order_code (الإدخالات التجريبية تحتاجه)
- سكربتات التعديل: `assert s.count(old) == 1` قبل الاستبدال؛ تحقق `ast.parse` للبايثون و`npx -y esbuild FILE --loader:.js=jsx --outfile=/dev/null` للجافاسكربت
- النسخ الاحتياطية: /opt/ntcommerce/backups/p182..p198
