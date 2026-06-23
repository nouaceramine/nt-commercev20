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
from fastapi.responses import JSONResponse

from . import registry
from .logging_config import get_module_logger

_core_logger = get_module_logger("core")


def install_error_handling(app) -> None:
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

        return JSONResponse(
            status_code=500,
            content={
                "error_id": error_id,
                "component": key,
                "component_name": spec.name_ar if spec else "النواة",
                "detail": "حدث خطأ داخلي في هذا العنصر. تم تسجيله في ملف اللوغ الخاص به.",
            },
        )
