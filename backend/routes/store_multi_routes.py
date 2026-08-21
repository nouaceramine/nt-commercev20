"""Multi-store per tenant (p250).

Competitor parity (EcoManager multi-boutique): one tenant runs several
branded storefronts — each with its own slug, name, description and catalog
subset — over the same inventory and orders.

Design: sub-stores live in tenant_db.stores; their public slugs are registered
in main_db.store_slugs with a `store_id` (the legacy default store keeps
store_id=None → zero behaviour change). Products attach per store via
store_products.store_id; entries without store_id belong to the default store.
The public storefront (online_store_routes.get_public_store, patched) resolves
the store, overrides the displayed name/description and filters the catalog.

  POST   /api/store/multi                              — create sub-store (slug issued)
  GET    /api/store/multi                              — list sub-stores
  PUT    /api/store/multi/{id}                         — rename / describe / toggle
  DELETE /api/store/multi/{id}                         — remove (detaches its products)
  POST   /api/store/multi/{id}/products {product_ids}  — attach products
  DELETE /api/store/multi/{id}/products/{product_id}   — detach
  GET    /api/store/multi/{id}/products                — catalog
"""
from datetime import datetime, timezone
from typing import List, Optional
import logging
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config.database import db, main_db
from utils.auth import require_tenant

logger = logging.getLogger(__name__)
router = APIRouter(tags=["multi-store"])

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{2,40}$")


class StoreIn(BaseModel):
    name: str
    slug: str
    description: Optional[str] = ""
    enabled: bool = True


class StoreUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None


class ProductsIn(BaseModel):
    product_ids: List[str]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _get_store(store_id: str) -> dict:
    s = await db.stores.find_one({"id": store_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="المتجر غير موجود")
    return s


@router.post("/store/multi")
async def create_store(body: StoreIn, user: dict = Depends(require_tenant)):
    name = (body.name or "").strip()
    slug = (body.slug or "").strip().lower()
    if not name:
        raise HTTPException(status_code=400, detail="اسم المتجر مطلوب")
    if not SLUG_RE.match(slug):
        raise HTTPException(status_code=400, detail="الرابط: أحرف لاتينية صغيرة وأرقام وشرطات (3-41)")
    # global slug uniqueness (default store rows included)
    if await main_db.store_slugs.find_one({"store_slug": slug}):
        raise HTTPException(status_code=409, detail="هذا الرابط مستخدم من متجر آخر")
    # name uniqueness across tenants (same policy as p72)
    clash = await main_db.store_slugs.find_one({
        "store_name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})
    if clash:
        raise HTTPException(status_code=409, detail=f"اسم المتجر '{name}' مستخدم — اختر اسماً مختلفاً")

    tenant_id = user.get("tenant_id") or user.get("id")
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "slug": slug,
        "description": (body.description or "").strip(),
        "enabled": bool(body.enabled),
        "is_default": False,
        "created_by": user.get("id"),
        "created_at": now,
        "updated_at": now,
    }
    await db.stores.insert_one(doc)
    await main_db.store_slugs.insert_one({
        "tenant_id": tenant_id,
        "store_slug": slug,
        "store_id": doc["id"],
        "store_name": name,
        "enabled": bool(body.enabled),
        "updated_at": now,
    })
    doc.pop("_id", None)
    return {"ok": True, "store": doc, "url": f"/shop/{slug}"}


@router.get("/store/multi")
async def list_stores(user: dict = Depends(require_tenant)):
    rows = await db.stores.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for r in rows:
        r["products_count"] = await db.store_products.count_documents({"store_id": r["id"]})
        r["url"] = f"/shop/{r['slug']}"
    return {"items": rows}


@router.put("/store/multi/{store_id}")
async def update_store(store_id: str, body: StoreUpdate, user: dict = Depends(require_tenant)):
    store = await _get_store(store_id)
    updates = {"updated_at": _now()}
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="الاسم فارغ")
        clash = await main_db.store_slugs.find_one({
            "store_name": {"$regex": f"^{re.escape(name)}$", "$options": "i"},
            "store_id": {"$ne": store_id}})
        if clash:
            raise HTTPException(status_code=409, detail="الاسم مستخدم من متجر آخر")
        updates["name"] = name
    if body.description is not None:
        updates["description"] = body.description.strip()
    if body.enabled is not None:
        updates["enabled"] = bool(body.enabled)
    await db.stores.update_one({"id": store_id}, {"$set": updates})
    # keep the slug registry in sync
    sync = {"updated_at": updates["updated_at"]}
    if "name" in updates:
        sync["store_name"] = updates["name"]
    if "enabled" in updates:
        sync["enabled"] = updates["enabled"]
    await main_db.store_slugs.update_one({"store_id": store_id}, {"$set": sync})
    out = await db.stores.find_one({"id": store_id}, {"_id": 0})
    return {"ok": True, "store": out}


@router.delete("/store/multi/{store_id}")
async def delete_store(store_id: str, user: dict = Depends(require_tenant)):
    store = await _get_store(store_id)
    # detach (not delete) catalog entries — products themselves are untouched
    await db.store_products.delete_many({"store_id": store_id})
    await db.stores.delete_one({"id": store_id})
    await main_db.store_slugs.delete_one({"store_id": store_id})
    return {"ok": True}


@router.post("/store/multi/{store_id}/products")
async def attach_products(store_id: str, body: ProductsIn, user: dict = Depends(require_tenant)):
    await _get_store(store_id)
    if not body.product_ids:
        raise HTTPException(status_code=400, detail="لا منتجات")
    added, skipped = 0, 0
    for pid in body.product_ids[:500]:
        if not await db.products.find_one({"id": pid}, {"_id": 1}):
            skipped += 1
            continue
        if await db.store_products.find_one({"product_id": pid, "store_id": store_id}):
            skipped += 1
            continue
        await db.store_products.insert_one({
            "id": str(uuid.uuid4()),
            "product_id": pid,
            "store_id": store_id,
            "is_active": True,
            "created_at": _now(),
        })
        added += 1
    return {"ok": True, "added": added, "skipped": skipped}


@router.delete("/store/multi/{store_id}/products/{product_id}")
async def detach_product(store_id: str, product_id: str, user: dict = Depends(require_tenant)):
    res = await db.store_products.delete_one({"product_id": product_id, "store_id": store_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="المنتج غير مرتبط بهذا المتجر")
    return {"ok": True}


@router.get("/store/multi/{store_id}/products")
async def store_catalog(store_id: str, user: dict = Depends(require_tenant)):
    await _get_store(store_id)
    entries = await db.store_products.find({"store_id": store_id}, {"_id": 0}).to_list(10000)
    pids = [e["product_id"] for e in entries]
    products = await db.products.find(
        {"id": {"$in": pids}},
        {"_id": 0, "id": 1, "name_ar": 1, "name_en": 1, "retail_price": 1,
         "quantity": 1, "image_url": 1}).to_list(10000)
    by_id = {p["id"]: p for p in products}
    return {"items": [by_id[p] for p in pids if p in by_id]}
