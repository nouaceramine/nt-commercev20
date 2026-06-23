#!/usr/bin/env python3
"""
bridge.py — NT Commerce Local Bridge
Polls the cloud for pending mobile recharge tasks, executes USSD codes via a
GSM USB modem, and reports the result back to the cloud.

Usage:
    python bridge.py            # start normal operation (Ctrl+C to stop)
    python bridge.py --check    # check modem & cloud status, then exit
    python bridge.py --config /path/to/config.json
"""
import argparse
import json
import logging
import logging.handlers
import sys
import time
from pathlib import Path

import requests

try:
    import modem as modem_module
    # Use the flag exposed by modem.py to detect real pyserial availability.
    # _MODEM_OK=True only when both import modem AND pyserial itself succeed.
    _MODEM_OK = getattr(modem_module, "SERIAL_AVAILABLE", False)
except ImportError:
    modem_module = None
    _MODEM_OK = False

# ── Paths ────────────────────────────────────────────────────────────────────
BRIDGE_DIR  = Path(__file__).parent
CONFIG_FILE = BRIDGE_DIR / "config.json"
LOG_FILE    = BRIDGE_DIR / "bridge.log"

# ── Tunables ─────────────────────────────────────────────────────────────────
DEFAULT_POLL_INTERVAL    = 5
DEFAULT_BALANCE_INTERVAL = 3600
DEFAULT_LOG_MAX_LINES    = 1000
REQUEST_TIMEOUT          = 20
MAX_RETRY_WAIT           = 60

log = logging.getLogger("bridge")


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  CONFIG                                                                  ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def load_config(path: Path = None) -> dict:
    cfg_path = path or CONFIG_FILE
    if not cfg_path.exists():
        print(f"\n❌  ملف الإعداد غير موجود: {cfg_path}")
        print("    أنشئ bridge/config.json — راجع bridge/README.md للتفاصيل.\n")
        sys.exit(1)
    try:
        with open(cfg_path, encoding="utf-8") as f:
            cfg = json.load(f)
    except json.JSONDecodeError as exc:
        print(f"\n❌  خطأ في تنسيق config.json: {exc}\n")
        sys.exit(1)

    required = ["cloud_url", "tenant_id", "bridge_secret"]
    missing  = [k for k in required if not cfg.get(k)]
    if missing:
        print(f"\n❌  حقول ناقصة في config.json: {', '.join(missing)}\n")
        sys.exit(1)

    # modems is optional — bridge still heartbeats and updates cloud status
    # even when no modems are configured (tasks will fail with clear message).
    if not cfg.get("modems"):
        print("⚠  لا توجد مودمات في config.json — لن تُنفَّذ عمليات الشحن"
              " حتى تُضاف مودمات.")

    cfg["cloud_url"] = cfg["cloud_url"].rstrip("/")
    cfg.setdefault("poll_interval",    DEFAULT_POLL_INTERVAL)
    cfg.setdefault("balance_interval", DEFAULT_BALANCE_INTERVAL)
    cfg.setdefault("log_max_lines",    DEFAULT_LOG_MAX_LINES)
    return cfg


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  LOGGING                                                                 ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def setup_logging(max_lines: int = DEFAULT_LOG_MAX_LINES) -> None:
    log.setLevel(logging.DEBUG)

    console = logging.StreamHandler(sys.stdout)
    console.setLevel(logging.INFO)
    console.setFormatter(
        logging.Formatter("[%(asctime)s] %(message)s", "%H:%M:%S")
    )
    log.addHandler(console)

    fh = logging.handlers.RotatingFileHandler(
        LOG_FILE,
        maxBytes=max_lines * 120,
        backupCount=1,
        encoding="utf-8",
    )
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(
        logging.Formatter(
            "[%(asctime)s] %(levelname)-5s %(message)s", "%Y-%m-%d %H:%M:%S"
        )
    )
    log.addHandler(fh)


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  CLOUD API                                                               ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def _headers(cfg: dict) -> dict:
    return {
        "X-Bridge-Secret": cfg["bridge_secret"],
        "X-Tenant-ID":     cfg["tenant_id"],
        "Content-Type":    "application/json",
    }


