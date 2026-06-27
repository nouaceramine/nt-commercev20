"""Telegram Bot + Viber + TikTok webhook parsers (iter 18.3 — P4)

Lightweight payload-to-lead converters. Real channel-specific quirks (e.g.
TikTok Shop OAuth, Telegram update types) handled minimally — extend as needed.
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def parse_telegram_update(payload: dict) -> Optional[dict]:
    """Telegram webhook posts an 'update' object — extract messages only."""
    msg = payload.get("message") or payload.get("edited_message")
    if not msg:
        return None
    user = msg.get("from") or {}
    return {
        "external_id": str(msg.get("message_id", "")),
        "from_user_id": str(user.get("id", "")),
        "name": (user.get("first_name", "") + " " + user.get("last_name", "")).strip() or user.get("username", "Telegram User"),
        "text": msg.get("text", "") or msg.get("caption", "") or "(media)",
    }


def parse_viber_event(payload: dict) -> Optional[dict]:
    """Viber bot callback — only convert 'message' events to leads."""
    if payload.get("event") not in ("message", "subscribed", "conversation_started"):
        return None
    sender = payload.get("sender") or {}
    return {
        "external_id": str(payload.get("message_token", "")),
        "from_user_id": sender.get("id", ""),
        "name": sender.get("name", "Viber User"),
        "text": (payload.get("message") or {}).get("text", "(media)") if payload.get("event") == "message" else f"event:{payload.get('event')}",
    }


def parse_tiktok_order(payload: dict, integration_id: str) -> Optional[dict]:
    """TikTok Shop webhook — extract a minimal order. Real TikTok API responses
    vary; this handles the common 'order/created' shape from TikTok Shop Partner.
    """
    try:
        data = payload.get("data") or payload
        order_id = str(data.get("order_id") or data.get("id") or "")
        if not order_id:
            return None
        items_raw = data.get("line_items") or data.get("items") or []
        items: list = []
        for it in items_raw:
            qty = int(it.get("quantity", 1) or 1)
            price = float(it.get("sku_price") or it.get("price") or 0)
            items.append({
                "name": it.get("product_name") or it.get("name") or "—",
                "sku": it.get("sku_id", "") or it.get("sku", ""),
                "qty": qty,
                "price": price,
                "total": round(qty * price, 2),
            })
        receiver = data.get("recipient_address") or {}
        return {
            "external_id": order_id,
            "integration_id": integration_id,
            "customer_name": receiver.get("name", "TikTok Customer"),
            "customer_phone": receiver.get("phone", ""),
            "address": receiver.get("address_line", "") or receiver.get("full_address", ""),
            "city": receiver.get("city", ""),
            "wilaya": receiver.get("region", "") or receiver.get("state", ""),
            "items": items,
            "total": float(data.get("payment_amount") or data.get("total") or 0),
        }
    except (KeyError, ValueError, TypeError):
        return None
