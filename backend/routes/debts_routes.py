"""
Debt Routes - Extracted from server.py
CRUD, payments, overdue tracking
p64: merge live customer/supplier balances as virtual debts so totals reflect reality;
     virtual debt payments adjust party mirrors; personal money never touches cash boxes.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from datetime import datetime, timezone
import uuid


def create_debts_routes(db, get_current_user, get_tenant_admin, require_tenant) -> dict:
    from utils.permissions import create_permission_checker
    require_permission = create_permission_checker(db, get_current_user)
    router = APIRouter(prefix="/debts", tags=["debts"])

    @router.post("")
    async def create_debt(debt: dict, admin: dict = Depends(require_permission("debts.add"))):
        from models.schemas import DebtCreate
        d = DebtCreate(**debt)
        if d.party_type == "customer":
            party = await db.customers.find_one({"id": d.party_id}, {"_id": 0, "name": 1})
        else:
            party = await db.suppliers.find_one({"id": d.party_id}, {"_id": 0, "name": 1})
        if not party:
            raise HTTPException(status_code=404, detail="Party not found")
        now = datetime.now(timezone.utc).isoformat()
        debt_id = str(uuid.uuid4())
        doc = {
            "id": debt_id, "type": d.type, "party_type": d.party_type, "party_id": d.party_id,
            "party_name": party["name"], "original_amount": d.amount, "paid_amount": 0,
            "remaining_amount": d.amount, "due_date": d.due_date or "", "status": "pending",
            "notes": d.notes or "", "reference_type": d.reference_type or "",
            "reference_id": d.reference_id or "", "created_at": now
        }
        await db.debts.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.get("")
    async def get_debts(type: Optional[str] = None, party_type: Optional[str] = None, status: Optional[str] = None, admin: dict = Depends(require_permission("debts.view"))):
        query = {}
        if type: query["type"] = type
        if party_type: query["party_type"] = party_type
        if status: query["status"] = status
        debts = await db.debts.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        for debt in debts:
            if debt.get("due_date") and debt["due_date"] < today and debt["status"] not in ["paid", "overdue"]:
                await db.debts.update_one({"id": debt["id"]}, {"$set": {"status": "overdue"}})
                debt["status"] = "overdue"
        # p64: merge live balance-based debts (from credit sales/purchases) so the page
        # reflects real receivables/payables. Virtual ids: virt-customer-<id> / virt-supplier-<id>
        if not status or status == "pending":
            if (not type or type == "receivable") and (not party_type or party_type == "customer"):
                customers = await db.customers.find({"balance": {"$gt": 0}}, {"_id": 0, "id": 1, "name": 1, "balance": 1, "updated_at": 1, "created_at": 1}).to_list(1000)
                for c in customers:
                    debts.append({
                        "id": f"virt-customer-{c['id']}", "type": "receivable", "party_type": "customer",
                        "party_id": c["id"], "party_name": c.get("name", ""),
                        "original_amount": c["balance"], "paid_amount": 0, "remaining_amount": c["balance"],
                        "due_date": "", "status": "pending", "notes": "", "reference_type": "balance",
                        "reference_id": "", "created_at": c.get("updated_at") or c.get("created_at") or ""
                    })
            if (not type or type == "payable") and (not party_type or party_type == "supplier"):
                suppliers = await db.suppliers.find({"balance": {"$gt": 0}}, {"_id": 0, "id": 1, "name": 1, "balance": 1, "updated_at": 1, "created_at": 1}).to_list(1000)
                for s in suppliers:
                    debts.append({
                        "id": f"virt-supplier-{s['id']}", "type": "payable", "party_type": "supplier",
                        "party_id": s["id"], "party_name": s.get("name", ""),
                        "original_amount": s["balance"], "paid_amount": 0, "remaining_amount": s["balance"],
                        "due_date": "", "status": "pending", "notes": "", "reference_type": "balance",
                        "reference_id": "", "created_at": s.get("updated_at") or s.get("created_at") or ""
                    })
        return debts

    @router.get("/paginated")
    async def get_debts_paginated(
        type: Optional[str] = None, party_type: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1, page_size: int = 20,
        admin: dict = Depends(require_permission("debts.view"))
    ):
        from utils.pagination import paginate
        query = {}
        if type: query["type"] = type
        if party_type: query["party_type"] = party_type
        if status: query["status"] = status
        return await paginate(db.debts, query, page, page_size)

    @router.post("/{debt_id}/pay")
    async def pay_debt(debt_id: str, payment: dict, admin: dict = Depends(require_permission("debts.collect"))):
        from models.schemas import DebtPaymentCreate
        p = DebtPaymentCreate(**payment)
        now = datetime.now(timezone.utc).isoformat()
        # p64: virtual balance-based debts (live party balances)
        if debt_id.startswith("virt-"):
            parts = debt_id.split("-", 2)
            if len(parts) < 3:
                raise HTTPException(status_code=404, detail="Debt not found")
            v_party_type, v_party_id = parts[1], parts[2]
            coll = db.customers if v_party_type == "customer" else db.suppliers
            party = await coll.find_one({"id": v_party_id})
            if not party:
                raise HTTPException(status_code=404, detail="Party not found")
            current_balance = party.get("balance", 0)
            if current_balance <= 0:
                raise HTTPException(status_code=400, detail="No outstanding balance")
            if p.amount > current_balance:
                raise HTTPException(status_code=400, detail="Payment exceeds remaining")
            from services.balances import adjust_customer_mirror, adjust_supplier_mirror, allocate_customer_payment, allocate_supplier_payment
            payment_id = str(uuid.uuid4())
            # p196: atomic settlement + outbox event → auto journal entry (same entries as p195)
            from config.database import client as _client, main_db as _main_db
            from services.outbox import outbox_write
            _tid = admin.get("tenant_id") or "platform"
            async with await _client.start_session() as _tx:
                async with _tx.start_transaction():
                    if v_party_type == "customer":
                        await allocate_customer_payment(db, v_party_id, p.amount, method=p.payment_method, session=_tx)
                        await adjust_customer_mirror(db, v_party_id, balance=-p.amount, total_debt=-p.amount, session=_tx)
                        tx_type, signed = "income", p.amount
                    else:
                        await allocate_supplier_payment(db, v_party_id, p.amount, method=p.payment_method, session=_tx)
                        await adjust_supplier_mirror(db, v_party_id, balance=-p.amount, session=_tx)
                        tx_type, signed = "expense", -p.amount
                    if True:  # p68: personal box is a real ledger
                        await db.cash_boxes.update_one({"id": p.payment_method}, {"$inc": {"balance": signed}, "$set": {"updated_at": now}}, session=_tx)
                        await db.transactions.insert_one({"id": str(uuid.uuid4()), "cash_box_id": p.payment_method, "type": tx_type, "amount": p.amount, "description": f"سداد دين - {party.get('name', '')}", "reference_type": "debt_payment", "reference_id": payment_id, "created_at": now, "created_by": admin["name"]}, session=_tx)
                    payment_doc = {"id": payment_id, "debt_id": debt_id, "amount": p.amount, "payment_method": p.payment_method, "notes": p.notes or "", "created_at": now, "created_by": admin["name"]}
                    await db.debt_payments.insert_one(payment_doc, session=_tx)
                    if v_party_type == "customer":
                        await outbox_write(
                            _main_db, "customer.payment_received",
                            {"payment_id": payment_id, "customer_id": v_party_id, "customer_name": party.get("name", ""), "amount": p.amount, "payment_method": p.payment_method},
                            tenant_id=_tid, source="debts_routes", session=_tx,
                        )
                    else:
                        await outbox_write(
                            _main_db, "supplier.payment_made",
                            {"payment_id": payment_id, "supplier_id": v_party_id, "supplier_name": party.get("name", ""), "amount": p.amount, "amount_applied": p.amount, "payment_method": p.payment_method},
                            tenant_id=_tid, source="debts_routes", session=_tx,
                        )
            payment_doc.pop("_id", None)
            return payment_doc
        debt = await db.debts.find_one({"id": debt_id})
        if not debt:
            raise HTTPException(status_code=404, detail="Debt not found")
        if p.amount > debt["remaining_amount"]:
            raise HTTPException(status_code=400, detail="Payment exceeds remaining")
        payment_id = str(uuid.uuid4())
        new_paid = debt["paid_amount"] + p.amount
        new_remaining = debt["remaining_amount"] - p.amount
        new_status = "paid" if new_remaining <= 0 else "partial"
        # p196: atomic settlement + outbox event → auto journal entry
        from config.database import client as _client, main_db as _main_db
        from services.outbox import outbox_write
        _tid = admin.get("tenant_id") or "platform"
        async with await _client.start_session() as _tx:
            async with _tx.start_transaction():
                await db.debts.update_one({"id": debt_id}, {"$set": {"paid_amount": new_paid, "remaining_amount": new_remaining, "status": new_status}}, session=_tx)
                payment_doc = {"id": payment_id, "debt_id": debt_id, "amount": p.amount, "payment_method": p.payment_method, "notes": p.notes or "", "created_at": now, "created_by": admin["name"]}
                await db.debt_payments.insert_one(payment_doc, session=_tx)
                tx_type = "income" if debt["type"] == "receivable" else "expense"
                amt = p.amount if tx_type == "income" else -p.amount
                if True:  # p68: personal box is a real ledger
                    await db.cash_boxes.update_one({"id": p.payment_method}, {"$inc": {"balance": amt}, "$set": {"updated_at": now}}, session=_tx)
                    await db.transactions.insert_one({"id": str(uuid.uuid4()), "cash_box_id": p.payment_method, "type": tx_type, "amount": p.amount, "description": f"سداد دين - {debt['party_name']}", "reference_type": "debt_payment", "reference_id": payment_id, "created_at": now, "created_by": admin["name"]}, session=_tx)
                if debt["type"] == "receivable":
                    await outbox_write(
                        _main_db, "customer.payment_received",
                        {"payment_id": payment_id, "customer_id": None, "customer_name": debt.get("party_name", ""), "amount": p.amount, "payment_method": p.payment_method},
                        tenant_id=_tid, source="debts_routes", session=_tx,
                    )
                else:
                    await outbox_write(
                        _main_db, "supplier.payment_made",
                        {"payment_id": payment_id, "supplier_id": None, "supplier_name": debt.get("party_name", ""), "amount": p.amount, "amount_applied": p.amount, "payment_method": p.payment_method},
                        tenant_id=_tid, source="debts_routes", session=_tx,
                    )
        payment_doc.pop("_id", None)
        return payment_doc

    @router.get("/{debt_id}/payments")
    async def get_debt_payments(debt_id: str, admin: dict = Depends(require_permission("debts.view"))):
        return await db.debt_payments.find({"debt_id": debt_id}, {"_id": 0}).sort("created_at", -1).to_list(100)

    return router
