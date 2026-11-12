"""
Expenses Routes - Extracted from server.py
Full CRUD, stats, recurring reminders, mark paid
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
import asyncio
import math
import uuid

from pymongo.errors import PyMongoError


def create_expenses_routes(
    db, get_current_user, get_tenant_admin, require_tenant
) -> dict:
    from utils.permissions import create_permission_checker

    require_permission = create_permission_checker(db, get_current_user)
    router = APIRouter(prefix="/expenses", tags=["expenses"])

    _RECURRING_PERIODS = {"weekly", "monthly", "quarterly", "yearly"}

    def _required_text(value: Optional[str], label: str) -> str:
        text = (value or "").strip()
        if not text:
            raise HTTPException(status_code=400, detail=f"{label} مطلوب")
        if len(text) > 200:
            raise HTTPException(status_code=400, detail=f"{label} طويل جداً")
        return text

    def _positive_money(value, label: str) -> float:
        try:
            amount = float(value)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"{label} غير صالح")
        if not math.isfinite(amount) or amount <= 0:
            raise HTTPException(status_code=400, detail=f"{label} يجب أن يكون أكبر من صفر")
        return round(amount, 2)

    def _validate_date(value: Optional[str]) -> str:
        if not value:
            return datetime.now(timezone.utc).isoformat()
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.isoformat()
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="تاريخ المصروف غير صالح")

    def _validate_recurring(recurring: bool, period: Optional[str], reminder_days: int) -> tuple:
        period = (period or "monthly").strip()
        if recurring and period not in _RECURRING_PERIODS:
            raise HTTPException(status_code=400, detail="دورية التكرار غير صالحة")
        try:
            days = int(reminder_days)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="أيام التذكير غير صالحة")
        if days < 0 or days > 365:
            raise HTTPException(status_code=400, detail="أيام التذكير يجب أن تكون بين 0 و365")
        return period, days

    async def _require_box(box_id: Optional[str]) -> str:
        box_id = (box_id or "").strip()
        if box_id and not await db.cash_boxes.find_one({"id": box_id}, {"_id": 0, "id": 1}):
            raise HTTPException(status_code=400, detail="الصندوق غير موجود")
        return box_id

    class ExpenseCreate(BaseModel):
        title: str
        category: str
        amount: float
        payment_method: str = (
            "cash"  # p66: cash/bank/wallet/safe/personal — personal stays outside boxes
        )
        date: Optional[str] = None
        notes: Optional[str] = ""
        recurring: bool = False
        recurring_period: Optional[str] = "monthly"
        reminder_days_before: int = 3
        code: Optional[str] = ""
        currency: str = "DZD"  # p111: DZD or USD (ads bought at black-market rate)
        exchange_rate: Optional[float] = None  # p111: DZD paid per 1 USD
        product_id: Optional[str] = (
            None  # p290: ربط الصرف الإعلاني بمنتج (نسبة مباشرة في P&L)
        )
        product_name: Optional[str] = None  # p290

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
    async def get_expenses(
        category: Optional[str] = None,
        user: dict = Depends(require_permission("expenses.view")),
    ):
        query = {"category": category} if category else {}
        return await db.expenses.find(query, {"_id": 0}).sort("date", -1).to_list(1000)

    @router.get("/paginated")
    async def get_expenses_paginated(
        category: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
        user: dict = Depends(require_permission("expenses.view")),
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
    async def get_expenses_stats(
        user: dict = Depends(require_permission("expenses.view")),
    ):
        total_result = await db.expenses.aggregate(
            [{"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
        ).to_list(1)
        total = total_result[0]["total"] if total_result else 0
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        this_month_result = await db.expenses.aggregate(
            [
                {"$match": {"date": {"$gte": month_start.isoformat()}}},
                {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
            ]
        ).to_list(1)
        this_month = this_month_result[0]["total"] if this_month_result else 0
        last_month_end = month_start - timedelta(seconds=1)
        last_month_start = last_month_end.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        last_month_result = await db.expenses.aggregate(
            [
                {
                    "$match": {
                        "date": {
                            "$gte": last_month_start.isoformat(),
                            "$lte": last_month_end.isoformat(),
                        }
                    }
                },
                {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
            ]
        ).to_list(1)
        last_month = last_month_result[0]["total"] if last_month_result else 0
        categories = await db.expenses.aggregate(
            [
                {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}},
                {"$sort": {"total": -1}},
            ]
        ).to_list(20)
        return {
            "total": total,
            "thisMonth": this_month,
            "lastMonth": last_month,
            "byCategory": [
                {"category": c["_id"], "total": c["total"]}
                for c in categories
                if c["_id"]
            ],
        }

    @router.get("/reminders")
    async def get_reminders(user: dict = Depends(require_permission("expenses.view"))):
        now = datetime.now(timezone.utc)
        recurring = await db.expenses.find({"recurring": True}, {"_id": 0}).to_list(100)
        reminders = []
        for exp in recurring:
            date_str = exp.get("date", now.isoformat())
            try:
                if "T" in date_str:
                    last_date = (
                        datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                        if ("+" in date_str or "Z" in date_str)
                        else datetime.fromisoformat(date_str).replace(
                            tzinfo=timezone.utc
                        )
                    )
                else:
                    last_date = datetime.strptime(date_str, "%Y-%m-%d").replace(
                        tzinfo=timezone.utc
                    )
            except Exception:
                last_date = now
            period = exp.get("recurring_period", "monthly")
            reminder_days = exp.get("reminder_days_before", 3)
            if period == "monthly":
                nm = last_date.month % 12 + 1
                ny = last_date.year if nm > 1 else last_date.year + 1
                try:
                    next_due = last_date.replace(month=nm, year=ny)
                except ValueError:
                    next_due = last_date.replace(month=nm, year=ny, day=28)
            elif period == "weekly":
                next_due = last_date + timedelta(days=7)
            elif period == "quarterly":
                next_due = last_date + timedelta(days=90)
            elif period == "yearly":
                next_due = last_date.replace(year=last_date.year + 1)
            else:
                next_due = last_date + timedelta(days=30)
            days_until = (next_due - now).days
            if 0 <= days_until <= reminder_days:
                reminders.append(
                    {
                        "expense_id": exp["id"],
                        "title": exp["title"],
                        "category": exp["category"],
                        "amount": exp["amount"],
                        "due_date": next_due.isoformat(),
                        "days_until_due": days_until,
                        "is_urgent": days_until <= 1,
                    }
                )
        reminders.sort(key=lambda x: x["days_until_due"])
        return reminders

    @router.get("/estimated-cost")
    async def get_estimated_cost(
        user: dict = Depends(require_permission("expenses.view")),
    ):
        # p167: estimated daily/monthly cost of recurring expenses (display-only deduction on the dashboard)
        recurring = await db.expenses.find(
            {"recurring": True}, {"_id": 0, "amount": 1, "recurring_period": 1}
        ).to_list(200)
        per_days = {"weekly": 7.0, "monthly": 30.0, "quarterly": 90.0, "yearly": 365.0}
        daily = 0.0
        monthly = 0.0
        for exp in recurring:
            amount = float(exp.get("amount") or 0)
            days = per_days.get(exp.get("recurring_period") or "monthly", 30.0)
            daily += amount / days
            monthly += amount * 30.0 / days
        return {
            "daily_cost": round(daily, 2),
            "monthly_cost": round(monthly, 2),
            "recurring_count": len(recurring),
        }

    @router.post("")
    async def create_expense(
        expense: ExpenseCreate, user: dict = Depends(require_permission("expenses.add"))
    ):
        from services.code_generator import generate_code

        data = expense.model_dump()
        data["title"] = _required_text(data.get("title"), "عنوان المصروف")
        data["category"] = _required_text(data.get("category"), "فئة المصروف")
        data["payment_method"] = await _require_box(data.get("payment_method"))
        data["date"] = _validate_date(data.get("date"))
        data["recurring_period"], data["reminder_days_before"] = _validate_recurring(
            bool(data.get("recurring")), data.get("recurring_period"),
            data.get("reminder_days_before", 3))
        if data.get("product_id") and not await db.products.find_one(
                {"id": data["product_id"]}, {"_id": 0, "id": 1}):
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        # p111: USD expense — entered in dollars, STORED in DZD at the real purchase rate,
        # so every downstream analytic (ROAS, product P&L, pricing) uses the true DZD cost.
        if (data.get("currency") or "DZD").upper() == "USD":
            rate = _positive_money(data.get("exchange_rate"), "سعر صرف الدولار")
            data["currency"] = "USD"
            data["amount_usd"] = _positive_money(data.get("amount"), "مبلغ الدولار")
            data["exchange_rate"] = rate
            data["amount"] = round(data["amount_usd"] * rate, 2)
        else:
            data["currency"] = "DZD"
            data["exchange_rate"] = None
            data["amount"] = _positive_money(data.get("amount"), "مبلغ المصروف")
        data["id"] = str(uuid.uuid4())
        data["created_at"] = datetime.now(timezone.utc).isoformat()
        data["created_by"] = user["id"]
        if not data.get("code"):
            data["code"] = await generate_code(db, "expenses", "CH", 5, with_year=True)
        else:
            data["code"] = _required_text(data.get("code"), "كود المصروف")
        # p228: keep expense_number in sync with the unique code — the accounting
        # module writes the same collection with EXP-numbers, and any legacy/unique
        # expense_number index must never see a null from this path.
        data["expense_number"] = data["code"]

        # p495: the document, cash movement, ledger row and outbox event commit
        # atomically; a validator/write failure must not leave a half-posted expense.
        from services.outbox import outbox_write
        from config.database import client as _client, main_db as _main_db

        now = datetime.now(timezone.utc).isoformat()
        for _attempt in range(5):
            try:
                async with await _client.start_session() as _tx:
                    async with _tx.start_transaction():
                        await db.expenses.insert_one(data, session=_tx)
                        # p66: an expense is money OUT of a cash box; USD was already
                        # paid when the dollars were bought, so it never deducts twice.
                        if data.get("payment_method") and data.get("currency") != "USD":
                            moved = await db.cash_boxes.update_one(
                                {"id": data["payment_method"]},
                                {"$inc": {"balance": -data["amount"]},
                                 "$set": {"updated_at": now}},
                                session=_tx,
                            )
                            if moved.matched_count != 1:
                                raise HTTPException(status_code=400, detail="الصندوق غير موجود")
                            await db.transactions.insert_one(
                                {
                                    "id": str(uuid.uuid4()),
                                    "cash_box_id": data["payment_method"],
                                    "type": "expense",
                                    "amount": data["amount"],
                                    "description": f"مصروف - {data['title']}",
                                    "reference_type": "expense",
                                    "reference_id": data["id"],
                                    "created_at": now,
                                    "created_by": user.get("name", ""),
                                },
                                session=_tx,
                            )
                        # p193: outbox → auto journal entry (expense.created)
                        await outbox_write(
                            _main_db,
                            "expense.created",
                            {
                                "expense_id": data["id"],
                                "code": data.get("code", ""),
                                "title": data.get("title", ""),
                                "amount": data["amount"],
                                "currency": data.get("currency", "DZD"),
                                "payment_method": data.get("payment_method"),
                                "category": data.get("category"),
                            },
                            tenant_id=user.get("tenant_id") or "platform",
                            source="expenses_routes",
                            session=_tx,
                        )
                break
            except PyMongoError as exc:
                if not exc.has_error_label("TransientTransactionError") or _attempt == 4:
                    raise
                await asyncio.sleep(0.2 * (_attempt + 1))
        data.pop("_id", None)
        return data

    @router.put("/{expense_id}")
    async def update_expense(
        expense_id: str,
        expense: ExpenseUpdate,
        user: dict = Depends(require_permission("expenses.edit")),
    ):
        # p495: validate every client-owned money/reference field before touching
        # the document, boxes, ledger, or outbox.
        update_data = {k: v for k, v in expense.model_dump().items() if v is not None}
        if "title" in update_data:
            update_data["title"] = _required_text(update_data.get("title"), "عنوان المصروف")
        if "category" in update_data:
            update_data["category"] = _required_text(update_data.get("category"), "فئة المصروف")
        if "amount" in update_data:
            update_data["amount"] = _positive_money(update_data.get("amount"), "مبلغ المصروف")
        if "payment_method" in update_data:
            update_data["payment_method"] = await _require_box(update_data.get("payment_method"))
        if "date" in update_data:
            update_data["date"] = _validate_date(update_data.get("date"))
        if "recurring" in update_data or "recurring_period" in update_data or "reminder_days_before" in update_data:
            current = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
            if not current:
                raise HTTPException(status_code=404, detail="التكلفة غير موجودة")
            recurring = bool(update_data.get("recurring", current.get("recurring", False)))
            period = update_data.get("recurring_period", current.get("recurring_period", "monthly"))
            days = update_data.get("reminder_days_before", current.get("reminder_days_before", 3))
            period, days = _validate_recurring(recurring, period, days)
            if "recurring_period" in update_data:
                update_data["recurring_period"] = period
            if "reminder_days_before" in update_data:
                update_data["reminder_days_before"] = days
        if "code" in update_data:
            update_data["code"] = _required_text(update_data.get("code"), "كود المصروف")
            update_data["expense_number"] = update_data["code"]
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

        # p201 + p495: box reversal + new deduction + expense update + outbox
        # commit or abort together. The whole read/update retires on transient
        # transaction conflicts so concurrent edits get a clean retry, not 500.
        from config.database import client as _client, main_db as _main_db
        from services.outbox import outbox_write

        for _attempt in range(5):
            old = await db.expenses.find_one({"id": expense_id})
            if not old:
                raise HTTPException(status_code=404, detail="التكلفة غير موجودة")
            old_method = old.get("payment_method")
            old_amount = float(old.get("amount", 0) or 0)
            new_method = update_data.get("payment_method", old_method)
            new_amount = float(update_data.get("amount", old_amount))
            sync_boxes = (
                old.get("currency") != "USD"
                and (
                    update_data.get("amount") is not None
                    or update_data.get("payment_method") is not None
                )
            )  # p112: USD لا يُزامَن مع الصناديق
            try:
                async with await _client.start_session() as _tx:
                    async with _tx.start_transaction():
                        if sync_boxes:
                            now = update_data["updated_at"]
                            if old_method and old_amount:  # p68
                                reversed_box = await db.cash_boxes.update_one(
                                    {"id": old_method},
                                    {
                                        "$inc": {"balance": old_amount},
                                        "$set": {"updated_at": now},
                                    },
                                    session=_tx,
                                )
                                if reversed_box.matched_count != 1:
                                    raise HTTPException(status_code=400, detail="الصندوق السابق غير موجود")
                                await db.transactions.insert_one(
                                    {
                                        "id": str(uuid.uuid4()),
                                        "cash_box_id": old_method,
                                        "type": "income",
                                        "amount": old_amount,
                                        "description": f"تعديل مصروف (عكس) - {old.get('title', '')}",
                                        "reference_type": "expense_reversal",
                                        "reference_id": expense_id,
                                        "created_at": now,
                                        "created_by": user.get("name", ""),
                                    },
                                    session=_tx,
                                )
                            if new_method and new_amount:  # p68
                                moved = await db.cash_boxes.update_one(
                                    {"id": new_method},
                                    {
                                        "$inc": {"balance": -new_amount},
                                        "$set": {"updated_at": now},
                                    },
                                    session=_tx,
                                )
                                if moved.matched_count != 1:
                                    raise HTTPException(status_code=400, detail="الصندوق غير موجود")
                                await db.transactions.insert_one(
                                    {
                                        "id": str(uuid.uuid4()),
                                        "cash_box_id": new_method,
                                        "type": "expense",
                                        "amount": new_amount,
                                        "description": f"مصروف (معدّل) - {update_data.get('title', old.get('title', ''))}",
                                        "reference_type": "expense",
                                        "reference_id": expense_id,
                                        "created_at": now,
                                        "created_by": user.get("name", ""),
                                    },
                                    session=_tx,
                                )
                            # p201: outbox → auto adjustment entry (expense.updated)
                            await outbox_write(
                                _main_db,
                                "expense.updated",
                                {
                                    "adjustment_id": str(uuid.uuid4()),
                                    "expense_id": expense_id,
                                    "code": update_data.get("code", old.get("code", "")),
                                    "title": update_data.get("title", old.get("title", "")),
                                    "currency": old.get("currency", "DZD"),
                                    "old_amount": old_amount,
                                    "old_payment_method": old_method,
                                    "new_amount": new_amount,
                                    "new_payment_method": new_method,
                                },
                                tenant_id=user.get("tenant_id") or "platform",
                                source="expenses_routes",
                                session=_tx,
                            )
                        updated = await db.expenses.update_one(
                            {"id": expense_id}, {"$set": update_data}, session=_tx
                        )
                        if updated.matched_count != 1:
                            raise HTTPException(status_code=404, detail="التكلفة غير موجودة")
                break
            except PyMongoError as exc:
                if not exc.has_error_label("TransientTransactionError") or _attempt == 4:
                    raise
                await asyncio.sleep(0.2 * (_attempt + 1))
        return await db.expenses.find_one({"id": expense_id}, {"_id": 0})

    @router.delete("/{expense_id}")
    async def delete_expense(
        expense_id: str, user: dict = Depends(require_permission("expenses.delete"))
    ):
        # p495: atomic claim + refund + ledger + outbox. Concurrent deletes have
        # exactly one winner; USD expenses never refund DZD (their cash moved at
        # the dollar-purchase moment), and any write failure aborts everything.
        from services.outbox import outbox_write
        from config.database import client as _client, main_db as _main_db

        for _attempt in range(5):
            try:
                async with await _client.start_session() as _tx:
                    async with _tx.start_transaction():
                        old = await db.expenses.find_one_and_delete(
                            {"id": expense_id}, session=_tx)
                        if not old:
                            raise HTTPException(status_code=404, detail="التكلفة غير موجودة")
                        method = old.get("payment_method")
                        amount = float(old.get("amount") or 0)
                        box_refunded = False
                        if method and amount > 0 and old.get("currency") != "USD":
                            now = datetime.now(timezone.utc).isoformat()
                            moved = await db.cash_boxes.update_one(
                                {"id": method},
                                {
                                    "$inc": {"balance": amount},
                                    "$set": {"updated_at": now},
                                },
                                session=_tx,
                            )
                            box_refunded = moved.matched_count == 1
                            if box_refunded:
                                await db.transactions.insert_one(
                                    {
                                        "id": str(uuid.uuid4()),
                                        "cash_box_id": method,
                                        "type": "income",
                                        "amount": amount,
                                        "description": f"حذف مصروف (استرجاع) - {old.get('title', '')}",
                                        "reference_type": "expense_reversal",
                                        "reference_id": expense_id,
                                        "created_at": now,
                                        "created_by": user.get("name", ""),
                                    },
                                    session=_tx,
                                )
                        await outbox_write(
                            _main_db,
                            "expense.deleted",
                            {
                                "expense_id": expense_id,
                                "code": old.get("code", ""),
                                "title": old.get("title", ""),
                                "amount": amount,
                                "currency": old.get("currency", "DZD"),
                                "payment_method": method if box_refunded else None,
                            },
                            tenant_id=user.get("tenant_id") or "platform",
                            source="expenses_routes",
                            session=_tx,
                        )
                break
            except PyMongoError as exc:
                if not exc.has_error_label("TransientTransactionError") or _attempt == 4:
                    raise
                await asyncio.sleep(0.2 * (_attempt + 1))
        return {"message": "تم حذف التكلفة بنجاح"}

    @router.post("/{expense_id}/mark-paid")
    async def mark_paid(
        expense_id: str, user: dict = Depends(require_permission("expenses.edit"))
    ):
        if not await db.expenses.find_one({"id": expense_id}):
            raise HTTPException(status_code=404, detail="التكلفة غير موجودة")
        now = datetime.now(timezone.utc).isoformat()
        await db.expenses.update_one(
            {"id": expense_id},
            {"$set": {"date": now, "last_paid_at": now, "updated_at": now}},
        )
        return {"message": "تم تسجيل الدفع بنجاح"}

    @router.post("/usd-purchase")
    async def usd_purchase(
        body: dict, user: dict = Depends(require_permission("expenses.add"))
    ):
        """p111: شراء دولارات (السوق) — يُقيَّد بالسعر الحقيقي ويُخصم من الصندوق المختار."""
        usd = float(body.get("usd_amount") or 0)
        rate = float(body.get("rate") or 0)
        if usd <= 0 or rate <= 0:
            raise HTTPException(status_code=400, detail="أدخل كمية الدولار وسعر الصرف")
        pm = body.get("payment_method")
        if pm:
            # p493: the chosen box must exist — a ghost id used to record the
            # doc + a phantom transaction while the $inc matched nothing
            if not await db.cash_boxes.find_one({"id": pm}, {"_id": 0, "id": 1}):
                raise HTTPException(status_code=400, detail="الصندوق غير موجود")
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
        # p493: doc + box movement + ledger transaction commit/abort together
        import asyncio as _asyncio
        from pymongo.errors import PyMongoError as _PyMongoError
        from config.database import client as _client
        for _attempt in range(5):
            try:
                async with await _client.start_session() as _tx:
                    async with _tx.start_transaction():
                        await db.usd_purchases.insert_one(doc, session=_tx)
                        if pm:
                            await db.cash_boxes.update_one(
                                {"id": pm},
                                {"$inc": {"balance": -doc["dzd_total"]}, "$set": {"updated_at": now}},
                                session=_tx,
                            )
                            await db.transactions.insert_one(
                                {
                                    "id": str(uuid.uuid4()),
                                    "cash_box_id": pm,
                                    "type": "expense",
                                    "amount": doc["dzd_total"],
                                    "description": f"شراء {doc['usd_amount']}$ بسعر {doc['rate']} دج/$",
                                    "reference_type": "usd_purchase",
                                    "reference_id": doc["id"],
                                    "created_at": now,
                                    "created_by": user.get("name", ""),
                                },
                                session=_tx,
                            )
                break
            except _PyMongoError:
                if _attempt == 4:
                    raise
                await _asyncio.sleep(0.2 * (_attempt + 1))
        doc.pop("_id", None)
        return doc

    @router.get("/usd-wallet")
    async def usd_wallet(user: dict = Depends(require_permission("expenses.view"))):
        """p111: محفظة الدولار — مشترى/مصروف (إعلانات USD)/متبقٍّ + متوسط سعر المتبقي (FIFO)."""
        purchases = (
            await db.usd_purchases.find({}, {"_id": 0})
            .sort("created_at", 1)
            .to_list(500)
        )
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
