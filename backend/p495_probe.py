import asyncio
from config.database import main_db
async def go():
    tid = 'a24f0b7e-88ea-43c0-9f27-b5d459fe28d6'
    t = await main_db.saas_tenants.find_one({'id': tid}, {'_id': 0, 'password': 0})
    print('by id:', bool(t))
    if not t:
        t2 = await main_db.saas_tenants.find_one({'company_name': {'$regex': 'Nouacer'}}, {'_id': 0, 'password': 0})
        if t2:
            print('by name keys:', {k: t2.get(k) for k in ('id','name','email','company_name','tenant_code','status')})
        else:
            cnt = await main_db.saas_tenants.count_documents({})
            sample = await main_db.saas_tenants.find_one({}, {'_id': 0, 'password': 0})
            print('total tenants:', cnt, '| sample keys:', list(sample.keys())[:15] if sample else None)
asyncio.run(go())
