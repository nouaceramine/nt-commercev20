from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional, Literal
# ============ CUSTOMER MODELS ============

class CustomerCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    notes: Optional[str] = ""
    family_id: Optional[str] = None
    code: Optional[str] = ""  # كود الزبون CL00001
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v) -> bool:
        if not v or not v.strip():
            raise ValueError('اسم الزبون مطلوب')
        import re
        v = re.sub(r'<[^>]+>', '', v)
        v = v.strip()
        if len(v) > 255:
            raise ValueError('الاسم يجب ألا يتجاوز 255 حرف')
        if len(v) < 2:
            raise ValueError('الاسم يجب أن يكون حرفين على الأقل')
        return v
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v) -> bool:
        if v and v.strip():
            import re
            v = v.strip()
            if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', v):
                raise ValueError('البريد الإلكتروني غير صالح')
        return v or ""
    
    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v) -> bool:
        if v:
            v = v.strip()
            if len(v) > 20:
                raise ValueError('رقم الهاتف طويل جداً')
        return v or ""

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    family_id: Optional[str] = None
    code: Optional[str] = None

class CustomerResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    phone: str
    email: str
    address: str
    notes: str
    code: str = ""
    family_id: str = ""
    family_name: str = ""
    total_purchases: float = 0
    balance: float = 0  # رصيد الزبون (دين)
    created_at: str

# ============ SUPPLIER MODELS ============

class SupplierCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    notes: Optional[str] = ""
    family_id: Optional[str] = None
    code: Optional[str] = ""  # كود المورد FR00001
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v) -> bool:
        if not v or not v.strip():
            raise ValueError('اسم المورد مطلوب')
        import re
        v = re.sub(r'<[^>]+>', '', v)
        v = v.strip()
        if len(v) > 255:
            raise ValueError('الاسم يجب ألا يتجاوز 255 حرف')
        return v

class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    family_id: Optional[str] = None
    code: Optional[str] = None

class SupplierResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    phone: str
    email: str
    address: str
    notes: str
    code: str = ""
    family_id: str = ""
    family_name: str = ""
    total_purchases: float = 0
    balance: float = 0  # رصيد المورد (دين لهم)
    created_at: str
