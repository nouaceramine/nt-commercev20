"""Component: backup — backups, import/export, database management."""
from core import get_module_logger
from fastapi import Depends

COMPONENT = "backup"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.backup_routes import create_backup_routes
    from routes.import_export_routes import create_import_export_routes
    from routes.database_routes import router as database_router
    from utils.feature_guard import make_require_feature

    require_feature = make_require_feature(ctx.get_current_user)

    app.include_router(
        create_backup_routes(ctx.db, ctx.main_db, ctx.get_current_user, ctx.get_tenant_admin, ctx.get_super_admin),
        prefix="/api",
        dependencies=[Depends(require_feature("backup"))],
    )
    app.include_router(create_import_export_routes(ctx.db, ctx.get_current_user), prefix="/api")
    # database_router keeps its dedicated /api/saas prefix (matches legacy wiring)
    app.include_router(database_router, prefix="/api/saas")
    log.info("backup component mounted (3 routers)")
