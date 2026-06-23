"""
Motherboard Core - Self-diagnostics panel.

Exposes (mounted under /api):
  GET /api/diagnostics                      → overall system status
  GET /api/diagnostics/modules              → per-component status grid
  GET /api/diagnostics/modules/{key}/clear-error
  POST /api/diagnostics/modules/{key}/reset-circuit → reset circuit breaker
  GET /api/diagnostics/logs/{key}           → tail of a component's log file
  GET /api/diagnostics/metrics              → in-memory request metrics per component
  GET /api/diagnostics/robots               → robot stats (bridge to RobotManager)
  GET /api/diagnostics/tenant-health        → tenant DB health summary
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from . import registry
from .logging_config import get_log_file

_START_TIME = datetime.now(timezone.utc)

_robot_manager_ref = None


def set_robot_manager(rm) -> None:
    """Called from main.py to wire the RobotManager into the diagnostics panel."""
    global _robot_manager_ref
    _robot_manager_ref = rm


def build_router(get_admin, main_db=None):
    router = APIRouter(prefix="/diagnostics", tags=["diagnostics"])

    @router.get("")
    async def health(user: dict = Depends(get_admin)):
        from config.database import main_db as _main_db
        db_ok = True
        try:
            await _main_db.command("ping")
        except Exception:
            db_ok = False
        components = registry.get_all()
        errored = [c.key for c in components if registry.get_last_error(c.key)]
        degraded = [c.key for c in components if registry.is_circuit_open(c.key)]
        robot_status = None
        if _robot_manager_ref:
            rs = _robot_manager_ref.get_status()
            robot_status = {
                "is_running": rs.get("is_running"),
                "watchdog_active": rs.get("watchdog_active"),
                "robots_total": len(rs.get("robots", {})),
                "robots_alive": sum(
                    1 for r in rs.get("robots", {}).values() if r.get("task_alive")
                ),
            }
        return {
            "status": "ok" if (db_ok and not errored and not degraded) else "degraded",
            "database": "ok" if db_ok else "error",
            "components_total": len(components),
            "components_errored": errored,
            "components_degraded": degraded,
            "uptime_seconds": round(
                (datetime.now(timezone.utc) - _START_TIME).total_seconds(), 1
            ),
            "time": datetime.now(timezone.utc).isoformat(),
            "robots": robot_status,
        }

    @router.get("/modules")
    async def modules(user: dict = Depends(get_admin)):
        result = []
        for c in registry.get_all():
            log_file = get_log_file(c.key)
            size = log_file.stat().st_size if log_file.exists() else 0
            last_error = registry.get_last_error(c.key)
            error_history = registry.get_error_history(c.key)
            metrics = registry.get_metrics(c.key)
            circuit = registry.get_circuit_status(c.key)

            if circuit["open"]:
                status = "degraded"
            elif last_error:
                status = "error"
            else:
                status = "ok"

            result.append({
                "key": c.key,
                "name_ar": c.name_ar,
                "name_fr": c.name_fr,
                "prefixes": c.prefixes,
                "collections": c.collections,
                "status": status,
                "last_error": last_error,
                "error_history": error_history[:5],
                "error_count": len(error_history),
                "log_file": f"logs/{c.key}.log",
                "log_size_kb": round(size / 1024, 1),
                "metrics": metrics,
                "circuit": circuit,
            })
        result.sort(
            key=lambda x: (
                0 if x["status"] == "degraded" else 1 if x["status"] == "error" else 2,
                x["key"],
            )
        )
        return {"modules": result, "total": len(result)}

    @router.post("/modules/{key}/clear-error")
    async def clear_module_error(key: str, user: dict = Depends(get_admin)):
        if not registry.get(key):
            raise HTTPException(status_code=404, detail="Component not found")
        registry.clear_error(key)
        return {"message": "تم مسح حالة الخطأ وإعادة تعيين الدائرة", "key": key}

    @router.post("/modules/{key}/reset-circuit")
    async def reset_circuit_breaker(key: str, user: dict = Depends(get_admin)):
        if not registry.get(key):
            raise HTTPException(status_code=404, detail="Component not found")
        registry.reset_circuit(key)
        return {"message": "تم إعادة تعيين قاطع الدائرة", "key": key}

    @router.get("/logs/{key}")
    async def module_logs(
        key: str,
        lines: int = Query(100, ge=1, le=2000),
        user: dict = Depends(get_admin),
    ):
        if not registry.get(key):
            raise HTTPException(status_code=404, detail="Component not found")
        log_file = get_log_file(key)
        if not log_file.exists():
            return {"key": key, "lines": [], "log_file": f"logs/{key}.log"}
        content = log_file.read_text(encoding="utf-8", errors="replace").splitlines()
        return {"key": key, "lines": content[-lines:], "log_file": f"logs/{key}.log"}

    @router.get("/metrics")
    async def all_metrics(user: dict = Depends(get_admin)):
        """Return in-memory request metrics for every registered component."""
        return {
            "metrics": registry.get_all_metrics(),
            "time": datetime.now(timezone.utc).isoformat(),
        }

    @router.get("/robots")
    async def robots_status(user: dict = Depends(get_admin)):
        """Bridge to RobotManager — surfaces robot stats on the motherboard."""
        if not _robot_manager_ref:
            return {"error": "RobotManager not wired", "robots": {}}
        status = _robot_manager_ref.get_status()
        history = []
        try:
            history = await _robot_manager_ref.get_history(limit=10)
        except Exception:
            pass
        return {**status, "recent_runs": history}

    @router.get("/tenant-health")
    async def tenant_health(user: dict = Depends(get_admin)):
        """Return the latest tenant DB health snapshot from MaintenanceRobot."""
        from config.database import main_db as _main_db
        try:
            doc = await _main_db.system_health.find_one(
                {"id": "tenant_health"}, {"_id": 0}
            )
            return doc or {"message": "لم يُجرَ فحص المستأجرين بعد"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return router
