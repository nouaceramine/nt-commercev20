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

## S11 — Customer Wallet Cards + Impersonation Fix (2026-02 / iter 5)
- **Dashboard:** Two NEW cards added at TOP of `/` stats grid:
  - `رصيد محفظة الزبون` (Customer Wallet Balance) → link `/customers` — sums positive `customers.balance`.
  - `ديون محفظة الزبون` (Customer Wallet Debts) → link `/customer-debts` — sums `sales.debt_amount > 0`.
- **Backend `/api/stats`** enriched with `customer_balance_total`, `customer_balance_count`, `customer_debt_total`, `customers_with_debt`.
- **Backend `/api/wallet`** enriched with `platform_purchase_debt`, `platform_purchase_count`, `total_platform_debt` (graceful 0 when no unpaid supplier_orders).
- **Motherboard fix (impersonation):** `AuthContext` adds `isImpersonating` + `isEffectiveSuperAdmin` + `stopImpersonation()`. `apiClient` interceptor routes `/diagnostics`, `/platform/features`, `/saas/`, `/robots`, `/cache` calls via preserved `super_admin_token` while impersonating. Super-admin items now appear in sidebar and pages render normally during impersonation.
- **Impersonation banner** added to `Layout.js` with "العودة لحساب السوبر-أدمن" button restoring original super-admin session.
- **Tests:** `backend/tests/test_iter5_dashboard_cards.py` — 9/9 pass. Iteration 5 report: backend 100% — frontend 100%.

## Next Action Items
- P1: Setup Redis caching.
- P2: "Default POS Shortcuts" — super-admin defines default grid.
- P3: Invoice printing for `platform_cards` sold from POS.
- Minor: Investigate React duplicate-key console warning on dashboard navigation (non-blocking).
- Cleanup: extract `_plan_price + lookup` helper in `wallet_routes.py`.

## S12 — Motherboard Sidebar Visibility Fix (2026-02 / iter 6)
- **Root cause:** Layout.js `tenantNavSections.settings.items` had `/motherboard` inside the unguarded `isAdmin ? [...]` block — every tenant admin saw it; clicking redirected to / via `superAdminOnly` ProtectedRoute.
- **Fix:** Moved `/motherboard` into a separate `isEffectiveSuperAdmin ? [{...minRole:'super_admin'}] : []` block. Defence-in-depth: both outer gate AND filterNavSections minRole guard.
- **Hardening:**
  - `isImpersonating` now requires BOTH `localStorage.is_impersonating==='1'` AND `super_admin_token`.
  - `AuthContext` useEffect auto-cleans stale `super_admin_token`/`super_admin_user` on mount when `is_impersonating` flag is missing.
  - `logout()` broadened to clear all impersonation keys.
- **Tests:** Iteration 6 frontend testing 100% — all 6 scenarios pass (pure tenant absent, active impersonation present-once, stale cleanup, stop-impersonation, logout cleanup, dashboard regression).

## Next Action Items
- **P1:** تفعيل Redis للـ caching.
- **P2:** "اختصارات POS افتراضية" للسوبر-أدمن.
- **P3:** طباعة فواتير `platform_cards` المباعة من POS.
- **Minor:** تحذير React duplicate-key (`/wallet-management`, `/customers`) — dedup sidebar items by path in Layout.js.
- **Cleanup:** استخراج `_plan_price` helper في `wallet_routes.py`.
- **Enhancement (queued):** `/customer-debts` quick PDF/Excel export + bulk SMS/WhatsApp reminder for indebted customers.

## S13 — Impersonation Audit Log + Cleanups (2026-02 / iter 7-8)
- **NEW FEATURE — Impersonation Audit Log:**
  - Backend: `main_db.impersonation_logs` collection. POST `/api/saas/impersonate/{tenant_id}` records {id, admin_id+email+name, tenant_id+name+email, ip, user_agent, started_at, status='active'} and returns `impersonation_session_id` in the response.
  - Backend: POST `/api/saas/impersonate/{session_id}/stop` (super-admin only, idempotent) closes the entry with stopped_at + duration_seconds.
  - Backend: GET `/api/saas/impersonation-logs?limit&tenant_id&admin_id` returns `{total_active, items[]}` sorted by started_at DESC.
  - Frontend: New tab `سجل الانتحال` in `/saas-admin` showing full audit table (super-admin, tenant, IP, started, ended, duration, status). Active session badge in tab header.
  - Frontend: `stopImpersonation()` in `AuthContext` now calls the stop endpoint BEFORE clearing localStorage so the close logs successfully via super_admin_token.
- **CLEANUP — `_lookup_plan_and_price` helper** extracted in `wallet_routes.py`; both `_charge_subscription` and `/api/wallet` GET now use it.
- **MINOR — React duplicate-key warning ELIMINATED:**
  - `Layout.js` sidebar items deduped by path; composite key `${section.id}-${item.path}`.
  - `DashboardPage.js` line 176: Link key changed from `stat.link` to `stat-${index}-${stat.link}` (4 cards shared 2 links: /customers & /wallet-management).
