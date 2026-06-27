"""Iter-21 — Strict email validation on tenant create/update.

Backend now rejects:
  • addresses without TLD ("FOAD@FOAD", "user@localhost")
  • missing @
  • obviously malformed strings

Allowed:
  • standard "name@domain.tld"
  • '+'/'.'/'-'/'_' in local part
  • uppercase (auto-lowered)
"""
import pytest
from pydantic import ValidationError
from routes.saas.schemas import TenantCreate, TenantUpdate


def _payload(email):
    return {
        "name": "X",
        "email": email,
        "password": "Pass@2024",
        "plan_id": "plan_basic",
    }


@pytest.mark.parametrize("bad", [
    "FOAD@FOAD",
    "user@localhost",
    "no-at-sign.com",
    "@nodomain.com",
    "user@",
    "user@@example.com",
    "user@.com",
    "user@example.",
    "   ",
])
def test_tenant_create_rejects_invalid_email(bad):
    with pytest.raises(ValidationError) as exc:
        TenantCreate(**_payload(bad))
    msg = str(exc.value)
    assert "البريد الإلكتروني" in msg or "email" in msg.lower()


@pytest.mark.parametrize("good,expected", [
    ("user@example.com", "user@example.com"),
    ("Admin@NTCommerce.COM", "admin@ntcommerce.com"),  # auto-lowered + stripped
    ("first.last+tag@store.example.co", "first.last+tag@store.example.co"),
    ("a@b.io", "a@b.io"),
    ("  WHITESPACE@example.com  ", "whitespace@example.com"),
])
def test_tenant_create_accepts_valid_email(good, expected):
    t = TenantCreate(**_payload(good))
    assert t.email == expected


def test_tenant_update_email_optional_passes_through_none():
    """Partial PATCH with no email key must not fail."""
    u = TenantUpdate(name="renamed")
    assert u.email is None


def test_tenant_update_rejects_bad_email_when_provided():
    with pytest.raises(ValidationError):
        TenantUpdate(email="BROKEN@LOCAL")


def test_tenant_update_accepts_good_email():
    u = TenantUpdate(email="VALID@example.com")
    assert u.email == "valid@example.com"
