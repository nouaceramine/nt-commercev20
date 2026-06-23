# NT Commerce v16 - PRD

## Original Problem Statement
استنساخ مشروع `nouaceramine/nt-commercev16` (مستودع عام) من GitHub وتثبيته/تشغيله في `/app`، ثم إصلاح الأخطاء وتنظيف الكود وبناء نظام لوغات لتتبع الأخطاء أثناء التصفح.

## Architecture
- **Backend**: FastAPI (entry: `backend/main.py`, supervisor wrapper: `backend/server.py`), MongoDB (motor), JWT auth, multi-tenant SaaS, robots/services modular
- **Frontend**: React 19 + craco, Tailwind, Shadcn/Radix UI, RTL Arabic + French i18n
- **Integrations**: Emergent LLM key configured (OpenAI/Claude/Gemini). Stripe/SendGrid/Resend keys empty (skipped per user)

## Personas
- **Super Admin**: manages SaaS plans, tenants, agents, payments, system logs
- **Agent**: resells subscriptions, earns commissions
- **Tenant Admin**: manages own business (POS, inventory, customers, reports)
- **Cashier**: limited access — POS only

## What's Implemented (2026-06-23)

### Session 1 - Setup
- Cloned `nt-commercev16` into `/app`, aligned with platform conventions
- Backend deps + emergentintegrations installed
- Frontend yarn deps installed (replaced replit-pinned yarn.lock)
- Created `backend/server.py` shim
- Configured `.env` (Emergent LLM key set)
- Seeded production data (3 plans + super admin)

### Session 2 - Bug fixes & cleanup
- LandingPage / PricingPage / RegisterPage: fixed field-name mismatch (monthly_price vs price_monthly)
- Suppressed global 403/401 toast on public pages
- Backend: missing `import io` in 3 routes, undefined `send_whatsapp_message`, duplicate `mark_all_notifications_read` function
- Frontend: duplicate `settings` key, undefined `msg` / `token`
- Removed unused legacy `/app/frontend/src/pages/RegisterPage.js`
- E2E tests: Backend 100%, Frontend 100%

### Session 3 - System Logs
- Backend: `routes/system_logs_routes.py` + global exception handler in `main.py`
  - POST /api/system-logs (public ingest)
  - GET /api/system-logs (list, super_admin)
  - GET /api/system-logs/stats (super_admin)
  - GET /api/system-logs/download (super_admin, JSON file)
  - POST /api/system-logs/analyze (super_admin, AI via Emergent LLM)
  - DELETE /api/system-logs (super_admin, manual purge)
- Frontend: `utils/errorLogger.js` - captures window.onerror, unhandledrejection, console.error, axios 4xx/5xx
- Frontend: `pages/SystemLogsPage.js` route `/saas-admin/system-logs` (super_admin only)
- Sidebar button added in SaasAdminPage
- 3 minor bugs fixed during session:
  - ReportRobot missing `check_interval` (broke /api/robots/status)
  - `/api/platform/features/public` required auth (now truly public)
  - PricingPage feature count for flat boolean schema
- Verified end-to-end: ingest works, list works, capture works automatically

## Test Credentials
See `/app/memory/test_credentials.md`

## Known Limitations / Backlog
- **P2**: Some frontend pages (SaasAdminPage, AgentDashboardPage, FeatureFlagsPage) still use legacy `price_*` field names with fallback
- **P2**: Stripe / SendGrid / Resend require user-provided API keys
- **P2**: Redis caching disabled (no Redis server)
- **P3**: ~200 `react-hooks/exhaustive-deps` non-blocking warnings remain
- **P3**: System Logs has no auto-rotation (use manual "Clear All" button)

## Next Action Items
- Try the System Logs page (`/saas-admin/system-logs`) and use the AI analysis on any captured errors
- Add API keys for Stripe / Email when payment / email flows are needed
