"""Component: security — security logs, blocked IPs, API keys, sessions."""
from core import get_module_logger

COMPONENT = "security"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.security_routes import create_security_routes

    app.include_router(create_security_routes(ctx.db, ctx.main_db, ctx.get_current_user, ctx.get_super_admin), prefix="/api")
    log.info("security component mounted (1 router)")
