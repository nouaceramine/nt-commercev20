"""
Bank Integration Routes
Bank accounts, transactions, reconciliation
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import asyncio
import math
import uuid
import logging

from pymongo.errors import PyMongoError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/banking", tags=["Banking"])

# p505: whitelisted movement types - deposit/interest add, the rest subtract.
_TX_TYPES = {"deposit", "withdrawal", "transfer", "fee", "interest"}


class BankAccount(BaseModel):
    bank_name: str
    bank_name_ar: str = ""
    account_number: str
    iban: str = ""
    swift_code: str = ""
    account_type: str = "current"  # current, savings, business
    currency: str = "DZD"
    initial_balance: float = 0
    is_primary: bool = False


class BankTransaction(BaseModel):
    bank_account_id: str
    type: str  # deposit, withdrawal, transfer, fee, interest
    amount: float
    description: str = ""
    reference: str = ""
    category: str = ""


class ReconciliationRequest(BaseModel):
    bank_account_id: str
    statement_balance: float
    statement_date: str


def create_banking_routes(db, get_current_user) -> dict:
    """Create banking routes with dependencies"""
    from utils.permissions import create_cashier_block
    block_cashier = create_cashier_block(get_current_user)

    @router.get("/accounts")
    async def get_bank_accounts(current_user: dict = Depends(block_cashier)):
        """Get all bank accounts"""
        tenant_id = current_user.get("tenant_id")
        query = {"tenant_id": tenant_id} if tenant_id else {}
        accounts = await db.bank_accounts.find(query, {"_id": 0}).to_list(50)
        return accounts

    @router.post("/accounts")
    async def create_bank_account(
        account: BankAccount,
        current_user: dict = Depends(block_cashier),
    ):
        """Create a new bank account"""
        # p505-002: NaN/inf initial balance used to poison the account forever
        if not math.isfinite(float(account.initial_balance or 0)):
            raise HTTPException(status_code=400, detail="الرصيد الافتتاحي غير صالح")
        doc = account.model_dump()
        doc["id"] = str(uuid.uuid4())
        doc["tenant_id"] = current_user.get("tenant_id")
        doc["current_balance"] = doc.pop("initial_balance", 0)
        doc["is_active"] = True
        doc["created_at"] = datetime.now(timezone.utc).isoformat()
        doc["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.bank_accounts.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.put("/accounts/{account_id}")
    async def update_bank_account(
        account_id: str,
        account: BankAccount,
        current_user: dict = Depends(block_cashier),
    ):
        update_data = account.model_dump()
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = await db.bank_accounts.update_one(
            {"id": account_id}, {"$set": update_data}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Account not found")
        return {"success": True}

    @router.delete("/accounts/{account_id}")
    async def delete_bank_account(
        account_id: str,
        current_user: dict = Depends(block_cashier),
    ):
        # p505-003: atomic claim - an account holding money cannot vanish
        # silently (same guard as cash boxes). Epsilon absorbs float dust.
        deleted = await db.bank_accounts.find_one_and_delete(
            {"id": account_id,
             "$or": [{"current_balance": {"$gte": -0.005, "$lte": 0.005}},
                     {"current_balance": {"$exists": False}}]})
        if deleted:
            return {"success": True}
        account = await db.bank_accounts.find_one({"id": account_id}, {"_id": 0, "current_balance": 1})
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
        raise HTTPException(status_code=400,
                            detail="لا يمكن حذف حساب بنكي فيه رصيد — سوِّ الرصيد أولاً")

    @router.get("/transactions")
    async def get_transactions(
        account_id: Optional[str] = None,
        limit: int = 50,
        current_user: dict = Depends(block_cashier),
    ):
        """Get bank transactions"""
        tenant_id = current_user.get("tenant_id")
        query = {"tenant_id": tenant_id} if tenant_id else {}
        if account_id:
            query["bank_account_id"] = account_id
        transactions = await db.bank_transactions.find(
            query, {"_id": 0}
        ).sort("created_at", -1).limit(limit).to_list(limit)
        return transactions

    @router.post("/transactions")
    async def create_transaction(
        tx: BankTransaction,
        current_user: dict = Depends(block_cashier),
    ):
        """Record a bank transaction"""
        # p505-002: validate before touching anything - a zero/negative/NaN
        # amount or an unknown type used to move (or poison) real balances.
        if tx.type not in _TX_TYPES:
            raise HTTPException(status_code=400, detail="نوع الحركة غير صالح")
        amount = float(tx.amount or 0)
        if not math.isfinite(amount) or amount <= 0:
            raise HTTPException(status_code=400, detail="المبلغ غير صالح")

        doc = tx.model_dump()
        doc["amount"] = amount
        doc["id"] = str(uuid.uuid4())
        doc["tenant_id"] = current_user.get("tenant_id")
        doc["created_by"] = current_user.get("name", "")
        doc["created_at"] = datetime.now(timezone.utc).isoformat()
        now = doc["created_at"]

        # p505-001: the balance read-modify-write used to run outside any
        # transaction with an absolute $set - concurrent postings lost updates
        # and wrote lying balance_after values. Same pattern as cash-box
        # transfer (p180): transaction + TransientTransactionError retry.
        balance_change = amount if tx.type in ["deposit", "interest"] else -amount
        from config.database import client as _client
        new_balance = None
        for _attempt in range(5):
            try:
                async with await _client.start_session() as _tx:
                    async with _tx.start_transaction():
                        account = await db.bank_accounts.find_one(
                            {"id": tx.bank_account_id}, session=_tx)
                        if not account:
                            raise HTTPException(status_code=404, detail="Bank account not found")
                        new_balance = round(account.get("current_balance", 0) + balance_change, 2)
                        await db.bank_accounts.update_one(
                            {"id": tx.bank_account_id},
                            {"$set": {"current_balance": new_balance, "updated_at": now}},
                            session=_tx,
                        )
                        doc["balance_after"] = new_balance
                        await db.bank_transactions.insert_one(doc, session=_tx)
                break
            except PyMongoError as exc:
                if not exc.has_error_label("TransientTransactionError") or _attempt == 4:
                    raise
                await asyncio.sleep(0.15 * (_attempt + 1))
        doc.pop("_id", None)
        return doc

    @router.get("/summary")
    async def get_banking_summary(current_user: dict = Depends(block_cashier)):
        """Get banking overview summary"""
        tenant_id = current_user.get("tenant_id")
        query = {"tenant_id": tenant_id} if tenant_id else {}
        accounts = await db.bank_accounts.find(query, {"_id": 0}).to_list(50)

        total_balance = sum(a.get("current_balance", 0) for a in accounts)
        active_accounts = sum(1 for a in accounts if a.get("is_active"))

        # Get recent transaction stats
        pipeline = [
            {"$match": {**query}},
            {"$group": {
                "_id": "$type",
                "total": {"$sum": "$amount"},
                "count": {"$sum": 1}
            }}
        ]
        tx_stats = await db.bank_transactions.aggregate(pipeline).to_list(20)
        tx_summary = {s["_id"]: {"total": s["total"], "count": s["count"]} for s in tx_stats}

        return {
            "total_accounts": len(accounts),
            "active_accounts": active_accounts,
            "total_balance": round(total_balance, 2),
            "accounts": accounts,
            "transaction_summary": tx_summary,
        }

    @router.post("/reconcile")
    async def reconcile_account(
        req: ReconciliationRequest,
        current_user: dict = Depends(block_cashier),
    ):
        """Reconcile bank account with statement"""
        account = await db.bank_accounts.find_one({"id": req.bank_account_id})
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")

        system_balance = account.get("current_balance", 0)
        difference = round(req.statement_balance - system_balance, 2)

        reconciliation = {
            "id": str(uuid.uuid4()),
            "bank_account_id": req.bank_account_id,
            "statement_balance": req.statement_balance,
            "system_balance": system_balance,
            "difference": difference,
            "status": "matched" if abs(difference) < 0.01 else "unmatched",
            "statement_date": req.statement_date,
            "reconciled_by": current_user.get("name", ""),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.bank_reconciliations.insert_one(reconciliation)
        reconciliation.pop("_id", None)
        return reconciliation

    @router.get("/reconciliations")
    async def get_reconciliations(
        account_id: Optional[str] = None,
        current_user: dict = Depends(block_cashier),
    ):
        query = {}
        if account_id:
            query["bank_account_id"] = account_id
        recs = await db.bank_reconciliations.find(
            query, {"_id": 0}
        ).sort("created_at", -1).limit(20).to_list(20)
        return recs

    return router
