"""
p347: Tenant database naming — readable names organised by business activity.

Scheme:  nt_<activity_code>_<tenant_seq>   e.g. nt_rs_0029 (restaurant, NT-0029)
Legacy:  tenant_<uuid_with_underscores>

Resolution (sync, safe to call from get_tenant_db on every request):
1. in-process cache (TTL 300s)
2. shared Redis key  tenant_db_name:<tenant_id>   (all 4 uvicorn workers agree)
3. legacy derivation (fallback — nothing breaks for unmigrated tenants)

The tenant document carries `db_name` once assigned; the migration script and
the creation flows register it in Redis so every worker sees it instantly.
"""
import os
import time
from typing import Optional

# Hand-picked unique 2-letter codes per business activity (first-two-letters
# would collide: retail/restaurant=re, car_rental/car_wash/car_importer=ca).
ACTIVITY_CODES = {
    "retail": "rt",            # تجزئة
    "supermarket": "sm",       # سوبرماركت
    "recharge_shop": "rc",     # محل تعبئة
    "electronics": "el",       # إلكترونيات
    "fruits_vegetables": "fv", # خضر وفواكه
    "tobacco": "tb",           # تبغ
    "pharmacy": "ph",          # صيدلية
    "clothing": "cl",          # ملابس
    "repair": "rp",            # صيانة
    "car_rental": "cr",        # كراء سيارات
    "property_rental": "pr",   # كراء عقارات
    "wholesale": "ws",         # جملة
    "production": "pd",        # إنتاج
    "ecommerce": "ec",         # تجارة إلكترونية
    "spices": "sp",            # توابل
    "work_equipment": "we",    # معدات عمل
    "paint": "pa",             # دهانات
    "home_appliances": "ha",   # أجهزة منزلية
    "restaurant": "rs",        # مطعم
    "car_wash": "cw",          # غسيل سيارات
    "laundry": "ld",           # مصبنة
    "car_importer": "ci",      # مستورد سيارات
    "distributor": "ds",       # موزّع
}
DEFAULT_CODE = "gn"  # general — نشاط غير محدد

_LOCAL_CACHE: dict = {}          # tenant_id -> (expires, db_name)
_LOCAL_TTL = 300                 # seconds
_FALLBACK_TTL = 30               # legacy fallback cached briefly (migrations flip fast)
_REDIS_KEY = "tenant_db_name:{}"


def _redis():
    """Shared sync Redis client (lazy; None when unreachable)."""
    global _REDIS
    if "_REDIS" not in globals():
        try:
            import redis as _redis_mod
            _REDIS = _redis_mod.from_url(
                os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
                decode_responses=True, socket_connect_timeout=1, socket_timeout=1,
            )
            _REDIS.ping()
        except Exception:  # noqa: BLE001
            _REDIS = None
    return _REDIS


def legacy_db_name(tenant_id: str) -> str:
    return f"tenant_{tenant_id.replace('-', '_')}"


def build_db_name(short_id: str, business_type: str | None) -> str:
    """nt_<code>_<seq> — e.g. NT-0029 + restaurant -> nt_rs_0029."""
    try:
        from core.business_profiles import LEGACY_ALIASES
        business_type = LEGACY_ALIASES.get(business_type, business_type)
    except Exception:  # noqa: BLE001
        pass
    code = ACTIVITY_CODES.get(business_type or "", DEFAULT_CODE)
    seq = "".join(ch for ch in (short_id or "") if ch.isdigit())
    return f"nt_{code}_{seq or '0000'}"


def resolve_db_name(tenant_id: str) -> str:
    """The tenant's current DB name (custom if assigned, else legacy)."""
    if not tenant_id:
        return ""
    now = time.time()
    hit = _LOCAL_CACHE.get(tenant_id)
    if hit and hit[0] > now:
        return hit[1]
    try:
        r = _redis()
        if r is not None:
            name = r.get(_REDIS_KEY.format(tenant_id))
            if name:
                _LOCAL_CACHE[tenant_id] = (now + _LOCAL_TTL, name)
                return name
    except Exception:  # noqa: BLE001
        pass
    name = legacy_db_name(tenant_id)
    _LOCAL_CACHE[tenant_id] = (now + _FALLBACK_TTL, name)
    return name


def register_db_name(tenant_id: str, db_name: str) -> None:
    """Persist the mapping so every worker resolves it instantly."""
    _LOCAL_CACHE[tenant_id] = (time.time() + _LOCAL_TTL, db_name)
    try:
        r = _redis()
        if r is not None:
            r.set(_REDIS_KEY.format(tenant_id), db_name)  # no TTL — permanent mapping
    except Exception:  # noqa: BLE001
        pass


def warm_local_cache(tenant_id: str, db_name: str) -> None:
    _LOCAL_CACHE[tenant_id] = (time.time() + _LOCAL_TTL, db_name)


async def load_all_db_names(main_db) -> int:
    """Startup: publish every tenant's stored db_name to Redis + local cache."""
    n = 0
    try:
        async for t in main_db.saas_tenants.find(
            {"db_name": {"$gt": ""}}, {"_id": 0, "id": 1, "db_name": 1}
        ):
            register_db_name(t["id"], t["db_name"])
            n += 1
    except Exception:  # noqa: BLE001
        pass
    return n
