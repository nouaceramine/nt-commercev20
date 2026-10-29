"""p489 live regressions for the complete purchase reopen lifecycle.

Every entity is tagged TEST-P489 inside the isolated p486 tenant factory.
"""
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
import requests
from pymongo import MongoClient

BASE_URL = (
    os.environ.get("P486_BASE")
    or os.environ.get("REACT_APP_BACKEND_URL")
    or "http://localhost:8001"
).rstrip("/") + "/api"


@pytest.fixture(scope="session")
def p486_admin_headers(p486_base_url):
    token = os.environ.get("P489_ADMIN_TOKEN")
    if token:
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    response = requests.post(f"{p486_base_url}/api/auth/login", json={
        "email": os.environ.get("TEST_SUPER_ADMIN_EMAIL", "admin@ntcommerce.com"),
        "password": os.environ.get("TEST_SUPER_ADMIN_PASSWORD", "Admin@2024"),
    }, timeout=20)
    assert response.status_code == 200, f"p489 admin login failed: {response.status_code}"
    token = response.json().get("access_token") or response.json().get("token")
    assert token, "p489 admin login returned no token"
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tenant_info(p486_tenant_factory):
    return p486_tenant_factory("p489-purchase-reopen")


@pytest.fixture(scope="module")
def tenant_h(tenant_info):
    return tenant_info["headers"]


@pytest.fixture(scope="module")
def tenant_db(tenant_info):
    client = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = client[tenant_info["db_name"]]
    yield db
    client.close()


def create_product(headers, run_id, quantity=10):
    response = requests.post(f"{BASE_URL}/products", headers=headers, json={
        "name_en": f"TEST-P489 Product {run_id}", "name_ar": f"TEST-P489 Product {run_id}",
        "purchase_price": 100, "retail_price": 250, "quantity": quantity,
        "barcode": f"TEST-P489-{run_id}",
    }, timeout=20)
    assert response.status_code == 201, response.text[:400]
    return response.json()


def create_supplier(headers, run_id):
    response = requests.post(f"{BASE_URL}/suppliers", headers=headers, json={
        "name": f"TEST-P489 Supplier {run_id}", "phone": "0555000489"}, timeout=20)
    assert response.status_code in (200, 201), response.text[:400]
    return response.json()


def purchase_payload(product, supplier, paid=0):
    return {
        "supplier_id": supplier["id"],
        "items": [{"product_id": product["id"], "product_name": product["name_ar"],
                   "quantity": 5, "unit_price": 120, "total": 600,
                   "update_product_prices": True}],
        "total": 600, "paid_amount": paid, "payment_method": "cash",
        "notes": "TEST-P489 purchase reopen lifecycle",
    }


def create_purchase(headers, product, supplier, paid=0):
    response = requests.post(f"{BASE_URL}/purchases", headers=headers,
                             json=purchase_payload(product, supplier, paid), timeout=30)
    assert response.status_code == 201, response.text[:400]
    return response.json()


def reopen(headers, purchase_id):
    return requests.post(f"{BASE_URL}/purchases/{purchase_id}/reopen",
                         headers=headers, json={}, timeout=30)


def confirm(headers, purchase_id):
    return requests.post(f"{BASE_URL}/purchases/{purchase_id}/confirm-stock",
                         headers=headers, json={}, timeout=30)


def wait_for_journal(db, purchase_id, minimum=1):
    rows = []
    for _ in range(30):
        rows = list(db.journal_entries.find({"reference_id": purchase_id}, {"_id": 0}))
        if len(rows) >= minimum:
            return rows
        time.sleep(0.5)
    return rows


def journal_net_by_account(rows):
    net = {}
    for entry in rows:
        for line in entry.get("lines") or []:
            key = line.get("account_code")
            net[key] = net.get(key, 0) + float(line.get("debit") or 0) - float(line.get("credit") or 0)
    return net


def assert_journal_zero(rows):
    assert rows
    assert all(abs(value) < 0.001 for value in journal_net_by_account(rows).values())


def outbox_count(tenant_info, event_type, purchase_id):
    client = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    try:
        main_db = client[os.environ.get("DB_NAME", "nt_commerce")]
        return main_db.outbox.count_documents({
            "tenant_id": tenant_info["id"], "event_type": event_type,
            "payload.purchase_id": purchase_id,
        })
    finally:
        client.close()


