# NT Commerce v16 - PRD

## Original Problem Statement
استنساخ مشروع `nouaceramine/nt-commercev16` من GitHub وتثبيته/تشغيله، إصلاح الأخطاء، بناء نظام لوغات لتتبع الأخطاء، إصلاح مشكلة الدخول للحسابات، وحل أخطاء واجهة المستخدم المتعددة.

## Architecture
- **Backend**: FastAPI (entry: `backend/main.py`, supervisor wrapper: `backend/server.py`), MongoDB (motor), JWT auth, multi-tenant SaaS
- **Frontend**: React 19 + craco, Tailwind, Shadcn/Radix UI, RTL Arabic + French
- **Integrations**: Emergent LLM key (gpt-4o-mini for AI Chat + log analysis). Stripe/SendGrid/Resend empty.

## Sessions Summary
- **S1 Setup**: Cloned & ran, deps installed, server.py shim, env configured, prod data seeded
- **S2 Code cleanup**: LandingPage/PricingPage/RegisterPage field-name fixes, suppressed 403 toast on public pages, missing `io` imports, undefined symbols, removed legacy RegisterPage
- **S3 System Logs**: backend route + global exception handler, frontend errorLogger.js, SystemLogsPage `/saas-admin/system-logs`, AI analysis via Emergent LLM
- **S4 Auth bug**: impersonate now creates real user in tenant_db, agent branch added to get_current_user, tenant fallback to saas_tenants
- **S5 Page-level errors (current)**:
  - `SmartDashboardPage.js`: undefined `stat` → `indicator.name` (ReferenceError fixed)
  - `utils/beep.js`: lazy AudioContext creation to avoid "Illegal constructor" on /pos
  - `services/ai/llm_service.py`: fallback to Emergent LLM via emergentintegrations when Replit env not set → AI Chat now works
  - `sidebarMenu.js` + `Layout.js`: `motherboard` item now requires `minRole: 'super_admin'` (hidden from tenants)
  - Tax-report endpoints verified working (200 OK for all)

## Test Credentials
See `/app/memory/test_credentials.md`

## Known Limitations / Backlog
- **P2**: Stripe / SendGrid / Resend require user-provided API keys
- **P2**: Redis caching disabled
- **P2**: Some tenant pages still flood logs (notifications/families) when accessed by impersonator
- **P3**: ~200 react-hooks/exhaustive-deps non-blocking warnings remain

## Next Action Items
- Verify the 5 previously-broken pages now load cleanly: /motherboard (hidden), /pos, /smart-dashboard, /tax-reports, /ai-chat
- If new errors appear, capture them in `/saas-admin/system-logs` and we iterate
