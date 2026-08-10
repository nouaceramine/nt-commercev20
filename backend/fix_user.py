import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os

mongo_url = os.getenv("MONGO_URL", "mongodb://mongodb:27017/ntcommerce")
client = AsyncIOMotorClient(mongo_url)
db = client.get_default_database()

async def update():
    res = await db.users.update_one(
        {"email": "demo@ntcommerce.com"}, 
        {"$set": {"role": "admin", "permissions": {
            "products": ["view", "add", "edit", "delete"],
            "orders": ["view", "add", "edit", "delete"],
            "customers": ["view", "add", "edit", "delete"],
            "analytics": ["view"],
            "settings": ["view", "edit"]
        }}}
    )
    print(f"matched {res.matched_count} modified {res.modified_count}")
    
    # Also update all users to admin
    res2 = await db.users.update_many({}, {"$set": {"role": "admin"}})
    print(f"all users updated: {res2.modified_count}")

asyncio.run(update())
