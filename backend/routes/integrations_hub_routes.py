"""Integrations Hub (p287) — مركز التكاملات والمفاتيح الموحّد.

Single registry + unified connect/test/disconnect for every API key / webhook /
integration in the system. The hub is a FACADE: it reads/writes the SAME storage
each feature already uses (ecom_integrations per channel, email_integration_settings,
ecom_sms_settings, main_db.shipping_webhook_tokens) so existing pages keep working.
Secrets are encrypted at rest via crypto_fields (p272) and masked in every response.
"""
from datetime import datetime, timezone
from typing import Optional
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException

from config.database import db, main_db
from utils.auth import require_tenant, get_tenant_admin
from services.crypto_fields import (
    encrypt_field as _ef,
    decrypt_field as _df,
    encrypt_credentials as _enc_creds,
    decrypt_credentials as _dec_creds,
)
from routes.ecom.constants import CHANNELS
from routes.ecom.shipping_webhook_routes import SUPPORTED_WEBHOOKS, _ensure_token

router = APIRouter(tags=["Integrations Hub"])

PLATFORM_BASE_URL = "https://nt-commerce.net"
WA_HOOK = f"{PLATFORM_BASE_URL}/api/integrations/whatsapp/webhook"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _mask(val) -> str:
    if not val:
        return ""
    plain = str(_df(val) or "")
    return "••••" + plain[-4:] if plain else ""


# ─── Registry ────────────────────────────────────────────────────────────────
# adapter "channel":  db.ecom_integrations doc with channel=<channel>
# adapter "settings": a settings collection doc (see S adapter config inline)
# adapter "link":     informational entry pointing at an existing page

