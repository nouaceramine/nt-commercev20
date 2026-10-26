import os
os.environ.setdefault("JWT_SECRET_KEY", "p479-test-only-jwt-secret-with-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "ab" * 32)
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "ntcommerce_test")

import gzip
import hashlib
import hmac
import io
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from services.crypto_fields import decrypt_field, encrypt_field
from services.ecom.messaging_services import parse_tiktok_order
from services.ecom.sms_gateway import HTTPGatewayProvider, MockSMSProvider, get_sms_provider
from services.ecom.webhook_security import verify_ecom_webhook
from utils.auth import ensure_active_account
from utils.csv_safe import csv_cell, sanitize_csv_value


def test_disabled_user_and_tenant_are_rejected():
    assert ensure_active_account({"id": "u1", "is_active": True})["id"] == "u1"
    with pytest.raises(HTTPException) as exc:
        ensure_active_account({"id": "u1", "is_active": False})
    assert exc.value.status_code == 403
    with pytest.raises(HTTPException) as exc:
        ensure_active_account({"id": "u1"}, {"id": "t1", "active": False})
    assert exc.value.status_code == 403


@pytest.mark.parametrize("channel,header", [
    ("whatsapp", "X-Hub-Signature-256"),
    ("telegram", "X-Telegram-Bot-Api-Secret-Token"),
    ("viber", "X-Viber-Content-Signature"),
    ("tiktok", "X-Tt-Signature"),
])
def test_ecom_signatures_fail_closed_and_accept_valid_raw_body(channel, header):
    raw = b'{"event":"message","text":"\xd8\xa7"}'
    secret = "test-signing-secret"
    credentials = {
        "whatsapp": {"app_secret": secret},
        "telegram": {"secret_token": secret},
        "viber": {"auth_token": secret},
        "tiktok": {"app_secret": secret},
    }[channel]
    integration = {"credentials": credentials, "is_active": True}
    with pytest.raises(HTTPException) as exc:
        verify_ecom_webhook(integration, channel, raw, {})
    assert exc.value.status_code == 401

    if channel == "telegram":
        signature = secret
    else:
        digest = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
        signature = digest if channel in ("viber", "tiktok") else "sha256=" + digest
    verify_ecom_webhook(integration, channel, raw, {header: signature})


def test_missing_webhook_secret_is_service_unavailable():
    with pytest.raises(HTTPException) as exc:
        verify_ecom_webhook({"credentials": {}}, "whatsapp", b"{}", {})
    assert exc.value.status_code == 503


def test_tiktok_only_marks_explicitly_paid_orders_as_paid():
    for status, expected in [("paid", "paid"), ("completed", "paid"), ("settled", "paid"), ("created", "unpaid"), ("awaiting_payment", "unpaid")]:
        order = parse_tiktok_order({"data": {"order_id": "o1", "payment_status": status}}, "i1")
        assert order["payment_status"] == expected


def test_sensitive_fields_round_trip_and_plaintext_write_fails_closed(monkeypatch):
    import services.crypto_fields as crypto
    monkeypatch.setattr(crypto, "_key", None)
    encrypted = encrypt_field("sms-secret")
    assert encrypted.startswith("v1.") and "sms-secret" not in encrypted
    assert decrypt_field(encrypted) == "sms-secret"
    monkeypatch.delenv("FIELD_ENCRYPTION_KEY")
    monkeypatch.setattr(crypto, "_key", None)
    with pytest.raises(RuntimeError):
        encrypt_field("must-not-be-plaintext")


@pytest.mark.parametrize("value", ["=1+1", "  +SUM(A1:A2)", "\t-10", "@cmd"])
def test_backend_csv_formula_neutralization(value):
    assert sanitize_csv_value(value) == "'" + value
    assert not csv_cell(value).lstrip().startswith(("=", "+", "-", "@"))


def test_csv_quotes_and_neutralizes_together():
    assert csv_cell('=1,"x"') == '"\'=1,""x"""'


@pytest.mark.asyncio
async def test_unconfigured_sms_never_claims_success():
    result = await MockSMSProvider().send("+213555000000", "test")
    assert result["success"] is False and result["simulated"] is False
    assert get_sms_provider({"type": "mock"}).name == "unconfigured"


