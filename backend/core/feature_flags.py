from datetime import datetime, timezone
from typing import Optional
import logging

logger = logging.getLogger(__name__)

PLATFORM_FEATURES = [
    # ── Core ──
    {"key": "pos",              "name_ar": "نقطة البيع",           "name_fr": "Point de vente",       "category": "core",          "icon": "ShoppingCart",  "default": True,  "desc_ar": "نظام نقطة البيع والمبيعات",          "desc_fr": "Système de caisse et ventes"},
    {"key": "purchases",        "name_ar": "المشتريات",            "name_fr": "Achats",                "category": "core",          "icon": "ShoppingBag",   "default": True,  "desc_ar": "إدارة المشتريات والموردين",          "desc_fr": "Gestion achats & fournisseurs"},
    {"key": "inventory",        "name_ar": "المخزون",              "name_fr": "Inventaire",            "category": "core",          "icon": "Warehouse",     "default": True,  "desc_ar": "تتبع وجرد المخزون",                 "desc_fr": "Suivi et inventaire stock"},
    {"key": "customers",        "name_ar": "إدارة الزبائن",        "name_fr": "Gestion clients",       "category": "core",          "icon": "Users",         "default": True,  "desc_ar": "قاعدة بيانات الزبائن والديون",      "desc_fr": "Base clients et dettes"},
    # ── Services ──
    {"key": "recharge",         "name_ar": "شحن رصيد الجوال",     "name_fr": "Recharge mobile",       "category": "services",      "icon": "Smartphone",    "default": True,  "desc_ar": "بوابة شحن الرصيد USSD",             "desc_fr": "Passerelle recharge USSD"},
    {"key": "digital_services", "name_ar": "الخدمات الرقمية",     "name_fr": "Services numériques",   "category": "services",      "icon": "Zap",           "default": True,  "desc_ar": "IPTV وخدمات رقمية أخرى",            "desc_fr": "IPTV et services numériques"},
    {"key": "cards_service",    "name_ar": "بطاقات الشحن",        "name_fr": "Cartes de recharge",    "category": "services",      "icon": "CreditCard",    "default": True,  "desc_ar": "بيع بطاقات الشحن",                  "desc_fr": "Vente de cartes de recharge"},
    {"key": "repair_tracking",  "name_ar": "تتبع الإصلاح",        "name_fr": "Suivi réparation",      "category": "services",      "icon": "Wrench",        "default": True,  "desc_ar": "إدارة أوامر الإصلاح",               "desc_fr": "Gestion des réparations"},
    {"key": "wholesale",        "name_ar": "البيع بالجملة",       "name_fr": "Vente en gros",         "category": "services",      "icon": "Package2",      "default": True,  "desc_ar": "خدمات البيع بالجملة",               "desc_fr": "Services grossiste"},
    # ── Automation ──
    {"key": "robots",           "name_ar": "الروبوتات التلقائية", "name_fr": "Robots automatiques",   "category": "automation",    "icon": "Bot",           "default": True,  "desc_ar": "14 روبوت يعمل في الخلفية",          "desc_fr": "14 robots en arrière-plan"},
    {"key": "auto_reports",     "name_ar": "التقارير التلقائية",  "name_fr": "Rapports automatiques", "category": "automation",    "icon": "FileText",      "default": True,  "desc_ar": "إرسال تقارير يومية وأسبوعية",       "desc_fr": "Envoi rapports auto"},
    {"key": "auto_backup",      "name_ar": "النسخ الاحتياطي",    "name_fr": "Sauvegarde auto",       "category": "automation",    "icon": "Database",      "default": True,  "desc_ar": "نسخ تلقائية لقواعد البيانات",       "desc_fr": "Sauvegardes automatiques"},
    # ── AI ──
    {"key": "ai_chat",          "name_ar": "المحاسب الذكي",       "name_fr": "Comptable IA",          "category": "ai",            "icon": "Sparkles",      "default": True,  "desc_ar": "محادثة مع GPT-4 للمحاسبة",          "desc_fr": "Chat GPT-4 comptabilité"},
    {"key": "ai_agents",        "name_ar": "الوكلاء الذكيون",    "name_fr": "Agents IA",             "category": "ai",            "icon": "BrainCircuit",  "default": True,  "desc_ar": "وكلاء ذكاء اصطناعي مستقلون",        "desc_fr": "Agents IA autonomes"},
    # ── Communication ──
    {"key": "whatsapp",         "name_ar": "إشعارات واتساب",     "name_fr": "Notif. WhatsApp",       "category": "communication", "icon": "MessageCircle", "default": True,  "desc_ar": "إشعارات عبر واتساب",                "desc_fr": "Notifications WhatsApp"},
    {"key": "notifications",    "name_ar": "الإشعارات الذكية",   "name_fr": "Notifications IA",      "category": "communication", "icon": "Bell",          "default": True,  "desc_ar": "إشعارات ذكية للمخزون والديون",      "desc_fr": "Alertes intelligentes stock"},
    # ── Reporting ──
    {"key": "reports",          "name_ar": "التقارير",            "name_fr": "Rapports",              "category": "reporting",     "icon": "BarChart3",     "default": True,  "desc_ar": "تقارير المبيعات والأرباح",           "desc_fr": "Rapports ventes & profits"},
    {"key": "daily_sessions",   "name_ar": "الجلسات اليومية",    "name_fr": "Sessions journalières", "category": "reporting",     "icon": "CalendarDays",  "default": True,  "desc_ar": "فتح وإغلاق الجلسات اليومية",        "desc_fr": "Ouverture/fermeture sessions"},
    # ── Finance ──
    {"key": "banking",          "name_ar": "الحسابات البنكية",   "name_fr": "Comptes bancaires",     "category": "finance",       "icon": "Landmark",      "default": True,  "desc_ar": "إدارة الحسابات البنكية",             "desc_fr": "Gestion comptes bancaires"},
    {"key": "expenses",         "name_ar": "المصروفات",           "name_fr": "Dépenses",              "category": "finance",       "icon": "Receipt",       "default": True,  "desc_ar": "تتبع المصروفات التشغيلية",           "desc_fr": "Suivi dépenses opérationnelles"},
    {"key": "loyalty",          "name_ar": "نقاط الولاء",        "name_fr": "Programme fidélité",    "category": "finance",       "icon": "Award",         "default": True,  "desc_ar": "نقاط مكافآت للزبائن",               "desc_fr": "Points fidélité clients"},
    # ── UI / Tools ──
    {"key": "print_system",     "name_ar": "نظام الطباعة",       "name_fr": "Impression",            "category": "ui",            "icon": "Printer",       "default": True,  "desc_ar": "طباعة فواتير حرارية وA4",            "desc_fr": "Impression thermique & A4"},
    {"key": "public_store",     "name_ar": "المتجر العام",        "name_fr": "Boutique publique",     "category": "ui",            "icon": "Store",         "default": True,  "desc_ar": "واجهة عرض منتجات عامة",             "desc_fr": "Vitrine produits publique"},
]

