"""Component: search — global search, suggestions, history."""
from core import get_module_logger

COMPONENT = "search"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.search_routes import create_search_routes

    app.include_router(create_search_routes(ctx.db, ctx.get_current_user), prefix="/api")
    log.info("search component mounted (1 router)")
