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

## S19 — SubscribersPage + Redis + Resend + Reprint + Format Memory (2026-02 / iter 15)
- **P2 COMPLETE — SubscribersPage extracted** (last of the 5):
  - `pages/admin/saas/SubscribersPage.js` — 760 lines, self-contained, fetches its own data, contains 6 inline dialogs (tenant CRUD / extend / impersonate / wallet-charge / feature-flags / bridge), `المعرّف` column with EntityCode badges, search input.
  - `App.js` `/saas-admin/subscribers` now points at the new page (was legacy SaasAdminPage).
  - All 5 biggest tabs from S17 are now extracted (Subscribers + TenantDebts + Plans + Payments + AuditTimeline).
- **P1 — Redis caching infrastructure:**
  - `utils/cache.py` — NEW: `RedisCache` + `_NoopCache` fallback with `cached_json` decorator + `invalidate_prefix` (SCAN-based, non-blocking).
  - `/etc/supervisor/conf.d/redis.conf` — Redis bound to 127.0.0.1:6379, maxmemory 64MB, `allkeys-lru` eviction, persistence disabled. `REDIS_URL=redis://127.0.0.1:6379/0` added to `.env`.
  - `/api/saas/platform-stats` now serves from cache with 10s TTL (returns `cached: true` + `served_at` timestamp on warm hits). `services.redis.status` flipped from `disabled` → `ok`. Service-health check now uses `cache.ping()` (reuses singleton + circuit-breaker) instead of opening fresh connections per poll.
- **P1 — Resend email integration:**
  - `services/email_service.py` — refactored to multi-provider (Resend > SendGrid > mock). Resend SDK lazy-imported. `get_email_provider()` public helper. Hard warning at init when `RESEND_API_KEY` is set but `SENDER_EMAIL` is empty/sandbox (preventing silent production failures). `resend==2.21.0` added to requirements.txt.
  - Provider currently = `mock` because user hasn't supplied `RESEND_API_KEY` — setting it in `.env` and `supervisorctl restart backend` is the only step to switch to real delivery.
- **P3 — Reprint receipts from /services/cards:**
  - `pages/CardsServicePage.js` — NEW `tab-sales` lists `/platform-cards/sales` rows with three reprint buttons per row (58mm / 80mm / A5). Fetches `tenant-branding` once for the store name.
- **P3 — Persistent last-used invoice format (per-cashier):**
  - `lib/platformCardInvoice.js` + `components/SellPlatformCardDialog.js` + `pages/CardsServicePage.js` — `printPlatformCardInvoice` saves the format choice to `localStorage.pos.last_invoice_format`. The 3 print buttons read it on render and highlight the matching one with a star ★ as the recommended default.
- **Tests:** `backend/tests/test_iter15_redis_resend.py` 14/14 PASS. Frontend Playwright 100% across all 7 saas-admin sub-routes + SubscribersPage dialogs + Sales tab. Code-review nits (testid on extend button, served_at timestamp, cache.ping reuse, SENDER_EMAIL warning) all APPLIED.

## S20 — Cleanup + Cache propagation + Pagination + Agents extraction (2026-02 / iter 16)
- **P2 CLEANUP — SaasAdminPage.js: 3066 → 1875 lines (-39%, ~1175 lines of dead code removed):**
  - Deleted 6 dead `<TabsContent>` blocks (tenants/agents/plans/payments/tenant-debts/audit-timeline — those routes now use extracted page files).
  - Deleted 8 duplicate dialogs: Settle Debt, Plan Form, Tenant Form, Extend Subscription, Bridge Mode, Impersonate, Feature Flags, Wallet Charge.
  - Pruned hidden `TabsList` to only the 10 still-served tabs.
  - Removed `loadTenantDebts` / `loadAuditTimeline` branches from the activeTab effect.
- **P2 CACHE PROPAGATION:**
  - `/api/saas/stats` — 15s Redis TTL (key `saas:stats:global`). Warm hit returns `cached:true` + `served_at`.
  - `/api/saas/tenant-debts` — 15s Redis TTL (key prefix `saas:tenant-debts:`, variants for `only_with_debt=true|false`). Exposes `invalidate_tenant_debts_cache()`.
  - Cache busting wired into `POST /api/wallet/settle-credit`, `POST /api/wallet/add-funds`, and `POST /api/saas/tenant-debts/{id}/remind` so the dashboard reflects writes immediately.
