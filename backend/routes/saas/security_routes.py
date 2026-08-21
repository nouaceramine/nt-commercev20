"""Security status routes (p226) — field-encryption status + one-time secret migration."""
from fastapi import APIRouter, Depends
import logging

from config.database import main_db, get_tenant_db
from .helpers import get_super_admin
from services.crypto_fields import is_crypto_available, key_fingerprint, encrypt_field, decrypt_field

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Security (p226)"])


@router.get("/saas/security/encryption-status")
async def encryption_status(admin: dict = Depends(get_super_admin)):
    """Report field-encryption availability and at-rest coverage of managed secrets."""
    bridge_secrets = {"encrypted": 0, "plaintext": 0}
    async for t in main_db.saas_tenants.find({"is_active": {"$ne": False}}, {"_id": 0, "id": 1}):
        try:
            doc = await get_tenant_db(t["id"]).settings.find_one(
                {"key": "bridge_secret"}, {"_id": 0, "value": 1})
            if doc and doc.get("value"):
                k = "encrypted" if str(doc["value"]).startswith("v1.") else "plaintext"
                bridge_secrets[k] += 1
        except Exception:  # noqa: BLE001
            continue
    api_keys = {"encrypted": 0, "plaintext": 0}
    async for t in main_db.saas_tenants.find(
        {"self_bridge_api_key": {"$nin": ["", None]}}, {"_id": 0, "self_bridge_api_key": 1}):
        k = "encrypted" if str(t["self_bridge_api_key"]).startswith("v1.") else "plaintext"
        api_keys[k] += 1
    return {
        "available": is_crypto_available(),
        "key_fingerprint": key_fingerprint(),
        "algorithm": "AES-256-GCM",
        "managed_fields": ["bridge_secret", "self_bridge_api_key"],
        "bridge_secrets": bridge_secrets,
        "bridge_api_keys": api_keys,
    }


@router.post("/saas/security/encrypt-secrets-now")
async def encrypt_secrets_now(admin: dict = Depends(get_super_admin)):
    """One-time migration: encrypt EXISTING plaintext secrets in place.

    Safe scope (report §7): secrets only — never indexed operational fields,
    never business data. Re-running is a no-op (already-v1 values skipped).
    """
    if not is_crypto_available():
        return {"ok": False, "detail": "FIELD_ENCRYPTION_KEY غير مضبوط"}
    migrated = {"bridge_secrets": 0, "bridge_api_keys": 0}
    async for t in main_db.saas_tenants.find({"is_active": {"$ne": False}}, {"_id": 0, "id": 1}):
        try:
            tdb = get_tenant_db(t["id"])
            doc = await tdb.settings.find_one({"key": "bridge_secret"}, {"_id": 0, "value": 1})
            if doc and doc.get("value") and not str(doc["value"]).startswith("v1."):
                await tdb.settings.update_one(
                    {"key": "bridge_secret"},
                    {"$set": {"value": encrypt_field(doc["value"])}},
                )
                migrated["bridge_secrets"] += 1
        except Exception:  # noqa: BLE001
            logger.exception("bridge secret migration failed for %s", t["id"])
    async for t in main_db.saas_tenants.find(
        {"self_bridge_api_key": {"$nin": ["", None]}}, {"_id": 0, "id": 1, "self_bridge_api_key": 1}):
        if not str(t["self_bridge_api_key"]).startswith("v1."):
            await main_db.saas_tenants.update_one(
                {"id": t["id"]},
                {"$set": {"self_bridge_api_key": encrypt_field(t["self_bridge_api_key"])}},
            )
            migrated["bridge_api_keys"] += 1
    logger.info("p226 secret migration by %s: %s", admin.get("email"), migrated)
    return {"ok": True, "migrated": migrated}
