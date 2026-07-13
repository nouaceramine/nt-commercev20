"""
Wallet Core Routes - Wallet CRUD, balance, settings, alerts
Extracted from wallet_routes.py (Refactoring: Extract Class)
Following Martin Fowler's Large Class -> Extract Class pattern
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone, timedelta
import uuid

from services.code_generator import generate_code
from services.wallet_service import PLATFORM_WALLET_ID
from utils.permissions import create_cashier_block

DEFAULT_LOW_BALANCE = 1000.0


def create_wallet_core_routes(main_db, get_current_user, get_super_admin, block_cashier) -> dict:
    router = APIRouter(prefix="/wallet", tags=["wallet"])

    def _entity_ref(user):
        if user.get("tenant_id"):
            return user["tenant_id"], "tenant"
        if user.get("role") == "super_admin":
            return PLATFORM_WALLET_ID, "admin"
        return user.get("id", ""), "admin"

    async def _get_or_create_wallet(entity_id, entity_type="tenant"):
        wallet = await main_db.wallets.find_one({"entity_id": entity_id}, {"_id": 0})
        if not wallet:
            wallet = {
                "id": str(uuid.uuid4()),
                "entity_type": entity_type,
                "entity_id": entity_id,
                "balance": 0.0,
                "currency": "DZD",
                "low_balance_threshold": DEFAULT_LOW_BALANCE,
                "auto_pay_subscription": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await main_db.wallets.insert_one(dict(wallet))
        return wallet

    async def _lookup_plan_and_price(tenant):
        sub_type = tenant.get("subscription_type", "monthly")
        plan = await main_db.saas_plans.find_one({"id": tenant.get("plan_id")}, {"_id": 0})
        if sub_type == "monthly":
            price = plan.get("monthly_price", 0) if plan else 0
        elif sub_type == "6months":
            price = plan.get("six_month_price", 0) if plan else 0
        else:
            price = plan.get("yearly_price", 0) if plan else 0
        return plan, sub_type, float(price or 0)

    @router.get("")
    async def get_wallet(user: dict = Depends(block_cashier)):
        entity_id, entity_type = _entity_ref(user)
        wallet = await _get_or_create_wallet(entity_id, entity_type)
        threshold = wallet.get("low_balance_threshold", DEFAULT_LOW_BALANCE)
        wallet["low_balance_threshold"] = threshold
        wallet["auto_pay_subscription"] = wallet.get("auto_pay_subscription", False)
        wallet["low_balance"] = wallet.get("balance", 0) < threshold

        subscription_due = 0.0
        subscription_overdue = False
        subscription_ends_at = None
        if entity_type == "tenant":
            tenant = await main_db.saas_tenants.find_one({"id": entity_id}, {"_id": 0})
            if tenant:
                _plan, _sub_type, period_price = await _lookup_plan_and_price(tenant)
                subscription_ends_at = tenant.get("subscription_ends_at")
                now = datetime.now(timezone.utc)
                if subscription_ends_at:
                    try:
                        end_dt = datetime.fromisoformat(subscription_ends_at.replace('Z', '+00:00'))
                        if end_dt < now:
                            subscription_overdue = True
                            subscription_due = period_price
                    except Exception:
                        pass
        wallet["subscription_due"] = subscription_due
        wallet["subscription_overdue"] = subscription_overdue
        wallet["subscription_ends_at"] = subscription_ends_at

        platform_purchase_debt = 0.0
        platform_purchase_count = 0
        if entity_type == "tenant":
            agg = await main_db.supplier_orders.aggregate([
                {"$match": {"tenant_id": entity_id, "status": {"$in": ["pending", "unpaid", "credit"]}}},
                {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
            ]).to_list(1)
            if agg:
                platform_purchase_debt = float(agg[0].get("total") or 0)
                platform_purchase_count = int(agg[0].get("count") or 0)
        wallet["platform_purchase_debt"] = platform_purchase_debt
        wallet["platform_purchase_count"] = platform_purchase_count
        wallet["total_platform_debt"] = subscription_due + platform_purchase_debt
        return wallet

    @router.post("/add-funds")
    async def add_funds(data: dict, admin: dict = Depends(get_super_admin)):
        entity_id = data.get("entity_id", "")
        amount = data.get("amount", 0)
        payment_method = (data.get("payment_method") or "cash").lower()
        if payment_method not in ("cash", "credit"):
            raise HTTPException(status_code=400, detail="payment_method يجب أن يكون cash أو credit")
        if amount <= 0:
            raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون أكبر من صفر")
        wallet = await main_db.wallets.find_one({"entity_id": entity_id}, {"_id": 0})
        if not wallet:
            raise HTTPException(status_code=404, detail="المحفظة غير موجودة")
        old_balance = wallet.get("balance", 0)
        new_balance = old_balance + amount
        await main_db.wallets.update_one({"entity_id": entity_id}, {"$set": {"balance": new_balance}})
        if payment_method == "credit" and wallet.get("entity_type") == "tenant":
            await main_db.wallets.update_one(
                {"entity_id": entity_id},
                {"$inc": {"credit_debt": float(amount)}},
            )
        code = await generate_code(main_db, "wallet_transactions", "PF", 5, with_year=True)
        txn = {
            "id": str(uuid.uuid4()),
            "code": code,
            "wallet_id": wallet["id"],
            "transaction_type": "credit",
            "payment_method": payment_method,
            "amount": amount,
            "balance_before": old_balance,
            "balance_after": new_balance,
            "reference_type": "admin_deposit",
            "reference_id": "",
            "description": data.get("description", "إيداع نقدي إداري" if payment_method == "cash" else "إيداع بالدين"),
            "status": "completed",
            "created_by": admin.get("name", admin.get("email", "")),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await main_db.wallet_transactions.insert_one(txn)
        txn.pop("_id", None)
        try:
            from routes.saas.tenant_debts_routes import invalidate_tenant_debts_cache
            await invalidate_tenant_debts_cache()
        except Exception:
            pass
        return {"message": "تم الإيداع", "new_balance": new_balance, "payment_method": payment_method, "transaction": txn}

    @router.post("/deduct")
    async def deduct_funds(data: dict, admin: dict = Depends(get_super_admin)):
        entity_id = data.get("entity_id", "")
        amount = data.get("amount", 0)
        if amount <= 0:
            raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون أكبر من صفر")
        wallet = await main_db.wallets.find_one({"entity_id": entity_id}, {"_id": 0})
        if not wallet:
            raise HTTPException(status_code=404, detail="المحفظة غير موجودة")
        old_balance = wallet.get("balance", 0)
        if old_balance < amount:
            raise HTTPException(status_code=400, detail="الرصيد غير كافي")
        new_balance = old_balance - amount
        await main_db.wallets.update_one({"entity_id": entity_id}, {"$set": {"balance": new_balance}})
        code = await generate_code(main_db, "wallet_transactions", "PF", 5, with_year=True)
        txn = {
            "id": str(uuid.uuid4()),
            "code": code,
            "wallet_id": wallet["id"],
            "transaction_type": "debit",
            "amount": amount,
            "balance_before": old_balance,
            "balance_after": new_balance,
            "reference_type": data.get("reference_type", "admin_withdrawal"),
            "reference_id": data.get("reference_id", ""),
            "description": data.get("description", "خصم إداري"),
            "status": "completed",
            "created_by": admin.get("name", admin.get("email", "")),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await main_db.wallet_transactions.insert_one(txn)
        txn.pop("_id", None)
        return {"message": "تم الخصم", "new_balance": new_balance, "transaction": txn}

    @router.get("/all")
    async def get_all_wallets(admin: dict = Depends(get_super_admin)):
        return await main_db.wallets.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)

    @router.get("/stats")
    async def get_wallet_stats(user: dict = Depends(block_cashier)):
        total_wallets = await main_db.wallets.count_documents({})
        balance_agg = await main_db.wallets.aggregate([
            {"$group": {"_id": None, "total": {"$sum": "$balance"}}}
        ]).to_list(1)
        total_txns = await main_db.wallet_transactions.count_documents({})
        total_transfers = await main_db.wallet_transfers.count_documents({})
        return {
            "total_wallets": total_wallets,
            "total_balance": balance_agg[0]["total"] if balance_agg else 0,
            "total_transactions": total_txns,
            "total_transfers": total_transfers,
        }

    @router.put("/settings")
    async def update_wallet_settings(data: dict, user: dict = Depends(block_cashier)):
        if data.get("entity_id") and user.get("role") == "super_admin":
            entity_id = data["entity_id"]
            entity_type = "tenant"
        else:
            entity_id, entity_type = _entity_ref(user)
        await _get_or_create_wallet(entity_id, entity_type)
        updates = {}
        if "low_balance_threshold" in data:
            updates["low_balance_threshold"] = float(data["low_balance_threshold"])
        if "auto_pay_subscription" in data:
            updates["auto_pay_subscription"] = bool(data["auto_pay_subscription"])
        if updates:
            await main_db.wallets.update_one({"entity_id": entity_id}, {"$set": updates})
        return await main_db.wallets.find_one({"entity_id": entity_id}, {"_id": 0})

    @router.get("/alerts")
    async def get_wallet_alerts(entity_id: str = None, unread_only: bool = False, user: dict = Depends(block_cashier)):
        if not entity_id or user.get("role") != "super_admin":
            entity_id = user.get("tenant_id", user.get("id", ""))
        query = {"entity_id": entity_id}
        if unread_only:
            query["read"] = False
        return await main_db.wallet_alerts.find(query, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)

    @router.put("/alerts/{alert_id}/read")
    async def mark_alert_read(alert_id: str, user: dict = Depends(block_cashier)):
        query = {"id": alert_id}
        if user.get("role") != "super_admin":
            query["entity_id"] = user.get("tenant_id", user.get("id", ""))
        await main_db.wallet_alerts.update_one(query, {"$set": {"read": True}})
        return {"success": True}

    @router.put("/auto-pay")
    async def set_auto_pay(data: dict, user: dict = Depends(block_cashier)):
        entity_id, entity_type = _entity_ref(user)
        await _get_or_create_wallet(entity_id, entity_type)
        enabled = bool(data.get("enabled", data.get("auto_pay_subscription", False)))
        await main_db.wallets.update_one({"entity_id": entity_id}, {"$set": {"auto_pay_subscription": enabled}})
        return {"auto_pay_subscription": enabled}

    return router
