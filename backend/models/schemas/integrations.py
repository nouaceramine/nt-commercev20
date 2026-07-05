from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional, Literal
# ============ API KEY MODELS ============

class ApiKeyCreate(BaseModel):
    name: str
    type: Literal["internal", "external"]  # internal = للربط مع تطبيقات أخرى, external = خدمات خارجية
    service: Optional[str] = ""  # woocommerce, stripe, etc
    key_value: Optional[str] = ""
    secret_value: Optional[str] = ""
    endpoint_url: Optional[str] = ""
    permissions: List[str] = ["read"]

class ApiKeyResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    type: str
    service: str
    key_value: str
    key_preview: str  # آخر 4 أحرف فقط
    endpoint_url: str
    permissions: List[str]
    is_active: bool
    last_used: str
    created_at: str

# ============ RECHARGE MODELS ============

class RechargeCreate(BaseModel):
    operator: Literal["mobilis", "djezzy", "ooredoo", "idoom"]
    phone_number: str
    amount: float
    recharge_type: Literal["credit", "internet", "flexy"]  # credit=رصيد, internet=أنترنت, flexy=فليكسي
    customer_id: Optional[str] = None
    payment_method: Literal["cash", "bank", "wallet", "credit"] = "cash"  # credit = آجل (debt on customer)
    notes: Optional[str] = ""

class RechargeResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    code: str = ""
    operator: str
    phone_number: str
    amount: float
    recharge_type: str
    cost: float  # سعر التكلفة
    profit: float  # الربح
    customer_id: str
    customer_name: str
    payment_method: str
    status: str  # pending, processing, success, failed
    ussd_code: str
    notes: str
    created_at: str
    created_by: str
    bridge_task_id: Optional[str] = None  # returned to frontend for status polling

# أكواد USSD وأسعار الشحن
RECHARGE_CONFIG = {
    "mobilis": {
        "name": "موبيليس",
        "name_en": "Mobilis",
        "prefix": ["06", "05"],
        "ussd": {
            "credit": "*600*{code}#",
            "internet": "*600*{code}#",
            "balance": "*600#"
        },
        "amounts": [100, 200, 500, 1000, 2000, 5000],
        "commission": 3  # نسبة العمولة %
    },
    "djezzy": {
        "name": "جازي",
        "name_en": "Djezzy",
        "prefix": ["07"],
        "ussd": {
            "credit": "*720*{code}#",
            "flexy": "*720*3*{phone}*{amount}#",
            "balance": "*720#"
        },
        "amounts": [100, 200, 500, 1000, 2000, 5000],
        "commission": 3
    },
    "ooredoo": {
        "name": "أوريدو",
        "name_en": "Ooredoo",
        "prefix": ["05"],
        "ussd": {
            "credit": "*888*{code}#",
            "internet": "*888*{code}#",
            "balance": "*888#"
        },
        "amounts": [100, 200, 500, 1000, 2000, 5000],
        "commission": 3
    },
    "idoom": {
        "name": "إيدوم ADSL",
        "name_en": "Idoom ADSL",
        "prefix": ["0"],
        "ussd": {
            "internet": "الدفع عبر الموقع أو الوكالة",
            "balance": "https://selfcare.algerietelecom.dz"
        },
        "amounts": [1000, 1500, 2000, 2500, 3000, 4000, 5000],
        "commission": 2
    }
}
