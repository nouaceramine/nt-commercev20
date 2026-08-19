"""
Partners & Profit Distribution Routes (p182)
سجل الشركاء، حركات رأس المال، تقرير الأرباح، وتوزيع الأرباح حسب حصص المشاركة.
Profit = (sales revenue − COGS) − expenses, over a chosen period.
Distribution is report + record only (no automatic cash movements).
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel
import uuid


def create_partners_routes(db, get_current_user, get_tenant_admin) -> APIRouter:
    router = APIRouter(tags=["partners"])

    def _now():
        return datetime.now(timezone.utc).isoformat()

    def _pid():
        return f"prt_{uuid.uuid4().hex[:10]}"

    # ---------- helpers ----------

    async def _all_partners():
        return await db.partners.find({}, {"_id": 0}).sort("created_at", 1).to_list(500)

    def _with_shares(partners):
        """Attach share_pct (active partners only share the pie)."""
        total_cap = sum(float(p.get("capital", 0)) for p in partners if p.get("active", True))
        out = []
        for p in partners:
            cap = float(p.get("capital", 0))
            pct = round(cap / total_cap * 100, 4) if (p.get("active", True) and total_cap > 0) else 0.0
            out.append({**p, "share_pct": pct})
        return out, total_cap

    async def _due_map():
        """partner_id -> profits due = sum(distributions) - sum(profit withdrawals)."""
        dues = {}
        dists = await db.partner_distributions.find({}, {"_id": 0, "shares": 1}).to_list(1000)
        for d in dists:
            for s in d.get("shares", []):
                dues[s["partner_id"]] = dues.get(s["partner_id"], 0.0) + float(s.get("amount", 0))
        withdrawals = await db.partner_movements.find(
            {"type": "profit_withdrawal"}, {"_id": 0, "partner_id": 1, "amount": 1}
        ).to_list(10000)
        for w in withdrawals:
            dues[w["partner_id"]] = dues.get(w["partner_id"], 0.0) - float(w.get("amount", 0))
        return dues

    async def _compute_profit(start_date: str, end_date: str):
        """Revenue, COGS, gross profit, expenses, net profit for a period."""
        rng = {"$gte": start_date, "$lte": end_date}
        sales_agg = await db.sales.aggregate([
            {"$match": {"created_at": rng, "status": {"$ne": "cancelled"}}},
            {"$group": {"_id": None, "revenue": {"$sum": "$total"}, "count": {"$sum": 1}}},
        ]).to_list(1)
        revenue = round(float(sales_agg[0]["revenue"]), 2) if sales_agg else 0.0
        sales_count = sales_agg[0]["count"] if sales_agg else 0

        cogs_agg = await db.sales.aggregate([
            {"$match": {"created_at": rng, "status": {"$ne": "cancelled"}}},
            {"$unwind": "$items"},
            {"$group": {"_id": None, "cogs": {"$sum": {
                "$multiply": [
                    {"$ifNull": ["$items.purchase_price", 0]},
                    {"$ifNull": ["$items.quantity", 0]},
                ]
            }}}},
        ]).to_list(1)
        cogs = round(float(cogs_agg[0]["cogs"]), 2) if cogs_agg else 0.0

        exp_agg = await db.expenses.aggregate([
            {"$match": {"date": rng}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]).to_list(1)
        expenses_total = round(float(exp_agg[0]["total"]), 2) if exp_agg else 0.0

        gross = round(revenue - cogs, 2)
        net = round(gross - expenses_total, 2)
        return {
            "revenue": revenue,
            "sales_count": sales_count,
            "cogs": cogs,
            "gross_profit": gross,
            "expenses_total": expenses_total,
            "net_profit": net,
        }

    # ---------- partners CRUD ----------

    class PartnerCreate(BaseModel):
        name: str
        capital: float = 0
        phone: Optional[str] = ""
        notes: Optional[str] = ""

    class PartnerUpdate(BaseModel):
        name: Optional[str] = None
        phone: Optional[str] = None
        notes: Optional[str] = None
        active: Optional[bool] = None

    @router.get("/partners")
    async def list_partners(admin: dict = Depends(get_tenant_admin)):
        partners, total_cap = _with_shares(await _all_partners())
        dues = await _due_map()
        for p in partners:
            p["due"] = round(dues.get(p["id"], 0.0), 2)
        return {"partners": partners, "total_capital": round(total_cap, 2)}

    @router.post("/partners", status_code=201)
    async def create_partner(body: PartnerCreate, admin: dict = Depends(get_tenant_admin)):
        name = (body.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="اسم الشريك مطلوب")
        if float(body.capital or 0) < 0:
            raise HTTPException(status_code=400, detail="مبلغ المشاركة لا يمكن أن يكون سالباً")
        now = _now()
        partner = {
            "id": _pid(),
            "name": name,
            "phone": body.phone or "",
            "notes": body.notes or "",
            "capital": round(float(body.capital or 0), 2),
            "active": True,
            "created_at": now,
            "updated_at": now,
            "created_by": admin.get("name", ""),
        }
        await db.partners.insert_one(dict(partner))
        if partner["capital"] > 0:
            await db.partner_movements.insert_one({
                "id": f"pmv_{uuid.uuid4().hex[:10]}",
                "partner_id": partner["id"],
                "type": "capital_in",
                "amount": partner["capital"],
                "notes": "رأس المال الافتتاحي",
                "created_at": now,
                "created_by": admin.get("name", ""),
            })
        return partner

    @router.put("/partners/{partner_id}")
    async def update_partner(partner_id: str, body: PartnerUpdate, admin: dict = Depends(get_tenant_admin)):
        partner = await db.partners.find_one({"id": partner_id})
        if not partner:
            raise HTTPException(status_code=404, detail="الشريك غير موجود")
        updates = {"updated_at": _now()}
        if body.name is not None:
            if not body.name.strip():
                raise HTTPException(status_code=400, detail="اسم الشريك مطلوب")
            updates["name"] = body.name.strip()
        if body.phone is not None:
            updates["phone"] = body.phone
        if body.notes is not None:
            updates["notes"] = body.notes
        if body.active is not None:
            updates["active"] = bool(body.active)
        await db.partners.update_one({"id": partner_id}, {"$set": updates})
        return {"success": True}

    @router.delete("/partners/{partner_id}")
    async def delete_partner(partner_id: str, admin: dict = Depends(get_tenant_admin)):
        partner = await db.partners.find_one({"id": partner_id})
        if not partner:
            raise HTTPException(status_code=404, detail="الشريك غير موجود")
        moves = await db.partner_movements.count_documents({"partner_id": partner_id})
        dists = await db.partner_distributions.count_documents({"shares.partner_id": partner_id})
        if moves > 0 or dists > 0:
            raise HTTPException(
                status_code=400,
                detail="لا يمكن حذف شريك له حركات أو توزيعات مسجلة — عطّله بدلاً من ذلك",
            )
        await db.partners.delete_one({"id": partner_id})
        return {"success": True}

    # ---------- capital movements ----------

    class CapitalMove(BaseModel):
        amount: float
        direction: str  # in | out
        notes: Optional[str] = ""

    @router.post("/partners/{partner_id}/capital", status_code=201)
    async def capital_move(partner_id: str, body: CapitalMove, admin: dict = Depends(get_tenant_admin)):
        partner = await db.partners.find_one({"id": partner_id})
        if not partner:
            raise HTTPException(status_code=404, detail="الشريك غير موجود")
        amount = round(float(body.amount or 0), 2)
        if amount <= 0:
            raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون أكبر من صفر")
        if body.direction not in ("in", "out"):
            raise HTTPException(status_code=400, detail="الاتجاه يجب أن يكون in أو out")
        current = float(partner.get("capital", 0))
        if body.direction == "out" and amount > current:
            raise HTTPException(status_code=400, detail="لا يمكن سحب أكثر من رأس مال الشريك الحالي")
        delta = amount if body.direction == "in" else -amount
        now = _now()
        await db.partners.update_one(
            {"id": partner_id},
            {"$inc": {"capital": delta}, "$set": {"updated_at": now}},
        )
        move = {
            "id": f"pmv_{uuid.uuid4().hex[:10]}",
            "partner_id": partner_id,
            "type": f"capital_{body.direction}",
            "amount": amount,
            "notes": body.notes or "",
            "created_at": now,
            "created_by": admin.get("name", ""),
        }
        await db.partner_movements.insert_one(dict(move))
        move.pop("_id", None)
        return {**move, "new_capital": round(current + delta, 2)}

    @router.get("/partners/{partner_id}/movements")
    async def partner_movements(partner_id: str, admin: dict = Depends(get_tenant_admin)):
        return await db.partner_movements.find(
            {"partner_id": partner_id}, {"_id": 0}
        ).sort("created_at", -1).to_list(1000)

    # ---------- profit report ----------

    @router.get("/partners/profit-report")
    async def profit_report(start_date: str, end_date: str, admin: dict = Depends(get_tenant_admin)):
        if not start_date or not end_date:
            raise HTTPException(status_code=400, detail="start_date و end_date مطلوبان")
        profit = await _compute_profit(start_date, end_date)
        partners, total_cap = _with_shares(await _all_partners())
        shares = []
        for p in partners:
            if not p.get("active", True):
                continue
            amount = round(profit["net_profit"] * p["share_pct"] / 100, 2)
            shares.append({
                "partner_id": p["id"],
                "name": p["name"],
                "capital": p.get("capital", 0),
                "share_pct": p["share_pct"],
                "amount": amount,
            })
        already = await db.partner_distributions.find_one(
            {"period_start": start_date, "period_end": end_date}, {"_id": 0, "id": 1}
        )
        return {
            "period_start": start_date,
            "period_end": end_date,
            **profit,
            "total_capital": total_cap,
            "shares": shares,
            "already_distributed": already is not None,
        }

    # ---------- distributions ----------

    class DistributionCreate(BaseModel):
        period_start: str
        period_end: str
        notes: Optional[str] = ""
        force: bool = False

    @router.post("/partners/distributions", status_code=201)
    async def create_distribution(body: DistributionCreate, admin: dict = Depends(get_tenant_admin)):
        if not body.period_start or not body.period_end:
            raise HTTPException(status_code=400, detail="فترة التوزيع مطلوبة")
        if not body.force:
            existing = await db.partner_distributions.find_one(
                {"period_start": body.period_start, "period_end": body.period_end}, {"_id": 0, "id": 1}
            )
            if existing:
                raise HTTPException(
                    status_code=409,
                    detail="يوجد توزيع مسجل مسبقاً لنفس الفترة — أعد الإرسال مع force=true للتأكيد",
                )
        profit = await _compute_profit(body.period_start, body.period_end)
        partners, _ = _with_shares(await _all_partners())
        active = [p for p in partners if p.get("active", True)]
        if not active:
            raise HTTPException(status_code=400, detail="لا يوجد شركاء نشطون للتوزيع عليهم")
        shares = [{
            "partner_id": p["id"],
            "name": p["name"],
            "capital": p.get("capital", 0),
            "share_pct": p["share_pct"],
            "amount": round(profit["net_profit"] * p["share_pct"] / 100, 2),
        } for p in active]
        dist = {
            "id": f"dst_{uuid.uuid4().hex[:10]}",
            "period_start": body.period_start,
            "period_end": body.period_end,
            **profit,
            "shares": shares,
            "notes": body.notes or "",
            "created_at": _now(),
            "created_by": admin.get("name", ""),
        }
        await db.partner_distributions.insert_one(dict(dist))
        dist.pop("_id", None)
        return dist

    @router.get("/partners/distributions")
    async def list_distributions(admin: dict = Depends(get_tenant_admin)):
        return await db.partner_distributions.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)

    @router.delete("/partners/distributions/{dist_id}")
    async def delete_distribution(dist_id: str, admin: dict = Depends(get_tenant_admin)):
        res = await db.partner_distributions.delete_one({"id": dist_id})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="التوزيع غير موجود")
        return {"success": True}

    # ---------- profit withdrawal ----------

    class ProfitWithdrawal(BaseModel):
        amount: float
        notes: Optional[str] = ""

    @router.post("/partners/{partner_id}/withdraw-profit", status_code=201)
    async def withdraw_profit(partner_id: str, body: ProfitWithdrawal, admin: dict = Depends(get_tenant_admin)):
        partner = await db.partners.find_one({"id": partner_id})
        if not partner:
            raise HTTPException(status_code=404, detail="الشريك غير موجود")
        amount = round(float(body.amount or 0), 2)
        if amount <= 0:
            raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون أكبر من صفر")
        dues = await _due_map()
        due = dues.get(partner_id, 0.0)
        if amount > due:
            raise HTTPException(
                status_code=400,
                detail=f"المستحقات الحالية للشريك {due:.2f} فقط — لا يمكن سحب أكثر",
            )
        move = {
            "id": f"pmv_{uuid.uuid4().hex[:10]}",
            "partner_id": partner_id,
            "type": "profit_withdrawal",
            "amount": amount,
            "notes": body.notes or "",
            "created_at": _now(),
            "created_by": admin.get("name", ""),
        }
        await db.partner_movements.insert_one(dict(move))
        move.pop("_id", None)
        return {**move, "remaining_due": round(due - amount, 2)}

    return router
