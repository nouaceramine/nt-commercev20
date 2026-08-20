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
from services.accounting_auto import (
    ensure_accounts, already_posted, _insert_entry, _line, BOX_ACCOUNT,
)
from pymongo.errors import DuplicateKeyError

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

    # p209: entries dated in a closed fiscal year are forbidden
    _yr = str(entry.get("date", ""))[:4]
    if _yr in await _closed_fiscal_years(db):
        raise HTTPException(status_code=403, detail=f"السنة المالية {_yr} مقفلة — لا يمكن إضافة قيود إليها")

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
    
    entry_doc.pop("_id", None)  # p196: insert_one mutates the doc — ObjectId breaks JSON serialization (500)
    return entry_doc

@router.put("/journal-entries/{entry_id}/approve")
async def approve_journal_entry(entry_id: str, user=Depends(get_current_user)):
    """Approve a journal entry"""
    # p209: approving an entry dated in a closed fiscal year is forbidden
    _doc = await db.journal_entries.find_one({"id": entry_id, "status": "pending"}, {"date": 1})
    _yr = str((_doc or {}).get("date", ""))[:4]
    if _doc and _yr in await _closed_fiscal_years(db):
        raise HTTPException(status_code=403, detail=f"السنة المالية {_yr} مقفلة — لا يمكن الاعتماد")
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
    """Generate Trial Balance.

    p196: computed from journal-entry LINES with date <= as_of_date (the
    as-of date is honoured; previously the live account mirror was returned
    regardless of the requested date). Response shape is a superset of the
    original: same keys plus gross totals, per-account line counts and
    auto/manual entry breakdown.
    """
    accounts = await db.accounts.find({"is_active": True}, {"_id": 0}).to_list(500)

    # gross debit/credit per account from journal lines within the window
    pipeline = [
        {"$match": {"date": {"$lte": as_of_date}}},
        {"$unwind": "$lines"},
        {"$group": {
            "_id": "$lines.account_id",
            "account_code": {"$first": "$lines.account_code"},
            "total_debit": {"$sum": {"$ifNull": ["$lines.debit", 0]}},
            "total_credit": {"$sum": {"$ifNull": ["$lines.credit", 0]}},
            "lines_count": {"$sum": 1},
        }},
    ]
    movement = {}
    async for row in db.journal_entries.aggregate(pipeline):
        movement[row["_id"]] = row

    date_q = {"date": {"$lte": as_of_date}}
    entries_count = await db.journal_entries.count_documents(date_q)
    auto_entries = await db.journal_entries.count_documents({**date_q, "source": "auto"})

    def _row(code, name, atype, mov):
        td = round(mov["total_debit"], 2) if mov else 0.0
        tc = round(mov["total_credit"], 2) if mov else 0.0
        balance = round(td - tc, 2)
        return {
            "account_code": code,
            "account_name": name,
            "account_type": atype,
            "total_debit": td,
            "total_credit": tc,
            "balance": balance,
            "debit": balance if balance > 0 else 0,
            "credit": -balance if balance < 0 else 0,
            "entries_count": mov["lines_count"] if mov else 0,
        }

    trial_balance = []
    seen = set()
    for account in accounts:
        seen.add(account.get("id"))
        trial_balance.append(_row(
            account.get("code"),
            account.get("name_ar") or account.get("name"),
            account.get("account_type"),
            movement.get(account.get("id")),
        ))
    # lines pointing at deactivated/deleted accounts still surface honestly
    for acc_id, mov in movement.items():
        if acc_id in seen:
            continue
        trial_balance.append(_row(mov.get("account_code") or "?", "(حساب غير نشط)", None, mov))

    trial_balance.sort(key=lambda r: str(r["account_code"] or ""))
    total_debit = round(sum(r["debit"] for r in trial_balance), 2)
    total_credit = round(sum(r["credit"] for r in trial_balance), 2)

    return {
        "as_of_date": as_of_date,
        "accounts": trial_balance,
        "total_debit": total_debit,
        "total_credit": total_credit,
        "is_balanced": abs(total_debit - total_credit) < 0.01,
        "entries_count": entries_count,
        "auto_entries": auto_entries,
        "manual_entries": entries_count - auto_entries,
        "basis": "journal_lines",
        "generated_at": datetime.now(timezone.utc).isoformat()
    }

