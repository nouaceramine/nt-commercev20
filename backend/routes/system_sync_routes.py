"""
System Sync Routes
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Literal
from datetime import datetime, timezone, timedelta
import uuid
import os
import logging
import json

from config.database import db, main_db, client
from utils.auth import get_current_user, get_tenant_admin, get_super_admin
from utils.auth import get_current_user as require_tenant

logger = logging.getLogger(__name__)
app_logger = logger

router = APIRouter()

# ============ HEALTH CHECK ============

@router.get("/")
async def root():
    return {"message": "NT API is running"}

@router.get("/health")
async def health():
    return {"status": "healthy"}

# ============ FEATURES MANAGEMENT ============

@router.get("/settings/features")
async def get_features_settings(admin: dict = Depends(get_tenant_admin)):
    """Get enabled/disabled features for the system"""
    settings = await db.settings.find_one({"key": "features"}, {"_id": 0})
    if settings:
        return settings.get("value", {})

    # Return default features
    return {
        "sales": {"enabled": True, "subFeatures": {"pos": True, "invoices": True, "quotes": True, "returns": True, "discounts": True, "price_types": True}},
        "inventory": {"enabled": True, "subFeatures": {"products": True, "categories": True, "stock_alerts": True, "barcode": True, "warehouses": False, "stock_transfer": False, "inventory_count": True}},
        "purchases": {"enabled": True, "subFeatures": {"purchase_orders": True, "suppliers": True, "supplier_payments": True, "purchase_returns": False}},
        "customers": {"enabled": True, "subFeatures": {"customer_list": True, "customer_debts": True, "customer_families": True, "blacklist": True, "debt_reminders": True}},
        "employees": {"enabled": True, "subFeatures": {"employee_list": True, "attendance": True, "salaries": True, "commissions": True, "advances": True, "employee_accounts": True}},
        "reports": {"enabled": True, "subFeatures": {"sales_reports": True, "inventory_reports": True, "financial_reports": True, "customer_reports": True, "smart_reports": False, "export_reports": True}},
        "expenses": {"enabled": True, "subFeatures": {"expense_tracking": True, "expense_categories": True, "recurring_expenses": False}},
        "repairs": {"enabled": True, "subFeatures": {"repair_tickets": True, "repair_status": True, "repair_invoice": True}},
        "delivery": {"enabled": True, "subFeatures": {"delivery_tracking": True, "shipping_companies": True, "delivery_fees": True, "yalidine_integration": False}},
        "ecommerce": {"enabled": False, "subFeatures": {"woocommerce": False, "product_sync": False, "order_sync": False}},
        "loyalty": {"enabled": False, "subFeatures": {"loyalty_points": False, "coupons": False, "promotions": True}},
        "notifications": {"enabled": True, "subFeatures": {"push_notifications": True, "email_notifications": False, "sms_notifications": False, "whatsapp_notifications": False}},
        "services": {"enabled": False, "subFeatures": {"flexy_recharge": False, "bill_payment": False}},
        "finance": {"enabled": True, "subFeatures": {"cash_management": True, "banking": True, "currencies": True, "payments": True, "debts": True}},
        "accounting": {"enabled": True, "subFeatures": {"accounting_journal": True, "tax_management": True, "invoices": True}},
        "wallet": {"enabled": True, "subFeatures": {"wallet_balance": True, "wallet_transactions": True, "wallet_transfer": True}},
        "ai": {"enabled": True, "subFeatures": {"ai_accountant": True, "ai_agents": True, "robots": False, "smart_dashboard": True}},
        "tasks": {"enabled": True, "subFeatures": {"task_management": True, "internal_chat": True}},
        "online_store": {"enabled": False, "subFeatures": {"storefront": False, "online_orders": False}},
        "security": {"enabled": True, "subFeatures": {"two_factor": False, "api_keys": False, "security_logs": True}},
        "data_management": {"enabled": True, "subFeatures": {"import_export": True, "backup": True, "database_tools": False}},
        "settings_branding": {"enabled": True, "subFeatures": {"printing": True, "branding": True, "datetime_locale": True}}
    }

@router.put("/settings/features")
async def put_features_settings(features: dict, admin: dict = Depends(get_tenant_admin)):
    """PUT alias for saving features settings"""
    if admin.get("role") not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Only admins can change features")
    await db.settings.update_one(
        {"key": "features"},
        {"$set": {"key": "features", "value": features, "updated_by": admin["id"], "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {"message": "Features saved successfully"}

@router.post("/settings/features")
async def save_features_settings(features: dict, admin: dict = Depends(get_tenant_admin)):
    """Save features settings - Super Admin only applies to all sub-accounts"""
    if admin.get("role") not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Only admins can change features")

    await db.settings.update_one(
        {"key": "features"},
        {"$set": {"key": "features", "value": features, "updated_by": admin["id"], "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {"message": "Features saved successfully"}

# ============ USER PERMISSIONS MANAGEMENT ============

@router.put("/users/{user_id}/permissions", operation_id="update_user_permissions_sync")
async def update_user_permissions_sync(user_id: str, data: dict, admin: dict = Depends(get_tenant_admin)):
    """Update specific user permissions"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Only super_admin can modify super_admin permissions
    if user.get("role") == "super_admin" and admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Only super admin can modify super admin permissions")

    await db.users.update_one(
        {"id": user_id},
        {"$set": {"permissions": data.get("permissions", {}), "permissions_updated_at": datetime.now(timezone.utc).isoformat(), "permissions_updated_by": admin["id"]}}
    )

    return {"message": "Permissions updated successfully"}