- **P3 PAGINATION + SERVER-SIDE FILTERS on /api/platform-cards/sales:**
  - Backend: `limit` (1-500, default 50) + `skip` + `operator` + `payment_method` + `since` + `until` + `search` (uses `re.escape` for safety). Response shape changed from bare array → `{items, total, limit, skip, has_more}`.
  - Frontend `/services/cards` Sales tab: `sales-prev-btn` / `sales-next-btn` pagination footer (appears when `total > 50`), debounced search (300ms) wired to `?search=` server filter, "default format" indicator (★) on the matching reprint button.
- **P3 AGENTS EXTRACTION:**
  - `pages/admin/saas/AgentsPage.js` — NEW (~16 lines): thin wrapper around AgentsDashboard inside `<Layout>` + `<SaasPageHeader>`.
  - `/saas-admin/agents` now routes to SaasAgentsPage instead of legacy SaasAdminPage. Page data-testid: `saas-agents-page`.
- **Tests:** `backend/tests/test_iter16_cleanup_perf.py` 16/16 PASS. Frontend Playwright 100% across all 10 kept + 6 extracted routes.
- **Polish applied post-test:** `re.escape` in sales search (replaces hand-rolled metachar escape), removed 5 redundant eslint-disable directives, re-added the debounced-search useEffect that was reverted in the test diff.

## S21 — Final polish: decorator promotion + SaasAdminPage deep clean + Sales date filters + seed (2026-02 / iter 17)
- **P2 @cached_json decorator promoted** (`utils/cache.py`):
  - New `stamp=True` mode auto-injects `cached:true` + ISO `served_at` on warm dict hits.
  - Persisted payload is *clean* — the decorator strips the stamp fields before SET so they don't accumulate across refreshes.
  - Refactored 3 endpoints to one-line cache: `/saas/platform-stats` (10s), `/saas/stats` (15s), `/saas/tenant-debts` (15s, per-`only_with_debt` variant via `_debts_cache_subkey` helper).
- **P2 `SaasAdminPage.js` deep clean — 3066 → 1113 lines (-63% from S17 baseline):**
  - Removed all orphan state, handlers, dialogs (settle-debt, tenant CRUD, plan CRUD, extend, impersonate, wallet-charge, feature-flags, bridge, agent, agent-transactions, add-payment).
  - Pruned 60+ unused lucide-react icon imports.
  - Kept only the 11 still-served tabs (platform-catalog, recharge-mgmt, finance, databases, monitoring, alerts, withdrawals, ai-assistant, impersonation-logs, default-pos-shortcuts) + Reject Withdrawal Dialog + Recharge Edit Dialog + Platform Catalog Dialog.
- **P3 Sales tab date filters:**
  - `pages/CardsServicePage.js` — 2 date inputs (`sales-since-input` / `sales-until-input`) + `sales-clear-filters-btn` (visible only when any filter active). Debounced (300ms) server-side filter via `?since=` / `?until=`. Backend already supported these in iter 16; this iter wires the UI.
- **P3 Pagination QA seed:**
  - `backend/scripts/seed_platform_card_sales.py` — idempotent (rows tagged `seed_tag='iter17-pagination'`). 60 sales spread over ~13 hours, mixed operators/methods/customers. Run: `python -m scripts.seed_platform_card_sales [tenant_id] [count]`.
- **Tests:** 20/20 pytest PASS + 17/17 frontend routes + 6/6 extracted-page testids + 60-row pagination footer validated. Lint clean across all modified files.
- **Infra note**: Redis binary went missing once during a container fork; resolved via `apt-get install -y redis-server`. Recommend baking into base image to avoid recurrence.

## S22 — E-Commerce Hub P1 (Feature flag + Base infra + Unified Inbox + Manual orders) (2026-02 / iter 18)
- **P0 Feature flag — `ecommerce_hub` OPT-IN (default OFF per tenant):**
  - Backend: `SUPPORTED_FEATURES` in `routes/saas/tenants_routes.py` adds `ecommerce_hub`; new `OPT_IN_FEATURES = {"ecommerce_hub"}` flips the default-True resolver to default-False for opt-in keys. Same opt-in injection added in `main.py` `get_current_user` and `tenants_routes.impersonate_tenant`.
  - Frontend: `pages/admin/saas/SubscribersPage.js` ALL_FEATURES gets the new key with `optIn:true`, rendered with an amber BETA badge.
  - `contexts/AuthContext.js` mirrors `OPT_IN_FEATURES` so `isFeatureEnabled('ecommerce_hub')` returns false when the key is missing.
