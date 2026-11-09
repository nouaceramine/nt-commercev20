"""
Notifications Routes - Extracted from legacy_inline_routes.py
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from utils.inventory_queries import low_stock_filter
import uuid
import io
import logging
from openpyxl import Workbook, load_workbook


logger = logging.getLogger(__name__)


PRODUCT_EXCEL_HEADERS = [
    "الباركود", "الاسم (عربي)", "الاسم (إنجليزي)", "الوصف (عربي)",
    "الوصف (إنجليزي)", "سعر الشراء", "سعر الجملة", "سعر التجزئة",
    "الكمية", "حد المخزون المنخفض", "الموديلات المتوافقة", "رابط الصورة",
]


def validate_product_excel_headers(header: list) -> list:
    cleaned = [str(value).strip() if value is not None else "" for value in header]
    non_empty = [value for value in cleaned if value]
    if not non_empty:
        raise HTTPException(status_code=400, detail="الملف فارغ أو بلا صف عناوين")
    if len(set(non_empty)) != len(non_empty):
        raise HTTPException(status_code=400, detail="يوجد تكرار في عناوين أعمدة Excel")
    if "الاسم (عربي)" not in cleaned and "الاسم (إنجليزي)" not in cleaned:
        raise HTTPException(status_code=400, detail="عمود اسم المنتج مطلوب")
    return cleaned


def set_product_excel_cell(cell, value):
    """Keep user-controlled text as text, including spreadsheet formula prefixes."""
    cell.value = value
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@")):
        cell.data_type = "s"
    return cell


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
            {"channel": {"$ne": "smart"}, "$or": [{"user_id": user["id"]}, {"user_id": None}]},
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

    @router.put("/notifications/read-all")
    async def mark_all_notifications_read(user: dict = Depends(require_tenant)):
        await db.notifications.update_many(
            {"read": False, "channel": {"$ne": "smart"}, "$or": [{"user_id": user["id"]}, {"user_id": {"$exists": False}}]},
            {"$set": {"read": True}}
        )
        return {"message": "All notifications marked as read"}

    @router.get("/notifications/legacy", operation_id="get_notifications_legacy", include_in_schema=False)
    async def get_notifications_legacy(user: dict = Depends(require_tenant)):
        notifications = await db.notifications.find(
            {
                "read": False,
                "channel": {"$ne": "smart"},
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

        # 4. Expiry notifications (product lots) — p70
        from datetime import date as _date_cls
        _today = _date_cls.today()
        exp_lots = await db.product_lots.find({"expiry_date": {"$ne": ""}}).to_list(1000)

        for lot in exp_lots:
            try:
                _exp = datetime.fromisoformat(lot["expiry_date"]).date()
            except Exception:
                continue
            _remaining = (_exp - _today).days
            _alert = int(lot.get("alert_days", 30) or 30)
            if _remaining > _alert:
                continue
            existing = await db.notifications.find_one({
                "type": "expiry_warning",
                "reference_id": lot.get("id"),
                "read": False
            })
            if not existing:
                _prod = await db.products.find_one({"id": lot.get("product_id")}, {"_id": 0, "name_ar": 1, "name_en": 1})
                _pname = (_prod.get("name_ar") or _prod.get("name_en")) if _prod else "منتج"
                _lot_no = lot.get("lot_number", "") or "-"
                if _remaining < 0:
                    _msg_ar = f"انتهت صلاحية الدُفعة '{_lot_no}' من المنتج '{_pname}' منذ {-_remaining} يوم"
                    _msg_en = f"Lot '{_lot_no}' of product '{_pname}' expired {-_remaining} days ago"
                else:
                    _msg_ar = f"تنبيه: الدُفعة '{_lot_no}' من المنتج '{_pname}' تنتهي صلاحيتها خلال {_remaining} يوم"
                    _msg_en = f"Alert: Lot '{_lot_no}' of product '{_pname}' expires in {_remaining} days"
                notif = {
                    "id": str(uuid.uuid4()),
                    "type": "expiry_warning",
                    "reference_id": lot.get("id"),
                    "message_ar": _msg_ar,
                    "message_en": _msg_en,
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

        wb = Workbook()
        ws = wb.active
        ws.title = 'المنتجات'
        ws.append(PRODUCT_EXCEL_HEADERS)
        for row_index, row in enumerate(data, start=2):
            for column_index, header in enumerate(PRODUCT_EXCEL_HEADERS, start=1):
                set_product_excel_cell(
                    ws.cell(row=row_index, column=column_index), row.get(header, "")
                )

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)

        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=products.xlsx"}
        )


    def _excel_identity_claim_ids(doc: dict) -> list:
        claims = []
        for field in ("name_en", "name_ar"):
            value = (doc.get(field) or "").strip().casefold()
            if value:
                claims.append(field + ":" + value)
        barcode = str(doc.get("barcode") or "").strip()
        if barcode:
            claims.append("barcode:" + barcode)
        return list(dict.fromkeys(claims))

    async def _assert_excel_identities_available(doc: dict, exclude_id: str = "", session=None):
        import re
        for field in ("name_en", "name_ar"):
            value = (doc.get(field) or "").strip()
            if not value:
                continue
            query = {field: {"$regex": f"^{re.escape(value)}$", "$options": "i"}}
            if exclude_id:
                query["id"] = {"$ne": exclude_id}
            clash = await db.products.find_one(query, {"_id": 0, "id": 1}, session=session)
            if clash:
                raise ValueError("اسم المنتج مستعمل في منتج آخر")
        barcode = str(doc.get("barcode") or "").strip()
        if barcode:
            query = {"$or": [{"barcode": barcode}, {"additional_barcodes": barcode}]}
            if exclude_id:
                query["id"] = {"$ne": exclude_id}
            clash = await db.products.find_one(query, {"_id": 0, "id": 1}, session=session)
            if clash:
                raise ValueError("الباركود مستعمل في منتج آخر")

    async def _claim_excel_identities(product_id: str, doc: dict, session):
        for claim_id in _excel_identity_claim_ids(doc):
            existing = await db.product_identity_claims.find_one({"_id": claim_id}, session=session)
            if existing and existing.get("product_id") != product_id:
                raise ValueError("اسم المنتج أو الباركود مستعمل مسبقاً")
            if not existing:
                await db.product_identity_claims.insert_one({
                    "_id": claim_id, "product_id": product_id,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }, session=session)

    async def _audit_excel_product(action: str, product_id: str, product_name: str,
                                   admin: dict, details: dict, session):
        await db.product_audit_log.insert_one({
            "id": str(uuid.uuid4()), "action": action, "product_id": product_id,
            "product_name": product_name, "user_id": admin.get("id", ""),
            "performed_by": admin.get("name", admin.get("email", "")),
            "details": details, "created_at": datetime.now(timezone.utc).isoformat(),
        }, session=session)

    async def _apply_excel_product_row(row: dict, row_number: int, now: str, admin: dict):
        import asyncio
        from config.database import client
        from models.schemas import ProductCreate
        from pymongo.errors import DuplicateKeyError, PyMongoError
        import re

        barcode = str(row.get("الباركود", "") or "").strip()
        name_ar = str(row.get("الاسم (عربي)") or "").strip()
        name_en = str(row.get("الاسم (إنجليزي)") or "").strip()
        if not name_ar and not name_en:
            return "skipped"
        raw_data = {
            "barcode": barcode,
            "name_ar": name_ar or name_en,
            "name_en": name_en or name_ar,
            "description_ar": str(row.get("الوصف (عربي)") or ""),
            "description_en": str(row.get("الوصف (إنجليزي)") or ""),
            "purchase_price": row.get("سعر الشراء", 0) or 0,
            "wholesale_price": row.get("سعر الجملة", 0) or 0,
            "retail_price": row.get("سعر التجزئة", 0) or 0,
            "quantity": row.get("الكمية", 0) or 0,
            "low_stock_threshold": row.get("حد المخزون المنخفض", 10)
                if row.get("حد المخزون المنخفض", 10) not in (None, "") else 10,
            "compatible_models": [m.strip() for m in str(
                row.get("الموديلات المتوافقة") or "").split(",") if m.strip()],
            "image_url": str(row.get("رابط الصورة") or ""),
        }
        validated = ProductCreate(**raw_data)
        update_data = {
            field: getattr(validated, field) for field in (
                "barcode", "name_ar", "name_en", "description_ar", "description_en",
                "purchase_price", "wholesale_price", "retail_price", "quantity",
                "low_stock_threshold", "compatible_models", "image_url",
            )
        }
        update_data["updated_at"] = now

        for attempt in range(5):
            try:
                outcome = None
                async with await client.start_session() as tx_session:
                    async with tx_session.start_transaction():
                        barcode_match = None
                        if barcode:
                            barcode_match = await db.products.find_one({
                                "$or": [{"barcode": barcode}, {"additional_barcodes": barcode}]
                            }, session=tx_session)
                        name_clauses = []
                        for value in dict.fromkeys(v for v in (name_ar, name_en) if v):
                            for field in ("name_ar", "name_en"):
                                name_clauses.append({
                                    field: {"$regex": f"^{re.escape(value)}$", "$options": "i"}
                                })
                        name_matches = await db.products.find(
                            {"$or": name_clauses}, session=tx_session
                        ).to_list(2) if name_clauses else []
                        if barcode_match and any(
                            item.get("id") != barcode_match.get("id") for item in name_matches
                        ):
                            raise ValueError("الباركود والاسم يشيران إلى منتجين مختلفين")
                        if not barcode_match and len(name_matches) > 1:
                            raise ValueError("اسم المنتج يطابق أكثر من منتج؛ استخدم الباركود")
                        existing = barcode_match or (name_matches[0] if name_matches else None)
                        main_warehouse = await db.warehouses.find_one(
                            {"is_main": True}, session=tx_session
                        )
                        from services.warehouse_stock import adjust_warehouse_stock

                        if existing:
                            product_id = existing["id"]
                            identity_doc = {**existing, **update_data}
                            await _assert_excel_identities_available(
                                identity_doc, product_id, tx_session
                            )
                            await _claim_excel_identities(product_id, identity_doc, tx_session)
                            desired_claims = _excel_identity_claim_ids(identity_doc)
                            await db.product_identity_claims.delete_many(
                                {"product_id": product_id, "_id": {"$nin": desired_claims}},
                                session=tx_session,
                            )
                            old_quantity = float(existing.get("quantity", 0) or 0)
                            new_quantity = float(update_data["quantity"])
                            changed_by = admin.get("name", admin.get("email", ""))
                            for price_field in ("purchase_price", "wholesale_price", "retail_price"):
                                old_price = float(existing.get(price_field, 0) or 0)
                                new_price = float(update_data[price_field])
                                if new_price == old_price:
                                    continue
                                await db.price_history.insert_one({
                                    "id": str(uuid.uuid4()), "product_id": product_id,
                                    "product_name": existing.get("name_ar") or existing.get("name_en") or "",
                                    "old_price": old_price, "new_price": new_price,
                                    "price_type": price_field,
                                    "change_percent": round(
                                        ((new_price - old_price) / old_price) * 100, 2
                                    ) if old_price else 0.0,
                                    "changed_by": changed_by, "changed_by_name": changed_by,
                                    "source": "excel_import", "reference": f"row:{row_number}",
                                    "created_at": now,
                                }, session=tx_session)
                            if main_warehouse:
                                await adjust_warehouse_stock(
                                    db, product_id, main_warehouse["id"], new_quantity - old_quantity,
                                    product_quantity_before=old_quantity, session=tx_session,
                                )
                            await db.products.update_one(
                                {"_id": existing["_id"]}, {"$set": update_data}, session=tx_session
                            )
                            await _audit_excel_product(
                                "update", product_id, identity_doc["name_ar"] or identity_doc["name_en"],
                                admin, {"source": "excel_import", "row": row_number,
                                        "changed_fields": sorted(update_data)}, tx_session,
                            )
                            outcome = "updated"
                        else:
                            product_id = str(uuid.uuid4())
                            product_doc = validated.model_dump()
                            product_doc.update({
                                "id": product_id, "name": validated.name_ar or validated.name_en,
                                "created_at": now, "updated_at": now,
                            })
                            await _assert_excel_identities_available(product_doc, session=tx_session)
                            await _claim_excel_identities(product_id, product_doc, tx_session)
                            await db.products.insert_one(product_doc, session=tx_session)
                            if main_warehouse:
                                await adjust_warehouse_stock(
                                    db, product_id, main_warehouse["id"], float(validated.quantity),
                                    product_quantity_before=0, session=tx_session,
                                )
                            await _audit_excel_product(
                                "create", product_id, product_doc["name"], admin,
                                {"source": "excel_import", "row": row_number,
                                 "barcode": barcode}, tx_session,
                            )
                            outcome = "created"
                return outcome
            except DuplicateKeyError:
                if attempt == 4:
                    raise ValueError("تعارض متزامن في اسم المنتج أو الباركود")
                await asyncio.sleep(0.02 * (2 ** attempt))
            except PyMongoError as exc:
                if attempt == 4 or not exc.has_error_label("TransientTransactionError"):
                    raise
                await asyncio.sleep(0.02 * (2 ** attempt))
        raise ValueError("تعذر استيراد الصف بعد إعادة المحاولة")

    @router.post("/products/import/excel")
    async def import_products_excel(file: UploadFile = File(...), admin: dict = Depends(get_tenant_admin)):

        filename = (file.filename or "").lower()
        if not filename.endswith(('.xlsx', '.xls')):
            raise HTTPException(status_code=400, detail="File must be Excel format (.xlsx or .xls)")

        contents = await file.read()
        try:
            wb = load_workbook(io.BytesIO(contents), read_only=True, data_only=True)
            ws = wb.active
            rows_iter = ws.iter_rows(values_only=True)
            header = validate_product_excel_headers(next(rows_iter, []))
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=400, detail="ملف Excel تالف أو غير قابل للقراءة")
        excel_rows = [
            {header[i]: cell for i, cell in enumerate(r) if i < len(header) and header[i]}
            for r in rows_iter
        ]

        now = datetime.now(timezone.utc).isoformat()
        imported = 0
        updated = 0
        errors = []

        for index, row in enumerate(excel_rows):
            try:
                outcome = await _apply_excel_product_row(row, index + 2, now, admin)
                if outcome == "created":
                    imported += 1
                elif outcome == "updated":
                    updated += 1
            except Exception as e:
                errors.append(f"Row {index + 2}: {str(e)}")

        return {
            "imported": imported,
            "updated": updated,
            "errors": errors[:10]
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
        query = {"channel": {"$ne": "smart"}}
        if unread_only:
            query["read"] = False

        notifications = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        total = await db.notifications.count_documents(query)
        unread_count = await db.notifications.count_documents({"read": False, "channel": {"$ne": "smart"}})

        return {
            "notifications": notifications,
            "total": total,
            "unread_count": unread_count
        }

    @router.put("/notifications/mark-all-read")
    async def mark_all_notifications_read_v2(user: dict = Depends(require_tenant)):
        await db.notifications.update_many(
            {"read": False, "channel": {"$ne": "smart"}},
            {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"success": True}

    @router.delete("/notifications/clear-all")
    async def clear_all_notifications(admin: dict = Depends(get_tenant_admin)):
        """Clear all notifications"""
        result = await db.notifications.delete_many({"channel": {"$ne": "smart"}})
        return {"success": True, "deleted_count": result.deleted_count}


    return router
