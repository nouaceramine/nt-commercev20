"""Auto-reorder module (إعادة الطلب التلقائي) — module pack M5.

Turns the passive low-stock list into actionable purchase-order drafts:
products below their threshold (utils.inventory_queries.low_stock_filter —
the single source of truth) are grouped by supplier into suggestions with a
computed reorder quantity, and one click creates an INERT draft purchase
(stock_status="draft", financial_status="inactive" — the exact same shape
purchases_routes.create_purchase produces with confirm_stock=false, so the
existing confirm-stock flow activates stock + financials unchanged).

Safety rails:
- a product with an open auto-reorder draft is never suggested twice
  (idempotent per product, tagged via purchases.auto_reorder=True)
- excluded products (auto_reorder_excluded=True) are skipped
- quantities/prices are recomputed server-side from the product document —
  the client can only choose WHICH products to order
"""
import math
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from utils.ids import new_id
from utils.inventory_queries import low_stock_filter

SETTINGS_ID = "auto_reorder_settings"
DEFAULT_SETTINGS = {
    "enabled": True,
    "qty_multiplier": 2,      # target stock = threshold × multiplier
    "min_order_qty": 1,       # never suggest less than this
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def suggested_qty(quantity: float, threshold: float, multiplier: int, min_qty: int = 1) -> int:
    """Units to order so stock reaches threshold × multiplier."""
    target = math.ceil(threshold * multiplier)
    return int(max(target - quantity, min_qty))


class SettingsIn(BaseModel):
    enabled: bool = True
    qty_multiplier: int = Field(default=2, ge=1, le=20)
    min_order_qty: int = Field(default=1, ge=0, le=100000)


class GenerateItem(BaseModel):
    product_id: str
    quantity: int = Field(gt=0, le=1000000)


class GenerateIn(BaseModel):
    supplier_id: str = Field(min_length=1)
    items: List[GenerateItem] = Field(min_length=1, max_length=500)
    notes: str = ""


def create_auto_reorder_routes(db, get_current_user, get_tenant_admin, require_tenant):
    router = APIRouter(prefix="/auto-reorder", tags=["auto-reorder"])

    async def _settings() -> dict:
        doc = await db.tenant_settings.find_one({"id": SETTINGS_ID})
        merged = dict(DEFAULT_SETTINGS)
        if doc:
            merged.update({k: doc[k] for k in DEFAULT_SETTINGS if k in doc})
        return merged

    async def _pending_product_ids() -> set:
        """Products already inside an open auto-reorder draft purchase."""
        cursor = db.purchases.find(
            {"auto_reorder": True, "stock_status": "draft", "financial_status": "inactive"},
            {"items.product_id": 1},
        )
        ids = set()
        async for po in cursor:
            for it in po.get("items", []):
                if it.get("product_id"):
                    ids.add(it["product_id"])
        return ids

    async def _low_stock_products() -> list:
        cursor = db.products.find(
            {
                "$and": [
                    low_stock_filter(),
                    {"auto_reorder_excluded": {"$ne": True}},
                    {"is_active": {"$ne": False}},
                ]
            },
            {
                "id": 1, "name": 1, "name_en": 1, "barcode": 1, "quantity": 1,
                "low_stock_threshold": 1, "purchase_price": 1,
                "supplier_id": 1, "supplier_name": 1,
            },
        )
        return [p async for p in cursor]

    async def _supplier_name(supplier_id: str, cache: dict) -> str:
        if not supplier_id:
            return "بدون مورد"
        if supplier_id not in cache:
            sup = await db.suppliers.find_one({"id": supplier_id}, {"name": 1})
            cache[supplier_id] = sup["name"] if sup else "مورد غير معروف"
        return cache[supplier_id]

    # ── Settings ──
    @router.get("/settings")
    async def get_settings(user: dict = Depends(require_tenant)):
        return await _settings()

    @router.put("/settings")
    async def put_settings(body: SettingsIn, user: dict = Depends(get_tenant_admin)):
        doc = {"id": SETTINGS_ID, **body.model_dump(), "updated_at": _now(),
               "updated_by": user.get("name", "")}
        await db.tenant_settings.update_one({"id": SETTINGS_ID}, {"$set": doc}, upsert=True)
        return {k: doc[k] for k in DEFAULT_SETTINGS}

    # ── Suggestions ──
    @router.get("/suggestions")
    async def suggestions(user: dict = Depends(require_tenant)):
        settings = await _settings()
        pending = await _pending_product_ids()
        names_cache: dict = {}
        groups: dict = {}
        skipped_pending = 0
        for p in await _low_stock_products():
            if p["id"] in pending:
                skipped_pending += 1
                continue
            threshold = p.get("low_stock_threshold") or 10
            qty = suggested_qty(p.get("quantity", 0), threshold,
                                settings["qty_multiplier"], settings["min_order_qty"])
            unit_price = p.get("purchase_price") or 0
            sid = p.get("supplier_id") or ""
            sname = p.get("supplier_name") or await _supplier_name(sid, names_cache)
            g = groups.setdefault(sid or "_none", {
                "supplier_id": sid, "supplier_name": sname, "items": [], "total": 0.0,
            })
            g["items"].append({
                "product_id": p["id"],
                "product_name": p.get("name") or p.get("name_en") or "",
                "barcode": p.get("barcode", ""),
                "current_quantity": p.get("quantity", 0),
                "threshold": threshold,
                "suggested_qty": qty,
                "unit_price": unit_price,
                "line_total": round(qty * unit_price, 2),
            })
            g["total"] = round(g["total"] + qty * unit_price, 2)
        out = sorted(groups.values(), key=lambda g: -g["total"])
        return {
            "enabled": settings["enabled"],
            "suppliers": out,
            "products_count": sum(len(g["items"]) for g in out),
            "skipped_pending_drafts": skipped_pending,
        }

    # ── Generate draft purchase orders ──
    @router.post("/generate", status_code=201)
    async def generate(body: GenerateIn, user: dict = Depends(get_tenant_admin)):
        supplier = await db.suppliers.find_one({"id": body.supplier_id})
        if not supplier:
            raise HTTPException(status_code=404, detail="المورد غير موجود")
        pending = await _pending_product_ids()
        wanted = {it.product_id: it.quantity for it in body.items}
        pids = list(wanted)
        products = {}
        async for p in db.products.find({"id": {"$in": pids}}):
            products[p["id"]] = p
        items, skipped = [], []
        for pid, qty in wanted.items():
            p = products.get(pid)
            if not p:
                skipped.append({"product_id": pid, "reason": "المنتج غير موجود"})
                continue
            if pid in pending:
                skipped.append({"product_id": pid, "reason": "موجود في مسودة طلب تلقائي مفتوحة"})
                continue
            unit_price = p.get("purchase_price") or 0
            items.append({
                "product_id": pid,
                "product_name": p.get("name") or p.get("name_en") or "",
                "quantity": int(qty),
                "unit_price": unit_price,
                "total": round(qty * unit_price, 2),
                "update_product_prices": False,
            })
        if not items:
            raise HTTPException(status_code=409, detail="لا توجد أصناف صالحة للطلب")
        total = round(sum(i["total"] for i in items), 2)
        if total <= 0:
            raise HTTPException(status_code=422, detail="إجمالي الطلب يجب أن يكون أكبر من صفر — حدّث أسعار الشراء")
        # invoice number — same counter pattern as purchases_routes
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        counter = await db.counters.find_one_and_update(
            {"_id": f"PUR_{today}"}, {"$inc": {"seq": 1}},
            upsert=True, return_document=True,
        )
        invoice_number = f"PUR-{today}-{counter['seq']:04d}"
        now = _now()
        doc = {
            "id": new_id(), "invoice_number": invoice_number, "code": "",
            "supplier_id": body.supplier_id, "supplier_name": supplier["name"],
            "items": items, "total": total, "paid_amount": 0,
            "remaining": total, "payment_method": "cash", "payments": [],
            "status": "unpaid",
            "notes": (body.notes + " " if body.notes else "") + "[طلب تلقائي — إعادة طلب المخزون]",
            "warehouse_id": "", "warehouse_name": "",
            "stock_status": "draft", "financial_status": "inactive",
            "auto_reorder": True,
            "created_at": now, "created_by": user.get("name", ""),
        }
        await db.purchases.insert_one(doc)
        doc.pop("_id", None)
        return {"purchase": doc, "skipped": skipped}

    # ── Open auto-reorder drafts ──
    @router.get("/drafts")
    async def drafts(user: dict = Depends(require_tenant)):
        cursor = db.purchases.find(
            {"auto_reorder": True, "stock_status": "draft", "financial_status": "inactive"},
            {"_id": 0},
        ).sort("created_at", -1).limit(200)
        out = [p async for p in cursor]
        return {"drafts": out, "count": len(out)}

    # ── Exclude / include products ──
    @router.post("/exclude/{product_id}")
    async def exclude(product_id: str, user: dict = Depends(get_tenant_admin)):
        res = await db.products.update_one(
            {"id": product_id}, {"$set": {"auto_reorder_excluded": True, "updated_at": _now()}})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        return {"product_id": product_id, "auto_reorder_excluded": True}

    @router.post("/include/{product_id}")
    async def include(product_id: str, user: dict = Depends(get_tenant_admin)):
        res = await db.products.update_one(
            {"id": product_id}, {"$set": {"auto_reorder_excluded": False, "updated_at": _now()}})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        return {"product_id": product_id, "auto_reorder_excluded": False}

    return {"router": router}
