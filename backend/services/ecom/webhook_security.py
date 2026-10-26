"""Fail-closed signature verification for public e-commerce webhooks."""
from __future__ import annotations

import hashlib
import hmac
import json

from fastapi import HTTPException

from services.crypto_fields import decrypt_credentials

MAX_WEBHOOK_BYTES = 1024 * 1024


async def read_signed_body(request) -> bytes:
    """Read a bounded raw body once; signatures always cover these exact bytes."""
    content_length = request.headers.get("Content-Length")
    if content_length:
        try:
            if int(content_length) > MAX_WEBHOOK_BYTES:
                raise HTTPException(status_code=413, detail="Webhook payload too large")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid Content-Length")
    chunks = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > MAX_WEBHOOK_BYTES:
            raise HTTPException(status_code=413, detail="Webhook payload too large")
        chunks.append(chunk)
    raw = b"".join(chunks)
    if not raw:
        raise HTTPException(status_code=400, detail="Empty webhook body")
    return raw


def decode_json_body(raw: bytes) -> dict:
    try:
        payload = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="JSON object expected")
    return payload


def _credentials(integration: dict) -> dict:
    return decrypt_credentials(integration.get("credentials") or {})


def _secret(credentials: dict, *keys: str) -> str:
    for key in keys:
        value = credentials.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    raise HTTPException(
        status_code=503,
        detail=f"Webhook signing secret is not configured ({keys[0]})",
    )


def _hex_signature(raw: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()


def verify_meta_signature(raw: bytes, signature: str, secret: str) -> bool:
    expected = "sha256=" + _hex_signature(raw, secret)
    return hmac.compare_digest(expected, (signature or "").strip())


def verify_ecom_webhook(integration: dict, channel: str, raw: bytes, headers) -> None:
    """Verify provider authenticity; missing secrets always fail closed."""
    if integration.get("is_active") is False:
        raise HTTPException(status_code=403, detail="Integration is disabled")
    credentials = _credentials(integration)

    if channel in ("whatsapp", "facebook", "instagram", "meta"):
        secret = _secret(credentials, "app_secret", "webhook_secret")
        signature = headers.get("X-Hub-Signature-256", "")
        valid = verify_meta_signature(raw, signature, secret)
    elif channel == "telegram":
        expected = _secret(credentials, "secret_token", "webhook_secret")
        supplied = headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        valid = hmac.compare_digest(expected, supplied.strip())
    elif channel == "viber":
        secret = _secret(credentials, "auth_token", "bot_token")
        supplied = headers.get("X-Viber-Content-Signature", "").strip().lower()
        valid = hmac.compare_digest(_hex_signature(raw, secret), supplied)
    elif channel == "tiktok":
        secret = _secret(credentials, "app_secret", "webhook_secret")
        supplied = (headers.get("X-Tt-Signature") or headers.get("X-Signature") or "").strip().lower()
        expected = _hex_signature(raw, secret)
        valid = hmac.compare_digest(expected, supplied) or hmac.compare_digest("sha256=" + expected, supplied)
    else:
        raise HTTPException(status_code=400, detail="Unsupported webhook channel")

    if not valid:
        raise HTTPException(status_code=401, detail="Webhook signature verification failed")
