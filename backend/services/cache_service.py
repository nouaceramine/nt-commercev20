"""
Cache Service - Redis-backed caching for NT Commerce 12.0
"""
import json
import logging
import os
from typing import Optional
import redis

logger = logging.getLogger(__name__)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
DEFAULT_TTL = 300  # 5 minutes


class CacheManager:
    """Redis-backed cache manager for high-read, low-write endpoints."""

    def __init__(self, url: str = REDIS_URL):
        try:
            self._client = redis.from_url(url, decode_responses=True, socket_connect_timeout=2)
            self._client.ping()
            self._available = True
            logger.info("Redis cache connected")
        except Exception:
            self._client = None
            self._available = False
            logger.warning("Redis unavailable - caching disabled")

    @property
    def available(self) -> bool:
        return self._available

    def get(self, key: str) -> Optional[dict]:
        if not self._available:
            return None
        try:
            data = self._client.get(key)
            return json.loads(data) if data else None
        except Exception:
            return None

    def set(self, key: str, value: object, ttl: int = DEFAULT_TTL) -> None:
        if not self._available:
            return
        try:
            self._client.setex(key, ttl, json.dumps(value, default=str))
        except Exception:
            pass

    def delete(self, key: str) -> None:
        if not self._available:
            return
        try:
            self._client.delete(key)
        except Exception:
            pass

    def delete_pattern(self, pattern: str) -> None:
        """Delete all keys matching a pattern (e.g., 'products:*')"""
        if not self._available:
            return
        try:
            keys = self._client.keys(pattern)
            if keys:
                self._client.delete(*keys)
        except Exception:
            pass

    def flush_all(self) -> None:
        if not self._available:
            return
        try:
            self._client.flushdb()
        except Exception:
            pass

    def get_stats(self) -> dict:
        if not self._available:
            return {"available": False}
        try:
            info = self._client.info("stats")
            return {
                "available": True,
                "hits": info.get("keyspace_hits", 0),
                "misses": info.get("keyspace_misses", 0),
                "keys": self._client.dbsize()
            }
        except Exception:
            return {"available": False}


# Singleton instance
cache = CacheManager()