- **P1 Backend — `/api/ecom/*` (4 routers, ~700 LOC, all gated by `await require_ecom_feature(user)`):**
  - `routes/ecom/constants.py` — channels (8) + statuses (7) + shipping providers (4) + state-machine transitions + async feature-gate helper that falls back to a Mongo lookup when the user object lacks `features` (utils/auth.get_current_user does not inject features).
  - `routes/ecom/integrations_routes.py` — channel CRUD (Shopify/FB/IG/TikTok/WhatsApp/Telegram/Viber). Credentials are stored opaque and REDACTED in responses. Mock test endpoint always returns ok:true.
  - `routes/ecom/orders_routes.py` — unified inbox (`ecom_orders` collection). List/filter (channel/status/search/date range/pagination), summary aggregates (by_channel, by_status, today, 7d), CRUD + state-machine `PUT /status` with allowed-transitions validation. DELETE requires status ∈ {cancelled, refunded}.
  - `routes/ecom/leads_routes.py` — multi-channel leads CRUD with status pipeline (new→contacted→qualified→converted|lost).
  - `routes/ecom/shipping_routes.py` — mock label creation. Auto-bumps order status to 'shipped' if currently confirmed/packed. Tracking number prefix per provider (YAL-/ZR-/MS-).
  - Mounted via `modules/ecom.py` → `routes/ecom_routes.py` aggregator (added to `modules/__init__.py` MODULES list).
- **P1 Frontend — `/ecom-hub` + `/ecom-hub/channels` (~900 LOC, RTL Arabic-first):**
  - `pages/ecom/ecomConstants.js` — single source of truth (channels/statuses/providers + NEXT_STATUSES state-machine mirror).
  - `pages/ecom/EcomHubPage.js` — unified inbox: 4 KPI cards (today/7d/total/new), per-channel breakdown buttons, status filter tabs, search + channel filter, orders table with channel/status badges, P1 mock-mode banner, BETA badge.
  - `pages/ecom/EcomChannelsPage.js` — 7 connectable channel cards with per-channel credential schemas (Shopify/FB/IG/TikTok/WhatsApp/Telegram/Viber). Connect/edit dialog uses password inputs; existing creds preserved on edit when blank.
  - `pages/ecom/EcomManualOrderDialog.js` — full manual order entry: channel select, customer fields, dynamic items grid, shipping_fee, live totals.
  - `pages/ecom/EcomOrderDetailDialog.js` — order detail with state-machine transition buttons, mock shipping-label generation, status history audit trail.
  - `components/Layout.js` — new tenant sidebar section `🛍️ التجارة الإلكترونية` with featureKey gate.
  - `App.js` — two new routes guarded by `<ProtectedRoute featureKey="ecommerce_hub">`.
- **Tests:** `backend/tests/test_iter18_ecom_hub.py` (1 full-flow) + testing-agent-added `test_iter18_ecom_extra.py` (5 cases) — **6/6 PASS**. Frontend Playwright: feature-flags dialog (BETA), /ecom-hub manual order creation + table render, /ecom-hub/channels CRUD, flag-OFF tenant gets 403 with Arabic message. Existing routes (POS/sales/customers/reports) verified not broken by AuthContext change.
- **MOCKED in P1 (acknowledged by user — س4:b):** Shipping labels return random YAL-/ZR-/MS- tracking but do NOT call real Yalidine/ZR/Maystro APIs. Channel test-connection always returns ok:true. UI shows yellow P1 mock banners on both /ecom-hub and /ecom-hub/channels.

