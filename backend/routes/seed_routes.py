from fastapi import APIRouter
from motor.motor_asyncio import AsyncIOMotorClient
import os, datetime, uuid

router = APIRouter(tags=['Seed'])

seed_products = [
    {"id": str(uuid.uuid4()), "name": "iPhone 15 Pro", "sku": "IP15P-128", "price": 180000, "stock": 45, "family": "Electronics", "description": "Latest iPhone with Pro features"},
    {"id": str(uuid.uuid4()), "name": "Samsung S24 Ultra", "sku": "SAM-S24-256", "price": 160000, "stock": 32, "family": "Electronics", "description": "Premium Android smartphone"},
    {"id": str(uuid.uuid4()), "name": "Nike Air Max", "sku": "NIKE-AM-42", "price": 12000, "stock": 120, "family": "Shoes", "description": "Comfortable running shoes"},
    {"id": str(uuid.uuid4()), "name": "Adidas Ultraboost", "sku": "ADID-UB-43", "price": 15000, "stock": 85, "family": "Shoes", "description": "High performance running shoes"},
    {"id": str(uuid.uuid4()), "name": "MacBook Pro M3", "sku": "MBP-M3-512", "price": 280000, "stock": 18, "family": "Electronics", "description": "Professional laptop"},
    {"id": str(uuid.uuid4()), "name": "Sony WH-1000XM5", "sku": "SONY-XM5", "price": 45000, "stock": 55, "family": "Audio", "description": "Noise cancelling headphones"},
    {"id": str(uuid.uuid4()), "name": "iPad Pro 12.9", "sku": "IPAD-PRO-256", "price": 190000, "stock": 22, "family": "Electronics", "description": "Professional tablet"},
    {"id": str(uuid.uuid4()), "name": "AirPods Pro 2", "sku": "APP-PRO2", "price": 32000, "stock": 90, "family": "Audio", "description": "Wireless earbuds"},
    {"id": str(uuid.uuid4()), "name": "Dell XPS 15", "sku": "DELL-XPS15", "price": 210000, "stock": 12, "family": "Electronics", "description": "Premium Windows laptop"},
    {"id": str(uuid.uuid4()), "name": "Logitech MX Master 3", "sku": "LOG-MXM3", "price": 12000, "stock": 150, "family": "Accessories", "description": "Ergonomic mouse"},
]

seed_customers = [
    {"id": str(uuid.uuid4()), "name": "Ahmed Benali", "email": "ahmed@email.com", "phone": "+213555123456", "orders_count": 12, "total_spent": 145000, "segment": "VIP", "status": "active"},
    {"id": str(uuid.uuid4()), "name": "Sara Kacem", "email": "sara@email.com", "phone": "+213555789012", "orders_count": 8, "total_spent": 98000, "segment": "Regular", "status": "active"},
    {"id": str(uuid.uuid4()), "name": "Karim Mansour", "email": "karim@email.com", "phone": "+213555345678", "orders_count": 25, "total_spent": 320000, "segment": "VIP", "status": "active"},
    {"id": str(uuid.uuid4()), "name": "Yasmine Hadj", "email": "yasmine@email.com", "phone": "+213555901234", "orders_count": 5, "total_spent": 45000, "segment": "New", "status": "active"},
    {"id": str(uuid.uuid4()), "name": "Omar Ferhat", "email": "omar@email.com", "phone": "+213555567890", "orders_count": 15, "total_spent": 178000, "segment": "Regular", "status": "active"},
    {"id": str(uuid.uuid4()), "name": "Lina Boudiaf", "email": "lina@email.com", "phone": "+213555112233", "orders_count": 3, "total_spent": 28000, "segment": "New", "status": "active"},
    {"id": str(uuid.uuid4()), "name": "Nadir Belkacem", "email": "nadir@email.com", "phone": "+213555445566", "orders_count": 30, "total_spent": 420000, "segment": "VIP", "status": "active"},
    {"id": str(uuid.uuid4()), "name": "Rania Merabet", "email": "rania@email.com", "phone": "+213555778899", "orders_count": 9, "total_spent": 112000, "segment": "Regular", "status": "active"},
]

