"""Event consumers — central registry of handlers for the Redis event bus.

Each handler is an async function that receives an `Event` and performs the
side-effect described by that event. Handlers MUST be idempotent (the bus
already guards via `processed_events`, but handlers should also tolerate
re-execution if the consumer crashes mid-flight).

Phases covered here:
  • Phase 2 — purchase.created → ensures stock collection rows exist (mirror)
  • Phase 3 — sale.completed     → wallet credit + audit
                ecom_order.confirmed → POS inventory deduction
                tenant.subscription.expired → disable features + email

All handlers are wired in `register_handlers(bus)` which is invoked from
main.py at startup.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from config.database import main_db, get_tenant_db
from services.event_bus import RedisEventBus
from models.events import Event

log = logging.getLogger("event_consumers")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Phase 2: purchase.created ───────────────────────────────────────────────
async def handle_purchase_created(event: Event) -> None:
    """When a platform supplier purchase is created, ensure the per-item
    stock buckets exist and log to audit. Real stock rows are inserted when
    codes are uploaded (see handle_purchase_codes_uploaded), so this handler
    is primarily for materialised inventory metrics + audit timeline."""
    p = event.payload or {}
    purchase_id = p.get("purchase_id")
    items = p.get("items") or []
    if not purchase_id:
        log.warning("purchase.created missing purchase_id — skipping")
        return

    # Idempotent metric upsert: aggregate quantities by catalog type.
    by_type: dict[str, int] = {}
    for it in items:
        t = it.get("type") or "other"
        by_type[t] = by_type.get(t, 0) + int(it.get("quantity", 0) or 0)

    await main_db.inventory_movements.insert_one({
        "id": event.event_id,            # event_id used as PK — guarantees idempotency
        "event_type": "purchase.created",
        "purchase_id": purchase_id,
        "by_type": by_type,
        "tenant_id": event.tenant_id,
        "created_at": _utc_now_iso(),
        "correlation_id": event.metadata.correlation_id,
    })
    log.info("Inventory movement logged for purchase=%s items=%s", purchase_id, by_type)


async def handle_purchase_codes_uploaded(event: Event) -> None:
    """Audit-log uploaded codes against the platform stock collections.
    The actual stock insert is still handled synchronously in the route
    (dual-write per user instruction), this just creates the audit row."""
    p = event.payload or {}
    await main_db.inventory_movements.insert_one({
        "id": event.event_id,
        "event_type": "purchase.codes_uploaded",
        "purchase_id": p.get("purchase_id"),
        "count": int(p.get("count", 0) or 0),
        "stock_type": p.get("stock_type"),
        "tenant_id": event.tenant_id,
        "created_at": _utc_now_iso(),
        "correlation_id": event.metadata.correlation_id,
    })
    log.info("Codes upload audit-logged: purchase=%s count=%s", p.get("purchase_id"), p.get("count"))


# ── Phase 3: sale.completed ─────────────────────────────────────────────────
async def handle_sale_completed(event: Event) -> None:
    """On tenant sale: write an inventory movement audit row. The actual
    stock deduction & wallet credit are still done synchronously in the
    sale route (dual-write) — this handler builds the unified audit trail
    that powers the future Event Bus dashboard and WMS-Lite movement view."""
    p = event.payload or {}
    tenant_id = event.tenant_id
    sale_id = p.get("sale_id")
    if not sale_id:
        log.warning("sale.completed missing sale_id — skipping")
        return
    await main_db.inventory_movements.insert_one({
        "id": event.event_id,
        "event_type": "sale.completed",
        "sale_id": sale_id,
        "tenant_id": tenant_id,
        "total": float(p.get("total", 0) or 0),
        "items": p.get("items") or [],
        "channel": p.get("channel", "pos"),
        "created_at": _utc_now_iso(),
        "correlation_id": event.metadata.correlation_id,
    })
    log.info("Sale audit-logged: tenant=%s sale=%s", tenant_id, sale_id)


async def handle_sale_refunded(event: Event) -> None:
    p = event.payload or {}
    await main_db.inventory_movements.insert_one({
        "id": event.event_id,
        "event_type": "sale.refunded",
        "sale_id": p.get("sale_id"),
        "tenant_id": event.tenant_id,
        "amount": float(p.get("amount", 0) or 0),
        "reason": p.get("reason", ""),
        "created_at": _utc_now_iso(),
        "correlation_id": event.metadata.correlation_id,
    })


# ── Phase 3: ecom_order.confirmed ───────────────────────────────────────────
async def handle_ecom_order_confirmed(event: Event) -> None:
    """When an e-com order is confirmed → deduct POS stock + log movement.
    Because dual-write means the sync path may already have deducted, this
    handler MUST be idempotent. We use the event_id as the audit row id, so
    inserting twice will fail at the unique index and be silently swallowed.
    Stock deduction itself is gated by a per-order flag (`_eda_stock_deducted`)
    so we don't double-deduct."""
    p = event.payload or {}
    tenant_id = event.tenant_id
    order_id = p.get("order_id")
    items = p.get("items") or []
    if not order_id or tenant_id == "platform":
        log.warning("ecom_order.confirmed missing order_id or platform tenant — skipping")
        return

    tdb = get_tenant_db(tenant_id)
    # Per-order idempotency flag — prevents double deduction on bus retries
    flag = await tdb.ecom_orders.find_one(
        {"id": order_id},
        {"_id": 0, "_eda_stock_deducted": 1, "items": 1},
    )
    if flag and flag.get("_eda_stock_deducted"):
        log.debug("ecom_order %s already deducted by EDA — skipping", order_id)
    else:
        # Deduct stock per item — products live in tenant db
        for it in items:
            pid = it.get("product_id")
            qty = int(it.get("quantity", 0) or 0)
            if not pid or qty <= 0:
                continue
            await tdb.products.update_one(
                {"id": pid},
                {"$inc": {"stock": -qty}},
            )
        await tdb.ecom_orders.update_one(
            {"id": order_id},
            {"$set": {"_eda_stock_deducted": True, "_eda_deducted_at": _utc_now_iso()}},
        )

    # Always write the audit row (idempotent via event_id PK)
    try:
        await main_db.inventory_movements.insert_one({
            "id": event.event_id,
            "event_type": "ecom_order.confirmed",
            "order_id": order_id,
            "tenant_id": tenant_id,
            "items": items,
            "created_at": _utc_now_iso(),
            "correlation_id": event.metadata.correlation_id,
        })
    except Exception:
        pass  # duplicate event_id is fine
    log.info("E-com order stock-deducted: tenant=%s order=%s items=%d", tenant_id, order_id, len(items))


