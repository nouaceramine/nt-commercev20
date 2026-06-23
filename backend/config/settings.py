"""
NT Commerce 12.0 - Application Settings
"""
import os

# Currency
CURRENCY = "دج"
CURRENCY_CODE = "DZD"

# JWT Settings
SECRET_KEY = os.environ.get("SECRET_KEY", os.urandom(32).hex())
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480

# Default Cash Boxes
DEFAULT_CASH_BOXES = [
    {"id": "cash", "name": "الصندوق النقدي", "name_en": "Cash", "balance": 0, "is_default": True},
    {"id": "ccp", "name": "CCP", "name_en": "CCP", "balance": 0, "is_default": True},
    {"id": "baridimob", "name": "بريدي موب", "name_en": "BaridiMob", "balance": 0, "is_default": True},
    {"id": "bank", "name": "البنك", "name_en": "Bank", "balance": 0, "is_default": True},
]

# Pagination
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

# File Upload
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]

# Robot Intervals (seconds)
ROBOT_INTERVALS = {
    "inventory": 300,
    "sales": 600,
    "customer": 600,
    "report": 900,
    "pricing": 900,
    "maintenance": 900,
    "profit": 600,
    "repair": 600,
    "prediction": 1800,
    "notification": 300,
    "supplier": 600,
}