- **Tests:** Iter 7 backend 100% (30/30), Iter 8 frontend 100% (0 warnings across 5-hop navigation).

## Next Action Items (in priority order)
- **P1:** تفعيل Redis للـ caching.
- **P2:** "اختصارات POS افتراضية" للسوبر-أدمن.
- **P3:** طباعة فواتير `platform_cards` المباعة من POS.
- **Enhancement queued:** صفحة `/customer-debts` — تصدير PDF/Excel سريع + تذكير SMS/WhatsApp جماعي.
- **Polish:** Investigate 2 console 404s on tenant routes (unknown asset; non-blocking).

## S14 — P2 Default POS Shortcuts (2026-02 / iter 9)
- **Backend:**
  - `main_db.platform_default_pos_shortcuts` collection (single doc id='default').
  - GET/PUT `/api/saas/default-pos-shortcuts` (super-admin only).
  - GET `/api/pos/shortcuts` now returns `{shortcuts, source: 'user'|'default'|'empty'}` — falls back to platform defaults when no per-user document exists.
- **Frontend:** New tab in `/saas-admin` → "اختصارات POS الافتراضية" with slot-based editor (label + color picker + per-slot remove + Add slot + Save). Auto-pads to 8 slots on client; backend persists only non-empty entries.
- **Tests:** `backend/tests/test_default_pos_shortcuts.py` — 8/8 ✅ • iter 9 backend 100% • frontend 100% • 0 React warnings • 0 console 404s.
- **Polish (verified):** Iter 7's "2 console 404" observation could NOT be reproduced — likely transient asset noise; iter 9 reported 0.

## Next Action Items
- **P1:** تفعيل Redis للـ caching.
- **P3:** طباعة فواتير `platform_cards` المباعة من POS.
- **Enhancement queued:** `/customer-debts` — تصدير PDF/Excel + تذكير SMS/WhatsApp جماعي.
- **Enhancement queued:** تنبيه فوري WhatsApp/Email للمستأجر عند بدء جلسة انتحال (GDPR-grade).
- **Cleanup:** `backend/tests/test_wallet_chain.py` migrate hardcoded `localhost:8000` to `REACT_APP_BACKEND_URL`/`BASE_URL` env var.

## S15 — 6 Super-Admin Bug Fixes + Wallet Credit Top-up (2026-02 / iter 10)
- **Bug #1 — System logs:** auto-cleaned (was capturing only #2/#3 errors).
- **Bug #2 — `/saas/monitoring`:** rewritten to return `{summary, alerts[], tenants[]}` with per-tenant `tenant_name, total_revenue, users_count, last_activity`. Frontend MonitoringSection now uses null-safe destructuring. Cards render: 8 المشتركين / 8 نشط / 1 المنتجات / 3 العملاء / 3 المبيعات / 2,010 الإيراد.
- **Bug #3 — AI Assistant 403:** switched auth dep from `require_tenant` to `get_current_user`; context-data lookups wrapped in try/except so super_admin (no tenant_db) doesn't 500. Chat history save wrapped too.
- **Bug #4 — Plan features incomplete:** `FeatureFlagsPage.js` `FEATURE_CATEGORIES` extended with 8 new categories: recharge (Flexy), cards, internet (Idoom), iptv, ai_assistant, backup, wallet, security — each with subFeatures.
- **Bug #5 — Import/Export redirect:** added `/data-import-export`, `/system-logs`, `/settings`, `/feature-flags` to `superAdminAllowedPaths` in App.js.
- **Bug #6 — Wallet top-up Cash/Credit (NEW FEATURE):**
  - Backend `/wallet/add-funds` now accepts `payment_method='cash'|'credit'`. Credit also `$inc credit_debt` on tenant wallet.
  - Backend `/wallet/settle-credit` new endpoint: super-admin records tenant's repayment, decrements credit_debt.
  - Frontend dialog redesigned with 2-button method selector + amber warning when credit chosen.
- **Polish:** wallet-charge open button got data-testid; global header search now skipped silently for super_admin (was producing 403 console noise).
- **Tests:** `backend/tests/test_iter10_bugs.py` — 7/7 ✅ • iter 10: backend 100% • frontend 100%.

## Next Action Items
- **P1:** تفعيل Redis للـ caching (مؤجَّل بطلب المستخدم).
- **P3:** طباعة فواتير `platform_cards` المباعة من POS.
- **Enhancement queued:** `/customer-debts` — تصدير PDF/Excel + تذكير SMS/WhatsApp جماعي.
- **Enhancement queued:** تنبيه فوري Email للمستأجر عند بدء جلسة انتحال (GDPR).
- **Tech debt:** N+1 query in `/saas/monitoring` (per-tenant sales.aggregate × N) — fold into one aggregation when tenant count > 50.
- **Cleanup:** `backend/tests/test_wallet_chain.py` — migrate from `localhost:8000` to env-var URL.