def _get(cfg: dict, path: str):
    url = f"{cfg['cloud_url']}/api{path}"
    try:
        return requests.get(url, headers=_headers(cfg), timeout=REQUEST_TIMEOUT)
    except requests.ConnectionError:
        log.warning("⚠  لا يمكن الاتصال بالسحابة: %s", cfg["cloud_url"])
    except requests.Timeout:
        log.warning("⚠  انتهت مهلة الاتصال بالسحابة")
    except Exception as exc:
        log.error("❌  خطأ في الاتصال: %s", exc)
    return None


def _patch(cfg: dict, path: str, data: dict) -> bool:
    url = f"{cfg['cloud_url']}/api{path}"
    try:
        resp = requests.patch(
            url, headers=_headers(cfg), json=data, timeout=REQUEST_TIMEOUT
        )
        if resp.status_code < 300:
            return True
        log.error("❌  PATCH %s → HTTP %s | %s",
                  path, resp.status_code, resp.text[:200])
    except Exception as exc:
        log.error("❌  خطأ في إرسال البيانات: %s", exc)
    return False


def heartbeat(cfg: dict) -> bool:
    resp = _get(cfg, "/recharge/bridge/status")
    if resp and resp.status_code == 200:
        pending = resp.json().get("pending_tasks", 0)
        if pending:
            log.debug("💓 heartbeat — مهام معلقة: %d", pending)
        return True
    if resp:
        log.warning("⚠  Heartbeat: HTTP %s", resp.status_code)
    return False


def fetch_tasks(cfg: dict) -> tuple:
    """Fetch and claim pending tasks from the cloud.

    Returns (tasks: list, connection_error: bool, check_balances: bool).
    ``connection_error`` is True when the cloud was unreachable so callers
    can apply a longer retry wait (10s) instead of the normal poll interval.
    ``check_balances`` is True when an admin triggered an on-demand balance
    refresh from the dashboard; the flag is atomically cleared by the server
    on each read so only one bridge cycle runs the extra check.
    """
    resp = _get(cfg, "/recharge/bridge/tasks")
    if resp is None:
        return [], True, False   # network/timeout error
    if resp.status_code == 200:
        data = resp.json()
        # New envelope format: {"tasks": [...], "check_balances": bool}
        # Legacy list format still accepted for forward-compatibility.
        if isinstance(data, dict):
            tasks          = data.get("tasks", [])
            check_balances = bool(data.get("check_balances", False))
        else:
            tasks          = data if isinstance(data, list) else []
            check_balances = False
        return tasks, False, check_balances
    if resp.status_code == 403:
        log.error(
            "❌  رُفض الوصول (403). تحقق من bridge_secret و tenant_id في config.json"
        )
    else:
        log.warning("⚠  fetch_tasks → HTTP %s", resp.status_code)
    return [], False, False   # server error — still not a connectivity issue


def report_result(cfg: dict, task_id: str, success: bool, message: str) -> None:
    status = "success" if success else "failed"
    ok = _patch(
        cfg,
        f"/recharge/bridge/tasks/{task_id}/result",
        {"status": status, "result_message": message[:500]},
    )
    if not ok:
        log.error("❌  فشل إرسال نتيجة المهمة %s", task_id[:8])


