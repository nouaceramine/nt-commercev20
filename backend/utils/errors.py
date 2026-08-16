"""
Unified Error Handling for NT Commerce
"""
from fastapi import Request
from fastapi.responses import JSONResponse
import logging
import traceback
import uuid
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class AppException(Exception):
    def __init__(self, message: str, status_code: int = 400, error_code: str = "APP_ERROR"):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code


def validate_password_strength(password: str) -> str:
    """Validate password meets security requirements. Returns error message or empty string."""
    if len(password) < 8:
        return "كلمة المرور يجب أن تكون 8 أحرف على الأقل"
    if not any(c.isupper() for c in password):
        return "كلمة المرور يجب أن تحتوي على حرف كبير"
    if not any(c.islower() for c in password):
        return "كلمة المرور يجب أن تحتوي على حرف صغير"
    if not any(c.isdigit() for c in password):
        return "كلمة المرور يجب أن تحتوي على رقم"
    return ""


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.error_code, "message": exc.message},
    )


async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(f"Unhandled error: {exc}\n{traceback.format_exc()}")
    # p133: persist to system_logs with 5-minute dedup (count increments)
    try:
        from config.database import main_db
        import os, httpx
        msg = f"{type(exc).__name__}: {exc}"[:500]
        path = request.url.path
        now = datetime.now(timezone.utc)
        five_min_ago = datetime.fromtimestamp(now.timestamp() - 300, timezone.utc)
        existing = await main_db.system_logs.find_one(
            {"source": "backend", "type": "exception", "message": msg, "url": path,
             "created_at": {"$gte": five_min_ago.isoformat()}})
        if existing:
            await main_db.system_logs.update_one(
                {"id": existing["id"]},
                {"$inc": {"occurrences": 1}, "$set": {"created_at": now.isoformat()}})
        else:
            await main_db.system_logs.insert_one({
                "id": str(uuid.uuid4()), "level": "error", "source": "backend",
                "type": "exception", "message": msg, "url": path,
                "stack": traceback.format_exc()[-3000:], "occurrences": 1,
                "created_at": now.isoformat(),
            })
            # optional Telegram alert (active once the platform bot token is set)
            token = os.environ.get("TELEGRAM_ALERT_BOT_TOKEN")
            chat = os.environ.get("TELEGRAM_ALERT_CHAT_ID")
            if token and chat:
                try:
                    async with httpx.AsyncClient(timeout=8) as client:
                        await client.post(
                            f"https://api.telegram.org/bot{token}/sendMessage",
                            json={"chat_id": chat,
                                  "text": f"🚨 خطأ خلفي غير معالج\n{path}\n{msg}"})
                except Exception:
                    pass
    except Exception:
        pass  # never let error-tracking break the error response
    return JSONResponse(
        status_code=500,
        content={"error": "INTERNAL_ERROR", "message": "حدث خطأ داخلي في النظام"},
    )
