"""
Wallet Requests Routes - Top-up / Withdraw Requests with Approval
Extracted from wallet_routes.py (Refactoring: Extract Class)
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
import uuid

from services.code_generator import generate_code
from services.wallet_service import PLATFORM_WALLET_ID
from utils.permissions import create_cashier_block


def create_wallet_requests_routes(main_db, get_current_user, get_super_admin, block_cashier) -> dict:
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
        wallet["balance"] = new_balance
        return new_balance, txn

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
    async def list_wallet_requests(status: str = None, user: dict = Depends(block_cashier)):
        query = {}
        if user.get("role") != "super_admin":
            query["entity_id"] = user.get("tenant_id", user.get("id", ""))
        if status:
            query["status"] = status
        return await main_db.wallet_requests.find(query, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)

    @router.post("/requests/{request_id}/approve")
    async def approve_wallet_request(request_id: str, admin: dict = Depends(get_super_admin)):
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
            if main_wallet.get("balance", 0) < amount:
                raise HTTPException(status_code=400, detail="المحفظة الرئيسية لا تحتوي على رصيد كافٍ")
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
            await _record_txn(main_wallet, "credit", amount, "withdraw_return", request_id,
                              f"استرجاع رصيد من {req.get('entity_name', '')}", by_label)
        await main_db.wallet_requests.update_one({"id": request_id}, {"$set": {
            "status": "approved",
            "processed_by": by_label,
            "processed_at": datetime.now(timezone.utc).isoformat(),
        }})
        return {"message": "تمت الموافقة على الطلب", "new_balance": new_balance, "transaction": txn}

    @router.post("/requests/{request_id}/reject")
    async def reject_wallet_request(request_id: str, data: dict = None, admin: dict = Depends(get_super_admin)):
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

    return router
