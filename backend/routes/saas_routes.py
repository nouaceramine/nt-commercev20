"""
SaaS Routes - Aggregator
Routes split into: plans, tenants, monitoring, agents, agent_self_service, registration, database_mgmt
"""
from fastapi import APIRouter

from .saas.plans_routes import router as plans_router
from .saas.tenants_routes import router as tenants_router
from .saas.monitoring_routes import router as monitoring_router
from .saas.agents_routes import router as agents_router
from .saas.agent_self_service_routes import router as agent_self_service_router
from .saas.registration_routes import router as registration_router
from .saas.database_mgmt_routes import router as database_mgmt_router
from .saas.platform_catalog_routes import router as platform_catalog_router
from .saas.recharge_config_routes import router as recharge_config_router
from .saas.helpers import get_super_admin

router = APIRouter(tags=["SaaS Admin"])

router.include_router(plans_router)
router.include_router(tenants_router)
router.include_router(monitoring_router)
router.include_router(agents_router)
router.include_router(agent_self_service_router)
router.include_router(registration_router)
router.include_router(database_mgmt_router)
router.include_router(platform_catalog_router)
router.include_router(recharge_config_router)
