"""p261: public QR-code PNG generator for printed documents.

Invoices, receipts and ecom order printouts embed <img src="/api/qr.png?text=..">
so every printed code is scannable (phone camera -> public tracking page, or
POS scanner -> invoice lookup). The endpoint only rasterises the given text;
it exposes no data, so it needs no auth. Response is CDN/browser-cacheable.
"""
import io

import qrcode
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

router = APIRouter(tags=["qr"])


@router.get("/qr.png")
async def qr_png(text: str = Query(...), size: int = 140):
    text = (text or "").strip()
    if not text or len(text) > 300:
        raise HTTPException(status_code=400, detail="نص غير صالح")
    size = max(60, min(int(size or 140), 400))
    qr = qrcode.QRCode(border=1, box_size=10)
    qr.add_data(text)
    qr.make(fit=True)
    img = qr.make_image()
    try:
        img = img.resize((size, size))
    except Exception:  # noqa: BLE001 — fallback to native size
        pass
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(
        content=buf.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )
