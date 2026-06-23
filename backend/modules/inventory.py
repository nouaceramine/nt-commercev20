"""Component: inventory — warehouses, stock, spare parts, defective goods."""
from core import get_module_logger

COMPONENT = "inventory"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.warehouse_core_routes import create_warehouse_routes
    from routes.defective_routes import create_defective_routes

    app.include_router(create_warehouse_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant), prefix="/api")
    app.include_router(create_defective_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin), prefix="/api")
    log.info("inventory component mounted (2 routers)")
