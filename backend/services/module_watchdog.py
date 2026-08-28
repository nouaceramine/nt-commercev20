"""
p343: Module Watchdog — a live robot for every registered component.

Each component declared in core/modules_map.py carries a probe:
- {"type": "http", "path": "/api/x", "expect": [200, 401, ...]} → local HTTP GET
- {"type": "collection", "name": "col", "main": true} → Mongo roundtrip
  (main=True → main_db; otherwise the first active tenant DB, read-only)

On failure (state transition ok → failing):
1. core.registry.record_error(...)      → error history + circuit breaker
2. per-module log file                  → core.logging_config.get_module_logger
3. main_db.system_errors row            → system error log (status=active)
4. AutoHeal emit_exception_finding(...) → auto-fix pipeline
5. owner notification                   → services.owner_notifier (p344)

On recovery (failing → ok): resolves the open system_errors rows, logs the
recovery, and sends the "fixed" notification.

State persists in main_db.module_robot_status so restarts don't re-notify.
"""
import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone

from config.database import client, main_db, get_tenant_db
from core import registry, modules_map
from core.logging_config import get_module_logger

logger = logging.getLogger(__name__)

_INTERVAL = int(os.environ.get("MODULE_WATCHDOG_INTERVAL", "120"))
_FIRST_DELAY = int(os.environ.get("MODULE_WATCHDOG_FIRST_DELAY", "60"))
_HTTP_TIMEOUT = 8
_BASE_URL = os.environ.get("MODULE_WATCHDOG_BASE_URL", "http://127.0.0.1:8001")
_STATUS_COLL = "module_robot_status"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _probe_http(probe: dict) -> tuple[bool, str]:
    import httpx
    expect = probe.get("expect", [200])
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as cli:
            resp = await cli.get(_BASE_URL + probe["path"])
        if resp.status_code in expect:
            return True, f"HTTP {resp.status_code}"
        return False, f"HTTP {resp.status_code} (expected {expect})"
    except Exception as exc:  # noqa: BLE001
        return False, f"HTTP error: {type(exc).__name__}: {exc}"


async def _probe_collection(probe: dict) -> tuple[bool, str]:
    name = probe["name"]
    try:
        if probe.get("main"):
            await main_db[name].find_one({}, {"_id": 1})
            return True, f"main.{name} reachable"
        tenant = await main_db.saas_tenants.find_one({}, {"_id": 0, "id": 1})
        if tenant:
            tdb = get_tenant_db(tenant['id'])
            await tdb[name].find_one({}, {"_id": 1})
            return True, f"tenant.{name} reachable"
        await main_db.command("ping")
        return True, "mongo ping ok (no tenants yet)"
    except Exception as exc:  # noqa: BLE001
        return False, f"mongo error: {type(exc).__name__}: {exc}"


async def _run_probe(comp) -> tuple[bool, str]:
    probe = comp.probe
    if not probe:
        return True, "no probe"
    if probe.get("type") == "http":
        return await _probe_http(probe)
    if probe.get("type") == "collection":
        return await _probe_collection(probe)
    return True, f"unknown probe type {probe.get('type')}"


async def _get_state(key: str) -> dict:
    doc = await main_db[_STATUS_COLL].find_one({"_id": key}, {"_id": 0}) or {}
    return doc


async def _save_state(key: str, **fields) -> None:
    await main_db[_STATUS_COLL].update_one(
        {"_id": key}, {"$set": fields}, upsert=True
    )


async def _notify(kind: str, comp, detail: str) -> None:
    """p344 hook — never raises."""
    try:
        from services import owner_notifier
        await owner_notifier.notify_module_event(kind, comp.key, comp.name_ar, detail)
    except Exception:  # noqa: BLE001
        pass


