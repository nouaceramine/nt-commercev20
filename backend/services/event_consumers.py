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

    # p190: auto journal entry from the event (tenant DB, idempotent per sale)
    if tenant_id and tenant_id != "platform":
        try:
            from services.accounting_auto import post_sale_entry
            await post_sale_entry(get_tenant_db(tenant_id), p)
        except Exception as exc:
            log.warning("auto-accounting sale %s failed: %s", sale_id, exc)


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

    # p190: auto reversal entry
    if event.tenant_id and event.tenant_id != "platform":
        try:
            from services.accounting_auto import post_sale_reversal
            await post_sale_reversal(get_tenant_db(event.tenant_id), p, "refund", "إرجاع فاتورة")
        except Exception as exc:
            log.warning("auto-accounting refund %s failed: %s", p.get("sale_id"), exc)


async def handle_sale_deleted(event: Event) -> None:
    """p190: sale deleted → audit row + auto reversal journal entry."""
    p = event.payload or {}
    await main_db.inventory_movements.insert_one({
        "id": event.event_id,
        "event_type": "sale.deleted",
        "sale_id": p.get("sale_id"),
        "tenant_id": event.tenant_id,
        "amount": float(p.get("total", 0) or 0),
        "reason": p.get("reason", ""),
        "created_at": _utc_now_iso(),
        "correlation_id": event.metadata.correlation_id,
    })
    if event.tenant_id and event.tenant_id != "platform":
        try:
            from services.accounting_auto import post_sale_reversal
            await post_sale_reversal(get_tenant_db(event.tenant_id), p, "delete", "حذف فاتورة")
        except Exception as exc:
            log.warning("auto-accounting delete %s failed: %s", p.get("sale_id"), exc)


# ── Phase 3: ecom_order.confirmed ───────────────────────────────────────────
def _fulfillment_steps():
    """p192: ecom fulfillment saga steps (action, compensation)."""
    from services.saga import SagaStep

    async def deduct(tdb, ctx):
        deducted = []
        for it in ctx.get("items") or []:
            pid = it.get("product_id")
            qty = int(it.get("quantity", 0) or 0)
            if not pid or qty <= 0:
                continue
            # guarded atomic claim on the REAL stock field (`quantity` — the
            # legacy EDA handler mistakenly decremented a stray `stock` field)
            res = await tdb.products.find_one_and_update(
                {"id": pid, "quantity": {"$gte": qty}},
                {"$inc": {"quantity": -qty}},
            )
            if res is None:
                ctx["_deducted"] = deducted
                raise ValueError(f"insufficient stock for product {pid} (need {qty})")
            deducted.append((pid, qty))
        ctx["_deducted"] = deducted

    async def restore(tdb, ctx):
        # two paths: (a) in-memory partial failure — _deducted tracks exactly
        # what was claimed; (b) later compensation of a COMPLETED saga loaded
        # from the DB — context has no _deducted, so restore all items.
        if "_deducted" in ctx:
            to_restore = ctx["_deducted"]
        else:
            to_restore = [(it.get("product_id"), int(it.get("quantity", 0) or 0))
                          for it in ctx.get("items") or []]
        for pid, qty in to_restore:
            if pid and qty > 0:
                await tdb.products.update_one({"id": pid}, {"$inc": {"quantity": qty}})

    async def mark(tdb, ctx):
        await tdb.ecom_orders.update_one(
            {"id": ctx["order_id"]},
            {"$set": {"fulfillment_status": "stock_reserved", "_eda_stock_deducted": True, "_eda_deducted_at": _utc_now_iso()}},
        )

    async def unmark(tdb, ctx):
        await tdb.ecom_orders.update_one(
            {"id": ctx["order_id"]},
            {"$set": {"fulfillment_status": None, "_eda_stock_deducted": False}},
        )

    async def notify(tdb, ctx):
        await tdb.notifications.insert_one({
            "id": f"ntf_{ctx['order_id'][:8]}_fulfill",
            "type": "ecom_fulfillment",
            "message_ar": f"طلب إلكتروني {ctx['order_id'][:8]} — حُجز المخزون وجاهز للتحضير",
            "message_en": f"E-com order {ctx['order_id'][:8]} — stock reserved",
            "reference_id": ctx["order_id"],
            "read": False,
            "created_at": _utc_now_iso(),
        })

    async def unnotify(tdb, ctx):
        await tdb.notifications.delete_many({"reference_id": ctx["order_id"], "type": "ecom_fulfillment"})

    return [
        SagaStep("deduct_stock", deduct, restore),
        SagaStep("mark_order", mark, unmark),
        SagaStep("notify", notify, unnotify),
    ]
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
    # p192: fulfillment saga (idempotent — one running/completed saga per order)
    from services.saga import run_saga
    existing = await tdb.sagas.find_one({
        "name": "ecom_fulfillment", "context.order_id": order_id,
        "status": {"$in": ["running", "completed"]},
    })
    if existing:
        log.debug("fulfillment saga already ran for order %s — skipping", order_id)
    else:
        saga_doc = await run_saga(tdb, "ecom_fulfillment", _fulfillment_steps(),
                                  {"order_id": order_id, "items": items})
        log.info("fulfillment saga %s for order %s", saga_doc["status"], order_id)

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
    # p192: compensate the fulfillment saga if it completed
    from services.saga import compensate_saga
    saga = await tdb.sagas.find_one({"name": "ecom_fulfillment", "context.order_id": order_id})
    if saga and saga.get("status") == "completed":
        await compensate_saga(tdb, saga["id"], _fulfillment_steps())
        await tdb.ecom_orders.update_one({"id": order_id}, {"$set": {"fulfillment_status": "cancelled"}})
        log.info("fulfillment saga compensated for cancelled order %s", order_id)
    else:
        order = await tdb.ecom_orders.find_one({"id": order_id}, {"_id": 0, "items": 1, "_eda_stock_deducted": 1})
        if order and order.get("_eda_stock_deducted"):
            # legacy path: EDA had decremented a stray `stock` field (never the
            # real `quantity`) — clean the stray field, nothing else to restore
            for it in order.get("items") or []:
                pid = it.get("product_id")
                if pid:
                    await tdb.products.update_one({"id": pid}, {"$unset": {"stock": ""}})
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
# ── p193: tenant purchase & expense accounting ──────────────────────────────
async def handle_purchase_recorded(event: Event) -> None:
    """Tenant purchase recorded → auto journal entry (Dr inventory / Cr cash+AP)."""
    p = event.payload or {}
    if not event.tenant_id or event.tenant_id == "platform":
        return
    try:
        from services.accounting_auto import post_purchase_entry
        await post_purchase_entry(get_tenant_db(event.tenant_id), p)
        log.info("purchase auto-entry: tenant=%s purchase=%s", event.tenant_id, p.get("purchase_id"))
    except Exception as exc:
        log.warning("auto-accounting purchase %s failed: %s", p.get("purchase_id"), exc)


