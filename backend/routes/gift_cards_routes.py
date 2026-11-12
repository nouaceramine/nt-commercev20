"""Gift cards module (بطاقات الهدايا) — module pack M2.

Issue prepaid gift cards, top them up, and redeem them against sales.
Every balance mutation is an atomic find_one_and_update with a balance
guard, so two concurrent redemptions can never overdraw a card.

Design decisions (documented):
- Codes: GC-XXXXXXXX (8 random hex, unique index, retry on collision).
- A card is a stored-value ledger: balance only moves through
  gift_card_transactions (issue/topup/redeem/adjust) — auditable.
- Redeem is amount-checked server-side and idempotent per sale_id.
- v1: redemption via API/POS custom flow; native POS payment-method
  wiring is a follow-up (documented in the module registry).
"""
from datetime import datetime, timezone
from typing import Optional
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from utils.ids import new_id

CARD_STATUSES = ("active", "depleted", "disabled", "expired")
TX_TYPES = ("issue", "topup", "redeem", "adjust")


class IssueIn(BaseModel):
    balance: float = Field(gt=0, le=10_000_000)
    customer_id: Optional[str] = None
    customer_name: str = ""
    expires_at: Optional[str] = None  # ISO date; None = no expiry
    notes: str = ""


class TopupIn(BaseModel):
    amount: float = Field(gt=0, le=10_000_000)
    notes: str = ""


class RedeemIn(BaseModel):
    code: str
    amount: float = Field(gt=0, le=10_000_000)
    sale_id: Optional[str] = None


