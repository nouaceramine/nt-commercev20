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
    "confirmed": {"packed", "cancelled"},
    "packed":    {"shipped", "cancelled"},
    "shipped":   {"delivered", "refunded"},
    "delivered": {"refunded"},
    "cancelled": set(),
    "refunded":  set(),
}

# ─── Shipping providers (Algeria-first) ─────────────────────────────────────
SHIPPING_PROVIDERS = {
    "mock":     {"label_ar": "وهمي (للاختبار)",   "label_en": "Mock",     "real": False},
    "yalidine": {"label_ar": "يالدين",            "label_en": "Yalidine", "real": False},
    "zr":       {"label_ar": "ZR Express",         "label_en": "ZR",       "real": False},
    "maystro":  {"label_ar": "Maystro",            "label_en": "Maystro",  "real": False},
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
