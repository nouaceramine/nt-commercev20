"""SaaS Tenant-Debts dashboard — collective view of all tenants currently
holding credit-debt to the platform, with reminders and PDF statements.

Endpoints (super-admin only):
    GET  /api/saas/tenant-debts                       -> {summary, items[]}
    GET  /api/saas/tenant-debts/{tenant_id}/transactions
    POST /api/saas/tenant-debts/{tenant_id}/remind    -> records a reminder
    GET  /api/saas/tenant-debts/{tenant_id}/statement.pdf
"""
import io
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)

from config.database import main_db
from utils.cache import cache, cached_json
from .helpers import get_super_admin

logger = logging.getLogger(__name__)
router = APIRouter(tags=["SaaS Tenant Debts"])

# Cache key prefix for tenant-debts. Variants per `only_with_debt` query arg.
_DEBTS_KEY_PREFIX = "saas:tenant-debts"


async def invalidate_tenant_debts_cache() -> None:
    """Clear all tenant-debts cache entries (both filter variants).
    Called after any mutation: remind, settle, wallet top-up etc.
    """
    if cache.enabled:
        try:
            await cache.invalidate_prefix(f"{_DEBTS_KEY_PREFIX}:")
        except Exception:
            pass


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _debts_cache_subkey(only_with_debt: bool = True, **_kwargs) -> str:
    """Per-call sub-key for the tenant-debts cache. Variants per filter:
       v=1 → only_with_debt=True (default, debt-only)
       v=0 → only_with_debt=False (all tenant wallets)
    """
    return f"v={int(bool(only_with_debt))}"


@router.get("/saas/tenant-debts")
@cached_json(prefix=_DEBTS_KEY_PREFIX, ttl=15, key_fn=_debts_cache_subkey)
async def list_tenant_debts(
    only_with_debt: bool = True,
    admin: dict = Depends(get_super_admin),
):
    """Return one row per tenant wallet with `credit_debt > 0` (or all if
    only_with_debt=false). Plus a summary."""
    query = {"entity_type": "tenant"}
    if only_with_debt:
        query["credit_debt"] = {"$gt": 0}
    wallets = await main_db.wallets.find(query, {"_id": 0}).to_list(2000)

    items = []
    total_debt = 0.0
    overdue_count = 0
    now = datetime.now(timezone.utc)
    for w in wallets:
        tenant = await main_db.saas_tenants.find_one(
            {"id": w["entity_id"]}, {"_id": 0}
        ) or {}
        debt = float(w.get("credit_debt") or 0)
        if debt > 0:
            total_debt += debt
        # last reminder
        last_rem = await main_db.tenant_debt_reminders.find_one(
            {"tenant_id": w["entity_id"]}, sort=[("created_at", -1)]
        )
        # subscription overdue? (heuristic for severity)
        sub_overdue = False
        sub_end = tenant.get("subscription_ends_at")
        if sub_end:
            try:
                end_dt = datetime.fromisoformat(sub_end.replace("Z", "+00:00"))
                if end_dt < now:
                    sub_overdue = True
                    overdue_count += 1
            except Exception:
                pass
        items.append({
            "tenant_id": w["entity_id"],
            "tenant_name": tenant.get("name", ""),
            "tenant_email": tenant.get("email", ""),
            "company_name": tenant.get("company_name", ""),
            "phone": tenant.get("phone", ""),
            "wallet_balance": float(w.get("balance") or 0),
            "credit_debt": debt,
            "is_active": tenant.get("is_active", True),
            "subscription_ends_at": sub_end,
            "subscription_overdue": sub_overdue,
            "last_reminder_at": (last_rem or {}).get("created_at"),
            "reminders_sent": await main_db.tenant_debt_reminders.count_documents({"tenant_id": w["entity_id"]}),
        })
    # Sort by debt descending
    items.sort(key=lambda x: x["credit_debt"], reverse=True)
    return {
        "summary": {
            "total_tenants_with_debt": sum(1 for i in items if i["credit_debt"] > 0),
            "total_debt": total_debt,
            "overdue_subscriptions": overdue_count,
        },
        "items": items,
    }


@router.get("/saas/tenant-debts/{tenant_id}/transactions")
async def tenant_debt_transactions(
    tenant_id: str,
    limit: int = 100,
    admin: dict = Depends(get_super_admin),
):
    wallet = await main_db.wallets.find_one(
        {"entity_id": tenant_id, "entity_type": "tenant"}, {"_id": 0}
    )
    if not wallet:
        raise HTTPException(status_code=404, detail="المحفظة غير موجودة")
    rows = await main_db.wallet_transactions.find(
        {"wallet_id": wallet["id"]}, {"_id": 0}
    ).sort("created_at", -1).limit(max(1, min(limit, 500))).to_list(500)
    return {"wallet": wallet, "transactions": rows}


