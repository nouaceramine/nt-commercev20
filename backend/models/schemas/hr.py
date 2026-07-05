from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional, Literal
# ============ EMPLOYEE MODELS ============

class EmployeeCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    position: Optional[str] = ""
    salary: float = 0
    hire_date: Optional[str] = None
    commission_rate: float = 0  # نسبة العمولة على المبيعات
    max_discount_percent: float = 0  # حد الخصم المسموح
    max_debt_amount: float = 0  # حد الدين المسموح

class EmployeeAlertSettings(BaseModel):
    employee_id: str
    enable_discount_alert: bool = True
    discount_threshold_percent: float = 80  # تنبيه عند الوصول لـ 80% من الحد
    enable_debt_alert: bool = True
    debt_threshold_percent: float = 80  # تنبيه عند الوصول لـ 80% من الحد
class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    position: Optional[str] = None
    salary: Optional[float] = None
    commission_rate: Optional[float] = None

class EmployeeResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    phone: str
    email: str
    position: str
    salary: float
    hire_date: str
    commission_rate: float
    total_advances: float = 0
    total_commission: float = 0
    created_at: str

class AttendanceCreate(BaseModel):
    employee_id: str
    date: str
    status: Literal["present", "absent", "late", "leave"]
    notes: Optional[str] = ""

class AttendanceResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    employee_name: str
    date: str
    status: str
    notes: str

class AdvanceCreate(BaseModel):
    employee_id: str
    amount: float
    notes: Optional[str] = ""

class AdvanceResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    employee_name: str
    amount: float
    notes: str
    created_at: str
