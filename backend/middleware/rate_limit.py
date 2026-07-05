"""Shared slowapi Limiter — imported by main.py and public route modules
that need rate limiting (login, register, password-reset).

Key function resolves the real client IP behind the ingress proxy via
X-Forwarded-For. Loopback traffic (local test suites, health probes) is
exempted by returning a unique key per request.
"""
from __future__ import annotations

import time

_LOOPBACK = {"127.0.0.1", "::1", "localhost", "testclient"}


def client_ip_key(request) -> str:
    xff = request.headers.get("x-forwarded-for")
    ip = xff.split(",")[0].strip() if xff else (request.client.host if request.client else "unknown")
    if ip in _LOOPBACK:
        return f"local-{time.time_ns()}"
    return ip


try:
    from slowapi import Limiter

    limiter = Limiter(key_func=client_ip_key)

    def rate_limit(spec: str):
        """Decorator applying spec (e.g. '10/minute'). Safe if slowapi unavailable."""
        return limiter.limit(spec)

except Exception:  # slowapi optional
    limiter = None  # type: ignore[assignment]

    def rate_limit(spec: str):  # type: ignore[misc]
        def deco(fn):
            return fn
        return deco


__all__ = ["limiter", "rate_limit", "client_ip_key"]
