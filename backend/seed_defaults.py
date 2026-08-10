"""Seed Default Data - Creates default records for all entities
Run this once when setting up a new tenant or database
"""
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)

DEFAULT_CUSTOMER = {
    "id": "default-customer-001",
    "name": "زبون نقدي",
    "name_fr": "Client comptant",
    "phone": "0000000000",
    "email": "default@ntcommerce.local",
    "type": "walk-in",
    "is_default": True,
    "family_id": "default-customer-family-001",
    "created_at": datetime.now(timezone.utc).isoformat(),
    "balance": 0,
    "total_purchases": 0
}

DEFAULT_CUSTOMER_FAMILY = {
    "id": "default-customer-family-001",
    "name": "زبائن عامة",
    "name_fr": "Clients généraux",
    "is_default": True,
    "created_at": datetime.now(timezone.utc).isoformat()
}

DEFAULT_PRODUCT = {
    "id": "default-product-001",
    "name": "منتج افتراضي",
    "name_fr": "Produit par défaut",
    "name_ar": "منتج افتراضي",
    "name_en": "Default Product",
    "purchase_price": 0,
    "selling_price": 0,
    "wholesale_price": 0,
    "retail_price": 0,
    "quantity": 0,
    "min_quantity": 0,
    "barcode": "DEFAULT001",
    "article_code": "DEF-001",
    "is_default": True,
    "family_id": "default-product-family-001",
    "created_at": datetime.now(timezone.utc).isoformat(),
    "updated_at": datetime.now(timezone.utc).isoformat()
}

DEFAULT_PRODUCT_FAMILY = {
    "id": "default-product-family-001",
    "name": "منتجات عامة",
    "name_fr": "Produits généraux",
    "name_ar": "منتجات عامة",
    "name_en": "General Products",
    "is_default": True,
    "created_at": datetime.now(timezone.utc).isoformat()
}

DEFAULT_SUPPLIER = {
    "id": "default-supplier-001",
    "name": "مورد افتراضي",
    "name_fr": "Fournisseur par défaut",
    "phone": "0000000000",
    "email": "default@supplier.local",
    "address": "",
    "is_default": True,
    "family_id": "default-supplier-family-001",
    "total_purchases": 0,
    "balance": 0,
    "created_at": datetime.now(timezone.utc).isoformat()
}

DEFAULT_SUPPLIER_FAMILY = {
    "id": "default-supplier-family-001",
    "name": "موردين عامة",
    "name_fr": "Fournisseurs généraux",
    "is_default": True,
    "created_at": datetime.now(timezone.utc).isoformat()
}

DEFAULT_EMPLOYEE = {
    "id": "default-employee-001",
    "name": "موظف افتراضي",
    "name_fr": "Employé par défaut",
    "phone": "0000000000",
    "email": "default@employee.local",
    "role": "seller",
    "is_default": True,
    "active": True,
    "created_at": datetime.now(timezone.utc).isoformat()
}

DEFAULT_WAREHOUSE = {
    "id": "default-warehouse-001",
    "name": "المستودع الرئيسي",
    "name_fr": "Entrepôt principal",
    "location": "الجزائر العاصمة",
    "is_default": True,
    "created_at": datetime.now(timezone.utc).isoformat()
}


async def seed_default_data(db, tenant_id=None):
    """Seed default data for a tenant. Call this when creating a new tenant."""
    try:
        # Add tenant_id to all records if provided
        records = {
            "customers": DEFAULT_CUSTOMER,
            "customer_families": DEFAULT_CUSTOMER_FAMILY,
            "products": DEFAULT_PRODUCT,
            "product_families": DEFAULT_PRODUCT_FAMILY,
            "suppliers": DEFAULT_SUPPLIER,
            "supplier_families": DEFAULT_SUPPLIER_FAMILY,
            "employees": DEFAULT_EMPLOYEE,
            "warehouses": DEFAULT_WAREHOUSE
        }

        created_count = 0
        for collection_name, default_record in records.items():
            try:
                # Check if default already exists
                collection = db[collection_name]
                existing = await collection.find_one({"is_default": True})

                if not existing:
                    record = default_record.copy()
                    if tenant_id:
                        record["tenant_id"] = tenant_id
                    await collection.insert_one(record)
                    created_count += 1
                    logger.info(f"Created default {collection_name}")
            except Exception as e:
                logger.warning(f"Could not seed {collection_name}: {e}")

        logger.info(f"Seeded {created_count} default records")
        return created_count

    except Exception as e:
        logger.error(f"Seed error: {e}")
        return 0


WHATSAPP_TEMPLATES = [
    {"id": "tpl-order-confirmation", "name": "order_confirmation",
     "content": "مرحباً {customer_name}، تم استلام طلبك رقم {order_id} بقيمة {amount} دج. سنتواصل معك للتأكيد.",
     "variables": ["customer_name", "order_id", "amount"], "is_default": True},
    {"id": "tpl-repair-ready", "name": "repair_ready",
     "content": "جهازك جاهز للاستلام. رقم التذكرة: {ticket_id}",
     "variables": ["ticket_id"], "is_default": True},
    {"id": "tpl-debt-reminder", "name": "debt_reminder",
     "content": "تذكير ودي: {customer_name}، لديك مبلغ مستحق {amount} دج. شكراً لتسديده.",
     "variables": ["customer_name", "amount"], "is_default": True},
    {"id": "tpl-shipping-tracking", "name": "shipping_tracking",
     "content": "تم شحن طلبك {order_id}. رقم التتبع: {tracking_number}",
     "variables": ["order_id", "tracking_number"], "is_default": True},
    {"id": "tpl-marketing-offer", "name": "marketing_offer",
     "content": "عرض خاص لك {customer_name}! تفضل بزيارة متجرنا للاستفادة.",
     "variables": ["customer_name"], "is_default": True},
]


async def seed_whatsapp_templates(db):
    # Seed default WhatsApp message templates
    try:
        count = 0
        for tpl in WHATSAPP_TEMPLATES:
            if not await db.whatsapp_templates.find_one({"name": tpl["name"]}):
                doc = dict(tpl)
                doc["created_at"] = datetime.now(timezone.utc).isoformat()
                await db.whatsapp_templates.insert_one(doc)
                count += 1
        return count
    except Exception as e:
        logger.warning("whatsapp templates seed: %s", e)
        return 0


async def seed_plans(main_db):
    """Seed default subscription plans"""
    plans = [
        {
            "id": str(uuid.uuid4()),
            "name": "Basic",
            "name_ar": "أساسي",
            "price": 5000,
            "period": "monthly",
            "features": ["pos", "inventory", "customers", "suppliers"],
            "max_users": 3,
            "max_products": 500,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Pro",
            "name_ar": "احترافي",
            "price": 10000,
            "period": "monthly",
            "features": ["pos", "inventory", "customers", "suppliers", "ecommerce", "shipping", "reports"],
            "max_users": 10,
            "max_products": 5000,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Enterprise",
            "name_ar": "مؤسسي",
            "price": 20000,
            "period": "monthly",
            "features": ["all"],
            "max_users": 50,
            "max_products": 50000,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]

    try:
        existing = await main_db.plans.count_documents({})
        if existing == 0:
            await main_db.plans.insert_many(plans)
            logger.info(f"Seeded {len(plans)} default plans")
            return len(plans)
    except Exception as e:
        logger.error(f"Plan seed error: {e}")
    return 0

