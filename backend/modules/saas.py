"""Component: saas — platform management, plans, tenants, hierarchy,
system errors, and system sync."""
from core import get_module_logger

COMPONENT = "saas"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.saas_routes import router as saas_router
    from routes.agent_hierarchy_routes import create_agent_hierarchy_routes
    from routes import system_errors as system_errors_routes
    from routes.system_sync_routes import router as system_sync_router
    from routes.saas.commission_routes import router as commission_router

    app.include_router(saas_router, prefix="/api")
    app.include_router(create_agent_hierarchy_routes(ctx.main_db, ctx.get_super_admin), prefix="/api")

    system_errors_routes.init_routes(ctx.main_db, ctx.get_super_admin)
    app.include_router(system_errors_routes.router, prefix="/api")

    app.include_router(system_sync_router, prefix="/api")
    app.include_router(commission_router, prefix="/api")
    log.info("saas component mounted (5 routers)")
