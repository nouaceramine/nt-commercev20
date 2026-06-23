"""
Pydantic Models for NT Commerce API
All data models used across the application
"""
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional, Literal

# ============ USER MODELS ============

class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    role: str = "user"
    permissions: Optional[dict] = None
    tenant_id: Optional[str] = None  # For multi-tenant

class UserLogin(BaseModel):
    email: str
    password: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    permissions: Optional[dict] = None

class PasswordUpdate(BaseModel):
    new_password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    role: str
    permissions: dict = {}
    tenant_id: Optional[str] = None
    user_type: Optional[str] = None
    company_name: Optional[str] = None
    features: Optional[dict] = None
    limits: Optional[dict] = None
    created_at: Optional[str] = None

# ============ SAAS MODELS ============

class PlanCreate(BaseModel):
    name: str
    name_ar: str
    description: str = ""
    description_ar: str = ""
    price_monthly: float
    price_6months: float
    price_yearly: float
    features: dict = {}  # {"pos": True, "reports": True, "ai_tips": False, ...}
    limits: dict = {}  # {"max_products": 100, "max_users": 5, "max_sales_per_month": 500}
    is_active: bool = True
    is_popular: bool = False
    sort_order: int = 0

class PlanUpdate(BaseModel):
    name: Optional[str] = None
    name_ar: Optional[str] = None
    description: Optional[str] = None
    description_ar: Optional[str] = None
    price_monthly: Optional[float] = None
    price_6months: Optional[float] = None
    price_yearly: Optional[float] = None
    features: Optional[dict] = None
    limits: Optional[dict] = None
    is_active: Optional[bool] = None
    is_popular: Optional[bool] = None
    sort_order: Optional[int] = None

class PlanResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    name_ar: str
    description: str = ""
    description_ar: str = ""
    price_monthly: float
    price_6months: float
    price_yearly: float
    features: dict = {}
    limits: dict = {}
    is_active: bool = True
    is_popular: bool = False
    sort_order: int = 0
    created_at: str = ""

class TenantCreate(BaseModel):
    name: str
    email: str
    phone: Optional[str] = ""
    password: str
    company_name: Optional[str] = ""
    plan_id: str
    agent_id: Optional[str] = None  # الوكيل المسؤول
    subscription_type: str = "monthly"  # monthly, 6months, yearly
    business_type: Optional[str] = "retailer"  # retailer, wholesaler, distributor
    role: Optional[str] = "admin"  # admin, manager, seller, etc.
    notes: Optional[str] = ""

class TenantUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    company_name: Optional[str] = None
    is_active: Optional[bool] = None
    plan_id: Optional[str] = None
    agent_id: Optional[str] = None
    features_override: Optional[dict] = None  # Override plan features
    limits_override: Optional[dict] = None  # Override plan limits
    notes: Optional[str] = None
    business_type: Optional[str] = None

class TenantResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    email: str
    phone: str = ""
    company_name: str = ""
    plan_id: str
    plan_name: Optional[str] = ""
    agent_id: Optional[str] = None
    agent_name: Optional[str] = ""
    is_active: bool = True
    is_trial: bool = False
    trial_ends_at: Optional[str] = None
    subscription_type: str = "monthly"
    subscription_starts_at: str = ""
    subscription_ends_at: str = ""
    features_override: dict = {}
    limits_override: dict = {}
    notes: str = ""
    stats: Optional[dict] = None
    business_type: Optional[str] = "retailer"
    database_initialized: bool = False
    created_at: str = ""

# ============ AGENT/RESELLER MODELS ============

class AgentCreate(BaseModel):
    name: str
    email: str
    password: str
    phone: str
    company_name: Optional[str] = ""
    address: Optional[str] = ""
    commission_percent: float = 10.0  # نسبة العمولة المئوية
    commission_fixed: float = 0.0  # عمولة ثابتة لكل اشتراك
    credit_limit: float = 100000.0  # حد الدين المسموح
    notes: Optional[str] = ""

class AgentUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    company_name: Optional[str] = None
    address: Optional[str] = None
    commission_percent: Optional[float] = None
    commission_fixed: Optional[float] = None
    credit_limit: Optional[float] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None

class AgentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    email: str
    phone: str
    company_name: str
    address: str
    commission_percent: float
    commission_fixed: float
    credit_limit: float
    current_balance: float  # الرصيد الحالي (سالب = دين)
    total_earnings: float  # إجمالي العمولات
    is_active: bool
    tenants_count: Optional[int] = 0
    notes: str
    created_at: str

class AgentTransaction(BaseModel):
    agent_id: str
    amount: float
    transaction_type: str  # payment, commission, subscription_sale, refund
    description: str
    reference_id: Optional[str] = ""  # مرجع (مثل tenant_id)
    notes: Optional[str] = ""

class AgentTransactionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    agent_id: str
    agent_name: Optional[str] = ""
    amount: float
    transaction_type: str
    description: str
    reference_id: str
    balance_after: float
    notes: str
    created_by: str
    created_at: str

