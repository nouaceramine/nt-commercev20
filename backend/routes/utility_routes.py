"""
Utility Routes - Extracted from legacy_inline_routes.py
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Literal
from datetime import datetime, timezone, timedelta
import uuid
import os
import logging


logger = logging.getLogger(__name__)


def create_utility_routes(db, require_tenant, get_tenant_admin, PriceHistoryResponse) -> dict:
    """Create utility routes"""
    router = APIRouter()

    # ============ CODE GENERATORS FOR ALL ENTITIES ============


    @router.get("/suppliers/generate-code", operation_id="generate_supplier_code_util")
    async def generate_supplier_code_util():
        """Generate next supplier code (FR0001/26, etc.)"""
        year = str(datetime.now().year)[2:]  # 2026 -> 26
        pipeline = [
            {"$match": {"code": {"$regex": f"^FR\\d{{4}}/{year}$"}}},
            {"$project": {"num": {"$toInt": {"$substr": ["$code", 2, 4]}}}},
            {"$sort": {"num": -1}},
            {"$limit": 1}
        ]
        result = await db.suppliers.aggregate(pipeline).to_list(1)
        next_num = result[0]["num"] + 1 if result else 1
        return {"code": f"FR{str(next_num).zfill(4)}/{year}"}



    @router.get("/expenses/generate-code")
    async def generate_expense_code():
        """Generate next expense code (CH0001/26, etc.)"""
        year = str(datetime.now().year)[2:]  # 2026 -> 26
        pipeline = [
            {"$match": {"code": {"$regex": f"^CH\\d{{4}}/{year}$"}}},
            {"$project": {"num": {"$toInt": {"$substr": ["$code", 2, 4]}}}},
            {"$sort": {"num": -1}},
            {"$limit": 1}
        ]
        result = await db.expenses.aggregate(pipeline).to_list(1)
        next_num = result[0]["num"] + 1 if result else 1
        return {"code": f"CH{str(next_num).zfill(4)}/{year}"}

    @router.get("/inventory-sessions/generate-code")
    async def generate_inventory_code():
        """Generate next inventory code (IN0001/26, etc.)"""
        year = str(datetime.now().year)[2:]  # 2026 -> 26
        pipeline = [
            {"$match": {"code": {"$regex": f"^IN\\d{{4}}/{year}$"}}},
            {"$project": {"num": {"$toInt": {"$substr": ["$code", 2, 4]}}}},
            {"$sort": {"num": -1}},
            {"$limit": 1}
        ]
        result = await db.inventory_sessions.aggregate(pipeline).to_list(1)
        next_num = result[0]["num"] + 1 if result else 1
        return {"code": f"IN{str(next_num).zfill(4)}/{year}"}

    @router.get("/price-updates/generate-code")
    async def generate_price_update_code():
        """Generate next price update code (MT0001/26, etc.)"""
        year = str(datetime.now().year)[2:]  # 2026 -> 26
        pipeline = [
            {"$match": {"code": {"$regex": f"^MT\\d{{4}}/{year}$"}}},
            {"$project": {"num": {"$toInt": {"$substr": ["$code", 2, 4]}}}},
            {"$sort": {"num": -1}},
            {"$limit": 1}
        ]
        result = await db.price_update_logs.aggregate(pipeline).to_list(1)
        next_num = result[0]["num"] + 1 if result else 1
        return {"code": f"MT{str(next_num).zfill(4)}/{year}"}

    @router.get("/daily-sessions/generate-code")
    async def generate_session_code():
        """Generate next session code (S001/26, etc.)"""
        year = str(datetime.now().year)[2:]  # 2026 -> 26
        pipeline = [
            {"$match": {"code": {"$regex": f"^S\\d{{3}}/{year}$"}}},
            {"$project": {"num": {"$toInt": {"$substr": ["$code", 1, 3]}}}},
            {"$sort": {"num": -1}},
            {"$limit": 1}
        ]
        result = await db.daily_sessions.aggregate(pipeline).to_list(1)
        next_num = result[0]["num"] + 1 if result else 1
        return {"code": f"S{str(next_num).zfill(3)}/{year}"}

    # ============ PRICE HISTORY ROUTES ============

    @router.get("/products/{product_id}/price-history", response_model=List[PriceHistoryResponse])
    async def get_product_price_history(product_id: str, user: dict = Depends(require_tenant)):
        """Get price change history for a specific product"""
        history = await db.price_history.find(
            {"product_id": product_id},
            {"_id": 0}
        ).sort("created_at", -1).to_list(100)
        return [PriceHistoryResponse(**h) for h in history]

    @router.get("/products/{product_id}/purchase-history")
    async def get_product_purchase_history(product_id: str, user: dict = Depends(require_tenant)):
        """Get purchase history for a specific product (from suppliers)"""
        # Get purchases containing this product
        purchases = await db.purchases.find(
            {"items.product_id": product_id},
            {"_id": 0}
        ).sort("created_at", -1).to_list(100)

        result = []
        for purchase in purchases:
            supplier = await db.suppliers.find_one({"id": purchase.get("supplier_id")}, {"_id": 0, "name": 1, "phone": 1})

            # Find the item for this product
            item_data = None
            for item in purchase.get("items", []):
                if item.get("product_id") == product_id:
                    item_data = item
                    break

            if item_data:
                result.append({
                    "id": purchase.get("id"),
                    "date": purchase.get("created_at"),
                    "supplier_id": purchase.get("supplier_id"),
                    "supplier_name": supplier.get("name") if supplier else "",
                    "supplier_phone": supplier.get("phone") if supplier else "",
                    "quantity": item_data.get("quantity", 0),
                    "unit_price": item_data.get("unit_price", 0),
                    "total": item_data.get("total", 0),
                    "purchase_total": purchase.get("total", 0),
                    "payment_status": purchase.get("payment_status", ""),
                    "notes": purchase.get("notes", "")
                })

        return result

    @router.get("/products/{product_id}/sales-history")
    async def get_product_sales_history(product_id: str, user: dict = Depends(require_tenant)):
        """Get sales history for a specific product"""
        # Get sales containing this product
        sales = await db.sales.find(
            {"items.product_id": product_id},
            {"_id": 0}
        ).sort("created_at", -1).to_list(100)

        result = []
        for sale in sales:
            customer = None
            if sale.get("customer_id"):
                customer = await db.customers.find_one({"id": sale.get("customer_id")}, {"_id": 0, "name": 1})

            # Find the item for this product
            item_data = None
            for item in sale.get("items", []):
                if item.get("product_id") == product_id:
                    item_data = item
                    break

            if item_data:
                result.append({
                    "id": sale.get("id"),
                    "date": sale.get("created_at"),
                    "customer_name": customer.get("name") if customer else (language_ar := "زبون عابر"),
                    "quantity": item_data.get("quantity", 0),
                    "unit_price": item_data.get("unit_price", 0),
                    "discount": item_data.get("discount", 0),
                    "total": item_data.get("total", 0),
                    "sale_total": sale.get("total", 0),
                    "payment_type": sale.get("payment_type", "cash")
                })

        return result

    @router.get("/price-history", response_model=List[PriceHistoryResponse])
    async def get_all_price_history(
        limit: int = 50,
        price_type: Optional[str] = None,
        user: dict = Depends(require_tenant)
    ):
        """Get all price change history"""
        query = {}
        if price_type:
            query["price_type"] = price_type

        history = await db.price_history.find(
            query,
            {"_id": 0}
        ).sort("created_at", -1).to_list(limit)
        return [PriceHistoryResponse(**h) for h in history]

    class BlacklistEntry(BaseModel):
        phone: str
        reason: str = ""
        notes: str = ""

    class BlacklistResponse(BaseModel):
        id: str
        phone: str
        reason: str
        notes: str
        added_by: str
        added_by_name: str = ""
        created_at: str

    @router.get("/blacklist")
    async def get_blacklist(user: dict = Depends(require_tenant)):
        """Get all blacklisted phone numbers"""
        blacklist = await db.customer_blacklist.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
        return blacklist

    @router.post("/blacklist")
    async def add_to_blacklist(entry: BlacklistEntry, user: dict = Depends(require_tenant)):
        """Add phone to blacklist"""
        # Check if already blacklisted
        existing = await db.customer_blacklist.find_one({"phone": entry.phone})
        if existing:
            raise HTTPException(status_code=400, detail="هذا الرقم موجود بالفعل في القائمة السوداء")

        blacklist_doc = {
            "id": str(uuid.uuid4()),
            "phone": entry.phone,
            "reason": entry.reason,
            "notes": entry.notes,
            "added_by": user["id"],
            "added_by_name": user.get("name", ""),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.customer_blacklist.insert_one(blacklist_doc)

        # Mark any customers with this phone as blacklisted
        await db.customers.update_many(
            {"phone": entry.phone},
            {"$set": {"is_blacklisted": True, "blacklist_reason": entry.reason}}
        )

        return BlacklistResponse(**blacklist_doc)

    @router.delete("/blacklist/{entry_id}")
    async def remove_from_blacklist(entry_id: str, user: dict = Depends(require_tenant)):
        """Remove phone from blacklist"""
        entry = await db.customer_blacklist.find_one({"id": entry_id})
        if not entry:
            raise HTTPException(status_code=404, detail="لم يتم العثور على السجل")

        # Remove blacklist flag from customers with this phone
        await db.customers.update_many(
            {"phone": entry["phone"]},
            {"$set": {"is_blacklisted": False, "blacklist_reason": ""}}
        )

        await db.customer_blacklist.delete_one({"id": entry_id})
        return {"message": "تم إزالة الرقم من القائمة السوداء"}

    @router.get("/blacklist/check/{phone}")
    async def check_blacklist(phone: str, user: dict = Depends(require_tenant)):
        """Check if a phone is blacklisted"""
        entry = await db.customer_blacklist.find_one({"phone": phone}, {"_id": 0})
        return {"is_blacklisted": entry is not None, "entry": entry}

    # ============ DEBT REMINDERS ============

    class DebtReminderSettings(BaseModel):
        enabled: bool = True
        reminder_days: List[int] = [7, 14, 30]  # Days after debt to remind
        min_debt_amount: float = 1000  # Minimum debt to trigger reminder

    @router.get("/debt-reminders/settings")
    async def get_debt_reminder_settings(user: dict = Depends(require_tenant)):
        """Get debt reminder settings"""
        settings = await db.system_settings.find_one({"type": "debt_reminders"}, {"_id": 0})
        if not settings:
            return DebtReminderSettings().model_dump()
        return settings

    @router.put("/debt-reminders/settings")
    async def update_debt_reminder_settings(settings: DebtReminderSettings, user: dict = Depends(require_tenant)):
        """Update debt reminder settings"""
        await db.system_settings.update_one(
            {"type": "debt_reminders"},
            {"$set": {**settings.model_dump(), "type": "debt_reminders", "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )
        return {"success": True, "message": "تم حفظ إعدادات التذكير"}

    @router.get("/debt-reminders/pending")
    async def get_pending_debt_reminders(user: dict = Depends(require_tenant)):
        """Get customers with pending debt reminders"""
        settings = await db.system_settings.find_one({"type": "debt_reminders"})
        if not settings or not settings.get("enabled", True):
            return []

        reminder_days = settings.get("reminder_days", [7, 14, 30])
        min_amount = settings.get("min_debt_amount", 1000)

        # Get all customers with debt
        customers_with_debt = await db.customers.find(
            {"total_debt": {"$gte": min_amount}},
            {"_id": 0}
        ).to_list(500)

        reminders = []
        now = datetime.now(timezone.utc)

        for customer in customers_with_debt:
            # Get last sale date for this customer
            last_sale = await db.sales.find_one(
                {"customer_id": customer["id"], "payment_type": {"$in": ["credit", "partial"]}},
                sort=[("created_at", -1)]
            )

            if last_sale:
                try:
                    sale_date_str = last_sale.get("created_at", now.isoformat())
                    if 'T' in sale_date_str:
                        sale_date = datetime.fromisoformat(sale_date_str.replace('Z', '+00:00'))
                    else:
                        sale_date = datetime.strptime(sale_date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
                except (ValueError, TypeError):
                    sale_date = now

                days_since = (now - sale_date).days

                # Check if we should remind based on settings
                for reminder_day in reminder_days:
                    if days_since >= reminder_day:
                        reminders.append({
                            "customer_id": customer["id"],
                            "customer_name": customer["name"],
                            "phone": customer.get("phone", ""),
                            "total_debt": customer["total_debt"],
                            "days_since_last_purchase": days_since,
                            "reminder_level": reminder_day,
                            "is_urgent": days_since >= 30
                        })
                        break  # Only one reminder per customer

        # Sort by urgency and debt amount
        reminders.sort(key=lambda x: (-x["days_since_last_purchase"], -x["total_debt"]))
        return reminders

    @router.post("/debt-reminders/dismiss/{customer_id}")
    async def dismiss_debt_reminder(customer_id: str, days: int = 7, user: dict = Depends(require_tenant)):
        """Dismiss a debt reminder for a period"""
        await db.debt_reminder_dismissals.update_one(
            {"customer_id": customer_id},
            {"$set": {
                "customer_id": customer_id,
                "dismissed_until": (datetime.now(timezone.utc) + timedelta(days=days)).isoformat(),
                "dismissed_by": user["id"]
            }},
            upsert=True
        )
        return {"message": f"تم تأجيل التذكير لمدة {days} أيام"}


    return router