@router.post("/sales/{sale_id}/log-action")
async def log_sale_action(
    sale_id: str,
    action: str,
    details: dict = None,
    user: dict = Depends(require_tenant)
):
    """Log an action on a sale"""
    if details is None:
        details = {}
    log = {
        "id": str(uuid.uuid4()),
        "sale_id": sale_id,
        "action": action,
        "details": details,
        "user_id": user["id"],
        "user_name": user.get("name", user.get("email", "")),
        "user_role": user.get("role", ""),
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    await db.sale_audit_logs.insert_one(log)
    return {"message": "Action logged", "log_id": log["id"]}

@router.get("/settings/sales-permissions")
async def get_sales_permissions(admin: dict = Depends(get_tenant_admin)):
    """Get sales permission settings"""
    settings = await db.settings.find_one({"key": "sales_permissions"}, {"_id": 0})
    if settings:
        return settings.get("value", {})
    return {
        "allow_employee_edit": False,
        "allow_employee_delete": False,
        "allow_discount_without_approval": True,
        "max_discount_percent": 50.0,
        "max_debt_per_customer": 100000.0,
        "min_sale_price_percent": 80.0
    }

@router.post("/settings/sales-permissions")
async def update_sales_permissions(
    settings: dict,
    admin: dict = Depends(get_tenant_admin)
):
    """Update sales permission settings"""
    await db.settings.update_one(
        {"key": "sales_permissions"},
        {"$set": {"key": "sales_permissions", "value": settings}},
        upsert=True
    )
    return {"message": "Settings updated"}

# ============ RECEIPT SETTINGS ============

class ReceiptTemplate(BaseModel):
    id: str = ""
    name: str
    name_ar: str
    width: str = "80mm"  # 58mm, 80mm, A4
    show_logo: bool = True
    show_header: bool = True
    show_footer: bool = True
    header_text: str = ""
    footer_text: str = ""
    font_size: str = "normal"  # small, normal, large
    is_default: bool = False

class ReceiptSettings(BaseModel):
    auto_print: bool = False
    show_print_dialog: bool = True
    default_template_id: str = ""
    templates: List[dict] = []

@router.get("/settings/receipt")
async def get_receipt_settings(user: dict = Depends(require_tenant)):
    """Get receipt/invoice settings"""
    settings = await db.settings.find_one({"key": "receipt_settings"}, {"_id": 0})
    if settings:
        return settings.get("value", {})
    # Default settings
    return {
        "auto_print": False,
        "show_print_dialog": True,
        "default_template_id": "default_80mm",
        "templates": [
            {
                "id": "default_58mm",
                "name": "Thermal 58mm",
                "name_ar": "حراري 58 مم",
                "width": "58mm",
                "show_logo": False,
                "show_header": True,
                "show_footer": True,
                "header_text": "",
                "footer_text": "شكراً لزيارتكم",
                "font_size": "small",
                "is_default": False
            },
            {
                "id": "default_80mm",
                "name": "Thermal 80mm",
                "name_ar": "حراري 80 مم",
                "width": "80mm",
                "show_logo": True,
                "show_header": True,
                "show_footer": True,
                "header_text": "",
                "footer_text": "شكراً لزيارتكم",
                "font_size": "normal",
                "is_default": True
            },
            {
                "id": "default_a4",
                "name": "A4 Full Page",
                "name_ar": "صفحة A4 كاملة",
                "width": "A4",
                "show_logo": True,
                "show_header": True,
                "show_footer": True,
                "header_text": "",
                "footer_text": "شكراً لزيارتكم",
                "font_size": "normal",
                "is_default": False
            }
        ]
    }

@router.post("/settings/receipt")
async def update_receipt_settings(settings: dict, admin: dict = Depends(get_tenant_admin)):
    """Update receipt settings"""
    await db.settings.update_one(
        {"key": "receipt_settings"},
        {"$set": {"key": "receipt_settings", "value": settings}},
        upsert=True
    )
    return {"message": "Settings updated"}

# ============ TENANT BRANDING (sidebar logo + name) ============

@router.get("/settings/tenant-branding")
async def get_tenant_branding(user: dict = Depends(require_tenant)):
    """Get the tenant's sidebar branding (logo + display name). Falls back to company name."""
    doc = await db.settings.find_one({"key": "tenant_branding"}, {"_id": 0})
    value = (doc or {}).get("value", {}) if doc else {}
    return {
        "name": value.get("name", "") or user.get("company_name", "") or "",
        "logo_url": value.get("logo_url", ""),
    }

@router.post("/settings/tenant-branding")
async def update_tenant_branding(data: dict, admin: dict = Depends(get_tenant_admin)):
    """Update the tenant's sidebar branding (logo + display name)."""
    value = {
        "name": (data.get("name") or "").strip(),
        "logo_url": data.get("logo_url") or "",
    }
    await db.settings.update_one(
        {"key": "tenant_branding"},
        {"$set": {"key": "tenant_branding", "value": value}},
        upsert=True
    )
    return {"message": "Branding updated", **value}

@router.get("/sales/product-tracking/{product_id}")
async def get_product_sales_tracking(
    product_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict = Depends(require_tenant)
):
    """Track all sales for a specific product"""
    query = {"status": {"$ne": "returned"}}

    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        if "created_at" in query:
            query["created_at"]["$lte"] = end_date + "T23:59:59"
        else:
            query["created_at"] = {"$lte": end_date + "T23:59:59"}

    all_sales = await db.sales.find(query, {"_id": 0}).to_list(10000)

    # Filter sales containing this product
    product_sales = []
    total_quantity = 0
    total_revenue = 0
    total_profit = 0

    for sale in all_sales:
        for item in sale.get("items", []):
            if item.get("product_id") == product_id:
                product_sales.append({
                    "sale_id": sale["id"],
                    "date": sale["created_at"],
                    "customer": sale.get("customer_name", "زبون عابر"),
                    "employee": sale.get("employee_name", ""),
                    "quantity": item.get("quantity", 1),
                    "unit_price": item.get("unit_price", 0),
                    "total": item.get("total", 0),
                    "payment_method": sale.get("payment_method", "cash")
                })
                total_quantity += item.get("quantity", 1)
                total_revenue += item.get("total", 0)
                purchase_price = item.get("purchase_price", item.get("unit_price", 0) * 0.7)
                total_profit += (item.get("unit_price", 0) - purchase_price) * item.get("quantity", 1)

    # Get product info
    product = await db.products.find_one({"id": product_id}, {"_id": 0})

    return {
        "product": product,
        "sales": product_sales,
        "statistics": {
            "total_sales": len(product_sales),
            "total_quantity": total_quantity,
            "total_revenue": total_revenue,
            "total_profit": total_profit,
            "average_price": total_revenue / total_quantity if total_quantity > 0 else 0
        }
    }


# ============ SYSTEM UPDATES (Super Admin Only) ============

class AnnouncementCreate(BaseModel):
    title_ar: str
    title_fr: str = ""
    message_ar: str
    message_fr: str = ""
    type: str = "info"  # info, feature, maintenance, warning, promotion
    priority: str = "normal"  # low, normal, high, urgent
    target: str = "all"  # all, active

class SettingsPush(BaseModel):
    settings: List[str]

@router.get("/system-updates/stats")
async def get_system_stats(admin: dict = Depends(get_super_admin)):
    """Get system statistics for super admin"""
    total_tenants = await db.saas_tenants.count_documents({})
    active_tenants = await db.saas_tenants.count_documents({"status": "active"})
    total_announcements = await db.system_announcements.count_documents({})

    return {
        "total_tenants": total_tenants,
        "active_tenants": active_tenants,
        "total_announcements": total_announcements
    }

@router.get("/system-updates/announcements")
async def get_announcements(admin: dict = Depends(get_super_admin)):
    """Get all system announcements"""
    announcements = await db.system_announcements.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return announcements

@router.post("/system-updates/announcements")
async def create_announcement(data: AnnouncementCreate, admin: dict = Depends(get_super_admin)):
    """Create and broadcast a new announcement"""
    now = datetime.now(timezone.utc).isoformat()
    announcement_id = str(uuid.uuid4())

    announcement = {
        "id": announcement_id,
        "title_ar": data.title_ar,
        "title_fr": data.title_fr,
        "message_ar": data.message_ar,
        "message_fr": data.message_fr,
        "type": data.type,
        "priority": data.priority,
        "target": data.target,
        "created_by": admin["id"],
        "created_at": now,
        "read_count": 0
    }

    await db.system_announcements.insert_one(announcement)

    # Create notifications for all users
    query = {}
    if data.target == "active":
        # Get active tenant IDs
        active_tenants = await db.saas_tenants.find({"status": "active"}, {"id": 1}).to_list(1000)
        tenant_ids = [t["id"] for t in active_tenants]
        query = {"tenant_id": {"$in": tenant_ids}}

    users = await db.users.find(query, {"id": 1}).to_list(10000)

    notifications = []
    for user in users:
        notifications.append({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "type": f"system_{data.type}",
            "title": data.title_ar,
            "title_ar": data.title_ar,
            "title_fr": data.title_fr,
            "message": data.message_ar,
            "message_ar": data.message_ar,
            "message_fr": data.message_fr,
            "priority": data.priority,
            "announcement_id": announcement_id,
            "read": False,
            "created_at": now
        })

    if notifications:
        await db.notifications.insert_many(notifications)

    return {"message": "Announcement created and sent", "id": announcement_id, "recipients": len(notifications)}

@router.delete("/system-updates/announcements/{announcement_id}")
async def delete_announcement(announcement_id: str, admin: dict = Depends(get_super_admin)):
    """Delete an announcement"""
    result = await db.system_announcements.delete_one({"id": announcement_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Announcement not found")

    # Also delete related notifications
    await db.notifications.delete_many({"announcement_id": announcement_id})

    return {"message": "Announcement deleted"}

@router.post("/system-updates/push-settings")
async def push_settings(data: SettingsPush, admin: dict = Depends(get_super_admin)):
    """Push settings to all tenants"""
    now = datetime.now(timezone.utc).isoformat()

    # Get current admin settings as template
    admin_settings = {}

    for setting_type in data.settings:
        if setting_type == "receipt_settings":
            settings = await db.settings.find_one({"type": "receipt"}, {"_id": 0})
            if settings:
                admin_settings["receipt"] = settings
        elif setting_type == "notification_settings":
            settings = await db.notification_settings.find_one({}, {"_id": 0})
            if settings:
                admin_settings["notifications"] = settings
        elif setting_type == "loyalty_settings":
            settings = await db.loyalty_settings.find_one({}, {"_id": 0})
            if settings:
                admin_settings["loyalty"] = settings
        elif setting_type == "pos_settings":
            settings = await db.settings.find_one({"type": "pos"}, {"_id": 0})
            if settings:
                admin_settings["pos"] = settings

    # Get all active tenants
    tenants = await db.saas_tenants.find({"status": "active"}, {"database_name": 1}).to_list(1000)

    updated_count = 0
    for tenant in tenants:
        try:
            tenant_db = client[tenant["database_name"]]
            for key, value in admin_settings.items():
                if key == "receipt":
                    await tenant_db.settings.update_one(
                        {"type": "receipt"}, 
                        {"$set": value}, 
                        upsert=True
                    )
                elif key == "notifications":
                    await tenant_db.notification_settings.update_one(
                        {}, 
                        {"$set": value}, 
                        upsert=True
                    )
                elif key == "loyalty":
                    await tenant_db.loyalty_settings.update_one(
                        {}, 
                        {"$set": value}, 
                        upsert=True
                    )
                elif key == "pos":
                    await tenant_db.settings.update_one(
                        {"type": "pos"}, 
                        {"$set": value}, 
                        upsert=True
                    )
            updated_count += 1
        except Exception as e:
            print(f"Error updating tenant {tenant.get('database_name')}: {e}")

    # Log the action
    await db.system_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "push_settings",
        "settings": data.settings,
        "updated_tenants": updated_count,
        "admin_id": admin["id"],
        "created_at": now
    })

    return {"message": f"Settings pushed to {updated_count} tenants", "updated_count": updated_count}

# ============ REAL-TIME SYNC SYSTEM ============

class SyncConfigCreate(BaseModel):
    name: str
    sync_types: List[str]  # receipt, notifications, loyalty, pos, products, families, theme
    target: str = "all"  # all, active, selected
    selected_tenants: List[str] = []
    auto_sync: bool = False
    locked: bool = False  # If true, tenants cannot modify

class SyncAction(BaseModel):
    sync_types: List[str]
    target: str = "all"
    selected_tenants: List[str] = []

@router.get("/sync/configs")
async def get_sync_configs(admin: dict = Depends(get_super_admin)):
    """Get all sync configurations"""
    configs = await db.sync_configs.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return configs

@router.post("/sync/configs")
async def create_sync_config(data: SyncConfigCreate, admin: dict = Depends(get_super_admin)):
    """Create a new sync configuration"""
    now = datetime.now(timezone.utc).isoformat()
    config = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "sync_types": data.sync_types,
        "target": data.target,
        "selected_tenants": data.selected_tenants,
        "auto_sync": data.auto_sync,
        "locked": data.locked,
        "created_by": admin["id"],
        "created_at": now,
        "last_sync": None
    }
    await db.sync_configs.insert_one(config)
    return config

