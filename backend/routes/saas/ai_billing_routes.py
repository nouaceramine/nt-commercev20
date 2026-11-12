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
from datetime import datetime, timedelta, timezone
import logging
import math
import re
import uuid

from pymongo.errors import DuplicateKeyError

from config.database import main_db
from .helpers import get_super_admin
from services.ai.usage_meter import get_billing_config, month_key
from services.code_generator import generate_code

logger = logging.getLogger(__name__)

router = APIRouter(tags=["AI Usage Billing (p224)"])

# p497a: real calendar months only (2026-13 must not "run")
MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


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
    return await main_db.usage_records.aggregate(
        [
            {"$match": {"month": month, "tenant_id": {"$nin": ["platform", "-", ""]}}},
            {
                "$group": {
                    "_id": "$tenant_id",
                    "tokens_in": {"$sum": "$tokens_in"},
                    "tokens_out": {"$sum": "$tokens_out"},
                    "cost_usd": {"$sum": "$cost_usd"},
                    "calls": {"$sum": 1},
                }
            },
        ]
    ).to_list(1000)


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
    # p497a: NaN slips past every ordered comparison — guard finiteness explicitly
    if not math.isfinite(data.margin_pct) or data.margin_pct < 0 or data.margin_pct > 500:
        raise HTTPException(status_code=400, detail="هامش غير صالح")
    if not math.isfinite(data.usd_dzd_rate) or data.usd_dzd_rate <= 0:
        raise HTTPException(status_code=400, detail="سعر الصرف غير صالح")
    doc = {
        "id": "global",
        "margin_pct": float(data.margin_pct),
        "usd_dzd_rate": float(data.usd_dzd_rate),
        "model_prices": data.model_prices or {},
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": admin.get("email", ""),
    }
    await main_db.ai_billing_config.update_one(
        {"id": "global"}, {"$set": doc}, upsert=True
    )
    return doc


