"""
p135: APM-lite — per-route latency metrics with periodic flush to MongoDB.

In-memory aggregation (cheap, no per-request I/O) flushed every FLUSH_SECONDS
to main_db.apm_stats. Exposes GET /api/system/apm (super admin).
Also feeds p133: 5xx responses are counted per route.
"""
import time
import asyncio
import logging
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import APIRouter, Depends

logger = logging.getLogger(__name__)

FLUSH_SECONDS = 60
SLOW_MS = 2000

# route_key -> {count, total_ms, max_ms, slow, errors}
_stats = defaultdict(lambda: {"count": 0, "total_ms": 0.0, "max_ms": 0.0, "slow": 0, "errors": 0})
_lock = asyncio.Lock()


def _route_key(request) -> str:
    # use the route template when available to avoid high-cardinality paths
    route = request.scope.get("route")
    path = getattr(route, "path", None) or request.url.path
    # collapse obvious ids to keep cardinality bounded
    for seg in path.split("/"):
        if len(seg) > 24 or seg.isdigit():
            path = path.replace(seg, "{id}")
    return f"{request.method} {path}"


class APMMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            return response
        finally:
            elapsed = (time.perf_counter() - start) * 1000
            key = _route_key(request)
            async with _lock:
                s = _stats[key]
                s["count"] += 1
                s["total_ms"] += elapsed
                s["max_ms"] = max(s["max_ms"], round(elapsed, 1))
                if elapsed > SLOW_MS:
                    s["slow"] += 1
                if status >= 500:
                    s["errors"] += 1


async def flush_apm(main_db):
    """Background task: persist aggregated stats once a minute."""
    while True:
        await asyncio.sleep(FLUSH_SECONDS)
        async with _lock:
            if not _stats:
                continue
            snapshot = dict(_stats)
            _stats.clear()
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        for key, s in snapshot.items():
            try:
                await main_db.apm_stats.update_one(
                    {"route": key},
                    {
                        "$inc": {"count": s["count"], "total_ms": s["total_ms"],
                                 "slow": s["slow"], "errors": s["errors"]},
                        "$max": {"max_ms": s["max_ms"]},
                        "$set": {"last_seen": now},
                    },
                    upsert=True,
                )
            except Exception as exc:
                logger.warning(f"apm flush failed for {key}: {exc}")


def create_apm_router(main_db, get_super_admin) -> APIRouter:
    router = APIRouter(prefix="/system", tags=["apm"])

    @router.get("/apm")
    async def get_apm(admin: dict = Depends(get_super_admin)):
        rows = await main_db.apm_stats.find({}, {"_id": 0}).to_list(1000)
        for r in rows:
            r["avg_ms"] = round(r["total_ms"] / r["count"], 1) if r.get("count") else 0
            r.pop("total_ms", None)
        rows.sort(key=lambda r: r.get("avg_ms", 0), reverse=True)
        return {"routes": rows[:100]}

    return router
