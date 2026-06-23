"""SaaS Schemas - Pydantic models for SaaS routes"""
from typing import List, Optional
from pydantic import BaseModel, Field


class PlanFeatures(BaseModel):
    max_products: int = 100
    max_users: int = 3
    max_warehouses: int = 1
    has_pos: bool = True
    has_inventory: bool = True
    has_reports: bool = True
    has_multi_warehouse: bool = False
    has_api_access: bool = False
    has_ecommerce: bool = False
    has_woocommerce: bool = False
    has_advanced_reports: bool = False
    has_employee_management: bool = False
    has_debt_management: bool = True
    has_customer_loyalty: bool = False
    has_supplier_management: bool = True
    has_email_notifications: bool = False
    has_sms_notifications: bool = False


class PlanCreate(BaseModel):
    name: str
    name_ar: str = ""
    description: str = ""
    description_ar: str = ""
    monthly_price: float = 0
    yearly_price: float = 0
    six_month_price: float = 0
    features: PlanFeatures = Field(default_factory=PlanFeatures)
    is_active: bool = True
    sort_order: int = 0
    is_popular: bool = False
    badge: str = ""
    badge_ar: str = ""
    commission_rate: float = 10.0


class PlanUpdate(BaseModel):
    name: Optional[str] = None
    name_ar: Optional[str] = None
    description: Optional[str] = None
    description_ar: Optional[str] = None
    monthly_price: Optional[float] = None
    yearly_price: Optional[float] = None
    six_month_price: Optional[float] = None
    features: Optional[PlanFeatures] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    is_popular: Optional[bool] = None
    badge: Optional[str] = None
    badge_ar: Optional[str] = None
    commission_rate: Optional[float] = None


class PlanResponse(BaseModel):
    id: str
    name: str
    name_ar: str = ""
    description: str = ""
    description_ar: str = ""
    monthly_price: float = 0
    yearly_price: float = 0
    six_month_price: float = 0
    features: dict = {}
    is_active: bool = True
    sort_order: int = 0
    is_popular: bool = False
    badge: str = ""
    badge_ar: str = ""
    commission_rate: float = 10.0
    created_at: Optional[str] = None


class TenantStats(BaseModel):
    products: int = 0
    users: int = 0
    sales: int = 0


class TenantCreate(BaseModel):
    name: str
    email: str
    password: str
    phone: str = ""
    company_name: str = ""
    plan_id: str
    subscription_type: str = "monthly"
    agent_id: Optional[str] = None
    business_type: str = "retailer"
    role: str = "admin"


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    company_name: Optional[str] = None
    plan_id: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None
    features_override: Optional[dict] = None
    limits_override: Optional[dict] = None
    recharge_mode: Optional[str] = None
    self_bridge_url: Optional[str] = None
    self_bridge_api_key: Optional[str] = None


class TenantResponse(BaseModel):
    id: str
    name: str
    email: str
    phone: str = ""
    company_name: str = ""
    plan_id: Optional[str] = None
    plan_name: str = ""
    agent_id: Optional[str] = None
    agent_name: str = ""
    is_active: bool = True
    is_trial: bool = False
    trial_ends_at: Optional[str] = None
    subscription_type: str = "monthly"
    subscription_starts_at: Optional[str] = None
    subscription_ends_at: Optional[str] = None
    features_override: dict = {}
    limits_override: dict = {}
    notes: str = ""
    stats: TenantStats = Field(default_factory=TenantStats)
    business_type: str = "retailer"
    database_initialized: bool = False
    created_at: Optional[str] = None
    recharge_mode: str = "owner_bridge"
    self_bridge_url: str = ""
    self_bridge_api_key: str = ""

    class Config:
        from_attributes = True


class SubscriptionPayment(BaseModel):
    amount: float
    payment_method: str = "cash"
    subscription_type: str = "monthly"
    notes: str = ""
    transaction_id: str = ""


class SubscriptionPaymentResponse(BaseModel):
    id: str
    tenant_id: str
    tenant_name: str = ""
    amount: float
    payment_method: str = "cash"
    subscription_type: str = "monthly"
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    notes: str = ""
    transaction_id: str = ""
    created_by: str = ""
    created_at: Optional[str] = None


class AgentPermissions(BaseModel):
    can_view_tenants: bool = True
    can_create_tenants: bool = False
    can_edit_tenants: bool = False
    can_delete_tenants: bool = False
    can_view_reports: bool = True
    can_export_reports: bool = False
    can_view_subscriptions: bool = True
    can_edit_subscriptions: bool = False
    can_manage_plans: bool = False
    can_view_payments: bool = True
    can_collect_payments: bool = False
    can_manage_payouts: bool = False
    can_provide_support: bool = True
    can_create_sub_agents: bool = False
    can_manage_sub_agents: bool = False
    can_view_system_stats: bool = False
    can_manage_features: bool = False


class AgentCreate(BaseModel):
    name: str
    email: str
    password: str
    phone: str = ""
    agent_type: str = "assistant"
    commission_rate: float = 10.0
    region: str = ""
    permissions: Optional[dict] = None
    assigned_tenant_ids: List[str] = []
    notes: str = ""
    is_active: bool = True


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    agent_type: Optional[str] = None
    commission_rate: Optional[float] = None
    region: Optional[str] = None
    permissions: Optional[dict] = None
    assigned_tenant_ids: Optional[List[str]] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class AgentResponse(BaseModel):
    id: str
    name: str
    email: str
    phone: str = ""
    agent_type: str = "assistant"
    commission_rate: float = 10.0
    region: str = ""
    permissions: dict = {}
    assigned_tenant_ids: list = []
    total_earnings: float = 0
    pending_earnings: float = 0
    paid_earnings: float = 0
    tenants_count: int = 0
    notes: str = ""
    is_active: bool = True
    level_id: Optional[str] = None
    parent_agent_id: Optional[str] = None
    created_at: Optional[str] = None


class AgentTransactionCreate(BaseModel):
    type: str
    amount: float
    tenant_id: Optional[str] = None
    notes: str = ""


class AgentTransactionResponse(BaseModel):
    id: str
    agent_id: str
    type: str
    amount: float
    tenant_id: Optional[str] = None
    tenant_name: str = ""
    notes: str = ""
    created_at: Optional[str] = None


class AgentLoginRequest(BaseModel):
    email: str
    password: str