@router.delete("/sync/configs/{config_id}")
async def delete_sync_config(config_id: str, admin: dict = Depends(get_super_admin)):
    """Delete a sync configuration"""
    result = await db.sync_configs.delete_one({"id": config_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Config not found")
    return {"message": "Config deleted"}

@router.post("/sync/execute")
async def execute_sync(data: SyncAction, admin: dict = Depends(get_super_admin)):
    """Execute sync to tenants"""
    now = datetime.now(timezone.utc).isoformat()
    sync_id = str(uuid.uuid4())

    # Get tenants to sync
    if data.target == "selected" and data.selected_tenants:
        tenants = await db.saas_tenants.find(
            {"id": {"$in": data.selected_tenants}}, 
            {"id": 1, "name": 1, "database_name": 1}
        ).to_list(1000)
    elif data.target == "active":
        tenants = await db.saas_tenants.find(
            {"status": "active"}, 
            {"id": 1, "name": 1, "database_name": 1}
        ).to_list(1000)
    else:
        tenants = await db.saas_tenants.find(
            {}, {"id": 1, "name": 1, "database_name": 1}
        ).to_list(1000)

    # Collect data to sync
    sync_data = {}
    sync_labels = {
        "receipt": "إعدادات الإيصال",
        "notifications": "إعدادات الإشعارات",
        "loyalty": "إعدادات الولاء",
        "pos": "إعدادات نقطة البيع",
        "products": "المنتجات",
        "families": "عائلات المنتجات",
        "theme": "تصميم الواجهة"
    }

    for sync_type in data.sync_types:
        if sync_type == "receipt":
            settings = await db.settings.find_one({"type": "receipt"}, {"_id": 0})
            if settings: sync_data["receipt"] = settings
        elif sync_type == "notifications":
            settings = await db.notification_settings.find_one({}, {"_id": 0})
            if settings: sync_data["notifications"] = settings
        elif sync_type == "loyalty":
            settings = await db.loyalty_settings.find_one({}, {"_id": 0})
            if settings: sync_data["loyalty"] = settings
        elif sync_type == "pos":
            settings = await db.settings.find_one({"type": "pos"}, {"_id": 0})
            if settings: sync_data["pos"] = settings
        elif sync_type == "products":
            products = await db.products.find({}, {"_id": 0}).to_list(10000)
            sync_data["products"] = products
        elif sync_type == "families":
            families = await db.product_families.find({}, {"_id": 0}).to_list(1000)
            sync_data["families"] = families
        elif sync_type == "theme":
            theme = await db.settings.find_one({"type": "theme"}, {"_id": 0})
            if theme: sync_data["theme"] = theme

    # Execute sync
    success_count = 0
    failed_tenants = []

    for tenant in tenants:
        try:
            tenant_db = client[tenant["database_name"]]

            for key, value in sync_data.items():
                if key == "receipt":
                    await tenant_db.settings.update_one({"type": "receipt"}, {"$set": value}, upsert=True)
                elif key == "notifications":
                    await tenant_db.notification_settings.update_one({}, {"$set": value}, upsert=True)
                elif key == "loyalty":
                    await tenant_db.loyalty_settings.update_one({}, {"$set": value}, upsert=True)
                elif key == "pos":
                    await tenant_db.settings.update_one({"type": "pos"}, {"$set": value}, upsert=True)
                elif key == "products":
                    if value:
                        await tenant_db.products.delete_many({})
                        await tenant_db.products.insert_many(value)
                elif key == "families":
                    if value:
                        await tenant_db.product_families.delete_many({})
                        await tenant_db.product_families.insert_many(value)
                elif key == "theme":
                    await tenant_db.settings.update_one({"type": "theme"}, {"$set": value}, upsert=True)

            # Send notification to tenant
            await tenant_db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "type": "system_update",
                "title": "تحديث من الإدارة",
                "message": f"تم تحديث: {', '.join([sync_labels.get(t, t) for t in data.sync_types])}",
                "priority": "high",
                "read": False,
                "created_at": now
            })

            success_count += 1
        except Exception as e:
            failed_tenants.append({"id": tenant["id"], "name": tenant["name"], "error": str(e)})

    # Log sync action
    sync_log = {
        "id": sync_id,
        "sync_types": data.sync_types,
        "target": data.target,
        "total_tenants": len(tenants),
        "success_count": success_count,
        "failed_count": len(failed_tenants),
        "failed_tenants": failed_tenants,
        "admin_id": admin["id"],
        "admin_name": admin.get("name", ""),
        "created_at": now
    }
    await db.sync_logs.insert_one(sync_log)

    return {
        "message": f"تم المزامنة بنجاح إلى {success_count} مشترك",
        "sync_id": sync_id,
        "success_count": success_count,
        "failed_count": len(failed_tenants),
        "failed_tenants": failed_tenants
    }

