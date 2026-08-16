"""p120: Global identity registry — one email = one account across the whole platform.

identity_registry (main_db): {email*, kind, user_id, tenant_id, name, is_active, created_at, updated_at}
  kind: platform (super admin / main users) | agent | owner (tenant subscriber) | employee (tenant staff)
Every account-creation path must: assert_email_globally_free() THEN register_identity().
Every delete/deactivate path must: remove_identity() / set_identity_active().
"""
from datetime import datetime, timezone
from fastapi import HTTPException
from config.database import main_db

COLLECTION = "identity_registry"

_KIND_AR = {
    "platform": "مستخدم المنصة",
    "agent": "وكيل",
    "owner": "مشترك (صاحب متجر)",
    "employee": "موظف في متجر آخر",
}


async def ensure_identity_index():
    """Unique email index — hard DB-level guarantee. Idempotent."""
    try:
        await main_db[COLLECTION].create_index("email", unique=True)
    except Exception:
        pass


def _norm(email: str) -> str:
    return (email or "").strip().lower()


async def assert_email_globally_free(email: str, exclude_user_id: str = None):
    """Raise 400 if this email already belongs to ANY account on the platform."""
    e = _norm(email)
    if not e:
        return
    hit = await main_db[COLLECTION].find_one({"email": e}, {"_id": 0})
    if hit and hit.get("user_id") != exclude_user_id:
        kind_ar = _KIND_AR.get(hit.get("kind"), "حساب آخر")
        raise HTTPException(status_code=400, detail=f"هذا البريد مستخدم مسبقاً في المنصة ({kind_ar})")


async def register_identity(email: str, kind: str, user_id: str, tenant_id: str = None, name: str = "", is_active: bool = True):
    e = _norm(email)
    if not e or not user_id:
        return
    now = datetime.now(timezone.utc).isoformat()
    await main_db[COLLECTION].update_one(
        {"email": e},
        {"$set": {"email": e, "kind": kind, "user_id": user_id, "tenant_id": tenant_id,
                  "name": name, "is_active": is_active, "updated_at": now},
         "$setOnInsert": {"created_at": now}},
        upsert=True,
    )


async def remove_identity(user_id: str = None, email: str = None):
    q = None
    if user_id:
        q = {"user_id": user_id}
    elif email:
        q = {"email": _norm(email)}
    if q:
        await main_db[COLLECTION].delete_one(q)


async def set_identity_active(user_id: str, is_active: bool):
    await main_db[COLLECTION].update_many(
        {"user_id": user_id},
        {"$set": {"is_active": is_active, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )


async def lookup_identity(email: str):
    """Login routing: {kind, user_id, tenant_id} or None."""
    e = _norm(email)
    if not e:
        return None
    return await main_db[COLLECTION].find_one({"email": e}, {"_id": 0})
