# Wallet Routes Package
# Refactored from monolithic wallet_routes.py into separate modules
# Following Martin Fowler's Extract Class pattern

from .wallet_core_routes import create_wallet_core_routes
from .wallet_transactions_routes import create_wallet_transactions_routes
from .wallet_requests_routes import create_wallet_requests_routes
from .wallet_services_routes import create_wallet_services_routes

__all__ = [
    'create_wallet_core_routes',
    'create_wallet_transactions_routes',
    'create_wallet_requests_routes',
    'create_wallet_services_routes',
]
