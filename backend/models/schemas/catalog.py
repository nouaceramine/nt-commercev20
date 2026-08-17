from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional, Literal
# ============ PRODUCT MODELS ============

class ProductCreate(BaseModel):
    name_en: str  # اسم المنتج (إلزامي)
    name_ar: Optional[str] = ""  # اسم عربي (اختياري)
    description_en: Optional[str] = ""
    description_ar: Optional[str] = ""
    purchase_price: Optional[float] = 0
    wholesale_price: Optional[float] = 0
    retail_price: Optional[float] = 0
    super_wholesale_price: Optional[float] = 0
    tariff_a: Optional[float] = 0
    tariff_b: Optional[float] = 0
    tariff_c: Optional[float] = 0
    tariff_d: Optional[float] = 0
    quantity: int = 0
    image_url: Optional[str] = ""
    images: Optional[List[str]] = []  # معرض الصور: حتى 5 صور (الأولى = الغلاف)
    compatible_models: List[str] = []
    low_stock_threshold: int = 10
    barcode: Optional[str] = ""
    article_code: Optional[str] = ""
    family_id: Optional[str] = None
    use_average_price: Optional[bool] = False
    # Stock
    unit_of_measure: Optional[str] = "U"
    storage_location: Optional[str] = ""
    qty_per_package: Optional[float] = 1
    is_non_stockable: Optional[bool] = False
    # Sales flags
    is_blocked: Optional[bool] = False
    allow_online_payment: Optional[bool] = True  # p149: السماح بالدفع الإلكتروني لهذا المنتج في المتجر
    fixed_price: Optional[bool] = False
    force_qty_entry: Optional[bool] = False
    force_price_entry: Optional[bool] = False
    serial_number_tracking: Optional[bool] = False
    # Extra
    tax_rate: Optional[float] = 0
    internal_notes: Optional[str] = ""
    additional_barcodes: Optional[List[str]] = []
    color: Optional[str] = ""
    sizes: Optional[List[str]] = []
    has_variants: Optional[bool] = False
    variants: Optional[List[dict]] = []
    
    @field_validator('name_en')
    @classmethod
    def validate_name_en(cls, v) -> bool:
        if not v or not v.strip():
            raise ValueError('اسم المنتج مطلوب')
        # Remove HTML tags
        import re
        v = re.sub(r'<[^>]+>', '', v)
        v = v.strip()
        if len(v) > 255:
            raise ValueError('اسم المنتج يجب ألا يتجاوز 255 حرف')
        if len(v) < 2:
            raise ValueError('اسم المنتج يجب أن يكون حرفين على الأقل')
        return v
    
    @field_validator('name_ar')
    @classmethod
    def validate_name_ar(cls, v) -> bool:
        if v:
            import re
            v = re.sub(r'<[^>]+>', '', v)
            v = v.strip()
            if len(v) > 255:
                raise ValueError('الاسم العربي يجب ألا يتجاوز 255 حرف')
        return v or ""
    
    @field_validator('purchase_price', 'wholesale_price', 'retail_price', 'super_wholesale_price')
    @classmethod
    def validate_prices(cls, v) -> bool:
        if v is not None and v < 0:
            raise ValueError('السعر يجب أن يكون صفر أو أكثر')
        return v or 0
    
    @field_validator('images')
    @classmethod
    def validate_images(cls, v):
        if v and len(v) > 5:
            raise ValueError('الحد الأقصى 5 صور للمنتج')
        return v or []

    @field_validator('quantity', 'low_stock_threshold')
    @classmethod
    def validate_quantity(cls, v) -> bool:
        if v is not None and v < 0:
            raise ValueError('الكمية يجب أن تكون صفر أو أكثر')
        return v or 0

class ProductUpdate(BaseModel):
    name_en: Optional[str] = None
    name_ar: Optional[str] = None
    description_en: Optional[str] = None
    description_ar: Optional[str] = None
    purchase_price: Optional[float] = None
    wholesale_price: Optional[float] = None
    retail_price: Optional[float] = None
    super_wholesale_price: Optional[float] = None
    quantity: Optional[int] = None
    image_url: Optional[str] = None
    compatible_models: Optional[List[str]] = None
    low_stock_threshold: Optional[int] = None
    barcode: Optional[str] = None
    article_code: Optional[str] = None  # كود المنتج
    family_id: Optional[str] = None
    use_average_price: Optional[bool] = None
    allow_online_payment: Optional[bool] = None  # p149
    color: Optional[str] = None
    sizes: Optional[List[str]] = None
    has_variants: Optional[bool] = None
    variants: Optional[List[dict]] = None

    @field_validator('name_en')
    @classmethod
    def validate_update_name_en(cls, v):
        if v is None:
            return v
        import re
        v = re.sub(r'<[^>]+>', '', v).strip()
        if not v:
            raise ValueError('اسم المنتج مطلوب')
        if len(v) > 255:
            raise ValueError('اسم المنتج يجب ألا يتجاوز 255 حرف')
        if len(v) < 2:
            raise ValueError('اسم المنتج يجب أن يكون حرفين على الأقل')
        return v

    @field_validator('name_ar')
    @classmethod
    def validate_update_name_ar(cls, v):
        if v:
            import re
            v = re.sub(r'<[^>]+>', '', v).strip()
            if len(v) > 255:
                raise ValueError('الاسم العربي يجب ألا يتجاوز 255 حرف')
        return v

    @field_validator('purchase_price', 'wholesale_price', 'retail_price', 'super_wholesale_price')
    @classmethod
    def validate_update_prices(cls, v):
        if v is not None and v < 0:
            raise ValueError('السعر يجب أن يكون صفر أو أكثر')
        return v

    @field_validator('quantity', 'low_stock_threshold')
    @classmethod
    def validate_update_quantity(cls, v):
        if v is not None and v < 0:
            raise ValueError('الكمية يجب أن تكون صفر أو أكثر')
        return v

class ProductResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name_en: str
    name_ar: str = ""
    description_en: str = ""
    description_ar: str = ""
    purchase_price: float = 0
    wholesale_price: float = 0
    retail_price: float = 0
    super_wholesale_price: float = 0
    quantity: int
    image_url: str = ""
    compatible_models: List[str] = []
    low_stock_threshold: int = 10
    barcode: str = ""
    article_code: str = ""  # كود المنتج
    family_id: str = ""
    family_name: str = ""
    use_average_price: bool = False
    last_purchase_date: Optional[str] = None  # تاريخ آخر شراء
    created_at: str = ""
    updated_at: str = ""
# ============ PRODUCT FAMILY MODELS ============

class ProductFamilyCreate(BaseModel):
    name_en: str
    name_ar: str
    description_en: Optional[str] = ""
    description_ar: Optional[str] = ""
    parent_id: Optional[str] = None  # للعائلات الفرعية

class ProductFamilyUpdate(BaseModel):
    name_en: Optional[str] = None
    name_ar: Optional[str] = None
    description_en: Optional[str] = None
    description_ar: Optional[str] = None
    parent_id: Optional[str] = None

class ProductFamilyResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    code: str = ""
    name_en: str = ""
    name_ar: str = ""
    description_en: str = ""
    description_ar: str = ""
    parent_id: str = ""
    parent_name: str = ""
    product_count: int = 0
    created_at: str = ""

# ============ OCR & OTHER MODELS ============

class OCRRequest(BaseModel):
    image_base64: str

class OCRResponse(BaseModel):
    extracted_models: List[str]
    raw_text: str
