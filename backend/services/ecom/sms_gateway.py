"""SMS gateway abstraction with fail-closed provider configuration.

Only a configured HTTPS JSON gateway can report a successful send. The legacy
mock provider remains as a compatibility name, but never claims delivery.
"""
from datetime import datetime, timezone
import ipaddress
import httpx
import logging
import socket
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


def _public_https_url(value: str) -> str:
    url = (value or "").strip()
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("SMS gateway requires a public HTTPS URL without credentials")
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM)}
    except socket.gaierror as exc:
        raise ValueError("SMS gateway hostname cannot be resolved") from exc
    if not addresses:
        raise ValueError("SMS gateway hostname cannot be resolved")
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if not ip.is_global:
            raise ValueError("SMS gateway must not resolve to a private or local address")
    return url


class MockSMSProvider:
    """Legacy compatibility provider: always fails instead of simulating delivery."""
    name = "unconfigured"

    def __init__(self, cfg: dict | None = None, error: str = "بوابة SMS غير مهيأة"):
        self.cfg = cfg or {}
        self.error = error

    async def send(self, phone: str, message: str) -> dict:
        return {"success": False, "provider": self.name, "simulated": False,
                "message_id": None, "error": self.error,
                "sent_at": datetime.now(timezone.utc).isoformat()}


class HTTPGatewayProvider:
    """Generic JSON POST SMS gateway using tenant-provided credentials."""
    name = "http"

    def __init__(self, cfg: dict):
        self.url = _public_https_url(cfg.get("url") or "")
        self.token = (cfg.get("token") or cfg.get("api_key") or "").strip()
        self.phone_field = cfg.get("phone_field") or "to"
        self.message_field = cfg.get("message_field") or "message"
        self.headers = dict(cfg.get("headers") or {})
        self.extra = dict(cfg.get("extra") or {})

    async def send(self, phone: str, message: str) -> dict:
        payload = {self.phone_field: phone, self.message_field: message, **self.extra}
        headers = {"Content-Type": "application/json", **self.headers}
        if self.token:
            headers.setdefault("Authorization", f"Bearer {self.token}")
        try:
            async with httpx.AsyncClient(timeout=12, follow_redirects=False) as client:
                response = await client.post(self.url, json=payload, headers=headers)
            ok = 200 <= response.status_code < 300
            message_id = None
            provider_error = None
            try:
                data = response.json()
            except ValueError:
                data = {}
            if isinstance(data, dict):
                message_id = str(data.get("message_id") or data.get("id") or "")[:255] or None
                if data.get("success") is False or data.get("ok") is False or str(data.get("status") or "").lower() in {"error", "failed", "failure", "rejected"}:
                    ok = False
                    provider_error = str(data.get("error") or data.get("message") or "Gateway rejected the message")[:200]
            return {"success": ok, "provider": self.name, "simulated": False,
                    "message_id": message_id if ok else None,
                    "error": None if ok else (provider_error or f"HTTP {response.status_code}: {response.text[:200]}"),
                    "sent_at": datetime.now(timezone.utc).isoformat()}
        except Exception as exc:  # noqa: BLE001
            return {"success": False, "provider": self.name, "simulated": False,
                    "message_id": None, "error": str(exc)[:200],
                    "sent_at": datetime.now(timezone.utc).isoformat()}


def get_sms_provider(cfg: dict | None):
    """Return a real provider or a provider that fails closed."""
    cfg = cfg or {}
    ptype = (cfg.get("type") or "").strip().lower()
    if ptype != "http":
        return MockSMSProvider(cfg)
    try:
        return HTTPGatewayProvider(cfg)
    except (ValueError, TypeError) as exc:
        logger.warning("Invalid SMS provider configuration: %s", exc)
        return MockSMSProvider(cfg, str(exc)[:200])