CATEGORY_LABELS = {
    "core":          {"ar": "الوحدات الأساسية",     "fr": "Modules de base"},
    "services":      {"ar": "الخدمات",              "fr": "Services"},
    "automation":    {"ar": "الأتمتة والروبوتات",   "fr": "Automatisation & Robots"},
    "ai":            {"ar": "الذكاء الاصطناعي",     "fr": "Intelligence artificielle"},
    "communication": {"ar": "التواصل والإشعارات",   "fr": "Communication & Alertes"},
    "reporting":     {"ar": "التقارير والتحليل",    "fr": "Rapports & Analyses"},
    "finance":       {"ar": "الماليات",             "fr": "Finance"},
    "ui":            {"ar": "الواجهة والأدوات",     "fr": "Interface & Outils"},
}

_FLAGS_BY_KEY = {f["key"]: f for f in PLATFORM_FEATURES}


class FeatureFlagManager:
    """Platform-level feature flag manager — persists to main_db.platform_features."""

    def __init__(self, main_db):
        self.db = main_db
        self._cache: Optional[dict] = None

    async def _load(self) -> dict:
        docs = await self.db.platform_features.find({}).to_list(None)
        stored = {d["key"]: d["enabled"] for d in docs}
        merged = {}
        for feat in PLATFORM_FEATURES:
            merged[feat["key"]] = stored.get(feat["key"], feat["default"])
        self._cache = merged
        return merged

    async def get_all(self) -> list:
        state = await self._load()
        return [{**feat, "enabled": state.get(feat["key"], feat["default"])} for feat in PLATFORM_FEATURES]

    async def is_enabled(self, key: str) -> bool:
        if self._cache is None:
            await self._load()
        feat_def = _FLAGS_BY_KEY.get(key)
        default = feat_def["default"] if feat_def else True
        return self._cache.get(key, default)

    async def get_enabled_keys(self) -> list:
        state = await self._load()
        return [k for k, v in state.items() if v]

    async def toggle(self, key: str) -> bool:
        if key not in _FLAGS_BY_KEY:
            raise ValueError(f"Unknown feature key: {key}")
        state = await self._load()
        new_val = not state.get(key, _FLAGS_BY_KEY[key]["default"])
        await self.db.platform_features.update_one(
            {"key": key},
            {"$set": {"key": key, "enabled": new_val, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
        if self._cache is not None:
            self._cache[key] = new_val
        logger.info("Feature flag '%s' → %s", key, "ON" if new_val else "OFF")
        return new_val

    async def set_flag(self, key: str, enabled: bool) -> None:
        if key not in _FLAGS_BY_KEY:
            raise ValueError(f"Unknown feature key: {key}")
        await self.db.platform_features.update_one(
            {"key": key},
            {"$set": {"key": key, "enabled": enabled, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
        if self._cache is not None:
            self._cache[key] = enabled
        logger.info("Feature flag '%s' set → %s", key, "ON" if enabled else "OFF")


_manager: Optional["FeatureFlagManager"] = None


def set_feature_flag_manager(m: "FeatureFlagManager") -> None:
    global _manager
    _manager = m


def get_feature_flag_manager() -> Optional["FeatureFlagManager"]:
    return _manager
