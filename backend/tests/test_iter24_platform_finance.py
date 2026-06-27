"""Iter-24 — Platform Finance routes + deferred ICCID upload tests.

Covers:
  • External suppliers CRUD + delete-protection when purchases exist
  • Purchases create/list/delete + auto-payment row when paid_amount > 0
  • Payments → balance_due recompute
  • Financial summary aggregates (revenue / cost / profit / top tenants & suppliers)
  • Catalog-reference endpoint returns all 4 platforms (cards/sims/idoom/iptv)
  • Deferred upload of codes/ICCIDs against a saved purchase line
"""
import uuid
import pytest
import httpx

BASE_URL = "http://localhost:8001/api"
SUPER_EMAIL = "admin@ntcommerce.com"
SUPER_PASS = "Admin@2024"


async def _login():
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(f"{BASE_URL}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.mark.asyncio
async def test_external_supplier_crud_and_purchase_lifecycle():
    h = await _login()
    suffix = uuid.uuid4().hex[:6]
    async with httpx.AsyncClient(timeout=20) as client:
        # 1. CREATE supplier
        r = await client.post(
            f"{BASE_URL}/admin/supplier/external-suppliers",
            headers=h,
            json={"name": f"TEST_iter24 {suffix}", "phone": "0555", "contact_person": "Tester"},
        )
        assert r.status_code == 200, r.text
        sup = r.json()
        sid = sup["id"]
        assert sup["balance_due"] == 0.0

        # 2. CREATE a purchase: 10 Mobilis cards @ 95 + partial payment 500
        rp = await client.post(
            f"{BASE_URL}/admin/supplier/purchases",
            headers=h,
            json={
                "supplier_id": sid,
                "items": [
                    {"type": "card", "label": "Mobilis 100", "quantity": 10, "unit_cost": 95},
                ],
                "paid_amount": 500,
                "notes": "iter24 test",
            },
        )
        assert rp.status_code == 200, rp.text
        purchase = rp.json()
        pid = purchase["id"]
        assert purchase["total_cost"] == 950
        assert purchase["paid_amount"] == 500
        assert purchase["balance_due"] == 450

        # 3. Balance_due on supplier doc was recomputed
        rs = await client.get(f"{BASE_URL}/admin/supplier/external-suppliers", headers=h)
        sup_now = next(s for s in rs.json() if s["id"] == sid)
        assert sup_now["balance_due"] == 450, sup_now

        # 4. Add a payment of 200 → balance should be 250
        rpay = await client.post(
            f"{BASE_URL}/admin/supplier/external-suppliers/{sid}/payments",
            headers=h,
            json={"amount": 200, "method": "cash", "notes": "partial"},
        )
        assert rpay.status_code == 200
        assert rpay.json()["new_balance_due"] == 250

        # 5. DELETE supplier should be refused (has purchases)
        rd = await client.delete(f"{BASE_URL}/admin/supplier/external-suppliers/{sid}", headers=h)
        assert rd.status_code == 400
        assert "حذف" in rd.json()["detail"]

        # 6. Cascade delete: delete the purchase, then the supplier
        await client.delete(f"{BASE_URL}/admin/supplier/purchases/{pid}", headers=h)
        # After purchase deletion + cascade payment cleanup, balance should reflect remaining payment only
        rs2 = await client.get(f"{BASE_URL}/admin/supplier/external-suppliers", headers=h)
        sup_after = next(s for s in rs2.json() if s["id"] == sid)
        # Manual payment (200) is still there but no purchases → balance_due = 0 - 200 = -200
        assert sup_after["balance_due"] == -200

        # Cleanup
        await client.delete(f"{BASE_URL}/admin/supplier/external-suppliers/{sid}", headers=h)


@pytest.mark.asyncio
async def test_financial_summary_kpis_have_required_shape():
    h = await _login()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(f"{BASE_URL}/admin/supplier/financial/summary?days=30", headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "kpis" in data
        for k in (
            "total_revenue", "revenue_orders", "total_cost", "purchase_count",
            "gross_profit", "margin_pct", "wallet_balance", "wallet_currency",
            "total_accounts_payable", "suppliers_with_debt",
        ):
            assert k in data["kpis"], f"missing kpi: {k}"
        assert isinstance(data["top_tenants"], list)
        assert isinstance(data["top_suppliers"], list)


@pytest.mark.asyncio
async def test_catalog_reference_returns_all_4_types():
    h = await _login()
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{BASE_URL}/admin/supplier/catalog-reference", headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("card", "sim", "idoom", "iptv"):
            assert k in data, f"missing catalog type: {k}"
            assert isinstance(data[k], list)
        # SIMs were seeded with 7 entries in iter-23
        assert len(data["sim"]) >= 7


@pytest.mark.asyncio
async def test_deferred_iccid_upload_to_saved_purchase():
    """Buy 5 SIMs from external supplier, then later upload 3 ICCIDs → stock = 3, remaining = 2."""
    h = await _login()
    async with httpx.AsyncClient(timeout=20) as client:
        # Fetch a real SIM catalog id (Mobilis retail)
        ref = (await client.get(f"{BASE_URL}/admin/supplier/catalog-reference", headers=h)).json()
        sim_entries = ref.get("sim") or []
        assert sim_entries, "no SIMs in catalog — iter-23 seed not applied?"
        sim_id = sim_entries[0]["id"]

        # Create supplier + purchase linked to that SIM
        sup_r = await client.post(
            f"{BASE_URL}/admin/supplier/external-suppliers",
            headers=h,
            json={"name": f"TEST_iter24_iccid {uuid.uuid4().hex[:6]}"},
        )
        sid = sup_r.json()["id"]

        purchase_r = await client.post(
            f"{BASE_URL}/admin/supplier/purchases",
            headers=h,
            json={
                "supplier_id": sid,
                "items": [
                    {"type": "sim", "catalog_id": sim_id, "label": "Mobilis SIM retail",
                     "quantity": 5, "unit_cost": 150},
                ],
                "paid_amount": 0,
            },
        )
        assert purchase_r.status_code == 200, purchase_r.text
        pid = purchase_r.json()["id"]

        # Now upload 3 ICCIDs against item index 0
        codes = f"ICCID-{uuid.uuid4().hex[:10]}\nICCID-{uuid.uuid4().hex[:10]}\nICCID-{uuid.uuid4().hex[:10]}"
        up_r = await client.post(
            f"{BASE_URL}/admin/supplier/purchases/{pid}/upload-codes",
            headers=h,
            params={"item_index": 0, "codes_text": codes},
        )
        assert up_r.status_code == 200, up_r.text
        up = up_r.json()
        assert up["inserted"] == 3
        assert up["skipped"] == 0
        assert up["total_so_far"] == 3
        assert up["expected"] == 5

        # Re-uploading same codes should skip duplicates
        re_r = await client.post(
            f"{BASE_URL}/admin/supplier/purchases/{pid}/upload-codes",
            headers=h,
            params={"item_index": 0, "codes_text": codes},
        )
        assert re_r.json()["inserted"] == 0
        assert re_r.json()["skipped"] == 3
        assert re_r.json()["total_so_far"] == 3   # unchanged

        # Upload 2 more → total 5, matches expected
        more = f"ICCID-{uuid.uuid4().hex[:10]}\nICCID-{uuid.uuid4().hex[:10]}"
        more_r = await client.post(
            f"{BASE_URL}/admin/supplier/purchases/{pid}/upload-codes",
            headers=h,
            params={"item_index": 0, "codes_text": more},
        )
        assert more_r.json()["total_so_far"] == 5

        # Cleanup
        await client.delete(f"{BASE_URL}/admin/supplier/purchases/{pid}", headers=h)
        await client.delete(f"{BASE_URL}/admin/supplier/external-suppliers/{sid}", headers=h)


@pytest.mark.asyncio
async def test_upload_codes_rejects_iptv_and_other_types():
    h = await _login()
    async with httpx.AsyncClient(timeout=20) as client:
        sup_r = await client.post(
            f"{BASE_URL}/admin/supplier/external-suppliers",
            headers=h,
            json={"name": f"TEST_iter24_reject {uuid.uuid4().hex[:6]}"},
        )
        sid = sup_r.json()["id"]

        purchase_r = await client.post(
            f"{BASE_URL}/admin/supplier/purchases",
            headers=h,
            json={
                "supplier_id": sid,
                "items": [{"type": "iptv", "label": "IPTV subscription", "quantity": 1, "unit_cost": 5000}],
            },
        )
        pid = purchase_r.json()["id"]

        bad_r = await client.post(
            f"{BASE_URL}/admin/supplier/purchases/{pid}/upload-codes",
            headers=h,
            params={"item_index": 0, "codes_text": "anything"},
        )
        assert bad_r.status_code == 400
        assert "iptv" in bad_r.json()["detail"].lower() or "النوع" in bad_r.json()["detail"]

        # Cleanup
        await client.delete(f"{BASE_URL}/admin/supplier/purchases/{pid}", headers=h)
        await client.delete(f"{BASE_URL}/admin/supplier/external-suppliers/{sid}", headers=h)
