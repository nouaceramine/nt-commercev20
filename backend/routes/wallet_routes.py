"""
Wallet & Payment System Routes
Collections: wallets, wallet_transactions, wallet_transfers
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from pymongo import ReturnDocument
import uuid

from services.code_generator import generate_code
from services.wallet_service import PLATFORM_WALLET_ID, enrich_transfers
from utils.permissions import create_cashier_block

DEFAULT_LOW_BALANCE = 1000.0


def create_wallet_routes(db, main_db, get_current_user, get_tenant_admin, get_super_admin) -> dict:
    router = APIRouter(prefix="/wallet", tags=["wallet"])
    block_cashier = create_cashier_block(get_current_user)

    # ── Helpers ──
    def _entity_ref(user):
        """Resolve the wallet a user owns. The super admin owns THE single platform
        main wallet (المحفظة الرئيسية) that sells balance down the chain."""
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
        """Apply a credit/debit to a wallet atomically, log the transaction, and raise a low-balance alert if needed.

        Debits use a conditional ($gte) + $inc update so concurrent debits cannot double-spend a balance.
        """
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
        """Charge a tenant's subscription fee from their wallet and extend the subscription."""
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
            current_end = datetime.fromisoformat(current_end_str.replace('Z', '+00:00'))
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

    # ── Get Wallet ──
    @router.get("")
    async def get_wallet(user: dict = Depends(block_cashier)):
        entity_id, entity_type = _entity_ref(user)
        wallet = await _get_or_create_wallet(entity_id, entity_type)
        threshold = wallet.get("low_balance_threshold", DEFAULT_LOW_BALANCE)
        wallet["low_balance_threshold"] = threshold
        wallet["auto_pay_subscription"] = wallet.get("auto_pay_subscription", False)
        wallet["low_balance"] = wallet.get("balance", 0) < threshold
        return wallet

    # ── Add Funds (Admin) ──
    @router.post("/add-funds")
    async def add_funds(data: dict, admin: dict = Depends(get_super_admin)):
        entity_id = data.get("entity_id", "")
        amount = data.get("amount", 0)
        if amount <= 0:
            raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون أكبر من صفر")
        wallet = await main_db.wallets.find_one({"entity_id": entity_id}, {"_id": 0})
        if not wallet:
            raise HTTPException(status_code=404, detail="المحفظة غير موجودة")
        old_balance = wallet.get("balance", 0)
        new_balance = old_balance + amount
        await main_db.wallets.update_one({"entity_id": entity_id}, {"$set": {"balance": new_balance}})
        code = await generate_code(main_db, "wallet_transactions", "PF", 5, with_year=True)
        txn = {
            "id": str(uuid.uuid4()),
            "code": code,
            "wallet_id": wallet["id"],
            "transaction_type": "credit",
            "amount": amount,
            "balance_before": old_balance,
            "balance_after": new_balance,
            "reference_type": "admin_deposit",
            "reference_id": "",
            "description": data.get("description", "إيداع إداري"),
            "status": "completed",
            "created_by": admin.get("name", admin.get("email", "")),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await main_db.wallet_transactions.insert_one(txn)
        txn.pop("_id", None)
        return {"message": "تم الإيداع", "new_balance": new_balance, "transaction": txn}

    # ── Deduct Funds ──
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

    # ── Transfers ──
    @router.post("/transfer")
    async def transfer_funds(data: dict, admin: dict = Depends(get_super_admin)):
        from_id = data.get("from_entity_id", "")
        to_id = data.get("to_entity_id", "")
        amount = data.get("amount", 0)
        fee = data.get("fee", 0)
        if amount <= 0:
            raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون أكبر من صفر")

        from_wallet = await main_db.wallets.find_one({"entity_id": from_id}, {"_id": 0})
        to_wallet = await main_db.wallets.find_one({"entity_id": to_id}, {"_id": 0})
        if not from_wallet or not to_wallet:
            raise HTTPException(status_code=404, detail="محفظة غير موجودة")
        if from_wallet.get("balance", 0) < (amount + fee):
            raise HTTPException(status_code=400, detail="الرصيد غير كافي")

        from_old = from_wallet["balance"]
        to_old = to_wallet["balance"]
        net_amount = amount - fee

        await main_db.wallets.update_one({"entity_id": from_id}, {"$inc": {"balance": -(amount + fee)}})
        await main_db.wallets.update_one({"entity_id": to_id}, {"$inc": {"balance": net_amount}})

        count = await main_db.wallet_transfers.count_documents({}) + 1
        transfer = {
            "id": str(uuid.uuid4()),
            "transfer_number": f"TRF-{count:05d}",
            "from_entity_type": data.get("from_entity_type", "tenant"),
            "from_entity_id": from_id,
            "to_entity_type": data.get("to_entity_type", "tenant"),
            "to_entity_id": to_id,
            "amount": amount,
            "fee": fee,
            "net_amount": net_amount,
            "status": "completed",
            "description": data.get("description", ""),
            "created_by": admin.get("name", admin.get("email", "")),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await main_db.wallet_transfers.insert_one(transfer)
        transfer.pop("_id", None)
        return transfer

    # ── Transaction History ──
    @router.get("/transactions")
    async def get_transactions(
        entity_id: Optional[str] = None,
        transaction_type: Optional[str] = None,
        limit: int = 100,
        user: dict = Depends(block_cashier)
    ):
        # Non-super-admins may only read their own wallet; ignore any supplied entity_id.
        if user.get("role") != "super_admin" or not entity_id:
            entity_id = _entity_ref(user)[0]
        wallet = await main_db.wallets.find_one({"entity_id": entity_id}, {"_id": 0})
        if not wallet:
            return []
        query = {"wallet_id": wallet["id"]}
        if transaction_type:
            query["transaction_type"] = transaction_type
        return await main_db.wallet_transactions.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)

    @router.get("/transactions/paginated")
    async def get_transactions_paginated(
        entity_id: Optional[str] = None,
        transaction_type: Optional[str] = None,
        page: int = 1, page_size: int = 20,
        user: dict = Depends(block_cashier)
    ):
        from utils.pagination import paginate
        # Non-super-admins may only read their own wallet; ignore any supplied entity_id.
        if user.get("role") != "super_admin" or not entity_id:
            entity_id = _entity_ref(user)[0]
        wallet = await main_db.wallets.find_one({"entity_id": entity_id}, {"_id": 0})
        if not wallet:
            return {"items": [], "total": 0, "page": 1, "per_page": page_size, "total_pages": 0}
        query = {"wallet_id": wallet["id"]}
        if transaction_type:
            query["transaction_type"] = transaction_type
        return await paginate(main_db.wallet_transactions, query, page, page_size)

    @router.get("/transfers")
    async def get_transfers(
        entity_id: Optional[str] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        ref_type: Optional[str] = None,
        page: int = 1,
        page_size: int = 30,
        admin: dict = Depends(get_super_admin),
    ):
        """Return all wallet transfers (super-admin). Filterable by entity, date range, and reference type."""
        query: dict = {}
        if entity_id:
            query["$or"] = [{"from_entity_id": entity_id}, {"to_entity_id": entity_id}]
        if ref_type:
            query["reference_type"] = ref_type
        if from_date or to_date:
            dq: dict = {}
            if from_date:
                dq["$gte"] = from_date
            if to_date:
                dq["$lte"] = to_date + "T23:59:59"
            query["created_at"] = dq
        total = await main_db.wallet_transfers.count_documents(query)
        skip = max(0, (page - 1) * page_size)
        rows = await main_db.wallet_transfers.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)
        rows = await enrich_transfers(main_db, rows)
        return {
            "items": rows,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, (total + page_size - 1) // page_size),
        }

    @router.get("/all")
    async def get_all_wallets(admin: dict = Depends(get_super_admin)):
        """List all wallets (admin only)"""
        return await main_db.wallets.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)

    # ── Stats ──
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

    # ── Wallet Settings (low-balance threshold + auto-pay) ──
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

    # ── Low-balance Alerts ──
    @router.get("/alerts")
    async def get_wallet_alerts(entity_id: Optional[str] = None, unread_only: bool = False, user: dict = Depends(block_cashier)):
        if not entity_id or user.get("role") != "super_admin":
            entity_id = user.get("tenant_id", user.get("id", ""))
        query = {"entity_id": entity_id}
        if unread_only:
            query["read"] = False
        return await main_db.wallet_alerts.find(query, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)

    @router.put("/alerts/{alert_id}/read")
    async def mark_alert_read(alert_id: str, user: dict = Depends(block_cashier)):
        # Scope by ownership: non-super-admins can only mark their own alerts read.
        query = {"id": alert_id}
        if user.get("role") != "super_admin":
            query["entity_id"] = user.get("tenant_id", user.get("id", ""))
        await main_db.wallet_alerts.update_one(query, {"$set": {"read": True}})
        return {"success": True}

    # ── Top-up / Withdraw Requests (with super-admin approval) ──
    @router.post("/requests")
    async def create_wallet_request(data: dict, user: dict = Depends(block_cashier)):
        request_type = data.get("request_type", "topup")
        if request_type not in ["topup", "withdraw"]:
            raise HTTPException(status_code=400, detail="نوع الطلب غير صحيح")
        amount = float(data.get("amount", 0) or 0)
        if amount <= 0:
            raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون أكبر من صفر")
        entity_id, entity_type = _entity_ref(user)
        wallet = await _get_or_create_wallet(entity_id, entity_type)
        if request_type == "withdraw" and wallet.get("balance", 0) < amount:
            raise HTTPException(status_code=400, detail="الرصيد غير كافي لطلب السحب")
        # Route a tenant's request to its parent distributor (agent) so that agent can
        # approve it from their own wallet; super admin can always approve too.
        route_agent_id = ""
        if entity_type == "tenant":
            t = await main_db.saas_tenants.find_one({"id": entity_id}, {"_id": 0, "agent_id": 1})
            route_agent_id = (t or {}).get("agent_id", "") or ""
        req = {
            "id": str(uuid.uuid4()),
            "entity_id": entity_id,
            "entity_type": entity_type,
            "entity_name": user.get("company_name") or user.get("name") or user.get("email", ""),
            "route_agent_id": route_agent_id,
            "request_type": request_type,
            "amount": amount,
            "method": data.get("method", ""),
            "note": data.get("note", ""),
            "status": "pending",
            "created_by": user.get("name", user.get("email", "")),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "processed_by": None,
            "processed_at": None,
        }
        await main_db.wallet_requests.insert_one(dict(req))
        return req

    @router.get("/requests")
    async def list_wallet_requests(status: Optional[str] = None, user: dict = Depends(block_cashier)):
        query = {}
        if user.get("role") != "super_admin":
            query["entity_id"] = user.get("tenant_id", user.get("id", ""))
        if status:
            query["status"] = status
        return await main_db.wallet_requests.find(query, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)

    @router.post("/requests/{request_id}/approve")
    async def approve_wallet_request(request_id: str, admin: dict = Depends(get_super_admin)):
        # Atomically claim the request so two concurrent approvals can't both move money.
        req = await main_db.wallet_requests.find_one_and_update(
            {"id": request_id, "status": "pending"},
            {"$set": {"status": "processing"}},
            projection={"_id": 0},
        )
        if not req:
            existing = await main_db.wallet_requests.find_one({"id": request_id})
            if not existing:
                raise HTTPException(status_code=404, detail="الطلب غير موجود")
            raise HTTPException(status_code=400, detail="تمت معالجة الطلب مسبقاً")
        try:
            return await _do_approve(request_id, req, admin)
        except Exception:
            # Release the claim so the request can be retried.
            await main_db.wallet_requests.update_one(
                {"id": request_id, "status": "processing"}, {"$set": {"status": "pending"}},
            )
            raise

    async def _do_approve(request_id, req, admin):
        recipient = await _get_or_create_wallet(req["entity_id"], req.get("entity_type", "tenant"))
        main_wallet = await _get_or_create_wallet(PLATFORM_WALLET_ID, "admin")
        amount = req["amount"]
        by_label = admin.get("name", admin.get("email", ""))
        if req["request_type"] == "topup":
            # Super admin SELLS balance from the platform main wallet to the recipient.
            if main_wallet.get("balance", 0) < amount:
                raise HTTPException(status_code=400, detail="المحفظة الرئيسية لا تحتوي على رصيد كافٍ، يرجى شحنها أولاً")
            await _record_txn(main_wallet, "debit", amount, "topup_sale", request_id,
                              f"بيع رصيد إلى {req.get('entity_name', '')}", by_label)
            try:
                new_balance, txn = await _record_txn(recipient, "credit", amount, "topup_request", request_id,
                                                     req.get("note") or "شحن رصيد المحفظة", by_label)
            except Exception:
                await _record_txn(main_wallet, "credit", amount, "topup_sale_refund", request_id,
                                  "استرجاع بيع فاشل", by_label)
                raise
        else:
            if recipient.get("balance", 0) < amount:
                raise HTTPException(status_code=400, detail="الرصيد غير كافي")
            new_balance, txn = await _record_txn(recipient, "debit", amount, "withdraw_request", request_id,
                                                 req.get("note") or "سحب من المحفظة", by_label)
            # The withdrawn balance flows back into the platform main wallet.
            await _record_txn(main_wallet, "credit", amount, "withdraw_return", request_id,
                              f"استرجاع رصيد من {req.get('entity_name', '')}", by_label)
        await main_db.wallet_requests.update_one({"id": request_id}, {"$set": {
            "status": "approved",
            "processed_by": by_label,
            "processed_at": datetime.now(timezone.utc).isoformat(),
        }})
        return {"message": "تمت الموافقة على الطلب", "new_balance": new_balance, "transaction": txn}

    @router.post("/requests/{request_id}/reject")
    async def reject_wallet_request(request_id: str, data: Optional[dict] = None, admin: dict = Depends(get_super_admin)):
        req = await main_db.wallet_requests.find_one({"id": request_id}, {"_id": 0})
        if not req:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")
        if req.get("status") != "pending":
            raise HTTPException(status_code=400, detail="تمت معالجة الطلب مسبقاً")
        await main_db.wallet_requests.update_one({"id": request_id}, {"$set": {
            "status": "rejected",
            "reject_reason": (data or {}).get("reason", ""),
            "processed_by": admin.get("name", admin.get("email", "")),
            "processed_at": datetime.now(timezone.utc).isoformat(),
        }})
        return {"message": "تم رفض الطلب"}

    # ── Subscription Payment from Wallet ──
    @router.post("/pay-subscription")
    async def pay_subscription(user: dict = Depends(block_cashier)):
        tenant_id = user.get("tenant_id") or user.get("id", "")
        tenant = await main_db.saas_tenants.find_one({"id": tenant_id})
        if not tenant:
            raise HTTPException(status_code=404, detail="المتجر غير موجود")
        result = await _charge_subscription(tenant, user.get("name", user.get("email", "")))
        return {"message": "تم دفع الاشتراك من المحفظة", **result}

    @router.put("/auto-pay")
    async def set_auto_pay(data: dict, user: dict = Depends(block_cashier)):
        entity_id, entity_type = _entity_ref(user)
        await _get_or_create_wallet(entity_id, entity_type)
        enabled = bool(data.get("enabled", data.get("auto_pay_subscription", False)))
        await main_db.wallets.update_one({"entity_id": entity_id}, {"$set": {"auto_pay_subscription": enabled}})
        return {"auto_pay_subscription": enabled}

    @router.post("/process-auto-pay")
    async def process_auto_pay(days_before: int = 3, admin: dict = Depends(get_super_admin)):
        """Charge subscription from wallet for all tenants with auto-pay enabled whose subscription is due."""
        now = datetime.now(timezone.utc)
        cutoff = now + timedelta(days=days_before)
        wallets = await main_db.wallets.find({"auto_pay_subscription": True}, {"_id": 0}).to_list(1000)
        results = {"processed": [], "skipped": [], "failed": []}
        for w in wallets:
            tenant = await main_db.saas_tenants.find_one({"id": w["entity_id"]})
            if not tenant:
                results["skipped"].append({"entity_id": w["entity_id"], "reason": "ليس متجراً"})
                continue
            end_str = tenant.get("subscription_ends_at")
            try:
                end = datetime.fromisoformat(end_str.replace('Z', '+00:00')) if end_str else now
            except Exception:
                end = now
            if end > cutoff:
                results["skipped"].append({"tenant_id": tenant["id"], "reason": "الاشتراك غير مستحق بعد"})
                continue
            try:
                res = await _charge_subscription(tenant, "auto")
                results["processed"].append({"tenant_id": tenant["id"], **res})
            except HTTPException as e:
                results["failed"].append({"tenant_id": tenant["id"], "reason": e.detail})
        return results

    # ── Paid Services Catalog (managed by super admin, paid from wallet balance) ──
    @router.get("/services")
    async def list_services(active_only: bool = False, user: dict = Depends(block_cashier)):
        """List services. Non-super-admins only ever see active services."""
        query = {}
        if active_only or user.get("role") != "super_admin":
            query["is_active"] = True
        return await main_db.wallet_services.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

    @router.post("/services")
    async def create_service(data: dict, admin: dict = Depends(get_super_admin)):
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
    async def update_service(service_id: str, data: dict, admin: dict = Depends(get_super_admin)):
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
    async def delete_service(service_id: str, admin: dict = Depends(get_super_admin)):
        res = await main_db.wallet_services.delete_one({"id": service_id})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="الخدمة غير موجودة")
        return {"success": True}

    @router.post("/services/{service_id}/purchase")
    async def purchase_service(service_id: str, user: dict = Depends(block_cashier)):
        """Pay for a service from the caller's own wallet balance."""
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
        """Purchase history: super admin sees all, others see only their own."""
        query = {}
        if user.get("role") != "super_admin":
            query["entity_id"] = user.get("tenant_id", user.get("id", ""))
        return await main_db.wallet_service_purchases.find(query, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)

    return router
