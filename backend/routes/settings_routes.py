"""
Settings Routes for NT Commerce
Handles date/time format, locale, and system settings
"""
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from utils.permissions import create_cashier_block

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["Settings"])


# ============ REQUEST/RESPONSE MODELS ============

class DateTimeSettings(BaseModel):
    short_date_format: str = "dd/MM/yyyy"
    long_date_format: str = "dd MMMM yyyy"
    time_format: str = "HH:mm:ss"
    use_western_numerals: bool = True
    language: str = "ar"


class LocaleSettings(BaseModel):
    language: str = "ar"
    currency: str = "DZD"
    currency_symbol: str = "دج"
    decimal_separator: str = "."
    thousands_separator: str = ","
    rtl: bool = True


class SystemSettings(BaseModel):
    datetime: DateTimeSettings = DateTimeSettings()
    locale: LocaleSettings = LocaleSettings()
    timezone: str = "Africa/Algiers"


# ============ ROUTES ============

def create_settings_routes(db, get_current_user) -> dict:
    """Create settings routes with database dependency"""
    block_cashier = create_cashier_block(get_current_user)

    @router.get("/datetime")
    async def get_datetime_settings(user=Depends(block_cashier)):
        """Get date/time format settings"""
        try:
            settings = await db.settings.find_one(
                {"type": "datetime"},
                {"_id": 0}
            )
            if settings:
                return DateTimeSettings(**settings.get("config", {}))
        except Exception:
            pass
        # Return defaults with Western numerals
        return DateTimeSettings(
            short_date_format="dd/MM/yyyy",
            long_date_format="dd MMMM yyyy",
            time_format="HH:mm:ss",
            use_western_numerals=True,
            language="ar"
        )
    
    @router.put("/datetime")
    async def update_datetime_settings(settings: DateTimeSettings, user=Depends(block_cashier)):
        """Update date/time format settings"""
        await db.settings.update_one(
            {"type": "datetime"},
            {
                "$set": {
                    "type": "datetime",
                    "config": settings.dict(),
                    "updated_by": user["id"],
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            },
            upsert=True
        )
        
        return {
            "success": True,
            "message": "تم تحديث إعدادات التاريخ والوقت بنجاح",
            "settings": settings.dict()
        }
    
    @router.get("/locale")
    async def get_locale_settings(user=Depends(block_cashier)):
        """Get locale settings"""
        settings = await db.settings.find_one(
            {"type": "locale"},
            {"_id": 0}
        )
        
        if settings:
            return LocaleSettings(**settings.get("config", {}))
        
        return LocaleSettings()
    
    @router.put("/locale")
    async def update_locale_settings(settings: LocaleSettings, user=Depends(block_cashier)):
        """Update locale settings"""
        await db.settings.update_one(
            {"type": "locale"},
            {
                "$set": {
                    "type": "locale",
                    "config": settings.dict(),
                    "updated_by": user["id"],
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            },
            upsert=True
        )
        
        return {
            "success": True,
            "message": "تم تحديث إعدادات اللغة والمنطقة بنجاح",
            "settings": settings.dict()
        }
    
    @router.get("/all")
    async def get_all_settings(user=Depends(block_cashier)):
        """Get all system settings"""
        datetime_settings = await db.settings.find_one({"type": "datetime"}, {"_id": 0})
        locale_settings = await db.settings.find_one({"type": "locale"}, {"_id": 0})
        
        return {
            "datetime": DateTimeSettings(**datetime_settings.get("config", {})) if datetime_settings else DateTimeSettings(),
            "locale": LocaleSettings(**locale_settings.get("config", {})) if locale_settings else LocaleSettings(),
            "timezone": "Africa/Algiers"
        }
    
    @router.post("/reset-datetime")
    async def reset_datetime_settings(user=Depends(block_cashier)):
        """Reset date/time settings to defaults with Western numerals"""
        default_settings = DateTimeSettings(
            short_date_format="dd/MM/yyyy",
            long_date_format="dd MMMM yyyy",
            time_format="HH:mm:ss",
            use_western_numerals=True,
            language="ar"
        )
        
        await db.settings.update_one(
            {"type": "datetime"},
            {
                "$set": {
                    "type": "datetime",
                    "config": default_settings.dict(),
                    "updated_by": user["id"],
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            },
            upsert=True
        )
        
        return {
            "success": True,
            "message": "تم إعادة ضبط إعدادات التاريخ والوقت للقيم الافتراضية",
            "settings": default_settings.dict()
        }
    
    @router.get("/datetime/preview")
    async def preview_datetime_format(
        short_date_format: str = "dd/MM/yyyy",
        long_date_format: str = "dd MMMM yyyy",
        time_format: str = "HH:mm:ss",
        use_western_numerals: bool = True,
        user=Depends(block_cashier)
    ):
        """Preview date/time format with current date"""
        from utils.datetime_formatter import DateTimeFormatter
        
        formatter = DateTimeFormatter(
            short_date_format=short_date_format,
            long_date_format=long_date_format,
            time_format=time_format,
            use_western_numerals=use_western_numerals,
            language="ar"
        )
        
        now = datetime.now(timezone.utc)
        
        return {
            "current_datetime": now.isoformat(),
            "formatted": {
                "short_date": formatter.format_short_date(now),
                "long_date": formatter.format_long_date(now),
                "time": formatter.format_time(now),
                "datetime": formatter.format_datetime(now)
            },
            "settings": {
                "short_date_format": short_date_format,
                "long_date_format": long_date_format,
                "time_format": time_format,
                "use_western_numerals": use_western_numerals
            }
        }
    
    return router
