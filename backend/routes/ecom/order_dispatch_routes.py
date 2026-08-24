"""E-Commerce Hub: unified order dispatch workflow (p289).

لوحة الطلبيات المتكاملة — معالجة كل طلب من مكان واحد:

  GET  /ecom/dispatch/couriers                        — شركات الشحن المربوطة (المفعّلة) فقط
  POST /ecom/orders/{order_id}/dispatch               — إرسال تلقائي: إنشاء الطرد والبوليصة لدى الناقل
  POST /ecom/orders/{order_id}/manual-registration    — تسجيل يدوي: «مسجَّل في الشركة / غير مسجَّل»
  POST /ecom/orders/{order_id}/remind                 — تذكير الزبون عبر SMS أو WhatsApp

الإرسال الحقيقي التلقائي متاح حالياً لياليدين (create_parcel حقيقي)؛ بقية الناقلين
المربوطين تُسجَّل لهم بوليصة تتبع داخلية وتُزامَن حالاتهم عبر Webhooks/المزامنة الدورية.
"""
from datetime import datetime, timezone
import logging
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument

from config.database import db, main_db
from utils.auth import require_tenant
from routes.ecom.constants import (
    CHANNELS, SHIPPING_PROVIDERS, SHIPPING_PROVIDER_KEYS, require_ecom_feature,
)
from services.application.ecom_order_service import normalize_phone

logger = logging.getLogger(__name__)
router = APIRouter(tags=["E-Commerce Order Dispatch"])

