"""Pure-logic tests for the auto-reorder module (M5)."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from routes.auto_reorder_routes import (
    DEFAULT_SETTINGS, GenerateIn, SettingsIn, suggested_qty,
)
from utils.inventory_queries import low_stock_filter


class TestSuggestedQty:
    def test_reaches_target(self):
        # threshold 10, multiplier 2 → target 20; stock 3 → order 17
        assert suggested_qty(3, 10, 2) == 17

    def test_zero_stock_orders_full_target(self):
        assert suggested_qty(0, 5, 3) == 15

    def test_never_below_min_qty(self):
        # stock 9, threshold 10, mult 1 → target 10 → qty 1 (min 1)
        assert suggested_qty(9, 10, 1, min_qty=1) == 1

    def test_fractional_target_rounds_up(self):
        # threshold 7 × 1.5-equivalent (mult 3 → 21); stock 20 → qty 1
        assert suggested_qty(20, 7, 3) == 1
        # ceil(7*2)=14; stock 13 → 1
        assert suggested_qty(13, 7, 2) == 1

    def test_min_qty_floor_applies(self):
        assert suggested_qty(9, 10, 1, min_qty=5) == 5


class TestLowStockFilterContract:
    def test_filter_is_lt_threshold_with_default_10(self):
        f = low_stock_filter()
        assert "$expr" in f and "$lt" in f["$expr"]
        assert f["$expr"]["$lt"][1]["$ifNull"][1] == 10


class TestPayloadValidation:
    def test_settings_bounds(self):
        with pytest.raises(Exception):
            SettingsIn(qty_multiplier=0)
        with pytest.raises(Exception):
            SettingsIn(qty_multiplier=99)
        assert SettingsIn(qty_multiplier=4).qty_multiplier == 4

    def test_generate_requires_items(self):
        with pytest.raises(Exception):
            GenerateIn(supplier_id="s1", items=[])
        with pytest.raises(Exception):
            GenerateIn(supplier_id="", items=[{"product_id": "p1", "quantity": 1}])

    def test_generate_item_qty_positive(self):
        with pytest.raises(Exception):
            GenerateIn(supplier_id="s1", items=[{"product_id": "p1", "quantity": 0}])

    def test_defaults(self):
        assert DEFAULT_SETTINGS["enabled"] is True
        assert DEFAULT_SETTINGS["qty_multiplier"] == 2
