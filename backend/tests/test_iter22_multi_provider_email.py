"""Iter-22 — Multi-provider email service tests.

Verifies the provider-selection state-machine in services/email_service.py
WITHOUT hitting real APIs (we monkey-patch the DB loader and HTTP clients).

Why this matters: a wrong provider pick = either silent failure (mock) or wasted
quota (sent via Resend when Brevo was intended).
"""
import pytest
from services.email_service import EmailService, invalidate_email_settings_cache


@pytest.fixture(autouse=True)
def _clear_cache():
    invalidate_email_settings_cache()
    yield
    invalidate_email_settings_cache()


def _mock_settings(monkeypatch, **overrides):
    """Patch DB settings loader to return a deterministic config."""
    async def _fake_load():
        return overrides
    import services.email_service as es
    monkeypatch.setattr(es, "_load_db_settings", _fake_load)


# ── Preference-honouring tests ─────────────────────────────────────────────
@pytest.mark.asyncio
async def test_explicit_brevo_preference_wins(monkeypatch):
    _mock_settings(monkeypatch,
        provider_preference="brevo",
        brevo_api_key="xkeysib-fake",
        resend_api_key="re_alsofake",  # should be ignored
    )
    svc = EmailService()
    assert await svc._provider() == "brevo"


@pytest.mark.asyncio
async def test_explicit_resend_preference_wins(monkeypatch):
    _mock_settings(monkeypatch,
        provider_preference="resend",
        resend_api_key="re_fake",
        brevo_api_key="xkeysib-alsofake",
    )
    svc = EmailService()
    assert await svc._provider() == "resend"


@pytest.mark.asyncio
async def test_explicit_mock_preference_disables_all_providers(monkeypatch):
    _mock_settings(monkeypatch,
        provider_preference="mock",
        resend_api_key="re_fake",
        brevo_api_key="xkeysib-fake",
        sendgrid_api_key="SG.fake",
    )
    svc = EmailService()
    assert await svc._provider() == "mock"


@pytest.mark.asyncio
async def test_explicit_preference_without_matching_key_falls_back(monkeypatch):
    """If user picks 'brevo' but has no brevo key, we should fall through to auto-chain."""
    _mock_settings(monkeypatch,
        provider_preference="brevo",
        resend_api_key="re_fake",  # only resend available
    )
    svc = EmailService()
    assert await svc._provider() == "resend"


# ── Auto-chain tests (brevo > resend > sendgrid > mock) ────────────────────
@pytest.mark.asyncio
async def test_auto_prefers_brevo_over_resend_for_mena(monkeypatch):
    _mock_settings(monkeypatch,
        provider_preference="auto",
        brevo_api_key="xkeysib-fake",
        resend_api_key="re_fake",
        sendgrid_api_key="SG.fake",
    )
    svc = EmailService()
    assert await svc._provider() == "brevo"


@pytest.mark.asyncio
async def test_auto_picks_resend_when_brevo_missing(monkeypatch):
    _mock_settings(monkeypatch,
        provider_preference="auto",
        resend_api_key="re_fake",
        sendgrid_api_key="SG.fake",
    )
    svc = EmailService()
    assert await svc._provider() == "resend"


@pytest.mark.asyncio
async def test_auto_picks_sendgrid_as_last_real_provider(monkeypatch):
    _mock_settings(monkeypatch,
        provider_preference="auto",
        sendgrid_api_key="SG.fake",
    )
    svc = EmailService()
    assert await svc._provider() == "sendgrid"


@pytest.mark.asyncio
async def test_auto_falls_back_to_mock_when_no_keys(monkeypatch):
    _mock_settings(monkeypatch, provider_preference="auto")
    svc = EmailService()
    assert await svc._provider() == "mock"


# ── send_email full-path test for Brevo ────────────────────────────────────
@pytest.mark.asyncio
async def test_send_via_brevo_posts_to_correct_endpoint(monkeypatch):
    """Verify the Brevo path constructs the correct REST payload + headers."""
    _mock_settings(monkeypatch,
        provider_preference="brevo",
        brevo_api_key="xkeysib-test",
        sender_email="noreply@example.com",
    )

    captured = {}

    class _FakeResp:
        status_code = 201
        def json(self): return {"messageId": "msg_test_123"}
        text = '{"messageId":"msg_test_123"}'

    class _FakeClient:
        def __init__(self, *a, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        async def post(self, url, headers=None, json=None):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return _FakeResp()

    import services.email_service as es
    monkeypatch.setattr(es.httpx, "AsyncClient", _FakeClient)

    svc = EmailService()
    ok = await svc.send_email(to="user@dest.com", subject="hello", html="<p>hi</p>")
    assert ok is True
    assert captured["url"] == es.BREVO_API_URL
    assert captured["headers"]["api-key"] == "xkeysib-test"
    assert captured["headers"]["Content-Type"] == "application/json"
    assert captured["json"]["sender"]["email"] == "noreply@example.com"
    assert captured["json"]["to"][0]["email"] == "user@dest.com"
    assert captured["json"]["subject"] == "hello"
    assert captured["json"]["htmlContent"] == "<p>hi</p>"


@pytest.mark.asyncio
async def test_brevo_returns_false_on_http_error(monkeypatch):
    _mock_settings(monkeypatch, provider_preference="brevo", brevo_api_key="xkeysib-bad")

    class _Resp:
        status_code = 401
        text = '{"code":"unauthorized"}'
        def json(self): return {"code": "unauthorized"}

    class _Client:
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        async def post(self, *a, **kw): return _Resp()

    import services.email_service as es
    monkeypatch.setattr(es.httpx, "AsyncClient", lambda *a, **kw: _Client())

    ok = await EmailService().send_email(to="x@y.com", subject="s", html="<p>h</p>")
    assert ok is False
