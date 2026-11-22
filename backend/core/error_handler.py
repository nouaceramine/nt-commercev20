"""
Motherboard Core - Central error handler.

Catches any unhandled exception, assigns it a short unique error ID, identifies the
responsible component from the request path, writes the full traceback to that
component's log file (and the shared errors.log), records it as the component's last
error for the diagnostics panel, and returns a clean JSON response.

HTTPException / validation errors keep FastAPI's normal behaviour — only true unexpected
errors are handled here.

Also tracks in-memory metrics (request count, avg response time, error rate) per component.
"""
import time
import uuid
from datetime import datetime, timezone

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from . import registry
from .logging_config import get_module_logger

_core_logger = get_module_logger("core")


def _sanitize_nonfinite(obj):
    """p555-007: rewrite NaN/Inf floats to strings — they are valid in
    pydantic error payloads but crash strict json.dumps with a 500."""
    import math as _m
    if isinstance(obj, float) and not _m.isfinite(obj):
        return str(obj)
    if isinstance(obj, dict):
        return {k: _sanitize_nonfinite(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_nonfinite(v) for v in obj]
    return obj


def install_error_handling(app) -> None:
    @app.exception_handler(RequestValidationError)
    async def _validation_exception_handler(request: Request, exc: RequestValidationError):
        """p555-007: same shape as FastAPI's default 422, but NaN/Inf-safe."""
        return JSONResponse(
            status_code=422,
            content={"detail": jsonable_encoder(_sanitize_nonfinite(exc.errors()))},
        )

    @app.middleware("http")
    async def _metrics_middleware(request: Request, call_next):
        """Track per-component request counts and response times."""
        start = time.monotonic()
        try:
            response = await call_next(request)
            duration_ms = (time.monotonic() - start) * 1000
            spec = registry.find_by_path(request.url.path)
            if spec:
                is_error = response.status_code >= 500
                registry.record_request(spec.key, duration_ms, is_error=is_error)
            return response
        except Exception:
            raise

    @app.exception_handler(Exception)
    async def _unhandled_exception_handler(request: Request, exc: Exception):
        error_id = uuid.uuid4().hex[:8]
        spec = registry.find_by_path(request.url.path)
        key = spec.key if spec else "core"
        logger = spec.logger if spec else _core_logger

        logger.error(
            f"[{error_id}] {request.method} {request.url.path} -> "
            f"{type(exc).__name__}: {exc}",
            exc_info=True,
        )

        registry.record_error(key, {
            "error_id": error_id,
            "message": f"{type(exc).__name__}: {exc}",
            "path": request.url.path,
            "method": request.method,
            "time": datetime.now(timezone.utc).isoformat(),
        })

        # p55: real-time bridge — every unhandled exception becomes an AutoHeal finding
        try:
            import asyncio as _aio
            from services.autoheal_service import emit_exception_finding
            _aio.create_task(emit_exception_finding(
                key, spec.name_ar if spec else "النواة",
                request.url.path, request.method, error_id, exc,
            ))
        except Exception:  # noqa: BLE001
            pass

        return JSONResponse(
            status_code=500,
            content={
                "error_id": error_id,
                "component": key,
                "component_name": spec.name_ar if spec else "النواة",
                "detail": "حدث خطأ داخلي في هذا العنصر. تم تسجيله في ملف اللوغ الخاص به.",
            },
        )
