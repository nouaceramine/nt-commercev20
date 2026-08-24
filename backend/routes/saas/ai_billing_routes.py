"""AI usage billing (p224) — super-admin monthly invoicing + tenant self-view.

Flow (report §3.4):
  1. usage_records (written by services/ai/usage_meter.py) track every LLM call:
     {tenant_id, month, model, tokens_in, tokens_out, cost_usd}.
  2. The owner reviews /saas/ai-usage/summary, then runs
     POST /saas/ai-billing/run {month} → one invoice per tenant per month:
     billed_usd = cost_usd × (1 + margin_pct/100), amount_dzd = billed_usd × rate,
     deducted from the tenant's prepaid wallet (ai_billing txn type).
  3. Insufficient wallet balance → invoice status "failed" (retriable on the
     next run); "billed" invoices are skipped — idempotent per (tenant, month).
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import logging
import re
import uuid

from config.database import main_db
from .helpers import get_super_admin
from services.ai.usage_meter import get_billing_config, DEFAULT_BILLING_CONFIG, month_key

logger = logging.getLogger(__name__)

router = APIRouter(tags=["AI Usage Billing (p224)"])

MONTH_RE = re.compile(r"^\d{4}-\d{2}$")


class BillingConfigIn(BaseModel):
    margin_pct: float
    usd_dzd_rate: float
    model_prices: Optional[dict] = None


class CapIn(BaseModel):
    tenant_id: str
    monthly_cap_usd: float  # 0 = no cap


class RunIn(BaseModel):
    month: str  # YYYY-MM


async def _usage_by_tenant(month: str) -> list:
    return await main_db.usage_records.aggregate([
        {"$match": {"month": month, "tenant_id": {"$nin": ["platform", "-", ""]}}},
        {"$group": {
            "_id": "$tenant_id",
            "tokens_in": {"$sum": "$tokens_in"},
            "tokens_out": {"$sum": "$tokens_out"},
            "cost_usd": {"$sum": "$cost_usd"},
            "calls": {"$sum": 1},
        }},
    ]).to_list(1000)


async def _tenant_names(tids: list) -> dict:
    names = {}
    if tids:
        async for t in main_db.saas_tenants.find(
            {"id": {"$in": tids}},
            {"_id": 0, "id": 1, "name": 1, "short_id": 1, "ai_monthly_cap_usd": 1},
        ):
            names[t["id"]] = t
    return names


@router.get("/saas/ai-billing/config")
async def get_config(admin: dict = Depends(get_super_admin)):
    return await get_billing_config(main_db)


@router.put("/saas/ai-billing/config")
async def put_config(data: BillingConfigIn, admin: dict = Depends(get_super_admin)):
    if data.margin_pct < 0 or data.margin_pct > 500:
        raise HTTPException(status_code=400, detail="هامش غير صالح")
    if data.usd_dzd_rate <= 0:
        raise HTTPException(status_code=400, detail="سعر الصرف غير صالح")
    doc = {
        "id": "global",
        "margin_pct": float(data.margin_pct),
        "usd_dzd_rate": float(data.usd_dzd_rate),
        "model_prices": data.model_prices or {},
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": admin.get("email", ""),
    }
    await main_db.ai_billing_config.update_one({"id": "global"}, {"$set": doc}, upsert=True)
    return doc


@router.put("/saas/ai-billing/cap")
async def set_cap(data: CapIn, admin: dict = Depends(get_super_admin)):
    if data.monthly_cap_usd < 0:
        raise HTTPException(status_code=400, detail="السقف لا يمكن أن يكون سالباً")
    res = await main_db.saas_tenants.update_one(
        {"id": data.tenant_id},
        {"$set": {"ai_monthly_cap_usd": float(data.monthly_cap_usd)}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="المستأجر غير موجود")
    return {"ok": True, "tenant_id": data.tenant_id, "monthly_cap_usd": data.monthly_cap_usd}


@router.get("/saas/ai-usage/summary")
async def usage_summary(month: Optional[str] = None, admin: dict = Depends(get_super_admin)):
    month = month or month_key()
    if not MONTH_RE.match(month):
        raise HTTPException(status_code=400, detail="صيغة الشهر: YYYY-MM")
    cfg = await get_billing_config(main_db)
    rows = await _usage_by_tenant(month)
    names = await _tenant_names([r["_id"] for r in rows])
    invoiced = {
        d["tenant_id"]: d["status"]
        async for d in main_db.ai_invoices.find({"month": month}, {"_id": 0, "tenant_id": 1, "status": 1})
    }
    items = []
    for r in rows:
        tid = r["_id"]
        billed_usd = round(r["cost_usd"] * (1 + cfg["margin_pct"] / 100), 4)
        t = names.get(tid, {})
        items.append({
            "tenant_id": tid,
            "tenant_name": t.get("name", ""),
            "short_id": t.get("short_id", ""),
            "calls": r["calls"],
            "tokens_in": r["tokens_in"],
            "tokens_out": r["tokens_out"],
            "cost_usd": round(r["cost_usd"], 4),
            "billed_usd": billed_usd,
            "amount_dzd": round(billed_usd * cfg["usd_dzd_rate"], 2),
            "monthly_cap_usd": t.get("ai_monthly_cap_usd", 0),
            "invoice_status": invoiced.get(tid),
        })
    items.sort(key=lambda x: -x["cost_usd"])
    return {"month": month, "config": cfg, "tenants": items}




async def _record_ai_commission(tid, month, cost_usd, cfg, amount_dzd):
    """p295: platform margin on a billed AI invoice = markup over upstream cost.
    Idempotent per (ai_invoice, tenant:month) via the engine's unique reference."""
    try:
        if amount_dzd <= 0:
            return
        from services.commission_engine import record_platform_commission
        gross_dzd = round(float(cost_usd) * float(cfg["usd_dzd_rate"]), 2)
        await record_platform_commission(
            main_db,
            service_type="ai", tenant_id=tid,
            reference_type="ai_invoice", reference_id=f"{tid}:{month}",
            gross_amount=gross_dzd,
            tenant_commission_pct=0.0,
            platform_commission_pct=float(cfg["margin_pct"]),
            operator="openai",
            meta={"month": month, "cost_usd": round(float(cost_usd), 4)},
        )
    except Exception:
        logger.exception("p295: ai commission record failed (%s/%s)", tid, month)

