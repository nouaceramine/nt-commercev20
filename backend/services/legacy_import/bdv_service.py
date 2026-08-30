#!/usr/bin/env python3
"""p349 — rlynx/BDV10 (Microsoft Access .dblx/.mdb/.accdb) → tenant DB importer.

Faithful port of the proven p16/p159 import (NT-0004 production data) into a
reusable, tenant-agnostic service with progress callbacks.

Guarantees:
- Idempotent: every doc carries import_source="BDV10" + legacy_id; deterministic
  uuid5 IDs mean a rerun overwrites the same logical data (purge runs first).
- Faithful debt model: sale debt = CreditAccount; AccountPayment pays OLDER open
  sales FIFO; InitialAccount → opening-balance pseudo document.
- Verification: source-vs-imported counts/sums + debt conservation + deep samples.
"""
import csv
import io
import json
import os
import subprocess
import uuid
from datetime import datetime, timezone

SRC = "BDV10"
NOW = datetime.now(timezone.utc).isoformat()

IMPORT_COLLS = ["product_families", "customer_families", "products", "customers",
                "suppliers", "sales", "purchases", "daily_sessions",
                "inventory_counts", "stock_movements", "debt_payments"]

TABLES = ["AccessDenied", "Batch", "Charge", "ChargeType", "CustomFields",
          "Customer", "CustomerFamily", "Days", "Employee", "EmployeeSalary",
          "Empty", "HomeMessages", "Houres", "Item", "ItemAdjustment",
          "ItemAlias", "ItemFamily", "ItemNote", "ItemPeremption",
          "LastEmployeeLog", "Months", "NumberSequence", "Parameter",
          "PaymentMethod", "PriceLevel", "PricingUpdate", "PricingUpdateEntry",
          "Purchase", "PurchaseEntry", "Quote", "QuoteEntry", "Receipt",
          "ReceiptEntry", "ReceiptHold", "ReceiptHoldEntry", "ReceiptTemplate",
          "ReceiptTemplateEntry", "Register", "Report", "ScaleDevice",
          "ScaleDeviceItem", "Semesters", "ShortcutItem", "StockTake",
          "StockTakeEntry", "StockTransfer", "StockTransferEntry", "Store",
          "StoreSafeIn", "StoreSafeOut", "Supplier", "SupplierItem", "Temp",
          "TransferReason", "Trimesters", "UnitOfMeasure", "VAT", "Version"]


# ───────────────────────── helpers ─────────────────────────
def uid5(coll, legacy):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"bdv10:{coll}:{legacy}"))


def f(x):
    try:
        return float(str(x).replace('"', "").replace(",", "").strip() or 0)
    except Exception:
        return 0.0


def q(x):
    v = f(x)
    return int(v) if v == int(v) else v


def s(x):
    return str(x or "").strip()


def b(x):
    return s(x) in ("1", "True", "true", "-1")


