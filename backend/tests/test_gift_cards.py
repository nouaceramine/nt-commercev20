"""M2 gift cards — unit tests for the card status logic.

_fresh_status decides the effective card state from (stored status, expiry,
balance): disabled is sticky, expiry beats depletion, zero balance depletes.
"""
import sys
import os
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes.gift_cards_routes import _fresh_status, CARD_STATUSES, TX_TYPES


def _card(status="active", balance=100.0, expires_at=None):
    return {"status": status, "balance": balance, "expires_at": expires_at}


def test_active_card_stays_active():
    assert _fresh_status(_card()) == "active"


def test_disabled_is_sticky():
    assert _fresh_status(_card(status="disabled", balance=100)) == "disabled"
    assert _fresh_status(_card(status="disabled", balance=0)) == "disabled"


def test_zero_balance_is_depleted():
    assert _fresh_status(_card(balance=0)) == "depleted"
    assert _fresh_status(_card(balance=-5)) == "depleted"


def test_expired_beats_balance():
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    assert _fresh_status(_card(balance=100, expires_at=past)) == "expired"
    assert _fresh_status(_card(balance=0, expires_at=past)) == "expired"


def test_future_expiry_keeps_active():
    future = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    assert _fresh_status(_card(balance=100, expires_at=future)) == "active"


def test_disabled_never_expires_back():
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    assert _fresh_status(_card(status="disabled", expires_at=past)) == "disabled"


def test_constants_cover_known_states():
    assert set(CARD_STATUSES) == {"active", "depleted", "disabled", "expired"}
    assert set(TX_TYPES) == {"issue", "topup", "redeem", "adjust"}
