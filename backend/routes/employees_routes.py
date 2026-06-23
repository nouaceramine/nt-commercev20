"""
Employee Routes - Extracted from server.py
CRUD, accounts, salary reports, attendance, advances, alerts
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
import bcrypt


def create_employees_routes(db, get_current_user, get_tenant_admin, require_tenant, DEFAULT_PERMISSIONS) -> dict:
    from utils.permissions import create_permission_checker
    require_permission = create_permission_checker(db, get_current_user)
    router = APIRouter(prefix="/employees", tags=["employees"])

    class EmployeeAccountCreate(BaseModel):
        email: str
        password: str
        role: str = "seller"

    # ── CRUD ──
    @router.post("")
    async def create_employee(employee: dict, admin: dict = Depends(require_permission("employees.edit"))):
        from models.schemas import EmployeeCreate, EmployeeResponse
        e = EmployeeCreate(**employee)
        eid = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        from services.code_generator import generate_code
        code = await generate_code(db, "employees", "EM", 5, with_year=False)
        doc = {
            "id": eid, "code": code, "name": e.name, "phone": e.phone or "", "email": e.email or "",
            "position": e.position or "", "salary": e.salary,
            "hire_date": e.hire_date or now[:10], "commission_rate": e.commission_rate,
            "total_advances": 0, "total_commission": 0, "created_at": now
        }
        await db.employees.insert_one(doc)
        doc.pop("_id", None)
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
            advances = await db.employee_advances.find({"employee_id": emp["id"], "created_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}}, {"_id": 0}).to_list(100)
            total_advances = sum(a.get("amount", 0) for a in advances)
            attendance = await db.employee_attendance.find({"employee_id": emp["id"], "date": {"$gte": start_date.isoformat()[:10], "$lt": end_date.isoformat()[:10]}}, {"_id": 0}).to_list(31)
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
        emp = await db.employees.find_one({"id": employee_id}, {"_id": 0})
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
        if await db.users.find_one({"email": account.email}):
            raise HTTPException(status_code=400, detail="Email already registered")
        if emp.get("user_id"):
            raise HTTPException(status_code=400, detail="Employee already has an account")
        user_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        hashed = bcrypt.hashpw(account.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        user_doc = {"id": user_id, "email": account.email, "password": hashed, "name": emp["name"], "role": account.role, "employee_id": employee_id, "permissions": DEFAULT_PERMISSIONS.get(account.role, {}), "created_at": now}
        await db.users.insert_one(user_doc)
        await db.employees.update_one({"id": employee_id}, {"$set": {"user_id": user_id, "user_email": account.email}})
        return {"success": True, "user_id": user_id, "email": account.email, "role": account.role}

    @router.delete("/{employee_id}/delete-account")
    async def delete_employee_account(employee_id: str, admin: dict = Depends(require_permission("employees.edit"))):
        emp = await db.employees.find_one({"id": employee_id}, {"_id": 0})
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
        if not emp.get("user_id"):
            raise HTTPException(status_code=400, detail="Employee has no linked account")
        await db.users.delete_one({"id": emp["user_id"]})
        await db.employees.update_one({"id": employee_id}, {"$unset": {"user_id": "", "user_email": ""}})
        return {"success": True}

    # ── Attendance ──
    @router.post("/attendance")
    async def record_attendance(attendance: dict, admin: dict = Depends(require_permission("employees.edit"))):
        from models.schemas import AttendanceCreate
        a = AttendanceCreate(**attendance)
        emp = await db.employees.find_one({"id": a.employee_id}, {"_id": 0, "name": 1})
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
        doc = {"id": str(uuid.uuid4()), "employee_id": a.employee_id, "employee_name": emp["name"], "date": a.date, "status": a.status, "notes": a.notes or ""}
        await db.attendance.insert_one(doc)
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
        now = datetime.now(timezone.utc).isoformat()
        doc = {"id": str(uuid.uuid4()), "employee_id": a.employee_id, "employee_name": emp["name"], "amount": a.amount, "notes": a.notes or "", "created_at": now}
        await db.advances.insert_one(doc)
        await db.employees.update_one({"id": a.employee_id}, {"$inc": {"total_advances": a.amount}})
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
