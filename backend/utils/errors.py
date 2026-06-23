"""
Unified Error Handling for NT Commerce
"""
from fastapi import Request
from fastapi.responses import JSONResponse
import logging
import traceback

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
    return JSONResponse(
        status_code=500,
        content={"error": "INTERNAL_ERROR", "message": "حدث خطأ داخلي في النظام"},
    )
