
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timedelta
import uuid

client = AsyncIOMotorClient('mongodb://mongodb:27017/')
db = client['ecommerce']

async def seed():
    # Clear existing
    await db.products.delete_many({})
    await db.orders.delete_many({})
    await db.customers.delete_many({})
    await db.suppliers.delete_many({})
    await db.promotions.delete_many({})
    await db.webhooks.delete_many({})
    await db.notifications.delete_many({})

    # Products
    products = [
        {"id": str(uuid.uuid4()), "name": "iPhone 15 Pro", "name_en": "iPhone 15 Pro", "sku": "IPH15P", "price": 180000, "stock": 25, "category": "Electronics", "status": "active", "sales": 45, "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "name": "Samsung Galaxy S24", "name_en": "Samsung Galaxy S24", "sku": "SAM-S24", "price": 160000, "stock": 30, "category": "Electronics", "status": "active", "sales": 38, "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "name": "MacBook Air M3", "name_en": "MacBook Air M3", "sku": "MBA-M3", "price": 220000, "stock": 15, "category": "Electronics", "status": "active", "sales": 22, "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "name": "Nike Air Max", "name_en": "Nike Air Max", "sku": "NK-AM", "price": 15000, "stock": 100, "category": "Fashion", "status": "active", "sales": 120, "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "name": "Sony WH-1000XM5", "name_en": "Sony WH-1000XM5", "sku": "SONY-XM5", "price": 45000, "stock": 20, "category": "Electronics", "status": "active", "sales": 18, "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "name": "Adidas Ultraboost", "name_en": "Adidas Ultraboost", "sku": "AD-UB", "price": 18000, "stock": 80, "category": "Fashion", "status": "active", "sales": 65, "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "name": "iPad Pro 12.9", "name_en": "iPad Pro 12.9", "sku": "IPD-PRO", "price": 140000, "stock": 18, "category": "Electronics", "status": "active", "sales": 15, "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "name": "Dell XPS 13", "name_en": "Dell XPS 13", "sku": "DELL-XPS", "price": 170000, "stock": 12, "category": "Electronics", "status": "active", "sales": 10, "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "name": "Puma Running Shoes", "name_en": "Puma Running Shoes", "sku": "PM-RUN", "price": 12000, "stock": 150, "category": "Fashion", "status": "active", "sales": 85, "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "name": "Canon EOS R6", "name_en": "Canon EOS R6", "sku": "CAN-R6", "price": 320000, "stock": 5, "category": "Electronics", "status": "active", "sales": 8, "created_at": datetime.utcnow()},
    ]
    await db.products.insert_many(products)

    # Customers
    customers = [
        {"id": str(uuid.uuid4()), "name": "Ahmed Benali", "email": "ahmed@email.dz", "phone": "+213 550 111 222", "segment": "VIP", "orders_count": 12, "total_spent": 450000, "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "name": "Sara Kacem", "email": "sara@email.dz", "phone": "+213 551 222 333", "segment": "Regular", "orders_count": 5, "total_spent": 85000, "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "name": "Karim Mansour", "email": "karim@email.dz", "phone": "+213 552 333 444", "segment": "Regular", "orders_count": 3, "total_spent": 42000, "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "name": "Nadia Cherif", "email": "nadia@email.dz", "phone": "+213 553 444 555", "segment": "New", "orders_count": 1, "total_spent": 15000, "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "name": "Omar Djebari", "email": "omar@email.dz", "phone": "+213 554 555 666", "segment": "VIP", "orders_count": 8, "total_spent": 280000, "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "name": "Fatima Zohra", "email": "fatima@email.dz", "phone": "+213 555 666 777", "segment": "Regular", "orders_count": 4, "total_spent": 56000, "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "name": "Youssef Hamdi", "email": "youssef@email.dz", "phone": "+213 556 777 888", "segment": "New", "orders_count": 0, "total_spent": 0, "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "name": "Amina Belkacem", "email": "amina@email.dz", "phone": "+213 557 888 999", "segment": "VIP", "orders_count": 15, "total_spent": 620000, "created_at": datetime.utcnow()},
    ]
    await db.customers.insert_many(customers)

    # Orders
    orders = [
        {"id": str(uuid.uuid4()), "order_number": "ORD-001", "customer_name": "Ahmed Benali", "customer": "Ahmed Benali", "total_amount": 225000, "amount": 225000, "status": "completed", "items": 3, "created_at": datetime.utcnow() - timedelta(days=1)},
        {"id": str(uuid.uuid4()), "order_number": "ORD-002", "customer_name": "Sara Kacem", "customer": "Sara Kacem", "total_amount": 45000, "amount": 45000, "status": "processing", "items": 1, "created_at": datetime.utcnow() - timedelta(days=2)},
        {"id": str(uuid.uuid4()), "order_number": "ORD-003", "customer_name": "Karim Mansour", "customer": "Karim Mansour", "total_amount": 18000, "amount": 18000, "status": "pending", "items": 1, "created_at": datetime.utcnow() - timedelta(days=3)},
        {"id": str(uuid.uuid4()), "order_number": "ORD-004", "customer_name": "Nadia Cherif", "customer": "Nadia Cherif", "total_amount": 15000, "amount": 15000, "status": "completed", "items": 1, "created_at": datetime.utcnow() - timedelta(days=4)},
        {"id": str(uuid.uuid4()), "order_number": "ORD-005", "customer_name": "Omar Djebari", "customer": "Omar Djebari", "total_amount": 340000, "amount": 340000, "status": "delivered", "items": 2, "created_at": datetime.utcnow() - timedelta(days=5)},
        {"id": str(uuid.uuid4()), "order_number": "ORD-006", "customer_name": "Fatima Zohra", "customer": "Fatima Zohra", "total_amount": 56000, "amount": 56000, "status": "completed", "items": 2, "created_at": datetime.utcnow() - timedelta(days=6)},
        {"id": str(uuid.uuid4()), "order_number": "ORD-007", "customer_name": "Amina Belkacem", "customer": "Amina Belkacem", "total_amount": 180000, "amount": 180000, "status": "processing", "items": 1, "created_at": datetime.utcnow() - timedelta(days=7)},
        {"id": str(uuid.uuid4()), "order_number": "ORD-008", "customer_name": "Ahmed Benali", "customer": "Ahmed Benali", "total_amount": 140000, "amount": 140000, "status": "completed", "items": 1, "created_at": datetime.utcnow() - timedelta(days=8)},
        {"id": str(uuid.uuid4()), "order_number": "ORD-009", "customer_name": "Sara Kacem", "customer": "Sara Kacem", "total_amount": 32000, "amount": 32000, "status": "pending", "items": 2, "created_at": datetime.utcnow() - timedelta(days=9)},
        {"id": str(uuid.uuid4()), "order_number": "ORD-010", "customer_name": "Omar Djebari", "customer": "Omar Djebari", "total_amount": 160000, "amount": 160000, "status": "delivered", "items": 1, "created_at": datetime.utcnow() - timedelta(days=10)},
    ]
    await db.orders.insert_many(orders)

    # Suppliers
    suppliers = [
        {"id": str(uuid.uuid4()), "name": "TechWorld Algeria", "contact": "Karim Benali", "email": "karim@techworld.dz", "phone": "+213 550 123 456", "address": "Algiers, Algeria", "status": "active", "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "name": "Fashion Express", "contact": "Sara Mansour", "email": "sara@fashionexpress.dz", "phone": "+213 551 234 567", "address": "Oran, Algeria", "status": "active", "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "name": "Global Electronics", "contact": "Ahmed Kacem", "email": "ahmed@globalelec.com", "phone": "+213 552 345 678", "address": "Constantine, Algeria", "status": "active", "created_at": datetime.utcnow()},
    ]
    await db.suppliers.insert_many(suppliers)

    # Promotions
    promotions = [
        {"id": str(uuid.uuid4()), "name": "Summer Sale", "code": "SUMMER2025", "discount_type": "percentage", "discount_value": 20, "start_date": "2025-06-01", "end_date": "2025-08-31", "status": "active", "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "name": "New Customer", "code": "WELCOME10", "discount_type": "percentage", "discount_value": 10, "start_date": "2025-01-01", "end_date": "2025-12-31", "status": "active", "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "name": "Flash Friday", "code": "FLASH50", "discount_type": "fixed", "discount_value": 500, "start_date": "2025-07-01", "end_date": "2025-07-31", "status": "expired", "created_at": datetime.utcnow()},
    ]
    await db.promotions.insert_many(promotions)

    # Webhooks
    webhooks = [
        {"id": str(uuid.uuid4()), "name": "Order Notification", "url": "https://hooks.ntcommerce.dz/order", "event": "order.created", "status": "active", "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "name": "Payment Webhook", "url": "https://hooks.ntcommerce.dz/payment", "event": "order.paid", "status": "active", "created_at": datetime.utcnow()},
    ]
    await db.webhooks.insert_many(webhooks)

    # Notifications
    notifications = [
        {"id": str(uuid.uuid4()), "title": "New Order Received", "message": "Order #ORD-001 has been placed", "type": "order", "read": False, "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "title": "Low Stock Alert", "message": "iPhone 15 Pro stock is below 10 units", "type": "alert", "read": False, "created_at": datetime.utcnow()},
        {"id": str(uuid.uuid4()), "title": "Welcome to NT Commerce", "message": "Your store is now live!", "type": "info", "read": True, "created_at": datetime.utcnow()},
    ]
    await db.notifications.insert_many(notifications)

    print("Seed completed successfully!")

    # Print counts
    for coll in ['products', 'orders', 'customers', 'suppliers', 'promotions', 'webhooks', 'notifications']:
        count = await db[coll].count_documents({})
        print(f"  {coll}: {count}")

asyncio.run(seed())
