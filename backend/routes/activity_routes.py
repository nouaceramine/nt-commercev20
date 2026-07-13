"""Employee activity timeline — read-only aggregation across tenant collections.

Answers: "who did what and when" for shop owners/managers.
Sources: sales (created_by), cashbox transactions, audit_log, attendance.
"""
from fastapi import APIRouter, Depends
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
