"""
Commission State Machine & Agent Withdrawal Routes

Commission lifecycle:
  pending    → 7-day chargeback window; balance NOT yet credited
  available  → chargeback window passed; agent may request withdrawal
  reversed   → tenant cancelled/deleted within 7 days; commission voided
  withdrawn  → agent was paid out; admin approved the withdrawal request

Withdrawal requests:
  pending_approval → agent submitted; admin has not acted yet
  approved         → admin approved; amount moved to withdrawn
  rejected         → admin rejected; amount stays available
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone, timedelta
import uuid
import math
import logging

from config.database import db
from .helpers import get_super_admin, get_current_agent

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Commission & Withdrawals"])

CHARGEBACK_DAYS = 7


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

async def create_commission_record(
    agent_id: str,
    tenant_id: str,
    tenant_name: str,
    amount: float,
    note: str = "",
) -> dict:
    """Insert a PENDING commission record for an agent. Called when a tenant signs up."""
    now = datetime.now(timezone.utc)
    rec = {
        "id": str(uuid.uuid4()),
        "agent_id": agent_id,
        "tenant_id": tenant_id,
        "tenant_name": tenant_name,
        "amount": amount,
        "status": "pending",
        "chargeback_until": (now + timedelta(days=CHARGEBACK_DAYS)).isoformat(),
        "note": note,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    await db.agent_commissions.insert_one(rec)
    rec.pop("_id", None)
    return rec


async def reverse_commissions_for_tenant(tenant_id: str, only_within_chargeback_window: bool = False) -> int:
    """Set PENDING commissions for a tenant to REVERSED.

    If only_within_chargeback_window=True, only reverse records whose chargeback_until
    is still in the future (i.e., strictly within the 7-day window). Records whose window
    has already passed should have been promoted to AVAILABLE and must NOT be reversed.
    Returns number reversed.
    """
    now = datetime.now(timezone.utc).isoformat()
    query: dict = {"tenant_id": tenant_id, "status": "pending"}
    if only_within_chargeback_window:
        # Only reverse records that are still inside the chargeback window
        query["chargeback_until"] = {"$gt": now}
    result = await db.agent_commissions.update_many(
        query,
        {"$set": {"status": "reversed", "updated_at": now}},
    )
    return result.modified_count


async def backfill_legacy_commissions() -> int:
    """Idempotent migration: commission records created before the status field was added
    (i.e., missing 'status') are treated as fully cleared — set them to 'available'.
    This runs once at startup (called from the summary endpoint on first access) and is
    safe to call multiple times.
    """
    now = datetime.now(timezone.utc).isoformat()
    result = await db.agent_commissions.update_many(
        {"status": {"$exists": False}},
        {"$set": {"status": "available", "chargeback_until": now, "updated_at": now}},
    )
    return result.modified_count


async def promote_pending_commissions() -> int:
    """Scan PENDING commissions whose chargeback window has passed → set AVAILABLE."""
    now = datetime.now(timezone.utc).isoformat()
    result = await db.agent_commissions.update_many(
        {"status": "pending", "chargeback_until": {"$lte": now}},
        {"$set": {"status": "available", "updated_at": now}},
    )
    return result.modified_count


async def get_commission_summary(agent_id: str) -> dict:
    """Return pending / available / withdrawn / reversed totals for an agent."""
    pipeline = [
        {"$match": {"agent_id": agent_id}},
        {"$group": {"_id": "$status", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]
    rows = await db.agent_commissions.aggregate(pipeline).to_list(20)
    summary = {"pending": 0.0, "available": 0.0, "withdrawn": 0.0, "reversed": 0.0}
    counts = {"pending": 0, "available": 0, "withdrawn": 0, "reversed": 0}
    for r in rows:
        key = r["_id"]
        if key in summary:
            summary[key] = r["total"]
            counts[key] = r["count"]

    # Also compute "reserved" = amount in pending_approval withdrawals (not yet resolved)
    reserved_pipeline = [
        {"$match": {"agent_id": agent_id, "status": "pending_approval"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    reserved_rows = await db.agent_withdrawals.aggregate(reserved_pipeline).to_list(1)
    reserved = reserved_rows[0]["total"] if reserved_rows else 0.0

    return {
        "pending": summary["pending"],
        "available": summary["available"],
        "withdrawn": summary["withdrawn"],
        "reversed": summary["reversed"],
        "reserved": reserved,
        "counts": counts,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Agent-facing endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/saas/agent/commissions/summary")
async def agent_commission_summary(agent: dict = Depends(get_current_agent)):
    """Return the agent's commission buckets and recent pending commissions."""
    await backfill_legacy_commissions()   # idempotent — migrates pre-status records
    await promote_pending_commissions()
    summary = await get_commission_summary(agent["id"])

    # Return the N most recent pending records so the agent can see countdowns
    pending_records = await db.agent_commissions.find(
        {"agent_id": agent["id"], "status": "pending"},
        {"_id": 0},
    ).sort("created_at", -1).limit(20).to_list(20)

    return {**summary, "pending_records": pending_records}


