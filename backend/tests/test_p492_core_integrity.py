"""P492 validation and transactional-helper regression tests."""
import asyncio
import io

import pytest
from pydantic import ValidationError

from models.schemas.catalog import (
    ProductCreate,
    ProductLotCreate,
    ProductSupplierLinkCreate,
    ProductSupplierLinkUpdate,
    ProductUpdate,
)
from models.schemas.inventory import InventorySessionUpdate, StockTransferCreate, WarehouseCreate
from models.schemas.trading import PurchaseCreate
from services.cost_drift import check_cost_drift


@pytest.mark.parametrize("field", ["purchase_price", "wholesale_price", "retail_price", "super_wholesale_price"])
@pytest.mark.parametrize("value", [-0.01, float("nan"), float("inf"), float("-inf")])
def test_product_create_rejects_invalid_prices(field, value):
    with pytest.raises(ValidationError):
        ProductCreate(**{"name_en": "TEST-P492 product", field: value})


@pytest.mark.parametrize("field", ["quantity", "low_stock_threshold"])
@pytest.mark.parametrize("value", [-1, float("nan"), float("inf")])
def test_product_create_rejects_invalid_quantities(field, value):
    with pytest.raises(ValidationError):
        ProductCreate(**{"name_en": "TEST-P492 product", field: value})


def test_product_update_rejects_non_finite_price():
    with pytest.raises(ValidationError):
        ProductUpdate(retail_price=float("nan"))


def purchase_payload(**overrides):
    payload = {
        "supplier_id": "TEST-P492-supplier",
        "items": [{
            "product_id": "TEST-P492-product",
            "product_name": "TEST-P492 product",
            "quantity": 2,
            "unit_price": 10,
            "total": 20,
        }],
        "total": 20,
        "paid_amount": 0,
    }
    payload.update(overrides)
    return payload


def test_purchase_accepts_consistent_totals():
    purchase = PurchaseCreate(**purchase_payload())
    assert purchase.total == 20
    assert purchase.items[0].total == purchase.items[0].quantity * purchase.items[0].unit_price


@pytest.mark.parametrize("overrides", [
    {"paid_amount": 20.01},
    {"paid_amount": -0.01},
    {"total": 20.02},
    {"total": 0},
    {"items": []},
    {"items": [{"product_id": "p", "product_name": "P", "quantity": 0, "unit_price": 10, "total": 0}]},
    {"items": [{"product_id": "p", "product_name": "P", "quantity": 2, "unit_price": 10, "total": 19.98}]},
    {"items": [{"product_id": "p", "product_name": "P", "quantity": 2, "unit_price": float("inf"), "total": 20}]},
])
def test_purchase_rejects_invalid_totals_payment_and_items(overrides):
    with pytest.raises(ValidationError):
        PurchaseCreate(**purchase_payload(**overrides))


@pytest.mark.parametrize("expiry", ["not-a-date", "2026-02-30", "2026-11-08T00:00:00", "08/11/2026"])
def test_purchase_rejects_invalid_expiry(expiry):
    payload = purchase_payload()
    payload["items"][0]["expiry_date"] = expiry
    with pytest.raises(ValidationError):
        PurchaseCreate(**payload)


def test_lot_accepts_valid_expiry_and_zero_alert():
    lot = ProductLotCreate(expiry_date="2026-11-28", quantity=0, alert_days=0)
    assert lot.expiry_date == "2026-11-28"
    assert lot.alert_days == 0


@pytest.mark.parametrize("overrides", [
    {"quantity": -1}, {"quantity": float("nan")}, {"quantity": float("inf")},
    {"alert_days": -1}, {"alert_days": 3651},
    {"expiry_date": ""}, {"expiry_date": "not-a-date"}, {"expiry_date": "2026-02-30"},
])
def test_lot_rejects_invalid_quantity_alert_and_expiry(overrides):
    payload = {"expiry_date": "2026-11-28", "quantity": 1, "alert_days": 30}
    payload.update(overrides)
    with pytest.raises(ValidationError):
        ProductLotCreate(**payload)


