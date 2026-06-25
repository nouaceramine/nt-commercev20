# NT Commerce v16 - PRD

## Original Problem Statement
استنساخ مشروع `nouaceramine/nt-commercev16` وتشغيله، إصلاح الأخطاء، بناء نظام لوغات، إصلاح المصادقة، وحماية الكود من تكرار نفس نوع الأخطاء.

## Architecture
- **Backend**: FastAPI (entry: `backend/main.py`, supervisor wrapper: `backend/server.py`), MongoDB (motor), JWT auth, multi-tenant SaaS
- **Frontend**: React 19 + craco, Tailwind, Shadcn/Radix UI, RTL Arabic + French
- **Integrations**: Emergent LLM key (gpt-4o-mini for AI Chat + log analysis)
- **CI**: GitHub Actions workflow `.github/workflows/lint.yml` (ESLint + ruff)

## Sessions Summary
- **S1 Setup**: Cloned, deps installed, server.py shim, env configured, prod data seeded
- **S2 Code cleanup**: LandingPage/PricingPage/RegisterPage fixes, suppressed 403 toast, missing `io` imports
- **S3 System Logs**: backend route + global exception handler, frontend errorLogger.js, /saas-admin/system-logs page with AI analysis
- **S4 Auth bug**: impersonate now creates real user in tenant_db, agent branch in get_current_user, tenant fallback
- **S5 Page-level errors**: SmartDashboard `stat`→`indicator.name`, beep.js lazy AudioContext, llm_service Emergent LLM fallback, motherboard sidebar guard
- **S6 POS Illegal constructor + CI**:
  - **Root cause**: `<History />` in POSPage.js wasn't imported from lucide-react → fell back to `window.History` (DOM API) which throws Illegal constructor when React rendered it
  - **Fix**: added `History` to lucide-react imports + `/motherboard` route now `superAdminOnly`
  - **CI**: created `.github/workflows/lint.yml` with ESLint (no-undef + react/jsx-no-undef) + ruff (F821/F811/F601/F602)
  - **eslint.config.mjs**: flat config tuned to catch the bug class without flooding on existing warnings
  - **Backend cleanup**: removed duplicate import redefinitions, fixed 3 real Mongo bugs `{"$ne": None, "$ne": ""}` → `{"$nin": [None, ""]}` in data_integrity_robot and agent_hierarchy_routes
  - **Frontend cleanup**: fixed `sale is not defined` in DailySessionsPage, missing `toast` import in DashboardPage, 3 case-declarations bugs

## Test Credentials
See `/app/memory/test_credentials.md`

## Final Lint Status
- **Backend ruff**: 0 errors (catastrophic class)
- **Frontend ESLint**: 0 errors, 867 non-blocking warnings (cleanup backlog)

## Known Limitations / Backlog
- P2: Stripe / SendGrid / Resend require user keys
- P2: Redis caching disabled
- P3: 867 unused-vars warnings + ~200 react-hooks/exhaustive-deps warnings (non-blocking)

## Next Action Items
- Push to GitHub via "Save to GitHub" — the workflow will run on the next push
- If CI fails, fix only the *errors* (not warnings) and re-push