@router.get("/sync/logs")
async def get_sync_logs(admin: dict = Depends(get_super_admin), limit: int = 50):
    """Get sync history logs"""
    logs = await db.sync_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return logs

@router.get("/sync/available-types")
async def get_available_sync_types(admin: dict = Depends(get_super_admin)):
    """Get available sync types with counts"""
    products_count = await db.products.count_documents({})
    families_count = await db.product_families.count_documents({})

    return [
        {"id": "receipt", "name": "إعدادات الإيصال", "name_fr": "Paramètres du reçu", "icon": "Receipt", "count": 1},
        {"id": "notifications", "name": "إعدادات الإشعارات", "name_fr": "Paramètres des notifications", "icon": "Bell", "count": 1},
        {"id": "loyalty", "name": "إعدادات الولاء", "name_fr": "Paramètres de fidélité", "icon": "Award", "count": 1},
        {"id": "pos", "name": "إعدادات نقطة البيع", "name_fr": "Paramètres POS", "icon": "Store", "count": 1},
        {"id": "products", "name": "المنتجات", "name_fr": "Produits", "icon": "Package", "count": products_count},
        {"id": "families", "name": "عائلات المنتجات", "name_fr": "Familles de produits", "icon": "Folder", "count": families_count},
        {"id": "theme", "name": "تصميم الواجهة", "name_fr": "Thème", "icon": "Palette", "count": 1}
    ]

