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

client: AsyncIOMotorClient = AsyncIOMotorClient(
    MONGO_URL,
    # Connection stability (p32): avoid intermittent 'connection closed' on long ops
    maxPoolSize=50,
    minPoolSize=5,
    maxIdleTimeMS=30000,
    serverSelectionTimeoutMS=10000,
    connectTimeoutMS=10000,
    socketTimeoutMS=120000,
    waitQueueTimeoutMS=10000,
    retryWrites=True,
)
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
    from core.db_naming import resolve_db_name  # p347: activity-based names
    return client[resolve_db_name(tenant_id)]


def set_tenant_context(tenant_db: AsyncIOMotorDatabase) -> None:
    """Set the tenant database context for the current request"""
    _tenant_db_ctx.set(tenant_db)



async def seed_default_entities(tenant_db) -> None:
    """p60: shared idempotent seeder for the 6 default entities
    (customer/supplier families + default customer/supplier/product).
    Single source of truth used by both init_tenant_database (legacy path)
    and main.init_default_data (manual endpoint)."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    default_customer_family_id = "default-customer-family"
    if not await tenant_db.customer_families.find_one({"id": default_customer_family_id}):
        await tenant_db.customer_families.insert_one({
            "id": default_customer_family_id,
            "name": "عائلة زبائن متنوعة",
            "name_fr": "Famille clients divers",
            "description": "عائلة افتراضية للزبائن",
            "discount": 0,
            "created_at": now,
            "updated_at": now
        })
    default_customer_id = "default-customer"
    if not await tenant_db.customers.find_one({"id": default_customer_id}):
        await tenant_db.customers.insert_one({
            "id": default_customer_id,
            "name": "زبون متنوع",
            "name_fr": "Client divers",
            "phone": "",
            "email": "",
            "address": "",
            "family_id": default_customer_family_id,
            "family_name": "عائلة زبائن متنوعة",
            "balance": 0,
            "total_purchases": 0,
            "notes": "زبون افتراضي للمبيعات العامة",
            "created_at": now,
            "updated_at": now
        })
    default_supplier_family_id = "default-supplier-family"
    if not await tenant_db.supplier_families.find_one({"id": default_supplier_family_id}):
        await tenant_db.supplier_families.insert_one({
            "id": default_supplier_family_id,
            "name": "عائلة مورد متنوع",
            "name_fr": "Famille fournisseurs divers",
            "description": "عائلة افتراضية للموردين",
            "created_at": now,
            "updated_at": now
        })
    default_supplier_id = "default-supplier"
    if not await tenant_db.suppliers.find_one({"id": default_supplier_id}):
        await tenant_db.suppliers.insert_one({
            "id": default_supplier_id,
            "name": "مورد متنوع",
            "name_fr": "Fournisseur divers",
            "phone": "",
            "email": "",
            "address": "",
            "family_id": default_supplier_family_id,
            "family_name": "عائلة مورد متنوع",
            "balance": 0,
            "total_purchases": 0,
            "notes": "مورد افتراضي للمشتريات العامة",
            "created_at": now,
            "updated_at": now
        })
    default_product_family_id = "default-product-family"
    if not await tenant_db.product_families.find_one({"id": default_product_family_id}):
        await tenant_db.product_families.insert_one({
            "id": default_product_family_id,
            "name": "عائلة منتج متنوع",
            "name_fr": "Famille produits divers",
            "name_ar": "عائلة منتج متنوع",
            "name_en": "Various Products Family",
            "description": "عائلة افتراضية للمنتجات",
            "description_ar": "عائلة افتراضية للمنتجات المتنوعة",
            "description_en": "Default family for various products",
            "parent_id": "",
            "parent_name": "",
            "image": "",
            "created_at": now,
            "updated_at": now
        })
    default_product_id = "default-product"
    if not await tenant_db.products.find_one({"id": default_product_id}):
        await tenant_db.products.insert_one({
            "id": default_product_id,
            "name_ar": "منتج متنوع",
            "name_en": "Produit divers",
            "article_code": "DIVERS-001",
            "barcode": "",
            "family_id": default_product_family_id,
            "family_name": "عائلة منتج متنوع",
            "purchase_price": 0,
            "wholesale_price": 0,
            "retail_price": 0,
            "quantity": 0,
            "min_stock": 0,
            "unit": "وحدة",
            "description": "منتج افتراضي للمبيعات المتنوعة",
            "supplier_id": default_supplier_id,
            "supplier_name": "مورد متنوع",
            "image": "",
            "created_at": now,
            "updated_at": now
        })


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
    
    # p60: legacy seeding path now produces the same complete default set
    # as the golden template / init_default_data endpoint (idempotent).
    await seed_default_entities(tenant_db)
    
    return tenant_db


async def check_connection() -> bool:
    """Verify MongoDB connection is active"""
    try:
        await client.admin.command('ping')
        return True
    except Exception:
        return False
