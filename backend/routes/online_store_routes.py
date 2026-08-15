"""
Online Store & WooCommerce Integration Routes
Extracted from server.py
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import re

from services.conversions_api_service import conversions_service
from services.whatsapp_service import whatsapp_service
from services.coupon_service import coupon_service
from services.loyalty_service import loyalty_service
from services.shipping_tracker import shipping_tracker
from fastapi.responses import Response as _ImgResponse
import base64 as _b64
import io as _io
import logging as _logging
logger = _logging.getLogger(__name__)


# ── p69: delivery rates per wilaya (home/office) ──
DEFAULT_DELIVERY_RATES = [
    {"wilaya_id": "01", "wilaya_name": "أدرار", "home_price": 1400, "office_price": 900},
    {"wilaya_id": "02", "wilaya_name": "الشلف", "home_price": 700, "office_price": 450},
    {"wilaya_id": "03", "wilaya_name": "الأغواط", "home_price": 900, "office_price": 600},
    {"wilaya_id": "04", "wilaya_name": "أم البواقي", "home_price": 750, "office_price": 500},
    {"wilaya_id": "05", "wilaya_name": "باتنة", "home_price": 750, "office_price": 500},
    {"wilaya_id": "06", "wilaya_name": "بجاية", "home_price": 650, "office_price": 450},
    {"wilaya_id": "07", "wilaya_name": "بسكرة", "home_price": 900, "office_price": 600},
    {"wilaya_id": "08", "wilaya_name": "بشار", "home_price": 1200, "office_price": 800},
    {"wilaya_id": "09", "wilaya_name": "البليدة", "home_price": 550, "office_price": 400},
    {"wilaya_id": "10", "wilaya_name": "البويرة", "home_price": 700, "office_price": 450},
    {"wilaya_id": "11", "wilaya_name": "تمنراست", "home_price": 1600, "office_price": 1000},
    {"wilaya_id": "12", "wilaya_name": "تبسة", "home_price": 900, "office_price": 600},
    {"wilaya_id": "13", "wilaya_name": "تلمسان", "home_price": 750, "office_price": 500},
    {"wilaya_id": "14", "wilaya_name": "تيارت", "home_price": 750, "office_price": 500},
    {"wilaya_id": "15", "wilaya_name": "تيزي وزو", "home_price": 600, "office_price": 400},
    {"wilaya_id": "16", "wilaya_name": "الجزائر", "home_price": 500, "office_price": 350},
    {"wilaya_id": "17", "wilaya_name": "الجلفة", "home_price": 950, "office_price": 650},
    {"wilaya_id": "18", "wilaya_name": "جيجل", "home_price": 700, "office_price": 450},
    {"wilaya_id": "19", "wilaya_name": "سطيف", "home_price": 650, "office_price": 450},
    {"wilaya_id": "20", "wilaya_name": "سعيدة", "home_price": 800, "office_price": 550},
    {"wilaya_id": "21", "wilaya_name": "سكيكدة", "home_price": 700, "office_price": 450},
    {"wilaya_id": "22", "wilaya_name": "سيدي بلعباس", "home_price": 700, "office_price": 450},
    {"wilaya_id": "23", "wilaya_name": "عنابة", "home_price": 700, "office_price": 450},
    {"wilaya_id": "24", "wilaya_name": "قالمة", "home_price": 750, "office_price": 500},
    {"wilaya_id": "25", "wilaya_name": "قسنطينة", "home_price": 650, "office_price": 450},
    {"wilaya_id": "26", "wilaya_name": "المدية", "home_price": 650, "office_price": 450},
    {"wilaya_id": "27", "wilaya_name": "مستغانم", "home_price": 700, "office_price": 450},
    {"wilaya_id": "28", "wilaya_name": "المسيلة", "home_price": 800, "office_price": 550},
    {"wilaya_id": "29", "wilaya_name": "معسكر", "home_price": 750, "office_price": 500},
    {"wilaya_id": "30", "wilaya_name": "ورقلة", "home_price": 1100, "office_price": 750},
    {"wilaya_id": "31", "wilaya_name": "وهران", "home_price": 600, "office_price": 400},
    {"wilaya_id": "32", "wilaya_name": "البيض", "home_price": 1000, "office_price": 700},
    {"wilaya_id": "33", "wilaya_name": "إليزي", "home_price": 1600, "office_price": 1100},
    {"wilaya_id": "34", "wilaya_name": "برج بوعريريج", "home_price": 700, "office_price": 450},
    {"wilaya_id": "35", "wilaya_name": "بومرداس", "home_price": 550, "office_price": 400},
    {"wilaya_id": "36", "wilaya_name": "الطارف", "home_price": 750, "office_price": 500},
    {"wilaya_id": "37", "wilaya_name": "تندوف", "home_price": 1400, "office_price": 900},
    {"wilaya_id": "38", "wilaya_name": "تيسمسيلت", "home_price": 850, "office_price": 550},
    {"wilaya_id": "39", "wilaya_name": "الوادي", "home_price": 1000, "office_price": 700},
    {"wilaya_id": "40", "wilaya_name": "خنشلة", "home_price": 850, "office_price": 550},
    {"wilaya_id": "41", "wilaya_name": "سوق أهراس", "home_price": 800, "office_price": 550},
    {"wilaya_id": "42", "wilaya_name": "تيبازة", "home_price": 550, "office_price": 400},
    {"wilaya_id": "43", "wilaya_name": "ميلة", "home_price": 700, "office_price": 450},
    {"wilaya_id": "44", "wilaya_name": "عين الدفلى", "home_price": 650, "office_price": 450},
    {"wilaya_id": "45", "wilaya_name": "النعامة", "home_price": 1000, "office_price": 700},
    {"wilaya_id": "46", "wilaya_name": "عين تموشنت", "home_price": 750, "office_price": 500},
    {"wilaya_id": "47", "wilaya_name": "غرداية", "home_price": 1000, "office_price": 700},
    {"wilaya_id": "48", "wilaya_name": "غليزان", "home_price": 700, "office_price": 450},
    {"wilaya_id": "49", "wilaya_name": "تيميمون", "home_price": 1400, "office_price": 900},
    {"wilaya_id": "50", "wilaya_name": "برج باجي مختار", "home_price": 1800, "office_price": 1200},
    {"wilaya_id": "51", "wilaya_name": "أولاد جلال", "home_price": 950, "office_price": 650},
    {"wilaya_id": "52", "wilaya_name": "بني عباس", "home_price": 1300, "office_price": 850},
    {"wilaya_id": "53", "wilaya_name": "عين صالح", "home_price": 1500, "office_price": 950},
    {"wilaya_id": "54", "wilaya_name": "عين قزام", "home_price": 1700, "office_price": 1100},
    {"wilaya_id": "55", "wilaya_name": "تقرت", "home_price": 1000, "office_price": 700},
    {"wilaya_id": "56", "wilaya_name": "جانت", "home_price": 1500, "office_price": 950},
    {"wilaya_id": "57", "wilaya_name": "المغير", "home_price": 1000, "office_price": 700},
    {"wilaya_id": "58", "wilaya_name": "المنيعة", "home_price": 1100, "office_price": 750},
]


UTM_KEYS = ("utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term")


def _sanitize_utm(raw) -> dict:
    """p78: keep only known utm_* keys, trimmed — never trust client input."""
    if not isinstance(raw, dict):
        return {}
    return {k: str(raw[k])[:100] for k in UTM_KEYS if raw.get(k)}




def _public_settings(settings: dict) -> dict:
    """p81: strip server-side secrets (CAPI tokens) before public exposure."""
    if isinstance(settings, dict):
        settings.pop("fb_access_token", None)
        settings.pop("tiktok_access_token", None)
        settings.pop("telegram_bot_token", None)
    return settings

def create_online_store_routes(db, main_db, get_current_user, get_tenant_admin, require_tenant, get_tenant_db) -> dict:
    router = APIRouter(tags=["online-store"])

    # ── Models ──

    class StoreSettings(BaseModel):
        enabled: bool = False
        store_name: str = ""
        store_slug: str = ""
        description: str = ""
        logo_url: str = ""
        banner_url: str = ""
        primary_color: str = "#3b82f6"
        contact_phone: str = ""
        contact_email: str = ""
        contact_address: str = ""
        working_hours: str = "09:00 - 18:00"
        cod_enabled: bool = True
        delivery_enabled: bool = True
        min_order_amount: float = 0
        delivery_fee: float = 0
        free_delivery_threshold: float = 0
        fb_pixel_id: str = ""      # p75: Meta (Facebook) Pixel ID
        tiktok_pixel_id: str = ""  # p75: TikTok Pixel ID
        fb_access_token: str = ""      # p81: Meta CAPI token (secret — never public)
        tiktok_access_token: str = ""  # p81: TikTok Events API token (secret)
        telegram_bot_token: str = ""       # p84: daily summary bot (secret)
        telegram_chat_id: str = ""         # p84: target chat
        telegram_daily_enabled: bool = False  # p84
        telegram_notify_new_order: bool = False  # p91: instant new-order alert

    class StoreOrder(BaseModel):
        customer_name: str
        customer_phone: str
        customer_email: str = ""
        delivery_address: str = ""  # p69: optional for office (desk) delivery
        delivery_city: str = ""
        delivery_wilaya: str = ""
        delivery_type: str = "home"  # p69: home | office
        items: List[dict]
        subtotal: float
        delivery_fee: float = 0
        total: float
        notes: str = ""
        payment_method: str = "cod"
        utm: Optional[dict] = None  # p78: campaign attribution

    class WooCommerceSettings(BaseModel):
        enabled: bool = False
        store_url: str = ""
        consumer_key: str = ""
        consumer_secret: str = ""
        sync_products: bool = True
        sync_orders: bool = True
        sync_customers: bool = True
        last_sync: str = ""

    # ── Online Store Routes ──

    @router.get("/store/settings")
    async def get_store_settings(admin: dict = Depends(get_tenant_admin)):
        settings = await db.store_settings.find_one({}, {"_id": 0})
        return settings or StoreSettings().model_dump()

    @router.put("/store/settings")
    async def update_store_settings(settings: StoreSettings, admin: dict = Depends(get_tenant_admin)):
        tenant_id = admin.get("tenant_id") or "platform"
        # p72: store NAME must be unique across tenants too (case-insensitive)
        if settings.store_name and settings.store_name.strip():
            import re as _re
            _name = settings.store_name.strip()
            _clash = await main_db.store_slugs.find_one({
                "store_name": {"$regex": f"^{_re.escape(_name)}$", "$options": "i"},
                "tenant_id": {"$ne": tenant_id},
            })
            if _clash:
                raise HTTPException(status_code=400, detail=f"اسم المتجر '{_name}' مستخدم من متجر آخر — اختر اسماً مختلفاً")
        await db.store_settings.update_one({}, {"$set": settings.model_dump()}, upsert=True)
        if settings.store_slug:
            # Ownership check must look up the SLUG, not the tenant —
            # the previous query-by-tenant made this guard a no-op and
            # allowed two tenants to claim the same public slug.
            existing = await main_db.store_slugs.find_one({"store_slug": settings.store_slug})
            if existing and existing.get("tenant_id") != tenant_id:
                raise HTTPException(status_code=400, detail="هذا الرابط المختصر مستخدم من متجر آخر — اختر رابطاً مختلفاً")
            await main_db.store_slugs.update_one(
                {"tenant_id": tenant_id},
                {"$set": {
                    "tenant_id": tenant_id,
                    "store_slug": settings.store_slug,
                    "enabled": settings.enabled,
                    "store_name": settings.store_name,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }},
                upsert=True
            )
        return {"message": "تم حفظ إعدادات المتجر"}

    @router.get("/store/products")
    async def get_store_products(admin: dict = Depends(get_tenant_admin)):
        store_products = await db.store_products.find({}, {"_id": 0}).to_list(1000)
        return store_products

    @router.post("/store/products")
    async def add_store_product(data: dict, admin: dict = Depends(get_tenant_admin)):
        product_id = data.get("product_id")
        if not product_id:
            raise HTTPException(status_code=400, detail="product_id required")
        existing = await db.store_products.find_one({"product_id": product_id})
        if existing:
            return {"message": "Product already in store"}
        store_product = {
            "id": str(uuid.uuid4()),
            "product_id": product_id,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.store_products.insert_one(store_product)
        return {"message": "تمت إضافة المنتج للمتجر"}

    @router.delete("/store/products/{product_id}")
    async def remove_store_product(product_id: str, admin: dict = Depends(get_tenant_admin)):
        await db.store_products.delete_one({"product_id": product_id})
        return {"message": "تمت إزالة المنتج من المتجر"}


    @router.get("/store/delivery-rates")
    async def get_delivery_rates(admin: dict = Depends(get_tenant_admin)):
        rates = await db.delivery_rates.find({}, {"_id": 0}).sort("id", 1).to_list(100)
        if not rates:
            return {"is_default": True, "rates": DEFAULT_DELIVERY_RATES}
        return {"is_default": False, "rates": [
            {"wilaya_id": r["id"], "wilaya_name": r.get("wilaya_name", ""), "home_price": r.get("home_price", 0), "office_price": r.get("office_price", 0)}
            for r in rates
        ]}

    @router.put("/store/delivery-rates")
    async def save_delivery_rates(data: dict, admin: dict = Depends(get_tenant_admin)):
        rates = data.get("rates", [])
        now = datetime.now(timezone.utc).isoformat()
        docs = []
        seen = set()
        for r in rates:
            wid = str(r.get("wilaya_id", "")).zfill(2)
            if not wid or wid in seen:
                continue
            seen.add(wid)
            docs.append({
                "id": wid,
                "wilaya_name": str(r.get("wilaya_name", "")),
                "home_price": max(0.0, float(r.get("home_price", 0) or 0)),
                "office_price": max(0.0, float(r.get("office_price", 0) or 0)),
                "updated_at": now,
            })
        await db.delivery_rates.delete_many({})
        if docs:
            await db.delivery_rates.insert_many(docs)
        return {"saved": len(docs)}

    @router.get("/shop/{store_slug}/delivery-rates")
    async def public_delivery_rates(store_slug: str):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            raise HTTPException(status_code=404, detail="Store not found")
        tenant_id = slug_mapping.get("tenant_id")
        tenant_db_inst = main_db if tenant_id == "platform" else get_tenant_db(tenant_id)
        rates = await tenant_db_inst.delivery_rates.find({}, {"_id": 0}).to_list(100)
        if not rates:
            rates = DEFAULT_DELIVERY_RATES
        return [{"wilaya_id": r.get("id") or r.get("wilaya_id"), "wilaya_name": r.get("wilaya_name", ""),
                 "home_price": r.get("home_price", 0), "office_price": r.get("office_price", 0)} for r in rates]

    @router.post("/store/telegram/test")
    async def test_telegram(data: dict = None, admin: dict = Depends(get_tenant_admin)):
        """p84: إرسال رسالة اختبار بالمفاتيح المرسلة أو المحفوظة."""
        data = data or {}
        st = await db.store_settings.find_one({}, {"_id": 0}) or {}
        token = (data.get("bot_token") or st.get("telegram_bot_token") or "").strip()
        chat = (data.get("chat_id") or st.get("telegram_chat_id") or "").strip()
        if not token or not chat:
            raise HTTPException(status_code=400, detail="أدخل توكن البوت ومعرف المحادثة أولاً")
        from services.telegram_daily import send_telegram
        ok, err = await send_telegram(token, chat, "✅ NT Commerce: تم ربط الملخص اليومي بنجاح")
        if not ok:
            raise HTTPException(status_code=400, detail=f"فشل الإرسال: {err}")
        return {"ok": True}

    _LANDING_DEFAULTS = {
        "enabled": False, "headline": "", "offer_text": "", "video_url": "",
        "old_price": 0, "fb_pixel_id": "", "tiktok_pixel_id": "",
    }

    @router.get("/store/landing/{product_id}")
    async def get_landing_config(product_id: str, admin: dict = Depends(get_tenant_admin)):
        """p82: إعدادات صفحة الهبوط لمنتج."""
        cfg = await db.store_landing_pages.find_one({"product_id": product_id}, {"_id": 0}) or {}
        merged = dict(_LANDING_DEFAULTS)
        merged.update({k: v for k, v in cfg.items() if k in _LANDING_DEFAULTS})
        merged["product_id"] = product_id
        return merged

    @router.put("/store/landing/{product_id}")
    async def save_landing_config(product_id: str, data: dict, admin: dict = Depends(get_tenant_admin)):
        """p82: حفظ إعدادات صفحة الهبوط."""
        product = await db.products.find_one({"id": product_id}, {"_id": 0, "id": 1})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        cfg = {k: data.get(k, v) for k, v in _LANDING_DEFAULTS.items()}
        cfg["enabled"] = bool(cfg.get("enabled"))
        cfg["old_price"] = max(0.0, float(cfg.get("old_price") or 0))
        for k in ("headline", "offer_text", "video_url", "fb_pixel_id", "tiktok_pixel_id"):
            cfg[k] = str(cfg.get(k) or "")[:500]
        cfg["product_id"] = product_id
        cfg["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.store_landing_pages.update_one({"product_id": product_id}, {"$set": cfg}, upsert=True)
        return {"ok": True, "config": cfg}

    @router.get("/shop/{store_slug}/lp/{product_id}")
    async def get_landing_page(store_slug: str, product_id: str):
        """p82: صفحة الهبوط العامة — منتج + إعدادات عامة + إعدادات الهبوط."""
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            raise HTTPException(status_code=404, detail="Store not found")
        tenant_id = slug_mapping.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=404, detail="Store not configured")
        tenant_db_inst = main_db if tenant_id == "platform" else get_tenant_db(tenant_id)

        cfg = await tenant_db_inst.store_landing_pages.find_one({"product_id": product_id}, {"_id": 0})
        if not cfg or not cfg.get("enabled"):
            raise HTTPException(status_code=404, detail="Landing page not available")
        product = await tenant_db_inst.products.find_one({"id": product_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail="Product not available")
        settings = await tenant_db_inst.store_settings.find_one({}, {"_id": 0}) or {}
        return {
            "success": True,
            "product": _pub_product(store_slug, product),
            "settings": _public_settings(settings),
            "landing": {k: cfg.get(k, v) for k, v in _LANDING_DEFAULTS.items()},
        }

    @router.get("/store/cart-leads")
    async def get_cart_leads(admin: dict = Depends(get_tenant_admin)):
        """p83: السلات المهجورة — هواتف بدأت الطلب ولم تكمله."""
        rows = await db.store_cart_leads.find(
            {"converted": False}, {"_id": 0}
        ).sort("last_seen", -1).limit(100).to_list(100)
        return {"leads": rows, "count": len(rows)}

    @router.get("/store/orders")
    async def get_store_orders(status: Optional[str] = None, admin: dict = Depends(get_tenant_admin)):
        query = {}
        if status:
            query["status"] = status
        orders = await db.store_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
        return orders

    ALLOWED_ORDER_STATUSES = {"pending", "confirmed", "shipped", "delivered", "cancelled", "refunded"}
    STOCK_RESTORING_STATUSES = {"cancelled", "refunded"}

    @router.put("/store/orders/{order_id}/status")
    async def update_store_order_status(order_id: str, data: dict, admin: dict = Depends(get_tenant_admin)):
        status = data.get("status")
        if not status:
            raise HTTPException(status_code=400, detail="status required")
        if status not in ALLOWED_ORDER_STATUSES:
            raise HTTPException(status_code=400, detail=f"حالة غير صالحة. المسموح: {', '.join(sorted(ALLOWED_ORDER_STATUSES))}")
        order = await db.store_orders.find_one({"id": order_id})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        now = datetime.now(timezone.utc).isoformat()
        # Restore stock exactly once when transitioning into cancelled/refunded
        if status in STOCK_RESTORING_STATUSES and not order.get("stock_restored"):
            for item in order.get("items", []):
                pid = item.get("product_id")
                qty = item.get("quantity", 1)
                if pid:
                    await db.products.update_one({"id": pid}, {"$inc": {"quantity": qty}})
                    _vidx = item.get("variant_index")  # p73
                    if isinstance(_vidx, int):
                        await db.products.update_one({"id": pid}, {"$inc": {f"variants.{_vidx}.quantity": qty}})
            await db.store_orders.update_one({"id": order_id}, {"$set": {"stock_restored": True}})
        await db.store_orders.update_one(
            {"id": order_id},
            {"$set": {"status": status, "updated_at": now}}
        )
        # مزامنة الحالة إلى صندوق الطلبات الموحَّد (تحديث مباشر — بلا آثار جانبية على المخزون)
        try:
            _st_map = {"pending": "new", "confirmed": "confirmed", "shipped": "shipped",
                       "delivered": "delivered", "cancelled": "cancelled", "refunded": "refunded"}
            _est = _st_map.get(status)
            if _est:
                await db.ecom_orders.update_one(
                    {"channel": "webstore", "external_id": order_id},
                    {"$set": {"status": _est, "updated_at": now},
                     "$push": {"status_history": {"status": _est, "at": now, "by": admin.get("id"), "note": "مزامنة من صفحة المتجر"}}}
                )
        except Exception:
            pass
        return {"message": "تم تحديث حالة الطلب"}

    # Public store endpoints (no auth required)
    # ── تقديم صور المنتجات العامة محسّنة (JPEG مصغّر + كاش) ──
    # الصور تُخزَّن base64 في قاعدة البيانات؛ إرسالها داخل JSON يجعل الصفحة بيضاء
    # لثقلها (عدة ميغابايت). هنا نحوّل الروابط الداخلية إلى نقطة تقديم خفيفة.
    _IMG_CACHE: dict = {}

    def _optimize_data_url(data_url, max_dim=900, quality=72):
        try:
            from PIL import Image
            raw = _b64.b64decode(data_url.split(",", 1)[1])
            img = Image.open(_io.BytesIO(raw))
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            img.thumbnail((max_dim, max_dim))
            buf = _io.BytesIO()
            img.save(buf, "JPEG", quality=quality, optimize=True)
            return buf.getvalue()
        except Exception:
            return None

    def _pub_img(store_slug, pid, idx, val):
        if isinstance(val, str) and val.startswith("data:"):
            return f"/api/shop/{store_slug}/img/{pid}/{idx}.jpg"
        return val

    def _pub_product(store_slug, p):
        if not p:
            return p
        p = dict(p)
        pid = p.get("id")
        p["image_url"] = _pub_img(store_slug, pid, 0, p.get("image_url"))
        if isinstance(p.get("images"), list):
            p["images"] = [_pub_img(store_slug, pid, i + 1, v) for i, v in enumerate(p["images"])]
        return p

    @router.get("/shop/{store_slug}/img/{product_id}/{idx}.jpg")
    async def public_product_image(store_slug: str, product_id: str, idx: int):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            raise HTTPException(status_code=404, detail="Store not found")
        tenant_id = slug_mapping.get("tenant_id")
        tenant_db_inst = main_db if tenant_id == "platform" else get_tenant_db(tenant_id)
        meta = await tenant_db_inst.products.find_one({"id": product_id}, {"_id": 0, "updated_at": 1})
        if not meta:
            raise HTTPException(status_code=404, detail="Product not found")
        key = (tenant_id, product_id, idx, meta.get("updated_at"))
        headers = {"Cache-Control": "public, max-age=86400"}
        if key in _IMG_CACHE:
            return _ImgResponse(content=_IMG_CACHE[key], media_type="image/jpeg", headers=headers)
        product = await tenant_db_inst.products.find_one({"id": product_id}, {"_id": 0, "image_url": 1, "images": 1})
        src = None
        if idx == 0:
            src = product.get("image_url")
        else:
            imgs = product.get("images") or []
            if 0 < idx <= len(imgs):
                src = imgs[idx - 1]
        if not src or not isinstance(src, str) or not src.startswith("data:"):
            raise HTTPException(status_code=404, detail="Image not found")
        data = _optimize_data_url(src)
        if not data:
            raise HTTPException(status_code=404, detail="Image not available")
        if len(_IMG_CACHE) > 600:
            _IMG_CACHE.clear()
        _IMG_CACHE[key] = data
        return _ImgResponse(content=data, media_type="image/jpeg", headers=headers)

    @router.get("/shop/{store_slug}")
    async def get_public_store(store_slug: str):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            raise HTTPException(status_code=404, detail="Store not found")
        tenant_id = slug_mapping.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=404, detail="Store not configured")
        tenant_db_inst = main_db if tenant_id == "platform" else get_tenant_db(tenant_id)
        settings = await tenant_db_inst.store_settings.find_one({}, {"_id": 0})
        if not settings or not settings.get("enabled"):
            raise HTTPException(status_code=404, detail="Store not available")

        store_products = await tenant_db_inst.store_products.find({"is_active": True}, {"_id": 0}).to_list(1000)
        product_ids = [sp["product_id"] for sp in store_products]

        products = await tenant_db_inst.products.find(
            {"id": {"$in": product_ids}},
            {"_id": 0, "id": 1, "name_ar": 1, "name_en": 1, "retail_price": 1,
             "purchase_price": 1, "image_url": 1, "description_ar": 1,
             "description_en": 1, "quantity": 1, "family_id": 1, "barcode": 1}
        ).to_list(1000)
        # المتوفر أولاً ثم النافد (يظهر بشارة «نفذت الكمية» في الواجهة)
        products.sort(key=lambda p: (p.get("quantity", 0) <= 0, p.get("name_ar") or ""))

        family_ids = list(set(p.get("family_id") for p in products if p.get("family_id")))
        families = []
        if family_ids:
            families = await tenant_db_inst.product_families.find(
                {"id": {"$in": family_ids}}, {"_id": 0, "id": 1, "name": 1, "name_ar": 1, "name_en": 1, "image_url": 1}
            ).to_list(100)

        products_by_family = {}
        for family in families:
            family_products = [p for p in products if p.get("family_id") == family["id"]]
            if family_products:
                products_by_family[family["id"]] = {
                    "family": family,
                    "products": family_products
                }

        uncategorized = [p for p in products if not p.get("family_id")]
        total_products = len(products)
        low_stock = len([p for p in products if p.get("quantity", 0) < 5])

        products = [_pub_product(store_slug, p) for p in products]
        for fid, grp in products_by_family.items():
            grp["products"] = [_pub_product(store_slug, p) for p in grp["products"]]
        uncategorized = [_pub_product(store_slug, p) for p in uncategorized]
        return {
            "success": True,
            "settings": _public_settings(settings),
            "products": products,
            "families": families,
            "products_by_family": products_by_family,
            "uncategorized": uncategorized,
            "stats": {"total_products": total_products, "low_stock": low_stock},
            "tenant_id": tenant_id
        }

    @router.get("/shop/{store_slug}/families")
    async def get_store_families(store_slug: str):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            raise HTTPException(status_code=404, detail="Store not found")
        tenant_id = slug_mapping.get("tenant_id")
        tenant_db_inst = main_db if tenant_id == "platform" else get_tenant_db(tenant_id)
        families = await tenant_db_inst.product_families.find({}, {"_id": 0}).to_list(100)
        return {"success": True, "families": families}

    @router.post("/shop/{store_slug}/cart-lead")
    async def capture_cart_lead(store_slug: str, data: dict):
        """p83: السلة المهجورة — التقاط هاتف من بدأ الطلب ولم يكمله."""
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            raise HTTPException(status_code=404, detail="Store not found")
        tenant_id = slug_mapping.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=404, detail="Store not configured")
        tenant_db_inst = main_db if tenant_id == "platform" else get_tenant_db(tenant_id)

        phone = re.sub(r"[^0-9+]", "", str(data.get("phone") or ""))
        if len(phone) < 8 or len(phone) > 20:
            raise HTTPException(status_code=400, detail="invalid phone")
        name = str(data.get("name") or "")[:80]
        items_in = data.get("items") or []
        items = [{"name": str(i.get("name", ""))[:80],
                  "quantity": max(1, min(int(i.get("quantity", 1) or 1), 99)),
                  "price": max(0.0, float(i.get("price", 0) or 0))}
                 for i in items_in[:10] if isinstance(i, dict)]
        total = max(0.0, float(data.get("total", 0) or 0))
        now = datetime.now(timezone.utc).isoformat()
        await tenant_db_inst.store_cart_leads.update_one(
            {"phone": phone, "converted": False},
            {"$set": {"name": name, "items": items, "total": total, "last_seen": now},
             "$setOnInsert": {"id": str(uuid.uuid4()), "first_seen": now, "store_slug": store_slug}},
            upsert=True,
        )
        return {"ok": True}

    @router.post("/shop/{store_slug}/order")
    async def create_public_order(store_slug: str, order: StoreOrder):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            raise HTTPException(status_code=404, detail="Store not found")
        tenant_id = slug_mapping.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=404, detail="Store not configured")
        tenant_db_inst = main_db if tenant_id == "platform" else get_tenant_db(tenant_id)
        settings = await tenant_db_inst.store_settings.find_one({"enabled": True})
        if not settings:
            raise HTTPException(status_code=404, detail="Store not available")
        if settings.get("min_order_amount", 0) > 0 and order.subtotal < settings["min_order_amount"]:
            raise HTTPException(status_code=400, detail=f"Minimum order amount is {settings['min_order_amount']}")
        # p69: server-side delivery fee from tenant rates — never trust the client
        _rates = {r["id"]: r for r in await tenant_db_inst.delivery_rates.find({}, {"_id": 0}).to_list(100)}
        _rate = _rates.get(str(order.delivery_wilaya).zfill(2))
        _fee = 0.0
        if _rate:
            _fee = float(_rate.get("office_price", 0) if order.delivery_type == "office" else _rate.get("home_price", 0))
        order.delivery_fee = _fee
        order.total = round(float(order.subtotal) + _fee, 2)
        if order.delivery_type == "office":
            order.delivery_address = ""  # desk delivery: no detailed address needed
        # Atomic stock claim per product (merged duplicates), all-or-nothing —
        # same pattern as POS create_sale_op: conditional find_one_and_update,
        # rollback prior claims on any shortfall
        _claim = {}
        _names = {}
        for item in order.items:
            pid = item.get("product_id")
            if not pid:
                continue
            _vidx = item.get("variant_index")
            key = (pid, _vidx if isinstance(_vidx, int) else None)
            _claim[key] = _claim.get(key, 0) + item.get("quantity", 1)
            _names[pid] = item.get("name", "")
        _claimed = []

        async def _rollback_claims():
            for cid, cqty, cvidx in _claimed:
                await tenant_db_inst.products.update_one({"id": cid}, {"$inc": {"quantity": cqty}})
                if cvidx is not None:
                    await tenant_db_inst.products.update_one({"id": cid}, {"$inc": {f"variants.{cvidx}.quantity": cqty}})

        for (pid, vidx), qty in _claim.items():
            product = await tenant_db_inst.products.find_one({"id": pid}, {"_id": 0, "name_ar": 1, "name_en": 1, "quantity": 1, "is_non_stockable": 1, "has_variants": 1, "variants": 1})
            if not product:
                raise HTTPException(status_code=400, detail=f"Product {_names.get(pid, 'Unknown')} not found")
            if product.get("is_non_stockable"):
                continue
            pname = product.get("name_ar") or product.get("name_en") or _names.get(pid, pid)
            # p73: variant-level availability check
            if vidx is not None and product.get("has_variants"):
                _variants = product.get("variants") or []
                if not (0 <= vidx < len(_variants)):
                    await _rollback_claims()
                    raise HTTPException(status_code=400, detail=f"متغير غير صالح للمنتج '{pname}'")
                _v = _variants[vidx]
                if float(_v.get("quantity", 0) or 0) < qty:
                    await _rollback_claims()
                    _vlabel = " / ".join(x for x in [_v.get("color", ""), _v.get("size", "")] if x) or f"#{vidx + 1}"
                    raise HTTPException(status_code=400, detail=f"المتغير '{_vlabel}' من '{pname}' غير متوفر بالكمية المطلوبة (المتاح {int(_v.get('quantity', 0))})")
            res = await tenant_db_inst.products.find_one_and_update(
                {"id": pid, "quantity": {"$gte": qty}},
                {"$inc": {"quantity": -qty}},
            )
            if res is None:
                await _rollback_claims()
                raise HTTPException(status_code=400, detail=f"المنتج '{pname}' غير متوفر بالكمية المطلوبة (المتاح {product.get('quantity', 0)})")
            if vidx is not None and product.get("has_variants"):
                await tenant_db_inst.products.update_one({"id": pid}, {"$inc": {f"variants.{vidx}.quantity": -qty}})
            _claimed.append((pid, qty, vidx))
        count = await tenant_db_inst.store_orders.count_documents({}) + 1
        order_number = f"WEB{count:06d}"
        order_data = {
            "id": str(uuid.uuid4()),
            "order_number": order_number,
            "store_slug": store_slug,
            **order.model_dump(),
            "status": "pending",
            "payment_status": "unpaid",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        order_data["utm"] = _sanitize_utm(getattr(order, "utm", None))
        order_data["utm_source"] = order_data["utm"].get("utm_source", "")
        await tenant_db_inst.store_orders.insert_one(order_data)
        # p83: close any open abandoned-cart lead for this phone
        try:
            _ph = re.sub(r"[^0-9+]", "", order.customer_phone or "")
            if _ph:
                await tenant_db_inst.store_cart_leads.update_many(
                    {"phone": _ph, "converted": False},
                    {"$set": {"converted": True, "order_number": order_number, "converted_at": datetime.now(timezone.utc).isoformat()}},
                )
        except Exception as _e:  # noqa: BLE001
            logger.warning("cart-lead conversion mark failed: %s", _e)
        # مزامنة فورية إلى صندوق الطلبات الموحَّد (قناة webstore)
        # inventory_deducted=True: المخزون حُسم أعلاه لحظة الإنشاء — يمنع الحسم المزدوج عند التأكيد من الصندوق
        try:
            now = datetime.now(timezone.utc).isoformat()  # p45: was undefined -> every webstore order 500'd after insert
            ecom_items = [
                {
                    "name": (it.get("name", "") + (f" ({it.get('variant_label')})" if it.get("variant_label") else "")),
                    "sku": "",
                    "product_id": it.get("product_id"),
                    "variant_index": it.get("variant_index"),
                    "qty": int(it.get("quantity", 1) or 1),
                    "price": float(it.get("price", 0) or 0),
                    "total": round(int(it.get("quantity", 1) or 1) * float(it.get("price", 0) or 0), 2),
                }
                for it in order.items
            ]
            ecom_sub = round(sum(i["total"] for i in ecom_items), 2)
            ecom_ship = max(0.0, float(getattr(order, "delivery_fee", 0) or 0))
            ecom_doc = {
                "id": str(uuid.uuid4()),
                "order_code": order_number,
                "channel": "webstore",
                "external_id": order_data["id"],
                "integration_id": None,
                "status": "new",
                "payment_status": "unpaid",
                "customer": {
                    "name": order.customer_name or "",
                    "phone": order.customer_phone or "",
                    "address": getattr(order, "delivery_address", "") or "",
                    "city": getattr(order, "delivery_city", "") or "",
                    "wilaya": getattr(order, "delivery_wilaya", "") or "",
                },
                "items": ecom_items,
                "subtotal": ecom_sub, "shipping_fee": ecom_ship, "total": round(ecom_sub + ecom_ship, 2),
                "notes": order.notes or "",
                "tags": [],
                "shipping_label_id": None, "tracking_number": None, "courier": None,
                "inventory_deducted": True,
                "utm": order_data["utm"], "utm_source": order_data["utm_source"],
                "status_history": [{"status": "new", "at": now, "by": "webstore"}],
                "created_at": now, "updated_at": now, "created_by": "webstore",
            }
            await tenant_db_inst.ecom_orders.insert_one(ecom_doc)
            try:  # p87: mirror into the POS sales ledger
                from services.application.ecom_order_service import sync_sale_doc
                await sync_sale_doc(tenant_db_inst, ecom_doc)
            except Exception as _se:
                logger.warning(f"p87 sale doc sync failed: {_se}")
            try:  # p91: instant Telegram alert (fire-and-forget)
                import asyncio as _aio
                from services.telegram_daily import notify_new_order as _tg_new
                _aio.create_task(_tg_new(tenant_db_inst, ecom_doc))
            except Exception as _te:
                logger.warning(f"p91 telegram hook failed: {_te}")
        except Exception as e:
            logger.error(f"ecom webstore sync error: {e}")
        # NEW: Send Conversions API Purchase Event
        try:
            _pixels = {
                "fb_pixel_id": settings.get("fb_pixel_id", ""),
                "fb_access_token": settings.get("fb_access_token", ""),
                "tiktok_pixel_id": settings.get("tiktok_pixel_id", ""),
                "tiktok_access_token": settings.get("tiktok_access_token", ""),
            }
            await conversions_service.send_purchase(
                order_data["id"],
                order.items,
                order.total,
                f"https://nt-commerce.net/shop/{store_slug}/product/{order.items[0].get('product_id', '')}" if order.items else "",
                {
                    "email": order.customer_email,
                    "phone": order.customer_phone
                },
                tenant_id,
                pixels=_pixels,
                event_id=order_number,
            )
        except Exception as e:
            logger.error(f"Conversions API error: {e}")

        # NEW: Send WhatsApp Notification
        try:
            await whatsapp_service.send_order_confirmation(
                order.customer_phone,
                order_number,
                order.customer_name,
                order.total,
                [item.model_dump() if hasattr(item, 'model_dump') else item for item in order.items]
            )
        except Exception as e:
            logger.error(f"WhatsApp error: {e}")

        # NEW: Add Loyalty Points
        try:
            await loyalty_service.get_or_create_customer(
                tenant_db_inst,
                order.customer_phone,
                order.customer_name
            )
            await loyalty_service.add_points(
                tenant_db_inst,
                order.customer_phone,
                order.total,
                order_data["id"]
            )
        except Exception as e:
            logger.error(f"Loyalty error: {e}")
        return {"message": "تم استلام طلبك بنجاح", "order_number": order_number, "order_id": order_data["id"]}

    # ── WooCommerce Routes ──

    def _decrypt_wc(settings):
        """Decrypt WooCommerce secrets read from DB (legacy plaintext passes through)."""
        if settings:
            from utils.crypto import decrypt_field
            settings["consumer_key"] = decrypt_field(settings.get("consumer_key"))
            settings["consumer_secret"] = decrypt_field(settings.get("consumer_secret"))
        return settings

    @router.get("/woocommerce/settings")
    async def get_woocommerce_settings(admin: dict = Depends(get_tenant_admin)):
        settings = _decrypt_wc(await db.woocommerce_settings.find_one({"id": "global"}, {"_id": 0}))
        if not settings:
            settings = {"id": "global", "enabled": False, "store_url": "", "consumer_key": "", "consumer_secret": "", "sync_products": True, "sync_orders": True, "sync_customers": True, "last_sync": ""}
            # نسخة منفصلة للإدراج — insert_one يلوّث القاموس بـ _id ويسبب 500 في أول استدعاء
            await db.woocommerce_settings.insert_one(dict(settings))
        return settings

    @router.put("/woocommerce/settings")
    async def update_woocommerce_settings(settings: WooCommerceSettings, admin: dict = Depends(get_tenant_admin)):
        from utils.crypto import encrypt_field
        data = settings.model_dump()
        data["consumer_key"] = encrypt_field(data.get("consumer_key"))
        data["consumer_secret"] = encrypt_field(data.get("consumer_secret"))
        await db.woocommerce_settings.update_one({"id": "global"}, {"$set": data}, upsert=True)
        return {"message": "تم حفظ إعدادات WooCommerce"}

    @router.post("/woocommerce/test-connection")
    async def test_woocommerce_connection(admin: dict = Depends(get_tenant_admin)):
        settings = await db.woocommerce_settings.find_one({"id": "global"}, {"_id": 0})
        if not settings or not settings.get("store_url"):
            raise HTTPException(status_code=400, detail="يرجى إدخال رابط المتجر أولاً")
        return {"success": True, "message": "تم الاتصال بالمتجر بنجاح (وضع المحاكاة)", "store_info": {"name": "متجرك", "url": settings.get("store_url"), "version": "8.0.0"}}

    @router.post("/woocommerce/publish-product/{product_id}")
    async def publish_product_to_woocommerce(product_id: str, admin: dict = Depends(get_tenant_admin)):
        wc_settings = _decrypt_wc(await db.woocommerce_settings.find_one({"id": "global"}, {"_id": 0}))
        if not wc_settings or not wc_settings.get("enabled"):
            raise HTTPException(status_code=400, detail="WooCommerce غير مفعل")
        product = await db.products.find_one({"id": product_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        now = datetime.now(timezone.utc).isoformat()
        wc_product_id = f"wc_{product_id[:8]}"
        await db.products.update_one({"id": product_id}, {"$set": {"woocommerce_id": wc_product_id, "woocommerce_status": "published", "woocommerce_url": f"{wc_settings.get('store_url')}/product/{product.get('name_en', '').lower().replace(' ', '-')}", "woocommerce_synced_at": now}})
        return {"success": True, "message": f"تم نشر المنتج '{product.get('name_en')}' على المتجر", "woocommerce_id": wc_product_id}

    @router.post("/woocommerce/publish-products")
    async def publish_multiple_products(product_ids: List[str], admin: dict = Depends(get_tenant_admin)):
        wc_settings = _decrypt_wc(await db.woocommerce_settings.find_one({"id": "global"}, {"_id": 0}))
        if not wc_settings or not wc_settings.get("enabled"):
            raise HTTPException(status_code=400, detail="WooCommerce غير مفعل")
        now = datetime.now(timezone.utc).isoformat()
        published, failed = [], []
        for pid in product_ids:
            product = await db.products.find_one({"id": pid}, {"_id": 0})
            if not product:
                failed.append({"id": pid, "error": "المنتج غير موجود"})
                continue
            wc_pid = f"wc_{pid[:8]}"
            await db.products.update_one({"id": pid}, {"$set": {"woocommerce_id": wc_pid, "woocommerce_status": "published", "woocommerce_synced_at": now}})
            published.append({"id": pid, "name": product.get("name_en"), "woocommerce_id": wc_pid})
        return {"success": True, "message": f"تم نشر {len(published)} منتج على المتجر", "published": published, "failed": failed}

    @router.delete("/woocommerce/unpublish-product/{product_id}")
    async def unpublish_product(product_id: str, admin: dict = Depends(get_tenant_admin)):
        product = await db.products.find_one({"id": product_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        await db.products.update_one({"id": product_id}, {"$unset": {"woocommerce_id": "", "woocommerce_status": "", "woocommerce_url": "", "woocommerce_synced_at": ""}})
        return {"success": True, "message": f"تم إلغاء نشر المنتج '{product.get('name_en')}' من المتجر"}

    @router.post("/woocommerce/sync-inventory")
    async def sync_inventory(admin: dict = Depends(get_tenant_admin)):
        products = await db.products.find({"woocommerce_id": {"$exists": True, "$ne": ""}}, {"_id": 0}).to_list(1000)
        now = datetime.now(timezone.utc).isoformat()
        for product in products:
            await db.products.update_one({"id": product["id"]}, {"$set": {"woocommerce_synced_at": now}})
        await db.woocommerce_settings.update_one({"id": "global"}, {"$set": {"last_sync": now}})
        return {"success": True, "message": f"تم مزامنة {len(products)} منتج", "synced_at": now}

    # NEW: Store Slug Management

    @router.get("/store/slug")
    async def get_store_slug(admin: dict = Depends(get_tenant_admin)):
        tenant_id = admin.get("tenant_id") or "platform"
        slug_mapping = await main_db.store_slugs.find_one({"tenant_id": tenant_id}, {"_id": 0})
        if not slug_mapping:
            return {"success": True, "slug": None, "url": None, "enabled": False}
        base_url = "https://nt-commerce.net"
        return {
            "success": True,
            "slug": slug_mapping.get("store_slug"),
            "url": f"{base_url}/shop/{slug_mapping.get('store_slug')}",
            "enabled": slug_mapping.get("enabled", False)
        }

    @router.get("/store/check-slug")
    async def check_slug_availability(slug: str):
        clean = re.sub(r'[^a-zA-Z0-9\-_]', '', slug).lower()
        if len(clean) < 3:
            return {"available": False, "reason": "Slug قصير جداً"}
        existing = await main_db.store_slugs.find_one({"store_slug": clean})
        return {"available": existing is None, "slug": clean}

    # NEW: Public Product Detail

    @router.get("/shop/{store_slug}/product/{product_id}")
    async def get_product_detail(store_slug: str, product_id: str):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            raise HTTPException(status_code=404, detail="Store not found")

        tenant_id = slug_mapping.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=404, detail="Store not configured")

        tenant_db_inst = main_db if tenant_id == "platform" else get_tenant_db(tenant_id)

        store_product = await tenant_db_inst.store_products.find_one(
            {"product_id": product_id, "is_active": True}, {"_id": 0}
        )
        if not store_product:
            raise HTTPException(status_code=404, detail="Product not found in store")

        product = await tenant_db_inst.products.find_one(
            {"id": product_id}, {"_id": 0}
        )
        if not product:
            raise HTTPException(status_code=404, detail="Product not available")

        related_products = await tenant_db_inst.products.find(
            {
                "id": {"$ne": product_id},
                "family_id": product.get("family_id"),
                "quantity": {"$gt": 0}
            },
            {"_id": 0, "id": 1, "name_ar": 1, "name_en": 1, "retail_price": 1, "selling_price": 1, "image_url": 1}
        ).limit(4).to_list(4)

        settings = await tenant_db_inst.store_settings.find_one({}, {"_id": 0}) or {}

        return {
            "success": True,
            "product": _pub_product(store_slug, product),
            "related_products": [_pub_product(store_slug, p) for p in related_products],
            "settings": _public_settings(settings)
        }

    # ── NEW: Coupon Management ──

    @router.get("/store/coupons")
    async def get_coupons(admin: dict = Depends(get_tenant_admin)):
        coupons = await coupon_service.get_coupons(db, active_only=True)
        return {"success": True, "coupons": coupons}

    @router.post("/store/coupons")
    async def create_coupon(data: dict, admin: dict = Depends(get_tenant_admin)):
        coupon = await coupon_service.create_coupon(db, data)
        return {"success": True, "coupon": coupon}

    @router.delete("/store/coupons/{coupon_id}")
    async def delete_coupon(coupon_id: str, admin: dict = Depends(get_tenant_admin)):
        result = await coupon_service.delete_coupon(db, coupon_id)
        return {"success": result, "message": "تم حذف الكوبون" if result else "فشل الحذف"}

    @router.post("/shop/{store_slug}/validate-coupon")
    async def validate_public_coupon(store_slug: str, data: dict):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            raise HTTPException(status_code=404, detail="Store not found")
        tenant_id = slug_mapping.get("tenant_id")
        tenant_db_inst = main_db if tenant_id == "platform" else get_tenant_db(tenant_id)

        result = await coupon_service.validate_coupon(
            tenant_db_inst,
            data.get("code", ""),
            data.get("subtotal", 0),
            data.get("customer_phone", ""),
            data.get("product_ids", [])
        )
        return result

    # ── NEW: Loyalty Points ──

    @router.get("/store/loyalty/customer/{phone}")
    async def get_customer_loyalty(phone: str, admin: dict = Depends(get_tenant_admin)):
        result = await loyalty_service.get_customer_points(db, phone)
        return {"success": True, "data": result}

    @router.get("/store/loyalty/transactions/{phone}")
    async def get_loyalty_transactions(phone: str, admin: dict = Depends(get_tenant_admin)):
        transactions = await loyalty_service.get_transactions(db, phone)
        return {"success": True, "transactions": transactions}

    @router.post("/shop/{store_slug}/loyalty/redeem")
    async def redeem_loyalty_points(store_slug: str, data: dict):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            raise HTTPException(status_code=404, detail="Store not found")
        tenant_id = slug_mapping.get("tenant_id")
        tenant_db_inst = main_db if tenant_id == "platform" else get_tenant_db(tenant_id)

        result = await loyalty_service.redeem_points(
            tenant_db_inst,
            data.get("phone", ""),
            data.get("points", 0),
            data.get("order_id", "")
        )
        return result

    # ── NEW: Shipping Tracking ──

    @router.post("/store/orders/{order_id}/shipping")
    async def create_shipping_tracking(
        order_id: str,
        data: dict,
        admin: dict = Depends(get_tenant_admin)
    ):
        tracking = await shipping_tracker.create_tracking(
            db, order_id, data.get("carrier", "manual"),
            data.get("tracking_number", ""),
            data.get("status", "pending")
        )
        return {"success": True, "tracking": tracking}

    @router.put("/store/orders/{order_id}/shipping/status")
    async def update_shipping_status(
        order_id: str,
        data: dict,
        admin: dict = Depends(get_tenant_admin)
    ):
        result = await shipping_tracker.update_status(
            db, order_id, data.get("status", ""),
            data.get("location", ""),
            data.get("note", "")
        )

        # Send WhatsApp notification if status changed
        if result:
            order = await db.store_orders.find_one({"id": order_id}, {"_id": 0})
            if order and order.get("customer_phone"):
                await whatsapp_service.send_shipping_update(
                    order["customer_phone"],
                    order_id,
                    data.get("status", ""),
                    data.get("tracking_url", "")
                )

        return {"success": result}

    @router.get("/store/orders/{order_id}/shipping")
    async def get_shipping_tracking(order_id: str, admin: dict = Depends(get_tenant_admin)):
        tracking = await shipping_tracker.get_tracking(db, order_id)
        if tracking:
            tracking["status_display"] = shipping_tracker.get_status_display(tracking.get("status", ""))
        return {"success": True, "tracking": tracking}

    @router.get("/shop/{store_slug}/track/{order_id}")
    async def public_track_order(store_slug: str, order_id: str):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            raise HTTPException(status_code=404, detail="Store not found")
        tenant_id = slug_mapping.get("tenant_id")
        tenant_db_inst = main_db if tenant_id == "platform" else get_tenant_db(tenant_id)

        tracking = await shipping_tracker.get_tracking(tenant_db_inst, order_id)
        order = await tenant_db_inst.store_orders.find_one({"id": order_id}, {"_id": 0})

        if not tracking and not order:
            raise HTTPException(status_code=404, detail="Order not found")

        return {
            "success": True,
            "order": order,
            "tracking": tracking,
            "status_display": shipping_tracker.get_status_display(tracking.get("status", "pending")) if tracking else None
        }

    # ── NEW: Webhook Events (Conversions API) ──

    @router.post("/shop/{store_slug}/events/pageview")
    async def track_page_view(store_slug: str, data: dict):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            return {"tracked": False}

        _tid = slug_mapping.get("tenant_id", "")
        _pixels = None
        try:
            _tdb = main_db if _tid == "platform" else get_tenant_db(_tid)
            _s = await _tdb.store_settings.find_one({}, {"_id": 0, "fb_pixel_id": 1, "fb_access_token": 1, "tiktok_pixel_id": 1, "tiktok_access_token": 1})
            if _s:
                _pixels = _s
        except Exception:  # noqa: BLE001
            pass
        await conversions_service.send_page_view(
            data.get("url", ""),
            {
                "email": data.get("email", ""),
                "phone": data.get("phone", "")
            },
            _tid,
            pixels=_pixels,
        )
        return {"tracked": True}

    @router.post("/shop/{store_slug}/events/view-content")
    async def track_view_content(store_slug: str, data: dict):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            return {"tracked": False}

        await conversions_service.send_view_content(
            data.get("product_id", ""),
            data.get("product_name", ""),
            data.get("price", 0),
            data.get("url", ""),
            {
                "email": data.get("email", ""),
                "phone": data.get("phone", "")
            },
            slug_mapping.get("tenant_id", "")
        )
        return {"tracked": True}

    @router.post("/shop/{store_slug}/events/add-to-cart")
    async def track_add_to_cart(store_slug: str, data: dict):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            return {"tracked": False}

        await conversions_service.send_add_to_cart(
            data.get("product_id", ""),
            data.get("product_name", ""),
            data.get("price", 0),
            data.get("quantity", 1),
            data.get("url", ""),
            {
                "email": data.get("email", ""),
                "phone": data.get("phone", "")
            },
            slug_mapping.get("tenant_id", "")
        )
        return {"tracked": True}

    @router.post("/shop/{store_slug}/events/purchase")
    async def track_purchase_event(store_slug: str, data: dict):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            return {"tracked": False}

        await conversions_service.send_purchase(
            data.get("order_id", ""),
            data.get("items", []),
            data.get("total", 0),
            data.get("url", ""),
            {
                "email": data.get("email", ""),
                "phone": data.get("phone", "")
            },
            slug_mapping.get("tenant_id", "")
        )
        return {"tracked": True}

    return router
