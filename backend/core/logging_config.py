"""
Motherboard Core - Per-component logging.

Each component (module) gets its own rotating log file under backend/logs/<key>.log.
All ERROR-level records from every component are ALSO mirrored to backend/logs/errors.log
so a single file gives a fast triage view across the whole system.
"""
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

LOGS_DIR = Path(__file__).resolve().parent.parent / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)

_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"
_formatter = logging.Formatter(_FORMAT)

_MAX_BYTES = 2_000_000
_BACKUP_COUNT = 3

_error_handler = None
_loggers: dict[str, logging.Logger] = {}


def _get_shared_error_handler() -> RotatingFileHandler:
    """One shared handler that collects ERROR+ from every component."""
    global _error_handler
    if _error_handler is None:
        handler = RotatingFileHandler(
            LOGS_DIR / "errors.log",
            maxBytes=_MAX_BYTES,
            backupCount=5,
            encoding="utf-8",
        )
        handler.setLevel(logging.ERROR)
        handler.setFormatter(_formatter)
        _error_handler = handler
    return _error_handler


def get_module_logger(name: str) -> logging.Logger:
    """Return (creating if needed) an isolated logger that writes to logs/<name>.log."""
    if name in _loggers:
        return _loggers[name]

    logger = logging.getLogger(f"nt.{name}")
    logger.setLevel(logging.INFO)
    logger.propagate = False  # don't double-log via the root logger

    file_handler = RotatingFileHandler(
        LOGS_DIR / f"{name}.log",
        maxBytes=_MAX_BYTES,
        backupCount=_BACKUP_COUNT,
        encoding="utf-8",
    )
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(_formatter)
    logger.addHandler(file_handler)

    # Mirror errors into the shared errors.log
    logger.addHandler(_get_shared_error_handler())

    # Surface warnings/errors on the console too
    console = logging.StreamHandler()
    console.setLevel(logging.WARNING)
    console.setFormatter(_formatter)
    logger.addHandler(console)

    _loggers[name] = logger
    return logger


def get_log_file(name: str) -> Path:
    return LOGS_DIR / f"{name}.log"
