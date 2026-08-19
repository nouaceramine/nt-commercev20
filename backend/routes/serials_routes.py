# p187: IMEI / serial-number tracking for electronics & appliances
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid


class RegisterSerials(BaseModel):
    product_id: str
    serials: List[str]


def _now():
    return datetime.now(timezone.utc)


def create_serials_routes(db, get_current_user, get_tenant_admin) -> dict:
    router = APIRouter(prefix="/serials", tags=["serials"])

    def _serials():
        # resolve per-call: _TenantDBProxy routes via ContextVar
        return db.product_serials

    def _out(d):
        d = dict(d)
        d.pop("_id", None)
        return d

    @router.get("/product/{product_id}")
    async def list_product_serials(product_id: str, status: Optional[str] = None, user: dict = Depends(get_current_user)):
        q = {"product_id": product_id}
        if status:
            q["status"] = status
        cursor = _serials().find(q).sort("created_at", -1).limit(500)
        return [_out(x) async for x in cursor]

    @router.post("/register")
    async def register_serials(data: RegisterSerials, admin: dict = Depends(get_tenant_admin)):
        product = await db.products.find_one({"id": data.product_id}, {"_id": 0, "name_ar": 1, "name_en": 1})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        added, skipped = 0, 0
        for raw in data.serials:
            sn = (raw or "").strip()
            if not sn:
                continue
            exists = await _serials().find_one({"serial": sn})
            if exists:
                skipped += 1
                continue
            await _serials().insert_one({
                "id": f"sn_{uuid.uuid4().hex[:12]}",
                "product_id": data.product_id,
                "serial": sn,
                "status": "in_stock",
                "sale_id": None,
                "sold_at": None,
                "created_at": _now(),
            })
            added += 1
        return {"added": added, "skipped_duplicates": skipped}

    @router.get("/lookup")
    async def lookup_serial(serial: str, user: dict = Depends(get_current_user)):
        sn = (serial or "").strip()
        if not sn:
            raise HTTPException(status_code=400, detail="أدخل رقماً تسلسلياً")
        doc = await _serials().find_one({"serial": sn})
        if not doc:
            raise HTTPException(status_code=404, detail="الرقم التسلسلي غير مسجّل")
        out = _out(doc)
        product = await db.products.find_one({"id": doc["product_id"]}, {"_id": 0, "name_ar": 1, "name_en": 1, "barcode": 1})
        out["product_name"] = (product.get("name_ar") or product.get("name_en")) if product else None
        out["product_barcode"] = product.get("barcode") if product else None
        if doc.get("sale_id"):
            sale = await db.sales.find_one({"id": doc["sale_id"]}, {"_id": 0, "invoice_number": 1, "code": 1, "created_at": 1, "customer_name": 1, "total": 1})
            out["sale"] = sale
        return out

    @router.delete("/{serial_id}")
    async def delete_serial(serial_id: str, admin: dict = Depends(get_tenant_admin)):
        doc = await _serials().find_one({"id": serial_id})
        if not doc:
            raise HTTPException(status_code=404, detail="غير موجود")
        if doc.get("status") == "sold":
            raise HTTPException(status_code=400, detail="الرقم مُباع — لا يمكن حذفه")
        await _serials().delete_one({"id": serial_id})
        return {"ok": True}

    return {"router": router}
