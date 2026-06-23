"""Component: employees — employees, attendance, alerts."""
from core import get_module_logger

COMPONENT = "employees"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.employees_routes import create_employees_routes

    app.include_router(create_employees_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant, ctx.DEFAULT_PERMISSIONS), prefix="/api")
    log.info("employees component mounted (1 router)")
