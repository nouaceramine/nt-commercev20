"""M13: pure-logic tests — phone normalization, pipeline transitions,
unit↔client matching, campaign metrics, marketer performance score."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from routes.crm_routes import (
    normalize_phone, client_status_transition, score_unit_for_client, u_type_match,
)
from routes.crm_growth_routes import campaign_metrics, performance_score


# ── normalize_phone ─────────────────────────────────────────────────────────
def test_phone_digits_only():
    assert normalize_phone("0555-00 11 22") == "0555001122"


def test_phone_international_prefix():
    assert normalize_phone("+213555001122") == "0555001122"
    assert normalize_phone("00213555001122") == "0555001122"


def test_phone_empty():
    assert normalize_phone("") == ""
    assert normalize_phone(None) == ""


# ── client_status_transition ────────────────────────────────────────────────
def test_pipeline_forward_moves():
    assert client_status_transition("new", "contacted")
    assert client_status_transition("interested", "negotiation")
    assert client_status_transition("negotiation", "won")


def test_terminal_states_locked():
    assert not client_status_transition("won", "lost")
    assert not client_status_transition("lost", "new")


def test_same_state_rejected():
    assert not client_status_transition("new", "new")


# ── score_unit_for_client ───────────────────────────────────────────────────
def test_perfect_match_scores_100():
    unit = {"price": 9000000, "wilaya": "الجزائر", "unit_type": "apartment"}
    client = {"budget_min": 8000000, "budget_max": 10000000, "wilaya": "الجزائر", "unit_type_pref": "apartment"}
    assert score_unit_for_client(unit, client) == 100


def test_budget_only():
    unit = {"price": 5000000, "wilaya": "وهران", "unit_type": "villa"}
    client = {"budget_min": 4000000, "budget_max": 6000000, "wilaya": "الجزائر", "unit_type_pref": "apartment"}
    assert score_unit_for_client(unit, client) == 50


def test_slightly_over_budget_partial():
    unit = {"price": 1100000, "unit_type": "land"}
    client = {"budget_min": 0, "budget_max": 1000000, "unit_type_pref": "land"}
    assert score_unit_for_client(unit, client) == 20 + 25


def test_cheaper_than_budget_scores_35():
    unit = {"price": 1000000}
    client = {"budget_min": 2000000, "budget_max": 5000000}
    assert score_unit_for_client(unit, client) == 35


def test_no_match_zero():
    unit = {"price": 99000000, "wilaya": "عنابة", "unit_type": "villa"}
    client = {"budget_min": 1000000, "budget_max": 2000000, "wilaya": "جيجل", "unit_type_pref": "land"}
    assert score_unit_for_client(unit, client) == 0


def test_u_type_match_list_and_scalar():
    assert u_type_match("villa", ["villa", "land"])
    assert u_type_match("villa", "villa")
    assert not u_type_match("villa", "land")
    assert not u_type_match("villa", None)


# ── campaign_metrics ────────────────────────────────────────────────────────
def test_metrics_normal():
    m = campaign_metrics(100000, 50, 5)
    assert m["cost_per_lead"] == 2000
    assert m["cost_per_conversion"] == 20000
    assert m["conversion_rate"] == 10.0


def test_metrics_zero_leads():
    m = campaign_metrics(5000, 0, 0)
    assert m["cost_per_lead"] is None
    assert m["conversion_rate"] is None


# ── performance_score ───────────────────────────────────────────────────────
def test_score_weights():
    # 1 conversion (40) + 2 tasks (40) + 1 viewing (10) + 3 convs (6) + 0 activity
    assert performance_score(3, 1, 2, 1, 0) == 96.0


def test_score_activity_capped():
    s1 = performance_score(0, 0, 0, 0, 160 * 60)   # 160h → full 10
    s2 = performance_score(0, 0, 0, 0, 1000 * 60)  # capped
    assert s1 == 10.0 and s2 == 10.0


def test_score_zero():
    assert performance_score(0, 0, 0, 0, 0) == 0.0
    assert performance_score(0, 0, 0, 0, None) == 0.0


# ── M13c: report scheduling helpers ─────────────────────────────────────────
def test_period_key_weekly_monthly():
    from datetime import datetime, timezone, timedelta
    from services.crm_reports import period_key
    tz = timezone(timedelta(hours=1))
    d = datetime(2026, 11, 13, 10, 0, tzinfo=tz)  # Friday
    assert period_key("weekly", d) == "W:2026-W46"
    assert period_key("monthly", d) == "M:2026-11"
    try:
        period_key("daily", d)
        assert False
    except ValueError:
        pass


def test_is_report_due_rules():
    from datetime import datetime, timezone, timedelta
    from services.crm_reports import is_report_due
    tz = timezone(timedelta(hours=1))
    mon_8 = datetime(2026, 11, 16, 8, 0, tzinfo=tz)   # Monday 08:00
    mon_9 = datetime(2026, 11, 16, 9, 0, tzinfo=tz)
    tue_8 = datetime(2026, 11, 17, 8, 0, tzinfo=tz)
    first_8 = datetime(2026, 12, 1, 8, 0, tzinfo=tz)
    second_8 = datetime(2026, 12, 2, 8, 0, tzinfo=tz)
    assert is_report_due("weekly", mon_8)
    assert not is_report_due("weekly", mon_9)
    assert not is_report_due("weekly", tue_8)
    assert is_report_due("monthly", first_8)
    assert not is_report_due("monthly", second_8)
    assert not is_report_due("monthly", mon_8)