def test_supplier_link_create_trims_supplier_and_accepts_zero_price():
    link = ProductSupplierLinkCreate(supplier_id="  TEST-P492-supplier  ", purchase_price=0)
    assert link.supplier_id == "TEST-P492-supplier"
    assert link.purchase_price == 0
    assert link.is_default is False


@pytest.mark.parametrize("price", [-0.01, float("nan"), float("inf"), float("-inf")])
def test_supplier_link_create_rejects_invalid_prices(price):
    with pytest.raises(ValidationError):
        ProductSupplierLinkCreate(supplier_id="TEST-P492-supplier", purchase_price=price)


@pytest.mark.parametrize("supplier_id", ["", "   "])
def test_supplier_link_create_rejects_blank_supplier(supplier_id):
    with pytest.raises(ValidationError):
        ProductSupplierLinkCreate(supplier_id=supplier_id)


@pytest.mark.parametrize("price", [-0.01, float("nan"), float("inf")])
def test_supplier_link_update_rejects_invalid_prices(price):
    with pytest.raises(ValidationError):
        ProductSupplierLinkUpdate(purchase_price=price)


def test_supplier_link_update_ignores_unset_fields():
    update = ProductSupplierLinkUpdate(purchase_price=85, is_default=False)
    assert update.model_dump(exclude_unset=True, exclude_none=True) == {
        "purchase_price": 85.0,
        "is_default": False,
    }


def test_supplier_link_mongo_id_is_deterministic_and_pair_specific():
    from routes.products_routes import product_supplier_link_mongo_id

    first = product_supplier_link_mongo_id("TEST-P492-product", "TEST-P492-supplier")
    assert first == product_supplier_link_mongo_id("TEST-P492-product", "TEST-P492-supplier")
    assert first != product_supplier_link_mongo_id("TEST-P492-product", "TEST-P492-other")


@pytest.mark.parametrize("name", ["", "   "])
def test_warehouse_rejects_blank_name(name):
    with pytest.raises(ValidationError):
        WarehouseCreate(name=name)


def test_warehouse_name_is_trimmed():
    assert WarehouseCreate(name="  Main  ").name == "Main"


@pytest.mark.parametrize("quantity", [0, -1, float("nan"), float("inf")])
def test_stock_transfer_rejects_nonpositive_or_nonfinite_quantity(quantity):
    with pytest.raises(ValidationError):
        StockTransferCreate(from_warehouse="a", to_warehouse="b", product_id="p", quantity=quantity)


@pytest.mark.parametrize("counted_items", [
    {"p": -1}, {"p": float("nan")}, {"p": float("inf")}, {"": 1},
])
def test_inventory_rejects_invalid_counted_items(counted_items):
    with pytest.raises(ValidationError):
        InventorySessionUpdate(counted_items=counted_items)


def test_inventory_accepts_zero_count():
    update = InventorySessionUpdate(counted_items={"p": 0})
    assert update.counted_items == {"p": 0.0}


class EmptyCursor:
    def __aiter__(self):
        return self

    async def __anext__(self):
        raise StopAsyncIteration


class Recipes:
    def __init__(self, expected_session):
        self.expected_session = expected_session
        self.called = False

    def find(self, query, session=None):
        self.called = True
        assert session is self.expected_session
        assert query["components.product_id"]["$in"] == ["TEST-P492-product"]
        return EmptyCursor()


class DB:
    def __init__(self, expected_session):
        self.recipes = Recipes(expected_session)


def test_cost_drift_uses_the_purchase_transaction_session():
    marker = object()
    db = DB(marker)
    alerts = asyncio.run(check_cost_drift(
        db,
        [{"product_id": "TEST-P492-product", "name": "TEST-P492", "old_price": 10, "new_price": 20}],
        ref_label="TEST-P492",
        session=marker,
    ))
    assert alerts == []
    assert db.recipes.called


