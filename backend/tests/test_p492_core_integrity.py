"""P492 validation and transactional-helper regression tests."""
import asyncio

import pytest
from pydantic import ValidationError

from models.schemas.catalog import ProductCreate, ProductLotCreate, ProductUpdate
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
