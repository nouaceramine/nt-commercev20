"""Per-subscriber price-margin rules (p223) — tenant CRUD + super-admin overview.

Tenants define one rule per service category; the pricing engine
(services/pricing_engine.py) turns a mediated-service cost into the
customer-facing sale price. See the report §3.3 (هوامش أسعار لكل مشترك).
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional
import logging
import uuid

from services.pricing_engine import (
    KNOWN_SERVICE_CATEGORIES, CATEGORY_RE, quote_sale_price, now_iso,
)

logger = logging.getLogger(__name__)


class MarginRuleIn(BaseModel):
    service_category: str
    margin_type: str  # percent | fixed
    value: float
    active: bool = True


def _validate_rule(data: MarginRuleIn):
    cat = (data.service_category or "").strip().lower()
    if not CATEGORY_RE.match(cat):
        raise HTTPException(status_code=400, detail="فئة الخدمة غير صالحة")
    if data.margin_type not in ("percent", "fixed"):
        raise HTTPException(status_code=400, detail="نوع الهامش يجب أن يكون percent أو fixed")
    if data.value is None or data.value <= 0:
        raise HTTPException(status_code=400, detail="قيمة الهامش يجب أن تكون أكبر من صفر")
    if data.margin_type == "percent" and data.value > 100:
        raise HTTPException(status_code=400, detail="نسبة الهامش لا يمكن أن تتجاوز 100%")
    if data.margin_type == "fixed" and data.value > 1_000_000:
        raise HTTPException(status_code=400, detail="قيمة الهامش الثابتة كبيرة جداً")
    return cat


def create_margin_rules_routes(main_db, get_tenant_admin, get_super_admin):
    router = APIRouter(tags=["Margin Rules (p223)"])

    # ── Tenant admin: own rules ─────────────────────────────────────────────

    @router.get("/margin-rules")
    async def list_my_rules(user: dict = Depends(get_tenant_admin)):
        tid = user.get("tenant_id") or user.get("id")
        rules = await main_db.margin_rules.find({"tenant_id": tid}, {"_id": 0}).sort("service_category", 1).to_list(200)
        return {"rules": rules, "known_categories": KNOWN_SERVICE_CATEGORIES}

    @router.post("/margin-rules")
    async def create_rule(data: MarginRuleIn, user: dict = Depends(get_tenant_admin)):
        tid = user.get("tenant_id") or user.get("id")
        cat = _validate_rule(data)
        existing = await main_db.margin_rules.find_one({"tenant_id": tid, "service_category": cat})
        if existing:
            raise HTTPException(status_code=409, detail="توجد قاعدة لهذه الفئة — عدّل القاعدة الموجودة")
        now = now_iso()
        doc = {
            "id": str(uuid.uuid4()),
            "tenant_id": tid,
            "service_category": cat,
            "margin_type": data.margin_type,
            "value": round(float(data.value), 4),
            "active": bool(data.active),
            "created_at": now,
            "updated_at": now,
            "created_by": user.get("name", ""),
        }
        await main_db.margin_rules.insert_one(dict(doc))
        logger.info("margin rule created: tenant=%s cat=%s %s=%s", tid, cat, data.margin_type, data.value)
        return doc

    @router.put("/margin-rules/{rule_id}")
    async def update_rule(rule_id: str, data: MarginRuleIn, user: dict = Depends(get_tenant_admin)):
        tid = user.get("tenant_id") or user.get("id")
        cat = _validate_rule(data)
        rule = await main_db.margin_rules.find_one({"id": rule_id, "tenant_id": tid})
        if not rule:
            raise HTTPException(status_code=404, detail="القاعدة غير موجودة")
        clash = await main_db.margin_rules.find_one(
            {"tenant_id": tid, "service_category": cat, "id": {"$ne": rule_id}})
        if clash:
            raise HTTPException(status_code=409, detail="توجد قاعدة أخرى لهذه الفئة")
        await main_db.margin_rules.update_one(
            {"id": rule_id},
            {"$set": {
                "service_category": cat,
                "margin_type": data.margin_type,
                "value": round(float(data.value), 4),
                "active": bool(data.active),
                "updated_at": now_iso(),
            }},
        )
        return await main_db.margin_rules.find_one({"id": rule_id}, {"_id": 0})

    @router.delete("/margin-rules/{rule_id}")
    async def delete_rule(rule_id: str, user: dict = Depends(get_tenant_admin)):
        tid = user.get("tenant_id") or user.get("id")
        res = await main_db.margin_rules.delete_one({"id": rule_id, "tenant_id": tid})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="القاعدة غير موجودة")
        return {"ok": True, "deleted": rule_id}

    @router.get("/margin-rules/quote")
    async def quote(
        service_category: str = Query(...),
        cost: float = Query(..., gt=0),
        user: dict = Depends(get_tenant_admin),
    ):
        """Dry-run: what would the customer pay for this cost basis?"""
        tid = user.get("tenant_id") or user.get("id")
        return await quote_sale_price(main_db, tid, service_category.strip().lower(), cost)

    # ── Super admin: platform-wide overview ─────────────────────────────────

    @router.get("/margin-rules/all")
    async def list_all_rules(
        tenant_id: Optional[str] = None,
        admin: dict = Depends(get_super_admin),
    ):
        q = {"tenant_id": tenant_id} if tenant_id else {}
        rules = await main_db.margin_rules.find(q, {"_id": 0}).sort("tenant_id", 1).to_list(1000)
        # attach tenant names for readability
        tids = list({r["tenant_id"] for r in rules})
        names = {}
        if tids:
            async for t in main_db.saas_tenants.find({"id": {"$in": tids}}, {"_id": 0, "id": 1, "name": 1, "short_id": 1}):
                names[t["id"]] = {"name": t.get("name", ""), "short_id": t.get("short_id", "")}
        for r in rules:
            r["tenant"] = names.get(r["tenant_id"], {})
        return {"total": len(rules), "rules": rules}

    return router