# ناقلون لهم إنشاء طرد حقيقي عبر API (create_parcel)
REAL_AUTO_COURIERS = {"yalidine"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _shipping_channel_keys() -> set:
    return {k for k, m in CHANNELS.items() if m.get("kind") == "shipping"}


async def _linked_courier_docs() -> list:
    """Active shipping integrations only — one doc per channel (latest wins)."""
    keys = list(_shipping_channel_keys() | set(SHIPPING_PROVIDER_KEYS) - {"mock"})
    docs = await db.ecom_integrations.find(
        {"is_active": True, "channel": {"$in": keys}},
        {"_id": 0},
    ).sort("created_at", -1).to_list(200)
    seen, out = set(), []
    for d in docs:
        ch = d.get("channel")
        if ch in seen:
            continue
        seen.add(ch)
        out.append(d)
    return out


@router.get("/ecom/dispatch/couriers")
async def linked_couriers(user: dict = Depends(require_tenant)):
    """قائمة شركات الشحن المربوطة والمفعّلة فقط — لحوار الإرسال التلقائي/اليدوي."""
    await require_ecom_feature(user)
    docs = await _linked_courier_docs()
    items = []
    for d in docs:
        ch = d.get("channel")
        meta = CHANNELS.get(ch) or {}
        prov = SHIPPING_PROVIDERS.get(ch) or {}
        items.append({
            "channel": ch,
            "name": d.get("name") or meta.get("label_ar") or prov.get("label_ar") or ch,
            "icon": meta.get("icon", "🚚"),
            "supports_auto": ch in REAL_AUTO_COURIERS,
            "creates_label": ch in SHIPPING_PROVIDER_KEYS,
            "return_fee": d.get("return_fee") or 0,
        })
    return {"items": items}


@router.post("/ecom/orders/{order_id}/dispatch")
async def dispatch_order(order_id: str, body: dict, user: dict = Depends(require_tenant)):
    """إرسال تلقائي: إنشاء الطرد لدى الناقل المحدد + بوليصة الشحن + رقم التتبع."""
    await require_ecom_feature(user)
    courier = (body.get("courier") or "").strip()
    if not courier:
        raise HTTPException(status_code=400, detail="اختر شركة الشحن")
    order = await db.ecom_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")

    integration = await db.ecom_integrations.find_one(
        {"channel": courier, "is_active": True}, {"_id": 0}, sort=[("created_at", -1)])
    if not integration:
        raise HTTPException(
            status_code=400,
            detail="شركة الشحن غير مربوطة أو موقوفة — فعّلها من مركز التكاملات أولاً")

    now = _now()
    label = None
    if courier in SHIPPING_PROVIDER_KEYS:
        from routes.ecom.shipping_routes import create_label
        # create_label يتضمن حارس «لا تشحن» (p109) ويحدّث الطلب (tracking/courier/status)
        label = await create_label({"order_id": order_id, "provider": courier}, user)
    else:
        # ناقل مربوط لكن خارج سجل البوالص — تسجيل فقط (لا يحدث حالياً)
        await db.ecom_orders.update_one(
            {"id": order_id}, {"$set": {"courier": courier, "updated_at": now}})

    fulfillment = {"mode": "auto", "courier": courier, "at": now, "by": user.get("id")}
    real = bool(label and label.get("mode") == "live")
    note = (f"أُرسل تلقائياً إلى {courier} — تتبع: {label.get('tracking_number')}"
            if label else f"سُجّل إرسال تلقائي إلى {courier}")
    await db.ecom_orders.update_one(
        {"id": order_id},
        {"$set": {"fulfillment": fulfillment, "updated_at": now},
         "$push": {"status_history": {"status": order.get("status"), "at": now,
                                      "by": user.get("id"), "note": note}}})
    # p289 fix: ناقل بإرسال حقيقي فشل إنشاؤه يجب أن يُقال صراحة (راجع المفاتيح)
    if real:
        msg = f"✅ أُنشئ الطرد لدى الناقل — رقم التتبع: {label.get('tracking_number')}"
    elif courier in REAL_AUTO_COURIERS:
        msg = (f"⚠️ تعذّر الإنشاء الحقيقي لدى الناقل — راجع المفاتيح في مركز التكاملات. "
               f"سُجّلت بوليصة تتبع مؤقتة ({label.get('tracking_number') if label else '—'})")
    else:
        msg = (f"سُجّلت بوليصة تتبع ({label.get('tracking_number') if label else '—'}) — "
               "الإرسال الآلي الحقيقي متاح حالياً لياليدين، وستُزامَن الحالة عبر Webhooks/المزامنة")
    return {
        "ok": True,
        "real": real,
        "fulfillment": fulfillment,
        "label": label,
        "message": msg,
    }


@router.post("/ecom/orders/{order_id}/manual-registration")
async def manual_registration(order_id: str, body: dict, user: dict = Depends(require_tenant)):
    """تسجيل يدوي: نسخ الموظف بيانات الزبون إلى تطبيق الناقل بنفسه، ثم يعلّم
    «مسجَّل في الشركة» أو «غير مسجَّل»."""
    await require_ecom_feature(user)
    courier = (body.get("courier") or "").strip()
    registered = bool(body.get("registered"))
    if not courier:
        raise HTTPException(status_code=400, detail="اختر شركة الشحن")
    order = await db.ecom_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    now = _now()
    fulfillment = {"mode": "manual", "courier": courier,
                   "registered_with_courier": registered, "at": now, "by": user.get("id")}
    note = (f"سُجّل يدوياً لدى {courier} (معالجة يدوية)" if registered
            else f"معالجة يدوية عبر {courier} — لم يُسجَّل في الشركة بعد")
    await db.ecom_orders.update_one(
        {"id": order_id},
        {"$set": {"fulfillment": fulfillment, "courier": courier, "updated_at": now},
         "$push": {"status_history": {"status": order.get("status"), "at": now,
                                      "by": user.get("id"), "note": note}}})
    return {"ok": True, "fulfillment": fulfillment,
            "message": "✅ عُلّم كمسجَّل في الشركة" if registered else "سُجّلت المعالجة اليدوية (غير مسجَّل بعد)"}


@router.post("/ecom/orders/{order_id}/remind")
async def remind_customer(order_id: str, body: dict, user: dict = Depends(require_tenant)):
    """تذكير الزبون بالطلب عبر SMS (من رصيد المشترك) أو WhatsApp (التكامل المفعّل)."""
    await require_ecom_feature(user)
    channel = (body.get("channel") or "").strip()
    if channel not in ("sms", "whatsapp"):
        raise HTTPException(status_code=400, detail="قناة التذكير يجب أن تكون sms أو whatsapp")
    order = await db.ecom_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    phone = normalize_phone((order.get("customer") or {}).get("phone", ""))
    if not phone:
        raise HTTPException(status_code=400, detail="لا يوجد رقم هاتف للزبون")

    store_name = ""
    try:
        s = await db.store_settings.find_one({}, {"_id": 0, "store_name": 1})
        store_name = (s or {}).get("store_name", "")
    except Exception:  # noqa: BLE001
        pass

    message = (body.get("message") or "").strip()
    if not message:
        name = (order.get("customer") or {}).get("name") or "زبوننا الكريم"
        parts = [f"مرحباً {name}، نذكّركم بطلبكم {order.get('order_code') or ''} بقيمة {order.get('total', 0)} دج."]
        if order.get("tracking_number"):
            parts.append(f"رقم التتبع: {order['tracking_number']}.")
        if store_name:
            parts.append(f"— {store_name}")
        message = " ".join(parts)

    now = _now()
    tenant_id = user.get("tenant_id") or ""
    result: dict = {"ok": False, "message": ""}

    if channel == "sms":
        from services.ecom.status_sms_service import get_settings
        from services.ecom.sms_gateway import get_sms_provider
        settings = await get_settings(db)
        prov_cfg = settings.get("provider") or {}
        if prov_cfg.get("type") != "http" or not prov_cfg.get("url"):
            raise HTTPException(
                status_code=400,
                detail="بوابة SMS غير مضبوطة — اربطها من مركز التكاملات (بوابة SMS)")
        # 1 SMS = 1 credit (atomic deduction from the tenant wallet)
        w = await main_db.wallets.find_one_and_update(
            {"entity_id": tenant_id, "sms_credits": {"$gte": 1}},
            {"$inc": {"sms_credits": -1}},
            return_document=ReturnDocument.AFTER,
        )
        log_doc = {
            "id": str(uuid.uuid4()), "order_id": order_id,
            "order_code": order.get("order_code"), "status": "reminder",
            "phone": phone, "message": message, "credit_charged": 0, "created_at": now,
        }
        if not w:
            log_doc.update({"result": "skipped_no_credit", "error": "رصيد SMS غير كافٍ"})
            await db.ecom_sms_logs.insert_one(log_doc)
            raise HTTPException(status_code=400, detail="رصيد SMS غير كافٍ — اطلب شحن الرصيد من الإدارة")
        log_doc["credit_charged"] = 1
        res = await get_sms_provider(prov_cfg).send(phone, message)
        ok = bool(res.get("success"))
        log_doc.update({"result": "sent" if ok else "failed",
                        "provider": res.get("provider"), "error": res.get("error")})
        await db.ecom_sms_logs.insert_one(log_doc)
        result = {"ok": ok,
                  "message": "✅ أُرسل تذكير SMS للزبون" if ok else f"❌ فشل الإرسال: {res.get('error') or 'خطأ غير معروف'}"}

    else:  # whatsapp
        cfg = await db.whatsapp_integration_settings.find_one(
            {"tenant_id": tenant_id}, {"_id": 0}) or {}
        if not cfg.get("enabled") or not cfg.get("api_token") or not cfg.get("phone_number_id"):
            raise HTTPException(
                status_code=400,
                detail="واتساب غير مفعّل — اربطه من مركز التكاملات (واتساب للأعمال)")
        wa_phone = phone.lstrip("+")
        try:
            async with httpx.AsyncClient(timeout=30) as cl:
                resp = await cl.post(
                    f"https://graph.facebook.com/v21.0/{cfg['phone_number_id']}/messages",
                    headers={"Authorization": f"Bearer {cfg['api_token']}",
                             "Content-Type": "application/json"},
                    json={"messaging_product": "whatsapp", "to": wa_phone,
                          "type": "text", "text": {"body": message}})
            ok = resp.status_code in (200, 201)
            if not ok:
                logger.warning("WA reminder failed %s: %s", resp.status_code, resp.text[:300])
            result = {"ok": ok,
                      "message": "✅ أُرسل تذكير واتساب للزبون" if ok
                      else f"❌ رفض WhatsApp (HTTP {resp.status_code})"}
        except Exception as exc:  # noqa: BLE001
            result = {"ok": False, "message": f"❌ تعذّر الاتصال بـ WhatsApp: {str(exc)[:120]}"}
        try:
            await db.whatsapp_logs.insert_one({
                "id": str(uuid.uuid4()), "tenant_id": tenant_id, "to": wa_phone,
                "message": message[:100], "kind": "order_reminder",
                "order_id": order_id,
                "status": "sent" if result["ok"] else "failed",
                "created_at": now,
            })
        except Exception:  # noqa: BLE001
            pass

    # سجل التذكير على الطلب نفسه (يظهر في تاريخه)
    await db.ecom_orders.update_one(
        {"id": order_id},
        {"$push": {"reminders": {"channel": channel, "at": now,
                                 "by": user.get("id"), "ok": result["ok"]}},
         "$set": {"updated_at": now}})
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result
