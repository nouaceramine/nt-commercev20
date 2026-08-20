"""
Products Routes - Extracted from server.py
Full CRUD, pagination, quick search, barcode/SKU generation
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from utils.inventory_queries import low_stock_filter
import uuid


def create_products_routes(db, get_current_user, get_tenant_admin, require_tenant) -> dict:
    from utils.permissions import create_permission_checker
    require_permission = create_permission_checker(db, get_current_user)
    router = APIRouter(prefix="/products", tags=["products"])

    async def _audit_product(action: str, product_id: str, product_name: str, admin: dict, details: dict = None):
        """Write to product_audit_log — collection existed with indexes but had no writer."""
        await db.product_audit_log.insert_one({
            "id": str(uuid.uuid4()),
            "action": action,
            "product_id": product_id,
            "product_name": product_name,
            "user_id": admin.get("id", ""),
            "performed_by": admin.get("name", admin.get("email", "")),
            "details": details or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    # ── Inline Models ──
    class PaginatedProductsResponse(BaseModel):
        items: list
        total: int
        page: int
        page_size: int
        total_pages: int

    class QuickSearchProduct(BaseModel):
        id: str
        name_ar: str
        name_en: str
        barcode: Optional[str] = None
        article_code: Optional[str] = None
        retail_price: float = 0
        wholesale_price: float = 0
        quantity: int = 0
        min_quantity: int = 0
        family_id: Optional[str] = None
        family_name: Optional[str] = None
        image_url: Optional[str] = None

    class QuickSearchResponse(BaseModel):
        results: List[QuickSearchProduct]
        total: int
        families: Optional[List[dict]] = None

    # ── Create Product ──
    @router.post("", status_code=201)
    async def create_product(product: dict, admin: dict = Depends(require_permission("products.add"))):
        from models.schemas import ProductCreate
        p = ProductCreate(**product)
        product_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        import re as _re
        def _ci_exact(v):
            return {"$regex": f"^{_re.escape(v.strip())}$", "$options": "i"}
        dup_conditions = [{"name_en": _ci_exact(p.name_en)}]
        if p.name_ar and p.name_ar.strip():
            dup_conditions.append({"name_ar": _ci_exact(p.name_ar)})
        existing = await db.products.find_one({"$or": dup_conditions})
        if existing:
            raise HTTPException(status_code=409, detail=f"منتج بنفس الاسم موجود مسبقاً: {existing.get('name_ar') or existing.get('name_en')}")

        _new_barcodes = ([p.barcode] if p.barcode else []) + list(p.additional_barcodes or [])
        for _bc in _new_barcodes:
            if not _bc:
                continue
            bc_clash = await db.products.find_one({
                "$or": [{"barcode": _bc}, {"additional_barcodes": _bc}]
            })
            if bc_clash:
                raise HTTPException(status_code=409, detail=f"الباركود مستعمل مسبقاً في المنتج: {bc_clash.get('name_ar') or bc_clash.get('name_en')}")

        family_name = ""
        if p.family_id:
            family = await db.product_families.find_one({"id": p.family_id}, {"_id": 0, "name_ar": 1})
            if not family:
                raise HTTPException(status_code=400, detail="عائلة المنتجات المحددة غير موجودة")
            family_name = family["name_ar"]

        brand_name = ""  # p217
        if p.brand_id:
            brand = await db.product_brands.find_one({"id": p.brand_id}, {"_id": 0, "name_ar": 1})
            if not brand:
                raise HTTPException(status_code=400, detail="الماركة المحددة غير موجودة")
            brand_name = brand["name_ar"]

        product_doc = {
            "id": product_id,
            "name": p.name_ar or p.name_en,
            "name_en": p.name_en, "name_ar": p.name_ar,
            "description_en": p.description_en or "",
            "description_ar": p.description_ar or "",
            "purchase_price": p.purchase_price,
            "wholesale_price": p.wholesale_price,
            "retail_price": p.retail_price,
            "super_wholesale_price": p.super_wholesale_price,
            "tariff_a": p.tariff_a or 0,
            "tariff_b": p.tariff_b or 0,
            "tariff_c": p.tariff_c or 0,
            "tariff_d": p.tariff_d or 0,
            "quantity": p.quantity,
            "image_url": p.image_url or "",
            "images": p.images or [],
            "compatible_models": p.compatible_models,
            "low_stock_threshold": p.low_stock_threshold,
            "barcode": p.barcode or "",
            "article_code": p.article_code or "",
            "family_id": p.family_id or "",
            "family_name": family_name,
            "brand_id": p.brand_id or "",  # p217
            "brand_name": brand_name,
            "use_average_price": p.use_average_price or False,
            "unit_of_measure": p.unit_of_measure or "U",
            "storage_location": p.storage_location or "",
            "qty_per_package": p.qty_per_package or 1,
            "is_non_stockable": p.is_non_stockable or False,
            "is_blocked": p.is_blocked or False,
            "allow_online_payment": p.allow_online_payment if p.allow_online_payment is not None else True,  # p149
            "shipping_provider": p.shipping_provider or "",  # p150
            "fixed_price": p.fixed_price or False,
            "force_qty_entry": p.force_qty_entry or False,
            "force_price_entry": p.force_price_entry or False,
            "serial_number_tracking": p.serial_number_tracking or False,
            "tax_rate": p.tax_rate or 0,
            "internal_notes": p.internal_notes or "",
            "additional_barcodes": p.additional_barcodes or [],
            "color": p.color or "",
            "sizes": p.sizes or [],
            "has_variants": p.has_variants or False,
            "variants": [
                {"color": (v or {}).get("color", ""), "size": (v or {}).get("size", ""),
                 "quantity": float((v or {}).get("quantity", 0) or 0)}
                for v in (p.variants or [])
            ] if p.has_variants else [],
            "created_at": now, "updated_at": now
        }
        if product_doc["has_variants"]:
            product_doc["quantity"] = sum(v["quantity"] for v in product_doc["variants"])
        try:
            await db.products.insert_one(product_doc)
        except Exception as e:
            if "E11000" in str(e) or "DuplicateKey" in type(e).__name__:
                raise HTTPException(status_code=409, detail="الباركود مستعمل مسبقاً (تعارض تزامن)")
            raise
        await _audit_product("create", product_id, product_doc["name"], admin,
                             {"barcode": product_doc.get("barcode", ""), "retail_price": product_doc.get("retail_price", 0)})
        product_doc.pop("_id", None)
        return product_doc

    # ── Get Products ──
    @router.get("")
    async def get_products(search: Optional[str] = None, model: Optional[str] = None, barcode: Optional[str] = None, family_id: Optional[str] = None, limit: int = 1000, user: dict = Depends(require_permission("products.view"))):
        query = {}
        if barcode:
            query["$or"] = [{"barcode": barcode}, {"additional_barcodes": barcode}]
        elif search:
            query["$or"] = [
                {"name_en": {"$regex": search, "$options": "i"}},
                {"name_ar": {"$regex": search, "$options": "i"}},
                {"description_en": {"$regex": search, "$options": "i"}},
                {"description_ar": {"$regex": search, "$options": "i"}},
                {"compatible_models": {"$regex": search, "$options": "i"}},
                {"barcode": {"$regex": search, "$options": "i"}},
                {"additional_barcodes": {"$regex": search, "$options": "i"}},
                {"article_code": {"$regex": search, "$options": "i"}}
            ]
        if model:
            if "$or" in query:
                query = {"$and": [{"$or": query["$or"]}, {"compatible_models": {"$regex": model, "$options": "i"}}]}
            else:
                query["compatible_models"] = {"$regex": model, "$options": "i"}
        if family_id:
            if "$and" in query:
                query["$and"].append({"family_id": family_id})
            elif "$or" in query:
                query = {"$and": [{"$or": query["$or"]}, {"family_id": family_id}]}
            else:
                query["family_id"] = family_id

        products = await db.products.find(query, {"_id": 0}).to_list(max(1, min(limit, 50000)))  # p175: was 10000  # p174: honor limit (GlobalSearchModal passes 5)

        family_ids = list(set(p.get("family_id") for p in products if p.get("family_id") and not p.get("family_name")))
        families_map = {}
        if family_ids:
            families = await db.product_families.find({"id": {"$in": family_ids}}, {"_id": 0, "id": 1, "name_ar": 1}).to_list(len(family_ids))
            families_map = {f["id"]: f.get("name_ar", "") for f in families}

        product_ids = [p["id"] for p in products if p.get("id") and not p.get("last_purchase_date")]
        last_purchases_map = {}
        if product_ids:
            pipeline = [
                {"$match": {"items.product_id": {"$in": product_ids}}},
                {"$sort": {"created_at": -1}},
                {"$unwind": "$items"},
                {"$match": {"items.product_id": {"$in": product_ids}}},
                {"$group": {"_id": "$items.product_id", "last_date": {"$first": "$created_at"}}}
            ]
            last_purchases = await db.purchases.aggregate(pipeline).to_list(len(product_ids))
            last_purchases_map = {lp["_id"]: lp["last_date"] for lp in last_purchases}

        for product in products:
            if product.get("family_id") and not product.get("family_name"):
                product["family_name"] = families_map.get(product["family_id"], "")
            elif not product.get("family_name"):
                product["family_name"] = ""
            if not product.get("article_code"):
                product["article_code"] = ""
            if not product.get("last_purchase_date") and product.get("id") in last_purchases_map:
                product["last_purchase_date"] = last_purchases_map[product["id"]]
        return products

    # ── Paginated Products ──
    @router.get("/paginated")
    async def get_products_paginated(
        search: Optional[str] = None, model: Optional[str] = None,
        barcode: Optional[str] = None, family_id: Optional[str] = None,
        page: int = 1, page_size: int = 20,
        user: dict = Depends(require_tenant)
    ):
        query = {}
        if barcode:
            query["$or"] = [{"barcode": barcode}, {"additional_barcodes": barcode}]
        elif search:
            query["$or"] = [
                {"name_en": {"$regex": search, "$options": "i"}},
                {"name_ar": {"$regex": search, "$options": "i"}},
                {"description_en": {"$regex": search, "$options": "i"}},
                {"description_ar": {"$regex": search, "$options": "i"}},
                {"compatible_models": {"$regex": search, "$options": "i"}},
                {"barcode": {"$regex": search, "$options": "i"}},
                {"additional_barcodes": {"$regex": search, "$options": "i"}},
                {"article_code": {"$regex": search, "$options": "i"}}
            ]
        if model:
            if "$or" in query:
                query = {"$and": [{"$or": query["$or"]}, {"compatible_models": {"$regex": model, "$options": "i"}}]}
            else:
                query["compatible_models"] = {"$regex": model, "$options": "i"}
        if family_id:
            if "$and" in query:
                query["$and"].append({"family_id": family_id})
            elif "$or" in query:
                query = {"$and": [{"$or": query["$or"]}, {"family_id": family_id}]}
            else:
                query["family_id"] = family_id

        total = await db.products.count_documents(query)
        total_pages = (total + page_size - 1) // page_size if page_size > 0 else 1
        skip = (page - 1) * page_size
        products = await db.products.find(query, {"_id": 0}).skip(skip).limit(page_size).to_list(page_size)

        for product in products:
            if product.get("family_id") and not product.get("family_name"):
                family = await db.product_families.find_one({"id": product["family_id"]}, {"_id": 0, "name_ar": 1})
                product["family_name"] = family["name_ar"] if family else ""
            elif not product.get("family_name"):
                product["family_name"] = ""
            if not product.get("article_code"):
                product["article_code"] = ""

        return {"items": products, "total": total, "page": page, "page_size": page_size, "total_pages": total_pages}

    # ── Quick Search ──
    @router.get("/quick-search")
    async def quick_search_products(
        q: str = "", limit: int = 15, family_id: Optional[str] = None,  # p175: limit clamped below to 50000 — search returns ALL matches
        stock_filter: Optional[str] = None, min_price: Optional[float] = None,
        max_price: Optional[float] = None, include_families: bool = False,
        user: dict = Depends(require_tenant)
    ):
        conditions = []
        if q and len(q) >= 1:
            conditions.append({
                "$or": [
                    {"barcode": q},
                    {"additional_barcodes": q},
                    {"scale_plu": q},
                    {"article_code": {"$regex": f"^{q}", "$options": "i"}},
                    {"name_ar": {"$regex": q, "$options": "i"}},
                    {"name_en": {"$regex": q, "$options": "i"}},
                    {"barcode": {"$regex": q, "$options": "i"}},
                    {"additional_barcodes": {"$regex": q, "$options": "i"}},
                ]
            })
        if family_id:
            conditions.append({"family_id": family_id})
        if stock_filter == "out":
            conditions.append({"quantity": {"$lte": 0}})
        elif stock_filter == "low":
            conditions.append({"$expr": {"$lte": ["$quantity", "$min_quantity"]}})
        elif stock_filter == "available":
            conditions.append({"quantity": {"$gt": 0}})
        if min_price is not None:
            conditions.append({"retail_price": {"$gte": min_price}})
        if max_price is not None:
            conditions.append({"retail_price": {"$lte": max_price}})

        search_query = {"$and": conditions} if conditions else {}
        projection = {
            "_id": 0, "id": 1, "name_ar": 1, "name_en": 1, "barcode": 1,
            "additional_barcodes": 1, "scale_plu": 1, "sold_by_weight": 1,
            "article_code": 1, "retail_price": 1, "wholesale_price": 1,
            "super_wholesale_price": 1, "purchase_price": 1,
            "tariff_a": 1, "tariff_b": 1, "tariff_c": 1, "tariff_d": 1,
            "quantity": 1, "min_quantity": 1, "family_id": 1, "image_url": 1,
            "unit_of_measure": 1, "is_non_stockable": 1,
            "is_blocked": 1, "fixed_price": 1,
            "force_qty_entry": 1, "force_price_entry": 1,
            "serial_number_tracking": 1, "tax_rate": 1,
        }

        limit = max(1, min(limit, 50000))  # p175: no practical cap — return every match
        total = await db.products.count_documents(search_query)
        products = await db.products.find(search_query, projection).limit(limit).to_list(limit)

        for product in products:
            if product.get("family_id"):
                family = await db.product_families.find_one({"id": product["family_id"]}, {"_id": 0, "name_ar": 1})
                product["family_name"] = family.get("name_ar", "") if family else ""
            else:
                product["family_name"] = ""
            if "min_quantity" not in product:
                product["min_quantity"] = 0

        def sort_key(p) -> dict:
            if q and p.get("barcode") == q:
                return 0
            if q and p.get("scale_plu") == q:
                return 0
            if q and q in (p.get("additional_barcodes") or []):
                return 0
            if q and p.get("article_code", "").lower() == q.lower():
                return 0
            if q and p.get("article_code", "").lower().startswith(q.lower()):
                return 1
            return 2

        if q:
            products.sort(key=sort_key)

        families_list = None
        if include_families:
            families_list = await db.product_families.find({}, {"_id": 0, "id": 1, "name_ar": 1, "name_en": 1}).to_list(100)

        return {"results": products, "total": total, "families": families_list}

    # ── Generate Barcode ──
    @router.get("/generate-barcode")
    async def generate_barcode(article_code: Optional[str] = None, admin: dict = Depends(get_current_user)):
        import random

        def _mk(num: int) -> str:
            prefix = "213"
            company = "0001"
            product_num = str(num % 100000).zfill(5)
            code = prefix + company + product_num
            odd_sum = sum(int(code[i]) for i in range(0, 12, 2))
            even_sum = sum(int(code[i]) for i in range(1, 12, 2))
            check_digit = (10 - ((odd_sum + even_sum * 3) % 10)) % 10
            return code + str(check_digit)

        async def _is_free(bc: str) -> bool:
            clash = await db.products.find_one({"$or": [{"barcode": bc}, {"additional_barcodes": bc}]})
            return clash is None

        if article_code:
            try:
                num = int(article_code.replace("AR", "").lstrip("0") or "1") % 100000
            except (ValueError, AttributeError):
                num = random.randint(1, 99999)
            # deterministic base, but NEVER return a barcode that already exists:
            # increment until a free one is found
            for _ in range(100000):
                barcode = _mk(num)
                if await _is_free(barcode):
                    return {"barcode": barcode}
                num = (num + 1) % 100000

        while True:
            barcode = _mk(random.randint(10000, 99999))
            if await _is_free(barcode):
                return {"barcode": barcode}

    # ── Generate SKU ──
    @router.get("/generate-sku")
    async def generate_sku(family_id: Optional[str] = None, admin: dict = Depends(get_current_user)):
        prefix = "SG"
        if family_id:
            family = await db.product_families.find_one({"id": family_id}, {"_id": 0, "name_en": 1})
            if family:
                prefix = family["name_en"][:2].upper()
        count = await db.products.count_documents({})
        return {"sku": f"{prefix}-{str(count + 1).zfill(5)}"}

    # ── Generate Article Code ──
    @router.get("/generate-article-code")
    async def generate_article_code(admin: dict = Depends(get_current_user)):
        pipeline = [
            {"$match": {"article_code": {"$regex": "^AR\\d{4}$"}}},
            {"$project": {"num": {"$toInt": {"$substr": ["$article_code", 2, 4]}}}},
            {"$sort": {"num": -1}},
            {"$limit": 1}
        ]
        result = await db.products.aggregate(pipeline).to_list(1)
        next_num = result[0]["num"] + 1 if result else 1
        return {"article_code": f"AR{str(next_num).zfill(4)}"}

    # ── Low Stock Alert ──
    @router.get("/alerts/low-stock")
    async def get_low_stock_products(admin: dict = Depends(require_permission("products.view"))):
        pipeline = [
            {"$match": low_stock_filter()},
            {"$project": {"_id": 0}}
        ]
        return await db.products.aggregate(pipeline).to_list(1000)

    # ── p169: Expiry report — lots approaching/past their expiry date ──
    @router.get("/expiring-report")
    async def get_expiring_report(days: int = 60, admin: dict = Depends(require_permission("products.view"))):
        from datetime import date as _date_cls
        today = _date_cls.today()
        lots = await db.product_lots.find({"expiry_date": {"$ne": ""}}, {"_id": 0}).to_list(5000)
        rows = []
        for lot in lots:
            try:
                exp = datetime.fromisoformat(lot["expiry_date"]).date()
            except Exception:
                continue
            remaining = (exp - today).days
            if remaining > days:
                continue
            product = await db.products.find_one({"id": lot.get("product_id")}, {"_id": 0, "id": 1, "name_ar": 1, "name_en": 1, "purchase_price": 1, "retail_price": 1, "quantity": 1, "image_url": 1, "barcode": 1})
            if not product:
                continue
            qty = float(lot.get("quantity") or 0)
            if remaining < 0:
                status = "expired"
            elif remaining <= 7:
                status = "critical"
            elif remaining <= 30:
                status = "warning"
            else:
                status = "upcoming"
            rows.append({
                "lot_id": lot.get("id"),
                "lot_number": lot.get("lot_number", ""),
                "product_id": product.get("id"),
                "product_name": product.get("name_ar") or product.get("name_en") or "",
                "image_url": product.get("image_url", ""),
                "barcode": product.get("barcode", ""),
                "expiry_date": lot.get("expiry_date"),
                "remaining_days": remaining,
                "status": status,
                "lot_quantity": qty,
                "purchase_price": float(product.get("purchase_price") or 0),
                "retail_price": float(product.get("retail_price") or 0),
                "stock_value": round(qty * float(product.get("purchase_price") or 0), 2),
                "alert_days": int(lot.get("alert_days") or 30),
            })
        rows.sort(key=lambda r: r["remaining_days"])
        summary = {
            "expired": sum(1 for r in rows if r["status"] == "expired"),
            "critical": sum(1 for r in rows if r["status"] == "critical"),
            "warning": sum(1 for r in rows if r["status"] == "warning"),
            "upcoming": sum(1 for r in rows if r["status"] == "upcoming"),
            "total_stock_value": round(sum(r["stock_value"] for r in rows), 2),
        }
        return {"rows": rows, "summary": summary, "days": days}

    # ── Get Single Product ──
    @router.get("/{product_id}")
    async def get_product(product_id: str, user: dict = Depends(require_permission("products.view"))):
        product = await db.products.find_one({"id": product_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        if not product.get("family_name"):
            product["family_name"] = ""
        if not product.get("article_code"):
            product["article_code"] = ""
        return product

    # ── Update Product ──
    @router.put("/{product_id}")
    async def update_product(product_id: str, updates: dict, admin: dict = Depends(require_permission("products.edit"))):
        product = await db.products.find_one({"id": product_id})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")

        # Validate/sanitize covered fields through ProductUpdate (422 on invalid);
        # extra keys not in the model keep the prior pass-through semantics
        from models.schemas import ProductUpdate
        validated = ProductUpdate(**updates)
        update_data = {k: v for k, v in updates.items() if v is not None and k not in ["id"]}
        for k, v in validated.model_dump(exclude_unset=True).items():
            if v is not None:
                update_data[k] = v
        if "family_id" in update_data:
            if update_data["family_id"]:
                family = await db.product_families.find_one({"id": update_data["family_id"]}, {"_id": 0, "name_ar": 1})
                if not family:
                    raise HTTPException(status_code=400, detail="عائلة المنتجات المحددة غير موجودة")
                update_data["family_name"] = family["name_ar"]
            else:
                update_data["family_name"] = ""

        # p217: resolve brand name when brand changes
        if "brand_id" in update_data:
            if update_data["brand_id"]:
                brand = await db.product_brands.find_one({"id": update_data["brand_id"]}, {"_id": 0, "name_ar": 1})
                if not brand:
                    raise HTTPException(status_code=400, detail="الماركة المحددة غير موجودة")
                update_data["brand_name"] = brand["name_ar"]
            else:
                update_data["brand_name"] = ""

        new_barcode = update_data.get("barcode")
        if new_barcode:
            bc_clash = await db.products.find_one({
                "id": {"$ne": product_id},
                "$or": [{"barcode": new_barcode}, {"additional_barcodes": new_barcode}]
            })
            if bc_clash:
                raise HTTPException(status_code=409, detail=f"الباركود مستعمل مسبقاً في المنتج: {bc_clash.get('name_ar') or bc_clash.get('name_en')}")

        # p70: variant stock — normalize + recompute total quantity
        if "variants" in update_data or "has_variants" in update_data:
            eff_has = update_data.get("has_variants", product.get("has_variants", False))
            if eff_has:
                raw_variants = update_data.get("variants", product.get("variants", [])) or []
                norm = [
                    {"color": (v or {}).get("color", ""), "size": (v or {}).get("size", ""),
                     "quantity": float((v or {}).get("quantity", 0) or 0)}
                    for v in raw_variants
                ]
                update_data["variants"] = norm
                update_data["has_variants"] = True
                update_data["quantity"] = sum(v["quantity"] for v in norm)
            else:
                update_data["has_variants"] = False
                update_data["variants"] = []

        old_price = product.get("retail_price", 0)
        new_price = update_data.get("retail_price", old_price)
        if new_price != old_price:
            await db.price_history.insert_one({
                "id": str(uuid.uuid4()),
                "product_id": product_id,
                "product_name": product.get("name_ar") or product.get("name_en") or product.get("name") or "",
                "old_price": old_price,
                "new_price": new_price,
                "price_type": "retail_price",
                "change_percent": round(((new_price - old_price) / old_price) * 100, 2) if old_price else 0.0,
                "changed_by": admin.get("name", admin.get("email", "")),
                "changed_by_name": admin.get("name", admin.get("email", "")),
                "source": "manual",
                "created_at": datetime.now(timezone.utc).isoformat()
            })

        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.products.update_one({"id": product_id}, {"$set": update_data})
        await _audit_product("update", product_id, product.get("name_ar") or product.get("name_en") or "",
                             admin, {"changed_fields": sorted(k for k in update_data if k != "updated_at")})
        updated = await db.products.find_one({"id": product_id}, {"_id": 0})
        return updated

    # ── Delete Product ──
    @router.delete("/{product_id}")
    async def delete_product(product_id: str, admin: dict = Depends(require_permission("products.delete"))):
        # حماية: المنتج الذي عليه مخزون أو له حركات شراء/بيع أصبح "حقيقياً" — حذفه ممنوع
        product = await db.products.find_one({"id": product_id}, {"_id": 0, "quantity": 1, "name_ar": 1, "name_en": 1})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        pname = product.get("name_ar") or product.get("name_en") or ""
        if (product.get("quantity") or 0) > 0:
            raise HTTPException(status_code=400, detail=f"لا يمكن حذف '{pname}': عليه مخزون ({product.get('quantity')}). صفّر المخزون أولاً")
        in_purchase = await db.purchases.find_one({"items.product_id": product_id}, {"_id": 1})
        in_sale = await db.sales.find_one({"items.product_id": product_id}, {"_id": 1})
        if in_purchase or in_sale:
            raise HTTPException(status_code=400, detail=f"لا يمكن حذف '{pname}': منتج حقيقي له حركات شراء/بيع مسجلة")
        await db.store_products.delete_many({"product_id": product_id})
        # حذف ناعم: أرشفة الوثيقة كاملة في deleted_products قبل الإزالة (قابلة للاستعادة)
        full_doc = await db.products.find_one({"id": product_id}, {"_id": 0})
        if full_doc:
            full_doc["deleted_at"] = datetime.now(timezone.utc).isoformat()
            full_doc["deleted_by"] = admin.get("full_name") or admin.get("email", "")
            await db.deleted_products.update_one({"id": product_id}, {"$set": full_doc}, upsert=True)
        result = await db.products.delete_one({"id": product_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        await _audit_product("delete", product_id, pname, admin, {})
        return {"message": "تم حذف المنتج بنجاح"}

    # ── Restore Deleted Product (recycle bin) ──
    @router.post("/{product_id}/restore")
    async def restore_product(product_id: str, admin: dict = Depends(require_permission("products.delete"))):
        archived = await db.deleted_products.find_one({"id": product_id}, {"_id": 0})
        if not archived:
            raise HTTPException(status_code=404, detail="لا يوجد منتج محذوف بهذا المعرّف")
        existing = await db.products.find_one({"id": product_id}, {"_id": 1})
        if existing:
            raise HTTPException(status_code=400, detail="منتج بنفس المعرّف موجود حالياً")
        archived.pop("deleted_at", None)
        archived.pop("deleted_by", None)
        archived["restored_at"] = datetime.now(timezone.utc).isoformat()
        archived["restored_by"] = admin.get("full_name") or admin.get("email", "")
        await db.products.insert_one(archived)
        await db.deleted_products.delete_one({"id": product_id})
        await _audit_product("restore", product_id, archived.get("name_ar") or archived.get("name_en") or "", admin, {})
        return {"message": "تمت استعادة المنتج من سلة المحذوفات", "product_id": product_id}

    # ── Clone Product ──
    @router.post("/{product_id}/clone", status_code=201)
    async def clone_product(product_id: str, admin: dict = Depends(require_permission("products.add"))):
        src = await db.products.find_one({"id": product_id}, {"_id": 0})
        if not src:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        now = datetime.now(timezone.utc).isoformat()
        clone = dict(src)
        clone["id"] = str(uuid.uuid4())
        base_name = src.get("name_ar") or src.get("name_en") or ""
        clone["name_ar"] = (src.get("name_ar") or "") + " (نسخة)" if src.get("name_ar") else ""
        clone["name_en"] = (src.get("name_en") or "") + " (copy)" if src.get("name_en") else ""
        clone["quantity"] = 0  # النسخة تبدأ بلا مخزون — لا تضخيم وهمي للمخزون
        clone["barcode"] = ""  # تفادي صدام الفهرس الفريد
        clone["additional_barcodes"] = []
        clone["article_code"] = ""
        clone["created_at"] = now
        clone["updated_at"] = now
        clone["cloned_from"] = product_id
        clone.pop("restored_at", None)
        clone.pop("restored_by", None)
        await db.products.insert_one(clone)
        clone.pop("_id", None)
        await _audit_product("clone", clone["id"], base_name, admin, {"cloned_from": product_id})
        return clone

    # ── Product History ──
    @router.get("/{product_id}/history")
    async def get_product_history(product_id: str, user: dict = Depends(require_tenant)):
        product = await db.products.find_one({"id": product_id}, {"_id": 0, "created_at": 1, "updated_at": 1})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        last_purchase = await db.purchases.find_one(
            {"items.product_id": product_id},
            {"_id": 0, "created_at": 1},
            sort=[("created_at", -1)]
        )
        last_sale = await db.sales.find_one(
            {"items.product_id": product_id},
            {"_id": 0, "created_at": 1},
            sort=[("created_at", -1)]
        )
        return {
            "created_at": product.get("created_at"),
            "updated_at": product.get("updated_at"),
            "last_purchase_at": last_purchase["created_at"] if last_purchase else None,
            "last_sale_at": last_sale["created_at"] if last_sale else None
        }

    # ── Product Lots (Expiry Dates) ──
    @router.get("/{product_id}/lots")
    async def get_product_lots(product_id: str, user: dict = Depends(require_tenant)):
        from datetime import date as date_class
        lots = await db.product_lots.find({"product_id": product_id}, {"_id": 0}).to_list(1000)
        for lot in lots:
            if lot.get("expiry_date"):
                try:
                    exp = datetime.fromisoformat(lot["expiry_date"]).date()
                    lot["remaining_days"] = (exp - date_class.today()).days
                except Exception:
                    lot["remaining_days"] = None
        return lots

    @router.post("/{product_id}/lots", status_code=201)
    async def add_product_lot(product_id: str, lot: dict, admin: dict = Depends(require_permission("products.edit"))):
        product = await db.products.find_one({"id": product_id})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        lot_doc = {
            "id": str(uuid.uuid4()),
            "product_id": product_id,
            "lot_number": lot.get("lot_number", ""),
            "expiry_date": lot.get("expiry_date", ""),
            "quantity": float(lot.get("quantity", 0)),
            "alert_days": int(lot.get("alert_days", 30)),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.product_lots.insert_one(lot_doc)
        lot_doc.pop("_id", None)
        from datetime import date as date_class
        if lot_doc.get("expiry_date"):
            try:
                exp = datetime.fromisoformat(lot_doc["expiry_date"]).date()
                lot_doc["remaining_days"] = (exp - date_class.today()).days
            except Exception:
                lot_doc["remaining_days"] = None
        return lot_doc

    @router.delete("/{product_id}/lots/{lot_id}")
    async def delete_product_lot(product_id: str, lot_id: str, admin: dict = Depends(require_permission("products.edit"))):
        result = await db.product_lots.delete_one({"id": lot_id, "product_id": product_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="الدُفعة غير موجودة")
        return {"message": "تم الحذف"}

    # ── Product Supplier Links ──
    @router.get("/{product_id}/suppliers")
    async def get_product_suppliers(product_id: str, user: dict = Depends(require_tenant)):
        links = await db.product_supplier_links.find({"product_id": product_id}, {"_id": 0}).to_list(100)
        return links

    @router.post("/{product_id}/suppliers", status_code=201)
    async def add_product_supplier(product_id: str, link: dict, admin: dict = Depends(require_permission("products.edit"))):
        product = await db.products.find_one({"id": product_id})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        supplier_id = link.get("supplier_id")
        if not supplier_id:
            raise HTTPException(status_code=400, detail="المورد مطلوب")
        supplier = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0, "name": 1, "name_ar": 1, "company": 1})
        supplier_name = ""
        if supplier:
            supplier_name = supplier.get("name_ar") or supplier.get("name") or supplier.get("company", "")
        link_doc = {
            "id": str(uuid.uuid4()),
            "product_id": product_id,
            "supplier_id": supplier_id,
            "supplier_name": supplier_name,
            "purchase_price": float(link.get("purchase_price", 0)),
            "is_default": bool(link.get("is_default", False)),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.product_supplier_links.insert_one(link_doc)
        link_doc.pop("_id", None)
        return link_doc

    @router.put("/{product_id}/suppliers/{link_id}")
    async def update_product_supplier(product_id: str, link_id: str, updates: dict, admin: dict = Depends(require_permission("products.edit"))):
        result = await db.product_supplier_links.update_one(
            {"id": link_id, "product_id": product_id},
            {"$set": {k: v for k, v in updates.items() if k not in ["id", "product_id"]}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="الربط غير موجود")
        updated = await db.product_supplier_links.find_one({"id": link_id}, {"_id": 0})
        return updated

    @router.delete("/{product_id}/suppliers/{link_id}")
    async def delete_product_supplier(product_id: str, link_id: str, admin: dict = Depends(require_permission("products.edit"))):
        result = await db.product_supplier_links.delete_one({"id": link_id, "product_id": product_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="الربط غير موجود")
        return {"message": "تم الحذف"}

    return router
