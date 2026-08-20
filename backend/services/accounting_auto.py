# p190: Auto-accounting — journal entries generated from domain events.
# Called from event consumers; writes into the TENANT database.
# Entries mirror the manual create_journal_entry logic (balanced lines +
# account balance mirrors), but are born approved and tagged source='auto'.
import logging
import uuid
from datetime import datetime, timezone

log = logging.getLogger("accounting_auto")

# code → (name_ar, account_type, cash_box_id or None)
DEFAULT_ACCOUNTS = [
    ("101", "رأس المال", "equity", None),
    ("530", "الصندوق", "asset", "cash"),
    ("514", "البنك", "asset", "bank"),
    ("531", "المحفظة", "asset", "wallet"),
    ("532", "الخزنة", "asset", "safe"),
    ("533", "المال الخاص", "asset", "personal"),
    ("534", "المتجر الإلكتروني", "asset", "ecom_store"),
    ("401", "الموردون", "liability", None),
    ("411", "الزبائن", "asset", None),
    ("610", "مصاريف التشغيل", "expense", None),
    ("380", "المخزون", "asset", None),
    ("700", "إيرادات المبيعات", "revenue", None),
    ("600", "تكلفة البضاعة المباعة", "expense", None),
]

BOX_ACCOUNT = {box: code for code, _, _, box in DEFAULT_ACCOUNTS if box}


async def ensure_accounts(tdb) -> dict:
    """Lazily seed the default chart of accounts. Returns {code: account_doc}."""
    out = {}
    for code, name, atype, _box in DEFAULT_ACCOUNTS:
        acc = await tdb.accounts.find_one({"code": code})
        if not acc:
            acc = {
                "id": str(uuid.uuid4()),
                "code": code,
                "name": name,
                "name_ar": name,
                "account_type": atype,
                "parent_id": None,
                "description": "حساب تلقائي (نظام)",
                "balance": 0,
                "is_active": True,
                "created_by": "system",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            try:
                await tdb.accounts.insert_one(acc)
            except Exception:
                # p193: concurrent events may seed the chart simultaneously —
                # the unique code index rejects the loser; re-fetch the winner
                acc = await tdb.accounts.find_one({"code": code})
        out[code] = acc
    return out


async def _insert_entry(tdb, *, reference, reference_id, source_tag, description, lines):
    """Insert a balanced, approved auto journal entry + update balances."""
    total_debit = round(sum(l["debit"] for l in lines), 2)
    total_credit = round(sum(l["credit"] for l in lines), 2)
    if abs(total_debit - total_credit) > 0.01:
        raise ValueError(f"unbalanced auto entry: {total_debit} != {total_credit}")
    count = await tdb.journal_entries.count_documents({})
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "entry_number": f"JE{str(count + 1).zfill(6)}",
        "date": now[:10],
        "reference": reference,
        "description": description,
        "lines": lines,
        "total_debit": total_debit,
        "total_credit": total_credit,
        "status": "approved",
        "attachments": [],
        "created_by": "system",
        "created_by_name": "النظام (تلقائي)",
        "source": "auto",
        "source_tag": source_tag,
        "reference_id": reference_id,
        "created_at": now,
        "updated_at": now,
    }
    await tdb.journal_entries.insert_one(doc)
    for line in lines:
        change = line["debit"] - line["credit"]
        if change:
            await tdb.accounts.update_one({"id": line["account_id"]}, {"$inc": {"balance": change}})
    doc.pop("_id", None)
    return doc


async def already_posted(tdb, reference_id: str, source_tag: str) -> bool:
    return bool(await tdb.journal_entries.find_one({"reference_id": reference_id, "source_tag": source_tag}))


def _line(acc, debit=0.0, credit=0.0):
    return {
        "account_id": acc["id"],
        "account_code": acc["code"],
        "account_name": acc.get("name_ar") or acc.get("name"),
        "debit": round(float(debit), 2),
        "credit": round(float(credit), 2),
    }


