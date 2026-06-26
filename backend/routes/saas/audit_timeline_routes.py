"""SaaS Audit Timeline — unified chronological feed merging:
  • impersonation_logs    (super-admin started/closed an impersonation session)
  • tenant_debt_reminders (super-admin sent a debt reminder)
  • wallet_transactions   (cash/credit top-ups from super-admin)

Endpoint (super-admin only):
    GET /api/saas/audit-timeline
        ?tenant_id   : filter to a single tenant
        ?admin_id    : filter to a single admin
        ?event_type  : comma-separated list (impersonation, reminder, wallet_topup)
        ?since       : ISO date string (events created_at >= since)
        ?until       : ISO date string (events created_at <= until)
        ?limit       : max events returned (default 200, hard cap 1000)
"""
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, Query

from config.database import main_db
from .helpers import get_super_admin

router = APIRouter(tags=["SaaS Audit Timeline"])


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        # Frontend may pass a bare date like "2026-06-26" (no offset) — make
        # it tz-aware UTC so subsequent comparisons with tz-aware event
        # timestamps don't raise TypeError.
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _to_iso(value) -> Optional[str]:
    if isinstance(value, str):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    return None


async def _build_tenant_lookup(tenant_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    if not tenant_ids:
        return {}
    rows = await main_db.saas_tenants.find(
        {"id": {"$in": list(set(tenant_ids))}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "company_name": 1},
    ).to_list(2000)
    return {r["id"]: r for r in rows}


@router.get("/saas/audit-timeline")
async def audit_timeline(
    tenant_id: Optional[str] = None,
    admin_id: Optional[str] = None,
    event_type: Optional[str] = None,
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    admin: dict = Depends(get_super_admin),
):
    types_filter = (
        {t.strip() for t in event_type.split(",") if t.strip()}
        if event_type
        else None
    )
    since_dt = _parse_iso(since)
    until_dt = _parse_iso(until)

    events: List[Dict[str, Any]] = []

    # ── 1) Impersonation sessions ──
    if not types_filter or "impersonation" in types_filter:
        q: Dict[str, Any] = {}
        if tenant_id:
            q["tenant_id"] = tenant_id
        if admin_id:
            q["admin_id"] = admin_id
        rows = await main_db.impersonation_logs.find(q, {"_id": 0}).sort("started_at", -1).limit(limit).to_list(limit)
        for r in rows:
            events.append({
                "id": f"imp:{r.get('id')}",
                "type": "impersonation",
                "severity": "warning" if r.get("status") == "active" else "info",
                "timestamp": r.get("started_at"),
                "stopped_at": r.get("stopped_at"),
                "admin_id": r.get("admin_id"),
                "admin_email": r.get("admin_email"),
                "admin_name": r.get("admin_name"),
                "tenant_id": r.get("tenant_id"),
                "tenant_name": r.get("tenant_name"),
                "tenant_email": r.get("tenant_email"),
                "ip": r.get("ip"),
                "summary": (
                    f"بدأت جلسة انتحال على حساب {r.get('tenant_name', r.get('tenant_id', ''))}"
                    if r.get("status") == "active"
                    else f"انتهت جلسة انتحال على {r.get('tenant_name', r.get('tenant_id', ''))} (المدّة: {r.get('duration_seconds') or 0}ث)"
                ),
                "details": {"status": r.get("status"), "duration_seconds": r.get("duration_seconds")},
            })

    # ── 2) Debt reminders ──
    if not types_filter or "reminder" in types_filter:
        q = {}
        if tenant_id:
            q["tenant_id"] = tenant_id
        if admin_id:
            q["sent_by_admin_id"] = admin_id
        rows = await main_db.tenant_debt_reminders.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        for r in rows:
            events.append({
                "id": f"rem:{r.get('id')}",
                "type": "reminder",
                "severity": "info" if r.get("delivered") else "warning",
                "timestamp": r.get("created_at"),
                "admin_id": r.get("sent_by_admin_id"),
                "admin_email": r.get("sent_by_admin_email"),
                "tenant_id": r.get("tenant_id"),
                "tenant_email": r.get("tenant_email"),
                "summary": (
                    f"أُرسل تذكير بدفع {r.get('amount_at_time', 0):.2f} دج إلى {r.get('tenant_email', '')}"
                    + (" (لم يُسلَّم)" if not r.get("delivered") else "")
                ),
                "details": {
                    "channel": r.get("channel"),
                    "amount_at_time": r.get("amount_at_time"),
                    "delivered": r.get("delivered"),
                    "delivery_error": r.get("delivery_error"),
                },
            })

    # ── 3) Wallet top-ups (admin_deposit) ──
    if not types_filter or "wallet_topup" in types_filter:
        # Wallet transactions live in main_db. wallet_id -> wallet -> entity_id (tenant_id).
        wallet_q: Dict[str, Any] = {"reference_type": "admin_deposit"}
        wallets_for_tenant = None
        if tenant_id:
            w = await main_db.wallets.find_one({"entity_id": tenant_id}, {"_id": 0, "id": 1})
            if w:
                wallet_q["wallet_id"] = w["id"]
            else:
                wallets_for_tenant = []
        if wallets_for_tenant != []:
            rows = await main_db.wallet_transactions.find(wallet_q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
            # We need tenant_id per txn → look up wallets in bulk
            wallet_ids = list({r["wallet_id"] for r in rows if r.get("wallet_id")})
            wallets_map: Dict[str, Dict[str, Any]] = {}
            if wallet_ids:
                wrows = await main_db.wallets.find(
                    {"id": {"$in": wallet_ids}},
                    {"_id": 0, "id": 1, "entity_id": 1, "entity_type": 1},
                ).to_list(2000)
                wallets_map = {w["id"]: w for w in wrows}
            for r in rows:
                w = wallets_map.get(r.get("wallet_id"), {})
                tid = w.get("entity_id")
                if tenant_id and tid != tenant_id:
                    continue
                events.append({
                    "id": f"top:{r.get('id')}",
                    "type": "wallet_topup",
                    "severity": "warning" if r.get("payment_method") == "credit" else "info",
                    "timestamp": r.get("created_at"),
                    "admin_email": r.get("created_by"),
                    "tenant_id": tid,
                    "summary": (
                        f"شُحنت محفظة التاجر بمبلغ {r.get('amount', 0):.2f} دج "
                        f"({'بالدين' if r.get('payment_method') == 'credit' else 'نقداً'})"
                    ),
                    "details": {
                        "code": r.get("code"),
                        "amount": r.get("amount"),
                        "payment_method": r.get("payment_method"),
                        "balance_after": r.get("balance_after"),
                        "description": r.get("description"),
                    },
                })

    # ── Enrich tenant_name on events that have tenant_id but no name yet ──
    missing_names = [e["tenant_id"] for e in events if e.get("tenant_id") and not e.get("tenant_name")]
    if missing_names:
        lookup = await _build_tenant_lookup(missing_names)
        for e in events:
            if not e.get("tenant_name") and e.get("tenant_id") in lookup:
                e["tenant_name"] = lookup[e["tenant_id"]].get("name", "")
                e["tenant_email"] = e.get("tenant_email") or lookup[e["tenant_id"]].get("email", "")

    # ── Date-range filter ──
    def _ts_dt(e):
        return _parse_iso(e.get("timestamp")) or datetime.min.replace(tzinfo=timezone.utc)
    if since_dt:
        events = [e for e in events if _ts_dt(e) >= since_dt]
    if until_dt:
        events = [e for e in events if _ts_dt(e) <= until_dt]

    # ── Sort descending by timestamp ──
    events.sort(key=_ts_dt, reverse=True)
    events = events[:limit]

    # ── Summary breakdown by type ──
    by_type: Dict[str, int] = {}
    for e in events:
        by_type[e["type"]] = by_type.get(e["type"], 0) + 1

    return {
        "summary": {
            "total": len(events),
            "by_type": by_type,
        },
        "events": events,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


__all__ = ["router"]