def test_reopen_reverses_all_effects_and_reconfirmation_reactivates(tenant_info, tenant_h, tenant_db):
    run_id = uuid.uuid4().hex[:10]
    product = create_product(tenant_h, run_id)
    unrelated_product = create_product(tenant_h, f"other-{run_id}", quantity=7)
    supplier = create_supplier(tenant_h, run_id)
    unrelated_supplier = create_supplier(tenant_h, f"other-{run_id}")
    cash_before = (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0)
    purchase = create_purchase(tenant_h, product, supplier, paid=200)
    adjusted = requests.put(f"{BASE_URL}/purchases/{purchase['id']}", headers=tenant_h,
                            json={"paid_amount": 100}, timeout=30)
    assert adjusted.status_code == 200
    wait_for_journal(tenant_db, purchase["id"], minimum=2)
    unrelated_product_before = tenant_db.products.find_one({"id": unrelated_product["id"]}, {"_id": 0})
    unrelated_supplier_before = tenant_db.suppliers.find_one({"id": unrelated_supplier["id"]}, {"_id": 0})

    response = reopen(tenant_h, purchase["id"])
    assert response.status_code == 200, response.text[:400]
    assert response.json()["financial_status"] == "inactive"
    doc = tenant_db.purchases.find_one({"id": purchase["id"]}, {"_id": 0})
    assert doc["stock_status"] == "draft" and doc["financial_status"] == "inactive"
    assert tenant_db.products.find_one({"id": product["id"]})["quantity"] == 10
    supplier_after = tenant_db.suppliers.find_one({"id": supplier["id"]})
    assert supplier_after["total_purchases"] == 0 and supplier_after["balance"] == 0
    assert (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0) == cash_before
    assert tenant_db.transactions.count_documents({
        "reference_type": "purchase_reopen", "reference_id": purchase["id"],
        "type": "income", "amount": 100}) == 1
    assert outbox_count(tenant_info, "purchase.reopened", purchase["id"]) == 1
    entries = wait_for_journal(tenant_db, purchase["id"], minimum=3)
    assert sum(str(entry.get("source_tag", "")).startswith("purchase_reopen:") for entry in entries) == 1
    assert_journal_zero(entries)

    repeated = reopen(tenant_h, purchase["id"])
    assert repeated.status_code == 200
    assert tenant_db.products.find_one({"id": product["id"]})["quantity"] == 10
    assert tenant_db.transactions.count_documents({
        "reference_type": "purchase_reopen", "reference_id": purchase["id"]}) == 1
    assert outbox_count(tenant_info, "purchase.reopened", purchase["id"]) == 1

    inactive_edit = requests.put(f"{BASE_URL}/purchases/{purchase['id']}", headers=tenant_h,
                                 json={"paid_amount": 50}, timeout=30)
    assert inactive_edit.status_code == 200
    supplier_after = tenant_db.suppliers.find_one({"id": supplier["id"]})
    assert supplier_after["total_purchases"] == 0 and supplier_after["balance"] == 0
    assert (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0) == cash_before

    confirmed = confirm(tenant_h, purchase["id"])
    assert confirmed.status_code == 200, confirmed.text[:400]
    assert confirmed.json()["financial_status"] == "active"
    assert tenant_db.products.find_one({"id": product["id"]})["quantity"] == 15
    supplier_after = tenant_db.suppliers.find_one({"id": supplier["id"]})
    assert supplier_after["total_purchases"] == 600 and supplier_after["balance"] == 550
    assert (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0) == cash_before - 50
    entries = wait_for_journal(tenant_db, purchase["id"], minimum=4)
    assert sum(str(entry.get("source_tag", "")).startswith("purchase_reactivate:") for entry in entries) == 1
    net = journal_net_by_account(entries)
    assert sorted(round(abs(value), 2) for value in net.values()) == [50.0, 550.0, 600.0]
    assert tenant_db.price_history.count_documents({
        "reference": purchase["invoice_number"], "price_type": "purchase_price"}) == 1
    assert tenant_db.products.find_one({"id": unrelated_product["id"]}, {"_id": 0}) == unrelated_product_before
    assert tenant_db.suppliers.find_one({"id": unrelated_supplier["id"]}, {"_id": 0}) == unrelated_supplier_before