@router.post("/sync/lock-settings")
async def lock_tenant_settings(tenant_ids: List[str], lock: bool, admin: dict = Depends(get_super_admin)):
    """Lock or unlock settings for specific tenants"""
    now = datetime.now(timezone.utc).isoformat()

    for tenant_id in tenant_ids:
        tenant = await db.saas_tenants.find_one({"id": tenant_id})
        if tenant:
            tenant_db = client[tenant["database_name"]]
            await tenant_db.settings.update_one(
                {"type": "admin_lock"},
                {"$set": {"locked": lock, "updated_at": now}},
                upsert=True
            )

    return {"message": f"تم {'قفل' if lock else 'فتح'} الإعدادات لـ {len(tenant_ids)} مشترك"}


# ============ TENANT DATABASE MANAGEMENT ============

@router.get("/tenant/database-info")
async def get_tenant_database_info(current_user: dict = Depends(require_tenant)):
    """Get database info for current tenant"""
    tenant_id = current_user.get("tenant_id") or current_user.get("id")

    # Get tenant info
    tenant = await db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0})

    if tenant:
        db_name = f"tenant_{tenant_id.replace('-', '_')}"
        try:
            tenant_db = client[db_name]
            stats = await tenant_db.command("dbStats")
            cols = await tenant_db.list_collection_names()
            docs = sum([await tenant_db[c].count_documents({}) for c in cols])

            return {
                "size_mb": round(stats.get("dataSize", 0) / (1024 * 1024), 2),
                "collections_count": len(cols),
                "documents_count": docs,
                "last_backup": tenant.get("last_backup"),
                "is_frozen": tenant.get("is_frozen", False),
                "status": "frozen" if tenant.get("is_frozen") else "healthy"
            }
        except Exception as e:
            logger.error(f"Error getting tenant DB info: {e}")

    # Fallback: return estimated data
    return {
        "size_mb": 0,
        "collections_count": 8,
        "documents_count": 0,
        "last_backup": None,
        "is_frozen": False,
        "status": "healthy"
    }