def push_sim_balance(cfg: dict, slot_id: int, text: str, amount) -> None:
    _patch(
        cfg,
        f"/recharge/bridge/sim/{slot_id}/balance",
        {"balance_text": text[:300], "balance": float(amount or 0)},
    )


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  STARTUP MODEM VERIFICATION                                              ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def verify_modems_at_startup(cfg: dict) -> None:
    """Check every configured modem before entering the poll loop.

    Logs pass/fail for each modem and prints a warning summary if any are
    unavailable.  Does NOT abort — a missing modem only fails tasks for that
    network; the bridge continues for the rest.
    """
    if not _MODEM_OK:
        log.warning("⚠  pyserial غير مثبّت — تعذّر فحص المودمات.")
        log.warning("   شغّل: pip install pyserial")
        return

    modems = cfg.get("modems", [])
    if not modems:
        log.warning("⚠  لا توجد مودمات مُعرَّفة في config.json")
        return

    failed = []
    for m in modems:
        port    = m.get("port", "?")
        network = m.get("network", "?")
        pin     = m.get("pin", "") or None

        log.info("🔌 فحص مودم %s [%s] ...", network, port)
        status = modem_module.check_modem_status(port, pin=pin)
        if status.get("ok"):
            log.info(
                "   ✅ %s: يعمل | إشارة: %s | شريحة: %s",
                network,
                status.get("signal", "?"),
                status.get("pin_status", "?"),
            )
        else:
            err = status.get("error", "خطأ مجهول")
            log.warning("   ⚠  %s: لا يستجيب — %s", network, err)
            failed.append(network)

    if not failed:
        log.info("✅ جميع المودمات تعمل")
    else:
        log.warning(
            "⚠  %d/%d مودم لا يستجيب: %s — سيفشل الشحن عبرها حتى تُصلَح",
            len(failed), len(modems), ", ".join(failed),
        )


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  MODEM MAPPING                                                           ║
# ╚══════════════════════════════════════════════════════════════════════════╝

_NETWORK_ALIASES: dict[str, list[str]] = {
    "mobilis": ["mobilis", "موبيليس", "mobilise", "mobile"],
    "djezzy":  ["djezzy", "djezzi", "جازي", "جيزي", "jeezy"],
    "ooredoo": ["ooredoo", "أوريدو", "oredoo", "oreedoo"],
}


def _normalize(name: str) -> str:
    n = name.lower().strip()
    for canonical, aliases in _NETWORK_ALIASES.items():
        if n in [a.lower() for a in aliases]:
            return canonical
    return n