class SubscriptionPayment(BaseModel):
    tenant_id: str
    amount: float
    payment_method: str  # manual, stripe, paypal
    subscription_type: str  # monthly, 6months, yearly
    notes: Optional[str] = ""
    transaction_id: Optional[str] = ""

class SubscriptionPaymentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    tenant_id: str
    tenant_name: Optional[str] = ""
    amount: float
    payment_method: str
    subscription_type: str
    period_start: str
    period_end: str
    notes: str
    transaction_id: str
    created_by: str
    created_at: str

# Default Permissions for each role
DEFAULT_PERMISSIONS = {
    "super_admin": {
        "dashboard": True,
        "pos": True,
        "products": {"view": True, "add": True, "edit": True, "delete": True, "price_change": True, "stock_adjust": True},
        "inventory": {"view": True, "add": True, "edit": True, "delete": True, "transfer": True, "count": True},
        "purchases": {"view": True, "add": True, "edit": True, "delete": True, "approve": True},
        "sales": {"view": True, "add": True, "edit": True, "delete": True, "refund": True, "discount": True},
        "customers": {"view": True, "add": True, "edit": True, "delete": True, "credit": True, "blacklist": True},
        "suppliers": {"view": True, "add": True, "edit": True, "delete": True, "payments": True},
        "employees": {"view": True, "add": True, "edit": True, "delete": True, "salary": True, "attendance": True},
        "debts": {"view": True, "add": True, "edit": True, "delete": True, "collect": True},
        "expenses": {"view": True, "add": True, "edit": True, "delete": True, "approve": True},
        "repairs": {"view": True, "add": True, "edit": True, "delete": True},
        "reports": {"sales": True, "inventory": True, "financial": True, "customers": True, "employees": True, "advanced": True},
        "settings": True,
        "users": {"view": True, "add": True, "edit": True, "delete": True, "permissions": True},
        "recharge": True,
        "api_keys": True,
        "factory_reset": True,
        "woocommerce": True,
        "delivery": True,
        "loyalty": True,
        "notifications": True,
        "maintenance": True,
        "saas_admin": True
    },
    "admin": {
        "dashboard": True,
        "pos": True,
        "products": {"view": True, "add": True, "edit": True, "delete": True, "price_change": True, "stock_adjust": True},
        "inventory": {"view": True, "add": True, "edit": True, "delete": True, "transfer": True, "count": True},
        "purchases": {"view": True, "add": True, "edit": True, "delete": True, "approve": True},
        "sales": {"view": True, "add": True, "edit": True, "delete": True, "refund": True, "discount": True},
        "customers": {"view": True, "add": True, "edit": True, "delete": True, "credit": True, "blacklist": True},
        "suppliers": {"view": True, "add": True, "edit": True, "delete": True, "payments": True},
        "employees": {"view": True, "add": True, "edit": True, "delete": True, "salary": True, "attendance": True},
        "debts": {"view": True, "add": True, "edit": True, "delete": True, "collect": True},
        "expenses": {"view": True, "add": True, "edit": True, "delete": True, "approve": True},
        "repairs": {"view": True, "add": True, "edit": True, "delete": True},
        "reports": {"sales": True, "inventory": True, "financial": True, "customers": True, "employees": True, "advanced": True},
        "settings": True,
        "users": {"view": True, "add": True, "edit": True, "delete": True, "permissions": True},
        "recharge": True,
        "api_keys": True,
        "factory_reset": True,
        "woocommerce": True,
        "delivery": True,
        "loyalty": True,
        "notifications": True,
        "maintenance": True
    },
    "manager": {
        "dashboard": True,
        "pos": True,
        "products": {"view": True, "add": True, "edit": True, "delete": False, "price_change": False, "stock_adjust": True},
        "inventory": {"view": True, "add": True, "edit": True, "delete": False, "transfer": True, "count": True},
        "purchases": {"view": True, "add": True, "edit": True, "delete": False, "approve": False},
        "sales": {"view": True, "add": True, "edit": True, "delete": False, "refund": True, "discount": True},
        "customers": {"view": True, "add": True, "edit": True, "delete": False, "credit": True, "blacklist": False},
        "suppliers": {"view": True, "add": True, "edit": False, "delete": False, "payments": True},
        "employees": {"view": True, "add": False, "edit": False, "delete": False, "salary": False, "attendance": True},
        "debts": {"view": True, "add": True, "edit": True, "delete": False, "collect": True},
        "expenses": {"view": True, "add": True, "edit": True, "delete": False, "approve": False},
        "repairs": {"view": True, "add": True, "edit": True, "delete": False},
        "reports": {"sales": True, "inventory": True, "financial": False, "customers": True, "employees": False, "advanced": False},
        "settings": False,
        "users": {"view": True, "add": False, "edit": False, "delete": False, "permissions": False},
        "recharge": True,
        "api_keys": False,
        "factory_reset": False,
        "woocommerce": False,
        "delivery": True,
        "loyalty": True,
        "notifications": True,
        "maintenance": False
    },
    "sales_supervisor": {
        "dashboard": True,
        "pos": True,
        "products": {"view": True, "add": False, "edit": False, "delete": False, "price_change": False, "stock_adjust": False},
        "inventory": {"view": True, "add": False, "edit": False, "delete": False, "transfer": False, "count": False},
        "purchases": {"view": False, "add": False, "edit": False, "delete": False, "approve": False},
        "sales": {"view": True, "add": True, "edit": True, "delete": False, "refund": True, "discount": True},
        "customers": {"view": True, "add": True, "edit": True, "delete": False, "credit": True, "blacklist": False},
        "suppliers": {"view": False, "add": False, "edit": False, "delete": False, "payments": False},
        "employees": {"view": False, "add": False, "edit": False, "delete": False, "salary": False, "attendance": False},
        "debts": {"view": True, "add": True, "edit": True, "delete": False, "collect": True},
        "expenses": {"view": False, "add": False, "edit": False, "delete": False, "approve": False},
        "repairs": {"view": True, "add": True, "edit": True, "delete": False},
        "reports": {"sales": True, "inventory": False, "financial": False, "customers": True, "employees": False, "advanced": False},
        "settings": False,
        "users": {"view": False, "add": False, "edit": False, "delete": False, "permissions": False},
        "recharge": True,
        "api_keys": False,
        "factory_reset": False,
        "woocommerce": False,
        "delivery": True,
        "loyalty": False,
        "notifications": True,
        "maintenance": False
    },
    "seller": {
        "dashboard": True,
        "pos": True,
        "products": {"view": True, "add": False, "edit": False, "delete": False, "price_change": False, "stock_adjust": False},
        "inventory": {"view": True, "add": False, "edit": False, "delete": False, "transfer": False, "count": False},
        "purchases": {"view": False, "add": False, "edit": False, "delete": False, "approve": False},
        "sales": {"view": True, "add": True, "edit": False, "delete": False, "refund": False, "discount": False},
        "customers": {"view": True, "add": True, "edit": False, "delete": False, "credit": False, "blacklist": False},
        "suppliers": {"view": False, "add": False, "edit": False, "delete": False, "payments": False},
        "employees": {"view": False, "add": False, "edit": False, "delete": False, "salary": False, "attendance": False},
        "debts": {"view": True, "add": False, "edit": False, "delete": False, "collect": False},
        "expenses": {"view": False, "add": False, "edit": False, "delete": False, "approve": False},
        "repairs": {"view": True, "add": True, "edit": False, "delete": False},
        "reports": {"sales": False, "inventory": False, "financial": False, "customers": False, "employees": False, "advanced": False},
        "settings": False,
        "users": {"view": False, "add": False, "edit": False, "delete": False, "permissions": False},
        "recharge": True,
        "api_keys": False,
        "factory_reset": False,
        "woocommerce": False,
        "delivery": False,
        "loyalty": False,
        "notifications": False,
        "maintenance": False
    },
    "inventory_manager": {
        "dashboard": True,
        "pos": False,
        "products": {"view": True, "add": True, "edit": True, "delete": False, "price_change": False, "stock_adjust": True},
        "inventory": {"view": True, "add": True, "edit": True, "delete": True, "transfer": True, "count": True},
        "purchases": {"view": True, "add": True, "edit": True, "delete": False, "approve": False},
        "sales": {"view": True, "add": False, "edit": False, "delete": False, "refund": False, "discount": False},
        "customers": {"view": False, "add": False, "edit": False, "delete": False, "credit": False, "blacklist": False},
        "suppliers": {"view": True, "add": True, "edit": True, "delete": False, "payments": False},
        "employees": {"view": False, "add": False, "edit": False, "delete": False, "salary": False, "attendance": False},
        "debts": {"view": False, "add": False, "edit": False, "delete": False, "collect": False},
        "expenses": {"view": False, "add": False, "edit": False, "delete": False, "approve": False},
        "repairs": {"view": True, "add": True, "edit": True, "delete": False},
        "reports": {"sales": False, "inventory": True, "financial": False, "customers": False, "employees": False, "advanced": False},
        "settings": False,
        "users": {"view": False, "add": False, "edit": False, "delete": False, "permissions": False},
        "recharge": False,
        "api_keys": False,
        "factory_reset": False,
        "woocommerce": False,
        "delivery": False,
        "loyalty": False,
        "notifications": True,
        "maintenance": True
    },
    "ecommerce_manager": {
        "dashboard": True,
        "pos": False,
        "products": {"view": True, "add": True, "edit": True, "delete": False, "price_change": True, "stock_adjust": False},
        "inventory": {"view": True, "add": False, "edit": False, "delete": False, "transfer": False, "count": False},
        "purchases": {"view": False, "add": False, "edit": False, "delete": False, "approve": False},
        "sales": {"view": True, "add": False, "edit": False, "delete": False, "refund": False, "discount": False},
        "customers": {"view": True, "add": True, "edit": True, "delete": False, "credit": False, "blacklist": False},
        "suppliers": {"view": False, "add": False, "edit": False, "delete": False, "payments": False},
        "employees": {"view": False, "add": False, "edit": False, "delete": False, "salary": False, "attendance": False},
        "debts": {"view": True, "add": False, "edit": False, "delete": False, "collect": False},
        "expenses": {"view": False, "add": False, "edit": False, "delete": False, "approve": False},
        "repairs": {"view": False, "add": False, "edit": False, "delete": False},
        "reports": {"sales": True, "inventory": True, "financial": False, "customers": True, "employees": False, "advanced": False},
        "settings": False,
        "users": {"view": False, "add": False, "edit": False, "delete": False, "permissions": False},
        "recharge": False,
        "api_keys": False,
        "factory_reset": False,
        "woocommerce": True,
        "delivery": True,
        "loyalty": True,
        "notifications": True,
        "maintenance": False
    },
    "accountant": {
        "dashboard": True,
        "pos": False,
        "products": {"view": True, "add": False, "edit": False, "delete": False, "price_change": False, "stock_adjust": False},
        "inventory": {"view": True, "add": False, "edit": False, "delete": False, "transfer": False, "count": False},
        "purchases": {"view": True, "add": False, "edit": False, "delete": False, "approve": True},
        "sales": {"view": True, "add": False, "edit": False, "delete": False, "refund": False, "discount": False},
        "customers": {"view": True, "add": False, "edit": False, "delete": False, "credit": False, "blacklist": False},
        "suppliers": {"view": True, "add": False, "edit": False, "delete": False, "payments": True},
        "employees": {"view": True, "add": False, "edit": False, "delete": False, "salary": True, "attendance": False},
        "debts": {"view": True, "add": True, "edit": True, "delete": False, "collect": True},
        "expenses": {"view": True, "add": True, "edit": True, "delete": True, "approve": True},
        "repairs": {"view": True, "add": False, "edit": False, "delete": False},
        "reports": {"sales": True, "inventory": True, "financial": True, "customers": True, "employees": True, "advanced": True},
        "settings": False,
        "users": {"view": False, "add": False, "edit": False, "delete": False, "permissions": False},
        "recharge": False,
        "api_keys": False,
        "factory_reset": False,
        "woocommerce": False,
        "delivery": False,
        "loyalty": False,
        "notifications": True,
        "maintenance": False
    },
    "user": {
        "dashboard": True,
        "pos": False,
        "products": {"view": True, "add": False, "edit": False, "delete": False, "price_change": False, "stock_adjust": False},
        "inventory": {"view": False, "add": False, "edit": False, "delete": False, "transfer": False, "count": False},
        "purchases": {"view": False, "add": False, "edit": False, "delete": False, "approve": False},
        "sales": {"view": True, "add": False, "edit": False, "delete": False, "refund": False, "discount": False},
        "customers": {"view": False, "add": False, "edit": False, "delete": False, "credit": False, "blacklist": False},
        "suppliers": {"view": False, "add": False, "edit": False, "delete": False, "payments": False},
        "employees": {"view": False, "add": False, "edit": False, "delete": False, "salary": False, "attendance": False},
        "debts": {"view": False, "add": False, "edit": False, "delete": False, "collect": False},
        "expenses": {"view": False, "add": False, "edit": False, "delete": False, "approve": False},
        "repairs": {"view": False, "add": False, "edit": False, "delete": False},
        "reports": {"sales": False, "inventory": False, "financial": False, "customers": False, "employees": False, "advanced": False},
        "settings": False,
        "users": {"view": False, "add": False, "edit": False, "delete": False, "permissions": False},
        "recharge": False,
        "api_keys": False,
        "factory_reset": False,
        "woocommerce": False,
        "delivery": False,
        "loyalty": False,
        "notifications": False,
        "maintenance": False
    }
}

