"""E-Commerce Hub: Constants & Helpers

Channel keys, order statuses, shipping providers — single source of truth shared
across integrations / orders / leads / shipping routes.
"""
from fastapi import HTTPException
from typing import Optional

from config.database import main_db

# ─── Supported sales channels ───────────────────────────────────────────────
# Each channel has a stable key (used in DB + API) and a human-readable Arabic label.
CHANNELS = {
    "pos":       {"label_ar": "نقطة البيع",          "label_en": "POS",       "icon": "🏪", "color": "#10b981"},
    "shopify":   {"label_ar": "Shopify",            "label_en": "Shopify",   "icon": "🛍️", "color": "#96bf48"},
    "facebook":  {"label_ar": "Facebook",           "label_en": "Facebook",  "icon": "📘", "color": "#1877f2"},
    "instagram": {"label_ar": "Instagram",          "label_en": "Instagram", "icon": "📸", "color": "#e4405f"},
    "tiktok":    {"label_ar": "TikTok",             "label_en": "TikTok",    "icon": "🎵", "color": "#000000"},
    "whatsapp":  {"label_ar": "واتساب",             "label_en": "WhatsApp",  "icon": "💬", "color": "#25d366"},
    "telegram":  {"label_ar": "تيليجرام",           "label_en": "Telegram",  "icon": "✈️", "color": "#0088cc"},
    "viber":     {"label_ar": "Viber",              "label_en": "Viber",     "icon": "🟣", "color": "#665cac"},
    "manual":    {"label_ar": "إدخال يدوي",         "label_en": "Manual",    "icon": "✍️", "color": "#6b7280"},
    "webstore":  {"label_ar": "متجر الويب",          "label_en": "Web Store", "icon": "🌐", "color": "#0ea5e9"},
    # ── Shipping carriers — stored as integrations to keep credentials in one collection ──
    "yalidine":  {"label_ar": "يالدين (شحن)",        "label_en": "Yalidine",  "icon": "🚚", "color": "#f97316", "kind": "shipping"},
    "zr":        {"label_ar": "ZR Express (شحن)",    "label_en": "ZR",        "icon": "🚚", "color": "#dc2626", "kind": "shipping"},
    "maystro":   {"label_ar": "Maystro (شحن)",       "label_en": "Maystro",   "icon": "🚚", "color": "#7c3aed", "kind": "shipping"},
}

CHANNEL_KEYS = set(CHANNELS.keys())
SALES_CHANNEL_KEYS = {k for k, m in CHANNELS.items() if m.get("kind") != "shipping" and k not in ("pos", "manual")}

# ─── Unified order workflow ─────────────────────────────────────────────────
# State machine: new → confirmed → packed → shipped → delivered | cancelled | refunded
ORDER_STATUSES = {
    "new":       {"label_ar": "جديد",         "label_en": "New",        "color": "#3b82f6"},
    "needs_review": {"label_ar": "بحاجة لمراجعة", "label_en": "Needs review", "color": "#f97316"},
    "awaiting_confirmation": {"label_ar": "بانتظار تأكيد الزبون", "label_en": "Awaiting confirmation", "color": "#eab308"},
    "confirmed": {"label_ar": "مؤكَّد",       "label_en": "Confirmed",  "color": "#8b5cf6"},
    "packed":    {"label_ar": "محضَّر",       "label_en": "Packed",     "color": "#f59e0b"},
    "shipped":   {"label_ar": "في الشحن",     "label_en": "Shipped",    "color": "#06b6d4"},
    "delivered": {"label_ar": "تم التسليم",   "label_en": "Delivered",  "color": "#10b981"},
    "cancelled": {"label_ar": "ملغى",         "label_en": "Cancelled",  "color": "#6b7280"},
    "refunded":  {"label_ar": "مُستردّ",       "label_en": "Refunded",   "color": "#ef4444"},
}

ORDER_STATUS_KEYS = set(ORDER_STATUSES.keys())

# Allowed forward transitions (cancel/refund allowed from most states)
STATUS_TRANSITIONS = {
    "new":       {"confirmed", "cancelled"},
    "needs_review": {"confirmed", "cancelled"},
    "awaiting_confirmation": {"confirmed", "cancelled"},
    "confirmed": {"packed", "cancelled"},
    "packed":    {"shipped", "cancelled"},
    "shipped":   {"delivered", "refunded"},
    "delivered": {"refunded"},
    "cancelled": set(),
    "refunded":  set(),
}

