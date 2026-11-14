"""
Families Permissions Routes
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional, List, Literal
from datetime import datetime, timezone
from pathlib import Path
import re
import uuid
import logging
import asyncio
import requests as http_requests

from config.database import db
from utils.auth import get_current_user as require_tenant, get_tenant_admin
from utils.permissions import create_permission_checker
from models.schemas import (
    DEFAULT_PERMISSIONS, ROLE_DESCRIPTIONS, PERMISSION_CATEGORIES,
    ProductFamilyCreate, ProductFamilyUpdate, ProductFamilyResponse, ProductResponse
)

logger = logging.getLogger(__name__)

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "static" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

router = APIRouter()

# p492: real permission checker for the legacy /spare-parts* surface
# (main.py imports a no-op require_permission — factories/modules must build
# their own). Spare parts belong to the maintenance domain -> repairs.* perms.
_require_perm = create_permission_checker(db, require_tenant)

# ============ ADVANCED ROLES AND PERMISSIONS ============

@router.get("/permissions/roles")
async def get_all_roles(user: dict = Depends(require_tenant)):
    """Get all available roles with their default permissions and descriptions"""
    return {
        "roles": list(DEFAULT_PERMISSIONS.keys()),
        "default_permissions": DEFAULT_PERMISSIONS,
        "role_descriptions": ROLE_DESCRIPTIONS,
        "permission_categories": PERMISSION_CATEGORIES
    }

@router.get("/permissions/categories")
async def get_permission_categories(user: dict = Depends(require_tenant)):
    """Get permission categories for UI grouping"""
    return PERMISSION_CATEGORIES

@router.get("/permissions/role/{role_name}")
async def get_role_permissions(role_name: str, user: dict = Depends(require_tenant)):
    """Get permissions for a specific role"""
    if role_name not in DEFAULT_PERMISSIONS:
        raise HTTPException(status_code=404, detail="Role not found")

    return {
        "role": role_name,
        "description": ROLE_DESCRIPTIONS.get(role_name, {"ar": role_name, "fr": role_name}),
        "permissions": DEFAULT_PERMISSIONS[role_name]
    }

# ============ FILE UPLOAD ============

@router.post("/upload/image")
async def upload_image(file: UploadFile = File(...), user: dict = Depends(require_tenant)):
    """Upload an image file"""
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Only images are allowed.")

    # Generate unique filename with sanitized extension
    import re as _re
    raw_ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    file_ext = _re.sub(r'[^\w]', '', raw_ext)[:10]
    if file_ext not in ("jpg", "jpeg", "png", "webp", "gif"):
        file_ext = "jpg"
    unique_filename = f"{uuid.uuid4()}.{file_ext}"
    file_path = UPLOAD_DIR / unique_filename

    # Save file — with size limit and magic-byte content verification
    try:
        content = await file.read()
        if len(content) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="حجم الملف يتجاوز الحد الأقصى 5MB")
        _sig = (
            content[:3] == b"\xff\xd8\xff"                      # JPEG
            or content[:4] == b"\x89PNG"                            # PNG
            or content[:3] == b"GIF"                                 # GIF
            or (content[:4] == b"RIFF" and content[8:12] == b"WEBP") # WEBP
        )
        if not _sig:
            raise HTTPException(status_code=400, detail="محتوى الملف ليس صورة حقيقية")
        with open(file_path, "wb") as buffer:
            buffer.write(content)

        # Return URL (relative to static)
        return {"url": f"/api/static/uploads/{unique_filename}", "filename": unique_filename}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")

# ============ PERMISSIONS SYSTEM ============

@router.get("/users/{user_id}/permissions")
async def get_user_permissions(user_id: str, admin: dict = Depends(get_tenant_admin)):
    """Get permissions for a specific user"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # If user has custom permissions, return them; otherwise return role defaults
    permissions = user.get("permissions") or DEFAULT_PERMISSIONS.get(user.get("role", "user"), {})
    return {
        "user_id": user_id,
        "role": user.get("role", "user"),
        "permissions": permissions,
        "is_custom": bool(user.get("permissions"))
    }

@router.put("/users/{user_id}/permissions")
async def update_user_permissions(user_id: str, permissions: dict, admin: dict = Depends(get_tenant_admin)):
    """Update permissions for a specific user"""
    # Frontend sends {"permissions": {...}} — unwrap to store the raw permissions map
    if set(permissions.keys()) == {"permissions"} and isinstance(permissions["permissions"], dict):
        permissions = permissions["permissions"]
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await db.users.update_one(
        {"id": user_id},
        {"$set": {"permissions": permissions}}
    )

    return {"success": True, "message": "Permissions updated"}

