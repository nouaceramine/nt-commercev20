"""Component: notifications — notifications, smart notifications, push."""
from core import get_module_logger

COMPONENT = "notifications"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.notifications_routes import create_notifications_routes
    from routes.smart_notifications_routes import create_smart_notifications_routes
    from routes.notification_routes import create_notification_routes
    from routes.push_notification_routes import create_push_notification_routes

    app.include_router(create_notifications_routes(ctx.db, ctx.require_tenant, ctx.get_tenant_admin, ctx.get_current_user, ctx.DEFAULT_PERMISSIONS), prefix="/api")
    app.include_router(create_smart_notifications_routes(ctx.db, ctx.main_db, ctx.get_current_user), prefix="/api")
    app.include_router(create_notification_routes(ctx.db, ctx.get_current_user), prefix="/api")
    app.include_router(create_push_notification_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant), prefix="/api")
    log.info("notifications component mounted (4 routers)")
