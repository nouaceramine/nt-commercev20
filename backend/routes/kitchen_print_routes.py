# -*- coding: utf-8 -*-
"""D2: kitchen thermal printing — settings, test ticket, manual re-fire.

Configuration lives under printer_settings (id "default").kitchen_printer:
  {enabled, host, port, auto_print, encoding, width, copies, store_name}
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from services.escpos import (
    DEFAULT_PORT,
    DEFAULT_WIDTH,
    SUPPORTED_ENCODINGS,
    build_test_escpos,
    fire_kitchen_ticket,
    send_escpos,
)


def validate_kitchen_printer(data: dict) -> list:
    """Pure validation — returns a list of error codes (empty = valid)."""
    errors = []
    if data.get("enabled") and not (data.get("host") or "").strip():
        errors.append("host_required")
    port = data.get("port", DEFAULT_PORT)
    try:
        p = int(port)
        if not 1 <= p <= 65535:
            errors.append("bad_port")
    except (TypeError, ValueError):
        errors.append("bad_port")
    if data.get("encoding", "cp1256") not in SUPPORTED_ENCODINGS:
        errors.append("bad_encoding")
    try:
        w = int(data.get("width", DEFAULT_WIDTH))
        if not 24 <= w <= 48:
            errors.append("bad_width")
    except (TypeError, ValueError):
        errors.append("bad_width")
    try:
        c = int(data.get("copies", 1))
        if not 1 <= c <= 3:
            errors.append("bad_copies")
    except (TypeError, ValueError):
        errors.append("bad_copies")
    return errors


_DEFAULT_KP = {
    "enabled": False,
    "host": "",
    "port": DEFAULT_PORT,
    "auto_print": False,
    "encoding": "cp1256",
    "width": DEFAULT_WIDTH,
    "copies": 1,
    "store_name": "",
}


class KitchenPrinterIn(BaseModel):
    enabled: bool = False
    host: str = ""
    port: int = DEFAULT_PORT
    auto_print: bool = False
    encoding: str = "cp1256"
    width: int = DEFAULT_WIDTH
    copies: int = Field(default=1, ge=1, le=3)
    store_name: str = ""


def create_kitchen_print_routes(db, get_current_user, get_tenant_admin) -> dict:
    router = APIRouter(prefix="/kitchen-print", tags=["kitchen-print"])

    @router.get("/settings")
    async def get_kp_settings(user: dict = Depends(get_current_user)):
        doc = await db.printer_settings.find_one({"id": "default"}, {"_id": 0}) or {}
        kp = {**_DEFAULT_KP, **(doc.get("kitchen_printer") or {})}
        return {"kitchen_printer": kp}

    @router.put("/settings")
    async def put_kp_settings(data: KitchenPrinterIn, admin: dict = Depends(get_tenant_admin)):
        payload = data.model_dump()
        payload["host"] = (payload["host"] or "").strip()
        errors = validate_kitchen_printer(payload)
        if errors:
            raise HTTPException(status_code=422, detail={"errors": errors})
        await db.printer_settings.update_one(
            {"id": "default"},
            {"$set": {"kitchen_printer": payload}},
            upsert=True,
        )
        return {"ok": True, "kitchen_printer": payload}

    @router.post("/test")
    async def test_kp(admin: dict = Depends(get_tenant_admin)):
        doc = await db.printer_settings.find_one({"id": "default"}, {"_id": 0}) or {}
        kp = {**_DEFAULT_KP, **(doc.get("kitchen_printer") or {})}
        if not kp.get("host"):
            raise HTTPException(status_code=400, detail="عنوان الطابعة غير مضبوط")
        payload = build_test_escpos(kp.get("store_name", ""), kp["encoding"], kp["width"])
        try:
            import asyncio
            await asyncio.to_thread(send_escpos, kp["host"], int(kp["port"]), payload)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"تعذّر الوصول للطابعة: {str(e)[:200]}")
        return {"ok": True}

    @router.post("/ticket/{order_id}")
    async def fire_ticket(order_id: str, user: dict = Depends(get_current_user)):
        order = await db.kitchen_orders.find_one({"id": order_id}, {"_id": 0})
        if not order:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")
        result = await fire_kitchen_ticket(db, order, trigger="manual")
        if not result["sent"]:
            raise HTTPException(status_code=400, detail="طابعة المطبخ غير مفعّلة — اضبطها من الإعدادات")
        if not result["ok"]:
            raise HTTPException(status_code=502, detail=f"فشلت الطباعة: {result['error']}")
        return {"ok": True}

    return {"router": router}
