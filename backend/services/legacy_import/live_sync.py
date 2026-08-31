#!/usr/bin/env python3
"""p350 — Live mirror: apply incremental rlynx/BDV10 deltas pushed by the
Windows sync agent into the tenant DB.

Reuses the exact p159/p349 field mappings so live docs are indistinguishable
from batch-imported ones (same uid5 ids, same import_source tagging — live
docs additionally carry sync_live=True).

Semantics:
- receipts: nested entries; new receipts insert idempotently ($setOnInsert);
  AccountPayment allocates FIFO against the customer's open sales in DB;
  negative CreditAccount on a return offsets older debt the same way.
- items/customers/suppliers: upsert by legacy id (master fields refreshed).
- purchases: nested entries; supplier-side FIFO for AccountPayment.
- batches: upsert as daily_sessions (status may flip open→closed).
Customer/supplier balance mirrors stay authoritative to BDV's Account column.
"""
from datetime import datetime, timezone

from services.legacy_import.bdv_service import uid5, f, q, s, b, parse_dt

SRC = "BDV10"


def _now():
    return datetime.now(timezone.utc).isoformat()


def _stats(db):
    """Per-kind counters for the status endpoint."""
    return db.sync_stats


def _bump(db, kind, n):
    if n:
        db.sync_stats.update_one(
            {"_id": "live"},
            {"$inc": {f"rows.{kind}": n}, "$set": {"updated_at": _now()}},
            upsert=True)


def _emp_name(db, legacy_emp_id):
    return "rlynx-sync"


# ───────────────────────── masters ─────────────────────────
def apply_items(db, rows):
    """Upsert products from Item rows (price/stock/name refresh)."""
    n = 0
    fam_by_legacy = {str(d.get("legacy_id")): (d["id"], d.get("name_ar", ""))
                     for d in db.product_families.find({"import_source": SRC},
                                                       {"id": 1, "legacy_id": 1, "name_ar": 1})}
    uom = {}
    for it in rows:
        lid = s(it.get("ID"))
        if not lid:
            continue
        pid = uid5("products", lid)
        fam = fam_by_legacy.get(s(it.get("ItemFamilyID")), ("", ""))
        name = s(it.get("ItemName"))
        doc = {
            "name": name, "name_ar": name,
            "description_ar": s(it.get("Description")),
            "article_code": s(it.get("ItemNo")),
            "purchase_price": f(it.get("LastPurchasePrice")) or f(it.get("Cost")),
            "retail_price": f(it.get("Price")),
            "wholesale_price": f(it.get("PriceA")),
            "super_wholesale_price": f(it.get("PriceB")),
            "tariff_a": f(it.get("PriceA")), "tariff_b": f(it.get("PriceB")),
            "tariff_c": f(it.get("PriceC")), "tariff_d": f(it.get("PriceD")),
            "quantity": q(it.get("Stock")),
            "low_stock_threshold": q(it.get("StockAlert")),
            "family_id": fam[0], "family_name": fam[1],
            "storage_location": s(it.get("BinLocation")),
            "is_non_stockable": b(it.get("NonStockItem")),
            "is_blocked": b(it.get("Inactive")),
            "updated_at": _now(),
        }
        res = db.products.update_one(
            {"id": pid},
            {"$set": doc,
             "$setOnInsert": {
                 "id": pid, "barcode": s(it.get("BarCode")),
                 "additional_barcodes": [], "image_url": "", "images": [],
                 "compatible_models": [], "color": "", "sizes": [],
                 "has_variants": False, "variants": [], "tax_rate": 0,
                 "use_average_price": False, "qty_per_package": 1,
                 "allow_online_payment": True, "force_qty_entry": False,
                 "force_price_entry": False, "shipping_provider": "",
                 "legacy_id": int(f(lid)), "import_source": SRC,
                 "sync_live": True, "created_at": _now(),
             }},
            upsert=True)
        n += 1
    _bump(db, "items", n)
    return n