def test_sms_rejects_private_gateway(monkeypatch):
    import services.ecom.sms_gateway as gateway
    monkeypatch.setattr(gateway.socket, "getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("127.0.0.1", 443))])
    provider = get_sms_provider({"type": "http", "url": "https://internal.test/send"})
    assert provider.name == "unconfigured"


@pytest.mark.asyncio
async def test_sms_http_200_error_payload_is_not_success(monkeypatch):
    import services.ecom.sms_gateway as gateway
    monkeypatch.setattr(gateway.socket, "getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("93.184.216.34", 443))])
    response = SimpleNamespace(status_code=200, text='{"success":false}', json=lambda: {"success": False, "error": "rejected"})

    class FakeClient:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def post(self, *args, **kwargs): return response

    monkeypatch.setattr(gateway.httpx, "AsyncClient", FakeClient)
    result = await HTTPGatewayProvider({"url": "https://sms.example.test/send"}).send("+213555000000", "test")
    assert result["success"] is False and result["message_id"] is None


def test_gzip_read_limit_is_enforced():
    from routes.backup_routes import _read_limited
    compressed = io.BytesIO()
    with gzip.GzipFile(fileobj=compressed, mode="wb") as stream:
        stream.write(b"x" * 8192)
    compressed.seek(0)
    with gzip.GzipFile(fileobj=compressed, mode="rb") as stream:
        with pytest.raises(HTTPException) as exc:
            _read_limited(stream, 128)
    assert exc.value.status_code == 413


def _stripe_app():
    from routes.stripe_routes import create_stripe_routes
    main_db = SimpleNamespace(payment_transactions=SimpleNamespace(insert_one=AsyncMock(), update_one=AsyncMock(), find_one=AsyncMock()))
    user = {"id": "tenant-a", "tenant_id": "tenant-a", "role": "admin", "user_type": "tenant"}
    router = create_stripe_routes(None, main_db, lambda: user, lambda: user, lambda: None, lambda: None)
    app = FastAPI()
    app.include_router(router)
    return app, main_db


def test_stripe_checkout_uses_official_sdk_without_external_call(monkeypatch):
    import routes.stripe_routes as routes
    app, main_db = _stripe_app()
    create = Mock(return_value=SimpleNamespace(id="cs_test_123", status="open", url="https://checkout.stripe.com/test"))
    client = SimpleNamespace(v1=SimpleNamespace(checkout=SimpleNamespace(sessions=SimpleNamespace(create=create))))
    monkeypatch.setattr(routes, "_stripe_client", lambda: client)
    response = TestClient(app).post("/payments/create-checkout", json={"package_id": "basic_monthly", "origin_url": "https://nt-commerce.net"})
    assert response.status_code == 200
    params = create.call_args.kwargs["params"]
    assert params["mode"] == "payment" and params["metadata"]["transaction_id"]
    assert params["metadata"]["tenant_id"] == "tenant-a"
    stored = main_db.payment_transactions.insert_one.await_args.args[0]
    assert stored["tenant_id"] == "tenant-a" and stored["created_by"] == "tenant-a"
    assert main_db.payment_transactions.insert_one.await_count == 1


def test_stripe_rejects_unsafe_origin():
    from routes.stripe_routes import _safe_origin
    with pytest.raises(HTTPException):
        _safe_origin("http://nt-commerce.net")
    assert _safe_origin("https://nt-commerce.net/") == "https://nt-commerce.net"


def test_stripe_webhook_requires_secret_and_valid_signature(monkeypatch):
    import stripe
    app, main_db = _stripe_app()
    client = TestClient(app)
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)
    assert client.post("/webhook/stripe", content=b"{}").status_code == 503
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test")
    assert client.post("/webhook/stripe", content=b"{}").status_code == 401
    monkeypatch.setattr(stripe.Webhook, "construct_event", Mock(side_effect=stripe.SignatureVerificationError("bad", "sig")))
    assert client.post("/webhook/stripe", content=b"{}", headers={"Stripe-Signature": "bad"}).status_code == 401
    event = {"id": "evt_1", "type": "checkout.session.completed", "data": {"object": {"id": "cs_test_123", "payment_status": "paid", "status": "complete"}}}
    monkeypatch.setattr(stripe.Webhook, "construct_event", Mock(return_value=event))
    assert client.post("/webhook/stripe", content=b"{}", headers={"Stripe-Signature": "valid"}).status_code == 200
    assert main_db.payment_transactions.update_one.await_count == 1


@pytest.mark.asyncio
async def test_woocommerce_adapter_uses_real_rest_response(monkeypatch):
    import services.woocommerce_service as woo
    monkeypatch.setattr(woo.socket, "getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("93.184.216.34", 443))])
    response = SimpleNamespace(status_code=201, json=lambda: {"id": 42, "permalink": "https://shop.example.test/p/42", "status": "publish"})

    class FakeClient:
        request = AsyncMock(return_value=response)
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None

    monkeypatch.setattr(woo.httpx, "AsyncClient", FakeClient)
    result = await woo.publish_product({"store_url": "https://shop.example.test", "consumer_key": "ck", "consumer_secret": "cs"}, {"name": "Test", "quantity": 3})
    assert result["id"] == 42
    assert FakeClient.request.await_args.args[:2] == ("POST", "https://shop.example.test/wp-json/wc/v3/products")


def test_woocommerce_rejects_local_addresses_and_invalid_product_ids(monkeypatch):
    import services.woocommerce_service as woo
    monkeypatch.setattr(woo.socket, "getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("10.0.0.4", 443))])
    with pytest.raises(HTTPException):
        woo._base_url({"store_url": "https://internal.test"})
    with pytest.raises(HTTPException):
        woo._product_id({"woocommerce_id": "1?force=true"})


def test_zip_member_limit_rejects_and_cleans_files(tmp_path, monkeypatch):
    import zipfile
    import routes.migration_routes as migration
    monkeypatch.setattr(migration, "MAX_ZIP_MEMBER_BYTES", 128)
    archive = tmp_path / "source.zip"
    bundle = tmp_path / "bundle"
    bundle.mkdir()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("Products.json", "x" * 4096)
    with pytest.raises(HTTPException) as exc:
        migration._extract_bundle_zip(str(archive), str(bundle))
    assert exc.value.status_code == 413
    assert not archive.exists() and not bundle.exists()


def test_zip_extraction_ignores_traversal_and_extracts_flat_json(tmp_path):
    import zipfile
    from routes.migration_routes import _extract_bundle_zip
    archive = tmp_path / "source.zip"
    bundle = tmp_path / "bundle"
    bundle.mkdir()
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr("../escape.json", "bad")
        zf.writestr("Products.json", "[]")
    _extract_bundle_zip(str(archive), str(bundle))
    assert (bundle / "Products.json").read_text() == "[]"
    assert not (tmp_path / "escape.json").exists()


@pytest.mark.asyncio
async def test_gemini_uses_current_async_sdk(monkeypatch):
    import services.ai_service as ai
    response = SimpleNamespace(text="ok")
    generate = AsyncMock(return_value=response)
    monkeypatch.setattr(ai, "_CLIENT", SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate))))
    result = await ai.AIService.generate_content("test", model="gemini-test")
    assert result.text == "ok"
    assert generate.await_args.kwargs == {"model": "gemini-test", "contents": "test"}


def test_stripe_invoice_escapes_html_and_filename(monkeypatch):
    from routes.stripe_routes import create_stripe_routes
    payload = '<img src=x onerror=alert(1)>\r\nX-Evil: yes'
    payments = SimpleNamespace(
        insert_one=AsyncMock(), update_one=AsyncMock(),
        find_one=AsyncMock(return_value={"invoice_number": payload, "created_at": "2026-01-01", "amount": 10, "currency": "dzd"}),
    )
    tenants = SimpleNamespace(find_one=AsyncMock(return_value={"business_name": payload}))
    main_db = SimpleNamespace(payment_transactions=payments, saas_tenants=tenants)
    app = FastAPI()
    app.include_router(create_stripe_routes(None, main_db, lambda: None, lambda: None, lambda: None, lambda: {}))
    response = TestClient(app).get("/payments/invoice/record-1")
    assert response.status_code == 200
    assert "<img src=x" not in response.text and "&lt;img src=x" in response.text
    assert "\r" not in response.headers["content-disposition"] and "\n" not in response.headers["content-disposition"]
