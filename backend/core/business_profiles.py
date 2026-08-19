"""
Business Activity Profiles (p183 — المرحلة 1)

Each profile maps a business_type to:
  • features_off: platform menu featureKeys to DISABLE (hidden from sidebar & routes)
  • features_on:  opt-in featureKeys to explicitly ENABLE (e.g. ecommerce_hub)
  • families:     starter product families (Arabic names) seeded at registration
                  when the new tenant DB has no families yet
  • defaults:     light tenant-level settings hints (terminology/behaviour)

Resolution rule (AuthContext.isFeatureEnabled): a featureKey missing from the
resolved map is ENABLED by default — so profiles only list what they CHANGE.
"""

# Menu featureKeys (frontend Layout.js): ai_bots, backup, barcode, credit_sales,
# customers, ecommerce_hub (opt-in), inventory, iptv, loyalty_points,
# maintenance, pos, recharge, reports, wallet

BUSINESS_PROFILES = [
    {
        "key": "retail",
        "name_ar": "تجارة التجزئة العامة", "name_fr": "Commerce de détail",
        "icon": "Store",
        "desc_ar": "محل تجزئة عام — كل أساسيات البيع والمخزون",
        "features_off": ["recharge", "iptv", "maintenance"],
        "features_on": [],
        "families": ["مواد غذائية", "مشروبات", "منظفات", "أدوات منزلية", "متفرقات"],
    },
    {
        "key": "supermarket",
        "name_ar": "محلات السوبرماركت", "name_fr": "Supermarchés",
        "icon": "ShoppingCart",
        "desc_ar": "مخزون كبير، باركود، صلاحية، نقاط ولاء",
        "features_off": ["recharge", "iptv", "maintenance"],
        "features_on": [],
        "families": ["مواد غذائية", "مشروبات", "ألبان وأجبان", "حلويات وبسكويت", "منظفات", "لحوم ومجمدات", "فواكه وخضر"],
    },
    {
        "key": "recharge_shop",
        "name_ar": "محلات خدمة الرصيد", "name_fr": "Recharge & services",
        "icon": "Smartphone",
        "desc_ar": "فليكسي وشحن الرصيد والبطاقات والخدمات الرقمية",
        "features_off": ["iptv", "maintenance", "loyalty_points", "barcode"],
        "features_on": ["recharge"],
        "families": ["شحن موبيليس", "شحن جيزي", "شحن أوريدو", "بطاقات الشحن", "خدمات رقمية", "هواتف وملحقات"],
    },
    {
        "key": "electronics",
        "name_ar": "محلات الإلكترونيات", "name_fr": "Électronique",
        "icon": "Cpu",
        "desc_ar": "هواتف وأجهزة مع تذاكر الصيانة والضمان",
        "features_off": ["recharge", "iptv"],
        "features_on": ["maintenance"],
        "families": ["هواتف ذكية", "حواسيب", "ملحقات", "أجهزة لوحية", "قطع غيار", "أجهزة صوت وصورة"],
    },
    {
        "key": "fruits_vegetables",
        "name_ar": "محلات الخضر والفواكه", "name_fr": "Fruits & légumes",
        "icon": "Apple",
        "desc_ar": "بيع سريع بالوزن أو القطعة، مخزون يومي",
        "features_off": ["recharge", "iptv", "maintenance", "loyalty_points"],
        "features_on": [],
        "families": ["خضر", "فواكه", "فواكه جافة", "أعشاب وتوابل"],
    },
    {
        "key": "tobacco",
        "name_ar": "محلات أدوات التبغ والمدخنين", "name_fr": "Tabac & accessoires",
        "icon": "Cigarette",
        "desc_ar": "سجائر وملحقات التدخين، باركود ومخزون",
        "features_off": ["recharge", "iptv", "maintenance", "loyalty_points"],
        "features_on": [],
        "families": ["سجائر", "معسل", "ورق ولفائف", "ولاعات وملحقات", "سجائر إلكترونية"],
    },
    {
        "key": "pharmacy",
        "name_ar": "الصيدليات", "name_fr": "Pharmacies",
        "icon": "Pill",
        "desc_ar": "أدوية ومستلزمات مع تتبع الصلاحية والتشغيلات",
        "features_off": ["recharge", "iptv", "maintenance", "loyalty_points"],
        "features_on": [],
        "families": ["أدوية", "مستلزمات طبية", "مستحضرات تجميل", "حليب وأغذية أطفال", "مكملات غذائية"],
    },
    {
        "key": "clothing",
        "name_ar": "محلات الملابس", "name_fr": "Vêtements",
        "icon": "Shirt",
        "desc_ar": "ملابس وأحذية مع نقاط الولاء والمواسم",
        "features_off": ["recharge", "iptv", "maintenance"],
        "features_on": [],
        "families": ["ملابس رجال", "ملابس نساء", "ملابس أطفال", "أحذية", "إكسسوارات"],
    },
    {
        "key": "repair",
        "name_ar": "محلات الصيانة", "name_fr": "Réparation",
        "icon": "Wrench",
        "desc_ar": "تذاكر إصلاح، قطع غيار، حالة كل جهاز",
        "features_off": ["recharge", "iptv", "barcode", "loyalty_points"],
        "features_on": ["maintenance"],
        "families": ["قطع غيار هواتف", "قطع غيار حواسيب", "خدمات الصيانة", "أجهزة مستعملة"],
    },
    {
        "key": "car_rental",
        "name_ar": "وكالات كراء السيارات", "name_fr": "Location de voitures",
        "icon": "Car",
        "desc_ar": "عقود كراء وحجوزات (وحدة الكراء — قريباً)",
        "features_off": ["recharge", "iptv", "maintenance", "barcode", "inventory", "loyalty_points"],
        "features_on": [],
        "families": ["كراء يومي", "كراء طويل المدى", "خدمات إضافية"],
    },
    {
        "key": "property_rental",
        "name_ar": "وكالات كراء المنازل", "name_fr": "Location immobilière",
        "icon": "Building",
        "desc_ar": "عقارات وعقود شهرية (وحدة الكراء — قريباً)",
        "features_off": ["recharge", "iptv", "maintenance", "barcode", "inventory", "loyalty_points"],
        "features_on": [],
        "families": ["شقق", "محلات تجارية", "مستودعات", "خدمات الوكالة"],
    },
    {
        "key": "wholesale",
        "name_ar": "تجار الجملة", "name_fr": "Grossistes",
        "icon": "Package2",
        "desc_ar": "أسعار جملة، ديون تجار، مخازن متعددة",
        "features_off": ["recharge", "iptv", "maintenance", "loyalty_points"],
        "features_on": [],
        "families": ["مواد غذائية بالجملة", "مشروبات بالجملة", "منظفات بالجملة", "مواد متنوعة"],
    },
    {
        "key": "production",
        "name_ar": "مؤسسات الإنتاج", "name_fr": "Production",
        "icon": "Factory",
        "desc_ar": "إنتاج وتحويل مواد أولية (وصفات الإنتاج — قريباً)",
        "features_off": ["recharge", "iptv", "maintenance", "loyalty_points"],
        "features_on": [],
        "families": ["مواد أولية", "منتجات نهائية", "تغليف وتعبئة", "نصف مصنع"],
    },
    {
        "key": "ecommerce",
        "name_ar": "التجارة الإلكترونية", "name_fr": "E-commerce",
        "icon": "Globe",
        "desc_ar": "متجر إلكتروني كامل مع الشحن والتوصيل",
        "features_off": ["recharge", "iptv", "maintenance"],
        "features_on": ["ecommerce_hub"],
        "families": ["منتجات رائجة", "عروض", "إلكترونيات", "موضة", "منزل ومطبخ"],
    },
    {
        "key": "spices",
        "name_ar": "محلات التوابل والعقاقير", "name_fr": "Épices & herboristerie",
        "icon": "Leaf",
        "desc_ar": "توابل وأعشاب بالوزن مع الصلاحية",
        "features_off": ["recharge", "iptv", "maintenance", "loyalty_points"],
        "features_on": [],
        "families": ["توابل", "أعشاب طبية", "عطارة", "عسل ومنتجات النحل", "فواكه جافة"],
    },
    {
        "key": "work_equipment",
        "name_ar": "محلات معدات وتجهيزات العمل", "name_fr": "Équipement de travail",
        "icon": "HardHat",
        "desc_ar": "عدد ومعدات مع خدمة ما بعد البيع",
        "features_off": ["recharge", "iptv", "loyalty_points"],
        "features_on": ["maintenance"],
        "families": ["عدد يدوية", "عدد كهربائية", "معدات السلامة", "قطع الغيار", "آلات"],
    },
    {
        "key": "paint",
        "name_ar": "محلات الدهان", "name_fr": "Peinture",
        "icon": "Paintbrush",
        "desc_ar": "دهانات ومواد البناء الخفيفة، ديون المقاولين",
        "features_off": ["recharge", "iptv", "maintenance", "loyalty_points"],
        "features_on": [],
        "families": ["دهانات مائية", "دهانات زيتية", "ورنيش", "أدوات الدهان", "مواد التحضير"],
    },
    {
        "key": "home_appliances",
        "name_ar": "محلات الأجهزة الكهرومنزلية", "name_fr": "Électroménager",
        "icon": "Refrigerator",
        "desc_ar": "أجهزة كبيرة مع ضمان وصيانة",
        "features_off": ["recharge", "iptv"],
        "features_on": ["maintenance"],
        "families": ["ثلاجات ومجمدات", "غسالات", "أفران وطباخات", "تلفزيونات", "أجهزة صغيرة", "مكيفات"],
    },
    {
        "key": "restaurant",
        "name_ar": "بيتزيريا فاست فود ومطاعم", "name_fr": "Restaurants & Fast-food",
        "icon": "Pizza",
        "desc_ar": "بيع سريع عبر العداد، منتجات غير مخزنة",
        "features_off": ["recharge", "iptv", "maintenance", "barcode", "credit_sales"],
        "features_on": [],
        "families": ["بيتزا", "ساندويتشات", "مشروبات", "حلويات", "وجبات", "مقبلات"],
    },
    {
        "key": "car_wash",
        "name_ar": "محلات غسل السيارات", "name_fr": "Lavage auto",
        "icon": "Droplets",
        "desc_ar": "خدمات غسل واشتراكات زبائن",
        "features_off": ["recharge", "iptv", "maintenance", "barcode", "inventory"],
        "features_on": [],
        "families": ["غسل خارجي", "غسل كامل", "تلميع", "تنظيف داخلي", "اشتراكات"],
    },
    {
        "key": "laundry",
        "name_ar": "محلات غسل الملابس", "name_fr": "Pressing",
        "icon": "WashingMachine",
        "desc_ar": "استلام وتسليم قطع الملابس",
        "features_off": ["recharge", "iptv", "maintenance", "barcode", "inventory"],
        "features_on": [],
        "families": ["غسل عادي", "غسل جاف", "كي", "سجاد وأغطية", "خدمة سريعة"],
    },
    {
        "key": "car_importer",
        "name_ar": "مستوردو السيارات والمنتجات", "name_fr": "Importateurs",
        "icon": "Ship",
        "desc_ar": "استيراد وبيع بالجملة والتجزئة",
        "features_off": ["recharge", "iptv", "maintenance", "barcode", "loyalty_points"],
        "features_on": [],
        "families": ["سيارات", "منتجات مستوردة", "قطع غيار", "خدمات الجمركة"],
    },
    {
        "key": "distributor",
        "name_ar": "الموزعون بالجملة", "name_fr": "Distributeurs",
        "icon": "Truck",
        "desc_ar": "توزيع على المحلات مع ديون ومخازن",
        "features_off": ["recharge", "iptv", "maintenance", "loyalty_points"],
        "features_on": [],
        "families": ["منتجات التوزيع", "عروض الموزعين", "مرتجعات"],
    },
]