def test_concurrent_reopen_reverses_every_relation_exactly_once(tenant_info, tenant_h, tenant_db):
    run_id = uuid.uuid4().hex[:10]
    product = create_product(tenant_h, run_id)
    supplier = create_supplier(tenant_h, run_id)
    cash_before = (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0)
    purchase = create_purchase(tenant_h, product, supplier, paid=200)
    wait_for_journal(tenant_db, purchase["id"], minimum=1)
    barrier = Barrier(2)

    def call_reopen():
        barrier.wait(timeout=10)
        return reopen(tenant_h, purchase["id"])

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: call_reopen(), range(2)))
    assert [response.status_code for response in responses] == [200, 200]
    assert tenant_db.products.find_one({"id": product["id"]})["quantity"] == 10
    supplier_after = tenant_db.suppliers.find_one({"id": supplier["id"]})
    assert supplier_after["total_purchases"] == 0 and supplier_after["balance"] == 0
    assert (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0) == cash_before
    assert tenant_db.transactions.count_documents({
        "reference_type": "purchase_reopen", "reference_id": purchase["id"]}) == 1
    assert outbox_count(tenant_info, "purchase.reopened", purchase["id"]) == 1
    entries = wait_for_journal(tenant_db, purchase["id"], minimum=2)
    assert sum(str(entry.get("source_tag", "")).startswith("purchase_reopen:") for entry in entries) == 1
    assert_journal_zero(entries)


def test_failed_reopen_rolls_back_claim_stock_finance_and_outbox(tenant_info, tenant_h, tenant_db):
    run_id = uuid.uuid4().hex[:10]
    product = create_product(tenant_h, run_id)
    supplier = create_supplier(tenant_h, run_id)
    purchase = create_purchase(tenant_h, product, supplier, paid=200)
    wait_for_journal(tenant_db, purchase["id"], minimum=1)
    tenant_db.purchases.update_one(
        {"id": purchase["id"]}, {"$set": {"items.0.quantity": "INVALID-TEST-P489"}})
    purchase_before = tenant_db.purchases.find_one({"id": purchase["id"]}, {"_id": 0})
    product_before = tenant_db.products.find_one({"id": product["id"]}, {"_id": 0})
    supplier_before = tenant_db.suppliers.find_one({"id": supplier["id"]}, {"_id": 0})
    cash_before = (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0)
    failed = reopen(tenant_h, purchase["id"])
    assert failed.status_code == 500
    assert tenant_db.purchases.find_one({"id": purchase["id"]}, {"_id": 0}) == purchase_before
    assert tenant_db.products.find_one({"id": product["id"]}, {"_id": 0}) == product_before
    assert tenant_db.suppliers.find_one({"id": supplier["id"]}, {"_id": 0}) == supplier_before
    assert (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0) == cash_before
    assert tenant_db.transactions.count_documents({
        "reference_type": "purchase_reopen", "reference_id": purchase["id"]}) == 0
    assert outbox_count(tenant_info, "purchase.reopened", purchase["id"]) == 0
    assert tenant_db.journal_entries.count_documents({
        "reference_id": purchase["id"], "source_tag": {"$regex": "^purchase_reopen:"}}) == 0