@router.get("/reports/income-statement")
async def get_income_statement(
    start_date: str,
    end_date: str,
    user=Depends(get_current_user)
):
    """p197: Income statement computed from journal-entry LINES within
    [start_date, end_date]. Class 7 = revenue (credit-nature),
    class 60x = COGS, other class 6 = operating expenses (debit-nature)."""
    pipeline = [
        {"$match": {"date": {"$gte": start_date, "$lte": end_date}}},
        {"$unwind": "$lines"},
        {"$group": {
            "_id": "$lines.account_id",
            "account_code": {"$first": "$lines.account_code"},
            "account_name": {"$first": "$lines.account_name"},
            "total_debit": {"$sum": {"$ifNull": ["$lines.debit", 0]}},
            "total_credit": {"$sum": {"$ifNull": ["$lines.credit", 0]}},
        }},
    ]
    revenue, cogs_accounts, operating = [], [], []
    async for row in db.journal_entries.aggregate(pipeline):
        code = str(row.get("account_code") or "")
        name = row.get("account_name") or ""
        if code.startswith("7"):
            amount = round(row["total_credit"] - row["total_debit"], 2)
            if amount:
                revenue.append({"account_code": code, "account_name": name, "amount": amount})
        elif code.startswith("6"):
            amount = round(row["total_debit"] - row["total_credit"], 2)
            if not amount:
                continue
            item = {"account_code": code, "account_name": name, "amount": amount}
            (cogs_accounts if code.startswith("60") else operating).append(item)
    revenue.sort(key=lambda r: r["account_code"])
    cogs_accounts.sort(key=lambda r: r["account_code"])
    operating.sort(key=lambda r: r["account_code"])
    revenue_total = round(sum(r["amount"] for r in revenue), 2)
    cogs_total = round(sum(r["amount"] for r in cogs_accounts), 2)
    operating_total = round(sum(r["amount"] for r in operating), 2)
    gross_profit = round(revenue_total - cogs_total, 2)
    net_profit = round(gross_profit - operating_total, 2)
    entries_count = await db.journal_entries.count_documents({"date": {"$gte": start_date, "$lte": end_date}})

    return {
        "start_date": start_date,
        "end_date": end_date,
        "revenue_accounts": revenue,
        "revenue_total": revenue_total,
        "cogs_accounts": cogs_accounts,
        "cogs_total": cogs_total,
        "gross_profit": gross_profit,
        "operating_accounts": operating,
        "operating_total": operating_total,
        "net_profit": net_profit,
        "entries_count": entries_count,
        "basis": "journal_lines",
        "generated_at": datetime.now(timezone.utc).isoformat()
    }