REGISTRY = {
    # ── شركات الشحن ──
    "yalidine": {
        "category": "shipping", "adapter": "channel", "channel": "yalidine",
        "name_ar": "ياليدين", "test": "channel",
        "desc_ar": "أكبر شركة توصيل في الجزائر — إرسال الطرود وتتبع الحالات لحظياً.",
        "fields": [
            {"key": "api_id", "label_ar": "API ID", "secret": False},
            {"key": "api_token", "label_ar": "API Token", "secret": True},
        ],
        "guide": {
            "url": "https://yalidine.app", "url_label": "yalidine.app",
            "steps_ar": [
                "سجّل الدخول إلى yalidine.app بحسابك التجاري.",
                "من القائمة: Développement ← Tableau de bord.",
                "انسخ API ID و API Token (وليس Webhook Secret).",
                "ألصقهما هنا واضغط «حفظ واختبار» — تُفعَّل الخدمة تلقائياً عند نجاح الفحص.",
                "للتحديث اللحظي للحالات: الصق رابط الويب هوك (أسفل البطاقة) في Gérer les Webhooks بلوحة ياليدين.",
            ],
        },
    },
    "guepex": {
        "category": "shipping", "adapter": "channel", "channel": "guepex",
        "name_ar": "Guepex", "test": "channel",
        "desc_ar": "توصيل سريع — نفس منصة ياليدين (نفس نوع المفاتيح).",
        "fields": [
            {"key": "api_id", "label_ar": "API ID", "secret": False},
            {"key": "api_token", "label_ar": "API Token", "secret": True},
        ],
        "guide": {
            "url": "https://guepex.app", "url_label": "guepex.app",
            "steps_ar": [
                "سجّل الدخول إلى لوحة Guepex.",
                "من قسم Développement / API انسخ API ID و API Token.",
                "ألصقهما هنا واضغط «حفظ واختبار».",
            ],
        },
    },
    "zr": {
        "category": "shipping", "adapter": "channel", "channel": "zr",
        "name_ar": "ZR Express", "test": None,
        "desc_ar": "ZR Express (منصة Procolis) — توصيل لكل الولايات.",
        "fields": [
            {"key": "token", "label_ar": "API Token", "secret": True},
            {"key": "client_key", "label_ar": "Client Key", "secret": True},
        ],
        "guide": {
            "url": "https://procolis.com", "url_label": "لوحة Procolis",
            "steps_ar": [
                "من لوحة ZR Express (Procolis): Paramètres ← API / Clés.",
                "انسخ API Token و Client Key وألصقهما هنا.",
                "التحديث اللحظي: فعّل Webhooks من Paramètres ← Webhooks والصق الرابط أدناه.",
            ],
        },
    },
    "maystro": {
        "category": "shipping", "adapter": "channel", "channel": "maystro",
        "name_ar": "مايسترو", "test": None,
        "desc_ar": "Maystro Delivery — مزامنة الطرود والحالات.",
        "fields": [
            {"key": "api_key", "label_ar": "API Key", "secret": True},
        ],
        "guide": {
            "url": "https://maystro-delivery.com", "url_label": "لوحة Maystro",
            "steps_ar": [
                "من لوحة Maystro: Paramètres ← API.",
                "انسخ مفتاح API وألصقه هنا.",
                "التحديث اللحظي: Paramètres ← Webhooks ← Créer un webhook والصق الرابط أدناه.",
            ],
        },
    },
    "ecotrack": {
        "category": "shipping", "adapter": "channel", "channel": "ecotrack",
        "name_ar": "إيكوتراك", "test": None,
        "desc_ar": "Ecotrack — مزامنة عبر API عام.",
        "fields": [
            {"key": "api_token", "label_ar": "API Token", "secret": True},
            {"key": "base_url", "label_ar": "رابط API (Base URL)", "secret": False},
        ],
        "guide": {
            "url": "https://ecotrack.dz", "url_label": "ecotrack.dz",
            "steps_ar": [
                "اطلب مفتاح API ورابط الربط من لوحة Ecotrack أو من الدعم.",
                "ألصق القيمتين هنا واضغط «حفظ».",
            ],
        },
    },
    "noest": {
        "category": "shipping", "adapter": "channel", "channel": "noest",
        "name_ar": "نوست إكسبريس", "test": None,
        "desc_ar": "NOEST Express — مزامنة دورية كل ساعتين (لا يدعم Webhooks).",
        "fields": [
            {"key": "api_token", "label_ar": "API Token", "secret": True},
            {"key": "base_url", "label_ar": "رابط API (Base URL)", "secret": False},
        ],
        "guide": {
            "url": "https://noest-dz.com", "url_label": "noest-dz.com",
            "steps_ar": [
                "اطلب مفتاح API من لوحة NOEST أو من الدعم التقني.",
                "ألصق المفتاح والرابط هنا — تُزامَن الحالات تلقائياً كل ساعتين.",
            ],
        },
    },
    # ── التواصل الاجتماعي (Meta) ──
    "whatsapp": {
        "category": "social", "adapter": "channel", "channel": "whatsapp",
        "name_ar": "واتساب للأعمال", "test": "channel",
        "desc_ar": "WhatsApp Cloud API — استقبال الرسائل وتحويلها لطلبات.",
        "fields": [
            {"key": "phone_number_id", "label_ar": "Phone Number ID", "secret": False},
            {"key": "access_token", "label_ar": "Access Token", "secret": True},
        ],
        "guide": {
            "url": "https://developers.facebook.com", "url_label": "developers.facebook.com",
            "steps_ar": [
                "أنشئ تطبيقاً من نوع Business وأضف منتج WhatsApp.",
                "اربط رقمك التجاري، ثم من «API Setup» انسخ Phone Number ID.",
                "أنشئ System User Token دائماً بصلاحية whatsapp_business_messaging.",
                "ألصق القيمتين هنا واضغط «حفظ واختبار».",
                "لاستقبال الرسائل: في إعدادات Webhook بتطبيق Meta الصق رابط الويب هوك أدناه واشترك في حقل messages.",
            ],
        },
        "static_webhook": WA_HOOK,
    },
    "facebook": {
        "category": "social", "adapter": "channel", "channel": "facebook",
        "name_ar": "صفحة فيسبوك", "test": "channel",
        "desc_ar": "ربط صفحة فيسبوك — رسائل الصفحة وتعليقاتها في صندوق الوارد.",
        "fields": [
            {"key": "page_id", "label_ar": "معرّف الصفحة (Page ID)", "secret": False},
            {"key": "access_token", "label_ar": "Page Access Token", "secret": True},
        ],
        "guide": {
            "url": "https://developers.facebook.com", "url_label": "developers.facebook.com",
            "steps_ar": [
                "أنشئ تطبيقاً وأضف منتج Messenger.",
                "من Messenger ← Settings ← Access Tokens اربط صفحتك وولّد Page Access Token.",
                "انسخ Page ID (من «حول» في صفحتك) والتوكن وألصقهما هنا.",
            ],
        },
    },
    "messenger": {
        "category": "social", "adapter": "channel", "channel": "messenger",
        "name_ar": "ماسنجر", "test": "channel",
        "desc_ar": "رسائل ماسنجر تصل لصندوق الوارد الاجتماعي.",
        "fields": [
            {"key": "page_id", "label_ar": "معرّف الصفحة (Page ID)", "secret": False},
            {"key": "access_token", "label_ar": "Page Access Token", "secret": True},
        ],
        "guide": {
            "url": "https://developers.facebook.com", "url_label": "developers.facebook.com",
            "steps_ar": [
                "ماسنجر يعمل عبر صفحة فيسبوك: نفس خطوات «صفحة فيسبوك».",
                "فعّل Webhooks لحقل messages في تطبيق Meta (نفس رابط ويب هوك المنصة).",
            ],
        },
        "static_webhook": WA_HOOK,
    },
    "instagram": {
        "category": "social", "adapter": "channel", "channel": "instagram",
        "name_ar": "إنستغرام للأعمال", "test": "channel",
        "desc_ar": "رسائل إنستغرام DM في صندوق الوارد الاجتماعي.",
        "fields": [
            {"key": "account_id", "label_ar": "Instagram Business Account ID", "secret": False},
            {"key": "access_token", "label_ar": "Access Token", "secret": True},
        ],
        "guide": {
            "url": "https://developers.facebook.com", "url_label": "developers.facebook.com",
            "steps_ar": [
                "حوّل حساب إنستغرام إلى Business واربطه بصفحة فيسبوك.",
                "أضف منتج Instagram لتطبيقك في Meta for Developers.",
                "انسخ Instagram Business Account ID وتوكن بصلاحية instagram_manage_messages.",
            ],
        },
    },
    # ── المراسلة والإشعارات ──
    "telegram": {
        "category": "messaging", "adapter": "channel", "channel": "telegram",
        "name_ar": "تيليغرام بوت", "test": "telegram",
        "desc_ar": "إشعارات الطلبات والملخص اليومي عبر بوت تيليغرام.",
        "fields": [
            {"key": "bot_token", "label_ar": "Bot Token", "secret": True},
            {"key": "chat_id", "label_ar": "Chat ID (اختياري)", "secret": False, "required": False},
        ],
        "guide": {
            "url": "https://t.me/BotFather", "url_label": "@BotFather",
            "steps_ar": [
                "افتح @BotFather في تيليغرام وأرسل /newbot ثم اتبع الخطوات.",
                "انسخ التوكن (بصيغة 123456:ABC-DEF...) وألصقه هنا.",
                "لمعرفة Chat ID: راسل البوت ثم افتح api.telegram.org/bot<التوكن>/getUpdates وانسخ chat.id.",
            ],
        },
    },
    "sms_gateway": {
        "category": "messaging", "adapter": "sms", "name_ar": "بوابة SMS",
        "test": None,
        "desc_ar": "رسائل SMS لحالات التوصيل (تُخصم من رصيد SMS).",
        "fields": [
            {"key": "url", "label_ar": "رابط API للمزوّد", "secret": False},
            {"key": "api_key", "label_ar": "مفتاح API", "secret": True},
            {"key": "sender_name", "label_ar": "اسم المرسل", "secret": False, "required": False},
        ],
        "guide": {
            "url": "", "url_label": "",
            "steps_ar": [
                "احصل على رابط API والمفتاح من مزوّد SMS الذي تتعامل معه.",
                "ألصقهما هنا — تُفعَّل رسائل حالات التوصيل تلقائياً.",
                "الرصيد يُدار من صفحة «رصيد SMS» في مركز التجارة.",
            ],
        },
    },
    "sendgrid": {
        "category": "messaging", "adapter": "sendgrid", "name_ar": "البريد الإلكتروني (SendGrid)",
        "test": "sendgrid",
        "desc_ar": "إرسال البريد الرسمي للمشترك (فواتير، إشعارات، تقارير).",
        "fields": [
            {"key": "api_key", "label_ar": "SendGrid API Key", "secret": True},
            {"key": "from_email", "label_ar": "البريد المرسل (From)", "secret": False, "required": False},
            {"key": "from_name", "label_ar": "اسم المرسل", "secret": False, "required": False},
        ],
        "guide": {
            "url": "https://app.sendgrid.com/settings/api_keys", "url_label": "app.sendgrid.com",
            "steps_ar": [
                "سجّل الدخول إلى SendGrid ← Settings ← API Keys.",
                "أنشئ مفتاحاً بصلاحية Full Access (أو Mail Send على الأقل).",
                "ألصق المفتاح هنا واضغط «حفظ واختبار».",
            ],
        },
    },
    # p288: Resend (بريد النظام) — نفس مخزن EmailTab (system_settings/email_settings)
    "resend": {
        "category": "messaging", "adapter": "resend", "name_ar": "بريد النظام (Resend)",
        "test": "resend",
        "desc_ar": "البريد الإلكتروني للمنصة: إيصالات، تقارير ذكية، إشعارات — عبر Resend.",
        "fields": [
            {"key": "api_key", "label_ar": "Resend API Key (re_...)", "secret": True},
            {"key": "sender_email", "label_ar": "البريد المرسل (From)", "secret": False, "required": False},
            {"key": "sender_name", "label_ar": "اسم المرسل", "secret": False, "required": False},
        ],
        "guide": {
            "url": "https://resend.com/api-keys", "url_label": "resend.com/api-keys",
            "steps_ar": [
                "سجّل الدخول إلى resend.com ← API Keys ← Create API Key.",
                "انسخ المفتاح (يبدأ بـ re_) وألصقه هنا.",
                "لإرسال من نطاقك الخاص: أضف نطاقك من Domains وفعّل سجلات DNS ثم اكتب بريد المرسل.",
                "بدون نطاق خاص استخدم onboarding@resend.dev (للتجربة فقط).",
            ],
        },
    },
    # ── المتاجر ──
    "woocommerce": {
        "category": "stores", "adapter": "woocommerce", "name_ar": "WooCommerce",
        "test": "woocommerce",
        "desc_ar": "مزامنة منتجاتك وطلباتك مع متجر WooCommerce.",
        "fields": [
            {"key": "store_url", "label_ar": "رابط المتجر (https://...)", "secret": False},
            {"key": "consumer_key", "label_ar": "Consumer Key", "secret": True},
            {"key": "consumer_secret", "label_ar": "Consumer Secret", "secret": True},
        ],
        "guide": {
            "url": "https://woocommerce.com/document/woocommerce-rest-api/", "url_label": "دليل WooCommerce API",
            "steps_ar": [
                "من لوحة ووردبريس: WooCommerce ← Settings ← Advanced ← REST API.",
                "أنشئ مفتاحاً بصلاحية Read/Write وانسخ Consumer Key و Consumer Secret.",
                "ألصقهما مع رابط متجرك هنا واضغط «حفظ واختبار».",
            ],
        },
    },
    "shopify": {
        "category": "stores", "adapter": "channel", "channel": "shopify",
        "name_ar": "Shopify", "test": "channel",
        "desc_ar": "مزامنة منتجات وطلبات متجر Shopify.",
        "fields": [
            {"key": "shop_domain", "label_ar": "نطاق المتجر (mystore.myshopify.com)", "secret": False},
            {"key": "access_token", "label_ar": "Admin API Access Token", "secret": True},
        ],
        "guide": {
            "url": "https://admin.shopify.com", "url_label": "لوحة Shopify",
            "steps_ar": [
                "من لوحة Shopify: Settings ← Apps and sales channels ← Develop apps.",
                "أنشئ تطبيقاً خاصاً وفعّل صلاحيات Admin API (المنتجات والطلبات).",
                "انسخ Admin API Access Token وألصقه مع نطاق متجرك هنا.",
            ],
        },
    },
    # ── للمطورين / روابط ──
    "shipping_webhooks": {
        "category": "developer", "adapter": "link", "name_ar": "ويب هوك الشحن اللحظي",
        "desc_ar": "روابط استقبال حالات الطرود لحظياً (ياليدين/Guepex/ZR/مايسترو/Ecotrack) — تُدار من تبويب الشحن أو من بطاقة كل ناقل أعلاه.",
        "link": {"path": "/ecom-hub", "label_ar": "فتح تبويب الشحن"},
        "guide": {"url": "", "url_label": "", "steps_ar": [
            "كل ناقل مدعوم له رابط Webhook خاص يظهر في بطاقته أعلاه بعد الحفظ.",
            "الصق الرابط في لوحة الناقل ليصلك تحديث الحالات لحظياً بدل الانتظار ساعتين.",
        ]},
    },
    "intake_webhooks": {
        "category": "developer", "adapter": "link", "name_ar": "مصادر استقبال الطلبات",
        "desc_ar": "استقبال الطلبات من YouCan / LightFunnels / Google Sheets / أي مصدر مخصص عبر Webhook.",
        "link": {"path": "/ecom-hub", "label_ar": "فتح مصادر الاستقبال"},
        "guide": {"url": "", "url_label": "", "steps_ar": [
            "أنشئ مصدر استقبال جديد من صفحة مصادر الاستقبال في مركز التجارة.",
            "انسخ رابط الـWebhook المولَّد وألصقه في منصة البيع لديك.",
        ]},
    },
    "tenant_api_keys": {
        "category": "developer", "adapter": "link", "name_ar": "مفاتيح API للمشترك",
        "desc_ar": "مفاتيح برمجية لربط أنظمتك الخارجية مع المنصة (إنشاء/إلغاء).",
        "link": {"path": "/ecom-hub/channels/api-keys", "label_ar": "إدارة مفاتيح API"},
        "guide": {"url": "", "url_label": "", "steps_ar": [
            "أنشئ مفتاحاً لكل نظام خارجي وامنحه أقل صلاحية ممكنة.",
            "ألغِ أي مفتاح لم يعد مستخدماً فوراً.",
        ]},
    },
}

