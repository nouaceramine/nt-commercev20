"""Unified digital-code inventory service (Phase E).

Single implementation of the atomic claim/release pattern used by every
code-inventory surface (Idoom codes, digital product codes, ...). A claim is
atomic per code via find_one_and_update; if a multi-code claim cannot be
fulfilled, everything claimed so far is released (all-or-nothing), so no code
ever leaks into a used/reserved state without a completed sale.
"""
from typing import Optional


async def claim_codes(db, collection: str, match: dict, claim_set: dict,
                      release_set: dict, quantity: int = 1) -> list:
    """Atomically claim up to `quantity` codes matching `match`.

    Each code is claimed with find_one_and_update (race-safe). On partial
    claim (fewer available than requested) every code claimed in this call is
    released back with `release_set` and an empty list is returned.
    """
    claimed = []
    for _ in range(quantity):
        doc = await db[collection].find_one_and_update(
            match, {"$set": claim_set},
            return_document=True, projection={"_id": 0},
        )
        if not doc:
            await release_codes(db, collection, [d["id"] for d in claimed], release_set)
            return []
        claimed.append(doc)
    return claimed


async def release_codes(db, collection: str, code_ids: list, release_set: dict) -> None:
    """Release previously claimed codes (compensation after a failed sale)."""
    for cid in code_ids:
        await db[collection].update_one({"id": cid}, {"$set": release_set})


async def count_available(db, collection: str, match: Optional[dict] = None) -> int:
    """Count codes available for claiming."""
    return await db[collection].count_documents(match or {})
