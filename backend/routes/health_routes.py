"""Deep health check endpoints — verify DB, Redis, key integrations.

Two levels:
  • GET /api/health          — cheap, always 200, useful for k8s liveness
  • GET /api/health/deep     — probes DB + Redis + returns per-check status

The deep check is safe (read-only) and idempotent. Returns 200 if all
critical checks pass, 503 otherwise, so orchestrators can use it as a
readiness probe.
"""
from __future__ import annotations

import asyncio
import os
import time

from fastapi import APIRouter, Response

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health():
    """Cheap liveness probe."""
    return {"status": "ok", "service": "nt-commerce-backend"}


@router.get("/deep")
async def health_deep(response: Response):
    """Deep readiness probe — checks DB, Redis, event bus."""
    checks: dict[str, dict] = {}
    all_ok = True

    # ── MongoDB ─────────────────────────────────────────────────────────
    t0 = time.perf_counter()
    try:
        from config.database import main_db
        await main_db.command("ping")
        checks["mongodb"] = {"status": "ok", "latency_ms": int((time.perf_counter() - t0) * 1000)}
    except Exception as exc:
        all_ok = False
        checks["mongodb"] = {"status": "fail", "error": str(exc)[:200]}

    # ── Redis / Event Bus ───────────────────────────────────────────────
    t0 = time.perf_counter()
    try:
        from services.event_bus import event_bus
        info = await asyncio.wait_for(event_bus.stream_info(), timeout=3.0)
        checks["redis"] = {
            "status": "ok" if info.get("available") else "degraded",
            "latency_ms": int((time.perf_counter() - t0) * 1000),
            "stream_len": info.get("stream_len", 0),
            "dlq_len": info.get("dlq_len", 0),
        }
    except Exception as exc:
        # Redis is optional — degrade gracefully, don't fail readiness
        checks["redis"] = {"status": "degraded", "error": str(exc)[:200]}

    # ── Environment sanity ──────────────────────────────────────────────
    required = ["MONGO_URL", "DB_NAME", "JWT_SECRET_KEY"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        all_ok = False
        checks["environment"] = {"status": "fail", "missing_vars": missing}
    else:
        checks["environment"] = {"status": "ok"}

    body = {
        "status": "ok" if all_ok else "fail",
        "service": "nt-commerce-backend",
        "checks": checks,
    }
    if not all_ok:
        response.status_code = 503
    return body


__all__ = ["router"]
