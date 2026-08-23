"""
Auto Code Generation Service — p257: atomic, race-proof counters.

Every code is drawn from a per-tenant-DB atomic counter (collection
`_code_counters`, find_one_and_update $inc) — two concurrent requests can
never receive the same number. On first use the counter is initialised from
the existing maximum in the target collection (legacy scan semantics), so
codes already issued keep their values and sequences continue seamlessly.

Output format is UNCHANGED: PREFIX + zero-padded number [+ "/YY"].
Counter keys deliberately exclude `digits` — one sequence per
(collection, field, prefix, year); digits only pad the rendered code.
"""
from datetime import datetime, timezone

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError


async def _legacy_max(db, collection: str, prefix: str, year: str, field: str) -> int:
    """Max numeric part among existing codes, same acceptance rules the
    pre-p257 generators used (any digit count, optional /YY suffix)."""
    if year:
        pattern = f"^{prefix}\\d+/{year}$"
        cut = 3  # len("/YY")
    else:
        pattern = f"^{prefix}\\d+$"
        cut = 0
    plen = len(prefix)
    pipeline = [
        {"$match": {field: {"$regex": pattern}}},
        {"$project": {"num": {"$toInt": {"$substrCP": [
            f"${field}", plen,
            {"$subtract": [{"$strLenCP": f"${field}"}, plen + cut]},
        ]}}}},
        {"$sort": {"num": -1}},
        {"$limit": 1},
    ]
    result = await db[collection].aggregate(pipeline).to_list(1)
    return int(result[0]["num"]) if result else 0


async def next_code(db, collection: str, prefix: str, digits: int = 5,
                    with_year: bool = True, field: str = "code") -> str:
    """Atomically draw the next code for (collection, field, prefix, year)."""
    year = datetime.now(timezone.utc).strftime("%y") if with_year else ""
    key = f"{collection}:{field}:{prefix}:{year or 'ever'}"
    counters = db["_code_counters"]
    if not await counters.find_one({"_id": key}):
        maxnum = await _legacy_max(db, collection, prefix, year, field)
        try:
            await counters.insert_one({"_id": key, "seq": maxnum})
        except DuplicateKeyError:
            pass  # a concurrent request initialised it first — fine
    doc = await counters.find_one_and_update(
        {"_id": key}, {"$inc": {"seq": 1}}, return_document=ReturnDocument.AFTER)
    code = f"{prefix}{str(int(doc['seq'])).zfill(digits)}"
    if year:
        code += f"/{year}"
    return code


async def generate_code(db, collection: str, prefix: str, digits: int = 5,
                        with_year: bool = True) -> str:
    """Legacy signature kept — now atomic via next_code."""
    return await next_code(db, collection, prefix, digits, with_year)


# Specific code generators (signatures unchanged)
async def generate_product_code(db) -> str:
    """Generate product article code: AR00001"""
    return await next_code(db, "products", "AR", 5, False)


async def generate_customer_code(db) -> str:
    """Generate customer code: CL00001"""
    return await next_code(db, "customers", "CL", 5, False)


async def generate_supplier_code(db) -> str:
    """Generate supplier code: FR00001/26"""
    return await next_code(db, "suppliers", "FR", 5, True)


async def generate_sale_code(db) -> str:
    """Generate sale code: BV00001/26"""
    return await next_code(db, "sales", "BV", 5, True)


async def generate_purchase_code(db) -> str:
    """Generate purchase code: AC00001/26"""
    return await next_code(db, "purchases", "AC", 5, True)


async def generate_expense_code(db) -> str:
    """Generate expense code: CH00001/26"""
    return await next_code(db, "expenses", "CH", 5, True)


async def generate_inventory_code(db) -> str:
    """Generate inventory session code: IN00001/26"""
    return await next_code(db, "inventory_sessions", "IN", 5, True)


