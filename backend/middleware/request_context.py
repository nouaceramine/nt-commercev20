"""Request Context — Correlation ID, Request ID, Tenant ID.

Every incoming HTTP request gets tagged with:
  • request_id      — unique per request (uuid4)
  • correlation_id  — inherited from X-Correlation-ID header or newly generated;
                      used to trace an operation across multiple services / events.
  • tenant_id       — populated by auth dependency when known
  • user_id         — populated by auth dependency when known

Values live in `contextvars.ContextVar` so they're accessible from anywhere
(logging filters, event publishers, background tasks spawned from the request)
without threading them through function signatures.

The middleware:
  1. Reads/creates request_id + correlation_id
  2. Sets them in context vars
  3. Adds them to response headers (X-Request-ID, X-Correlation-ID)
  4. Times the request and logs one structured line per request

This is additive — no route sees any behaviour change.
"""
from __future__ import annotations

import time
import uuid
from contextvars import ContextVar
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# ── Context Variables ───────────────────────────────────────────────────────
request_id_ctx: ContextVar[Optional[str]] = ContextVar("request_id", default=None)
correlation_id_ctx: ContextVar[Optional[str]] = ContextVar("correlation_id", default=None)
tenant_id_ctx: ContextVar[Optional[str]] = ContextVar("tenant_id", default=None)
user_id_ctx: ContextVar[Optional[str]] = ContextVar("user_id", default=None)


def get_request_id() -> str:
    return request_id_ctx.get() or "-"


def get_correlation_id() -> str:
    return correlation_id_ctx.get() or "-"


def get_tenant_id() -> str:
    return tenant_id_ctx.get() or "-"


def get_user_id() -> str:
    return user_id_ctx.get() or "-"


def set_tenant_context(tenant_id: Optional[str], user_id: Optional[str] = None) -> None:
    """Called by auth dependencies once tenant/user is known."""
    if tenant_id:
        tenant_id_ctx.set(tenant_id)
    if user_id:
        user_id_ctx.set(user_id)


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Attach request_id + correlation_id to each request, expose via headers."""

    async def dispatch(self, request: Request, call_next):
        # Reuse client-supplied correlation ID if present (event tracing)
        incoming_corr = request.headers.get("X-Correlation-ID") or request.headers.get("x-correlation-id")
        correlation_id = incoming_corr or str(uuid.uuid4())
        request_id = str(uuid.uuid4())

        # Reset tenant/user for this request; auth deps populate later
        tok_req = request_id_ctx.set(request_id)
        tok_corr = correlation_id_ctx.set(correlation_id)
        tok_ten = tenant_id_ctx.set(None)
        tok_usr = user_id_ctx.set(None)

        # Stash on request.state too (for FastAPI users who prefer dependency-style)
        request.state.request_id = request_id
        request.state.correlation_id = correlation_id

        start = time.perf_counter()
        status_code = 500
        try:
            response: Response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Correlation-ID"] = correlation_id
            return response
        finally:
            duration_ms = int((time.perf_counter() - start) * 1000)
            # Emit one structured access log per request
            import logging
            logging.getLogger("access").info(
                "request",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status": status_code,
                    "duration_ms": duration_ms,
                    "client_ip": (request.client.host if request.client else "-"),
                },
            )
            # Reset context (avoids leaking to next request in ASGI event loop)
            request_id_ctx.reset(tok_req)
            correlation_id_ctx.reset(tok_corr)
            tenant_id_ctx.reset(tok_ten)
            user_id_ctx.reset(tok_usr)


__all__ = [
    "RequestContextMiddleware",
    "request_id_ctx",
    "correlation_id_ctx",
    "tenant_id_ctx",
    "user_id_ctx",
    "get_request_id",
    "get_correlation_id",
    "get_tenant_id",
    "get_user_id",
    "set_tenant_context",
]
