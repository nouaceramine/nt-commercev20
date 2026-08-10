# NT Commerce - Architecture Documentation

## Overview
Multi-tenant SaaS e-commerce platform with database-per-tenant isolation.

## Tech Stack
- **Backend**: FastAPI (Python)
- **Frontend**: React.js with Shadcn UI
- **Database**: MongoDB (one DB per tenant + main SaaS DB)
- **Auth**: JWT with tenant_id claim

## Backend Structure

```
/app/backend/
├── server.py           # Main application (11000+ lines - monolithic)
├── config/
│   └── database.py     # MongoDB connection, ContextVar, DB Proxy
├── models/
│   └── schemas.py      # Pydantic models
├── routes/             # Modular routes (partially implemented)
│   ├── auth.py
│   ├── customers.py
│   ├── products.py
│   ├── sales.py
│   ├── purchases.py
│   ├── saas.py
│   ├── suppliers.py
│   ├── warehouses.py
│   └── reports.py
├── utils/
│   ├── auth.py         # JWT utilities
│   └── dependencies.py # FastAPI dependencies (RBAC)
└── services/
    └── code_generator.py
```

## Database Architecture

### Multi-Tenancy Pattern
- `main_db`: SaaS management (tenants, plans, agents, super_admin users)
- `tenant_{id}`: Per-tenant isolated database

### Data Isolation (ContextVar + Proxy)
1. Middleware extracts `tenant_id` from JWT
2. Sets `ContextVar` with tenant-specific DB
3. `db` proxy routes all queries to correct database
4. Super Admin queries use `main_db` explicitly

### Key Collections (main_db)
- `saas_tenants`: Tenant accounts
- `saas_plans`: Subscription plans
- `saas_agents`: Sales agents/resellers
- `users`: Super admin users
- `saas_payments`: Payment records

### Key Collections (tenant_db)
- `products`, `customers`, `suppliers`
- `sales`, `purchases`
- `users` (tenant employees)
- `cash_boxes`, `warehouses`
- `settings`

## RBAC Dependencies

| Dependency | Access Level | Blocks Super Admin |
|------------|--------------|-------------------|
| `get_current_user` | Any authenticated user | No |
| `get_admin_user` | admin, super_admin, manager | No |
| `get_super_admin` | super_admin only | No |
| `get_tenant_admin` | admin, manager (tenant) | Yes |
| `require_tenant` | Any tenant user | Yes |

## API Routes Summary

### SaaS Management (Super Admin)
- `GET /api/saas/plans` - List plans
- `POST /api/saas/plans` - Create plan
- `GET /api/saas/tenants` - List tenants
- `POST /api/saas/tenants` - Create tenant
- `POST /api/saas/impersonate/{tenant_id}` - Impersonate tenant
- `GET /api/saas/monitoring` - Dashboard stats + alerts
- `GET /api/saas/agents` - List agents

### Tenant Routes (Protected by require_tenant)
- `GET/POST /api/products` - Product management
- `GET/POST /api/customers` - Customer management
- `GET/POST /api/sales` - Sales operations
- `GET/POST /api/purchases` - Purchase operations
- All routes block Super Admin access

## Frontend Structure

```
/app/frontend/src/
├── App.js              # Main routing
├── contexts/
│   ├── AuthContext.js  # Authentication state
│   ├── LanguageContext.js
│   └── ThemeContext.js
├── pages/
│   ├── UnifiedLoginPage.js
│   ├── DashboardPage.js
│   ├── ProductsPage.js
│   ├── admin/
│   │   └── SaasAdminPage.js  # Super Admin dashboard
│   └── landing/
│       └── LandingPage.js
└── components/
    ├── ui/             # Shadcn components
    └── ...
```

## Test Credentials
- **Super Admin**: `super@ntcommerce.com` / `password`
- **Tenant A**: `tenanta@test.com` / `password123`
- **Tenant B**: `tenantb@test.com` / `password123`

## Refactoring Notes

### Current State
- `server.py` contains ALL business logic (338 routes, 11000+ lines)
- Routes in `/routes/` folder are stubs (not connected)

### Recommended Approach
1. Keep `server.py` as source of truth for now
2. Gradually migrate routes to modular files
3. Add new features in modular files
4. Test thoroughly after each migration

### Priority Routes for Migration
1. `/saas/*` - SaaS management (38 routes)
2. `/products/*` - Product CRUD (17 routes)
3. `/sales/*` - Sales operations (14 routes)
4. `/auth/*` - Authentication (4 routes)