def apply_customers(db, rows):
    TIER = {"1": "retail", "2": "wholesale", "3": "super_wholesale",
            "4": "tariff_c", "5": "tariff_d"}
    n = 0
    for c in rows:
        lid = s(c.get("ID"))
        if not lid:
            continue
        cid = uid5("customers", lid)
        doc = {
            "name": s(c.get("CustomerName")), "phone": s(c.get("Phone")),
            "email": s(c.get("Email")),
            "address": ", ".join(x for x in [s(c.get("Address1")), s(c.get("Address2"))] if x),
            "notes": s(c.get("Notes")), "code": s(c.get("CustomerNo")),
            "price_tier": TIER.get(s(c.get("PriceLevelID")), "retail"),
            "special_discount": f(c.get("DiscountRate")),
            "total_purchases": f(c.get("TotalPurchased")),
            "is_active": not b(c.get("Inactive")),
            # BDV Account column stays the authoritative balance mirror
            "balance": f(c.get("Account")), "total_debt": f(c.get("Account")),
        }
        db.customers.update_one(
            {"id": cid},
            {"$set": doc,
             "$setOnInsert": {
                 "id": cid, "family_id": "", "family_name": "",
                 "national_id": "", "commercial_register": s(c.get("RC")),
                 "birthdate": "", "customer_type": "regular",
                 "max_debt_limit": 0,
                 "legacy_id": int(f(lid)), "import_source": SRC,
                 "sync_live": True, "legacy_initial_account": f(c.get("InitialAccount")),
                 "legacy_account_balance": f(c.get("Account")),
                 "created_at": parse_dt(c.get("DateCreated")) or _now(),
             }},
            upsert=True)
        n += 1
    _bump(db, "customers", n)
    return n


def apply_suppliers(db, rows):
    n = 0
    for sp in rows:
        lid = s(sp.get("ID"))
        if not lid:
            continue
        sid = uid5("suppliers", lid)
        doc = {
            "name": s(sp.get("SupplierName")), "contact_name": s(sp.get("Contact")),
            "phone": s(sp.get("Phone")), "email": s(sp.get("Email")),
            "address": s(sp.get("Address1")), "city": s(sp.get("City")),
            "notes": s(sp.get("Notes")), "code": s(sp.get("SupplierNo")),
            "total_purchases": f(sp.get("TotalPurchased")),
            "is_active": not b(sp.get("Inactive")),
            "balance": f(sp.get("Account")),
        }
        db.suppliers.update_one(
            {"id": sid},
            {"$set": doc,
             "$setOnInsert": {
                 "id": sid, "legacy_id": int(f(lid)), "import_source": SRC,
                 "sync_live": True, "legacy_initial_account": f(sp.get("InitialAccount")),
                 "legacy_account_balance": f(sp.get("Account")),
                 "created_at": parse_dt(sp.get("DateCreated")) or _now(),
                 "updated_at": _now(),
             }},
            upsert=True)
        n += 1
    _bump(db, "suppliers", n)
    return n


# ───────────────────────── receipts (sales) ─────────────────────────
def _fifo_allocate_customer(db, cid, amount, when, note, pay_method, legacy_tag):
    """Allocate `amount` FIFO against the customer's open sales in DB.
    Returns (applied_total, sales_updated) and writes a debt_payments doc."""
    remaining_payment = amount
    sales_updated = []
    open_docs = list(db.sales.find(
        {"customer_id": cid, "remaining": {"$gt": 0},
         "import_source": SRC},
        {"id": 1, "remaining": 1, "paid_amount": 1, "debt_amount": 1,
         "created_at": 1}).sort("created_at", 1))
    for od in open_docs:
        if remaining_payment <= 0:
            break
        open_debt = float(od.get("remaining") or 0)
        if open_debt <= 0:
            continue
        applied = min(remaining_payment, open_debt)
        new_rem = round(open_debt - applied, 2)
        db.sales.update_one(
            {"id": od["id"]},
            {"$set": {"remaining": new_rem, "debt_amount": new_rem,
                      "status": "paid" if new_rem <= 0.01 else "partial"},
             "$inc": {"paid_amount": round(applied, 2)},
             "$push": {"payments": {"amount": round(applied, 2),
                                    "method": pay_method, "at": when}}})
        sales_updated.append({"sale_id": od["id"], "payment_applied": round(applied, 2),
                              "remaining_debt": new_rem})
        remaining_payment = round(remaining_payment - applied, 2)
    applied_total = round(amount - remaining_payment, 2)
    if applied_total > 0:
        cname = (db.customers.find_one({"id": cid}, {"name": 1}) or {}).get("name", "")
        db.debt_payments.insert_one({
            "id": uid5("debt_payments", legacy_tag),
            "customer_id": cid, "customer_name": cname,
            "amount": applied_total, "payment_method": pay_method,
            "notes": note, "sales_updated": sales_updated,
            "created_at": when, "created_by": "rlynx-sync",
            "legacy_id": legacy_tag, "import_source": SRC, "sync_live": True,
        })
    return applied_total, sales_updated


