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
        payment_method: str = "cash"  # p66: cash/bank/wallet/safe/personal — personal stays outside boxes
        date: Optional[str] = None
        notes: Optional[str] = ""
        recurring: bool = False
        recurring_period: Optional[str] = "monthly"
        reminder_days_before: int = 3
        code: Optional[str] = ""
        currency: str = "DZD"                      # p111: DZD or USD (ads bought at black-market rate)
        exchange_rate: Optional[float] = None      # p111: DZD paid per 1 USD

    class ExpenseUpdate(BaseModel):
        title: Optional[str] = None
        category: Optional[str] = None
        amount: Optional[float] = None
        payment_method: Optional[str] = None  # p66
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
    async def create_expense(expense: ExpenseCreate, user: dict = Depends(require_permission("expenses.add"))):
        from services.code_generator import generate_code
        data = expense.model_dump()
        # p111: USD expense — entered in dollars, STORED in DZD at the real purchase rate,
        # so every downstream analytic (ROAS, product P&L, pricing) uses the true DZD cost.
        if (data.get("currency") or "DZD").upper() == "USD":
            rate = float(data.get("exchange_rate") or 0)
            if rate <= 0:
                raise HTTPException(status_code=400, detail="أدخل سعر صرف الدولار (دج لكل 1$)")
            data["currency"] = "USD"
            data["amount_usd"] = round(float(data["amount"]), 2)
            data["exchange_rate"] = round(rate, 2)
            data["amount"] = round(data["amount_usd"] * rate, 2)
        else:
            data["currency"] = "DZD"
            data["exchange_rate"] = None
        data["id"] = str(uuid.uuid4())
        data["date"] = data["date"] or datetime.now(timezone.utc).isoformat()
        data["created_at"] = datetime.now(timezone.utc).isoformat()
        data["created_by"] = user["id"]
        if not data.get("code"):
            data["code"] = await generate_code(db, "expenses", "CH", 5, with_year=True)
        await db.expenses.insert_one(data)
        # p66: an expense is money OUT of a cash box (personal money stays outside)
        if data.get("payment_method") and data.get("currency") != "USD":  # p68 + p112: مصروف USD خُصم من الصندوق لحظة شراء الدولار — لا خصم مزدوج
            now = datetime.now(timezone.utc).isoformat()
            await db.cash_boxes.update_one({"id": data["payment_method"]}, {"$inc": {"balance": -data["amount"]}, "$set": {"updated_at": now}})
            await db.transactions.insert_one({"id": str(uuid.uuid4()), "cash_box_id": data["payment_method"], "type": "expense", "amount": data["amount"], "description": f"مصروف - {data['title']}", "reference_type": "expense", "reference_id": data["id"], "created_at": now, "created_by": user.get("name", "")})
        data.pop("_id", None)
        return data

    @router.put("/{expense_id}")
    async def update_expense(expense_id: str, expense: ExpenseUpdate, user: dict = Depends(require_permission("expenses.edit"))):
        old = await db.expenses.find_one({"id": expense_id})
        if not old:
            raise HTTPException(status_code=404, detail="التكلفة غير موجودة")
        update_data = {k: v for k, v in expense.model_dump().items() if v is not None}
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        # p66: keep cash boxes in sync when amount/method changes (only for expenses that deducted)
        old_method = old.get("payment_method")
        old_amount = float(old.get("amount", 0))
        new_method = update_data.get("payment_method", old_method)
        new_amount = float(update_data.get("amount", old_amount))
        if old_method and old.get("currency") != "USD" and (update_data.get("amount") is not None or update_data.get("payment_method") is not None):  # p112: USD لا يُزامَن مع الصناديق
            now = update_data["updated_at"]
            if old_method and old_amount:  # p68
                await db.cash_boxes.update_one({"id": old_method}, {"$inc": {"balance": old_amount}, "$set": {"updated_at": now}})
                await db.transactions.insert_one({"id": str(uuid.uuid4()), "cash_box_id": old_method, "type": "income", "amount": old_amount, "description": f"تعديل مصروف (عكس) - {old.get('title', '')}", "reference_type": "expense_reversal", "reference_id": expense_id, "created_at": now, "created_by": user.get("name", "")})
            if new_method and new_amount:  # p68
                await db.cash_boxes.update_one({"id": new_method}, {"$inc": {"balance": -new_amount}, "$set": {"updated_at": now}})
                await db.transactions.insert_one({"id": str(uuid.uuid4()), "cash_box_id": new_method, "type": "expense", "amount": new_amount, "description": f"مصروف (معدّل) - {update_data.get('title', old.get('title', ''))}", "reference_type": "expense", "reference_id": expense_id, "created_at": now, "created_by": user.get("name", "")})
        await db.expenses.update_one({"id": expense_id}, {"$set": update_data})
        return await db.expenses.find_one({"id": expense_id}, {"_id": 0})

    @router.delete("/{expense_id}")
    async def delete_expense(expense_id: str, user: dict = Depends(require_permission("expenses.delete"))):
        old = await db.expenses.find_one({"id": expense_id})
        if not old:
            raise HTTPException(status_code=404, detail="التكلفة غير موجودة")
        result = await db.expenses.delete_one({"id": expense_id})
        # p66: refund the box only if this expense actually deducted (has payment_method)
        method = old.get("payment_method")
        if method and old.get("amount"):  # p68: refund personal box too
            now = datetime.now(timezone.utc).isoformat()
            await db.cash_boxes.update_one({"id": method}, {"$inc": {"balance": float(old["amount"])}, "$set": {"updated_at": now}})
            await db.transactions.insert_one({"id": str(uuid.uuid4()), "cash_box_id": method, "type": "income", "amount": float(old["amount"]), "description": f"حذف مصروف (استرجاع) - {old.get('title', '')}", "reference_type": "expense_reversal", "reference_id": expense_id, "created_at": now, "created_by": user.get("name", "")})
        return {"message": "تم حذف التكلفة بنجاح"}

    @router.post("/{expense_id}/mark-paid")
    async def mark_paid(expense_id: str, user: dict = Depends(require_permission("expenses.edit"))):
        if not await db.expenses.find_one({"id": expense_id}):
            raise HTTPException(status_code=404, detail="التكلفة غير موجودة")
        now = datetime.now(timezone.utc).isoformat()
        await db.expenses.update_one({"id": expense_id}, {"$set": {"date": now, "last_paid_at": now, "updated_at": now}})
        return {"message": "تم تسجيل الدفع بنجاح"}

    @router.post("/usd-purchase")
    async def usd_purchase(body: dict, user: dict = Depends(require_permission("expenses.add"))):
        """p111: شراء دولارات (السوق) — يُقيَّد بالسعر الحقيقي ويُخصم من الصندوق المختار."""
        usd = float(body.get("usd_amount") or 0)
        rate = float(body.get("rate") or 0)
        if usd <= 0 or rate <= 0:
            raise HTTPException(status_code=400, detail="أدخل كمية الدولار وسعر الصرف")
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": str(uuid.uuid4()),
            "usd_amount": round(usd, 2),
            "rate": round(rate, 2),
            "dzd_total": round(usd * rate, 2),
            "note": (body.get("note") or "").strip()[:200],
            "date": body.get("date") or now,
            "created_at": now,
            "created_by": user.get("id"),
        }
        await db.usd_purchases.insert_one(doc)
        pm = body.get("payment_method")
        if pm:
            await db.cash_boxes.update_one({"id": pm}, {"$inc": {"balance": -doc["dzd_total"]}, "$set": {"updated_at": now}})
            await db.transactions.insert_one({
                "id": str(uuid.uuid4()), "cash_box_id": pm, "type": "expense",
                "amount": doc["dzd_total"],
                "description": f"شراء {doc['usd_amount']}$ بسعر {doc['rate']} دج/$",
                "reference_type": "usd_purchase", "reference_id": doc["id"],
                "created_at": now, "created_by": user.get("name", ""),
            })
        doc.pop("_id", None)
        return doc

    @router.get("/usd-wallet")
    async def usd_wallet(user: dict = Depends(require_permission("expenses.view"))):
        """p111: محفظة الدولار — مشترى/مصروف (إعلانات USD)/متبقٍّ + متوسط سعر المتبقي (FIFO)."""
        purchases = await db.usd_purchases.find({}, {"_id": 0}).sort("created_at", 1).to_list(500)
        usd_expenses = await db.expenses.find(
            {"currency": "USD"}, {"_id": 0, "amount_usd": 1}
        ).to_list(5000)
        bought = round(sum(float(p.get("usd_amount") or 0) for p in purchases), 2)
        spent = round(sum(float(e.get("amount_usd") or 0) for e in usd_expenses), 2)
        # FIFO: consume oldest purchase layers first
        remaining, remaining_cost, to_consume = 0.0, 0.0, spent
        for p in purchases:
            layer = float(p.get("usd_amount") or 0)
            rate = float(p.get("rate") or 0)
            use = min(layer, max(to_consume, 0.0))
            to_consume -= use
            left = layer - use
            remaining += left
            remaining_cost += left * rate
        avg_rate = round(remaining_cost / remaining, 2) if remaining > 0 else None
        last_rate = float(purchases[-1].get("rate") or 0) if purchases else None
        return {
            "bought_usd": bought,
            "spent_usd": spent,
            "remaining_usd": round(remaining, 2),
            "avg_rate": avg_rate,
            "last_rate": last_rate,
            "suggested_rate": avg_rate or last_rate,
            "purchases": list(reversed(purchases[-20:])),
        }

    return router
