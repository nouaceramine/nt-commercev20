import asyncio
from config.database import main_db
async def go():
    tid = 'a24f0b7e-88ea-43c0-9f27-b5d459fe28d6'
    cols = await main_db.list_collection_names()
    arch = [c for c in cols if 'arch' in c.lower() or 'delet' in c.lower() or 'trash' in c.lower()]
    print('archive-like collections:', arch)
    print('=== searching all main_db collections for tenant id ===')
    for c in cols:
        try:
            n = await main_db[c].count_documents({'tenant_id': tid})
            if n: print(f'{c}: tenant_id matches={n}')
            n2 = await main_db[c].count_documents({'id': tid})
            if n2: print(f'{c}: id matches={n2}')
        except Exception:
            pass
    print('=== last 5 system_logs mentioning the id ===')
    cur = main_db.system_logs.find({'message': {'$regex': tid[:13]}}).sort('timestamp', -1).limit(5)
    async for l in cur:
        print(str(l.get('timestamp')), '|', str(l.get('message'))[:160])
asyncio.run(go())
