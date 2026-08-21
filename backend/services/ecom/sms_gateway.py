"""SMS gateway abstraction (p241).

Swappable providers. The tenant picks a provider in ecom_sms_settings:
  {"type": "mock"}                              — default, logs only (no real SMS)
  {"type": "http", "url": ..., "token": ...,    — generic JSON REST gateway:
     "phone_field": "to", "message_field": "message",
     "headers": {...}, "extra": {...}}

The http provider covers most Algerian/international SMS APIs that accept a
simple POST without any code change; a dedicated provider class can be added
later without touching the caller.
"""
from datetime import datetime, timezone
import logging
import uuid

logger = logging.getLogger(__name__)


class MockSMSProvider:
    """Default provider — no real SMS is sent (no gateway account yet)."""
    name = "mock"

    def __init__(self, cfg: dict | None = None):
        self.cfg = cfg or {}

    async def send(self, phone: str, message: str) -> dict:
        masked = f"****{phone[-4:]}" if len(str(phone)) >= 4 else "****"
        logger.info("[SMS-MOCK p241] to=%s len=%d", masked, len(message))
        return {"success": True, "provider": self.name, "simulated": True,
                "message_id": f"mock-{uuid.uuid4().hex[:12]}", "error": None,
                "sent_at": datetime.now(timezone.utc).isoformat()}


class HTTPGatewayProvider:
    """Generic JSON POST SMS gateway (bring-your-own provider credentials)."""
    name = "http"

    def __init__(self, cfg: dict):
        self.url = (cfg.get("url") or "").strip()
        self.token = (cfg.get("token") or "").strip()
        self.phone_field = cfg.get("phone_field") or "to"
        self.message_field = cfg.get("message_field") or "message"
        self.headers = dict(cfg.get("headers") or {})
        self.extra = dict(cfg.get("extra") or {})
        if not self.url:
            raise ValueError("http sms provider requires url")

    async def send(self, phone: str, message: str) -> dict:
        import httpx
        payload = {self.phone_field: phone, self.message_field: message, **self.extra}
        headers = {"Content-Type": "application/json", **self.headers}
        if self.token:
            headers.setdefault("Authorization", f"Bearer {self.token}")
        try:
            async with httpx.AsyncClient(timeout=12) as client:
                r = await client.post(self.url, json=payload, headers=headers)
            ok = 200 <= r.status_code < 300
            return {"success": ok, "provider": self.name, "simulated": False,
                    "message_id": None, "error": None if ok else f"HTTP {r.status_code}: {r.text[:200]}",
                    "sent_at": datetime.now(timezone.utc).isoformat()}
        except Exception as exc:  # noqa: BLE001
            return {"success": False, "provider": self.name, "simulated": False,
                    "message_id": None, "error": str(exc)[:200],
                    "sent_at": datetime.now(timezone.utc).isoformat()}


def get_sms_provider(cfg: dict | None):
    """Factory — never raises on bad config, falls back to mock."""
    cfg = cfg or {}
    ptype = (cfg.get("type") or "mock").strip().lower()
    try:
        if ptype == "http":
            return HTTPGatewayProvider(cfg)
    except Exception as exc:  # noqa: BLE001
        logger.warning("p241 invalid sms provider config, falling back to mock: %s", exc)
    return MockSMSProvider(cfg)
