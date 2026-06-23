"""
System Reset Script
Cleans all test data and prepares for production use
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'nt_commerce')

async def reset_system() -> dict:
    print("=" * 50)
    print("بدء إعادة تهيئة النظام...")
    print("=" * 50)
    
    # Connect to MongoDB
    client = AsyncIOMotorClient(MONGO_URL)
    main_db = client[DB_NAME]
    
    # 1. Get all tenants to delete their databases
    print("\n1. جمع معلومات المشتركين...")
    tenants = await main_db.saas_tenants.find({}, {"id": 1, "name": 1, "email": 1}).to_list(1000)
    print(f"   - عدد المشتركين للحذف: {len(tenants)}")
    
    # 2. Delete tenant databases
    print("\n2. حذف قواعد بيانات المشتركين...")
    for tenant in tenants:
        db_name = f"tenant_{tenant['id'].replace('-', '_')}"
        try:
            await client.drop_database(db_name)
            print(f"   ✓ تم حذف: {db_name} ({tenant.get('email', 'N/A')})")
        except Exception as e:
            print(f"   ✗ خطأ في حذف {db_name}: {e}")
    
    # 3. Clear saas_tenants collection
    print("\n3. حذف سجلات المشتركين...")
    result = await main_db.saas_tenants.delete_many({})
    print(f"   ✓ تم حذف {result.deleted_count} مشترك")
    
    # 4. Clear saas_agents collection
    print("\n4. حذف سجلات الوكلاء...")
    result = await main_db.saas_agents.delete_many({})
    print(f"   ✓ تم حذف {result.deleted_count} وكيل")
    
    # 5. Clear saas_payments collection
    print("\n5. حذف سجلات المدفوعات...")
    result = await main_db.saas_payments.delete_many({})
    print(f"   ✓ تم حذف {result.deleted_count} دفعة")
    
    # 6. Clear saas_agent_transactions collection
    print("\n6. حذف معاملات الوكلاء...")
    result = await main_db.saas_agent_transactions.delete_many({})
    print(f"   ✓ تم حذف {result.deleted_count} معاملة")
    
    # 7. Clear database_backups collection
    print("\n7. حذف النسخ الاحتياطية...")
    result = await main_db.database_backups.delete_many({})
    print(f"   ✓ تم حذف {result.deleted_count} نسخة احتياطية")
    
    # 8. Clear ai_chat_history collection
    print("\n8. حذف سجل محادثات AI...")
    result = await main_db.ai_chat_history.delete_many({})
    print(f"   ✓ تم حذف {result.deleted_count} محادثة")
    
    # 9. Clear system_updates collection (optional)
    print("\n9. حذف تحديثات النظام...")
    result = await main_db.system_updates.delete_many({})
    print(f"   ✓ تم حذف {result.deleted_count} تحديث")
    
    # 10. Keep saas_plans - just show them
    print("\n10. الخطط المحفوظة:")
    plans = await main_db.saas_plans.find({}, {"_id": 0, "name_ar": 1, "monthly_price": 1}).to_list(100)
    for plan in plans:
        print(f"    - {plan.get('name_ar', 'N/A')}: {plan.get('monthly_price', 0)} دج/شهر")
    
    # 11. Keep super admin - show info
    print("\n11. حساب المدير الأعلى:")
    admin = await main_db.users.find_one({"role": "super_admin"}, {"_id": 0, "email": 1, "name": 1})
    if admin:
        print(f"    - البريد: {admin.get('email')}")
        print(f"    - الاسم: {admin.get('name', 'N/A')}")
    
    # Final stats
    print("\n" + "=" * 50)
    print("✅ تمت إعادة تهيئة النظام بنجاح!")
    print("=" * 50)
    print("\nالنظام جاهز للاستخدام الإنتاجي:")
    print("- المشتركين: 0")
    print("- الوكلاء: 0")
    print("- المدفوعات: 0")
    print(f"- الخطط: {len(plans)}")
    print("\nيمكنك الآن:")
    print("1. تسجيل مشتركين جدد عبر /saas/register")
    print("2. إضافة مشتركين يدوياً من لوحة التحكم")
    print("3. إضافة وكلاء للمبيعات")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(reset_system())
