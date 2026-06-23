"""Component: repairs — repair tickets, spare parts, technicians."""
from core import get_module_logger
from fastapi import Depends

COMPONENT = "repairs"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.repair_routes import create_repair_routes
    from utils.feature_guard import make_require_feature

    require_feature = make_require_feature(ctx.get_current_user)

    app.include_router(
        create_repair_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin),
        prefix="/api",
        dependencies=[Depends(require_feature("maintenance"))],
    )
    log.info("repairs component mounted (1 router)")
