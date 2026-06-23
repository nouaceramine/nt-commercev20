"""
Daily Sessions Routes - Extracted from server.py
Cash session management for employees (open, close, summary)
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid


def create_daily_sessions_routes(db, get_current_user, get_tenant_admin, require_tenant) -> dict:
    from utils.permissions import create_permission_checker
    require_permission = create_permission_checker(db, get_current_user)
    router = APIRouter(prefix="/daily-sessions", tags=["daily-sessions"])

    class DailySessionCreate(BaseModel):
        opening_cash: float
        opened_at: str
        status: str = "open"
        code: Optional[str] = ""

    class DailySessionClose(BaseModel):
        closing_cash: float
        closed_at: str
        notes: Optional[str] = ""
        status: str = "closed"

    class DailySessionResponse(BaseModel):
        model_config = ConfigDict(extra="ignore")
        id: str
        code: str = ""
        user_id: str = ""
        user_name: str = ""
        opening_cash: float
        closing_cash: Optional[float] = None
        opened_at: str
        closed_at: Optional[str] = None
        total_sales: float = 0
        cash_sales: float = 0
        credit_sales: float = 0
        sales_count: int = 0
        status: str
        notes: str = ""
        created_by: str = ""

    def _fix_session_fields(s, fallback_user_id="", fallback_name="") -> dict:
        if "user_id" not in s:
            s["user_id"] = fallback_user_id
        if "user_name" not in s:
            s["user_name"] = s.get("created_by", fallback_name)

    @router.post("")
    async def create_daily_session(session: DailySessionCreate, user: dict = Depends(require_permission("daily_sessions.view"))):
        existing = await db.daily_sessions.find_one({"user_id": user["id"], "status": "open"})
        if existing:
            raise HTTPException(status_code=400, detail="لديك حصة مفتوحة بالفعل")
        session_id = str(uuid.uuid4())
        doc = {
            "id": session_id, "code": session.code or "",
            "user_id": user["id"], "user_name": user.get("name", ""),
            "opening_cash": session.opening_cash, "closing_cash": None,
            "opened_at": session.opened_at, "closed_at": None,
            "total_sales": 0, "cash_sales": 0, "credit_sales": 0,
            "sales_count": 0, "status": "open", "notes": "",
            "created_by": user.get("name", "")
        }
        await db.daily_sessions.insert_one(doc)
        doc.pop("_id", None)
        return DailySessionResponse(**doc)

    @router.get("")
    async def get_daily_sessions(all_users: bool = False, user: dict = Depends(require_permission("daily_sessions.view"))):
        query = {}
        if not all_users or user.get("role") != "admin":
            query["user_id"] = user["id"]
        sessions = await db.daily_sessions.find(query, {"_id": 0}).sort("opened_at", -1).to_list(100)
        for s in sessions:
            _fix_session_fields(s)
        return [DailySessionResponse(**s) for s in sessions]

    @router.get("/current")
    async def get_current_session(user: dict = Depends(require_permission("daily_sessions.view"))):
        session = await db.daily_sessions.find_one({"user_id": user["id"], "status": "open"}, {"_id": 0})
        if not session:
            return None
        _fix_session_fields(session, user["id"], user.get("name", ""))
        return DailySessionResponse(**session)

    @router.get("/summary")
    async def get_sessions_summary(days: int = 7, admin: dict = Depends(require_permission("daily_sessions.edit"))):
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        sessions = await db.daily_sessions.find({"status": "closed", "closed_at": {"$gte": start_date}}, {"_id": 0}).to_list(500)
        user_stats = {}
        for session in sessions:
            uid = session.get("user_id", "unknown")
            uname = session.get("user_name") or session.get("created_by", "غير معروف")
            if uid not in user_stats:
                user_stats[uid] = {"user_id": uid, "user_name": uname, "sessions_count": 0, "total_sales": 0, "cash_sales": 0, "credit_sales": 0, "total_difference": 0}
            st = user_stats[uid]
            st["sessions_count"] += 1
            st["total_sales"] += session.get("total_sales", 0)
            st["cash_sales"] += session.get("cash_sales", 0)
            st["credit_sales"] += session.get("credit_sales", 0)
            expected = session.get("opening_cash", 0) + session.get("cash_sales", 0)
            st["total_difference"] += (session.get("closing_cash", 0) - expected)
        overall = {
            "total_sessions": len(sessions),
            "total_sales": sum(s.get("total_sales", 0) for s in sessions),
            "total_cash_sales": sum(s.get("cash_sales", 0) for s in sessions),
            "total_credit_sales": sum(s.get("credit_sales", 0) for s in sessions),
            "total_difference": sum((s.get("closing_cash", 0) - (s.get("opening_cash", 0) + s.get("cash_sales", 0))) for s in sessions)
        }
        return {"period_days": days, "overall": overall, "by_user": list(user_stats.values())}

    @router.put("/{session_id}/close")
    async def close_daily_session(session_id: str, closing_data: DailySessionClose, user: dict = Depends(require_permission("daily_sessions.view"))):
        session = await db.daily_sessions.find_one({"id": session_id})
        if not session:
            raise HTTPException(status_code=404, detail="الحصة غير موجودة")
        if session.get("user_id") != user["id"] and user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="لا يمكنك إغلاق حصة موظف آخر")
        if session["status"] == "closed":
            raise HTTPException(status_code=400, detail="الحصة مغلقة بالفعل")

        opened_at = session["opened_at"]
        closed_at = closing_data.closed_at
        session_user_id = session.get("user_id", user["id"])
        sales = await db.sales.find({"created_at": {"$gte": opened_at, "$lte": closed_at}, "status": {"$ne": "returned"}}, {"_id": 0}).to_list(1000)
        total_sales = sum(s.get("total", 0) for s in sales)
        cash_sales = sum(s.get("paid_amount", 0) for s in sales if s.get("payment_method") == "cash")
        credit_sales = sum(s.get("remaining", 0) for s in sales)
        total_profit = 0
        for sale in sales:
            for item in sale.get("items", []):
                pid = item.get("product_id")
                if pid:
                    product = await db.products.find_one({"id": pid}, {"_id": 0, "purchase_price": 1})
                    if product:
                        total_profit += (item.get("price", 0) - product.get("purchase_price", 0)) * item.get("quantity", 1)

        update_data = {
            "closing_cash": closing_data.closing_cash, "closed_at": closing_data.closed_at,
            "notes": closing_data.notes or "", "status": "closed",
            "total_sales": total_sales, "cash_sales": cash_sales,
            "credit_sales": credit_sales, "sales_count": len(sales), "total_profit": total_profit
        }
        await db.daily_sessions.update_one({"id": session_id}, {"$set": update_data})
        updated = await db.daily_sessions.find_one({"id": session_id}, {"_id": 0})
        _fix_session_fields(updated, session_user_id, session.get("user_name", session.get("created_by", "")))

        # Cash difference notification
        sys_settings = await db.system_settings.find_one({"id": "global"}, {"_id": 0})
        threshold = sys_settings.get("cash_difference_threshold", 1000) if sys_settings else 1000
        expected_cash = session.get("opening_cash", 0) + cash_sales
        difference = closing_data.closing_cash - expected_cash
        if abs(difference) >= threshold:
            emp_name = session.get("user_name", session.get("created_by", "موظف"))
            now = datetime.now(timezone.utc).isoformat()
            ntype = "cash_deficit" if difference < 0 else "cash_surplus"
            msg_ar = f"تم تسجيل {'عجز' if difference < 0 else 'فائض'} بقيمة {abs(difference):.2f} دج في حصة {emp_name}"
            admin_users = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(50)
            recipients = list(set([u["id"] for u in admin_users] + [session_user_id]))
            for rid in recipients:
                await db.notifications.insert_one({"id": str(uuid.uuid4()), "user_id": rid, "type": ntype, "title": msg_ar, "message": msg_ar, "data": {"session_id": session_id, "difference": difference}, "read": False, "created_at": now})

        return DailySessionResponse(**updated)

    @router.delete("/{session_id}")
    async def delete_daily_session(session_id: str, admin: dict = Depends(require_permission("daily_sessions.edit"))):
        session = await db.daily_sessions.find_one({"id": session_id})
        if not session:
            raise HTTPException(status_code=404, detail="الحصة غير موجودة")
        if session["status"] == "open":
            raise HTTPException(status_code=400, detail="لا يمكن حذف حصة مفتوحة")
        await db.daily_sessions.delete_one({"id": session_id})
        return {"message": "تم حذف الحصة بنجاح"}

    return router
