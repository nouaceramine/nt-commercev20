"""Business Profiles Routes (p183)

Public catalogue of business activity types + super-admin endpoint to apply
a profile to an existing tenant (sets business_type and merges the profile's
feature map into features_override — the tenant's menus/routes adapt on the
user's next login).
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from config.database import db
from core.business_profiles import list_profiles, get_profile, apply_business_profile
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
