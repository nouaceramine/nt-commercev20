"""
Products Routes - Extracted from server.py
Full CRUD, pagination, quick search, barcode/SKU generation
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from utils.inventory_queries import low_stock_filter
from services.warehouse_stock import adjust_warehouse_stock
import uuid


def product_supplier_link_mongo_id(product_id: str, supplier_id: str) -> str:
    """Unique per-tenant Mongo identity for a logical product/supplier link."""
    return str(uuid.uuid5(
        uuid.NAMESPACE_URL,
        f"product-supplier-link:{product_id}:{supplier_id}",
    ))


def create_products_routes(db, get_current_user, get_tenant_admin, require_tenant) -> dict:
    from utils.permissions import create_permission_checker
    require_permission = create_permission_checker(db, get_current_user)
    router = APIRouter(prefix="/products", tags=["products"])

    def _identity_claim_ids(doc: dict) -> list:
        """Stable per-tenant claims close check-then-insert races, including legacy rows."""
        claims = []
        for field in ("name_en", "name_ar"):
            value = (doc.get(field) or "").strip().casefold()
            if value:
                claims.append(field + ":" + value)
        barcodes = ([doc.get("barcode")] if doc.get("barcode") else []) + list(doc.get("additional_barcodes") or [])
        for value in barcodes:
            value = str(value or "").strip()
            if value:
                claims.append("barcode:" + value)
        return list(dict.fromkeys(claims))

    async def _assert_product_identities_available(doc: dict, exclude_id: str = "", session=None):
        """Keep compatibility with legacy products that predate identity claims."""
        import re
        for field in ("name_en", "name_ar"):
            value = (doc.get(field) or "").strip()
            if not value:
                continue
            query = {field: {"$regex": f"^{re.escape(value)}$", "$options": "i"}}
            if exclude_id:
                query["id"] = {"$ne": exclude_id}
            existing = await db.products.find_one(query, {"_id": 0, "name_ar": 1, "name_en": 1}, session=session)
            if existing:
                raise HTTPException(status_code=409, detail=f"منتج بنفس الاسم موجود مسبقاً: {existing.get('name_ar') or existing.get('name_en')}")
        barcodes = ([doc.get("barcode")] if doc.get("barcode") else []) + list(doc.get("additional_barcodes") or [])
        for barcode in dict.fromkeys(str(v or "").strip() for v in barcodes if str(v or "").strip()):
            query = {"$or": [{"barcode": barcode}, {"additional_barcodes": barcode}]}
            if exclude_id:
                query["id"] = {"$ne": exclude_id}
            clash = await db.products.find_one(query, {"_id": 0, "name_ar": 1, "name_en": 1}, session=session)
            if clash:
                raise HTTPException(status_code=409, detail=f"الباركود مستعمل مسبقاً في المنتج: {clash.get('name_ar') or clash.get('name_en')}")

    async def _claim_product_identities(product_id: str, doc: dict, session):
        for claim_id in _identity_claim_ids(doc):
            existing = await db.product_identity_claims.find_one({"_id": claim_id}, session=session)
            if existing and existing.get("product_id") != product_id:
                raise HTTPException(status_code=409, detail="اسم المنتج أو الباركود مستعمل مسبقاً")
            if not existing:
                await db.product_identity_claims.insert_one({
                    "_id": claim_id, "product_id": product_id,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }, session=session)

    async def _audit_product(action: str, product_id: str, product_name: str, admin: dict, details: dict = None, session=None):
        """Write to product_audit_log in the same transaction as the product mutation."""
        await db.product_audit_log.insert_one({
            "id": str(uuid.uuid4()),
            "action": action,
            "product_id": product_id,
            "product_name": product_name,
            "user_id": admin.get("id", ""),
            "performed_by": admin.get("name", admin.get("email", "")),
            "details": details or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }, session=session)

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

        await _assert_product_identities_available({
            "name_en": p.name_en, "name_ar": p.name_ar,
            "barcode": p.barcode, "additional_barcodes": p.additional_barcodes or [],
        })

        family_name = ""
        if p.family_id:
            # p501: `is None`, not falsy — a legacy/template family without name_ar
            # projects to {} and must not masquerade as "not found".
            family = await db.product_families.find_one({"id": p.family_id}, {"_id": 0, "name_ar": 1, "name": 1})
            if family is None:
                raise HTTPException(status_code=400, detail="عائلة المنتجات المحددة غير موجودة")
            family_name = family.get("name_ar") or family.get("name") or ""

        brand_name = ""  # p217
        if p.brand_id:
            brand = await db.product_brands.find_one({"id": p.brand_id}, {"_id": 0, "name_ar": 1, "name": 1})
            if brand is None:
                raise HTTPException(status_code=400, detail="الماركة المحددة غير موجودة")
            brand_name = brand.get("name_ar") or brand.get("name") or ""

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
            "sold_by_weight": p.sold_by_weight or False,  # p501: was silently dropped on create
            "scale_plu": p.scale_plu or "",
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
        import asyncio
        from config.database import client
        from pymongo.errors import DuplicateKeyError, PyMongoError
        for attempt in range(5):
            try:
                async with await client.start_session() as tx_session:
                    async with tx_session.start_transaction():
                        await _claim_product_identities(product_id, product_doc, tx_session)
                        await db.products.insert_one(product_doc, session=tx_session)
                        main_warehouse = await db.warehouses.find_one(
                            {"is_main": True}, {"_id": 0, "id": 1}, session=tx_session
                        )
                        if main_warehouse and not product_doc.get("is_non_stockable"):
                            await adjust_warehouse_stock(
                                db, product_id, main_warehouse["id"], product_doc["quantity"],
                                product_quantity_before=0, session=tx_session,
                            )
                        await _audit_product("create", product_id, product_doc["name"], admin,
                                             {"barcode": product_doc.get("barcode", ""), "retail_price": product_doc.get("retail_price", 0)},
                                             session=tx_session)
                        product_doc.pop("_id", None)
                        return product_doc
            except DuplicateKeyError:
                raise HTTPException(status_code=409, detail="اسم المنتج أو الباركود مستعمل مسبقاً (تعارض تزامن)")
            except PyMongoError as exc:
                if attempt == 4 or not exc.has_error_label("TransientTransactionError"):
                    raise
                await asyncio.sleep(0.02 * (2 ** attempt))

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
            families = await db.product_families.find({"id": {"$in": family_ids}}, {"_id": 0, "id": 1, "name_ar": 1, "name": 1}).to_list(len(family_ids))
            families_map = {f["id"]: (f.get("name_ar") or f.get("name") or "") for f in families}  # p501: legacy name-only docs

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

        page = max(1, page)  # p501: clamp — page=0/negative made skip negative (500)
        page_size = max(1, min(page_size, 500))
        total = await db.products.count_documents(query)
        total_pages = (total + page_size - 1) // page_size
        skip = (page - 1) * page_size
        products = await db.products.find(query, {"_id": 0}).skip(skip).limit(page_size).to_list(page_size)

        for product in products:
            if product.get("family_id") and not product.get("family_name"):
                family = await db.product_families.find_one({"id": product["family_id"]}, {"_id": 0, "name_ar": 1, "name": 1})
                product["family_name"] = (family.get("name_ar") or family.get("name") or "") if family else ""
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
            "modifier_groups": 1,  # p308: POS يحتاج مجموعات الإضافات عند اختيار الطبق
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
        # p257: atomic per-prefix counter (was count+1 — collides after deletions)
        from services.code_generator import next_code
        return {"sku": await next_code(db, "products", f"{prefix}-", 5, False, field="sku")}

    # ── Generate Article Code ──
    @router.get("/generate-article-code")
    async def generate_article_code(admin: dict = Depends(get_current_user)):
        # p257: atomic counter (field is article_code on products)
        from services.code_generator import next_code
        return {"article_code": await next_code(db, "products", "AR", 4, False, field="article_code")}

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
        from models.schemas import ProductUpdate
        validated = ProductUpdate(**updates)
        # p501: whitelist declared schema fields — the raw pass-through stored
        # unknown keys verbatim and bypassed validation for undeclared ones.
        _allowed_update_fields = set(ProductUpdate.model_fields)
        update_data = {k: v for k, v in updates.items()
                       if v is not None and k != "id" and k in _allowed_update_fields}
        for k, v in validated.model_dump(exclude_unset=True).items():
            if v is not None:
                update_data[k] = v

        import asyncio
        from config.database import client
        from pymongo.errors import DuplicateKeyError, PyMongoError
        for attempt in range(5):
            try:
                async with await client.start_session() as tx_session:
                    async with tx_session.start_transaction():
                        product = await db.products.find_one({"id": product_id}, session=tx_session)
                        if not product:
                            raise HTTPException(status_code=404, detail="المنتج غير موجود")

                        if "family_id" in update_data:
                            if update_data["family_id"]:
                                family = await db.product_families.find_one(
                                    {"id": update_data["family_id"]}, {"_id": 0, "name_ar": 1, "name": 1}, session=tx_session
                                )
                                if family is None:  # p501: legacy docs may lack name_ar -> {} is still a hit
                                    raise HTTPException(status_code=400, detail="عائلة المنتجات المحددة غير موجودة")
                                update_data["family_name"] = family.get("name_ar") or family.get("name") or ""
                            else:
                                update_data["family_name"] = ""

                        if "brand_id" in update_data:
                            if update_data["brand_id"]:
                                brand = await db.product_brands.find_one(
                                    {"id": update_data["brand_id"]}, {"_id": 0, "name_ar": 1, "name": 1}, session=tx_session
                                )
                                if brand is None:
                                    raise HTTPException(status_code=400, detail="الماركة المحددة غير موجودة")
                                update_data["brand_name"] = brand.get("name_ar") or brand.get("name") or ""
                            else:
                                update_data["brand_name"] = ""

                        if "variants" in update_data or "has_variants" in update_data:
                            eff_has = update_data.get("has_variants", product.get("has_variants", False))
                            if eff_has:
                                raw_variants = update_data.get("variants", product.get("variants", [])) or []
                                norm = [
                                    {"color": (v or {}).get("color", ""), "size": (v or {}).get("size", ""),
                                     "quantity": float((v or {}).get("quantity", 0) or 0)}
                                    for v in raw_variants
                                ]
                                if any(v["quantity"] < 0 for v in norm):
                                    raise HTTPException(status_code=422, detail="كمية المتغير يجب أن تكون صفر أو أكثر")
                                update_data["variants"] = norm
                                update_data["has_variants"] = True
                                update_data["quantity"] = sum(v["quantity"] for v in norm)
                            else:
                                update_data["has_variants"] = False
                                update_data["variants"] = []

                        identity_doc = {**product, **update_data}
                        await _assert_product_identities_available(identity_doc, product_id, tx_session)
                        await _claim_product_identities(product_id, identity_doc, tx_session)
                        desired_claims = _identity_claim_ids(identity_doc)
                        await db.product_identity_claims.delete_many(
                            {"product_id": product_id, "_id": {"$nin": desired_claims}}, session=tx_session
                        )

                        now = datetime.now(timezone.utc).isoformat()
                        changed_by = admin.get("name", admin.get("email", ""))
                        for price_field in ("purchase_price", "wholesale_price", "retail_price", "super_wholesale_price"):
                            old_price = float(product.get(price_field, 0) or 0)
                            new_price = float(update_data.get(price_field, old_price) or 0)
                            if new_price == old_price:
                                continue
                            await db.price_history.insert_one({
                                "id": str(uuid.uuid4()), "product_id": product_id,
                                "product_name": product.get("name_ar") or product.get("name_en") or product.get("name") or "",
                                "old_price": old_price, "new_price": new_price, "price_type": price_field,
                                "change_percent": round(((new_price - old_price) / old_price) * 100, 2) if old_price else 0.0,
                                "changed_by": changed_by, "changed_by_name": changed_by,
                                "source": "manual", "created_at": now,
                            }, session=tx_session)

                        old_quantity = float(product.get("quantity", 0) or 0)
                        new_quantity = float(update_data.get("quantity", old_quantity) or 0)
                        if new_quantity != old_quantity:
                            main_warehouse = await db.warehouses.find_one(
                                {"is_main": True}, {"_id": 0, "id": 1}, session=tx_session
                            )
                            if main_warehouse and not update_data.get(
                                "is_non_stockable", product.get("is_non_stockable", False)
                            ):
                                await adjust_warehouse_stock(
                                    db, product_id, main_warehouse["id"], new_quantity - old_quantity,
                                    product_quantity_before=old_quantity, session=tx_session,
                                    allow_negative=True,  # p501: absolute quantity set follows the product, even under drift
                                )
                        update_data["updated_at"] = now
                        await db.products.update_one({"id": product_id}, {"$set": update_data}, session=tx_session)
                        await _audit_product("update", product_id, product.get("name_ar") or product.get("name_en") or "",
                                             admin, {"changed_fields": sorted(k for k in update_data if k != "updated_at")},
                                             session=tx_session)
                        return await db.products.find_one({"id": product_id}, {"_id": 0}, session=tx_session)
            except DuplicateKeyError:
                raise HTTPException(status_code=409, detail="اسم المنتج أو الباركود مستعمل مسبقاً (تعارض تزامن)")
            except PyMongoError as exc:
                if attempt == 4 or not exc.has_error_label("TransientTransactionError"):
                    raise
                await asyncio.sleep(0.02 * (2 ** attempt))

    # ── Delete Product ──
    @router.delete("/{product_id}")
    async def delete_product(product_id: str, admin: dict = Depends(require_permission("products.delete"))):
        # Archive, store cleanup, identity release and audit share one fate.
        import asyncio
        from config.database import client
        from pymongo.errors import PyMongoError
        for attempt in range(5):
            try:
                async with await client.start_session() as tx_session:
                    async with tx_session.start_transaction():
                        full_doc = await db.products.find_one({"id": product_id}, {"_id": 0}, session=tx_session)
                        if not full_doc:
                            raise HTTPException(status_code=404, detail="المنتج غير موجود")
                        pname = full_doc.get("name_ar") or full_doc.get("name_en") or ""
                        if (full_doc.get("quantity") or 0) > 0:
                            raise HTTPException(status_code=400, detail=f"لا يمكن حذف '{pname}': عليه مخزون ({full_doc.get('quantity')}). صفّر المخزون أولاً")
                        in_purchase = await db.purchases.find_one({"items.product_id": product_id}, {"_id": 1}, session=tx_session)
                        in_sale = await db.sales.find_one({"items.product_id": product_id}, {"_id": 1}, session=tx_session)
                        if in_purchase or in_sale:
                            raise HTTPException(status_code=400, detail=f"لا يمكن حذف '{pname}': منتج حقيقي له حركات شراء/بيع مسجلة")
                        product_lots = await db.product_lots.find({"product_id": product_id}, {"_id": 0}, session=tx_session).to_list(None)
                        warehouse_stock = await db.warehouse_stock.find(
                            {"product_id": product_id}
                        ).to_list(None)
                        await db.store_products.delete_many({"product_id": product_id}, session=tx_session)
                        archived = dict(full_doc)
                        archived["product_lots"] = product_lots
                        archived["warehouse_stock"] = warehouse_stock
                        archived["deleted_at"] = datetime.now(timezone.utc).isoformat()
                        archived["deleted_by"] = admin.get("full_name") or admin.get("email", "")
                        await db.deleted_products.update_one({"id": product_id}, {"$set": archived}, upsert=True, session=tx_session)
                        result = await db.products.delete_one({"id": product_id}, session=tx_session)
                        if result.deleted_count == 0:
                            raise HTTPException(status_code=404, detail="المنتج غير موجود")
                        await db.product_lots.delete_many({"product_id": product_id}, session=tx_session)
                        await db.warehouse_stock.delete_many({"product_id": product_id}, session=tx_session)
                        await db.product_identity_claims.delete_many({"product_id": product_id}, session=tx_session)
                        await _audit_product("delete", product_id, pname, admin, {}, session=tx_session)
                        return {"message": "تم حذف المنتج بنجاح"}
            except PyMongoError as exc:
                if attempt == 4 or not exc.has_error_label("TransientTransactionError"):
                    raise
                await asyncio.sleep(0.02 * (2 ** attempt))

    # ── Restore Deleted Product (recycle bin) ──
    @router.post("/{product_id}/restore")
    async def restore_product(product_id: str, admin: dict = Depends(require_permission("products.delete"))):
        import asyncio
        from config.database import client
        from pymongo.errors import DuplicateKeyError, PyMongoError
        for attempt in range(5):
            try:
                async with await client.start_session() as tx_session:
                    async with tx_session.start_transaction():
                        archived = await db.deleted_products.find_one({"id": product_id}, {"_id": 0}, session=tx_session)
                        if not archived:
                            raise HTTPException(status_code=404, detail="لا يوجد منتج محذوف بهذا المعرّف")
                        existing = await db.products.find_one({"id": product_id}, {"_id": 1}, session=tx_session)
                        if existing:
                            raise HTTPException(status_code=400, detail="منتج بنفس المعرّف موجود حالياً")
                        archived.pop("deleted_at", None)
                        archived.pop("deleted_by", None)
                        product_lots = archived.pop("product_lots", [])
                        warehouse_stock = archived.pop("warehouse_stock", [])
                        archived["restored_at"] = datetime.now(timezone.utc).isoformat()
                        archived["restored_by"] = admin.get("full_name") or admin.get("email", "")
                        await _assert_product_identities_available(archived, product_id, tx_session)
                        await _claim_product_identities(product_id, archived, tx_session)
                        await db.products.insert_one(archived, session=tx_session)
                        if product_lots:
                            await db.product_lots.insert_many(product_lots, session=tx_session)
                        if warehouse_stock:
                            await db.warehouse_stock.insert_many(warehouse_stock, session=tx_session)
                        await db.deleted_products.delete_one({"id": product_id}, session=tx_session)
                        await _audit_product("restore", product_id, archived.get("name_ar") or archived.get("name_en") or "", admin, {}, session=tx_session)
                        return {"message": "تمت استعادة المنتج من سلة المحذوفات", "product_id": product_id}
            except DuplicateKeyError:
                raise HTTPException(status_code=409, detail="تعذر الاستعادة: اسم المنتج أو الباركود مستعمل مسبقاً")
            except PyMongoError as exc:
                if attempt == 4 or not exc.has_error_label("TransientTransactionError"):
                    raise
                await asyncio.sleep(0.02 * (2 ** attempt))

    # ── Clone Product ──
    @router.post("/{product_id}/clone", status_code=201)
    async def clone_product(product_id: str, admin: dict = Depends(require_permission("products.add"))):
        import asyncio
        from config.database import client
        from pymongo.errors import DuplicateKeyError, PyMongoError
        for attempt in range(5):
            try:
                async with await client.start_session() as tx_session:
                    async with tx_session.start_transaction():
                        src = await db.products.find_one({"id": product_id}, {"_id": 0}, session=tx_session)
                        if not src:
                            raise HTTPException(status_code=404, detail="المنتج غير موجود")
                        now = datetime.now(timezone.utc).isoformat()
                        clone = dict(src)
                        clone["id"] = str(uuid.uuid4())
                        base_name = src.get("name_ar") or src.get("name_en") or ""
                        clone["name_ar"] = (src.get("name_ar") or "") + " (نسخة)" if src.get("name_ar") else ""
                        clone["name_en"] = (src.get("name_en") or "") + " (copy)" if src.get("name_en") else ""
                        clone["quantity"] = 0  # النسخة تبدأ بلا مخزون — لا تضخيم وهمي للمخزون
                        clone["barcode"] = ""
                        clone["additional_barcodes"] = []
                        clone["article_code"] = ""
                        clone["created_at"] = now
                        clone["updated_at"] = now
                        clone["cloned_from"] = product_id
                        clone.pop("restored_at", None)
                        clone.pop("restored_by", None)
                        await _assert_product_identities_available(clone, session=tx_session)
                        await _claim_product_identities(clone["id"], clone, tx_session)
                        await db.products.insert_one(clone, session=tx_session)
                        await _audit_product("clone", clone["id"], base_name, admin, {"cloned_from": product_id}, session=tx_session)
                        clone.pop("_id", None)
                        return clone
            except DuplicateKeyError:
                raise HTTPException(status_code=409, detail="اسم النسخة مستعمل مسبقاً")
            except PyMongoError as exc:
                if attempt == 4 or not exc.has_error_label("TransientTransactionError"):
                    raise
                await asyncio.sleep(0.02 * (2 ** attempt))

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
        from models.schemas import ProductLotCreate
        validated = ProductLotCreate(**lot)
        product = await db.products.find_one({"id": product_id})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        lot_doc = {
            "id": str(uuid.uuid4()),
            "product_id": product_id,
            "lot_number": validated.lot_number or "",
            "expiry_date": validated.expiry_date,
            "quantity": validated.quantity,
            "alert_days": validated.alert_days,
            "source": "manual",
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
    async def _lock_product_supplier_links(product_id: str, session):
        """Serialize default-link changes for one product inside the tenant DB."""
        now = datetime.now(timezone.utc).isoformat()
        await db.product_supplier_link_locks.find_one_and_update(
            {"_id": product_id},
            {
                "$set": {"updated_at": now},
                "$setOnInsert": {"product_id": product_id, "created_at": now},
            },
            upsert=True,
            session=session,
        )

    async def _supplier_display_name(supplier_id: str, session):
        supplier = await db.suppliers.find_one(
            {"id": supplier_id},
            {"_id": 0, "name": 1, "name_ar": 1, "company": 1},
            session=session,
        )
        if not supplier:
            raise HTTPException(status_code=404, detail="المورد غير موجود")
        return supplier.get("name_ar") or supplier.get("name") or supplier.get("company", "")

    @router.get("/{product_id}/suppliers")
    async def get_product_suppliers(product_id: str, user: dict = Depends(require_tenant)):
        product = await db.products.find_one({"id": product_id}, {"_id": 1})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        links = await db.product_supplier_links.find({"product_id": product_id}, {"_id": 0}).to_list(100)
        return links

    @router.post("/{product_id}/suppliers", status_code=201)
    async def add_product_supplier(product_id: str, link: dict, admin: dict = Depends(require_permission("products.edit"))):
        import asyncio
        from config.database import client
        from models.schemas import ProductSupplierLinkCreate
        from pymongo.errors import DuplicateKeyError, PyMongoError

        validated = ProductSupplierLinkCreate(**link)
        for attempt in range(5):
            try:
                async with await client.start_session() as tx_session:
                    async with tx_session.start_transaction():
                        product = await db.products.find_one({"id": product_id}, {"_id": 1}, session=tx_session)
                        if not product:
                            raise HTTPException(status_code=404, detail="المنتج غير موجود")
                        supplier_name = await _supplier_display_name(validated.supplier_id, tx_session)
                        await _lock_product_supplier_links(product_id, tx_session)
                        duplicate = await db.product_supplier_links.find_one(
                            {"product_id": product_id, "supplier_id": validated.supplier_id},
                            {"_id": 1}, session=tx_session,
                        )
                        if duplicate:
                            raise HTTPException(status_code=409, detail="هذا المورد مرتبط بالمنتج مسبقاً")
                        if validated.is_default:
                            await db.product_supplier_links.update_many(
                                {"product_id": product_id, "is_default": True},
                                {"$set": {"is_default": False}}, session=tx_session,
                            )
                        link_doc = {
                            "_id": product_supplier_link_mongo_id(product_id, validated.supplier_id),
                            "id": str(uuid.uuid4()),
                            "product_id": product_id,
                            "supplier_id": validated.supplier_id,
                            "supplier_name": supplier_name,
                            "purchase_price": validated.purchase_price,
                            "is_default": validated.is_default,
                            "created_at": datetime.now(timezone.utc).isoformat(),
                        }
                        await db.product_supplier_links.insert_one(link_doc, session=tx_session)
                        link_doc.pop("_id", None)
                        return link_doc
            except DuplicateKeyError:
                if attempt == 4:
                    raise HTTPException(status_code=409, detail="هذا المورد مرتبط بالمنتج مسبقاً")
                await asyncio.sleep(0.02 * (2 ** attempt))
            except PyMongoError as exc:
                if attempt == 4 or not exc.has_error_label("TransientTransactionError"):
                    raise
                await asyncio.sleep(0.02 * (2 ** attempt))

    @router.put("/{product_id}/suppliers/{link_id}")
    async def update_product_supplier(product_id: str, link_id: str, updates: dict, admin: dict = Depends(require_permission("products.edit"))):
        import asyncio
        from config.database import client
        from models.schemas import ProductSupplierLinkUpdate
        from pymongo.errors import DuplicateKeyError, PyMongoError

        validated = ProductSupplierLinkUpdate(**updates)
        update_data = validated.model_dump(exclude_unset=True, exclude_none=True)
        for attempt in range(5):
            try:
                async with await client.start_session() as tx_session:
                    async with tx_session.start_transaction():
                        product = await db.products.find_one({"id": product_id}, {"_id": 1}, session=tx_session)
                        if not product:
                            raise HTTPException(status_code=404, detail="المنتج غير موجود")
                        existing = await db.product_supplier_links.find_one(
                            {"id": link_id, "product_id": product_id}, session=tx_session,
                        )
                        if not existing:
                            raise HTTPException(status_code=404, detail="الربط غير موجود")
                        await _lock_product_supplier_links(product_id, tx_session)
                        supplier_id = update_data.get("supplier_id", existing.get("supplier_id"))
                        if "supplier_id" in update_data:
                            update_data["supplier_name"] = await _supplier_display_name(supplier_id, tx_session)
                            duplicate = await db.product_supplier_links.find_one(
                                {"product_id": product_id, "supplier_id": supplier_id, "id": {"$ne": link_id}},
                                {"_id": 1}, session=tx_session,
                            )
                            if duplicate:
                                raise HTTPException(status_code=409, detail="هذا المورد مرتبط بالمنتج مسبقاً")
                        if update_data.get("is_default") is True:
                            await db.product_supplier_links.update_many(
                                {"product_id": product_id, "id": {"$ne": link_id}, "is_default": True},
                                {"$set": {"is_default": False}}, session=tx_session,
                            )
                        target_mongo_id = product_supplier_link_mongo_id(product_id, supplier_id)
                        if target_mongo_id != existing["_id"]:
                            replacement = {**existing, **update_data, "_id": target_mongo_id}
                            await db.product_supplier_links.insert_one(replacement, session=tx_session)
                            await db.product_supplier_links.delete_one(
                                {"_id": existing["_id"]}, session=tx_session,
                            )
                        elif update_data:
                            await db.product_supplier_links.update_one(
                                {"_id": existing["_id"]}, {"$set": update_data}, session=tx_session,
                            )
                        return await db.product_supplier_links.find_one(
                            {"_id": target_mongo_id}, {"_id": 0}, session=tx_session,
                        )
            except DuplicateKeyError:
                if attempt == 4:
                    raise HTTPException(status_code=409, detail="هذا المورد مرتبط بالمنتج مسبقاً")
                await asyncio.sleep(0.02 * (2 ** attempt))
            except PyMongoError as exc:
                if attempt == 4 or not exc.has_error_label("TransientTransactionError"):
                    raise
                await asyncio.sleep(0.02 * (2 ** attempt))

    @router.delete("/{product_id}/suppliers/{link_id}")
    async def delete_product_supplier(product_id: str, link_id: str, admin: dict = Depends(require_permission("products.edit"))):
        result = await db.product_supplier_links.delete_one({"id": link_id, "product_id": product_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="الربط غير موجود")
        return {"message": "تم الحذف"}

    return router