async def post_sale_entry(tdb, payload: dict):
    """sale.completed → Dr cash-box(paid) + Dr AR(remaining) / Cr revenue(total);
    plus Dr COGS / Cr inventory when cost is known. Idempotent per sale."""
    sale_id = payload.get("sale_id")
    if not sale_id or await already_posted(tdb, sale_id, "sale"):
        return None
    accounts = await ensure_accounts(tdb)
    total = float(payload.get("total", 0) or 0)
    paid = float(payload.get("paid_amount", 0) or 0)
    remaining = float(payload.get("remaining", max(0.0, total - paid)) or 0)
    cogs = float(payload.get("cogs", 0) or 0)
    box_code = BOX_ACCOUNT.get(payload.get("cash_box_id") or "cash", "530")

    lines = []
    if paid > 0:
        lines.append(_line(accounts[box_code], debit=paid))
    if remaining > 0:
        lines.append(_line(accounts["411"], debit=remaining))
    if total > 0:
        lines.append(_line(accounts["700"], credit=total))
    if cogs > 0:
        lines.append(_line(accounts["600"], debit=cogs))
        lines.append(_line(accounts["380"], credit=cogs))
    if not lines:
        return None

    return await _insert_entry(
        tdb,
        reference=payload.get("invoice_number", ""),
        reference_id=sale_id,
        source_tag="sale",
        description=f"قيد تلقائي — فاتورة بيع {payload.get('invoice_number', '')}",
        lines=lines,
    )


async def post_sale_reversal(tdb, payload: dict, source_tag: str, label: str):
    """sale.refunded / sale.deleted → exact mirror of the sale entry."""
    sale_id = payload.get("sale_id")
    tag = f"{source_tag}"
    if not sale_id or await already_posted(tdb, sale_id, tag):
        return None
    accounts = await ensure_accounts(tdb)
    total = float(payload.get("total", 0) or 0)
    paid = float(payload.get("paid_amount", 0) or 0)
    remaining = float(payload.get("remaining", 0) or 0)
    cogs = float(payload.get("cogs", 0) or 0)
    box_code = BOX_ACCOUNT.get(payload.get("cash_box_id") or "cash", "530")

    lines = []
    if total > 0:
        lines.append(_line(accounts["700"], debit=total))
    if paid > 0:
        lines.append(_line(accounts[box_code], credit=paid))
    if remaining > 0:
        lines.append(_line(accounts["411"], credit=remaining))
    if cogs > 0:
        lines.append(_line(accounts["380"], debit=cogs))
        lines.append(_line(accounts["600"], credit=cogs))
    if not lines:
        return None

    return await _insert_entry(
        tdb,
        reference=payload.get("invoice_number", ""),
        reference_id=sale_id,
        source_tag=tag,
        description=f"قيد عكسي تلقائي — {label} {payload.get('invoice_number', '')}",
        lines=lines,
    )


# ── p193: purchases & expenses ───────────────────────────────────────────────

async def post_purchase_entry(tdb, payload: dict):
    """purchase.recorded → Dr inventory(total) / Cr cash-box(paid) + Cr AP(remaining)."""
    purchase_id = payload.get("purchase_id")
    if not purchase_id or await already_posted(tdb, purchase_id, "purchase"):
        return None
    accounts = await ensure_accounts(tdb)
    total = float(payload.get("total", 0) or 0)
    paid = float(payload.get("paid_amount", 0) or 0)
    remaining = float(payload.get("remaining", max(0.0, total - paid)) or 0)
    box_code = BOX_ACCOUNT.get(payload.get("payment_method") or "cash", "530")

    lines = []
    if total > 0:
        lines.append(_line(accounts["380"], debit=total))
    if paid > 0:
        lines.append(_line(accounts[box_code], credit=paid))
    if remaining > 0:
        lines.append(_line(accounts["401"], credit=remaining))
    if not lines:
        return None

    return await _insert_entry(
        tdb,
        reference=payload.get("invoice_number", ""),
        reference_id=purchase_id,
        source_tag="purchase",
        description=f"قيد تلقائي — فاتورة شراء {payload.get('invoice_number', '')}",
        lines=lines,
    )


