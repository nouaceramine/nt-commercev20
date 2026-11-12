"""Pure-logic tests for the van sales module (M9)."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from routes.van_sales_routes import (
    CloseDayIn, OpenDayIn, LoadIn, VanIn, close_summary, day_variance,
)


class TestDayVariance:
    def test_exact_count(self):
        assert day_variance(5000, 5000) == 0

    def test_shortage(self):
        assert day_variance(5000, 4800) == -200

    def test_overage(self):
        assert day_variance(5000, 5150) == 150


class TestCloseSummary:
    def test_full_summary(self):
        s = close_summary(loads_value=10000, unloads_value=3000,
                          sales_total=6500, expected_cash=6500, counted=6400)
        assert s["loaded_value"] == 10000
        assert s["returned_value"] == 3000
        assert s["sales_total"] == 6500
        assert s["expected_cash"] == 6500
        assert s["cash_counted"] == 6400
        assert s["variance"] == -100

    def test_rounding(self):
        s = close_summary(0.1 + 0.2, 0, 0, 0, 0)
        assert s["loaded_value"] == 0.3


class TestPayloads:
    def test_open_day_date_pattern(self):
        OpenDayIn(van_id="v1", date="2026-11-12")
        with pytest.raises(Exception):
            OpenDayIn(van_id="v1", date="12/11/2026")

    def test_load_items_positive(self):
        with pytest.raises(Exception):
            LoadIn(van_id="v1", items=[{"product_id": "p", "quantity": 0}])
        with pytest.raises(Exception):
            LoadIn(van_id="v1", items=[])

    def test_close_nonnegative(self):
        with pytest.raises(Exception):
            CloseDayIn(cash_counted=-1)

    def test_van_name_required(self):
        with pytest.raises(Exception):
            VanIn(name="")
