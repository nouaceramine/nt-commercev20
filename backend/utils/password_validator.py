"""
Password Validation Utility
Enforces strong password policies for NT Commerce 12.0
"""
import re


def validate_password(password: str) -> dict:
    """
    Validate password strength. Returns dict with is_valid and errors list.
    Rules:
    - Minimum 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - At least one special character
    """
    errors = []
    if len(password) < 8:
        errors.append("كلمة المرور يجب أن تكون 8 أحرف على الأقل")
    if not re.search(r"[A-Z]", password):
        errors.append("يجب أن تحتوي على حرف كبير واحد على الأقل")
    if not re.search(r"[a-z]", password):
        errors.append("يجب أن تحتوي على حرف صغير واحد على الأقل")
    if not re.search(r"\d", password):
        errors.append("يجب أن تحتوي على رقم واحد على الأقل")
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>_\-+=\[\]\\/'`~;]", password):
        errors.append("يجب أن تحتوي على رمز خاص واحد على الأقل")
    return {"is_valid": len(errors) == 0, "errors": errors}
