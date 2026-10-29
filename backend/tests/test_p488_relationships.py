"""p488 live regressions for sale/purchase cross-element invariants.

Uses only the isolated p486 tenant factory; every entity is tagged TEST-P488
and the tenant database is cascade-deleted by the fixture.
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
    """Use a short-lived existing-admin token when password login is unsuitable."""
    token = os.environ.get("P488_ADMIN_TOKEN")
    if token:
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    response = requests.post(f"{p486_base_url}/api/auth/login", json={
        "email": os.environ.get("TEST_SUPER_ADMIN_EMAIL", "admin@ntcommerce.com"),
        "password": os.environ.get("TEST_SUPER_ADMIN_PASSWORD", "Admin@2024"),
    }, timeout=20)
    assert response.status_code == 200, f"p488 admin login failed: {response.status_code}"
    token = response.json().get("access_token") or response.json().get("token")
    assert token, "p488 admin login returned no token"
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tenant_info(p486_tenant_factory):
    return p486_tenant_factory("p488-relationships")


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
        "name_en": f"TEST-P488 Product {run_id}", "name_ar": f"TEST-P488 Product {run_id}",
        "purchase_price": 100, "retail_price": 250, "quantity": quantity,
        "barcode": f"TEST-P488-{run_id}",
    }, timeout=20)
    assert response.status_code == 201, response.text[:400]
    return response.json()


def create_supplier(headers, run_id):
    response = requests.post(f"{BASE_URL}/suppliers", headers=headers, json={
        "name": f"TEST-P488 Supplier {run_id}", "phone": "0555000488"}, timeout=20)
    assert response.status_code in (200, 201), response.text[:400]
    return response.json()


def purchase_payload(product, supplier, paid=0):
    return {
        "supplier_id": supplier["id"],
        "items": [{"product_id": product["id"], "product_name": product["name_ar"],
                   "quantity": 5, "unit_price": 120, "total": 600,
                   "update_product_prices": True}],
        "total": 600, "paid_amount": paid, "payment_method": "cash",
        "notes": "TEST-P488 purchase relationship",
    }


def wait_for_journal(db, purchase_id, minimum=1):
    rows = []
    for _ in range(20):
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


def test_sale_second_return_has_no_additional_effects(tenant_h, tenant_db):
    run_id = uuid.uuid4().hex[:10]
    product = create_product(tenant_h, run_id, quantity=20)
    customer_response = requests.post(f"{BASE_URL}/customers", headers=tenant_h, json={
        "name": f"TEST-P488 Customer {run_id}", "phone": "0555000488"}, timeout=20)
    assert customer_response.status_code in (200, 201), customer_response.text[:400]
    customer = customer_response.json()
    cash_before = (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0)
    response = requests.post(f"{BASE_URL}/sales", headers=tenant_h, json={
        "customer_id": customer["id"],
        "items": [{"product_id": product["id"], "product_name": product["name_ar"],
                   "quantity": 2, "unit_price": 250, "total": 500}],
        "subtotal": 500, "discount": 0, "total": 500, "paid_amount": 200,
        "payment_method": "cash", "payment_type": "partial", "notes": "TEST-P488 sale return",
    }, timeout=30)
    assert response.status_code == 201, response.text[:400]
    sale = response.json()
    first = requests.post(f"{BASE_URL}/sales/{sale['id']}/return", headers=tenant_h, timeout=30)
    assert first.status_code == 200, first.text[:400]
    product_after = tenant_db.products.find_one({"id": product["id"]}, {"_id": 0})
    customer_after = tenant_db.customers.find_one({"id": customer["id"]}, {"_id": 0})
    cash_after = (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0)
    assert product_after["quantity"] == 20
    assert customer_after["total_purchases"] == 0
    assert customer_after["balance"] == 0
    assert cash_after == cash_before
    second = requests.post(f"{BASE_URL}/sales/{sale['id']}/return", headers=tenant_h, timeout=30)
    assert second.status_code == 409, second.text[:400]
    assert tenant_db.products.find_one({"id": product["id"]}, {"_id": 0}) == product_after
    assert tenant_db.customers.find_one({"id": customer["id"]}, {"_id": 0}) == customer_after
    assert (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0) == cash_after
    assert tenant_db.transactions.count_documents({
        "reference_type": "return", "reference_id": sale["id"]}) == 1
    entries = wait_for_journal(tenant_db, sale["id"], minimum=2)
    assert sum(entry.get("source_tag") == "refund" for entry in entries) == 1
    assert all(abs(value) < 0.001 for value in journal_net_by_account(entries).values())


def test_purchase_price_payment_and_delete_accounting(tenant_h, tenant_db):
    run_id = uuid.uuid4().hex[:10]
    product = create_product(tenant_h, run_id)
    supplier = create_supplier(tenant_h, run_id)
    cash_before = (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0)
    response = requests.post(f"{BASE_URL}/purchases", headers=tenant_h,
                             json=purchase_payload(product, supplier, paid=200), timeout=30)
    assert response.status_code == 201, response.text[:400]
    purchase = response.json()
    history = list(tenant_db.price_history.find({
        "product_id": product["id"], "source": "purchase", "reference": purchase["invoice_number"],
        "price_type": "purchase_price"}, {"_id": 0}))
    assert len(history) == 1
    assert history[0]["old_price"] == 100 and history[0]["new_price"] == 120
    purchase_before_invalid = tenant_db.purchases.find_one({"id": purchase["id"]}, {"_id": 0})
    supplier_before_invalid = tenant_db.suppliers.find_one({"id": supplier["id"]}, {"_id": 0})
    for invalid_paid in (-1, 601):
        rejected = requests.put(f"{BASE_URL}/purchases/{purchase['id']}", headers=tenant_h,
                                json={"paid_amount": invalid_paid}, timeout=30)
        assert rejected.status_code == 400
        assert tenant_db.purchases.find_one({"id": purchase["id"]}, {"_id": 0}) == purchase_before_invalid
        assert tenant_db.suppliers.find_one({"id": supplier["id"]}, {"_id": 0}) == supplier_before_invalid
        assert (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0) == cash_before - 200

    updated = requests.put(f"{BASE_URL}/purchases/{purchase['id']}", headers=tenant_h,
                           json={"paid_amount": 100}, timeout=30)
    assert updated.status_code == 200, updated.text[:400]
    assert updated.json()["purchase"]["remaining"] == 500
    assert (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0) == cash_before - 100
    assert tenant_db.transactions.count_documents({
        "reference_id": purchase["id"], "type": "income", "amount": 100}) == 1
    wait_for_journal(tenant_db, purchase["id"], minimum=2)

    increased = requests.put(f"{BASE_URL}/purchases/{purchase['id']}", headers=tenant_h,
                             json={"paid_amount": 150}, timeout=30)
    assert increased.status_code == 200, increased.text[:400]
    assert increased.json()["purchase"]["remaining"] == 450
    assert (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0) == cash_before - 150
    assert tenant_db.transactions.count_documents({
        "reference_id": purchase["id"], "type": "expense", "amount": 50}) == 1
    supplier_before_delete = tenant_db.suppliers.find_one({"id": supplier["id"]})
    assert supplier_before_delete["total_purchases"] == 600
    assert supplier_before_delete["balance"] == 450
    wait_for_journal(tenant_db, purchase["id"], minimum=3)

    deleted = requests.delete(f"{BASE_URL}/purchases/{purchase['id']}", headers=tenant_h, timeout=30)
    assert deleted.status_code == 200, deleted.text[:400]
    entries = wait_for_journal(tenant_db, purchase["id"], minimum=4)
    assert any(entry.get("source_tag") == "purchase_delete" for entry in entries)
    assert all(abs(entry["total_debit"] - entry["total_credit"]) < 0.001 for entry in entries)
    assert all(abs(value) < 0.001 for value in journal_net_by_account(entries).values())
    assert tenant_db.products.find_one({"id": product["id"]})["quantity"] == 10
    supplier_after = tenant_db.suppliers.find_one({"id": supplier["id"]})
    assert supplier_after["total_purchases"] == 0 and supplier_after["balance"] == 0
    assert (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0) == cash_before


def test_draft_confirmation_activates_every_relation_exactly_once(tenant_h, tenant_db):
    run_id = uuid.uuid4().hex[:10]
    product = create_product(tenant_h, run_id)
    supplier = create_supplier(tenant_h, run_id)
    response = requests.post(f"{BASE_URL}/purchases", headers=tenant_h, json={
        **purchase_payload(product, supplier), "confirm_stock": False}, timeout=30)
    assert response.status_code == 201, response.text[:400]
    purchase = response.json()
    assert purchase["financial_status"] == "inactive"
    assert tenant_db.products.find_one({"id": product["id"]})["quantity"] == 10
    confirmed = requests.post(f"{BASE_URL}/purchases/{purchase['id']}/confirm-stock",
                              headers=tenant_h, json={}, timeout=30)
    assert confirmed.status_code == 200, confirmed.text[:400]
    product_after = tenant_db.products.find_one({"id": product["id"]}, {"_id": 0})
    supplier_after = tenant_db.suppliers.find_one({"id": supplier["id"]}, {"_id": 0})
    assert product_after["quantity"] == 15
    assert supplier_after["total_purchases"] == 600 and supplier_after["balance"] == 600
    entries = wait_for_journal(tenant_db, purchase["id"], minimum=1)
    assert entries and entries[0]["total_debit"] == 600
    assert tenant_db.price_history.count_documents({
        "product_id": product["id"], "reference": purchase["invoice_number"],
        "price_type": "purchase_price"}) == 1
    repeated = requests.post(f"{BASE_URL}/purchases/{purchase['id']}/confirm-stock",
                             headers=tenant_h, json={}, timeout=30)
    assert repeated.status_code == 200
    assert tenant_db.products.find_one({"id": product["id"]}, {"_id": 0}) == product_after
    assert tenant_db.suppliers.find_one({"id": supplier["id"]}, {"_id": 0}) == supplier_after
    deleted = requests.delete(f"{BASE_URL}/purchases/{purchase['id']}", headers=tenant_h, timeout=30)
    assert deleted.status_code == 200
    supplier_final = tenant_db.suppliers.find_one({"id": supplier["id"]})
    assert supplier_final["total_purchases"] == 0 and supplier_final["balance"] == 0
    assert tenant_db.products.find_one({"id": product["id"]})["quantity"] == 10



def test_concurrent_sale_returns_apply_effects_exactly_once(tenant_h, tenant_db):
    run_id = uuid.uuid4().hex[:10]
    product = create_product(tenant_h, run_id, quantity=20)
    customer_response = requests.post(f"{BASE_URL}/customers", headers=tenant_h, json={
        "name": f"TEST-P488 Concurrent Customer {run_id}", "phone": "0555000489"}, timeout=20)
    assert customer_response.status_code in (200, 201), customer_response.text[:400]
    customer = customer_response.json()
    cash_before = (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0)
    response = requests.post(f"{BASE_URL}/sales", headers=tenant_h, json={
        "customer_id": customer["id"],
        "items": [{"product_id": product["id"], "product_name": product["name_ar"],
                   "quantity": 2, "unit_price": 250, "total": 500}],
        "subtotal": 500, "discount": 0, "total": 500, "paid_amount": 200,
        "payment_method": "cash", "payment_type": "partial", "notes": "TEST-P488 concurrent return",
    }, timeout=30)
    assert response.status_code == 201, response.text[:400]
    sale = response.json()
    barrier = Barrier(2)

    def send_return():
        barrier.wait(timeout=10)
        return requests.post(f"{BASE_URL}/sales/{sale['id']}/return", headers=tenant_h, timeout=30)

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: send_return(), range(2)))
    assert sorted(response.status_code for response in responses) == [200, 409], [
        (response.status_code, response.text[:200]) for response in responses]
    assert tenant_db.products.find_one({"id": product["id"]})["quantity"] == 20
    customer_after = tenant_db.customers.find_one({"id": customer["id"]})
    assert customer_after["total_purchases"] == 0 and customer_after["balance"] == 0
    assert (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0) == cash_before
    assert tenant_db.transactions.count_documents({
        "reference_type": "return", "reference_id": sale["id"]}) == 1
    entries = wait_for_journal(tenant_db, sale["id"], minimum=2)
    assert sum(entry.get("source_tag") == "refund" for entry in entries) == 1
    assert all(abs(value) < 0.001 for value in journal_net_by_account(entries).values())


def test_failed_sale_return_rolls_back_status_and_has_no_effects(tenant_h, tenant_db):
    run_id = uuid.uuid4().hex[:10]
    product = create_product(tenant_h, run_id, quantity=9)
    sale_id = f"TEST-P488-failed-return-{run_id}"
    sale_doc = {
        "id": sale_id, "invoice_number": f"TEST-P488-{run_id}", "status": "completed",
        "customer_id": None, "total": 250, "paid_amount": 0, "remaining": 250,
        "payment_method": "cash", "items": [{
            "product_id": product["id"], "product_name": product["name_ar"],
            "quantity": "INVALID-TEST-P488", "unit_price": 250, "total": 250,
        }],
        "created_at": "TEST-P488", "updated_at": "TEST-P488",
    }
    tenant_db.sales.insert_one(sale_doc)
    sale_before = tenant_db.sales.find_one({"id": sale_id}, {"_id": 0})
    product_before = tenant_db.products.find_one({"id": product["id"]}, {"_id": 0})
    failed = requests.post(f"{BASE_URL}/sales/{sale_id}/return", headers=tenant_h, timeout=30)
    assert failed.status_code == 500
    assert tenant_db.sales.find_one({"id": sale_id}, {"_id": 0}) == sale_before
    assert tenant_db.products.find_one({"id": product["id"]}, {"_id": 0}) == product_before
    assert tenant_db.transactions.count_documents({"reference_id": sale_id}) == 0
    client = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    try:
        main_db = client[os.environ.get("DB_NAME", "nt_commerce")]
        assert main_db.outbox.count_documents({
            "event_type": "sale.refunded", "payload.sale_id": sale_id}) == 0
    finally:
        client.close()


def test_inactive_draft_delete_leaves_finance_and_unrelated_entities_unchanged(tenant_h, tenant_db):
    run_id = uuid.uuid4().hex[:10]
    product = create_product(tenant_h, run_id, quantity=10)
    unrelated_product = create_product(tenant_h, f"other-{run_id}", quantity=7)
    supplier = create_supplier(tenant_h, run_id)
    unrelated_supplier = create_supplier(tenant_h, f"other-{run_id}")
    response = requests.post(f"{BASE_URL}/purchases", headers=tenant_h, json={
        **purchase_payload(product, supplier, paid=200), "confirm_stock": False}, timeout=30)
    assert response.status_code == 201, response.text[:400]
    purchase = response.json()
    tracked_before = {
        "product": tenant_db.products.find_one({"id": product["id"]}, {"_id": 0}),
        "unrelated_product": tenant_db.products.find_one({"id": unrelated_product["id"]}, {"_id": 0}),
        "supplier": tenant_db.suppliers.find_one({"id": supplier["id"]}, {"_id": 0}),
        "unrelated_supplier": tenant_db.suppliers.find_one({"id": unrelated_supplier["id"]}, {"_id": 0}),
        "cash": (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0),
    }
    deleted = requests.delete(f"{BASE_URL}/purchases/{purchase['id']}", headers=tenant_h, timeout=30)
    assert deleted.status_code == 200, deleted.text[:400]
    assert tenant_db.products.find_one({"id": product["id"]}, {"_id": 0}) == tracked_before["product"]
    assert tenant_db.products.find_one({"id": unrelated_product["id"]}, {"_id": 0}) == tracked_before["unrelated_product"]
    assert tenant_db.suppliers.find_one({"id": supplier["id"]}, {"_id": 0}) == tracked_before["supplier"]
    assert tenant_db.suppliers.find_one({"id": unrelated_supplier["id"]}, {"_id": 0}) == tracked_before["unrelated_supplier"]
    assert (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0) == tracked_before["cash"]
    assert tenant_db.transactions.count_documents({"reference_id": purchase["id"]}) == 0
    assert tenant_db.journal_entries.count_documents({"reference_id": purchase["id"]}) == 0
    assert tenant_db.price_history.count_documents({"reference": purchase["invoice_number"]}) == 0
    assert tenant_db.purchases.find_one({"id": purchase["id"]}) is None



def test_concurrent_draft_confirmation_activates_relations_exactly_once(tenant_h, tenant_db):
    run_id = uuid.uuid4().hex[:10]
    product = create_product(tenant_h, run_id)
    supplier = create_supplier(tenant_h, run_id)
    response = requests.post(f"{BASE_URL}/purchases", headers=tenant_h, json={
        **purchase_payload(product, supplier), "confirm_stock": False}, timeout=30)
    assert response.status_code == 201, response.text[:400]
    purchase = response.json()
    barrier = Barrier(2)

    def confirm():
        barrier.wait(timeout=10)
        return requests.post(f"{BASE_URL}/purchases/{purchase['id']}/confirm-stock",
                             headers=tenant_h, json={}, timeout=30)

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: confirm(), range(2)))
    assert [response.status_code for response in responses] == [200, 200]
    assert tenant_db.products.find_one({"id": product["id"]})["quantity"] == 15
    supplier_after = tenant_db.suppliers.find_one({"id": supplier["id"]})
    assert supplier_after["total_purchases"] == 600 and supplier_after["balance"] == 600
    entries = wait_for_journal(tenant_db, purchase["id"], minimum=1)
    assert len(entries) == 1 and entries[0]["total_debit"] == 600
    assert tenant_db.price_history.count_documents({
        "product_id": product["id"], "reference": purchase["invoice_number"],
        "price_type": "purchase_price"}) == 1



def test_failed_draft_confirmation_rolls_back_claim_and_effects(tenant_h, tenant_db):
    run_id = uuid.uuid4().hex[:10]
    product = create_product(tenant_h, run_id)
    supplier = create_supplier(tenant_h, run_id)
    response = requests.post(f"{BASE_URL}/purchases", headers=tenant_h, json={
        **purchase_payload(product, supplier), "confirm_stock": False}, timeout=30)
    assert response.status_code == 201, response.text[:400]
    purchase = response.json()
    tenant_db.purchases.update_one(
        {"id": purchase["id"]}, {"$set": {"items.0.quantity": "INVALID-TEST-P488"}}
    )
    purchase_before = tenant_db.purchases.find_one({"id": purchase["id"]}, {"_id": 0})
    product_before = tenant_db.products.find_one({"id": product["id"]}, {"_id": 0})
    supplier_before = tenant_db.suppliers.find_one({"id": supplier["id"]}, {"_id": 0})
    failed = requests.post(f"{BASE_URL}/purchases/{purchase['id']}/confirm-stock",
                           headers=tenant_h, json={}, timeout=30)
    assert failed.status_code == 500
    assert tenant_db.purchases.find_one({"id": purchase["id"]}, {"_id": 0}) == purchase_before
    assert tenant_db.products.find_one({"id": product["id"]}, {"_id": 0}) == product_before
    assert tenant_db.suppliers.find_one({"id": supplier["id"]}, {"_id": 0}) == supplier_before
    assert tenant_db.price_history.count_documents({"reference": purchase["invoice_number"]}) == 0
    assert tenant_db.journal_entries.count_documents({"reference_id": purchase["id"]}) == 0
    client = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    try:
        main_db = client[os.environ.get("DB_NAME", "nt_commerce")]
        assert main_db.outbox.count_documents({
            "event_type": "purchase.recorded", "payload.purchase_id": purchase["id"]}) == 0
    finally:
        client.close()



def test_concurrent_purchase_delete_reverses_every_relation_exactly_once(tenant_h, tenant_db):
    run_id = uuid.uuid4().hex[:10]
    product = create_product(tenant_h, run_id)
    supplier = create_supplier(tenant_h, run_id)
    cash_before = (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0)
    response = requests.post(f"{BASE_URL}/purchases", headers=tenant_h,
                             json=purchase_payload(product, supplier, paid=200), timeout=30)
    assert response.status_code == 201, response.text[:400]
    purchase = response.json()
    wait_for_journal(tenant_db, purchase["id"], minimum=1)
    barrier = Barrier(2)

    def delete():
        barrier.wait(timeout=10)
        return requests.delete(f"{BASE_URL}/purchases/{purchase['id']}", headers=tenant_h, timeout=30)

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: delete(), range(2)))
    assert sorted(response.status_code for response in responses) == [200, 404]
    assert tenant_db.products.find_one({"id": product["id"]})["quantity"] == 10
    supplier_after = tenant_db.suppliers.find_one({"id": supplier["id"]})
    assert supplier_after["total_purchases"] == 0 and supplier_after["balance"] == 0
    assert (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0) == cash_before
    assert tenant_db.transactions.count_documents({
        "reference_type": "purchase_reversal", "reference_id": purchase["id"]}) == 1
    entries = wait_for_journal(tenant_db, purchase["id"], minimum=2)
    assert sum(entry.get("source_tag") == "purchase_delete" for entry in entries) == 1
    assert all(abs(value) < 0.001 for value in journal_net_by_account(entries).values())



def test_failed_purchase_delete_rolls_back_document_and_reversals(tenant_h, tenant_db):
    run_id = uuid.uuid4().hex[:10]
    product = create_product(tenant_h, run_id)
    supplier = create_supplier(tenant_h, run_id)
    response = requests.post(f"{BASE_URL}/purchases", headers=tenant_h,
                             json=purchase_payload(product, supplier, paid=200), timeout=30)
    assert response.status_code == 201, response.text[:400]
    purchase = response.json()
    wait_for_journal(tenant_db, purchase["id"], minimum=1)
    tenant_db.purchases.update_one(
        {"id": purchase["id"]}, {"$set": {"items.0.quantity": "INVALID-TEST-P488"}}
    )
    purchase_before = tenant_db.purchases.find_one({"id": purchase["id"]}, {"_id": 0})
    product_before = tenant_db.products.find_one({"id": product["id"]}, {"_id": 0})
    supplier_before = tenant_db.suppliers.find_one({"id": supplier["id"]}, {"_id": 0})
    cash_before = (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0)
    failed = requests.delete(f"{BASE_URL}/purchases/{purchase['id']}", headers=tenant_h, timeout=30)
    assert failed.status_code == 500
    assert tenant_db.purchases.find_one({"id": purchase["id"]}, {"_id": 0}) == purchase_before
    assert tenant_db.products.find_one({"id": product["id"]}, {"_id": 0}) == product_before
    assert tenant_db.suppliers.find_one({"id": supplier["id"]}, {"_id": 0}) == supplier_before
    assert (tenant_db.cash_boxes.find_one({"id": "cash"}) or {}).get("balance", 0) == cash_before
    assert tenant_db.transactions.count_documents({
        "reference_type": "purchase_reversal", "reference_id": purchase["id"]}) == 0
    assert tenant_db.journal_entries.count_documents({
        "reference_id": purchase["id"], "source_tag": "purchase_delete"}) == 0
    client = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    try:
        main_db = client[os.environ.get("DB_NAME", "nt_commerce")]
        assert main_db.outbox.count_documents({
            "event_type": "purchase.deleted", "payload.purchase_id": purchase["id"]}) == 0
    finally:
        client.close()
