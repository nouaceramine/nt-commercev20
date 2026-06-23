"""Component: suppliers — suppliers, families, supplier tracking."""
from core import get_module_logger

COMPONENT = "suppliers"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.suppliers_core_routes import create_suppliers_routes
    from routes.supplier_tracking_routes import create_supplier_tracking_routes

    app.include_router(create_suppliers_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant), prefix="/api")
    app.include_router(create_supplier_tracking_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin), prefix="/api")
    log.info("suppliers component mounted (2 routers)")