## S22.1 — Sidebar merge + Usage Guide (2026-02 / iter 18.1)
- **Bug fix:** Two sidebar sections both titled "التجارة الإلكترونية" existed (legacy `ecommerce` + new `ecom-hub`). Removed the standalone section and merged its 2 items + new guide into the legacy section. Title upgraded to `🛍️ التجارة الإلكترونية` for visual parity. DOM audit confirmed: 1 section, 3 ecom links.
- **Feature:** New `/ecom-hub/guide` page (`pages/ecom/EcomGuidePage.js`, ~370 LOC):
  - 5-step quick-start with deep links to /ecom-hub and /ecom-hub/channels.
  - Per-channel accordion (Shopify / Facebook / Instagram / WhatsApp / TikTok / Telegram / Viber) with step-by-step API-key acquisition + official docs link.
  - Shipping-provider guides (Yalidine / ZR / Maystro).
  - Visual order-lifecycle diagram (state machine).
  - Tips card highlighting P1 mock-mode + best practices.
- **`/ecom-hub` header:** new "دليل الاستخدام" button (data-testid='ecom-guide-link') between Refresh and Channels.
- **Tests:** Backend 6/6 still PASS. Lint clean across all ecom pages.


## S22.2 — P1.5 indexes + Browser notifications + AI Insights + Email settings + P2 Shopify/Yalidine (2026-02 / iter 18.2)
- **P1.5 indexes (5 new MongoDB indexes per tenant DB):**
  - `ecom_orders`: id (unique), order_code (unique), created_at, (channel,status) compound, customer.phone, integration_id
  - `ecom_integrations`: id (unique), channel
  - `ecom_leads`: id (unique), created_at, (channel,status) compound
  - `ecom_shipping_labels`: id (unique), order_id, tracking_number (unique sparse)
- **🌐 Browser notifications** — `hooks/useEcomOrderNotifications.js` polls `/ecom/orders/summary` every 30s and fires desktop notifications when the `new` counter increases. Permission requested via toggle button on /ecom-hub header. localStorage stores last-seen count to avoid duplicate notifications after reload.
- **🤖 AI Insights Card** — Backend: `services/ai_insights_service.py` builds a JSON metrics snapshot (tenants, churn risk, debt, ecom adoption) → fed to Emergent LLM (gpt-4o-mini) → parses JSON response with headline/health_score/highlights/risks/recommendations. Heuristic fallback when LLM unavailable. Cached 1h in Redis. UI: `pages/admin/components/AIInsightsCard.js` with animated SVG health-score ring + 3-column breakdown + manual refresh button. Auto-rendered on Monitoring dashboard.
- **📧 Email settings admin page** — `routes/saas/email_settings_routes.py` (GET/PUT/test) + `pages/admin/saas/EmailSettingsPage.js`. Super-admin can paste RESEND_API_KEY / SENDGRID_API_KEY / SENDER_EMAIL at runtime — stored in `main_db.platform_settings`. `email_service.py` extended with `_load_db_settings()` (60s cache) so values take effect within a minute without restart. Keys masked (last 4 chars) in GET responses. Test-send endpoint validates the setup with a real email. Sidebar link added: `/saas-admin/email-settings`.
- **🛍️ P2 Shopify webhook integration (REAL):**
  - `services/ecom/shopify_service.py`: HMAC-SHA256 verification, Shopify order JSON → internal schema parser, idempotent upsert by `external_id`.
  - `routes/ecom/webhooks_routes.py`: POST /api/ecom/webhooks/shopify/{tenant_id}/{integration_id}/orders (unauthenticated, HMAC-verified). Returns 200 even on duplicate so Shopify stops retrying. Bumps integration `mode` to 'live' on first successful delivery. Stub for products webhook (P2.1).
  - Channels UI now displays the unique webhook URL (one-click copy) when editing a Shopify integration — operator pastes it into Shopify Admin → Notifications → Webhooks.
- **🚚 P2 Yalidine real shipping client:**
  - `services/ecom/yalidine_service.py`: real Yalidine REST call (POST /v1/parcels/) with X-API-ID + X-API-TOKEN headers, parsed response → tracking_number + label_url. Typed `YalidineCredentialsMissing` / `YalidineAPIError` exceptions.
  - `routes/ecom/shipping_routes.py`: tries real Yalidine first when provider=yalidine AND credentials present → falls back to mock on any failure (network, 4xx, missing creds). Label doc records `mode='live'` or `'mock_real_provider_pending'` accordingly.
