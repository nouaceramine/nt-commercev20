"""
modem.py — GSM Modem AT Command Interface
Handles serial communication, SIM PIN unlock, USSD execution, and balance check.
Requires: pyserial
"""
import re
import time
import logging

try:
    import serial
    import serial.serialutil
    _SERIAL_OK = True
except ImportError:
    _SERIAL_OK = False

# Exposed so bridge.py can detect real pyserial availability without
# re-importing serial itself (modem.py catches the ImportError internally).
SERIAL_AVAILABLE: bool = _SERIAL_OK

logger = logging.getLogger("bridge.modem")

BAUD_RATE    = 9600
READ_TIMEOUT = 15
USSD_WAIT    = 35

SUCCESS_KEYWORDS = [
    "تم تحويل", "تم الشحن", "تمت عملية", "تم شحن", "نجح", "نجاح",
    "تم إرسال", "تمت العملية", "رصيدك الجديد",
    "Recharge effectuée", "rechargé", "réussie", "recharge a bien été",
    "Opération réussie", "rechargement", "crédité", "bien été effectuée",
    "successfully", "recharge successful",
]

FAILURE_KEYWORDS = [
    "غير صالح", "فشل", "خطأ", "لا يمكن", "غير كافٍ", "غير كافي",
    "error", "failed", "invalide", "insuffisant", "incorrect",
    "échoué", "introuvable", "numéro invalide",
]


def _require_serial():
    if not _SERIAL_OK:
        raise RuntimeError(
            "pyserial غير مثبّت. شغّل الأمر:\n  pip install pyserial"
        )


def open_port(port: str, baud: int = BAUD_RATE, timeout: int = READ_TIMEOUT):
    """Open a serial port and return the Serial object."""
    _require_serial()
    ser = serial.Serial(
        port=port,
        baudrate=baud,
        timeout=timeout,
        write_timeout=10,
        bytesize=serial.EIGHTBITS,
        parity=serial.PARITY_NONE,
        stopbits=serial.STOPBITS_ONE,
    )
    time.sleep(0.5)
    ser.reset_input_buffer()
    ser.reset_output_buffer()
    return ser


def send_at(ser, cmd: str, expected: str = "OK", timeout: float = 5.0) -> str:
    """Send an AT command; return full response string.

    Reads until the expected terminator (or ERROR / timeout).
    """
    ser.reset_input_buffer()
    ser.write((cmd + "\r\n").encode())
    logger.debug("AT→ %s", cmd)

    deadline = time.time() + timeout
    lines = []
    while time.time() < deadline:
        if ser.in_waiting:
            raw = ser.readline()
            line = raw.decode("utf-8", errors="replace").strip()
            if line:
                lines.append(line)
                logger.debug("AT← %s", line)
                terminators = ("OK", "ERROR", "NO CARRIER",
                               "+CME ERROR", "+CMS ERROR")
                if line.startswith(terminators):
                    break
                if expected and expected in line:
                    break
        else:
            time.sleep(0.05)

    return "\n".join(lines)


def read_until(ser, marker: str, timeout: float = USSD_WAIT) -> str:
    """Accumulate serial data until ``marker`` appears or ``timeout`` elapses."""
    deadline = time.time() + timeout
    buf = ""
    while time.time() < deadline:
        if ser.in_waiting:
            chunk = ser.read(ser.in_waiting).decode("utf-8", errors="replace")
            buf += chunk
            logger.debug("RAW← %s", chunk.strip())
            if marker in buf:
                break
        else:
            time.sleep(0.1)
    return buf


def check_pin(ser) -> str:
    """Return SIM PIN status string: READY | SIM PIN | SIM PUK | …

    AT+CPIN? response is "+CPIN: SIM PIN" or "+CPIN: READY" — note multi-word
    values like "SIM PIN" require capturing the rest of the line, not just \S+.
    """
    resp = send_at(ser, "AT+CPIN?", expected="+CPIN:", timeout=5)
    m = re.search(r"\+CPIN:\s*(.+)", resp)
    return m.group(1).strip() if m else resp.strip()


def unlock_sim(ser, pin: str) -> bool:
    """Unlock SIM with the given PIN. Returns True on success."""
    resp = send_at(ser, f'AT+CPIN="{pin}"', expected="OK", timeout=10)
    time.sleep(2)
    return "OK" in resp


def get_signal_quality(ser) -> str:
    """Return signal quality description (e.g. '-79 dBm (جيد)')."""
    resp = send_at(ser, "AT+CSQ", expected="+CSQ:", timeout=5)
    m = re.search(r"\+CSQ:\s*(\d+)", resp)
    if m:
        rssi = int(m.group(1))
        if rssi == 99:
            return "غير معروف"
        dbm = -113 + rssi * 2
        if dbm >= -70:
            quality = "ممتاز"
        elif dbm >= -85:
            quality = "جيد"
        elif dbm >= -100:
            quality = "ضعيف"
        else:
            quality = "سيئ جداً"
        return f"{dbm} dBm ({quality})"
    return "?"


def _parse_ussd_text(raw: str) -> str:
    """Extract human-readable text from a raw +CUSD: response."""
    m = re.search(r'\+CUSD:\s*\d+,"([^"]*)"', raw, re.DOTALL)
    if m:
        return m.group(1).strip()
    m = re.search(r'\+CUSD:\s*\d+,([^\n,]+)', raw)
    if m:
        return m.group(1).strip()
    return raw.strip()


