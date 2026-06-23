"""
Performance Optimization Module
Response caching, query optimization, and performance monitoring
"""
from fastapi import APIRouter, HTTPException, Depends, Request, Response
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import time
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/performance", tags=["Performance"])


class PerformanceStats(BaseModel):
    avg_response_time: float = 0
    total_requests: int = 0
    cache_hit_rate: float = 0
    slow_queries: int = 0
    db_connections: int = 0


# Simple in-memory cache with size limit and auto-cleanup
_cache = {}
_cache_ttl = {}
DEFAULT_TTL = 60  # seconds
MAX_CACHE_SIZE = 500  # maximum number of cached entries


def _cleanup_expired() -> dict:
    """Remove expired entries to prevent memory growth"""
    now = time.time()
    expired = [k for k, ttl in _cache_ttl.items() if now >= ttl]
    for k in expired:
        _cache.pop(k, None)
        _cache_ttl.pop(k, None)


def get_cached(key: str) -> dict:
    """Get cached value if not expired"""
    if key in _cache and key in _cache_ttl:
        if time.time() < _cache_ttl[key]:
            return _cache[key]
        else:
            del _cache[key]
            del _cache_ttl[key]
    return None


def set_cached(key: str, value, ttl: int = DEFAULT_TTL) -> None:
    """Cache a value with TTL, auto-cleanup when size exceeded"""
    if len(_cache) >= MAX_CACHE_SIZE:
        _cleanup_expired()
        # If still over limit, remove oldest 20%
        if len(_cache) >= MAX_CACHE_SIZE:
            sorted_keys = sorted(_cache_ttl, key=_cache_ttl.get)
            for k in sorted_keys[:MAX_CACHE_SIZE // 5]:
                _cache.pop(k, None)
                _cache_ttl.pop(k, None)
    _cache[key] = value
    _cache_ttl[key] = time.time() + ttl


def clear_cache(prefix: str = None) -> dict:
    """Clear cache entries, optionally by prefix"""
    if prefix:
        keys_to_delete = [k for k in _cache if k.startswith(prefix)]
        for k in keys_to_delete:
            _cache.pop(k, None)
            _cache_ttl.pop(k, None)
    else:
        _cache.clear()
        _cache_ttl.clear()


# Request timing stats
_request_times = []
_max_stats = 1000


def record_request_time(duration: float, path: str) -> dict:
    """Record request timing for monitoring"""
    _request_times.append({"duration": duration, "path": path, "time": time.time()})
    if len(_request_times) > _max_stats:
        _request_times.pop(0)


def create_performance_routes(db, get_current_user) -> dict:
    """Create performance monitoring routes"""

    @router.get("/stats")
    async def get_performance_stats(current_user: dict = Depends(get_current_user)):
        """Get performance metrics"""
        if not _request_times:
            return PerformanceStats()

        avg_time = sum(r["duration"] for r in _request_times) / len(_request_times)
        slow = sum(1 for r in _request_times if r["duration"] > 1.0)

        # Get cache stats
        total_cache = len(_cache)
        expired = sum(1 for k in _cache_ttl if time.time() >= _cache_ttl[k])

        return {
            "avg_response_time_ms": round(avg_time * 1000, 2),
            "total_requests": len(_request_times),
            "slow_requests": slow,
            "cache_entries": total_cache,
            "cache_expired": expired,
            "top_slow_paths": _get_slow_paths(),
        }

    @router.post("/clear-cache")
    async def api_clear_cache(current_user: dict = Depends(get_current_user)):
        """Clear all caches"""
        clear_cache()
        return {"success": True, "message": "تم مسح الكاش بنجاح"}

    @router.get("/db-stats")
    async def get_db_stats(current_user: dict = Depends(get_current_user)):
        """Get database statistics"""
        try:
            collections = await db.list_collection_names()
            stats = {}
            for col in collections[:20]:  # Limit to 20 collections
                count = await db[col].count_documents({})
                stats[col] = count

            # Sort by count descending
            sorted_stats = dict(sorted(stats.items(), key=lambda x: x[1], reverse=True))
            return {
                "total_collections": len(collections),
                "collection_counts": sorted_stats,
                "total_documents": sum(stats.values()),
            }
        except Exception as e:
            logger.error(f"Error getting DB stats: {e}")
            return {"error": str(e)}

    return router


def _get_slow_paths() -> dict:
    """Get top 5 slowest paths"""
    path_times = {}
    for r in _request_times:
        path = r["path"]
        if path not in path_times:
            path_times[path] = []
        path_times[path].append(r["duration"])

    avg_by_path = {
        path: sum(times) / len(times)
        for path, times in path_times.items()
    }
    sorted_paths = sorted(avg_by_path.items(), key=lambda x: x[1], reverse=True)
    return [{"path": p, "avg_ms": round(t * 1000, 2)} for p, t in sorted_paths[:5]]
