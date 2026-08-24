"""E-Commerce Hub: per-status customer SMS (p241).

Tenant endpoints (require ecom feature):
  GET/PUT /ecom/sms/settings   — enable per status + edit templates + provider
  GET     /ecom/sms/status     — enabled flags + remaining SMS credits + price
  GET     /ecom/sms/logs       — send log
  POST    /ecom/sms/test       — send a test SMS (charges 1 credit like a real send)

Platform endpoints (super admin):
  POST /admin/sms/credits/grant — grant SMS credits to a tenant (PF ledger row)
  GET  /admin/sms/credits/{tenant_id}
  PUT  /admin/sms/price         — set platform price per SMS credit (DZD)
"""
from datetime import datetime, timezone
from typing import Optional
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from config.database import db, main_db
from utils.auth import require_tenant, get_tenant_admin, get_super_admin
from routes.ecom.constants import require_ecom_feature
from services.ecom.status_sms_service import get_settings, DEFAULT_TEMPLATES, render_template
from services.ecom.sms_gateway import get_sms_provider
from services.application.ecom_order_service import normalize_phone

logger = logging.getLogger(__name__)
router = APIRouter(tags=["E-Commerce Status SMS"])


class StatusSmsSettingsIn(BaseModel):
    enabled: bool = False
    sender_name: str = ""
    provider: Optional[dict] = None
    per_status: Optional[dict] = None  # {status: {enabled, template}}


class TestSmsIn(BaseModel):
    phone: str
    message: str = ""


class GrantIn(BaseModel):
    tenant_id: str
    credits: int
    note: str = ""


class PriceIn(BaseModel):
    price: float


def _tenant_id_of(user: dict) -> str:
    return user.get("tenant_id") or "platform"