def test_failed_reconfirmation_rolls_back_stock_and_activation(tenant_info, tenant_h, tenant_db):
    run_id = uuid.uuid4().hex[:10]
    product = create_product(tenant_h, run_id)
    supplier = create_supplier(tenant_h, run_id)
    cash_before = (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0)
    purchase = create_purchase(tenant_h, product, supplier, paid=200)
    wait_for_journal(tenant_db, purchase["id"], minimum=1)
    assert reopen(tenant_h, purchase["id"]).status_code == 200
    wait_for_journal(tenant_db, purchase["id"], minimum=2)
    tenant_db.purchases.update_one(
        {"id": purchase["id"]}, {"$set": {"paid_amount": "INVALID-TEST-P489"}})
    purchase_before = tenant_db.purchases.find_one({"id": purchase["id"]}, {"_id": 0})
    product_before = tenant_db.products.find_one({"id": product["id"]}, {"_id": 0})
    supplier_before = tenant_db.suppliers.find_one({"id": supplier["id"]}, {"_id": 0})
    failed = confirm(tenant_h, purchase["id"])
    assert failed.status_code == 500
    assert tenant_db.purchases.find_one({"id": purchase["id"]}, {"_id": 0}) == purchase_before
    assert tenant_db.products.find_one({"id": product["id"]}, {"_id": 0}) == product_before
    assert tenant_db.suppliers.find_one({"id": supplier["id"]}, {"_id": 0}) == supplier_before
    assert (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0) == cash_before
    assert outbox_count(tenant_info, "purchase.reactivated", purchase["id"]) == 0
    assert tenant_db.journal_entries.count_documents({
        "reference_id": purchase["id"], "source_tag": {"$regex": "^purchase_reactivate:"}}) == 0


def test_two_reopen_cycles_then_delete_reverse_complete_accounting(tenant_info, tenant_h, tenant_db):
    run_id = uuid.uuid4().hex[:10]
    product = create_product(tenant_h, run_id)
    supplier = create_supplier(tenant_h, run_id)
    cash_before = (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0)
    purchase = create_purchase(tenant_h, product, supplier, paid=200)
    wait_for_journal(tenant_db, purchase["id"], minimum=1)
    expected_entries = 1
    for cycle in range(2):
        assert reopen(tenant_h, purchase["id"]).status_code == 200
        expected_entries += 1
        entries = wait_for_journal(tenant_db, purchase["id"], minimum=expected_entries)
        assert_journal_zero(entries)
        assert confirm(tenant_h, purchase["id"]).status_code == 200
        expected_entries += 1
        wait_for_journal(tenant_db, purchase["id"], minimum=expected_entries)
        assert tenant_db.products.find_one({"id": product["id"]})["quantity"] == 15
        assert (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0) == cash_before - 200
    deleted = requests.delete(f"{BASE_URL}/purchases/{purchase['id']}", headers=tenant_h, timeout=30)
    assert deleted.status_code == 200, deleted.text[:400]
    expected_entries += 1
    entries = wait_for_journal(tenant_db, purchase["id"], minimum=expected_entries)
    assert sum(str(entry.get("source_tag", "")).startswith("purchase_reopen:") for entry in entries) == 2
    assert sum(str(entry.get("source_tag", "")).startswith("purchase_reactivate:") for entry in entries) == 2
    assert sum(entry.get("source_tag") == "purchase_delete" for entry in entries) == 1
    assert_journal_zero(entries)
    assert tenant_db.products.find_one({"id": product["id"]})["quantity"] == 10
    supplier_after = tenant_db.suppliers.find_one({"id": supplier["id"]})
    assert supplier_after["total_purchases"] == 0 and supplier_after["balance"] == 0
    assert (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0) == cash_before
    assert tenant_db.transactions.count_documents({
        "reference_type": "purchase_reopen", "reference_id": purchase["id"]}) == 2
    assert outbox_count(tenant_info, "purchase.reopened", purchase["id"]) == 2
    assert outbox_count(tenant_info, "purchase.reactivated", purchase["id"]) == 2


def test_delete_while_reopened_does_not_reverse_finance_twice(tenant_info, tenant_h, tenant_db):
    run_id = uuid.uuid4().hex[:10]
    product = create_product(tenant_h, run_id)
    supplier = create_supplier(tenant_h, run_id)
    cash_before = (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0)
    purchase = create_purchase(tenant_h, product, supplier, paid=100)
    wait_for_journal(tenant_db, purchase["id"], minimum=1)
    assert reopen(tenant_h, purchase["id"]).status_code == 200
    entries = wait_for_journal(tenant_db, purchase["id"], minimum=2)
    assert_journal_zero(entries)
    deleted = requests.delete(f"{BASE_URL}/purchases/{purchase['id']}", headers=tenant_h, timeout=30)
    assert deleted.status_code == 200
    assert tenant_db.products.find_one({"id": product["id"]})["quantity"] == 10
    supplier_after = tenant_db.suppliers.find_one({"id": supplier["id"]})
    assert supplier_after["total_purchases"] == 0 and supplier_after["balance"] == 0
    assert (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0) == cash_before
    assert tenant_db.transactions.count_documents({
        "reference_type": "purchase_reopen", "reference_id": purchase["id"]}) == 1
    assert outbox_count(tenant_info, "purchase.deleted", purchase["id"]) == 0
    time.sleep(1)
    assert tenant_db.journal_entries.count_documents({
        "reference_id": purchase["id"], "source_tag": "purchase_delete"}) == 0
    assert_journal_zero(list(tenant_db.journal_entries.find({"reference_id": purchase["id"]}, {"_id": 0})))



