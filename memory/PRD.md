# NT Commerce v16 - PRD

## Original Problem Statement
استنساخ مشروع `nouaceramine/nt-commercev16` (مستودع عام) من GitHub وتثبيته/تشغيله في `/app`، ثم إصلاح أخطاء الكود وتنظيفه.

## Architecture
- **Backend**: FastAPI (entry: `backend/main.py`, supervisor wrapper: `backend/server.py`), MongoDB (motor), JWT auth, multi-tenant SaaS, robots/services modular
- **Frontend**: React 19 + craco, Tailwind, Shadcn/Radix UI, RTL Arabic + French i18n
- **Integrations**: Emergent LLM key configured (OpenAI/Claude/Gemini). Stripe/SendGrid/Resend keys empty (skipped per user)

## Personas
- **Super Admin**: manages SaaS plans, tenants, agents, payments
- **Agent**: resells subscriptions, earns commissions
- **Tenant Admin**: manages own business (POS, inventory, customers, reports)
- **Cashier**: limited access — POS only

## What's Implemented (2026-06-23)
### Session 1 - Setup
- Cloned `nt-commercev16` into `/app`, aligned with platform conventions
- Backend deps + emergentintegrations installed
- Frontend yarn deps installed (replaced replit-pinned yarn.lock)
- Created `backend/server.py` shim
- Configured `.env` (backend + frontend, Emergent LLM key set)
- Seeded production data (3 plans + super admin)
- Both services up and running under supervisor

### Session 2 - Bug fixes & cleanup (after E2E test feedback)
- Fixed LandingPage `toLocaleString` crash (field name mismatch monthly_price vs price_monthly)
- Fixed PricingPage NaN prices, feature count
- Fixed RegisterPage 0-DZD prices
- Suppressed global 403/401 toast on public pages (apiClient interceptor)
- Backend: fixed missing `import io` in 3 routes (notifications, ocr_invoice, system_sync)
- Backend: fixed undefined `send_whatsapp_message` → `send_whatsapp_message_v2`
- Backend: renamed duplicate `mark_all_notifications_read` → `_v2`
- Backend: tenant commission price_map updated to new field names with legacy fallback
- Frontend: removed duplicate `settings` key in LanguageContext, undefined `msg` in AIChatPage, undefined `token` in SystemTab
- Removed unused legacy `/app/frontend/src/pages/RegisterPage.js`

## Test Status
- **Iteration 1**: Backend 13/13 (100%), Frontend 70% (3 issues)
- **Iteration 2**: Backend 13/13 (100%), Frontend 100% (all issues fixed)
- See `/app/test_reports/iteration_*.json`

## Test Credentials
See `/app/memory/test_credentials.md`

## Known Limitations / Backlog
- **P2**: Unify SaaS plan field names across full codebase (SaasAdminPage, AgentDashboardPage, FeatureFlagsPage still use legacy names with fallback)
- **P2**: PricingPage mock fallback uses legacy field names (only triggered on API failure)
- **P2**: Stripe / SendGrid / Resend integrations require user-provided API keys
- **P2**: Redis caching disabled (no Redis server)
- **P3**: Many `react-hooks/exhaustive-deps` non-blocking warnings remain

## Next Action Items
- Add API keys for Stripe/Email if user wants payment / email flows live
- Optional: full SaaS multi-tenant E2E walkthrough (create tenant → add product → make sale → check report)
- Optional: enable Redis caching for performance
