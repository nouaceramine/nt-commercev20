"""
Families Permissions Routes
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Literal
from datetime import datetime, timezone, timedelta
from pathlib import Path
import uuid
import os
import logging
import requests as http_requests

from config.database import db
from utils.auth import get_current_user as require_tenant, get_tenant_admin, get_admin_user
from models.schemas import (
    DEFAULT_PERMISSIONS, ROLE_DESCRIPTIONS, PERMISSION_CATEGORIES,
    ProductFamilyCreate, ProductFamilyUpdate, ProductFamilyResponse, ProductResponse
)

logger = logging.getLogger(__name__)

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "static" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

router = APIRouter()

# ============ ADVANCED ROLES AND PERMISSIONS ============

@router.get("/permissions/roles")
async def get_all_roles():
    """Get all available roles with their default permissions and descriptions"""
    return {
        "roles": list(DEFAULT_PERMISSIONS.keys()),
        "default_permissions": DEFAULT_PERMISSIONS,
        "role_descriptions": ROLE_DESCRIPTIONS,
        "permission_categories": PERMISSION_CATEGORIES
    }

@router.get("/permissions/categories")
async def get_permission_categories():
    """Get permission categories for UI grouping"""
    return PERMISSION_CATEGORIES

@router.get("/permissions/role/{role_name}")
async def get_role_permissions(role_name: str):
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

    # Save file
    try:
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        # Return URL (relative to static)
        return {"url": f"/api/static/uploads/{unique_filename}", "filename": unique_filename}
    except Exception as e:
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
    update_type: Literal["percentage", "fixed", "set"]  # نسبة مئوية، مبلغ ثابت، تحديد قيمة
    price_field: Literal["purchase_price", "wholesale_price", "retail_price", "all"]
    value: float
    round_to: int = 0  # Round to nearest (0 = no rounding, 10 = nearest 10, etc.)

@router.post("/products/bulk-price-update")
async def bulk_price_update(request: BulkPriceUpdateRequest, admin: dict = Depends(get_tenant_admin)):
    """Update prices for multiple products at once"""

    # Build query
    query = {}
    if request.product_ids:
        query["id"] = {"$in": request.product_ids}
    if request.family_id:
        query["family_id"] = request.family_id

    # Get products
    products = await db.products.find(query, {"_id": 0}).to_list(10000)

    if not products:
        return {"success": False, "message": "No products found", "updated_count": 0}

    price_fields = ["purchase_price", "wholesale_price", "retail_price"] if request.price_field == "all" else [request.price_field]

    updated_count = 0
    updates_log = []

    for product in products:
        update_data = {}

        for field in price_fields:
            old_price = product.get(field, 0)
            new_price = old_price

            if request.update_type == "percentage":
                # Increase/decrease by percentage
                new_price = old_price * (1 + request.value / 100)
            elif request.update_type == "fixed":
                # Add/subtract fixed amount
                new_price = old_price + request.value
            elif request.update_type == "set":
                # Set to specific value
                new_price = request.value

            # Round if needed
            if request.round_to > 0:
                new_price = round(new_price / request.round_to) * request.round_to

            # Ensure price is not negative
            new_price = max(0, new_price)

            update_data[field] = new_price

        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

        await db.products.update_one({"id": product["id"]}, {"$set": update_data})
        updated_count += 1

        updates_log.append({
            "product_id": product["id"],
            "product_name": product.get("name_ar", product.get("name_en", "")),
            "old_prices": {f: product.get(f, 0) for f in price_fields},
            "new_prices": {f: update_data[f] for f in price_fields}
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
    update_type: str,
    price_field: str,
    value: float,
    family_id: Optional[str] = None,
    round_to: int = 0,
    admin: dict = Depends(get_tenant_admin)
):
    """Preview price changes before applying"""
    query = {}
    if family_id:
        query["family_id"] = family_id

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
            new_price = old_price

            if update_type == "percentage":
                new_price = old_price * (1 + value / 100)
            elif update_type == "fixed":
                new_price = old_price + value
            elif update_type == "set":
                new_price = value

            if round_to > 0:
                new_price = round(new_price / round_to) * round_to

            new_price = max(0, new_price)

            preview["changes"][field] = {
                "old": old_price,
                "new": new_price,
                "diff": new_price - old_price
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

    # Get parent name if exists
    parent_name = ""
    if family.parent_id:
        parent = await db.product_families.find_one({"id": family.parent_id}, {"_id": 0, "name_ar": 1})
        if parent:
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
        "created_at": now
    }
    await db.product_families.insert_one(family_doc)
    return ProductFamilyResponse(**family_doc)

@router.get("/product-families", response_model=List[ProductFamilyResponse])
async def get_product_families(user: dict = Depends(require_tenant)):
    families = await db.product_families.find({}, {"_id": 0}).to_list(1000)

    # Update product counts
    for family in families:
        count = await db.products.count_documents({"family_id": family["id"]})
        family["product_count"] = count

    return [ProductFamilyResponse(**f) for f in families]

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

    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}

    # Update parent name if parent_id changed
    if "parent_id" in update_data and update_data["parent_id"]:
        parent = await db.product_families.find_one({"id": update_data["parent_id"]}, {"_id": 0, "name_ar": 1})
        update_data["parent_name"] = parent["name_ar"] if parent else ""
    elif "parent_id" in update_data and not update_data["parent_id"]:
        update_data["parent_name"] = ""

    if update_data:
        await db.product_families.update_one({"id": family_id}, {"$set": update_data})

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
            family = await db.product_families.find_one({"id": product["family_id"]}, {"_id": 0, "name_ar": 1})
            product["family_name"] = family["name_ar"] if family else ""
        else:
            product["family_name"] = ""

    return [ProductResponse(**p) for p in products]

# ============ CUSTOMER & SUPPLIER FAMILIES ============

class CustomerFamilyCreate(BaseModel):
    name: str
    description: Optional[str] = ""

class CustomerFamilyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class CustomerFamilyResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: str
    customer_count: int = 0
    created_at: str

class SupplierFamilyCreate(BaseModel):
    name: str
    description: Optional[str] = ""

class SupplierFamilyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class SupplierFamilyResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: str
    supplier_count: int = 0
    created_at: str

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
    settings = await db.whatsapp_settings.find_one({}, {"_id": 0})
    if not settings or not settings.get("enabled"):
        raise HTTPException(status_code=400, detail="WhatsApp غير مفعل")

    if not settings.get("access_token") or not settings.get("phone_number_id"):
        raise HTTPException(status_code=400, detail="إعدادات WhatsApp غير مكتملة")

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
        response = http_requests.post(url, json=payload, headers=headers)

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
    return await send_whatsapp_message(whatsapp_msg, user)

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
    agg = await db.spare_parts.aggregate([
        {"$group": {"_id": None, "total_value": {"$sum": {"$multiply": ["$quantity", "$cost_price"]}}}}
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

@router.post("/spare-parts")
async def create_spare_part(part: dict, user: dict = Depends(require_tenant)):
    """Create a new spare part"""
    now = datetime.now(timezone.utc).isoformat()
    part_doc = {
        "id": str(uuid.uuid4()),
        "name": part.get("name", ""),
        "reference": part.get("reference", ""),
        "category": part.get("category", ""),
        "quantity": part.get("quantity", 0),
        "min_quantity": part.get("min_quantity", 5),
        "cost_price": part.get("cost_price", 0),
        "sell_price": part.get("sell_price", 0),
        "supplier_id": part.get("supplier_id", ""),
        "linked_product_id": part.get("linked_product_id", ""),
        "notes": part.get("notes", ""),
        "created_at": now,
        "updated_at": now
    }
    await db.spare_parts.insert_one(part_doc)
    return {k: v for k, v in part_doc.items() if k != "_id"}

@router.put("/spare-parts/{part_id}")
async def update_spare_part(part_id: str, part: dict, user: dict = Depends(require_tenant)):
    """Update a spare part"""
    existing = await db.spare_parts.find_one({"id": part_id})
    if not existing:
        raise HTTPException(status_code=404, detail="قطعة الغيار غير موجودة")
    update_data = {k: v for k, v in part.items() if k not in ["id", "_id"]}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.spare_parts.update_one({"id": part_id}, {"$set": update_data})
    updated = await db.spare_parts.find_one({"id": part_id}, {"_id": 0})
    return updated

@router.delete("/spare-parts/{part_id}")
async def delete_spare_part(part_id: str, user: dict = Depends(require_tenant)):
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
    user: dict = Depends(require_tenant)
):
    """Use a spare part in a repair - deducts from inventory"""
    # Verify repair exists
    repair = await db.repairs.find_one({"id": repair_id}, {"_id": 0})
    if not repair:
        raise HTTPException(status_code=404, detail="طلب الصيانة غير موجود")

    # Verify spare part exists and has enough stock
    part = await db.spare_parts.find_one({"id": part_id}, {"_id": 0})
    if not part:
        raise HTTPException(status_code=404, detail="قطعة الغيار غير موجودة")

    if part.get("quantity", 0) < quantity:
        raise HTTPException(status_code=400, detail="الكمية غير كافية في المخزون")

    # Deduct from spare parts inventory
    new_qty = part["quantity"] - quantity
    await db.spare_parts.update_one(
        {"id": part_id},
        {"$set": {"quantity": new_qty, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    # Record the usage in repair
    usage_record = {
        "part_id": part_id,
        "part_name": part.get("name"),
        "quantity": quantity,
        "unit_price": part.get("sell_price", 0),
        "total_price": part.get("sell_price", 0) * quantity,
        "used_at": datetime.now(timezone.utc).isoformat(),
        "used_by": user["name"]
    }

    await db.repairs.update_one(
        {"id": repair_id},
        {
            "$push": {"parts_used": usage_record},
            "$inc": {"parts_cost": usage_record["total_price"]}
        }
    )

    # Also check if there's a linked product in main inventory
    if part.get("linked_product_id"):
        await db.products.update_one(
            {"id": part["linked_product_id"]},
            {"$inc": {"quantity": -quantity}}
        )

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
    user: dict = Depends(require_tenant)
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
    user: dict = Depends(require_tenant)
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
async def sync_spare_parts_with_products(user: dict = Depends(require_tenant)):
    """Sync spare parts inventory with linked products"""
    # Get all linked spare parts
    linked_parts = await db.spare_parts.find(
        {"linked_product_id": {"$exists": True}},
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