## S16 — Tenant Debts Dashboard + Platform Capacity (2026-02 / iter 11)
- **NEW FEATURE A — Tenant Debts Dashboard (`/saas-admin → ديون التجار`):**
  - Backend `routes/saas/tenant_debts_routes.py`:
    - GET `/saas/tenant-debts` (super-admin) — returns `{summary, items[]}` with per-tenant `credit_debt`, last reminder, total reminders sent, subscription-overdue flag.
    - POST `/saas/tenant-debts/{tid}/remind` — records reminder in `main_db.tenant_debt_reminders`, attempts email send (best-effort).
    - GET `/saas/tenant-debts/{tid}/statement.pdf` — PDF account statement via reportlab.
  - Frontend tab in SaaSAdminPage with summary cards + table + per-row reminder/PDF buttons.
  - Email service: `services.email_service.send_email` module-level helper (uses SendGrid when configured, else returns True silently — dev fallback).
- **NEW FEATURE B — Platform Capacity:**
  - `MAX_TENANTS` env var (0=unlimited, default 500 in `backend/.env`). Enforced in `/saas/register` AND `/saas/tenants` create endpoints with Arabic 400 message.
  - GET `/api/saas/platform-stats` (super-admin) — returns `{tenants{total,active,max,capacity_percent,severity}, databases{count}, resources{memory,cpu_percent,disk}}`. Severity: 'ok' / 'warning' (≥80%) / 'critical' (≥95%).
  - `PlatformCapacityCard` component above the Tabs in `/saas-admin` with auto-refresh (30s) and 4 sub-cards (tenants, DBs, memory, CPU+disk).
  - Memory progress-bar color thresholds aligned with backend severity (80% amber, 95% red).
- **Dependencies:** `psutil==7.2.2` added to `backend/requirements.txt`.
- **Tests:** `backend/tests/test_iter11_features.py` — 12/12 ✅ • iter 11 frontend Playwright: 100%.

## Next Action Items
- **P3:** طباعة فواتير `platform_cards` المباعة من POS.
- **Enhancement:** `/customer-debts` — تصدير PDF/Excel + تذكير SMS/WhatsApp جماعي (تطبيق نفس النمط على tenant-side).
- **Enhancement:** Email للمستأجر عند بدء جلسة انتحال (GDPR).
- **P1:** Redis caching (deferred per user).
- **Tech debt:** N+1 queries in `/saas/tenant-debts` (3N round-trips at 100+ tenants) and `/saas/monitoring`.
- **Tech debt:** PDF statement uses Helvetica — no Arabic glyph support. Register NotoSansArabic when needed.
- **Cleanup:** extract `_max_tenants()` helper (currently duplicated in 3 files).

## S17 — SaaS Admin Refactor: Sidebar-driven + Monitoring-only + Settle Debt + EntityCode (2026-02 / iter 13)
- **MAJOR UX REFACTOR — SaaS Admin from horizontal tabs → sidebar-driven sub-routes:**
  - `App.js` now registers 15 new sub-routes `/saas-admin/<slug>` (subscribers, agents, plans, payments, platform-catalog, recharge-mgmt, finance, databases, alerts, withdrawals, ai-assistant, impersonation-logs, default-pos-shortcuts, tenant-debts, audit-timeline) — all `superAdminOnly`.
  - `SaasAdminPage.js` derives `activeTab` from `useLocation().pathname` via `SLUG_TO_TAB` map; horizontal `TabsList` is hidden (`className="hidden"`) — the URL is the single source of truth.
  - Per-tab data loaders (loadTenantDebts, loadAuditTimeline, loadPlatformCatalog, loadRechargeConfig, loadImpersonationLogs, loadDefaultShortcuts) moved from `onClick` handlers to a `useEffect([activeTab])`.
  - `Layout.js` `superAdminNavSections` restructured into 5 grouped sections: NT Commerce / إدارة SaaS / كتالوج المنصّة / التقارير والتدقيق / النظام.
- **NEW MONITORING DASHBOARD (`/saas-admin` root only):**
  - `pages/admin/components/MonitoringDashboard.js` — 6 stat cards + PlatformCapacityCard + ServiceStatusMap + Quick Links (15 buttons mirroring sidebar).
  - `pages/admin/components/ServiceStatusMap.js` — Backend API / MongoDB / Redis (cache) status rows polling `/api/saas/platform-stats` every 30s.
  - Backend `/api/saas/platform-stats` extended with a `services` block: backend (always ok if reachable), mongodb (ping check), redis (REDIS_URL ping, falls back to `disabled` when env var unset). Lazy-imports `redis.asyncio` only when REDIS_URL is set.