CATEGORY_LABELS = {
    "shipping": "شركات الشحن",
    "social": "التواصل الاجتماعي",
    "messaging": "المراسلة والإشعارات",
    "stores": "المتاجر الخارجية",
    "developer": "أدوات الربط للمطورين",
}

REQUIRED_FIELDS = lambda iid: [f["key"] for f in REGISTRY[iid]["fields"] if f.get("required", True)]  # noqa: E731


# ─── Storage adapters (read) ────────────────────────────────────────────────

async def _channel_doc(channel: str) -> Optional[dict]:
    return await db.ecom_integrations.find_one(
        {"channel": channel}, {"_id": 0}, sort=[("created_at", -1)])


async def _status_for(iid: str, entry: dict, tenant_id: str) -> dict:
    adapter = entry["adapter"]
    if adapter == "channel":
        doc = await _channel_doc(entry["channel"])
        creds = _dec_creds(doc.get("credentials") or {}) if doc else {}
        masked = {f["key"]: ("••••" + str(creds.get(f["key"], ""))[-4:] if creds.get(f["key"]) else "")
                  for f in entry["fields"]}
        return {
            "configured": bool(doc) and any(str(v).strip() for v in creds.values()),
            "active": bool(doc and doc.get("is_active")),
            "mode": (doc or {}).get("mode", ""),
            "masked": masked,
            "last_test": (doc or {}).get("hub_last_test"),
            "integration_id": (doc or {}).get("id"),
        }
    if adapter == "sendgrid":
        doc = await db.email_integration_settings.find_one({}, {"_id": 0}) or {}
        return {
            "configured": bool(doc.get("api_key")),
            "active": bool(doc.get("enabled")),
            "mode": "",
            "masked": {
                "api_key": _mask(doc.get("api_key")),
                "from_email": doc.get("from_email") or "",
                "from_name": doc.get("from_name") or "",
            },
            "last_test": doc.get("hub_last_test"),
        }
    if adapter == "resend":  # p288
        doc = await db.system_settings.find_one({"type": "email_settings"}, {"_id": 0}) or {}
        return {
            "configured": bool(doc.get("resend_api_key")),
            "active": bool(doc.get("enabled")) and bool(doc.get("resend_api_key")),
            "mode": "",
            "masked": {
                "api_key": _mask(doc.get("resend_api_key")),
                "sender_email": doc.get("sender_email") or "",
                "sender_name": doc.get("sender_name") or "",
            },
            "last_test": doc.get("hub_last_test"),
        }
    if adapter == "sms":
        doc = await db.ecom_sms_settings.find_one({"id": "global"}, {"_id": 0}) or {}
        prov = doc.get("provider") or {}
        return {
            "configured": prov.get("type") == "http" and bool(prov.get("url")),
            "active": bool(doc.get("enabled")) and prov.get("type") == "http",
            "mode": "",
            "masked": {
                "url": prov.get("url") or "",
                "api_key": _mask(prov.get("api_key")),
                "sender_name": doc.get("sender_name") or "",
            },
            "last_test": doc.get("hub_last_test"),
        }
    if adapter == "woocommerce":
        from utils.crypto import decrypt_field as _wdf
        doc = await db.woocommerce_settings.find_one({"id": "global"}, {"_id": 0}) or {}
        ck = _wdf(doc.get("consumer_key")) or ""
        cs = _wdf(doc.get("consumer_secret")) or ""
        return {
            "configured": bool(doc.get("store_url")) and bool(ck),
            "active": bool(doc.get("enabled")),
            "mode": "",
            "masked": {
                "store_url": doc.get("store_url") or "",
                "consumer_key": ("••••" + ck[-4:]) if ck else "",
                "consumer_secret": ("••••" + cs[-4:]) if cs else "",
            },
            "last_test": doc.get("hub_last_test"),
        }
    return {"configured": False, "active": False, "mode": "", "masked": {}, "last_test": None}