# Role descriptions for UI
ROLE_DESCRIPTIONS = {
    "super_admin": {"ar": "سوبر أدمين - صلاحيات كاملة على النظام بالكامل", "fr": "Super Admin - Full system access"},
    "admin": {"ar": "مدير - صلاحيات كاملة على المتجر", "fr": "Admin - Full store access"},
    "manager": {"ar": "مشرف - إدارة العمليات اليومية", "fr": "Manager - Daily operations management"},
    "sales_supervisor": {"ar": "مشرف مبيعات - إشراف على المبيعات والعملاء", "fr": "Sales Supervisor - Sales and customer oversight"},
    "seller": {"ar": "بائع - عمليات البيع الأساسية فقط", "fr": "Seller - Basic sales operations only"},
    "inventory_manager": {"ar": "مدير مخزون - إدارة المخزون والمشتريات", "fr": "Inventory Manager - Stock and purchase management"},
    "ecommerce_manager": {"ar": "مسؤول متجر إلكتروني - إدارة المتجر الإلكتروني", "fr": "E-commerce Manager - Online store management"},
    "accountant": {"ar": "محاسب - التقارير المالية والديون والمصاريف", "fr": "Accountant - Financial reports, debts, and expenses"},
    "user": {"ar": "مستخدم - عرض فقط", "fr": "User - View only"}
}

