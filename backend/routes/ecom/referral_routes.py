"""E-Commerce Hub: referral program (p245).

Competitor parity (EcoManager affiliates): the merchant hands referral codes
to partners/customers; orders created with a code attach to the referrer
(reward terms snapshotted on the order), the reward is booked automatically
when the order is delivered (event consumer handle_referral_outcome), and the
merchant settles with a payout that marks due rewards as paid.

  POST   /api/ecom/referrals                 — create code
  GET    /api/ecom/referrals                 — list + live stats
  PUT    /api/ecom/referrals/{id}            — edit / toggle active
  DELETE /api/ecom/referrals/{id}            — only if never used
  GET    /api/ecom/referrals/{id}/rewards    — reward ledger
  POST   /api/ecom/referrals/{id}/payout     — pay out all due rewards
"""
from datetime import datetime, timezone
from typing import Optional
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config.database import db
from utils.auth import require_tenant
from routes.ecom.constants import require_ecom_feature

logger = logging.getLogger(__name__)
router = APIRouter(tags=["E-Commerce Referrals"])

REWARD_TYPES = ("fixed", "percent")


class ReferralIn(BaseModel):
    name: str
    phone: Optional[str] = ""
    code: Optional[str] = ""
    reward_type: str = "fixed"
    reward_value: float = 0
    notes: Optional[str] = ""


class ReferralUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    reward_type: Optional[str] = None
    reward_value: Optional[float] = None
    active: Optional[bool] = None
    notes: Optional[str] = None


async def resolve_referral(code: str) -> Optional[dict]:
    """Active referral by code (case-insensitive) — used by order creation paths."""
    code = (code or "").strip().upper()
    if not code:
        return None
    return await db.ecom_referrals.find_one(
        {"code": code, "active": {"$ne": False}}, {"_id": 0})


def _validate_reward(reward_type: str, reward_value: float):
    if reward_type not in REWARD_TYPES:
        raise HTTPException(status_code=400, detail="نوع المكافأة fixed أو percent فقط")
    if reward_value < 0:
        raise HTTPException(status_code=400, detail="قيمة المكافأة سالبة")
    if reward_type == "percent" and reward_value > 100:
        raise HTTPException(status_code=400, detail="النسبة لا تتجاوز 100%")


@router.post("/ecom/referrals")
async def create_referral(body: ReferralIn, user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="اسم المُحيل مطلوب")
    _validate_reward(body.reward_type, body.reward_value)
    code = (body.code or "").strip().upper()
    if not code:
        code = f"REF-{uuid.uuid4().hex[:6].upper()}"
    if await db.ecom_referrals.find_one({"code": code}):
        raise HTTPException(status_code=409, detail="رمز الإحالة مستخدم من قبل")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "code": code,
        "name": name,
        "phone": (body.phone or "").strip(),
        "reward_type": body.reward_type,
        "reward_value": round(float(body.reward_value), 2),
        "active": True,
        "notes": (body.notes or "").strip(),
        "created_by": user.get("id"),
        "created_at": now,
        "updated_at": now,
    }
    await db.ecom_referrals.insert_one(doc)
    doc.pop("_id", None)
    return {"ok": True, "referral": doc}


@router.get("/ecom/referrals")
async def list_referrals(user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    refs = await db.ecom_referrals.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for r in refs:
        rid = r["id"]
        r["orders_count"] = await db.ecom_orders.count_documents({"referral_id": rid})
        r["delivered_count"] = await db.ecom_orders.count_documents(
            {"referral_id": rid, "status": "delivered"})
        agg = db.ecom_referral_rewards.aggregate([
            {"$match": {"referral_id": rid}},
            {"$group": {"_id": "$status", "total": {"$sum": "$amount"}}},
        ])
        sums = {row["_id"]: row["total"] async for row in agg}
        r["reward_due"] = round(sums.get("due", 0.0), 2)
        r["reward_paid"] = round(sums.get("paid", 0.0), 2)
        r["reward_cancelled"] = round(sums.get("cancelled", 0.0), 2)
    return {"items": refs}


@router.put("/ecom/referrals/{rid}")
async def update_referral(rid: str, body: ReferralUpdate, user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    ref = await db.ecom_referrals.find_one({"id": rid})
    if not ref:
        raise HTTPException(status_code=404, detail="الإحالة غير موجودة")
    updates = {}
    if body.name is not None:
        if not body.name.strip():
            raise HTTPException(status_code=400, detail="الاسم فارغ")
        updates["name"] = body.name.strip()
    if body.phone is not None:
        updates["phone"] = body.phone.strip()
    if body.notes is not None:
        updates["notes"] = body.notes.strip()
    if body.active is not None:
        updates["active"] = bool(body.active)
    rt = body.reward_type if body.reward_type is not None else ref.get("reward_type", "fixed")
    rv = body.reward_value if body.reward_value is not None else float(ref.get("reward_value") or 0)
    _validate_reward(rt, float(rv))
    updates["reward_type"] = rt
    updates["reward_value"] = round(float(rv), 2)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.ecom_referrals.update_one({"id": rid}, {"$set": updates})
    return {"ok": True}


@router.delete("/ecom/referrals/{rid}")
async def delete_referral(rid: str, user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    if await db.ecom_orders.count_documents({"referral_id": rid}):
        raise HTTPException(status_code=409, detail="الإحالة مرتبطة بطلبات — عطّلوها بدل الحذف")
    res = await db.ecom_referrals.delete_one({"id": rid})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="الإحالة غير موجودة")
    return {"ok": True}


@router.get("/ecom/referrals/{rid}/rewards")
async def referral_rewards(rid: str, user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    if not await db.ecom_referrals.find_one({"id": rid}):
        raise HTTPException(status_code=404, detail="الإحالة غير موجودة")
    rewards = await db.ecom_referral_rewards.find(
        {"referral_id": rid}, {"_id": 0}).sort("created_at", -1).to_list(500)
    payouts = await db.ecom_referral_payouts.find(
        {"referral_id": rid}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"rewards": rewards, "payouts": payouts}


@router.post("/ecom/referrals/{rid}/payout")
async def payout_referral(rid: str, user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    ref = await db.ecom_referrals.find_one({"id": rid}, {"_id": 0})
    if not ref:
        raise HTTPException(status_code=404, detail="الإحالة غير موجودة")
    due = await db.ecom_referral_rewards.find(
        {"referral_id": rid, "status": "due"}, {"_id": 0, "id": 1, "amount": 1}).to_list(1000)
    if not due:
        raise HTTPException(status_code=400, detail="لا مكافآت مستحقة")
    total = round(sum(float(r["amount"]) for r in due), 2)
    now = datetime.now(timezone.utc).isoformat()
    payout = {
        "id": str(uuid.uuid4()),
        "referral_id": rid,
        "amount": total,
        "reward_ids": [r["id"] for r in due],
        "created_by": user.get("id"),
        "created_at": now,
    }
    await db.ecom_referral_payouts.insert_one(payout)
    await db.ecom_referral_rewards.update_many(
        {"id": {"$in": payout["reward_ids"]}},
        {"$set": {"status": "paid", "paid_at": now, "payout_id": payout["id"]}})
    payout.pop("_id", None)
    return {"ok": True, "payout": payout}
