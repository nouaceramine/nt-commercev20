"""Fixed assets module (الأصول الثابتة) — module pack M3.

Asset register with straight-line monthly depreciation, fully integrated
with the tenant's double-entry journal via services.accounting_auto:

- Purchase:        Dr 340 الأصول الثابتة   / Cr 53x (cash box) or 401 (supplier credit)
- Depreciation:    Dr 615 مصروف الإهلاك   / Cr 345 مجمع الإهلاك  (per asset, per month, idempotent)
- Disposal:        Dr 53x (sale proceeds) + Dr 345 (accumulated)
                   Cr 340 (cost) ± 615 (loss) / 765 (gain)

Chart placement follows the platform's balance-sheet classifier
(assets = 3xx/4xx/5xx debit-nature; 6xx expense; 7xx revenue), so assets
appear in the balance sheet and depreciation in the income statement
with zero changes to the reporting code.
"""
from datetime import datetime, timezone
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from utils.ids import new_id

ASSET_ACCOUNTS = [
    ("340", "الأصول الثابتة", "asset"),
    ("345", "مجمع إهلاك الأصول", "asset"),       # contra (credit-nature)
    ("615", "مصروف إهلاك الأصول", "expense"),
    ("765", "إيرادات متنوعة", "revenue"),
]


class AssetCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    category: str = "general"
    purchase_date: str  # YYYY-MM-DD
    cost: float = Field(gt=0, le=1e12)
    salvage_value: float = Field(default=0, ge=0)
    useful_life_months: int = Field(gt=0, le=600)
    payment_method: str = "cash"   # cash box id, or "credit" for supplier credit
    supplier_id: Optional[str] = None
    notes: str = ""


class DisposeIn(BaseModel):
    sale_amount: float = Field(default=0, ge=0, le=1e12)
    payment_method: str = "cash"
    disposal_date: Optional[str] = None
    notes: str = ""


class DepRunIn(BaseModel):
    period: str  # YYYY-MM


def _now() -> datetime:
    return datetime.now(timezone.utc)


def monthly_depreciation(cost: float, salvage_value: float, useful_life_months: int) -> float:
    """Straight-line monthly charge; never negative."""
    base = max(0.0, float(cost) - float(salvage_value or 0))
    months = int(useful_life_months)
    return round(base / months, 2) if months > 0 else 0.0