@router.post("/saas/ai-billing/run")
async def run_billing(data: RunIn, admin: dict = Depends(get_super_admin)):
    if not MONTH_RE.match(data.month):
        raise HTTPException(status_code=400, detail="صيغة الشهر: YYYY-MM")
    cfg = await get_billing_config(main_db)
    rows = await _usage_by_tenant(data.month)
    now = datetime.now(timezone.utc).isoformat()
    results = {"billed": [], "failed": [], "skipped": []}
    for r in rows:
        tid = r["_id"]
        billed_usd = round(r["cost_usd"] * (1 + cfg["margin_pct"] / 100), 4)
        amount_dzd = round(billed_usd * cfg["usd_dzd_rate"], 2)
        existing = await main_db.ai_invoices.find_one(
            {"tenant_id": tid, "month": data.month, "status": "billed"}, {"_id": 0})
        if existing:
            results["skipped"].append({"tenant_id": tid, "reason": "invoiced"})
            # p295: backfill commission for invoices billed before the hook existed
            await _record_ai_commission(tid, data.month, r["cost_usd"], cfg, amount_dzd)
            continue
        count = await main_db.ai_invoices.count_documents({})
        inv = {
            "id": str(uuid.uuid4()),
            "code": f"AIB-{data.month.replace('-', '')}-{str(count + 1).zfill(4)}",
            "tenant_id": tid,
            "month": data.month,
            "calls": r["calls"],
            "tokens_in": r["tokens_in"],
            "tokens_out": r["tokens_out"],
            "cost_usd": round(r["cost_usd"], 4),
            "margin_pct": cfg["margin_pct"],
            "billed_usd": billed_usd,
            "usd_dzd_rate": cfg["usd_dzd_rate"],
            "amount_dzd": amount_dzd,
            "status": "pending",
            "error": "",
            "wallet_txn_id": "",
            "created_at": now,
            "billed_at": None,
            "created_by": admin.get("email", ""),
        }
        if amount_dzd <= 0:
            inv["status"] = "billed"
            inv["billed_at"] = now
            await main_db.ai_invoices.update_one(
                {"tenant_id": tid, "month": data.month}, {"$set": inv}, upsert=True)
            results["billed"].append({"tenant_id": tid, "amount_dzd": 0, "code": inv["code"]})
            continue
        try:
            from services.wallet_service import debit_wallet
            txn_id = str(uuid.uuid4())
            await debit_wallet(
                main_db, tid, amount_dzd, "ai_billing", txn_id,
                f"فاتورة استهلاك الذكاء الاصطناعي {data.month} ({inv['code']})",
                admin.get("email", "system"),
            )
            inv["status"] = "billed"
            inv["billed_at"] = now
            inv["wallet_txn_id"] = txn_id
            # p295: platform margin ledger
            await _record_ai_commission(tid, data.month, r["cost_usd"], cfg, amount_dzd)
        except Exception as exc:
            inv["status"] = "failed"
            inv["error"] = str(getattr(exc, "detail", exc))[:300]
        await main_db.ai_invoices.update_one(
            {"tenant_id": tid, "month": data.month}, {"$set": inv}, upsert=True)
        results["billed" if inv["status"] == "billed" else "failed"].append(
            {"tenant_id": tid, "amount_dzd": amount_dzd, "code": inv["code"], "error": inv["error"]})
    return {"month": data.month, **results}


@router.get("/saas/ai-billing/invoices")
async def list_invoices(
    tenant_id: Optional[str] = None,
    month: Optional[str] = None,
    admin: dict = Depends(get_super_admin),
):
    q = {}
    if tenant_id:
        q["tenant_id"] = tenant_id
    if month:
        q["month"] = month
    invoices = await main_db.ai_invoices.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    names = await _tenant_names(list({i["tenant_id"] for i in invoices}))
    for i in invoices:
        t = names.get(i["tenant_id"], {})
        i["tenant_name"] = t.get("name", "")
        i["short_id"] = t.get("short_id", "")
    return {"total": len(invoices), "invoices": invoices}