def _is_success(text: str) -> bool:
    """Return True only when an explicit success keyword is found and no
    failure keyword is present.

    The heuristic "contains digits → success" is intentionally removed:
    an ambiguous carrier response (e.g. plain balance display) must NOT be
    classified as a successful recharge — a false positive would suppress the
    wallet refund flow and cost the customer money.
    """
    lower = text.lower()
    for kw in FAILURE_KEYWORDS:
        if kw.lower() in lower:
            return False
    for kw in SUCCESS_KEYWORDS:
        if kw.lower() in lower:
            return True
    return False


def send_ussd(port: str, ussd_code: str, pin: str = None,
              timeout: float = USSD_WAIT) -> dict:
    """Execute a USSD code on ``port``.

    Returns::
        {"success": bool, "message": str, "raw": str}
    """
    _require_serial()

    for attempt in range(2):
        try:
            ser = open_port(port)
            try:
                resp = send_at(ser, "AT", expected="OK", timeout=3)
                if "OK" not in resp:
                    return {"success": False,
                            "message": "المودم لا يستجيب على AT", "raw": resp}

                pin_status = check_pin(ser)
                if pin_status == "SIM PIN":
                    if not pin:
                        return {"success": False,
                                "message": "الشريحة محمية بـ PIN ولم يُعطَ رقم",
                                "raw": ""}
                    if not unlock_sim(ser, pin):
                        return {"success": False,
                                "message": "فشل فتح قفل الشريحة — تحقق من الـ PIN",
                                "raw": ""}
                elif pin_status not in ("READY",):
                    return {"success": False,
                            "message": f"حالة غير متوقعة للشريحة: {pin_status}",
                            "raw": ""}

                send_at(ser, "AT+CMGF=1", expected="OK", timeout=3)

                ser.reset_input_buffer()
                cmd = f'AT+CUSD=1,"{ussd_code}",15'
                ser.write((cmd + "\r\n").encode())
                logger.debug("USSD→ %s", cmd)

                raw = read_until(ser, "+CUSD:", timeout=timeout)

                if "+CUSD:" not in raw:
                    if attempt == 0:
                        logger.warning(
                            "لم يُستلم رد USSD في المحاولة الأولى — إعادة المحاولة...")
                        ser.close()
                        time.sleep(3)
                        continue
                    return {"success": False,
                            "message": "انتهت مهلة الانتظار بدون رد USSD",
                            "raw": raw}

                text = _parse_ussd_text(raw)
                return {"success": _is_success(text), "message": text, "raw": raw}

            finally:
                try:
                    ser.close()
                except Exception:
                    pass

        except serial.SerialException as exc:
            if attempt == 0:
                time.sleep(2)
                continue
            return {"success": False,
                    "message": f"خطأ في فتح المنفذ {port}: {exc}", "raw": ""}
        except Exception as exc:
            return {"success": False,
                    "message": f"خطأ غير متوقع: {exc}", "raw": ""}

    return {"success": False, "message": "فشلت جميع المحاولات", "raw": ""}


def check_balance(port: str, ussd_code: str, pin: str = None) -> dict:
    """Send a balance-check USSD and return parsed result.

    Returns::
        {"ok": bool, "text": str, "amount": float | None}
    """
    result = send_ussd(port, ussd_code, pin=pin, timeout=20)
    text = result.get("message", "")

    amount = None
    matches = re.findall(
        r"(\d[\d\s]*[.,]\d{1,2}|\d+)\s*(?:دج|DA|DZD|dz)", text, re.IGNORECASE
    )
    if matches:
        raw_num = matches[0].replace(" ", "").replace(",", ".")
        try:
            amount = float(raw_num)
        except ValueError:
            pass

    return {"ok": bool(text), "text": text, "amount": amount}


def check_modem_status(port: str, pin: str = None) -> dict:
    """Run a quick diagnostics check on a modem port.

    Returns::
        {"ok": bool, "port": str, "error"?: str,
         "pin_status": str, "signal": str,
         "manufacturer": str, "model": str}
    """
    _require_serial()
    try:
        ser = open_port(port, timeout=5)
        try:
            resp = send_at(ser, "AT", expected="OK", timeout=3)
            if "OK" not in resp:
                return {"ok": False, "port": port, "error": "لا يستجيب على AT"}

            manufacturer = (
                send_at(ser, "AT+CGMI", expected="OK", timeout=3)
                .replace("OK", "").strip().split("\n")[0]
            )
            model = (
                send_at(ser, "AT+CGMM", expected="OK", timeout=3)
                .replace("OK", "").strip().split("\n")[0]
            )

            pin_status = check_pin(ser)
            if pin_status == "SIM PIN" and pin:
                unlock_sim(ser, pin)
                pin_status = check_pin(ser)

            signal = get_signal_quality(ser)

            return {
                "ok": True,
                "port": port,
                "pin_status": pin_status,
                "signal": signal,
                "manufacturer": manufacturer or "?",
                "model": model or "?",
            }
        finally:
            try:
                ser.close()
            except Exception:
                pass
    except Exception as exc:
        return {"ok": False, "port": port, "error": str(exc)}
