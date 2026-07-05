"""
NT Commerce 12.0 - Application Settings
"""
import os

# Currency
CURRENCY = "دج"
CURRENCY_CODE = "DZD"

# JWT Settings — kept for backwards compat; new code should use utils.jwt_config
SECRET_KEY = os.environ.get("SECRET_KEY", os.urandom(32).hex())
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480

# ── Sprint 1: Central Pydantic Settings (opt-in for new code) ─────────────
# Existing constants above remain unchanged for backwards compat.
try:
    from functools import lru_cache
    from typing import Optional
    from pydantic import Field
    from pydantic_settings import BaseSettings, SettingsConfigDict

    class AppSettings(BaseSettings):
        model_config = SettingsConfigDict(
            env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"),
            env_file_encoding="utf-8",
            extra="ignore",
            case_sensitive=False,
        )
        mongo_url: str = Field(..., alias="MONGO_URL")
        db_name: str = Field(..., alias="DB_NAME")
        jwt_secret_key: str = Field(..., alias="JWT_SECRET_KEY", min_length=32)
        redis_url: Optional[str] = Field(default=None, alias="REDIS_URL")
        cors_origins: str = Field(default="*", alias="CORS_ORIGINS")
        log_level: str = Field(default="INFO", alias="LOG_LEVEL")
        log_format: str = Field(default="text", alias="LOG_FORMAT")
        max_tenants: int = Field(default=500, alias="MAX_TENANTS")
        brevo_api_key: Optional[str] = Field(default=None, alias="BREVO_API_KEY")
        resend_api_key: Optional[str] = Field(default=None, alias="RESEND_API_KEY")
        emergent_llm_key: Optional[str] = Field(default=None, alias="EMERGENT_LLM_KEY")
        rate_limit_login: str = Field(default="10/minute", alias="RATE_LIMIT_LOGIN")
        rate_limit_register: str = Field(default="5/minute", alias="RATE_LIMIT_REGISTER")

        @property
        def cors_origins_list(self) -> list[str]:
            if self.cors_origins in ("*", ""):
                return ["*"]
            return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

        @property
        def is_json_logging(self) -> bool:
            return self.log_format.lower() == "json"

    @lru_cache(maxsize=1)
    def get_app_settings() -> AppSettings:
        return AppSettings()  # type: ignore[call-arg]

    try:
        app_settings = get_app_settings()
    except Exception:
        app_settings = None  # type: ignore[assignment]
except ImportError:
    # pydantic-settings not installed — old code paths keep working
    AppSettings = None  # type: ignore[assignment,misc]
    get_app_settings = None  # type: ignore[assignment]
    app_settings = None  # type: ignore[assignment]
# ──────────────────────────────────────────────────────────────────────────

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
