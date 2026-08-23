"""p256: registry of Algerian courier companies beyond the original six.

Single source of truth imported by:
- routes/shipping_loyalty_routes.py  (ALGERIAN_SHIPPING_COMPANIES catalog)
- routes/ecom/constants.py           (SHIPPING_PROVIDERS + CHANNELS shipping entries)
- services/ecom/courier_sync.py      (COURIER_ADAPTERS — generic_http by default)
- routes/ecom/shipping_routes.py     (COURIER_DISPLAY_NAMES)
- routes/online_store_routes.py      (PROVIDER_LABELS)

Most of these run on the Ecotrack platform family (same API shape), so the
generic_http adapter serves them once the tenant enters base_url + api_token.
IDs are stable snake_case slugs; never rename (stored in integrations/orders).
"""

EXTRA_COURIERS = [
    {"id": "abex",           "name": "Abex Express",          "name_ar": "أبيكس إكسبريس"},
    {"id": "med_express",    "name": "Med Express",           "name_ar": "ميد إكسبريس"},
    {"id": "msm_go",         "name": "MSM Go",                "name_ar": "إم إس إم غو"},
    {"id": "rex",            "name": "Rex Livraison",         "name_ar": "ريكس للتوصيل"},
    {"id": "rb_livraison",   "name": "RB Livraison",          "name_ar": "آر بي للتوصيل"},
    {"id": "speed_delivery", "name": "Speed Delivery",        "name_ar": "سبيد ديليفري"},
    {"id": "areex",          "name": "Areex",                 "name_ar": "أريكس"},
    {"id": "prest",          "name": "Prest",                 "name_ar": "برست"},
    {"id": "rocket",         "name": "Rocket Delivery",       "name_ar": "روكيت ديليفري"},
    {"id": "world_express",  "name": "World Express",         "name_ar": "وورلد إكسبريس"},
    {"id": "ba_consult",     "name": "BA Consult",            "name_ar": "بي أي كونسالت"},
    {"id": "packers",        "name": "Packers",               "name_ar": "باكرز"},
    {"id": "hr48",           "name": "48Hr Livraison",        "name_ar": "48 ساعة للتوصيل"},
    {"id": "mono_hub",       "name": "Mono Hub",              "name_ar": "مونو هاب"},
    {"id": "golivri",        "name": "GOLIVRI",               "name_ar": "غوليفري"},
    {"id": "salva",          "name": "Salva Delivery",        "name_ar": "سالفا ديليفري"},
    {"id": "distazero",      "name": "Distazero",             "name_ar": "ديستازيرو"},
    {"id": "fret_direct",    "name": "FRET.Direct",           "name_ar": "فري دايركت"},
    {"id": "zimou",          "name": "Zimou Express",         "name_ar": "زيمو إكسبريس"},
    {"id": "zinyatec",       "name": "Zinyatec",              "name_ar": "زيناتيك"},
    {"id": "tsl",            "name": "TSL Express",           "name_ar": "تي إس إل إكسبريس"},
    {"id": "negmar",         "name": "Negmar Express",        "name_ar": "نقمار إكسبريس"},
    {"id": "ultra",          "name": "Ultra Express",         "name_ar": "ألترا إكسبريس"},
    {"id": "om_courrier",    "name": "OM Courrier Express",   "name_ar": "أو إم كورييه"},
    {"id": "allo_livraison", "name": "Allo Livraison",        "name_ar": "ألو ليفريزون"},
    {"id": "assil",          "name": "Assil Delivery",        "name_ar": "أسيل ديليفري"},
    {"id": "expedia_chrono", "name": "Expedia Chrono",        "name_ar": "إكسبيديا كرونو"},
    {"id": "hhd",            "name": "HHD Express",           "name_ar": "إتش إتش دي إكسبريس"},
    {"id": "imir",           "name": "Imir Logistics",        "name_ar": "إيمير لوجيستيكس"},
    {"id": "navex",          "name": "Navex Delivery",        "name_ar": "نافيكس ديليفري"},
    {"id": "swift",          "name": "Swift Express",         "name_ar": "سويفت إكسبريس"},
    {"id": "univer",         "name": "Univer Delivery",       "name_ar": "يونيفير ديليفري"},
    {"id": "colireli",       "name": "ColiReli",              "name_ar": "كوليريلي"},
    {"id": "fz_delivery",    "name": "FZ Delivery",           "name_ar": "إف زد ديليفري"},
    {"id": "delivro",        "name": "Delivro Mail",          "name_ar": "ديليفرو ميل"},
    {"id": "pdex",           "name": "PDEX",                  "name_ar": "بي دي إكس"},
    {"id": "rm_express",     "name": "RM Express",            "name_ar": "آر إم إكسبريس"},
    {"id": "one_delivery",   "name": "One Delivery",          "name_ar": "ون ديليفري"},
    {"id": "on_time",        "name": "On Time Express",       "name_ar": "أون تايم إكسبريس"},
    {"id": "amana_speed",    "name": "Amana Speed Service",   "name_ar": "أمانة سبيد"},
    {"id": "rj360",          "name": "RJ360 Express",         "name_ar": "آر جي 360 إكسبريس"},
    {"id": "rs_express",     "name": "RS Express",            "name_ar": "آر إس إكسبريس"},
    {"id": "vitrans",        "name": "Vitrans Express",       "name_ar": "فيترانس إكسبريس"},
    {"id": "jo_express",     "name": "JO Express Time",       "name_ar": "جو إكسبريس"},
    {"id": "lynx",           "name": "Lynx Express",          "name_ar": "لينكس إكسبريس"},
    {"id": "jaguar",         "name": "Jaguar Express",        "name_ar": "جاكوار إكسبريس"},
    {"id": "sbl",            "name": "SBL Express",           "name_ar": "إس بي إل إكسبريس"},
    {"id": "samex",          "name": "Samex Express",         "name_ar": "ساميكس إكسبريس"},
    {"id": "chrono_rex",     "name": "Chrono Rex",            "name_ar": "كرونو ريكس"},
    {"id": "ovred",          "name": "OVRED",                 "name_ar": "أوفريد"},
    {"id": "aranex",         "name": "Aranex Express",        "name_ar": "أرانيكس إكسبريس"},
    {"id": "gs_ecommerce",   "name": "GS Ecommerce Express",  "name_ar": "جي إس إكسبريس"},
    {"id": "khotwa",         "name": "Khotwa Express",        "name_ar": "خطوة إكسبريس"},
    {"id": "royaume",        "name": "Royaume Delivery",      "name_ar": "رويوم ديليفري"},
    {"id": "ruta",           "name": "Ruta Express",          "name_ar": "روتا إكسبريس"},
    {"id": "dvd_delivery",   "name": "DVD Delivery",          "name_ar": "دي في دي ديليفري"},
    {"id": "colex",          "name": "Colex Express",         "name_ar": "كوليكس إكسبريس"},
    {"id": "easy_speed",     "name": "Easy & Speed",          "name_ar": "إيزي آند سبيد"},
    {"id": "nord_ouest",     "name": "Nord Ouest Express",    "name_ar": "نورد ويست إكسبريس"},
    {"id": "worlexpress",    "name": "Worl Express",          "name_ar": "وورل إكسبريس"},
    {"id": "sogex",          "name": "Sogex",                 "name_ar": "سوجيكس"},
]