# Permission categories for UI grouping
PERMISSION_CATEGORIES = {
    "sales_operations": {
        "ar": "عمليات المبيعات",
        "fr": "Opérations de vente",
        "permissions": ["pos", "sales", "customers", "debts"]
    },
    "inventory_operations": {
        "ar": "عمليات المخزون",
        "fr": "Opérations d'inventaire", 
        "permissions": ["products", "inventory", "purchases", "suppliers"]
    },
    "hr_operations": {
        "ar": "شؤون الموظفين",
        "fr": "Ressources humaines",
        "permissions": ["employees"]
    },
    "financial": {
        "ar": "العمليات المالية",
        "fr": "Opérations financières",
        "permissions": ["expenses", "reports"]
    },
    "system": {
        "ar": "إدارة النظام",
        "fr": "Gestion système",
        "permissions": ["settings", "users", "api_keys", "factory_reset"]
    },
    "services": {
        "ar": "الخدمات",
        "fr": "Services",
        "permissions": ["woocommerce", "delivery", "loyalty", "notifications", "maintenance", "repairs", "recharge"]
    }
}

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# ============ PRODUCT MODELS ============

class ProductCreate(BaseModel):
    name_en: str  # اسم المنتج (إلزامي)
    name_ar: Optional[str] = ""  # اسم عربي (اختياري)
    description_en: Optional[str] = ""
    description_ar: Optional[str] = ""
    purchase_price: Optional[float] = 0
    wholesale_price: Optional[float] = 0
    retail_price: Optional[float] = 0
    super_wholesale_price: Optional[float] = 0
    tariff_a: Optional[float] = 0
    tariff_b: Optional[float] = 0
    tariff_c: Optional[float] = 0
    tariff_d: Optional[float] = 0
    quantity: int = 0
    image_url: Optional[str] = ""
    compatible_models: List[str] = []
    low_stock_threshold: int = 10
    barcode: Optional[str] = ""
    article_code: Optional[str] = ""
    family_id: Optional[str] = None
    use_average_price: Optional[bool] = False
    # Stock
    unit_of_measure: Optional[str] = "U"
    storage_location: Optional[str] = ""
    qty_per_package: Optional[float] = 1
    is_non_stockable: Optional[bool] = False
    # Sales flags
    is_blocked: Optional[bool] = False
    fixed_price: Optional[bool] = False
    force_qty_entry: Optional[bool] = False
    force_price_entry: Optional[bool] = False
    serial_number_tracking: Optional[bool] = False
    # Extra
    tax_rate: Optional[float] = 0
    internal_notes: Optional[str] = ""
    additional_barcodes: Optional[List[str]] = []
    
    @field_validator('name_en')
    @classmethod
    def validate_name_en(cls, v) -> bool:
        if not v or not v.strip():
            raise ValueError('اسم المنتج مطلوب')
        # Remove HTML tags
        import re
        v = re.sub(r'<[^>]+>', '', v)
        v = v.strip()
        if len(v) > 255:
            raise ValueError('اسم المنتج يجب ألا يتجاوز 255 حرف')
        if len(v) < 2:
            raise ValueError('اسم المنتج يجب أن يكون حرفين على الأقل')
        return v
    
    @field_validator('name_ar')
    @classmethod
    def validate_name_ar(cls, v) -> bool:
        if v:
            import re
            v = re.sub(r'<[^>]+>', '', v)
            v = v.strip()
            if len(v) > 255:
                raise ValueError('الاسم العربي يجب ألا يتجاوز 255 حرف')
        return v or ""
    
    @field_validator('purchase_price', 'wholesale_price', 'retail_price', 'super_wholesale_price')
    @classmethod
    def validate_prices(cls, v) -> bool:
        if v is not None and v < 0:
            raise ValueError('السعر يجب أن يكون صفر أو أكثر')
        return v or 0
    
    @field_validator('quantity', 'low_stock_threshold')
    @classmethod
    def validate_quantity(cls, v) -> bool:
        if v is not None and v < 0:
            raise ValueError('الكمية يجب أن تكون صفر أو أكثر')
        return v or 0

