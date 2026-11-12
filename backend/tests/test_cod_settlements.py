"""M4 COD settlements — unit tests for batch math and variance classification.

Pure-logic coverage: expected amount = Σ(total − shipping_fee); variance
classification settled vs settled_with_variance; receive entry balance.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _expected(orders):
    return round(sum(float(o.get("total") or 0) - float(o.get("shipping_fee") or 0)
                     for o in orders), 2)


def _status(expected, received):
    return "settled" if abs(round(received - expected, 2)) < 0.01 else "settled_with_variance"


def test_expected_is_net_of_shipping_fees():
    orders = [{"total": 2000, "shipping_fee": 400}, {"total": 3000, "shipping_fee": 500}]
    assert _expected(orders) == 4100.0


def test_missing_fees_treated_as_zero():
    orders = [{"total": 1500}, {"total": 2500, "shipping_fee": None}]
    assert _expected(orders) == 4000.0


def test_exact_receive_is_settled():
    assert _status(4100.0, 4100.0) == "settled"


def test_shortage_is_variance():
    assert _status(4100.0, 4000.0) == "settled_with_variance"


def test_excess_is_variance():
    assert _status(4100.0, 4200.0) == "settled_with_variance"


def test_cent_tolerance():
    assert _status(4100.0, 4100.004) == "settled"


def test_receive_entry_balances_with_shortage():
    # Dr target 4000 + Dr 618 (100) = Cr 534 (4100)
    expected, received = 4100.0, 4000.0
    variance = round(received - expected, 2)
    debit = received + (-variance if variance < 0 else 0)
    credit = expected + (variance if variance > 0 else 0)
    assert round(debit, 2) == round(credit, 2)


def test_receive_entry_balances_with_excess():
    expected, received = 4100.0, 4300.0
    variance = round(received - expected, 2)
    debit = received + (-variance if variance < 0 else 0)
    credit = expected + (variance if variance > 0 else 0)
    assert round(debit, 2) == round(credit, 2)
