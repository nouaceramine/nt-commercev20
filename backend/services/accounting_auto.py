# p190: Auto-accounting — journal entries generated from domain events.
# Called from event consumers; writes into the TENANT database.
# Entries mirror the manual create_journal_entry logic (balanced lines +
# account balance mirrors), but are born approved and tagged source='auto'.
import logging
import uuid
from datetime import datetime, timezone
from pymongo.errors import DuplicateKeyError

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
    ("203", "ودائع أمانات العملاء", "liability", None),
    ("401", "الموردون", "liability", None),
    ("402", "سلف الموردين", "asset", None),
    ("411", "الزبائن", "asset", None),
    ("610", "مصاريف التشغيل", "expense", None),
    ("380", "المخزون", "asset", None),
    ("700", "إيرادات المبيعات", "revenue", None),
    ("701", "إيرادات التأجير", "revenue", None),
    ("600", "تكلفة البضاعة المباعة", "expense", None),
    ("658", "مصاريف العمولات", "expense", None),  # p221
    ("421", "عمولات مستحقة الدفع", "liability", None),  # p221
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


async def _insert_entry(tdb, *, reference, reference_id, source_tag, description, lines,
                        date: str = None, extra: dict = None):
    """Insert a balanced, approved auto journal entry + update balances.
    p209: optional date override (e.g. fiscal close dated YYYY-12-31) and
    extra doc fields (e.g. fiscal_year)."""
    total_debit = round(sum(l["debit"] for l in lines), 2)
    total_credit = round(sum(l["credit"] for l in lines), 2)
    if abs(total_debit - total_credit) > 0.01:
        raise ValueError(f"unbalanced auto entry: {total_debit} != {total_credit}")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        # entry_number is assigned in the retry loop below (p206 race guard)
        "date": date or now[:10],
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
    if extra:
        doc.update(extra)
    # p206: 4-worker race guard — two DIFFERENT entries can compute the same
    # count+1 entry_number concurrently; the unique index rejects the loser.
    # Retry with a fresh count (the auto_entry_unique dup still propagates).
    for _attempt in range(4):
        count = await tdb.journal_entries.count_documents({})
        doc["entry_number"] = f"JE{str(count + 1).zfill(6)}"
        try:
            await tdb.journal_entries.insert_one(doc)
            break
        except DuplicateKeyError as exc:
            if "entry_number" in str(exc) and _attempt < 3:
                continue
            raise
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

# ── p204: installment payments ──────────────────────────────────────────────

async def post_installment_payment_entry(tdb, payload: dict):
    """installment.paid → Dr cash-box / Cr accounts receivable (411).
    The installment sale already posted its receivable via sale.completed, so
    paying an installment is a receivable collection (same shape as p195).
    Idempotent per installment_id (an installment is paid once)."""
    payment_id = payload.get("payment_id")
    if not payment_id or await already_posted(tdb, payment_id, "installment_payment"):
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
        reference=payload.get("invoice_number", ""),
        reference_id=payment_id,
        source_tag="installment_payment",
        description=f"قيد تلقائي — تحصيل قسط من العميل {payload.get('customer_name', '')}",
        lines=lines,
    )


# ── p206: rental deposits & close-out ───────────────────────────────────────

async def post_rental_deposit_held(tdb, payload: dict):
    """rental.deposit_held → Dr cash-box / Cr customer deposits (203).
    A held deposit is a LIABILITY (أمانة), not revenue."""
    payment_id = payload.get("payment_id")
    if not payment_id or await already_posted(tdb, payment_id, "rental_deposit"):
        return None
    accounts = await ensure_accounts(tdb)
    amount = float(payload.get("amount", 0) or 0)
    if amount <= 0:
        return None
    box_code = BOX_ACCOUNT.get(payload.get("cash_box_id") or "cash", "530")
    return await _insert_entry(
        tdb, reference=payload.get("contract_code", ""), reference_id=payment_id,
        source_tag="rental_deposit",
        description=f"قيد تلقائي — وديعة أمانة عقد كراء {payload.get('contract_code', '')}",
        lines=[_line(accounts[box_code], debit=amount),
               _line(accounts["203"], credit=amount)],
    )


