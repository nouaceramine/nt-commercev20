"""
System Errors Routes
Handles system error logging, monitoring, and auto-fixing for SaaS admin
"""
from fastapi import APIRouter, HTTPException, Depends, Header, Request
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta
import uuid
import jwt
import os
import json

router = APIRouter(prefix="/saas/system-errors", tags=["System Errors"])

# Will be set from server.py
main_db = None
from utils.jwt_config import SECRET_KEY, ALGORITHM
from middleware.rate_limit import rate_limit

def init_routes(db, super_admin_dep=None) -> dict:
    """Initialize routes with dependencies from main server"""
    global main_db
    main_db = db

# Simple super admin check
async def verify_super_admin(authorization: str = Header(None)) -> dict:
    """Verify that the request is from a super admin"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="غير مصرح")
    
    try:
        token = authorization.split(" ")[1]
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("role") != "super_admin":
            raise HTTPException(status_code=403, detail="يجب أن تكون مدير أعلى")
        user = await main_db.users.find_one({"id": payload.get("sub")}, {"_id": 0, "password": 0, "hashed_password": 0})
        if not user or user.get("role") not in ("super_admin", "saas_admin") or user.get("is_active") is False:
            raise HTTPException(status_code=403, detail="الحساب غير متاح أو صلاحيته موقوفة")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="انتهت صلاحية الجلسة")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="توكن غير صالح")

# ============ MODELS ============

class SystemErrorCreate(BaseModel):
    type: Literal["api", "database", "payment", "auth", "system", "integration"]
    severity: Literal["critical", "warning", "info"]
    message: str = Field(min_length=1, max_length=4000)
    tenant_id: Optional[str] = Field(default=None, max_length=128)
    tenant_name: Optional[str] = Field(default=None, max_length=200)
    details: Optional[dict] = None
    auto_fixable: bool = False
    fix_action: Optional[str] = Field(default=None, max_length=100)

class SystemErrorResponse(BaseModel):
    id: str
    type: str
    severity: str
    message: str
    tenant_id: Optional[str] = None
    tenant_name: Optional[str] = None
    timestamp: str
    status: str  # active, resolved, in_progress
    auto_fixable: bool = False
    fix_action: Optional[str] = None
    details: Optional[dict] = None
    resolved_at: Optional[str] = None
    resolved_by: Optional[str] = None

class ErrorStats(BaseModel):
    total: int
    critical: int
    warning: int
    info: int
    resolved: int
    today: int
    active: int

class ErrorsListResponse(BaseModel):
    errors: List[SystemErrorResponse]
    stats: ErrorStats

# ============ ENDPOINTS ============

@router.get("", response_model=ErrorsListResponse)
async def get_system_errors(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    error_type: Optional[str] = None,
    limit: int = 100,
    admin: dict = Depends(verify_super_admin)
):
    """Get all system errors with optional filtering"""
    query = {}
    if status:
        query["status"] = status
    if severity:
        query["severity"] = severity
    if error_type:
        query["type"] = error_type
    
    errors = await main_db.system_errors.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    
    # Calculate stats
    all_errors = await main_db.system_errors.find({}, {"_id": 0, "severity": 1, "status": 1, "timestamp": 1}).to_list(1000)
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    stats = ErrorStats(
        total=len(all_errors),
        critical=len([e for e in all_errors if e.get("severity") == "critical"]),
        warning=len([e for e in all_errors if e.get("severity") == "warning"]),
        info=len([e for e in all_errors if e.get("severity") == "info"]),
        resolved=len([e for e in all_errors if e.get("status") == "resolved"]),
        active=len([e for e in all_errors if e.get("status") == "active"]),
        today=len([e for e in all_errors if e.get("timestamp", "").startswith(today)])
    )
    
    return ErrorsListResponse(
        errors=[SystemErrorResponse(**e) for e in errors],
        stats=stats
    )

@router.post("", response_model=SystemErrorResponse)
@rate_limit("20/minute")
async def create_system_error(request: Request, error: SystemErrorCreate):
    """Log a new system error (can be called by system or manually)"""
    if len(json.dumps(error.details or {}, ensure_ascii=False)) > 16384:
        raise HTTPException(status_code=413, detail="details too large")
    error_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    error_doc = {
        "id": error_id,
        "type": error.type,
        "severity": error.severity,
        "message": error.message,
        "tenant_id": error.tenant_id,
        "tenant_name": error.tenant_name or "النظام",
        "timestamp": now,
        "status": "active",
        "auto_fixable": error.auto_fixable,
        "fix_action": error.fix_action,
        "details": error.details or {},
        "resolved_at": None,
        "resolved_by": None
    }
    
    await main_db.system_errors.insert_one(error_doc)
    return SystemErrorResponse(**error_doc)

@router.post("/{error_id}/fix")
async def auto_fix_error(
    error_id: str,
    action: Optional[str] = None,
    admin: dict = Depends(verify_super_admin)
):
    """Execute auto-fix action for an error"""
    error = await main_db.system_errors.find_one({"id": error_id})
    if not error:
        raise HTTPException(status_code=404, detail="خطأ غير موجود")
    
    fix_action = action or error.get("fix_action")
    
    # Execute fix action based on type
    fix_result = await execute_fix_action(fix_action, error)
    
    now = datetime.now(timezone.utc).isoformat()
    await main_db.system_errors.update_one(
        {"id": error_id},
        {"$set": {
            "status": "resolved",
            "resolved_at": now,
            "resolved_by": admin.get("sub", "admin"),
            "fix_result": fix_result
        }}
    )
    
    return {"success": True, "message": f"تم تنفيذ الإصلاح: {fix_action}", "result": fix_result}

async def execute_fix_action(action: str, error: dict) -> dict:
    """No privileged action is executed unless a real executor is configured."""
    raise HTTPException(status_code=501, detail=f"التنفيذ الآلي غير مهيأ للإجراء: {action or 'غير محدد'}")

@router.post("/{error_id}/resolve")
async def resolve_error(
    error_id: str,
    notes: Optional[str] = None,
    admin: dict = Depends(verify_super_admin)
):
    """Manually mark an error as resolved"""
    error = await main_db.system_errors.find_one({"id": error_id})
    if not error:
        raise HTTPException(status_code=404, detail="خطأ غير موجود")
    
    now = datetime.now(timezone.utc).isoformat()
    await main_db.system_errors.update_one(
        {"id": error_id},
        {"$set": {
            "status": "resolved",
            "resolved_at": now,
            "resolved_by": admin.get("sub", "admin"),
            "resolution_notes": notes
        }}
    )
    
    return {"success": True, "message": "تم تحديد الخطأ كمحلول"}

@router.delete("/resolved")
async def clear_resolved_errors(admin: dict = Depends(verify_super_admin)):
    """Clear all resolved errors from the system"""
    result = await main_db.system_errors.delete_many({"status": "resolved"})
    return {"success": True, "deleted_count": result.deleted_count, "message": f"تم حذف {result.deleted_count} خطأ محلول"}

@router.delete("/{error_id}")
async def delete_error(error_id: str, admin: dict = Depends(verify_super_admin)):
    """Delete a specific error"""
    result = await main_db.system_errors.delete_one({"id": error_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="خطأ غير موجود")
    
    return {"success": True, "message": "تم حذف الخطأ"}

@router.post("/maintenance/{action}")
async def run_maintenance_action(
    action: Literal["clear_cache", "reconnect_db", "restart_services", "system_check"],
    admin: dict = Depends(verify_super_admin)
):
    """Fail honestly instead of returning fabricated maintenance results."""
    raise HTTPException(status_code=501, detail=f"إجراء الصيانة {action} غير مرتبط بمنفّذ حقيقي")
