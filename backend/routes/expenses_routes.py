"""
Expenses Routes - Extracted from server.py
Full CRUD, stats, recurring reminders, mark paid
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid


def create_expenses_routes(db, get_current_user, get_tenant_admin, require_tenant) -> dict:
    from utils.permissions import create_permission_checker
    require_permission = create_permission_checker(db, get_current_user)
    router = APIRouter(prefix="/expenses", tags=["expenses"])

    class ExpenseCreate(BaseModel):
        title: str
        category: str
        amount: float
        date: Optional[str] = None
        notes: Optional[str] = ""
        recurring: bool = False
        recurring_period: Optional[str] = "monthly"
        reminder_days_before: int = 3
        code: Optional[str] = ""

    class ExpenseUpdate(BaseModel):
        title: Optional[str] = None
        category: Optional[str] = None
        amount: Optional[float] = None
        date: Optional[str] = None
        notes: Optional[str] = None
        recurring: Optional[bool] = None
        recurring_period: Optional[str] = None
        reminder_days_before: Optional[int] = None
        code: Optional[str] = None

    @router.get("")
    async def get_expenses(category: Optional[str] = None, user: dict = Depends(require_permission("expenses.view"))):
        query = {"category": category} if category else {}
        return await db.expenses.find(query, {"_id": 0}).sort("date", -1).to_list(1000)

    @router.get("/paginated")
    async def get_expenses_paginated(
        category: Optional[str] = None,
        start_date: Optional[str] = None, end_date: Optional[str] = None,
        page: int = 1, page_size: int = 20,
        user: dict = Depends(require_permission("expenses.view"))
    ):
        from utils.pagination import paginate
        query = {}
        if category:
            query["category"] = category
        if start_date:
            query["date"] = {"$gte": start_date}
        if end_date:
            if "date" in query:
                query["date"]["$lte"] = end_date
            else:
                query["date"] = {"$lte": end_date}
        return await paginate(db.expenses, query, page, page_size, sort_field="date")

    @router.get("/stats")
    async def get_expenses_stats(user: dict = Depends(require_permission("expenses.view"))):
        total_result = await db.expenses.aggregate([{"$group": {"_id": None, "total": {"$sum": "$amount"}}}]).to_list(1)
        total = total_result[0]["total"] if total_result else 0
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        this_month_result = await db.expenses.aggregate([{"$match": {"date": {"$gte": month_start.isoformat()}}}, {"$group": {"_id": None, "total": {"$sum": "$amount"}}}]).to_list(1)
        this_month = this_month_result[0]["total"] if this_month_result else 0
        last_month_end = month_start - timedelta(seconds=1)
        last_month_start = last_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_month_result = await db.expenses.aggregate([{"$match": {"date": {"$gte": last_month_start.isoformat(), "$lte": last_month_end.isoformat()}}}, {"$group": {"_id": None, "total": {"$sum": "$amount"}}}]).to_list(1)
        last_month = last_month_result[0]["total"] if last_month_result else 0
        categories = await db.expenses.aggregate([{"$group": {"_id": "$category", "total": {"$sum": "$amount"}}}, {"$sort": {"total": -1}}]).to_list(20)
        return {"total": total, "thisMonth": this_month, "lastMonth": last_month, "byCategory": [{"category": c["_id"], "total": c["total"]} for c in categories if c["_id"]]}

    @router.get("/reminders")
    async def get_reminders(user: dict = Depends(require_permission("expenses.view"))):
        now = datetime.now(timezone.utc)
        recurring = await db.expenses.find({"recurring": True}, {"_id": 0}).to_list(100)
        reminders = []
        for exp in recurring:
            date_str = exp.get("date", now.isoformat())
            try:
                if 'T' in date_str:
                    last_date = datetime.fromisoformat(date_str.replace('Z', '+00:00')) if ('+' in date_str or 'Z' in date_str) else datetime.fromisoformat(date_str).replace(tzinfo=timezone.utc)
                else:
                    last_date = datetime.strptime(date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
            except Exception:
                last_date = now
            period = exp.get("recurring_period", "monthly")
            reminder_days = exp.get("reminder_days_before", 3)
            if period == "monthly":
                nm = last_date.month % 12 + 1
                ny = last_date.year if nm > 1 else last_date.year + 1
                try: next_due = last_date.replace(month=nm, year=ny)
                except ValueError: next_due = last_date.replace(month=nm, year=ny, day=28)
            elif period == "weekly":
                next_due = last_date + timedelta(days=7)
            elif period == "yearly":
                next_due = last_date.replace(year=last_date.year + 1)
            else:
                next_due = last_date + timedelta(days=30)
            days_until = (next_due - now).days
            if 0 <= days_until <= reminder_days:
                reminders.append({"expense_id": exp["id"], "title": exp["title"], "category": exp["category"], "amount": exp["amount"], "due_date": next_due.isoformat(), "days_until_due": days_until, "is_urgent": days_until <= 1})
        reminders.sort(key=lambda x: x["days_until_due"])
        return reminders

    @router.post("")
    async def create_expense(expense: ExpenseCreate, user: dict = Depends(require_permission("expenses.view"))):
        from services.code_generator import generate_code
        data = expense.model_dump()
        data["id"] = str(uuid.uuid4())
        data["date"] = data["date"] or datetime.now(timezone.utc).isoformat()
        data["created_at"] = datetime.now(timezone.utc).isoformat()
        data["created_by"] = user["id"]
        if not data.get("code"):
            data["code"] = await generate_code(db, "expenses", "CH", 5, with_year=True)
        await db.expenses.insert_one(data)
        data.pop("_id", None)
        return data

    @router.put("/{expense_id}")
    async def update_expense(expense_id: str, expense: ExpenseUpdate, user: dict = Depends(require_permission("expenses.view"))):
        if not await db.expenses.find_one({"id": expense_id}):
            raise HTTPException(status_code=404, detail="التكلفة غير موجودة")
        update_data = {k: v for k, v in expense.model_dump().items() if v is not None}
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.expenses.update_one({"id": expense_id}, {"$set": update_data})
        return await db.expenses.find_one({"id": expense_id}, {"_id": 0})

    @router.delete("/{expense_id}")
    async def delete_expense(expense_id: str, user: dict = Depends(require_permission("expenses.view"))):
        result = await db.expenses.delete_one({"id": expense_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="التكلفة غير موجودة")
        return {"message": "تم حذف التكلفة بنجاح"}

    @router.post("/{expense_id}/mark-paid")
    async def mark_paid(expense_id: str, user: dict = Depends(require_permission("expenses.view"))):
        if not await db.expenses.find_one({"id": expense_id}):
            raise HTTPException(status_code=404, detail="التكلفة غير موجودة")
        now = datetime.now(timezone.utc).isoformat()
        await db.expenses.update_one({"id": expense_id}, {"$set": {"date": now, "last_paid_at": now, "updated_at": now}})
        return {"message": "تم تسجيل الدفع بنجاح"}

    return router