@router.put("/saas/ai-billing/cap")
async def set_cap(data: CapIn, admin: dict = Depends(get_super_admin)):
    if not math.isfinite(data.monthly_cap_usd) or data.monthly_cap_usd < 0:
        raise HTTPException(status_code=400, detail="السقف لا يمكن أن يكون سالباً")
    res = await main_db.saas_tenants.update_one(
        {"id": data.tenant_id},
        {"$set": {"ai_monthly_cap_usd": float(data.monthly_cap_usd)}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="المستأجر غير موجود")
    return {
        "ok": True,
        "tenant_id": data.tenant_id,
        "monthly_cap_usd": data.monthly_cap_usd,
    }


@router.get("/saas/ai-usage/summary")
async def usage_summary(
    month: Optional[str] = None, admin: dict = Depends(get_super_admin)
):
    month = month or month_key()
    if not MONTH_RE.match(month):
        raise HTTPException(status_code=400, detail="صيغة الشهر: YYYY-MM")
    cfg = await get_billing_config(main_db)
    rows = await _usage_by_tenant(month)
    names = await _tenant_names([r["_id"] for r in rows])
    invoiced = {
        d["tenant_id"]: d["status"]
        async for d in main_db.ai_invoices.find(
            {"month": month}, {"_id": 0, "tenant_id": 1, "status": 1}
        )
    }
    items = []
    for r in rows:
        tid = r["_id"]
        billed_usd = round(r["cost_usd"] * (1 + cfg["margin_pct"] / 100), 4)
        t = names.get(tid, {})
        items.append(
            {
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
            }
        )
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
            service_type="ai",
            tenant_id=tid,
            reference_type="ai_invoice",
            reference_id=f"{tid}:{month}",
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
            {"tenant_id": tid, "month": data.month}, {"_id": 0}
        )
        if existing and existing.get("status") == "billed":
            results["skipped"].append({"tenant_id": tid, "reason": "invoiced"})
            # p295: backfill commission for invoices billed before the hook existed
            await _record_ai_commission(tid, data.month, r["cost_usd"], cfg, amount_dzd)
            continue
        # p497a: atomic per-(tenant, month) claim — the ai_invoice_unique index turns
        # the loser's insert into DuplicateKeyError, so concurrent runs can never
        # double-debit the wallet. Code comes from the atomic counter (no dupes).
        code = await generate_code(main_db, "ai_invoices",
                                   f"AIB-{data.month.replace('-', '')}-", 4, False)
        inv = {
            "id": str(uuid.uuid4()),
            "code": code,
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
            "status": "processing",
            "error": "",
            "wallet_txn_id": "",
            "created_at": now,
            "claimed_at": now,
            "billed_at": None,
            "created_by": admin.get("email", ""),
        }
        claimed = False
        if existing is None:
            try:
                await main_db.ai_invoices.insert_one(dict(inv))
                claimed = True
            except DuplicateKeyError:
                claimed = False  # a concurrent runner holds this (tenant, month)
        else:
            # Retriable paths: failed/pending always; "processing" only when the
            # holder crashed — steal the claim after a 60s lock timeout so a slow
            # live winner is never double-debited (p495d lock-steal pattern).
            st = existing.get("status")
            stealable = False
            if st in ("failed", "pending"):
                stealable = True
            elif st == "processing":
                try:
                    claimed_at = datetime.fromisoformat(
                        (existing.get("claimed_at") or existing.get("created_at") or ""
                         ).replace("Z", "+00:00"))
                    stealable = (datetime.now(timezone.utc) - claimed_at) > timedelta(seconds=60)
                except Exception:
                    stealable = False
            if stealable:
                res = await main_db.ai_invoices.update_one(
                    {"tenant_id": tid, "month": data.month, "status": st},
                    {"$set": {**inv, "id": existing.get("id", inv["id"]),
                              "created_at": existing.get("created_at", now),
                              "claimed_at": now}},
                )
                claimed = res.modified_count == 1
        if not claimed:
            results["skipped"].append({"tenant_id": tid, "reason": "in_progress"})
            continue
        try:
            if amount_dzd <= 0:
                await main_db.ai_invoices.update_one(
                    {"tenant_id": tid, "month": data.month},
                    {"$set": {"status": "billed", "billed_at": now}},
                )
                results["billed"].append(
                    {"tenant_id": tid, "amount_dzd": 0, "code": code}
                )
                continue
            from services.wallet_service import debit_wallet

            txn_id = str(uuid.uuid4())
            await debit_wallet(
                main_db,
                tid,
                amount_dzd,
                "ai_billing",
                txn_id,
                f"فاتورة استهلاك الذكاء الاصطناعي {data.month} ({code})",
                admin.get("email", "system"),
            )
            await main_db.ai_invoices.update_one(
                {"tenant_id": tid, "month": data.month},
                {"$set": {"status": "billed", "billed_at": now,
                          "wallet_txn_id": txn_id, "error": ""}},
            )
            # p295: platform margin ledger
            await _record_ai_commission(tid, data.month, r["cost_usd"], cfg, amount_dzd)
            results["billed"].append(
                {"tenant_id": tid, "amount_dzd": amount_dzd, "code": code, "error": ""}
            )
        except Exception as exc:
            err = str(getattr(exc, "detail", exc))[:300]
            await main_db.ai_invoices.update_one(
                {"tenant_id": tid, "month": data.month},
                {"$set": {"status": "failed", "error": err}},
            )
            results["failed"].append(
                {"tenant_id": tid, "amount_dzd": amount_dzd, "code": code, "error": err}
            )
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
    invoices = (
        await main_db.ai_invoices.find(q, {"_id": 0})
        .sort("created_at", -1)
        .to_list(500)
    )
    names = await _tenant_names(list({i["tenant_id"] for i in invoices}))
    for i in invoices:
        t = names.get(i["tenant_id"], {})
        i["tenant_name"] = t.get("name", "")
        i["short_id"] = t.get("short_id", "")
    return {"total": len(invoices), "invoices": invoices}


