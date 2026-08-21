"""p221: commission engine — tenant rules applied on sale.completed events.

Rule: {id, name, beneficiary, scope: all|family|channel, family_id?, channel?,
       rate_type: percent|fixed, value, min_amount, active}
On sale.completed → commission doc (idempotent per sale+rule) + journal entry
Dr 658 (مصاريف العمولات) / Cr 421 (عمولات مستحقة).
On sale.refunded / sale.deleted → commission cancelled + reversal entry.
Payout (route) → Dr 421 / Cr box + cash-box transaction.
"""
import logging
import uuid
from datetime import datetime, timezone

log = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def compute_commission(rule: dict, sale_total: float) -> float:
    if sale_total < float(rule.get("min_amount") or 0):
        return 0.0
    if rule.get("rate_type") == "fixed":
        return round(float(rule.get("value") or 0), 2)
    return round(sale_total * float(rule.get("value") or 0) / 100.0, 2)


def rule_matches(rule: dict, payload: dict) -> bool:
    scope = rule.get("scope", "all")
    if scope == "all":
        return True
    if scope == "family":
        fams = {it.get("family_id") for it in (payload.get("items") or [])}
        return bool(rule.get("family_id")) and rule.get("family_id") in fams
    if scope == "channel":
        return (payload.get("channel") or "pos") == rule.get("channel")
    return False


async def apply_commission_rules(tdb, payload: dict) -> list:
    """sale.completed hook. Idempotent per (sale_id, rule_id)."""
    sale_id = payload.get("sale_id")
    total = float(payload.get("total", 0) or 0)
    if not sale_id or total <= 0:
        return []
    created = []
    rules = await tdb.commission_rules.find({"active": True}, {"_id": 0}).to_list(100)
    for rule in rules:
        if not rule_matches(rule, payload):
            continue
        amount = compute_commission(rule, total)
        if amount <= 0:
            continue
        if await tdb.commissions.find_one({"sale_id": sale_id, "rule_id": rule["id"]}, {"_id": 1}):
            continue
        doc = {
            "id": str(uuid.uuid4()),
            "rule_id": rule["id"],
            "rule_name": rule.get("name", ""),
            "beneficiary": rule.get("beneficiary", ""),
            "sale_id": sale_id,
            "invoice_number": payload.get("invoice_number", ""),
            "sale_total": total,
            "amount": amount,
            "status": "pending",
            "created_at": _now(),
        }
        await tdb.commissions.insert_one(doc)
        doc.pop("_id", None)
        try:
            from services.accounting_auto import post_commission_entry
            await post_commission_entry(
                tdb, commission_id=doc["id"], amount=amount,
                beneficiary=doc["beneficiary"], invoice_number=doc["invoice_number"],
            )
        except Exception as exc:
            log.warning("commission journal entry failed for %s: %s", doc["id"], exc)
        created.append(doc)
    if created:
        log.info("commissions: sale=%s created=%d", sale_id, len(created))
    return created


async def cancel_commissions_for_sale(tdb, sale_id: str, reason: str = "") -> int:
    """sale.refunded / sale.deleted hook — cancel pending commissions + reverse."""
    n = 0
    async for c in tdb.commissions.find({"sale_id": sale_id, "status": "pending"}):
        await tdb.commissions.update_one(
            {"id": c["id"]},
            {"$set": {"status": "cancelled", "cancelled_at": _now(), "cancel_reason": reason}},
        )
        try:
            from services.accounting_auto import reverse_commission_entry
            await reverse_commission_entry(tdb, commission_id=c["id"], amount=float(c.get("amount", 0)),
                                           beneficiary=c.get("beneficiary", ""))
        except Exception as exc:
            log.warning("commission reversal failed for %s: %s", c["id"], exc)
        n += 1
    return n
