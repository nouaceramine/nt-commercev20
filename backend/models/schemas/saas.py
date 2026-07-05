from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional, Literal
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
