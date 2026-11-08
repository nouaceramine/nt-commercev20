import math

from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional
# ============ WAREHOUSE MODELS ============

class WarehouseCreate(BaseModel):
    name: str = Field(min_length=1)
    address: Optional[str] = ""
    phone: Optional[str] = ""
    manager: Optional[str] = ""
    notes: Optional[str] = ""
    is_main: bool = False

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("اسم المخزن مطلوب")
        return value


class WarehouseUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    manager: Optional[str] = None
    notes: Optional[str] = None
    is_main: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value):
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("اسم المخزن مطلوب")
        return value

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
    quantity: int = Field(gt=0)

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
    product_name: str = ""
    old_price: float
    new_price: float
    price_type: str = "retail_price"  # purchase_price, wholesale_price, retail_price
    change_percent: float = 0.0
    changed_by: str = ""
    changed_by_name: str = ""
    source: str = "manual"  # manual, purchase, import
    notes: Optional[str] = ""
    created_at: str

# ============ INVENTORY SESSION MODELS ============

def validate_counted_items(value):
    if value is None:
        return value
    for product_id, quantity in value.items():
        if not str(product_id).strip():
            raise ValueError("معرف المنتج في الجرد مطلوب")
        if not math.isfinite(quantity) or quantity < 0:
            raise ValueError("الكمية المجردة يجب أن تكون رقمًا غير سالب ومنتهيًا")
    return value


class InventorySessionCreate(BaseModel):
    name: str = Field(min_length=1)
    family_filter: Optional[str] = "all"
    status: str = "active"
    started_at: str
    counted_items: dict[str, float] = Field(default_factory=dict)
    code: Optional[str] = ""  # كود الجرد IN00001

    _counted_items_are_valid = field_validator("counted_items")(validate_counted_items)


class InventorySessionUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    completed_at: Optional[str] = None
    applied_changes: Optional[bool] = None
    counted_items: Optional[dict[str, float]] = None
    code: Optional[str] = None

    _counted_items_are_valid = field_validator("counted_items")(validate_counted_items)

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
