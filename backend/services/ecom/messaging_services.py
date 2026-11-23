"""Telegram Bot + Viber + TikTok webhook parsers (iter 18.3 — P4)

Lightweight payload-to-lead converters. Real channel-specific quirks (e.g.
TikTok Shop OAuth, Telegram update types) handled minimally — extend as needed.
"""
import logging
import math
from typing import Optional

logger = logging.getLogger(__name__)


def _positive_qty(value) -> int:
    try:
        f = float(value)
        i = int(f)
    except (TypeError, ValueError, OverflowError):
        raise ValueError("كمية TikTok غير صالحة")
    if not math.isfinite(f) or f != i or i < 1 or i > 100000:
        raise ValueError("كمية TikTok يجب أن تكون عدداً صحيحاً بين 1 و100000")
    return i


def _money(value, label: str) -> float:
    try:
        f = float(value)
    except (TypeError, ValueError, OverflowError):
        raise ValueError(f"{label} غير صالح")
    if not math.isfinite(f) or f < 0 or f > 1_000_000_000:
        raise ValueError(f"{label} يجب أن يكون رقماً بين 0 ومليار")
    return round(f, 2)


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
            qty = _positive_qty(it.get("quantity", 1))
            price = _money(it.get("sku_price") if it.get("sku_price") is not None else it.get("price", 0),
                           "سعر TikTok")
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
            "total": (_money(data.get("payment_amount"), "إجمالي TikTok")
                       if data.get("payment_amount") not in (None, "")
                       else (_money(data.get("total"), "إجمالي TikTok")
                             if data.get("total") not in (None, "")
                             else round(sum(i["total"] for i in items), 2))),
            "payment_status": "paid" if str(data.get("payment_status") or "").lower() in {"paid", "completed", "settled"} else "unpaid",
        }
    except (KeyError, TypeError):
        return None
