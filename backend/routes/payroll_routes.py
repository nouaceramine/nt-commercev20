"""Payroll module (قسائم الرواتب) — module pack M6.

The existing stack stops at an ephemeral salary-report: attendance is recorded,
advances are handed out (mirrored on employee.total_advances), and a monthly
report is computed on the fly — but nothing is ever finalized, paid, or posted
to accounting. M6 closes that loop:

- POST /generate builds one DRAFT payslip per employee per month (idempotent:
  one open payslip per employee+month, cancelled ones can be regenerated)
- POST /{id}/pay moves the money: cash box down, balanced journal entry
  (Dr 641 مصاريف الرواتب والأجور / Cr box account), month's advances are
  marked settled_in_payslip and the employee.total_advances mirror is
  decremented by exactly what the payslip consumed
- POST /{id}/cancel releases a draft so it can be regenerated

Computation mirrors /employees/salary-report but reads the WRITE-side
collections (attendance, advances) that record_attendance / create_advance
actually populate (the legacy report reads employee_attendance /
employee_advances which stay empty).
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from utils.ids import new_id

PAYROLL_ACCOUNTS = [
    ("641", "مصاريف الرواتب والأجور", "expense"),
]

MONTH_RE = r"^\d{4}-(0[1-9]|1[0-2])$"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _month_bounds(month: str):
    y, m = map(int, month.split("-"))
    start = datetime(y, m, 1, tzinfo=timezone.utc)
    end = datetime(y + 1, 1, 1, tzinfo=timezone.utc) if m == 12 else datetime(y, m + 1, 1, tzinfo=timezone.utc)
    return start.isoformat(), end.isoformat()


def compute_net(base: float, commission: float, advances: float) -> float:
    return round(base + commission - advances, 2)


class GenerateIn(BaseModel):
    month: str = Field(pattern=MONTH_RE)


class PayIn(BaseModel):
    box: str = "cash"
    notes: str = ""


def create_payroll_routes(db, get_current_user, get_tenant_admin, require_tenant):
    router = APIRouter(prefix="/payroll", tags=["payroll"])

    async def _ensure_accounts() -> dict:
        out = {}
        for code, name, atype in PAYROLL_ACCOUNTS:
            acc = await db.accounts.find_one({"code": code})
            if not acc:
                acc = {"id": new_id(), "code": code, "name": name, "name_ar": name,
                       "account_type": atype, "parent_id": None,
                       "description": "حساب الرواتب (نظام)", "balance": 0,
                       "is_active": True, "created_by": "system", "created_at": _now()}
                try:
                    await db.accounts.insert_one(acc)
                except Exception:
                    acc = await db.accounts.find_one({"code": code})
            out[code] = acc
        return out

    def _line(acc, debit=0.0, credit=0.0):
        return {"account_id": acc["id"], "account_code": acc["code"],
                "account_name": acc.get("name_ar") or acc.get("name"),
                "debit": round(float(debit), 2), "credit": round(float(credit), 2)}

    async def _compute_payslip(emp: dict, month: str) -> dict:
        start, end = _month_bounds(month)
        advances = await db.advances.find(
            {"employee_id": emp["id"], "created_at": {"$gte": start, "$lt": end},
             "settled_in_payslip": {"$exists": False}},
            {"_id": 0}).to_list(200)
        total_advances = round(sum(a.get("amount", 0) for a in advances), 2)
        attendance = await db.attendance.find(
            {"employee_id": emp["id"], "date": {"$gte": start[:10], "$lt": end[:10]}},
            {"_id": 0}).to_list(40)
        present = len([a for a in attendance if a.get("status") == "present"])
        absent = len([a for a in attendance if a.get("status") == "absent"])
        sales = await db.sales.find(
            {"created_by": {"$in": [emp.get("user_email"), emp.get("name")]},
             "created_at": {"$gte": start, "$lt": end}},
            {"total": 1}).to_list(2000)
        total_sales = round(sum(s.get("total", 0) for s in sales), 2)
        commission = round(total_sales * (emp.get("commission_rate", 0) / 100), 2)
        base = round(emp.get("salary", 0), 2)
        return {
            "base_salary": base,
            "commission_rate": emp.get("commission_rate", 0),
            "total_sales": total_sales,
            "commission": commission,
            "advances": total_advances,
            "advance_ids": [a["id"] for a in advances],
            "attendance_days": present,
            "absence_days": absent,
            "net_salary": compute_net(base, commission, total_advances),
        }

    async def _next_code(month: str) -> str:
        counter = await db.counters.find_one_and_update(
            {"_id": f"PAY_{month}"}, {"$inc": {"seq": 1}},
            upsert=True, return_document=True)
        return f"PAY-{month}-{counter['seq']:03d}"

    # ── Generate drafts for a month (idempotent per employee+month) ──
    @router.post("/generate", status_code=201)
    async def generate(body: GenerateIn, user: dict = Depends(get_tenant_admin)):
        employees = await db.employees.find({}, {"_id": 0}).to_list(500)
        if not employees:
            raise HTTPException(status_code=404, detail="لا يوجد موظفون")
        existing = await db.payslips.find(
            {"month": body.month, "status": {"$ne": "cancelled"}},
            {"employee_id": 1}).to_list(500)
        have = {p["employee_id"] for p in existing}
        now = _now()
        created, skipped = [], []
        for emp in employees:
            if emp["id"] in have:
                skipped.append(emp.get("name", emp["id"]))
                continue
            calc = await _compute_payslip(emp, body.month)
            doc = {
                "id": new_id(), "code": await _next_code(body.month),
                "employee_id": emp["id"], "employee_name": emp.get("name", ""),
                "position": emp.get("position", ""), "month": body.month,
                **calc, "status": "draft",
                "created_at": now, "created_by": user.get("name", ""),
            }
            await db.payslips.insert_one(doc)
            doc.pop("_id", None)
            created.append(doc)
        return {"month": body.month, "created": len(created),
                "skipped_existing": skipped, "payslips": created}

    # ── List payslips ──
    @router.get("/payslips")
    async def list_payslips(month: Optional[str] = None, user: dict = Depends(require_tenant)):
        q = {"month": month} if month else {}
        items = await db.payslips.find(q, {"_id": 0}).sort("code", 1).to_list(1000)
        return {"items": items, "count": len(items),
                "total_net": round(sum(p.get("net_salary", 0) for p in items
                                       if p.get("status") != "cancelled"), 2)}

    @router.get("/payslips/{payslip_id}")
    async def get_payslip(payslip_id: str, user: dict = Depends(require_tenant)):
        p = await db.payslips.find_one({"id": payslip_id}, {"_id": 0})
        if not p:
            raise HTTPException(status_code=404, detail="القسيمة غير موجودة")
        return p

    # ── Pay a draft payslip ──
    @router.post("/payslips/{payslip_id}/pay")
    async def pay_payslip(payslip_id: str, body: PayIn, user: dict = Depends(get_tenant_admin)):
        # p502: atomic claim draft->paying BEFORE any side effect — the old
        # check-then-act let concurrent pays all pass the status check and
        # debit the box / post the journal multiple times. On any failure the
        # claim rolls back to draft so the payslip stays payable.
        p = await db.payslips.find_one_and_update(
            {"id": payslip_id, "status": "draft"},
            {"$set": {"status": "paying", "updated_at": _now()}})
        if not p:
            exists = await db.payslips.find_one({"id": payslip_id}, {"_id": 0, "status": 1})
            if not exists:
                raise HTTPException(status_code=404, detail="القسيمة غير موجودة")
            raise HTTPException(status_code=400, detail="القسيمة مدفوعة أو ملغاة مسبقاً")
        try:
            box = await db.cash_boxes.find_one({"id": body.box})
            if not box or box.get("type") == "ecom":
                raise HTTPException(status_code=400, detail="اختر صندوق دفع حقيقياً (غير صناديق الناقلين)")
            net = round(p["net_salary"], 2)
            if net <= 0:
                raise HTTPException(status_code=422, detail="صافي الراتب يجب أن يكون أكبر من صفر")
            accs = await _ensure_accounts()
            from services.accounting_auto import BOX_ACCOUNT, ensure_accounts, _insert_entry
            await ensure_accounts(db)
            box_acc = await db.accounts.find_one({"code": BOX_ACCOUNT.get(body.box, "530")})
            if not box_acc:
                raise HTTPException(status_code=400, detail="حساب الصندوق غير موجود")
            now = _now()
            await _insert_entry(
                db, reference=f"راتب {p['month']} — {p['employee_name']}",
                reference_id=payslip_id, source_tag="payroll",
                description=(f"{p['code']}: أساسي {p['base_salary']} + عمولة {p['commission']}"
                             f" − سلف {p['advances']} = صافي {net}"),
                lines=[_line(accs["641"], debit=net), _line(box_acc, credit=net)],
                date=now[:10])
            await db.cash_boxes.update_one({"id": body.box},
                                           {"$inc": {"balance": -net}, "$set": {"updated_at": now}})
            if p.get("advance_ids"):
                await db.advances.update_many(
                    {"id": {"$in": p["advance_ids"]}},
                    {"$set": {"settled_in_payslip": payslip_id, "settled_at": now}})
                await db.employees.update_one(
                    {"id": p["employee_id"]},
                    {"$inc": {"total_advances": -p["advances"]}})
        except Exception:
            await db.payslips.update_one(
                {"id": payslip_id, "status": "paying"},
                {"$set": {"status": "draft", "updated_at": _now()}})
            raise
        await db.payslips.update_one(
            {"id": payslip_id},
            {"$set": {"status": "paid", "box": body.box, "paid_at": now,
                      "paid_by": user.get("name", ""), "pay_notes": body.notes,
                      "updated_at": now}})
        return {"id": payslip_id, "code": p["code"], "status": "paid", "net_paid": net,
                "advances_settled": len(p.get("advance_ids", []))}

    # ── Cancel a draft ──
    @router.post("/payslips/{payslip_id}/cancel")
    async def cancel_payslip(payslip_id: str, user: dict = Depends(get_tenant_admin)):
        p = await db.payslips.find_one({"id": payslip_id})
        if not p:
            raise HTTPException(status_code=404, detail="القسيمة غير موجودة")
        if p.get("status") != "draft":
            raise HTTPException(status_code=400, detail="لا يمكن إلغاء قسيمة مدفوعة")
        await db.payslips.update_one(
            {"id": payslip_id},
            {"$set": {"status": "cancelled", "cancelled_at": _now(),
                      "cancelled_by": user.get("name", "")}})
        return {"id": payslip_id, "status": "cancelled"}

    return {"router": router}
