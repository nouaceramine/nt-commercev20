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


# D1: IMEI lifecycle — status transitions with an event trail
SERIAL_TRANSITIONS = {
    "in_stock": {"defective"},
    "sold": {"defective"},
    "defective": {"repaired", "in_stock"},
    "repaired": {"in_stock"},
}


def serial_transition_ok(current: str, target: str) -> bool:
    return target in SERIAL_TRANSITIONS.get(current, set())


def warranty_info(doc: dict) -> dict:
    """Compute warranty state from sold_at + warranty_months."""
    months = doc.get("warranty_months")
    sold_at = doc.get("sold_at")
    if not months or not sold_at:
        return {"warranty_status": "none", "warranty_expires_at": None}
    try:
        from datetime import timedelta
        start = sold_at if isinstance(sold_at, datetime) else datetime.fromisoformat(str(sold_at).replace("Z", "+00:00"))
        if start.tzinfo is None:  # BSON round-trip strips tzinfo — treat as UTC
            start = start.replace(tzinfo=timezone.utc)
        expires = start + timedelta(days=30 * int(months))
        status = "active" if datetime.now(timezone.utc) <= expires else "expired"
        return {"warranty_status": status, "warranty_expires_at": expires.isoformat()}
    except Exception:  # noqa: BLE001
        return {"warranty_status": "unknown", "warranty_expires_at": None}


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
        out = []
        async for x in cursor:
            d = _out(x)
            d.update(warranty_info(d))  # D1: warranty badge state in list
            out.append(d)
        return out

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
            # p492: deterministic _id per serial closes the check-then-insert
            # race — a concurrent duplicate hits DuplicateKeyError and is
            # counted as skipped, never double-registered.
            from pymongo.errors import DuplicateKeyError as _DupKey
            try:
                await _serials().insert_one({
                    "_id": f"sn_{sn}",
                    "id": f"sn_{uuid.uuid4().hex[:12]}",
                    "product_id": data.product_id,
                    "serial": sn,
                    "status": "in_stock",
                    "sale_id": None,
                    "sold_at": None,
                    "created_at": _now(),
                })
            except _DupKey:
                skipped += 1
                continue
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
        out.update(warranty_info(doc))  # D1
        out["events"] = doc.get("events", [])
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

    class _StatusIn(BaseModel):
        status: str
        note: Optional[str] = ""

    class _WarrantyIn(BaseModel):
        months: int

    @router.put("/{serial_id}/status")
    async def set_serial_status(serial_id: str, data: _StatusIn, admin: dict = Depends(get_tenant_admin)):
        doc = await _serials().find_one({"id": serial_id})
        if not doc:
            raise HTTPException(status_code=404, detail="غير موجود")
        cur = doc.get("status", "in_stock")
        if not serial_transition_ok(cur, data.status):
            raise HTTPException(status_code=409, detail=f"انتقال غير مسموح: {cur} → {data.status}")
        ev = {"from": cur, "to": data.status, "note": (data.note or "").strip(),
              "at": _now().isoformat(), "by": admin.get("id") or admin.get("email")}
        await _serials().update_one(
            {"id": serial_id},
            {"$set": {"status": data.status, "updated_at": _now()},
             "$push": {"events": ev}})
        return {"ok": True, "status": data.status}

    @router.post("/{serial_id}/warranty")
    async def set_serial_warranty(serial_id: str, data: _WarrantyIn, admin: dict = Depends(get_tenant_admin)):
        if not 1 <= data.months <= 120:
            raise HTTPException(status_code=422, detail="مدة الضمان بين 1 و120 شهراً")
        r = await _serials().update_one(
            {"id": serial_id},
            {"$set": {"warranty_months": data.months, "updated_at": _now()},
             "$push": {"events": {"from": None, "to": "warranty_set", "note": f"{data.months} شهر",
                                   "at": _now().isoformat(), "by": admin.get("id") or admin.get("email")}}})
        if not r.matched_count:
            raise HTTPException(status_code=404, detail="غير موجود")
        return {"ok": True, "warranty_months": data.months}

    @router.get("/{serial_id}/history")
    async def serial_history(serial_id: str, user: dict = Depends(get_current_user)):
        doc = await _serials().find_one({"id": serial_id})
        if not doc:
            raise HTTPException(status_code=404, detail="غير موجود")
        return {"serial": doc.get("serial"), "status": doc.get("status"),
                "warranty_months": doc.get("warranty_months"),
                **warranty_info(doc), "events": doc.get("events", [])}

    return {"router": router}