@router.post("/tenant/request-backup")
async def request_tenant_backup(current_user: dict = Depends(require_tenant)):
    """Request backup for tenant database"""
    tenant_id = current_user.get("tenant_id") or current_user.get("id")
    now = datetime.now(timezone.utc).isoformat()

    # Create backup request
    request_id = str(uuid.uuid4())
    await db.backup_requests.insert_one({
        "id": request_id,
        "tenant_id": tenant_id,
        "tenant_name": current_user.get("name") or current_user.get("company_name"),
        "status": "pending",
        "requested_at": now,
        "processed_at": None
    })

    # Log operation
    await db.database_operation_logs.insert_one({
        "id": str(uuid.uuid4()),
        "operation": "backup_request",
        "database_id": tenant_id,
        "database_name": f"tenant_{tenant_id.replace('-', '_')}",
        "executed_by": current_user.get("name"),
        "status": "pending",
        "details": "طلب نسخة احتياطية من المشترك",
        "created_at": now
    })

    return {"message": "تم إرسال طلب النسخ الاحتياطي", "request_id": request_id}

@router.get("/tenant/export-data")
async def export_tenant_data(current_user: dict = Depends(require_tenant)):
    """Export tenant's own data"""
    import json

    tenant_id = current_user.get("tenant_id") or current_user.get("id")

    # Check if frozen
    tenant = await db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0})
    if tenant and tenant.get("is_frozen"):
        raise HTTPException(status_code=403, detail="قاعدة البيانات مجمدة")

    db_name = f"tenant_{tenant_id.replace('-', '_')}"

    try:
        tenant_db = client[db_name]
        export_data = {}

        # Export allowed collections only
        allowed_collections = ["products", "customers", "suppliers", "employees", "sales", "expenses", "settings"]

        for col in allowed_collections:
            try:
                docs = await tenant_db[col].find({}, {"_id": 0}).to_list(100000)
                export_data[col] = docs
            except Exception:
                export_data[col] = []

        export_data["exported_at"] = datetime.now(timezone.utc).isoformat()
        export_data["tenant_id"] = tenant_id

        content = json.dumps(export_data, ensure_ascii=False, indent=2, default=str)

        # Log export
        await db.database_operation_logs.insert_one({
            "id": str(uuid.uuid4()),
            "operation": "self_export",
            "database_id": tenant_id,
            "database_name": db_name,
            "executed_by": current_user.get("name"),
            "status": "success",
            "details": "تصدير بيانات ذاتي",
            "created_at": datetime.now(timezone.utc).isoformat()
        })

        return StreamingResponse(
            io.BytesIO(content.encode('utf-8')),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename={db_name}_export.json"}
        )
    except Exception as e:
        logger.error(f"Error exporting tenant data: {e}")
        raise HTTPException(status_code=500, detail="حدث خطأ أثناء التصدير")



