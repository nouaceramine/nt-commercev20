"""
Motherboard Core - Component map (p340: full coverage).

Declares every component of NT Commerce, its human-readable names, the API route
prefixes it owns, the main MongoDB collections it touches, its feature gate
(per-subscriber on/off) and its health probe. Importing this module registers
all components into the registry.

Rules:
- Every live API path must be owned by exactly one component (longest-prefix match).
- gate=None → always on (core platform plumbing). gate set → per-tenant toggle,
  absent key resolves to gate_default (True for everything live before p340, so
  nothing breaks for existing subscribers).
"""
from .registry import ModuleSpec, register

# category keys (Arabic labels served to the UI by the modules endpoint):
# core, commerce, inventory, sales, customers, suppliers, finance, restaurant,
# telecom, ecommerce, marketing, communication, integrations, hr, maintenance, ai, platform

COMPONENTS: list[ModuleSpec] = [
    # ---------------- core (always on) ----------------
    ModuleSpec("auth", "المصادقة والمستخدمون", "Auth & Users",
               ["/api/auth", "/api/users", "/api/permissions", "/api/2fa"],
               ["users", "super_admins"], gate=None, category="core",
               probe={"type": "http", "path": "/api/health"}),
    ModuleSpec("settings", "الإعدادات", "Paramètres",
               ["/api/settings", "/api/branding", "/api/config", "/api/init-default-data",
                "/api/tenant"],
               ["settings"], gate=None, category="core",
               probe={"type": "http", "path": "/api/config"}),
    ModuleSpec("notifications", "الإشعارات", "Notifications",
               ["/api/notifications", "/api/push", "/api/events"],
               ["notifications", "push_subscriptions"], gate=None, category="core",
               probe={"type": "collection", "name": "notifications"}),
    ModuleSpec("search", "البحث الشامل", "Recherche",
               ["/api/search"], [], gate=None, category="core",
               probe={"type": "http", "path": "/api/search/global", "expect": [200, 400, 401, 403, 422]}),
    ModuleSpec("printing", "الطباعة", "Impression",
               ["/api/printing", "/api/qr.png"],
               ["print_templates"], gate=None, category="core",
               probe={"type": "http", "path": "/api/qr.png?text=ok", "expect": [200, 400, 422]}),
    ModuleSpec("backup", "النسخ الاحتياطي والبيانات", "Sauvegardes & Données",
               ["/api/backup", "/api/sync", "/api/data", "/api/upload"],
               [], gate=None, category="core",
               probe={"type": "http", "path": "/api/backup/status", "expect": [200, 401, 403, 404]}),
    ModuleSpec("dashboard", "لوحة القيادة", "Tableau de bord",
               ["/api/dashboard", "/api/stats"], [], gate=None, category="core",
               probe={"type": "http", "path": "/api/stats", "expect": [200, 401, 403]}),
    ModuleSpec("support", "تذاكر الدعم", "Support",
               ["/api/support"], ["support_tickets"], gate=None, category="core",
               probe={"type": "collection", "name": "support_tickets"}),
    ModuleSpec("system", "النظام والتشخيص", "Système & Diagnostics",
               ["/api/system", "/health", "/api/health", "/api/diagnostics", "/api/performance",
                "/api/internal", "/api/system-logs", "/api/system-updates", "/", "/api/"],
               [], gate=None, category="platform",
               probe={"type": "http", "path": "/api/health"}),
    ModuleSpec("platform_supply", "توريد المنصة (بطاقات)", "Approvisionnement plateforme",
               ["/api/platform-cards"],
               ["platform_card_catalog", "platform_card_stock"], gate=None, category="platform",
               probe={"type": "collection", "name": "platform_card_catalog", "main": True}),
    ModuleSpec("robots", "الروبوتات", "Robots",
               ["/api/robots"], [], gate=None, category="platform",
               probe={"type": "http", "path": "/api/robots/status", "expect": [200, 401, 403]}),
    ModuleSpec("security", "الأمان", "Sécurité",
               ["/api/security", "/api/api-keys"],
               ["security_logs", "api_keys"], gate=None, category="core",
               probe={"type": "collection", "name": "api_keys"}),
    ModuleSpec("saas", "إدارة المنصة", "Gestion SaaS",
               ["/api/saas", "/api/admin", "/api/platform", "/api/public"],
               ["plans", "tenants"], gate=None, category="platform",
               probe={"type": "collection", "name": "tenants", "main": True}),

    # ---------------- commerce core ----------------
    ModuleSpec("products", "المنتجات", "Produits",
               ["/api/products", "/api/product-families", "/api/product-brands",
                "/api/price-history", "/api/price-updates"],
               ["products", "product_families"], gate=None, category="commerce",
               probe={"type": "collection", "name": "products"}),
    ModuleSpec("payments", "المدفوعات", "Paiements",
               ["/api/payments", "/api/webhook"],
               ["payments"], gate=None, category="finance",
               probe={"type": "collection", "name": "payments"}),
    ModuleSpec("finance_base", "العملات والضرائب", "Devises & Taxes",
               ["/api/currencies", "/api/tax"],
               ["currencies", "tax_rates"], gate=None, category="finance",
               probe={"type": "collection", "name": "currencies"}),
    ModuleSpec("integrations", "التكاملات", "Intégrations",
               ["/api/integrations", "/api/integrations-hub"],
               [], gate=None, category="integrations",
               probe={"type": "http", "path": "/api/integrations-hub/catalog", "expect": [200, 401, 403]}),
    ModuleSpec("email", "البريد الإلكتروني", "Email",
               ["/api/email", "/api/integrations/email"], [], gate=None, category="communication",
               probe={"type": "http", "path": "/api/email/settings", "expect": [200, 401, 403]},
               aliases=["sendgrid_email", "sendgrid_integration"]),

    # ---------------- gated: commerce ----------------
    # p342: aliases — الأسماء/الملفات القديمة التي وُحّدت تحت هذه الوحدة
    ModuleSpec("inventory", "المخزون والمخازن", "Stock & Entrepôts",
               ["/api/warehouses", "/api/inventory-sessions", "/api/stock-transfers",
                "/api/barcodes", "/api/defective", "/api/defective-products"],
               ["warehouses", "spare_parts"], gate="inventory", category="inventory",
               probe={"type": "collection", "name": "warehouses"}),
    ModuleSpec("sales", "المبيعات ونقطة البيع", "Ventes & POS",
               ["/api/sales", "/api/pos", "/api/invoices"],
               ["sales"], gate="pos", category="sales",
               probe={"type": "collection", "name": "sales"}),
    ModuleSpec("cashbox", "الصناديق والورديات", "Caisse & Sessions",
               ["/api/cash", "/api/cash-boxes", "/api/daily-sessions"],
               ["cash_boxes", "daily_sessions"], gate="pos", category="sales",
               probe={"type": "collection", "name": "cash_boxes"}),
    ModuleSpec("customers", "الزبائن", "Clients",
               ["/api/customers", "/api/customer-families", "/api/blacklist"],
               ["customers", "customer_families"], gate="customers", category="customers",
               probe={"type": "collection", "name": "customers"}),
    ModuleSpec("loyalty", "نقاط الولاء", "Fidélité",
               ["/api/loyalty"], ["loyalty"], gate="loyalty_points", category="customers",
               probe={"type": "http", "path": "/api/loyalty/settings", "expect": [200, 401, 403]}),
    ModuleSpec("credit", "الديون والأقساط", "Dettes & Versements",
               ["/api/debts", "/api/debt-reminders", "/api/installments",
                "/api/collection-reports"],
               ["debts", "installments"], gate="credit_sales", category="customers",
               probe={"type": "collection", "name": "debts"},
               aliases=["customer_debts", "debts"]),
    ModuleSpec("suppliers", "المشتريات والموردون", "Achats & Fournisseurs",
               ["/api/purchases", "/api/suppliers", "/api/supplier",
                "/api/supplier-debts", "/api/supplier-families", "/api/supplier-tracking"],
               ["suppliers", "purchases"], gate="purchases", category="suppliers",
               probe={"type": "collection", "name": "suppliers"},
               aliases=["suppliers_core", "supplier_tracking"]),
    ModuleSpec("accounting", "المحاسبة والبنوك", "Comptabilité & Banques",
               ["/api/accounting", "/api/banking", "/api/margin-rules"],
               ["accounts", "journal_entries"], gate="accounting", category="finance",
               probe={"type": "collection", "name": "accounts"}),
    ModuleSpec("expenses", "المصاريف", "Dépenses",
               ["/api/expenses"], ["expenses"], gate="expenses", category="finance",
               probe={"type": "collection", "name": "expenses"}),
    ModuleSpec("reports", "التقارير والتحليلات", "Rapports & Analyses",
               ["/api/reports", "/api/analytics", "/api/smart-reports", "/api/auto-reports",
                "/api/smart-notifications"],
               ["daily_reports"], gate="reports", category="finance",
               probe={"type": "http", "path": "/api/reports/sales-chart", "expect": [200, 400, 401, 403, 422]}),
    ModuleSpec("promotions", "العروض والكوبونات", "Promotions",
               ["/api/promotions"], ["promotions"], gate="promotions", category="marketing",
               probe={"type": "collection", "name": "promotions"}),
    ModuleSpec("employees", "الموظفون والمهام", "Employés & Tâches",
               ["/api/employees", "/api/activity", "/api/tasks", "/api/chat",
                "/api/commissions"],
               ["employees", "tasks"], gate="employees", category="hr",
               probe={"type": "collection", "name": "employees"}),
    ModuleSpec("wallet", "المحفظة", "Portefeuille",
               ["/api/wallet", "/api/transactions"],
               ["wallets", "transactions"], gate="wallet", category="finance",
               probe={"type": "collection", "name": "wallets"}),
    ModuleSpec("partners", "الشركاء والوكلاء", "Partenaires & Agents",
               ["/api/partners"], ["partners"], gate="partners", category="hr",
               probe={"type": "collection", "name": "partners"}),

    # ---------------- gated: verticals ----------------
    ModuleSpec("restaurant", "المطعم", "Restaurant",
               ["/api/restaurant"],
               ["restaurant_tables", "kitchen_orders"], gate="restaurant", category="restaurant",
               probe={"type": "collection", "name": "restaurant_tables"}),
    # p340: شاشات العرض لكل الأنشطة (p329/p332) — بادئات أطول من /api/restaurant تُطابق أولًا
    ModuleSpec("display", "شاشات العرض TV", "Écrans TV",
               ["/api/restaurant/screens", "/api/restaurant/public/screens",
                "/api/restaurant/public/catalog-board"],
               ["display_screens"], gate=None, category="restaurant",
               probe={"type": "collection", "name": "display_screens"}),
    ModuleSpec("screen_recording", "تسجيل شاشة الكاشير", "Enregistrement écran",
               ["/api/screen-recording"], ["screen_recording_devices"],
               gate="screen_recording", category="core",
               probe={"type": "collection", "name": "screen_recording_devices"}),
    ModuleSpec("production", "الإنتاج", "Production",
               ["/api/production"], ["production_recipes"], gate="production",
               category="commerce", probe={"type": "collection", "name": "production_recipes"}),
    ModuleSpec("rental", "الكراء", "Location",
               ["/api/rentals"], ["rentals"], gate="rental", category="commerce",
               probe={"type": "collection", "name": "rentals"}),
    ModuleSpec("repairs", "الصيانة والإصلاح", "Réparations",
               ["/api/repairs", "/api/spare-parts", "/api/serials"],
               ["repair_tickets", "spare_parts"], gate="maintenance", category="maintenance",
               probe={"type": "collection", "name": "repair_tickets"}),

    # ---------------- gated: telecom & digital ----------------
    ModuleSpec("recharge", "التعبئة والشرائح", "Recharge & SIM",
               ["/api/recharge", "/api/recharges", "/api/sim", "/api/idoom", "/api/cards"],
               ["mobile_recharge_tasks", "sim_slots", "idoom_codes"], gate="recharge",
               category="telecom", probe={"type": "collection", "name": "sim_slots"}),
    ModuleSpec("digital", "الخدمات الرقمية", "Services numériques",
               ["/api/digital", "/api/digital-panel"],
               ["digital_subscriptions"], gate="digital_services", category="telecom",
               probe={"type": "collection", "name": "digital_subscriptions"}),

    # ---------------- gated: e-commerce ----------------
    ModuleSpec("ecommerce", "التجارة الإلكترونية", "E-commerce",
               ["/api/ecom", "/api/ecom-workers", "/api/store", "/api/shop",
                "/api/orders", "/api/shipping", "/api/track", "/api/driver",
                "/api/delivery", "/api/woocommerce", "/api/marketplace",
                "/api/webhooks", "/api/marketing"],
               ["ecom_orders", "ecom_leads"], gate="ecommerce_hub", category="ecommerce",
               probe={"type": "collection", "name": "ecom_orders"}),

    # ---------------- gated: communication & AI ----------------
    ModuleSpec("whatsapp", "واتساب", "WhatsApp",
               ["/api/whatsapp", "/api/integrations/whatsapp"], [], gate="whatsapp",
               category="communication",
               probe={"type": "http", "path": "/api/whatsapp/settings", "expect": [200, 401, 403]},
               aliases=["whatsapp_integration"]),
    ModuleSpec("sms", "الرسائل القصيرة", "SMS",
               ["/api/sms"], [], gate="sms", category="communication",
               probe={"type": "http", "path": "/api/sms/settings", "expect": [200, 401, 403]}),
    ModuleSpec("ai", "الذكاء الاصطناعي", "Intelligence Artificielle",
               ["/api/ai", "/api/ai-assistant", "/api/smart", "/api/ocr"],
               ["ai_insights", "chat_sessions"], gate="ai_bots", category="ai",
               probe={"type": "http", "path": "/api/ocr/extract-models", "expect": [200, 401, 403, 404]}),
]

for _component in COMPONENTS:
    register(_component)


def all_components() -> list[ModuleSpec]:
    return list(COMPONENTS)


def gates_catalog() -> list[dict]:
    """كل البوابات الفريدة مع الوحدات التابعة لكل بوابة"""
    out = {}
    for c in COMPONENTS:
        if c.gate:
            out.setdefault(c.gate, []).append(c.key)
    return [{"gate": g, "modules": sorted(m)} for g, m in sorted(out.items())]


def component_for_path(path: str) -> ModuleSpec | None:
    """Longest-prefix ownership: أطول بادئة تطابق تملك المسار"""
    best, best_len = None, -1
    for c in COMPONENTS:
        for p in c.prefixes:
            if path == p or path.startswith(p + "/") or (p.endswith(".png") and path == p):
                if len(p) > best_len:
                    best, best_len = c, len(p)
    return best
