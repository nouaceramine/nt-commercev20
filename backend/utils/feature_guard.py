"""
Feature guard dependency factory for per-tenant feature flag enforcement.

Usage:
    from utils.feature_guard import require_feature

    @router.get("/recharge", dependencies=[Depends(require_feature("recharge"))])
    async def get_recharge():
        ...

The guard reads the tenant's resolved feature set (plan defaults merged with
features_override) and raises HTTP 403 when the requested feature is disabled.
SUPER_ADMIN is always permitted regardless of tenant flags.
"""
from fastapi import Depends, HTTPException
from typing import Callable


def require_feature(feature_key: str) -> Callable:
    """
    Factory that returns a FastAPI dependency which enforces a feature flag.
    Accepts both flat boolean flags (features_override: {"recharge": false})
    and nested flags ({enabled: false, subFeatures: {...}}).
    """
    async def _check(current_user: dict = None) -> dict:
        if current_user is None:
            return {}

        # Super admin bypasses all feature checks
        if current_user.get("role") == "super_admin":
            return current_user

        tenant_id = current_user.get("tenant_id")
        if not tenant_id:
            return current_user  # non-tenant users are not feature-gated

        # Try using pre-resolved features already on the user object (main.py path)
        features = current_user.get("features")

        if features is None:
            # Modular route path: features not on user, fetch from DB
            from config.database import main_db
            tenant = await main_db.saas_tenants.find_one(
                {"id": tenant_id}, {"_id": 0, "features_override": 1, "plan_id": 1}
            )
            if tenant:
                plan = await main_db.saas_plans.find_one(
                    {"id": tenant.get("plan_id")}, {"_id": 0, "features": 1}
                )
                plan_features = plan.get("features", {}) if plan else {}
                features = {**plan_features, **tenant.get("features_override", {})}
            else:
                features = {}

        feature_val = features.get(feature_key)
        if feature_val is None:
            return current_user  # not set → enabled by default

        # Flat boolean flag
        if isinstance(feature_val, bool):
            if not feature_val:
                raise HTTPException(
                    status_code=403,
                    detail="Feature disabled for this tenant."
                )
            return current_user

        # Nested object: {enabled: bool, ...}
        if isinstance(feature_val, dict):
            if feature_val.get("enabled") is False:
                raise HTTPException(
                    status_code=403,
                    detail="Feature disabled for this tenant."
                )

        return current_user

    return _check


def make_require_feature(get_current_user: Callable) -> Callable:
    """
    Bound version of require_feature that uses a specific get_current_user
    dependency. Call this in module registration files that have access to
    the shared auth dependency.

    Usage in modules/*.py:
        require_feature = make_require_feature(ctx.get_current_user)
        app.include_router(router, prefix="/api",
                           dependencies=[Depends(require_feature("recharge"))])
    """
    def _factory(feature_key: str) -> Callable:
        async def _check(current_user: dict = Depends(get_current_user)) -> dict:
            return await _inner_check(feature_key, current_user)
        return _check

    return _factory


async def _inner_check(feature_key: str, current_user: dict) -> dict:
    """Shared implementation used by both factory variants."""
    if current_user.get("role") == "super_admin":
        return current_user

    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return current_user

    features = current_user.get("features")

    if features is None:
        from config.database import main_db
        tenant = await main_db.saas_tenants.find_one(
            {"id": tenant_id}, {"_id": 0, "features_override": 1, "plan_id": 1}
        )
        if tenant:
            plan = await main_db.saas_plans.find_one(
                {"id": tenant.get("plan_id")}, {"_id": 0, "features": 1}
            )
            plan_features = plan.get("features", {}) if plan else {}
            features = {**plan_features, **tenant.get("features_override", {})}
        else:
            features = {}

    feature_val = features.get(feature_key)
    if feature_val is None:
        return current_user

    if isinstance(feature_val, bool):
        if not feature_val:
            raise HTTPException(status_code=403, detail="Feature disabled for this tenant.")
        return current_user

    if isinstance(feature_val, dict):
        if feature_val.get("enabled") is False:
            raise HTTPException(status_code=403, detail="Feature disabled for this tenant.")

    return current_user
