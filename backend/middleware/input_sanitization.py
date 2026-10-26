"""Baseline request validation (not a substitute for context-specific escaping)."""
import os
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


class InputSanitizationMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if "\x00" in str(request.url.path) or "\x00" in str(request.url.query):
            return JSONResponse({"detail": "NUL bytes are not allowed"}, status_code=400)
        content_type = (request.headers.get("content-type") or "").lower()
        if content_type.startswith("application/json"):
            limit = int(os.environ.get("MAX_JSON_BODY_BYTES", str(10 * 1024 * 1024)))
            try:
                length = int(request.headers.get("content-length") or 0)
            except ValueError:
                return JSONResponse({"detail": "Invalid Content-Length"}, status_code=400)
            if length > limit:
                return JSONResponse({"detail": "JSON request body too large"}, status_code=413)
        return await call_next(request)
