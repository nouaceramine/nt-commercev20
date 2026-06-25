# NT Commerce v16 - PRD

## Original Problem Statement
استنساخ مشروع `nouaceramine/nt-commercev16` وتشغيله، إصلاح الأخطاء، بناء نظام لوغات، إصلاح المصادقة، حماية الكود من التراجع، وبناء نظام السوبر-أدمن كمورد للأكواد.

## Architecture
- **Backend**: FastAPI + MongoDB (motor) + JWT auth + multi-tenant SaaS
- **Frontend**: React 19 + Tailwind + Shadcn UI + RTL Arabic/French
- **Integrations**: Emergent LLM key (gpt-4o-mini)
- **CI**: GitHub Actions (.github/workflows/lint.yml) — ESLint + ruff

## Sessions Summary
- **S1-S5**: استنساخ، تشغيل، تنظيف، نظام لوغات، إصلاح المصادقة، إصلاح صفحات /pos, /smart-dashboard, /tax-reports, /ai-chat, /motherboard
- **S6 CI**: GitHub Action + ESLint flat config + ruff (3 ثغرات Mongo حقيقية اكتُشفت وأُصلحت: `{"$ne":None,"$ne":""}` → `{"$nin":[None,""]}`)
- **S7 Wallet transfers**: تغيير `/wallet/transfers` من super_admin-only → multi-role (tenant يرى تحويلاته فقط)
- **S8 Platform Supplier (الحالي)**:
  - Backend جديد `routes/saas/supplier_routes.py` بـ 15+ endpoint
  - مجموعات MongoDB جديدة: `platform_card_catalog`, `platform_idoom_catalog`, `platform_card_stock`, `platform_idoom_stock`, `supplier_orders`
  - معالجة طلب ذرية (atomic) مع rollback: حجز ⇒ خصم محفظة ⇒ نقل الأكواد ⇒ إشعار
  - أسعار مخصصة لكل مستأجر (override per tenant_id)
  - رفض الطلب بالكامل عند نقص المخزون (422 + تفاصيل الكمية المتاحة)
  - واجهة سوبر-أدمن `/saas-admin/supplier` بـ3 تبويبات (بطاقات/Idoom/طلبات) + رفع أكواد Excel + تعديل أسعار مخصصة
  - مكوّن مشترك `BuyFromPlatform.js` يُستخدم في صفحتي المستأجر
  - `CardsServicePage` أُعيد بناؤها (كانت Mock بالكامل) باستخدام `/supplier/order` + `/platform-cards`
  - `IdoomServicePage` أُضيف تبويب جديد "شراء من المنصة" (الرفع الذاتي يبقى موجوداً — مورد اختياري)
  - **مخزون أولي مزروع**: 21 فئة بطاقات (Mobilis/Djezzy/Ooredoo × 100/200/500/1000/2000/3000/6500) + 5 فئات Idoom
  - تم اختبار End-to-End بنجاح: رفع 5 أكواد → شحن محفظة 10,000 → طلب 3 → استلام تلقائي + خصم 291 + إشعار

## Personas
- Super Admin: + إدارة المورد المركزي
- Agent
- Tenant Admin: + شراء من المنصة + رفع أكواد ذاتية
- Cashier

## Test Credentials
See `/app/memory/test_credentials.md`

## Known Limitations / Backlog
- P2: Stripe / SendGrid / Resend require user keys
- P2: Redis caching disabled
- P3: لا يوجد POS مدمج بعد لبيع بطاقات `tenant_db.platform_cards` (المستأجر يراها لكن البيع للزبون يحتاج تكامل إضافي)
- P3: ~200 react-hooks/exhaustive-deps warnings

## Next Action Items
- اختبار من واجهة المتصفح (الـ SaaS Admin يرفع كود ثم المستأجر يشتري)
- (لاحقاً) دمج "بيع كود من tenant_db.platform_cards" في POSPage مع طباعة فاتورة
