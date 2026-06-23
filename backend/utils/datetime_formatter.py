"""
Date/Time Format Configuration Service
Supports Western (Latin) numerals and customizable date/time formats
"""
from datetime import datetime, timezone
from typing import Optional
import re


class DateTimeFormatter:
    """Service for formatting dates and times with configurable formats and numerals"""
    
    # Default formats
    DEFAULT_SHORT_DATE = "dd/MM/yyyy"
    DEFAULT_LONG_DATE = "dd MMMM yyyy"
    DEFAULT_TIME = "HH:mm:ss"
    
    # Arabic month names
    ARABIC_MONTHS = {
        1: "يناير", 2: "فبراير", 3: "مارس", 4: "أبريل",
        5: "مايو", 6: "يونيو", 7: "يوليو", 8: "أغسطس",
        9: "سبتمبر", 10: "أكتوبر", 11: "نوفمبر", 12: "ديسمبر"
    }
    
    # French month names
    FRENCH_MONTHS = {
        1: "Janvier", 2: "Février", 3: "Mars", 4: "Avril",
        5: "Mai", 6: "Juin", 7: "Juillet", 8: "Août",
        9: "Septembre", 10: "Octobre", 11: "Novembre", 12: "Décembre"
    }
    
    # Arabic day names
    ARABIC_DAYS = {
        0: "الاثنين", 1: "الثلاثاء", 2: "الأربعاء", 3: "الخميس",
        4: "الجمعة", 5: "السبت", 6: "الأحد"
    }
    
    # French day names
    FRENCH_DAYS = {
        0: "Lundi", 1: "Mardi", 2: "Mercredi", 3: "Jeudi",
        4: "Vendredi", 5: "Samedi", 6: "Dimanche"
    }
    
    # Arabic-Indic numerals mapping
    ARABIC_NUMERALS = {'0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤',
                       '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩'}
    
    def __init__(self, 
                 short_date_format: str = None,
                 long_date_format: str = None,
                 time_format: str = None,
                 use_western_numerals: bool = True,
                 language: str = "ar"):
        """
        Initialize formatter with custom formats
        
        Args:
            short_date_format: Format for short dates (e.g., "dd/MM/yyyy")
            long_date_format: Format for long dates (e.g., "dd MMMM yyyy")
            time_format: Format for time (e.g., "HH:mm:ss")
            use_western_numerals: True for Western (0-9), False for Arabic (٠-٩)
            language: Language for month/day names ("ar" or "fr")
        """
        self.short_date_format = short_date_format or self.DEFAULT_SHORT_DATE
        self.long_date_format = long_date_format or self.DEFAULT_LONG_DATE
        self.time_format = time_format or self.DEFAULT_TIME
        self.use_western_numerals = use_western_numerals
        self.language = language
    
    def _convert_numerals(self, text: str) -> str:
        """Convert numerals based on settings"""
        if self.use_western_numerals:
            # Convert Arabic numerals to Western
            for ar, western in [('٠', '0'), ('١', '1'), ('٢', '2'), ('٣', '3'), ('٤', '4'),
                                ('٥', '5'), ('٦', '6'), ('٧', '7'), ('٨', '8'), ('٩', '9')]:
                text = text.replace(ar, western)
        else:
            # Convert Western numerals to Arabic
            for western, ar in self.ARABIC_NUMERALS.items():
                text = text.replace(western, ar)
        return text
    
    def _get_month_name(self, month: int, short: bool = False) -> str:
        """Get month name in the configured language"""
        if self.language == "ar":
            return self.ARABIC_MONTHS.get(month, str(month))
        return self.FRENCH_MONTHS.get(month, str(month))
    
    def _get_day_name(self, weekday: int, short: bool = False) -> str:
        """Get day name in the configured language"""
        if self.language == "ar":
            return self.ARABIC_DAYS.get(weekday, str(weekday))
        return self.FRENCH_DAYS.get(weekday, str(weekday))
    
    def _apply_format(self, dt: datetime, format_str: str) -> str:
        """Apply custom format to datetime"""
        result = format_str
        
        # Year
        result = result.replace("yyyy", str(dt.year))
        result = result.replace("yy", str(dt.year)[-2:])
        
        # Month
        result = result.replace("MMMM", self._get_month_name(dt.month))
        result = result.replace("MMM", self._get_month_name(dt.month, short=True)[:3])
        result = result.replace("MM", str(dt.month).zfill(2))
        result = result.replace("M", str(dt.month))
        
        # Day of month
        result = result.replace("dd", str(dt.day).zfill(2))
        result = result.replace("d", str(dt.day))
        
        # Day of week
        result = result.replace("EEEE", self._get_day_name(dt.weekday()))
        result = result.replace("EEE", self._get_day_name(dt.weekday(), short=True)[:3])
        
        # Hours (24-hour)
        result = result.replace("HH", str(dt.hour).zfill(2))
        result = result.replace("H", str(dt.hour))
        
        # Hours (12-hour)
        hour_12 = dt.hour % 12 or 12
        result = result.replace("hh", str(hour_12).zfill(2))
        result = result.replace("h", str(hour_12))
        
        # AM/PM
        am_pm = "ص" if self.language == "ar" else "AM" if dt.hour < 12 else "م" if self.language == "ar" else "PM"
        result = result.replace("a", am_pm)
        
        # Minutes
        result = result.replace("mm", str(dt.minute).zfill(2))
        result = result.replace("m", str(dt.minute))
        
        # Seconds
        result = result.replace("ss", str(dt.second).zfill(2))
        result = result.replace("s", str(dt.second))
        
        # Apply numeral conversion
        result = self._convert_numerals(result)
        
        return result
    
    def format_short_date(self, dt: datetime = None) -> str:
        """Format date using short format"""
        if dt is None:
            dt = datetime.now(timezone.utc)
        return self._apply_format(dt, self.short_date_format)
    
    def format_long_date(self, dt: datetime = None) -> str:
        """Format date using long format"""
        if dt is None:
            dt = datetime.now(timezone.utc)
        return self._apply_format(dt, self.long_date_format)
    
    def format_time(self, dt: datetime = None) -> str:
        """Format time"""
        if dt is None:
            dt = datetime.now(timezone.utc)
        return self._apply_format(dt, self.time_format)
    
    def format_datetime(self, dt: datetime = None, include_time: bool = True) -> str:
        """Format date and time together"""
        if dt is None:
            dt = datetime.now(timezone.utc)
        
        date_str = self.format_short_date(dt)
        if include_time:
            time_str = self.format_time(dt)
            return f"{date_str} {time_str}"
        return date_str
    
    def format_relative(self, dt: datetime) -> str:
        """Format date relative to now (e.g., 'منذ 5 دقائق')"""
        now = datetime.now(timezone.utc)
        diff = now - dt
        
        seconds = diff.total_seconds()
        
        if self.language == "ar":
            if seconds < 60:
                return "الآن"
            elif seconds < 3600:
                minutes = int(seconds / 60)
                return f"منذ {self._convert_numerals(str(minutes))} دقيقة"
            elif seconds < 86400:
                hours = int(seconds / 3600)
                return f"منذ {self._convert_numerals(str(hours))} ساعة"
            elif seconds < 604800:
                days = int(seconds / 86400)
                return f"منذ {self._convert_numerals(str(days))} يوم"
            else:
                return self.format_short_date(dt)
        else:
            if seconds < 60:
                return "Maintenant"
            elif seconds < 3600:
                minutes = int(seconds / 60)
                return f"Il y a {self._convert_numerals(str(minutes))} minutes"
            elif seconds < 86400:
                hours = int(seconds / 3600)
                return f"Il y a {self._convert_numerals(str(hours))} heures"
            elif seconds < 604800:
                days = int(seconds / 86400)
                return f"Il y a {self._convert_numerals(str(days))} jours"
            else:
                return self.format_short_date(dt)
    
    def get_config(self) -> dict:
        """Get current configuration"""
        return {
            "short_date_format": self.short_date_format,
            "long_date_format": self.long_date_format,
            "time_format": self.time_format,
            "use_western_numerals": self.use_western_numerals,
            "language": self.language
        }
    
    def update_config(self, 
                     short_date_format: str = None,
                     long_date_format: str = None,
                     time_format: str = None,
                     use_western_numerals: bool = None,
                     language: str = None) -> dict:
        """Update configuration"""
        if short_date_format:
            self.short_date_format = short_date_format
        if long_date_format:
            self.long_date_format = long_date_format
        if time_format:
            self.time_format = time_format
        if use_western_numerals is not None:
            self.use_western_numerals = use_western_numerals
        if language:
            self.language = language


# Default formatter instance with Western numerals
default_formatter = DateTimeFormatter(
    short_date_format="dd/MM/yyyy",
    long_date_format="dd MMMM yyyy",
    time_format="HH:mm:ss",
    use_western_numerals=True,  # الأرقام الغربية
    language="ar"
)


def get_formatter(tenant_id: str = None) -> DateTimeFormatter:
    """Get formatter for a tenant (or default)"""
    # In future, load tenant-specific settings from database
    return default_formatter


# Utility functions
def format_date(dt: datetime = None, format_type: str = "short") -> str:
    """Format a date using the default formatter"""
    formatter = get_formatter()
    if format_type == "long":
        return formatter.format_long_date(dt)
    return formatter.format_short_date(dt)


def format_time(dt: datetime = None) -> str:
    """Format time using the default formatter"""
    return get_formatter().format_time(dt)


def format_datetime(dt: datetime = None) -> str:
    """Format datetime using the default formatter"""
    return get_formatter().format_datetime(dt)


def format_relative(dt: datetime) -> str:
    """Format date relative to now"""
    return get_formatter().format_relative(dt)