async def generate_session_code(db) -> str:
    """Generate daily session code: S0001/26"""
    return await next_code(db, "daily_sessions", "S", 4, True)


async def generate_repair_code(db) -> str:
    """Generate repair ticket code: RP00001/26"""
    return await next_code(db, "repair_tickets", "RP", 5, True)


# ── p258: tenant-stamped public codes ─────────────────────────────────────
# Public codes (webstore / marketplace / ecom intake channels) carry the
# tenant stamp derived from the platform short_id:  NT-0004 -> "NT4".
# e.g. WEB-NT4-000123, MP-NT4-00002, ECO-NT4-A1B2C3D4.
# The stamp makes every public code globally unique across tenants and lets
# public tracking resolve the owning tenant in O(1) instead of scanning.
import re as _re
import uuid as _uuid

_stamp_cache: dict = {}


def _short_id_to_stamp(short_id: str) -> str:
    m = _re.match(r"^NT-?(\d+)$", (short_id or "").strip().upper())
    return f"NT{int(m.group(1))}" if m else ""


def short_id_to_stamp(short_id: str) -> str:
    """Public alias of _short_id_to_stamp."""
    return _short_id_to_stamp(short_id)


def stamp_to_short_id(stamp: str) -> str:
    """Reverse of the stamp: 'NT4' -> 'NT-0004'."""
    m = _re.match(r"^NT(\d+)$", (stamp or "").strip().upper())
    return f"NT-{int(m.group(1)):04d}" if m else ""


async def tenant_stamp(tenant_id: str) -> str:
    """Platform stamp for a tenant id, cached (short_id never changes)."""
    if not tenant_id:
        return ""
    if tenant_id in _stamp_cache:
        return _stamp_cache[tenant_id]
    from config.database import main_db
    t = await main_db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0, "short_id": 1})
    stamp = _short_id_to_stamp((t or {}).get("short_id") or "")
    if stamp:
        _stamp_cache[tenant_id] = stamp
    return stamp


async def db_stamp(db) -> str:
    """Stamp of the tenant owning this DB handle ('' for platform/unknown)."""
    name = getattr(db, "name", "") or ""
    if name.startswith("tenant_"):
        return await tenant_stamp(name[len("tenant_"):].replace("_", "-"))
    return ""


async def public_order_code(db, collection: str, prefix: str, digits: int = 6,
                            field: str = "order_code", stamp: str = None) -> str:
    """Tenant-stamped atomic public code: PREFIX-NTx-000123.

    The counter seeds from legacy unstamped codes (WEB000001, MP00001) via
    the same _legacy_max scan, so the numeric sequence continues without
    reuse. Unknown/platform tenants fall back to the legacy unstamped format.
    Pass `stamp` explicitly for platform-side collections (main_db) where the
    owning tenant is known from context (p259 marketplace listing codes).
    """
    if stamp is None:
        stamp = await db_stamp(db)
    key = f"{collection}:{field}:{prefix}:ever"
    counters = db["_code_counters"]
    if not await counters.find_one({"_id": key}):
        maxnum = await _legacy_max(db, collection, prefix, "", field)
        try:
            await counters.insert_one({"_id": key, "seq": maxnum})
        except DuplicateKeyError:
            pass  # a concurrent request initialised it first — fine
    doc = await counters.find_one_and_update(
        {"_id": key}, {"$inc": {"seq": 1}}, return_document=ReturnDocument.AFTER)
    num = str(int(doc["seq"])).zfill(digits)
    return f"{prefix}-{stamp}-{num}" if stamp else f"{prefix}{num}"


async def public_hex_code(db, prefix: str) -> str:
    """Tenant-stamped random public code: PREFIX-NTx-XXXXXXXX (8 hex chars)."""
    stamp = await db_stamp(db)
    hx = _uuid.uuid4().hex[:8].upper()
    return f"{prefix}-{stamp}-{hx}" if stamp else f"{prefix}-{hx}"
