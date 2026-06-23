"""
Motherboard Core for NT Commerce.

A small framework that turns the app into a "motherboard": each domain is an independent
component with its own log file, the system can self-diagnose which component failed, and
unhandled errors are routed to the responsible component automatically.

Usage (from main.py, after the app and routers are created):

    from core import install_motherboard
    install_motherboard(app, get_tenant_admin)
"""
from .logging_config import get_module_logger, get_log_file, LOGS_DIR
from . import registry
from .registry import ModuleSpec
from .error_handler import install_error_handling
from .diagnostics import build_router as build_diagnostics_router

__all__ = [
    "install_motherboard",
    "get_module_logger",
    "get_log_file",
    "LOGS_DIR",
    "registry",
    "ModuleSpec",
]


def install_motherboard(app, get_admin):
    """Wire the motherboard core into an existing FastAPI app.

    `get_admin` is the auth dependency that gates all (admin-only) diagnostics
    endpoints."""
    from . import modules_map  # noqa: F401  (importing registers all components)

    install_error_handling(app)
    app.include_router(build_diagnostics_router(get_admin), prefix="/api")

    core_logger = get_module_logger("core")
    core_logger.info(
        f"Motherboard installed: {len(registry.get_all())} components registered"
    )
    return app
