"""Security status routes (p226) — field-encryption status + one-time secret migration."""
from fastapi import APIRouter, Depends
import logging

from config.database import main_db, get_tenant_db
from .helpers import get_super_admin
from services.crypto_fields import is_crypto_available, key_fingerprint, encrypt_field, decrypt_field  # p272: extended stores below

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

    # ── p272: extended coverage — integration credentials + notification tokens ──
    from services.crypto_fields import SENSITIVE_CRED_KEYS as _SCK

    def _k(v):
        return "encrypted" if str(v).startswith("v1.") else "plaintext"

    stores = {
        "ecom_integrations_credentials": {"encrypted": 0, "plaintext": 0},
        "email_integration_settings": {"encrypted": 0, "plaintext": 0},
        "system_settings_email": {"encrypted": 0, "plaintext": 0},
        "whatsapp_settings": {"encrypted": 0, "plaintext": 0},
        "store_settings_tokens": {"encrypted": 0, "plaintext": 0},
    }
    async for t in main_db.saas_tenants.find({"is_active": {"$ne": False}}, {"_id": 0, "id": 1}):
        try:
            tdb = get_tenant_db(t["id"])
            async for intg in tdb.ecom_integrations.find({}, {"_id": 0, "credentials": 1}):
                for k, v in (intg.get("credentials") or {}).items():
                    if k in _SCK and isinstance(v, str) and v:
                        stores["ecom_integrations_credentials"][_k(v)] += 1
            doc = await tdb.email_integration_settings.find_one({}, {"_id": 0, "api_key": 1})
            if doc and doc.get("api_key"):
                stores["email_integration_settings"][_k(doc["api_key"])] += 1
            for _stype, _keys in (("sendgrid_settings", ("api_key",)), ("email_settings", ("resend_api_key",))):
                doc = await tdb.system_settings.find_one({"type": _stype}, {"_id": 0})
                for k in _keys:
                    v = (doc or {}).get(k)
                    if v:
                        stores["system_settings_email"][_k(v)] += 1
            doc = await tdb.whatsapp_settings.find_one({}, {"_id": 0, "access_token": 1})
            if doc and doc.get("access_token"):
                stores["whatsapp_settings"][_k(doc["access_token"])] += 1
            doc = await tdb.store_settings.find_one(
                {}, {"_id": 0, "fb_access_token": 1, "tiktok_access_token": 1, "telegram_bot_token": 1})
            for k in ("fb_access_token", "tiktok_access_token", "telegram_bot_token"):
                v = (doc or {}).get(k)
                if v:
                    stores["store_settings_tokens"][_k(v)] += 1
        except Exception:  # noqa: BLE001
            continue
    platform = {"email_api_keys": {"encrypted": 0, "plaintext": 0},
                "alert_telegram_token": {"encrypted": 0, "plaintext": 0}}
    doc = await main_db.platform_settings.find_one({"_id": "email_settings"}, {"_id": 0})
    for k in ("resend_api_key", "sendgrid_api_key", "brevo_api_key"):
        v = (doc or {}).get(k)
        if v:
            platform["email_api_keys"][_k(v)] += 1
    doc = await main_db.platform_settings.find_one({"_id": "alert_settings"}, {"_id": 0})
    if (doc or {}).get("telegram_bot_token"):
        platform["alert_telegram_token"][_k(doc["telegram_bot_token"])] += 1
    return {
        "available": is_crypto_available(),
        "key_fingerprint": key_fingerprint(),
        "algorithm": "AES-256-GCM",
        "managed_fields": [
            "bridge_secret", "self_bridge_api_key",
            # p272
            "ecom_integrations.credentials.*", "email_integration_settings.api_key",
            "system_settings(sendgrid).api_key", "system_settings(email).resend_api_key",
            "whatsapp_settings.access_token",
            "store_settings.fb/tiktok_access_token+telegram_bot_token",
            "platform_settings(email).*_api_key", "platform_settings(alert).telegram_bot_token",
        ],
        "bridge_secrets": bridge_secrets,
        "bridge_api_keys": api_keys,
        "stores": stores,
        "platform": platform,
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

    # ── p272: migrate the extended secret stores ──
    from services.crypto_fields import (
        SENSITIVE_CRED_KEYS as _SCK,
        encrypt_credentials as _enc_creds,
    )
    migrated.update({
        "ecom_integrations_credentials": 0,
        "email_integration_settings": 0,
        "system_settings_email": 0,
        "whatsapp_settings": 0,
        "store_settings_tokens": 0,
        "platform_email_keys": 0,
        "platform_alert_telegram": 0,
    })
    async for t in main_db.saas_tenants.find({"is_active": {"$ne": False}}, {"_id": 0, "id": 1}):
        try:
            tdb = get_tenant_db(t["id"])
            async for intg in tdb.ecom_integrations.find({}, {"_id": 1, "credentials": 1}):
                creds = intg.get("credentials") or {}
                enc = _enc_creds(creds)
                if enc != creds:
                    await tdb.ecom_integrations.update_one(
                        {"_id": intg["_id"]}, {"$set": {"credentials": enc}})
                    migrated["ecom_integrations_credentials"] += 1
            doc = await tdb.email_integration_settings.find_one({}, {"_id": 1, "api_key": 1})
            if doc and doc.get("api_key") and not str(doc["api_key"]).startswith("v1."):
                await tdb.email_integration_settings.update_one(
                    {"_id": doc["_id"]}, {"$set": {"api_key": encrypt_field(doc["api_key"])}})
                migrated["email_integration_settings"] += 1
            for _stype, _keys in (("sendgrid_settings", ("api_key",)), ("email_settings", ("resend_api_key",))):
                doc = await tdb.system_settings.find_one({"type": _stype})
                if not doc:
                    continue
                _set = {}
                for k in _keys:
                    v = doc.get(k)
                    if v and not str(v).startswith("v1."):
                        _set[k] = encrypt_field(v)
                if _set:
                    await tdb.system_settings.update_one({"_id": doc["_id"]}, {"$set": _set})
                    migrated["system_settings_email"] += len(_set)
            doc = await tdb.whatsapp_settings.find_one({}, {"_id": 1, "access_token": 1})
            if doc and doc.get("access_token") and not str(doc["access_token"]).startswith("v1."):
                await tdb.whatsapp_settings.update_one(
                    {"_id": doc["_id"]}, {"$set": {"access_token": encrypt_field(doc["access_token"])}})
                migrated["whatsapp_settings"] += 1
            doc = await tdb.store_settings.find_one(
                {}, {"_id": 1, "fb_access_token": 1, "tiktok_access_token": 1, "telegram_bot_token": 1})
            if doc:
                _set = {}
                for k in ("fb_access_token", "tiktok_access_token", "telegram_bot_token"):
                    v = doc.get(k)
                    if v and not str(v).startswith("v1."):
                        _set[k] = encrypt_field(v)
                if _set:
                    await tdb.store_settings.update_one({"_id": doc["_id"]}, {"$set": _set})
                    migrated["store_settings_tokens"] += len(_set)
        except Exception:  # noqa: BLE001
            logger.exception("p272 migration failed for tenant %s", t["id"])
    doc = await main_db.platform_settings.find_one({"_id": "email_settings"})
    if doc:
        _set = {}
        for k in ("resend_api_key", "sendgrid_api_key", "brevo_api_key"):
            v = doc.get(k)
            if v and not str(v).startswith("v1."):
                _set[k] = encrypt_field(v)
        if _set:
            await main_db.platform_settings.update_one({"_id": "email_settings"}, {"$set": _set})
            migrated["platform_email_keys"] += len(_set)
    doc = await main_db.platform_settings.find_one({"_id": "alert_settings"})
    if doc and doc.get("telegram_bot_token") and not str(doc["telegram_bot_token"]).startswith("v1."):
        await main_db.platform_settings.update_one(
            {"_id": "alert_settings"},
            {"$set": {"telegram_bot_token": encrypt_field(doc["telegram_bot_token"])}})
        migrated["platform_alert_telegram"] += 1
    logger.info("p226/p272 secret migration by %s: %s", admin.get("email"), migrated)
    return {"ok": True, "migrated": migrated}
