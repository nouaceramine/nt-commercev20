"""Component: auth — authentication, users, permissions, families."""
from core import get_module_logger

COMPONENT = "auth"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.auth_users_routes import create_auth_users_routes
    from routes.permissions_routes import create_permissions_routes
    from routes.families_permissions_routes import router as families_permissions_router

    auth_users_router = create_auth_users_routes(
        ctx.db, ctx.main_db, ctx.get_current_user, ctx.get_admin_user, ctx.get_tenant_admin,
        ctx.require_tenant, ctx.get_tenant_db, ctx.hash_password, ctx.verify_password,
        ctx.create_access_token, ctx.init_tenant_database, ctx.init_default_data, ctx.init_cash_boxes,
        ctx.SECRET_KEY, ctx.ALGORITHM, ctx.ACCESS_TOKEN_EXPIRE_HOURS, ctx.security,
        ctx.UserCreate, ctx.UserLogin, ctx.UserUpdate, ctx.UserResponse, ctx.TokenResponse,
        ctx.PasswordUpdate, limiter=ctx.limiter,
    )
    app.include_router(auth_users_router, prefix="/api")
    app.include_router(create_permissions_routes(ctx.db, ctx.main_db, ctx.get_current_user, ctx.get_tenant_admin), prefix="/api")
    app.include_router(families_permissions_router, prefix="/api")
    log.info("auth component mounted (3 routers)")
