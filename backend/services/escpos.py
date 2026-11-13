# -*- coding: utf-8 -*-
"""D2: ESC/POS direct thermal printing for kitchen order tickets (KOT).

Algerian kitchens typically run 58/80mm thermal printers reachable over raw
TCP on port 9100. The browser print path (KDS window.print) needs a manned
screen + print dialog; this module fires the ticket straight to the printer
when a kitchen order is created/appended.

- build_kot_escpos: pure builder → ESC/POS byte payload (testable, no I/O)
- send_escpos: blocking TCP sender (run via asyncio.to_thread)
- maybe_auto_fire_kitchen_ticket: fire-and-forget hook used by the
  restaurant routes after order create/append; never raises.
"""
import asyncio
import socket
from datetime import datetime, timezone

ESC = b"\x1b"
GS = b"\x1d"
INIT = ESC + b"@"
ALIGN_CENTER = ESC + b"a" + b"\x01"
ALIGN_LEFT = ESC + b"a" + b"\x00"
DOUBLE_ON = GS + b"!" + b"\x11"   # double width + height
DOUBLE_OFF = GS + b"!" + b"\x00"
BOLD_ON = ESC + b"E" + b"\x01"
BOLD_OFF = ESC + b"E" + b"\x00"
CUT = GS + b"V" + b"\x41" + b"\x03"  # partial cut with feed

DEFAULT_WIDTH = 42          # 80mm printers; 58mm ≈ 32
DEFAULT_PORT = 9100
# cp864 is the DOS Arabic page many DZ printers ship with, but CPython codec
# lacks the Arabic block — cp1256 is the safe default.
SUPPORTED_ENCODINGS = ("cp1256", "utf-8", "cp864")


def _fmt_qty(q) -> str:
    try:
        f = float(q)
        return str(int(f)) if f == int(f) else f"{f:g}"
    except Exception:  # noqa: BLE001
        return str(q)


def _clip(text: str, width: int) -> str:
    text = (text or "").replace("\n", " ").strip()
    return text if len(text) <= width else text[: max(width - 2, 1)] + ".."


def build_kot_escpos(order: dict, store_name: str = "", encoding: str = "cp1256",
                     width: int = DEFAULT_WIDTH) -> bytes:
    """Build the ESC/POS payload for a kitchen order ticket. Pure — no I/O."""
    if encoding not in SUPPORTED_ENCODINGS:
        encoding = "cp1256"
    width = max(24, min(int(width or DEFAULT_WIDTH), 48))
    sep = "-" * width

    def line(text: str) -> bytes:
        return (text + "\n").encode(encoding, errors="replace")

    parts = [INIT, ALIGN_CENTER]
    if store_name:
        parts += [BOLD_ON, line(_clip(store_name, width)), BOLD_OFF]
    parts += [DOUBLE_ON, line(_clip(str(order.get("code") or "—"), width)), DOUBLE_OFF]

    table = order.get("table_name")
    if table:
        parts += [BOLD_ON, line(_clip(f"طاولة: {table}", width)), BOLD_OFF]
    parts.append(line(sep))
    parts.append(ALIGN_LEFT)

    for it in order.get("items") or []:
        name = _clip(str(it.get("product_name") or "?"), width - 8)
        qty = _fmt_qty(it.get("quantity", 1))
        parts += [BOLD_ON, line(f"{qty} x {name}"), BOLD_OFF]
        variant = it.get("variant")
        if isinstance(variant, dict) and variant.get("name"):
            parts.append(line(f"   • {_clip(str(variant['name']), width - 5)}"))
        for mod in it.get("modifiers") or []:
            if isinstance(mod, dict) and mod.get("name"):
                parts.append(line(f"   + {_clip(str(mod['name']), width - 5)}"))
        if it.get("note"):
            parts.append(line(f"   ! {_clip(str(it['note']), width - 5)}"))

    parts.append(ALIGN_CENTER)
    parts.append(line(sep))
    if order.get("notes"):
        parts += [BOLD_ON, line(_clip(f"ملاحظة: {order['notes']}", width)), BOLD_OFF]
    ts = order.get("created_at")
    if isinstance(ts, datetime):
        ts = ts.isoformat()
    if ts:
        parts.append(line(str(ts)[:16].replace("T", " ")))
    parts.append(line(f"المصدر: {order.get('source') or 'pos'}"))
    parts.append(b"\n\n\n")
    parts.append(CUT)
    return b"".join(parts)


def build_test_escpos(store_name: str = "", encoding: str = "cp1256",
                      width: int = DEFAULT_WIDTH) -> bytes:
    return build_kot_escpos(
        {"code": "TEST-PRINT", "table_name": None, "source": "test",
         "items": [{"product_name": "اختبار طباعة المطبخ", "quantity": 1}],
         "notes": "تذكرة اختبار — إن وصلتك فالطابعة جاهزة",
         "created_at": datetime.now(timezone.utc).isoformat()},
        store_name=store_name, encoding=encoding, width=width)


def send_escpos(host: str, port: int, payload: bytes, timeout: float = 5.0) -> None:
    """Blocking raw-TCP sender — call via asyncio.to_thread. Raises on failure."""
    with socket.create_connection((host, int(port)), timeout=timeout) as sock:
        sock.sendall(payload)


async def fire_kitchen_ticket(db, order: dict, trigger: str = "auto") -> dict:
    """Send a KOT for `order` to the configured kitchen printer. Never raises.

    Returns {"ok": bool, "error": str|None, "sent": bool} and appends a
    print_logs entry when the printer is configured.
    """
    try:
        settings = await db.printer_settings.find_one({"id": "default"}, {"_id": 0}) or {}
        kp = settings.get("kitchen_printer") or {}
        if not kp.get("enabled") or not kp.get("host"):
            return {"ok": False, "error": "kitchen printer not configured", "sent": False}
        payload = build_kot_escpos(
            order,
            store_name=kp.get("store_name") or settings.get("store_name") or "",
            encoding=kp.get("encoding", "cp864"),
            width=kp.get("width", DEFAULT_WIDTH),
        )
        copies = max(1, min(int(kp.get("copies", 1)), 3))
        for _ in range(copies):
            await asyncio.to_thread(send_escpos, kp["host"], int(kp.get("port", DEFAULT_PORT)), payload)
        result = {"ok": True, "error": None, "sent": True}
    except Exception as e:  # noqa: BLE001 — printing must never break ordering
        result = {"ok": False, "error": str(e)[:300], "sent": True}
    try:
        await db.print_logs.insert_one({
            "type": "kitchen_ticket",
            "order_id": order.get("id"),
            "order_code": order.get("code"),
            "trigger": trigger,
            "ok": result["ok"],
            "error": result["error"],
            "at": datetime.now(timezone.utc),
        })
    except Exception:  # noqa: BLE001
        pass
    return result


async def maybe_auto_fire_kitchen_ticket(db, order: dict) -> None:
    """Fire-and-forget hook: auto-print only when settings opt in. Never raises."""
    try:
        settings = await db.printer_settings.find_one({"id": "default"}, {"_id": 0}) or {}
        kp = settings.get("kitchen_printer") or {}
        if kp.get("enabled") and kp.get("auto_print") and kp.get("host"):
            await fire_kitchen_ticket(db, order, trigger="auto")
    except Exception:  # noqa: BLE001
        pass
