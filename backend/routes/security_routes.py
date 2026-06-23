"""
Advanced Security Routes
Collections: security_logs, blocked_ips, login_attempts, audit_logs, api_keys, user_sessions
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import secrets
import logging

logger = logging.getLogger(__name__)


def create_security_routes(db, main_db, get_current_user, get_super_admin) -> dict:
    router = APIRouter(prefix="/security", tags=["security"])

    # ── Security Logs ──
    @router.get("/logs")
    async def get_security_logs(
        event_type: Optional[str] = None,
        severity: Optional[str] = None,
        limit: int = 100,
        admin: dict = Depends(get_super_admin)
    ):
        query = {}
        if event_type:
            query["event_type"] = event_type
        if severity:
            query["severity"] = severity
        return await main_db.security_logs.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)

    @router.get("/logs/stats")
    async def get_security_stats(admin: dict = Depends(get_super_admin)):
        total = await main_db.security_logs.count_documents({})
        critical = await main_db.security_logs.count_documents({"severity": "critical"})
        warning = await main_db.security_logs.count_documents({"severity": "warning"})
        blocked = await main_db.blocked_ips.count_documents({})
        failed_logins = await main_db.login_attempts.count_documents({"success": False})
        return {
            "total_events": total,
            "critical": critical,
            "warnings": warning,
            "blocked_ips": blocked,
            "failed_logins_total": failed_logins,
        }

    # ── Blocked IPs ──
    @router.get("/blocked-ips")
    async def get_blocked_ips(admin: dict = Depends(get_super_admin)):
        return await main_db.blocked_ips.find({}, {"_id": 0}).sort("blocked_at", -1).to_list(200)

    @router.post("/blocked-ips")
    async def block_ip(data: dict, admin: dict = Depends(get_super_admin)):
        ip = data.get("ip_address", "")
        if not ip:
            raise HTTPException(status_code=400, detail="عنوان IP مطلوب")
        expires = data.get("duration_hours")
        entry = {
            "id": str(uuid.uuid4()),
            "ip_address": ip,
            "reason": data.get("reason", "حظر يدوي"),
            "blocked_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=expires)).isoformat() if expires else None,
            "blocked_by": admin.get("name", admin.get("email", "")),
        }
        await main_db.blocked_ips.insert_one(entry)
        await main_db.security_logs.insert_one({
            "id": str(uuid.uuid4()),
            "event_type": "ip_blocked",
            "severity": "warning",
            "ip_address": ip,
            "user_id": admin.get("id"),
            "details": {"reason": entry["reason"]},
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        entry.pop("_id", None)
        return entry

    @router.delete("/blocked-ips/{block_id}")
    async def unblock_ip(block_id: str, admin: dict = Depends(get_super_admin)):
        entry = await main_db.blocked_ips.find_one({"id": block_id}, {"_id": 0})
        if entry:
            await main_db.security_logs.insert_one({
                "id": str(uuid.uuid4()),
                "event_type": "ip_unblocked",
                "severity": "info",
                "ip_address": entry.get("ip_address", ""),
                "user_id": admin.get("id"),
                "details": {},
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        await main_db.blocked_ips.delete_one({"id": block_id})
        return {"message": "تم رفع الحظر"}

    # ── Login Attempts ──
    @router.get("/login-attempts")
    async def get_login_attempts(
        success: Optional[bool] = None,
        limit: int = 100,
        admin: dict = Depends(get_super_admin)
    ):
        query = {}
        if success is not None:
            query["success"] = success
        return await main_db.login_attempts.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)

    # ── Audit Logs ──
    @router.get("/audit-logs")
    async def get_audit_logs(
        action: Optional[str] = None,
        entity_type: Optional[str] = None,
        user_id: Optional[str] = None,
        limit: int = 100,
        admin: dict = Depends(get_super_admin)
    ):
        query = {}
        if action:
            query["action"] = action
        if entity_type:
            query["entity_type"] = entity_type
        if user_id:
            query["user_id"] = user_id
        return await main_db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)

    # ── API Keys ──
    @router.post("/api-keys")
    async def create_api_key(data: dict, admin: dict = Depends(get_super_admin)):
        key = secrets.token_urlsafe(32)
        entry = {
            "id": str(uuid.uuid4()),
            "tenant_id": data.get("tenant_id", ""),
            "key_name": data.get("key_name", "Default"),
            "api_key": key,
            "permissions": data.get("permissions", ["read"]),
            "is_active": True,
            "created_by": admin.get("name", admin.get("email", "")),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await main_db.api_keys.insert_one(entry)
        entry.pop("_id", None)
        return entry

    @router.get("/api-keys")
    async def get_api_keys(admin: dict = Depends(get_super_admin)):
        keys = await main_db.api_keys.find({}, {"_id": 0}).to_list(100)
        for k in keys:
            k["api_key"] = k["api_key"][:8] + "..." if k.get("api_key") else ""
        return keys

    @router.delete("/api-keys/{key_id}")
    async def delete_api_key(key_id: str, admin: dict = Depends(get_super_admin)):
        await main_db.api_keys.delete_one({"id": key_id})
        return {"message": "تم حذف المفتاح"}

    @router.put("/api-keys/{key_id}/toggle")
    async def toggle_api_key(key_id: str, admin: dict = Depends(get_super_admin)):
        key = await main_db.api_keys.find_one({"id": key_id})
        if not key:
            raise HTTPException(status_code=404, detail="المفتاح غير موجود")
        new_state = not key.get("is_active", True)
        await main_db.api_keys.update_one({"id": key_id}, {"$set": {"is_active": new_state}})
        return {"is_active": new_state}

    # ── Active Sessions ──
    @router.get("/sessions")
    async def get_active_sessions(admin: dict = Depends(get_super_admin)):
        now = datetime.now(timezone.utc).isoformat()
        return await main_db.user_sessions.find(
            {"expires_at": {"$gt": now}}, {"_id": 0}
        ).sort("created_at", -1).to_list(200)

    @router.delete("/sessions/{session_id}")
    async def terminate_session(session_id: str, admin: dict = Depends(get_super_admin)):
        await main_db.user_sessions.delete_one({"id": session_id})
        return {"message": "تم إنهاء الجلسة"}

    return router
