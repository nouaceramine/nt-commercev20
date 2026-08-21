"""Business Profiles Routes (p183)

Public catalogue of business activity types + super-admin endpoint to apply
a profile to an existing tenant (sets business_type and merges the profile's
feature map into features_override — the tenant's menus/routes adapt on the
user's next login).
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from config.database import db
from core.business_profiles import (
    list_profiles, get_profile, apply_business_profile, profile_features, KNOWN_FEATURE_KEYS,
)
from .helpers import get_super_admin

router = APIRouter(tags=["Business Profiles"])


@router.get("/saas/business-profiles")
async def get_business_profiles():
    """Public — powers the registration page & admin selects."""
    return {"profiles": list_profiles()}


@router.get("/saas/tenants/{tenant_id}/business-profile")
async def get_tenant_business_profile(tenant_id: str, _admin: dict = Depends(get_super_admin)):
    tenant = await db.saas_tenants.find_one(
        {"id": tenant_id}, {"_id": 0, "business_type": 1, "features_override": 1}
    )
    if not tenant:
        raise HTTPException(status_code=404, detail="المشترك غير موجود")
    profile = get_profile(tenant.get("business_type") or "retail")
    return {
        "business_type": tenant.get("business_type") or "retail",
        "profile": profile,
        "features_override": tenant.get("features_override") or {},
    }


class BusinessProfileApply(BaseModel):
    business_type: str


@router.post("/saas/tenants/{tenant_id}/business-profile")
async def apply_tenant_business_profile(
    tenant_id: str, body: BusinessProfileApply, _admin: dict = Depends(get_super_admin)
):
    try:
        result = await apply_business_profile(db, tenant_id, body.business_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError:
        raise HTTPException(status_code=404, detail="المشترك غير موجود")
    return result


@router.get("/saas/business-profiles/audit")
async def audit_business_profiles(_admin: dict = Depends(get_super_admin)):
    """p220 — تحقق أن مزايا كل مشترك تطابق نشاطه التجاري.

    لكل مستأجر نشط: نوع النشاط، مفاتيح المصفوفة التي خُولفت (drift)،
    مفاتيح يدوية إضافية، مفاتيح غير معروفة (لم تعد موجودة في القائمة).
    """
    tenants = await db.saas_tenants.find(
        {"is_active": {"$ne": False}},
        {"_id": 0, "id": 1, "name": 1, "company_name": 1, "business_type": 1, "features_override": 1},
    ).to_list(500)
    items = []
    counts = {"ok": 0, "drifted": 0, "missing_type": 0, "unknown_keys": 0}
    for t in tenants:
        btype = t.get("business_type")
        missing_type = not btype
        effective_type = btype or "retail"
        profile_feats = profile_features(effective_type)
        override = dict(t.get("features_override") or {})
        drift = {k: {"profile": v, "current": override[k]}
                 for k, v in profile_feats.items() if k in override and override[k] != v}
        missing_profile_keys = [k for k, v in profile_feats.items() if k not in override]
        manual = {k: v for k, v in override.items() if k not in profile_feats and k in KNOWN_FEATURE_KEYS}
        unknown = [k for k in override if k not in KNOWN_FEATURE_KEYS]
        status = "ok"
        if missing_type:
            status = "missing_type"
            counts["missing_type"] += 1
        elif drift:
            status = "drifted"
            counts["drifted"] += 1
        else:
            counts["ok"] += 1
        if unknown:
            counts["unknown_keys"] += 1
        items.append({
            "tenant_id": t["id"],
            "name": t.get("company_name") or t.get("name", ""),
            "business_type": btype,
            "effective_type": effective_type,
            "status": status,
            "drift": drift,
            "missing_profile_keys": missing_profile_keys,
            "manual_overrides": manual,
            "unknown_keys": unknown,
        })
    return {"total": len(items), "counts": counts, "items": items}
