"""Pure-logic tests for the generalized bookings module (M7)."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from routes.bookings_routes import (
    ALLOWED_TRANSITIONS, RESOURCE_TYPES, _parse_iso, intervals_overlap,
    BookingIn, ResourceIn,
)


class TestOverlap:
    A = ("2026-12-01T10:00:00Z", "2026-12-01T12:00:00Z")

    def test_full_overlap(self):
        assert intervals_overlap(*self.A, "2026-12-01T11:00:00Z", "2026-12-01T13:00:00Z")

    def test_contained(self):
        assert intervals_overlap(*self.A, "2026-12-01T10:30:00Z", "2026-12-01T11:30:00Z")

    def test_back_to_back_allowed(self):
        # half-open intervals: ending exactly when the other starts = no clash
        assert not intervals_overlap(*self.A, "2026-12-01T12:00:00Z", "2026-12-01T14:00:00Z")
        assert not intervals_overlap(*self.A, "2026-12-01T08:00:00Z", "2026-12-01T10:00:00Z")

    def test_disjoint(self):
        assert not intervals_overlap(*self.A, "2026-12-02T10:00:00Z", "2026-12-02T12:00:00Z")

    def test_one_minute_overlap_counts(self):
        assert intervals_overlap(*self.A, "2026-12-01T11:59:00Z", "2026-12-01T13:00:00Z")


class TestParseIso:
    def test_z_passthrough(self):
        assert _parse_iso("2026-12-01T10:00:00Z") == "2026-12-01T10:00:00Z"

    def test_offset_normalized_to_z(self):
        assert _parse_iso("2026-12-01T11:00:00+01:00") == "2026-12-01T10:00:00Z"

    def test_naive_treated_utc(self):
        assert _parse_iso("2026-12-01T10:00:00") == "2026-12-01T10:00:00Z"

    def test_garbage_rejected(self):
        assert _parse_iso("not a date") is None
        assert _parse_iso("") is None


class TestTransitions:
    def test_booked_paths(self):
        assert ALLOWED_TRANSITIONS["booked"] == {"confirmed", "cancelled", "no_show"}

    def test_completed_terminal(self):
        assert not ALLOWED_TRANSITIONS["completed"]
        assert not ALLOWED_TRANSITIONS["cancelled"]

    def test_no_reopen(self):
        assert "booked" not in ALLOWED_TRANSITIONS["cancelled"]


class TestPayloads:
    def test_booking_requires_resource_and_name(self):
        with pytest.raises(Exception):
            BookingIn(resource_id="", customer_name="x", start="a", end="b")
        with pytest.raises(Exception):
            BookingIn(resource_id="r", customer_name="", start="a", end="b")

    def test_deposit_nonnegative(self):
        with pytest.raises(Exception):
            BookingIn(resource_id="r", customer_name="x", start="a", end="b", deposit=-5)

    def test_resource_defaults(self):
        r = ResourceIn(name="قاعة 1")
        assert r.type == "other" and r.capacity == 1

    def test_resource_types_known(self):
        assert "room" in RESOURCE_TYPES and "vehicle" in RESOURCE_TYPES
