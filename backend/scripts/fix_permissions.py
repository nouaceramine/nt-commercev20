import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / '.env')

async def fix() -> dict:
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]
    # Fix main users
    result = await db.users.update_many(
        {"permissions": {"$type": "array"}},
        {"$set": {"permissions": {}}}
    )
    print(f"Main users fixed: {result.modified_count}")
    # Fix all tenant dbs
    all_dbs = await client.list_database_names()
    for dbn in all_dbs:
        if dbn.startswith("tenant_"):
            tdb = client[dbn]
            r = await tdb.users.update_many(
                {"permissions": {"$type": "array"}},
                {"$set": {"permissions": {}}}
            )
            print(f"{dbn} users fixed: {r.modified_count}")
    client.close()

asyncio.run(fix())
