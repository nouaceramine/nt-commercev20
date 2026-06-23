"""
NT Commerce 12.0 - Database Configuration
Centralized database connection and tenant management
"""
import os
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from contextvars import ContextVar
from typing import Any


MONGO_URL: str = os.environ.get("MONGO_URL")
DB_NAME: str = os.environ.get("DB_NAME")

client: AsyncIOMotorClient = AsyncIOMotorClient(MONGO_URL)
main_db: AsyncIOMotorDatabase = client[DB_NAME]

# ContextVar for per-request tenant database isolation
_tenant_db_ctx: ContextVar[AsyncIOMotorDatabase] = ContextVar('tenant_db')


class _TenantDBProxy:
    """Proxy that routes DB calls to tenant-specific DB when in tenant context, otherwise main DB."""
    def __getattr__(self, name: str) -> Any:
        try:
            return getattr(_tenant_db_ctx.get(), name)
        except LookupError:
            return getattr(main_db, name)

    def __getitem__(self, name: str) -> Any:
        try:
            return _tenant_db_ctx.get()[name]
        except LookupError:
            return main_db[name]


db = _TenantDBProxy()


def get_tenant_db(tenant_id: str) -> AsyncIOMotorDatabase:
    """Get database for a specific tenant"""
    if not tenant_id:
        return main_db
    db_name = f"tenant_{tenant_id.replace('-', '_')}"
    return client[db_name]


def set_tenant_context(tenant_db: AsyncIOMotorDatabase) -> None:
    """Set the tenant database context for the current request"""
    _tenant_db_ctx.set(tenant_db)


async def init_tenant_database(tenant_id: str) -> AsyncIOMotorDatabase:
    """Initialize a new tenant database with default collections and data"""
    from datetime import datetime, timezone
    tenant_db = get_tenant_db(tenant_id)
    
    # Initialize cash boxes
    boxes = [
        {"id": "cash", "name": "الصندوق النقدي", "name_fr": "Caisse", "type": "cash", "balance": 0},
        {"id": "bank", "name": "الحساب البنكي", "name_fr": "Compte bancaire", "type": "bank", "balance": 0},
        {"id": "wallet", "name": "المحفظة الإلكترونية", "name_fr": "Portefeuille électronique", "type": "wallet", "balance": 0},
        {"id": "safe", "name": "الخزنة", "name_fr": "Coffre-fort", "type": "safe", "balance": 0}
    ]
    for box in boxes:
        existing = await tenant_db.cash_boxes.find_one({"id": box["id"]})
        if not existing:
            await tenant_db.cash_boxes.insert_one(box)
    
    # Initialize default warehouse
    existing_warehouse = await tenant_db.warehouses.find_one({"id": "main"})
    if not existing_warehouse:
        await tenant_db.warehouses.insert_one({
            "id": "main",
            "name": "المخزن الرئيسي",
            "location": "",
            "is_main": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    # Initialize settings
    existing_settings = await tenant_db.settings.find_one({"id": "general"})
    if not existing_settings:
        await tenant_db.settings.insert_one({
            "id": "general",
            "low_stock_threshold": 10,
            "debt_reminder_days": 30,
            "currency": "دج",
            "language": "ar"
        })
    
    return tenant_db


async def check_connection() -> bool:
    """Verify MongoDB connection is active"""
    try:
        await client.admin.command('ping')
        return True
    except Exception:
        return False
