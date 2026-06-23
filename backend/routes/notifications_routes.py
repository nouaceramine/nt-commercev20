"""
Notifications Routes - Extracted from legacy_inline_routes.py
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Literal
from datetime import datetime, timezone, timedelta
from utils.inventory_queries import low_stock_filter
import uuid
import os
import logging
import pandas as pd


logger = logging.getLogger(__name__)


def create_notifications_routes(db, require_tenant, get_tenant_admin, get_current_user, DEFAULT_PERMISSIONS) -> dict:
    """Create notifications routes"""
    from utils.permissions import create_cashier_block
    router = APIRouter()
    block_cashier = create_cashier_block(get_current_user)

    # ============ NOTIFICATIONS ============

    @router.get("/notifications")
    async def get_notifications(user: dict = Depends(require_tenant)):
        """Get all notifications for current user"""
        notifications = await db.notifications.find(
            {"$or": [{"user_id": user["id"]}, {"user_id": None}]},
            {"_id": 0}
        ).sort("created_at", -1).to_list(50)
        return notifications

    @router.post("/notifications")
    async def create_notification(
        title: str,
        message: str,
        notification_type: str = "info",
        user_id: Optional[str] = None,
        user: dict = Depends(require_tenant)
    ):
        """Create a notification"""
        notification_doc = {
            "id": str(uuid.uuid4()),
            "title": title,
            "message": message,
            "type": notification_type,  # info, warning, error, debt
            "user_id": user_id,  # None = all users
            "is_read": False,
            "created_by": user["id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.notifications.insert_one(notification_doc)
        return notification_doc

    @router.put("/notifications/{notification_id}/read")
    async def mark_notification_read(notification_id: str, user: dict = Depends(require_tenant)):
        """Mark notification as read"""
        await db.notifications.update_one(
            {"id": notification_id},
            {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"message": "تم تحديد الإشعار كمقروء"}

    @router.delete("/notifications/{notification_id}")
    async def delete_notification(notification_id: str, user: dict = Depends(require_tenant)):
        """Delete a notification"""
        await db.notifications.delete_one({"id": notification_id})
        return {"message": "تم حذف الإشعار"}

    @router.get("/notifications/unread-count")
    async def get_unread_notification_count(user: dict = Depends(require_tenant)):
        """Get count of unread notifications"""
        count = await db.notifications.count_documents({
            "$or": [{"user_id": user["id"]}, {"user_id": None}],
            "is_read": False
        })
        return {"count": count}

    # ============ NOTIFICATIONS (legacy, kept for compatibility) ============

    @router.get("/notifications/legacy", operation_id="get_notifications_legacy", include_in_schema=False)
    async def get_notifications_legacy(user: dict = Depends(require_tenant)):
        notifications = await db.notifications.find(
            {
                "read": False,
                "$or": [
                    {"user_id": user["id"]},
                    {"user_id": {"$exists": False}}
                ]
            }, {"_id": 0}
        ).sort("created_at", -1).to_list(50)
        return notifications

    @router.put("/notifications/{notification_id}/read-legacy", operation_id="mark_notification_read_legacy", include_in_schema=False)
    async def mark_notification_read_legacy(notification_id: str, user: dict = Depends(require_tenant)):
        await db.notifications.update_one(
            {"id": notification_id, "$or": [{"user_id": user["id"]}, {"user_id": {"$exists": False}}]},
            {"$set": {"read": True}}
        )
        return {"message": "Notification marked as read"}

    @router.put("/notifications/read-all")
    async def mark_all_notifications_read(user: dict = Depends(require_tenant)):
        await db.notifications.update_many(
            {"read": False, "$or": [{"user_id": user["id"]}, {"user_id": {"$exists": False}}]},
            {"$set": {"read": True}}
        )
        return {"message": "All notifications marked as read"}

    @router.post("/notifications/generate")
    async def generate_auto_notifications(user: dict = Depends(require_tenant)):
        """Generate automatic notifications for low stock and due debts"""
        notifications_created = []

        # 1. Low stock notifications
        low_stock_products = await db.products.find(low_stock_filter()).to_list(100)

        for product in low_stock_products:
            product_id = product.get("id")
            if not product_id:
                continue
            quantity = product.get("quantity", 0)
            # Check if notification already exists for this product
            existing = await db.notifications.find_one({
                "type": "low_stock",
                "reference_id": product_id,
                "read": False
            })
            if not existing:
                notif = {
                    "id": str(uuid.uuid4()),
                    "type": "low_stock",
                    "reference_id": product_id,
                    "message_ar": f"تنبيه: المنتج '{product.get('name_ar', product.get('name_en', 'منتج'))}' مخزونه منخفض ({quantity} قطعة)",
                    "message_en": f"Alert: Product '{product.get('name_en', product.get('name_ar', 'Product'))}' is low on stock ({quantity} units)",
                    "read": False,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.notifications.insert_one(notif)
                notifications_created.append(notif["id"])

        # 2. Customer debt notifications (debts > 7 days)
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        overdue_sales = await db.sales.find({
            "remaining": {"$gt": 0},
            "created_at": {"$lt": week_ago}
        }).to_list(100)

        for sale in overdue_sales:
            existing = await db.notifications.find_one({
                "type": "overdue_debt",
                "reference_id": sale["id"],
                "read": False
            })
            if not existing:
                customer = await db.customers.find_one({"id": sale.get("customer_id")})
                customer_name = customer["name"] if customer else "عميل"
                notif = {
                    "id": str(uuid.uuid4()),
                    "type": "overdue_debt",
                    "reference_id": sale["id"],
                    "message_ar": f"تذكير: دين مستحق من {customer_name} بقيمة {sale['remaining']:.2f} دج",
                    "message_en": f"Reminder: Overdue debt from {customer_name} of {sale['remaining']:.2f} DA",
                    "read": False,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.notifications.insert_one(notif)
                notifications_created.append(notif["id"])

        # 3. Supplier debt notifications (debts > 7 days)
        overdue_purchases = await db.purchases.find({
            "remaining": {"$gt": 0},
            "created_at": {"$lt": week_ago}
        }).to_list(100)

        for purchase in overdue_purchases:
            existing = await db.notifications.find_one({
                "type": "supplier_debt",
                "reference_id": purchase["id"],
                "read": False
            })
            if not existing:
                notif = {
                    "id": str(uuid.uuid4()),
                    "type": "supplier_debt",
                    "reference_id": purchase["id"],
                    "message_ar": f"تذكير: دين للمورد {purchase.get('supplier_name', '')} بقيمة {purchase['remaining']:.2f} دج",
                    "message_en": f"Reminder: Supplier debt to {purchase.get('supplier_name', '')} of {purchase['remaining']:.2f} DA",
                    "read": False,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.notifications.insert_one(notif)
                notifications_created.append(notif["id"])

        return {
            "message": f"Generated {len(notifications_created)} notifications",
            "notification_ids": notifications_created
        }

    # ============ EXCEL IMPORT/EXPORT ============

    @router.get("/products/export/excel")
    async def export_products_excel(admin: dict = Depends(get_tenant_admin)):
        import pandas as pd

        products = await db.products.find({}, {"_id": 0}).to_list(10000)

        # Prepare data
        data = []
        for p in products:
            data.append({
                "الباركود": p.get("barcode", ""),
                "الاسم (عربي)": p.get("name_ar", ""),
                "الاسم (إنجليزي)": p.get("name_en", ""),
                "الوصف (عربي)": p.get("description_ar", ""),
                "الوصف (إنجليزي)": p.get("description_en", ""),
                "سعر الشراء": p.get("purchase_price", 0),
                "سعر الجملة": p.get("wholesale_price", 0),
                "سعر التجزئة": p.get("retail_price", 0),
                "الكمية": p.get("quantity", 0),
                "حد المخزون المنخفض": p.get("low_stock_threshold", 10),
                "الموديلات المتوافقة": ", ".join(p.get("compatible_models", [])),
                "رابط الصورة": p.get("image_url", "")
            })

        df = pd.DataFrame(data)

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='المنتجات')
        output.seek(0)

        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=products.xlsx"}
        )

    from fastapi import UploadFile, File

    @router.post("/products/import/excel")
    async def import_products_excel(file: UploadFile = File(...), admin: dict = Depends(get_tenant_admin)):
        import pandas as pd

        if not file.filename.endswith(('.xlsx', '.xls')):
            raise HTTPException(status_code=400, detail="File must be Excel format (.xlsx or .xls)")

        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))

        now = datetime.now(timezone.utc).isoformat()
        imported = 0
        updated = 0
        errors = []

        for index, row in df.iterrows():
            try:
                barcode = str(row.get("الباركود", "")).strip()
                name_ar = str(row.get("الاسم (عربي)", "")).strip()
                name_en = str(row.get("الاسم (إنجليزي)", "")).strip()

                if not name_ar and not name_en:
                    continue

                product_data = {
                    "barcode": barcode,
                    "name_ar": name_ar or name_en,
                    "name_en": name_en or name_ar,
                    "description_ar": str(row.get("الوصف (عربي)", "")),
                    "description_en": str(row.get("الوصف (إنجليزي)", "")),
                    "purchase_price": float(row.get("سعر الشراء", 0) or 0),
                    "wholesale_price": float(row.get("سعر الجملة", 0) or 0),
                    "retail_price": float(row.get("سعر التجزئة", 0) or 0),
                    "quantity": int(row.get("الكمية", 0) or 0),
                    "low_stock_threshold": int(row.get("حد المخزون المنخفض", 10) or 10),
                    "compatible_models": [m.strip() for m in str(row.get("الموديلات المتوافقة", "")).split(",") if m.strip()],
                    "image_url": str(row.get("رابط الصورة", "")),
                    "updated_at": now
                }

                # Check if product exists by barcode or name
                existing = None
                if barcode:
                    existing = await db.products.find_one({"barcode": barcode})
                if not existing and name_ar:
                    existing = await db.products.find_one({"name_ar": name_ar})

                if existing:
                    await db.products.update_one({"id": existing["id"]}, {"$set": product_data})
                    updated += 1
                else:
                    product_data["id"] = str(uuid.uuid4())
                    product_data["created_at"] = now
                    await db.products.insert_one(product_data)
                    imported += 1

            except Exception as e:
                errors.append(f"Row {index + 2}: {str(e)}")

        return {
            "imported": imported,
            "updated": updated,
            "errors": errors[:10]  # Return first 10 errors
        }

    # ============ SELECTIVE DATA DELETE ============

    class SelectiveDeleteRequest(BaseModel):
        data_types: List[str]  # ["sales", "purchases", "customers", etc.]
        confirm_code: str

    @router.post("/system/selective-delete")
    async def selective_delete(request: SelectiveDeleteRequest, admin: dict = Depends(get_tenant_admin)):
        """Selectively delete specific data types"""
        if request.confirm_code != "DELETE-SELECTED":
            raise HTTPException(status_code=400, detail="Invalid confirmation code")

        # Check permissions
        user_permissions = admin.get("permissions") or DEFAULT_PERMISSIONS.get(admin.get("role", "user"), {})
        if not user_permissions.get("factory_reset", False):
            raise HTTPException(status_code=403, detail="No permission for data deletion")

        # Valid data types
        valid_types = {
            "sales": "sales",
            "purchases": "purchases",
            "customers": "customers",
            "suppliers": "suppliers",
            "products": "products",
            "employees": "employees",
            "debts": "debts",
            "expenses": "expenses",
            "repairs": "repairs",
            "inventory_adjustments": "inventory_adjustments",
            "daily_sessions": "daily_sessions",
            "notifications": "notifications"
        }

        deleted_counts = {}
        for data_type in request.data_types:
            if data_type in valid_types:
                collection_name = valid_types[data_type]
                result = await db[collection_name].delete_many({})
                deleted_counts[data_type] = result.deleted_count

                # Also delete related data
                if data_type == "sales":
                    await db.debt_payments.delete_many({"type": "sale"})
                elif data_type == "customers":
                    await db.customer_families.delete_many({})
                elif data_type == "suppliers":
                    await db.supplier_families.delete_many({})
                elif data_type == "products":
                    await db.product_families.delete_many({})

        # Log deletion
        await db.system_logs.insert_one({
            "id": str(uuid.uuid4()),
            "action": "selective_delete",
            "performed_by": admin.get("name", ""),
            "deleted_types": request.data_types,
            "deleted_counts": deleted_counts,
            "created_at": datetime.now(timezone.utc).isoformat()
        })

        return {"success": True, "deleted_counts": deleted_counts}

    # ============ SIDEBAR ORDER SETTINGS ============

    @router.get("/settings/sidebar-order")
    async def get_sidebar_order(user: dict = Depends(block_cashier)):
        """Get sidebar menu order for user"""
        settings = await db.user_settings.find_one({"user_id": user["id"]}, {"_id": 0})
        if settings and "sidebar_order" in settings:
            return {"sidebar_order": settings["sidebar_order"]}
        return {"sidebar_order": None}  # Return null to use default order

    class SidebarMenuItem(BaseModel):
        id: str
        path: Optional[str] = None
        icon: Optional[str] = None
        labelAr: Optional[str] = None
        labelFr: Optional[str] = None
        visible: bool = True

    class SidebarSection(BaseModel):
        id: str
        titleAr: Optional[str] = None
        titleFr: Optional[str] = None
        icon: Optional[str] = None
        visible: bool = True
        isCustom: bool = False
        items: List[SidebarMenuItem] = []

    @router.put("/settings/sidebar-order")
    async def update_sidebar_order(order: List[SidebarSection], user: dict = Depends(block_cashier)):
        """Update sidebar menu order for user"""
        # Convert to dict for storage
        order_data = [section.model_dump() for section in order]
        await db.user_settings.update_one(
            {"user_id": user["id"]},
            {"$set": {"sidebar_order": order_data, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )
        return {"success": True}

    # ============ NOTIFICATION MANAGEMENT ============

    @router.get("/notifications/settings")
    async def get_notification_settings(user: dict = Depends(require_tenant)):
        """Get notification settings"""
        settings = await db.notification_settings.find_one({"user_id": user["id"]}, {"_id": 0})
        if not settings:
            # Default settings
            settings = {
                "low_stock_enabled": True,
                "low_stock_threshold": 10,
                "debt_reminder_enabled": True,
                "debt_reminder_days": 7,
                "cash_difference_enabled": True,
                "cash_difference_threshold": 1000,
                "expense_reminder_enabled": True,
                "repair_status_enabled": True,
                "email_notifications": False,
                "sound_enabled": True
            }
        return settings

    @router.put("/notifications/settings")
    async def update_notification_settings(settings: dict, user: dict = Depends(require_tenant)):
        """Update notification settings"""
        settings["user_id"] = user["id"]
        settings["updated_at"] = datetime.now(timezone.utc).isoformat()

        await db.notification_settings.update_one(
            {"user_id": user["id"]},
            {"$set": settings},
            upsert=True
        )
        return {"success": True}

    @router.get("/notifications/all")
    async def get_all_notifications(
        skip: int = 0, 
        limit: int = 50,
        unread_only: bool = False,
        user: dict = Depends(require_tenant)
    ):
        """Get all notifications with pagination"""
        query = {}
        if unread_only:
            query["read"] = False

        notifications = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        total = await db.notifications.count_documents(query)
        unread_count = await db.notifications.count_documents({"read": False})

        return {
            "notifications": notifications,
            "total": total,
            "unread_count": unread_count
        }

    @router.put("/notifications/{notification_id}/read", operation_id="mark_notification_read_v2")
    async def mark_notification_read_v2(notification_id: str, user: dict = Depends(require_tenant)):
        """Mark a notification as read"""
        await db.notifications.update_one(
            {"id": notification_id},
            {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"success": True}

    @router.put("/notifications/mark-all-read")
    async def mark_all_notifications_read(user: dict = Depends(require_tenant)):
        """Mark all notifications as read"""
        await db.notifications.update_many(
            {"read": False},
            {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"success": True}

    @router.delete("/notifications/{notification_id}", operation_id="delete_notification_v2")
    async def delete_notification_v2(notification_id: str, user: dict = Depends(require_tenant)):
        """Delete a notification"""
        await db.notifications.delete_one({"id": notification_id})
        return {"success": True}

    @router.delete("/notifications/clear-all")
    async def clear_all_notifications(admin: dict = Depends(get_tenant_admin)):
        """Clear all notifications"""
        result = await db.notifications.delete_many({})
        return {"success": True, "deleted_count": result.deleted_count}


    return router
