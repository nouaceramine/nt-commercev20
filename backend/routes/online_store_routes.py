"""
Online Store & WooCommerce Integration Routes
Extracted from server.py
"""
from fastapi import APIRouter, HTTPException, Depends, Request
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
from services.code_generator import public_order_code
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
        wa_confirm_enabled: bool = False  # p101: WhatsApp auto-confirmation before shipping
        cart_recovery_enabled: bool = True    # p107: auto WhatsApp reminder for abandoned carts (needs active WhatsApp integration)
        cart_recovery_delay_hours: int = 3    # p107: send reminder after this many hours
        online_payment_enabled: bool = False  # p149: مفتاح عرض الدفع الإلكتروني في المتجر
        visible_family_ids: List[str] = []    # p149: عائلات تُعرض تلقائياً في المتجر (فارغ = المنتجات المختارة يدوياً فقط)
        store_shipping_companies: List[str] = []  # p150: شركات الشحن المعروضة للزبون (فارغ = رسوم التوصيل الثابتة الحالية)

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
        shipping_company: str = ""  # p150: الشركة التي اختارها الزبون
        utm: Optional[dict] = None  # p78: campaign attribution
        coupon_code: str = ""       # p494i: كوبون الخصم — يُتحقق منه ويُحتسب خادمياً
        coupon_discount: float = 0  # p494i: قيمة الخصم (يحدّدها الخادم، يتجاهل قيمة العميل)

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
        if settings:  # p272: decrypt secrets for the admin UI round-trip
            from services.crypto_fields import decrypt_field as _df
            for _k in ("fb_access_token", "tiktok_access_token", "telegram_bot_token"):
                if settings.get(_k):
                    settings[_k] = _df(settings[_k]) or ""
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
        _sd = settings.model_dump()
        from services.crypto_fields import encrypt_field as _ef  # p272: secrets at rest
        for _k in ("fb_access_token", "tiktok_access_token", "telegram_bot_token"):
            if _sd.get(_k):
                _sd[_k] = _ef(_sd[_k])
        await db.store_settings.update_one({}, {"$set": _sd}, upsert=True)
        if settings.store_slug:
            # Ownership check must look up the SLUG, not the tenant —
            # the previous query-by-tenant made this guard a no-op and
            # allowed two tenants to claim the same public slug.
            existing = await main_db.store_slugs.find_one({"store_slug": settings.store_slug})
            if existing and existing.get("tenant_id") != tenant_id:
                raise HTTPException(status_code=400, detail="هذا الرابط المختصر مستخدم من متجر آخر — اختر رابطاً مختلفاً")
            _prev = await main_db.store_slugs.find_one({"tenant_id": tenant_id})  # p328
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
            # p328: أتمتة DNS عبر Cloudflare — <slug>.nt-commerce.net يُنشأ/يُزال تلقائيًا
            try:
                import asyncio as _aio
                from services.cloudflare_service import ensure_store_subdomain, remove_store_subdomain
                _prev_slug = (_prev or {}).get("store_slug")
                if _prev_slug and _prev_slug != settings.store_slug:
                    _aio.create_task(remove_store_subdomain(_prev_slug))
                if settings.enabled:
                    _aio.create_task(ensure_store_subdomain(settings.store_slug))
                else:
                    _aio.create_task(remove_store_subdomain(settings.store_slug))
            except Exception:
                pass  # DNS automation must never block saving settings
        return {"message": "تم حفظ إعدادات المتجر"}

    @router.get("/store/products")
    async def get_store_products(admin: dict = Depends(get_tenant_admin)):
        store_products = await db.store_products.find({}, {"_id": 0}).to_list(100000)  # p175: unlimited store products
        return store_products

    @router.post("/store/products")
    async def add_store_product(data: dict, admin: dict = Depends(get_tenant_admin)):
        product_id = data.get("product_id")
        if not product_id:
            raise HTTPException(status_code=400, detail="product_id required")
        # p492: attaching a product that does not exist must 404 — ghost
        # entries leaked into the public storefront otherwise
        product = await db.products.find_one({"id": product_id}, {"_id": 0, "id": 1})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
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
        # p492: removing a product that is not attached must 404
        result = await db.store_products.delete_one({"product_id": product_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="المنتج غير مرتبط بالمتجر")
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

    @router.get("/shop/by-domain")
    async def shop_by_domain(request: Request, host: str = ""):
        """Resolve a custom domain to a tenant store slug (public).

        The SPA is served on the subscriber's domain but calls the API on
        nt-commerce.net, so the domain arrives as ?host=. When a real Host
        header matches (direct origin traffic), that is used instead.
        """
        h = _norm_domain(request.headers.get("host", ""))
        if h in _PLATFORM_HOSTS or not h:
            h = _norm_domain(host)
        if not h or h in _PLATFORM_HOSTS:
            raise HTTPException(status_code=400, detail="دومين النظام — استخدم رابط المتجر العادي")
        # p328: نطاق فرعي للمتجر — <slug>.nt-commerce.net يُحل مباشرة من store_slugs
        if h.endswith(".nt-commerce.net"):
            sub = h[: -len(".nt-commerce.net")]
            if sub and sub != "www":
                _m = await main_db.store_slugs.find_one({"store_slug": sub, "enabled": True}, {"_id": 0})
                if not _m:
                    raise HTTPException(status_code=404, detail="لا يوجد متجر بهذا النطاق الفرعي")
                return {"store_slug": _m["store_slug"], "domain": h}
        doc = await main_db.custom_domains.find_one({"domain": h})
        if not doc and h.startswith("www."):
            doc = await main_db.custom_domains.find_one({"domain": h[4:]})
        if not doc:
            doc = await main_db.custom_domains.find_one({"domain": f"www.{h}"})
        if not doc:
            raise HTTPException(status_code=404, detail="هذا الدومين غير مسجل في المنصة")
        mapping = await main_db.store_slugs.find_one({"tenant_id": doc["tenant_id"], "enabled": True}, {"_id": 0})
        if not mapping:
            raise HTTPException(status_code=404, detail="المتجر غير متاح حالياً")
        if doc.get("status") != "active":
            await main_db.custom_domains.update_one(
                {"_id": doc["_id"]},
                {"$set": {"status": "active", "verified_at": datetime.now(timezone.utc).isoformat()}},
            )
        return {"store_slug": mapping["store_slug"], "domain": h}

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

    @router.get("/shop/{store_slug}/shipping-options")
    async def public_shipping_options(store_slug: str, wilaya: str = "", desk: bool = False):
        """p150: شركات الشحن المفعّلة للمتجر مع سعر كل واحدة لولاية الزبون.
        فارغ = المتجر يستخدم رسوم التوصيل الثابتة (الوضع الحالي)."""
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            raise HTTPException(status_code=404, detail="Store not found")
        tenant_id = slug_mapping.get("tenant_id")
        tenant_db_inst = main_db if tenant_id == "platform" else get_tenant_db(tenant_id)
        settings = await tenant_db_inst.store_settings.find_one({}, {"_id": 0}) or {}
        companies = [c for c in (settings.get("store_shipping_companies") or []) if c]
        if not companies:
            return {"success": True, "companies": []}
        w = (wilaya or "").strip()
        PROVIDER_LABELS = {"yalidine": "يالدين", "zr": "ZR Express", "maystro": "Maystro", "mock": "وهمي"}
        # p256: full registry labels for storefront shipping options
        from services.ecom.algerian_couriers import EXTRA_COURIERS as _EXTRA_COURIERS
        for _c in _EXTRA_COURIERS:
            PROVIDER_LABELS.setdefault(_c["id"], _c["name_ar"])
        options = []
        for ch in companies:
            row = None
            if ch == "yalidine":
                row = await tenant_db_inst.delivery_rates.find_one(
                    {"$or": [{"wilaya_name": w}, {"id": w.zfill(2)}, {"wilaya_id": w.zfill(2)}]}, {"_id": 0})
            if row is None:
                row = await tenant_db_inst.ecom_courier_prices.find_one(
                    {"courier": ch, "$or": [{"wilaya_name": w}, {"wilaya_id": w}, {"wilaya_id": w.zfill(2)}]}, {"_id": 0})
            if not row:
                continue
            price = row.get("office_price") if desk else row.get("home_price")
            if price is None:
                continue
            options.append({"key": ch, "label": PROVIDER_LABELS.get(ch, ch), "price": float(price or 0)})
        return {"success": True, "companies": options}

    @router.post("/store/telegram/test")
    async def test_telegram(data: dict = None, admin: dict = Depends(get_tenant_admin)):
        """p84: إرسال رسالة اختبار بالمفاتيح المرسلة أو المحفوظة."""
        data = data or {}
        st = await db.store_settings.find_one({}, {"_id": 0}) or {}
        from services.crypto_fields import decrypt_field as _dft  # p272
        token = (data.get("bot_token") or _dft(st.get("telegram_bot_token") or "") or "").strip()
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

    @router.post("/store/landing/{product_id}/ai-generate")
    async def ai_generate_landing(product_id: str, data: dict = None, admin: dict = Depends(get_tenant_admin)):
        """p110: توليد محتوى صفحة الهبوط بالذكاء الاصطناعي — عنوان + نص عرض + سعر مرجعي.
        لا يحفظ شيئاً: يملأ الحقول في الواجهة ليراجعها التاجر ثم يحفظ."""
        product = await db.products.find_one({"id": product_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        from services.ai.openai_llm import llm_chat, llm_configured
        if not llm_configured():
            raise HTTPException(status_code=503, detail="خدمة الذكاء الاصطناعي غير مُفعّلة — أضِف مفتاح OpenAI في إعدادات النظام")
        hint = str((data or {}).get("hint") or "")[:300]
        name = product.get("name_ar") or product.get("name") or ""
        desc = str(product.get("description_ar") or product.get("description_en") or "")[:600]
        price = float(product.get("retail_price") or product.get("price") or 0)
        system_msg = "أنت خبير تسويق للتجارة الإلكترونية الجزائرية (الدفع عند الاستلام). اكتب عربية بسيطة محفِّزة موجَّهة للزبون العادي."
        prompt = (
            f"المنتج: {name}\nالوصف: {desc or '—'}\nالسعر: {price} دج\n"
            + (f"معلومة إضافية من التاجر: {hint}\n" if hint else "")
            + "اكتب محتوى صفحة هبوط لهذا المنتج. أجب بصيغة JSON فقط دون أي نص آخر:\n"
              '{"headline": "عنوان رئيسي قصير جذاب حتى 60 حرفاً", '
              '"offer_text": "جملة عرض محفزة حتى 90 حرفاً", '
              '"old_price": رقم السعر قبل التخفيض أعلى من السعر الحالي بواقعية 30-50%}'
        )
        raw = await llm_chat(system_msg, prompt, max_tokens=400)
        if not raw:
            raise HTTPException(status_code=503, detail="خدمة الذكاء الاصطناعي غير مُفعّلة")
        import json as _json
        try:
            m = re.search(r"\{.*\}", raw, re.S)
            gen = _json.loads(m.group(0))
        except Exception:  # noqa: BLE001
            raise HTTPException(status_code=502, detail="تعذّر فهم ردّ الذكاء الاصطناعي — حاول مجدداً")
        headline = str(gen.get("headline") or "")[:120]
        offer_text = str(gen.get("offer_text") or "")[:150]
        old_price = 0.0
        try:
            old_price = max(0.0, float(gen.get("old_price") or 0))
        except (TypeError, ValueError):
            old_price = 0.0
        if price and old_price <= price:
            old_price = round(price * 1.4)
        return {"ok": True, "headline": headline, "offer_text": offer_text, "old_price": old_price}

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
            # p492: same public whitelist as the product detail endpoint —
            # _pub_product alone would leak purchase_price/barcode/notes.
            "product": _pub_detail(store_slug, product),
            "settings": _public_settings(settings),
            "landing": {k: cfg.get(k, v) for k, v in _LANDING_DEFAULTS.items()},
        }

    @router.get("/store/cart-leads")
    async def get_cart_leads(admin: dict = Depends(get_tenant_admin)):
        """p83: السلات المهجورة — هواتف بدأت الطلب ولم تكمله."""
        rows = await db.store_cart_leads.find(
            {"converted": False}, {"_id": 0}
        ).sort("last_seen", -1).limit(100).to_list(100)
        recovered = await db.store_cart_leads.count_documents({"converted": True})  # p107
        return {"leads": rows, "count": len(rows), "recovered": recovered}

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
        old_status = order.get("status", "pending")
        _entering_terminal = status in STOCK_RESTORING_STATUSES and old_status not in STOCK_RESTORING_STATUSES
        _reactivating = status not in STOCK_RESTORING_STATUSES and old_status in STOCK_RESTORING_STATUSES
        # p494i: استعادة المخزون مرة واحدة بالضبط — استحواذ ذرّي على العلم
        # (كان فحصاً ثم كتابة منفصلين: إلغاءات متزامنة استعادت المخزون مضاعفاً)
        if _entering_terminal:
            _claimed_restore = await db.store_orders.find_one_and_update(
                {"id": order_id, "stock_restored": {"$ne": True}},
                {"$set": {"stock_restored": True}})
            if _claimed_restore:
                for item in order.get("items", []):
                    pid = item.get("product_id")
                    qty = item.get("quantity", 1)
                    if not pid:
                        continue
                    _p = await db.products.find_one({"id": pid}, {"_id": 0, "is_non_stockable": 1})
                    if _p and _p.get("is_non_stockable"):
                        continue  # لم يُحسم أصلاً عند الإنشاء
                    await db.products.update_one({"id": pid}, {"$inc": {"quantity": qty}})
                    _vidx = item.get("variant_index")  # p73
                    if isinstance(_vidx, int):
                        await db.products.update_one({"id": pid}, {"$inc": {f"variants.{_vidx}.quantity": qty}})
        # p494i: إعادة التفعيل من إلغاء/استرجاع — إعادة حسم المخزون ذرّياً
        # (الكل أو لا شيء؛ كان يعيد التفعيل بلا حسم فينشئ مخزوناً وهمياً)
        if _reactivating:
            _released = await db.store_orders.find_one_and_update(
                {"id": order_id, "stock_restored": True},
                {"$set": {"stock_restored": False}})
            if _released:
                _reclaimed = []
                try:
                    for item in order.get("items", []):
                        pid = item.get("product_id")
                        if not pid:
                            continue
                        qty = int(item.get("quantity", 1) or 1)
                        _p = await db.products.find_one({"id": pid}, {"_id": 0, "is_non_stockable": 1})
                        if _p and _p.get("is_non_stockable"):
                            continue
                        res = await db.products.find_one_and_update(
                            {"id": pid, "quantity": {"$gte": qty}},
                            {"$inc": {"quantity": -qty}})
                        if res is None:
                            raise RuntimeError(f"insufficient stock for {pid}")
                        _vidx = item.get("variant_index")
                        if isinstance(_vidx, int):
                            await db.products.update_one({"id": pid}, {"$inc": {f"variants.{_vidx}.quantity": -qty}})
                        _reclaimed.append((pid, qty, _vidx if isinstance(_vidx, int) else None))
                except HTTPException:
                    raise
                except Exception:
                    for _pid, _qty, _vidx in _reclaimed:
                        await db.products.update_one({"id": _pid}, {"$inc": {"quantity": _qty}})
                        if _vidx is not None:
                            await db.products.update_one({"id": _pid}, {"$inc": {f"variants.{_vidx}.quantity": _qty}})
                    await db.store_orders.update_one({"id": order_id}, {"$set": {"stock_restored": True}})
                    raise HTTPException(status_code=400, detail="المخزون لم يعد يكفي لإعادة تفعيل الطلب")
        # p494i: استرجاع نقاط الولاء المكتسبة عند أول إلغاء/استرجاع، وإعادة منحها عند إعادة التفعيل
        if _entering_terminal or _reactivating:
            _earned = int(order.get("loyalty_earned", 0) or 0)
            if _earned > 0 and order.get("customer_phone"):
                try:
                    if _entering_terminal:
                        await loyalty_service.revoke_points(db, order["customer_phone"], _earned, order_id)
                    else:
                        await db.loyalty_customers.update_one(
                            {"phone": order["customer_phone"]}, {"$inc": {"points": _earned}})
                        await db.loyalty_transactions.insert_one({
                            "id": str(uuid.uuid4()), "phone": order["customer_phone"],
                            "type": "reinstate", "points": _earned, "order_id": order_id,
                            "created_at": now})
                except Exception as _le:  # noqa: BLE001
                    logger.warning(f"loyalty clawback/reinstate failed for {order_id}: {_le}")
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
                _mirror_set = {"status": _est, "updated_at": now}
                if _entering_terminal:
                    # p494i: المخزون أُعيد من جهة المتجر — حدّث أعلام الصندوق لمنع إعادة مزدوجة
                    _mirror_set["inventory_deducted"] = False
                    _mirror_set["inventory_restored_at"] = now
                await db.ecom_orders.update_one(
                    {"channel": "webstore", "external_id": order_id},
                    {"$set": _mirror_set,
                     "$push": {"status_history": {"status": _est, "at": now, "by": admin.get("id"), "note": "مزامنة من صفحة المتجر"}}}
                )
                # p494i: مزامنة سجل البيع + إبطال القيود المتوقعة عند الإلغاء/الاسترجاع
                # (كان سجل البيع يبقى «غير مدفوع» وكأن الطلب قائم)
                _eo = await db.ecom_orders.find_one(
                    {"channel": "webstore", "external_id": order_id}, {"_id": 0})
                if _eo:
                    from services.application.ecom_order_service import sync_sale_doc, _void_financials
                    await sync_sale_doc(db, _eo)
                    if _entering_terminal:
                        await _void_financials(db, _eo, now)
        except Exception as _se:  # noqa: BLE001
            logger.warning(f"webstore mirror sync failed for {order_id}: {_se}")
        # p494i: حدث الإلغاء لخط الأحداث (تعويض الساغا للطلبات القديمة التي حُسمت مرتين؛
        # لا أثر على الطلبات الجديدة — لا ساغا لها والمستهلك يتحقق)
        if _entering_terminal:
            try:
                from services.event_bus import event_bus
                _tid = admin.get("tenant_id") or "platform"
                _eo2 = await db.ecom_orders.find_one(
                    {"channel": "webstore", "external_id": order_id}, {"_id": 0, "id": 1})
                if _eo2:
                    await event_bus.publish(
                        "ecom_order.cancelled",
                        {"order_id": _eo2["id"], "new_status": _st_map.get(status)},
                        tenant_id=_tid, source="online_store_routes")
            except Exception:
                pass
        return {"message": "تم تحديث حالة الطلب"}

    @router.put("/store/orders/{order_id}/delivery-type")
    async def update_store_order_delivery_type(order_id: str, data: dict, admin: dict = Depends(get_tenant_admin)):
        """p138: نوع التوصيل — مكتب (office/stopdesk) أم باب المنزل (home)، مع مزامنة صندوق الطلبات الموحَّد."""
        dt = (data.get("delivery_type") or "").strip()
        if dt not in ("home", "office"):
            raise HTTPException(status_code=400, detail="نوع التوصيل غير صالح — المسموح: home أو office")
        order = await db.store_orders.find_one({"id": order_id})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        now = datetime.now(timezone.utc).isoformat()
        # p494i: أعد احتساب رسوم التوصيل حسب النوع الجديد (كانت تبقى بسعر النوع القديم)
        _new_fee = None
        try:
            if order.get("shipping_company"):
                _w = str(order.get("delivery_wilaya") or "").strip()
                _row = None
                if order["shipping_company"] == "yalidine":
                    _row = await db.delivery_rates.find_one(
                        {"$or": [{"wilaya_name": _w}, {"id": _w.zfill(2)}, {"wilaya_id": _w.zfill(2)}]}, {"_id": 0})
                if _row is None:
                    _row = await db.ecom_courier_prices.find_one(
                        {"courier": order["shipping_company"],
                         "$or": [{"wilaya_name": _w}, {"wilaya_id": _w}, {"wilaya_id": _w.zfill(2)}]}, {"_id": 0})
                if _row:
                    _new_fee = float(_row.get("office_price", 0) if dt == "office" else _row.get("home_price", 0) or 0)
            else:
                _rates = {r["id"]: r for r in await db.delivery_rates.find({}, {"_id": 0}).to_list(100)}
                _rate = _rates.get(str(order.get("delivery_wilaya") or "").zfill(2))
                if _rate:
                    _new_fee = float(_rate.get("office_price", 0) if dt == "office" else _rate.get("home_price", 0))
        except Exception as _fe:  # noqa: BLE001
            logger.warning(f"delivery fee recompute failed for {order_id}: {_fe}")
        _set = {"delivery_type": dt, "updated_at": now}
        if _new_fee is not None and _new_fee != float(order.get("delivery_fee", 0) or 0):
            _set["delivery_fee"] = _new_fee
            _set["total"] = round(
                max(0.0, float(order.get("subtotal", 0) or 0) - float(order.get("coupon_discount", 0) or 0)) + _new_fee, 2)
        await db.store_orders.update_one(
            {"id": order_id},
            {"$set": _set}
        )
        try:
            _ecom_set = {"delivery_type": dt, "updated_at": now}
            if "delivery_fee" in _set:
                _ecom_set["shipping_fee"] = _set["delivery_fee"]
                _ecom_set["total"] = _set["total"]
            await db.ecom_orders.update_one(
                {"channel": "webstore", "external_id": order_id},
                {"$set": _ecom_set}
            )
            if "delivery_fee" in _set:
                _eo = await db.ecom_orders.find_one(
                    {"channel": "webstore", "external_id": order_id}, {"_id": 0})
                if _eo:
                    from services.application.ecom_order_service import sync_sale_doc
                    await sync_sale_doc(db, _eo)
        except Exception:
            pass
        return {"message": "تم تحديث نوع التوصيل", "delivery_type": dt,
                "delivery_fee": _set.get("delivery_fee", order.get("delivery_fee", 0))}

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
        # p492: a projection of a missing field returns {}, which is falsy —
        # legacy products without updated_at must not 404.
        if meta is None:
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

        # p250: multi-store — a slug may point to a specific sub-store
        _store_id = slug_mapping.get("store_id")
        if _store_id:
            _store = await tenant_db_inst.stores.find_one(
                {"id": _store_id, "enabled": True}, {"_id": 0})
            if not _store:
                raise HTTPException(status_code=404, detail="Store not available")
            settings = {**settings,
                        "store_name": _store.get("name") or settings.get("store_name"),
                        "store_slug": store_slug,
                        "description": _store.get("description") or settings.get("description", "")}

        if _store_id:
            _sp_query = {"is_active": True, "store_id": _store_id}
        else:
            # default store: legacy entries carry no store_id
            _sp_query = {"is_active": True, "store_id": {"$in": [None, ""]}}
        store_products = await tenant_db_inst.store_products.find(_sp_query, {"_id": 0}).to_list(100000)  # p175: unlimited
        product_ids = [sp["product_id"] for sp in store_products]

        # p149: family-level visibility — selected families auto-include ALL their products
        _vis_fams = [f for f in (settings.get("visible_family_ids") or []) if f]
        _query = {"id": {"$in": product_ids}}
        if _vis_fams and not _store_id:  # p250: sub-store catalog = its attached products only
            _query = {"$or": [{"id": {"$in": product_ids}}, {"family_id": {"$in": _vis_fams}}]}

        products = await tenant_db_inst.products.find(
            _query,
            {"_id": 0, "id": 1, "name_ar": 1, "name_en": 1, "retail_price": 1,
             "purchase_price": 1, "image_url": 1, "description_ar": 1,
             "description_en": 1, "quantity": 1, "family_id": 1, "barcode": 1,
             "allow_online_payment": 1, "shipping_provider": 1}
        ).to_list(100000)  # p175: unlimited — every enabled product shows in the public store
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
        for grp in products_by_family.values():
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
             "$setOnInsert": {"id": str(uuid.uuid4()), "first_seen": now, "store_slug": store_slug,
                              "converted": False, "reminder_sent": False}},  # p107: fields required for listing + recovery
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
        # p494i: لا نثق بأسعار العميل إطلاقاً — إعادة تسعير كل عنصر من قاعدة
        # البيانات + بوابة ظهور المنتج في كتالوج المتجر (نفس قاعدة GET /shop):
        # store_products النشطة أو عائلات visible_family_ids.
        if not order.items:
            raise HTTPException(status_code=400, detail="السلة فارغة")
        _store_id = slug_mapping.get("store_id")
        if _store_id:
            _sp_query = {"is_active": True, "store_id": _store_id}
        else:
            _sp_query = {"is_active": True, "store_id": {"$in": [None, ""]}}
        _catalog_ids = {sp["product_id"] for sp in await tenant_db_inst.store_products.find(
            _sp_query, {"_id": 0, "product_id": 1}).to_list(100000)}
        _vis_fams = {f for f in (settings.get("visible_family_ids") or []) if f}
        _subtotal = 0.0
        for item in order.items:
            pid = item.get("product_id")
            if not pid:
                raise HTTPException(status_code=400, detail="عنصر بلا معرّف منتج")
            _p = await tenant_db_inst.products.find_one(
                {"id": pid}, {"_id": 0, "name_ar": 1, "name_en": 1, "retail_price": 1, "family_id": 1})
            if not _p:
                raise HTTPException(status_code=400, detail="منتج غير موجود")
            if pid not in _catalog_ids and _p.get("family_id") not in _vis_fams:
                raise HTTPException(
                    status_code=400,
                    detail=f"المنتج '{_p.get('name_ar') or _p.get('name_en') or pid}' غير متاح في هذا المتجر")
            try:
                # p516: no silent coercion — quantity 0/None/"" must 400,
                # not mutate into a 1-item order with a real stock deduction
                _qty = int(item.get("quantity", 1))
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="كمية غير صالحة")
            if _qty < 1 or _qty > 999:
                raise HTTPException(status_code=400, detail="كمية غير صالحة")
            item["quantity"] = _qty
            item["price"] = round(float(_p.get("retail_price", 0) or 0), 2)
            if not item.get("name"):
                item["name"] = _p.get("name_ar") or _p.get("name_en") or ""
            _subtotal += item["price"] * _qty
        order.subtotal = round(_subtotal, 2)
        if settings.get("min_order_amount", 0) > 0 and order.subtotal < settings["min_order_amount"]:
            raise HTTPException(status_code=400, detail=f"Minimum order amount is {settings['min_order_amount']}")
        # p149: payment-method policy — online only if store enabled AND every item allows it
        if order.payment_method == "online":
            if not settings.get("online_payment_enabled"):
                raise HTTPException(status_code=400, detail="الدفع الإلكتروني غير مفعّل في هذا المتجر")
            _pids = [i.get("product_id") for i in order.items if i.get("product_id")]
            if _pids:
                _blocked = await tenant_db_inst.products.count_documents(
                    {"id": {"$in": _pids}, "allow_online_payment": False})
                if _blocked:
                    raise HTTPException(status_code=400, detail="بعض منتجات السلة لا تقبل الدفع الإلكتروني — اختر الدفع عند الاستلام")
        else:
            if not settings.get("cod_enabled", True):
                raise HTTPException(status_code=400, detail="الدفع عند الاستلام غير متاح في هذا المتجر")
            order.payment_method = "cod"
        # p69: server-side delivery fee from tenant rates — never trust the client
        _fee = 0.0
        if order.shipping_company:
            # p150: customer picked a company — price MUST come from that company's rate sheet
            _allowed = [c for c in (settings.get("store_shipping_companies") or []) if c]
            if order.shipping_company not in _allowed:
                raise HTTPException(status_code=400, detail="شركة الشحن المختارة غير متاحة في هذا المتجر")
            _w = str(order.delivery_wilaya or "").strip()
            _row = None
            if order.shipping_company == "yalidine":
                _row = await tenant_db_inst.delivery_rates.find_one(
                    {"$or": [{"wilaya_name": _w}, {"id": _w.zfill(2)}, {"wilaya_id": _w.zfill(2)}]}, {"_id": 0})
            if _row is None:
                _row = await tenant_db_inst.ecom_courier_prices.find_one(
                    {"courier": order.shipping_company,
                     "$or": [{"wilaya_name": _w}, {"wilaya_id": _w}, {"wilaya_id": _w.zfill(2)}]}, {"_id": 0})
            if _row:
                _fee = float(_row.get("office_price", 0) if order.delivery_type == "office" else _row.get("home_price", 0) or 0)
        else:
            _rates = {r["id"]: r for r in await tenant_db_inst.delivery_rates.find({}, {"_id": 0}).to_list(100)}
            _rate = _rates.get(str(order.delivery_wilaya).zfill(2))
            if _rate:
                _fee = float(_rate.get("office_price", 0) if order.delivery_type == "office" else _rate.get("home_price", 0))
        order.delivery_fee = _fee
        # p494i: كوبون الخصم — تحقق خادمي كامل (صلاحية/حدود/حد أدنى)؛ الإجمالي
        # يُحسب من قيم الخادم فقط، وقيمة الخصم من العميل تُتجاهل دائماً.
        _coupon_row = None
        _coupon_code = (order.coupon_code or "").strip().upper()
        if _coupon_code:
            _cv = await coupon_service.validate_coupon(
                tenant_db_inst, _coupon_code, float(order.subtotal),
                order.customer_phone or "",
                [i.get("product_id") for i in order.items if i.get("product_id")])
            if not _cv.get("valid"):
                raise HTTPException(status_code=400, detail=_cv.get("error") or "الكوبون غير صالح")
            _coupon_row = _cv
            order.coupon_code = _coupon_code
            order.coupon_discount = round(float(_cv.get("discount", 0) or 0), 2)
            if _cv.get("free_shipping"):
                order.delivery_fee = 0.0
        else:
            order.coupon_code = ""
            order.coupon_discount = 0
        order.total = round(max(0.0, float(order.subtotal) - float(order.coupon_discount or 0)) + float(order.delivery_fee or 0), 2)
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
        # p494i: حسم استخدام الكوبون ذرّياً بعد نجاح حسم المخزون —
        # بلوغ حد الاستخدام يُرجع المخزون المحسوم ويرفض الطلب.
        _order_id = str(uuid.uuid4())
        if _coupon_row is not None:
            _ok_claim = await coupon_service.apply_coupon(
                tenant_db_inst, _coupon_row["coupon_id"], _order_id, order.customer_phone or "")
            if not _ok_claim:
                await _rollback_claims()
                raise HTTPException(status_code=400, detail="تم استنفاد الكوبون — حاول بدونه")
        # p258: atomic tenant-stamped code (race-proof; sequence continues from legacy max)
        order_number = await public_order_code(
            tenant_db_inst, "store_orders", "WEB", 6, field="order_number")
        order_data = {
            "id": _order_id,
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
                "delivery_type": getattr(order, "delivery_type", "home") or "home",  # p138: home | office
                "shipping_label_id": None, "tracking_number": None, "courier": None,
                "inventory_deducted": True,
                "utm": order_data["utm"], "utm_source": order_data["utm_source"],
                "status_history": [{"status": "new", "at": now, "by": "webstore"}],
                "created_at": now, "updated_at": now, "created_by": "webstore",
            }
            # p101: WhatsApp auto-confirmation — hold the order until the customer replies
            try:
                if settings.get("wa_confirm_enabled"):
                    _wa = await tenant_db_inst.ecom_integrations.find_one({"channel": "whatsapp", "is_active": True})
                    _creds = (_wa or {}).get("credentials") or {}
                    _phone = (ecom_doc.get("customer") or {}).get("phone", "")
                    if _wa and _creds.get("phone_number_id") and _creds.get("access_token") and _phone:
                        ecom_doc["status"] = "awaiting_confirmation"
                        ecom_doc["status_history"] = [{"status": "awaiting_confirmation", "at": now, "by": "whatsapp-auto"}]
                        _store = settings.get("store_name") or store_slug
                        _cust = (ecom_doc.get("customer") or {}).get("name", "")
                        _msg = (
                            f"مرحباً {_cust} 👋\n"
                            f"استلمنا طلبك {ecom_doc.get('order_code')} بقيمة {ecom_doc.get('total')} دج من متجر {_store}.\n"
                            "✅ للتأكيد: ردّ بـ «1» أو «نعم»\n"
                            "❌ للإلغاء: ردّ بـ «2» أو «لا»"
                        )
                        import asyncio as _a2
                        from services.ecom.whatsapp_service import send_text_message as _wa_send
                        _a2.create_task(_wa_send(_wa, _phone, _msg))
            except Exception as _we:  # noqa: BLE001
                logger.warning(f"p101 wa confirm hook failed: {_we}")

            # p240: duplicate detection (non-blocking, internal flag only)
            try:
                from services.ecom.duplicate_detector import annotate_order as _annot_dup
                await _annot_dup(tenant_db_inst, ecom_doc)
            except Exception as _de:  # noqa: BLE001
                logger.warning(f"p240 webstore duplicate check failed: {_de}")

            # p100: cross-tenant reputation — attach trust badge (no auto-escalation for webstore)
            try:
                from services.application.ecom_order_service import get_network_trust, reputation_on_create
                _net = await get_network_trust((ecom_doc.get("customer") or {}).get("phone", ""))
                if _net.get("found"):
                    ecom_doc["network_trust"] = _net
                await tenant_db_inst.ecom_orders.insert_one(ecom_doc)
                await reputation_on_create(ecom_doc, tenant_id or "")
            except Exception as _ne:  # noqa: BLE001
                logger.warning(f"p100 webstore reputation hook failed: {_ne}")
                if not await tenant_db_inst.ecom_orders.find_one({"id": ecom_doc["id"]}):
                    await tenant_db_inst.ecom_orders.insert_one(ecom_doc)
            # p280: realtime event — other open sessions refresh instantly
            try:
                from services.outbox import outbox_write as _obw
                from config.database import main_db as _mdb
                await _obw(_mdb, "ecom_order.created", {"order_id": ecom_doc.get("id"), "order_code": ecom_doc.get("order_code", ""), "channel": ecom_doc.get("channel", ""), "total": ecom_doc.get("total", 0)}, tenant_id=tenant_id or "", source="ecom.webstore")
            except Exception:
                pass
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
            _lp = await loyalty_service.add_points(
                tenant_db_inst,
                order.customer_phone,
                order.total,
                order_data["id"]
            )
            # p494i: خزّن النقاط المكتسبة على الطلب لاسترجاعها عند الإلغاء
            if isinstance(_lp, dict) and _lp.get("points_earned"):
                await tenant_db_inst.store_orders.update_one(
                    {"id": order_data["id"]},
                    {"$set": {"loyalty_earned": int(_lp["points_earned"])}})
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
        settings = await db.woocommerce_settings.find_one({"id": "global"}, {"_id": 0})
        if not settings:
            settings = {"id": "global", "enabled": False, "store_url": "", "consumer_key": "", "consumer_secret": "", "sync_products": True, "sync_orders": True, "sync_customers": True, "last_sync": ""}
            await db.woocommerce_settings.insert_one(dict(settings))
        for key in ("consumer_key", "consumer_secret"):
            if settings.get(key):
                settings[key] = "••••••••"
        return settings

    @router.put("/woocommerce/settings")
    async def update_woocommerce_settings(settings: WooCommerceSettings, admin: dict = Depends(get_tenant_admin)):
        from utils.crypto import encrypt_field
        existing = await db.woocommerce_settings.find_one({"id": "global"}, {"_id": 0}) or {}
        data = settings.model_dump()
        for key in ("consumer_key", "consumer_secret"):
            if data.get(key) == "••••••••":
                data[key] = existing.get(key) or ""
            else:
                data[key] = encrypt_field(data.get(key))
        await db.woocommerce_settings.update_one({"id": "global"}, {"$set": data}, upsert=True)
        return {"message": "تم حفظ إعدادات WooCommerce"}

    async def _wc_settings():
        settings = _decrypt_wc(await db.woocommerce_settings.find_one({"id": "global"}, {"_id": 0}))
        if not settings or not settings.get("enabled"):
            raise HTTPException(status_code=400, detail="WooCommerce غير مفعل")
        return settings

    @router.post("/woocommerce/test-connection")
    async def test_woocommerce_connection(admin: dict = Depends(get_tenant_admin)):
        settings = _decrypt_wc(await db.woocommerce_settings.find_one({"id": "global"}, {"_id": 0}))
        if not settings or not settings.get("store_url"):
            raise HTTPException(status_code=400, detail="يرجى إدخال رابط المتجر أولاً")
        from services import woocommerce_service
        info = await woocommerce_service.test_connection(settings)
        await db.woocommerce_settings.update_one({"id": "global"}, {"$set": {"last_test_at": datetime.now(timezone.utc).isoformat(), "last_test_ok": True}}, upsert=True)
        return {"success": True, "message": "تم الاتصال الفعلي بالمتجر بنجاح", "store_info": info}

    async def _publish_one(wc_settings, product):
        from services import woocommerce_service
        result = await woocommerce_service.publish_product(wc_settings, product)
        now = datetime.now(timezone.utc).isoformat()
        await db.products.update_one({"id": product["id"]}, {"$set": {"woocommerce_id": str(result["id"]), "woocommerce_status": result["status"], "woocommerce_url": result["url"], "woocommerce_synced_at": now}})
        return result

    @router.post("/woocommerce/publish-product/{product_id}")
    async def publish_product_to_woocommerce(product_id: str, admin: dict = Depends(get_tenant_admin)):
        wc_settings = await _wc_settings()
        product = await db.products.find_one({"id": product_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        result = await _publish_one(wc_settings, product)
        return {"success": True, "message": f"تم نشر المنتج '{product.get('name_en')}' فعليًا على المتجر", "woocommerce_id": result["id"], "woocommerce_url": result["url"]}

    @router.post("/woocommerce/publish-products")
    async def publish_multiple_products(product_ids: List[str], admin: dict = Depends(get_tenant_admin)):
        wc_settings = await _wc_settings()
        published, failed = [], []
        for pid in product_ids[:100]:
            product = await db.products.find_one({"id": pid}, {"_id": 0})
            if not product:
                failed.append({"id": pid, "error": "المنتج غير موجود"})
                continue
            try:
                result = await _publish_one(wc_settings, product)
                published.append({"id": pid, "name": product.get("name_en"), "woocommerce_id": result["id"]})
            except HTTPException as exc:
                failed.append({"id": pid, "error": exc.detail})
        return {"success": bool(published) and not failed, "message": f"نُشر فعليًا {len(published)} وفشل {len(failed)}", "published": published, "failed": failed}

    @router.delete("/woocommerce/unpublish-product/{product_id}")
    async def unpublish_product(product_id: str, admin: dict = Depends(get_tenant_admin)):
        wc_settings = await _wc_settings()
        product = await db.products.find_one({"id": product_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        from services import woocommerce_service
        await woocommerce_service.unpublish_product(wc_settings, product)
        await db.products.update_one({"id": product_id}, {"$unset": {"woocommerce_id": "", "woocommerce_status": "", "woocommerce_url": "", "woocommerce_synced_at": ""}})
        return {"success": True, "message": f"تم إلغاء نشر المنتج '{product.get('name_en')}' فعليًا من المتجر"}

    @router.post("/woocommerce/sync-inventory")
    async def sync_inventory(admin: dict = Depends(get_tenant_admin)):
        wc_settings = await _wc_settings()
        products = await db.products.find({"woocommerce_id": {"$exists": True, "$ne": ""}}, {"_id": 0}).to_list(1000)
        from services import woocommerce_service
        synced, failed = [], []
        for product in products:
            try:
                await woocommerce_service.sync_inventory(wc_settings, product)
                await db.products.update_one({"id": product["id"]}, {"$set": {"woocommerce_synced_at": datetime.now(timezone.utc).isoformat()}})
                synced.append(product["id"])
            except HTTPException as exc:
                failed.append({"id": product["id"], "error": exc.detail})
        now = datetime.now(timezone.utc).isoformat()
        if synced and not failed:
            await db.woocommerce_settings.update_one({"id": "global"}, {"$set": {"last_sync": now}})
        return {"success": not failed, "message": f"تمت مزامنة {len(synced)} منتج وفشل {len(failed)}", "synced": len(synced), "failed": failed, "synced_at": now}

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

    # p492: the public detail payload is a whitelist — internal cost, stock-by-warehouse,
    # barcode and note fields must never leave the server.
    _PUBLIC_DETAIL_FIELDS = (
        "id", "name", "name_ar", "name_en", "description", "description_ar",
        "short_description", "retail_price", "selling_price", "quantity",
        "has_variants", "variants", "image_url", "images", "family_id",
    )

    def _pub_detail(store_slug, p):
        public = {k: p[k] for k in _PUBLIC_DETAIL_FIELDS if k in p}
        # The page only needs to know whether a cost price exists (fake old price),
        # never the exact purchase price.
        public["has_cost_price"] = bool(p.get("purchase_price") or 0)
        return _pub_product(store_slug, public)

    @router.get("/shop/{store_slug}/product/{product_id}")
    async def get_product_detail(store_slug: str, product_id: str):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            raise HTTPException(status_code=404, detail="Store not found")

        tenant_id = slug_mapping.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=404, detail="Store not configured")

        tenant_db_inst = main_db if tenant_id == "platform" else get_tenant_db(tenant_id)

        # p250/p492: visibility is defined per store — the default store holds
        # legacy entries without store_id, sub-stores only their own.
        _store_id = slug_mapping.get("store_id")
        if _store_id:
            _sp_query = {"is_active": True, "store_id": _store_id}
        else:
            _sp_query = {"is_active": True, "store_id": {"$in": [None, ""]}}
        store_product = await tenant_db_inst.store_products.find_one(
            {**_sp_query, "product_id": product_id}, {"_id": 0}
        )
        if not store_product:
            raise HTTPException(status_code=404, detail="Product not found in store")

        product = await tenant_db_inst.products.find_one(
            {"id": product_id}, {"_id": 0}
        )
        if not product:
            raise HTTPException(status_code=404, detail="Product not available")

        settings = await tenant_db_inst.store_settings.find_one({}, {"_id": 0}) or {}

        # Related products must respect the same store visibility as the catalog:
        # active store entries (or products of families auto-visible per p149),
        # same family, in stock, excluding the current product.
        _visible_ids = {
            sp["product_id"] async for sp in tenant_db_inst.store_products.find(
                _sp_query, {"_id": 0, "product_id": 1})
        }
        if not _store_id:
            _vis_fams = [f for f in (settings.get("visible_family_ids") or []) if f]
            if _vis_fams:
                async for _p in tenant_db_inst.products.find(
                        {"family_id": {"$in": _vis_fams}}, {"_id": 0, "id": 1}):
                    _visible_ids.add(_p["id"])
        related_products = await tenant_db_inst.products.find(
            {
                "id": {"$ne": product_id, "$in": list(_visible_ids)},
                "family_id": product.get("family_id"),
                "quantity": {"$gt": 0}
            },
            {"_id": 0, "id": 1, "name_ar": 1, "name_en": 1, "retail_price": 1, "selling_price": 1, "image_url": 1}
        ).limit(4).to_list(4)

        return {
            "success": True,
            "product": _pub_detail(store_slug, product),
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
        try:
            coupon = await coupon_service.create_coupon(db, data)
        except LookupError as e:
            raise HTTPException(status_code=409, detail=str(e))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
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
        try:
            tracking = await shipping_tracker.create_tracking(
                db, order_id, data.get("carrier", "manual"),
                data.get("tracking_number", ""),
                data.get("status", "pending")
            )
        except LookupError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        return {"success": True, "tracking": tracking}

    @router.put("/store/orders/{order_id}/shipping/status")
    async def update_shipping_status(
        order_id: str,
        data: dict,
        admin: dict = Depends(get_tenant_admin)
    ):
        try:
            result = await shipping_tracker.update_status(
                db, order_id, data.get("status", ""),
                data.get("location", ""),
                data.get("note", "")
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

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

        order = await tenant_db_inst.store_orders.find_one({"id": order_id}, {"_id": 0})
        if not order:
            # p516: الزبون يعرف رقم الطلب المطبوع WEB-* لا المعرّف الداخلي —
            # البحث به كان يعيد 404 فتبدو صفحة التتبع معطلة لكل زبون حقيقي
            order = await tenant_db_inst.store_orders.find_one(
                {"order_number": (order_id or "").strip()}, {"_id": 0})
        tracking = await shipping_tracker.get_tracking(
            tenant_db_inst, order["id"] if order else order_id)

        if not tracking and not order:
            raise HTTPException(status_code=404, detail="Order not found")

        # p494i: قائمة بيضاء فقط — كان المسار يسرّب وثيقة الطلب كاملة
        # (هاتف الزبون وعنوانه وبريده) لأي حامل للرابط
        _safe_order = None
        if order:
            _safe_order = {
                "id": order.get("id"),
                "order_number": order.get("order_number"),
                "status": order.get("status"),
                "customer_name": order.get("customer_name"),
                "created_at": order.get("created_at"),
                "updated_at": order.get("updated_at"),
                "delivery_type": order.get("delivery_type"),
                "delivery_wilaya": order.get("delivery_wilaya"),
                "delivery_city": order.get("delivery_city"),
                "shipping_carrier": order.get("shipping_carrier"),
                "tracking_number": order.get("tracking_number"),
                "shipping_status": order.get("shipping_status"),
                "payment_method": order.get("payment_method"),
                "payment_status": order.get("payment_status"),
                "total": order.get("total"),
                "items": [
                    {"name": it.get("name"), "quantity": it.get("quantity"), "price": it.get("price")}
                    for it in (order.get("items") or [])
                ],
            }
        return {
            "success": True,
            "order": _safe_order,
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


    # ── p152: Custom domains (Cloudflare for SaaS) ──
    import re as _re_dom

    _PLATFORM_HOSTS = {"nt-commerce.net", "www.nt-commerce.net", "168.231.81.154", "localhost", "127.0.0.1"}

    def _norm_domain(d):
        d = (d or "").strip().lower()
        d = _re_dom.sub(r"^https?://", "", d).split("/")[0].split(":")[0].strip(".")
        return d

    @router.get("/store/custom-domain")
    async def get_custom_domain(admin: dict = Depends(get_tenant_admin)):
        tenant_id = admin.get("tenant_id") or "platform"
        doc = await main_db.custom_domains.find_one({"tenant_id": tenant_id}, {"_id": 0})
        if not doc:
            return {"domain": "", "status": "none"}
        return doc

    @router.post("/store/custom-domain")
    async def set_custom_domain(data: dict, admin: dict = Depends(get_tenant_admin)):
        tenant_id = admin.get("tenant_id") or "platform"
        domain = _norm_domain(data.get("domain"))
        if not domain or not _re_dom.match(r"^([a-z0-9-]+\.)+[a-z]{2,}$", domain):
            raise HTTPException(status_code=400, detail="صيغة الدومين غير صحيحة — مثال: shop.example.dz")
        if domain.endswith("nt-commerce.net") or domain in _PLATFORM_HOSTS:
            raise HTTPException(status_code=400, detail="دومين النظام لا يحتاج تسجيلاً")
        mapping = await main_db.store_slugs.find_one({"tenant_id": tenant_id, "enabled": True}, {"_id": 0})
        if not mapping:
            raise HTTPException(status_code=400, detail="فعّل المتجر وحدد رابطه المختصر أولاً من إعدادات المتجر")
        existing = await main_db.custom_domains.find_one({"domain": domain})
        if existing and existing.get("tenant_id") != tenant_id:
            raise HTTPException(status_code=400, detail="هذا الدومين مسجل لمشترك آخر")
        now = datetime.now(timezone.utc).isoformat()
        old = await main_db.custom_domains.find_one({"tenant_id": tenant_id}, {"_id": 0})
        status = "pending" if not old or old.get("domain") != domain else old.get("status", "pending")
        await main_db.custom_domains.update_one(
            {"tenant_id": tenant_id},
            {"$set": {"domain": domain, "tenant_id": tenant_id, "status": status, "updated_at": now},
             "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        return {
            "domain": domain,
            "status": status,
            "cname_target": "nt-commerce.net",
            "instructions_ar": f"أضف سجل CNAME في DNS الدومين: {domain} → nt-commerce.net ثم اضغط «فحص DNS»",
        }

    @router.delete("/store/custom-domain")
    async def delete_custom_domain(admin: dict = Depends(get_tenant_admin)):
        tenant_id = admin.get("tenant_id") or "platform"
        await main_db.custom_domains.delete_one({"tenant_id": tenant_id})
        return {"deleted": True}

    @router.post("/store/custom-domain/check")
    async def check_custom_domain(admin: dict = Depends(get_tenant_admin)):
        tenant_id = admin.get("tenant_id") or "platform"
        doc = await main_db.custom_domains.find_one({"tenant_id": tenant_id}, {"_id": 0})
        if not doc or not doc.get("domain"):
            raise HTTPException(status_code=404, detail="لا يوجد دومين مسجل")
        import asyncio as _asyncio
        import socket as _socket
        try:
            loop = _asyncio.get_event_loop()
            await loop.run_in_executor(None, _socket.getaddrinfo, doc["domain"], 443)
            resolved = True
        except Exception:
            resolved = False
        status = doc.get("status", "pending")
        if resolved and status == "pending":
            status = "dns_ok"
            await main_db.custom_domains.update_one(
                {"tenant_id": tenant_id},
                {"$set": {"status": status, "dns_ok_at": datetime.now(timezone.utc).isoformat()}},
            )
        return {"domain": doc["domain"], "resolved": resolved, "status": status}

    return router
