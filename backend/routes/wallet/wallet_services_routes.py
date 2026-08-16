"""
Wallet Services Routes - Paid Services Catalog & Purchases
Extracted from wallet_routes.py (Refactoring: Extract Class)
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
import uuid

from utils.permissions import create_cashier_block


def create_wallet_services_routes(main_db, get_current_user, block_cashier) -> dict:
    router = APIRouter(prefix="/wallet", tags=["wallet"])

    async def _super_admin(user: dict = Depends(get_current_user)):
        if user.get("role") != "super_admin" and user.get("user_type") != "super_admin":
            raise HTTPException(status_code=403, detail="صلاحيات المشرف العام مطلوبة")
        return user

    async def _get_or_create_wallet(entity_id, entity_type="tenant"):
        wallet = await main_db.wallets.find_one({"entity_id": entity_id}, {"_id": 0})
        if not wallet:
            wallet = {
                "id": str(uuid.uuid4()),
                "entity_type": entity_type,
                "entity_id": entity_id,
                "balance": 0.0,
                "currency": "DZD",
                "low_balance_threshold": 1000.0,
                "auto_pay_subscription": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await main_db.wallets.insert_one(dict(wallet))
        return wallet

    async def _record_txn(wallet, txn_type, amount, ref_type, ref_id, description, created_by):
        from pymongo import ReturnDocument
        if txn_type == "debit":
            updated = await main_db.wallets.find_one_and_update(
                {"entity_id": wallet["entity_id"], "balance": {"$gte": amount}},
                {"$inc": {"balance": -amount}},
                return_document=ReturnDocument.AFTER,
                projection={"_id": 0},
            )
            if not updated:
                raise HTTPException(status_code=400, detail="الرصيد غير كافي")
            new_balance = updated["balance"]
            old_balance = new_balance + amount
        else:
            updated = await main_db.wallets.find_one_and_update(
                {"entity_id": wallet["entity_id"]},
                {"$inc": {"balance": amount}},
                return_document=ReturnDocument.AFTER,
                projection={"_id": 0},
            )
            new_balance = updated["balance"]
            old_balance = new_balance - amount
        code = await generate_code_fn(main_db)
        txn = {
            "id": str(uuid.uuid4()),
            "code": code,
            "wallet_id": wallet["id"],
            "entity_id": wallet["entity_id"],
            "transaction_type": txn_type,
            "amount": amount,
            "balance_before": old_balance,
            "balance_after": new_balance,
            "reference_type": ref_type,
            "reference_id": ref_id,
            "description": description,
            "status": "completed",
            "created_by": created_by,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await main_db.wallet_transactions.insert_one(dict(txn))
        wallet["balance"] = new_balance
        return new_balance, txn

    async def generate_code_fn(main_db):
        from services.code_generator import generate_code
        return await generate_code(main_db, "wallet_transactions", "PF", 5, with_year=True)

    @router.get("/services")
    async def list_services(active_only: bool = False, user: dict = Depends(block_cashier)):
        query = {}
        if active_only or user.get("role") != "super_admin":
            query["is_active"] = True
        return await main_db.wallet_services.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

    @router.post("/services")
    async def create_service(data: dict, admin: dict = Depends(_super_admin)):
        name_ar = (data.get("name_ar") or data.get("name") or "").strip()
        if not name_ar:
            raise HTTPException(status_code=400, detail="اسم الخدمة مطلوب")
        price = float(data.get("price", 0) or 0)
        if price <= 0:
            raise HTTPException(status_code=400, detail="سعر الخدمة يجب أن يكون أكبر من صفر")
        service = {
            "id": str(uuid.uuid4()),
            "name_ar": name_ar,
            "name_fr": (data.get("name_fr") or "").strip(),
            "description": (data.get("description") or "").strip(),
            "price": price,
            "currency": data.get("currency", "DZD"),
            "is_active": bool(data.get("is_active", True)),
            "created_by": admin.get("name", admin.get("email", "")),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await main_db.wallet_services.insert_one(dict(service))
        return service

    @router.put("/services/{service_id}")
    async def update_service(service_id: str, data: dict, admin: dict = Depends(_super_admin)):
        updates = {}
        for k in ["name_ar", "name_fr", "description", "currency"]:
            if k in data:
                updates[k] = data[k]
        if "price" in data:
            price = float(data.get("price", 0) or 0)
            if price <= 0:
                raise HTTPException(status_code=400, detail="سعر الخدمة يجب أن يكون أكبر من صفر")
            updates["price"] = price
        if "is_active" in data:
            updates["is_active"] = bool(data["is_active"])
        if updates:
            await main_db.wallet_services.update_one({"id": service_id}, {"$set": updates})
        service = await main_db.wallet_services.find_one({"id": service_id}, {"_id": 0})
        if not service:
            raise HTTPException(status_code=404, detail="الخدمة غير موجودة")
        return service

    @router.delete("/services/{service_id}")
    async def delete_service(service_id: str, admin: dict = Depends(_super_admin)):
        res = await main_db.wallet_services.delete_one({"id": service_id})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="الخدمة غير موجودة")
        return {"success": True}

    @router.post("/services/{service_id}/purchase")
    async def purchase_service(service_id: str, user: dict = Depends(block_cashier)):
        service = await main_db.wallet_services.find_one({"id": service_id}, {"_id": 0})
        if not service:
            raise HTTPException(status_code=404, detail="الخدمة غير موجودة")
        if not service.get("is_active", True):
            raise HTTPException(status_code=400, detail="الخدمة غير متاحة حالياً")
        amount = float(service.get("price", 0) or 0)
        entity_id = user.get("tenant_id", user.get("id", ""))
        entity_type = "tenant" if user.get("tenant_id") else "admin"
        wallet = await _get_or_create_wallet(entity_id, entity_type)
        if wallet.get("balance", 0) < amount:
            raise HTTPException(status_code=400, detail="الرصيد غير كافي لشراء هذه الخدمة")
        by_label = user.get("name", user.get("email", ""))
        new_balance, txn = await _record_txn(
            wallet, "debit", amount, "service", service_id,
            f"شراء خدمة: {service.get('name_ar', '')}", by_label,
        )
        purchase = {
            "id": str(uuid.uuid4()),
            "service_id": service_id,
            "service_name": service.get("name_ar", ""),
            "entity_id": entity_id,
            "entity_type": entity_type,
            "entity_name": user.get("company_name") or user.get("name") or user.get("email", ""),
            "amount": amount,
            "currency": service.get("currency", "DZD"),
            "transaction_id": txn["id"],
            "created_by": by_label,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await main_db.wallet_service_purchases.insert_one(dict(purchase))
        return {"message": "تم شراء الخدمة من المحفظة", "new_balance": new_balance, "purchase": purchase}

    @router.get("/services/purchases")
    async def list_service_purchases(user: dict = Depends(block_cashier)):
        query = {}
        if user.get("role") != "super_admin":
            query["entity_id"] = user.get("tenant_id", user.get("id", ""))
        return await main_db.wallet_service_purchases.find(query, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)

    return router
