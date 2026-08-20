"""Employee activity timeline — read-only aggregation across tenant collections.

Answers: "who did what and when" for shop owners/managers.
Sources: sales (created_by), cashbox transactions, audit_log, attendance.
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional


def create_activity_routes(db, get_current_user) -> dict:
    from utils.permissions import create_permission_checker
    require_permission = create_permission_checker(db, get_current_user)
    router = APIRouter(prefix="/activity", tags=["activity"])

    @router.get("/employees")
    async def employee_activity(
        employee: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        event_type: Optional[str] = None,
        limit: int = 100,
        user: dict = Depends(require_permission("employees.view")),
    ):
        limit = max(1, min(limit, 300))
        date_q = {}
        if start_date:
            date_q["$gte"] = start_date
        if end_date:
            date_q["$lte"] = end_date + ("T23:59:59" if len(end_date) == 10 else "")

        events = []

        def _want(t):
            return not event_type or event_type == t

        # ── Sales ──
        if _want("sale"):
            q = {}
            if employee:
                q["created_by"] = employee
            if date_q:
                q["created_at"] = date_q
            async for s in db.sales.find(q, {"_id": 0, "id": 1, "invoice_number": 1, "total": 1, "customer_name": 1, "created_by": 1, "created_at": 1, "status": 1}).sort("created_at", -1).limit(limit):
                events.append({
                    "type": "sale",
                    "at": s.get("created_at", ""),
                    "by": s.get("created_by", ""),
                    "summary": f"بيع — فاتورة {s.get('invoice_number', '')} ({s.get('customer_name', '')})",
                    "amount": s.get("total", 0),
                    "ref": s.get("id"),
                    "status": s.get("status", ""),
                })

        # ── Cashbox transactions ──
        if _want("transaction"):
            q = {}
            if employee:
                q["created_by"] = employee
            if date_q:
                q["created_at"] = date_q
            async for t in db.transactions.find(q, {"_id": 0, "id": 1, "type": 1, "amount": 1, "description": 1, "created_by": 1, "created_at": 1}).sort("created_at", -1).limit(limit):
                kind = "قبض" if t.get("type") == "income" else "صرف"
                events.append({
                    "type": "transaction",
                    "at": t.get("created_at", ""),
                    "by": t.get("created_by", ""),
                    "summary": f"{kind} — {t.get('description', '')}",
                    "amount": t.get("amount", 0),
                    "ref": t.get("id"),
                    "status": t.get("type", ""),
                })

        # ── Audit log (deletions & sensitive actions) ──
        if _want("audit"):
            q = {}
            if employee:
                q["performed_by"] = employee
            if date_q:
                q["created_at"] = date_q
            async for a in db.audit_log.find(q, {"_id": 0, "id": 1, "action": 1, "entity_ref": 1, "reason": 1, "performed_by": 1, "created_at": 1, "sale_total": 1}).sort("created_at", -1).limit(limit):
                events.append({
                    "type": "audit",
                    "at": a.get("created_at", ""),
                    "by": a.get("performed_by", ""),
                    "summary": f"{a.get('action', '')} — {a.get('entity_ref', '')} (السبب: {a.get('reason', '')})",
                    "amount": a.get("sale_total"),
                    "ref": a.get("id"),
                    "status": "deleted",
                })

        # ── Attendance ──
        if _want("attendance"):
            q = {}
            if employee:
                q["employee_name"] = employee
            if date_q:
                q["created_at"] = date_q
            async for at in db.attendance.find(q, {"_id": 0, "id": 1, "employee_name": 1, "status": 1, "date": 1, "created_at": 1}).sort("created_at", -1).limit(limit):
                events.append({
                    "type": "attendance",
                    "at": at.get("created_at") or at.get("date", ""),
                    "by": at.get("employee_name", ""),
                    "summary": f"حضور — {at.get('status', '')} ({at.get('date', '')})",
                    "amount": None,
                    "ref": at.get("id"),
                    "status": at.get("status", ""),
                })

        events.sort(key=lambda e: e.get("at") or "", reverse=True)
        events = events[:limit]

        by_type = {}
        for e in events:
            by_type[e["type"]] = by_type.get(e["type"], 0) + 1

        return {"total": len(events), "by_type": by_type, "events": events}

    # ── p218: per-entity activity timelines (customer / product / supplier) ──
    def _ent_date_q(start_date, end_date):
        dq = {}
        if start_date:
            dq["$gte"] = start_date
        if end_date:
            dq["$lte"] = end_date + ("T23:59:59" if len(end_date) == 10 else "")
        return dq

    def _ent_pack(events, limit):
        events.sort(key=lambda e: e.get("at") or "", reverse=True)
        events = events[:limit]
        by_type = {}
        for e in events:
            by_type[e["type"]] = by_type.get(e["type"], 0) + 1
        return {"total": len(events), "by_type": by_type, "events": events}

    def _ent_in_range(at, dq):
        if not dq:
            return True
        at = at or ""
        if "$gte" in dq and at < dq["$gte"]:
            return False
        if "$lte" in dq and at > dq["$lte"]:
            return False
        return True

    @router.get("/customer/{customer_id}")
    async def customer_activity(
        customer_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        limit: int = 200,
        user: dict = Depends(require_permission("customers.view")),
    ):
        """كل عمليات الزبون: مبيعات، تسديدات ديون، تصليحات، طلبات المتجر."""
        limit = max(1, min(limit, 500))
        customer = await db.customers.find_one({"id": customer_id}, {"_id": 0, "id": 1, "name": 1, "phone": 1})
        if not customer:
            raise HTTPException(status_code=404, detail="الزبون غير موجود")
        dq = _ent_date_q(start_date, end_date)
        events = []

        q = {"customer_id": customer_id}
        if dq:
            q["created_at"] = dq
        async for s in db.sales.find(q, {"_id": 0, "id": 1, "invoice_number": 1, "total": 1, "status": 1, "payment_type": 1, "created_by": 1, "created_at": 1}).sort("created_at", -1).limit(limit):
            events.append({
                "type": "sale",
                "at": s.get("created_at", ""),
                "by": s.get("created_by", ""),
                "summary": f"بيع — فاتورة {s.get('invoice_number', '')} ({s.get('payment_type', '')})",
                "amount": s.get("total", 0),
                "ref": s.get("id"),
                "status": s.get("status", ""),
            })

        q = {"customer_id": customer_id}
        if dq:
            q["created_at"] = dq
        async for p in db.debt_payments.find(q, {"_id": 0, "id": 1, "amount": 1, "payment_method": 1, "created_by": 1, "created_at": 1}).sort("created_at", -1).limit(limit):
            events.append({
                "type": "debt_payment",
                "at": p.get("created_at", ""),
                "by": p.get("created_by", ""),
                "summary": f"تسديد دين ({p.get('payment_method', '')})",
                "amount": p.get("amount", 0),
                "ref": p.get("id"),
                "status": "paid",
            })

        phone = (customer.get("phone") or "").strip()
        if phone:
            q = {"customer_phone": phone}
            if dq:
                q["created_at"] = dq
            async for t in db.repair_tickets.find(q, {"_id": 0, "id": 1, "ticket_number": 1, "device_name": 1, "device": 1, "status": 1, "final_cost": 1, "estimated_cost": 1, "created_at": 1}).sort("created_at", -1).limit(limit):
                device = t.get("device_name") or t.get("device") or ""
                events.append({
                    "type": "repair",
                    "at": t.get("created_at", ""),
                    "by": "",
                    "summary": f"تذكرة تصليح {t.get('ticket_number') or ''} {device}".strip(),
                    "amount": t.get("final_cost") or t.get("estimated_cost"),
                    "ref": t.get("id"),
                    "status": t.get("status", ""),
                })

            q = {"customer.phone": phone}
            if dq:
                q["created_at"] = dq
            async for o in db.ecom_orders.find(q, {"_id": 0, "id": 1, "order_number": 1, "total": 1, "status": 1, "created_at": 1}).sort("created_at", -1).limit(limit):
                events.append({
                    "type": "ecom_order",
                    "at": o.get("created_at", ""),
                    "by": "",
                    "summary": f"طلب متجر إلكتروني {o.get('order_number') or ''}".strip(),
                    "amount": o.get("total", 0),
                    "ref": o.get("id"),
                    "status": o.get("status", ""),
                })

        return _ent_pack(events, limit)

    @router.get("/product/{product_id}")
    async def product_activity(
        product_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        limit: int = 200,
        user: dict = Depends(require_permission("products.view")),
    ):
        """كل عمليات المنتج: مبيعات، مشتريات، تغييرات سعر، تدقيق، تالف، دُفعات."""
        limit = max(1, min(limit, 500))
        product = await db.products.find_one({"id": product_id}, {"_id": 0, "id": 1, "name": 1, "name_ar": 1, "name_en": 1})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        dq = _ent_date_q(start_date, end_date)
        events = []

        q = {"items.product_id": product_id}
        if dq:
            q["created_at"] = dq
        async for s in db.sales.find(q, {"_id": 0, "id": 1, "invoice_number": 1, "status": 1, "customer_name": 1, "created_by": 1, "created_at": 1, "items": 1}).sort("created_at", -1).limit(limit):
            qty, amt = 0.0, 0.0
            for it in s.get("items") or []:
                if it.get("product_id") == product_id:
                    qty += float(it.get("quantity") or 0)
                    amt += float(it.get("total") or 0)
            events.append({
                "type": "sale",
                "at": s.get("created_at", ""),
                "by": s.get("created_by", ""),
                "summary": f"بيع ×{qty:g} — فاتورة {s.get('invoice_number', '')} ({s.get('customer_name', '')})",
                "amount": round(amt, 2),
                "ref": s.get("id"),
                "status": s.get("status", ""),
            })

        q = {"items.product_id": product_id}
        if dq:
            q["created_at"] = dq
        async for p in db.purchases.find(q, {"_id": 0, "id": 1, "invoice_number": 1, "status": 1, "supplier_name": 1, "created_by": 1, "created_at": 1, "items": 1}).sort("created_at", -1).limit(limit):
            qty, amt = 0.0, 0.0
            for it in p.get("items") or []:
                if it.get("product_id") == product_id:
                    qty += float(it.get("quantity") or 0)
                    amt += float(it.get("total") or it.get("cost") or 0)
            events.append({
                "type": "purchase",
                "at": p.get("created_at", ""),
                "by": p.get("created_by", ""),
                "summary": f"شراء ×{qty:g} — {p.get('invoice_number', '')} ({p.get('supplier_name', '')})",
                "amount": round(amt, 2),
                "ref": p.get("id"),
                "status": p.get("status", ""),
            })

        q = {"product_id": product_id}
        if dq:
            q["created_at"] = dq
        async for ph in db.price_history.find(q, {"_id": 0, "id": 1, "old_price": 1, "new_price": 1, "changed_by": 1, "created_at": 1}).sort("created_at", -1).limit(limit):
            events.append({
                "type": "price_change",
                "at": ph.get("created_at", ""),
                "by": ph.get("changed_by", ""),
                "summary": f"تغيير السعر: {ph.get('old_price', 0)} ← {ph.get('new_price', 0)}",
                "amount": ph.get("new_price"),
                "ref": ph.get("id"),
                "status": "",
            })

        q = {"product_id": product_id}
        if dq:
            q["created_at"] = dq
        async for a in db.product_audit_log.find(q, {"_id": 0, "id": 1, "action": 1, "performed_by": 1, "created_at": 1}).sort("created_at", -1).limit(limit):
            events.append({
                "type": "audit",
                "at": a.get("created_at", ""),
                "by": a.get("performed_by", ""),
                "summary": f"إجراء: {a.get('action', '')}",
                "amount": None,
                "ref": a.get("id"),
                "status": a.get("action", ""),
            })

        q = {"product_id": product_id}
        if dq:
            q["created_at"] = dq
        async for d in db.defective_goods.find(q, {"_id": 0, "id": 1, "quantity": 1, "reason": 1, "status": 1, "created_at": 1}).sort("created_at", -1).limit(limit):
            events.append({
                "type": "defective",
                "at": d.get("created_at", ""),
                "by": "",
                "summary": f"سلعة تالفة ×{d.get('quantity', 0)} — {d.get('reason', '')}",
                "amount": None,
                "ref": d.get("id"),
                "status": d.get("status", ""),
            })

        q = {"product_id": product_id}
        if dq:
            q["created_at"] = dq
        async for lot in db.product_lots.find(q, {"_id": 0, "id": 1, "lot_number": 1, "quantity": 1, "expiry_date": 1, "created_at": 1}).sort("created_at", -1).limit(limit):
            events.append({
                "type": "lot",
                "at": lot.get("created_at", ""),
                "by": "",
                "summary": f"دُفعة {lot.get('lot_number', '')} ×{lot.get('quantity', 0)} (انتهاء {lot.get('expiry_date', '')})",
                "amount": None,
                "ref": lot.get("id"),
                "status": "",
            })

        return _ent_pack(events, limit)

    @router.get("/supplier/{supplier_id}")
    async def supplier_activity(
        supplier_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        limit: int = 200,
        user: dict = Depends(require_permission("suppliers.view")),
    ):
        """كل عمليات المورد: مشتريات، دفعات (من سجل payments للفواتير)، دفعات مسبقة."""
        limit = max(1, min(limit, 500))
        supplier = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0, "id": 1, "name": 1})
        if not supplier:
            raise HTTPException(status_code=404, detail="المورد غير موجود")
        dq = _ent_date_q(start_date, end_date)
        events = []

        q = {"supplier_id": supplier_id}
        if dq:
            q["created_at"] = dq
        async for p in db.purchases.find(q, {"_id": 0, "id": 1, "invoice_number": 1, "total": 1, "status": 1, "remaining": 1, "created_by": 1, "created_at": 1, "payments": 1}).sort("created_at", -1).limit(limit):
            events.append({
                "type": "purchase",
                "at": p.get("created_at", ""),
                "by": p.get("created_by", ""),
                "summary": f"شراء — {p.get('invoice_number', '')}" + (f" (متبقٍ {p.get('remaining')})" if p.get("remaining") else ""),
                "amount": p.get("total", 0),
                "ref": p.get("id"),
                "status": p.get("status", ""),
            })
            for pay in p.get("payments") or []:
                if not _ent_in_range(pay.get("at", ""), dq):
                    continue
                events.append({
                    "type": "supplier_payment",
                    "at": pay.get("at", ""),
                    "by": "",
                    "summary": f"دفعة للمورد ({pay.get('method', '')}) — {p.get('invoice_number', '')}",
                    "amount": pay.get("amount", 0),
                    "ref": p.get("id"),
                    "status": "paid",
                })

        q = {"supplier_id": supplier_id}
        if dq:
            q["created_at"] = dq
        async for ap in db.supplier_advance_payments.find(q, {"_id": 0, "id": 1, "amount": 1, "payment_method": 1, "notes": 1, "created_by": 1, "created_at": 1}).sort("created_at", -1).limit(limit):
            events.append({
                "type": "advance_payment",
                "at": ap.get("created_at", ""),
                "by": ap.get("created_by", ""),
                "summary": f"دفعة مسبقة ({ap.get('payment_method', '')})" + (f" — {ap.get('notes')}" if ap.get("notes") else ""),
                "amount": ap.get("amount", 0),
                "ref": ap.get("id"),
                "status": "paid",
            })

        return _ent_pack(events, limit)

    @router.get("/performance")
    async def employee_performance(
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        user: dict = Depends(require_permission("employees.view")),
    ):
        """Per-employee sales performance: totals, invoice count, avg basket."""
        match = {}
        date_q = {}
        if start_date:
            date_q["$gte"] = start_date
        if end_date:
            date_q["$lte"] = end_date + ("T23:59:59" if len(end_date) == 10 else "")
        if date_q:
            match["created_at"] = date_q

        pipeline = [
            {"$match": match},
            {"$group": {
                "_id": "$created_by",
                "total_sales": {"$sum": "$total"},
                "total_paid": {"$sum": "$paid_amount"},
                "invoices": {"$sum": 1},
                "avg_invoice": {"$avg": "$total"},
                "last_sale_at": {"$max": "$created_at"},
            }},
            {"$sort": {"total_sales": -1}},
        ]
        rows = await db.sales.aggregate(pipeline).to_list(100)

        # deletions per employee (accountability)
        del_pipeline = [
            {"$match": {**({"created_at": date_q} if date_q else {}), "action": "delete_sale"}},
            {"$group": {"_id": "$performed_by", "deleted": {"$sum": 1}}},
        ]
        deletions = {d["_id"]: d["deleted"] for d in await db.audit_log.aggregate(del_pipeline).to_list(100)}

        employees = [{
            "name": r["_id"] or "—",
            "total_sales": round(r.get("total_sales", 0) or 0, 2),
            "total_paid": round(r.get("total_paid", 0) or 0, 2),
            "invoices": r.get("invoices", 0),
            "avg_invoice": round(r.get("avg_invoice", 0) or 0, 2),
            "deleted_sales": deletions.get(r["_id"], 0),
            "last_sale_at": r.get("last_sale_at", ""),
        } for r in rows]

        return {
            "period": {"start": start_date, "end": end_date},
            "employees": employees,
            "totals": {
                "sales": round(sum(e["total_sales"] for e in employees), 2),
                "invoices": sum(e["invoices"] for e in employees),
            },
        }

    return router