class ProductUpdate(BaseModel):
    name_en: Optional[str] = None
    name_ar: Optional[str] = None
    description_en: Optional[str] = None
    description_ar: Optional[str] = None
    purchase_price: Optional[float] = None
    wholesale_price: Optional[float] = None
    retail_price: Optional[float] = None
    super_wholesale_price: Optional[float] = None
    quantity: Optional[int] = None
    image_url: Optional[str] = None
    compatible_models: Optional[List[str]] = None
    low_stock_threshold: Optional[int] = None
    barcode: Optional[str] = None
    article_code: Optional[str] = None  # كود المنتج
    family_id: Optional[str] = None
    use_average_price: Optional[bool] = None

class ProductResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name_en: str
    name_ar: str = ""
    description_en: str = ""
    description_ar: str = ""
    purchase_price: float = 0
    wholesale_price: float = 0
    retail_price: float = 0
    super_wholesale_price: float = 0
    quantity: int
    image_url: str = ""
    compatible_models: List[str] = []
    low_stock_threshold: int = 10
    barcode: str = ""
    article_code: str = ""  # كود المنتج
    family_id: str = ""
    family_name: str = ""
    use_average_price: bool = False
    last_purchase_date: Optional[str] = None  # تاريخ آخر شراء
    created_at: str = ""
    updated_at: str = ""

