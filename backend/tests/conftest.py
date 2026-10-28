import pytest
from unittest.mock import MagicMock
from datetime import datetime, timezone

class MockCursor:
    def __init__(self, data=None):
        self._data = data or []
    def sort(self, *args, **kwargs):
        return self
    def skip(self, *args, **kwargs):
        return self
    def limit(self, *args, **kwargs):
        return self
    async def to_list(self, length=None):
        return self._data

class MockCollection:
    def __init__(self, data=None, find_one_result=None, count=0, inserted_id="new123"):
        self._data = data or []
        self._find_one_result = find_one_result
        self._count = count
        self._inserted_id = inserted_id

    def find(self, *args, **kwargs):
        return MockCursor(self._data)

    async def find_one(self, *args, **kwargs):
        return self._find_one_result

    async def count_documents(self, *args, **kwargs):
        return self._count

    async def insert_one(self, *args, **kwargs):
        return MagicMock(inserted_id=self._inserted_id)

    async def update_one(self, *args, **kwargs):
        return MagicMock(modified_count=1)

    async def delete_one(self, *args, **kwargs):
        return MagicMock(deleted_count=1)

    def aggregate(self, *args, **kwargs):
        return MockCursor([{"total": 270000}])

class MockDB:
    def __init__(self):
        products_data = [
            {"id": "prod-1", "name": "iPhone 15 Pro", "sku": "IPH15P", "price": 180000, "stock": 25, "category": "Electronics", "status": "active", "sales": 45, "created_at": datetime.now(timezone.utc), "_id": "abc123"},
            {"id": "prod-2", "name": "Samsung Galaxy S24", "sku": "SAM-S24", "price": 160000, "stock": 30, "category": "Electronics", "status": "active", "sales": 38, "created_at": datetime.now(timezone.utc), "_id": "def456"},
        ]
        self._collections = {
            "products": MockCollection(data=products_data, find_one_result=products_data[0], count=2),
            "users": MockCollection(
                find_one_result={
                    "id": "user-1", "email": "demo@ntcommerce.com",
                    "password": "$2b$12$z4lJqgCAPS5BT0UVQu6PPOwwOEi4wbXax1Jb5BHggoocWOhBPVZui",
                    "full_name": "Demo User", "role": "admin", "is_active": True,
                },
                inserted_id="user-new"
            ),
            "orders": MockCollection(count=2),
            "customers": MockCollection(count=1),
        }

    def __getitem__(self, name):
        return self._collections.get(name, MockCollection())

    def __getattr__(self, name):
        return self._collections.get(name, MockCollection())

@pytest.fixture
def mock_db():
    return MockDB()

@pytest.fixture
def auth_service(mock_db):
    from services.auth_service import AuthService
    return AuthService(mock_db)


# ── p486 isolated live-integration fixtures ──────────────────────────────
# These fixtures are opt-in: unit tests using MockDB never open network or DB
# connections. Every created identity and direct seed is tagged TEST-P486.
@pytest.fixture(scope="session")
def p486_base_url():
    import os
    return (
        os.environ.get("P486_BASE")
        or os.environ.get("REACT_APP_BACKEND_URL")
        or "http://localhost:8001"
    ).rstrip("/")


@pytest.fixture(scope="session")
def p486_admin_headers(p486_base_url):
    import os
    import requests
    response = requests.post(
        f"{p486_base_url}/api/auth/login",
        json={
            "email": os.environ.get("TEST_SUPER_ADMIN_EMAIL", "admin@ntcommerce.com"),
            "password": os.environ.get("TEST_SUPER_ADMIN_PASSWORD", "Admin@2024"),
        },
        timeout=20,
    )
    assert response.status_code == 200, f"p486 admin login failed: {response.status_code}"
    token = response.json().get("access_token") or response.json().get("token")
    assert token, "p486 admin login returned no token"
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def p486_default_plans():
    """Provide the three legacy plan contracts without relying on seeded data."""
    import os
    import uuid
    from pymongo import MongoClient

    client = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    main_db = client[os.environ.get("DB_NAME", "nt_commerce")]
    existing = list(main_db.saas_plans.find({}, {"_id": 0}))
    if existing:
        client.close()
        yield existing
        return

    run_id = uuid.uuid4().hex[:10]
    plans = []
    for index, (name, monthly) in enumerate((("Starter", 2000), ("Professional", 4000), ("Enterprise", 6000))):
        plans.append({
            "id": f"TEST-P486-default-plan-{run_id}-{index}",
            "name": name,
            "name_ar": f"TEST-P486 {name}",
            "monthly_price": monthly,
            "six_month_price": monthly * 5,
            "yearly_price": monthly * 10,
            "features": {
                "max_products": 100 * (index + 1),
                "max_users": index + 1,
                "has_pos": True,
                "has_reports": True,
            },
            "is_active": True,
            "sort_order": index + 1,
        })
    main_db.saas_plans.insert_many(plans)
    try:
        yield [{key: value for key, value in plan.items() if key != "_id"} for plan in plans]
    finally:
        main_db.saas_plans.delete_many({"id": {"$in": [plan["id"] for plan in plans]}})
        client.close()