- **Shipping carriers as integrations:** Extended CHANNELS map with `yalidine`/`zr`/`maystro` (kind='shipping'). Channels CRUD now accepts all 10 entries (7 sales + 3 shipping). Frontend dialog auto-renders per-channel credential schemas including shipping carriers.
- **Tests:** Backend 10/10 PASS (6 existing + 4 new in `test_iter18_2_p2_real_integrations.py`):
  - test_ai_insights_endpoint (validates LLM/heuristic shape)
  - test_email_settings_round_trip (validates GET/PUT masking)
  - test_shopify_webhook_hmac_verification (bad/good HMAC + idempotency + Shopify→internal mapping)
  - test_yalidine_mock_fallback_when_no_creds (creds-missing path returns YAL- mock)

## Next Action Items (User's deferred backlog)
- **🛍️ P2 (E-Commerce Hub — TOP PRIORITY going forward):** Real Shopify webhooks (orders + stock sync) + real Yalidine API for shipping labels and tracking polling. User keys required: SHOPIFY_API_KEY / SHOPIFY_WEBHOOK_SECRET / YALIDINE_API_ID / YALIDINE_API_TOKEN.

## S22.3 — P2.1 + P3 + P4 + P5 + Onboarding + Auto-SMS (2026-02 / iter 18.3)
- **P2.1 Shopify products/inventory webhook** — `routes/ecom/webhooks_routes.py` now persists a per-channel mirror in `ecom_external_products` (upsert by external_id) so stock and analytics jobs have ground truth. HMAC-verified.
- **P3 WhatsApp Cloud API** — `services/ecom/whatsapp_service.py` parses incoming messages → creates leads, sends outgoing text via Cloud API. GET handshake (`hub.verify_token`) + POST message webhook in `webhooks_routes.py`. Idempotent by `messages[].id`.
- **P3 Meta Leads (FB/IG)** — Same `services/ecom/whatsapp_service.py` (shared parser). GET handshake + POST `leadgen` webhook → creates `ecom_leads` with form fields auto-mapped (full_name/phone_number/email + extras).
- **P4 Telegram + Viber + TikTok webhooks** — `services/ecom/messaging_services.py` with `parse_telegram_update`, `parse_viber_event`, `parse_tiktok_order`. Telegram/Viber → leads; TikTok → orders (TIK-XXXXX prefix). All idempotent + auto-flip integration `mode='live'`.
- **P5 Analytics** — `routes/ecom/analytics_routes.py`:
  - `GET /api/ecom/analytics/revenue?days=N` — per-channel daily time series + totals + AOV
  - `GET /api/ecom/analytics/funnel?days=N` — leads → orders → confirmed → shipped → delivered conversion %
  - `GET /api/ecom/analytics/top-products?days=N&limit=K` — best-selling items aggregated across all channels (unwind items)
- **P5 AI Lead Categorization** — `POST /api/ecom/leads/{id}/ai-categorize` uses Emergent LLM (gpt-4o-mini) to classify lead intent (interested / price_inquiry / support / complaint / spam / other) + 0-100 conversion score + Arabic reason. Result persisted on the lead doc; subsequent calls return cached value. Heuristic fallback when LLM unavailable.
- **🔔 Auto-WhatsApp on status change** — `routes/ecom/orders_routes.py::update_order_status` now calls `_maybe_notify_customer()` which detects an active WhatsApp integration and sends an Arabic status message to the customer's phone (best-effort; never blocks the state transition).
- **🎓 Onboarding tour** — `EcomHubPage.useEffect` checks `localStorage.ecom_guide_seen`; first visit redirects to `/ecom-hub/guide` with a friendly toast. Subsequent visits bypass.
- **🎨 Analytics page** — `pages/ecom/EcomAnalyticsPage.js` (~250 LOC) with Recharts: KPI banner, daily-time-series LineChart per channel, horizontal BarChart for channel breakdown, conversion-funnel progress bars, top-products table. Period selector (7/30/90/365 days). Sidebar link "تحليلات التجارة" added.
- **New indexes** — `ecom_leads.ai_category`, `(channel, external_id) unique sparse` (idempotent webhooks), and `ecom_external_products(channel, integration_id, external_id) unique`.
- **Tests:** 16/16 PASS (6 iter-18 + 4 iter-18.2 + 6 iter-18.3 new):
  - test_whatsapp_webhook_verify_and_create_lead (handshake + message → lead + idempotency)
  - test_telegram_and_viber_webhooks
  - test_meta_lead_webhook (Facebook leadgen with field_data)
  - test_tiktok_order_webhook (order creation + idempotency)
  - test_analytics_endpoints (revenue/funnel/top-products shapes)
  - test_ai_categorize_lead (LLM call + cached re-call)
