"""p221: commission rules CRUD + commission ledger + payout (tenant-scoped)."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


def create_commissions_routes(db, get_current_user) -> dict:
    from utils.permissions import create_permission_checker
    require_permission = create_permission_checker(db, get_current_user)
    router = APIRouter(prefix="/commissions", tags=["commissions"])

    def _now():
        return datetime.now(timezone.utc).isoformat()

    class RuleIn(BaseModel):
        name: str
        beneficiary: str
        scope: str = "all"            # all | family | channel
        family_id: Optional[str] = None
        channel: Optional[str] = None  # pos | online | ...
        rate_type: str = "percent"    # percent | fixed
        value: float = 0.0
        min_amount: float = 0.0
        active: bool = True

    def _validate_rule(r: RuleIn):
        if r.scope not in ("all", "family", "channel"):
            raise HTTPException(status_code=400, detail="نطاق غير صالح")
        if r.rate_type not in ("percent", "fixed"):
            raise HTTPException(status_code=400, detail="نوع النسبة غير صالح")
        if r.value <= 0:
            raise HTTPException(status_code=400, detail="القيمة يجب أن تكون أكبر من صفر")
        if r.rate_type == "percent" and r.value > 100:
            raise HTTPException(status_code=400, detail="النسبة لا تتجاوز 100%")
        if r.scope == "family" and not r.family_id:
            raise HTTPException(status_code=400, detail="حدد العائلة لنطاق العائلة")

    # ── Rules CRUD ──
    @router.get("/rules")
    async def list_rules(user: dict = Depends(require_permission("reports.view"))):
        return await db.commission_rules.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

    @router.post("/rules", status_code=201)
    async def create_rule(rule: RuleIn, user: dict = Depends(require_permission("sales.edit"))):
        _validate_rule(rule)
        if rule.scope == "family":
            fam = await db.product_families.find_one({"id": rule.family_id}, {"_id": 0, "id": 1})
            if not fam:
                raise HTTPException(status_code=400, detail="العائلة المحددة غير موجودة")
        doc = rule.dict()
        doc["id"] = str(uuid.uuid4())
        doc["created_at"] = _now()
        doc["created_by"] = user.get("name", "")
        await db.commission_rules.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.put("/rules/{rule_id}")
    async def update_rule(rule_id: str, rule: RuleIn, user: dict = Depends(require_permission("sales.edit"))):
        _validate_rule(rule)
        res = await db.commission_rules.update_one(
            {"id": rule_id},
            {"$set": {**rule.dict(), "updated_at": _now()}},
        )
        if not res.matched_count:
            raise HTTPException(status_code=404, detail="القاعدة غير موجودة")
        return await db.commission_rules.find_one({"id": rule_id}, {"_id": 0})

    @router.delete("/rules/{rule_id}")
    async def delete_rule(rule_id: str, user: dict = Depends(require_permission("sales.edit"))):
        res = await db.commission_rules.delete_one({"id": rule_id})
        if not res.deleted_count:
            raise HTTPException(status_code=404, detail="القاعدة غير موجودة")
        return {"deleted": True}

    # ── Ledger ──
    @router.get("")
    async def list_commissions(
        status: Optional[str] = None,
        beneficiary: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        limit: int = 200,
        user: dict = Depends(require_permission("reports.view")),
    ):
        limit = max(1, min(limit, 500))
        q = {}
        if status:
            q["status"] = status
        if beneficiary:
            q["beneficiary"] = beneficiary
        dq = {}
        if start_date:
            dq["$gte"] = start_date
        if end_date:
            dq["$lte"] = end_date + ("T23:59:59" if len(end_date) == 10 else "")
        if dq:
            q["created_at"] = dq
        items = await db.commissions.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
        return {"total": len(items), "items": items}

    @router.get("/report")
    async def commissions_report(user: dict = Depends(require_permission("reports.view"))):
        """Per-beneficiary totals: pending / paid / cancelled."""
        pipeline = [
            {"$group": {
                "_id": {"beneficiary": "$beneficiary", "status": "$status"},
                "amount": {"$sum": "$amount"},
                "count": {"$sum": 1},
            }},
        ]
        out = {}
        async for row in db.commissions.aggregate(pipeline):
            b = row["_id"]["beneficiary"] or "—"
            st = row["_id"]["status"]
            entry = out.setdefault(b, {"beneficiary": b, "pending": 0.0, "paid": 0.0, "cancelled": 0.0, "count": 0})
            entry[st if st in ("pending", "paid", "cancelled") else "pending"] = round(row["amount"], 2)
            entry["count"] += row["count"]
        return {"items": sorted(out.values(), key=lambda x: -(x["pending"] + x["paid"]))}

    # ── Payout ──
    class PayoutIn(BaseModel):
        payment_method: str = "cash"

    @router.post("/{commission_id}/payout")
    async def payout_commission(commission_id: str, body: PayoutIn, user: dict = Depends(require_permission("sales.edit"))):
        commission = await db.commissions.find_one({"id": commission_id})
        if not commission:
            raise HTTPException(status_code=404, detail="العمولة غير موجودة")
        if commission.get("status") != "pending":
            raise HTTPException(status_code=400, detail="العمولة ليست معلقة")
        box = await db.cash_boxes.find_one({"id": body.payment_method}, {"_id": 0, "id": 1, "balance": 1})
        if not box:
            raise HTTPException(status_code=400, detail="صندوق غير موجود")
        from config.database import client as _client
        now = _now()
        async with await _client.start_session() as _tx:
            async with _tx.start_transaction():
                await db.commissions.update_one(
                    {"id": commission_id},
                    {"$set": {"status": "paid", "paid_at": now, "paid_by": user.get("name", ""),
                              "payment_method": body.payment_method}},
                    session=_tx,
                )
                await db.cash_boxes.update_one(
                    {"id": body.payment_method},
                    {"$inc": {"balance": -float(commission["amount"])}, "$set": {"updated_at": now}},
                    session=_tx,
                )
                await db.transactions.insert_one({
                    "id": str(uuid.uuid4()),
                    "cash_box_id": body.payment_method,
                    "type": "expense",
                    "amount": float(commission["amount"]),
                    "description": f"دفع عمولة — {commission.get('beneficiary', '')} (فاتورة {commission.get('invoice_number', '')})",
                    "reference_type": "commission_payout",
                    "reference_id": commission_id,
                    "created_at": now,
                    "created_by": user.get("name", ""),
                }, session=_tx)
        from services.accounting_auto import post_commission_payout
        await post_commission_payout(
            db, commission_id=commission_id, amount=float(commission["amount"]),
            beneficiary=commission.get("beneficiary", ""), payment_method=body.payment_method,
        )
        return {"status": "paid", "amount": commission["amount"]}

    return {"commissions": router}
