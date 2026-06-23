"""Component: products — products, families, pricing, utilities."""
from core import get_module_logger

COMPONENT = "products"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.products_routes import create_products_routes
    from routes.utility_routes import create_utility_routes

    app.include_router(create_products_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant), prefix="/api")
    app.include_router(create_utility_routes(ctx.db, ctx.require_tenant, ctx.get_tenant_admin, ctx.PriceHistoryResponse), prefix="/api")
    log.info("products component mounted (2 routers)")
