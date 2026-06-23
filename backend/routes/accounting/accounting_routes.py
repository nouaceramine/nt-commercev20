"""
Accounting Routes for NT Commerce
Handles journal entries, invoices, payments, and financial reports
"""
import logging
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Query
import uuid

from config.database import db
from utils.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/accounting", tags=["Accounting"])


# ============ CHART OF ACCOUNTS ============
    
@router.get("/accounts")
async def get_accounts(
    account_type: Optional[str] = None,
    is_active: bool = True,
    user=Depends(get_current_user)
):
    """Get chart of accounts"""
    query = {}
    if account_type:
        query["account_type"] = account_type
    if is_active is not None:
        query["is_active"] = is_active
    
    accounts = await db.accounts.find(query, {"_id": 0}).sort("code", 1).to_list(500)
    return accounts

@router.post("/accounts", status_code=201)
async def create_account(account: dict, user=Depends(get_current_user)):
    """Create a new account"""
    # Check for duplicate code
    existing = await db.accounts.find_one({"code": account["code"]})
    if existing:
        raise HTTPException(status_code=409, detail="Account code already exists")
    
    account_doc = {
        "id": str(uuid.uuid4()),
        "code": account["code"],
        "name": account["name"],
        "name_ar": account.get("name_ar", account["name"]),
        "account_type": account["account_type"],
        "parent_id": account.get("parent_id"),
        "description": account.get("description", ""),
        "balance": 0,
        "is_active": True,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.accounts.insert_one(account_doc)
    account_doc.pop("_id", None)
    return account_doc

# ============ JOURNAL ENTRIES ============

@router.get("/journal-entries")
async def get_journal_entries(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    user=Depends(get_current_user)
):
    """Get journal entries"""
    query = {}
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        query.setdefault("date", {})["$lte"] = end_date
    if status:
        query["status"] = status
    
    skip = (page - 1) * limit
    entries = await db.journal_entries.find(query, {"_id": 0}).sort("date", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.journal_entries.count_documents(query)
    
    return {"items": entries, "total": total, "page": page, "limit": limit}

@router.post("/journal-entries", status_code=201)
async def create_journal_entry(entry: dict, user=Depends(get_current_user)):
    """Create a new journal entry"""
    # Validate balanced entry
    lines = entry.get("lines", [])
    total_debit = sum(line.get("debit", 0) for line in lines)
    total_credit = sum(line.get("credit", 0) for line in lines)
    
    if abs(total_debit - total_credit) > 0.01:
        raise HTTPException(status_code=400, detail="Journal entry must be balanced")
    
    # Generate entry number
    count = await db.journal_entries.count_documents({})
    entry_number = f"JE{str(count + 1).zfill(6)}"
    
    entry_doc = {
        "id": str(uuid.uuid4()),
        "entry_number": entry_number,
        "date": entry["date"],
        "reference": entry.get("reference", ""),
        "description": entry["description"],
        "lines": lines,
        "total_debit": total_debit,
        "total_credit": total_credit,
        "status": "pending",
        "attachments": entry.get("attachments", []),
        "created_by": user["id"],
        "created_by_name": user.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.journal_entries.insert_one(entry_doc)
    
    # Update account balances
    for line in lines:
        if line.get("account_id"):
            balance_change = line.get("debit", 0) - line.get("credit", 0)
            await db.accounts.update_one(
                {"id": line["account_id"]},
                {"$inc": {"balance": balance_change}}
            )
    
    return entry_doc

@router.put("/journal-entries/{entry_id}/approve")
async def approve_journal_entry(entry_id: str, user=Depends(get_current_user)):
    """Approve a journal entry"""
    result = await db.journal_entries.update_one(
        {"id": entry_id, "status": "pending"},
        {
            "$set": {
                "status": "approved",
                "approved_by": user["id"],
                "approved_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found or already approved")
    
    return {"success": True, "message": "Entry approved"}

# ============ INVOICES ============

@router.get("/invoices")
async def get_invoices(
    invoice_type: Optional[str] = None,
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    supplier_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    user=Depends(get_current_user)
):
    """Get invoices"""
    query = {}
    if invoice_type:
        query["invoice_type"] = invoice_type
    if status:
        query["status"] = status
    if customer_id:
        query["customer_id"] = customer_id
    if supplier_id:
        query["supplier_id"] = supplier_id
    if start_date:
        query["issue_date"] = {"$gte": start_date}
    if end_date:
        query.setdefault("issue_date", {})["$lte"] = end_date
    
    skip = (page - 1) * limit
    invoices = await db.invoices.find(query, {"_id": 0}).sort("issue_date", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.invoices.count_documents(query)
    
    return {"items": invoices, "total": total, "page": page, "limit": limit}

@router.post("/invoices", status_code=201)
async def create_invoice(invoice: dict, user=Depends(get_current_user)):
    """Create a new invoice"""
    # Calculate totals
    items = invoice.get("items", [])
    subtotal = sum(item.get("quantity", 1) * item.get("unit_price", 0) for item in items)
    tax_amount = invoice.get("tax_amount", 0)
    discount_amount = invoice.get("discount_amount", 0)
    total = subtotal + tax_amount - discount_amount
    
    # Generate invoice number
    invoice_type = invoice.get("invoice_type", "sales")
    prefix = "INV" if invoice_type == "sales" else "BILL"
    count = await db.invoices.count_documents({"invoice_type": invoice_type})
    invoice_number = f"{prefix}{str(count + 1).zfill(6)}"
    
    # Get customer/supplier name
    customer_name = ""
    supplier_name = ""
    if invoice.get("customer_id"):
        customer = await db.customers.find_one({"id": invoice["customer_id"]}, {"_id": 0, "name": 1})
        customer_name = customer.get("name", "") if customer else ""
    if invoice.get("supplier_id"):
        supplier = await db.suppliers.find_one({"id": invoice["supplier_id"]}, {"_id": 0, "name": 1})
        supplier_name = supplier.get("name", "") if supplier else ""
    
    invoice_doc = {
        "id": str(uuid.uuid4()),
        "invoice_number": invoice_number,
        "invoice_type": invoice_type,
        "customer_id": invoice.get("customer_id"),
        "customer_name": customer_name,
        "supplier_id": invoice.get("supplier_id"),
        "supplier_name": supplier_name,
        "issue_date": invoice["issue_date"],
        "due_date": invoice["due_date"],
        "items": items,
        "subtotal": subtotal,
        "tax_amount": tax_amount,
        "discount_amount": discount_amount,
        "total": total,
        "paid_amount": 0,
        "balance_due": total,
        "status": "draft",
        "notes": invoice.get("notes", ""),
        "terms": invoice.get("terms", ""),
        "currency": invoice.get("currency", "DZD"),
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.invoices.insert_one(invoice_doc)
    return invoice_doc

@router.put("/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, updates: dict, user=Depends(get_current_user)):
    """Update an invoice"""
    # Recalculate if items changed
    if "items" in updates:
        items = updates["items"]
        subtotal = sum(item.get("quantity", 1) * item.get("unit_price", 0) for item in items)
        updates["subtotal"] = subtotal
        updates["total"] = subtotal + updates.get("tax_amount", 0) - updates.get("discount_amount", 0)
    
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": updates}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    return {"success": True}

@router.put("/invoices/{invoice_id}/send")
async def send_invoice(invoice_id: str, user=Depends(get_current_user)):
    """Mark invoice as sent"""
    result = await db.invoices.update_one(
        {"id": invoice_id, "status": "draft"},
        {"$set": {"status": "sent", "sent_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found or not in draft status")
    return {"success": True}

# ============ PAYMENTS ============

@router.get("/payments")
async def get_payments(
    payment_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    user=Depends(get_current_user)
):
    """Get payments"""
    query = {}
    if payment_type:
        query["payment_type"] = payment_type
    if start_date:
        query["payment_date"] = {"$gte": start_date}
    if end_date:
        query.setdefault("payment_date", {})["$lte"] = end_date
    
    skip = (page - 1) * limit
    payments = await db.payments.find(query, {"_id": 0}).sort("payment_date", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.payments.count_documents(query)
    
    return {"items": payments, "total": total, "page": page, "limit": limit}

@router.post("/payments", status_code=201)
async def create_payment(payment: dict, user=Depends(get_current_user)):
    """Record a payment"""
    # Generate payment number
    payment_type = payment.get("payment_type", "received")
    prefix = "RCP" if payment_type == "received" else "PMT"
    count = await db.payments.count_documents({"payment_type": payment_type})
    payment_number = f"{prefix}{str(count + 1).zfill(6)}"
    
    # Get customer/supplier name
    customer_name = ""
    supplier_name = ""
    invoice_number = ""
    
    if payment.get("customer_id"):
        customer = await db.customers.find_one({"id": payment["customer_id"]}, {"_id": 0, "name": 1})
        customer_name = customer.get("name", "") if customer else ""
    if payment.get("supplier_id"):
        supplier = await db.suppliers.find_one({"id": payment["supplier_id"]}, {"_id": 0, "name": 1})
        supplier_name = supplier.get("name", "") if supplier else ""
    if payment.get("invoice_id"):
        invoice = await db.invoices.find_one({"id": payment["invoice_id"]}, {"_id": 0, "invoice_number": 1})
        invoice_number = invoice.get("invoice_number", "") if invoice else ""
    
    payment_doc = {
        "id": str(uuid.uuid4()),
        "payment_number": payment_number,
        "payment_type": payment_type,
        "invoice_id": payment.get("invoice_id"),
        "invoice_number": invoice_number,
        "customer_id": payment.get("customer_id"),
        "customer_name": customer_name,
        "supplier_id": payment.get("supplier_id"),
        "supplier_name": supplier_name,
        "amount": payment["amount"],
        "payment_method": payment.get("payment_method", "cash"),
        "payment_date": payment["payment_date"],
        "reference": payment.get("reference", ""),
        "notes": payment.get("notes", ""),
        "status": "completed",
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.payments.insert_one(payment_doc)
    
    # Update invoice if linked
    if payment.get("invoice_id"):
        invoice = await db.invoices.find_one({"id": payment["invoice_id"]})
        if invoice:
            new_paid = invoice.get("paid_amount", 0) + payment["amount"]
            new_balance = invoice.get("total", 0) - new_paid
            new_status = "paid" if new_balance <= 0 else "partial"
            
            await db.invoices.update_one(
                {"id": payment["invoice_id"]},
                {"$set": {"paid_amount": new_paid, "balance_due": max(0, new_balance), "status": new_status}}
            )
    
    # Update cash box
    cash_box_id = "cash" if payment.get("payment_method") == "cash" else payment.get("payment_method", "cash")
    balance_change = payment["amount"] if payment_type == "received" else -payment["amount"]
    await db.cash_boxes.update_one(
        {"id": cash_box_id},
        {"$inc": {"balance": balance_change}}
    )
    
    return payment_doc

# ============ EXPENSES ============

@router.get("/expenses")
async def get_expenses(
    category: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    user=Depends(get_current_user)
):
    """Get expenses"""
    query = {}
    if category:
        query["category"] = category
    if start_date:
        query["expense_date"] = {"$gte": start_date}
    if end_date:
        query.setdefault("expense_date", {})["$lte"] = end_date
    
    skip = (page - 1) * limit
    expenses = await db.expenses.find(query, {"_id": 0}).sort("expense_date", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.expenses.count_documents(query)
    
    return {"items": expenses, "total": total, "page": page, "limit": limit}

@router.post("/expenses", status_code=201)
async def create_expense(expense: dict, user=Depends(get_current_user)):
    """Record an expense"""
    # Generate expense number
    count = await db.expenses.count_documents({})
    expense_number = f"EXP{str(count + 1).zfill(6)}"
    
    expense_doc = {
        "id": str(uuid.uuid4()),
        "expense_number": expense_number,
        "category": expense["category"],
        "description": expense["description"],
        "amount": expense["amount"],
        "expense_date": expense["expense_date"],
        "payment_method": expense.get("payment_method", "cash"),
        "vendor": expense.get("vendor", ""),
        "receipt_url": expense.get("receipt_url", ""),
        "account_id": expense.get("account_id"),
        "notes": expense.get("notes", ""),
        "is_recurring": expense.get("is_recurring", False),
        "recurring_frequency": expense.get("recurring_frequency"),
        "status": "recorded",
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.expenses.insert_one(expense_doc)
    
    # Update cash box
    cash_box_id = "cash" if expense.get("payment_method") == "cash" else expense.get("payment_method", "cash")
    await db.cash_boxes.update_one(
        {"id": cash_box_id},
        {"$inc": {"balance": -expense["amount"]}}
    )
    
    return expense_doc

# ============ FINANCIAL REPORTS ============

@router.get("/reports/profit-loss")
async def get_profit_loss_report(
    start_date: str,
    end_date: str,
    user=Depends(get_current_user)
):
    """Generate Profit & Loss report"""
    from services.ai.agents import SmartReporterAgent
    reporter = SmartReporterAgent(db)
    return await reporter.generate_profit_loss(start_date, end_date)

@router.get("/reports/balance-sheet")
async def get_balance_sheet(
    as_of_date: str,
    user=Depends(get_current_user)
):
    """Generate Balance Sheet"""
    from services.ai.agents import SmartReporterAgent
    reporter = SmartReporterAgent(db)
    return await reporter.generate_balance_sheet(as_of_date)

@router.get("/reports/cash-flow")
async def get_cash_flow_report(
    start_date: str,
    end_date: str,
    user=Depends(get_current_user)
):
    """Generate Cash Flow statement"""
    from services.ai.agents import SmartReporterAgent
    reporter = SmartReporterAgent(db)
    return await reporter.generate_cash_flow(start_date, end_date)

@router.get("/reports/trial-balance")
async def get_trial_balance(
    as_of_date: str,
    user=Depends(get_current_user)
):
    """Generate Trial Balance"""
    accounts = await db.accounts.find({"is_active": True}, {"_id": 0}).to_list(500)
    
    trial_balance = []
    total_debit = 0
    total_credit = 0
    
    for account in accounts:
        balance = account.get("balance", 0)
        debit = balance if balance >= 0 else 0
        credit = -balance if balance < 0 else 0
        
        trial_balance.append({
            "account_code": account.get("code"),
            "account_name": account.get("name_ar") or account.get("name"),
            "debit": debit,
            "credit": credit
        })
        
        total_debit += debit
        total_credit += credit
    
    return {
        "as_of_date": as_of_date,
        "accounts": trial_balance,
        "total_debit": total_debit,
        "total_credit": total_credit,
        "is_balanced": abs(total_debit - total_credit) < 0.01,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }

@router.get("/reports/tax-summary")
async def get_tax_summary(
    period: str,
    user=Depends(get_current_user)
):
    """Get tax summary"""
    from services.ai.agents import TaxAssistantAgent
    tax_agent = TaxAssistantAgent(db)
    return await tax_agent.calculate_tax_summary(period)

# ============ AUDIT LOG ============

@router.get("/audit-log")
async def get_audit_log(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    action: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    limit: int = 100,
    user=Depends(get_current_user)
):
    """Get audit log entries"""
    query = {}
    if entity_type:
        query["entity_type"] = entity_type
    if entity_id:
        query["entity_id"] = entity_id
    if action:
        query["action"] = action
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        query.setdefault("created_at", {})["$lte"] = end_date
    
    skip = (page - 1) * limit
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.audit_logs.count_documents(query)
    
    return {"items": logs, "total": total, "page": page, "limit": limit}
