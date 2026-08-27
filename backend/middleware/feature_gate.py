"""
p341: Feature-gate middleware — real server-side enforcement of per-tenant
feature toggles.

For every request:
1. Find the owning component via the motherboard registry (longest-prefix).
2. Component without a gate → pass (core platform plumbing is always on).
3. No/invalid/non-tenant Bearer token → pass (the auth layer returns 401 when
   needed; public endpoints, super-admins and agents are never gated here).
4. Tenant token → resolve effective features (plan ⊕ overrides, 60s cache) and
   return 403 when the owning module's gate is off. Unknown gates default ON so
   nothing breaks for existing subscribers; opt-in modules default OFF.
"""
import jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from config.database import main_db
from core import registry
from core.business_profiles import get_effective_features, gate_default
from utils.jwt_config import SECRET_KEY, ALGORITHM


class FeatureGateMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        try:
            comp = registry.find_by_path(request.url.path)
        except Exception:
            comp = None
        if comp is None or not comp.gate:
            return await call_next(request)

        auth = request.headers.get("authorization") or ""
        if not auth.lower().startswith("bearer "):
            return await call_next(request)
        try:
            payload = jwt.decode(auth[7:].strip(), SECRET_KEY, algorithms=[ALGORITHM])
        except Exception:
            return await call_next(request)
        if payload.get("type") != "tenant" or not payload.get("tenant_id"):
            return await call_next(request)

        try:
            feats = await get_effective_features(main_db, payload["tenant_id"])
        except Exception:
            return await call_next(request)  # fail-open on resolver errors

        enabled = feats.get(comp.gate)
        if enabled is None:
            enabled = gate_default(comp.gate)
        if isinstance(enabled, dict):
            enabled = enabled.get("enabled", True)
        if not enabled:
            return JSONResponse(
                status_code=403,
                content={
                    "detail": "feature_disabled",
                    "feature": comp.gate,
                    "module": comp.key,
                    "module_name_ar": comp.name_ar,
                },
            )
        return await call_next(request)
