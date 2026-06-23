"""
Motherboard module layer.

Each domain of NT Commerce is an independent, swappable component living in
`backend/modules/<key>.py`. Every component exposes a single `register(app, ctx)`
entry point that mounts its routers onto the FastAPI app.

`mount_all` loads each component in isolation: if one component fails to mount,
the failure is logged to that component's own log file and recorded in the
diagnostics registry, while every other component still loads. This is the
"motherboard" contract — components plug in independently and a broken one does
not take the whole board down.
"""
import importlib
import traceback
import uuid
from datetime import datetime, timezone

from core import get_module_logger
from core import registry


class AppContext:
    """A simple container holding every shared dependency a component may need
    (database handles, auth dependencies, helper functions, constants, schemas).
    Components read what they need as attributes (e.g. `ctx.db`)."""

    def __init__(self, **deps):
        self.__dict__.update(deps)


# Components mounted through the module layer. `robots` is intentionally absent
# because its endpoints live inline in main.py (they depend on the in-process
# robot_manager); it still exists in the registry for logging and error tagging.
COMPONENT_MODULES = [
    "auth",
    "products",
    "sales",
    "purchases",
    "customers",
    "suppliers",
    "inventory",
    "finance",
    "accounting",
    "repairs",
    "reports",
    "ai",
    "notifications",
    "services",
    "digital_panel",
    "store",
    "integrations",
    "employees",
    "tasks",
    "search",
    "security",
    "backup",
    "settings",
    "saas",
    "installments",
]


_COMPONENT_SET = frozenset(COMPONENT_MODULES)


def mount_all(app, ctx):
    """Mount every component in isolation. Returns (mounted, failed) key lists."""
    core_log = get_module_logger("core")
    mounted, failed = [], []
    for key in COMPONENT_MODULES:
        if key not in _COMPONENT_SET:
            continue
        try:
            module = importlib.import_module(f"modules.{key}")
            module.register(app, ctx)
            mounted.append(key)
        except Exception as exc:  # isolate: one bad component must not stop boot
            failed.append(key)
            comp_log = get_module_logger(key)
            comp_log.error(
                f"Component '{key}' failed to mount: {exc}\n{traceback.format_exc()}"
            )
            registry.record_error(key, {
                "error_id": uuid.uuid4().hex[:8],
                "message": f"mount failed: {exc}",
                "path": f"(mount) modules.{key}",
                "method": "MOUNT",
                "time": datetime.now(timezone.utc).isoformat(),
            })
    core_log.info(
        f"Module layer mounted {len(mounted)}/{len(COMPONENT_MODULES)} components"
        + (f"; FAILED: {failed}" if failed else "")
    )
    return mounted, failed
