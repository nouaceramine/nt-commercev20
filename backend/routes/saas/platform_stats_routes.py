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
from utils.cache import cache, cached_json
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
@cached_json(prefix="saas:platform-stats", ttl=10)
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

    # ── Service health snapshot ──
    services: dict = {}
    # Backend itself: if we reached here, backend is up
    services["backend"] = {"status": "ok", "label": "Backend API"}
    # MongoDB ping
    try:
        await client.admin.command("ping")
        services["mongodb"] = {"status": "ok", "label": "MongoDB"}
    except Exception as e:
        services["mongodb"] = {"status": "down", "label": "MongoDB", "error": str(e)[:80]}
    # Redis: optional — disabled when no REDIS_URL configured
    redis_url = os.environ.get("REDIS_URL", "").strip()
    if not redis_url:
        services["redis"] = {"status": "disabled", "label": "Redis (cache)"}
    else:
        try:
            # Reuse the singleton cache client (circuit-breaker aware) instead
            # of opening a fresh connection per stats poll.
            ok = await cache.ping()
            services["redis"] = {"status": "ok" if ok else "down", "label": "Redis (cache)"}
        except Exception as e:
            services["redis"] = {"status": "down", "label": "Redis (cache)", "error": str(e)[:80]}

    payload = {
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
        "services": services,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    return payload


__all__ = ["router"]