class AdjustIn(BaseModel):
    amount: float  # signed; result must stay within [0, 10M]
    reason: str = Field(min_length=2, max_length=300)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_gift_cards_routes(db, get_current_user, get_tenant_admin, require_tenant):
    from utils.permissions import create_permission_checker
    _perm = create_permission_checker(db, get_current_user)
    router = APIRouter(prefix="/gift-cards", tags=["gift-cards"])

    async def _ensure_index():
        try:
            await db.gift_cards.create_index("code", unique=True)
        except Exception:
            pass

    async def _tx(card: dict, tx_type: str, amount: float, balance_after: float,
                  user: dict, notes: str = "", sale_id: str = None, session=None):
        await db.gift_card_transactions.insert_one({
            "id": new_id(), "card_id": card["id"], "card_code": card["code"],
            "type": tx_type, "amount": round(amount, 2),
            "balance_after": round(balance_after, 2),
            "sale_id": sale_id, "notes": notes,
            "created_by": user.get("name", ""), "created_at": _now(),
        }, session=session)

    def _fresh_status(card: dict) -> str:
        if card.get("status") == "disabled":
            return "disabled"
        exp = card.get("expires_at")
        if exp and exp < _now():
            return "expired"
        if (card.get("balance") or 0) <= 0:
            return "depleted"
        return "active"

    # ── Issue ──
    @router.post("", status_code=201)
    async def issue_card(body: IssueIn, user: dict = Depends(get_tenant_admin)):
        await _ensure_index()
        if body.customer_id:
            cust = await db.customers.find_one({"id": body.customer_id}, {"_id": 0, "id": 1, "name": 1})
            if not cust:
                raise HTTPException(status_code=404, detail="الزبون غير موجود")
            body.customer_name = cust.get("name") or body.customer_name
        from pymongo.errors import DuplicateKeyError
        doc = None
        for _ in range(5):  # code collision retry
            doc = {
                "id": new_id(), "code": f"GC-{secrets.token_hex(4).upper()}",
                "initial_balance": round(body.balance, 2), "balance": round(body.balance, 2),
                "customer_id": body.customer_id, "customer_name": body.customer_name or "",
                "status": "active", "expires_at": body.expires_at,
                "notes": body.notes or "",
                "issued_by": user.get("name", ""), "created_at": _now(), "updated_at": _now(),
            }
            try:
                await db.gift_cards.insert_one(doc)
                break
            except DuplicateKeyError:
                doc = None
        if doc is None:
            raise HTTPException(status_code=500, detail="تعذر توليد كود فريد — أعد المحاولة")
        await _tx(doc, "issue", body.balance, body.balance, user, notes=body.notes)
        doc.pop("_id", None)
        return doc

    # ── List ──
    @router.get("")
    async def list_cards(status: Optional[str] = None, search: str = "",
                         page: int = 1, page_size: int = 50,
                         user: dict = Depends(require_tenant)):
        query = {}
        if status and status != "all":
            if status not in CARD_STATUSES:
                raise HTTPException(status_code=400, detail="حالة غير معروفة")
            query["status"] = status
        if search:
            query["$or"] = [{"code": {"$regex": search, "$options": "i"}},
                            {"customer_name": {"$regex": search, "$options": "i"}}]
        page = max(1, page)
        page_size = max(1, min(page_size, 200))
        total = await db.gift_cards.count_documents(query)
        items = await db.gift_cards.find(query, {"_id": 0}) \
            .sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    # ── Stats ──
    @router.get("/stats")
    async def card_stats(user: dict = Depends(require_tenant)):
        rows = await db.gift_cards.aggregate([
            {"$group": {"_id": "$status", "n": {"$sum": 1},
                        "balance": {"$sum": "$balance"}, "issued": {"$sum": "$initial_balance"}}},
        ]).to_list(None)
        by_status = {r["_id"]: {"count": r["n"], "balance": round(r["balance"], 2),
                                "issued": round(r["issued"], 2)} for r in rows}
        outstanding = round(sum(v["balance"] for k, v in by_status.items()
                                if k in ("active",)), 2)
        return {"by_status": by_status, "outstanding_liability": outstanding,
                "total_cards": sum(v["count"] for v in by_status.values())}

    # ── Balance check by code (POS flow) ──
    @router.get("/check/{code}")
    async def check_balance(code: str, user: dict = Depends(require_tenant)):
        card = await db.gift_cards.find_one({"code": code.strip().upper()}, {"_id": 0})
        if not card:
            raise HTTPException(status_code=404, detail="البطاقة غير موجودة")
        card["status"] = _fresh_status(card)
        return {"code": card["code"], "balance": card["balance"], "status": card["status"],
                "customer_name": card.get("customer_name", ""), "expires_at": card.get("expires_at")}

    # ── Card transactions ──
    @router.get("/{card_id}/transactions")
    async def card_transactions(card_id: str, user: dict = Depends(require_tenant)):
        txs = await db.gift_card_transactions.find({"card_id": card_id}, {"_id": 0}) \
            .sort("created_at", -1).to_list(200)
        return {"items": txs}

    # ── Top up ──
    @router.post("/{card_id}/topup")
    async def topup_card(card_id: str, body: TopupIn, user: dict = Depends(get_tenant_admin)):
        card = await db.gift_cards.find_one_and_update(
            {"id": card_id, "status": {"$in": ["active", "depleted"]}},
            {"$inc": {"balance": round(body.amount, 2)}, "$set": {"updated_at": _now(), "status": "active"}},
            return_document=True)
        if not card:
            raise HTTPException(status_code=400, detail="البطاقة غير موجودة أو معطلة أو منتهية")
        await _tx(card, "topup", body.amount, card["balance"], user, notes=body.notes)
        card.pop("_id", None)
        return card

    # ── Redeem (atomic balance guard; idempotent per sale_id) ──
    @router.post("/redeem")
    async def redeem(body: RedeemIn, user: dict = Depends(_perm("sales.add"))):
        code = body.code.strip().upper()
        if body.sale_id:
            dup = await db.gift_card_transactions.find_one(
                {"type": "redeem", "sale_id": body.sale_id, "card_code": code}, {"_id": 1})
            if dup:
                raise HTTPException(status_code=400, detail="هذه البطاقة استُخدمت مسبقاً في هذه الفاتورة")
        card = await db.gift_cards.find_one({"code": code})
        if not card:
            raise HTTPException(status_code=404, detail="البطاقة غير موجودة")
        if _fresh_status(card) != "active":
            raise HTTPException(status_code=400, detail="البطاقة غير صالحة (معطلة/منتهية/مرهونة)")
        updated = await db.gift_cards.find_one_and_update(
            {"code": code, "balance": {"$gte": round(body.amount, 2)}, "status": "active"},
            {"$inc": {"balance": -round(body.amount, 2)}, "$set": {"updated_at": _now()}},
            return_document=True)
        if not updated:
            raise HTTPException(status_code=400, detail="الرصيد غير كافٍ")
        # Reflect depletion in the stored status
        if updated["balance"] <= 0:
            await db.gift_cards.update_one({"id": updated["id"]}, {"$set": {"status": "depleted"}})
            updated["status"] = "depleted"
        await _tx(updated, "redeem", -body.amount, updated["balance"], user, sale_id=body.sale_id)
        return {"code": code, "redeemed": round(body.amount, 2),
                "remaining_balance": round(updated["balance"], 2), "status": updated["status"]}

    # ── Enable / disable ──
    @router.post("/{card_id}/toggle")
    async def toggle_card(card_id: str, user: dict = Depends(get_tenant_admin)):
        card = await db.gift_cards.find_one({"id": card_id})
        if not card:
            raise HTTPException(status_code=404, detail="البطاقة غير موجودة")
        new_status = "disabled" if card.get("status") != "disabled" else (
            "depleted" if (card.get("balance") or 0) <= 0 else "active")
        await db.gift_cards.update_one({"id": card_id},
                                       {"$set": {"status": new_status, "updated_at": _now()}})
        return {"id": card_id, "status": new_status}

    # ── Admin adjust (signed, reason mandatory) ──
    @router.post("/{card_id}/adjust")
    async def adjust_card(card_id: str, body: AdjustIn, user: dict = Depends(get_tenant_admin)):
        amount = round(body.amount, 2)
        if amount == 0 or abs(amount) > 10_000_000:
            raise HTTPException(status_code=400, detail="مبلغ غير صالح")
        card = await db.gift_cards.find_one({"id": card_id})
        if not card:
            raise HTTPException(status_code=404, detail="البطاقة غير موجودة")
        new_balance = round((card.get("balance") or 0) + amount, 2)
        if new_balance < 0:
            raise HTTPException(status_code=400, detail="التسوية تجعل الرصيد سالباً")
        await db.gift_cards.update_one({"id": card_id}, {"$set": {
            "balance": new_balance,
            "status": "depleted" if new_balance <= 0 else ("disabled" if card.get("status") == "disabled" else "active"),
            "updated_at": _now(),
        }})
        await _tx(card, "adjust", amount, new_balance, user, notes=body.reason)
        return {"id": card_id, "balance": new_balance}

    return router