class WarehouseStockCollection:
    def __init__(self, stock=None):
        self.stock = stock
        self.inserted = None
        self.atomic_update = None

    async def find_one(self, query, session=None):
        return self.stock

    async def insert_one(self, doc, session=None):
        self.inserted = doc

    async def find_one_and_update(self, query, update, session=None, return_document=None):
        self.atomic_update = (query, update)
        if self.stock["quantity"] < query.get("quantity", {}).get("$gte", float("-inf")):
            return None
        self.stock["quantity"] += update["$inc"]["quantity"]
        return self.stock


class WarehouseStockDB:
    def __init__(self, stock=None):
        self.warehouse_stock = WarehouseStockCollection(stock)


def test_warehouse_stock_initialization_uses_unique_mongo_id():
    from services.warehouse_stock import adjust_warehouse_stock, warehouse_stock_id
    db = WarehouseStockDB()
    quantity = asyncio.run(adjust_warehouse_stock(
        db, "TEST-P492-product", "TEST-P492-main", -2,
        product_quantity_before=20, session=None,
    ))
    expected_id = warehouse_stock_id("TEST-P492-product", "TEST-P492-main")
    assert quantity == 18
    assert db.warehouse_stock.inserted["_id"] == expected_id
    assert db.warehouse_stock.inserted["id"] == expected_id
    assert db.warehouse_stock.inserted["quantity"] == 18


def test_warehouse_stock_existing_balance_uses_atomic_increment():
    from services.warehouse_stock import adjust_warehouse_stock
    db = WarehouseStockDB({"_id": "mongo-id", "id": "logical-id", "quantity": 20.0})
    quantity = asyncio.run(adjust_warehouse_stock(
        db, "TEST-P492-product", "TEST-P492-main", -2,
        product_quantity_before=20, session=None,
    ))
    query, update = db.warehouse_stock.atomic_update
    assert quantity == 18
    assert query == {"_id": "mongo-id", "quantity": {"$gte": 2.0}}
    assert update["$inc"] == {"quantity": -2.0}
    assert "$set" in update and "quantity" not in update["$set"]


def test_warehouse_stock_rejects_atomic_overdraw():
    from fastapi import HTTPException
    from services.warehouse_stock import adjust_warehouse_stock
    db = WarehouseStockDB({"_id": "mongo-id", "id": "logical-id", "quantity": 1.0})
    with pytest.raises(HTTPException) as error:
        asyncio.run(adjust_warehouse_stock(
            db, "TEST-P492-product", "TEST-P492-main", -2,
            product_quantity_before=20, session=None,
        ))
    assert error.value.status_code == 400
    assert db.warehouse_stock.stock["quantity"] == 1.0


def test_inventory_code_generation_requires_tenant_context():
    from routes.utility_routes import create_utility_routes

    async def require_tenant():
        return {"tenant_id": "TEST-P492-tenant"}

    router = create_utility_routes(None, require_tenant, require_tenant, ProductLotCreate)
    route = next(item for item in router.routes
                 if item.path == "/inventory-sessions/generate-code")
    assert any(dependency.call is require_tenant
               for dependency in route.dependant.dependencies)


class FakeLowStockCursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, limit):
        return self.rows[:limit]


def evaluate_inventory_expression(expression, product):
    if isinstance(expression, str) and expression.startswith("$"):
        return product.get(expression[1:])
    if isinstance(expression, dict):
        if "$ifNull" in expression:
            value, fallback = expression["$ifNull"]
            resolved = evaluate_inventory_expression(value, product)
            return resolved if resolved is not None else evaluate_inventory_expression(fallback, product)
        for operator in ("$lt", "$lte"):
            if operator in expression:
                left, right = expression[operator]
                left = evaluate_inventory_expression(left, product)
                right = evaluate_inventory_expression(right, product)
                if left is None or right is None:
                    return operator == "$lte" and left is right
                return left < right if operator == "$lt" else left <= right
    return expression