async def post_rental_deposit_refund(tdb, payload: dict):
    """rental.deposit_refunded → Dr 203 / Cr cash-box (أمانة مسترجعة)."""
    payment_id = payload.get("payment_id")
    if not payment_id or await already_posted(tdb, payment_id, "rental_deposit_refund"):
        return None
    accounts = await ensure_accounts(tdb)
    amount = float(payload.get("amount", 0) or 0)
    if amount <= 0:
        return None
    box_code = BOX_ACCOUNT.get(payload.get("cash_box_id") or "cash", "530")
    return await _insert_entry(
        tdb, reference=payload.get("contract_code", ""), reference_id=payment_id,
        source_tag="rental_deposit_refund",
        description=f"قيد تلقائي — استرجاع وديعة عقد كراء {payload.get('contract_code', '')}",
        lines=[_line(accounts["203"], debit=amount),
               _line(accounts[box_code], credit=amount)],
    )


async def post_rental_deposit_kept(tdb, payload: dict):
    """rental.deposit_kept → Dr 203 / Cr rental revenue (701) — وديعة مصادَرة."""
    payment_id = payload.get("payment_id")
    if not payment_id or await already_posted(tdb, payment_id, "rental_deposit_kept"):
        return None
    accounts = await ensure_accounts(tdb)
    amount = float(payload.get("amount", 0) or 0)
    if amount <= 0:
        return None
    return await _insert_entry(
        tdb, reference=payload.get("contract_code", ""), reference_id=payment_id,
        source_tag="rental_deposit_kept",
        description=f"قيد تلقائي — مصادرة وديعة عقد كراء {payload.get('contract_code', '')}",
        lines=[_line(accounts["203"], debit=amount),
               _line(accounts["701"], credit=amount)],
    )


async def post_rental_close_billed(tdb, payload: dict):
    """rental.close_billed → Dr receivables (411) / Cr rental revenue (701).
    Collected parts already hit 701 on payment (p202/p206); at close only the
    UNPAID remainder (incl. late fees) is recognised against the customer."""
    payment_id = payload.get("payment_id")
    if not payment_id or await already_posted(tdb, payment_id, "rental_close"):
        return None
    accounts = await ensure_accounts(tdb)
    amount = float(payload.get("amount", 0) or 0)
    if amount <= 0:
        return None
    return await _insert_entry(
        tdb, reference=payload.get("contract_code", ""), reference_id=payment_id,
        source_tag="rental_close",
        description=f"قيد تلقائي — متبقّي عقد كراء {payload.get('contract_code', '')} (دين على العميل)",
        lines=[_line(accounts["411"], debit=amount),
               _line(accounts["701"], credit=amount)],
    )


# ── p203: supplier advance payments ─────────────────────────────────────────

async def post_supplier_advance_entry(tdb, payload: dict):
    """supplier.advance_paid → Dr supplier advances (402) / Cr cash-box.
    An advance is a prepaid ASSET (tracked per supplier, never netted against
    purchases), not a debt settlement — debts use supplier.payment_made.
    Idempotent per payment_id."""
    payment_id = payload.get("payment_id")
    if not payment_id or await already_posted(tdb, payment_id, "supplier_advance"):
        return None
    accounts = await ensure_accounts(tdb)
    amount = float(payload.get("amount", 0) or 0)
    if amount <= 0:
        return None
    box_code = BOX_ACCOUNT.get(payload.get("payment_method") or "cash", "530")
    lines = [
        _line(accounts["402"], debit=amount),
        _line(accounts[box_code], credit=amount),
    ]
    return await _insert_entry(
        tdb,
        reference=payload.get("supplier_name", ""),
        reference_id=payment_id,
        source_tag="supplier_advance",
        description=f"قيد تلقائي — دفعة مسبقة للمورد {payload.get('supplier_name', '')}",
        lines=lines,
    )


# ── p202: rental payments ────────────────────────────────────────────────────

async def post_rental_payment_entry(tdb, payload: dict):
    """rental.payment_received → Dr cash-box / Cr rental revenue (701).
    Contracts never post receivables, so rent is recognised on collection.
    Idempotent per payment_id."""
    payment_id = payload.get("payment_id")
    if not payment_id or await already_posted(tdb, payment_id, "rental_payment"):
        return None
    accounts = await ensure_accounts(tdb)
    amount = float(payload.get("amount", 0) or 0)
    if amount <= 0:
        return None
    box_code = BOX_ACCOUNT.get(payload.get("cash_box_id") or "cash", "530")
    lines = [
        _line(accounts[box_code], debit=amount),
        _line(accounts["701"], credit=amount),
    ]
    return await _insert_entry(
        tdb,
        reference=payload.get("contract_code", ""),
        reference_id=payment_id,
        source_tag="rental_payment",
        description=f"قيد تلقائي — دفعة عقد كراء {payload.get('contract_code', '')}",
        lines=lines,
    )