@router.post("/saas/tenant-debts/{tenant_id}/remind")
async def remind_tenant(
    tenant_id: str,
    payload: Optional[dict] = None,
    admin: dict = Depends(get_super_admin),
):
    """Record a reminder action. Email delivery is queued through
    services.email_service if configured; otherwise the reminder is logged
    so the super-admin has a paper trail."""
    wallet = await main_db.wallets.find_one(
        {"entity_id": tenant_id, "entity_type": "tenant"}, {"_id": 0}
    )
    if not wallet:
        raise HTTPException(status_code=404, detail="المحفظة غير موجودة")
    tenant = await main_db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0}) or {}
    debt = float(wallet.get("credit_debt") or 0)
    if debt <= 0:
        raise HTTPException(status_code=400, detail="لا يوجد دين على هذا التاجر")

    custom_message = (payload or {}).get("message") or ""
    channel = (payload or {}).get("channel", "email")

    # Try to deliver via email_service (best-effort; no hard failure)
    delivered = False
    delivery_error = None
    try:
        from services.email_service import send_email
        subject = f"تذكير: لديك دين متبقّ للمنصّة — {debt:.2f} دج"
        body = custom_message or (
            f"مرحباً {tenant.get('name', '')},\n\n"
            f"نذكّركم بأن لديكم رصيداً متبقّياً للمنصّة بقيمة {debt:.2f} دج. "
            f"يرجى تسديده في أقرب وقت ممكن لتجنّب أي تعليق في الخدمة.\n\n"
            f"شكراً لتعاونكم،\nفريق NT Commerce."
        )
        result = await send_email(to=tenant.get("email", ""), subject=subject, body=body)
        delivered = bool(result)
    except ImportError:
        delivery_error = "email_service not configured"
    except Exception as e:
        delivery_error = str(e)
        logger.warning(f"Failed to send debt reminder email to {tenant.get('email')}: {e}")

    reminder = {
        "id": f"rem_{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        "tenant_id": tenant_id,
        "tenant_email": tenant.get("email", ""),
        "channel": channel,
        "amount_at_time": debt,
        "delivered": delivered,
        "delivery_error": delivery_error,
        "sent_by_admin_id": admin.get("id"),
        "sent_by_admin_email": admin.get("email", ""),
        "custom_message": custom_message[:1000] if custom_message else None,
        "created_at": _now_iso(),
    }
    await main_db.tenant_debt_reminders.insert_one(reminder)
    await invalidate_tenant_debts_cache()
    return {
        "ok": True,
        "delivered": delivered,
        "delivery_error": delivery_error,
        "reminder_id": reminder["id"],
    }


def _build_statement_pdf(
    tenant: dict, wallet: dict, transactions: list, currency: str = "دج"
) -> bytes:
    """Render a one-tenant account-statement PDF and return raw bytes."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
        title=f"Statement - {tenant.get('name', '')}",
    )
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], alignment=1, fontSize=18, spaceAfter=12)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=10, leading=14)
    story = []

    story.append(Paragraph("NT Commerce — Tenant Statement", h1))
    story.append(Spacer(1, 0.3 * cm))
    info_data = [
        ["Tenant", tenant.get("name", "")],
        ["Email", tenant.get("email", "")],
        ["Company", tenant.get("company_name", "")],
        ["Wallet balance", f"{wallet.get('balance', 0):,.2f} {currency}"],
        ["Outstanding credit-debt", f"{wallet.get('credit_debt', 0):,.2f} {currency}"],
        ["Generated at", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")],
    ]
    info_table = Table(info_data, colWidths=[5 * cm, 11 * cm])
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f1f5f9")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 0.6 * cm))

    story.append(Paragraph("Recent Transactions", styles["Heading2"]))
    story.append(Spacer(1, 0.2 * cm))

    if not transactions:
        story.append(Paragraph("No transactions found.", body))
    else:
        rows = [["Date", "Code", "Type", "Method", "Amount", "Balance After", "Description"]]
        for t in transactions[:50]:
            ts = (t.get("created_at") or "")[:19].replace("T", " ")
            rows.append([
                ts,
                t.get("code", "") or "",
                t.get("transaction_type", "") or "",
                t.get("payment_method", "") or "",
                f"{float(t.get('amount') or 0):,.2f}",
                f"{float(t.get('balance_after') or 0):,.2f}",
                (t.get("description") or "")[:35],
            ])
        tx_table = Table(rows, colWidths=[3 * cm, 2.5 * cm, 2 * cm, 1.8 * cm, 2 * cm, 2.5 * cm, 4 * cm])
        tx_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e1")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("PADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(tx_table)

    story.append(Spacer(1, 1 * cm))
    footer = Paragraph(
        "This is an electronically generated statement. For inquiries please contact NT Commerce support.",
        ParagraphStyle("footer", parent=body, alignment=1, textColor=colors.HexColor("#64748b"), fontSize=8),
    )
    story.append(footer)
    doc.build(story)
    pdf_bytes = buf.getvalue()
    buf.close()
    return pdf_bytes


@router.get("/saas/tenant-debts/{tenant_id}/statement.pdf")
async def tenant_statement_pdf(
    tenant_id: str,
    admin: dict = Depends(get_super_admin),
):
    wallet = await main_db.wallets.find_one(
        {"entity_id": tenant_id, "entity_type": "tenant"}, {"_id": 0}
    )
    if not wallet:
        raise HTTPException(status_code=404, detail="المحفظة غير موجودة")
    tenant = await main_db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0}) or {}
    txns = await main_db.wallet_transactions.find(
        {"wallet_id": wallet["id"]}, {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    pdf_bytes = _build_statement_pdf(tenant, wallet, txns)
    safe_name = (tenant.get("name") or tenant_id).replace(" ", "_")
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="statement_{safe_name}.pdf"'},
    )


__all__ = ["router"]