# ─── Tests ───────────────────────────────────────────────────────────────────

async def _run_test(iid: str, entry: dict, doc: Optional[dict]) -> dict:
    kind = entry.get("test")
    if kind == "channel" and doc:
        ch = doc.get("channel")
        if ch == "yalidine":
            from services.ecom.yalidine_service import (
                ping as yali_ping, YalidineCredentialsMissing, YalidineAPIError)
            try:
                data = await yali_ping(doc)
                return {"ok": True, "message": f"✅ متصل بنجاح بـ Yalidine — {data.get('wilayas_count')} ولاية متاحة"}
            except (YalidineCredentialsMissing, YalidineAPIError) as exc:
                return {"ok": False, "message": f"❌ {exc}"}
        if ch == "shopify":
            from services.ecom.shopify_service import ping as shopify_ping, ShopifyAPIError
            try:
                data = await shopify_ping(doc)
                return {"ok": True, "message": f"✅ متصل بنجاح بمتجر '{data.get('shop_name')}'"}
            except ShopifyAPIError as exc:
                return {"ok": False, "message": f"❌ فشل الاتصال: {exc}"}
        if ch in ("whatsapp", "facebook", "messenger", "instagram"):
            from routes.ecom.integrations_routes import _ping_meta_channel
            return await _ping_meta_channel(doc)
        return {"ok": True, "message": "حُفظ — سيُتحقق عند أول مزامنة"}
    if kind == "telegram":
        creds = _dec_creds((doc or {}).get("credentials") or {})
        token = (creds.get("bot_token") or "").strip()
        if not token:
            return {"ok": False, "message": "❌ أدخل Bot Token أولاً"}
        try:
            async with httpx.AsyncClient(timeout=10.0) as cl:
                r = await cl.get(f"https://api.telegram.org/bot{token}/getMe")
            data = r.json()
            if data.get("ok"):
                return {"ok": True, "message": f"✅ البوت متصل: @{data['result'].get('username')}"}
            return {"ok": False, "message": f"❌ رفض تيليغرام: {data.get('description', 'خطأ غير معروف')}"}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "message": f"❌ تعذّر الوصول: {str(exc)[:120]}"}
    if kind == "sendgrid":
        doc = await db.email_integration_settings.find_one({}, {"_id": 0}) or {}
        key = _df(doc.get("api_key") or "") or ""
        if not key:
            return {"ok": False, "message": "❌ أدخل مفتاح SendGrid أولاً"}
        try:
            async with httpx.AsyncClient(timeout=10.0) as cl:
                r = await cl.get("https://api.sendgrid.com/v3/scopes",
                                 headers={"Authorization": f"Bearer {key}"})
            if r.status_code == 200:
                return {"ok": True, "message": "✅ مفتاح SendGrid صالح"}
            return {"ok": False, "message": f"❌ رفض SendGrid (HTTP {r.status_code}) — تحقق من المفتاح"}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "message": f"❌ تعذّر الوصول: {str(exc)[:120]}"}
    if kind == "resend":  # p288
        doc = await db.system_settings.find_one({"type": "email_settings"}, {"_id": 0}) or {}
        key = _df(doc.get("resend_api_key") or "") or ""
        if not key:
            return {"ok": False, "message": "❌ أدخل مفتاح Resend أولاً"}
        try:
            async with httpx.AsyncClient(timeout=10.0) as cl:
                r = await cl.get("https://api.resend.com/api-keys",
                                 headers={"Authorization": f"Bearer {key}"})
            if r.status_code == 200:
                return {"ok": True, "message": "✅ مفتاح Resend صالح — بريد النظام مفعّل"}
            return {"ok": False, "message": f"❌ رفض Resend (HTTP {r.status_code}) — تحقق من المفتاح"}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "message": f"❌ تعذّر الوصول: {str(exc)[:120]}"}
    if kind == "woocommerce":
        from utils.crypto import decrypt_field as _wdf
        doc = await db.woocommerce_settings.find_one({"id": "global"}, {"_id": 0}) or {}
        url = (doc.get("store_url") or "").rstrip("/")
        ck, cs = _wdf(doc.get("consumer_key")) or "", _wdf(doc.get("consumer_secret")) or ""
        if not url or not ck:
            return {"ok": False, "message": "❌ أدخل رابط المتجر والمفاتيح أولاً"}
        try:
            async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as cl:
                r = await cl.get(f"{url}/wp-json/wc/v3/products", params={"per_page": 1}, auth=(ck, cs))
            if r.status_code == 200:
                return {"ok": True, "message": "✅ متصل بمتجر WooCommerce بنجاح"}
            if r.status_code in (401, 403):
                return {"ok": False, "message": "❌ رفض المتجر المفاتيح (401/403) — تحقق من Consumer Key/Secret"}
            return {"ok": False, "message": f"❌ استجابة غير متوقعة (HTTP {r.status_code}) — تحقق من رابط المتجر"}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "message": f"❌ تعذّر الوصول للمتجر: {str(exc)[:120]}"}
    return {"ok": True, "message": "حُفظ بنجاح — لا يوجد فحص اتصال مباشر لهذا المزوّد؛ سيُتحقق عند أول استخدام"}