# Legacy values kept valid — map to the new profiles
LEGACY_ALIASES = {
    "retailer": "retail",
    "wholesaler": "wholesale",
    "distributor": "distributor",
}

_BY_KEY = {p["key"]: p for p in BUSINESS_PROFILES}

# All featureKeys the frontend sidebar/route guard understands
KNOWN_FEATURE_KEYS = [
    "ai_bots", "backup", "barcode", "credit_sales", "customers", "ecommerce_hub",
    "inventory", "iptv", "loyalty_points", "maintenance", "pos", "recharge",
    "reports", "wallet",
]


def get_profile(key: str) -> dict | None:
    key = LEGACY_ALIASES.get(key, key)
    return _BY_KEY.get(key)


def list_profiles() -> list:
    """Public catalogue for registration/admin selects."""
    return [
        {
            "key": p["key"],
            "name_ar": p["name_ar"],
            "name_fr": p["name_fr"],
            "icon": p["icon"],
            "desc_ar": p["desc_ar"],
        }
        for p in BUSINESS_PROFILES
    ]


def profile_features(key: str) -> dict:
    """Flat feature override map for a business type. {} if unknown type."""
    p = get_profile(key)
    if not p:
        return {}
    feats = {k: False for k in p.get("features_off", []) if k in KNOWN_FEATURE_KEYS}
    feats.update({k: True for k in p.get("features_on", []) if k in KNOWN_FEATURE_KEYS})
    return feats


def profile_families(key: str) -> list:
    p = get_profile(key)
    return list(p.get("families", [])) if p else []


async def apply_business_profile(main_db, tenant_id: str, business_type: str, merge: bool = True) -> dict:
    """Set tenant.business_type + merge the profile's feature map into
    features_override. merge=True keeps the admin's later manual toggles for
    keys the profile doesn't mention; keys the profile DOES mention win.
    Returns the applied override diff."""
    profile = get_profile(business_type)
    if not profile:
        raise ValueError(f"Unknown business_type: {business_type}")
    feats = profile_features(business_type)
    tenant = await main_db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0, "features_override": 1})
    if not tenant:
        raise LookupError(f"Tenant not found: {tenant_id}")
    current = dict(tenant.get("features_override") or {}) if merge else {}
    current.update(feats)
    await main_db.saas_tenants.update_one(
        {"id": tenant_id},
        {"$set": {"business_type": business_type, "features_override": current}},
    )
    return {"business_type": business_type, "applied": feats, "features_override": current}
