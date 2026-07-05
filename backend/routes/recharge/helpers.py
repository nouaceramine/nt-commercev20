"""Shared helpers for the recharge package."""
import ipaddress
import socket
from urllib.parse import urlparse

from fastapi import HTTPException


def _assert_safe_bridge_url(url: str) -> None:
    """Raise HTTPException 400 if url is a private/internal network target (SSRF guard)."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="رابط الجسر يجب أن يبدأ بـ http:// أو https://")
    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="رابط الجسر غير صالح")
    try:
        ip = ipaddress.ip_address(socket.gethostbyname(hostname))
    except socket.gaierror:
        raise HTTPException(status_code=400, detail="تعذّر التحقق من رابط الجسر — اسم المضيف غير صالح")
    if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_unspecified:
        raise HTTPException(status_code=400, detail="رابط الجسر يشير إلى عنوان شبكة داخلية غير مسموح")