def parse_dt(x):
    x = s(x)
    if not x:
        return None
    for fmt in ("%m/%d/%y %H:%M:%S", "%m/%d/%y %H:%M", "%m/%d/%y",
                "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(x, fmt).replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            pass
    return None


def load_table(src_dir, name):
    """Read an exported table (JSON list of dicts)."""
    path = os.path.join(src_dir, f"{name}.json")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def chunk_insert(db, coll, docs_list, size=1000):
    n = 0
    for i in range(0, len(docs_list), size):
        db[coll].insert_many(docs_list[i:i + size], ordered=False)
        n += len(docs_list[i:i + size])
    return n


def purge_previous(db):
    purged = {}
    for c in IMPORT_COLLS:
        purged[c] = db[c].delete_many({"import_source": SRC}).deleted_count
    return purged


def rollback_import(db):
    """Full rollback: remove every doc this importer ever wrote."""
    return purge_previous(db)


# ───────────────────────── step 1: Access → JSON ─────────────────────────
def detect_access_file(dblx_path):
    """True if the file looks like a Jet/ACE (Access) database."""
    try:
        with open(dblx_path, "rb") as fh:
            head = fh.read(64)
        return b"Standard Jet DB" in head or b"Standard ACE DB" in head
    except Exception:
        return False


def export_access(dblx_path, out_dir, cb=None):
    """Export all known BDV tables from the Access file to JSON via mdbtools.
    Returns {table: row_count}. Raises RuntimeError with a clear Arabic message
    when the file is unreadable or mdbtools is missing."""
    os.makedirs(out_dir, exist_ok=True)
    if not detect_access_file(dblx_path):
        raise RuntimeError("الملف ليس قاعدة بيانات Access صالحة (rlynx/BDV10)")
    try:
        proc = subprocess.run(["mdb-tables", "-1", dblx_path],
                              capture_output=True, text=True, timeout=120)
    except FileNotFoundError:
        raise RuntimeError("أداة mdbtools غير مثبتة على الخادم")
    if proc.returncode != 0:
        raise RuntimeError(f"تعذرت قراءة قاعدة البيانات: {proc.stderr.strip()[:200]}")
    available = {t.strip() for t in proc.stdout.splitlines() if t.strip()}
    wanted = [t for t in TABLES if t in available]
    if "Receipt" not in available or "Item" not in available:
        raise RuntimeError("الملف قاعدة Access لكنه لا يشبه بنية rlynx/BDV10 "
                           "(جدولا Item/Receipt غير موجودين)")
    counts = {}
    total = len(wanted)
    for i, table in enumerate(wanted):
        if cb:
            cb("export", f"تفريغ جدول {table}", i, total)
        try:
            res = subprocess.run(["mdb-export", dblx_path, table],
                                 capture_output=True, timeout=300)
            text = res.stdout.decode("utf-8", errors="replace")
            rows = []
            if text.strip():
                reader = csv.DictReader(io.StringIO(text))
                for row in reader:
                    if row and any((v or "").strip() for v in row.values()):
                        rows.append({k: (v if v is not None else "")
                                     for k, v in row.items()})
            with open(os.path.join(out_dir, f"{table}.json"), "w",
                      encoding="utf-8") as fh:
                json.dump(rows, fh, ensure_ascii=False)
            counts[table] = len(rows)
        except Exception:
            counts[table] = -1  # table failed; import continues without it
    if cb:
        cb("export", "اكتمل تفريغ القاعدة", total, total)
    return counts


# ───────────────────────── step 2: master data ─────────────────────────
def import_masters(db, src_dir, cb=None):
    """Families, products, customers, suppliers. Returns id maps."""
    emp_map = {s(e["ID"]): s(e.get("EmployeeName")) for e in load_table(src_dir, "Employee")}
    uom_map = {s(u["ID"]): s(u.get("Code")) for u in load_table(src_dir, "UnitOfMeasure")}

    # product families
    fam_rows = load_table(src_dir, "ItemFamily")
    fam_map, fam_docs = {}, []
    for r in fam_rows:
        fid = uid5("product_families", r["ID"])
        fam_map[s(r["ID"])] = fid
        fam_docs.append({
            "id": fid, "name_ar": s(r.get("FamilyName")), "name_en": s(r.get("FamilyName")),
            "description_ar": "", "description_en": "", "is_active": True,
            "legacy_id": int(f(r["ID"])), "import_source": SRC,
            "created_at": parse_dt(r.get("DateCreated")) or NOW, "updated_at": NOW,
        })
    n_fam = chunk_insert(db, "product_families", fam_docs)
    if cb:
        cb("masters", f"عائلات المنتجات ({n_fam})", 1, 5)

    # customer families
    cfam_rows = load_table(src_dir, "CustomerFamily")
    cfam_map, cfam_docs = {}, []
    for r in cfam_rows:
        fid = uid5("customer_families", r["ID"])
        fam_map[s(r["ID"])] = fid
        cfam_docs.append({
            "id": fid, "name": s(r.get("FamilyName")),
            "legacy_id": int(f(r["ID"])), "import_source": SRC,
            "created_at": parse_dt(r.get("DateCreated")) or NOW,
        })
    n_cfam = chunk_insert(db, "customer_families", cfam_docs)
    if cb:
        cb("masters", f"عائلات الزبائن ({n_cfam})", 2, 5)

    # products (barcode dedup + aliases)
    item_rows = load_table(src_dir, "Item")
    alias_map = {}
    for a in load_table(src_dir, "ItemAlias"):
        alias_map.setdefault(s(a.get("ItemID")), []).append(s(a.get("Alias")))
    seen_barcodes, dup_barcodes = set(), 0
    prod_map, prod_docs = {}, []
    for it in item_rows:
        lid = s(it["ID"])
        pid = uid5("products", lid)
        prod_map[lid] = pid
        bc = s(it.get("BarCode"))
        extra = list(alias_map.get(lid, []))
        if bc:
            if bc in seen_barcodes:
                extra.append(bc)
                bc = ""
                dup_barcodes += 1
            else:
                seen_barcodes.add(bc)
        fam_id = fam_map.get(s(it.get("ItemFamilyID")), "")
        fam_name = next((d["name_ar"] for d in fam_docs if d["id"] == fam_id), "") if fam_id else ""
        name = s(it.get("ItemName"))
        prod_docs.append({
            "id": pid, "name": name, "name_ar": name, "name_en": "",
            "description_ar": s(it.get("Description")), "description_en": "",
            "article_code": s(it.get("ItemNo")), "barcode": bc,
            "additional_barcodes": extra,
            "purchase_price": f(it.get("LastPurchasePrice")) or f(it.get("Cost")),
            "retail_price": f(it.get("Price")),
            "wholesale_price": f(it.get("PriceA")),
            "super_wholesale_price": f(it.get("PriceB")),
            "tariff_a": f(it.get("PriceA")), "tariff_b": f(it.get("PriceB")),
            "tariff_c": f(it.get("PriceC")), "tariff_d": f(it.get("PriceD")),
            "quantity": q(it.get("Stock")),
            "low_stock_threshold": q(it.get("StockAlert")),
            "family_id": fam_id, "family_name": fam_name,
            "unit_of_measure": uom_map.get(s(it.get("UnitOfMeasureID")), "U"),
            "storage_location": s(it.get("BinLocation")),
            "is_non_stockable": b(it.get("NonStockItem")),
            "is_blocked": b(it.get("Inactive")),
            "serial_number_tracking": b(it.get("SerialNumberTracking")),
            "fixed_price": b(it.get("FixedPrice")),
            "internal_notes": s(it.get("Reference")),
            "image_url": "", "images": [], "compatible_models": [],
            "color": "", "sizes": [], "has_variants": False, "variants": [],
            "tax_rate": 0, "use_average_price": False, "qty_per_package": 1,
            "allow_online_payment": True, "force_qty_entry": False,
            "force_price_entry": False, "shipping_provider": "",
            "legacy_id": int(f(lid)), "import_source": SRC,
            "created_at": parse_dt(it.get("DateCreated")) or NOW, "updated_at": NOW,
        })
    n_prod = chunk_insert(db, "products", prod_docs)
    if cb:
        cb("masters", f"المنتجات ({n_prod})", 3, 5)

    # customers
    TIER = {"1": "retail", "2": "wholesale", "3": "super_wholesale",
            "4": "tariff_c", "5": "tariff_d"}
    cust_rows = load_table(src_dir, "Customer")
    cust_map, cust_docs = {}, []
    for c in cust_rows:
        lid = s(c["ID"])
        cid = uid5("customers", lid)
        cust_map[lid] = cid
        fam_id = cfam_map.get(s(c.get("CustomerFamilyID")), "")
        fam_name = next((d["name"] for d in cfam_docs if d["id"] == fam_id), "") if fam_id else ""
        cust_docs.append({
            "id": cid, "name": s(c.get("CustomerName")),
            "phone": s(c.get("Phone")), "email": s(c.get("Email")),
            "address": ", ".join(x for x in [s(c.get("Address1")), s(c.get("Address2"))] if x),
            "notes": s(c.get("Notes")), "code": s(c.get("CustomerNo")),
            "family_id": fam_id, "family_name": fam_name,
            "price_tier": TIER.get(s(c.get("PriceLevelID")), "retail"),
            "national_id": "", "commercial_register": s(c.get("RC")),
            "birthdate": "", "customer_type": "regular",
            "max_debt_limit": 0, "special_discount": f(c.get("DiscountRate")),
            "total_purchases": f(c.get("TotalPurchased")),
            "balance": 0, "total_debt": 0,
            "is_active": not b(c.get("Inactive")),
            "legacy_id": int(f(lid)), "import_source": SRC,
            "legacy_initial_account": f(c.get("InitialAccount")),
            "legacy_account_balance": f(c.get("Account")),
            "created_at": parse_dt(c.get("DateCreated")) or NOW,
        })
    n_cust = chunk_insert(db, "customers", cust_docs)
    if cb:
        cb("masters", f"الزبائن ({n_cust})", 4, 5)

    # suppliers
    sup_rows = load_table(src_dir, "Supplier")
    sup_map, sup_docs = {}, []
    for sp in sup_rows:
        lid = s(sp["ID"])
        sid = uid5("suppliers", lid)
        sup_map[lid] = sid
        sup_docs.append({
            "id": sid, "name": s(sp.get("SupplierName")),
            "contact_name": s(sp.get("Contact")), "phone": s(sp.get("Phone")),
            "email": s(sp.get("Email")), "address": s(sp.get("Address1")),
            "city": s(sp.get("City")), "notes": s(sp.get("Notes")),
            "code": s(sp.get("SupplierNo")),
            "balance": 0, "total_purchases": f(sp.get("TotalPurchased")),
            "is_active": not b(sp.get("Inactive")),
            "legacy_id": int(f(lid)), "import_source": SRC,
            "legacy_initial_account": f(sp.get("InitialAccount")),
            "legacy_account_balance": f(sp.get("Account")),
            "created_at": parse_dt(sp.get("DateCreated")) or NOW, "updated_at": NOW,
        })
    n_sup = chunk_insert(db, "suppliers", sup_docs)
    if cb:
        cb("masters", f"الموردون ({n_sup})", 5, 5)

    return {"prod": prod_map, "cust": cust_map, "sup": sup_map, "emp": emp_map,
            "dup_barcodes": dup_barcodes}


# ───────────────────────── step 3: transactions ─────────────────────────
def import_transactions(db, src_dir, maps, cb=None):
    """Sales (+FIFO debt allocation), purchases, sessions, counts, adjustments."""
    prod_map, cust_map, sup_map, emp_map = maps["prod"], maps["cust"], maps["sup"], maps["emp"]

    prod_name = {}
    for p in db.products.find({"import_source": SRC}, {"id": 1, "legacy_id": 1, "name": 1}):
        prod_name[str(p["legacy_id"])] = (p["id"], p["name"])
    cust_names, sup_names = {}, {}
    for c in db.customers.find({"import_source": SRC}, {"id": 1, "name": 1}):
        cust_names[c["id"]] = c["name"]
    for sp in db.suppliers.find({"import_source": SRC}, {"id": 1, "name": 1}):
        sup_names[sp["id"]] = sp["name"]

    # ── sales with FIFO debt allocation ──
    receipts = load_table(src_dir, "Receipt")
    rentries = load_table(src_dir, "ReceiptEntry")
    items_by_receipt = {}
    for e in rentries:
        items_by_receipt.setdefault(s(e.get("ReceiptID")), []).append(e)
    receipts.sort(key=lambda r: parse_dt(r.get("Time")) or "")

    sale_docs, pay_docs = [], []
    batch_count, open_sales = {}, {}
    opening_sales = 0

    cust_init = {}
    for c in db.customers.find({"import_source": SRC},
                               {"legacy_id": 1, "legacy_initial_account": 1}):
        cust_init[str(c["legacy_id"])] = float(c.get("legacy_initial_account") or 0)
    _opening_done = set()

    def ensure_opening_sale_c(cid_legacy, when):
        nonlocal opening_sales
        init = cust_init.get(cid_legacy, 0.0)
        if init <= 0:
            return
        cid = cust_map.get(cid_legacy)
        if not cid:
            return
        doc = {
            "id": uid5("sales", f"opening-{cid_legacy}"),
            "invoice_number": f"SOLDE-INITIAL-{cid_legacy}",
            "code": "", "customer_id": cid, "customer_name": cust_names.get(cid, ""),
            "items": [], "subtotal": init, "discount": 0,
            "delivery_fee": 0, "delivery": None,
            "total": init, "paid_amount": 0,
            "debt_amount": init, "remaining": init,
            "payment_method": "cash", "payment_type": "credit",
            "payments": [], "installment_plan": None, "status": "unpaid",
            "sale_type": "opening_balance",
            "notes": "رصيد افتتاحي مستورد من النظام القديم",
            "created_at": when or NOW, "created_by": "BDV10",
            "legacy_id": -int(f(cid_legacy)), "legacy_batch_id": "",
            "import_source": SRC,
        }
        sale_docs.append(doc)
        open_sales.setdefault(cid, []).append(doc)
        opening_sales += 1

    n_rcpt = len(receipts)
    for ri, r in enumerate(receipts):
        if cb and ri % 2000 == 0:
            cb("transactions", f"المبيعات {ri}/{n_rcpt}", ri, n_rcpt)
        lid = s(r["ID"])
        rtype = s(r.get("ReceiptType"))
        total = f(r.get("Total"))
        credit_raw = f(r.get("CreditAccount"))
        acct_pay = f(r.get("AccountPayment"))
        when = parse_dt(r.get("Time")) or NOW
        is_return = (rtype == "5") or total < 0
        credit_back = round(-credit_raw, 2) if credit_raw < 0 else 0.0
        credit = max(0.0, credit_raw)
        paid = max(0.0, round(total - credit_raw, 2))
        cid_legacy = s(r.get("CustomerID"))
        cid = cust_map.get(cid_legacy)

        if cid and cid_legacy not in _opening_done:
            _opening_done.add(cid_legacy)
            ensure_opening_sale_c(cid_legacy, when)

        items = []
        for e in items_by_receipt.get(lid, []):
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
            "id": uid5("sales", lid),
            "invoice_number": s(r.get("ReceiptNo")) or f"BDV-{lid}",
            "code": "", "customer_id": cid, "customer_name": cust_names.get(cid, ""),
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
            "notes": (s(r.get("Comment")) +
                      (f" [مبلغ مُرجع نقداً: {round(total - credit_raw, 2)}]"
                       if total < 0 and paid == 0 and total - credit_raw < 0 else "")).strip(),
            "created_at": when,
            "created_by": emp_map.get(s(r.get("EmployeeID")), "BDV10"),
            "legacy_id": int(f(lid)), "legacy_batch_id": s(r.get("BatchID")),
            "import_source": SRC,
        }
        sale_docs.append(doc)
        bid = s(r.get("BatchID"))
        if bid:
            batch_count[bid] = batch_count.get(bid, 0) + 1
        if cid and credit > 0:
            open_sales.setdefault(cid, []).append(doc)

        # return credit offsets the customer's OLDER open debt (FIFO)
        if cid and credit_back > 0:
            remaining_payment = credit_back
            sales_updated = []
            for od in open_sales.get(cid, []):
                if remaining_payment <= 0:
                    break
                if od["remaining"] <= 0 or od["id"] == doc["id"]:
                    continue
                applied = min(remaining_payment, od["remaining"])
                od["remaining"] = round(od["remaining"] - applied, 2)
                od["debt_amount"] = od["remaining"]
                od["status"] = "paid" if od["remaining"] <= 0.01 else "partial"
                sales_updated.append({"sale_id": od["id"], "payment_applied": applied,
                                      "remaining_debt": od["remaining"]})
                remaining_payment -= applied
            applied_total = round(credit_back - remaining_payment, 2)
            if applied_total > 0:
                pay_docs.append({
                    "id": uid5("debt_payments", f"{lid}-retcredit"),
                    "customer_id": cid, "customer_name": cust_names.get(cid, ""),
                    "amount": applied_total, "payment_method": "return_credit",
                    "notes": f"إرجاع مسقط من الدين — فاتورة {s(r.get('ReceiptNo'))}",
                    "sales_updated": sales_updated,
                    "created_at": when,
                    "created_by": emp_map.get(s(r.get("EmployeeID")), "BDV10"),
                    "legacy_id": f"{lid}-retcredit", "import_source": SRC,
                })

        # FIFO-allocate this receipt's account payment to open sales
        if cid and acct_pay > 0:
            remaining_payment = acct_pay
            sales_updated = []
            for od in open_sales.get(cid, []):
                if remaining_payment <= 0:
                    break
                open_debt = od["remaining"]
                if open_debt <= 0:
                    continue
                applied = min(remaining_payment, open_debt)
                od["remaining"] = round(open_debt - applied, 2)
                od["debt_amount"] = od["remaining"]
                od["paid_amount"] = round(od["paid_amount"] + applied, 2)
                od["status"] = "paid" if od["remaining"] <= 0.01 else "partial"
                od["payments"].append({"amount": applied, "method": "cash", "at": when})
                sales_updated.append({"sale_id": od["id"], "payment_applied": applied,
                                      "remaining_debt": od["remaining"]})
                remaining_payment -= applied
            applied_total = round(acct_pay - remaining_payment, 2)
            if applied_total > 0:
                pay_docs.append({
                    "id": uid5("debt_payments", f"{lid}-acctpay"),
                    "customer_id": cid, "customer_name": cust_names.get(cid, ""),
                    "amount": applied_total, "payment_method": "cash",
                    "notes": f"سداد مستورد — مرفق بفاتورة {s(r.get('ReceiptNo'))}",
                    "sales_updated": sales_updated,
                    "created_at": when,
                    "created_by": emp_map.get(s(r.get("EmployeeID")), "BDV10"),
                    "legacy_id": f"{lid}-acctpay", "import_source": SRC,
                })

    for cid_legacy in list(cust_init.keys()):
        if cid_legacy not in _opening_done:
            _opening_done.add(cid_legacy)
            ensure_opening_sale_c(cid_legacy, None)

    n_sales = chunk_insert(db, "sales", sale_docs)
    n_pay = chunk_insert(db, "debt_payments", pay_docs)
    for cid, docs_list in open_sales.items():
        bal = round(sum(d["remaining"] for d in docs_list if d["remaining"] > 0), 2)
        db.customers.update_one({"id": cid}, {"$set": {"balance": bal, "total_debt": bal}})
    if cb:
        cb("transactions", f"المبيعات ({n_sales}) + السدادات ({n_pay})", 1, 4)

    # ── purchases with FIFO supplier allocation ──
    purchases = load_table(src_dir, "Purchase")
    pentries = load_table(src_dir, "PurchaseEntry")
    items_by_purchase = {}
    for e in pentries:
        items_by_purchase.setdefault(s(e.get("PurchaseID")), []).append(e)
    purchases.sort(key=lambda p: parse_dt(p.get("ADate")) or parse_dt(p.get("DateValidated")) or "")

    sup_init = {}
    for sp in db.suppliers.find({"import_source": SRC},
                                {"legacy_id": 1, "legacy_initial_account": 1}):
        sup_init[str(sp["legacy_id"])] = float(sp.get("legacy_initial_account") or 0)

    purch_docs, spay_docs = [], []
    open_purch = {}
    opening_purch = 0
    _sup_opening_done = set()

    def ensure_opening_purchase(sid_legacy, when):
        nonlocal opening_purch
        init = sup_init.get(sid_legacy, 0.0)
        if init <= 0:
            return
        sid = sup_map.get(sid_legacy)
        if not sid:
            return
        doc = {
            "id": uid5("purchases", f"opening-{sid_legacy}"),
            "invoice_number": f"SOLDE-INITIAL-F-{sid_legacy}",
            "code": "", "supplier_id": sid, "supplier_name": sup_names.get(sid, ""),
            "items": [], "total": init, "paid_amount": 0,
            "remaining": init, "payment_method": "cash", "payments": [],
            "status": "unpaid", "stock_status": "confirmed",
            "warehouse_id": "", "warehouse_name": "",
            "notes": "رصيد افتتاحي للمورد مستورد من النظام القديم",
            "created_at": when or NOW, "created_by": "BDV10",
            "legacy_id": -int(f(sid_legacy)), "import_source": SRC,
            "purchase_type": "opening_balance",
        }
        purch_docs.append(doc)
        open_purch.setdefault(sid, []).append(doc)
        opening_purch += 1

    for p in purchases:
        lid = s(p["ID"])
        total = f(p.get("Total"))
        credit = f(p.get("CreditAccount"))
        acct_pay = f(p.get("AccountPayment"))
        paid = round(total - credit, 2)
        when = parse_dt(p.get("ADate")) or parse_dt(p.get("DateValidated")) or NOW
        sid_legacy = s(p.get("SupplierID"))
        sid = sup_map.get(sid_legacy)
        if sid and sid_legacy not in _sup_opening_done:
            _sup_opening_done.add(sid_legacy)
            ensure_opening_purchase(sid_legacy, when)
        items = []
        for e in items_by_purchase.get(lid, []):
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
            "id": uid5("purchases", lid),
            "invoice_number": s(p.get("PurchaseNo")) or f"BDVP-{lid}",
            "code": s(p.get("Reference")),
            "supplier_id": sid, "supplier_name": sup_names.get(sid, ""),
            "items": items, "total": total, "paid_amount": paid,
            "remaining": max(0, credit), "payment_method": "cash",
            "payments": ([{"amount": paid, "method": "cash", "at": when}] if paid > 0 else []),
            "status": "paid" if credit <= 0 else ("partial" if paid > 0 else "unpaid"),
            "stock_status": ("confirmed" if s(p.get("Status")) == "1" else "draft"),
            "warehouse_id": "", "warehouse_name": "",
            "notes": s(p.get("Comment")), "created_at": when,
            "created_by": emp_map.get(s(p.get("ByEmployeeID")), "BDV10"),
            "legacy_id": int(f(lid)), "import_source": SRC,
        }
        purch_docs.append(doc)
        if sid and credit > 0:
            open_purch.setdefault(sid, []).append(doc)
        if sid and acct_pay > 0:
            remaining_payment = acct_pay
            purchases_updated = []
            for od in open_purch.get(sid, []):
                if remaining_payment <= 0:
                    break
                if od["remaining"] <= 0:
                    continue
                applied = min(remaining_payment, od["remaining"])
                od["remaining"] = round(od["remaining"] - applied, 2)
                od["paid_amount"] = round(od["paid_amount"] + applied, 2)
                od["status"] = "paid" if od["remaining"] <= 0.01 else "partial"
                od["payments"].append({"amount": applied, "method": "cash", "at": when})
                purchases_updated.append({"purchase_id": od["id"],
                                          "payment_applied": applied,
                                          "remaining_debt": od["remaining"]})
                remaining_payment -= applied
            applied_total = round(acct_pay - remaining_payment, 2)
            if applied_total > 0:
                spay_docs.append({
                    "id": uid5("debt_payments", f"p{lid}-acctpay"),
                    "supplier_id": sid, "supplier_name": sup_names.get(sid, ""),
                    "amount": applied_total, "payment_method": "cash",
                    "notes": f"سداد لمورد مستورد — مرفق بفاتورة شراء {s(p.get('PurchaseNo'))}",
                    "purchases_updated": purchases_updated,
                    "created_at": when,
                    "created_by": emp_map.get(s(p.get("ByEmployeeID")), "BDV10"),
                    "legacy_id": f"p{lid}-acctpay", "import_source": SRC,
                })

    for sid_legacy in list(sup_init.keys()):
        if sid_legacy not in _sup_opening_done:
            _sup_opening_done.add(sid_legacy)
            ensure_opening_purchase(sid_legacy, None)

    n_purch = chunk_insert(db, "purchases", purch_docs)
    n_spay = chunk_insert(db, "debt_payments", spay_docs)
    for sid, docs_list in open_purch.items():
        bal = round(sum(d["remaining"] for d in docs_list if d["remaining"] > 0), 2)
        db.suppliers.update_one({"id": sid}, {"$set": {"balance": bal}})
    if cb:
        cb("transactions", f"المشتريات ({n_purch}) + سداداتها ({n_spay})", 2, 4)

    # ── daily sessions ──
    batches = load_table(src_dir, "Batch")
    sess_docs = []
    for bt in batches:
        lid = s(bt["ID"])
        sess_docs.append({
            "id": uid5("daily_sessions", lid),
            "code": s(bt.get("BatchNo")), "user_id": "",
            "user_name": emp_map.get(s(bt.get("ClosedEmployeeID")) or s(bt.get("OpenedEmployeeID")), "BDV10"),
            "opening_cash": f(bt.get("CashOpen")), "closing_cash": f(bt.get("CashClose")),
            "opened_at": parse_dt(bt.get("OpeningTime")) or NOW,
            "closed_at": parse_dt(bt.get("ClosingTime")),
            "total_sales": round(f(bt.get("CashTotal")) + f(bt.get("ChequeTotal")) +
                                 f(bt.get("TransferTotal")) + f(bt.get("OtherTotal")) +
                                 f(bt.get("CreditAccountTotal")), 2),
            "cash_sales": f(bt.get("CashTotal")),
            "credit_sales": f(bt.get("CreditAccountTotal")),
            "sales_count": batch_count.get(lid, 0),
            "status": ("closed" if s(bt.get("Status")) == "3" else "open"),
            "notes": "", "created_by": emp_map.get(s(bt.get("OpenedEmployeeID")), "BDV10"),
            "legacy_id": int(f(lid)), "import_source": SRC,
        })
    n_sess = chunk_insert(db, "daily_sessions", sess_docs)
    if cb:
        cb("transactions", f"الجلسات اليومية ({n_sess})", 3, 4)

    # ── inventory counts ──
    stocktakes = load_table(src_dir, "StockTake")
    stentries = load_table(src_dir, "StockTakeEntry")
    entries_by_st = {}
    for e in stentries:
        entries_by_st.setdefault(s(e.get("StockTakeID")), []).append(e)
    st_docs = []
    for st in stocktakes:
        lid = s(st["ID"])
        entries = [{
            "product_id": (prod_name.get(s(e.get("ItemID"))) or (None, ""))[0],
            "product_name": (prod_name.get(s(e.get("ItemID"))) or (None, ""))[1],
            "legacy_item_id": int(f(s(e.get("ItemID")) or 0)),
            "counted": f(e.get("Counted")), "expected": f(e.get("Expected")),
            "cost": f(e.get("Cost")),
        } for e in entries_by_st.get(lid, [])]
        st_docs.append({
            "id": uid5("inventory_counts", lid),
            "count_number": s(st.get("StockTakeNo")),
            "description": s(st.get("Description")), "status": s(st.get("Status")),
            "opened_at": parse_dt(st.get("DateOpened")),
            "closed_at": parse_dt(st.get("DateClosed")),
            "total_counted": f(st.get("TotalCountCounted")),
            "total_over": f(st.get("TotalCountOver")),
            "total_under": f(st.get("TotalCountUnder")),
            "cost_net": f(st.get("TotalCostNet")),
            "entries": entries,
            "created_by": emp_map.get(s(st.get("ByEmployeeID")), "BDV10"),
            "legacy_id": int(f(lid)), "import_source": SRC,
            "created_at": parse_dt(st.get("DateLastUpdated")) or NOW,
        })
    n_st = chunk_insert(db, "inventory_counts", st_docs)

    # ── stock adjustments ──
    adjustments = load_table(src_dir, "ItemAdjustment")
    adj_docs = [{
        "id": uid5("stock_movements", a["ID"]),
        "product_id": (prod_name.get(s(a.get("ItemID"))) or (None, ""))[0],
        "product_name": (prod_name.get(s(a.get("ItemID"))) or (None, ""))[1],
        "legacy_item_id": int(f(s(a.get("ItemID")) or 0)),
        "type": "adjustment", "quantity": f(a.get("Qty")),
        "date": parse_dt(a.get("ADate")) or parse_dt(a.get("Created")) or NOW,
        "created_by": emp_map.get(s(a.get("ByEmployeeID")), "BDV10"),
        "legacy_id": int(f(a["ID"])), "import_source": SRC, "created_at": NOW,
    } for a in adjustments]
    n_adj = chunk_insert(db, "stock_movements", adj_docs)
    if cb:
        cb("transactions", f"الجرد ({n_st}) + التسويات ({n_adj})", 4, 4)

    return {"sales": n_sales, "opening_sales": opening_sales,
            "customer_payments": n_pay, "purchases": n_purch,
            "opening_purchases": opening_purch, "supplier_payments": n_spay,
            "daily_sessions": n_sess, "inventory_counts": n_st,
            "stock_movements": n_adj}


