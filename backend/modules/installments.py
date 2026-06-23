"""Component: installments — installment sales management."""
from core import get_module_logger

COMPONENT = "installments"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.installments_routes import create_installments_routes
    app.include_router(
        create_installments_routes(ctx.db, ctx.get_current_user, ctx.require_tenant),
        prefix="/api"
    )
    log.info("installments component mounted")
