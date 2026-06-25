"""Component: services — SIM recharge, shipping & loyalty services."""
from core import get_module_logger
from fastapi import Depends

COMPONENT = "services"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.recharge_sim_routes import create_recharge_sim_routes
    from routes.shipping_loyalty_routes import create_shipping_loyalty_routes
    from routes.pos_settings_routes import create_pos_settings_routes
    from utils.feature_guard import make_require_feature

    require_feature = make_require_feature(ctx.get_current_user)

    app.include_router(
        create_recharge_sim_routes(
            ctx.db, ctx.main_db, ctx.require_tenant, ctx.get_tenant_admin,
            ctx.RECHARGE_CONFIG, ctx.RechargeCreate, ctx.RechargeResponse, ctx.get_tenant_db,
        ),
        prefix="/api",
        dependencies=[Depends(require_feature("recharge"))],
    )
    app.include_router(
        create_shipping_loyalty_routes(ctx.db, ctx.require_tenant, ctx.get_tenant_admin, ctx.CURRENCY),
        prefix="/api",
    )
    app.include_router(
        create_pos_settings_routes(ctx.db, ctx.get_current_user),
        prefix="/api",
    )
    log.info("services component mounted (3 routers)")
