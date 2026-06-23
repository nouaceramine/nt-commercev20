"""
Database Reset & Fresh Initialization Script
Creates a completely clean database with all required initial data
"""
import asyncio
import bcrypt
import uuid
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


async def reset_database() -> dict:
    client = AsyncIOMotorClient(MONGO_URL)
    now = datetime.now(timezone.utc).isoformat()

    # ============ STEP 1: DROP ALL DATABASES ============
    print("🗑️  Dropping all databases...")
    all_dbs = await client.list_database_names()
    for db_name in all_dbs:
        if db_name in ['admin', 'local', 'config']:
            continue
        await client.drop_database(db_name)
        print(f"   Dropped: {db_name}")

    # ============ STEP 2: INITIALIZE MAIN DB ============
    print("\n📦 Creating main database...")
    main_db = client[DB_NAME]

    # Super Admin
    admin_id = str(uuid.uuid4())
    await main_db.users.insert_one({
        "id": admin_id,
        "name": "مدير النظام",
        "email": "admin@ntcommerce.com",
        "hashed_password": hash_password("Admin@2024"),
        "role": "super_admin",
        "is_active": True,
        "permissions": {},
        "created_at": now,
        "updated_at": now,
    })
    print("   ✅ Super Admin: admin@ntcommerce.com / Admin@2024")

    # SaaS Plans
    plan_basic_id = str(uuid.uuid4())
    plan_pro_id = str(uuid.uuid4())
    plan_enterprise_id = str(uuid.uuid4())

    plans = [
        {
            "id": plan_basic_id, "name": "basic", "name_ar": "أساسي",
            "description": "Basic plan", "description_ar": "الخطة الأساسية",
            "monthly_price": 2000.0, "yearly_price": 20000.0, "six_month_price": 10000.0,
            "features": {"pos": True, "inventory": True},
            "is_active": True, "sort_order": 1, "is_popular": False,
            "badge": "", "badge_ar": "", "created_at": now,
        },
        {
            "id": plan_pro_id, "name": "professional", "name_ar": "احترافي",
            "description": "Professional plan", "description_ar": "الخطة الاحترافية",
            "monthly_price": 5000.0, "yearly_price": 50000.0, "six_month_price": 25000.0,
            "features": {"pos": True, "inventory": True, "reports": True, "ai": True, "whatsapp": True, "tax": True, "multi_currency": True},
            "is_active": True, "sort_order": 2, "is_popular": True,
            "badge": "الأكثر شعبية", "badge_ar": "الأكثر شعبية", "created_at": now,
        },
        {
            "id": plan_enterprise_id, "name": "enterprise", "name_ar": "مؤسسة",
            "description": "Enterprise plan", "description_ar": "خطة المؤسسات",
            "monthly_price": 15000.0, "yearly_price": 150000.0, "six_month_price": 75000.0,
            "features": {"pos": True, "inventory": True, "reports": True, "ai": True, "whatsapp": True, "tax": True, "multi_currency": True, "api_access": True, "white_label": True},
            "is_active": True, "sort_order": 3, "is_popular": False,
            "badge": "", "badge_ar": "", "created_at": now,
        },
    ]
    await main_db.saas_plans.insert_many(plans)
    print("   ✅ 3 SaaS Plans created (أساسي، احترافي، مؤسسة)")

    # Default Tenant
    tenant_id = str(uuid.uuid4())
    await main_db.saas_tenants.insert_one({
        "id": tenant_id,
        "name": "NCR Commercial",
        "email": "ncr@ntcommerce.com",
        "phone": "+213555000000",
        "password": hash_password("Test@123"),
        "company_name": "NCR Commercial",
        "plan_id": plan_pro_id,
        "plan_name": "احترافي",
        "agent_id": None,
        "agent_name": "",
        "is_active": True,
        "is_trial": False,
        "trial_ends_at": None,
        "subscription_type": "monthly",
        "subscription_starts_at": now,
        "subscription_ends_at": "2027-12-31T23:59:59Z",
        "features_override": {},
        "limits_override": {},
        "notes": "",
        "stats": {"products": 0, "users": 0, "sales": 0},
        "business_type": "retailer",
        "database_initialized": True,
        "created_at": now,
    })
    print(f"   ✅ Tenant: NCR Commercial (ID: {tenant_id})")

    # ============ STEP 3: INITIALIZE TENANT DB ============
    print("\n📦 Creating tenant database...")
    tid = tenant_id.replace("-", "_")
    tenant_db = client[f"tenant_{tid}"]

    # Tenant Admin User
    tenant_admin_id = str(uuid.uuid4())
    await tenant_db.users.insert_one({
        "id": tenant_admin_id,
        "name": "مدير NCR",
        "email": "ncr@ntcommerce.com",
        "hashed_password": hash_password("Test@123"),
        "role": "admin",
        "tenant_id": tenant_id,
        "is_active": True,
        "permissions": {},
        "created_at": now,
        "updated_at": now,
    })
    print("   ✅ Tenant Admin: ncr@ntcommerce.com / Test@123")

    # Settings
    await tenant_db.settings.insert_one({
        "id": "general",
        "low_stock_threshold": 10,
        "debt_reminder_days": 30,
        "currency": "دج",
        "language": "ar",
    })

    # Default Customer Family
    cf_id = "default-customer-family"
    await tenant_db.customer_families.insert_one({
        "id": cf_id, "name": "عائلة زبائن متنوعة", "name_fr": "Famille clients divers",
        "description": "عائلة افتراضية للزبائن", "discount": 0,
        "created_at": now, "updated_at": now,
    })

    # Default Customer
    await tenant_db.customers.insert_one({
        "id": "default-customer", "name": "زبون متنوع", "name_fr": "Client divers",
        "phone": "", "email": "", "address": "",
        "family_id": cf_id, "family_name": "عائلة زبائن متنوعة",
        "balance": 0, "total_purchases": 0, "code": "C001",
        "notes": "زبون افتراضي للمبيعات العامة",
        "created_at": now, "updated_at": now,
    })

    # Default Supplier Family
    sf_id = "default-supplier-family"
    await tenant_db.supplier_families.insert_one({
        "id": sf_id, "name": "عائلة مورد متنوع", "name_fr": "Famille fournisseurs divers",
        "description": "عائلة افتراضية للموردين",
        "created_at": now, "updated_at": now,
    })

    # Default Supplier
    await tenant_db.suppliers.insert_one({
        "id": "default-supplier", "name": "مورد متنوع", "name_fr": "Fournisseur divers",
        "phone": "", "email": "", "address": "",
        "family_id": sf_id, "family_name": "عائلة مورد متنوع",
        "balance": 0, "total_purchases": 0, "code": "S001",
        "notes": "مورد افتراضي للمشتريات العامة",
        "created_at": now, "updated_at": now,
    })

    # Default Product Family
    pf_id = "default-product-family"
    await tenant_db.product_families.insert_one({
        "id": pf_id, "name": "عائلة منتج متنوع",
        "name_ar": "عائلة منتج متنوع", "name_en": "Various Products",
        "name_fr": "Famille produits divers",
        "description": "عائلة افتراضية للمنتجات",
        "parent_id": "", "parent_name": "", "image": "",
        "created_at": now, "updated_at": now,
    })

    # Default Cash Box
    await tenant_db.cash_boxes.insert_one({
        "id": str(uuid.uuid4()), "name": "الصندوق الرئيسي", "name_fr": "Caisse principale",
        "balance": 0, "is_default": True, "is_active": True,
        "created_at": now, "updated_at": now,
    })

    # Roles with permissions
    roles = [
        {"id": str(uuid.uuid4()), "name": "admin", "name_ar": "مدير",
         "permissions": ["*"], "is_system": True, "created_at": now},
        {"id": str(uuid.uuid4()), "name": "cashier", "name_ar": "كاشير",
         "permissions": ["pos.view", "pos.create", "sales.view", "sales.create", "customers.view"],
         "is_system": True, "created_at": now},
        {"id": str(uuid.uuid4()), "name": "warehouse", "name_ar": "مسؤول المخزن",
         "permissions": ["products.view", "products.edit", "inventory.view", "inventory.edit", "purchases.view", "purchases.edit"],
         "is_system": True, "created_at": now},
    ]
    await tenant_db.roles.insert_many(roles)

    print("   ✅ Default data created (families, customers, suppliers, cash box, roles)")

    # ============ STEP 4: CREATE INDEXES ============
    print("\n📇 Creating indexes...")
    for coll, fields in [
        ("users", ["id", "email"]),
        ("products", ["id", "barcode", "article_code", "family_id"]),
        ("customers", ["id", "phone"]),
        ("suppliers", ["id"]),
        ("sales", ["id", "created_at", "customer_id"]),
        ("purchases", ["id", "created_at"]),
        ("transactions", ["created_at", "cash_box_id"]),
        ("cash_boxes", ["id"]),
        ("debts", ["id"]),
        ("expenses", ["id"]),
        ("repair_tickets", ["id"]),
    ]:
        for field in fields:
            try:
                await tenant_db[coll].create_index(field)
            except Exception:
                pass

    # Main DB indexes
    await main_db.users.create_index("email", unique=True)
    await main_db.saas_tenants.create_index("id", unique=True)
    await main_db.saas_plans.create_index("id", unique=True)

    print("   ✅ Indexes created")

    # ============ DONE ============
    print("\n" + "=" * 50)
    print("✅ قاعدة البيانات جاهزة!")
    print("=" * 50)
    print(f"\n🔑 بيانات الدخول:")
    print(f"   سوبر أدمين: admin@ntcommerce.com / Admin@2024")
    print(f"   مدير المستأجر: ncr@ntcommerce.com / Test@123")
    print(f"\n📊 قاعدة البيانات: {DB_NAME}")
    print(f"   قاعدة المستأجر: tenant_{tid}")

    client.close()


if __name__ == "__main__":
    asyncio.run(reset_database())
