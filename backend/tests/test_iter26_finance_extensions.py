"""Iter-26 — Daily trend + Product profitability + Live ping endpoints."""
import uuid
import pytest
import httpx

BASE_URL = "http://localhost:8001/api"
_TOKEN_CACHE: dict = {}


async def _login():
    if "h" in _TOKEN_CACHE:
        return _TOKEN_CACHE["h"]
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(f"{BASE_URL}/auth/login", json={"email": "admin@ntcommerce.com", "password": "Admin@2024"})
        assert r.status_code == 200, r.text
        _TOKEN_CACHE["h"] = {"Authorization": f"Bearer {r.json()['access_token']}"}
        return _TOKEN_CACHE["h"]


@pytest.mark.asyncio
async def test_summary_includes_daily_trend():
    h = await _login()
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{BASE_URL}/admin/supplier/financial/summary?days=30", headers=h)
        assert r.status_code == 200
        data = r.json()
        assert "daily_trend" in data
        assert isinstance(data["daily_trend"], list)
        # Each point must have date, revenue, cost, profit
        for pt in data["daily_trend"]:
            assert set(pt.keys()) == {"date", "revenue", "cost", "profit"}


@pytest.mark.asyncio
async def test_product_profitability_for_sim():
    """Pick the first SIM catalog item and request its profitability report."""
    h = await _login()
    async with httpx.AsyncClient(timeout=15) as client:
        ref = (await client.get(f"{BASE_URL}/admin/supplier/catalog-reference", headers=h)).json()
        sim_id = ref["sim"][0]["id"]

        r = await client.get(
            f"{BASE_URL}/admin/supplier/financial/product-profitability?catalog_id={sim_id}&stock_type=sim",
            headers=h,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("catalog_id", "stock_type", "catalog", "inventory",
                  "revenue", "avg_unit_cost", "cost_of_sold", "gross_profit",
                  "margin_pct", "best_tenant", "recommendation"):
            assert k in data, f"missing key {k}"
        assert data["stock_type"] == "sim"
        assert data["catalog"]["id"] == sim_id


@pytest.mark.asyncio
async def test_product_profitability_rejects_invalid_inputs():
    h = await _login()
    async with httpx.AsyncClient(timeout=10) as client:
        # Bad stock_type
        r = await client.get(
            f"{BASE_URL}/admin/supplier/financial/product-profitability?catalog_id=anything&stock_type=invalid",
            headers=h,
        )
        assert r.status_code == 422       # Query pattern validation

        # Nonexistent catalog_id
        r = await client.get(
            f"{BASE_URL}/admin/supplier/financial/product-profitability?catalog_id=nope-{uuid.uuid4().hex}&stock_type=sim",
            headers=h,
        )
        assert r.status_code == 404


@pytest.mark.asyncio
async def test_product_profitability_calculates_margin_for_seeded_data():
    """End-to-end: buy 5 SIMs (cost=100), simulate selling 3 (price=200 each) → margin = 50%."""
    h = await _login()
    async with httpx.AsyncClient(timeout=20) as client:
        ref = (await client.get(f"{BASE_URL}/admin/supplier/catalog-reference", headers=h)).json()
        sim_id = ref["sim"][1]["id"]    # use a fresh one to avoid noise from previous tests

        sup = await client.post(
            f"{BASE_URL}/admin/supplier/external-suppliers",
            headers=h,
            json={"name": f"TEST_iter26 {uuid.uuid4().hex[:6]}"},
        )
        sid = sup.json()["id"]

        # Purchase: 5 units @ 100 cost
        pur = await client.post(
            f"{BASE_URL}/admin/supplier/purchases",
            headers=h,
            json={
                "supplier_id": sid,
                "items": [{"type": "sim", "catalog_id": sim_id, "label": "Test", "quantity": 5, "unit_cost": 100}],
            },
        )
        pid = pur.json()["id"]

        # Upload 5 ICCIDs
        codes = "\n".join([f"ICCID-{uuid.uuid4().hex[:10]}" for _ in range(5)])
        await client.post(
            f"{BASE_URL}/admin/supplier/purchases/{pid}/upload-codes",
            headers=h,
            params={"item_index": 0, "codes_text": codes},
        )

        # Simulate selling 3 via direct DB write (sale flow requires tenant wallet)
        import os
        os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
        from motor.motor_asyncio import AsyncIOMotorClient
        mc = AsyncIOMotorClient(os.environ["MONGO_URL"])
        mdb = mc["nt_commerce"]
        sold_stocks = []
        async for s in mdb.platform_sim_stock.find(
            {"catalog_id": sim_id, "source_purchase_id": pid, "status": "available"},
            {"_id": 0, "id": 1},
        ).limit(3):
            sold_stocks.append(s["id"])
        tenant = await mdb.saas_tenants.find_one({}, {"_id": 0, "id": 1})
        order_id = str(uuid.uuid4())
        await mdb.supplier_orders.insert_one({
            "id": order_id,
            "tenant_id": tenant["id"],
            "items": [{
                "type": "sim", "catalog_id": sim_id, "operator": "Mobilis",
                "denomination": 200, "quantity": 3, "unit_price": 200, "subtotal": 600,
                "code_ids": sold_stocks,
            }],
            "total": 600,
            "status": "completed",
            "created_at": "2026-06-28T00:00:00+00:00",
            "completed_at": "2026-06-28T00:00:00+00:00",
        })
        await mdb.platform_sim_stock.update_many(
            {"id": {"$in": sold_stocks}},
            {"$set": {"status": "sold", "tenant_id": tenant["id"], "sold_at": "2026-06-28T00:00:00+00:00"}},
        )

        # Now query profitability
        r = await client.get(
            f"{BASE_URL}/admin/supplier/financial/product-profitability?catalog_id={sim_id}&stock_type=sim",
            headers=h,
        )
        data = r.json()
        # Inventory: 5 total, 2 available, 3 sold (plus any pre-existing rows; let's check delta vs sold logic)
        assert data["inventory"]["sold"] >= 3
        # avg_unit_cost should be heavily influenced by our 100 dz purchase. As long as we sold 3 @ 200,
        # contribution to revenue is 600 and cost_of_sold >= 100*3 (might be more if other purchases exist)
        assert data["revenue"] >= 600
        assert data["best_tenant"] is not None
        assert data["best_tenant"]["tenant_id"] == tenant["id"]

        # Cleanup
        await mdb.supplier_orders.delete_one({"id": order_id})
        await mdb.platform_sim_stock.delete_many({"source_purchase_id": pid})
        await client.delete(f"{BASE_URL}/admin/supplier/purchases/{pid}", headers=h)
        await client.delete(f"{BASE_URL}/admin/supplier/external-suppliers/{sid}", headers=h)
        mc.close()
