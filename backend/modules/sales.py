"""Component: sales — sales, POS, advanced sales."""
from core import get_module_logger

COMPONENT = "sales"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.sales_routes import create_sales_routes
    from routes.advanced_sales_routes import create_advanced_sales_routes

    app.include_router(create_advanced_sales_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant), prefix="/api")
    app.include_router(create_sales_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant), prefix="/api")
    log.info("sales component mounted (2 routers)")
