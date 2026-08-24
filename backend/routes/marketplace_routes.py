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

    # ── p237: cross-tenant order placement (public, COD) ─────────────────
    class OrderIn(BaseModel):
        product_id: str = ""
        listing_code: str = ""  # p259: composite public identity (MPR-NTx-NNNNN)
        quantity: int = 1
        customer_name: str
        phone: str
        address: str = ""
        city: str = ""
        notes: str = ""
        referral_code: str = ""  # p245

    @public.post("/order")
    async def place_marketplace_order(data: OrderIn):
        """Place a COD order on a catalog product. The order lands in the OWNING
        tenant's ecom inbox (channel='marketplace') with an atomic stock guard,
        and a platform-side marketplace_orders row is kept for settlements."""
        qty = int(data.quantity or 1)
        if qty < 1 or qty > 50:
            raise HTTPException(status_code=400, detail="الكمية بين 1 و 50")
        name = (data.customer_name or "").strip()
        phone = (data.phone or "").strip()
        if not name or not phone:
            raise HTTPException(status_code=400, detail="الاسم ورقم الهاتف مطلوبان")

        # p259: accept the composite listing code (globally unique) or the
        # legacy bare product_id (kept for older mall frontend links)
        lc = (data.listing_code or "").strip().upper()
        if lc:
            row = await main_db.marketplace_catalog.find_one(
                {"listing_code": lc, "active": True}, {"_id": 0})
        elif (data.product_id or "").strip():
            row = await main_db.marketplace_catalog.find_one(
                {"product_id": data.product_id.strip(), "active": True}, {"_id": 0})
        else:
            raise HTTPException(status_code=400, detail="معرّف المنتج مطلوب")
        if not row:
            raise HTTPException(status_code=404, detail="المنتج غير متوفر في السوق")
        data.product_id = row["product_id"]
        tenant_id = row["tenant_id"]
        unit_price = float(row.get("price") or 0)
        if unit_price <= 0:
            raise HTTPException(status_code=400, detail="سعر المنتج غير صالح")

        from config.database import get_tenant_db
        tdb = get_tenant_db(tenant_id)
        prod = await tdb.products.find_one({"id": data.product_id}, {"_id": 0})
        if not prod:
            raise HTTPException(status_code=404, detail="المنتج لم يعد متوفراً")

        # p245: validate referral code BEFORE touching stock
        ref = None
        ref_code = (data.referral_code or "").strip().upper()
        if ref_code:
            ref = await tdb.ecom_referrals.find_one(
                {"code": ref_code, "active": {"$ne": False}}, {"_id": 0})
            if not ref:
                raise HTTPException(status_code=400, detail="رمز الإحالة غير صالح")

        now = _now()
        stock_deducted = False
        if not prod.get("is_non_stockable"):
            guarded = await tdb.products.find_one_and_update(
                {"id": data.product_id, "quantity": {"$gte": qty}},
                {"$inc": {"quantity": -qty}, "$set": {"updated_at": now}},
            )
            if not guarded:
                raise HTTPException(status_code=409, detail="نفد المخزون حالياً")
            stock_deducted = True

        order_id = str(uuid.uuid4())
        try:
            # p258: atomic tenant-stamped code (ecom_orders has a unique order_code index)
            from services.code_generator import public_order_code
            order_code = await public_order_code(tdb, "ecom_orders", "MP", 5)
            total = round(unit_price * qty, 2)
            order_doc = {
                "id": order_id,
                "order_code": order_code,
                "channel": "marketplace",
                "customer": {"name": name, "phone": phone,
                             "address": (data.address or "").strip(),
                             "city": (data.city or "").strip()},
                "items": [{
                    "name": row.get("name_ar") or row.get("name_en") or "",
                    "sku": "", "product_id": data.product_id, "variant_index": None,
                    "qty": qty, "price": unit_price, "total": total,
                }],
                "subtotal": total, "shipping_fee": 0, "total": total,
                "status": "new", "payment_status": "unpaid",
                "tags": ["marketplace"],
                "status_history": [{"status": "new", "at": now, "by": "marketplace",
                                    "note": "طلب من السوق الموحد"}],
                "notes": (data.notes or "").strip(),
                "created_at": now, "updated_at": now, "created_by": "marketplace",
            }
            # p240: duplicate detection (non-blocking, internal flag only)
            from services.ecom.duplicate_detector import annotate_order as _annot_dup
            await _annot_dup(tdb, order_doc)

            # p245: referral attachment (terms snapshotted at order time)
            if ref:
                order_doc["referral_id"] = ref["id"]
                order_doc["referral_code"] = ref["code"]
                order_doc["referral_reward_type"] = ref.get("reward_type", "fixed")
                order_doc["referral_reward_value"] = float(ref.get("reward_value") or 0)

            await tdb.ecom_orders.insert_one(order_doc)
            # p280: realtime event — other open sessions refresh instantly
            try:
                from services.outbox import outbox_write as _obw
                from config.database import main_db as _mdb
                await _obw(_mdb, "ecom_order.created", {"order_id": order_doc.get("id"), "order_code": order_doc.get("order_code", ""), "channel": order_doc.get("channel", ""), "total": order_doc.get("total", 0)}, tenant_id=tenant_id, source="ecom.marketplace")
            except Exception:
                pass

            await main_db.marketplace_orders.insert_one({
                "id": str(uuid.uuid4()),
                "order_id": order_id,
                "order_code": order_code,
                "tenant_id": tenant_id,
                "tenant_name": row.get("tenant_name", ""),
                "short_id": row.get("short_id", ""),
                "product_id": data.product_id,
                "listing_code": row.get("listing_code", ""),
                "qty": qty,
                "unit_price": unit_price,
                "total": total,
                "customer": {"name": name, "phone": phone},
                "status": "new",
                "created_at": now,
            })

            from services.outbox import outbox_write
            await outbox_write(main_db, "marketplace.order_placed", {
                "order_id": order_id, "order_code": order_code,
                "tenant_id": tenant_id, "product_id": data.product_id,
                "product_name": row.get("name_ar") or row.get("name_en") or "",
                "qty": qty, "total": total, "customer_name": name,
            }, tenant_id=tenant_id, source="marketplace_order")
        except Exception:
            if stock_deducted:
                try:
                    await tdb.products.update_one(
                        {"id": data.product_id},
                        {"$inc": {"quantity": qty}, "$set": {"updated_at": _now()}})
                except Exception:
                    pass
            raise

        return {"ok": True, "order_code": order_code, "total": total,
                "message": "تم استلام طلبك — سيتواصل معك البائع للتأكيد"}

    return {"marketplace": router, "marketplace_public": public}