# ── p201: expense edits ──────────────────────────────────────────────────────

async def post_expense_adjustment(tdb, payload: dict):
    """expense.updated → one balanced adjustment entry: reversal of the old
    posted entry (if one exists) + a fresh entry for the new amount/box (if
    applicable). Idempotent per adjustment_id."""
    adj_id = payload.get("adjustment_id")
    expense_id = payload.get("expense_id")
    if not adj_id or await already_posted(tdb, adj_id, "expense_adjustment"):
        return None
    currency = payload.get("currency") or "DZD"
    old_amount = float(payload.get("old_amount", 0) or 0)
    new_amount = float(payload.get("new_amount", 0) or 0)
    old_method = payload.get("old_payment_method")
    new_method = payload.get("new_payment_method")
    had_entry = bool(expense_id) and await already_posted(tdb, expense_id, "expense")
    # USD expenses never touch the journal (cash moved at the dollar purchase)
    can_post_new = currency == "DZD" and bool(new_method) and new_amount > 0
    if not had_entry and not can_post_new:
        return None
    accounts = await ensure_accounts(tdb)
    lines = []
    if had_entry and old_amount > 0 and old_method:
        old_box = BOX_ACCOUNT.get(old_method, "530")
        lines.append(_line(accounts[old_box], debit=old_amount))
        lines.append(_line(accounts["610"], credit=old_amount))
    if can_post_new:
        new_box = BOX_ACCOUNT.get(new_method, "530")
        lines.append(_line(accounts["610"], debit=new_amount))
        lines.append(_line(accounts[new_box], credit=new_amount))
    if not lines:
        return None
    return await _insert_entry(
        tdb,
        reference=payload.get("code", ""),
        reference_id=adj_id,
        source_tag="expense_adjustment",
        description=f"قيد تسوية تلقائي — تعديل مصروف {payload.get('title', '')}",
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


# ── p221: commission engine journal entries ──

async def post_commission_entry(tdb, *, commission_id: str, amount: float, beneficiary: str, invoice_number: str = ""):
    """Commission accrued → Dr 658 (commissions expense) / Cr 421 (commissions payable)."""
    if not commission_id or amount <= 0 or await already_posted(tdb, commission_id, "commission"):
        return None
    accounts = await ensure_accounts(tdb)
    lines = [
        _line(accounts["658"], debit=amount),
        _line(accounts["421"], credit=amount),
    ]
    return await _insert_entry(
        tdb,
        reference=f"COM-{invoice_number or commission_id[:8]}",
        reference_id=commission_id,
        source_tag="commission",
        description=f"قيد تلقائي — عمولة مستحقة لـ {beneficiary} (فاتورة {invoice_number})",
        lines=lines,
    )


async def reverse_commission_entry(tdb, *, commission_id: str, amount: float, beneficiary: str):
    """Commission cancelled (sale refunded/deleted) → Dr 421 / Cr 658."""
    if not commission_id or amount <= 0 or await already_posted(tdb, commission_id, "commission_reversal"):
        return None
    accounts = await ensure_accounts(tdb)
    lines = [
        _line(accounts["421"], debit=amount),
        _line(accounts["658"], credit=amount),
    ]
    return await _insert_entry(
        tdb,
        reference=f"COMC-{commission_id[:8]}",
        reference_id=commission_id,
        source_tag="commission_reversal",
        description=f"قيد تلقائي — إلغاء عمولة {beneficiary} (مرتجع/حذف بيع)",
        lines=lines,
    )


async def post_commission_payout(tdb, *, commission_id: str, amount: float, beneficiary: str, payment_method: str):
    """Commission paid → Dr 421 / Cr cash-box."""
    if not commission_id or amount <= 0 or await already_posted(tdb, commission_id, "commission_payout"):
        return None
    accounts = await ensure_accounts(tdb)
    box_code = BOX_ACCOUNT.get(payment_method or "cash", "530")
    lines = [
        _line(accounts["421"], debit=amount),
        _line(accounts[box_code], credit=amount),
    ]
    return await _insert_entry(
        tdb,
        reference=f"COMP-{commission_id[:8]}",
        reference_id=commission_id,
        source_tag="commission_payout",
        description=f"قيد تلقائي — دفع عمولة لـ {beneficiary}",
        lines=lines,
    )
