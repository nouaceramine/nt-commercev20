"""Van sales module (البيع المتجول) — module pack M9.

A van is a mobile warehouse (warehouses.is_van=True) driven by an agent:
stock is loaded from the main warehouse in the morning (per-location balances
via services.warehouse_stock — never touching the global product quantity),
the agent sells through the regular POS with warehouse_id=van (so every sale
keeps its own stock + accounting), unsold goods return at night, and the day
is closed by counting the agent's cash against the booked cash sales.

Day-close variance posts an honest ledger adjustment instead of silently
distorting the box mirror:
- shortage (counted < booked): Dr 425 ذمم وكلاء البيع المتجول / Cr 530
  (the box mirror drops to physical reality; the agent owes the difference)
- overage  (counted > booked): Dr 530 / Cr 765 إيرادات متنوعة
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from services.warehouse_stock import adjust_warehouse_stock
from utils.ids import new_id

VAN_ACCOUNTS = [
    ("425", "ذمم وكلاء البيع المتجول", "asset"),
    ("765", "إيرادات متنوعة", "revenue"),
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def day_variance(expected: float, counted: float) -> float:
    return round(counted - expected, 2)


def close_summary(loads_value: float, unloads_value: float, sales_total: float,
                  expected_cash: float, counted: float) -> dict:
    return {
        "loaded_value": round(loads_value, 2),
        "returned_value": round(unloads_value, 2),
        "sales_total": round(sales_total, 2),
        "expected_cash": round(expected_cash, 2),
        "cash_counted": round(counted, 2),
        "variance": day_variance(expected_cash, counted),
    }


class VanIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    driver_name: str = ""
    vehicle_plate: str = ""
    phone: str = ""


class VanUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    driver_name: Optional[str] = None
    vehicle_plate: Optional[str] = None
    phone: Optional[str] = None
    active: Optional[bool] = None


class TransferItem(BaseModel):
    product_id: str
    quantity: int = Field(gt=0, le=1000000)


class LoadIn(BaseModel):
    van_id: str = Field(min_length=1)
    items: List[TransferItem] = Field(min_length=1, max_length=300)
    notes: str = ""


class OpenDayIn(BaseModel):
    van_id: str = Field(min_length=1)
    driver_name: str = ""
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


class CloseDayIn(BaseModel):
    cash_counted: float = Field(ge=0, le=1e12)
    notes: str = ""


def create_van_sales_routes(db, get_current_user, get_tenant_admin, require_tenant):
    router = APIRouter(prefix="/van-sales", tags=["van-sales"])

    async def _get_van(van_id: str) -> dict:
        v = await db.warehouses.find_one({"id": van_id, "is_van": True})
        if not v:
            raise HTTPException(status_code=404, detail="الشاحنة غير موجودة")
        return v

    async def _main_warehouse() -> dict:
        w = await db.warehouses.find_one({"is_main": True})
        if not w:
            w = await db.warehouses.find_one({"is_van": {"$ne": True}})
        if not w:
            raise HTTPException(status_code=400, detail="لا يوجد مخزن رئيسي — أنشئ مخزناً أولاً")
        return w

    async def _next_code(prefix: str) -> str:
        year = _now()[:4]
        counter = await db.counters.find_one_and_update(
            {"_id": f"{prefix}_{year}"}, {"$inc": {"seq": 1}},
            upsert=True, return_document=True)
        return f"{prefix}-{year}-{counter['seq']:04d}"

    async def _ensure_accounts() -> dict:
        out = {}
        for code, name, atype in VAN_ACCOUNTS:
            acc = await db.accounts.find_one({"code": code})
            if not acc:
                acc = {"id": new_id(), "code": code, "name": name, "name_ar": name,
                       "account_type": atype, "parent_id": None,
                       "description": "حساب البيع المتجول (نظام)", "balance": 0,
                       "is_active": True, "created_by": "system", "created_at": _now()}
                try:
                    await db.accounts.insert_one(acc)
                except Exception:
                    acc = await db.accounts.find_one({"code": code})
            out[code] = acc
        return out

    # ── Vans ──
    @router.get("/vans")
    async def list_vans(user: dict = Depends(require_tenant)):
        items = await db.warehouses.find({"is_van": True}, {"_id": 0}).to_list(200)
        return {"items": items, "count": len(items)}

    @router.post("/vans", status_code=201)
    async def create_van(body: VanIn, user: dict = Depends(get_tenant_admin)):
        doc = {"id": new_id(), "code": await _next_code("VAN"),
               "name": body.name.strip(), "is_van": True,
               "is_main": False, "driver_name": body.driver_name,
               "vehicle_plate": body.vehicle_plate, "phone": body.phone,
               "address": "", "manager": body.driver_name, "notes": "",
               "active": True, "created_at": _now(), "created_by": user.get("name", "")}
        await db.warehouses.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.put("/vans/{van_id}")
    async def update_van(van_id: str, body: VanUpdate, user: dict = Depends(get_tenant_admin)):
        await _get_van(van_id)
        upd = {k: v for k, v in body.model_dump().items() if v is not None}
        if not upd:
            raise HTTPException(status_code=400, detail="لا تعديلات")
        upd["updated_at"] = _now()
        await db.warehouses.update_one({"id": van_id}, {"$set": upd})
        return await db.warehouses.find_one({"id": van_id}, {"_id": 0})

    @router.get("/vans/{van_id}/stock")
    async def van_stock(van_id: str, user: dict = Depends(require_tenant)):
        await _get_van(van_id)
        rows = await db.warehouse_stock.find(
            {"warehouse_id": van_id, "quantity": {"$gt": 0}}, {"_id": 0}).to_list(1000)
        pids = [r["product_id"] for r in rows]
        products = {}
        async for p in db.products.find({"id": {"$in": pids}},
                                        {"id": 1, "name": 1, "name_en": 1, "name_ar": 1,
                                         "purchase_price": 1, "retail_price": 1, "barcode": 1}):
            products[p["id"]] = p
        items = []
        for r in rows:
            p = products.get(r["product_id"], {})
            items.append({
                "product_id": r["product_id"],
                "product_name": p.get("name") or p.get("name_ar") or p.get("name_en") or "",
                "barcode": p.get("barcode", ""), "quantity": r["quantity"],
                "purchase_price": p.get("purchase_price") or 0,
                "retail_price": p.get("retail_price") or 0,
                "stock_value": round(r["quantity"] * (p.get("purchase_price") or 0), 2),
            })
        return {"van_id": van_id, "items": items,
                "total_value": round(sum(i["stock_value"] for i in items), 2)}

    # ── Load / unload ──
    async def _transfer(body: LoadIn, direction: str, user: dict):
        van = await _get_van(body.van_id)
        if van.get("active") is False:
            raise HTTPException(status_code=400, detail="الشاحنة غير مفعّلة")
        main = await _main_warehouse()
        if main["id"] == van["id"]:
            raise HTTPException(status_code=400, detail="لا يمكن التحميل من الشاحنة إلى نفسها")
        src, dst = (main, van) if direction == "load" else (van, main)
        code = await _next_code("VL")
        now = _now()
        moved, total_value = [], 0.0
        for it in body.items:
            product = await db.products.find_one({"id": it.product_id})
            if not product:
                raise HTTPException(status_code=404, detail=f"المنتج {it.product_id} غير موجود")
            if direction == "load":
                product_qty = float(product.get("quantity", 0) or 0)
                if product_qty < it.quantity:
                    raise HTTPException(status_code=400,
                                        detail=f"الكمية غير كافية: {product.get('name') or it.product_id}")
                src_before, src_init = product_qty, True
            else:
                row = await db.warehouse_stock.find_one(
                    {"product_id": it.product_id, "warehouse_id": van["id"]})
                have = float(row["quantity"]) if row else 0.0
                if have < it.quantity:
                    raise HTTPException(
                        status_code=400,
                        detail=f"رصيد الشاحنة غير كافٍ: {product.get('name') or it.product_id} ({have:g} < {it.quantity})")
                src_before, src_init = have, False
            await adjust_warehouse_stock(db, it.product_id, src["id"], -it.quantity,
                                         product_quantity_before=src_before,
                                         initialize_from_product=src_init)
            await adjust_warehouse_stock(db, it.product_id, dst["id"], it.quantity,
                                         product_quantity_before=0,
                                         initialize_from_product=False)
            value = round(it.quantity * (product.get("purchase_price") or 0), 2)
            total_value = round(total_value + value, 2)
            moved.append({"product_id": it.product_id,
                          "product_name": product.get("name") or product.get("name_ar") or product.get("name_en") or "",
                          "quantity": it.quantity, "value": value})
            await db.stock_transfers.insert_one({
                "id": new_id(), "from_warehouse": src["id"], "from_warehouse_name": src["name"],
                "to_warehouse": dst["id"], "to_warehouse_name": dst["name"],
                "product_id": it.product_id, "product_name": moved[-1]["product_name"],
                "quantity": it.quantity, "van_load_code": code, "created_at": now})
        doc = {"id": new_id(), "code": code, "type": direction, "van_id": van["id"],
               "van_name": van["name"], "other_warehouse_id": main["id"],
               "other_warehouse_name": main["name"], "items": moved,
               "total_value": total_value, "notes": body.notes,
               "created_at": now, "created_by": user.get("name", "")}
        await db.van_loads.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.post("/load", status_code=201)
    async def load_van(body: LoadIn, user: dict = Depends(get_tenant_admin)):
        return await _transfer(body, "load", user)

    @router.post("/unload", status_code=201)
    async def unload_van(body: LoadIn, user: dict = Depends(get_tenant_admin)):
        return await _transfer(body, "unload", user)

    @router.get("/loads")
    async def list_loads(van_id: Optional[str] = None, user: dict = Depends(require_tenant)):
        q = {"van_id": van_id} if van_id else {}
        items = await db.van_loads.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)
        return {"items": items, "count": len(items)}

    # ── Days (tours) ──
    @router.post("/days/open", status_code=201)
    async def open_day(body: OpenDayIn, user: dict = Depends(get_tenant_admin)):
        van = await _get_van(body.van_id)
        existing = await db.van_days.find_one(
            {"van_id": body.van_id, "date": body.date, "status": "open"})
        if existing:
            raise HTTPException(status_code=409,
                                detail=f"يوم مفتوح مسبقاً لهذه الشاحنة: {existing['code']}")
        doc = {"id": new_id(), "code": await _next_code("VD"), "van_id": van["id"],
               "van_name": van["name"],
               "driver_name": body.driver_name or van.get("driver_name", ""),
               "date": body.date, "status": "open",
               "created_at": _now(), "created_by": user.get("name", "")}
        await db.van_days.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.get("/days")
    async def list_days(van_id: Optional[str] = None, status: Optional[str] = None,
                        user: dict = Depends(require_tenant)):
        q: dict = {}
        if van_id:
            q["van_id"] = van_id
        if status:
            q["status"] = status
        items = await db.van_days.find(q, {"_id": 0}).sort("date", -1).to_list(300)
        return {"items": items, "count": len(items)}

    @router.post("/days/{day_id}/close")
    async def close_day(day_id: str, body: CloseDayIn, user: dict = Depends(get_tenant_admin)):
        day = await db.van_days.find_one({"id": day_id})
        if not day:
            raise HTTPException(status_code=404, detail="اليوم غير موجود")
        if day.get("status") != "open":
            raise HTTPException(status_code=400, detail="اليوم مغلق مسبقاً")
        date = day["date"]
        van_id = day["van_id"]
        # booked cash sales from this van on this date
        sales = await db.sales.find(
            {"warehouse_id": van_id, "created_at": {"$regex": f"^{date}"},
             "status": {"$nin": ["cancelled", "deleted"]}},
            {"total": 1, "payment_method": 1}).to_list(2000)
        sales_total = round(sum(s.get("total", 0) for s in sales), 2)
        expected_cash = round(sum(s.get("total", 0) for s in sales
                                  if s.get("payment_method", "cash") == "cash"), 2)
        loads = await db.van_loads.find(
            {"van_id": van_id, "created_at": {"$regex": f"^{date}"}}, {"_id": 0}).to_list(300)
        loads_value = sum(l["total_value"] for l in loads if l["type"] == "load")
        unloads_value = sum(l["total_value"] for l in loads if l["type"] == "unload")
        summary = close_summary(loads_value, unloads_value, sales_total,
                                expected_cash, body.cash_counted)
        variance = summary["variance"]
        now = _now()
        if abs(variance) >= 0.01:
            accs = await _ensure_accounts()
            from services.accounting_auto import ensure_accounts, _insert_entry
            await ensure_accounts(db)
            acc530 = await db.accounts.find_one({"code": "530"})

            def line(acc, d=0.0, c=0.0):
                return {"account_id": acc["id"], "account_code": acc["code"],
                        "account_name": acc.get("name_ar") or acc.get("name"),
                        "debit": round(d, 2), "credit": round(c, 2)}

            if variance < 0:
                lines = [line(accs["425"], d=-variance), line(acc530, c=-variance)]
                desc = f"عجز نقدية وكيل {day['driver_name'] or day['van_name']}"
            else:
                lines = [line(acc530, d=variance), line(accs["765"], c=variance)]
                desc = f"فائض نقدية وكيل {day['driver_name'] or day['van_name']}"
            await _insert_entry(
                db, reference=f"إغلاق يوم {day['code']} — {day['van_name']}",
                reference_id=day_id, source_tag="van_day_close",
                description=f"{desc} ({variance})", lines=lines, date=now[:10])
            await db.cash_boxes.update_one(
                {"id": "cash"}, {"$inc": {"balance": variance}, "$set": {"updated_at": now}})
        await db.van_days.update_one(
            {"id": day_id},
            {"$set": {"status": "closed", "closed_at": now,
                      "closed_by": user.get("name", ""), "close_notes": body.notes,
                      **summary}})
        return {"id": day_id, "code": day["code"], "status": "closed", **summary}

    return {"router": router}
