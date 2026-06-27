"""Iter-20 — email templates smoke tests (pure render, no SMTP).

Asserts that each public template returns (subject:str, html:str) where the HTML:
  • Starts with <!doctype html>
  • Is RTL (dir="rtl")
  • Contains the expected dynamic data (tenant name, amount, code, etc.)
  • Properly HTML-escapes inputs (XSS-safe)
"""
from services.email_templates import (
    welcome_tenant_email,
    debt_reminder_email,
    impersonation_notice_email,
    order_confirmation_email,
    generic_alert_email,
)


def test_welcome_email_includes_tenant_and_company():
    subject, html = welcome_tenant_email(
        tenant_name="أحمد",
        company_name="<script>متجر</script>",
        login_url="https://app.example.com/login",
    )
    assert "مرحباً بك" in subject
    assert html.startswith("<!doctype html>")
    assert 'dir="rtl"' in html
    assert "أحمد" in html
    # XSS-safe: tag escaped
    assert "<script>متجر</script>" not in html
    assert "&lt;script&gt;" in html
    # CTA rendered
    assert "https://app.example.com/login" in html


def test_debt_reminder_email_renders_amount():
    subject, html = debt_reminder_email(tenant_name="Co X", amount_due=12345.67)
    assert "12 345.67" in html or "12345.67" in html
    assert "12 345.67" in subject or "12345.67" in subject
    assert "دج" in html


def test_impersonation_notice_email_contains_audit_details():
    subject, html = impersonation_notice_email(
        tenant_name="Tenant Y",
        admin_email="admin@nt.com",
        started_at="2026-02-20T10:00:00Z",
        ip="1.2.3.4",
    )
    assert "Tenant Y" in html
    assert "admin@nt.com" in html
    assert "2026-02-20T10:00:00Z" in html
    assert "1.2.3.4" in html
    assert "🔐" in subject


def test_order_confirmation_email_renders_items_table():
    subject, html = order_confirmation_email(
        store_name="My Store",
        order_code="ECO-AB12CD34",
        customer_name="Ali",
        items=[{"name": "iPhone case", "qty": 2, "total": 1200},
               {"name": "USB cable", "qty": 1, "total": 450}],
        total=1650,
    )
    assert "ECO-AB12CD34" in subject
    assert "ECO-AB12CD34" in html
    assert "iPhone case" in html
    assert "USB cable" in html
    assert "Ali" in html
    # Total formatted with thousand-space separator
    assert "1 650" in html or "1650" in html


def test_generic_alert_email_severity_styles():
    for sev in ("info", "warning", "critical"):
        subject, html = generic_alert_email(
            title=f"alert-{sev}",
            message="something happened",
            severity=sev,
        )
        assert f"alert-{sev}" in subject
        assert "something happened" in html
        assert 'dir="rtl"' in html