class FakeLowStockProducts:
    def __init__(self):
        self.rows = [
            {"id": "low", "name": "TEST-P492 low", "quantity": 2, "low_stock_threshold": 3},
            {"id": "edge", "name": "TEST-P492 edge", "quantity": 3, "low_stock_threshold": 3},
            {"id": "default", "name": "TEST-P492 default", "quantity": 9},
            {"id": "high", "name": "TEST-P492 high", "quantity": 11, "low_stock_threshold": 10},
        ]
        self.last_matches = []

    def find(self, query, *args, **kwargs):
        expression = query.get("$expr", {})
        self.last_matches = [row["id"] for row in self.rows
                             if evaluate_inventory_expression(expression, row)]
        return FakeLowStockCursor([
            row for row in self.rows if row["id"] in self.last_matches
        ])


class FakeSendGridSettings:
    async def find_one(self, query, *args, **kwargs):
        return {
            "type": "sendgrid_settings",
            "enabled": True,
            "low_stock_notification": True,
            "api_key": "TEST-P492-not-a-real-key",
            "sender_email": "test-p492@example.com",
            "notification_email": "test-p492-recipient@example.com",
        }


class FakeLowStockDB:
    def __init__(self):
        self.products = FakeLowStockProducts()
        self.system_settings = FakeSendGridSettings()


def test_enabled_low_stock_email_uses_canonical_fields_without_external_send(monkeypatch):
    import routes.sendgrid_email_routes as email_routes

    sent = []

    class FakeSendGridClient:
        def __init__(self, api_key):
            self.api_key = api_key

        def send(self, mail):
            sent.append(mail)

            class Response:
                status_code = 202

            return Response()

    async def require_tenant():
        return {"tenant_id": "TEST-P492-tenant"}

    monkeypatch.setattr(email_routes, "SENDGRID_AVAILABLE", True)
    monkeypatch.setattr(email_routes, "SendGridAPIClient", FakeSendGridClient)
    monkeypatch.setattr("services.crypto_fields.decrypt_field", lambda value: value)
    db = FakeLowStockDB()
    router = email_routes.create_sendgrid_email_routes(
        db, None, require_tenant, require_tenant, require_tenant, require_tenant,
    )
    route = next(item for item in router.routes
                 if item.path == "/notifications/check-low-stock")
    response = asyncio.run(route.endpoint(user={"tenant_id": "TEST-P492-tenant"}))

    assert response["success"] is True
    assert db.products.last_matches == ["low", "default"]
    assert "2" in response["message"]
    assert len(sent) == 1


def test_product_excel_headers_require_names_and_reject_duplicates():
    from fastapi import HTTPException
    from routes.notifications_routes import validate_product_excel_headers

    assert validate_product_excel_headers(["الاسم (إنجليزي)", "الكمية"]) == [
        "الاسم (إنجليزي)", "الكمية"
    ]
    for header in (["الكمية"], ["الاسم (عربي)", "الاسم (عربي)"], []):
        with pytest.raises(HTTPException) as error:
            validate_product_excel_headers(header)
        assert error.value.status_code == 400


@pytest.mark.parametrize("value", ["=1+1", "+SUM(A1:A2)", "-1+2", "@command"])
def test_product_excel_formula_prefixes_roundtrip_as_text(value):
    from openpyxl import Workbook, load_workbook
    from routes.notifications_routes import set_product_excel_cell

    workbook = Workbook()
    set_product_excel_cell(workbook.active["A1"], value)
    output = io.BytesIO()
    workbook.save(output)
    output.seek(0)
    cell = load_workbook(output, data_only=False).active["A1"]
    assert cell.value == value
    assert cell.data_type == "s"


def test_product_excel_negative_number_remains_numeric():
    from openpyxl import Workbook
    from routes.notifications_routes import set_product_excel_cell

    workbook = Workbook()
    cell = set_product_excel_cell(workbook.active["A1"], -1)
    assert cell.value == -1
    assert cell.data_type == "n"