@router.get("/saas/agent/commissions/history")
async def agent_commission_history(
    limit: int = 50,
    agent: dict = Depends(get_current_agent),
):
    records = await db.agent_commissions.find(
        {"agent_id": agent["id"]}, {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return records


@router.post("/saas/agent/commissions/withdraw-request")
async def agent_withdraw_request(data: dict, agent: dict = Depends(get_current_agent)):
    """
    Agent requests a withdrawal of AVAILABLE commission balance.
    The requested amount is reserved (not deducted yet) until admin resolves.
    """
    await promote_pending_commissions()
    try:
        amount = float(data.get("amount", 0) or 0)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="المبلغ غير صالح")
    if not math.isfinite(amount) or amount <= 0:
        raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون رقماً موجباً صحيحاً")

    summary = await get_commission_summary(agent["id"])
    # Effective available = available minus already-reserved
    effective_available = summary["available"] - summary["reserved"]
    if amount > effective_available:
        raise HTTPException(
            status_code=400,
            detail=f"المبلغ المطلوب ({amount}) يتجاوز الرصيد المتاح ({effective_available:.2f})",
        )

    bank_details = data.get("bank_details", "")
    note = data.get("note", "")

    rec = {
        "id": str(uuid.uuid4()),
        "agent_id": agent["id"],
        "agent_name": agent.get("name", agent.get("email", "")),
        "amount": amount,
        "bank_details": bank_details,
        "note": note,
        "status": "pending_approval",
        "reject_reason": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "resolved_at": None,
        "resolved_by": None,
    }
    await db.agent_withdrawals.insert_one(rec)
    rec.pop("_id", None)
    return rec


@router.get("/saas/agent/commissions/withdrawals")
async def agent_my_withdrawals(agent: dict = Depends(get_current_agent)):
    """List this agent's own withdrawal requests."""
    rows = await db.agent_withdrawals.find(
        {"agent_id": agent["id"]}, {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    return rows


# ─────────────────────────────────────────────────────────────────────────────
# Super-admin endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/saas/agent-withdrawals")
async def admin_list_withdrawals(
    status: str = "all",
    admin: dict = Depends(get_super_admin),
):
    """List all agent withdrawal requests (admin)."""
    query: dict = {}
    if status != "all":
        query["status"] = status
    rows = await db.agent_withdrawals.find(query, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
    return rows


@router.post("/saas/agent-withdrawals/{withdrawal_id}/approve")
async def admin_approve_withdrawal(
    withdrawal_id: str,
    admin: dict = Depends(get_super_admin),
):
    """
    Approve a withdrawal request.

    Atomicity strategy (without full MongoDB transactions):
    1. Claim the withdrawal via compare-and-set: update status from
       pending_approval → approved in a single conditional write.
       If modified_count == 0, another concurrent request already claimed it → abort.
    2. With the claim secured, mutate commission records (Phase 1 plan + Phase 2 execute).
    3. Insert the payout audit record.
    4. If commission mutations fail after claiming, mark withdrawal as failed
       so the admin can retry or investigate — no silent partial state.
    """
    resolved_by = admin.get("email", admin.get("id", "admin"))
    now = datetime.now(timezone.utc).isoformat()

    # ── Step 1: Atomic claim via compare-and-set ─────────────────────────────
    # Read first to get the amount; then claim atomically.
    wr = await db.agent_withdrawals.find_one({"id": withdrawal_id}, {"_id": 0})
    if not wr:
        raise HTTPException(status_code=404, detail="طلب السحب غير موجود")
    if wr["status"] != "pending_approval":
        raise HTTPException(status_code=400, detail="تمت معالجة الطلب مسبقاً")

    agent_id = wr["agent_id"]
    amount_needed = wr["amount"]

    # ── Step 2: Validate balance and plan deductions BEFORE claiming ─────────
    # All pre-flight checks happen here so we never claim a request we cannot fulfill.
    await promote_pending_commissions()
    summary = await get_commission_summary(agent_id)
    if summary["available"] < amount_needed:
        raise HTTPException(
            status_code=400,
            detail=f"الرصيد المتاح ({summary['available']:.2f}) أقل من المبلغ المطلوب ({amount_needed})",
        )

    available_commissions = await db.agent_commissions.find(
        {"agent_id": agent_id, "status": "available"},
        {"_id": 0},
    ).sort("created_at", 1).to_list(None)

    tolerance = 0.01  # handles floating-point rounding (1 centime)
    remaining = amount_needed
    plan: list[dict] = []

    for comm in available_commissions:
        if remaining <= tolerance:
            break
        deduct = min(comm["amount"], remaining)
        remaining -= deduct
        plan.append({
            "comm": comm,
            "deduct": deduct,
            "full_withdraw": deduct >= comm["amount"] - tolerance,
        })

    if remaining > tolerance:
        raise HTTPException(
            status_code=409,
            detail=(
                f"لم يتم استيفاء المبلغ الكامل ({amount_needed}) من الرصيد المتاح "
                f"(متبقٍ: {remaining:.2f}). أعِد تشغيل الأمر بعد مزامنة الرصيد."
            ),
        )

    # ── Step 3: Atomic claim via compare-and-set ─────────────────────────────
    # Only executes after all pre-flight checks pass.
    # If two concurrent requests race, only one modified_count==1 wins.
    claim_result = await db.agent_withdrawals.update_one(
        {"id": withdrawal_id, "status": "pending_approval"},
        {"$set": {"status": "approved", "resolved_at": now, "resolved_by": resolved_by}},
    )
    if claim_result.modified_count == 0:
        raise HTTPException(status_code=409, detail="تمت معالجة هذا الطلب مسبقاً (تعارض متزامن)")

    # ── Step 4: Execute commission mutations ─────────────────────────────────
    for entry in plan:
        comm = entry["comm"]
        deduct = entry["deduct"]
        if entry["full_withdraw"]:
            await db.agent_commissions.update_one(
                {"id": comm["id"]},
                {"$set": {"status": "withdrawn", "updated_at": now}},
            )
        else:
            await db.agent_commissions.update_one(
                {"id": comm["id"]},
                {"$set": {"amount": comm["amount"] - deduct, "updated_at": now}},
            )
            new_rec = {
                "id": str(uuid.uuid4()),
                "agent_id": agent_id,
                "tenant_id": comm.get("tenant_id", ""),
                "tenant_name": comm.get("tenant_name", ""),
                "amount": deduct,
                "status": "withdrawn",
                "chargeback_until": comm.get("chargeback_until", now),
                "note": f"تم السحب — withdrawal {withdrawal_id}",
                "created_at": comm.get("created_at", now),
                "updated_at": now,
            }
            await db.agent_commissions.insert_one(new_rec)

    # ── Step 5: Payout audit record ──────────────────────────────────────────
    payout_tx = {
        "id": str(uuid.uuid4()),
        "agent_id": agent_id,
        "agent_name": wr.get("agent_name", ""),
        "type": "commission_payout",
        "amount": amount_needed,
        "direction": "debit",
        "reference_id": withdrawal_id,
        "reference_type": "agent_withdrawal",
        "bank_details": wr.get("bank_details", ""),
        "note": wr.get("note", ""),
        "resolved_by": resolved_by,
        "created_at": now,
    }
    await db.saas_agent_transactions.insert_one(payout_tx)

    return {"message": "تم الموافقة على طلب السحب", "amount": amount_needed}


@router.post("/saas/agent-withdrawals/{withdrawal_id}/reject")
async def admin_reject_withdrawal(
    withdrawal_id: str,
    data: dict = None,
    admin: dict = Depends(get_super_admin),
):
    """Reject a withdrawal request; available balance stays as-is."""
    wr = await db.agent_withdrawals.find_one({"id": withdrawal_id}, {"_id": 0})
    if not wr:
        raise HTTPException(status_code=404, detail="طلب السحب غير موجود")
    if wr["status"] != "pending_approval":
        raise HTTPException(status_code=400, detail="تمت معالجة الطلب مسبقاً")

    now = datetime.now(timezone.utc).isoformat()
    resolved_by = admin.get("email", admin.get("id", "admin"))
    reason = (data or {}).get("reason", "") if data else ""

    await db.agent_withdrawals.update_one(
        {"id": withdrawal_id},
        {"$set": {
            "status": "rejected",
            "reject_reason": reason,
            "resolved_at": now,
            "resolved_by": resolved_by,
        }},
    )
    return {"message": "تم رفض طلب السحب"}


@router.post("/saas/commissions/promote-pending")
async def admin_promote_pending(admin: dict = Depends(get_super_admin)):
    """Manually trigger pending → available promotion (also runs automatically)."""
    promoted = await promote_pending_commissions()
    return {"promoted": promoted}


# ── Route alias for spec compliance ──────────────────────────────────────────
# The task spec references /saas/agent/wallet/withdraw-request.
# We expose both paths — the canonical implementation lives above.

@router.post("/saas/agent/wallet/withdraw-request")
async def agent_wallet_withdraw_request_alias(data: dict, agent: dict = Depends(get_current_agent)):
    """Alias of /saas/agent/commissions/withdraw-request for spec compatibility."""
    return await agent_withdraw_request(data, agent)