# ============ CUSTOMER MODELS ============

class CustomerCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    notes: Optional[str] = ""
    family_id: Optional[str] = None
    code: Optional[str] = ""  # كود الزبون CL00001
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v) -> bool:
        if not v or not v.strip():
            raise ValueError('اسم الزبون مطلوب')
        import re
        v = re.sub(r'<[^>]+>', '', v)
        v = v.strip()
        if len(v) > 255:
            raise ValueError('الاسم يجب ألا يتجاوز 255 حرف')
        if len(v) < 2:
            raise ValueError('الاسم يجب أن يكون حرفين على الأقل')
        return v
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v) -> bool:
        if v and v.strip():
            import re
            v = v.strip()
            if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', v):
                raise ValueError('البريد الإلكتروني غير صالح')
        return v or ""
    
    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v) -> bool:
        if v:
            v = v.strip()
            if len(v) > 20:
                raise ValueError('رقم الهاتف طويل جداً')
        return v or ""

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    family_id: Optional[str] = None
    code: Optional[str] = None

class CustomerResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    phone: str
    email: str
    address: str
    notes: str
    code: str = ""
    family_id: str = ""
    family_name: str = ""
    total_purchases: float = 0
    balance: float = 0  # رصيد الزبون (دين)
    created_at: str

# ============ SUPPLIER MODELS ============

class SupplierCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    notes: Optional[str] = ""
    family_id: Optional[str] = None
    code: Optional[str] = ""  # كود المورد FR00001
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v) -> bool:
        if not v or not v.strip():
            raise ValueError('اسم المورد مطلوب')
        import re
        v = re.sub(r'<[^>]+>', '', v)
        v = v.strip()
        if len(v) > 255:
            raise ValueError('الاسم يجب ألا يتجاوز 255 حرف')
        return v

class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    family_id: Optional[str] = None
    code: Optional[str] = None

class SupplierResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    phone: str
    email: str
    address: str
    notes: str
    code: str = ""
    family_id: str = ""
    family_name: str = ""
    total_purchases: float = 0
    balance: float = 0  # رصيد المورد (دين لهم)
    created_at: str

# ============ SALE MODELS ============

class SaleItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    product_id: Optional[str] = None
    product_name: str
    barcode: Optional[str] = ""
    quantity: int
    unit_price: float
    discount: float = 0
    purchase_price: Optional[float] = None
    total: float
    note: Optional[str] = ""

class DeliveryInfo(BaseModel):
    enabled: bool = False
    wilaya_code: Optional[str] = None
    wilaya_name: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    delivery_type: Literal["desk", "home"] = "desk"
    fee: float = 0

class InstallmentPlan(BaseModel):
    model_config = ConfigDict(extra="ignore")
    down_payment: float = 0
    installments_count: int = 3
    interest_rate: float = 0
    frequency: Literal["monthly", "weekly"] = "monthly"
    first_due_date: str

class SaleCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    customer_id: Optional[str] = None
    warehouse_id: Optional[str] = None
    items: List[SaleItem]
    subtotal: float = 0
    discount: float = 0
    total: float
    paid_amount: float = 0
    payment_method: Literal["cash", "bank", "wallet", "mixed"] = "cash"
    payment_type: Literal["cash", "credit", "partial", "installment", "mixed"] = "cash"
    notes: Optional[str] = ""
    delivery: Optional[DeliveryInfo] = None
    code: Optional[str] = ""
    installment_plan: Optional[InstallmentPlan] = None
    payment_details: Optional[dict] = None

class SaleResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    invoice_number: str
    code: str = ""  # كود البيع
    customer_id: Optional[str]
    customer_name: str
    items: List[SaleItem]
    subtotal: float
    discount: float
    delivery_fee: float = 0
    total: float
    paid_amount: float
    debt_amount: float = 0
    remaining: float
    payment_method: str
    payment_type: str = "cash"
    delivery: Optional[dict] = None
    status: str  # paid, partial, unpaid
    notes: str
    created_at: str
    created_by: str

# ============ PURCHASE MODELS ============

class PurchaseItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    product_id: Optional[str] = None
    product_name: str
    quantity: int
    unit_price: float
    total: float

class PurchaseCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    supplier_id: str
    items: List[PurchaseItem]
    total: float
    paid_amount: float = 0
    payment_method: Literal["cash", "bank", "wallet"] = "cash"
    payment_type: Optional[str] = "cash"
    notes: Optional[str] = ""
    code: Optional[str] = ""

class PurchaseResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    invoice_number: str
    code: str = ""  # كود الشراء
    supplier_id: str
    supplier_name: str
    items: List[PurchaseItem]
    total: float
    paid_amount: float
    remaining: float
    payment_method: str
    status: str
    notes: str
    created_at: str
    created_by: str

# ============ CASH BOX MODELS ============

class CashBoxResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    name_fr: str = ""
    type: str  # cash, bank, wallet
    balance: float
    updated_at: Optional[str] = None

class TransactionCreate(BaseModel):
    cash_box_id: str
    type: Literal["income", "expense", "transfer"]
    amount: float
    description: str
    reference_type: Optional[str] = None  # sale, purchase, manual
    reference_id: Optional[str] = None

class TransactionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    cash_box_id: str
    cash_box_name: str
    type: str
    amount: float
    balance_after: float
    description: str
    reference_type: str
    reference_id: str
    created_at: str
    created_by: str

# ============ EMPLOYEE MODELS ============

class EmployeeCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    position: Optional[str] = ""
    salary: float = 0
    hire_date: Optional[str] = None
    commission_rate: float = 0  # نسبة العمولة على المبيعات
    max_discount_percent: float = 0  # حد الخصم المسموح
    max_debt_amount: float = 0  # حد الدين المسموح

class EmployeeAlertSettings(BaseModel):
    employee_id: str
    enable_discount_alert: bool = True
    discount_threshold_percent: float = 80  # تنبيه عند الوصول لـ 80% من الحد
    enable_debt_alert: bool = True
    debt_threshold_percent: float = 80  # تنبيه عند الوصول لـ 80% من الحد

# ============ WAREHOUSE MODELS ============

class WarehouseCreate(BaseModel):
    name: str
    address: Optional[str] = ""
    phone: Optional[str] = ""
    manager: Optional[str] = ""
    notes: Optional[str] = ""
    is_main: bool = False

class WarehouseUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    manager: Optional[str] = None
    notes: Optional[str] = None
    is_main: Optional[bool] = None

class WarehouseResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    address: str = ""
    phone: str = ""
    manager: str = ""
    notes: str = ""
    is_main: bool
    created_at: str

class StockTransferCreate(BaseModel):
    from_warehouse: str
    to_warehouse: str
    product_id: str
    quantity: int

class StockTransferResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    from_warehouse: str
    from_warehouse_name: str
    to_warehouse: str
    to_warehouse_name: str
    product_id: str
    product_name: str
    quantity: int
    created_at: str

# ============ PRICE HISTORY MODELS ============

class PriceHistoryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    product_id: str
    product_name: str
    old_price: float
    new_price: float
    price_type: str  # purchase_price, wholesale_price, retail_price
    change_percent: float
    changed_by: str
    changed_by_name: str
    source: str  # manual, purchase, import
    notes: Optional[str] = ""
    created_at: str

# ============ INVENTORY SESSION MODELS ============

class InventorySessionCreate(BaseModel):
    name: str
    family_filter: Optional[str] = "all"
    status: str = "active"
    started_at: str
    counted_items: dict = {}
    code: Optional[str] = ""  # كود الجرد IN00001

class InventorySessionUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    completed_at: Optional[str] = None
    applied_changes: Optional[bool] = None
    counted_items: Optional[dict] = None
    code: Optional[str] = None

class InventorySessionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    code: str = ""
    family_filter: str
    status: str
    started_at: str
    completed_at: Optional[str] = None
    applied_changes: bool = False
    counted_items: dict = {}

class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    position: Optional[str] = None
    salary: Optional[float] = None
    commission_rate: Optional[float] = None

class EmployeeResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    phone: str
    email: str
    position: str
    salary: float
    hire_date: str
    commission_rate: float
    total_advances: float = 0
    total_commission: float = 0
    created_at: str

class AttendanceCreate(BaseModel):
    employee_id: str
    date: str
    status: Literal["present", "absent", "late", "leave"]
    notes: Optional[str] = ""

class AttendanceResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    employee_name: str
    date: str
    status: str
    notes: str

class AdvanceCreate(BaseModel):
    employee_id: str
    amount: float
    notes: Optional[str] = ""

class AdvanceResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    employee_name: str
    amount: float
    notes: str
    created_at: str

# ============ DEBT MODELS ============

class DebtCreate(BaseModel):
    type: Literal["receivable", "payable"]  # receivable = دين على زبون, payable = دين لمورد
    party_type: Literal["customer", "supplier"]
    party_id: str
    amount: float
    due_date: Optional[str] = None
    notes: Optional[str] = ""
    reference_type: Optional[str] = None  # sale, purchase
    reference_id: Optional[str] = None

