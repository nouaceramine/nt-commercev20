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

## S9 — Motherboard 403 + Theme Migration (2026-02 / iter 3)
- **Bug A:** `/motherboard` returned 403 for super_admin — root cause: `install_motherboard(app, get_tenant_admin)` rejected users without `tenant_id`. Fix in `backend/main.py:867-868` → `install_motherboard(app, get_super_admin)`. All 6 diagnostic endpoints now 200 for super_admin.
- **Bug B:** ~25 pages had hardcoded dark-mode classes (`bg-gray-800`, `text-white`, `text-gray-400`, `border-gray-700`, `border-gray-600`) which produced unreadable text in light theme. Migrated via Python script (`/tmp/fix_theme.py`) to theme-aware tokens (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `border-input`). `text-white` preserved on colored badges/buttons (bg-red-500 / bg-emerald-600 / etc.) by regex-guard.
- **Files touched (frontend):** WalletPage, SmartNotificationsPage, AgentDashboardPage, SystemLogsPage, SmartDashboardPage, RepairTrackingPage, SimManagementPage, SaasAdminPage, SupplierTrackingPage, InternalChatPage, ExpensesPage, SecurityDashboardPage, FeaturesPage, BackupSystemPage, TwoFactorPage, EmailNotificationsPage, settings/EmailTab + WhatsAppTab + PermissionsTab + TemplateEditorPage, PriceHistoryPage, SystemAlertsSection, TaskManagementPage, NotificationsPage, CardsServicePage, DefectiveGoodsPage, admin/components/FinanceReportsSection + AgentsDashboard, tenant/FinanceReportsSection, pos/POSShortcuts, ProductSearchDropdown, BuyFromPlatform.
- **Tests:** `/app/backend/tests/test_motherboard.py` added. Iteration 3 report: backend 100%, frontend 100%.

## S10 — Dashboard: User Wallet + Debts cards (2026-02 / iter 4)
- **Backend:** `/api/wallet` enriched with `subscription_due` (numeric), `subscription_overdue` (bool), `subscription_ends_at` (ISO). Computed by comparing tenant's `subscription_ends_at` with `now()` and reading plan's price by `subscription_type`. Super-admin (no tenant_id) → zeros, no error.
- **Frontend:** Two new tenant-dashboard cards inserted between "رصيد المحفظة" and "إجمالي المنتجات":
  - "رصيد محفظة المستخدم" (User Wallet Balance) — link → `/wallet-management`, subtitle "محفظة المنصة"
  - "ديون محفظة المستخدم" (User Wallet Debts) — link → `/wallet-management`. When overdue → red icon + subtitle "اشتراك متأخر"; otherwise neutral + "لا توجد ديون".
- **Tests:** `backend/tests/test_wallet_enrichment.py` — 9/9 pytest pass. Iteration 4 report: backend 100% — frontend 100%.

## Next Action Items
- P1: Setup Redis caching (currently disabled — minor perf win).
- P2: "Default POS Shortcuts" — super-admin defines default grid pushed to new cashiers.
- P3: Invoice printing for `platform_cards` sold from POS.
- P3: Visual QA tenant-side on /smart-notifications and /ai-agents.
- Cleanup: extract `_plan_price + lookup` helper in wallet_routes.py (currently duplicated with `_charge_subscription`).