# ============ DATABASE MANAGEMENT MOVED TO routes/saas_routes.py ============

# ============ SENDGRID EMAIL -> routes/sendgrid_email_routes.py ============

# ============ STRIPE PAYMENT -> routes/stripe_routes.py ============

# ============ ONLINE STORE -> routes/online_store_routes.py ============

# ============ AUTO REPORTS API ============
@router.get("/auto-reports")
async def get_auto_reports(
    report_type: str = None,
    limit: int = 50,
    user: dict = Depends(get_current_user)
):
    query = {}
    if report_type:
        query["type"] = report_type
    if user.get("tenant_id") and user.get("user_type") != "super_admin":
        query["tenant_id"] = user["tenant_id"]
    reports = await main_db.auto_reports.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return reports

@router.get("/auto-reports/{report_id}")
async def get_auto_report_detail(report_id: str, user: dict = Depends(get_current_user)):
    report = await main_db.auto_reports.find_one({"id": report_id}, {"_id": 0})
    if not report:
        raise HTTPException(status_code=404, detail="التقرير غير موجود")
    return report

@router.get("/collection-reports")
async def get_collection_reports(admin: dict = Depends(get_super_admin)):
    reports = await main_db.collection_reports.find({}, {"_id": 0}).sort("month", -1).limit(12).to_list(12)
    return reports

@router.get("/system/info")
async def get_system_info():
    """NT Commerce 12.0 - System Information"""
    return {
        "name": "NT Commerce",
        "version": "12.0.0",
        "codename": "الإصدار الأسطوري",
        "status": "running",
        "systems": {
            "bdv_original": {"tables": 58, "status": "active"},
            "nt_commerce": {"tables": 24, "status": "active"},
            "repair_system": {"tables": 16, "status": "active"},
            "defective_goods": {"tables": 11, "status": "active"},
            "ai_robots": {"tables": 14, "status": "active"},
            "security": {"tables": 9, "status": "active"},
            "backup_system": {"tables": 5, "status": "active"},
            "printing_system": {"tables": 5, "status": "active"},
            "barcode_system": {"tables": 3, "status": "active"},
            "search_system": {"tables": 3, "status": "active"},
            "performance": {"tables": 4, "status": "active"},
            "tasks_chat": {"tables": 4, "status": "active"},
            "supplier_tracking": {"tables": 2, "status": "active"},
            "wallet": {"tables": 3, "status": "active"},
        },
        "total_tables": 152,
        "robots": 6,
        "languages": ["ar", "fr"],
    }