- **Verified visually:** Analytics page renders LineChart + BarChart with real test data (35,800 DA across 3 channels).

- **💬 P3 (E-Commerce Hub):** WhatsApp Business Cloud API (status updates SMS-like) + Meta Webhooks for FB/IG Leads → auto-populate `ecom_leads`.
- **📱 P4 (E-Commerce Hub):** TikTok Marketing API + Telegram Bot + Viber service.

## S22.4 — AI Co-pilot + Health Alerts + RAG categorizer + Dockerfile (2026-02 / iter 18.4)
- **🤖 AI Co-pilot للتحليلات** — `services/ecom/copilot_service.py` يبني سياق JSON محدَّث (إيرادات per channel، deltas مقارنة بالفترة السابقة، top products، leads conversion) ويرسله لـ Emergent LLM (gpt-4o-mini) مع system prompt عربي. POST `/api/ecom/analytics/copilot` بـ `{question, session_id, days}`. ذاكرة محادثة per-session في الـ RAM. Heuristic fallback عند غياب LLM.
- **🤖 Frontend Chat** — `pages/ecom/EcomCopilotChat.js` (~120 LOC) — Quick prompts، messages bubbles، input عربي RTL، typing indicator، مدمج بصفحة `/ecom-hub/analytics` تحت الـ KPI cards.
- **🤖 RAG-aware Lead Categorizer** — `categorize_lead_with_context()` يدمج: نسبة التحويل التاريخية للقناة + عدد الرسائل السابقة من نفس الرقم في الـ prompt. القيمة المُحفوظة على الـ lead doc تتضمن `ai_source: 'llm_rag'` و `ai_context: {channel_conversion_pct, prior_from_same_phone}` للشفافية.
- **⚠️ Health Score Alerts** — `services/health_alerts_service.py` يقرأ AI Insights ويفجِّر تنبيهاً (severity warning < 75، critical < 50). يحفظ في `main_db.platform_alerts` ويُرسل إيميلاً لكل السوبر-أدمن. Throttling: لا يُكرَّر نفس severity إلا بعد 24h. مدمج في `GET /api/saas/ai-insights` كـ side-effect.
- **⚠️ Health Alerts UI** — `pages/admin/components/HealthAlertsCard.js` على Monitoring dashboard. يُظهر التنبيهات الـ open مع زر "أُقِرّ" (resolve). يخفي نفسه إذا score >= 75 (إذا لا يوجد تاريخ تنبيهات).
- **🐳 Dockerfile.base** — Single-container production-ready: Python 3.11 + Node 20 + Nginx + Redis 7 + Supervisor. Builds React frontend ويصدِّمه عبر Nginx، يدير uvicorn + redis + nginx عبر supervisord. HEALTHCHECK يستخدم `/api/health`. ARG `REACT_APP_BACKEND_URL` للـ build-time.
- **📄 DEPLOYMENT.md** — Quick-start guide مع جدول env vars + ASCII architecture + webhook URL templates لكل قناة + scaling guide.
- **3 new endpoints:**
  - `POST /api/ecom/analytics/copilot` — conversational analytics
  - `GET  /api/saas/health-alerts` — list with open_count
  - `POST /api/saas/health-alerts/{id}/resolve` — mark resolved
- **Tests:** 19/19 PASS (6 + 5 + 6 + 3 new in `test_iter18_4_copilot_health_rag.py`):
  - test_copilot_returns_arabic_answer (multi-turn session)
  - test_health_alerts_endpoint
  - test_rag_lead_categorizer_uses_context
- **Verified visually:** Co-pilot answered "ما هي أفضل قناة بيع لديّ هذا الشهر؟" with detailed Arabic LLM reply citing per-channel revenue (manual 17,668 / Shopify 17,500 / TikTok 12,800).

## Next Action Items
- **🔑 USER ACTION REQUIRED — أدخل المفاتيح الحقيقية:**
  - Shopify per integration via `/ecom-hub/channels` (shop_domain + admin_api_key + webhook_secret)
  - Yalidine per integration (api_id + api_token)
  - WhatsApp / Meta / TikTok / Telegram / Viber — كذلك
  - Resend عبر `/saas-admin/email-settings`
