# NT Commerce v16 - PRD

## Original Problem Statement
استنساخ مشروع `nouaceramine/nt-commercev16` (مستودع عام) من GitHub وتثبيته/تشغيله في `/app`.

## Architecture
- **Backend**: FastAPI (entry: `backend/main.py`, supervisor wrapper: `backend/server.py`), MongoDB (motor), JWT auth, modular routes/services/robots, multi-tenant SaaS
- **Frontend**: React 19 + craco, Tailwind CSS, Shadcn/Radix UI, RTL Arabic + French i18n
- **Integrations available**: Stripe (via emergentintegrations), SendGrid/Resend, OpenAI

## What's Implemented (2026-06-23)
- Cloned `nt-commercev16` into `/app` and aligned with platform conventions
- Backend Python deps installed; emergentintegrations installed
- Frontend yarn deps installed (replaced replit-pinned yarn.lock to use upstream registry)
- Created `backend/server.py` shim that re-exports `app` from `main` for supervisor compatibility
- Configured `.env` files (preserving REACT_APP_BACKEND_URL, MONGO_URL/DB_NAME)
- Seeded production data via `scripts/init_production.py`: 3 SaaS plans + super admin
- Both backend (port 8001) and frontend (port 3000) running under supervisor
- Verified login API and home page render

## Test Credentials
See `/app/memory/test_credentials.md`

## Next Action Items
- Wire optional integration keys (Stripe, SendGrid/Resend, OpenAI) when needed
- Run end-to-end testing across modules (POS, inventory, customers, reports)
- Production hardening: change default admin password, set strong JWT secret, configure CORS

## Backlog
- P1: Comprehensive test pass on tenant flow + multi-warehouse
- P1: Address React `react-hooks/exhaustive-deps` warnings
- P2: Set up Redis (caching disabled currently)