def create_fixed_assets_routes(db, get_current_user, get_tenant_admin, require_tenant):
    router = APIRouter(prefix="/fixed-assets", tags=["fixed-assets"])

    async def _ensure_accounts() -> dict:
        out = {}
        for code, name, atype in ASSET_ACCOUNTS:
            acc = await db.accounts.find_one({"code": code})
            if not acc:
                acc = {"id": str(uuid.uuid4()), "code": code, "name": name, "name_ar": name,
                       "account_type": atype, "parent_id": None,
                       "description": "حساب الأصول الثابتة (نظام)", "balance": 0,
                       "is_active": True, "created_by": "system",
                       "created_at": _now().isoformat()}
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

    async def _post(reference, reference_id, source_tag, description, lines, date=None):
        from services.accounting_auto import _insert_entry, already_posted
        if await already_posted(db, reference_id, source_tag):
            return None
        return await _insert_entry(db, reference=reference, reference_id=reference_id,
                                   source_tag=source_tag, description=description,
                                   lines=lines, date=date)

    async def _box_account(box_id: str) -> dict:
        from services.accounting_auto import BOX_ACCOUNT, ensure_accounts
        await ensure_accounts(db)
        code = BOX_ACCOUNT.get(box_id or "cash", "530")
        acc = await db.accounts.find_one({"code": code})
        if not acc:
            raise HTTPException(status_code=400, detail="حساب الصندوق غير موجود")
        return acc

    def _monthly(asset: dict) -> float:
        return monthly_depreciation(asset["cost"], asset.get("salvage_value") or 0,
                                    asset["useful_life_months"])

    # ── Create (purchase entry) ──
    @router.post("", status_code=201)
    async def create_asset(body: AssetCreate, user: dict = Depends(get_tenant_admin)):
        if body.salvage_value >= body.cost:
            raise HTTPException(status_code=400, detail="القيمة التخريدية يجب أن تكون أقل من التكلفة")
        try:
            datetime.strptime(body.purchase_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="تاريخ الشراء بصيغة YYYY-MM-DD")
        accs = await _ensure_accounts()
        if body.payment_method == "credit":
            from services.accounting_auto import ensure_accounts
            await ensure_accounts(db)
            credit_acc = await db.accounts.find_one({"code": "401"})
        else:
            credit_acc = await _box_account(body.payment_method)
            box = await db.cash_boxes.find_one({"id": body.payment_method})
            if not box:
                raise HTTPException(status_code=400, detail="صندوق غير موجود")
        now = _now().isoformat()
        doc = {
            "id": new_id(), "name": body.name, "category": body.category,
            "purchase_date": body.purchase_date, "cost": round(body.cost, 2),
            "salvage_value": round(body.salvage_value, 2),
            "useful_life_months": body.useful_life_months,
            "monthly_depreciation": 0,  # filled below
            "accumulated": 0.0, "status": "active",
            "payment_method": body.payment_method, "supplier_id": body.supplier_id,
            "notes": body.notes or "", "created_by": user.get("name", ""),
            "created_at": now, "updated_at": now,
        }
        doc["monthly_depreciation"] = _monthly(doc)
        # Journal: Dr 340 / Cr box|401 ; cash leaves the box
        await _post(f"شراء أصل {body.name}", doc["id"], "asset_purchase",
                    f"شراء أصل ثابت: {body.name}",
                    [_line(accs["340"], debit=body.cost), _line(credit_acc, credit=body.cost)],
                    date=body.purchase_date)
        if body.payment_method != "credit":
            await db.cash_boxes.update_one({"id": body.payment_method},
                                           {"$inc": {"balance": -round(body.cost, 2)},
                                            "$set": {"updated_at": now}})
        await db.fixed_assets.insert_one(doc)
        doc.pop("_id", None)
        return doc

    # ── List with computed book value ──
    @router.get("")
    async def list_assets(status: Optional[str] = None, user: dict = Depends(require_tenant)):
        query = {}
        if status and status != "all":
            query["status"] = status
        items = await db.fixed_assets.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
        for a in items:
            a["book_value"] = round(a["cost"] - a.get("accumulated", 0), 2)
        total_cost = round(sum(a["cost"] for a in items), 2)
        total_accum = round(sum(a.get("accumulated", 0) for a in items), 2)
        return {"items": items, "summary": {
            "total_cost": total_cost, "total_accumulated": total_accum,
            "net_book_value": round(total_cost - total_accum, 2),
            "active_count": sum(1 for a in items if a["status"] == "active"),
        }}

    # ── Depreciation schedule preview ──
    @router.get("/{asset_id}/schedule")
    async def schedule(asset_id: str, user: dict = Depends(require_tenant)):
        a = await db.fixed_assets.find_one({"id": asset_id}, {"_id": 0})
        if not a:
            raise HTTPException(status_code=404, detail="الأصل غير موجود")
        rows = await db.depreciation_records.find({"asset_id": asset_id}, {"_id": 0}) \
            .sort("period", 1).to_list(600)
        remaining = round(a["cost"] - a.get("salvage_value", 0) - a.get("accumulated", 0), 2)
        remaining_months = 0 if a["monthly_depreciation"] <= 0 else \
            int((remaining + a["monthly_depreciation"] - 0.01) // a["monthly_depreciation"])
        return {"asset": a, "book_value": round(a["cost"] - a.get("accumulated", 0), 2),
                "records": rows, "remaining_to_depreciate": max(0.0, remaining),
                "remaining_months": max(0, remaining_months)}

    # ── Monthly depreciation run (idempotent per asset+period) ──
    @router.post("/run-depreciation")
    async def run_depreciation(body: DepRunIn, user: dict = Depends(get_tenant_admin)):
        try:
            datetime.strptime(body.period + "-01", "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="الفترة بصيغة YYYY-MM")
        accs = await _ensure_accounts()
        assets = await db.fixed_assets.find({"status": "active"}).to_list(1000)
        posted, skipped, fully_done, done_assets = 0, 0, 0, []
        for a in assets:
            monthly = a.get("monthly_depreciation") or _monthly(a)
            remaining = round(a["cost"] - a.get("salvage_value", 0) - a.get("accumulated", 0), 2)
            if remaining <= 0 or monthly <= 0:
                fully_done += 1
                continue
            amount = min(monthly, remaining)
            # Idempotency: unique (asset_id, period)
            dup = await db.depreciation_records.find_one({"asset_id": a["id"], "period": body.period})
            if dup:
                skipped += 1
                continue
            entry = await _post(f"إهلاك {a['name']} — {body.period}",
                                f"{a['id']}:{body.period}", "asset_depreciation",
                                f"قيد إهلاك شهري: {a['name']} ({body.period})",
                                [_line(accs["615"], debit=amount), _line(accs["345"], credit=amount)],
                                date=f"{body.period}-28")
            if entry is None:
                skipped += 1
                continue
            await db.depreciation_records.insert_one({
                "id": new_id(), "asset_id": a["id"], "asset_name": a["name"],
                "period": body.period, "amount": amount,
                "entry_id": entry["id"], "created_at": _now().isoformat(),
            })
            await db.fixed_assets.update_one({"id": a["id"]}, {
                "$inc": {"accumulated": amount}, "$set": {"updated_at": _now().isoformat()}})
            posted += 1
            done_assets.append({"asset": a["name"], "amount": amount})
        return {"period": body.period, "posted": posted, "skipped_existing": skipped,
                "fully_depreciated": fully_done, "details": done_assets}

    # ── Dispose (sale or write-off) ──
    @router.post("/{asset_id}/dispose")
    async def dispose_asset(asset_id: str, body: DisposeIn, user: dict = Depends(get_tenant_admin)):
        # p502: atomic claim active->disposing BEFORE posting/moving money — the
        # old check-then-act let concurrent disposals both pass (double proceeds,
        # and a DuplicateKeyError 500 from auto_entry_unique on the loser).
        a = await db.fixed_assets.find_one_and_update(
            {"id": asset_id, "status": "active"},
            {"$set": {"status": "disposing", "updated_at": _now().isoformat()}})
        if not a:
            exists = await db.fixed_assets.find_one({"id": asset_id}, {"_id": 0, "status": 1})
            if not exists:
                raise HTTPException(status_code=404, detail="الأصل غير موجود")
            raise HTTPException(status_code=400, detail="الأصل مُخرَج مسبقاً")
        try:
            accs = await _ensure_accounts()
            date = body.disposal_date or _now().strftime("%Y-%m-%d")
            cost = round(a["cost"], 2)
            accum = round(a.get("accumulated", 0), 2)
            book_value = round(cost - accum, 2)
            proceeds = round(body.sale_amount, 2)
            lines = []
            if proceeds > 0:
                box_acc = await _box_account(body.payment_method)
                box = await db.cash_boxes.find_one({"id": body.payment_method})
                if not box:
                    raise HTTPException(status_code=400, detail="صندوق غير موجود")
                lines.append(_line(box_acc, debit=proceeds))
            if accum > 0:
                lines.append(_line(accs["345"], debit=accum))
            lines.append(_line(accs["340"], credit=cost))
            diff = round(proceeds - book_value, 2)
            if diff < 0:
                lines.append(_line(accs["615"], debit=-diff))   # loss on disposal
            elif diff > 0:
                lines.append(_line(accs["765"], credit=diff))   # gain on disposal
            entry = await _post(f"إخراج أصل {a['name']}", asset_id, "asset_disposal",
                                f"إخراج أصل ثابت: {a['name']} (قيمة دفترية {book_value}، بيع {proceeds})",
                                lines, date=date)
            if entry is None:
                # A disposal journal already exists for this asset (a crashed
                # earlier attempt). Refuse to move money against unknown lines.
                raise HTTPException(status_code=409,
                                    detail="يوجد قيد إخراج سابق لهذا الأصل — راجع المحاسبة قبل المتابعة")
            if proceeds > 0:
                await db.cash_boxes.update_one({"id": body.payment_method},
                                               {"$inc": {"balance": proceeds},
                                                "$set": {"updated_at": _now().isoformat()}})
        except Exception:
            await db.fixed_assets.update_one(
                {"id": asset_id, "status": "disposing"},
                {"$set": {"status": "active", "updated_at": _now().isoformat()}})
            raise
        await db.fixed_assets.update_one({"id": asset_id}, {"$set": {
            "status": "disposed", "disposal_date": date, "disposal_proceeds": proceeds,
            "disposal_gain_loss": diff, "updated_at": _now().isoformat(),
        }})
        return {"id": asset_id, "status": "disposed", "book_value": book_value,
                "proceeds": proceeds, "gain_loss": diff}

    return router