- **NEW — Settle Debt (تسديد الدين) button + dialog in Tenant Debts table:**
  - Emerald `<Button data-testid="settle-debt-{id}-btn">` in each row; opens `<Dialog data-testid="settle-debt-dialog">` with amount input + "تسديد كامل الدين" quick-fill + optional note + Cancel/Confirm. Posts to existing `POST /api/wallet/settle-credit` and refreshes table on success.
- **NEW — Human-readable EntityCode badges:**
  - `pages/admin/components/EntityCode.js` — reusable `<EntityCode uuid={...} type="tenant"|"agent" />` rendering `T-XXXXXX` / `AG-XXXXXX` (first 6 hex chars of UUID, uppercase) with a one-click copy-to-clipboard button.
  - Subscribers table (`/saas-admin/subscribers`) and Agents table (`/saas-admin/agents`) and Tenant Debts table (`/saas-admin/tenant-debts`) all show a new `المعرّف` column as the first cell.
- **BUG FIX — Audit timeline tz-naive date filter crash (carry-over from iter 12):**
  - `routes/saas/audit_timeline_routes.py` `_parse_iso` now coerces naive datetimes to UTC so `?since=2026-01-01` no longer raises `TypeError: can't compare offset-naive and offset-aware datetimes`.
- **Tests:** `backend/tests/test_iter13_saas_admin.py` — 11/11 ✅. Iter 13 frontend Playwright 100% PASS — 0 console errors across full smoke run.

## S18 — SaaS Admin per-tab split + 3-format Platform Card Invoice (2026-02 / iter 14)
- **P2 — Extracted 4 of the 5 biggest SaaS tabs into dedicated page files:**
  - `pages/admin/saas/SaasPageHeader.js` — shared per-tab header with "back-to-monitoring" button.
  - `pages/admin/saas/PaymentsPage.js` — replaces inline Payments tab.
  - `pages/admin/saas/PlansPage.js` — full Plans page + plan-form dialog.
  - `pages/admin/saas/TenantDebtsPage.js` — TenantDebts WITH Settle Debt dialog + EntityCode column.
  - `pages/admin/saas/AuditTimelinePage.js` — Audit timeline + filters.
  - `App.js` routes for `/saas-admin/{plans,payments,tenant-debts,audit-timeline}` now point at these new pages.
  - **DEFERRED:** SubscribersPage extraction — has 7 interconnected dialogs (tenant CRUD, extend, impersonate, wallet charge, feature flags, add payment, bridge); needs a focused iteration.
- **P3 — Multi-format invoice printing for platform_cards sold from POS:**
  - `lib/platformCardInvoice.js` — pure builder: `buildPlatformCardInvoice({format, storeName, sale, card, customer, customerPhone})` returning print-ready HTML for `thermal58` (200px / 8pt), `thermal80` (280px / 10pt, default), or `a5` (148×210 mm @page rule).
  - `lib/escape.js` — `escapeHtml` helper (XSS-safe — testing agent verified `<script>` injection is escaped to `&lt;script&gt;`).
  - Invoice content (per user spec): store name, invoice# (`CARD-XXXXXXXX` — 8 hex chars), date/time (Arabic month name), card (operator + denomination), sale price, PIN code (mono box), payment method, customer/phone (if present), cashier signature line, thank-you message.
  - `components/SellPlatformCardDialog.js` — replaced single "طباعة وصل" with THREE format buttons: `print-58mm-btn`, `print-80mm-btn` (default), `print-a5-btn`. Now fetches `tenant-branding` to inject store name, and captures `resultSale` alongside `card` for invoice metadata. Toasts on popup-blocked.
- **Tests:** `backend/tests/test_iter14_saas_split.py` 12/12 ✅. Frontend Playwright + invoice-builder smoke 100% ✅. iter-12 tz-naive audit-timeline regression CONFIRMED FIXED.

## Next Action Items
- **P2 leftover:** Extract Subscribers tab (~1000 lines, 7 dialogs) into `pages/admin/saas/subscribers/` with sub-dialog components.
- **P1:** Resend integration for tenant-debt email reminders (still pending `RESEND_API_KEY`).
- **P2:** `printPlatformCardInvoice` — add "Click to Print" fallback inside popup body for browsers blocking `window.onload`.
- **P3:** Persist last-used invoice format per cashier in localStorage.
- **P3:** Re-print receipt for any previously-sold card from `/services/cards` inventory list.
- **Tech debt:** Single source of truth for SaaS sidebar (Layout.js ↔ MonitoringDashboard ↔ SaasAdminPage SLUG_TO_TAB).
- **Enhancement:** Consider tenant-monotonic counter for invoice numbers (current 8-hex has minor birthday risk at very high volume).
