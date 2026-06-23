"""
Extra Schemas - Models previously defined inline in main.py
"""
from pydantic import BaseModel, ConfigDict
from typing import List, Optional


class DailySessionCreate(BaseModel):
    opening_cash: float = 0
    notes: str = ""
    cash_box_id: str = "cash"

class DailySessionClose(BaseModel):
    closing_cash: float
    notes: str = ""
    cash_breakdown: dict = {}

class DailySessionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    session_code: str
    date: str
    opening_cash: float
    closing_cash: Optional[float] = None
    expected_cash: float = 0
    difference: float = 0
    total_sales: float = 0
    total_purchases: float = 0
    total_expenses: float = 0
    sales_count: int = 0
    purchases_count: int = 0
    is_closed: bool = False
    user_id: str
    user_name: str
    cash_box_id: str = "cash"
    notes: str = ""
    cash_breakdown: dict = {}
    created_at: str
    closed_at: Optional[str] = None

class InventorySessionCreate(BaseModel):
    name: str = ""
    code: Optional[str] = None
    warehouse_id: str = "main"
    family_filter: str = "all"
    status: str = "active"
    started_at: Optional[str] = None
    counted_items: Optional[dict] = {}
    notes: str = ""

class InventoryItemUpdate(BaseModel):
    product_id: str
    counted_quantity: int

class InventorySessionUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    counted_items: Optional[dict] = None
    completed_at: Optional[str] = None
    applied_changes: Optional[bool] = None
    notes: Optional[str] = None

class InventorySessionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str = ""
    code: Optional[str] = None
    session_code: Optional[str] = None
    warehouse_id: str = "main"
    family_filter: str = "all"
    status: str
    items: List[dict] = []
    counted_items: dict = {}
    total_products: int = 0
    counted_products: int = 0
    discrepancies: int = 0
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    notes: str = ""
    started_at: Optional[str] = None
    created_at: Optional[str] = None
    completed_at: Optional[str] = None
    closed_at: Optional[str] = None
    applied_changes: bool = False

class DebtPaymentCreate(BaseModel):
    amount: float
    payment_method: str = "cash"
    notes: str = ""

class ApiKeyCreate(BaseModel):
    name: str
    service: str
    description: str = ""

class ApiKeyResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    service: str
    key_preview: str
    description: str = ""
    is_active: bool = True
    created_at: str

class RechargeTransactionCreate(BaseModel):
    service_type: str
    phone_number: str
    amount: float
    operator: str

class RechargeTransactionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    service_type: str
    phone_number: str
    amount: float
    operator: str
    status: str
    profit: float = 0
    user_id: str
    user_name: str = ""
    created_at: str

class PhoneDirectoryCreate(BaseModel):
    name: str
    phone: str
    category: str = "general"
    notes: str = ""

class PhoneDirectoryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    phone: str
    category: str
    notes: str = ""
    created_at: str

class NotificationCreate(BaseModel):
    title: str
    message: str
    type: str = "info"
    target_roles: List[str] = []

class NotificationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    message: str
    type: str
    is_read: bool = False
    target_roles: List[str] = []
    created_by: str
    created_at: str

class RepairCreate(BaseModel):
    customer_name: str
    customer_phone: str
    device_type: str
    device_model: str
    issue_description: str
    estimated_cost: float = 0
    notes: str = ""

class RepairUpdate(BaseModel):
    status: Optional[str] = None
    diagnosis: Optional[str] = None
    repair_notes: Optional[str] = None
    parts_used: Optional[List[dict]] = None
    final_cost: Optional[float] = None
    technician_id: Optional[str] = None

class RepairResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    repair_code: str
    customer_name: str
    customer_phone: str
    device_type: str
    device_model: str
    issue_description: str
    diagnosis: str = ""
    repair_notes: str = ""
    status: str
    estimated_cost: float
    final_cost: float = 0
    parts_used: List[dict] = []
    technician_id: Optional[str] = None
    technician_name: str = ""
    notes: str = ""
    received_at: str
    completed_at: Optional[str] = None
    delivered_at: Optional[str] = None

class SparePartCreate(BaseModel):
    name: str
    compatible_models: str = ""
    quantity: int = 0
    purchase_price: float = 0
    selling_price: float = 0
    min_stock: int = 5

class SparePartResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    compatible_models: str = ""
    quantity: int
    purchase_price: float
    selling_price: float
    min_stock: int
    created_at: str

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    session_id: Optional[str] = None

class ImageOCRRequest(BaseModel):
    image_base64: str

class OCRResponse(BaseModel):
    extracted_models: List[str]
    raw_text: str
