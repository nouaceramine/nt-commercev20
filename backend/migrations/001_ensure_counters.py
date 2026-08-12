"""Migration 001 — ensure numbering counters exist.

Every tenant/template DB gets a `counters` collection with one doc per
document family (invoice, quote, order, repair). Sequence starts at 0;
code increments atomically with find_one_and_update($inc).
"""


async def up(db):
    for key in ("invoice", "quote", "order", "repair"):
        await db.counters.update_one(
            {"_id": key},
            {"$setOnInsert": {"_id": key, "seq": 0}},
            upsert=True,
        )
