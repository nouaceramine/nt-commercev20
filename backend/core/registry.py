"""
Motherboard Core - Component registry.

Each domain of the app is described by a ModuleSpec ("a chip on the motherboard").
The registry lets the diagnostics panel enumerate components, the error handler map a
failing request to the responsible component, and future code swap/disable a component
in one place.

Enhanced with:
- Error history (last 10 errors per component, not just the last one)
- In-memory metrics (request count, avg response time, error rate)
- Circuit breaker (auto-degrades a component after 5 errors in 1 hour)
"""
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Optional
import logging

from .logging_config import get_module_logger

_MAX_ERROR_HISTORY = 10
_CIRCUIT_THRESHOLD = 5       # errors in window → open circuit
_CIRCUIT_WINDOW_MINUTES = 60 # sliding window


@dataclass
class ModuleSpec:
    key: str
    name_ar: str
    name_fr: str
    prefixes: list[str]
    collections: list[str] = field(default_factory=list)
    logger: logging.Logger = field(init=False)

    def __post_init__(self) -> None:
        self.logger = get_module_logger(self.key)


_REGISTRY: dict[str, ModuleSpec] = {}
_ERROR_HISTORY: dict[str, list] = {}      # key → [last 10 error dicts]
_METRICS: dict[str, dict] = {}            # key → {requests, total_ms, errors, last_at}
_CIRCUIT: dict[str, dict] = {}            # key → {error_times: [], open: bool, opened_at}


def register(spec: ModuleSpec) -> None:
    _REGISTRY[spec.key] = spec


def get_all() -> list[ModuleSpec]:
    return list(_REGISTRY.values())


def get(key: str) -> Optional[ModuleSpec]:
    return _REGISTRY.get(key)


def _prefix_matches(path: str, prefix: str) -> bool:
    return path == prefix or path.startswith(prefix + "/")


def find_by_path(path: str) -> Optional[ModuleSpec]:
    best: Optional[ModuleSpec] = None
    best_len = -1
    for spec in _REGISTRY.values():
        for prefix in spec.prefixes:
            if _prefix_matches(path, prefix) and len(prefix) > best_len:
                best = spec
                best_len = len(prefix)
    return best


# ── Error history ──────────────────────────────────────────────────────────────

def record_error(key: str, info: dict) -> None:
    if key not in _ERROR_HISTORY:
        _ERROR_HISTORY[key] = []
    _ERROR_HISTORY[key].append(info)
    if len(_ERROR_HISTORY[key]) > _MAX_ERROR_HISTORY:
        _ERROR_HISTORY[key] = _ERROR_HISTORY[key][-_MAX_ERROR_HISTORY:]
    _update_circuit(key)


def get_last_error(key: str) -> Optional[dict]:
    history = _ERROR_HISTORY.get(key)
    return history[-1] if history else None


def get_error_history(key: str) -> list:
    return list(reversed(_ERROR_HISTORY.get(key, [])))


def clear_error(key: str) -> None:
    _ERROR_HISTORY.pop(key, None)
    _reset_circuit(key)


# ── In-memory metrics ──────────────────────────────────────────────────────────

def record_request(key: str, duration_ms: float, is_error: bool = False) -> None:
    if key not in _METRICS:
        _METRICS[key] = {"requests": 0, "total_ms": 0.0, "errors": 0, "last_at": None}
    m = _METRICS[key]
    m["requests"] += 1
    m["total_ms"] += duration_ms
    if is_error:
        m["errors"] += 1
    m["last_at"] = datetime.now(timezone.utc).isoformat()


def get_metrics(key: str) -> dict:
    m = _METRICS.get(key, {})
    if not m:
        return {"requests": 0, "avg_ms": 0, "errors": 0, "error_rate": 0, "last_at": None}
    reqs = m["requests"]
    avg = round(m["total_ms"] / reqs, 1) if reqs else 0
    rate = round(m["errors"] / reqs * 100, 1) if reqs else 0
    return {
        "requests": reqs,
        "avg_ms": avg,
        "errors": m["errors"],
        "error_rate": rate,
        "last_at": m["last_at"],
    }


def get_all_metrics() -> dict:
    return {key: get_metrics(key) for key in _METRICS}


# ── Circuit breaker ────────────────────────────────────────────────────────────

def _update_circuit(key: str) -> None:
    if key not in _CIRCUIT:
        _CIRCUIT[key] = {"error_times": [], "open": False, "opened_at": None}
    cb = _CIRCUIT[key]
    now = datetime.now(timezone.utc)
    window_start = (now - timedelta(minutes=_CIRCUIT_WINDOW_MINUTES)).isoformat()
    cb["error_times"].append(now.isoformat())
    cb["error_times"] = [t for t in cb["error_times"] if t >= window_start]
    if len(cb["error_times"]) >= _CIRCUIT_THRESHOLD and not cb["open"]:
        cb["open"] = True
        cb["opened_at"] = now.isoformat()


def _reset_circuit(key: str) -> None:
    if key in _CIRCUIT:
        _CIRCUIT[key] = {"error_times": [], "open": False, "opened_at": None}


def is_circuit_open(key: str) -> bool:
    return _CIRCUIT.get(key, {}).get("open", False)


def get_circuit_status(key: str) -> dict:
    cb = _CIRCUIT.get(key)
    if not cb:
        return {"open": False, "errors_in_window": 0, "opened_at": None}
    now = datetime.now(timezone.utc)
    window_start = (now - timedelta(minutes=_CIRCUIT_WINDOW_MINUTES)).isoformat()
    recent = [t for t in cb["error_times"] if t >= window_start]
    return {
        "open": cb["open"],
        "errors_in_window": len(recent),
        "opened_at": cb["opened_at"],
        "threshold": _CIRCUIT_THRESHOLD,
        "window_minutes": _CIRCUIT_WINDOW_MINUTES,
    }


def reset_circuit(key: str) -> None:
    _reset_circuit(key)
