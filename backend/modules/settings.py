"""Component: settings — settings, printing, barcode, performance, cache."""
from core import get_module_logger

COMPONENT = "settings"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.settings_routes import create_settings_routes
    from routes.printing_routes import create_printing_routes, create_barcode_routes
    from routes.performance_routes import create_performance_routes

    app.include_router(create_settings_routes(ctx.db, ctx.get_current_user), prefix="/api")
    app.include_router(create_printing_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin), prefix="/api")
    app.include_router(create_barcode_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin), prefix="/api")
    app.include_router(create_performance_routes(ctx.db, ctx.get_current_user), prefix="/api")
    log.info("settings component mounted (4 routers)")
