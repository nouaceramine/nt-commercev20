"""Component: accounting — chart of accounts, journal entries, invoices, taxes."""
from core import get_module_logger

COMPONENT = "accounting"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.accounting.accounting_routes import router as accounting_router
    from routes.tax_routes import create_tax_routes

    app.include_router(accounting_router, prefix="/api")
    app.include_router(create_tax_routes(ctx.db, ctx.get_current_user), prefix="/api")
    log.info("accounting component mounted (2 routers)")
