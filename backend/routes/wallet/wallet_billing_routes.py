"""
Wallet billing routes: pay-subscription & settle-credit.
Extracted from the legacy wallet_routes aggregator.
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone, timedelta
from pymongo import ReturnDocument
import uuid

from services.code_generator import generate_code
from services.wallet_service import PLATFORM_WALLET_ID
from utils.permissions import create_cashier_block

DEFAULT_LOW_BALANCE = 1000.0


def create_wallet_billing_routes(db, main_db, get_current_user, get_super_admin) -> dict:
    router = APIRouter(prefix="/wallet", tags=["wallet-billing"])
    block_cashier = create_cashier_block(get_current_user)

    # ── Helpers ──
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

    async def _record_txn(wallet, txn_type, amount, ref_type, ref_id, description, created_by):
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
        code = await generate_code(main_db, "wallet_transactions", "PF", 5, with_year=True)
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
        threshold = wallet.get("low_balance_threshold", DEFAULT_LOW_BALANCE)
        if new_balance < threshold:
            await main_db.wallet_alerts.insert_one({
                "id": str(uuid.uuid4()),
                "wallet_id": wallet["id"],
                "entity_id": wallet["entity_id"],
                "type": "low_balance",
                "balance": new_balance,
                "threshold": threshold,
                "message": f"الرصيد منخفض: {new_balance:.2f} دج (الحد الأدنى {threshold:.2f} دج)",
                "read": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        wallet["balance"] = new_balance
        return new_balance, txn

    def _plan_price(plan, sub_type):
        if sub_type == "monthly":
            return plan.get("monthly_price", 0)
        if sub_type == "6months":
            return plan.get("six_month_price", 0)
        return plan.get("yearly_price", 0)

    def _period_days(sub_type):
        return {"monthly": 30, "6months": 180}.get(sub_type, 365)

    async def _charge_subscription(tenant, by_label):
        entity_id = tenant["id"]
        plan = await main_db.saas_plans.find_one({"id": tenant.get("plan_id")}, {"_id": 0})
        if not plan:
            raise HTTPException(status_code=404, detail="الخطة غير موجودة")
        sub_type = tenant.get("subscription_type", "monthly")
        amount = float(_plan_price(plan, sub_type) or 0)
        if amount <= 0:
            raise HTTPException(status_code=400, detail="سعر الخطة غير محدد")
        wallet = await _get_or_create_wallet(entity_id, "tenant")
        if wallet.get("balance", 0) < amount:
            raise HTTPException(status_code=400, detail="الرصيد غير كافي لدفع الاشتراك")
        new_balance, txn = await _record_txn(
            wallet, "debit", amount, "subscription", entity_id,
            f"دفع اشتراك ({sub_type})", by_label,
        )
        current_end_str = tenant.get("subscription_ends_at") or datetime.now(timezone.utc).isoformat()
        try:
            current_end = datetime.fromisoformat(current_end_str.replace("Z", "+00:00"))
        except Exception:
            current_end = datetime.now(timezone.utc)
        now = datetime.now(timezone.utc)
        start_date = max(current_end, now)
        new_end = start_date + timedelta(days=_period_days(sub_type))
        await main_db.saas_tenants.update_one({"id": entity_id}, {"$set": {
            "subscription_ends_at": new_end.isoformat(),
            "is_active": True,
            "is_trial": False,
        }})
        await main_db.saas_payments.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": entity_id,
            "tenant_name": tenant.get("name", ""),
            "amount": amount,
            "payment_method": "wallet",
            "subscription_type": sub_type,
            "period_start": start_date.isoformat(),
            "period_end": new_end.isoformat(),
            "notes": "دفع تلقائي من المحفظة" if by_label == "auto" else "دفع من المحفظة",
            "transaction_id": txn["id"],
            "created_by": by_label,
            "created_at": now.isoformat(),
        })
        return {"amount": amount, "new_balance": new_balance, "new_subscription_ends_at": new_end.isoformat()}

    # ── Endpoints ──
    @router.post("/pay-subscription")
    async def pay_subscription(user: dict = Depends(block_cashier)):
        tenant_id = user.get("tenant_id") or user.get("id", "")
        tenant = await main_db.saas_tenants.find_one({"id": tenant_id})
        if not tenant:
            raise HTTPException(status_code=404, detail="المتجر غير موجود")
        result = await _charge_subscription(tenant, user.get("name", user.get("email", "")))
        return {"message": "تم دفع الاشتراك من المحفظة", **result}

    @router.post("/settle-credit")
    async def settle_credit(data: dict, admin: dict = Depends(get_super_admin)):
        """Settle (part of) a tenant's outstanding credit debt."""
        entity_id = data.get("entity_id", "")
        amount = float(data.get("amount") or 0)
        description = data.get("description") or "تسديد دين"
        if amount <= 0:
            raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون أكبر من صفر")
        wallet = await main_db.wallets.find_one({"entity_id": entity_id}, {"_id": 0})
        if not wallet:
            raise HTTPException(status_code=404, detail="المحفظة غير موجودة")
        current_debt = float(wallet.get("credit_debt") or 0)
        if amount > current_debt:
            raise HTTPException(status_code=400, detail="المبلغ يفوق الدين المسجَّل")
        new_debt = round(current_debt - amount, 2)
        await main_db.wallets.update_one({"entity_id": entity_id}, {"$set": {"credit_debt": new_debt}})
        code = await generate_code(main_db, "wallet_transactions", "PF", 5, with_year=True)
        txn = {
            "id": str(uuid.uuid4()),
            "code": code,
            "wallet_id": wallet["id"],
            "entity_id": entity_id,
            "transaction_type": "credit_settlement",
            "amount": amount,
            "balance_before": current_debt,
            "balance_after": new_debt,
            "reference_type": "debt_settlement",
            "reference_id": "",
            "description": description,
            "status": "completed",
            "created_by": admin.get("name", admin.get("email", "")),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await main_db.wallet_transactions.insert_one(dict(txn))
        try:
            from routes.saas.tenant_debts_routes import invalidate_tenant_debts_cache
            await invalidate_tenant_debts_cache()
        except Exception:
            pass
        return {"message": "تم التسديد", "credit_debt_remaining": new_debt}

    return router