async def handle_ecom_order_cancelled(event: Event) -> None:
    """Compensation step for the saga — restore POS stock if it was deducted."""
    p = event.payload or {}
    tenant_id = event.tenant_id
    order_id = p.get("order_id")
    if not order_id or tenant_id == "platform":
        return
    tdb = get_tenant_db(tenant_id)
    order = await tdb.ecom_orders.find_one({"id": order_id}, {"_id": 0, "items": 1, "_eda_stock_deducted": 1})
    if order and order.get("_eda_stock_deducted"):
        for it in order.get("items") or []:
            pid = it.get("product_id")
            qty = int(it.get("quantity", 0) or 0)
            if not pid or qty <= 0:
                continue
            await tdb.products.update_one({"id": pid}, {"$inc": {"stock": qty}})
        await tdb.ecom_orders.update_one(
            {"id": order_id},
            {"$set": {"_eda_stock_deducted": False, "_eda_restored_at": _utc_now_iso()}},
        )
    try:
        await main_db.inventory_movements.insert_one({
            "id": event.event_id,
            "event_type": "ecom_order.cancelled",
            "order_id": order_id,
            "tenant_id": tenant_id,
            "created_at": _utc_now_iso(),
            "correlation_id": event.metadata.correlation_id,
        })
    except Exception:
        pass