async def _audit(user: dict, action: str, integration: str):
    try:
        await main_db.hub_audit.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": user.get("tenant_id"),
            "user_id": user.get("id"),
            "action": action,
            "integration": integration,
            "at": _now(),
        })
    except Exception:  # noqa: BLE001 — audit must never break the flow
        pass


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("/integrations-hub/catalog")
async def hub_catalog(user: dict = Depends(require_tenant)):
    tenant_id = user.get("tenant_id") or ""
    items = []
    for iid, entry in REGISTRY.items():
        status = await _status_for(iid, entry, tenant_id)
        webhook = None
        if entry.get("static_webhook"):
            webhook = {"url": entry["static_webhook"], "supported": True,
                       "instructions": "الصق هذا الرابط في إعدادات Webhook لدى المزوّد"}
        elif entry.get("adapter") == "channel" and entry.get("channel") in SUPPORTED_WEBHOOKS and tenant_id:
            row = await _ensure_token(tenant_id, entry["channel"])
            name_ar, howto = SUPPORTED_WEBHOOKS[entry["channel"]]
            webhook = {
                "url": f"{PLATFORM_BASE_URL}/api/ecom/shipping/webhook/{entry['channel']}/{row['webhook_token']}",
                "supported": True,
                "events_received": row.get("events_received", 0),
                "instructions": howto,
            }
        elif entry.get("adapter") == "channel" and entry.get("channel") and entry["category"] == "shipping":
            webhook = {"url": "", "supported": False,
                       "instructions": "هذا الناقل لا يدعم Webhooks — تُزامَن الحالات تلقائياً كل ساعتين"}
        meta = CHANNELS.get(entry.get("channel") or "", {})
        items.append({
            "id": iid,
            "category": entry["category"],
            "category_label": CATEGORY_LABELS[entry["category"]],
            "name_ar": entry["name_ar"],
            "desc_ar": entry.get("desc_ar", ""),
            "icon": meta.get("icon", "🔑"),
            "color": meta.get("color", "#64748b"),
            "fields": entry.get("fields", []),
            "guide": entry.get("guide", {}),
            "link": entry.get("link"),
            "testable": bool(entry.get("test")),
            "status": status,
            "webhook": webhook,
        })
    return {"items": items, "categories": CATEGORY_LABELS}


