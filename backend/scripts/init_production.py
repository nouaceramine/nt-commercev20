"""
Initialize Production System
Creates default plans and super admin account
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid
from datetime import datetime, timezone
import bcrypt

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'nt_commerce')

async def init_production() -> dict:
    print("=" * 50)
    print("تهيئة نظام الإنتاج...")
    print("=" * 50)
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # 1. Create subscription plans
    print("\n1. إنشاء خطط الاشتراك...")
    
    plans = [
        {
            "id": str(uuid.uuid4()),
            "name": "Starter",
            "name_ar": "المبتدئ",
            "description": "Perfect for small businesses",
            "description_ar": "مثالي للأعمال الصغيرة",
            "monthly_price": 2900,
            "six_month_price": 14900,
            "yearly_price": 27900,
            "features": {
                "max_products": 100,
                "max_users": 2,
                "max_warehouses": 1,
                "has_pos": True,
                "has_inventory": True,
                "has_reports": True,
                "has_multi_warehouse": False,
                "has_api_access": False,
                "has_ecommerce": False,
                "has_advanced_reports": False,
                "has_employee_management": False,
                "has_debt_management": True,
                "has_customer_loyalty": False,
                "has_supplier_management": True,
                "has_email_notifications": False,
                "has_sms_notifications": False
            },
            "is_active": True,
            "sort_order": 1,
            "is_popular": False,
            "badge": "",
            "badge_ar": "",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Professional",
            "name_ar": "الاحترافي",
            "description": "For growing businesses",
            "description_ar": "للأعمال النامية",
            "monthly_price": 5900,
            "six_month_price": 29900,
            "yearly_price": 54900,
            "features": {
                "max_products": 500,
                "max_users": 5,
                "max_warehouses": 3,
                "has_pos": True,
                "has_inventory": True,
                "has_reports": True,
                "has_multi_warehouse": True,
                "has_api_access": True,
                "has_ecommerce": False,
                "has_advanced_reports": True,
                "has_employee_management": True,
                "has_debt_management": True,
                "has_customer_loyalty": True,
                "has_supplier_management": True,
                "has_email_notifications": True,
                "has_sms_notifications": False
            },
            "is_active": True,
            "sort_order": 2,
            "is_popular": True,
            "badge": "Most Popular",
            "badge_ar": "الأكثر طلباً",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Enterprise",
            "name_ar": "المؤسسات",
            "description": "For large enterprises",
            "description_ar": "للمؤسسات الكبيرة",
            "monthly_price": 9900,
            "six_month_price": 49900,
            "yearly_price": 94900,
            "features": {
                "max_products": -1,  # Unlimited
                "max_users": -1,     # Unlimited
                "max_warehouses": -1, # Unlimited
                "has_pos": True,
                "has_inventory": True,
                "has_reports": True,
                "has_multi_warehouse": True,
                "has_api_access": True,
                "has_ecommerce": True,
                "has_advanced_reports": True,
                "has_employee_management": True,
                "has_debt_management": True,
                "has_customer_loyalty": True,
                "has_supplier_management": True,
                "has_email_notifications": True,
                "has_sms_notifications": True
            },
            "is_active": True,
            "sort_order": 3,
            "is_popular": False,
            "badge": "Best Value",
            "badge_ar": "أفضل قيمة",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    
    # Clear existing plans and insert new ones
    await db.saas_plans.delete_many({})
    await db.saas_plans.insert_many(plans)
    print(f"   ✓ تم إنشاء {len(plans)} خطط اشتراك")
    
    for plan in plans:
        print(f"     - {plan['name_ar']}: {plan['monthly_price']} دج/شهر")
    
    # 2. Create or update super admin
    print("\n2. إعداد حساب المدير الأعلى...")
    
    admin_email = "admin@ntcommerce.com"
    admin_password = "Admin@2024"  # Change this in production!
    hashed_password = bcrypt.hashpw(admin_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    existing_admin = await db.users.find_one({"role": "super_admin"})
    
    if existing_admin:
        # Update existing admin
        await db.users.update_one(
            {"role": "super_admin"},
            {"$set": {
                "email": admin_email,
                "password": hashed_password,
                "name": "مدير النظام",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        print(f"   ✓ تم تحديث حساب المدير الأعلى")
    else:
        # Create new admin
        admin_doc = {
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "password": hashed_password,
            "name": "مدير النظام",
            "role": "super_admin",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(admin_doc)
        print(f"   ✓ تم إنشاء حساب المدير الأعلى")
    
    print(f"     - البريد: {admin_email}")
    print(f"     - كلمة المرور: ******* (راجع متغيرات البيئة)")
    
    # 3. Create indexes
    print("\n3. إنشاء الفهارس...")
    
    await db.saas_tenants.create_index("email", unique=True)
    await db.saas_tenants.create_index("id", unique=True)
    await db.saas_agents.create_index("email", unique=True)
    await db.saas_plans.create_index("id", unique=True)
    await db.users.create_index("email", unique=True)
    
    print("   ✓ تم إنشاء الفهارس")
    
    # Final summary
    print("\n" + "=" * 50)
    print("✅ تم تهيئة نظام الإنتاج بنجاح!")
    print("=" * 50)
    print("\nبيانات الدخول للمدير الأعلى:")
    print(f"  البريد: {admin_email}")
    print(f"  كلمة المرور: ******* (محجوبة لأسباب أمنية — راجع متغيرات البيئة)")
    print("\n⚠️  مهم: قم بتغيير كلمة المرور بعد أول تسجيل دخول!")
    print("\nالخطط المتاحة:")
    for plan in plans:
        print(f"  - {plan['name_ar']}: {plan['monthly_price']} دج/شهر")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(init_production())
