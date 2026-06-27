"""Component: ecom — Unified E-Commerce Hub (multi-channel orders, leads, shipping).

Gated per-tenant by the `ecommerce_hub` feature flag. Routes themselves enforce
the flag (see routes.ecom.constants.require_ecom_feature). Super-admins always
pass through.
"""
from core import get_module_logger

COMPONENT = "ecom"


def register(app, ctx):
    log = get_module_logger(COMPONENT)
    from routes.ecom_routes import router as ecom_router

    app.include_router(ecom_router, prefix="/api")
    log.info("ecom component mounted (1 aggregator router → 4 sub-routers)")
