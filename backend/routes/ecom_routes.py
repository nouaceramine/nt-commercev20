"""E-Commerce Hub Routes - Aggregator"""
from fastapi import APIRouter

from .ecom.integrations_routes import router as integrations_router
from .ecom.orders_routes import router as orders_router
from .ecom.leads_routes import router as leads_router
from .ecom.shipping_routes import router as shipping_router
from .ecom.webhooks_routes import router as webhooks_router
from .ecom.analytics_routes import router as analytics_router

router = APIRouter(tags=["E-Commerce Hub"])

router.include_router(integrations_router)
router.include_router(orders_router)
router.include_router(leads_router)
router.include_router(shipping_router)
router.include_router(webhooks_router)
router.include_router(analytics_router)
