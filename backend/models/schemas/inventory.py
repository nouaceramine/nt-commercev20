from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional, Literal
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