class DebtPaymentCreate(BaseModel):
    debt_id: str
    amount: float
    payment_method: Literal["cash", "bank", "wallet"] = "cash"
    notes: Optional[str] = ""

class DebtResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    type: str
    party_type: str
    party_id: str
    party_name: str
    original_amount: float
    paid_amount: float
    remaining_amount: float
    due_date: str
    status: str  # pending, partial, paid, overdue
    notes: str
    reference_type: str
    reference_id: str
    created_at: str

class DebtPaymentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    debt_id: str
    amount: float
    payment_method: str
    notes: str
    created_at: str
    created_by: str

# ============ API KEY MODELS ============

class ApiKeyCreate(BaseModel):
    name: str
    type: Literal["internal", "external"]  # internal = للربط مع تطبيقات أخرى, external = خدمات خارجية
    service: Optional[str] = ""  # woocommerce, stripe, etc
    key_value: Optional[str] = ""
    secret_value: Optional[str] = ""
    endpoint_url: Optional[str] = ""
    permissions: List[str] = ["read"]

class ApiKeyResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    type: str
    service: str
    key_value: str
    key_preview: str  # آخر 4 أحرف فقط
    endpoint_url: str
    permissions: List[str]
    is_active: bool
    last_used: str
    created_at: str

# ============ RECHARGE MODELS ============

class RechargeCreate(BaseModel):
    operator: Literal["mobilis", "djezzy", "ooredoo", "idoom"]
    phone_number: str
    amount: float
    recharge_type: Literal["credit", "internet", "flexy"]  # credit=رصيد, internet=أنترنت, flexy=فليكسي
    customer_id: Optional[str] = None
    payment_method: Literal["cash", "bank", "wallet"] = "cash"
    notes: Optional[str] = ""

class RechargeResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    code: str = ""
    operator: str
    phone_number: str
    amount: float
    recharge_type: str
    cost: float  # سعر التكلفة
    profit: float  # الربح
    customer_id: str
    customer_name: str
    payment_method: str
    status: str  # pending, processing, success, failed
    ussd_code: str
    notes: str
    created_at: str
    created_by: str
    bridge_task_id: Optional[str] = None  # returned to frontend for status polling

# أكواد USSD وأسعار الشحن
RECHARGE_CONFIG = {
    "mobilis": {
        "name": "موبيليس",
        "name_en": "Mobilis",
        "prefix": ["06", "05"],
        "ussd": {
            "credit": "*600*{code}#",
            "internet": "*600*{code}#",
            "balance": "*600#"
        },
        "amounts": [100, 200, 500, 1000, 2000, 5000],
        "commission": 3  # نسبة العمولة %
    },
    "djezzy": {
        "name": "جازي",
        "name_en": "Djezzy",
        "prefix": ["07"],
        "ussd": {
            "credit": "*720*{code}#",
            "flexy": "*720*3*{phone}*{amount}#",
            "balance": "*720#"
        },
        "amounts": [100, 200, 500, 1000, 2000, 5000],
        "commission": 3
    },
    "ooredoo": {
        "name": "أوريدو",
        "name_en": "Ooredoo",
        "prefix": ["05"],
        "ussd": {
            "credit": "*888*{code}#",
            "internet": "*888*{code}#",
            "balance": "*888#"
        },
        "amounts": [100, 200, 500, 1000, 2000, 5000],
        "commission": 3
    },
    "idoom": {
        "name": "إيدوم ADSL",
        "name_en": "Idoom ADSL",
        "prefix": ["0"],
        "ussd": {
            "internet": "الدفع عبر الموقع أو الوكالة",
            "balance": "https://selfcare.algerietelecom.dz"
        },
        "amounts": [1000, 1500, 2000, 2500, 3000, 4000, 5000],
        "commission": 2
    }
}

# ============ PRODUCT FAMILY MODELS ============

class ProductFamilyCreate(BaseModel):
    name_en: str
    name_ar: str
    description_en: Optional[str] = ""
    description_ar: Optional[str] = ""
    parent_id: Optional[str] = None  # للعائلات الفرعية

class ProductFamilyUpdate(BaseModel):
    name_en: Optional[str] = None
    name_ar: Optional[str] = None
    description_en: Optional[str] = None
    description_ar: Optional[str] = None
    parent_id: Optional[str] = None

class ProductFamilyResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    code: str = ""
    name_en: str = ""
    name_ar: str = ""
    description_en: str = ""
    description_ar: str = ""
    parent_id: str = ""
    parent_name: str = ""
    product_count: int = 0
    created_at: str = ""

# ============ OCR & OTHER MODELS ============

class OCRRequest(BaseModel):
    image_base64: str

class OCRResponse(BaseModel):
    extracted_models: List[str]
    raw_text: str