@router.get("/reports/balance-sheet-journal")
async def get_balance_sheet_journal(
    as_of_date: str,
    user=Depends(get_current_user)
):
    """p198: Balance sheet (financial position) from journal-entry LINES as of
    a date. Assets = 3xx/4xx(debit-nature)/5xx boxes; liabilities = 401;
    equity = period result (7xx net − 6xx net). Double-entry guarantees
    assets == liabilities + equity; is_balanced reports the live check."""
    pipeline = [
        {"$match": {"date": {"$lte": as_of_date}}},
        {"$unwind": "$lines"},
        {"$group": {
            "_id": "$lines.account_id",
            "account_code": {"$first": "$lines.account_code"},
            "account_name": {"$first": "$lines.account_name"},
            "total_debit": {"$sum": {"$ifNull": ["$lines.debit", 0]}},
            "total_credit": {"$sum": {"$ifNull": ["$lines.credit", 0]}},
        }},
    ]
    assets, liabilities, equity_accounts = [], [], []
    result = 0.0
    async for row in db.journal_entries.aggregate(pipeline):
        code = str(row.get("account_code") or "")
        name = row.get("account_name") or ""
        net = round(row["total_debit"] - row["total_credit"], 2)
        if code.startswith("7"):
            result -= net  # credit-nature: negative net = revenue
        elif code.startswith("6"):
            result -= net  # debit-nature: positive net = expense
        elif code.startswith("401"):
            if net:
                liabilities.append({"account_code": code, "account_name": name, "amount": round(-net, 2)})
        elif code[:1] == "2":
            # p206: class-2 liabilities (203 customer deposits, credit-nature)
            if net:
                liabilities.append({"account_code": code, "account_name": name, "amount": round(-net, 2)})
        elif code[:1] == "1":
            # p199: capital & other class-1 equity accounts (credit-nature)
            if net:
                equity_accounts.append({"account_code": code, "account_name": name, "amount": round(-net, 2)})
        elif code[:1] in ("3", "4", "5"):
            if net:
                assets.append({"account_code": code, "account_name": name, "amount": net})
    assets.sort(key=lambda r: r["account_code"])
    liabilities.sort(key=lambda r: r["account_code"])
    equity_accounts.sort(key=lambda r: r["account_code"])
    assets_total = round(sum(a["amount"] for a in assets), 2)
    liabilities_total = round(sum(a["amount"] for a in liabilities), 2)
    result = round(result, 2)
    equity_capital = round(sum(e["amount"] for e in equity_accounts), 2)
    equity_total = round(equity_capital + result, 2)
    return {
        "as_of_date": as_of_date,
        "assets": assets,
        "assets_total": assets_total,
        "liabilities": liabilities,
        "liabilities_total": liabilities_total,
        "equity_accounts": equity_accounts,
        "equity_capital": equity_capital,
        "equity_result": result,
        "equity_total": equity_total,
        "is_balanced": abs(assets_total - (liabilities_total + equity_total)) < 0.01,
        "basis": "journal_lines",
        "generated_at": datetime.now(timezone.utc).isoformat()
    }

# ============ p199: OPENING BALANCES ============

OPENING_SOURCE_TAG = "opening"


async def _compute_opening(tdb):
    """Actual pre-auto-entry balances vs current journal nets → delta lines.

    Targets (what the journal SHOULD mirror today):
      380 inventory     = Σ qty × purchase_price (stockable products)
      5xx cash boxes    = live cash_boxes balances
      411 receivables   = Σ remaining > 0 on sales
      401 payables      = Σ remaining > 0 on purchases (credit-nature)
      101 capital       = balancing figure
    Each delta = target − current journal net (debit-positive), so the entry
    never double-counts movements the journal already recorded.
    """
    inv = {"val": 0.0, "n": 0}
    async for r in tdb.products.aggregate([
        {"$match": {"is_non_stockable": {"$ne": True}}},
        {"$group": {"_id": None, "n": {"$sum": 1}, "val": {"$sum": {
            "$multiply": [{"$ifNull": ["$quantity", 0]}, {"$ifNull": ["$purchase_price", 0]}]}}}},
    ]):
        inv = {"val": round(r["val"], 2), "n": r["n"]}

    boxes = []
    async for b in tdb.cash_boxes.find({}, {"_id": 0}).sort("id", 1):
        code = BOX_ACCOUNT.get(b.get("id"))
        if code:
            boxes.append({"box_id": b.get("id"), "account_code": code,
                          "name": b.get("name"), "balance": round(float(b.get("balance") or 0), 2)})

    recv = {"val": 0.0, "n": 0}
    async for r in tdb.sales.aggregate([
        {"$match": {"remaining": {"$gt": 0}}},
        {"$group": {"_id": None, "n": {"$sum": 1}, "val": {"$sum": "$remaining"}}},
    ]):
        recv = {"val": round(r["val"], 2), "n": r["n"]}

    payb = {"val": 0.0, "n": 0}
    async for r in tdb.purchases.aggregate([
        {"$match": {"remaining": {"$gt": 0}}},
        {"$group": {"_id": None, "n": {"$sum": 1}, "val": {"$sum": "$remaining"}}},
    ]):
        payb = {"val": round(r["val"], 2), "n": r["n"]}

    nets = {}
    async for r in tdb.journal_entries.aggregate([
        {"$unwind": "$lines"},
        {"$group": {"_id": "$lines.account_code", "net": {"$sum": {
            "$subtract": [{"$ifNull": ["$lines.debit", 0]}, {"$ifNull": ["$lines.credit", 0]}]}}}},
    ]):
        nets[r["_id"]] = round(r["net"], 2)

    deltas = {"380": round(inv["val"] - nets.get("380", 0.0), 2),
              "411": round(recv["val"] - nets.get("411", 0.0), 2),
              "401": round(-payb["val"] - nets.get("401", 0.0), 2)}
    for b in boxes:
        deltas[b["account_code"]] = round(b["balance"] - nets.get(b["account_code"], 0.0), 2)

    deltas = {k: v for k, v in deltas.items() if abs(v) >= 0.005}
    # The new entry must balance itself: capital offsets this entry's deltas.
    # Existing books are already balanced, so 101's current net is NOT part
    # of the delta (a prior opening entry already carries it).
    capital = round(-sum(deltas.values()), 2)
    if abs(capital) >= 0.005:
        deltas["101"] = capital

    return {
        "inventory_value": inv["val"], "inventory_products": inv["n"],
        "boxes": boxes,
        "boxes_total": round(sum(b["balance"] for b in boxes), 2),
        "receivables": recv["val"], "receivables_count": recv["n"],
        "payables": payb["val"], "payables_count": payb["n"],
        "journal_nets": nets,
        "deltas": deltas,
        "capital": capital,
    }