@router.get("/ecom/sms/settings")
async def get_sms_settings(user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    return await get_settings(db)


@router.put("/ecom/sms/settings")
async def update_sms_settings(body: StatusSmsSettingsIn, user: dict = Depends(get_tenant_admin)):
    await require_ecom_feature(user)
    update = {
        "enabled": bool(body.enabled),
        "sender_name": (body.sender_name or "").strip()[:60],
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": user.get("id"),
    }
    if body.provider is not None:
        ptype = (body.provider.get("type") or "mock").strip().lower()
        if ptype not in ("mock", "http"):
            raise HTTPException(status_code=400, detail="مزوّد SMS غير مدعوم")
        update["provider"] = body.provider
    if body.per_status is not None:
        clean = {}
        for st, cfg in body.per_status.items():
            if st not in DEFAULT_TEMPLATES or not isinstance(cfg, dict):
                continue
            clean[st] = {
                "enabled": bool(cfg.get("enabled")),
                "template": (cfg.get("template") or DEFAULT_TEMPLATES[st])[:480],
            }
        update["per_status"] = clean
    await db.ecom_sms_settings.update_one({"id": "global"}, {"$set": update}, upsert=True)
    return await get_settings(db)


@router.get("/ecom/sms/status")
async def sms_overview(user: dict = Depends(require_tenant)):
    await require_ecom_feature(user)
    settings = await get_settings(db)
    tenant_id = _tenant_id_of(user)
    credits = 0
    if tenant_id != "platform":
        w = await main_db.wallets.find_one({"entity_id": tenant_id}, {"_id": 0, "sms_credits": 1})
        credits = int((w or {}).get("sms_credits") or 0)
    cfg = await main_db.platform_config.find_one({"id": "global"}, {"_id": 0, "sms_credit_price": 1})
    sent = await db.ecom_sms_logs.count_documents({"result": {"$in": ["sent", "mocked"]}})
    return {
        "enabled": settings["enabled"],
        "per_status": {k: v["enabled"] for k, v in settings["per_status"].items()},
        "provider": (settings.get("provider") or {}).get("type", "mock"),
        "credits": credits,
        "credit_price": float((cfg or {}).get("sms_credit_price") or 8.0),
        "sent_total": sent,
    }


@router.get("/ecom/sms/logs")
async def sms_logs(
    order_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    user: dict = Depends(require_tenant),
):
    await require_ecom_feature(user)
    q = {}
    if order_id:
        q["order_id"] = order_id
    rows = await db.ecom_sms_logs.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.ecom_sms_logs.count_documents(q)
    return {"items": rows, "total": total}


@router.post("/ecom/sms/test")
async def send_test_sms(body: TestSmsIn, user: dict = Depends(get_tenant_admin)):
    await require_ecom_feature(user)
    phone = normalize_phone(body.phone)
    if not phone:
        raise HTTPException(status_code=400, detail="رقم هاتف غير صالح")
    tenant_id = _tenant_id_of(user)

    # charge 1 credit like a real send (same atomic guard)
    if tenant_id != "platform":
        from pymongo import ReturnDocument
        w = await main_db.wallets.find_one_and_update(
            {"entity_id": tenant_id, "sms_credits": {"$gte": 1}},
            {"$inc": {"sms_credits": -1}},
            return_document=ReturnDocument.AFTER,
        )
        if not w:
            raise HTTPException(status_code=402, detail="رصيد SMS غير كافٍ — اشتروا رصيداً من المنصة")
        charged = 1
    else:
        charged = 0

    settings = await get_settings(db)
    provider = get_sms_provider(settings.get("provider"))
    message = (body.message or "").strip() or "رسالة تجريبية من نظامك — إعدادات SMS تعمل بنجاح ✅"
    res = await provider.send(phone, message)
    if not res.get("success") and charged:
        await main_db.wallets.update_one({"entity_id": tenant_id}, {"$inc": {"sms_credits": 1}})
        charged = 0
    await db.ecom_sms_logs.insert_one({
        "id": str(uuid.uuid4()),
        "order_id": None,
        "order_code": None,
        "status": "test",
        "phone": phone,
        "message": message,
        "result": ("mocked" if res.get("simulated") else "sent") if res.get("success") else "failed",
        "provider": res.get("provider"),
        "error": res.get("error"),
        "credit_charged": charged,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user.get("id"),
    })
    return {**res, "credit_charged": charged, "phone": phone}


# ── platform (super admin) ──────────────────────────────────────────────────

@router.post("/admin/sms/credits/grant")
async def grant_sms_credits(body: GrantIn, _admin: dict = Depends(get_super_admin)):
    if body.credits <= 0 or body.credits > 1_000_000:
        raise HTTPException(status_code=400, detail="عدد الرصيد غير صالح")
    tenant = await main_db.saas_tenants.find_one({"id": body.tenant_id}, {"_id": 0, "id": 1, "name": 1})
    if not tenant:
        raise HTTPException(status_code=404, detail="المستأجر غير موجود")
    from pymongo import ReturnDocument
    w = await main_db.wallets.find_one_and_update(
        {"entity_id": body.tenant_id},
        {"$inc": {"sms_credits": body.credits},
         "$setOnInsert": {"id": str(uuid.uuid4()), "entity_type": "tenant", "balance": 0.0, "credit_debt": 0.0}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    from services.code_generator import generate_code
    code = await generate_code(main_db, "wallet_transactions", "PF", 5, with_year=True)
    await main_db.wallet_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "code": code,
        "wallet_id": w["id"],
        "entity_id": body.tenant_id,
        "transaction_type": "sms_credits_grant",
        "amount": body.credits,
        "note": body.note or f"منح {body.credits} رصيد SMS",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": _admin.get("id"),
    })

    # p295: platform margin on sold SMS credits = (price - platform cost) x credits.
    try:
        pc = await main_db.platform_config.find_one({"id": "global"}, {"_id": 0}) or {}
        price = float(pc.get("sms_credit_price") or 0)
        pcost = float(pc.get("sms_platform_cost") or 0)
        if price > 0 and price > pcost:
            margin_pct = round((price - pcost) / price * 100, 2)
            from services.commission_engine import record_platform_commission
            await record_platform_commission(
                main_db,
                service_type="sms", tenant_id=body.tenant_id,
                reference_type="sms_credits_grant", reference_id=code,
                gross_amount=round(body.credits * price, 2),
                tenant_commission_pct=0.0,
                platform_commission_pct=margin_pct,
                operator="sms",
                meta={"credits": body.credits, "credit_price": price, "platform_cost": pcost},
            )
    except Exception:
        logger.exception("p295: sms commission record failed (%s)", body.tenant_id)
    return {"ok": True, "tenant_id": body.tenant_id, "sms_credits": int(w.get("sms_credits") or 0), "code": code}


@router.get("/admin/sms/credits/{tenant_id}")
async def get_tenant_sms_credits(tenant_id: str, _admin: dict = Depends(get_super_admin)):
    w = await main_db.wallets.find_one({"entity_id": tenant_id}, {"_id": 0, "sms_credits": 1})
    grants = await main_db.wallet_transactions.find(
        {"entity_id": tenant_id, "transaction_type": "sms_credits_grant"}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return {"tenant_id": tenant_id, "sms_credits": int((w or {}).get("sms_credits") or 0), "grants": grants}


@router.put("/admin/sms/price")
async def set_sms_price(body: PriceIn, _admin: dict = Depends(get_super_admin)):
    if body.price < 0 or body.price > 1000:
        raise HTTPException(status_code=400, detail="سعر غير صالح")
    await main_db.platform_config.update_one(
        {"id": "global"}, {"$set": {"sms_credit_price": float(body.price)}}, upsert=True)
    return {"ok": True, "sms_credit_price": body.price}