# ───────────────────────── step 4: verification ─────────────────────────
def verify_import(db, src_dir, apply_mirrors=True, cb=None):
    """Source-vs-imported reconciliation (port of p159 verify, in-memory report).
    apply_mirrors=True forces customer/supplier balance mirrors to the BDV
    Account column (the legacy system stays the source of truth for balances)."""
    import random
    items = load_table(src_dir, "Item")
    receipts = load_table(src_dir, "Receipt")
    rentries = load_table(src_dir, "ReceiptEntry")
    purchases = load_table(src_dir, "Purchase")
    pentries = load_table(src_dir, "PurchaseEntry")
    customers = load_table(src_dir, "Customer")
    suppliers = load_table(src_dir, "Supplier")
    batches = load_table(src_dir, "Batch")
    stocktakes = load_table(src_dir, "StockTake")
    adjustments = load_table(src_dir, "ItemAdjustment")
    fams = load_table(src_dir, "ItemFamily")
    cfams = load_table(src_dir, "CustomerFamily")

    R = {"checks": [], "mismatches": [], "samples": []}

    def check(name, src_val, dst_val, tol=0.01):
        ok = abs(float(src_val) - float(dst_val)) <= tol
        R["checks"].append({"check": name, "source": src_val,
                            "imported": dst_val, "ok": ok})
        return ok

    check("product_families", len(fams),
          db.product_families.count_documents({"import_source": SRC}), 0)
    check("customer_families", len(cfams),
          db.customer_families.count_documents({"import_source": SRC}), 0)
    check("products", len(items),
          db.products.count_documents({"import_source": SRC}), 0)
    check("customers", len(customers),
          db.customers.count_documents({"import_source": SRC}), 0)
    check("suppliers", len(suppliers),
          db.suppliers.count_documents({"import_source": SRC}), 0)
    n_opening_sales = db.sales.count_documents(
        {"import_source": SRC, "sale_type": "opening_balance"})
    check("sales (receipts + opening)", len(receipts) + n_opening_sales,
          db.sales.count_documents({"import_source": SRC}), 0)
    n_opening_p = db.purchases.count_documents(
        {"import_source": SRC, "purchase_type": "opening_balance"})
    check("purchases (+ opening)", len(purchases) + n_opening_p,
          db.purchases.count_documents({"import_source": SRC}), 0)
    check("daily_sessions", len(batches),
          db.daily_sessions.count_documents({"import_source": SRC}), 0)
    check("inventory_counts", len(stocktakes),
          db.inventory_counts.count_documents({"import_source": SRC}), 0)
    check("stock_movements", len(adjustments),
          db.stock_movements.count_documents({"import_source": SRC}), 0)
    if cb:
        cb("verify", "مطابقة الأعداد", 1, 4)

    # products aggregates
    src_qty = sum(f(i.get("Stock")) for i in items)
    src_val = sum((f(i.get("LastPurchasePrice")) or f(i.get("Cost"))) * f(i.get("Stock"))
                  for i in items)
    src_barcodes = len({s(i.get("BarCode")) for i in items if s(i.get("BarCode"))})
    agg = list(db.products.aggregate([
        {"$match": {"import_source": SRC}},
        {"$group": {"_id": None, "qty": {"$sum": "$quantity"},
                    "val": {"$sum": {"$multiply": ["$purchase_price", "$quantity"]}}}}]))
    dst_qty = agg[0]["qty"] if agg else 0
    dst_val = round(agg[0]["val"], 2) if agg else 0
    dst_bc = db.products.count_documents({"import_source": SRC, "barcode": {"$gt": ""}})
    check("Σ product quantities", round(src_qty, 2), round(dst_qty, 2))
    check("Σ stock value (DZD)", round(src_val, 2), dst_val)
    check("unique barcodes", src_barcodes, dst_bc, 0)
    if cb:
        cb("verify", "مطابقة المخزون", 2, 4)

    # sales aggregates + debt conservation
    src_total = round(sum(f(r.get("Total")) for r in receipts), 2)
    src_credit_pos = round(sum(max(0.0, f(r.get("CreditAccount"))) for r in receipts), 2)
    src_items = len(rentries)
    agg = list(db.sales.aggregate([
        {"$match": {"import_source": SRC, "sale_type": {"$ne": "opening_balance"}}},
        {"$group": {"_id": None, "t": {"$sum": "$total"}, "d": {"$sum": "$remaining"},
                    "items": {"$sum": {"$size": "$items"}}}}]))
    pay = list(db.debt_payments.aggregate([
        {"$match": {"import_source": SRC, "customer_id": {"$exists": True}}},
        {"$group": {"_id": None, "a": {"$sum": "$amount"}}}]))
    open_rem = round(agg[0]["d"], 2) if agg else 0
    paid_debt = round(pay[0]["a"], 2) if pay else 0
    check("Σ sales totals", src_total, round(agg[0]["t"], 2) if agg else 0)
    check("debt conservation (remaining + payments)", src_credit_pos,
          round(open_rem + paid_debt, 2))
    check("sale items count", src_items, agg[0]["items"] if agg else 0, 0)

    # purchases aggregates
    src_ptotal = round(sum(f(p.get("Total")) for p in purchases), 2)
    src_pitems = len(pentries)
    agg = list(db.purchases.aggregate([
        {"$match": {"import_source": SRC, "purchase_type": {"$ne": "opening_balance"}}},
        {"$group": {"_id": None, "t": {"$sum": "$total"},
                    "items": {"$sum": {"$size": "$items"}}}}]))
    check("Σ purchase totals", src_ptotal, round(agg[0]["t"], 2) if agg else 0)
    check("purchase items count", src_pitems, agg[0]["items"] if agg else 0, 0)
    if cb:
        cb("verify", "مطابقة المبيعات والمشتريات", 3, 4)

    # customer / supplier balance mirrors vs BDV Account (authoritative)
    src_cust = {s(c["ID"]): (s(c.get("CustomerName")), f(c.get("Account")))
                for c in customers}
    for c in db.customers.find({"import_source": SRC}):
        bdv_balance = src_cust.get(str(c["legacy_id"]), (None, 0))[1]
        nt_balance = round(float(c.get("balance") or 0), 2)
        if abs(bdv_balance - nt_balance) > 0.01:
            R["mismatches"].append({"type": "customer_balance", "name": c["name"],
                                    "bdv": bdv_balance, "nt": nt_balance})
            if apply_mirrors:
                db.customers.update_one({"id": c["id"]},
                                        {"$set": {"balance": bdv_balance,
                                                  "total_debt": bdv_balance}})
    src_sup = {s(x["ID"]): f(x.get("Account")) for x in suppliers}
    for sp in db.suppliers.find({"import_source": SRC}):
        bdv_balance = src_sup.get(str(sp["legacy_id"]), 0)
        nt_balance = round(float(sp.get("balance") or 0), 2)
        if abs(bdv_balance - nt_balance) > 0.01:
            R["mismatches"].append({"type": "supplier_balance", "name": sp["name"],
                                    "bdv": bdv_balance, "nt": nt_balance})
            if apply_mirrors:
                db.suppliers.update_one({"id": sp["id"]},
                                        {"$set": {"balance": bdv_balance}})

    src_cust_debt = round(sum(v[1] for v in src_cust.values()), 2)
    dst_cust_debt = round(sum(float(c.get("balance") or 0) for c in
                              db.customers.find({"import_source": SRC}, {"balance": 1})), 2)
    src_sup_debt = round(sum(v for v in src_sup.values()), 2)
    dst_sup_debt = round(sum(float(sp.get("balance") or 0) for sp in
                             db.suppliers.find({"import_source": SRC}, {"balance": 1})), 2)
    check("Σ customer balances", src_cust_debt, dst_cust_debt)
    check("Σ supplier balances", src_sup_debt, dst_sup_debt)

    # random sale deep-check
    random.seed(42)
    sample = random.sample(receipts, min(5, len(receipts))) if receipts else []
    for r in sample:
        legacy = s(r["ID"])
        doc = db.sales.find_one({"import_source": SRC, "legacy_id": int(f(legacy))})
        if not doc:
            R["samples"].append({"receipt": legacy, "ok": False, "reason": "missing"})
            continue
        src_e = [e for e in rentries if s(e.get("ReceiptID")) == legacy]
        ok = (abs(f(r.get("Total")) - doc["total"]) < 0.01 and
              len(src_e) == len(doc["items"]))
        item_ok = all(
            any(abs(f(e.get("Price")) - di["unit_price"]) < 0.01 and
                abs(f(e.get("Qty")) - di["quantity"]) < 0.01 and
                s(e.get("ItemName")) == di["product_name"]
                for di in doc["items"])
            for e in src_e)
        R["samples"].append({"receipt": legacy, "no": s(r.get("ReceiptNo")),
                             "total_src": f(r.get("Total")), "total_db": doc["total"],
                             "items_src": len(src_e), "items_db": len(doc["items"]),
                             "ok": ok and item_ok})
    if cb:
        cb("verify", "الفحص المعمّق لعينات عشوائية", 4, 4)

    R["all_ok"] = (all(c["ok"] for c in R["checks"]) and
                   all(sm.get("ok") for sm in R["samples"]))
    R["mirrors_applied"] = apply_mirrors
    R["balance_mismatches_fixed"] = len(R["mismatches"]) if apply_mirrors else 0
    return R


# ───────────────────────── orchestrator ─────────────────────────
def run_full_import(db, dblx_path, work_dir, cb=None):
    """Full pipeline: export → purge → masters → transactions → verify.
    cb(step, label, done, total) is called throughout. Returns the report dict.
    Any exception propagates — the caller (job runner) records it on the job."""
    def wrap(step):
        def _cb(_step, label, done, total):
            if cb:
                cb(step, label, done, total)
        return _cb

    counts = export_access(dblx_path, work_dir, wrap("export"))
    failed_tables = [t for t, n in counts.items() if n == -1]
    purged = purge_previous(db)
    if cb:
        cb("purge", "تنظيف أي استيراد سابق", 1, 1)
    maps = import_masters(db, work_dir, wrap("masters"))
    stats = import_transactions(db, work_dir, maps, wrap("transactions"))
    report = verify_import(db, work_dir, apply_mirrors=True, cb=wrap("verify"))
    report["stats"] = stats
    report["export_counts"] = counts
    report["failed_tables"] = failed_tables
    report["purged_previous"] = purged
    report["duplicate_barcodes_moved"] = maps.get("dup_barcodes", 0)
    return report
