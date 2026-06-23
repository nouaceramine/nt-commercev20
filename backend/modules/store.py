"""Component: store — online store & WooCommerce."""
from core import get_module_logger

COMPONENT = "store"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.online_store_routes import create_online_store_routes

    app.include_router(create_online_store_routes(ctx.db, ctx.main_db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant, ctx.get_tenant_db), prefix="/api")
    log.info("store component mounted (1 router)")
