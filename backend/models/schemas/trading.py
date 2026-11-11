from pydantic import BaseModel, ConfigDict, Field, model_validator
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
    variant: Optional[dict] = None  # p184: {"color": ..., "size": ...} for variant products
    serial_number: Optional[str] = None  # p187: IMEI/serial tracking
    modifiers: Optional[List[dict]] = None  # p308: إضافات/بدائل الطبق [{group, option, price_delta, product_id?, qty?}]

    @model_validator(mode="after")
    def validate_line_total(self):
        # p494: line coherence — total must equal qty x unit_price minus the
        # line discount (negative lines are legitimate return lines). 0.05
        # tolerance absorbs split-bill rounding (2-decimal rounded parts).
        expected = self.quantity * self.unit_price - (self.discount or 0)
        if abs(self.total - expected) > 0.05:
            raise ValueError("إجمالي السطر يجب أن يساوي الكمية × السعر − خصم السطر")
        return self

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

    @model_validator(mode="after")
    def validate_totals(self):
        # p494: the server never trusts a client total — it must reconcile
        # with the item lines (authoritative) minus the invoice discount.
        # This blocks understated-total fraud (items 200, total 1).
        computed = round(sum(it.total for it in self.items), 2)
        if abs(round(self.subtotal, 2) - computed) > 0.05:
            raise ValueError("المجموع الفرعي لا يطابق مجموع الأسطر")
        if abs(round(self.total, 2) - round(computed - (self.discount or 0), 2)) > 0.05:
            raise ValueError("إجمالي الفاتورة يجب أن يساوي مجموع الأسطر − الخصم")
        if self.paid_amount < 0 and self.total >= 0:
            raise ValueError("المبلغ المدفوع لا يمكن أن يكون سالبًا")
        return self

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
    quantity: int = Field(gt=0)
    unit_price: float = Field(ge=0, allow_inf_nan=False)
    total: float = Field(ge=0, allow_inf_nan=False)
    # p173: selling_price removed — retail_price (below) is the ONLY sale-price field.
    # purchase_price always syncs from unit_price; sale price syncs to retail_price
    # with a price_history row (see purchases_routes._sync_item_extras).
    update_product_prices: Optional[bool] = True   # default ON so user gets the obvious behavior
    # p168: direct sale-price column in the purchase form → retail_price + price_history
    retail_price: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    # p168: expiry date of the purchased lot → auto-creates a product_lots row (expiry alerts)
    expiry_date: Optional[str] = ""
    alert_days: Optional[int] = Field(default=30, ge=0, le=3650)

    @model_validator(mode="after")
    def validate_line_total(self):
        if abs(self.total - self.quantity * self.unit_price) > 0.01:
            raise ValueError("إجمالي الصنف يجب أن يساوي الكمية × سعر الوحدة")
        if self.expiry_date:
            from datetime import date
            try:
                parsed_expiry = date.fromisoformat(self.expiry_date)
            except (TypeError, ValueError):
                raise ValueError("تاريخ انتهاء الصلاحية يجب أن يكون بصيغة YYYY-MM-DD")
            if parsed_expiry.isoformat() != self.expiry_date:
                raise ValueError("تاريخ انتهاء الصلاحية يجب أن يكون بصيغة YYYY-MM-DD")
        return self

class PurchaseCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    supplier_id: str
    items: List[PurchaseItem] = Field(min_length=1)
    total: float = Field(gt=0, allow_inf_nan=False)
    paid_amount: float = Field(default=0, ge=0, allow_inf_nan=False)
    payment_method: Literal["cash", "bank", "wallet", "safe", "personal"] = "cash"  # p62: +خزنة/مال خاص
    payment_type: Optional[str] = "cash"
    notes: Optional[str] = ""
    code: Optional[str] = ""

    @model_validator(mode="after")
    def validate_purchase_totals(self):
        items_total = sum(item.total for item in self.items)
        if abs(self.total - items_total) > 0.01:
            raise ValueError("إجمالي الفاتورة يجب أن يساوي مجموع الأصناف")
        if self.paid_amount > self.total + 0.001:
            raise ValueError("المبلغ المدفوع لا يمكن أن يتجاوز إجمالي الفاتورة")
        return self

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
    amount: float = Field(gt=0)  # p494c: a zero/negative debt is meaningless corruption
    due_date: Optional[str] = None
    notes: Optional[str] = ""
    reference_type: Optional[str] = None  # sale, purchase
    reference_id: Optional[str] = None

class DebtPaymentCreate(BaseModel):
    debt_id: str
    amount: float = Field(gt=0)  # p494c: a negative "payment" used to INCREASE the remaining debt
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
