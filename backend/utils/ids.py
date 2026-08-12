"""Central ID generation for the whole platform (p34, gap 2).

RULE: every new identifier in the system is created HERE, never by scattering
`str(uuid.uuid4())` across route files. Existing data keeps its historical IDs;
all NEW code must import from this module.

ID formats registry (ID_FORMATS) documents every ID type in the platform.
"""
import uuid
from datetime import datetime, timezone

from pymongo import ReturnDocument

# ── Format registry: the single documentation of every ID type ──────────────
ID_FORMATS = {
    "entity": {
        "format": "uuid4",
        "example": "c24e3b19-4bfa-436e-96c6-76e38627e294",
        "used_for": "products, users, sales, customers, suppliers, logs — the default",
        "generator": "new_id()",
    },
    "tenant_uuid": {
        "format": "uuid4",
        "example": "1c16c29a-a15f-4565-8091-93bbb132018f",
        "used_for": "internal tenant id; DB name = tenant_<uuid with dashes→underscores>",
        "generator": "new_id()",
    },
    "tenant_short": {
        "format": "NT-XXXX (sequential)",
        "example": "NT-0002",
        "used_for": "human-facing tenant number, shown in admin UI",
        "generator": "routes/saas/helpers.next_tenant_short_id() (saas counter)",
    },
    "document": {
        "format": "PREFIX-YYYY-NNNNNN (sequential per tenant)",
        "example": "INV-2026-000001",
        "used_for": "invoices (INV), quotes (QUO), orders (ORD), repairs (REP)",
        "generator": "next_document_number(db, kind) — atomic via tenant counters collection",
    },
    "migration": {
        "format": "NNN_snake_name",
        "example": "001_ensure_counters",
        "used_for": "numbered schema migrations in backend/migrations/",
        "generator": "file name; applied by services/migrations_runner",
    },
    "snapshot": {
        "format": "<kind>_YYYYMMDD_HHMMSS",
        "example": "template_snapshot_20260812_171054",
        "used_for": "backup/snapshot directory names under /backups",
        "generator": "timestamped at creation",
    },
}

DOC_PREFIXES = {"invoice": "INV", "quote": "QUO", "order": "ORD", "repair": "REP"}


def new_id() -> str:
    """Canonical entity id (uuid4 string)."""
    return str(uuid.uuid4())


def short_token(length: int = 12) -> str:
    """Compact random token for API keys, slugs, share links (hex, lowercase)."""
    return uuid.uuid4().hex[:length]


async def next_document_number(db, kind: str) -> str:
    """Atomic sequential human number for a business document, per tenant DB.

    Uses the tenant's `counters` collection (created by migration 001), so the
    sequence is race-safe and survives restarts. Example: INV-2026-000001.
    """
    if kind not in DOC_PREFIXES:
        raise ValueError(f"unknown document kind: {kind!r} — expected one of {sorted(DOC_PREFIXES)}")
    year = datetime.now(timezone.utc).year
    doc = await db.counters.find_one_and_update(
        {"_id": kind},
        {"$inc": {"seq": 1}, "$setOnInsert": {"_id": kind}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return f"{DOC_PREFIXES[kind]}-{year}-{doc['seq']:06d}"


def describe() -> dict:
    """Expose the registry (used by diagnostics / docs)."""
    return ID_FORMATS
