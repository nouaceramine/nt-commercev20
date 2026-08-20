"""
Rental Routes (p185 — المرحلة 2.2)
وحدة الكراء: أصول (سيارات/عقارات) + عقود + تمديد + إغلاق بغرامات التأخير + وديعة + دفعات مربوطة بالصناديق.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone, date
from pydantic import BaseModel
import math
import uuid


def create_rental_routes(db, get_current_user, get_tenant_admin, require_tenant) -> APIRouter:
    from utils.permissions import create_permission_checker
    require_permission = create_permission_checker(db, get_current_user)
    router = APIRouter(prefix="/rentals", tags=["rentals"])

    def _now():
        return datetime.now(timezone.utc).isoformat()

    def _rid(prefix):
        return f"{prefix}_{uuid.uuid4().hex[:10]}"

    def _parse_day(s: str) -> date:
        try:
            return date.fromisoformat((s or "")[:10])
        except Exception:
            raise HTTPException(status_code=400, detail=f"تاريخ غير صالح: {s}")

    def _periods(start: date, end: date, rate_type: str) -> int:
        days = (end - start).days
        if days < 0:
            raise HTTPException(status_code=400, detail="تاريخ النهاية قبل تاريخ البداية")
        if rate_type == "monthly":
            return max(1, math.ceil(max(days, 1) / 30))
        return max(1, days)

    async def _next_code():
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        n = await db.rental_contracts.count_documents({"code": {"$regex": f"^RNT-{today}"}})
        return f"RNT-{today}-{n + 1:04d}"

    def _with_virtual_status(c: dict) -> dict:
        if c.get("status") == "active" and c.get("end_date"):
            if _parse_day(c["end_date"]) < datetime.now(timezone.utc).date():
                c["status"] = "overdue"
        return c

    # ================= Assets =================

    class AssetCreate(BaseModel):
        type: str  # car | property
        name: str
        reference: Optional[str] = ""   # plate number / address
        daily_rate: float = 0
        monthly_rate: float = 0
        deposit_default: float = 0
        notes: Optional[str] = ""

    class AssetUpdate(BaseModel):
        name: Optional[str] = None
        reference: Optional[str] = None
        daily_rate: Optional[float] = None
        monthly_rate: Optional[float] = None
        deposit_default: Optional[float] = None
        status: Optional[str] = None   # available | maintenance
        notes: Optional[str] = None

    @router.get("/assets")
    async def list_assets(type: Optional[str] = None, status: Optional[str] = None,
                          user: dict = Depends(require_tenant)):
        query = {}
        if type:
            query["type"] = type
        if status:
            query["status"] = status
        return await db.rental_assets.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)

    @router.post("/assets", status_code=201)
    async def create_asset(body: AssetCreate, admin: dict = Depends(get_tenant_admin)):
        if body.type not in ("car", "property"):
            raise HTTPException(status_code=400, detail="النوع يجب أن يكون car أو property")
        if not body.name.strip():
            raise HTTPException(status_code=400, detail="اسم الأصل مطلوب")
        if body.daily_rate <= 0 and body.monthly_rate <= 0:
            raise HTTPException(status_code=400, detail="حدد سعراً يومياً أو شهرياً على الأقل")
        now = _now()
        asset = {
            "id": _rid("ast"),
            "type": body.type,
            "name": body.name.strip(),
            "reference": body.reference or "",
            "daily_rate": float(body.daily_rate or 0),
            "monthly_rate": float(body.monthly_rate or 0),
            "deposit_default": float(body.deposit_default or 0),
            "status": "available",
            "notes": body.notes or "",
            "created_at": now,
            "updated_at": now,
        }
        await db.rental_assets.insert_one(dict(asset))
        asset.pop("_id", None)
        return asset

    @router.put("/assets/{asset_id}")
    async def update_asset(asset_id: str, body: AssetUpdate, admin: dict = Depends(get_tenant_admin)):
        asset = await db.rental_assets.find_one({"id": asset_id})
        if not asset:
            raise HTTPException(status_code=404, detail="الأصل غير موجود")
        updates = {k: v for k, v in body.model_dump().items() if v is not None}
        if "status" in updates and updates["status"] not in ("available", "maintenance"):
            raise HTTPException(status_code=400, detail="الحالة اليدوية: available أو maintenance فقط")
        if asset.get("status") == "rented" and "status" in updates:
            raise HTTPException(status_code=400, detail="الأصل مؤجّر حالياً — أغلق العقد أولاً")
        updates["updated_at"] = _now()
        await db.rental_assets.update_one({"id": asset_id}, {"$set": updates})
        return {"success": True}

    @router.delete("/assets/{asset_id}")
    async def delete_asset(asset_id: str, admin: dict = Depends(get_tenant_admin)):
        asset = await db.rental_assets.find_one({"id": asset_id})
        if not asset:
            raise HTTPException(status_code=404, detail="الأصل غير موجود")
        if asset.get("status") == "rented":
            raise HTTPException(status_code=400, detail="لا يمكن حذف أصل مؤجّر")
        contracts = await db.rental_contracts.count_documents({"asset_id": asset_id})
        if contracts > 0:
            raise HTTPException(status_code=400, detail="للأصل عقود مسجلة — لا يمكن حذفه")
        await db.rental_assets.delete_one({"id": asset_id})
        return {"success": True}

    # ================= Contracts =================

    class ContractCreate(BaseModel):
        asset_id: str
        customer_id: Optional[str] = None
        customer_name: Optional[str] = ""
        start_date: str
        end_date: str
        rate_type: str = "daily"   # daily | monthly
        rate: Optional[float] = None
        deposit_amount: float = 0
        initial_payment: float = 0
        cash_box_id: Optional[str] = "cash"
        notes: Optional[str] = ""

    class ContractExtend(BaseModel):
        new_end_date: str

    class ContractPayment(BaseModel):
        amount: float
        cash_box_id: Optional[str] = "cash"
        notes: Optional[str] = ""

    class ContractClose(BaseModel):
        actual_return_date: Optional[str] = None
        deposit_action: str = "returned"   # returned | kept
        refund_cash_box_id: Optional[str] = "cash"
        notes: Optional[str] = ""

    async def _add_cash(cash_box_id: str, amount: float, category: str, reference_id: str,
                        description: str, user_name: str, session=None):
        box = await db.cash_boxes.find_one({"id": cash_box_id})
        if not box:
            raise HTTPException(status_code=404, detail="الصندوق غير موجود")
        await db.cash_boxes.update_one(
            {"id": cash_box_id},
            {"$inc": {"balance": amount}, "$set": {"updated_at": _now()}},
            session=session,
        )
        await db.transactions.insert_one({
            "id": str(uuid.uuid4()),
            "cash_box_id": cash_box_id,
            "type": "income" if amount >= 0 else "expense",
            "amount": abs(amount),
            "category": category,
            "reference_id": reference_id,
            "description": description,
            "created_at": _now(),
            "created_by": user_name,
        }, session=session)

    @router.get("/contracts")
    async def list_contracts(status: Optional[str] = None, asset_id: Optional[str] = None,
                             user: dict = Depends(require_tenant)):
        query = {}
        if asset_id:
            query["asset_id"] = asset_id
        contracts = await db.rental_contracts.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
        contracts = [_with_virtual_status(c) for c in contracts]
        if status:
            contracts = [c for c in contracts if c["status"] == status]
        return contracts

    @router.post("/contracts", status_code=201)
    async def create_contract(body: ContractCreate, user: dict = Depends(require_tenant)):
        asset = await db.rental_assets.find_one({"id": body.asset_id})
        if not asset:
            raise HTTPException(status_code=404, detail="الأصل غير موجود")
        if asset.get("status") != "available":
            raise HTTPException(status_code=400, detail="الأصل غير متاح (مؤجّر أو في الصيانة)")
        if body.rate_type not in ("daily", "monthly"):
            raise HTTPException(status_code=400, detail="نوع التسعير: daily أو monthly")

        start = _parse_day(body.start_date)
        end = _parse_day(body.end_date)
        periods = _periods(start, end, body.rate_type)
        rate = float(body.rate) if body.rate else float(asset.get(f"{body.rate_type}_rate") or 0)
        if rate <= 0:
            raise HTTPException(status_code=400, detail="السعر غير محدد — حدده في العقد أو في الأصل")
        expected_total = round(rate * periods, 2)

        customer_name = body.customer_name or ""
        if body.customer_id:
            cust = await db.customers.find_one({"id": body.customer_id})
            if cust:
                customer_name = cust.get("name", customer_name)

        now = _now()
        contract = {
            "id": _rid("rnt"),
            "code": await _next_code(),
            "asset_id": asset["id"],
            "asset_name": asset["name"],
            "asset_type": asset["type"],
            "asset_reference": asset.get("reference", ""),
            "customer_id": body.customer_id or None,
            "customer_name": customer_name or "زبون نقدي",
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "rate_type": body.rate_type,
            "rate": rate,
            "periods": periods,
            "expected_total": expected_total,
            "late_fee": 0.0,
            "total_due": expected_total,
            "paid_amount": 0.0,
            "deposit_amount": round(float(body.deposit_amount or 0), 2),
            "deposit_status": "held" if body.deposit_amount else "none",
            "payments": [],
            "status": "active",
            "notes": body.notes or "",
            "created_at": now,
            "updated_at": now,
            "created_by": user.get("name", ""),
        }

        initial = round(float(body.initial_payment or 0), 2)
        if initial > 0:
            pay = {
                "id": _rid("pay"), "amount": initial, "kind": "rent",
                "cash_box_id": body.cash_box_id or "cash",
                "notes": "دفعة أولى", "created_at": now, "created_by": user.get("name", ""),
            }
            contract["payments"].append(pay)
            contract["paid_amount"] = initial

        await db.rental_contracts.insert_one(dict(contract))
        await db.rental_assets.update_one(
            {"id": asset["id"]}, {"$set": {"status": "rented", "updated_at": now}}
        )
        if initial > 0:
            await _add_cash(body.cash_box_id or "cash", initial, "rental_payment",
                            contract["id"], f"دفعة أولى عقد كراء {contract['code']}", user.get("name", ""))
        if contract["deposit_amount"] > 0:
            await _add_cash(body.cash_box_id or "cash", contract["deposit_amount"], "rental_deposit",
                            contract["id"], f"وديعة عقد كراء {contract['code']}", user.get("name", ""))
        contract.pop("_id", None)
        return contract

    @router.post("/contracts/{contract_id}/extend")
    async def extend_contract(contract_id: str, body: ContractExtend, user: dict = Depends(require_tenant)):
        c = await db.rental_contracts.find_one({"id": contract_id})
        if not c or c.get("status") != "active":
            raise HTTPException(status_code=400, detail="العقد غير موجود أو مغلق")
        new_end = _parse_day(body.new_end_date)
        old_end = _parse_day(c["end_date"])
        if new_end <= old_end:
            raise HTTPException(status_code=400, detail="تاريخ التمديد يجب أن يكون بعد نهاية العقد الحالية")
        extra_periods = _periods(old_end, new_end, c["rate_type"])
        extra = round(extra_periods * float(c["rate"]), 2)
        new_expected = round(float(c["expected_total"]) + extra, 2)
        await db.rental_contracts.update_one(
            {"id": contract_id},
            {"$set": {
                "end_date": new_end.isoformat(),
                "periods": c.get("periods", 0) + extra_periods,
                "expected_total": new_expected,
                "total_due": round(new_expected + float(c.get("late_fee", 0)), 2),
                "updated_at": _now(),
            }},
        )
        return {"success": True, "extra_periods": extra_periods, "extra_amount": extra, "expected_total": new_expected}

    @router.post("/contracts/{contract_id}/payment")
    async def contract_payment(contract_id: str, body: ContractPayment, user: dict = Depends(require_tenant)):
        c = await db.rental_contracts.find_one({"id": contract_id})
        if not c or c.get("status") != "active":
            raise HTTPException(status_code=400, detail="العقد غير موجود أو مغلق")
        amount = round(float(body.amount or 0), 2)
        if amount <= 0:
            raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون أكبر من صفر")
        pay = {
            "id": _rid("pay"), "amount": amount, "kind": "rent",
            "cash_box_id": body.cash_box_id or "cash",
            "notes": body.notes or "", "created_at": _now(), "created_by": user.get("name", ""),
        }
        # p202: atomic — contract payment + cash + outbox event commit or abort
        # together (replica set, same pattern as p195/p201)
        from config.database import client as _client, main_db as _main_db
        from services.outbox import outbox_write
        async with await _client.start_session() as _tx:
            async with _tx.start_transaction():
                await db.rental_contracts.update_one(
                    {"id": contract_id},
                    {"$push": {"payments": pay}, "$inc": {"paid_amount": amount}, "$set": {"updated_at": _now()}},
                    session=_tx,
                )
                await _add_cash(body.cash_box_id or "cash", amount, "rental_payment",
                                contract_id, f"دفعة عقد كراء {c['code']}", user.get("name", ""), session=_tx)
                # p202: outbox → auto journal entry (Dr box / Cr 701)
                await outbox_write(
                    _main_db, "rental.payment_received",
                    {
                        "payment_id": pay["id"],
                        "contract_id": contract_id,
                        "contract_code": c["code"],
                        "customer_name": c.get("customer_name", ""),
                        "amount": amount,
                        "cash_box_id": body.cash_box_id or "cash",
                    },
                    tenant_id=user.get("tenant_id") or "platform",
                    source="rental_routes",
                    session=_tx,
                )
        return {"success": True, "paid_amount": round(float(c["paid_amount"]) + amount, 2)}

    @router.post("/contracts/{contract_id}/close")
    async def close_contract(contract_id: str, body: ContractClose, user: dict = Depends(require_tenant)):
        c = await db.rental_contracts.find_one({"id": contract_id})
        if not c or c.get("status") != "active":
            raise HTTPException(status_code=400, detail="العقد غير موجود أو مغلق")
        ret = _parse_day(body.actual_return_date) if body.actual_return_date else datetime.now(timezone.utc).date()
        end = _parse_day(c["end_date"])
        late_days = max(0, (ret - end).days)
        daily_equiv = float(c["rate"]) if c["rate_type"] == "daily" else float(c["rate"]) / 30.0
        late_fee = round(late_days * daily_equiv, 2)
        total_due = round(float(c["expected_total"]) + late_fee, 2)
        paid = float(c["paid_amount"])
        remaining = round(total_due - paid, 2)

        if body.deposit_action not in ("returned", "kept", "none"):
            raise HTTPException(status_code=400, detail="قرار الوديعة: returned أو kept")

        now = _now()
        # deposit refund from the chosen box (allowed to drive it negative — أمانة مسترجعة)
        deposit = float(c.get("deposit_amount") or 0)
        if body.deposit_action == "returned" and deposit > 0 and c.get("deposit_status") == "held":
            await _add_cash(body.refund_cash_box_id or "cash", -deposit, "rental_deposit_refund",
                            contract_id, f"استرجاع وديعة عقد كراء {c['code']}", user.get("name", ""))

        # unpaid remainder becomes a customer debt (mirror)
        if remaining > 0 and c.get("customer_id"):
            await db.customers.update_one(
                {"id": c["customer_id"]},
                {"$inc": {"balance": remaining, "total_debt": remaining}},
            )

        await db.rental_contracts.update_one(
            {"id": contract_id},
            {"$set": {
                "status": "closed",
                "closed_at": now,
                "actual_return_date": ret.isoformat(),
                "late_days": late_days,
                "late_fee": late_fee,
                "total_due": total_due,
                "remaining_at_close": remaining,
                "deposit_status": ("none" if deposit <= 0 else body.deposit_action),
                "close_notes": body.notes or "",
                "updated_at": now,
            }},
        )
        await db.rental_assets.update_one(
            {"id": c["asset_id"]}, {"$set": {"status": "available", "updated_at": now}}
        )
        return {
            "success": True,
            "late_days": late_days,
            "late_fee": late_fee,
            "total_due": total_due,
            "paid_amount": paid,
            "remaining": remaining,
        }

    # ================= Stats =================

    @router.get("/stats")
    async def rental_stats(user: dict = Depends(require_tenant)):
        assets = await db.rental_assets.find({}, {"_id": 0, "status": 1, "type": 1}).to_list(1000)
        contracts = await db.rental_contracts.find({}, {"_id": 0}).to_list(1000)
        contracts = [_with_virtual_status(c) for c in contracts]
        active = [c for c in contracts if c["status"] == "active"]
        overdue = [c for c in contracts if c["status"] == "overdue"]
        month_start = datetime.now(timezone.utc).date().replace(day=1).isoformat()
        month_revenue = sum(
            p["amount"] for c in contracts for p in c.get("payments", [])
            if p.get("created_at", "") >= month_start
        )
        return {
            "assets_total": len(assets),
            "assets_available": len([a for a in assets if a.get("status") == "available"]),
            "assets_rented": len([a for a in assets if a.get("status") == "rented"]),
            "assets_maintenance": len([a for a in assets if a.get("status") == "maintenance"]),
            "contracts_active": len(active),
            "contracts_overdue": len(overdue),
            "contracts_closed": len([c for c in contracts if c["status"] == "closed"]),
            "month_revenue": round(month_revenue, 2),
        }

    return router
