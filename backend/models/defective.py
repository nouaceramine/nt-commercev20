"""
Defective Goods Models - 11 Collections
"""
from pydantic import BaseModel
from typing import Optional, List


class DefectiveGoods(BaseModel):
    id: str = ""
    defective_number: str = ""
    tenant_id: str = ""
    product_id: str = ""
    product_name: str = ""
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    defect_type: str = "manufacturing"
    defect_severity: str = "medium"
    description: str = ""
    quantity: int = 1
    unit_cost: float = 0
    total_cost: float = 0
    status: str = "pending_inspection"
    inspected_by: Optional[str] = None
    inspected_at: Optional[str] = None
    action_taken: Optional[str] = None

class DefectiveInspection(BaseModel):
    id: str = ""
    defective_goods_id: str = ""
    confirmed_defective: bool = True
    actual_defect_type: str = ""
    actual_quantity: int = 1
    recommended_action: str = "return_to_supplier"
    inspector_id: str = ""
    inspector_name: str = ""

class SupplierReturn(BaseModel):
    id: str = ""
    return_number: str = ""
    tenant_id: str = ""
    supplier_id: str = ""
    supplier_name: str = ""
    items: List[dict] = []
    total_quantity: int = 0
    total_value: float = 0
    status: str = "pending"
    request_date: Optional[str] = None
    refund_amount: float = 0

class ReturnTracking(BaseModel):
    id: str = ""
    return_request_id: str = ""
    event_type: str = ""
    event_description: str = ""
    event_date: Optional[str] = None

class DisposalRecord(BaseModel):
    id: str = ""
    disposal_number: str = ""
    tenant_id: str = ""
    items: List[dict] = []
    disposal_method: str = "destroy"
    total_quantity: int = 0
    total_value: float = 0
    authorized_by: str = ""
    execution_date: Optional[str] = None

class DefectCategory(BaseModel):
    id: str = ""
    code: str = ""
    name_ar: str = ""
    name_fr: str = ""
    description_ar: str = ""
    description_fr: str = ""
    severity: str = "medium"

class ReturnReason(BaseModel):
    id: str = ""
    code: str = ""
    name_ar: str = ""
    name_fr: str = ""

class DisposalMethod(BaseModel):
    id: str = ""
    code: str = ""
    name_ar: str = ""
    name_fr: str = ""
