"""Component: purchases — purchase orders, receiving."""
from core import get_module_logger

COMPONENT = "purchases"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.purchases_routes import create_purchases_routes

    app.include_router(create_purchases_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant), prefix="/api")
    log.info("purchases component mounted (1 router)")
