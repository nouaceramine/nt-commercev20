import asyncio
from config.database import main_db, client
async def go():
    tid = 'a24f0b7e-88ea-43c0-9f27-b5d459fe28d6'
    print('=== saas_tenants (all) ===')
    async for t in main_db.saas_tenants.find({}, {'id':1,'company_name':1,'tenant_code':1,'is_active':1}):
        print(t.get('tenant_code'), '|', t.get('company_name'), '|', str(t.get('id',''))[:8], '| active:', t.get('is_active'))
    print('=== identity_registry for NT-0004 ===')
    async for r in main_db.identity_registry.find({'tenant_id': tid}):
        r.pop('_id', None)
        print({k: r.get(k) for k in ('email','tenant_id','status') if k in r})
    print('=== tenant database exists? ===')
    dbs = await client.list_database_names()
    target = 'tenant_' + tid.replace('-','_')
    print(target, '->', target in dbs)
asyncio.run(go())
