"""Spreadsheet export safety helpers (CSV formula injection defense)."""
import re

_FORMULA_PREFIX = re.compile(r"^\s*[=+\-@]")


def sanitize_csv_value(value) -> str:
    """Return text that spreadsheet programs cannot interpret as a formula."""
    text = str(value if value is not None else "")
    if _FORMULA_PREFIX.match(text):
        return "'" + text
    return text


def csv_cell(value) -> str:
    """Sanitize and RFC-4180-quote one cell for hand-built CSV responses."""
    text = sanitize_csv_value(value)
    if any(char in text for char in (",", '"', "\n", "\r")):
        return '"' + text.replace('"', '""') + '"'
    return text
