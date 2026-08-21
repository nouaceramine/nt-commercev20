"""Automatic per-status customer SMS for e-commerce orders (p241).

SuiviSMS-style: when an order moves to a configured status, the customer gets
an SMS built from an editable template. Each sent SMS costs the tenant 1 SMS
credit, deducted atomically from main_db.wallets.sms_credits (platform sells
credits; super admin grants them via /api/admin/sms/credits/grant).

Fail-open everywhere: an SMS failure never blocks a status change.
Dedup: one successful send per (order_id, status) — re-transitions don't resend.
"""
from datetime import datetime, timezone
import logging
import uuid

from pymongo import ReturnDocument

from services.application.ecom_order_service import normalize_phone
from services.ecom.sms_gateway import get_sms_provider

logger = logging.getLogger(__name__)

COLLECTION = "ecom_sms_logs"

DEFAULT_TEMPLATES = {
    "confirmed": "مرحباً {customer_name}، تم تأكيد طلبك {order_code} بقيمة {total} دج. شكراً لثقتكم — {store_name}",
    "packed":    "{customer_name}، طلبك {order_code} قيد التحضير وسيُسلَّم لشركة التوصيل قريباً — {store_name}",
    "shipped":   "{customer_name}، طلبك {order_code} في الطريق إليك عبر {courier}. رقم التتبع: {tracking_number} — {store_name}",
    "delivered": "{customer_name}، تم تسليم طلبك {order_code}. شكراً لتعاملكم معنا — {store_name}",
    "cancelled": "{customer_name}، تم إلغاء طلبك {order_code}. للاستفسار اتصلوا بنا — {store_name}",
    "returned":  "{customer_name}، سُجّل طلبك {order_code} كمرجع. للاستفسار اتصلوا بنا — {store_name}",
}

DEFAULT_SETTINGS = {
    "id": "global",
    "enabled": False,
    "sender_name": "",
    "provider": {"type": "mock"},
    "per_status": {k: {"enabled": False, "template": v} for k, v in DEFAULT_TEMPLATES.items()},
}


async def get_settings(db) -> dict:
    doc = await db.ecom_sms_settings.find_one({"id": "global"}, {"_id": 0})
    merged = {"id": "global", "enabled": DEFAULT_SETTINGS["enabled"],
              "sender_name": "", "provider": {"type": "mock"}, "per_status": {}}
    for st, tpl in DEFAULT_TEMPLATES.items():
        merged["per_status"][st] = {"enabled": False, "template": tpl}
    if doc:
        merged["enabled"] = bool(doc.get("enabled"))
        merged["sender_name"] = doc.get("sender_name") or ""
        if isinstance(doc.get("provider"), dict):
            merged["provider"] = doc["provider"]
        for st, cfg in (doc.get("per_status") or {}).items():
            if st in merged["per_status"] and isinstance(cfg, dict):
                merged["per_status"][st] = {
                    "enabled": bool(cfg.get("enabled")),
                    "template": cfg.get("template") or DEFAULT_TEMPLATES.get(st, ""),
                }
    return merged


def render_template(template: str, order: dict, store_name: str = "") -> str:
    cust = order.get("customer") or {}
    values = {
        "customer_name": cust.get("name", ""),
        "order_code": order.get("order_code", ""),
        "total": order.get("total", ""),
        "store_name": store_name or "متجرنا",
        "tracking_number": order.get("tracking_number") or order.get("order_code", ""),
        "courier": order.get("courier") or "شركة التوصيل",
        "wilaya": cust.get("wilaya", ""),
        "phone": cust.get("phone", ""),
    }
    msg = template
    for k, v in values.items():
        msg = msg.replace("{" + k + "}", str(v))
    return msg


async def maybe_send_status_sms(db, order: dict, new_status: str, *, tenant_id: str = "") -> dict | None:
    """Send the per-status SMS if enabled; returns the log doc or None when not applicable."""
    settings = await get_settings(db)
    if not settings["enabled"]:
        return None
    st_cfg = (settings.get("per_status") or {}).get(new_status)
    if not st_cfg or not st_cfg.get("enabled"):
        return None
    phone = normalize_phone((order.get("customer") or {}).get("phone", ""))
    if not phone:
        return None

    order_id = order.get("id")
    # dedup: a previous non-failed send for this order+status → skip
    existing = await db[COLLECTION].find_one(
        {"order_id": order_id, "status": new_status, "result": {"$in": ["sent", "mocked"]}},
        {"_id": 0, "id": 1})
    if existing:
        return None

    store_name = settings.get("sender_name") or ""
    if not store_name:
        try:
            s = await db.store_settings.find_one({}, {"_id": 0, "store_name": 1})
            store_name = (s or {}).get("store_name", "")
        except Exception:  # noqa: BLE001
            store_name = ""
    message = render_template(st_cfg["template"], order, store_name)

    now = datetime.now(timezone.utc).isoformat()
    log_doc = {
        "id": str(uuid.uuid4()),
        "order_id": order_id,
        "order_code": order.get("order_code"),
        "status": new_status,
        "phone": phone,
        "message": message,
        "credit_charged": 0,
        "created_at": now,
    }

    # 1 SMS = 1 credit, deducted atomically from the tenant wallet
    if tenant_id:
        from config.database import main_db
        w = await main_db.wallets.find_one_and_update(
            {"entity_id": tenant_id, "sms_credits": {"$gte": 1}},
            {"$inc": {"sms_credits": -1}},
            return_document=ReturnDocument.AFTER,
        )
        if not w:
            log_doc.update({"result": "skipped_no_credit", "provider": None, "error": "رصيد SMS غير كافٍ"})
            await db[COLLECTION].insert_one(log_doc)
            return log_doc
        log_doc["credit_charged"] = 1

    provider = get_sms_provider(settings.get("provider"))
    res = await provider.send(phone, message)
    if res.get("success"):
        log_doc.update({"result": "mocked" if res.get("simulated") else "sent",
                        "provider": res.get("provider"), "message_id": res.get("message_id"),
                        "error": None})
    else:
        log_doc.update({"result": "failed", "provider": res.get("provider"),
                        "error": res.get("error")})
        # refund the credit on failure
        if log_doc["credit_charged"] and tenant_id:
            from config.database import main_db
            await main_db.wallets.update_one({"entity_id": tenant_id}, {"$inc": {"sms_credits": 1}})
            log_doc["credit_charged"] = 0
    await db[COLLECTION].insert_one(log_doc)
    return log_doc
