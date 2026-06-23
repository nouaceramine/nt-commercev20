"""
Accounting Models for NT Commerce AI-Powered Accounting Platform
All data models for accounting, invoices, journal entries, and financial reports
"""
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional, Literal
from datetime import datetime
from enum import Enum


# ============ ENUMS ============

class AccountType(str, Enum):
    ASSET = "asset"
    LIABILITY = "liability"
    EQUITY = "equity"
    REVENUE = "revenue"
    EXPENSE = "expense"


class TransactionStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    RECONCILED = "reconciled"


class InvoiceStatus(str, Enum):
    DRAFT = "draft"
    SENT = "sent"
    PAID = "paid"
    PARTIAL = "partial"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class PaymentStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    REFUNDED = "refunded"


# ============ CHART OF ACCOUNTS ============

class AccountCreate(BaseModel):
    code: str
    name: str
    name_ar: str
    account_type: AccountType
    parent_id: Optional[str] = None
    description: str = ""
    is_active: bool = True
    
    @field_validator('code')
    @classmethod
    def validate_code(cls, v) -> bool:
        if not v or not v.strip():
            raise ValueError('كود الحساب مطلوب')
        return v.strip()


class AccountResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    code: str
    name: str
    name_ar: str
    account_type: str
    parent_id: Optional[str] = None
    parent_name: str = ""
    description: str = ""
    balance: float = 0
    is_active: bool = True
    created_at: str


# ============ JOURNAL ENTRIES ============

class JournalEntryLineCreate(BaseModel):
    account_id: str
    account_code: str
    account_name: str
    debit: float = 0
    credit: float = 0
    description: str = ""


class JournalEntryCreate(BaseModel):
    date: str
    reference: str = ""
    description: str
    lines: List[JournalEntryLineCreate]
    attachments: List[str] = []
    
    @field_validator('lines')
    @classmethod
    def validate_lines(cls, v) -> bool:
        if len(v) < 2:
            raise ValueError('يجب أن يحتوي القيد على سطرين على الأقل')
        total_debit = sum(line.debit for line in v)
        total_credit = sum(line.credit for line in v)
        if abs(total_debit - total_credit) > 0.01:
            raise ValueError('مجموع المدين يجب أن يساوي مجموع الدائن')
        return v


class JournalEntryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    entry_number: str
    date: str
    reference: str
    description: str
    lines: List[dict]
    total_debit: float
    total_credit: float
    status: str
    attachments: List[str] = []
    created_by: str
    created_by_name: str = ""
    approved_by: Optional[str] = None
    created_at: str
    updated_at: str


# ============ INVOICES ============

class InvoiceItemCreate(BaseModel):
    description: str
    quantity: float = 1
    unit_price: float
    tax_rate: float = 0
    discount: float = 0
    account_id: Optional[str] = None


class InvoiceCreate(BaseModel):
    invoice_type: Literal["sales", "purchase"] = "sales"
    customer_id: Optional[str] = None
    supplier_id: Optional[str] = None
    issue_date: str
    due_date: str
    items: List[InvoiceItemCreate]
    tax_amount: float = 0
    discount_amount: float = 0
    notes: str = ""
    terms: str = ""
    currency: str = "DZD"


class InvoiceResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    invoice_number: str
    invoice_type: str
    customer_id: Optional[str] = None
    customer_name: str = ""
    supplier_id: Optional[str] = None
    supplier_name: str = ""
    issue_date: str
    due_date: str
    items: List[dict]
    subtotal: float
    tax_amount: float
    discount_amount: float
    total: float
    paid_amount: float = 0
    balance_due: float
    status: str
    notes: str = ""
    terms: str = ""
    currency: str = "DZD"
    created_by: str
    created_at: str
    updated_at: str


# ============ PAYMENTS ============

class PaymentCreate(BaseModel):
    payment_type: Literal["received", "made"] = "received"
    invoice_id: Optional[str] = None
    customer_id: Optional[str] = None
    supplier_id: Optional[str] = None
    amount: float
    payment_method: Literal["cash", "bank", "check", "card", "wallet"] = "cash"
    payment_date: str
    reference: str = ""
    notes: str = ""
    account_id: Optional[str] = None


class PaymentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    payment_number: str
    payment_type: str
    invoice_id: Optional[str] = None
    invoice_number: str = ""
    customer_id: Optional[str] = None
    customer_name: str = ""
    supplier_id: Optional[str] = None
    supplier_name: str = ""
    amount: float
    payment_method: str
    payment_date: str
    reference: str = ""
    notes: str = ""
    status: str
    created_by: str
    created_at: str


# ============ EXPENSES ============

class ExpenseCreate(BaseModel):
    category: str
    description: str
    amount: float
    expense_date: str
    payment_method: Literal["cash", "bank", "card", "wallet"] = "cash"
    vendor: str = ""
    receipt_url: str = ""
    account_id: Optional[str] = None
    notes: str = ""
    is_recurring: bool = False
    recurring_frequency: Optional[Literal["daily", "weekly", "monthly", "yearly"]] = None


class ExpenseResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    expense_number: str
    category: str
    description: str
    amount: float
    expense_date: str
    payment_method: str
    vendor: str = ""
    receipt_url: str = ""
    account_id: Optional[str] = None
    account_name: str = ""
    notes: str = ""
    is_recurring: bool = False
    recurring_frequency: Optional[str] = None
    status: str
    ai_category: Optional[str] = None
    created_by: str
    created_at: str


# ============ FINANCIAL REPORTS ============

class FinancialReportRequest(BaseModel):
    report_type: Literal["profit_loss", "balance_sheet", "cash_flow", "trial_balance", "aging"]
    start_date: str
    end_date: str
    include_details: bool = False
    compare_previous: bool = False


class ProfitLossReport(BaseModel):
    model_config = ConfigDict(extra="ignore")
    period_start: str
    period_end: str
    revenue: dict
    cost_of_goods_sold: dict
    gross_profit: float
    operating_expenses: dict
    operating_income: float
    other_income: dict
    other_expenses: dict
    net_income: float
    comparison: Optional[dict] = None


class BalanceSheetReport(BaseModel):
    model_config = ConfigDict(extra="ignore")
    as_of_date: str
    assets: dict
    liabilities: dict
    equity: dict
    total_assets: float
    total_liabilities: float
    total_equity: float


class CashFlowReport(BaseModel):
    model_config = ConfigDict(extra="ignore")
    period_start: str
    period_end: str
    operating_activities: dict
    investing_activities: dict
    financing_activities: dict
    net_cash_flow: float
    beginning_cash: float
    ending_cash: float


# ============ AUDIT LOG ============

class AuditLogCreate(BaseModel):
    action: str
    entity_type: str
    entity_id: str
    old_value: Optional[dict] = None
    new_value: Optional[dict] = None
    ip_address: str = ""
    user_agent: str = ""


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    action: str
    entity_type: str
    entity_id: str
    old_value: Optional[dict] = None
    new_value: Optional[dict] = None
    ip_address: str = ""
    user_agent: str = ""
    user_id: str
    user_name: str = ""
    created_at: str


# ============ TAX SETTINGS ============

class TaxRateCreate(BaseModel):
    name: str
    name_ar: str
    rate: float
    is_default: bool = False
    is_active: bool = True


class TaxRateResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    name_ar: str
    rate: float
    is_default: bool
    is_active: bool
    created_at: str


# ============ BUDGET ============

class BudgetCreate(BaseModel):
    name: str
    fiscal_year: str
    category: str
    amount: float
    notes: str = ""


class BudgetResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    fiscal_year: str
    category: str
    budgeted_amount: float
    actual_amount: float = 0
    variance: float = 0
    variance_percent: float = 0
    notes: str = ""
    created_at: str


# ============ RECONCILIATION ============

class ReconciliationCreate(BaseModel):
    account_id: str
    statement_date: str
    statement_balance: float
    notes: str = ""


class ReconciliationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    account_id: str
    account_name: str
    statement_date: str
    statement_balance: float
    book_balance: float
    difference: float
    status: str
    reconciled_items: List[dict] = []
    notes: str = ""
    reconciled_by: Optional[str] = None
    reconciled_at: Optional[str] = None
    created_at: str
