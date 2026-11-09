"""P492 validation and transactional-helper regression tests."""
import asyncio

import pytest
from pydantic import ValidationError

from models.schemas.catalog import ProductCreate, ProductLotCreate, ProductUpdate
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
