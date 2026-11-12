"""
Wallet Transactions & Transfers Routes
Extracted from wallet_routes.py (Refactoring: Extract Class)
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone
import uuid

from services.wallet_service import enrich_transfers


def create_wallet_transactions_routes(main_db, get_current_user, get_super_admin, block_cashier) -> dict:
    router = APIRouter(prefix="/wallet", tags=["wallet"])

    def _entity_ref(user):
        if user.get("tenant_id"):
            return user["tenant_id"], "tenant"
        if user.get("role") == "super_admin":
            from services.wallet_service import PLATFORM_WALLET_ID
            return PLATFORM_WALLET_ID, "admin"
        return user.get("id", ""), "admin"

    @router.get("/transactions")
    async def get_transactions(
        entity_id: Optional[str] = None,
        transaction_type: Optional[str] = None,
        limit: int = 100,
        user: dict = Depends(block_cashier)
    ):
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
        current_user: dict = Depends(get_current_user),
    ):
        role = current_user.get("role")
        user_type = current_user.get("user_type") or current_user.get("type")
        is_super = role == "super_admin" or user_type == "super_admin"

        query: dict = {}
        if is_super:
            if entity_id:
                query["$or"] = [{"from_entity_id": entity_id}, {"to_entity_id": entity_id}]
        else:
            own_id = current_user.get("tenant_id") or current_user.get("id")
            if not own_id:
                return {"items": [], "total": 0, "page": page, "per_page": page_size, "total_pages": 0}
            query["$or"] = [{"from_entity_id": own_id}, {"to_entity_id": own_id}]
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

    @router.post("/transfer")
    async def transfer_funds(data: dict, admin: dict = Depends(get_super_admin)):
        # p495c: validated, race-safe, transactional transfer.
        # Conservation: source pays `amount`, destination receives
        # `amount - fee`, and the platform wallet collects `fee`.
        from config.database import client as _client
        from pymongo import ReturnDocument
        from pymongo.errors import PyMongoError
        from services.code_generator import next_code
        from services.wallet_service import (
            PLATFORM_WALLET_ID, get_or_create_wallet as _gcw)
        from utils.money import parse_amount

        from_id = (data.get("from_entity_id") or "").strip()
        to_id = (data.get("to_entity_id") or "").strip()
        amount = parse_amount(data.get("amount", 0))
        fee = parse_amount(data.get("fee", 0), allow_zero=True)
        if fee >= amount:
            raise HTTPException(status_code=400,
                                detail="العمولة يجب أن تكون أقل من المبلغ")
        if from_id == to_id:
            raise HTTPException(status_code=400,
                                detail="لا يمكن التحويل إلى المحفظة نفسها")

        from_wallet = await main_db.wallets.find_one({"entity_id": from_id}, {"_id": 0})
        to_wallet = await main_db.wallets.find_one({"entity_id": to_id}, {"_id": 0})
        if not from_wallet or not to_wallet:
            raise HTTPException(status_code=404, detail="محفظة غير موجودة")
        if from_wallet.get("balance", 0) < amount:
            raise HTTPException(status_code=400, detail="الرصيد غير كافي")
        if fee > 0:
            await _gcw(main_db, PLATFORM_WALLET_ID, "admin")

        net_amount = round(amount - fee, 2)
        number = await next_code(main_db, "wallet_transfers", "TRF-", 5,
                                 with_year=False, field="transfer_number")
        transfer = {
            "id": str(uuid.uuid4()),
            "transfer_number": number,
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
        for _attempt in range(5):
            try:
                async with await _client.start_session() as session:
                    async with session.start_transaction():
                        debited = await main_db.wallets.find_one_and_update(
                            {"entity_id": from_id, "balance": {"$gte": amount}},
                            {"$inc": {"balance": -amount}},
                            return_document=ReturnDocument.AFTER,
                            session=session)
                        if not debited:
                            raise HTTPException(status_code=400,
                                                detail="الرصيد غير كافي")
                        await main_db.wallets.update_one(
                            {"entity_id": to_id},
                            {"$inc": {"balance": net_amount}}, session=session)
                        if fee > 0:
                            await main_db.wallets.update_one(
                                {"entity_id": PLATFORM_WALLET_ID},
                                {"$inc": {"balance": fee}}, session=session)
                        await main_db.wallet_transfers.insert_one(
                            dict(transfer), session=session)
                break
            except PyMongoError as _exc:
                if _attempt == 4 or not _exc.has_error_label(
                        "TransientTransactionError"):
                    raise
                import asyncio as _asyncio
                await _asyncio.sleep(0.03 * (2 ** _attempt))
        return transfer

    return router