def apply_receipts(db, rows):
    """Insert new receipts as sales (idempotent) + FIFO debt allocation.
    rows: receipt dicts with nested `entries` list."""
    n = 0
    prod_name = {str(p["legacy_id"]): (p["id"], p["name"])
                 for p in db.products.find({"import_source": SRC},
                                           {"id": 1, "legacy_id": 1, "name": 1})}
    rows.sort(key=lambda r: f(r.get("ID")))
    for r in rows:
        lid = s(r.get("ID"))
        if not lid:
            continue
        sale_id = uid5("sales", lid)
        if db.sales.find_one({"id": sale_id}, {"_id": 1}):
            continue  # already mirrored
        rtype = s(r.get("ReceiptType"))
        total = f(r.get("Total"))
        credit_raw = f(r.get("CreditAccount"))
        acct_pay = f(r.get("AccountPayment"))
        when = parse_dt(r.get("Time")) or _now()
        is_return = (rtype == "5") or total < 0
        credit_back = round(-credit_raw, 2) if credit_raw < 0 else 0.0
        credit = max(0.0, credit_raw)
        paid = max(0.0, round(total - credit_raw, 2))
        cid_legacy = s(r.get("CustomerID"))
        cid = uid5("customers", cid_legacy) if cid_legacy else None
        cname = ""
        if cid:
            cname = (db.customers.find_one({"id": cid}, {"name": 1}) or {}).get("name", "")

        items = []
        for e in r.get("entries", []):
            iid = s(e.get("ItemID"))
            p = prod_name.get(iid)
            unit = f(e.get("Price"))
            ext = f(e.get("ExtPrice"))
            qty = q(e.get("Qty"))
            items.append({
                "product_id": p[0] if p else None,
                "product_name": s(e.get("ItemName")) or (p[1] if p else ""),
                "barcode": "", "quantity": qty,
                "unit_price": unit, "discount": f(e.get("Discount")),
                "purchase_price": f(e.get("Cost")),
                "total": ext if ext else round(unit * (qty or 0), 2), "note": "",
            })
        status = "paid" if credit <= 0 else ("partial" if paid > 0 else "unpaid")
        doc = {
            "id": sale_id,
            "invoice_number": s(r.get("ReceiptNo")) or f"BDV-{lid}",
            "code": "", "customer_id": cid, "customer_name": cname,
            "items": items,
            "subtotal": f(r.get("SubTotal")), "discount": f(r.get("Discount")),
            "delivery_fee": 0, "delivery": None,
            "total": total, "paid_amount": paid,
            "debt_amount": credit, "remaining": credit,
            "payment_method": "cash",
            "payment_type": "cash" if credit <= 0 else ("partial" if paid > 0 else "credit"),
            "payments": ([{"amount": paid, "method": "cash", "at": when}] if paid > 0 else []),
            "installment_plan": None, "status": status,
            "sale_type": ("return" if is_return else "sale"),
            "notes": s(r.get("Comment")),
            "created_at": when, "created_by": "rlynx-sync",
            "legacy_id": int(f(lid)), "legacy_batch_id": s(r.get("BatchID")),
            "import_source": SRC, "sync_live": True,
        }
        db.sales.insert_one(doc)
        n += 1
        if cid and credit_back > 0:
            _fifo_allocate_customer(
                db, cid, credit_back, when,
                f"إرجاع مسقط من الدين — فاتورة {s(r.get('ReceiptNo'))} (مرآة حية)",
                "return_credit", f"{lid}-retcredit")
        if cid and acct_pay > 0:
            _fifo_allocate_customer(
                db, cid, acct_pay, when,
                f"سداد مستورد — مرفق بفاتورة {s(r.get('ReceiptNo'))} (مرآة حية)",
                "cash", f"{lid}-acctpay")
    _bump(db, "receipts", n)
    return n