@router.post("/integrations-hub/{iid}/connect")
async def hub_connect(iid: str, body: dict, admin: dict = Depends(get_tenant_admin)):
    entry = REGISTRY.get(iid)
    if not entry or entry["adapter"] == "link":
        raise HTTPException(status_code=404, detail="تكامل غير قابل للربط")
    fields = body.get("fields") or {}
    missing = [k for k in REQUIRED_FIELDS(iid) if not str(fields.get(k) or "").strip()]
    if missing:
        raise HTTPException(status_code=400, detail=f"حقول مطلوبة ناقصة: {', '.join(missing)}")

    test_result = {"ok": True, "message": "حُفظ"}

    if entry["adapter"] == "channel":
        channel = entry["channel"]
        doc = await _channel_doc(channel)
        if doc:
            merged = {**_dec_creds(doc.get("credentials") or {}),
                      **{k: str(v).strip() for k, v in fields.items() if str(v or "").strip()}}
            await db.ecom_integrations.update_one(
                {"id": doc["id"]},
                {"$set": {"credentials": _enc_creds(merged), "mode": "live",
                          "is_active": True, "updated_at": _now()}})
        else:
            doc = {
                "id": str(uuid.uuid4()), "channel": channel,
                "kind": CHANNELS.get(channel, {}).get("kind", "sales"),
                "name": entry["name_ar"],
                "credentials": _enc_creds({k: str(v).strip() for k, v in fields.items()}),
                "is_active": True, "mode": "live", "last_sync_at": None, "last_error": None,
                "stats": {"orders": 0, "leads": 0, "shipments": 0},
                "created_at": _now(), "updated_at": _now(), "created_by": admin.get("id"),
            }
            await db.ecom_integrations.insert_one(dict(doc))
            doc.pop("_id", None)
        doc = await _channel_doc(channel)
        if entry.get("test"):
            test_result = await _run_test(iid, entry, doc)
            await db.ecom_integrations.update_one(
                {"id": doc["id"]},
                {"$set": {"is_active": bool(test_result["ok"]),
                          "hub_last_test": {"ok": test_result["ok"],
                                            "message": test_result["message"], "at": _now()}}})
        # p288: مرايا التخزين القديمة حتى تستمر الميزات القائمة بالعمل من المركز
        creds_now = _dec_creds((doc or {}).get("credentials") or {})
        active_now = bool((await _channel_doc(channel) or {}).get("is_active"))
        if channel == "whatsapp":
            wa_upd = {"tenant_id": admin.get("tenant_id"), "enabled": active_now,
                      "updated_at": _now()}
            if creds_now.get("access_token"):
                wa_upd["api_token"] = creds_now["access_token"]
            if creds_now.get("phone_number_id"):
                wa_upd["phone_number_id"] = creds_now["phone_number_id"]
            await db.whatsapp_integration_settings.update_one(
                {"tenant_id": admin.get("tenant_id")}, {"$set": wa_upd}, upsert=True)
        elif channel == "telegram":
            tg_upd = {"updated_at": _now()}
            if creds_now.get("bot_token"):
                tg_upd["telegram_bot_token"] = _ef(creds_now["bot_token"])
            if creds_now.get("chat_id"):
                tg_upd["telegram_chat_id"] = creds_now["chat_id"]
            if len(tg_upd) > 1:
                await db.store_settings.update_one({}, {"$set": tg_upd}, upsert=True)

    elif entry["adapter"] == "sendgrid":
        upd = {"enabled": True, "updated_at": _now(),
               "from_email": (fields.get("from_email") or "").strip() or None,
               "from_name": (fields.get("from_name") or "").strip() or None}
        upd = {k: v for k, v in upd.items() if v is not None}
        if str(fields.get("api_key") or "").strip():
            upd["api_key"] = _ef(str(fields["api_key"]).strip())
        await db.email_integration_settings.update_one({}, {"$set": upd}, upsert=True)
        # p292: مرآة إلى مخزن إشعارات البريد القديم (system_settings/sendgrid_settings)
        # حتى تعمل صفحة الإشعارات والتقارير بالمفتاح المركزي دون حقل مبعثر
        sg_mirror = {"type": "sendgrid_settings", "enabled": True, "updated_at": _now()}
        if upd.get("api_key"):
            sg_mirror["api_key"] = upd["api_key"]
        if upd.get("from_email"):
            sg_mirror["sender_email"] = upd["from_email"]
        if upd.get("from_name"):
            sg_mirror["sender_name"] = upd["from_name"]
        await db.system_settings.update_one(
            {"type": "sendgrid_settings"}, {"$set": sg_mirror}, upsert=True)
        test_result = await _run_test(iid, entry, None)
        await db.email_integration_settings.update_one(
            {}, {"$set": {"enabled": bool(test_result["ok"]),
                          "hub_last_test": {"ok": test_result["ok"],
                                            "message": test_result["message"], "at": _now()}}})

    elif entry["adapter"] == "woocommerce":
        from utils.crypto import encrypt_field as _wef
        upd = {"id": "global", "enabled": True, "store_url": str(fields.get("store_url") or "").strip().rstrip("/"),
               "consumer_key": _wef(str(fields.get("consumer_key") or "").strip()),
               "consumer_secret": _wef(str(fields.get("consumer_secret") or "").strip()),
               "sync_products": True, "sync_orders": True, "sync_customers": True}
        await db.woocommerce_settings.update_one({"id": "global"}, {"$set": upd}, upsert=True)
        test_result = await _run_test(iid, entry, None)
        await db.woocommerce_settings.update_one(
            {"id": "global"},
            {"$set": {"enabled": bool(test_result["ok"]),
                      "hub_last_test": {"ok": test_result["ok"],
                                        "message": test_result["message"], "at": _now()}}})

    elif entry["adapter"] == "resend":  # p288 — نفس مخزن EmailTab
        upd = {"type": "email_settings", "enabled": True}
        if str(fields.get("api_key") or "").strip():
            upd["resend_api_key"] = _ef(str(fields["api_key"]).strip())
        if str(fields.get("sender_email") or "").strip():
            upd["sender_email"] = str(fields["sender_email"]).strip()
        if str(fields.get("sender_name") or "").strip():
            upd["sender_name"] = str(fields["sender_name"]).strip()[:80]
        await db.system_settings.update_one({"type": "email_settings"}, {"$set": upd}, upsert=True)
        test_result = await _run_test(iid, entry, None)
        await db.system_settings.update_one(
            {"type": "email_settings"},
            {"$set": {"enabled": bool(test_result["ok"]),
                      "hub_last_test": {"ok": test_result["ok"],
                                        "message": test_result["message"], "at": _now()}}},
            upsert=True)

    elif entry["adapter"] == "sms":
        provider = {"type": "http",
                    "url": str(fields.get("url") or "").strip(),
                    "api_key": str(fields.get("api_key") or "").strip()}
        await db.ecom_sms_settings.update_one(
            {"id": "global"},
            {"$set": {"provider": provider, "enabled": True,
                      "sender_name": (fields.get("sender_name") or "").strip()[:60],
                      "updated_at": _now(), "updated_by": admin.get("id"),
                      "hub_last_test": {"ok": True,
                                        "message": "حُفظ — سيُتحقق عند أول إرسال", "at": _now()}}},
            upsert=True)
        test_result = {"ok": True, "message": "✅ حُفظت البوابة وفعّلت — سيُتحقق عند أول إرسال"}

    await _audit(admin, "connect", iid)
    return {"ok": test_result["ok"], "message": test_result["message"],
            "status": await _status_for(iid, entry, admin.get("tenant_id") or "")}


