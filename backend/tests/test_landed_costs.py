# -*- coding: utf-8 -*-
"""D3: pure-logic tests — landed cost distribution + validation."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from routes.landed_costs_routes import distribute_landed, validate_landed

ITEMS = [
    {"product_id": "p1", "product_name": "A", "quantity": 10, "unit_price": 100.0},   # base 1000
    {"product_id": "p2", "product_name": "B", "quantity": 5, "unit_price": 200.0},    # base 1000
    {"product_id": "p3", "product_name": "C", "quantity": 15, "unit_price": 40.0},    # base 600
]
EXTRAS = [{"label": "شحن", "amount": 200.0}, {"label": "جمركة", "amount": 100.0}]      # 300 total


def test_distribute_by_value():
    r = distribute_landed(ITEMS, EXTRAS, "value")
    # shares: 1000/2600, 1000/2600, 600/2600 → 115.38+115.38+69.23=299.99 → remainder 0.01 to a 1000-line
    assert r["total_extra"] == 300.0
    assert r["total_allocated"] == 300.0
    assert abs(sum(l["allocated"] for l in r["lines"]) - 300.0) < 0.001
    a = r["lines"][0]
    assert a["allocated"] in (115.38, 115.39)  # biggest-share line may absorb remainder
    assert a["landed_unit_cost"] == round(100.0 + a["allocated"] / 10, 2)


def test_distribute_by_quantity():
    r = distribute_landed(ITEMS, EXTRAS, "quantity")
    # shares: 10/30, 5/30, 15/30 → 100, 50, 150
    assert [l["allocated"] for l in r["lines"]] == [100.0, 50.0, 150.0]
    assert r["lines"][0]["landed_unit_cost"] == 110.0
    assert r["lines"][1]["landed_unit_cost"] == 210.0
    assert r["lines"][2]["landed_unit_cost"] == 50.0


def test_remainder_goes_to_biggest():
    items = [
        {"product_id": "a", "product_name": "A", "quantity": 1, "unit_price": 10.0},
        {"product_id": "b", "product_name": "B", "quantity": 1, "unit_price": 10.0},
        {"product_id": "c", "product_name": "C", "quantity": 1, "unit_price": 10.0},
    ]
    r = distribute_landed(items, [{"label": "x", "amount": 10.0}], "value")
    allocs = [l["allocated"] for l in r["lines"]]
    assert round(sum(allocs), 2) == 10.0
    assert allocs.count(3.33) == 2 and allocs.count(3.34) == 1


def test_zero_totals_no_crash():
    items = [{"product_id": "z", "product_name": "Z", "quantity": 0, "unit_price": 0.0}]
    r = distribute_landed(items, [{"label": "شحن", "amount": 50.0}], "value")
    assert r["total_allocated"] == 50.0  # biggest (only) line absorbs all
    r2 = distribute_landed(items, [{"label": "شحن", "amount": 50.0}], "quantity")
    assert r2["total_allocated"] == 50.0


def test_empty_extras():
    r = distribute_landed(ITEMS, [], "value")
    assert r["total_extra"] == 0.0
    assert all(l["allocated"] == 0.0 for l in r["lines"])
    assert all(l["landed_unit_cost"] == l["unit_price"] for l in r["lines"])


def test_validate():
    assert validate_landed([{"label": "شحن", "amount": 10}], "value") == []
    assert "bad_method" in validate_landed([], "weight")
    assert "label_required" in validate_landed([{"label": " ", "amount": 5}], "value")
    assert "negative_amount" in validate_landed([{"label": "x", "amount": -1}], "value")
    assert "too_many_extras" in validate_landed([{"label": f"e{i}", "amount": 1} for i in range(11)], "value")
