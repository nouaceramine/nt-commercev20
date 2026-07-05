"""Structured JSON logging with request/tenant context.

Attaches a `ContextFilter` that injects request_id, correlation_id, tenant_id,
and user_id into every LogRecord. A `JsonFormatter` then emits each record
as a single JSON line — perfect for log aggregators (Datadog, Loki, ELK).

Backwards compatible: if `LOG_FORMAT=text` (default in dev), falls back to
the existing human-readable formatter.

Usage in main.py:
    from utils.logging_setup import setup_logging
    setup_logging(level=os.environ.get("LOG_LEVEL", "INFO"))
"""
from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timezone

from middleware.request_context import (
    get_correlation_id,
    get_request_id,
    get_tenant_id,
    get_user_id,
)


class ContextFilter(logging.Filter):
    """Inject request context into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: A003
        record.request_id = get_request_id()
        record.correlation_id = get_correlation_id()
        record.tenant_id = get_tenant_id()
        record.user_id = get_user_id()
        return True


class JsonFormatter(logging.Formatter):
    """One-line JSON per log record. Machine-readable, aggregator-friendly."""

    RESERVED = {
        "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
        "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
        "created", "msecs", "relativeCreated", "thread", "threadName",
        "processName", "process", "message", "asctime",
    }

    def format(self, record: logging.LogRecord) -> str:
        payload: dict = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
            "correlation_id": getattr(record, "correlation_id", "-"),
            "tenant_id": getattr(record, "tenant_id", "-"),
            "user_id": getattr(record, "user_id", "-"),
        }
        # Extra fields passed via `extra={...}` in .info(msg, extra=...)
        for k, v in record.__dict__.items():
            if k in self.RESERVED or k in payload:
                continue
            if k.startswith("_"):
                continue
            try:
                json.dumps(v)  # ensure serializable
                payload[k] = v
            except Exception:
                payload[k] = str(v)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


class TextFormatter(logging.Formatter):
    """Human-readable single-line formatter with context suffix."""

    FMT = "%(asctime)s [%(levelname)s] %(name)s :: %(message)s | rid=%(request_id)s tid=%(tenant_id)s"

    def __init__(self):
        super().__init__(fmt=self.FMT, datefmt="%Y-%m-%d %H:%M:%S")


def setup_logging(level: str = "INFO", *, force_json: bool | None = None) -> None:
    """Configure root logger. Idempotent — safe to call multiple times."""
    root = logging.getLogger()
    root.setLevel(level)

    # Detect format: env override wins
    if force_json is None:
        force_json = os.environ.get("LOG_FORMAT", "text").lower() == "json"

    formatter: logging.Formatter = JsonFormatter() if force_json else TextFormatter()

    # Reset handlers
    for h in list(root.handlers):
        root.removeHandler(h)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    handler.addFilter(ContextFilter())
    root.addHandler(handler)

    # Quiet noisy libraries
    for noisy in ("uvicorn.access", "botocore", "urllib3", "asyncio"):
        logging.getLogger(noisy).setLevel("WARNING")


__all__ = ["setup_logging", "ContextFilter", "JsonFormatter", "TextFormatter"]