async def post_expense_entry(tdb, payload: dict):
    """expense.created → Dr operating expenses / Cr cash-box."""
    expense_id = payload.get("expense_id")
    if not expense_id or await already_posted(tdb, expense_id, "expense"):
        return None
    # USD expenses: cash moved at the dollar-purchase moment — no double count
    if (payload.get("currency") or "DZD") != "DZD":
        return None
    if not payload.get("payment_method"):
        return None
    accounts = await ensure_accounts(tdb)
    amount = float(payload.get("amount", 0) or 0)
    if amount <= 0:
        return None
    box_code = BOX_ACCOUNT.get(payload.get("payment_method"), "530")
    lines = [
        _line(accounts["610"], debit=amount),
        _line(accounts[box_code], credit=amount),
    ]
    return await _insert_entry(
        tdb,
        reference=payload.get("code", ""),
        reference_id=expense_id,
        source_tag="expense",
        description=f"قيد تلقائي — مصروف {payload.get('title', '')}",
        lines=lines,
    )


async def post_expense_reversal(tdb, payload: dict):
    """expense.deleted → mirror of the expense entry (if one was posted)."""
    expense_id = payload.get("expense_id")
    if not expense_id or await already_posted(tdb, expense_id, "expense_reversal"):
        return None
    if not await already_posted(tdb, expense_id, "expense"):
        return None  # no entry was ever posted (USD / no payment method)
    accounts = await ensure_accounts(tdb)
    amount = float(payload.get("amount", 0) or 0)
    if amount <= 0:
        return None
    box_code = BOX_ACCOUNT.get(payload.get("payment_method"), "530")
    lines = [
        _line(accounts[box_code], debit=amount),
        _line(accounts["610"], credit=amount),
    ]
    return await _insert_entry(
        tdb,
        reference=payload.get("code", ""),
        reference_id=expense_id,
        source_tag="expense_reversal",
        description=f"قيد عكسي تلقائي — حذف مصروف {payload.get('title', '')}",
        lines=lines,
    )

# ── p195: debt settlements ───────────────────────────────────────────────────

async def post_customer_payment_entry(tdb, payload: dict):
    """customer.payment_received → Dr cash-box / Cr accounts receivable (411)."""
    payment_id = payload.get("payment_id")
    if not payment_id or await already_posted(tdb, payment_id, "customer_payment"):
        return None
    accounts = await ensure_accounts(tdb)
    amount = float(payload.get("amount", 0) or 0)
    if amount <= 0:
        return None
    box_code = BOX_ACCOUNT.get(payload.get("payment_method") or "cash", "530")
    lines = [
        _line(accounts[box_code], debit=amount),
        _line(accounts["411"], credit=amount),
    ]
    return await _insert_entry(
        tdb,
        reference=payload.get("customer_name", ""),
        reference_id=payment_id,
        source_tag="customer_payment",
        description=f"قيد تلقائي — تحصيل دين من العميل {payload.get('customer_name', '')}",
        lines=lines,
    )


async def post_supplier_payment_entry(tdb, payload: dict):
    """supplier.payment_made → Dr accounts payable (401) / Cr cash-box."""
    payment_id = payload.get("payment_id")
    if not payment_id or await already_posted(tdb, payment_id, "supplier_payment"):
        return None
    accounts = await ensure_accounts(tdb)
    amount = float(payload.get("amount", 0) or 0)
    if amount <= 0:
        return None
    box_code = BOX_ACCOUNT.get(payload.get("payment_method") or "cash", "530")
    lines = [
        _line(accounts["401"], debit=amount),
        _line(accounts[box_code], credit=amount),
    ]
    return await _insert_entry(
        tdb,
        reference=payload.get("supplier_name", ""),
        reference_id=payment_id,
        source_tag="supplier_payment",
        description=f"قيد تلقائي — سداد دين للمورد {payload.get('supplier_name', '')}",
        lines=lines,
    )
