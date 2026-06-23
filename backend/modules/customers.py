"""Component: customers — customers, families, debts, blacklist."""
from core import get_module_logger

COMPONENT = "customers"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.customers_routes import create_customers_routes
    from routes.customer_debts_routes import create_customer_debts_routes

    app.include_router(create_customers_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant), prefix="/api")
    app.include_router(create_customer_debts_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant, ctx.CURRENCY), prefix="/api")
    log.info("customers component mounted (2 routers)")