@router.get("/opening-balance/preview")
async def opening_balance_preview(user=Depends(get_current_user)):
    """p199: preview of the opening-balance entry (no writes)."""
    tdb = db
    accounts = await ensure_accounts(tdb)
    calc = await _compute_opening(tdb)

    lines = []
    for code, delta in sorted(calc["deltas"].items()):
        acc = accounts.get(code) or await tdb.accounts.find_one({"code": code})
        if not acc:
            continue
        lines.append({
            "account_code": code,
            "account_name": acc.get("name_ar") or acc.get("name"),
            "debit": delta if delta > 0 else 0.0,
            "credit": round(-delta, 2) if delta < 0 else 0.0,
        })
    openings = await tdb.journal_entries.count_documents({"source_tag": OPENING_SOURCE_TAG})
    return {
        **{k: v for k, v in calc.items() if k != "deltas"},
        "lines": lines,
        "total_debit": round(sum(l["debit"] for l in lines), 2),
        "total_credit": round(sum(l["credit"] for l in lines), 2),
        "in_sync": not lines,
        "already_applied": openings > 0,
        "opening_entries": openings,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/opening-balance/apply")
async def opening_balance_apply(body: Optional[dict] = None, user=Depends(get_current_user)):
    """p199: post the opening-balance entry. Idempotent via the unique
    (reference_id, source_tag) index; force=true posts a delta adjustment
    under a fresh OPENING-n reference."""
    tdb = db
    force = bool((body or {}).get("force"))
    openings = await tdb.journal_entries.count_documents({"source_tag": OPENING_SOURCE_TAG})
    if openings and not force:
        raise HTTPException(409, "القيد الافتتاحي مُرحَّل مسبقاً — استخدم force=true لقيد تسوية بالفرق")

    accounts = await ensure_accounts(tdb)
    calc = await _compute_opening(tdb)
    if not calc["deltas"]:
        raise HTTPException(400, "الأرصدة متطابقة أصلاً — لا حاجة لقيد")

    lines = []
    for code, delta in sorted(calc["deltas"].items()):
        acc = accounts.get(code)
        if not acc:
            raise HTTPException(500, f"حساب مفقود: {code}")
        lines.append(_line(acc, debit=delta if delta > 0 else 0.0,
                           credit=-delta if delta < 0 else 0.0))

    reference_id = f"OPENING-{openings + 1}"
    try:
        entry = await _insert_entry(
            tdb,
            reference=reference_id,
            reference_id=reference_id,
            source_tag=OPENING_SOURCE_TAG,
            description=("قيد تسوية افتتاحية — " if openings else "قيد افتتاحي — ")
                        + "ترحيل أرصدة ما قبل القيود الآلية (مخزون/صناديق/ذمم/رأس مال)",
            lines=lines,
        )
    except DuplicateKeyError:
        # 4 uvicorn workers: a concurrent apply won the race
        raise HTTPException(409, "القيد الافتتاحي مُرحَّل مسبقاً (تعارض متزامن)")
    return {"applied": True, "force": force, "reference_id": reference_id,
            "entry": entry, "capital": calc["capital"]}


# ============ p200: GENERAL LEDGER ============

@router.get("/ledger/{account_code}")
async def get_account_ledger(
    account_code: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user=Depends(get_current_user)
):
    """p200: general ledger for one account, from journal-entry LINES only.
    Opening balance (net of lines before start_date), every line in the
    window with a running balance, then the closing balance.
    basis=journal_lines — mirrors never consulted."""
    acc = await db.accounts.find_one({"code": account_code}, {"_id": 0})
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    today = datetime.now(timezone.utc).date().isoformat()
    end_date = end_date or today
    if start_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date")

    acc_id = acc["id"]
    opening = 0.0
    if start_date:
        async for row in db.journal_entries.aggregate([
            {"$match": {"date": {"$lt": start_date}}},
            {"$unwind": "$lines"},
            {"$match": {"lines.account_id": acc_id}},
            {"$group": {"_id": None, "net": {"$sum": {"$subtract": [
                {"$ifNull": ["$lines.debit", 0]},
                {"$ifNull": ["$lines.credit", 0]}]}}}},
        ]):
            opening = round(row["net"], 2)

    date_q = {"date": {"$lte": end_date}}
    if start_date:
        date_q["date"]["$gte"] = start_date
    rows = []
    async for entry in db.journal_entries.find(
        date_q, {"_id": 0}
    ).sort([("date", 1), ("created_at", 1)]):
        for line in entry.get("lines", []):
            if line.get("account_id") != acc_id:
                continue
            debit = round(float(line.get("debit") or 0), 2)
            credit = round(float(line.get("credit") or 0), 2)
            rows.append({
                "entry_id": entry.get("id"),
                "entry_number": entry.get("entry_number"),
                "date": entry.get("date"),
                "reference": entry.get("reference", ""),
                "description": entry.get("description", ""),
                "source": entry.get("source", "manual"),
                "debit": debit,
                "credit": credit,
            })

    running = opening
    for r in rows:
        running = round(running + r["debit"] - r["credit"], 2)
        r["running_balance"] = running

    return {
        "account_code": acc.get("code"),
        "account_name": acc.get("name_ar") or acc.get("name"),
        "account_type": acc.get("account_type"),
        "start_date": start_date,
        "end_date": end_date,
        "opening_balance": opening,
        "lines": rows,
        "lines_count": len(rows),
        "total_debit": round(sum(r["debit"] for r in rows), 2),
        "total_credit": round(sum(r["credit"] for r in rows), 2),
        "closing_balance": running,
        "basis": "journal_lines",
        "generated_at": datetime.now(timezone.utc).isoformat()
    }

@router.get("/reports/tax-summary")
async def get_tax_summary(
    period: str,
    user=Depends(get_current_user)
):
    """p207: tax summary from journal-entry LINES (was document-based via
    TaxAssistantAgent — counted every sales doc of the year and matched a
    non-existent expense_date field, so expenses always came out 0).
    period = YYYY or YYYY-MM. Response keeps the legacy keys and adds the
    journal detail."""
    if len(period) == 4 and period.isdigit():
        start, end = f"{period}-01-01", f"{period}-12-31"
    elif len(period) == 7 and period[4] == "-" and period[:4].isdigit() and period[5:].isdigit():
        start, end = f"{period}-01", f"{period}-31"  # ISO strings compare lexicographically
    else:
        raise HTTPException(status_code=400, detail="period بصيغة YYYY أو YYYY-MM")

    pipeline = [
        {"$match": {"date": {"$gte": start, "$lte": end}}},
        {"$unwind": "$lines"},
        {"$group": {
            "_id": "$lines.account_code",
            "account_name": {"$first": "$lines.account_name"},
            "total_debit": {"$sum": {"$ifNull": ["$lines.debit", 0]}},
            "total_credit": {"$sum": {"$ifNull": ["$lines.credit", 0]}},
        }},
    ]
    revenue_accounts, expense_accounts = [], []
    revenue_total = cogs_total = operating_total = 0.0
    entries_count = await db.journal_entries.count_documents({"date": {"$gte": start, "$lte": end}})
    async for row in db.journal_entries.aggregate(pipeline):
        code = str(row.get("_id") or "")
        if code[:1] == "7":
            amt = round(row["total_credit"] - row["total_debit"], 2)
            revenue_total += amt
            if amt:
                revenue_accounts.append({"account_code": code, "account_name": row.get("account_name"), "amount": amt})
        elif code.startswith("600"):
            amt = round(row["total_debit"] - row["total_credit"], 2)
            cogs_total += amt
            if amt:
                expense_accounts.append({"account_code": code, "account_name": row.get("account_name"), "amount": amt})
        elif code[:1] == "6":
            amt = round(row["total_debit"] - row["total_credit"], 2)
            operating_total += amt
            if amt:
                expense_accounts.append({"account_code": code, "account_name": row.get("account_name"), "amount": amt})

    revenue_total = round(revenue_total, 2)
    cogs_total = round(cogs_total, 2)
    operating_total = round(operating_total, 2)
    deductible = round(cogs_total + operating_total, 2)
    taxable_income = round(max(0.0, revenue_total - deductible), 2)
    tax_rate = 0.19  # Algeria: TAP/TVA/IBS estimate (unchanged from legacy)
    return {
        "period": period,
        "window": {"start_date": start, "end_date": end},
        "total_revenue": revenue_total,
        "total_deductible_expenses": deductible,
        "cogs_total": cogs_total,
        "operating_total": operating_total,
        "taxable_income": taxable_income,
        "tax_rate": tax_rate,
        "estimated_tax": round(taxable_income * tax_rate, 2),
        "tax_breakdown": {
            "TAP": round(taxable_income * 0.01, 2),
            "TVA": round(revenue_total * 0.19, 2),
            "IBS": round(taxable_income * 0.19, 2),
        },
        "revenue_accounts": revenue_accounts,
        "expense_accounts": expense_accounts,
        "entries_count": entries_count,
        "basis": "journal_lines",
        "recommendations": [
            "تأكد من توثيق جميع المصروفات القابلة للخصم",
            "احتفظ بجميع الفواتير لمدة 10 سنوات",
        ],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

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

# ============ p209: FISCAL YEAR CLOSE ============

FISCAL_CLOSE_TAG = "fiscal_close"


async def _closed_fiscal_years(tdb) -> set:
    """Years with a posted closing entry (the closing entry IS the lock)."""
    years = await tdb.journal_entries.distinct("fiscal_year", {"source_tag": FISCAL_CLOSE_TAG})
    return {y for y in (years or []) if y}


async def _fiscal_year_nets(tdb, year: str) -> dict:
    """Debit-positive nets of 6xx/7xx lines within the year, EXCLUDING
    closing entries — so the preview stays stable after closing."""
    agg = await tdb.journal_entries.aggregate([
        {"$match": {"date": {"$gte": f"{year}-01-01", "$lte": f"{year}-12-31"},
                    "source_tag": {"$ne": FISCAL_CLOSE_TAG}}},
        {"$unwind": "$lines"},
        {"$match": {"lines.account_code": {"$regex": "^(6|7)"}}},
        {"$group": {"_id": "$lines.account_code",
                    "d": {"$sum": "$lines.debit"}, "c": {"$sum": "$lines.credit"}}},
    ]).to_list(None)
    return {r["_id"]: round(r["d"] - r["c"], 2) for r in agg if round(r["d"] - r["c"], 2)}


def _fiscal_close_payload(nets: dict) -> dict:
    """Split nets into closing lines + the result carried to capital 101."""
    revenue_total = round(sum(-n for n in nets.values() if n < 0), 2)
    expense_total = round(sum(n for n in nets.values() if n > 0), 2)
    result = round(revenue_total - expense_total, 2)
    return {"revenue_total": revenue_total, "expense_total": expense_total, "result": result}


@router.get("/fiscal-close")
async def list_fiscal_closes(user=Depends(get_current_user)):
    """p209: list of closed fiscal years."""
    return {"closed_years": sorted(await _closed_fiscal_years(db))}


@router.get("/fiscal-close/preview")
async def fiscal_close_preview(year: str, user=Depends(get_current_user)):
    """p209: result of the year (7xx − 6xx) + the closing lines. No writes."""
    if not (len(year) == 4 and year.isdigit()):
        raise HTTPException(status_code=400, detail="year بصيغة YYYY")
    accounts = await ensure_accounts(db)
    nets = await _fiscal_year_nets(db, year)
    closed = year in await _closed_fiscal_years(db)
    detail = []
    for code, net in sorted(nets.items()):
        acc = accounts.get(code) or await db.accounts.find_one({"code": code})
        detail.append({
            "account_code": code,
            "account_name": (acc or {}).get("name_ar") or (acc or {}).get("name") or code,
            "net": net,
            "close_debit": round(-net, 2) if net < 0 else 0.0,
            "close_credit": net if net > 0 else 0.0,
        })
    return {
        "year": year,
        "closed": closed,
        **_fiscal_close_payload(nets),
        "accounts": detail,
        "basis": "journal_lines",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/fiscal-close")
async def fiscal_close_apply(body: dict, user=Depends(get_current_user)):
    """p209: close a fiscal year — carry the result to capital 101 and zero
    7xx/6xx via one approved entry dated YYYY-12-31. Idempotent per year."""
    year = str((body or {}).get("year", ""))
    if not (len(year) == 4 and year.isdigit()):
        raise HTTPException(status_code=400, detail="year بصيغة YYYY")
    if year in await _closed_fiscal_years(db):
        raise HTTPException(status_code=409, detail=f"السنة المالية {year} مقفلة مسبقاً")
    accounts = await ensure_accounts(db)
    nets = await _fiscal_year_nets(db, year)
    if not nets:
        raise HTTPException(status_code=400, detail=f"لا حركات على حسابات 6xx/7xx في {year} — لا نتيجة للترحيل")
    payload = _fiscal_close_payload(nets)

    lines = []
    for code, net in sorted(nets.items()):
        acc = accounts.get(code)
        if not acc:
            raise HTTPException(status_code=500, detail=f"حساب مفقود: {code}")
        lines.append(_line(acc, debit=round(-net, 2) if net < 0 else 0.0,
                           credit=net if net > 0 else 0.0))
    capital = accounts.get("101")
    if not capital:
        raise HTTPException(status_code=500, detail="حساب رأس المال 101 مفقود")
    result = payload["result"]
    lines.append(_line(capital, debit=round(-result, 2) if result < 0 else 0.0,
                       credit=result if result > 0 else 0.0))

    reference_id = f"CLOSE-{year}"
    try:
        entry = await _insert_entry(
            db,
            reference=reference_id,
            reference_id=reference_id,
            source_tag=FISCAL_CLOSE_TAG,
            description=f"قيد إقفال السنة المالية {year} — ترحيل النتيجة ({result}) إلى رأس المال وتصفير حسابات النتائج",
            lines=lines,
            date=f"{year}-12-31",
            extra={"fiscal_year": year},
        )
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail=f"السنة المالية {year} مقفلة مسبقاً (تعارض متزامن)")
    return {"applied": True, "year": year, **payload, "entry": entry}
