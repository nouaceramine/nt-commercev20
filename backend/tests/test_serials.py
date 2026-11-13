"""D1: pure-logic tests — serial lifecycle transitions + warranty computation."""
import os
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from routes.serials_routes import serial_transition_ok, warranty_info


def test_allowed_transitions():
    assert serial_transition_ok("in_stock", "defective")
    assert serial_transition_ok("sold", "defective")
    assert serial_transition_ok("defective", "repaired")
    assert serial_transition_ok("defective", "in_stock")
    assert serial_transition_ok("repaired", "in_stock")


def test_forbidden_transitions():
    assert not serial_transition_ok("sold", "in_stock")   # must go through sale return
    assert not serial_transition_ok("in_stock", "sold")   # sale flow only
    assert not serial_transition_ok("sold", "repaired")
    assert not serial_transition_ok("repaired", "defective")
    assert not serial_transition_ok("in_stock", "in_stock")


def test_warranty_none_without_months():
    assert warranty_info({})["warranty_status"] == "none"
    assert warranty_info({"warranty_months": 12})["warranty_status"] == "none"  # not sold yet


def test_warranty_active():
    doc = {"warranty_months": 12, "sold_at": (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()}
    w = warranty_info(doc)
    assert w["warranty_status"] == "active"
    assert w["warranty_expires_at"]


def test_warranty_expired():
    doc = {"warranty_months": 6, "sold_at": (datetime.now(timezone.utc) - timedelta(days=400)).isoformat()}
    assert warranty_info(doc)["warranty_status"] == "expired"


def test_warranty_bad_date_graceful():
    doc = {"warranty_months": 6, "sold_at": "not-a-date"}
    assert warranty_info(doc)["warranty_status"] == "unknown"


def test_warranty_tz_naive_mongo_roundtrip():
    # BSON strips tzinfo — pymongo returns naive datetimes; must not degrade to "unknown"
    doc = {"warranty_months": 12, "sold_at": datetime.utcnow() - timedelta(days=30)}
    w = warranty_info(doc)
    assert w["warranty_status"] == "active"
    assert w["warranty_expires_at"]
    doc2 = {"warranty_months": 6, "sold_at": datetime.utcnow() - timedelta(days=400)}
    assert warranty_info(doc2)["warranty_status"] == "expired"
