"""Kiosk module — pure-helper tests (no DB, no FastAPI app)."""
import hashlib

from routes.kiosk_routes import (
    _hash_token,
    _normalize_phone,
    _request_summary,
    MAX_CARD_QTY,
    MAX_CREATE_PER_MINUTE,
    MAX_PENDING_PER_SESSION,
    REQUEST_TTL_MINUTES,
)


class TestNormalizePhone:
    def test_plain_mobile_accepted(self):
        assert _normalize_phone("0550123456") == "0550123456"

    def test_spaces_and_dashes_stripped(self):
        assert _normalize_phone("0550 12 34 56") == "0550123456"
        assert _normalize_phone("0550-12-34-56") == "0550123456"

    def test_international_prefix_normalized(self):
        assert _normalize_phone("+213550123456") == "0550123456"
        assert _normalize_phone("213550123456") == "0550123456"

    def test_all_operators_prefixes(self):
        assert _normalize_phone("0612345678") == "0612345678"  # mobilis
        assert _normalize_phone("0712345678") == "0712345678"  # djezzy
        assert _normalize_phone("0512345678") == "0512345678"  # ooredoo

    def test_invalid_rejected(self):
        assert _normalize_phone("") == ""
        assert _normalize_phone("12345") == ""
        assert _normalize_phone("0412345678") == ""   # not a mobile prefix
        assert _normalize_phone("055012345678") == ""  # too long
        assert _normalize_phone("055012345") == ""     # too short
        assert _normalize_phone("abcdefghij") == ""


class TestHashToken:
    def test_deterministic_sha256(self):
        assert _hash_token("abc") == hashlib.sha256(b"abc").hexdigest()

    def test_distinct_tokens_distinct_hashes(self):
        assert _hash_token("token-a") != _hash_token("token-b")


class TestRequestSummary:
    def test_recharge_summary(self):
        doc = {"kind": "recharge", "operator_name": "موبيليس", "amount": 500.0,
               "phone_number": "0550123456"}
        assert "موبيليس" in _request_summary(doc)
        assert "0550123456" in _request_summary(doc)
        assert "500" in _request_summary(doc)

    def test_card_summary_with_qty(self):
        doc = {"kind": "card", "card_name": "جازي 200", "quantity": 2}
        s = _request_summary(doc)
        assert "جازي 200" in s and "2" in s

    def test_card_summary_single_qty_omits_suffix(self):
        doc = {"kind": "card", "card_name": "موبيليس 100", "quantity": 1}
        assert "×" not in _request_summary(doc)


class TestLimits:
    def test_limits_are_sane(self):
        assert 1 <= MAX_CREATE_PER_MINUTE <= 60
        assert 1 <= MAX_PENDING_PER_SESSION <= 100
        assert 1 <= MAX_CARD_QTY <= 20
        assert 5 <= REQUEST_TTL_MINUTES <= 240
