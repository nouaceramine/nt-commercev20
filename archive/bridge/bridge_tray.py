#!/usr/bin/env python3
"""
bridge_tray.py — NT Commerce Bridge  (Windows .exe entry point)
═══════════════════════════════════════════════════════════════
Entry point used by PyInstaller.  On startup it:
  1. Checks for a valid config.json; launches the setup wizard if missing.
  2. Starts the bridge polling loop in a background daemon thread.
  3. Shows a Windows system-tray icon (green=connected, red=disconnected).

Build with:  pyinstaller bridge.spec
Run directly: python bridge_tray.py
"""
from __future__ import annotations

import json
import logging
import sys
import threading
import time
from pathlib import Path

# ── Resolve paths whether running as .py or as frozen .exe ───────────────────
if getattr(sys, "frozen", False):
    BRIDGE_DIR = Path(sys.executable).parent
else:
    BRIDGE_DIR = Path(__file__).parent

sys.path.insert(0, str(BRIDGE_DIR))

CONFIG_FILE = BRIDGE_DIR / "config.json"
LOG_FILE    = BRIDGE_DIR / "bridge.log"

# ── Optional tray dependencies ────────────────────────────────────────────────
try:
    import pystray
    from PIL import Image, ImageDraw
    _TRAY_OK = True
except ImportError:
    _TRAY_OK = False

log = logging.getLogger("bridge_tray")


# ── Icon factory ──────────────────────────────────────────────────────────────
def _make_icon(colour: str) -> "Image.Image":
    """Create a 64×64 coloured circle icon for the tray."""
    img  = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse((4, 4, 60, 60), fill=colour, outline="#1a56db", width=3)
    return img


_ICONS = None  # lazily populated

def _get_icons():
    global _ICONS
    if _ICONS is None and _TRAY_OK:
        _ICONS = {
            "green":  _make_icon("#22c55e"),
            "red":    _make_icon("#ef4444"),
            "yellow": _make_icon("#f59e0b"),
        }
    return _ICONS or {}


# ── Config validity check ─────────────────────────────────────────────────────
def _config_is_valid() -> bool:
    if not CONFIG_FILE.exists():
        return False
    try:
        with open(CONFIG_FILE, encoding="utf-8") as f:
            cfg = json.load(f)
        url = cfg.get("cloud_url", "")
        return bool(url and not url.startswith("https://your-app"))
    except Exception:
        return False


# ── Shared state between bridge thread and tray ───────────────────────────────
class _BridgeState:
    def __init__(self):
        self.last_heartbeat: float = 0.0
        self.running: bool         = True
        self.status: str           = "yellow"   # green / red / yellow
        self.pending: int          = 0

_state = _BridgeState()


# ── Bridge thread ─────────────────────────────────────────────────────────────
def _run_bridge():
    """Runs the bridge loop (from bridge.py) in a daemon thread.

    Includes an outer retry loop so transient crashes (e.g. network error at
    startup, unexpected exception) don't silently kill the thread.  Exponential
    back-off: 5s → 10s → 20s → … capped at 60s between retries.
    """
    import bridge as bridge_module

    # Fix 2: force both tray and bridge.py to write logs to <exe dir>/bridge.log
    # In a PyInstaller one-file build, bridge.py's __file__ resolves to the temp
    # extraction dir, so we override LOG_FILE here before setup_logging() runs.
    bridge_module.LOG_FILE = BRIDGE_DIR / "bridge.log"

    consecutive_errors = 0
    MAX_RETRY_WAIT     = 60
    CONN_ERR_WAIT      = 10

    while _state.running:
        try:
            cfg = bridge_module.load_config(CONFIG_FILE)
            bridge_module.setup_logging(cfg.get("log_max_lines", 1000))

            log.info("Bridge thread started")
            if not cfg.get("modems"):
                log.warning("⚠ No modems configured — recharge tasks will not execute "
                            "until modems are added via Reconfigure.")
            else:
                bridge_module.verify_modems_at_startup(cfg)
                bridge_module.run_balance_checks(cfg)

            poll_interval    = cfg["poll_interval"]
            balance_interval = cfg["balance_interval"]
            last_balance_t   = time.time()

            while _state.running:
                if time.time() - last_balance_t >= balance_interval:
                    bridge_module.run_balance_checks(cfg)
                    last_balance_t = time.time()

                tasks, conn_error, check_balances = bridge_module.fetch_tasks(cfg)

                if conn_error:
                    _state.status = "red"
                    time.sleep(CONN_ERR_WAIT)
                    continue

                # Successful cloud contact
                _state.last_heartbeat = time.time()
                _state.status         = "green"
                consecutive_errors    = 0

                if check_balances:
                    log.info("On-demand balance check requested from dashboard")
                    bridge_module.run_balance_checks(cfg)
                    last_balance_t = time.time()

                if tasks:
                    _state.pending = len(tasks)
                    log.info("New tasks: %d", len(tasks))
                    for task in tasks:
                        bridge_module.execute_task(cfg, task)
                    _state.pending = 0

                time.sleep(poll_interval)

        except SystemExit:
            # load_config called sys.exit — config is corrupt; mark red and stop
            _state.status = "red"
            log.error("Bridge stopped: config.json is invalid. Use Reconfigure to fix it.")
            return

        except Exception as exc:
            consecutive_errors += 1
            wait = min(5 * (2 ** min(consecutive_errors - 1, 3)), MAX_RETRY_WAIT)
            _state.status = "red"
            log.error("Bridge thread error: %s — retrying in %ds", exc, wait)
            time.sleep(wait)


