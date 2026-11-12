"""Pure-logic tests for the payroll module (M6)."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from routes.payroll_routes import MONTH_RE, _month_bounds, compute_net, GenerateIn, PayIn


class TestComputeNet:
    def test_basic(self):
        assert compute_net(50000, 2500, 10000) == 42500

    def test_no_commission_no_advances(self):
        assert compute_net(30000, 0, 0) == 30000

    def test_advances_can_exceed(self):
        # negative net is computed; the pay endpoint rejects <= 0
        assert compute_net(10000, 0, 15000) == -5000

    def test_rounding(self):
        # all operands exactly representable in binary float
        assert compute_net(10000.25, 0.25, 0) == 10000.5
        assert compute_net(0.1 + 0.2, 0, 0) == 0.3


class TestMonthBounds:
    def test_mid_year(self):
        start, end = _month_bounds("2026-06")
        assert start.startswith("2026-06-01") and end.startswith("2026-07-01")

    def test_december_rolls_year(self):
        start, end = _month_bounds("2026-12")
        assert start.startswith("2026-12-01") and end.startswith("2027-01-01")


class TestPayloadValidation:
    def test_month_pattern_enforced(self):
        GenerateIn(month="2026-01")
        GenerateIn(month="2026-12")
        with pytest.raises(Exception):
            GenerateIn(month="2026-13")
        with pytest.raises(Exception):
            GenerateIn(month="26-01")
        with pytest.raises(Exception):
            GenerateIn(month="2026-00")

    def test_pay_defaults(self):
        assert PayIn().box == "cash"

    def test_month_regex(self):
        import re
        assert re.match(MONTH_RE, "2026-11")
        assert not re.match(MONTH_RE, "2026-1")