@router.put("/users/{user_id}/reset-permissions")
async def reset_user_permissions(user_id: str, admin: dict = Depends(get_tenant_admin)):
    """Reset user permissions to role defaults"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await db.users.update_one(
        {"id": user_id},
        {"$unset": {"permissions": ""}}
    )

    return {"success": True, "message": "Permissions reset to defaults"}

# ============ FACTORY RESET ============

@router.post("/system/factory-reset")
async def factory_reset(confirm_code: str, admin: dict = Depends(get_tenant_admin)):
    """Factory reset - Delete all data except admin user"""
    # Verify confirmation code
    if confirm_code != "RESET-ALL-DATA":
        raise HTTPException(status_code=400, detail="Invalid confirmation code")

    # Check if user has factory_reset permission
    user_permissions = admin.get("permissions") or DEFAULT_PERMISSIONS.get(admin.get("role", "user"), {})
    if not user_permissions.get("factory_reset", False):
        raise HTTPException(status_code=403, detail="No permission for factory reset")

    # Collections to clear
    collections_to_clear = [
        "products", "customers", "suppliers", "employees", 
        "sales", "purchases", "debts", "debt_payments",
        "transactions", "notifications", "sms_logs",
        "product_families", "api_keys", "recharges"
    ]

    deleted_counts = {}
    for collection in collections_to_clear:
        result = await db[collection].delete_many({})
        deleted_counts[collection] = result.deleted_count

    # Reset cash boxes to zero
    await db.cash_boxes.update_many({}, {"$set": {"balance": 0}})

    # Keep admin user, delete others
    await db.users.delete_many({"role": {"$ne": "admin"}})

    # Log the reset
    await db.system_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "factory_reset",
        "performed_by": admin.get("name", ""),
        "deleted_counts": deleted_counts,
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    return {
        "success": True,
        "message": "Factory reset completed",
        "deleted_counts": deleted_counts
    }

@router.get("/system/stats")
async def get_system_stats(admin: dict = Depends(get_tenant_admin)):
    """Get system statistics for factory reset preview"""
    stats = {
        "products": await db.products.count_documents({}),
        "customers": await db.customers.count_documents({}),
        "suppliers": await db.suppliers.count_documents({}),
        "employees": await db.employees.count_documents({}),
        "sales": await db.sales.count_documents({}),
        "users": await db.users.count_documents({}),
        "product_families": await db.product_families.count_documents({}),
        "recharges": await db.recharges.count_documents({})
    }
    return stats

# ============ BULK PRICE UPDATE ============

class BulkPriceUpdateRequest(BaseModel):
    product_ids: Optional[List[str]] = None  # None = all products
    family_id: Optional[str] = None  # Filter by family
    update_type: Literal["percentage", "fixed", "set", "margin"]  # نسبة مئوية، مبلغ ثابت، تحديد قيمة، هامش ربح
    price_field: Literal["purchase_price", "wholesale_price", "retail_price", "all"]
    value: float
    round_to: int = 0  # Round to nearest (0 = no rounding, 10 = nearest 10, etc.)
    min_price: float = 0  # p492: price-range scope (advanced options in the UI)
    max_price: float = 0


def _bulk_validate(update_type: str, price_field: str, value: float) -> None:
    # p492: reject destructive payloads instead of silently clamping every price to 0.
    if update_type == "set" and value < 0:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد سعر سالب")
    if update_type == "percentage" and value <= -100:
        raise HTTPException(status_code=400, detail="نسبة التخفيض لا يمكن أن تتجاوز 100%")
    if update_type == "margin":
        if not 0 <= value <= 1000:
            raise HTTPException(status_code=400, detail="هامش الربح غير صالح")
        if price_field == "purchase_price":
            raise HTTPException(status_code=400, detail="هامش الربح يُطبَّق على أسعار البيع فقط")


def _bulk_scope_query(product_ids, family_id, price_field, min_price, max_price) -> dict:
    # p492: an explicit empty product_ids list means "no products" — never "all".
    query = {}
    if product_ids is not None:
        query["id"] = {"$in": product_ids}
    if family_id:
        query["family_id"] = family_id
    if min_price > 0 or max_price > 0:
        range_field = price_field if price_field != "all" else "retail_price"
        cond = {}
        if min_price > 0:
            cond["$gte"] = min_price
        if max_price > 0:
            cond["$lte"] = max_price
        query[range_field] = cond
    return query


def _bulk_compute(update_type: str, field: str, old_price: float, value: float,
                  round_to: int, purchase_price: float):
    # Returns None when the field is not affected (margin never touches purchase_price).
    if update_type == "margin":
        if field == "purchase_price":
            return None
        new_price = (purchase_price or 0) * (1 + value / 100)
    elif update_type == "percentage":
        new_price = old_price * (1 + value / 100)
    elif update_type == "fixed":
        new_price = old_price + value
    else:  # set
        new_price = value
    if round_to > 0:
        new_price = round(new_price / round_to) * round_to
    new_price = round(new_price, 2)  # clean float artifacts even without round_to
    return max(0, new_price)


@router.post("/products/bulk-price-update")
async def bulk_price_update(request: BulkPriceUpdateRequest, admin: dict = Depends(get_tenant_admin)):
    """Update prices for multiple products at once"""
    _bulk_validate(request.update_type, request.price_field, request.value)
    query = _bulk_scope_query(request.product_ids, request.family_id,
                              request.price_field, request.min_price, request.max_price)

    # Get products
    products = await db.products.find(query, {"_id": 0}).to_list(10000)

    if not products:
        raise HTTPException(status_code=404, detail="لا توجد منتجات مطابقة للمعايير")

    price_fields = ["purchase_price", "wholesale_price", "retail_price"] if request.price_field == "all" else [request.price_field]

    updated_count = 0
    updates_log = []

    for product in products:
        update_data = {}

        for field in price_fields:
            old_price = product.get(field, 0)
            new_price = _bulk_compute(request.update_type, field, old_price, request.value,
                                      request.round_to, product.get("purchase_price", 0))
            if new_price is not None:
                update_data[field] = new_price

        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

        await db.products.update_one({"id": product["id"]}, {"$set": update_data})
        updated_count += 1

        updates_log.append({
            "product_id": product["id"],
            "product_name": product.get("name_ar", product.get("name_en", "")),
            "old_prices": {f: product.get(f, 0) for f in price_fields},
            "new_prices": {f: update_data.get(f, product.get(f, 0)) for f in price_fields}
        })

        # Same audit trail as single-product PUT: one price_history row per changed field
        now_iso = update_data["updated_at"]
        for field in price_fields:
            if field not in update_data:
                continue  # margin never rewrites purchase_price
            old_p = product.get(field, 0)
            new_p = update_data[field]
            if new_p != old_p:
                await db.price_history.insert_one({
                    "id": str(uuid.uuid4()),
                    "product_id": product["id"],
                    "product_name": product.get("name_ar") or product.get("name_en") or "",
                    "old_price": old_p,
                    "new_price": new_p,
                    "price_type": field,
                    "change_percent": round(((new_p - old_p) / old_p) * 100, 2) if old_p else 0.0,
                    "changed_by": admin.get("name", admin.get("email", "")),
                    "changed_by_name": admin.get("name", admin.get("email", "")),
                    "change_reason": "bulk_price_update",
                    "created_at": now_iso,
                })

    # Log the bulk update
    await db.system_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "bulk_price_update",
        "performed_by": admin.get("name", ""),
        "update_type": request.update_type,
        "value": request.value,
        "updated_count": updated_count,
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    return {
        "success": True,
        "updated_count": updated_count,
        "updates": updates_log[:10]  # Return first 10 as sample
    }

@router.get("/products/price-preview")
async def preview_price_update(
    update_type: Literal["percentage", "fixed", "set", "margin"],
    price_field: Literal["purchase_price", "wholesale_price", "retail_price", "all"],
    value: float,
    family_id: Optional[str] = None,
    round_to: int = 0,
    min_price: float = 0,
    max_price: float = 0,
    admin: dict = Depends(get_tenant_admin)
):
    """Preview price changes before applying"""
    # p492: identical validation/scope/math as the apply endpoint so the preview
    # is a faithful preview (previously bogus types were silent no-ops and the
    # UI's min/max price range was ignored).
    _bulk_validate(update_type, price_field, value)
    query = _bulk_scope_query(None, family_id, price_field, min_price, max_price)

    products = await db.products.find(query, {"_id": 0}).limit(20).to_list(20)

    previews = []
    for product in products:
        price_fields = ["purchase_price", "wholesale_price", "retail_price"] if price_field == "all" else [price_field]

        preview = {
            "id": product["id"],
            "name": product.get("name_ar", product.get("name_en", "")),
            "changes": {}
        }

        for field in price_fields:
            old_price = product.get(field, 0)
            new_price = _bulk_compute(update_type, field, old_price, value,
                                      round_to, product.get("purchase_price", 0))
            if new_price is None:
                continue  # margin never touches purchase_price
            preview["changes"][field] = {
                "old": old_price,
                "new": new_price,
                "diff": round(new_price - old_price, 2)
            }

        previews.append(preview)

    return {
        "preview_count": len(previews),
        "total_products": await db.products.count_documents(query),
        "previews": previews
    }

# ============ PRODUCT FAMILIES ROUTES ============

@router.post("/product-families", response_model=ProductFamilyResponse)
async def create_product_family(family: ProductFamilyCreate, admin: dict = Depends(get_tenant_admin)):
    family_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    # A child must always point to a real parent in the same tenant database.
    parent_name = ""
    if family.parent_id:
        parent = await db.product_families.find_one(
            {"id": family.parent_id}, {"_id": 0, "name_ar": 1}
        )
        if not parent:
            raise HTTPException(status_code=404, detail="Parent product family not found")
        parent_name = parent["name_ar"]

    from services.code_generator import generate_code
    code = await generate_code(db, "product_families", "FA", 5, with_year=False)
    family_doc = {
        "id": family_id,
        "code": code,
        "name_en": family.name_en,
        "name_ar": family.name_ar,
        "description_en": family.description_en or "",
        "description_ar": family.description_ar or "",
        "parent_id": family.parent_id or "",
        "parent_name": parent_name,
        "product_count": 0,
        "is_spare_parts": bool(getattr(family, "is_spare_parts", False)),  # p286
        "created_at": now
    }
    await db.product_families.insert_one(family_doc)
    return ProductFamilyResponse(**family_doc)

@router.get("/product-families", response_model=List[ProductFamilyResponse])
async def get_product_families(user: dict = Depends(require_tenant)):
    families = await db.product_families.find({}, {"_id": 0}).to_list(1000)
    # Skip malformed docs (e.g. bad CSV import artifacts with no id) instead of 500
    families = [fam for fam in families if fam.get("id")]

    # Update product counts
    for family in families:
        count = await db.products.count_documents({"family_id": family["id"]})
        family["product_count"] = count

    return [ProductFamilyResponse(**f) for f in families]

# ============ p217: PRODUCT BRANDS (الماركات) ============

class ProductBrandCreate(BaseModel):
    name_ar: str
    name_en: Optional[str] = ""


@router.get("/product-brands")
async def get_product_brands(user: dict = Depends(require_tenant)):
    """p217: list brands with live product counts."""
    brands = await db.product_brands.find({}, {"_id": 0}).sort("name_ar", 1).to_list(1000)
    brands = [b for b in brands if b.get("id")]
    for b in brands:
        b["product_count"] = await db.products.count_documents({"brand_id": b["id"]})
    return brands


@router.post("/product-brands", status_code=201)
async def create_product_brand(brand: ProductBrandCreate, admin: dict = Depends(get_tenant_admin)):
    name = (brand.name_ar or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="اسم الماركة مطلوب")
    import re as _re
    existing = await db.product_brands.find_one(
        {"name_ar": {"$regex": f"^{_re.escape(name)}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=409, detail="الماركة موجودة مسبقاً")
    # p492: deterministic _id from the normalized name closes the
    # check-then-insert race — a concurrent duplicate hits DuplicateKeyError.
    import hashlib as _hl
    from pymongo.errors import DuplicateKeyError as _DupKey
    doc = {
        "_id": "brand_" + _hl.sha1(name.casefold().encode("utf-8")).hexdigest()[:24],
        "id": str(uuid.uuid4()),
        "name_ar": name,
        "name_en": (brand.name_en or "").strip() or name,
        "product_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.product_brands.insert_one(doc)
    except _DupKey:
        raise HTTPException(status_code=409, detail="الماركة موجودة مسبقاً")
    doc.pop("_id", None)
    return doc


@router.put("/product-brands/{brand_id}")
async def update_product_brand(brand_id: str, updates: ProductBrandCreate, admin: dict = Depends(get_tenant_admin)):
    brand = await db.product_brands.find_one({"id": brand_id})
    if not brand:
        raise HTTPException(status_code=404, detail="الماركة غير موجودة")
    name = (updates.name_ar or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="اسم الماركة مطلوب")
    # p492: renaming onto an existing brand name must be rejected (409),
    # mirroring the create endpoint's duplicate guard.
    import re as _re
    clash = await db.product_brands.find_one({
        "id": {"$ne": brand_id},
        "name_ar": {"$regex": f"^{_re.escape(name)}$", "$options": "i"}})
    if clash:
        raise HTTPException(status_code=409, detail="الماركة موجودة مسبقاً")
    name_en = (updates.name_en or "").strip() or name
    await db.product_brands.update_one({"id": brand_id}, {"$set": {"name_ar": name, "name_en": name_en}})
    # keep product mirrors consistent
    await db.products.update_many({"brand_id": brand_id}, {"$set": {"brand_name": name}})
    doc = await db.product_brands.find_one({"id": brand_id}, {"_id": 0})
    doc["product_count"] = await db.products.count_documents({"brand_id": brand_id})
    return doc


@router.delete("/product-brands/{brand_id}")
async def delete_product_brand(brand_id: str, admin: dict = Depends(get_tenant_admin)):
    count = await db.products.count_documents({"brand_id": brand_id})
    if count > 0:
        raise HTTPException(status_code=400, detail=f"لا يمكن حذف ماركة عليها {count} منتجاً")
    res = await db.product_brands.delete_one({"id": brand_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الماركة غير موجودة")
    return {"success": True}


@router.get("/product-families/{family_id}", response_model=ProductFamilyResponse)
async def get_product_family(family_id: str, user: dict = Depends(require_tenant)):
    family = await db.product_families.find_one({"id": family_id}, {"_id": 0})
    if not family:
        raise HTTPException(status_code=404, detail="Product family not found")

    # Update product count
    count = await db.products.count_documents({"family_id": family_id})
    family["product_count"] = count

    return ProductFamilyResponse(**family)

@router.put("/product-families/{family_id}", response_model=ProductFamilyResponse)
async def update_product_family(family_id: str, updates: ProductFamilyUpdate, admin: dict = Depends(get_tenant_admin)):
    family = await db.product_families.find_one({"id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="Product family not found")

    # Only explicitly supplied fields are updated; null parent_id means no parent.
    update_data = {
        k: v for k, v in updates.model_dump(exclude_unset=True).items()
        if v is not None or k == "parent_id"
    }

    if "parent_id" in update_data and update_data["parent_id"]:
        parent_id = update_data["parent_id"]
        if parent_id == family_id:
            raise HTTPException(status_code=400, detail="Product family cannot be its own parent")
        parent = await db.product_families.find_one(
            {"id": parent_id}, {"_id": 0, "id": 1, "name_ar": 1, "parent_id": 1}
        )
        if not parent:
            raise HTTPException(status_code=404, detail="Parent product family not found")

        # Reject assigning a family below itself, including longer cycles.
        ancestor_id = parent.get("parent_id") or ""
        visited = {family_id, parent_id}
        while ancestor_id:
            if ancestor_id == family_id:
                raise HTTPException(
                    status_code=400,
                    detail="Product family cannot be assigned to one of its descendants",
                )
            if ancestor_id in visited:
                raise HTTPException(status_code=400, detail="Invalid product family hierarchy")
            visited.add(ancestor_id)
            ancestor = await db.product_families.find_one(
                {"id": ancestor_id}, {"_id": 0, "parent_id": 1}
            )
            if not ancestor:
                raise HTTPException(status_code=404, detail="Parent product family not found")
            ancestor_id = ancestor.get("parent_id") or ""
        update_data["parent_name"] = parent["name_ar"]
    elif "parent_id" in update_data:
        update_data["parent_id"] = ""
        update_data["parent_name"] = ""

    if update_data:
        from config.database import client
        async with await client.start_session() as tx_session:
            async with tx_session.start_transaction():
                await db.product_families.update_one(
                    {"id": family_id}, {"$set": update_data}, session=tx_session
                )
                if "name_ar" in update_data:
                    await db.product_families.update_many(
                        {"parent_id": family_id},
                        {"$set": {"parent_name": update_data["name_ar"]}},
                        session=tx_session,
                    )

    updated = await db.product_families.find_one({"id": family_id}, {"_id": 0})
    count = await db.products.count_documents({"family_id": family_id})
    updated["product_count"] = count

    return ProductFamilyResponse(**updated)

@router.delete("/product-families/{family_id}")
async def delete_product_family(family_id: str, admin: dict = Depends(get_tenant_admin)):
    # Check if family has products
    product_count = await db.products.count_documents({"family_id": family_id})
    if product_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete family with {product_count} products")

    # Check if family has children
    child_count = await db.product_families.count_documents({"parent_id": family_id})
    if child_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete family with {child_count} sub-families")

    result = await db.product_families.delete_one({"id": family_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product family not found")
    return {"message": "Product family deleted successfully"}

@router.get("/product-families/{family_id}/products", response_model=List[ProductResponse])
async def get_family_products(family_id: str, user: dict = Depends(require_tenant)):
    """Get all products in a specific family"""
    products = await db.products.find({"family_id": family_id}, {"_id": 0}).to_list(1000)

    # Add family names
    for product in products:
        if product.get("family_id"):
            family = await db.product_families.find_one({"id": product["family_id"]}, {"_id": 0, "name_ar": 1, "name": 1})
            product["family_name"] = (family.get("name_ar") or family.get("name") or "") if family else ""
        else:
            product["family_name"] = ""

    return [ProductResponse(**p) for p in products]

# ============ CUSTOMER & SUPPLIER FAMILIES ============

def _validate_family_name(v: str) -> str:
    """Name validation parity with models/schemas/parties.py: strip HTML, require
    non-empty, max 255 chars. p492: family names were stored raw (empty string or
    markup) because the schemas had no validators at all."""
    if not v or not v.strip():
        raise ValueError('اسم العائلة مطلوب')
    v = re.sub(r'<[^>]+>', '', v).strip()
    if not v:
        raise ValueError('اسم العائلة مطلوب')
    if len(v) > 255:
        raise ValueError('الاسم يجب ألا يتجاوز 255 حرف')
    return v


class CustomerFamilyCreate(BaseModel):
    name: str
    description: Optional[str] = ""

    @field_validator('name')
    @classmethod
    def _name_valid(cls, v):
        return _validate_family_name(v)


class CustomerFamilyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

    @field_validator('name')
    @classmethod
    def _name_valid(cls, v):
        if v is None:
            return v
        return _validate_family_name(v)

class CustomerFamilyResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: str = ""
    customer_count: int = 0
    created_at: str = ""

class SupplierFamilyCreate(BaseModel):
    name: str
    description: Optional[str] = ""

    @field_validator('name')
    @classmethod
    def _name_valid(cls, v):
        return _validate_family_name(v)


class SupplierFamilyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

    @field_validator('name')
    @classmethod
    def _name_valid(cls, v):
        if v is None:
            return v
        return _validate_family_name(v)

class SupplierFamilyResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: str = ""
    supplier_count: int = 0
    created_at: str = ""

# Customer Families CRUD
@router.post("/customer-families", response_model=CustomerFamilyResponse)
async def create_customer_family(family: CustomerFamilyCreate, admin: dict = Depends(get_tenant_admin)):
    family_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    family_doc = {
        "id": family_id,
        "name": family.name,
        "description": family.description or "",
        "customer_count": 0,
        "created_at": now
    }

    await db.customer_families.insert_one(family_doc)
    return CustomerFamilyResponse(**family_doc)

@router.get("/customer-families", response_model=List[CustomerFamilyResponse])
async def get_customer_families(user: dict = Depends(require_tenant)):
    families = await db.customer_families.find({}, {"_id": 0}).to_list(100)

    # Update customer counts
    for family in families:
        count = await db.customers.count_documents({"family_id": family["id"]})
        family["customer_count"] = count

    return [CustomerFamilyResponse(**f) for f in families]

@router.get("/customer-families/{family_id}", response_model=CustomerFamilyResponse)
async def get_customer_family(family_id: str, user: dict = Depends(require_tenant)):
    family = await db.customer_families.find_one({"id": family_id}, {"_id": 0})
    if not family:
        raise HTTPException(status_code=404, detail="عائلة الزبائن غير موجودة")

    count = await db.customers.count_documents({"family_id": family_id})
    family["customer_count"] = count

    return CustomerFamilyResponse(**family)

@router.put("/customer-families/{family_id}", response_model=CustomerFamilyResponse)
async def update_customer_family(family_id: str, updates: CustomerFamilyUpdate, admin: dict = Depends(get_tenant_admin)):
    family = await db.customer_families.find_one({"id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="عائلة الزبائن غير موجودة")

    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if update_data:
        await db.customer_families.update_one({"id": family_id}, {"$set": update_data})

    updated = await db.customer_families.find_one({"id": family_id}, {"_id": 0})
    count = await db.customers.count_documents({"family_id": family_id})
    updated["customer_count"] = count

    return CustomerFamilyResponse(**updated)

@router.delete("/customer-families/{family_id}")
async def delete_customer_family(family_id: str, admin: dict = Depends(get_tenant_admin)):
    count = await db.customers.count_documents({"family_id": family_id})
    if count > 0:
        raise HTTPException(status_code=400, detail=f"لا يمكن حذف عائلة بها {count} زبون")

    result = await db.customer_families.delete_one({"id": family_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="عائلة الزبائن غير موجودة")
    return {"message": "تم حذف عائلة الزبائن بنجاح"}

# Supplier Families CRUD
@router.post("/supplier-families", response_model=SupplierFamilyResponse)
async def create_supplier_family(family: SupplierFamilyCreate, admin: dict = Depends(get_tenant_admin)):
    family_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    family_doc = {
        "id": family_id,
        "name": family.name,
        "description": family.description or "",
        "supplier_count": 0,
        "created_at": now
    }

    await db.supplier_families.insert_one(family_doc)
    return SupplierFamilyResponse(**family_doc)

@router.get("/supplier-families", response_model=List[SupplierFamilyResponse])
async def get_supplier_families(user: dict = Depends(require_tenant)):
    families = await db.supplier_families.find({}, {"_id": 0}).to_list(100)

    # Update supplier counts
    for family in families:
        count = await db.suppliers.count_documents({"family_id": family["id"]})
        family["supplier_count"] = count

    return [SupplierFamilyResponse(**f) for f in families]

@router.get("/supplier-families/{family_id}", response_model=SupplierFamilyResponse)
async def get_supplier_family(family_id: str, user: dict = Depends(require_tenant)):
    family = await db.supplier_families.find_one({"id": family_id}, {"_id": 0})
    if not family:
        raise HTTPException(status_code=404, detail="عائلة الموردين غير موجودة")

    count = await db.suppliers.count_documents({"family_id": family_id})
    family["supplier_count"] = count

    return SupplierFamilyResponse(**family)

@router.put("/supplier-families/{family_id}", response_model=SupplierFamilyResponse)
async def update_supplier_family(family_id: str, updates: SupplierFamilyUpdate, admin: dict = Depends(get_tenant_admin)):
    family = await db.supplier_families.find_one({"id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="عائلة الموردين غير موجودة")

    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if update_data:
        await db.supplier_families.update_one({"id": family_id}, {"$set": update_data})

    updated = await db.supplier_families.find_one({"id": family_id}, {"_id": 0})
    count = await db.suppliers.count_documents({"family_id": family_id})
    updated["supplier_count"] = count

    return SupplierFamilyResponse(**updated)

@router.delete("/supplier-families/{family_id}")
async def delete_supplier_family(family_id: str, admin: dict = Depends(get_tenant_admin)):
    count = await db.suppliers.count_documents({"family_id": family_id})
    if count > 0:
        raise HTTPException(status_code=400, detail=f"لا يمكن حذف عائلة بها {count} مورد")

    result = await db.supplier_families.delete_one({"id": family_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="عائلة الموردين غير موجودة")
    return {"message": "تم حذف عائلة الموردين بنجاح"}

# ============ WHATSAPP NOTIFICATIONS ============

class WhatsAppSettings(BaseModel):
    enabled: bool = False
    phone_number_id: Optional[str] = None
    access_token: Optional[str] = None
    business_account_id: Optional[str] = None

class WhatsAppMessage(BaseModel):
    phone: str
    message: str

# Status messages in Arabic
REPAIR_STATUS_MESSAGES = {
    "received": "مرحباً {customer_name}! تم استلام جهازك ({device}) للصيانة. رقم التذكرة: {ticket_number}. سنقوم بإشعارك عند أي تحديث.",
    "diagnosing": "تحديث الصيانة #{ticket_number}: جاري فحص جهازك ({device}) لتحديد العطل.",
    "waiting_parts": "تحديث الصيانة #{ticket_number}: جهازك ({device}) بحاجة لقطع غيار. سنقوم بإعلامك فور توفرها.",
    "in_progress": "تحديث الصيانة #{ticket_number}: جاري إصلاح جهازك ({device}). الوقت المتوقع: {estimated_days} أيام.",
    "completed": "🎉 أخبار سارة! تم إصلاح جهازك ({device}) بنجاح. رقم التذكرة: {ticket_number}. يمكنك استلامه الآن. التكلفة: {cost} دج",
    "delivered": "شكراً لثقتك بنا! تم تسليم جهازك ({device}). نتمنى لك يوماً سعيداً! 🙏",
    "cancelled": "تم إلغاء طلب الصيانة #{ticket_number}. للاستفسار يرجى التواصل معنا."
}

@router.get("/whatsapp/settings")
async def get_whatsapp_settings(user: dict = Depends(require_tenant)):
    """Get WhatsApp settings"""
    settings = await db.whatsapp_settings.find_one({}, {"_id": 0})
    if not settings:
        settings = {"enabled": False}
    # Don't expose access_token
    if "access_token" in settings:
        settings["access_token"] = "***" if settings["access_token"] else None
    return settings

@router.put("/whatsapp/settings")
async def update_whatsapp_settings(settings: WhatsAppSettings, user: dict = Depends(require_tenant)):
    """Update WhatsApp settings"""
    settings_data = settings.model_dump()
    # p272: never overwrite the stored token with the "***" mask; encrypt at rest
    if settings_data.get("access_token") == "***":
        _ex = await db.whatsapp_settings.find_one({}, {"_id": 0, "access_token": 1})
        settings_data["access_token"] = (_ex or {}).get("access_token")
    elif settings_data.get("access_token"):
        from services.crypto_fields import encrypt_field as _ef
        settings_data["access_token"] = _ef(settings_data["access_token"])
    settings_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    settings_data["updated_by"] = user["id"]

    await db.whatsapp_settings.update_one(
        {},
        {"$set": settings_data},
        upsert=True
    )
    return {"message": "تم تحديث إعدادات WhatsApp"}

@router.post("/whatsapp/send", operation_id="send_whatsapp_message_v2")
async def send_whatsapp_message_v2(message: WhatsAppMessage, user: dict = Depends(require_tenant)):
    """Send a WhatsApp message"""
    if not (message.phone or "").strip():
        raise HTTPException(status_code=400, detail="رقم الهاتف مطلوب")
    if not (message.message or "").strip():
        raise HTTPException(status_code=400, detail="الرسالة فارغة")
    settings = await db.whatsapp_settings.find_one({}, {"_id": 0})
    if not settings or not settings.get("enabled"):
        raise HTTPException(status_code=400, detail="WhatsApp غير مفعل")

    if not settings.get("access_token") or not settings.get("phone_number_id"):
        raise HTTPException(status_code=400, detail="إعدادات WhatsApp غير مكتملة")
    from services.crypto_fields import decrypt_field as _df  # p272
    settings["access_token"] = _df(settings["access_token"]) or ""

    # Format phone number (remove leading 0 and add country code)
    phone = message.phone.strip()
    if phone.startswith("0"):
        phone = "213" + phone[1:]  # Algeria country code
    elif not phone.startswith("213"):
        phone = "213" + phone

    url = f"https://graph.facebook.com/v18.0/{settings['phone_number_id']}/messages"

    headers = {
        "Authorization": f"Bearer {settings['access_token']}",
        "Content-Type": "application/json"
    }

    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone,
        "type": "text",
        "text": {"body": message.message}
    }

    try:
        response = await asyncio.to_thread(
            http_requests.post,
            url,
            json=payload,
            headers=headers,
            timeout=20,
        )

        # Log the message
        await db.whatsapp_logs.insert_one({
            "id": str(uuid.uuid4()),
            "phone": phone,
            "message": message.message,
            "status": "sent" if response.status_code == 200 else "failed",
            "response_code": response.status_code,
            "response": response.text[:500] if response.text else None,
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "sent_by": user["id"]
        })

        if response.status_code == 200:
            return {"success": True, "message": "تم إرسال الرسالة"}
        else:
            return {"success": False, "error": response.text}
    except Exception as e:
        logger.error(f"WhatsApp send error: {str(e)}")
        return {"success": False, "error": str(e)}

@router.post("/whatsapp/notify-repair/{repair_id}")
async def notify_repair_status_change(repair_id: str, user: dict = Depends(require_tenant)):
    """Send WhatsApp notification for repair status change"""
    repair = await db.repairs.find_one({"id": repair_id}, {"_id": 0})
    if not repair:
        repair = await db.repairs.find_one({"ticket_number": repair_id}, {"_id": 0})
    if not repair:
        repair = await db.repair_tickets.find_one({"id": repair_id}, {"_id": 0})
    if not repair:
        repair = await db.repair_tickets.find_one({"ticket_number": repair_id}, {"_id": 0})
    if not repair:
        raise HTTPException(status_code=404, detail="طلب الصيانة غير موجود")

    settings = await db.whatsapp_settings.find_one({}, {"_id": 0})
    if not settings or not settings.get("enabled"):
        return {"success": False, "message": "WhatsApp غير مفعل"}

    status = repair.get("status", "received")
    message_template = REPAIR_STATUS_MESSAGES.get(status)

    if not message_template:
        return {"success": False, "message": "قالب الرسالة غير موجود"}

    # Format the message
    message = message_template.format(
        customer_name=repair.get("customer_name", "عميل"),
        device=f"{repair.get('device_brand', '')} {repair.get('device_model', '')}",
        ticket_number=repair.get("ticket_number", repair_id),
        estimated_days=repair.get("estimated_days", 1),
        cost=repair.get("final_cost") or repair.get("estimated_cost", 0)
    )

    # Send the message
    whatsapp_msg = WhatsAppMessage(phone=repair.get("customer_phone", ""), message=message)
    return await send_whatsapp_message_v2(whatsapp_msg, user)

@router.get("/whatsapp/logs")
async def get_whatsapp_logs(
    limit: int = 50,
    user: dict = Depends(require_tenant)
):
    """Get WhatsApp message logs"""
    logs = await db.whatsapp_logs.find({}, {"_id": 0}).sort("sent_at", -1).limit(limit).to_list(limit)
    return logs

# ============ SPARE PARTS - PRODUCTS INTEGRATION ============

@router.get("/spare-parts")
async def get_spare_parts(
    search: str = None,
    user: dict = Depends(require_tenant)
):
    """Get all spare parts"""
    query = {}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"reference": {"$regex": search, "$options": "i"}}
        ]
    parts = await db.spare_parts.find(query, {"_id": 0}).to_list(1000)
    return parts

@router.get("/spare-parts/stats")
async def get_spare_parts_stats(user: dict = Depends(require_tenant)):
    """Get spare parts statistics"""
    total = await db.spare_parts.count_documents({})
    low_stock = await db.spare_parts.count_documents({"quantity": {"$lte": 5}})
    out_of_stock = await db.spare_parts.count_documents({"quantity": 0})
    # p492: tolerate legacy rows with non-numeric quantity/cost (a single
    # garbage row used to 500 the whole stats endpoint)
    def _num(expr):
        return {"$convert": {"input": expr, "to": "double", "onError": 0, "onNull": 0}}
    agg = await db.spare_parts.aggregate([
        {"$group": {"_id": None, "total_value": {"$sum": {"$multiply": [
            _num("$quantity"), _num("$cost_price")]}}}}
    ]).to_list(1)
    return {
        "total_parts": total,
        "low_stock_count": low_stock,
        "out_of_stock_count": out_of_stock,
        "total_inventory_value": agg[0]["total_value"] if agg else 0
    }

@router.get("/spare-parts/{part_id}")
async def get_spare_part(part_id: str, user: dict = Depends(require_tenant)):
    """Get a specific spare part"""
    part = await db.spare_parts.find_one({"id": part_id}, {"_id": 0})
    if not part:
        raise HTTPException(status_code=404, detail="قطعة الغيار غير موجودة")
    return part

def _spare_number(value, field):
    """p492: numeric guard for the legacy spare-parts dict payloads."""
    try:
        f = float(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"قيمة غير صالحة: {field}")
    if f < 0:
        raise HTTPException(status_code=400, detail="القيم السالبة غير مقبولة")
    return f


SPARE_UPDATE_FIELDS = {
    "name", "reference", "category", "quantity", "min_quantity",
    "cost_price", "sell_price", "supplier_id", "notes",
}


@router.post("/spare-parts")
async def create_spare_part(part: dict, user: dict = Depends(_require_perm("repairs.add"))):
    """Create a new spare part"""
    name = str(part.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="اسم القطعة مطلوب")
    quantity = _spare_number(part.get("quantity", 0), "الكمية")
    min_quantity = _spare_number(part.get("min_quantity", 5), "الحد الأدنى")
    cost_price = _spare_number(part.get("cost_price", 0), "سعر الكلفة")
    sell_price = _spare_number(part.get("sell_price", 0), "سعر البيع")
    linked = str(part.get("linked_product_id") or "")
    if linked:
        if not await db.products.find_one({"id": linked}, {"_id": 0, "id": 1}):
            raise HTTPException(status_code=404, detail="المنتج المرتبط غير موجود")
    now = datetime.now(timezone.utc).isoformat()
    part_doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "reference": str(part.get("reference") or ""),
        "category": str(part.get("category") or ""),
        "quantity": quantity,
        "min_quantity": min_quantity,
        "cost_price": cost_price,
        "sell_price": sell_price,
        "supplier_id": str(part.get("supplier_id") or ""),
        "linked_product_id": linked,
        "notes": str(part.get("notes") or ""),
        "created_at": now,
        "updated_at": now
    }
    await db.spare_parts.insert_one(part_doc)
    return {k: v for k, v in part_doc.items() if k != "_id"}

@router.put("/spare-parts/{part_id}")
async def update_spare_part(part_id: str, part: dict, user: dict = Depends(_require_perm("repairs.edit"))):
    """Update a spare part"""
    existing = await db.spare_parts.find_one({"id": part_id})
    if not existing:
        raise HTTPException(status_code=404, detail="قطعة الغيار غير موجودة")
    # p492: whitelist + numeric guards — arbitrary $set used to allow mass
    # assignment of created_at/linked_product_id and negative quantities
    update_data = {k: v for k, v in part.items() if k in SPARE_UPDATE_FIELDS}
    if "name" in update_data:
        update_data["name"] = str(update_data["name"] or "").strip()
        if not update_data["name"]:
            raise HTTPException(status_code=400, detail="اسم القطعة مطلوب")
    for field, label in (("quantity", "الكمية"), ("min_quantity", "الحد الأدنى"),
                         ("cost_price", "سعر الكلفة"), ("sell_price", "سعر البيع")):
        if field in update_data:
            update_data[field] = _spare_number(update_data[field], label)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.spare_parts.update_one({"id": part_id}, {"$set": update_data})
    updated = await db.spare_parts.find_one({"id": part_id}, {"_id": 0})
    return updated

@router.delete("/spare-parts/{part_id}")
async def delete_spare_part(part_id: str, user: dict = Depends(_require_perm("repairs.delete"))):
    """Delete a spare part"""
    result = await db.spare_parts.delete_one({"id": part_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="قطعة الغيار غير موجودة")
    return {"success": True, "message": "تم حذف قطعة الغيار"}

@router.post("/spare-parts/use-in-repair")
async def use_spare_part_in_repair(
    repair_id: str,
    part_id: str,
    quantity: int = 1,
    user: dict = Depends(_require_perm("repairs.edit"))
):
    """Use a spare part in a repair - deducts from inventory"""
    from pymongo.errors import PyMongoError
    if not isinstance(quantity, int) or quantity < 1:
        raise HTTPException(status_code=400, detail="الكمية غير صالحة")
    # Verify repair exists
    repair = await db.repairs.find_one({"id": repair_id}, {"_id": 0})
    if not repair:
        raise HTTPException(status_code=404, detail="طلب الصيانة غير موجود")

    # Verify spare part exists
    part = await db.spare_parts.find_one({"id": part_id}, {"_id": 0})
    if not part:
        raise HTTPException(status_code=404, detail="قطعة الغيار غير موجودة")

    now = datetime.now(timezone.utc).isoformat()
    usage_record = {
        "part_id": part_id,
        "part_name": part.get("name"),
        "quantity": quantity,
        "unit_price": part.get("sell_price", 0),
        "total_price": part.get("sell_price", 0) * quantity,
        "used_at": now,
        "used_by": user["name"]
    }

    # p492: read-then-set raced (oversell) and a negative quantity INCREASED
    # stock. Atomic $gte claims for the spare part AND its linked product in
    # one transaction — any insufficiency aborts the whole operation.
    from config.database import client as _client
    new_qty = None
    for _attempt in range(5):
        try:
            async with await _client.start_session() as _tx:
                async with _tx.start_transaction():
                    claimed = await db.spare_parts.find_one_and_update(
                        {"id": part_id, "quantity": {"$gte": quantity}},
                        {"$inc": {"quantity": -quantity},
                         "$set": {"updated_at": now}},
                        session=_tx)
                    if not claimed:
                        raise HTTPException(
                            status_code=400, detail="الكمية غير كافية في المخزون")
                    new_qty = float(claimed.get("quantity", 0)) - quantity
                    if part.get("linked_product_id"):
                        linked = await db.products.find_one_and_update(
                            {"id": part["linked_product_id"],
                             "quantity": {"$gte": quantity}},
                            {"$inc": {"quantity": -quantity}},
                            session=_tx)
                        if not linked:
                            raise HTTPException(
                                status_code=400,
                                detail="الكمية غير كافية في المخزون المرتبط")
                    await db.repairs.update_one(
                        {"id": repair_id},
                        {"$push": {"parts_used": usage_record},
                         "$inc": {"parts_cost": usage_record["total_price"]}},
                        session=_tx)
            break
        except HTTPException:
            raise
        except PyMongoError:
            if _attempt == 4:
                raise HTTPException(status_code=500, detail="خطأ في قاعدة البيانات")
            continue

    return {
        "success": True,
        "message": f"تم استخدام {quantity} من {part['name']}",
        "remaining_stock": new_qty,
        "total_cost": usage_record["total_price"]
    }

@router.post("/spare-parts/link-to-product")
async def link_spare_part_to_product(
    part_id: str,
    product_id: str,
    user: dict = Depends(_require_perm("repairs.edit"))
):
    """Link a spare part to a main product for synchronized inventory"""
    # Verify both exist
    part = await db.spare_parts.find_one({"id": part_id}, {"_id": 0})
    if not part:
        raise HTTPException(status_code=404, detail="قطعة الغيار غير موجودة")

    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")

    # Link them
    await db.spare_parts.update_one(
        {"id": part_id},
        {"$set": {
            "linked_product_id": product_id,
            "linked_product_name": product.get("name"),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )

    return {
        "success": True,
        "message": f"تم ربط {part['name']} بالمنتج {product['name']}"
    }

@router.delete("/spare-parts/unlink-product/{part_id}")
async def unlink_spare_part_from_product(
    part_id: str,
    user: dict = Depends(_require_perm("repairs.edit"))
):
    """Remove link between spare part and product"""
    part = await db.spare_parts.find_one({"id": part_id}, {"_id": 0})
    if not part:
        raise HTTPException(status_code=404, detail="قطعة الغيار غير موجودة")

    await db.spare_parts.update_one(
        {"id": part_id},
        {"$unset": {"linked_product_id": "", "linked_product_name": ""}}
    )

    return {"success": True, "message": "تم إلغاء الربط"}

@router.post("/spare-parts/sync-inventory")
async def sync_spare_parts_with_products(user: dict = Depends(_require_perm("repairs.edit"))):
    """Sync spare parts inventory with linked products"""
    # Get all linked spare parts (p492: skip empty/unset links)
    linked_parts = await db.spare_parts.find(
        {"linked_product_id": {"$exists": True, "$nin": ["", None]}},
        {"_id": 0}
    ).to_list(1000)

    synced = 0
    for part in linked_parts:
        product = await db.products.find_one(
            {"id": part["linked_product_id"]},
            {"_id": 0, "quantity": 1}
        )
        if product:
            # Update spare part quantity to match product
            await db.spare_parts.update_one(
                {"id": part["id"]},
                {"$set": {"quantity": product.get("quantity", 0)}}
            )
            synced += 1

    return {"success": True, "synced_count": synced}