async def _on_failure(comp, detail: str, state: dict) -> None:
    now = _now_iso()
    error_id = str(uuid.uuid4())
    info = {
        "at": now,
        "source": "module_watchdog",
        "detail": detail,
        "error_id": error_id,
    }
    registry.record_error(comp.key, info)
    get_module_logger(comp.key).error("watchdog probe failed: %s", detail)

    first_failure = state.get("status") != "failing"
    await _save_state(
        comp.key, status="failing", last_fail_at=now, last_error=detail,
        last_check_at=now, fail_count=(state.get("fail_count") or 0) + 1,
        **({"total_failures": (state.get("total_failures") or 0) + 1} if first_failure else {}),
    )

    if not first_failure:
        return  # already reported; don't spam system_errors / AutoHeal / owner

    # 3) system error log
    try:
        from routes.system_errors import log_system_error
        await log_system_error(
            error_type="system",
            severity="critical",
            message=f"روبوت المراقبة: الوحدة «{comp.name_ar}» ({comp.key}) فشل فحصها — {detail}",
            tenant_id=None,
            tenant_name="النظام",
            details={"component_key": comp.key, "probe": comp.probe, "error_id": error_id},
            auto_fixable=True,
            fix_action="autoheal",
        )
    except Exception:  # noqa: BLE001
        logger.warning("watchdog: system_errors insert failed for %s", comp.key, exc_info=True)

    # 4) AutoHeal pipeline
    try:
        from services.autoheal_service import emit_exception_finding
        await emit_exception_finding(
            comp.key, comp.name_ar,
            (comp.probe or {}).get("path", f"probe:{comp.probe.get('name', '?')}" if comp.probe else "probe:?"),
            "PROBE", error_id, RuntimeError(detail),
        )
    except Exception:  # noqa: BLE001
        logger.warning("watchdog: autoheal emit failed for %s", comp.key, exc_info=True)

    # 5) owner notification
    await _notify("error", comp, detail)


async def _on_recovery(comp, detail: str, state: dict) -> None:
    now = _now_iso()
    get_module_logger(comp.key).info("watchdog probe recovered: %s", detail)
    await _save_state(comp.key, status="ok", last_ok_at=now, last_check_at=now,
                      last_error=None, fail_count=0)
    try:
        await main_db.system_errors.update_many(
            {"status": "active", "details.component_key": comp.key},
            {"$set": {"status": "resolved", "resolved_at": now,
                      "resolved_by": "module_watchdog"}},
        )
    except Exception:  # noqa: BLE001
        logger.warning("watchdog: resolve failed for %s", comp.key, exc_info=True)
    await _notify("fixed", comp, detail)


async def check_component(comp) -> dict:
    state = await _get_state(comp.key)
    ok, detail = await _run_probe(comp)
    await _save_state(
        comp.key,
        last_check_at=_now_iso(),
        total_checks=(state.get("total_checks") or 0) + 1,
    )
    if ok:
        if state.get("status") == "failing":
            await _on_recovery(comp, detail, state)
        else:
            await _save_state(comp.key, status="ok", last_ok_at=_now_iso(), last_error=None)
    else:
        await _on_failure(comp, detail, state)
    return {"key": comp.key, "ok": ok, "detail": detail}


async def run_all_probes() -> list:
    sem = asyncio.Semaphore(8)

    async def _guarded(comp):
        async with sem:
            try:
                return await check_component(comp)
            except Exception as exc:  # noqa: BLE001
                logger.warning("watchdog: probe crashed for %s", comp.key, exc_info=True)
                return {"key": comp.key, "ok": False, "detail": f"probe crash: {exc}"}

    comps = [c for c in modules_map.all_components() if c.probe]
    return await asyncio.gather(*[_guarded(c) for c in comps])


def start_module_watchdog() -> None:
    async def _loop() -> None:
        await asyncio.sleep(_FIRST_DELAY)
        logger.info("Module watchdog started (%d components, every %ss)",
                    len(modules_map.all_components()), _INTERVAL)
        while True:
            try:
                results = await run_all_probes()
                bad = [r for r in results if not r["ok"]]
                if bad:
                    logger.warning("watchdog cycle: %d/%d failing: %s",
                                   len(bad), len(results),
                                   ", ".join(r["key"] for r in bad))
            except Exception:  # noqa: BLE001
                logger.exception("watchdog cycle failed")
            await asyncio.sleep(_INTERVAL)

    asyncio.create_task(_loop())