# ─── Shipping providers (Algeria-first) ─────────────────────────────────────
# p167: unified with ALGERIAN_SHIPPING_COMPANIES (shipping_loyalty_routes) — every
# place that lists shipping companies now shows the same full catalog.
SHIPPING_PROVIDERS = {
    "mock":          {"label_ar": "وهمي (للاختبار)",   "label_en": "Mock",             "real": False},
    "yalidine":      {"label_ar": "ياليدين",           "label_en": "Yalidine",         "real": False},
    "zr":            {"label_ar": "زد آر إكسبريس",      "label_en": "ZR Express",       "real": False},
    "maystro":       {"label_ar": "مايسترو",           "label_en": "Maystro",           "real": False},
    "ecotrack":      {"label_ar": "إيكو تراك",         "label_en": "EcoTrack",          "real": False},
    "guepex":        {"label_ar": "قيبكس",             "label_en": "Guepex",            "real": False},
    "procolis":      {"label_ar": "بروكوليس",          "label_en": "Procolis",          "real": False},
    "noest":         {"label_ar": "نوست إكسبريس",       "label_en": "NOEST Express",     "real": False},
    "anderson":      {"label_ar": "أندرسون لوجيستيك",   "label_en": "Anderson",          "real": False},
    "mylers":        {"label_ar": "مايلرز",            "label_en": "Mylers",            "real": False},
    "ecom_delivery": {"label_ar": "إيكوم ديليفري",      "label_en": "Ecom Delivery",     "real": False},
    "elogistia":     {"label_ar": "إيلوجيستيا",         "label_en": "Elogistia",         "real": False},
    "yalitec":       {"label_ar": "ياليتيك",           "label_en": "Yalitec",           "real": False},
    "dhd":           {"label_ar": "دي إتش دي إكسبريس",  "label_en": "DHD Express",       "real": False},
    "conexlog":      {"label_ar": "كونيكسلوغ",          "label_en": "Conexlog",          "real": False},
    "coyote":        {"label_ar": "كويوت إكسبريس",      "label_en": "Coyote Express",    "real": False},
    "algerie_poste": {"label_ar": "بريد الجزائر",       "label_en": "Algérie Poste",     "real": False},
    "other":         {"label_ar": "أخرى",              "label_en": "Other",             "real": False},
}

SHIPPING_PROVIDER_KEYS = set(SHIPPING_PROVIDERS.keys())

# ─── Lead statuses ──────────────────────────────────────────────────────────
LEAD_STATUSES = {
    "new":       {"label_ar": "جديد",         "label_en": "New"},
    "contacted": {"label_ar": "تم التواصل",   "label_en": "Contacted"},
    "qualified": {"label_ar": "مؤهَّل",        "label_en": "Qualified"},
    "converted": {"label_ar": "محوَّل لطلب",   "label_en": "Converted"},
    "lost":      {"label_ar": "مفقود",         "label_en": "Lost"},
}

LEAD_STATUS_KEYS = set(LEAD_STATUSES.keys())


async def require_ecom_feature(current_user: dict) -> dict:
    """Raise 403 unless the current user's tenant has `ecommerce_hub` enabled.

    Super-admins bypass the check. For tenant users we look up the resolved
    features from main_db (plan defaults + tenant overrides) because the shared
    `get_current_user` helper does not inject features onto the user object.
    """
    if current_user.get("user_type") == "super_admin" or current_user.get("role") == "super_admin":
        return current_user

    # Platform-level admins (no tenant) operate on main_db — full access
    if not current_user.get("tenant_id") and current_user.get("role") in ("admin", "super_admin"):
        return current_user

    # Fast path: features may already be on the user (only when login/impersonate ran)
    features = current_user.get("features")
    if not features:
        tenant_id = current_user.get("tenant_id")
        if tenant_id:
            tenant = await main_db.saas_tenants.find_one(
                {"id": tenant_id},
                {"_id": 0, "plan_id": 1, "features_override": 1},
            )
            plan = None
            if tenant and tenant.get("plan_id"):
                plan = await main_db.saas_plans.find_one({"id": tenant["plan_id"]}, {"_id": 0, "features": 1})
            features = {
                **((plan or {}).get("features") or {}),
                **((tenant or {}).get("features_override") or {}),
            }

    flag = (features or {}).get("ecommerce_hub")

    # Flag could be bool OR nested {enabled: bool}. Default OFF when missing.
    if isinstance(flag, dict):
        enabled = bool(flag.get("enabled", False))
    elif isinstance(flag, bool):
        enabled = flag
    else:
        enabled = False

    if not enabled:
        raise HTTPException(
            status_code=403,
            detail="مركز التجارة الإلكترونية غير مُفعّل لهذا الحساب. تواصل مع الإدارة لتفعيله.",
        )
    return current_user


# ─── v2 enhanced order status constants (Section 2) ─────────────────────────
# Aligned with the existing workflow where statuses match 1:1 (new/confirmed/
# packed/shipped/delivered/cancelled) and extended with delivery sub-states
# used by the v2 orders API (on_the_way / in_transit / delivery_exception).
ECOM_NEW = "new"
ECOM_CONFIRMED = "confirmed"
ECOM_PREPARING = "packed"
ECOM_SHIPPED = "shipped"
ECOM_ON_THE_WAY = "on_the_way"
ECOM_IN_TRANSIT = "in_transit"
ECOM_DELIVERED = "delivered"
ECOM_CANCELLED = "cancelled"
ECOM_DELIVERY_EXCEPTION = "delivery_exception"

# Register the extended delivery sub-states so labels + v1 transitions stay valid.
ORDER_STATUSES.setdefault("on_the_way", {"label_ar": "في الطريق", "label_en": "On the way", "color": "#0ea5e9"})
ORDER_STATUSES.setdefault("in_transit", {"label_ar": "قيد النقل", "label_en": "In transit", "color": "#6366f1"})
ORDER_STATUSES.setdefault("delivery_exception", {"label_ar": "مشكلة في التسليم", "label_en": "Delivery exception", "color": "#f43f5e"})
ORDER_STATUS_KEYS = set(ORDER_STATUSES.keys())

STATUS_TRANSITIONS.setdefault("on_the_way", {"delivered", "delivery_exception", "refunded"})
STATUS_TRANSITIONS.setdefault("in_transit", {"delivered", "delivery_exception", "refunded"})
STATUS_TRANSITIONS.setdefault("delivery_exception", {"shipped", "on_the_way", "cancelled"})
STATUS_TRANSITIONS["shipped"] = STATUS_TRANSITIONS.get("shipped", set()) | {"on_the_way", "in_transit", "delivery_exception"}
