"""p120: Global identity registry — one email = one account across the whole platform.

identity_registry (main_db): {email*, kind, user_id, tenant_id, name, is_active, created_at, updated_at}
  kind: platform (super admin / main users) | agent | owner (tenant subscriber) | employee (tenant staff)
Every account-creation path must: assert_email_globally_free() THEN register_identity().
Every delete/deactivate path must: remove_identity() / set_identity_active().
"""
from datetime import datetime, timezone
import logging
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError
from config.database import main_db

logger = logging.getLogger(__name__)

COLLECTION = "identity_registry"

_KIND_AR = {
    "platform": "مستخدم المنصة",
    "agent": "وكيل",
    "owner": "مشترك (صاحب متجر)",
    "employee": "موظف في متجر آخر",
}


async def ensure_identity_index():
    """Unique email index — hard DB-level guarantee. Idempotent and fail-closed."""
    try:
        await main_db[COLLECTION].create_index("email", unique=True)
        return True
    except Exception as exc:
        logger.error("identity email unique index unavailable: %s", type(exc).__name__)
        return False


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


async def reserve_identity(email: str, kind: str, user_id: str, tenant_id: str = None, name: str = "", is_active: bool = True):
    """Atomically reserve a new identity; concurrent creators cannot overwrite one another."""
    e = _norm(email)
    if not e or not user_id:
        raise HTTPException(status_code=400, detail="بيانات الهوية غير صالحة")
    if not await ensure_identity_index():
        raise HTTPException(status_code=503, detail="خدمة التحقق من الهوية غير متاحة مؤقتاً")
    now = datetime.now(timezone.utc).isoformat()
    try:
        await main_db[COLLECTION].insert_one({
            "email": e, "kind": kind, "user_id": user_id, "tenant_id": tenant_id,
            "name": name, "is_active": is_active, "created_at": now, "updated_at": now,
        })
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="هذا البريد مستخدم مسبقاً في المنصة")


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

# ---------- p500-001: orphan-identity reaper ----------
# An "orphan" is an owner identity whose tenant record no longer exists
# (manual DB/doc deletion, or a deletion path that predates cascade cleanup).
# Orphans block re-registration with the same email forever. Reaping is
# fail-safe: any doubt (young record, live DB, non-owner kind) => skip.

from uuid import uuid4 as _uuid4


def _identity_age_seconds(doc: dict) -> float:
    """Age from updated_at/created_at (ISO strings); unknown age => 0 (young)."""
    from datetime import datetime, timezone
    raw = doc.get("updated_at") or doc.get("created_at")
    if not raw:
        return 0.0
    try:
        ts = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return max(0.0, (datetime.now(timezone.utc) - ts).total_seconds())
    except Exception:
        return 0.0


async def _identity_db_alive(mongo_client, tenant_id: str) -> bool:
    """True if a legacy-named DB for this tenant still exists (live data)."""
    if mongo_client is None or not tenant_id:
        return False
    legacy = "tenant_" + tenant_id.replace("-", "_")
    try:
        return legacy in await mongo_client.list_database_names()
    except Exception:
        return True  # fail safe: cannot enumerate => assume alive


async def reap_stale_identity(email: str, mongo_client=None, grace_seconds: int = 3600) -> bool:
    """Free one stale owner identity so the email can register again.

    Reaps only when ALL hold: kind == owner, no saas_tenants doc for its
    tenant_id, identity older than grace, and no legacy tenant DB still alive.
    Every reap is written to platform_audit_log. Returns True if reaped.
    """
    e = _norm(email)
    if not e:
        return False
    hit = await main_db[COLLECTION].find_one({"email": e}, {"_id": 0})
    if not hit or hit.get("kind") != "owner":
        return False
    tenant_id = hit.get("tenant_id") or hit.get("user_id")
    if tenant_id:
        tenant = await main_db.saas_tenants.find_one({"id": tenant_id}, {"_id": 1})
        if tenant:
            return False
    if _identity_age_seconds(hit) < grace_seconds:
        return False
    if await _identity_db_alive(mongo_client, tenant_id):
        logger.warning("identity reaper: skipping %s — legacy DB still exists", e)
        return False
    await main_db[COLLECTION].delete_one({"email": e, "kind": "owner"})
    now = datetime.now(timezone.utc).isoformat()
    await main_db.platform_audit_log.insert_one({
        "id": str(_uuid4()),
        "action": "identity_orphan_reaped",
        "tenant_id": tenant_id,
        "tenant_email": e,
        "performed_by": "system:identity-reaper",
        "at": now,
        "report": {"email": e, "kind": hit.get("kind"), "grace_seconds": grace_seconds},
    })
    logger.info("identity reaper freed stale owner identity: %s (tenant %s)", e, tenant_id)
    return True


async def reap_orphan_identities(mongo_client=None, grace_seconds: int = 6 * 3600) -> int:
    """Periodic sweep: reap every stale owner identity. Returns reap count."""
    cursor = main_db[COLLECTION].find({"kind": "owner"}, {"_id": 0})
    reaped = 0
    async for doc in cursor:
        try:
            if await reap_stale_identity(doc.get("email", ""), mongo_client, grace_seconds):
                reaped += 1
        except Exception as exc:
            logger.warning("identity reaper item failed (%s): %s", doc.get("email"), exc)
    return reaped
