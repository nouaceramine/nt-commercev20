
"""RouterRegistry - Centralized route registration"""
from fastapi import FastAPI
import logging

logger = logging.getLogger(__name__)

ROUTES_CONFIG = [
    ("routes.simple_auth_routes", "create_auth_routes", "/api"),
    ("routes.products_routes", "create_products_routes", "/api"),
    ("routes.orders_routes", "create_orders_routes", "/api"),
    ("routes.customers_routes", "create_customers_routes", "/api"),
    ("routes.analytics_routes", "create_analytics_routes", "/api"),
    ("routes.suppliers_routes", "create_suppliers_routes", "/api"),
    ("routes.promotions_routes", "create_promotions_routes", "/api"),
    ("routes.webhooks_routes", "create_webhooks_routes", "/api"),
    ("routes.notifications_routes", "create_notifications_routes", "/api"),
    ("routes.settings_routes", "create_settings_routes", "/api"),
]

def register_routes(app: FastAPI, db, get_current_user):
    for module_path, factory_name, prefix in ROUTES_CONFIG:
        try:
            module = __import__(module_path, fromlist=[factory_name])
            factory = getattr(module, factory_name)
            router = factory(db=db, get_current_user=get_current_user)
            app.include_router(router, prefix=prefix)
            logger.info(f"[ROUTER] Registered: {module_path}")
        except Exception as e:
            logger.warning(f"[ROUTER] Failed {module_path}: {e}")
