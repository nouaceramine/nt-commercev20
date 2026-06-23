"""Component: ai — AI chat, insights, agents, smart assistant."""
from core import get_module_logger

COMPONENT = "ai"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.ai.chat_routes import create_ai_routes
    from routes.ai_assistant_routes import create_ai_assistant_routes

    app.include_router(create_ai_routes(ctx.db, ctx.get_current_user), prefix="/api")
    app.include_router(create_ai_assistant_routes(ctx.db, ctx.get_current_user, ctx.get_tenant_admin, ctx.require_tenant), prefix="/api")
    log.info("ai component mounted (2 routers)")
