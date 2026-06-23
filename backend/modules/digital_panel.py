"""Component: digital_panel — IPTV subscriptions, services catalog, resellers."""
from core import get_module_logger
from fastapi import Depends

COMPONENT = "digital_panel"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.digital_panel_routes import create_digital_panel_routes
    from utils.feature_guard import make_require_feature

    require_feature = make_require_feature(ctx.get_current_user)

    app.include_router(
        create_digital_panel_routes(ctx.db, ctx.main_db, ctx.require_tenant, ctx.get_tenant_admin),
        prefix="/api",
        dependencies=[Depends(require_feature("iptv"))],
    )
    log.info("digital_panel component mounted (1 router)")