seed_orders = [
    {"id": str(uuid.uuid4()), "order_number": "ORD-001", "customer_name": "Ahmed Benali", "total_amount": 12500, "status": "completed", "channel": "online", "items": [{"product_name": "Nike Air Max", "quantity": 1, "price": 12000}]},
    {"id": str(uuid.uuid4()), "order_number": "ORD-002", "customer_name": "Sara Kacem", "total_amount": 8900, "status": "pending", "channel": "whatsapp", "items": [{"product_name": "Adidas Ultraboost", "quantity": 1, "price": 15000}]},
    {"id": str(uuid.uuid4()), "order_number": "ORD-003", "customer_name": "Karim Mansour", "total_amount": 23400, "status": "processing", "channel": "facebook", "items": [{"product_name": "Sony WH-1000XM5", "quantity": 1, "price": 45000}]},
    {"id": str(uuid.uuid4()), "order_number": "ORD-004", "customer_name": "Yasmine Hadj", "total_amount": 45000, "status": "completed", "channel": "online", "items": [{"product_name": "Sony WH-1000XM5", "quantity": 1, "price": 45000}]},
    {"id": str(uuid.uuid4()), "order_number": "ORD-005", "customer_name": "Omar Ferhat", "total_amount": 180000, "status": "delivered", "channel": "online", "items": [{"product_name": "iPhone 15 Pro", "quantity": 1, "price": 180000}]},
    {"id": str(uuid.uuid4()), "order_number": "ORD-006", "customer_name": "Lina Boudiaf", "total_amount": 32000, "status": "completed", "channel": "whatsapp", "items": [{"product_name": "AirPods Pro 2", "quantity": 1, "price": 32000}]},
    {"id": str(uuid.uuid4()), "order_number": "ORD-007", "customer_name": "Nadir Belkacem", "total_amount": 280000, "status": "processing", "channel": "online", "items": [{"product_name": "MacBook Pro M3", "quantity": 1, "price": 280000}]},
    {"id": str(uuid.uuid4()), "order_number": "ORD-008", "customer_name": "Rania Merabet", "total_amount": 12000, "status": "pending", "channel": "facebook", "items": [{"product_name": "Logitech MX Master 3", "quantity": 1, "price": 12000}]},
    {"id": str(uuid.uuid4()), "order_number": "ORD-009", "customer_name": "Ahmed Benali", "total_amount": 160000, "status": "completed", "channel": "online", "items": [{"product_name": "Samsung S24 Ultra", "quantity": 1, "price": 160000}]},
    {"id": str(uuid.uuid4()), "order_number": "ORD-010", "customer_name": "Karim Mansour", "total_amount": 190000, "status": "delivered", "channel": "online", "items": [{"product_name": "iPad Pro 12.9", "quantity": 1, "price": 190000}]},
]

@router.post('/seed')
async def seed_database():
    mongo_url = os.getenv('MONGO_URL', 'mongodb://mongodb:27017/ntcommerce')
    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
    database = client.get_default_database()
    results = {}
    now = datetime.datetime.utcnow().isoformat()
    
    try:
        products_col = database.get_collection('products')
        await products_col.delete_many({})
        for p in seed_products:
            p['created_at'] = now
            p['updated_at'] = now
        res = await products_col.insert_many(seed_products)
        results['products'] = len(res.inserted_ids)
    except Exception as e:
        results['products_error'] = str(e)
    
    try:
        customers_col = database.get_collection('customers')
        await customers_col.delete_many({})
        for c in seed_customers:
            c['created_at'] = now
            c['updated_at'] = now
        res = await customers_col.insert_many(seed_customers)
        results['customers'] = len(res.inserted_ids)
    except Exception as e:
        results['customers_error'] = str(e)
    
    try:
        orders_col = database.get_collection('orders')
        await orders_col.delete_many({})
        for o in seed_orders:
            o['created_at'] = now
            o['updated_at'] = now
        res = await orders_col.insert_many(seed_orders)
        results['orders'] = len(res.inserted_ids)
    except Exception as e:
        results['orders_error'] = str(e)
    
    client.close()
    return {"status": "seeded", "results": results}