# ───────────────────────── purchases ─────────────────────────
def _fifo_allocate_supplier(db, sid, amount, when, note, legacy_tag):
    remaining_payment = amount
    purchases_updated = []
    open_docs = list(db.purchases.find(
        {"supplier_id": sid, "remaining": {"$gt": 0}, "import_source": SRC},
        {"id": 1, "remaining": 1, "created_at": 1}).sort("created_at", 1))
    for od in open_docs:
        if remaining_payment <= 0:
            break
        open_debt = float(od.get("remaining") or 0)
        if open_debt <= 0:
            continue
        applied = min(remaining_payment, open_debt)
        new_rem = round(open_debt - applied, 2)
        db.purchases.update_one(
            {"id": od["id"]},
            {"$set": {"remaining": new_rem,
                      "status": "paid" if new_rem <= 0.01 else "partial"},
             "$inc": {"paid_amount": round(applied, 2)},
             "$push": {"payments": {"amount": round(applied, 2),
                                    "method": "cash", "at": when}}})
        purchases_updated.append({"purchase_id": od["id"],
                                  "payment_applied": round(applied, 2),
                                  "remaining_debt": new_rem})
        remaining_payment = round(remaining_payment - applied, 2)
    applied_total = round(amount - remaining_payment, 2)
    if applied_total > 0:
        sname = (db.suppliers.find_one({"id": sid}, {"name": 1}) or {}).get("name", "")
        db.debt_payments.insert_one({
            "id": uid5("debt_payments", legacy_tag),
            "supplier_id": sid, "supplier_name": sname,
            "amount": applied_total, "payment_method": "cash",
            "notes": note, "purchases_updated": purchases_updated,
            "created_at": when, "created_by": "rlynx-sync",
            "legacy_id": legacy_tag, "import_source": SRC, "sync_live": True,
        })
    return applied_total


def apply_purchases(db, rows):
    n = 0
    prod_name = {str(p["legacy_id"]): (p["id"], p["name"])
                 for p in db.products.find({"import_source": SRC},
                                           {"id": 1, "legacy_id": 1, "name": 1})}
    rows.sort(key=lambda p: f(p.get("ID")))
    for p in rows:
        lid = s(p.get("ID"))
        if not lid:
            continue
        pid = uid5("purchases", lid)
        if db.purchases.find_one({"id": pid}, {"_id": 1}):
            continue
        total = f(p.get("Total"))
        credit = f(p.get("CreditAccount"))
        acct_pay = f(p.get("AccountPayment"))
        paid = round(total - credit, 2)
        when = parse_dt(p.get("ADate")) or parse_dt(p.get("DateValidated")) or _now()
        sid_legacy = s(p.get("SupplierID"))
        sid = uid5("suppliers", sid_legacy) if sid_legacy else None
        sname = ""
        if sid:
            sname = (db.suppliers.find_one({"id": sid}, {"name": 1}) or {}).get("name", "")
        items = []
        for e in p.get("entries", []):
            iid = s(e.get("ItemID"))
            pm = prod_name.get(iid)
            unit = f(e.get("Price"))
            ext = f(e.get("ExtPrice"))
            qty = q(e.get("Qty"))
            items.append({
                "product_id": pm[0] if pm else None,
                "product_name": s(e.get("ItemName")) or (pm[1] if pm else ""),
                "quantity": qty, "unit_price": unit,
                "total": ext if ext else round(unit * (qty or 0), 2),
            })
        doc = {
            "id": pid, "invoice_number": s(p.get("PurchaseNo")) or f"BDVP-{lid}",
            "code": s(p.get("Reference")),
            "supplier_id": sid, "supplier_name": sname,
            "items": items, "total": total, "paid_amount": paid,
            "remaining": max(0, credit), "payment_method": "cash",
            "payments": ([{"amount": paid, "method": "cash", "at": when}] if paid > 0 else []),
            "status": "paid" if credit <= 0 else ("partial" if paid > 0 else "unpaid"),
            "stock_status": ("confirmed" if s(p.get("Status")) == "1" else "draft"),
            "warehouse_id": "", "warehouse_name": "",
            "notes": s(p.get("Comment")), "created_at": when,
            "created_by": "rlynx-sync",
            "legacy_id": int(f(lid)), "import_source": SRC, "sync_live": True,
        }
        db.purchases.insert_one(doc)
        n += 1
        if sid and acct_pay > 0:
            _fifo_allocate_supplier(
                db, sid, acct_pay, when,
                f"سداد لمورد — فاتورة شراء {s(p.get('PurchaseNo'))} (مرآة حية)",
                f"p{lid}-acctpay")
    _bump(db, "purchases", n)
    return n