def test_concurrent_absolute_payment_update_applies_delta_once(tenant_info, tenant_h, tenant_db):
    run_id = uuid.uuid4().hex[:10]
    product = create_product(tenant_h, run_id)
    supplier = create_supplier(tenant_h, run_id)
    cash_before = (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0)
    purchase = create_purchase(tenant_h, product, supplier, paid=0)
    wait_for_journal(tenant_db, purchase["id"], minimum=1)
    barrier = Barrier(2)

    def set_payment():
        barrier.wait(timeout=10)
        return requests.put(f"{BASE_URL}/purchases/{purchase['id']}", headers=tenant_h,
                            json={"paid_amount": 200}, timeout=30)

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: set_payment(), range(2)))
    assert [response.status_code for response in responses] == [200, 200]
    doc = tenant_db.purchases.find_one({"id": purchase["id"]}, {"_id": 0})
    assert doc["paid_amount"] == 200 and doc["remaining"] == 400
    supplier_after = tenant_db.suppliers.find_one({"id": supplier["id"]})
    assert supplier_after["total_purchases"] == 600 and supplier_after["balance"] == 400
    assert (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0) == cash_before - 200
    assert tenant_db.transactions.count_documents({
        "reference_id": purchase["id"], "type": "expense", "amount": 200}) == 1
    entries = wait_for_journal(tenant_db, purchase["id"], minimum=2)
    assert len(entries) == 2
    net = journal_net_by_account(entries)
    assert sorted(round(abs(value), 2) for value in net.values()) == [200.0, 400.0, 600.0]



def test_failed_payment_update_rolls_back_supplier_document_and_outbox(tenant_info, tenant_h, tenant_db):
    run_id = uuid.uuid4().hex[:10]
    product = create_product(tenant_h, run_id)
    supplier = create_supplier(tenant_h, run_id)
    purchase = create_purchase(tenant_h, product, supplier, paid=0)
    wait_for_journal(tenant_db, purchase["id"], minimum=1)
    broken_box_id = f"TEST-P489-broken-box-{run_id}"
    tenant_db.cash_boxes.insert_one({
        "id": broken_box_id, "name": f"TEST-P489 Broken Box {run_id}",
        "balance": "INVALID-TEST-P489",
    })
    tenant_db.purchases.update_one(
        {"id": purchase["id"]}, {"$set": {"payment_method": broken_box_id}})
    purchase_before = tenant_db.purchases.find_one({"id": purchase["id"]}, {"_id": 0})
    supplier_before = tenant_db.suppliers.find_one({"id": supplier["id"]}, {"_id": 0})
    failed = requests.put(f"{BASE_URL}/purchases/{purchase['id']}", headers=tenant_h,
                          json={"paid_amount": 200}, timeout=30)
    assert failed.status_code == 500
    assert tenant_db.purchases.find_one({"id": purchase["id"]}, {"_id": 0}) == purchase_before
    assert tenant_db.suppliers.find_one({"id": supplier["id"]}, {"_id": 0}) == supplier_before
    assert tenant_db.cash_boxes.find_one({"id": broken_box_id})["balance"] == "INVALID-TEST-P489"
    assert tenant_db.transactions.count_documents({
        "reference_id": purchase["id"], "amount": 200}) == 0
    assert outbox_count(tenant_info, "purchase.payment_adjusted", purchase["id"]) == 0
    assert tenant_db.journal_entries.count_documents({
        "reference_id": purchase["id"], "source_tag": {"$regex": "^purchase_payment:"}}) == 0
