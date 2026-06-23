"""Component: tasks — task management, internal chat."""
from core import get_module_logger

COMPONENT = "tasks"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.task_chat_routes import create_task_routes, create_chat_routes

    app.include_router(create_task_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin), prefix="/api")
    app.include_router(create_chat_routes(ctx.db, ctx.get_current_user), prefix="/api")
    log.info("tasks component mounted (2 routers)")
