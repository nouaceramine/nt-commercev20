"""Iter-25 — Code Trace endpoint.

Tests the full lifecycle lookup: given any code from the platform stock,
the endpoint returns origin (purchase + supplier + unit_cost), current status,
and — if sold — the buying tenant + price + unit_profit.

Coverage:
  • Not-found path returns {found: false} without error
  • Just-uploaded code is found with origin populated and no sale yet
  • A code marked as sold links back to the supplier_order item & tenant
  • Unit profit calculated correctly when both cost and sold price are known
"""
import uuid
import pytest
import httpx

BASE_URL = "http://localhost:8001/api"
_TOKEN_CACHE: dict = {}


async def _login():
    """Cache the super-admin token across tests to avoid hitting the brute-force throttle."""
    if "h" in _TOKEN_CACHE:
        return _TOKEN_CACHE["h"]
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(f"{BASE_URL}/auth/login", json={"email": "admin@ntcommerce.com", "password": "Admin@2024"})
        assert r.status_code == 200, r.text
        _TOKEN_CACHE["h"] = {"Authorization": f"Bearer {r.json()['access_token']}"}
        return _TOKEN_CACHE["h"]


@pytest.mark.asyncio
async def test_trace_not_found():
    h = await _login()
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{BASE_URL}/admin/supplier/trace?code=NOPE-{uuid.uuid4().hex[:8]}", headers=h)
        assert r.status_code == 200
        assert r.json()["found"] is False


@pytest.mark.asyncio
async def test_trace_finds_uploaded_code_with_origin():
    """Upload a code via purchase → trace finds it + origin + 'available' status."""
    h = await _login()
    async with httpx.AsyncClient(timeout=20) as client:
        # Setup: supplier + purchase linked to a SIM catalog entry
        ref = (await client.get(f"{BASE_URL}/admin/supplier/catalog-reference", headers=h)).json()
        sim_id = ref["sim"][0]["id"]

        sup = await client.post(
            f"{BASE_URL}/admin/supplier/external-suppliers",
            headers=h,
            json={"name": f"TEST_iter25 {uuid.uuid4().hex[:6]}"},
        )
        sid = sup.json()["id"]

        pur = await client.post(
            f"{BASE_URL}/admin/supplier/purchases",
            headers=h,
            json={
                "supplier_id": sid,
                "items": [{"type": "sim", "catalog_id": sim_id, "label": "Test", "quantity": 2, "unit_cost": 120}],
                "paid_amount": 240,
            },
        )
        pid = pur.json()["id"]

        # Upload 1 ICCID
        iccid = f"ICCID-{uuid.uuid4().hex[:12]}"
        await client.post(
            f"{BASE_URL}/admin/supplier/purchases/{pid}/upload-codes",
            headers=h,
            params={"item_index": 0, "codes_text": iccid},
        )

        # Trace it
        r = await client.get(f"{BASE_URL}/admin/supplier/trace?code={iccid}", headers=h)
        assert r.status_code == 200
        data = r.json()
        assert data["found"] is True
        assert data["stock_type"] == "sim"
        assert data["code"] == iccid
        assert data["status"] == "available"
        assert data["origin"] is not None
        assert data["origin"]["supplier_id"] == sid
        assert data["origin"]["unit_cost"] == 120.0
        assert data["origin"]["purchase_id"] == pid
        assert data["sale"] is None     # not sold yet
        assert data["unit_profit"] is None

        # Cleanup
        await client.delete(f"{BASE_URL}/admin/supplier/purchases/{pid}", headers=h)
        await client.delete(f"{BASE_URL}/admin/supplier/external-suppliers/{sid}", headers=h)


@pytest.mark.asyncio
async def test_trace_returns_sale_and_profit_when_sold():
    """Mark a stock code as sold (simulated, since real sale flow needs a tenant wallet
    with balance and is heavier). We directly emulate the supplier_order's outcome
    by patching the DB to mimic what the supplier_orders.create flow does."""
    h = await _login()
    async with httpx.AsyncClient(timeout=20) as client:
        # Setup — same as previous test
        ref = (await client.get(f"{BASE_URL}/admin/supplier/catalog-reference", headers=h)).json()
        sim_id = ref["sim"][0]["id"]

        sup = await client.post(f"{BASE_URL}/admin/supplier/external-suppliers", headers=h, json={"name": f"TEST_iter25_sold {uuid.uuid4().hex[:6]}"})
        sid = sup.json()["id"]

        pur = await client.post(
            f"{BASE_URL}/admin/supplier/purchases",
            headers=h,
            json={
                "supplier_id": sid,
                "items": [{"type": "sim", "catalog_id": sim_id, "label": "Test", "quantity": 1, "unit_cost": 100}],
            },
        )
        pid = pur.json()["id"]

        iccid = f"ICCID-{uuid.uuid4().hex[:12]}"
        await client.post(
            f"{BASE_URL}/admin/supplier/purchases/{pid}/upload-codes",
            headers=h,
            params={"item_index": 0, "codes_text": iccid},
        )

        # Patch the stock row to 'sold' and add a matching supplier_order doc directly
        # (no public API exposes raw stock updates — we go through Mongo to test the trace logic in isolation).
        import os
        os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
        from motor.motor_asyncio import AsyncIOMotorClient
        mc = AsyncIOMotorClient(os.environ["MONGO_URL"])
        mdb = mc["nt_commerce"]
        stock_doc = await mdb.platform_sim_stock.find_one({"code": iccid}, {"_id": 0})
        assert stock_doc, "uploaded ICCID should be in stock"

        # Get any real tenant id
        tenant = await mdb.saas_tenants.find_one({}, {"_id": 0, "id": 1, "name": 1})
        tenant_id = tenant["id"]
        order_id = str(uuid.uuid4())
        await mdb.supplier_orders.insert_one({
            "id": order_id,
            "tenant_id": tenant_id,
            "items": [{
                "type": "sim",
                "catalog_id": sim_id,
                "operator": "Mobilis",
                "denomination": 200,
                "quantity": 1,
                "unit_price": 250,
                "subtotal": 250,
                "code_ids": [stock_doc["id"]],
            }],
            "total": 250,
            "status": "completed",
            "created_at": "2026-06-27T00:00:00+00:00",
            "completed_at": "2026-06-27T00:00:00+00:00",
        })
        await mdb.platform_sim_stock.update_one(
            {"id": stock_doc["id"]},
            {"$set": {"status": "sold", "tenant_id": tenant_id, "sold_at": "2026-06-27T00:00:00+00:00"}},
        )

        # Trace
        r = await client.get(f"{BASE_URL}/admin/supplier/trace?code={iccid}", headers=h)
        data = r.json()
        assert data["found"] is True
        assert data["status"] == "sold"
        assert data["sale"] is not None
        assert data["sale"]["tenant_id"] == tenant_id
        assert data["sale"]["sold_unit_price"] == 250
        assert data["unit_profit"] == 150.0      # 250 sold - 100 cost

        # Cleanup
        await mdb.supplier_orders.delete_one({"id": order_id})
        await mdb.platform_sim_stock.delete_one({"id": stock_doc["id"]})
        await client.delete(f"{BASE_URL}/admin/supplier/purchases/{pid}", headers=h)
        await client.delete(f"{BASE_URL}/admin/supplier/external-suppliers/{sid}", headers=h)
        mc.close()


@pytest.mark.asyncio
async def test_trace_rejects_empty_code():
    h = await _login()
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"{BASE_URL}/admin/supplier/trace?code=  ", headers=h)
        # FastAPI Query(min_length=2) rejects with 422, OR our handler rejects with 400
        assert r.status_code in (400, 422)
