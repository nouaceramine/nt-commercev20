"""
Repair System Models - 16 Collections
"""
from pydantic import BaseModel
from typing import Optional, List


class RepairTicket(BaseModel):
    id: str = ""
    ticket_number: str = ""
    tenant_id: str = ""
    customer_id: Optional[str] = None
    customer_name: str = ""
    customer_phone: str = ""
    brand_id: str = ""
    brand_name: str = ""
    model_id: str = ""
    model_name: str = ""
    imei: Optional[str] = None
    reported_issue: str = ""
    diagnosis: Optional[str] = None
    estimated_cost: float = 0
    final_cost: Optional[float] = None
    status: str = "received"
    priority: str = "medium"
    received_at: Optional[str] = None
    diagnosed_at: Optional[str] = None
    repaired_at: Optional[str] = None
    delivered_at: Optional[str] = None
    technician_id: Optional[str] = None
    technician_name: Optional[str] = None
    warranty_days: int = 30

class DeviceBrand(BaseModel):
    id: str = ""
    name_ar: str = ""
    name_fr: str = ""
    logo_url: Optional[str] = None

class DeviceModel(BaseModel):
    id: str = ""
    brand_id: str = ""
    name_ar: str = ""
    name_fr: str = ""

class SparePart(BaseModel):
    id: str = ""
    part_number: str = ""
    name_ar: str = ""
    name_fr: str = ""
    quantity: int = 0
    purchase_price: float = 0
    selling_price: float = 0

class PartUsage(BaseModel):
    id: str = ""
    repair_ticket_id: str = ""
    part_id: str = ""
    quantity: int = 1
    unit_price: float = 0
    total_price: float = 0

class Technician(BaseModel):
    id: str = ""
    tenant_id: str = ""
    name: str = ""
    phone: str = ""
    specialties: List[str] = []
    is_active: bool = True

class RepairHistory(BaseModel):
    id: str = ""
    repair_ticket_id: str = ""
    old_status: str = ""
    new_status: str = ""
    changed_by: str = ""
    notes: Optional[str] = None
    created_at: Optional[str] = None

class RepairWarranty(BaseModel):
    id: str = ""
    repair_ticket_id: str = ""
    warranty_number: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_active: bool = True

class RepairInvoice(BaseModel):
    id: str = ""
    invoice_number: str = ""
    repair_ticket_id: str = ""
    parts_cost: float = 0
    labor_cost: float = 0
    total_cost: float = 0
    paid_amount: float = 0
    payment_status: str = "pending"

class TechnicianSkill(BaseModel):
    id: str = ""
    technician_id: str = ""
    skill_type: str = ""
    skill_id: str = ""
    skill_name: str = ""
    level: int = 1
    certified: bool = False

class SparePartSupplier(BaseModel):
    id: str = ""
    supplier_id: str = ""
    supplier_name: str = ""
    part_id: str = ""
    part_name: str = ""
    price: float = 0
    delivery_time: int = 0
    is_preferred: bool = False
