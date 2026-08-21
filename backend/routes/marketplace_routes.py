"""Unified marketplace catalog (p227) — tenant publish/unpublish + public catalog.

Report §8: a central catalog in main_db fed by the event bus
(product.published_to_marketplace / product.unpublished_from_marketplace).
The tenant picks which products to show and with what margin; the consumer
upserts main_db.marketplace_catalog. Order routing & COD flow come in a later
phase (report §3.5).
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


def create_marketplace_routes(db, main_db, get_current_user) -> dict:
    from utils.permissions import create_permission_checker
    require_permission = create_permission_checker(db, get_current_user)
    router = APIRouter(prefix="/marketplace", tags=["marketplace"])
    public = APIRouter(prefix="/marketplace", tags=["marketplace-public"])

    def _now():
        return datetime.now(timezone.utc).isoformat()

    class PublishIn(BaseModel):
        product_id: str
        margin_pct: float = 0.0  # tenant's markup on retail price for the mall

    async def _tenant_info(user: dict) -> dict:
        tid = user.get("tenant_id") or user.get("id")
        t = await main_db.saas_tenants.find_one({"id": tid}, {"_id": 0, "name": 1, "short_id": 1})
        return {"id": tid, "name": (t or {}).get("name", ""), "short_id": (t or {}).get("short_id", "")}

    # ── tenant side ─────────────────────────────────────────────────────────

    @router.post("/publish")
    async def publish_product(data: PublishIn, user: dict = Depends(require_permission("products.edit"))):
        if data.margin_pct < 0 or data.margin_pct > 200:
            raise HTTPException(status_code=400, detail="الهامش بين 0 و 200%")
        product = await db.products.find_one({"id": data.product_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        tenant = await _tenant_info(user)
        retail = float(product.get("retail_price") or 0)
        if retail <= 0:
            raise HTTPException(status_code=400, detail="المنتج بلا سعر تجزئة — حدّد السعر أولاً")
        price = round(retail * (1 + data.margin_pct / 100), 2)
        family_name = ""
        if product.get("family_id"):
            fam = await db.product_families.find_one({"id": product["family_id"]}, {"_id": 0, "name": 1})
            family_name = (fam or {}).get("name", "")
        now = _now()
        listing = {
            "id": str(uuid.uuid4()),
            "product_id": product["id"],
            "margin_pct": float(data.margin_pct),
            "marketplace_price": price,
            "active": True,
            "published_at": now,
            "published_by": user.get("name", ""),
        }
        await db.marketplace_listings.update_one(
            {"product_id": product["id"]},
            {"$set": listing, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        from services.outbox import outbox_write
        payload = {
            "product_id": product["id"],
            "tenant_id": tenant["id"],
            "tenant_name": tenant["name"],
            "short_id": tenant["short_id"],
            "name_ar": product.get("name_ar") or "",
            "name_en": product.get("name_en") or "",
            "description": product.get("description_ar") or product.get("description_en") or "",
            "image_url": product.get("image_url") or (product.get("images") or [""])[0],
            "category": family_name,
            "retail_price": retail,
            "margin_pct": float(data.margin_pct),
            "price": price,
        }
        await outbox_write(main_db, "product.published_to_marketplace", payload,
                           tenant_id=tenant["id"], source="marketplace_publish")
        return {"ok": True, "listing": listing, "catalog_price": price}

    @router.post("/unpublish")
    async def unpublish_product(data: PublishIn, user: dict = Depends(require_permission("products.edit"))):
        res = await db.marketplace_listings.update_one(
            {"product_id": data.product_id, "active": True},
            {"$set": {"active": False, "unpublished_at": _now()}},
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="المنتج غير منشور في السوق")
        tenant = await _tenant_info(user)
        from services.outbox import outbox_write
        await outbox_write(main_db, "product.unpublished_from_marketplace",
                           {"product_id": data.product_id, "tenant_id": tenant["id"]},
                           tenant_id=tenant["id"], source="marketplace_unpublish")
        return {"ok": True}

    @router.get("/my")
    async def my_listings(user: dict = Depends(require_permission("products.view"))):
        listings = await db.marketplace_listings.find(
            {"active": True}, {"_id": 0}).sort("published_at", -1).to_list(500)
        pids = [l["product_id"] for l in listings]
        products = {p["id"]: p async for p in db.products.find(
            {"id": {"$in": pids}},
            {"_id": 0, "id": 1, "name_ar": 1, "name_en": 1, "retail_price": 1, "quantity": 1, "image_url": 1})}
        for l in listings:
            l["product"] = products.get(l["product_id"], {})
        return {"total": len(listings), "listings": listings}

    # ── public side (no auth — feeds the future mall frontend) ─────────────

    @public.get("/catalog")
    async def public_catalog(q: Optional[str] = None, category: Optional[str] = None,
                             page: int = 1, limit: int = 24):
        page = max(1, page)
        limit = max(1, min(limit, 60))
        query = {"active": True}
        if category:
            query["category"] = category
        if q:
            query["$or"] = [
                {"name_ar": {"$regex": q, "$options": "i"}},
                {"name_en": {"$regex": q, "$options": "i"}},
            ]
        total = await main_db.marketplace_catalog.count_documents(query)
        items = await main_db.marketplace_catalog.find(
            query, {"_id": 0, "tenant_id": 0}
        ).sort("published_at", -1).skip((page - 1) * limit).limit(limit).to_list(limit)
        categories = await main_db.marketplace_catalog.distinct("category", {"active": True})
        return {"total": total, "page": page, "pages": (total + limit - 1) // limit,
                "categories": [c for c in categories if c], "items": items}

    return {"marketplace": router, "marketplace_public": public}
