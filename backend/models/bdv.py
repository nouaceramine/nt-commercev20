"""
BDV Original Models - 58 Collections
POS, Inventory, CRM, Purchases, Employees, Time Periods, Accounting, System
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


# ═══════════════ POS (8) ═══════════════
class Batch(BaseModel):
    id: str = ""
    batch_number: str = ""
    register_id: str = ""
    opened_at: Optional[str] = None
    closed_at: Optional[str] = None
    opening_amount: float = 0
    closing_amount: float = 0
    status: str = "open"

class Register(BaseModel):
    id: str = ""
    name: str = ""
    location: str = ""
    is_active: bool = True

class Receipt(BaseModel):
    id: str = ""
    receipt_number: str = ""
    register_id: str = ""
    batch_id: str = ""
    customer_id: Optional[str] = None
    total: float = 0
    discount: float = 0
    tax: float = 0
    net_total: float = 0
    payment_method: str = "cash"
    status: str = "completed"
    created_at: Optional[str] = None

class ReceiptEntry(BaseModel):
    id: str = ""
    receipt_id: str = ""
    item_id: str = ""
    item_name: str = ""
    quantity: float = 1
    unit_price: float = 0
    discount: float = 0
    total: float = 0

class ReceiptHold(BaseModel):
    id: str = ""
    register_id: str = ""
    customer_id: Optional[str] = None
    total: float = 0
    held_at: Optional[str] = None

class ReceiptHoldEntry(BaseModel):
    id: str = ""
    hold_id: str = ""
    item_id: str = ""
    item_name: str = ""
    quantity: float = 1
    unit_price: float = 0

class ReceiptTemplate(BaseModel):
    id: str = ""
    name: str = ""
    header_text: str = ""
    footer_text: str = ""
    show_logo: bool = True
    paper_size: str = "80mm"

class ReceiptTemplateEntry(BaseModel):
    id: str = ""
    template_id: str = ""
    field_name: str = ""
    field_order: int = 0
    is_visible: bool = True


# ═══════════════ INVENTORY (12) ═══════════════
class Item(BaseModel):
    id: str = ""
    name: str = ""
    article_code: str = ""
    barcode: Optional[str] = None
    family_id: Optional[str] = None
    purchase_price: float = 0
    selling_price: float = 0
    quantity: float = 0
    min_stock: float = 0
    max_stock: float = 0
    unit_of_measure: str = "unit"
    is_active: bool = True
    tax_rate: float = 0

class ItemFamily(BaseModel):
    id: str = ""
    name_ar: str = ""
    name_fr: str = ""
    parent_id: Optional[str] = None
    description: str = ""

class ItemAdjustment(BaseModel):
    id: str = ""
    item_id: str = ""
    adjustment_type: str = "increase"
    quantity: float = 0
    reason: str = ""
    adjusted_by: str = ""
    adjusted_at: Optional[str] = None

class ItemNote(BaseModel):
    id: str = ""
    item_id: str = ""
    note: str = ""
    created_by: str = ""
    created_at: Optional[str] = None

class ItemAlias(BaseModel):
    id: str = ""
    item_id: str = ""
    alias_name: str = ""
    alias_barcode: Optional[str] = None

class ItemPeremption(BaseModel):
    id: str = ""
    item_id: str = ""
    batch_number: str = ""
    expiry_date: Optional[str] = None
    quantity: float = 0

class StockTake(BaseModel):
    id: str = ""
    name: str = ""
    status: str = "draft"
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    created_by: str = ""

class StockTakeEntry(BaseModel):
    id: str = ""
    stock_take_id: str = ""
    item_id: str = ""
    system_quantity: float = 0
    counted_quantity: float = 0
    difference: float = 0

class StockTransfer(BaseModel):
    id: str = ""
    transfer_number: str = ""
    from_warehouse: str = ""
    to_warehouse: str = ""
    status: str = "pending"
    created_by: str = ""
    created_at: Optional[str] = None

class StockTransferEntry(BaseModel):
    id: str = ""
    transfer_id: str = ""
    item_id: str = ""
    quantity: float = 0

class UnitOfMeasure(BaseModel):
    id: str = ""
    name_ar: str = ""
    name_fr: str = ""
    abbreviation: str = ""
    base_unit: Optional[str] = None
    conversion_factor: float = 1

class BinLocation(BaseModel):
    id: str = ""
    warehouse_id: str = ""
    name: str = ""
    aisle: str = ""
    shelf: str = ""
    bin: str = ""


# ═══════════════ CRM (8) ═══════════════
class Customer(BaseModel):
    id: str = ""
    name: str = ""
    phone: Optional[str] = None
    email: Optional[str] = None
    family_id: Optional[str] = None
    address: str = ""
    balance: float = 0
    credit_limit: float = 0
    is_active: bool = True

class CustomerFamily(BaseModel):
    id: str = ""
    name_ar: str = ""
    name_fr: str = ""
    discount_rate: float = 0

class Supplier(BaseModel):
    id: str = ""
    name: str = ""
    phone: Optional[str] = None
    email: Optional[str] = None
    address: str = ""
    balance: float = 0
    is_active: bool = True

class SupplierItem(BaseModel):
    id: str = ""
    supplier_id: str = ""
    item_id: str = ""
    supplier_code: str = ""
    purchase_price: float = 0

class Contact(BaseModel):
    id: str = ""
    entity_type: str = ""
    entity_id: str = ""
    contact_type: str = ""
    value: str = ""

class Address(BaseModel):
    id: str = ""
    entity_type: str = ""
    entity_id: str = ""
    address_line1: str = ""
    city: str = ""
    state: str = ""
    country: str = "DZ"

class PriceLevel(BaseModel):
    id: str = ""
    name_ar: str = ""
    name_fr: str = ""
    discount_rate: float = 0
    markup_rate: float = 0

class PaymentMethodBDV(BaseModel):
    id: str = ""
    name_ar: str = ""
    name_fr: str = ""
    code: str = ""
    is_active: bool = True


# ═══════════════ PURCHASES (5) ═══════════════
class Purchase(BaseModel):
    id: str = ""
    purchase_number: str = ""
    supplier_id: str = ""
    total: float = 0
    status: str = "draft"
    created_at: Optional[str] = None

class PurchaseEntry(BaseModel):
    id: str = ""
    purchase_id: str = ""
    item_id: str = ""
    quantity: float = 0
    unit_price: float = 0
    total: float = 0

class PricingUpdate(BaseModel):
    id: str = ""
    update_number: str = ""
    supplier_id: Optional[str] = None
    status: str = "draft"
    created_at: Optional[str] = None

class PricingUpdateEntry(BaseModel):
    id: str = ""
    update_id: str = ""
    item_id: str = ""
    old_price: float = 0
    new_price: float = 0

class SupplierPricing(BaseModel):
    id: str = ""
    supplier_id: str = ""
    item_id: str = ""
    price: float = 0
    min_quantity: float = 0
    valid_until: Optional[str] = None


# ═══════════════ EMPLOYEES (4) ═══════════════
class Employee(BaseModel):
    id: str = ""
    name: str = ""
    phone: Optional[str] = None
    position: str = ""
    salary: float = 0
    hire_date: Optional[str] = None
    is_active: bool = True

class EmployeeSalary(BaseModel):
    id: str = ""
    employee_id: str = ""
    month: str = ""
    base_salary: float = 0
    bonus: float = 0
    deductions: float = 0
    net_salary: float = 0
    paid: bool = False

class EmployeeLog(BaseModel):
    id: str = ""
    employee_id: str = ""
    action: str = ""
    timestamp: Optional[str] = None
    ip_address: str = ""

class LastEmployeeLog(BaseModel):
    id: str = ""
    employee_id: str = ""
    last_login: Optional[str] = None
    last_action: str = ""


# ═══════════════ TIME PERIODS (5) ═══════════════
class Days(BaseModel):
    id: str = ""
    date: str = ""
    day_name: str = ""
    is_working: bool = True

class Months(BaseModel):
    id: str = ""
    year: int = 0
    month: int = 0
    name_ar: str = ""
    name_fr: str = ""

class Semesters(BaseModel):
    id: str = ""
    year: int = 0
    semester: int = 0
    start_date: str = ""
    end_date: str = ""

class Trimesters(BaseModel):
    id: str = ""
    year: int = 0
    trimester: int = 0
    start_date: str = ""
    end_date: str = ""

class Houres(BaseModel):
    id: str = ""
    date: str = ""
    hour: int = 0
    sales_count: int = 0
    sales_total: float = 0


# ═══════════════ ACCOUNTING (6) ═══════════════
class Charge(BaseModel):
    id: str = ""
    charge_number: str = ""
    charge_type_id: str = ""
    amount: float = 0
    description: str = ""
    date: Optional[str] = None

class ChargeType(BaseModel):
    id: str = ""
    name_ar: str = ""
    name_fr: str = ""
    code: str = ""

class VAT(BaseModel):
    id: str = ""
    name: str = ""
    rate: float = 0
    is_default: bool = False

class Tax(BaseModel):
    id: str = ""
    name_ar: str = ""
    name_fr: str = ""
    rate: float = 0
    applies_to: str = "all"

class Payment(BaseModel):
    id: str = ""
    payment_number: str = ""
    entity_type: str = ""
    entity_id: str = ""
    amount: float = 0
    method: str = "cash"
    date: Optional[str] = None

class Account(BaseModel):
    id: str = ""
    account_number: str = ""
    name_ar: str = ""
    name_fr: str = ""
    account_type: str = ""
    balance: float = 0


# ═══════════════ SYSTEM (10) ═══════════════
class Parameter(BaseModel):
    id: str = ""
    key: str = ""
    value: str = ""
    category: str = "general"

class NumberSequence(BaseModel):
    id: str = ""
    prefix: str = ""
    current_value: int = 0
    entity_type: str = ""

class Version(BaseModel):
    id: str = ""
    version: str = ""
    release_date: Optional[str] = None
    changes: List[str] = []

class Report(BaseModel):
    id: str = ""
    name_ar: str = ""
    name_fr: str = ""
    report_type: str = ""
    query: str = ""

class CustomFields(BaseModel):
    id: str = ""
    entity_type: str = ""
    field_name: str = ""
    field_type: str = "text"
    is_required: bool = False

class ShortcutItem(BaseModel):
    id: str = ""
    user_id: str = ""
    item_id: str = ""
    position: int = 0

class ScaleDevice(BaseModel):
    id: str = ""
    name: str = ""
    port: str = ""
    baud_rate: int = 9600

class ScaleDeviceItem(BaseModel):
    id: str = ""
    device_id: str = ""
    item_id: str = ""
    plu_code: str = ""

class TransferReason(BaseModel):
    id: str = ""
    name_ar: str = ""
    name_fr: str = ""
    code: str = ""

class HomeMessages(BaseModel):
    id: str = ""
    title_ar: str = ""
    title_fr: str = ""
    content_ar: str = ""
    content_fr: str = ""
    is_active: bool = True
    priority: int = 0
