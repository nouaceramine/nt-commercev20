"""
Employee Routes - Extracted from server.py
CRUD, accounts, salary reports, attendance, advances, alerts
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import math
import re
import uuid
import secrets
import bcrypt

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError


def create_employees_routes(db, get_current_user, get_tenant_admin, require_tenant, DEFAULT_PERMISSIONS) -> dict:
    from utils.permissions import create_permission_checker
    require_permission = create_permission_checker(db, get_current_user)
    router = APIRouter(prefix="/employees", tags=["employees"])

    class EmployeeAccountCreate(BaseModel):
        email: str
        password: str
        role: str = "seller"

    async def _create_account_for_employee(emp: dict, email: str, password: str,
                                           role: str, tenant_id) -> dict:
        """B1/p530: shared account provisioning for employees.

        Validates role + password + email availability (tenant-local and
        platform-wide), reserves the global identity atomically, inserts the
        user and claims the employee. Fully rolls back on any failure.
        """
        from config.database import main_db
        from utils.auth import email_ci
        from utils.identity import assert_email_globally_free, reserve_identity, remove_identity
        email_lower = (email or "").strip().lower()
        # p521-003: platform roles must never be handed to a tenant employee
        # account; unknown roles get zero permissions, so reject anything
        # outside the known tenant role catalogue.
        _forbidden = {"super_admin", "saas_admin", "superadmin", "tenant_admin", "owner"}
        role = (role or "seller").strip().lower()
        if role in _forbidden or role not in DEFAULT_PERMISSIONS:
            raise HTTPException(status_code=400, detail="الدور غير مسموح لحسابات الموظفين")
        if len(password or "") < 4:
            raise HTTPException(status_code=400, detail="كلمة المرور يجب أن تكون 4 أحرف على الأقل")
        if await db.users.find_one({"email": email_ci(email)}):
            raise HTTPException(status_code=400, detail="Email already registered")
        # Email must also be globally unique across the platform (owners,
        # agents, other tenants' staff)
        await assert_email_globally_free(email_lower)
        if (await main_db.tenant_user_directory.find_one({"email": email_lower})
                or await main_db.saas_tenants.find_one({"email": email_ci(email)})
                or await main_db.users.find_one({"email": email_ci(email)})
                or await main_db.saas_agents.find_one({"email": email_ci(email)})):
            raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم مسبقاً في المنصة")
        if emp.get("user_id"):
            raise HTTPException(status_code=400, detail="Employee already has an account")
        user_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        user_doc = {"id": user_id, "email": email_lower, "password": hashed,
                    "name": emp["name"], "role": role, "employee_id": emp["id"],
                    "permissions": DEFAULT_PERMISSIONS.get(role, {}), "created_at": now}
        # p521-004: the registry entry is the global login route for this
        # email — claim it ATOMICALLY before inserting so a concurrent create
        # with the same email loses with 400 instead of orphaning users.
        if tenant_id:
            await reserve_identity(email_lower, "employee", user_id,
                                   tenant_id=tenant_id, name=emp["name"])
        try:
            await db.users.insert_one(user_doc)
            # Atomic employee claim: a second concurrent request for the SAME
            # employee loses here and its user/identity are rolled back.
            claimed = await db.employees.find_one_and_update(
                {"id": emp["id"],
                 "$or": [{"user_id": {"$exists": False}}, {"user_id": None}, {"user_id": ""}]},
                {"$set": {"user_id": user_id, "user_email": email_lower}})
        except Exception:
            await db.users.delete_one({"id": user_id})
            await remove_identity(user_id=user_id)
            raise
        if not claimed:
            await db.users.delete_one({"id": user_id})
            await remove_identity(user_id=user_id)
            raise HTTPException(status_code=400, detail="Employee already has an account")
        return {"user_id": user_id, "email": email_lower, "role": role}

    # ── CRUD ──
    @router.post("")
    async def create_employee(employee: dict, admin: dict = Depends(require_permission("employees.edit"))):
        from models.schemas import EmployeeCreate
        e = EmployeeCreate(**employee)
        # p521-002: reject blank names and non-finite/negative money fields —
        # they used to be stored verbatim.
        name = (e.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="اسم الموظف مطلوب")
        if len(name) > 200:
            raise HTTPException(status_code=400, detail="اسم الموظف طويل جداً")
        for value, label in ((e.salary, "الراتب"), (e.commission_rate, "نسبة العمولة"),
                             (e.max_discount_percent, "حد الخصم"),
                             (e.max_debt_amount, "حد الدين")):
            if not math.isfinite(float(value or 0)) or float(value or 0) < 0:
                raise HTTPException(status_code=400, detail=f"{label} غير صالح")
        eid = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        from services.code_generator import generate_code
        code = await generate_code(db, "employees", "EM", 5, with_year=False)
        doc = {
            "id": eid, "code": code, "name": name, "phone": e.phone or "", "email": e.email or "",
            "position": e.position or "", "salary": e.salary,
            "hire_date": e.hire_date or now[:10], "commission_rate": e.commission_rate,
            "total_advances": 0, "total_commission": 0, "created_at": now
        }
        # B1/p530: an employee created WITH an email gets a system-user account
        # automatically — the owner's #1 expectation ("عند إضافة موظف يجب أن
        # يُضاف تلقائياً في مستخدمي النظام"). The generated password is
        # returned exactly once in this response; it is never stored readable.
        account_info = None
        email_lower = (e.email or "").strip().lower()
        if email_lower and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email_lower):
            raise HTTPException(status_code=400, detail="البريد الإلكتروني غير صالح")
        await db.employees.insert_one(doc)
        if email_lower:
            temp_password = secrets.token_urlsafe(9)
            try:
                account_info = await _create_account_for_employee(
                    doc, email_lower, temp_password,
                    e.account_role or "seller", admin.get("tenant_id"))
                account_info["password"] = temp_password
                doc["user_id"] = account_info["user_id"]
                doc["user_email"] = email_lower
            except Exception:
                # invariant: no employee-with-email without its account
                await db.employees.delete_one({"id": eid})
                raise
        doc.pop("_id", None)
        doc["account"] = account_info
        return doc

    @router.get("")
    async def get_employees(admin: dict = Depends(require_permission("employees.edit"))):
        return await db.employees.find({}, {"_id": 0}).to_list(1000)

    @router.get("/paginated")
    async def get_employees_paginated(
        page: int = 1, page_size: int = 20,
        admin: dict = Depends(require_permission("employees.edit"))
    ):
        from utils.pagination import paginate
        return await paginate(db.employees, {}, page, page_size)

    @router.get("/salary-report")
    async def get_salary_report(month: Optional[str] = None, user: dict = Depends(require_permission("employees.view"))):
        if not month:
            month = datetime.now(timezone.utc).strftime("%Y-%m")
        year, month_num = map(int, month.split("-"))
        start_date = datetime(year, month_num, 1, tzinfo=timezone.utc)
        end_date = datetime(year + 1, 1, 1, tzinfo=timezone.utc) if month_num == 12 else datetime(year, month_num + 1, 1, tzinfo=timezone.utc)
        employees = await db.employees.find({}, {"_id": 0}).to_list(100)
        report = []
        for emp in employees:
            # p521-007: read the WRITE-side collections that record_attendance /
            # create_advance actually populate — the legacy employee_attendance /
            # employee_advances collections stay empty, so the report used to
            # show 0 days / 0 advances and an overstated net salary.
            advances = await db.advances.find({"employee_id": emp["id"], "created_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}}, {"_id": 0}).to_list(100)
            total_advances = sum(a.get("amount", 0) for a in advances)
            attendance = await db.attendance.find({"employee_id": emp["id"], "date": {"$gte": start_date.isoformat()[:10], "$lt": end_date.isoformat()[:10]}}, {"_id": 0}).to_list(31)
            present_days = len([a for a in attendance if a.get("status") == "present"])
            absent_days = len([a for a in attendance if a.get("status") == "absent"])
            sales = await db.sales.find({"created_by": emp.get("user_email") or emp.get("name"), "created_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}}, {"_id": 0}).to_list(1000)
            total_sales = sum(s.get("total", 0) for s in sales)
            commission = total_sales * (emp.get("commission_rate", 0) / 100)
            report.append({
                "employee_id": emp["id"], "employee_name": emp["name"], "position": emp.get("position", ""),
                "base_salary": emp.get("salary", 0), "commission_rate": emp.get("commission_rate", 0),
                "total_sales": total_sales, "commission": round(commission, 2), "advances": total_advances,
                "net_salary": round(emp.get("salary", 0) + commission - total_advances, 2),
                "attendance_days": present_days, "absence_days": absent_days, "total_working_days": present_days + absent_days
            })
        return report

    @router.get("/alerts/active")
    async def get_active_alerts(admin: dict = Depends(require_permission("employees.edit"))):
        alerts = []
        employees = await db.employees.find({"$or": [{"max_discount_percent": {"$gt": 0}}, {"max_debt_amount": {"$gt": 0}}]}, {"_id": 0}).to_list(100)
        today = datetime.now(timezone.utc).date()
        month_start = datetime(today.year, today.month, 1, tzinfo=timezone.utc)
        for emp in employees:
            emp_id, emp_name = emp.get("id"), emp.get("name")
            alert_settings = await db.employee_alerts.find_one({"employee_id": emp_id})
            if not alert_settings:
                alert_settings = {"discount_threshold_percent": 80, "debt_threshold_percent": 80, "enable_discount_alert": True, "enable_debt_alert": True}
            if emp.get("max_discount_percent", 0) > 0 and alert_settings.get("enable_discount_alert", True):
                sales = await db.sales.find({"employee_id": emp_id, "created_at": {"$gte": month_start.isoformat()}}).to_list(1000)
                total_disc = sum(s.get("discount", 0) for s in sales)
                total_s = sum(s.get("subtotal", 0) for s in sales)
                if total_s > 0:
                    pct = (total_disc / total_s) * 100
                    mx = emp.get("max_discount_percent", 0)
                    if pct >= (mx * alert_settings.get("discount_threshold_percent", 80) / 100):
                        alerts.append({"type": "discount_limit", "severity": "high" if pct >= mx else "warning", "employee_id": emp_id, "employee_name": emp_name, "current_value": round(pct, 2), "max_value": mx})
            if emp.get("max_debt_amount", 0) > 0 and alert_settings.get("enable_debt_alert", True):
                debts = await db.debts.find({"created_by": emp_id, "paid": False}).to_list(1000)
                total_debt = sum(d.get("remaining_amount", 0) for d in debts)
                mx = emp.get("max_debt_amount", 0)
                if total_debt >= (mx * alert_settings.get("debt_threshold_percent", 80) / 100):
                    alerts.append({"type": "debt_limit", "severity": "high" if total_debt >= mx else "warning", "employee_id": emp_id, "employee_name": emp_name, "current_value": total_debt, "max_value": mx})
        return alerts

    @router.get("/{employee_id}")
    async def get_employee(employee_id: str, admin: dict = Depends(require_permission("employees.edit"))):
        emp = await db.employees.find_one({"id": employee_id}, {"_id": 0})
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
        return emp

    @router.put("/{employee_id}")
    async def update_employee(employee_id: str, updates: dict, admin: dict = Depends(require_permission("employees.edit"))):
        emp = await db.employees.find_one({"id": employee_id})
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
        update_data = {k: v for k, v in updates.items() if v is not None and k != "id"}
        if update_data:
            await db.employees.update_one({"id": employee_id}, {"$set": update_data})
        updated = await db.employees.find_one({"id": employee_id}, {"_id": 0})
        return updated

    @router.delete("/{employee_id}")
    async def delete_employee(employee_id: str, admin: dict = Depends(require_permission("employees.edit"))):
        result = await db.employees.delete_one({"id": employee_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Employee not found")
        return {"message": "Employee deleted successfully"}

    # ── Account Management ──
    @router.post("/{employee_id}/create-account")
    async def create_employee_account(employee_id: str, account: EmployeeAccountCreate, admin: dict = Depends(require_permission("employees.edit"))):
        # B1/p530: manual fallback (employee created without email, or account
        # deleted) — same provisioning path as the automatic one.
        emp = await db.employees.find_one({"id": employee_id}, {"_id": 0})
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
        res = await _create_account_for_employee(emp, account.email, account.password,
                                                 account.role, admin.get("tenant_id"))
        return {"success": True, **res}

    @router.delete("/{employee_id}/delete-account")
    async def delete_employee_account(employee_id: str, admin: dict = Depends(require_permission("employees.edit"))):
        emp = await db.employees.find_one({"id": employee_id}, {"_id": 0})
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
        if not emp.get("user_id"):
            raise HTTPException(status_code=400, detail="Employee has no linked account")
        from config.database import main_db
        await db.users.delete_one({"id": emp["user_id"]})
        from utils.identity import remove_identity
        await remove_identity(user_id=emp["user_id"])
        await main_db.tenant_user_directory.delete_one({"user_id": emp["user_id"]})
        await db.employees.update_one({"id": employee_id}, {"$unset": {"user_id": "", "user_email": ""}})
        return {"success": True}

    # ── Attendance ──
    _attendance_idx = set()

    async def _ensure_attendance_index():
        """p521: one attendance row per employee+day. Lazy per-tenant unique
        index; on DBs whose legacy duplicates block it, the upsert path still
        prevents new duplicates for sequential writes."""
        name = getattr(db, "name", None)
        if not name or name in _attendance_idx:
            return
        _attendance_idx.add(name)
        try:
            await db.attendance.create_index(
                [("employee_id", 1), ("date", 1)],
                unique=True, name="p521_attendance_day")
        except Exception:
            pass

    @router.post("/attendance")
    async def record_attendance(attendance: dict, admin: dict = Depends(require_permission("employees.edit"))):
        from models.schemas import AttendanceCreate
        a = AttendanceCreate(**attendance)
        # p521-005: strict day format + one row per employee+day. Re-recording
        # the same day updates the existing row (idempotent), so double-clicks
        # and concurrent posts can no longer inflate attendance counts.
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", a.date or ""):
            raise HTTPException(status_code=400, detail="صيغة التاريخ غير صالحة (YYYY-MM-DD)")
        emp = await db.employees.find_one({"id": a.employee_id}, {"_id": 0, "name": 1})
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
        await _ensure_attendance_index()
        filt = {"employee_id": a.employee_id, "date": a.date}
        update = {"$set": {"employee_name": emp["name"], "status": a.status,
                           "notes": a.notes or ""},
                  "$setOnInsert": {"id": str(uuid.uuid4())}}
        try:
            doc = await db.attendance.find_one_and_update(
                filt, update, upsert=True, return_document=ReturnDocument.AFTER)
        except DuplicateKeyError:
            doc = await db.attendance.find_one_and_update(
                filt, update, upsert=True, return_document=ReturnDocument.AFTER)
        doc.pop("_id", None)
        return doc

    @router.get("/{employee_id}/attendance")
    async def get_attendance(employee_id: str, month: Optional[str] = None, admin: dict = Depends(require_permission("employees.edit"))):
        query = {"employee_id": employee_id}
        if month:
            query["date"] = {"$regex": f"^{month}"}
        return await db.attendance.find(query, {"_id": 0}).sort("date", -1).to_list(100)

    # ── Advances ──
    @router.post("/advances")
    async def create_advance(advance: dict, admin: dict = Depends(require_permission("employees.edit"))):
        from models.schemas import AdvanceCreate
        a = AdvanceCreate(**advance)
        emp = await db.employees.find_one({"id": a.employee_id}, {"_id": 0, "name": 1})
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
        # p521-006: zero/negative/non-finite advances used to be stored and to
        # shrink employee.total_advances — money fields must be positive.
        amount = float(a.amount or 0)
        if not math.isfinite(amount) or amount <= 0:
            raise HTTPException(status_code=400, detail="مبلغ السلفة يجب أن يكون أكبر من صفر")
        amount = round(amount, 2)
        now = datetime.now(timezone.utc).isoformat()
        doc = {"id": str(uuid.uuid4()), "employee_id": a.employee_id, "employee_name": emp["name"], "amount": amount, "notes": a.notes or "", "created_at": now}
        await db.advances.insert_one(doc)
        await db.employees.update_one({"id": a.employee_id}, {"$inc": {"total_advances": amount}})
        doc.pop("_id", None)
        return doc

    @router.get("/{employee_id}/advances")
    async def get_advances(employee_id: str, admin: dict = Depends(require_permission("employees.edit"))):
        return await db.advances.find({"employee_id": employee_id}, {"_id": 0}).sort("created_at", -1).to_list(100)

    # ── Alert Settings ──
    @router.get("/{employee_id}/alert-settings")
    async def get_alert_settings(employee_id: str, user: dict = Depends(require_permission("employees.view"))):
        settings = await db.employee_alerts.find_one({"employee_id": employee_id}, {"_id": 0})
        return settings or {"employee_id": employee_id, "enable_discount_alert": True, "enable_debt_alert": True, "discount_threshold_percent": 80, "debt_threshold_percent": 80}

    @router.put("/{employee_id}/alert-settings")
    async def update_alert_settings(employee_id: str, settings: dict, admin: dict = Depends(require_permission("employees.edit"))):
        await db.employee_alerts.update_one({"employee_id": employee_id}, {"$set": {**settings, "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
        return {"success": True}

    return router
