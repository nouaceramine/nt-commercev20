"""SaaS Platform Stats — capacity + resource snapshot for the super-admin
dashboard.

Endpoint:
    GET /api/saas/platform-stats  (super-admin only)
"""
import os
from datetime import datetime, timezone
from typing import Optional

import psutil
from fastapi import APIRouter, Depends

from config.database import db, client
from .helpers import get_super_admin

router = APIRouter(tags=["SaaS Platform Stats"])


def _max_tenants() -> int:
    try:
        return int(os.environ.get("MAX_TENANTS", "0") or 0)
    except ValueError:
        return 0


def _safe_disk_usage(path: str = "/") -> Optional[dict]:
    try:
        u = psutil.disk_usage(path)
        return {"total": u.total, "used": u.used, "free": u.free, "percent": u.percent}
    except Exception:
        return None


@router.get("/saas/platform-stats")
async def platform_stats(admin: dict = Depends(get_super_admin)):
    """Return platform capacity + resource snapshot.

    Capacity is computed against MAX_TENANTS env var when > 0. When unset,
    `capacity_percent` is null and `unlimited` flag is true.
    """
    # Tenant count + active count
    total_tenants = await db.saas_tenants.count_documents({})
    active_tenants = await db.saas_tenants.count_documents({"is_active": True})
    cap = _max_tenants()
    capacity_percent = round((total_tenants / cap) * 100, 1) if cap > 0 else None
    severity = "ok"
    if cap > 0:
        if capacity_percent >= 95:
            severity = "critical"
        elif capacity_percent >= 80:
            severity = "warning"

    # MongoDB databases (excluding admin/local/config)
    try:
        all_dbs = await client.list_database_names()
        db_count = len([d for d in all_dbs if d not in ("admin", "local", "config")])
    except Exception:
        db_count = None

    # System resources (best-effort)
    try:
        mem = psutil.virtual_memory()
        memory = {
            "total": mem.total,
            "used": mem.used,
            "available": mem.available,
            "percent": mem.percent,
        }
    except Exception:
        memory = None

    try:
        cpu_percent = psutil.cpu_percent(interval=0.1)
    except Exception:
        cpu_percent = None

    return {
        "tenants": {
            "total": total_tenants,
            "active": active_tenants,
            "inactive": total_tenants - active_tenants,
            "max": cap if cap > 0 else None,
            "unlimited": cap == 0,
            "capacity_percent": capacity_percent,
            "severity": severity,
        },
        "databases": {"count": db_count},
        "resources": {
            "memory": memory,
            "cpu_percent": cpu_percent,
            "disk": _safe_disk_usage("/"),
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


__all__ = ["router"]
