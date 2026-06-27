"""WhatsApp Cloud API Service (iter 18.3 — P3)

Two-way:
  - Incoming webhook → creates ecom_leads / ecom_orders
  - Outgoing send → notify customer of status changes (called from order status transition)

Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
"""
import logging
from datetime import datetime, timezone
from typing import Optional
import httpx

logger = logging.getLogger(__name__)

WHATSAPP_API_BASE = "https://graph.facebook.com/v20.0"


class WhatsAppCredentialsMissing(Exception):
    pass


def parse_incoming_message(payload: dict) -> Optional[dict]:
    """Extract sender + text from a WhatsApp Cloud API webhook payload.

    Returns None if the payload is a status update (delivered/read) instead of a message.
    """
    try:
        entry = (payload.get("entry") or [{}])[0]
        change = (entry.get("changes") or [{}])[0]
        value = change.get("value") or {}
        messages = value.get("messages") or []
        if not messages:
            return None
        msg = messages[0]
        contacts = value.get("contacts") or [{}]
        sender_name = (contacts[0].get("profile") or {}).get("name", "WhatsApp Customer")
        return {
            "external_id": msg.get("id", ""),
            "from_phone": msg.get("from", ""),
            "name": sender_name,
            "text": (msg.get("text") or {}).get("body", "") or msg.get("type", ""),
            "timestamp": msg.get("timestamp", ""),
        }
    except (KeyError, IndexError, AttributeError):
        return None


async def send_text_message(integration: dict, to_phone: str, body: str) -> bool:
    """Send a WhatsApp text message via Cloud API. Returns True on success."""
    creds = integration.get("credentials") or {}
    phone_id = (creds.get("phone_number_id") or "").strip()
    token = (creds.get("access_token") or "").strip()
    if not phone_id or not token:
        raise WhatsAppCredentialsMissing("phone_number_id and access_token required")

    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone.lstrip("+").strip(),
        "type": "text",
        "text": {"body": body},
    }
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(f"{WHATSAPP_API_BASE}/{phone_id}/messages", json=payload, headers=headers)
        if r.status_code >= 400:
            logger.warning("WhatsApp send failed (%s): %s", r.status_code, r.text[:200])
            return False
        return True
    except httpx.HTTPError as exc:
        logger.warning("WhatsApp send network error: %s", exc)
        return False


def parse_meta_lead(payload: dict) -> Optional[dict]:
    """Extract a Facebook/Instagram lead from a Meta Leads webhook payload.

    Shape: https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving
    """
    try:
        entry = (payload.get("entry") or [{}])[0]
        change = (entry.get("changes") or [{}])[0]
        value = change.get("value") or {}
        # Each field is {name, values:[v]}
        fields = {f["name"]: (f.get("values") or [""])[0] for f in (value.get("field_data") or [])}
        return {
            "external_id": str(value.get("leadgen_id") or value.get("id") or ""),
            "name": fields.get("full_name") or fields.get("name") or "Meta Lead",
            "phone": fields.get("phone_number") or fields.get("phone") or "",
            "email": fields.get("email") or "",
            "message": " | ".join(f"{k}={v}" for k, v in fields.items() if k not in ("full_name", "phone_number", "email")),
            "form_id": str(value.get("form_id", "")),
            "page_id": str(value.get("page_id", "")),
        }
    except (KeyError, IndexError, AttributeError):
        return None