- **🎨 Backlog**: تصميم email templates أجمل، CSV export للتحليلات، PDF invoices للطلبات.
- **🌐 Backlog**: مشاركة لوحات تحليلات للعملاء (public dashboards مع شيفرة وصول).

- **📊 P5 (E-Commerce Hub):** Revenue analytics per channel + funnel charts + LLM-based lead categorization (uses existing Emergent LLM key).
- **🔑 (USER DEFERRED):** Provide `RESEND_API_KEY` + verified `SENDER_EMAIL` to flip email provider from `mock` → `resend`.
- **🤖 (QUEUED):** AI Insights card on Monitoring dashboard (hourly snapshot).


## Next Action Items (User's deferred backlog)
- **🔑 P1 (USER DEFERRED):** Provide `RESEND_API_KEY` + verified `SENDER_EMAIL` to flip email provider from `mock` → `resend`. Single env edit + `sudo supervisorctl restart backend` and tenant-debt email reminders go live.
- **📦 P2 (suggestion):** Bake `redis-server` and Resend SDK pin into a Dockerfile / base image so cold-spawned containers don't lose them.
- **🎨 P3 (nice-to-have):** Date-range presets ("اليوم / آخر 7 أيام / هذا الشهر") on the Sales tab.
- **🤖 P3 (QUEUED by user 2026-02 iter17):** AI Insights card on the Monitoring dashboard summarizing the latest 24 hrs (top sellers, churn risk, debt growth). Hourly refresh via Gemini or Claude. Leverage the now-stable Redis cache to keep LLM costs minimal. Gives super-admin a strategic daily view instead of raw numbers. Status: backlog, awaiting prioritization.

## S22.5 — E-com Manual Order: Wilaya/Commune Selects + POS Product picker (2026-02 / iter 19)
- **🐛 Bug fix #1** — `/ecom-hub/channels` no longer crashes (already fixed in iter-18.4; verified clean).
- **🐛 Bug fix #2** — Manual-order dialog: Wilaya (`manual-order-wilaya-select`) and Commune (`manual-order-commune-select`) are now cascading Select dropdowns sourced from `data/algeriaGeo.js` (58 wilayas + their major communes). Picking a wilaya enables and populates the commune dropdown.
- **✨ Feature** — Manual-order dialog: new green "🔎 بحث المنتج من المخزون" box ABOVE the items table. Uses existing `ProductSearchDropdown` to search the tenant's POS products (GET `/api/products`). Clicking a result auto-fills the **first empty** item row with name + sku (barcode) + price (retail_price), and shows "✓ مرتبط بمنتج المخزون" badge. Backend `_validate_items` (in `routes/ecom/orders_routes.py`) now persists optional `product_id` on each order item so the link back to inventory is preserved.
- **🐛 Bug fix #3 (already in place — re-verified)** — POST `/api/purchases` syncs BOTH `purchase_price` (always when `update_product_prices` truthy/null) AND `selling_price` (when > 0). Tested with unit_price=999.99 / new_retail=1499.99 → product was updated correctly.
- **Tests:** `backend/tests/test_iter19_bug_fixes.py` 3/3 PASS. Playwright frontend 4/4 fixes verified. 1 test order `ECO-DFEA1E08` + 1 seed product (`TEST_iter19 منتج`, retail=750, qty=11) left in FOAD@FOAD tenant for manual QA.
- **Code-review nit applied post-test:** `addProductFromInventory` now finds the FIRST empty item row (was last); avoids skipping earlier blank rows when a user has expanded the items grid before picking from inventory.

## Next Action Items
- **🛍️ User adoption:** Switch from mock to live by entering real keys via `/ecom-hub/channels` (Shopify/Yalidine/WhatsApp/Meta/TikTok/Telegram/Viber) and `/saas-admin/email-settings` (Resend).
- **🎨 Backlog:** Email template polish, CSV export for analytics, PDF invoices per order.
- **🌐 Backlog:** Public shareable analytics dashboards (token-gated).
- **♻️ Tech-debt (testing-agent suggestion):** Add a one-click "انتحال" (impersonate) button on `/saas-admin/subscribers` rows (`impersonate-btn-{tenant_id}`) so future QA / support sessions don't have to call the API + inject localStorage manually.
