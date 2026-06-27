"""
Thin async caching helper backed by Redis. Falls back to a NoopCache when
REDIS_URL is unset or Redis is unreachable so the rest of the app keeps
working even in environments without Redis (e.g., minimal dev pods).

Usage:
    from backend.utils.cache import cache, cached_json

    val = await cache.get("k")
    await cache.set("k", "v", ttl=60)
    await cache.invalidate_prefix("saas:platform-stats:")

    @cached_json(prefix="saas:platform-stats", ttl=30, key_fn=lambda: "global")
    async def get_platform_stats(): ...
"""
from __future__ import annotations

import json
import logging
import os
from functools import wraps
from typing import Any, Awaitable, Callable, Optional

log = logging.getLogger(__name__)


class _NoopCache:
    """Drop-in cache that does nothing — used when Redis is not configured."""

    enabled = False

    async def get(self, _key: str) -> Optional[str]:
        return None

    async def set(self, _key: str, _value: str, ttl: Optional[int] = None) -> None:  # noqa: ARG002
        return None

    async def delete(self, _key: str) -> None:
        return None

    async def invalidate_prefix(self, _prefix: str) -> int:
        return 0

    async def ping(self) -> bool:
        return False


class RedisCache:
    """Async Redis cache. Imports `redis.asyncio` lazily so the module stays
    importable on machines without the redis client."""

    enabled = True

    def __init__(self, url: str) -> None:
        self._url = url
        self._client = None  # type: ignore[assignment]
        self._broken = False

    async def _get_client(self):
        if self._client is not None:
            return self._client
        try:
            import redis.asyncio as redis_async  # type: ignore
            self._client = redis_async.from_url(
                self._url,
                decode_responses=True,
                socket_timeout=1.0,
                socket_connect_timeout=1.0,
            )
            return self._client
        except Exception as exc:
            log.warning("Redis cache init failed (%s) — falling back to no-op", exc)
            self._broken = True
            return None

    async def get(self, key: str) -> Optional[str]:
        if self._broken:
            return None
        c = await self._get_client()
        if c is None:
            return None
        try:
            return await c.get(key)
        except Exception as exc:
            log.debug("cache.get(%s) failed: %s", key, exc)
            self._broken = True
            return None

    async def set(self, key: str, value: str, ttl: Optional[int] = None) -> None:
        if self._broken:
            return
        c = await self._get_client()
        if c is None:
            return
        try:
            if ttl:
                await c.set(key, value, ex=ttl)
            else:
                await c.set(key, value)
        except Exception as exc:
            log.debug("cache.set(%s) failed: %s", key, exc)
            self._broken = True

    async def delete(self, key: str) -> None:
        if self._broken:
            return
        c = await self._get_client()
        if c is None:
            return
        try:
            await c.delete(key)
        except Exception as exc:
            log.debug("cache.delete(%s) failed: %s", key, exc)

    async def invalidate_prefix(self, prefix: str) -> int:
        """Bulk-delete keys with a given prefix. Uses SCAN to avoid blocking
        Redis on KEYS for large keyspaces."""
        if self._broken:
            return 0
        c = await self._get_client()
        if c is None:
            return 0
        try:
            n = 0
            async for k in c.scan_iter(match=f"{prefix}*", count=200):
                await c.delete(k)
                n += 1
            return n
        except Exception as exc:
            log.debug("cache.invalidate_prefix(%s) failed: %s", prefix, exc)
            return 0

    async def ping(self) -> bool:
        c = await self._get_client()
        if c is None:
            return False
        try:
            return bool(await c.ping())
        except Exception:
            return False


def _build_cache():
    url = os.environ.get("REDIS_URL", "").strip()
    if not url:
        return _NoopCache()
    return RedisCache(url)


# Singleton — import this from anywhere
cache = _build_cache()


def cached_json(
    *,
    prefix: str,
    ttl: int = 60,
    key_fn: Optional[Callable[..., str]] = None,
    stamp: bool = True,
) -> Callable[[Callable[..., Awaitable[Any]]], Callable[..., Awaitable[Any]]]:
    """Decorator that JSON-caches the return value of an async function.

    The decorated function still runs (and the cache stays bypassed) if the
    cache is the NoopCache (REDIS_URL unset) or if Redis is unreachable.

    When ``stamp=True`` (default) and the cached value is a dict, the
    returned payload is augmented on the *warm* hit with two fields:
      * ``cached: true`` — flag for clients / tests
      * ``served_at`` — ISO timestamp of when the cached copy was served

    Args:
        prefix:   Key namespace prefix (e.g. ``"saas:platform-stats"``).
        ttl:      Seconds to live for the cached payload.
        key_fn:   Function returning the per-call sub-key. Receives the same
                  args the wrapped function does. Defaults to a constant key.
        stamp:    Set to False to disable cached/served_at stamping when the
                  wrapped function returns non-dict payloads (e.g. a list).
    """
    from datetime import datetime, timezone

    def decorator(fn: Callable[..., Awaitable[Any]]) -> Callable[..., Awaitable[Any]]:
        @wraps(fn)
        async def wrapper(*args, **kwargs):
            if not cache.enabled:
                return await fn(*args, **kwargs)
            sub = key_fn(*args, **kwargs) if key_fn else "_"
            full_key = f"{prefix}:{sub}"
            try:
                raw = await cache.get(full_key)
                if raw:
                    value = json.loads(raw)
                    if stamp and isinstance(value, dict):
                        value["cached"] = True
                        value["served_at"] = datetime.now(timezone.utc).isoformat()
                    return value
            except Exception:
                pass
            value = await fn(*args, **kwargs)
            try:
                # Don't persist the stamp fields — recompute on each warm hit.
                payload_to_store = value
                if stamp and isinstance(value, dict):
                    payload_to_store = {k: v for k, v in value.items() if k not in ("cached", "served_at")}
                await cache.set(full_key, json.dumps(payload_to_store, default=str), ttl=ttl)
            except Exception:
                pass
            return value

        return wrapper

    return decorator


__all__ = ["cache", "cached_json", "RedisCache"]