async def handle_expense_created(event: Event) -> None:
    """Tenant expense created → auto journal entry (Dr expenses / Cr cash-box)."""
    p = event.payload or {}
    if not event.tenant_id or event.tenant_id == "platform":
        return
    try:
        from services.accounting_auto import post_expense_entry
        await post_expense_entry(get_tenant_db(event.tenant_id), p)
    except Exception as exc:
        log.warning("auto-accounting expense %s failed: %s", p.get("expense_id"), exc)


async def handle_expense_deleted(event: Event) -> None:
    """Tenant expense deleted → auto reversal entry."""
    p = event.payload or {}
    if not event.tenant_id or event.tenant_id == "platform":
        return
    try:
        from services.accounting_auto import post_expense_reversal
        await post_expense_reversal(get_tenant_db(event.tenant_id), p)
    except Exception as exc:
        log.warning("auto-accounting expense-delete %s failed: %s", p.get("expense_id"), exc)


async def handle_expense_updated(event: Event) -> None:
    """Tenant expense edited → auto adjustment entry (reverse old + post new)."""
    p = event.payload or {}
    if not event.tenant_id or event.tenant_id == "platform":
        return
    try:
        from services.accounting_auto import post_expense_adjustment
        await post_expense_adjustment(get_tenant_db(event.tenant_id), p)
    except Exception as exc:
        log.warning("auto-accounting expense-update %s failed: %s", p.get("expense_id"), exc)


# ── p195: debt settlement accounting ─────────────────────────────────────────
async def handle_customer_payment_received(event: Event) -> None:
    """Customer debt payment received → auto journal entry (Dr box / Cr AR 411)."""
    p = event.payload or {}
    if not event.tenant_id or event.tenant_id == "platform":
        return
    try:
        from services.accounting_auto import post_customer_payment_entry
        await post_customer_payment_entry(get_tenant_db(event.tenant_id), p)
        log.info("customer-payment auto-entry: tenant=%s payment=%s", event.tenant_id, p.get("payment_id"))
    except Exception as exc:
        log.warning("auto-accounting customer-payment %s failed: %s", p.get("payment_id"), exc)


async def handle_supplier_payment_made(event: Event) -> None:
    """Supplier debt payment made → auto journal entry (Dr AP 401 / Cr box)."""
    p = event.payload or {}
    if not event.tenant_id or event.tenant_id == "platform":
        return
    try:
        from services.accounting_auto import post_supplier_payment_entry
        await post_supplier_payment_entry(get_tenant_db(event.tenant_id), p)
        log.info("supplier-payment auto-entry: tenant=%s payment=%s", event.tenant_id, p.get("payment_id"))
    except Exception as exc:
        log.warning("auto-accounting supplier-payment %s failed: %s", p.get("payment_id"), exc)


def register_handlers(bus: RedisEventBus) -> None:
    bus.register("purchase.created", handle_purchase_created)
    bus.register("purchase.codes_uploaded", handle_purchase_codes_uploaded)
    bus.register("sale.completed", handle_sale_completed)
    bus.register("sale.refunded", handle_sale_refunded)
    bus.register("sale.deleted", handle_sale_deleted)  # p190
    bus.register("purchase.recorded", handle_purchase_recorded)  # p193
    bus.register("expense.created", handle_expense_created)  # p193
    bus.register("expense.deleted", handle_expense_deleted)  # p193
    bus.register("expense.updated", handle_expense_updated)  # p201
    bus.register("customer.payment_received", handle_customer_payment_received)  # p195
    bus.register("supplier.payment_made", handle_supplier_payment_made)  # p195
    bus.register("ecom_order.confirmed", handle_ecom_order_confirmed)
    bus.register("ecom_order.cancelled", handle_ecom_order_cancelled)
    bus.register("tenant.subscription.expired", handle_tenant_subscription_expired)
    bus.register("tenant.subscription.renewed", handle_tenant_subscription_renewed)
    bus.register("test.ping", handle_test_ping)
    log.info("Event consumers registered: %d handlers", len(bus._handlers))


__all__ = ["register_handlers"]
