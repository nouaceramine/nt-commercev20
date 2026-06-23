"""
Bank Integration Routes
Bank accounts, transactions, reconciliation
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/banking", tags=["Banking"])


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
        result = await db.bank_accounts.delete_one({"id": account_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Account not found")
        return {"success": True}

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
        # Verify account exists
        account = await db.bank_accounts.find_one({"id": tx.bank_account_id})
        if not account:
            raise HTTPException(status_code=404, detail="Bank account not found")

        doc = tx.model_dump()
        doc["id"] = str(uuid.uuid4())
        doc["tenant_id"] = current_user.get("tenant_id")
        doc["created_by"] = current_user.get("name", "")
        doc["created_at"] = datetime.now(timezone.utc).isoformat()

        # Update account balance
        balance_change = doc["amount"] if doc["type"] in ["deposit", "interest"] else -doc["amount"]
        new_balance = account.get("current_balance", 0) + balance_change

        await db.bank_accounts.update_one(
            {"id": tx.bank_account_id},
            {"$set": {
                "current_balance": round(new_balance, 2),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }}
        )

        doc["balance_after"] = round(new_balance, 2)
        await db.bank_transactions.insert_one(doc)
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