@router.post("/integrations-hub/{iid}/test")
async def hub_test(iid: str, admin: dict = Depends(get_tenant_admin)):
    entry = REGISTRY.get(iid)
    if not entry or entry["adapter"] == "link":
        raise HTTPException(status_code=404, detail="تكامل غير موجود")
    doc = None
    if entry["adapter"] == "channel":
        doc = await _channel_doc(entry["channel"])
        if not doc:
            raise HTTPException(status_code=400, detail="لم تُدخل المفاتيح بعد")
    result = await _run_test(iid, entry, doc)
    # persist last test for status card
    if entry["adapter"] == "channel":
        await db.ecom_integrations.update_one(
            {"id": doc["id"]},
            {"$set": {"hub_last_test": {"ok": result["ok"], "message": result["message"], "at": _now()}}})
    elif entry["adapter"] == "sendgrid":
        await db.email_integration_settings.update_one(
            {}, {"$set": {"hub_last_test": {"ok": result["ok"], "message": result["message"], "at": _now()}}})
    elif entry["adapter"] == "resend":  # p288
        await db.system_settings.update_one(
            {"type": "email_settings"},
            {"$set": {"hub_last_test": {"ok": result["ok"], "message": result["message"], "at": _now()}}},
            upsert=True)
    return result


@router.post("/integrations-hub/{iid}/disconnect")
async def hub_disconnect(iid: str, admin: dict = Depends(get_tenant_admin)):
    entry = REGISTRY.get(iid)
    if not entry or entry["adapter"] == "link":
        raise HTTPException(status_code=404, detail="تكامل غير موجود")
    if entry["adapter"] == "channel":
        doc = await _channel_doc(entry["channel"])
        if doc:
            await db.ecom_integrations.update_one(
                {"id": doc["id"]}, {"$set": {"is_active": False, "updated_at": _now()}})
        # p288: عكس الإلغاء على المرايا
        if entry["channel"] == "whatsapp":
            await db.whatsapp_integration_settings.update_one(
                {"tenant_id": admin.get("tenant_id")}, {"$set": {"enabled": False, "updated_at": _now()}})
        elif entry["channel"] == "telegram":
            await db.store_settings.update_one(
                {}, {"$set": {"telegram_bot_token": "", "telegram_chat_id": "", "updated_at": _now()}})
    elif entry["adapter"] == "resend":  # p288
        await db.system_settings.update_one({"type": "email_settings"}, {"$set": {"enabled": False}})
    elif entry["adapter"] == "sendgrid":
        await db.email_integration_settings.update_one({}, {"$set": {"enabled": False}})
        # p292: عكس الإلغاء على مرآة إشعارات البريد القديمة
        await db.system_settings.update_one({"type": "sendgrid_settings"}, {"$set": {"enabled": False}})
    elif entry["adapter"] == "woocommerce":
        await db.woocommerce_settings.update_one({"id": "global"}, {"$set": {"enabled": False}})
    elif entry["adapter"] == "sms":
        await db.ecom_sms_settings.update_one({"id": "global"}, {"$set": {"enabled": False}})
    await _audit(admin, "disconnect", iid)
    return {"ok": True, "message": "أُلغي التفعيل — المفاتيح محفوظة ومشفّرة ويمكن إعادة التفعيل باختبار ناجح"}
