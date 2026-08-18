"""Recharge & SIM services package — split from the legacy recharge_sim_routes.py.

Public factory keeps the original signature so callers are unchanged.
"""
from fastapi import APIRouter

from .core_routes import build_core_router
from .delivery_settings_routes import build_delivery_settings_router
from .sim_routes import build_sim_router
from .bridge_routes import build_bridge_router
from .idoom_routes import build_idoom_router


def create_recharge_sim_routes(db, main_db, require_tenant, get_tenant_admin, RECHARGE_CONFIG, RechargeCreate, RechargeResponse, get_tenant_db=None):
    router = APIRouter()
    router.include_router(build_core_router(db, main_db, require_tenant, get_tenant_admin, RECHARGE_CONFIG, RechargeCreate, RechargeResponse))
    router.include_router(build_delivery_settings_router(db, require_tenant, get_tenant_admin))
    router.include_router(build_sim_router(db, main_db, require_tenant, get_tenant_admin))
    router.include_router(build_bridge_router(db, main_db, require_tenant, get_tenant_admin, get_tenant_db))
    router.include_router(build_idoom_router(db, main_db, require_tenant, get_tenant_admin))
    return router


__all__ = ["create_recharge_sim_routes"]
