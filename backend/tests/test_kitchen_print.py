# -*- coding: utf-8 -*-
"""D2: pure-logic tests — ESC/POS kitchen ticket builder + settings validation."""
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.escpos import (
    CUT,
    INIT,
    build_kot_escpos,
    build_test_escpos,
    _fmt_qty,
)
from routes.kitchen_print_routes import validate_kitchen_printer


ORDER = {
    "id": "kch_test1",
    "code": "KCH-20261113-0001",
    "table_name": "T5",
    "source": "waiter",
    "notes": "بدون بصل",
    "created_at": datetime(2026, 11, 13, 10, 0, tzinfo=timezone.utc),
    "items": [
        {"product_name": "بيتزا خضار", "quantity": 2, "note": "حار",
         "variant": {"name": "وسط"}, "modifiers": [{"name": "جبن إضافي"}]},
        {"product_name": "عصير برتقال", "quantity": 1.5},
    ],
}


def test_structure_init_and_cut():
    payload = build_kot_escpos(ORDER, store_name="مطعم التجربة")
    assert payload.startswith(INIT)
    assert payload.endswith(CUT)


def test_contains_code_table_items():
    text = build_kot_escpos(ORDER, store_name="مطعم التجربة").decode("cp1256")
    assert "KCH-20261113-0001" in text
    assert "T5" in text
    assert "2 x بيتزا".replace("بيتزا", "بيتزا") or True  # shape check below
    assert "2 x بيتزا خضار" in text
    assert "1.5 x عصير برتقال" in text
    assert "! حار" in text
    assert "+ جبن إضافي" in text
    assert "• وسط" in text
    assert "ملاحظة: بدون بصل" in text
    assert "المصدر: waiter" in text


def test_qty_formatting():
    assert _fmt_qty(2) == "2"
    assert _fmt_qty(1.5) == "1.5"
    assert _fmt_qty("x") == "x"


def test_long_name_truncated():
    long_order = {"code": "C1", "items": [{"product_name": "ا" * 100, "quantity": 1}]}
    text = build_kot_escpos(long_order, width=32).decode("cp1256")
    visible = re.sub(r"[\x1b\x1d].", "", text)  # strip ESC/GS control pairs
    lines = [ln for ln in visible.split("\n") if "ا" in ln]
    assert all(len(ln) <= 32 for ln in lines)
    assert any(".." in ln for ln in lines)


def test_bad_encoding_falls_back():
    payload = build_kot_escpos(ORDER, encoding="latin-9")
    assert payload.startswith(INIT) and payload.endswith(CUT)


def test_empty_items_and_no_table():
    payload = build_kot_escpos({"code": "C2", "items": []})
    assert payload.startswith(INIT) and payload.endswith(CUT)
    assert b"T5" not in payload


def test_test_ticket():
    payload = build_test_escpos("مطعم")
    text = payload.decode("cp1256")
    assert "TEST-PRINT" in text and "اختبار" in text


def test_validate_settings():
    assert validate_kitchen_printer({"enabled": True, "host": "192.168.1.50"}) == []
    assert "host_required" in validate_kitchen_printer({"enabled": True, "host": ""})
    assert "bad_port" in validate_kitchen_printer({"port": 0})
    assert "bad_port" in validate_kitchen_printer({"port": "abc"})
    assert "bad_encoding" in validate_kitchen_printer({"encoding": "utf-16"})
    assert "bad_width" in validate_kitchen_printer({"width": 100})
    assert "bad_copies" in validate_kitchen_printer({"copies": 9})
    assert validate_kitchen_printer({}) == []
