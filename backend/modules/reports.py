"""Component: reports — statistics, dashboards, daily sessions."""
from core import get_module_logger
from fastapi import Depends

COMPONENT = "reports"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.stats_routes import create_stats_routes
    from routes.daily_sessions_routes import create_daily_sessions_routes
    from utils.feature_guard import make_require_feature

    require_feature = make_require_feature(ctx.get_current_user)

    app.include_router(
        create_stats_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant, ctx.init_cash_boxes, ctx.CURRENCY),
        prefix="/api",
        dependencies=[Depends(require_feature("reports"))],
    )
    app.include_router(
        create_daily_sessions_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant),
        prefix="/api",
    )
    log.info("reports component mounted (2 routers)")
