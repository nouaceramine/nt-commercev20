"""
Two-Factor Authentication routes (frontend calls /api/2fa/*).
"""
from fastapi import APIRouter, HTTPException, Depends

from utils.auth import tfa_clear, tfa_locked_minutes, tfa_register_failure


def create_twofa_routes(db, main_db, get_current_user) -> dict:
    router = APIRouter(prefix="/2fa", tags=["2FA"])

    import pyotp
    import qrcode
    import io
    import base64

    async def _find_user(user_id):
        user = await main_db.users.find_one({"id": user_id}, {"_id": 0})
        if user:
            return user, main_db.users
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if user:
            return user, db.users
        user = await main_db.tenants.find_one({"id": user_id}, {"_id": 0})
        if user:
            return user, main_db.tenants
        return None, None

    @router.post("/setup")
    async def setup_2fa(current_user: dict = Depends(get_current_user)):
        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)
        uri = totp.provisioning_uri(name=current_user.get("email", ""), issuer_name="NT Commerce")
        qr = qrcode.make(uri)
        buffer = io.BytesIO()
        qr.save(buffer, format="PNG")
        qr_base64 = base64.b64encode(buffer.getvalue()).decode()
        # p560: backup codes hashed at rest, consumed at login-verify
        import hashlib as _hl
        backup_codes = [pyotp.random_base32()[:8] for _ in range(6)]
        _hashes = [_hl.sha256(c.encode()).hexdigest() for c in backup_codes]
        user, coll = await _find_user(current_user["id"])
        if user is not None:
            await coll.update_one({"id": current_user["id"]}, {"$set": {
                "two_fa_secret_pending": secret, "two_fa_backup_hashes_pending": _hashes}})
        return {
            "secret": secret,
            "qr_code": f"data:image/png;base64,{qr_base64}",
            "uri": uri,
            "backup_codes": backup_codes,
        }

    @router.post("/verify")
    async def verify_2fa(data: dict, current_user: dict = Depends(get_current_user)):
        code = data.get("code", "")
        user, coll = await _find_user(current_user["id"])
        if not user:
            raise HTTPException(status_code=404, detail="المستخدم غير موجود")
        secret = user.get("two_fa_secret_pending") or user.get("two_fa_secret")
        if not secret:
            raise HTTPException(status_code=400, detail="قم بإعداد 2FA أولا")
        _lock = await tfa_locked_minutes(current_user["id"])
        if _lock:
            raise HTTPException(status_code=429, detail=f"محاولات كثيرة خاطئة — حاول بعد {_lock} دقيقة")
        totp = pyotp.TOTP(secret)
        if totp.verify(code):
            await tfa_clear(current_user["id"])
            await coll.update_one(
                {"id": current_user["id"]},
                {"$set": {"two_fa_secret": secret, "two_fa_enabled": True,
                          "two_fa_backup_hashes": user.get("two_fa_backup_hashes_pending") or []},
                 "$unset": {"two_fa_secret_pending": "", "two_fa_backup_hashes_pending": ""}},
            )
            return {"message": "تم تفعيل المصادقة الثنائية بنجاح", "enabled": True}
        if await tfa_register_failure(current_user["id"]):
            raise HTTPException(status_code=429, detail="محاولات كثيرة خاطئة — حاول لاحقاً")
        raise HTTPException(status_code=400, detail="الرمز غير صحيح")

    @router.post("/disable")
    async def disable_2fa(data: dict, current_user: dict = Depends(get_current_user)):
        code = data.get("code", "")
        user, coll = await _find_user(current_user["id"])
        if not user or not user.get("two_fa_secret"):
            raise HTTPException(status_code=400, detail="2FA غير مفعل")
        _lock = await tfa_locked_minutes(current_user["id"])
        if _lock:
            raise HTTPException(status_code=429, detail=f"محاولات كثيرة خاطئة — حاول بعد {_lock} دقيقة")
        totp = pyotp.TOTP(user["two_fa_secret"])
        if totp.verify(code):
            await tfa_clear(current_user["id"])
            await coll.update_one(
                {"id": current_user["id"]},
                {"$set": {"two_fa_enabled": False},
                 "$unset": {"two_fa_secret": "", "two_fa_secret_pending": "",
                            "two_fa_backup_hashes": "", "two_fa_backup_hashes_pending": ""}},
            )
            return {"message": "تم إلغاء تفعيل المصادقة الثنائية", "enabled": False}
        if await tfa_register_failure(current_user["id"]):
            raise HTTPException(status_code=429, detail="محاولات كثيرة خاطئة — حاول لاحقاً")
        raise HTTPException(status_code=400, detail="الرمز غير صحيح")

    @router.get("/status")
    async def get_2fa_status(current_user: dict = Depends(get_current_user)):
        user, _ = await _find_user(current_user["id"])
        return {"enabled": user.get("two_fa_enabled", False) if user else False}

    return router
