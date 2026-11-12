"""M3 fixed assets — unit tests for straight-line depreciation math."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes.fixed_assets_routes import monthly_depreciation


def test_straight_line_basic():
    assert monthly_depreciation(12000, 0, 12) == 1000.0


def test_salvage_value_deducted():
    assert monthly_depreciation(10000, 1000, 12) == 750.0


def test_never_negative_when_salvage_exceeds_cost():
    assert monthly_depreciation(1000, 5000, 12) == 0.0


def test_zero_months_safe():
    assert monthly_depreciation(12000, 0, 0) == 0.0


def test_rounding_two_decimals():
    assert monthly_depreciation(10000, 0, 3) == 3333.33


def test_string_inputs_coerced():
    assert monthly_depreciation("12000", "0", "12") == 1000.0