# ───────────────────────── batches (daily sessions) ─────────────────────────
def apply_batches(db, rows):
    n = 0
    for bt in rows:
        lid = s(bt.get("ID"))
        if not lid:
            continue
        doc = {
            "code": s(bt.get("BatchNo")), "user_id": "",
            "user_name": "rlynx-sync",
            "opening_cash": f(bt.get("CashOpen")), "closing_cash": f(bt.get("CashClose")),
            "opened_at": parse_dt(bt.get("OpeningTime")) or _now(),
            "closed_at": parse_dt(bt.get("ClosingTime")),
            "total_sales": round(f(bt.get("CashTotal")) + f(bt.get("ChequeTotal")) +
                                 f(bt.get("TransferTotal")) + f(bt.get("OtherTotal")) +
                                 f(bt.get("CreditAccountTotal")), 2),
            "cash_sales": f(bt.get("CashTotal")),
            "credit_sales": f(bt.get("CreditAccountTotal")),
            "status": ("closed" if s(bt.get("Status")) == "3" else "open"),
            "updated_at": _now(),
        }
        db.daily_sessions.update_one(
            {"id": uid5("daily_sessions", lid)},
            {"$set": doc,
             "$setOnInsert": {"id": uid5("daily_sessions", lid), "notes": "",
                              "created_by": "rlynx-sync", "legacy_id": int(f(lid)),
                              "import_source": SRC, "sync_live": True}},
            upsert=True)
        n += 1
    _bump(db, "batches", n)
    return n


# ───────────────────────── reconciliation digest (p355) ─────────────────────────
def apply_digest(db, rows):
    """Store the agent's daily truth digest (computed from the LEGACY database)
    so the server can reconcile it against what the mirror actually stored."""
    n = 0
    for r in rows:
        kind = s(r.get("kind"))
        if kind == "masters":
            db.sync_digests.update_one(
                {"_id": "masters"},
                {"$set": {"items": int(f(r.get("items"))),
                          "customers": int(f(r.get("customers"))),
                          "suppliers": int(f(r.get("suppliers"))),
                          "at": _now()}},
                upsert=True)
            n += 1
            continue
        day = s(r.get("day"))[:10]
        if kind not in ("sale", "purchase") or len(day) != 10:
            continue
        db.sync_digests.update_one(
            {"_id": f"{kind}:{day}"},
            {"$set": {"kind": kind, "day": day,
                      "count": int(f(r.get("count"))),
                      "total": round(f(r.get("total")), 2),
                      "credit": round(f(r.get("credit")), 2),
                      "at": _now()}},
            upsert=True)
        n += 1
    _bump(db, "digest", n)
    return n


APPLIERS = {
    "digest": apply_digest,
    "items": apply_items,
    "customers": apply_customers,
    "suppliers": apply_suppliers,
    "receipts": apply_receipts,
    "purchases": apply_purchases,
    "batches": apply_batches,
}


def apply_push(db, tables):
    """Dispatch one agent push: {kind: [rows]}. Order matters — masters
    before receipts so name lookups resolve. Returns {kind: applied}."""
    result = {}
    for kind in ("items", "customers", "suppliers", "purchases", "receipts", "batches", "digest"):
        rows = tables.get(kind)
        if rows:
            n = APPLIERS[kind](db, rows)
            if n:
                result[kind] = n
    return result
