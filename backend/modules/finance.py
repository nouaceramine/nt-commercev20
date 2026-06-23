"""Component: finance — cash boxes, debts, expenses, wallet, banking, currencies."""
from core import get_module_logger
from fastapi import Depends

COMPONENT = "finance"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.cashbox_routes import create_cashbox_routes
    from routes.debts_routes import create_debts_routes
    from routes.expenses_routes import create_expenses_routes
    from routes.wallet_routes import create_wallet_routes
    from routes.banking_routes import create_banking_routes
    from routes.currency_routes import create_currency_routes
    from utils.feature_guard import make_require_feature

    require_feature = make_require_feature(ctx.get_current_user)

    app.include_router(create_cashbox_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant, ctx.init_cash_boxes), prefix="/api")
    app.include_router(create_debts_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant), prefix="/api")
    app.include_router(create_expenses_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant), prefix="/api")
    app.include_router(
        create_wallet_routes(ctx.db, ctx.main_db, ctx.get_current_user, ctx.get_tenant_admin, ctx.get_super_admin),
        prefix="/api",
        dependencies=[Depends(require_feature("wallet"))],
    )
    app.include_router(create_banking_routes(ctx.db, ctx.get_current_user), prefix="/api")
    app.include_router(create_currency_routes(ctx.db, ctx.get_current_user), prefix="/api")
    log.info("finance component mounted (6 routers)")
