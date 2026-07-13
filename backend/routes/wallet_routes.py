"""
Wallet & Payment System Routes - AGGREGATOR
Refactored: Previously 1,452 lines (God Class) -> Now thin facade delegating to submodules
Following Martin Fowler's Extract Class + Facade patterns

Submodules:
- routes/wallet/wallet_core_routes.py       : Wallet CRUD, balance, settings, alerts
- routes/wallet/wallet_transactions_routes.py : Transaction history, transfers
- routes/wallet/wallet_requests_routes.py    : Top-up/withdraw requests
- routes/wallet/wallet_services_routes.py    : Services catalog & purchases
"""
from fastapi import APIRouter

from routes.wallet import (
    create_wallet_core_routes,
    create_wallet_transactions_routes,
    create_wallet_requests_routes,
    create_wallet_services_routes,
)


def create_wallet_routes(db, main_db, get_current_user, get_tenant_admin, get_super_admin):
    """
    Creates and aggregates all wallet route modules.
    Returns a single router with all wallet sub-routes included.
    
    This is a Facade - see individual submodules for actual implementations.
    """
    from utils.permissions import create_cashier_block
    block_cashier = create_cashier_block(get_current_user)

    # Create sub-routers
    core_router = create_wallet_core_routes(main_db, get_current_user, get_super_admin, block_cashier)
    txns_router = create_wallet_transactions_routes(main_db, get_current_user, get_super_admin, block_cashier)
    requests_router = create_wallet_requests_routes(main_db, get_current_user, get_super_admin, block_cashier)
    services_router = create_wallet_services_routes(main_db, get_current_user, block_cashier)

    # Aggregate into single router
    router = APIRouter(prefix="/wallet", tags=["wallet"])
    
    # Include all sub-routes (each submodule has its own prefix="/wallet")
    # FastAPI will merge them under the /wallet prefix
    router.include_router(core_router)
    router.include_router(txns_router)
    router.include_router(requests_router)
    router.include_router(services_router)

    return router
