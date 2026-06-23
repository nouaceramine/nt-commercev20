"""
NT Commerce Models - 24 Collections
Tenants, Agents, Plans, Wallet, Subscriptions, Features, Roles
"""
from pydantic import BaseModel
from typing import Optional, List, Dict


class Tenant(BaseModel):
    id: str = ""
    name: str = ""
    company_name: Optional[str] = None
    email: str = ""
    phone: Optional[str] = None
    password: str = ""
    plan_id: str = ""
    plan_name: str = ""
    subscription_type: str = "monthly"
    subscription_start: Optional[str] = None
    subscription_end: Optional[str] = None
    is_active: bool = True
    is_trial: bool = False
    features: Dict = {}
    limits: Dict = {}
    wallet_balance: float = 0
    subdomain: Optional[str] = None
    database_name: str = ""
    settings: Dict = {}
    language: str = "ar"
    created_at: Optional[str] = None

class Agent(BaseModel):
    id: str = ""
    name: str = ""
    email: str = ""
    phone: Optional[str] = None
    password: str = ""
    parent_agent_id: Optional[str] = None
    level: int = 1
    commission_rate: float = 0
    wallet_balance: float = 0
    total_earnings: float = 0
    children_count: int = 0
    tenants_count: int = 0
    is_active: bool = True
    created_at: Optional[str] = None

class Plan(BaseModel):
    id: str = ""
    name_ar: str = ""
    name_fr: str = ""
    description_ar: str = ""
    description_fr: str = ""
    price_monthly: float = 0
    price_yearly: float = 0
    features: Dict = {}
    limits: Dict = {}
    is_active: bool = True

class Wallet(BaseModel):
    id: str = ""
    entity_type: str = ""
    entity_id: str = ""
    balance: float = 0
    currency: str = "DZD"

class WalletTransaction(BaseModel):
    id: str = ""
    wallet_id: str = ""
    transaction_type: str = ""
    amount: float = 0
    balance_before: float = 0
    balance_after: float = 0
    reference_type: str = ""
    reference_id: str = ""
    status: str = "completed"

class WalletTransfer(BaseModel):
    id: str = ""
    transfer_number: str = ""
    from_entity_type: str = ""
    from_entity_id: str = ""
    to_entity_type: str = ""
    to_entity_id: str = ""
    amount: float = 0
    fee: float = 0
    net_amount: float = 0
    status: str = "completed"

class FlexyRecharge(BaseModel):
    id: str = ""
    tenant_id: str = ""
    method: str = ""
    phone_number: str = ""
    amount: float = 0
    cost: float = 0
    profit: float = 0
    status: str = "completed"

class SimSlot(BaseModel):
    id: int = 0
    operator: str = ""
    operator_code: str = ""
    phone: str = ""
    balance: float = 0
    is_active: bool = True

class AgentCommission(BaseModel):
    id: str = ""
    agent_id: str = ""
    commission_type: str = ""
    amount: float = 0
    rate: float = 0
    source_type: str = ""
    source_id: str = ""
    status: str = "pending"

class AgentTree(BaseModel):
    id: str = ""
    agent_id: str = ""
    parent_id: Optional[str] = None
    level: int = 0
    path: str = ""
    children_count: int = 0

class TenantFeature(BaseModel):
    id: str = ""
    tenant_id: str = ""
    feature_code: str = ""
    is_enabled: bool = True
    settings: Dict = {}

class FeatureToggle(BaseModel):
    id: str = ""
    feature_code: str = ""
    name_ar: str = ""
    name_fr: str = ""
    description_ar: str = ""
    description_fr: str = ""
    category: str = ""
    default_enabled: bool = False
    is_core: bool = False

class SubscriptionHistory(BaseModel):
    id: str = ""
    tenant_id: str = ""
    old_plan_id: Optional[str] = None
    new_plan_id: str = ""
    change_type: str = ""
    amount: float = 0
    payment_method: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class PaymentMethod(BaseModel):
    id: str = ""
    code: str = ""
    name_ar: str = ""
    name_fr: str = ""
    type: str = ""
    icon: Optional[str] = None
    is_active: bool = True

class RechargeProvider(BaseModel):
    id: str = ""
    name: str = ""
    name_ar: str = ""
    name_fr: str = ""
    api_url: str = ""
    commission_rate: float = 0
    is_active: bool = True

class Role(BaseModel):
    id: str = ""
    name_ar: str = ""
    name_fr: str = ""
    description_ar: str = ""
    description_fr: str = ""
    is_system: bool = False

class RolePermission(BaseModel):
    id: str = ""
    role_id: str = ""
    permission_key: str = ""
    is_allowed: bool = True