# ── p296: platform AI key settings (super admin UI → DB, env fallback) ──────


def _mask_key(k: str) -> str:
    return (k[:6] + "..." + k[-4:]) if k and len(k) > 12 else ("***" if k else "")


@router.get("/saas/ai-settings")
async def get_ai_settings(admin: dict = Depends(get_super_admin)):
    """Effective AI configuration + source (db/env) without exposing the key."""
    from services.ai.platform_ai_settings import refresh_effective

    doc = (
        await main_db.ai_platform_settings.find_one({"id": "global"}, {"_id": 0}) or {}
    )
    eff = await refresh_effective(main_db, force=True)
    has_db_key = bool(doc.get("api_key"))
    masked = ""
    if has_db_key:
        from services.crypto_fields import decrypt_field

        try:
            masked = _mask_key(decrypt_field(doc["api_key"]))
        except Exception:
            masked = "***"
    return {
        "api_key_set": bool(eff["api_key"]),
        "api_key_masked": masked,
        "api_key_source": "db" if has_db_key else ("env" if eff["api_key"] else "none"),
        "base_url": eff["base_url"] or "",
        "model": eff["model"],
        "base_url_source": "db" if doc.get("base_url") else "env",
        "updated_at": doc.get("updated_at"),
        "updated_by": doc.get("updated_by"),
    }


@router.put("/saas/ai-settings")
async def put_ai_settings(data: dict, admin: dict = Depends(get_super_admin)):
    """Save AI key/base_url/model to the DB (encrypted). A masked key echo
    (contains ...) keeps the stored key; clear_key=true removes the DB key so
    the platform falls back to the server env var."""
    from services.ai.platform_ai_settings import invalidate_cache

    now = datetime.now(timezone.utc).isoformat()
    upd = {"updated_at": now, "updated_by": admin.get("email", "")}
    unset = {}
    if data.get("clear_key"):
        unset["api_key"] = ""
    else:
        key = (data.get("api_key") or "").strip()
        if key and "..." not in key:
            from services.crypto_fields import encrypt_field

            upd["api_key"] = encrypt_field(key)
    for f in ("base_url", "model"):
        if f in data:
            v = (data.get(f) or "").strip()
            if v:
                upd[f] = v
            else:
                unset[f] = ""
    update = {}
    if upd:
        update["$set"] = {"id": "global", **upd}
    if unset:
        update["$unset"] = unset
    if update:
        await main_db.ai_platform_settings.update_one(
            {"id": "global"}, update, upsert=True
        )
    invalidate_cache()
    return await get_ai_settings(admin)


@router.post("/saas/ai-settings/test")
async def test_ai_settings(admin: dict = Depends(get_super_admin)):
    """Live-check the effective AI config with a minimal completion call."""
    from services.ai.platform_ai_settings import refresh_effective, current

    await refresh_effective(main_db, force=True)
    eff = current()
    if not eff["api_key"]:
        return {
            "ok": False,
            "error": "لا يوجد مفتاح مضبوط (لا في الواجهة ولا في السيرفر)",
        }
    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=eff["api_key"], base_url=eff["base_url"])
        msgs = [{"role": "user", "content": "Reply with one word: works"}]
        try:
            resp = await client.chat.completions.create(
                model=eff["model"], messages=msgs, max_tokens=10
            )
        except Exception as e1:
            if "max_tokens" in str(e1):  # gpt-5 family requires max_completion_tokens
                resp = await client.chat.completions.create(
                    model=eff["model"], messages=msgs, max_completion_tokens=16
                )
            else:
                raise
        return {
            "ok": True,
            "model": eff["model"],
            "reply": (resp.choices[0].message.content or "").strip()[:60],
        }
    except Exception as e:
        return {"ok": False, "error": str(e)[:300]}
