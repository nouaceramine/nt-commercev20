"""M1 quotations module — unit tests for totals math and the status machine.

Pure-logic coverage (no DB): line/total computation never trusts the client,
discount is capped at line/subtotal, and the transition table matches the
documented lifecycle draft->sent->accepted/rejected, reopen only to draft.
"""
import sys
import os
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes.quotations_routes import QuoteItem, _totals, ALLOWED_TRANSITIONS, STATUSES


def _item(qty, price, discount=0.0):
    return QuoteItem(product_id="p1", quantity=qty, price=price, discount=discount)


def test_totals_basic():
    lines, sub, disc, total = _totals([_item(2, 100.0), _item(1, 50.0)], 0.0)
    assert sub == 250.0 and total == 250.0 and disc == 0.0
    assert lines[0]["total"] == 200.0


def test_totals_global_discount():
    lines, sub, disc, total = _totals([_item(2, 100.0)], 30.0)
    assert sub == 200.0 and disc == 30.0 and total == 170.0


def test_totals_line_discount_capped_at_line_value():
    lines, sub, disc, total = _totals([_item(1, 100.0, discount=150.0)], 0.0)
    assert lines[0]["discount"] == 100.0 and lines[0]["total"] == 0.0
    assert total == 0.0


def test_totals_global_discount_capped_at_subtotal():
    lines, sub, disc, total = _totals([_item(1, 100.0)], 500.0)
    assert disc == 100.0 and total == 0.0


def test_totals_rounding_two_decimals():
    lines, sub, disc, total = _totals([_item(3, 33.333)], 0.0)
    assert lines[0]["total"] == round(3 * 33.333, 2)


def test_transition_table_is_closed():
    for state, targets in ALLOWED_TRANSITIONS.items():
        assert state in STATUSES
        assert targets <= set(STATUSES)


def test_draft_can_be_sent_accepted_rejected():
    assert ALLOWED_TRANSITIONS["draft"] == {"sent", "accepted", "rejected"}


def test_converted_is_terminal():
    assert ALLOWED_TRANSITIONS["converted"] == set()


def test_rejected_and_expired_reopen_only_to_draft():
    assert ALLOWED_TRANSITIONS["rejected"] == {"draft"}
    assert ALLOWED_TRANSITIONS["expired"] == {"draft"}


def test_accepted_cannot_jump_directly_to_converted_via_status():
    # conversion must go through /convert (creates the sale), not /status
    assert "converted" not in ALLOWED_TRANSITIONS["accepted"]
