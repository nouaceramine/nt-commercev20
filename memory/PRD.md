# NT Commerce v16 - PRD

## Original Problem Statement
استنساخ مشروع `nouaceramine/nt-commercev16` (مستودع عام) من GitHub وتثبيته/تشغيله، ثم إصلاح الأخطاء، بناء نظام لوغات لتتبع الأخطاء، وإصلاح مشكلة عدم الدخول لحسابات المستأجرين/الوكلاء.

## Architecture
- **Backend**: FastAPI (entry: `backend/main.py`, supervisor wrapper: `backend/server.py`), MongoDB (motor), JWT auth, multi-tenant SaaS
- **Frontend**: React 19 + craco, Tailwind, Shadcn/Radix UI, RTL Arabic + French
- **Integrations**: Emergent LLM key configured (for AI log analysis). Stripe/SendGrid/Resend keys empty.

## Personas
- **Super Admin**: SaaS plans, tenants, agents, payments, system logs, **impersonation**
- **Agent**: resells subscriptions, earns commissions
- **Tenant Admin**: own business (POS, inventory, customers, reports)
- **Cashier**: POS only

## What's Implemented (2026-06-23)

### Session 1 - Setup
Cloned & ran, Python+Yarn deps installed, server.py shim, .env configured, prod data seeded.

### Session 2 - Code cleanup & fixes
LandingPage/PricingPage/RegisterPage field-name mismatches, suppressed 403/401 toast on public pages, missing `io` imports, undefined `send_whatsapp_message`, duplicate `mark_all_notifications_read`, removed legacy RegisterPage.

### Session 3 - System Logs feature
- Backend: `routes/system_logs_routes.py` + global exception handler in main.py
  - POST /api/system-logs (public ingest)
  - GET /api/system-logs (admin list with filters)
  - GET /api/system-logs/stats (admin)
  - GET /api/system-logs/download (admin, JSON file)
  - POST /api/system-logs/analyze (admin, AI via Emergent gpt-4o-mini)
  - DELETE /api/system-logs (admin manual purge)
- Frontend: `utils/errorLogger.js` auto-captures window.onerror, unhandledrejection, console.error, axios 4xx/5xx
- Frontend: `pages/SystemLogsPage.js` at `/saas-admin/system-logs`
- Tested end-to-end: system captured 24 errors during a single browsing session
- AI analysis works (`with_max_tokens` removed → emergentintegrations compatible)
- 3 minor fixes during session: ReportRobot check_interval, /platform/features/public no-auth, PricingPage flat-boolean feature count

### Session 4 - Authentication bug (impersonation + tenant/agent login broken)
**Root cause**: `/auth/me` and `get_current_user` couldn't resolve users when:
1. Super-admin impersonated tenant → JWT `sub=tenant_id`, but tenant_db.users didn't contain that id → 401
2. Direct tenant unified-login → fallback set `sub=tenant_id` when no user in tenant_db.users → same 401
3. Agent JWT → both get_current_user implementations had no branch for agents → 401

**Fixes**:
- `routes/saas/tenants_routes.py::impersonate_tenant`: lazy-init tenant DB, look up real user in tenant_db.users (or create on-the-fly), use that id as JWT `sub`, set role=tenant_admin
- `routes/auth_users_routes.py` unified-login: auto-create admin user in tenant_db.users if missing (instead of falling back to tenant_id)
- `utils/auth.py::get_current_user`: added fallback to saas_tenants when user_id == tenant_id
- `main.py::get_current_user`: rewrote — added agent branch (lookup saas_agents), super_admin fallback, tenant fallback to saas_tenants
- DateFormatContext: skip `/settings/datetime` call when not a tenant user (eliminates super-admin 403 flood)
- Verified end-to-end: super-admin → click tenant in /saas-admin → tenant dashboard loads correctly

## Test Status
- Iteration 1: Backend 100%, Frontend 70% → fixed
- Iteration 2: Backend 100%, Frontend 100%
- Iteration 3 (manual via screenshot): Impersonation flow works ✅

## Test Credentials
See `/app/memory/test_credentials.md`

## Known Limitations / Backlog
- P2: Stripe / SendGrid / Resend require user-provided API keys
- P2: Redis caching disabled (no Redis server)
- P3: Some pages may still call tenant endpoints for super-admin (e.g. SmartNotifications) — may flood logs with 401/403 but doesn't break functionality
- P3: ~200 react-hooks/exhaustive-deps non-blocking warnings remain

## Next Action Items
- Verify other tenant/agent pages work as expected during impersonation
- Add API keys for payment / email when needed
