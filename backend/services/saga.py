# p192: Saga orchestrator — coordinated multi-step flows with automatic
# compensation. Saga state is persisted per step in the tenant DB (`sagas`
# collection), so a crash mid-saga leaves an inspectable, resumable record.
#
# Usage:
#   steps = [SagaStep("deduct_stock", action_fn, compensate_fn), ...]
#   await run_saga(tdb, "ecom_fulfillment", steps, {"order_id": ...})
#
# Semantics: steps run in order; if step N fails, steps N-1..1 are compensated
# in reverse order. The saga doc ends in one of: completed | compensated |
# compensation_failed (needs manual review). Compensation errors never throw —
# they are recorded on the saga doc.
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Awaitable, Callable, Optional

log = logging.getLogger("saga")

Action = Callable[[object, dict], Awaitable[None]]


@dataclass
class SagaStep:
    name: str
    action: Action
    compensate: Optional[Action] = None


def _now():
    return datetime.now(timezone.utc).isoformat()


async def run_saga(tdb, name: str, steps: list, context: dict,
                   saga_id: Optional[str] = None) -> dict:
    """Execute a saga. Returns the persisted saga document."""
    doc = {
        "id": saga_id or f"saga_{uuid.uuid4().hex[:12]}",
        "name": name,
        "status": "running",
        "context": context,
        "steps": [{"name": st.name, "status": "pending", "at": None, "error": None} for st in steps],
        "created_at": _now(),
        "updated_at": _now(),
    }
    await tdb.sagas.insert_one(doc)
    sid = doc["id"]

    async def _set(status=None, step_idx=None, step_status=None, error=None):
        upd = {"updated_at": _now()}
        if status:
            upd["status"] = status
        if step_idx is not None:
            upd[f"steps.{step_idx}.status"] = step_status
            upd[f"steps.{step_idx}.at"] = _now()
            if error:
                upd[f"steps.{step_idx}.error"] = str(error)[:500]
        await tdb.sagas.update_one({"id": sid}, {"$set": upd})

    done = []  # (idx, step) successfully executed, to compensate on failure
    for i, step in enumerate(steps):
        try:
            await step.action(tdb, context)
            await _set(step_idx=i, step_status="done")
            done.append((i, step))
        except Exception as exc:
            log.warning("saga %s step %s failed: %s — compensating", sid, step.name, exc)
            await _set(status="compensating", step_idx=i, step_status="failed", error=exc)
            # the failed step itself may have partial side-effects (e.g. some
            # items deducted before the shortfall) — compensate it too;
            # compensations MUST be idempotent / driven by recorded progress
            done.append((i, step))
            comp_errors = []
            for j, st in reversed(done):
                if not st.compensate:
                    continue
                try:
                    await st.compensate(tdb, context)
                    await _set(step_idx=j, step_status="compensated")
                except Exception as cerr:
                    comp_errors.append(f"{st.name}: {cerr}")
                    await _set(step_idx=j, step_status="compensation_failed", error=cerr)
            final = "compensation_failed" if comp_errors else "compensated"
            await _set(status=final)
            log.info("saga %s %s (errors: %s)", sid, final, comp_errors or "none")
            return await tdb.sagas.find_one({"id": sid}, {"_id": 0})

    await _set(status="completed")
    return await tdb.sagas.find_one({"id": sid}, {"_id": 0})


async def compensate_saga(tdb, saga_id: str, steps: list) -> dict:
    """Manually compensate a completed saga (e.g. order cancelled later).
    Only steps with status 'done' are compensated, in reverse order."""
    doc = await tdb.sagas.find_one({"id": saga_id}, {"_id": 0})
    if not doc:
        raise ValueError(f"saga {saga_id} not found")
    if doc["status"] not in ("completed",):
        return doc  # already compensated or never ran
    await tdb.sagas.update_one({"id": saga_id}, {"$set": {"status": "compensating", "updated_at": _now()}})
    comp_errors = []
    by_name = {st["name"]: i for i, st in enumerate(doc["steps"])}
    for st in reversed(steps):
        i = by_name.get(st.name)
        if i is None or doc["steps"][i]["status"] != "done" or not st.compensate:
            continue
        try:
            await st.compensate(tdb, doc["context"])
            await tdb.sagas.update_one({"id": saga_id}, {"$set": {
                f"steps.{i}.status": "compensated", f"steps.{i}.at": _now(), "updated_at": _now(),
            }})
        except Exception as cerr:
            comp_errors.append(f"{st.name}: {cerr}")
            await tdb.sagas.update_one({"id": saga_id}, {"$set": {
                f"steps.{i}.status": "compensation_failed", f"steps.{i}.error": str(cerr)[:500], "updated_at": _now(),
            }})
    final = "compensation_failed" if comp_errors else "compensated"
    await tdb.sagas.update_one({"id": saga_id}, {"$set": {"status": final, "updated_at": _now()}})
    return await tdb.sagas.find_one({"id": saga_id}, {"_id": 0})
