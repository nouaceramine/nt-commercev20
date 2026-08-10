"""Monitoring middleware"""
from starlette.middleware.base import BaseHTTPMiddleware
import time

class MonitoringMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.time()
        response = await call_next(request)
        duration = time.time() - start
        response.headers['X-Response-Time'] = str(duration)
        return response