@pytest.fixture(scope="module")
def p486_tenant_factory(p486_base_url, p486_admin_headers):
    """Create tagged tenants with their own debt, card-sales and audit data."""
    import os
    import uuid
    from datetime import datetime, timedelta, timezone
    import requests
    from pymongo import MongoClient

    client = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    main_db = client[os.environ.get("DB_NAME", "nt_commerce")]
    created = []
    created_plan_ids = []

    def create(label, *, debt=0, card_sales=0, audit_events=0, ecommerce_hub=False):
        run_id = uuid.uuid4().hex[:10]
        email = f"test-p486-{label.lower()}-{run_id}@example.com"
        password = "TestP486!Tenant"
        plans_response = requests.get(
            f"{p486_base_url}/api/saas/plans", headers=p486_admin_headers, timeout=20,
        )
        assert plans_response.status_code == 200, plans_response.text[:300]
        plans = plans_response.json()
        if not plans:
            plan_id = f"TEST-P486-plan-{run_id}"
            plan = {
                "id": plan_id,
                "name": "TEST-P486 Plan",
                "name_ar": "TEST-P486 Plan",
                "monthly_price": 0,
                "six_month_price": 0,
                "yearly_price": 0,
                "features": {"max_products": 100, "max_users": 2, "has_pos": True, "has_reports": True},
                "is_active": True,
            }
            main_db.saas_plans.insert_one(plan)
            created_plan_ids.append(plan_id)
            plans = [plan]
        response = requests.post(
            f"{p486_base_url}/api/saas/tenants",
            headers=p486_admin_headers,
            json={
                "name": f"TEST-P486-{label}-{run_id}",
                "email": email,
                "password": password,
                "phone": "0555000486",
                "company_name": f"TEST-P486 {label}",
                "plan_id": plans[0]["id"],
                "subscription_type": "monthly",
                "business_type": "retailer",
            },
            timeout=45,
        )
        assert response.status_code in (200, 201), response.text[:400]
        tenant_id = response.json()["id"]
        tenant_doc = main_db.saas_tenants.find_one({"id": tenant_id})
        assert tenant_doc and tenant_doc.get("db_name"), "p486 tenant DB was not provisioned"

        login = requests.post(
            f"{p486_base_url}/api/auth/unified-login",
            json={"email": email, "password": password}, timeout=20,
        )
        if login.status_code != 200:
            login = requests.post(
                f"{p486_base_url}/api/saas/tenant-login",
                json={"email": email, "password": password}, timeout=20,
            )
        assert login.status_code == 200, f"p486 tenant login failed: {login.status_code}"
        token = login.json().get("access_token") or login.json().get("token")
        assert token, "p486 tenant login returned no token"
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        info = {
            "id": tenant_id,
            "email": email,
            "password": password,
            "headers": headers,
            "db_name": tenant_doc["db_name"],
            "run_id": run_id,
        }
        created.append(info)

        wallet_response = requests.get(
            f"{p486_base_url}/api/wallet", headers=headers, timeout=20,
        )
        assert wallet_response.status_code == 200, wallet_response.text[:300]

        if ecommerce_hub:
            features_response = requests.get(
                f"{p486_base_url}/api/saas/tenants/{tenant_id}/features",
                headers=p486_admin_headers, timeout=20,
            )
            assert features_response.status_code == 200, features_response.text[:300]
            overrides = dict(features_response.json().get("features_override") or {})
            overrides["ecommerce_hub"] = True
            update = requests.put(
                f"{p486_base_url}/api/saas/tenants/{tenant_id}/features",
                headers=p486_admin_headers, json=overrides, timeout=20,
            )
            assert update.status_code == 200, update.text[:300]

        if debt:
            result = main_db.wallets.update_one(
                {"entity_id": tenant_id, "entity_type": "tenant"},
                {"$set": {"credit_debt": float(debt) + 1.0}},
            )
            assert result.matched_count == 1, "p486 tenant wallet missing"
            # A one-unit settlement leaves the exact requested debt and flushes
            # the Redis tenant-debts cache through the production code path.
            settle = requests.post(
                f"{p486_base_url}/api/wallet/settle-credit",
                headers=p486_admin_headers,
                json={"entity_id": tenant_id, "amount": 1, "description": f"TEST-P486-{run_id} cache setup"},
                timeout=20,
            )
            assert settle.status_code == 200, settle.text[:300]

        if card_sales:
            now = datetime.now(timezone.utc)
            docs = [{
                "id": f"TEST-P486-{run_id}-card-{index}",
                "type": "platform_card",
                "code": f"TEST-P486-{run_id}-{index:03d}",
                "operator": "Mobilis",
                "denomination": 100,
                "sell_price": 100,
                "payment_method": "cash",
                "customer_name": f"TEST-P486 Customer {index}",
                "customer_phone": "0555000486",
                "is_credit": False,
                "debt_amount": 0,
                "test_run": run_id,
                "created_at": (now - timedelta(seconds=index)).isoformat(),
            } for index in range(card_sales)]
            client[info["db_name"]].platform_card_sales.insert_many(docs)

        if audit_events:
            now = datetime.now(timezone.utc)
            docs = [{
                "id": f"TEST-P486-{run_id}-rem-{index}",
                "tenant_id": tenant_id,
                "tenant_email": email,
                "channel": "test",
                "amount_at_time": float(debt),
                "delivered": False,
                "delivery_error": "TEST-P486 isolated audit event",
                "sent_by_admin_id": "TEST-P486-admin",
                "sent_by_admin_email": "test-p486@example.com",
                "test_run": run_id,
                "created_at": (now - timedelta(seconds=index)).isoformat(),
            } for index in range(audit_events)]
            main_db.tenant_debt_reminders.insert_many(docs)

        return info

    yield create

    cleanup_errors = []
    for info in reversed(created):
        tenant_id = info["id"]
        try:
            main_db.tenant_debt_reminders.delete_many({"tenant_id": tenant_id, "test_run": info["run_id"]})
            main_db.impersonation_logs.delete_many({"tenant_id": tenant_id})
            main_db.platform_audit_log.delete_many({
                "$or": [{"tenant_id": tenant_id}, {"tenant_email": info["email"]}],
            })
            response = requests.delete(
                f"{p486_base_url}/api/saas/tenants/{tenant_id}?cascade=true",
                headers=p486_admin_headers, timeout=90,
            )
            if response.status_code not in (200, 404):
                cleanup_errors.append(f"tenant {tenant_id}: HTTP {response.status_code}")
            main_db.impersonation_logs.delete_many({"tenant_id": tenant_id})
            main_db.platform_audit_log.delete_many({
                "$or": [{"tenant_id": tenant_id}, {"tenant_email": info["email"]}],
            })
            wallet_ids = [w["id"] for w in main_db.wallets.find({"entity_id": tenant_id}, {"id": 1})]
            if wallet_ids:
                main_db.wallet_transactions.delete_many({"wallet_id": {"$in": wallet_ids}})
            main_db.wallets.delete_many({"entity_id": tenant_id})
            main_db.tenant_debt_reminders.delete_many({"tenant_id": tenant_id})
            if main_db.saas_tenants.count_documents({"id": tenant_id}):
                cleanup_errors.append(f"tenant {tenant_id}: main-db residue")
            if info["db_name"] in client.list_database_names():
                cleanup_errors.append(f"tenant {tenant_id}: tenant-db residue")
        except Exception as exc:
            cleanup_errors.append(f"tenant {tenant_id}: {type(exc).__name__}: {exc}")
    if created_plan_ids:
        main_db.saas_plans.delete_many({"id": {"$in": created_plan_ids}})
    client.close()
    assert not cleanup_errors, "; ".join(cleanup_errors)
