"""Platform commission engine (p205).

The platform owner is a WHOLESALER of mediated services (recharge, IPTV, AI...):
operators give the platform a commission rate (platform_commission), the platform
gives tenants a lower rate (commission), and the platform margin is the spread.

Every mediated transaction records ONE immutable ledger row in
main_db.platform_commissions — idempotent per (reference_type, reference_id)
(unique sparse index, created in main.py startup). Failed/refunded operations
are reversed in place (status: earned -> reversed) so the summary stays exact.
"""
from datetime import datetime, timezone
import logging
import uuid

log = logging.getLogger("commission_engine")


async def record_platform_commission(
    main_db, *, service_type: str, tenant_id: str, reference_type: str,
    reference_id: str, gross_amount: float, tenant_commission_pct: float,
    platform_commission_pct: float, operator: str = "", meta: dict | None = None,
) -> dict | None:
    """Record the platform's margin for one mediated transaction.

    Idempotent: a second call with the same (reference_type, reference_id)
    returns the existing row untouched (unique index is the race guard).
    Returns the commission doc, or None when there is no margin to record.
    """
    existing = await main_db.platform_commissions.find_one(
        {"reference_type": reference_type, "reference_id": reference_id}, {"_id": 0}
    )
    if existing:
        return existing

    gross = round(float(gross_amount), 2)
    tenant_margin = round(gross * float(tenant_commission_pct) / 100, 2)
    platform_margin = round(gross * float(platform_commission_pct) / 100, 2) - tenant_margin
    platform_margin = round(platform_margin, 2)
    if platform_margin <= 0:
        return None  # no spread configured — nothing earned, nothing to record

    now = datetime.now(timezone.utc).isoformat()
    count = await main_db.platform_commissions.count_documents({})
    doc = {
        "id": str(uuid.uuid4()),
        "code": f"PCOM-{str(count + 1).zfill(5)}",
        "service_type": service_type,
        "tenant_id": tenant_id,
        "operator": operator,
        "gross_amount": gross,
        "tenant_commission_pct": float(tenant_commission_pct),
        "platform_commission_pct": float(platform_commission_pct),
        "tenant_margin": tenant_margin,
        "platform_margin": platform_margin,
        "status": "earned",
        "reference_type": reference_type,
        "reference_id": reference_id,
        "meta": meta or {},
        "created_at": now,
        "reversed_at": None,
    }
    try:
        await main_db.platform_commissions.insert_one(dict(doc))
    except Exception as exc:
        # 4 uvicorn workers — a concurrent insert won the unique-index race
        if "duplicate" in str(exc).lower() or "E11000" in str(exc):
            return await main_db.platform_commissions.find_one(
                {"reference_type": reference_type, "reference_id": reference_id}, {"_id": 0}
            )
        raise
    doc.pop("_id", None)
    log.info("platform commission %s: %s DZD (%s/%s)", doc["code"], platform_margin, service_type, operator)
    return doc


async def reverse_platform_commission(main_db, *, reference_type: str, reference_id: str, reason: str = "") -> bool:
    """Mark a previously earned commission as reversed (failed/refunded op).
    Idempotent: reversing twice is a no-op. Returns True when a row flipped."""
    res = await main_db.platform_commissions.update_one(
        {"reference_type": reference_type, "reference_id": reference_id, "status": "earned"},
        {"$set": {"status": "reversed", "reversed_at": datetime.now(timezone.utc).isoformat(),
                  "reversal_reason": reason}},
    )
    if res.modified_count:
        log.info("platform commission reversed: %s/%s (%s)", reference_type, reference_id, reason)
    return res.modified_count > 0
