# p188: Bill of Materials — production recipes & manufacturing runs
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import math
import uuid


class Component(BaseModel):
    product_id: str
    quantity: float  # per one output batch


class RecipeCreate(BaseModel):
    product_id: str  # output product
    name: str
    output_qty: float = 1
    components: List[Component]


class RecipeUpdate(BaseModel):
    name: Optional[str] = None
    output_qty: Optional[float] = None
    components: Optional[List[Component]] = None


class RunCreate(BaseModel):
    recipe_id: str
    batches: float = 1


def _now():
    return datetime.now(timezone.utc)


def create_production_routes(db, get_current_user, get_tenant_admin) -> dict:
    router = APIRouter(prefix="/production", tags=["production"])

    def _recipes():
        # resolve per-call: _TenantDBProxy routes via ContextVar
        return db.recipes

    def _orders():
        return db.production_orders

    def _out(d):
        d = dict(d)
        d.pop("_id", None)
        return d

    async def _product(pid):
        return await db.products.find_one({"id": pid}, {"_id": 0, "name_ar": 1, "name_en": 1, "quantity": 1, "purchase_price": 1, "retail_price": 1, "is_non_stockable": 1})

    async def _validate_recipe(product_id: str, components: List[Component], output_qty: float):
        out_p = await _product(product_id)
        if not out_p:
            raise HTTPException(status_code=404, detail="المنتج النهائي غير موجود")
        if not components:
            raise HTTPException(status_code=400, detail="الوصفة تحتاج مكوّناً واحداً على الأقل")
        if output_qty <= 0:
            raise HTTPException(status_code=400, detail="كمية الإنتاج يجب أن تكون موجبة")
        seen = set()
        enriched = []
        for c in components:
            if c.product_id == product_id:
                raise HTTPException(status_code=400, detail="المنتج لا يمكن أن يكون مكوّناً لنفسه")
            if c.product_id in seen:
                raise HTTPException(status_code=400, detail="مكوّن مكرر في الوصفة")
            seen.add(c.product_id)
            if c.quantity <= 0:
                raise HTTPException(status_code=400, detail="كمية المكوّن يجب أن تكون موجبة")
            cp = await _product(c.product_id)
            if not cp:
                raise HTTPException(status_code=404, detail=f"مكوّن غير موجود: {c.product_id}")
            enriched.append({
                "product_id": c.product_id,
                "product_name": cp.get("name_ar") or cp.get("name_en"),
                "quantity": c.quantity,
                "unit_cost": cp.get("purchase_price", 0) or 0,
            })
        unit_cost = sum(c["quantity"] * c["unit_cost"] for c in enriched) / output_qty
        return enriched, round(unit_cost, 2)

    # ---------- Recipes ----------
    @router.get("/recipes")
    async def list_recipes(user: dict = Depends(get_current_user)):
        cursor = _recipes().find({}).sort("created_at", -1).limit(500)
        out = []
        async for r in cursor:
            r = _out(r)
            p = await _product(r["product_id"])
            r["product_name"] = (p.get("name_ar") or p.get("name_en")) if p else None
            r["output_stock"] = p.get("quantity") if p else None
            # p304: live food cost & margin from CURRENT component purchase prices
            # (purchases keep product.purchase_price fresh; stored unit_cost is
            # only a fallback when a component product was deleted)
            live = 0.0
            for c in (r.get("components") or []):
                cp = await _product(c["product_id"])
                cc = (cp.get("purchase_price") if cp else None)
                if cc is None:
                    cc = c.get("unit_cost", 0) or 0
                live += (c.get("quantity") or 0) * (cc or 0)
            live_unit = round(live / (r.get("output_qty") or 1), 2)
            r["live_unit_cost"] = live_unit
            price = (p.get("retail_price") or 0) if p else 0
            r["dish_price"] = price
            r["margin"] = round(price - live_unit, 2)
            r["margin_pct"] = round((price - live_unit) / price * 100, 1) if price > 0 else None
            r["food_cost_pct"] = round(live_unit / price * 100, 1) if price > 0 else None
            out.append(r)
        return out

    @router.post("/recipes")
    async def create_recipe(data: RecipeCreate, admin: dict = Depends(get_tenant_admin)):
        name = data.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="اسم الوصفة مطلوب")
        if await _recipes().find_one({"product_id": data.product_id}):
            raise HTTPException(status_code=409, detail="لهذا المنتج وصفة موجودة — عدّلها")
        components, unit_cost = await _validate_recipe(data.product_id, data.components, data.output_qty)
        doc = {
            "id": f"rcp_{uuid.uuid4().hex[:12]}",
            "product_id": data.product_id,
            "name": name,
            "output_qty": data.output_qty,
            "components": components,
            "unit_cost": unit_cost,
            "created_at": _now(),
            "updated_at": _now(),
        }
        await _recipes().insert_one(doc)
        return _out(doc)

    @router.put("/recipes/{recipe_id}")
    async def update_recipe(recipe_id: str, data: RecipeUpdate, admin: dict = Depends(get_tenant_admin)):
        r = await _recipes().find_one({"id": recipe_id})
        if not r:
            raise HTTPException(status_code=404, detail="الوصفة غير موجودة")
        output_qty = data.output_qty if data.output_qty is not None else r["output_qty"]
        comps = data.components if data.components is not None else [
            Component(product_id=c["product_id"], quantity=c["quantity"]) for c in r["components"]
        ]
        name = data.name.strip() if data.name is not None else r["name"]
        if not name:
            raise HTTPException(status_code=400, detail="اسم الوصفة مطلوب")
        components, unit_cost = await _validate_recipe(r["product_id"], comps, output_qty)
        await _recipes().update_one({"id": recipe_id}, {"$set": {
            "name": name, "output_qty": output_qty, "components": components,
            "unit_cost": unit_cost, "updated_at": _now(),
        }})
        return _out(await _recipes().find_one({"id": recipe_id}))

    @router.delete("/recipes/{recipe_id}")
    async def delete_recipe(recipe_id: str, admin: dict = Depends(get_tenant_admin)):
        if not await _recipes().find_one({"id": recipe_id}):
            raise HTTPException(status_code=404, detail="الوصفة غير موجودة")
        if await _orders().count_documents({"recipe_id": recipe_id}):
            raise HTTPException(status_code=400, detail="للوصفة أوامر إنتاج — لا يمكن حذفها")
        await _recipes().delete_one({"id": recipe_id})
        return {"ok": True}

    @router.get("/recipes/{recipe_id}/max-batches")
    async def max_batches(recipe_id: str, user: dict = Depends(get_current_user)):
        r = await _recipes().find_one({"id": recipe_id})
        if not r:
            raise HTTPException(status_code=404, detail="الوصفة غير موجودة")
        limits = []
        for c in r["components"]:
            cp = await _product(c["product_id"])
            stock = (cp.get("quantity") or 0) if cp else 0
            limits.append({
                "product_id": c["product_id"], "product_name": c["product_name"],
                "needed_per_batch": c["quantity"], "stock": stock,
                "max_batches": math.floor(stock / c["quantity"]) if c["quantity"] > 0 else 0,
            })
        return {"max_batches": min(x["max_batches"] for x in limits), "components": limits}

    # ---------- Production runs ----------
    @router.get("/orders")
    async def list_orders(user: dict = Depends(get_current_user)):
        cursor = _orders().find({}).sort("created_at", -1).limit(200)
        return [_out(o) async for o in cursor]

    @router.post("/run")
    async def run_production(data: RunCreate, user: dict = Depends(get_current_user)):
        r = await _recipes().find_one({"id": data.recipe_id})
        if not r:
            raise HTTPException(status_code=404, detail="الوصفة غير موجودة")
        if data.batches <= 0:
            raise HTTPException(status_code=400, detail="عدد الدفعات يجب أن يكون موجباً")
        out_p = await _product(r["product_id"])
        if not out_p:
            raise HTTPException(status_code=404, detail="المنتج النهائي غير موجود")

        # Atomic component claims with rollback (same pattern as sales_service)
        claimed = []
        for c in r["components"]:
            need = c["quantity"] * data.batches
            cp = await _product(c["product_id"])
            if cp and cp.get("is_non_stockable"):
                continue
            res = await db.products.find_one_and_update(
                {"id": c["product_id"], "quantity": {"$gte": need}},
                {"$inc": {"quantity": -need}},
            )
            if res is None:
                for pid, q in claimed:
                    await db.products.update_one({"id": pid}, {"$inc": {"quantity": q}})
                stock = (cp.get("quantity") or 0) if cp else 0
                raise HTTPException(status_code=400, detail=f"مخزون غير كافٍ للمكوّن '{c['product_name']}': المتاح {stock} والمطلوب {need}")
            claimed.append((c["product_id"], need))

        output_qty = r["output_qty"] * data.batches
        # refresh component costs at run time
        comp_snap = []
        for c in r["components"]:
            cp = await _product(c["product_id"])
            cost = (cp.get("purchase_price", 0) or 0) if cp else c["unit_cost"]
            comp_snap.append({**c, "unit_cost": cost, "consumed": c["quantity"] * data.batches})
        total_cost = sum(c["unit_cost"] * c["consumed"] for c in comp_snap)
        unit_cost = round(total_cost / output_qty, 2) if output_qty else 0

        await db.products.update_one(
            {"id": r["product_id"]},
            {"$inc": {"quantity": output_qty}, "$set": {"purchase_price": unit_cost}},
        )

        day = _now().strftime("%Y%m%d")
        count = await _orders().count_documents({"code": {"$regex": f"^PRD-{day}-"}})
        doc = {
            "id": f"prd_{uuid.uuid4().hex[:12]}",
            "code": f"PRD-{day}-{count + 1:04d}",
            "recipe_id": r["id"],
            "recipe_name": r["name"],
            "product_id": r["product_id"],
            "product_name": out_p.get("name_ar") or out_p.get("name_en"),
            "batches": data.batches,
            "output_qty": output_qty,
            "components": comp_snap,
            "total_cost": round(total_cost, 2),
            "unit_cost": unit_cost,
            "created_by": user.get("name") or user.get("username"),
            "created_at": _now(),
        }
        await _orders().insert_one(doc)
        await _recipes().update_one({"id": r["id"]}, {"$set": {"unit_cost": unit_cost, "updated_at": _now()}})
        return _out(doc)

    return {"router": router}