def find_modem(modems: list, network: str):
    target = _normalize(network)
    for m in modems:
        if _normalize(m.get("network", "")) == target:
            return m
    return None


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  TASK EXECUTION                                                          ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def execute_task(cfg: dict, task: dict) -> None:
    task_id   = task.get("id", "?")
    short_id  = task_id[:8]
    operator  = task.get("operator", "unknown")
    phone     = task.get("phone_number", "?")
    amount    = task.get("amount", 0)
    ussd_code = task.get("ussd_code", "")

    masked_phone = f"****{phone[-4:]}" if len(str(phone)) >= 4 else "****"
    log.info("▶  [%s] %s | %s | %s دج", short_id, operator, masked_phone, amount)

    if not ussd_code:
        msg = "لا يوجد كود USSD في المهمة"
        log.error("   ❌ %s", msg)
        report_result(cfg, task_id, False, msg)
        return

    modem_cfg = find_modem(cfg["modems"], operator)
    if modem_cfg is None:
        msg = f"لا يوجد مودم مُعرَّف للشبكة: {operator}"
        log.error("   ❌ %s", msg)
        report_result(cfg, task_id, False, msg)
        return

    port = modem_cfg.get("port", "")
    pin  = modem_cfg.get("pin", "") or None

    log.info("   📡 %s → %s [%s]", ussd_code, port, operator)

    if not _MODEM_OK:
        msg = "pyserial غير مثبّت — يتعذر تنفيذ USSD"
        log.error("   ❌ %s", msg)
        report_result(cfg, task_id, False, msg)
        return

    result  = modem_module.send_ussd(port, ussd_code, pin=pin)
    success = result.get("success", False)
    message = result.get("message", "")

    if success:
        log.info("   ✅ نجح: %s", message[:120])
    else:
        log.warning("   ❌ فشل: %s", message[:120])

    report_result(cfg, task_id, success, message)


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  BALANCE CHECKS                                                          ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def run_balance_checks(cfg: dict) -> None:
    if not _MODEM_OK:
        log.debug("pyserial غير متوفر — تخطي فحص الرصيد")
        return

    for m in cfg.get("modems", []):
        port       = m.get("port", "")
        network    = m.get("network", "?")
        bal_ussd   = m.get("balance_ussd", "")
        slot_id    = m.get("slot_id")
        pin        = m.get("pin", "") or None

        if not bal_ussd:
            log.debug("لا يوجد balance_ussd لـ %s — تخطي", network)
            continue

        log.info("📊 فحص رصيد %s [%s] ...", network, port)
        try:
            result = modem_module.check_balance(port, bal_ussd, pin=pin)
            text   = result.get("text", "")
            amount = result.get("amount")

            if text:
                log.info("   💰 %s: %s", network, text[:120])
                if slot_id is not None:
                    push_sim_balance(cfg, slot_id, text, amount)
            else:
                log.warning("   ⚠  لم يُستلم رصيد من %s", network)
        except Exception as exc:
            log.error("   ❌ خطأ في فحص رصيد %s: %s", network, exc)


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  CHECK MODE                                                              ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def run_check(cfg: dict) -> None:
    SEP = "═" * 56
    print(f"\n{SEP}")
    print("   NT Commerce — Bridge Status Check")
    print(SEP)

    resp = _get(cfg, "/recharge/bridge/status")
    print(f"\n☁  السحابة:  {cfg['cloud_url']}")
    if resp and resp.status_code == 200:
        data = resp.json()
        print(f"   الحالة:    ✅ متصل")
        print(f"   مهام معلقة: {data.get('pending_tasks', 0)}")
        print(f"   Tenant ID: {cfg['tenant_id']}")
    else:
        code = resp.status_code if resp else "لا يوجد اتصال"
        print(f"   الحالة:    ❌ فشل ({code})")
        if resp and resp.status_code == 403:
            print("   تحقق من bridge_secret و tenant_id في config.json")

    print()
    if not _MODEM_OK:
        print("⚠  pyserial غير مثبّت.\n   شغّل: pip install pyserial\n")
    else:
        for m in cfg.get("modems", []):
            port     = m.get("port", "?")
            network  = m.get("network", "?")
            pin      = m.get("pin", "") or None
            bal_ussd = m.get("balance_ussd", "")

            print(f"📱 {network} ({port})")
            status = modem_module.check_modem_status(port, pin=pin)

            if status.get("ok"):
                print(f"   المودم:    ✅ يعمل")
                print(f"   الإشارة:   {status.get('signal', '?')}")
                print(f"   الشريحة:   {status.get('pin_status', '?')}")
                mfr = status.get("manufacturer", "")
                mdl = status.get("model", "")
                if mfr or mdl:
                    print(f"   الجهاز:    {mfr} {mdl}".strip())
                if bal_ussd:
                    print(f"   الرصيد:    جاري الفحص …", end="", flush=True)
                    try:
                        bal  = modem_module.check_balance(port, bal_ussd, pin=pin)
                        text = bal.get("text", "غير متاح")
                        amt  = bal.get("amount")
                        display = f"{text[:80]}"
                        if amt is not None:
                            display += f"  [{amt:.2f} دج]"
                        print(f"\r   الرصيد:    {display}")
                    except Exception as exc:
                        print(f"\r   الرصيد:    ❌ {exc}")
            else:
                print(f"   المودم:    ❌ {status.get('error', 'خطأ مجهول')}")
            print()

    print(SEP + "\n")


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  MAIN LOOP                                                               ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def main() -> None:
    parser = argparse.ArgumentParser(
        description="NT Commerce Local Bridge — جسر الشحن المحلي"
    )
    parser.add_argument(
        "--check", action="store_true",
        help="فحص حالة السحابة والمودمات ثم الخروج"
    )
    parser.add_argument(
        "--config", type=str, default=None,
        help="مسار ملف الإعداد (افتراضي: bridge/config.json)"
    )
    args = parser.parse_args()

    cfg_path = Path(args.config) if args.config else None
    cfg      = load_config(cfg_path)
    setup_logging(cfg.get("log_max_lines", DEFAULT_LOG_MAX_LINES))

    if args.check:
        run_check(cfg)
        return

    log.info("═" * 56)
    log.info("  NT Commerce — Local Bridge — بدء التشغيل")
    log.info("═" * 56)
    log.info("☁  السحابة:  %s", cfg["cloud_url"])
    log.info("🔑 Tenant:   %s", cfg["tenant_id"])
    log.info("📡 مودمات:   %d", len(cfg.get("modems", [])))
    for m in cfg.get("modems", []):
        log.info("   %s → %s", m.get("network"), m.get("port"))
    log.info("⏱  استقصاء: كل %d ثانية", cfg["poll_interval"])
    log.info("═" * 56)

    # ── Cloud connectivity check — infinite 10s retry until connected ──────────
    # Per spec: "إن انقطع الاتصال بالسحابة أو بالمودم يعيد المحاولة كل 10 ثوانٍ
    # بدلاً من الإيقاف" — same policy applies at startup.
    STARTUP_RETRY_INTERVAL = 10
    attempt = 0
    while True:
        if heartbeat(cfg):
            log.info("✅ الاتصال بالسحابة ناجح")
            break
        attempt += 1
        if attempt == 1:
            log.warning(
                "⚠  تعذّر الاتصال بالسحابة — إعادة المحاولة كل %ds ...",
                STARTUP_RETRY_INTERVAL,
            )
            log.warning("   تحقق من cloud_url و bridge_secret و tenant_id في config.json")
        try:
            time.sleep(STARTUP_RETRY_INTERVAL)
        except KeyboardInterrupt:
            log.info("\n🛑 تم إيقاف البرنامج يدوياً أثناء الانتظار.")
            sys.exit(0)

    # ── Modem hardware verification ─────────────────────────────────────────
    verify_modems_at_startup(cfg)

    # ── Initial balance check ───────────────────────────────────────────────
    run_balance_checks(cfg)

    poll_interval      = cfg["poll_interval"]
    balance_interval   = cfg["balance_interval"]
    last_balance_t     = time.time()
    consecutive_errors = 0
    CONN_ERROR_WAIT    = 10  # seconds to wait when cloud is unreachable mid-run

    log.info("🚀 البرنامج يعمل — انتظر المهام... (Ctrl+C للإيقاف)")

    while True:
        try:
            if time.time() - last_balance_t >= balance_interval:
                run_balance_checks(cfg)
                last_balance_t = time.time()

            tasks, conn_error, check_balances = fetch_tasks(cfg)

            if conn_error:
                # Cloud unreachable — retry every 10s as required by spec
                log.warning("⚠  السحابة غير متاحة — إعادة المحاولة بعد %ds", CONN_ERROR_WAIT)
                time.sleep(CONN_ERROR_WAIT)
                continue

            # On-demand balance check requested by admin from the dashboard
            if check_balances:
                log.info("📊 طلب تحديث الأرصدة من لوحة الإدارة — جاري الفحص…")
                run_balance_checks(cfg)
                last_balance_t = time.time()

            if tasks:
                log.info("📥 مهام جديدة: %d", len(tasks))
                for task in tasks:
                    execute_task(cfg, task)

            consecutive_errors = 0
            time.sleep(poll_interval)

        except KeyboardInterrupt:
            log.info("")
            log.info("🛑 تم إيقاف البرنامج يدوياً. إلى اللقاء!")
            break
        except Exception as exc:
            consecutive_errors += 1
            wait = min(10 * consecutive_errors, MAX_RETRY_WAIT)
            log.error(
                "❌ خطأ في الحلقة الرئيسية: %s — إعادة المحاولة بعد %ds",
                exc, wait,
            )
            time.sleep(wait)


if __name__ == "__main__":
    main()