# ── Tray helpers ──────────────────────────────────────────────────────────────
def _open_log():
    import subprocess
    try:
        subprocess.Popen(["notepad.exe", str(LOG_FILE)], shell=False)
    except Exception:
        pass


def _reconfigure(icon, item):
    """Stop bridge, open wizard, restart."""
    _state.running = False
    icon.stop()
    from setup_wizard import run_wizard
    if run_wizard():
        _relaunch()


def _quit_bridge(icon, item):
    _state.running = False
    icon.stop()


def _relaunch():
    """Restart the exe so bridge picks up new config."""
    import os, subprocess, shlex
    allowed_flags = {"--config", "--debug", "--port", "--host"}
    safe_argv = [sys.argv[0]]
    i = 1
    while i < len(sys.argv):
        arg = sys.argv[i]
        if arg in allowed_flags and i + 1 < len(sys.argv):
            safe_argv.append(shlex.quote(arg))
            safe_argv.append(shlex.quote(sys.argv[i + 1]))
            i += 2
        elif arg in allowed_flags:
            safe_argv.append(shlex.quote(arg))
            i += 1
        else:
            i += 1
    subprocess.Popen([sys.executable] + safe_argv)
    os._exit(0)


def _status_text():
    if _state.status == "green":
        return "✅ متصل بالسحابة"
    if _state.status == "yellow":
        return "⏳ جاري الاتصال..."
    return "❌ غير متصل"


# ── Tray icon update loop ─────────────────────────────────────────────────────
def _tray_updater(icon):
    """Periodically refresh the tray icon colour and tooltip."""
    while _state.running:
        icons = _get_icons()
        if icons and _state.status in icons:
            icon.icon  = icons[_state.status]
        icon.title = f"NT Commerce Bridge — {_status_text()}"
        time.sleep(5)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    # ── First-run wizard ──────────────────────────────────────────────────────
    if not _config_is_valid():
        try:
            from setup_wizard import run_wizard
            if not run_wizard():
                sys.exit(0)         # user closed wizard without saving
        except ImportError:
            print("setup_wizard.py not found. Create config.json manually.")
            sys.exit(1)

    if not _config_is_valid():
        sys.exit(0)                 # wizard ran but still no valid config

    # ── Start bridge thread ───────────────────────────────────────────────────
    t = threading.Thread(target=_run_bridge, daemon=True, name="bridge-loop")
    t.start()

    # ── System tray (optional) ────────────────────────────────────────────────
    if _TRAY_OK:
        icons = _get_icons()
        menu  = pystray.Menu(
            pystray.MenuItem("NT Commerce Bridge", None, enabled=False),
            pystray.MenuItem(lambda item: _status_text(), None, enabled=False),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("📄 عرض السجل  (View Log)", lambda i, it: _open_log()),
            pystray.MenuItem("⚙ إعادة الإعداد  (Reconfigure)", _reconfigure),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("✖ إنهاء  (Quit)", _quit_bridge),
        )

        icon = pystray.Icon(
            "nt_commerce_bridge",
            icon=icons.get("yellow"),
            title="NT Commerce Bridge — ⏳ جاري الاتصال...",
            menu=menu,
        )

        # Updater thread
        upd = threading.Thread(target=_tray_updater, args=(icon,),
                               daemon=True, name="tray-updater")
        upd.start()

        icon.run()              # blocks until icon.stop() is called
    else:
        # No pystray — fall back to console loop
        print("[NT Commerce Bridge] running in console mode (no tray icon).")
        print("Press Ctrl+C to stop.")
        try:
            while _state.running:
                time.sleep(2)
        except KeyboardInterrupt:
            _state.running = False
            print("\nBridge stopped.")


if __name__ == "__main__":
    main()
