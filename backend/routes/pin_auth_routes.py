"""p219: PIN quick-login for tenant staff (POS-style user picker).

Public flow: shop code (tenant short_id) → user cards → 4-6 digit PIN.
PIN is bcrypt-hashed like passwords; attempts are tracked in main_db
(Mongo, worker-safe across the 4 uvicorn workers) with a 10-minute lock
after 5 failures. Tokens are minted in the exact tenant-employee shape
used by /auth/unified-login so permissions apply identically.
"""
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel


def create_pin_auth_routes(main_db, get_tenant_db, get_current_user, get_tenant_admin,
                           hash_password, verify_password, create_access_token, limiter=None) -> dict:
    router = APIRouter(prefix="/auth/pin", tags=["pin-auth"])

    PIN_MIN, PIN_MAX = 4, 6
    MAX_ATTEMPTS = 5
    LOCK_MINUTES = 10

    def _now():
        return datetime.now(timezone.utc)

    def _valid_pin(pin: str) -> bool:
        return bool(re.fullmatch(r"\d{%d,%d}" % (PIN_MIN, PIN_MAX), (pin or "").strip()))

    async def _resolve_tenant(shop_code: str):
        code = (shop_code or "").strip()
        if not code:
            return None
        return await main_db.saas_tenants.find_one(
            {"$or": [{"short_id": code.upper()}, {"short_id": code}, {"id": code}]},
            {"_id": 0, "id": 1, "name": 1, "company_name": 1, "is_active": 1,
             "subscription_ends_at": 1, "is_trial": 1, "short_id": 1},
        )

    def _check_tenant_access(tenant):
        if not tenant.get("is_active", True):
            raise HTTPException(status_code=403, detail="حساب المتجر معطل")
        if tenant.get("subscription_ends_at"):
            end = datetime.fromisoformat(tenant["subscription_ends_at"].replace("Z", "+00:00"))
            if end < _now() and not tenant.get("is_trial"):
                raise HTTPException(status_code=403, detail="انتهت صلاحية اشتراك المتجر")

    class PinLoginIn(BaseModel):
        shop_code: str
        user_id: str
        pin: str

    class PinSetIn(BaseModel):
        pin: str
        password: str

    class PinAdminSetIn(BaseModel):
        user_id: str
        pin: Optional[str] = None  # None/"" → disable PIN for this user

    _limit_users = limiter.limit("30/minute") if limiter else (lambda f: f)
    _limit_login = limiter.limit("10/minute") if limiter else (lambda f: f)

    @router.get("/users/{shop_code}")
    @_limit_users
    async def list_pin_users(request: Request, shop_code: str):
        """Public POS picker: staff with PIN enabled — id/name/role only."""
        tenant = await _resolve_tenant(shop_code)
        if not tenant:
            raise HTTPException(status_code=404, detail="المتجر غير موجود — تحقق من رمز المتجر")
        _check_tenant_access(tenant)
        tdb = get_tenant_db(tenant["id"])
        users = await tdb.users.find(
            {"pin_enabled": True, "is_active": {"$ne": False}},
            {"_id": 0, "id": 1, "name": 1, "role": 1},
        ).sort("name", 1).to_list(50)
        return {
            "shop": tenant.get("company_name") or tenant.get("name", ""),
            "short_id": tenant.get("short_id", ""),
            "users": users,
        }

    @router.post("/login")
    @_limit_login
    async def pin_login(request: Request, payload: PinLoginIn):
        tenant = await _resolve_tenant(payload.shop_code)
        if not tenant:
            raise HTTPException(status_code=404, detail="المتجر غير موجود — تحقق من رمز المتجر")
        _check_tenant_access(tenant)
        tdb = get_tenant_db(tenant["id"])

        key = f"{tenant['id']}:{payload.user_id}"
        now = _now()
        att = await main_db.pin_login_attempts.find_one({"_id": key})
        if att and att.get("locked_until"):
            locked_until = datetime.fromisoformat(att["locked_until"])
            if locked_until > now:
                remaining = int((locked_until - now).total_seconds() // 60) + 1
                raise HTTPException(status_code=429, detail=f"الحساب مقفل مؤقتاً — حاول بعد {remaining} دقيقة")

        user = await tdb.users.find_one({"id": payload.user_id}, {"_id": 0})
        ok = bool(
            user and user.get("pin_enabled") and user.get("pin_hash")
            and user.get("is_active", True) is not False
            and verify_password((payload.pin or "").strip(), user["pin_hash"])
        )
        if not ok:
            count = (att.get("count", 0) if att else 0) + 1
            update = {"count": count, "last_at": now.isoformat()}
            if count >= MAX_ATTEMPTS:
                update["locked_until"] = (now + timedelta(minutes=LOCK_MINUTES)).isoformat()
                update["count"] = 0
            await main_db.pin_login_attempts.update_one({"_id": key}, {"$set": update}, upsert=True)
            left = MAX_ATTEMPTS - count
            msg = "رمز PIN غير صحيح" + (f" — بقيت {left} محاولات قبل القفل" if 0 < left <= 2 else "")
            raise HTTPException(status_code=401, detail=msg)

        await main_db.pin_login_attempts.delete_one({"_id": key})
        access_token = create_access_token({
            "sub": user["id"],
            "email": user.get("email", ""),
            "role": user.get("role", "seller"),
            "type": "tenant",
            "tenant_id": tenant["id"],
            "auth_method": "pin",
        })
        return {
            "access_token": access_token,
            "user_type": "tenant",
            "redirect_to": "/",
            "user": {
                "id": user["id"],
                "email": user.get("email", ""),
                "name": user.get("name", ""),
                "role": user.get("role", "seller"),
                "company_name": tenant.get("company_name", ""),
                "permissions": user.get("permissions", {}),
                "is_employee": True,
            },
        }

    @router.post("/set")
    async def set_own_pin(payload: PinSetIn, user: dict = Depends(get_current_user)):
        """Self-service: set/change own PIN (requires current password)."""
        tenant_id = user.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=403, detail="متاح لمستخدمي المتاجر فقط")
        pin = (payload.pin or "").strip()
        if not _valid_pin(pin):
            raise HTTPException(status_code=400, detail=f"رمز PIN يجب أن يكون {PIN_MIN}-{PIN_MAX} أرقام")
        tdb = get_tenant_db(tenant_id)
        doc = await tdb.users.find_one({"id": user["id"]})
        if not doc:
            raise HTTPException(status_code=404, detail="المستخدم غير موجود")
        stored = doc.get("hashed_password") or doc.get("password")
        if not stored or not verify_password(payload.password or "", stored):
            raise HTTPException(status_code=401, detail="كلمة المرور غير صحيحة")
        await tdb.users.update_one({"id": user["id"]}, {"$set": {
            "pin_hash": hash_password(pin),
            "pin_enabled": True,
            "pin_updated_at": _now().isoformat(),
        }})
        return {"pin_enabled": True}

    @router.post("/disable")
    async def disable_own_pin(user: dict = Depends(get_current_user)):
        tenant_id = user.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=403, detail="متاح لمستخدمي المتاجر فقط")
        tdb = get_tenant_db(tenant_id)
        await tdb.users.update_one({"id": user["id"]},
                                   {"$set": {"pin_enabled": False}, "$unset": {"pin_hash": ""}})
        return {"pin_enabled": False}

    @router.post("/admin-set")
    async def admin_set_pin(payload: PinAdminSetIn, admin: dict = Depends(get_tenant_admin)):
        """Tenant admin sets/clears a staff PIN (for forgotten-PIN resets)."""
        tenant_id = admin.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=403, detail="متاح لمدير المتجر فقط")
        tdb = get_tenant_db(tenant_id)
        target = await tdb.users.find_one({"id": payload.user_id}, {"_id": 0, "id": 1})
        if not target:
            raise HTTPException(status_code=404, detail="المستخدم غير موجود")
        pin = (payload.pin or "").strip()
        # clear any lockout in both branches so the staff member can log in immediately
        await main_db.pin_login_attempts.delete_one({"_id": f"{tenant_id}:{payload.user_id}"})
        if not pin:
            await tdb.users.update_one({"id": payload.user_id},
                                       {"$set": {"pin_enabled": False}, "$unset": {"pin_hash": ""}})
            return {"pin_enabled": False}
        if not _valid_pin(pin):
            raise HTTPException(status_code=400, detail=f"رمز PIN يجب أن يكون {PIN_MIN}-{PIN_MAX} أرقام")
        await tdb.users.update_one({"id": payload.user_id}, {"$set": {
            "pin_hash": hash_password(pin),
            "pin_enabled": True,
            "pin_updated_at": _now().isoformat(),
            "pin_set_by": admin.get("name", ""),
        }})
        return {"pin_enabled": True}

    return {"pin_auth": router}
