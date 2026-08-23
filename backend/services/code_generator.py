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