# ── Phase 3: tenant.subscription.expired ────────────────────────────────────
async def handle_tenant_subscription_expired(event: Event) -> None:
    """Disable tenant features & notify owner. Idempotent — re-running just
    re-sets the same flags."""
    p = event.payload or {}
    tenant_id = event.tenant_id
    if tenant_id == "platform":
        log.warning("tenant.subscription.expired missing tenant_id")
        return
    await main_db.saas_tenants.update_one(
        {"id": tenant_id},
        {"$set": {
            "subscription_status": "expired",
            "is_active": False,
            "expired_notified_at": _utc_now_iso(),
        }},
    )
    # Audit
    await main_db.inventory_movements.insert_one({
        "id": event.event_id,
        "event_type": "tenant.subscription.expired",
        "tenant_id": tenant_id,
        "created_at": _utc_now_iso(),
        "correlation_id": event.metadata.correlation_id,
    })
    # Email notification (best-effort — handler must not crash on email failure)
    try:
        tenant = await main_db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0, "email": 1, "name": 1, "company_name": 1})
        if tenant and tenant.get("email"):
            from services.email_service import EmailService
            email_svc = EmailService()
            subject = "انتهاء اشتراكك في NT Commerce"
            body = (
                f"<p>مرحباً {tenant.get('name', tenant.get('company_name', ''))},</p>"
                "<p>نُعلمك بأن اشتراكك في منصة NT Commerce قد انتهى.</p>"
                "<p>سيتم تعليق ميزات حسابك حتى تجديد الاشتراك. للتجديد، يرجى تسجيل الدخول إلى لوحة التحكم.</p>"
                "<p>شكراً لاستخدامك خدماتنا.</p>"
            )
            try:
                await email_svc.send_email(tenant["email"], subject, body)
            except Exception as e:
                log.warning("Subscription expiry email failed: %s", e)
    except Exception as exc:
        log.warning("Subscription expiry notification failed: %s", exc)
    log.info("Tenant %s subscription expired — features disabled", tenant_id)


async def handle_tenant_subscription_renewed(event: Event) -> None:
    p = event.payload or {}
    tenant_id = event.tenant_id
    if tenant_id == "platform":
        return
    await main_db.saas_tenants.update_one(
        {"id": tenant_id},
        {"$set": {
            "subscription_status": "active",
            "is_active": True,
            "renewed_at": _utc_now_iso(),
            "expires_at": p.get("expires_at"),
        }},
    )
    try:
        await main_db.inventory_movements.insert_one({
            "id": event.event_id,
            "event_type": "tenant.subscription.renewed",
            "tenant_id": tenant_id,
            "created_at": _utc_now_iso(),
            "correlation_id": event.metadata.correlation_id,
        })
    except Exception:
        pass


# ── Generic: test.ping (used by tests / smoke checks) ──────────────────────
async def handle_test_ping(event: Event) -> None:
    log.info("PING received: id=%s payload=%s", event.event_id, event.payload)
    await main_db.inventory_movements.insert_one({
        "id": event.event_id,
        "event_type": "test.ping",
        "tenant_id": event.tenant_id,
        "payload": event.payload,
        "created_at": _utc_now_iso(),
    })


# ── Registry wiring ─────────────────────────────────────────────────────────
def register_handlers(bus: RedisEventBus) -> None:
    bus.register("purchase.created", handle_purchase_created)
    bus.register("purchase.codes_uploaded", handle_purchase_codes_uploaded)
    bus.register("sale.completed", handle_sale_completed)
    bus.register("sale.refunded", handle_sale_refunded)
    bus.register("ecom_order.confirmed", handle_ecom_order_confirmed)
    bus.register("ecom_order.cancelled", handle_ecom_order_cancelled)
    bus.register("tenant.subscription.expired", handle_tenant_subscription_expired)
    bus.register("tenant.subscription.renewed", handle_tenant_subscription_renewed)
    bus.register("test.ping", handle_test_ping)
    log.info("Event consumers registered: %d handlers", len(bus._handlers))


__all__ = ["register_handlers"]
