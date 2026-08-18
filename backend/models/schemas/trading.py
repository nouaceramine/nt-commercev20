from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional, Literal
# ============ SALE MODELS ============

class SaleItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    product_id: Optional[str] = None
    product_name: str
    barcode: Optional[str] = ""
    quantity: float
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
    # Optional — when present, the product's purchase_price/selling_price are
    # automatically updated to these values during the purchase create flow.
    selling_price: Optional[float] = None
    update_product_prices: Optional[bool] = True   # default ON so user gets the obvious behavior
    # p168: direct sale-price column in the purchase form → retail_price + price_history
    retail_price: Optional[float] = None
    # p168: expiry date of the purchased lot → auto-creates a product_lots row (expiry alerts)
    expiry_date: Optional[str] = ""
    alert_days: Optional[int] = 30

class PurchaseCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    supplier_id: str
    items: List[PurchaseItem]
    total: float
    paid_amount: float = 0
    payment_method: Literal["cash", "bank", "wallet", "safe", "personal"] = "cash"  # p62: +خزنة/مال خاص
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
    payment_method: Literal["cash", "bank", "wallet", "safe", "personal"] = "cash"  # p64: +خزنة/مال خاص
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
