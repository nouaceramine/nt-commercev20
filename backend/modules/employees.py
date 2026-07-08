"""Component: employees — employees, attendance, alerts."""
from core import get_module_logger

COMPONENT = "employees"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.employees_routes import create_employees_routes
    from routes.activity_routes import create_activity_routes

    app.include_router(create_employees_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant, ctx.DEFAULT_PERMISSIONS), prefix="/api")
    app.include_router(create_activity_routes(ctx.db, ctx.get_current_user), prefix="/api")
    log.info("employees component mounted (2 routers)")
