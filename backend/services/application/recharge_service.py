"""Recharge application service — the create-recharge compensating saga.

Owns: mode resolution, wallet debit, cashbox/credit-sale side effects,
bridge task dispatch, and full rollback on any failure.
"""
from datetime import datetime, timezone
import logging
import uuid

import httpx
from fastapi import HTTPException

from routes.recharge.helpers import _assert_safe_bridge_url

logger = logging.getLogger(__name__)


async def execute_recharge_saga(db, main_db, effective_config: dict, recharge, user: dict) -> dict:
    """Run the full recharge creation saga. Returns the recharge document.
    Raises HTTPException on validation/dispatch failure (after rollback).
    """
    recharge_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    operator_config = effective_config.get(recharge.operator)
    if not operator_config:
        raise HTTPException(status_code=400, detail="Invalid operator")

    # --- Resolve recharge mode for this tenant ---
    entity_id_for_mode = user.get("tenant_id") or user.get("id", "")
    tenant_doc = None
    if entity_id_for_mode and main_db is not None:
        tenant_doc = await main_db.saas_tenants.find_one(
            {"id": entity_id_for_mode},
            {"_id": 0, "recharge_mode": 1, "self_bridge_url": 1, "self_bridge_api_key": 1},
        )
    recharge_mode = (tenant_doc.get("recharge_mode", "owner_bridge") if tenant_doc else "owner_bridge")
    self_bridge_url = ""
    self_bridge_api_key = ""
    if recharge_mode == "self_bridge":
        self_bridge_url = (tenant_doc.get("self_bridge_url", "") if tenant_doc else "")
        self_bridge_api_key = (tenant_doc.get("self_bridge_api_key", "") if tenant_doc else "")
        if not self_bridge_url:
            raise HTTPException(
                status_code=400,
                detail="الجسر غير مُعدّ — تواصل مع مدير النظام لإعداد رابط الجسر الخاص",
            )

    # Calculate cost and profit
    commission_rate = operator_config.get("commission", 0) / 100
    profit = recharge.amount * commission_rate
    cost = recharge.amount - profit

    # Get customer name
    customer_name = "عميل نقدي"
    if recharge.customer_id:
        customer = await db.customers.find_one({"id": recharge.customer_id}, {"_id": 0, "name": 1})
        if customer:
            customer_name = customer["name"]
        # p170: tag customer category (زبون شحن الرصيد)
        from services.customer_sources import tag_customer_source, SOURCE_RECHARGE
        await tag_customer_source(db, SOURCE_RECHARGE, customer_id=recharge.customer_id)

    # Generate USSD code
    ussd_template = operator_config["ussd"].get(recharge.recharge_type, "")
    ussd_code = ussd_template.replace("{phone}", recharge.phone_number).replace("{amount}", str(int(recharge.amount)))

    # Generate recharge operation code (RE00001/YY)
    from services.code_generator import generate_code
    recharge_code = await generate_code(db, "recharges", "RE", 5, with_year=True)

    # Debit the platform wallet by the recharge cost — blocks (HTTP 400) if balance is insufficient.
    from services.wallet_service import debit_wallet, credit_wallet
    entity_id = user.get("tenant_id") or user.get("id", "")
    wallet_txn_id = str(uuid.uuid4())  # generate txn id so we can store it on the task
    await debit_wallet(
        main_db, entity_id, cost, "recharge", wallet_txn_id,
        f"شحن {operator_config['name']} - {recharge.phone_number} ({recharge_code})",
        user.get("name", ""),
    )

    # p205: platform commission ledger — platform margin = (platform% − tenant%) × amount.
    # platform_commission defaults to the tenant rate (margin 0) until the owner
    # configures their real upstream deal via /saas/recharge-config.
    from services.commission_engine import record_platform_commission, reverse_platform_commission
    await record_platform_commission(
        main_db,
        service_type="recharge", tenant_id=entity_id,
        reference_type="recharge", reference_id=recharge_id,
        gross_amount=recharge.amount,
        tenant_commission_pct=operator_config.get("commission", 0),
        platform_commission_pct=operator_config.get("platform_commission", operator_config.get("commission", 0)),
        operator=recharge.operator,
        meta={"phone_number": recharge.phone_number, "code": recharge_code},
    )

    bridge_task_id = str(uuid.uuid4())
    txn_record_id = str(uuid.uuid4())
    recharge_doc = {
        "id": recharge_id,
        "code": recharge_code,
        "operator": recharge.operator,
        "operator_name": operator_config["name"],
        "phone_number": recharge.phone_number,
        "amount": recharge.amount,
        "recharge_type": recharge.recharge_type,
        "cost": cost,
        "profit": profit,
        "customer_id": recharge.customer_id or "",
        "customer_name": customer_name,
        "payment_method": recharge.payment_method,
        "status": "pending",
        "ussd_code": ussd_code,
        "bridge_task_id": bridge_task_id,
        "wallet_txn_id": wallet_txn_id,  # stored for reliable refund correlation
        "entity_id": entity_id,           # stored so bridge result handler can refund without extra query
        "notes": recharge.notes or "",
        "created_at": now,
        "created_by": user["name"],
    }

    # --- Compensating saga: rollback ALL side-effects on any failure ---
    recharge_inserted = False
    cashbox_updated = False
    txn_inserted = False
    sale_cash_inserted = False
    bridge_task_inserted = False
    is_credit_sale = recharge.payment_method == "credit"
    try:
        await db.recharges.insert_one(recharge_doc)
        recharge_inserted = True

        if is_credit_sale:
            # Credit (آجل) — register a debt sale row instead of cashbox income
            if not recharge.customer_id:
                raise HTTPException(status_code=400, detail="البيع الآجل يتطلب اختيار زبون")
            sale_id_credit = str(uuid.uuid4())
            await db.sales.insert_one({
                "id": sale_id_credit,
                "invoice_number": f"FLEXY-{recharge_id[:6].upper()}",
                "items": [{
                    "name": f"شحن {operator_config['name']} - {recharge.phone_number}",
                    "quantity": 1, "price": recharge.amount, "discount": 0,
                    "is_recharge": True, "recharge_id": recharge_id,
                }],
                "subtotal": recharge.amount, "discount_total": 0, "tax_total": 0,
                "total": recharge.amount, "paid_amount": 0, "debt_amount": recharge.amount,
                "payment_method": "credit",
                "customer_id": recharge.customer_id, "customer_name": customer_name,
                "type": "recharge_credit", "source": "pos_quick_flexy",
                "user_id": user.get("id"), "user_name": user.get("name", ""),
                "created_at": now,
            })
            # Update user's open daily session
            try:
                await db.daily_sessions.update_one(
                    {"user_id": user.get("id"), "status": "open"},
                    {"$inc": {"total_sales": recharge.amount, "credit_sales": recharge.amount, "sales_count": 1}},
                )
            except Exception as _se:
                pass
        else:
            # Cash / bank / wallet — update cashbox like before
            await db.cash_boxes.update_one(
                {"id": recharge.payment_method},
                {"$inc": {"balance": recharge.amount}, "$set": {"updated_at": now}}
            )
            cashbox_updated = True

            await db.transactions.insert_one({
                "id": txn_record_id,
                "cash_box_id": recharge.payment_method,
                "type": "income",
                "amount": recharge.amount,
                "description": f"شحن {operator_config['name']} - {recharge.phone_number}",
                "reference_type": "recharge",
                "reference_id": recharge_id,
                "created_at": now,
                "created_by": user["name"],
            })
            txn_inserted = True

            # p165: record the cash recharge in the sales journal too (المبيعات اليومية والسجل)
            # purchase_price = cost → profit reports compute amount − cost = commission automatically
            sale_id_cash = str(uuid.uuid4())
            await db.sales.insert_one({
                "id": sale_id_cash,
                "invoice_number": f"FLEXY-{recharge_id[:6].upper()}",
                "items": [{
                    "product_id": None,
                    "product_name": f"شحن {operator_config['name']} - {recharge.phone_number}",
                    "name": f"شحن {operator_config['name']} - {recharge.phone_number}",
                    "quantity": 1, "unit_price": recharge.amount, "price": recharge.amount,
                    "purchase_price": cost, "discount": 0, "total": recharge.amount,
                    "is_recharge": True, "recharge_id": recharge_id,
                }],
                "subtotal": recharge.amount, "discount": 0, "discount_total": 0, "tax_total": 0,
                "total": recharge.amount, "paid_amount": recharge.amount, "debt_amount": 0,
                "remaining": 0, "payment_method": recharge.payment_method, "payment_type": "cash",
                "payments": [{"amount": recharge.amount, "method": recharge.payment_method, "at": now}],
                "customer_id": recharge.customer_id or None, "customer_name": customer_name,
                "type": "recharge_cash", "source": "pos_quick_flexy",
                "status": "paid",
                "user_id": user.get("id"), "user_name": user.get("name", ""),
                "created_at": now, "created_by": user.get("name", ""),
            })
            sale_cash_inserted = True
            # Also update daily_sessions for cash sales
            try:
                await db.daily_sessions.update_one(
                    {"user_id": user.get("id"), "status": "open"},
                    {"$inc": {"total_sales": recharge.amount, "cash_sales": recharge.amount, "sales_count": 1}},
                )
            except Exception as _se:
                pass

        # --- Dispatch bridge task based on recharge_mode ---
        bridge_task_doc = {
            "id": bridge_task_id,
            "recharge_id": recharge_id,
            "wallet_txn_id": wallet_txn_id,
            "entity_id": entity_id,
            "operator": recharge.operator,
            "operator_name": operator_config["name"],
            "phone_number": recharge.phone_number,
            "amount": recharge.amount,
            "recharge_type": recharge.recharge_type,
            "ussd_code": ussd_code,
            "status": "pending",
            "dispatched_via": "direct" if recharge_mode == "self_bridge" else "queue",
            "created_at": now,
            "updated_at": now,
            "result_message": "",
        }
        await db.mobile_recharge_tasks.insert_one(bridge_task_doc)
        bridge_task_inserted = True

        if recharge_mode == "self_bridge":
            # SELF_BRIDGE: push task directly to tenant's local bridge HTTP endpoint.
            # The bridge processes the task and reports result via PATCH /bridge/tasks/{id}/result.
            _assert_safe_bridge_url(self_bridge_url)
            dispatch_url = self_bridge_url.rstrip("/") + "/tasks"
            dispatch_payload = {k: v for k, v in bridge_task_doc.items() if k != "_id"}
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    push_resp = await client.post(
                        dispatch_url,
                        json=dispatch_payload,
                        headers={"X-Api-Key": self_bridge_api_key} if self_bridge_api_key else {},
                    )
                if push_resp.status_code >= 400:
                    raise RuntimeError(f"bridge rejected task: HTTP {push_resp.status_code}")
            except Exception as bridge_exc:
                # Bridge unreachable — raise so the saga rolls back wallet + DB records
                raise HTTPException(
                    status_code=503,
                    detail=f"تعذّر إرسال المهمة إلى الجسر المحلي — تحقق من تشغيل الجسر: {bridge_exc}",
                )
        # OWNER_BRIDGE: task already in DB; platform owner's bridge polls and picks it up.
    except Exception as e:
        logger.exception("Recharge creation saga failed for %s — rolling back", recharge_id)
        # Reverse in reverse order — best-effort, log failures
        if bridge_task_inserted:
            try:
                await db.mobile_recharge_tasks.delete_one({"id": bridge_task_id})
            except Exception:
                logger.exception("Rollback: failed to delete bridge task %s", bridge_task_id)
        if txn_inserted:
            try:
                await db.transactions.delete_one({"id": txn_record_id})
            except Exception:
                logger.exception("Rollback: failed to delete transaction %s", txn_record_id)
        if sale_cash_inserted:
            try:
                await db.sales.delete_one({"invoice_number": f"FLEXY-{recharge_id[:6].upper()}", "type": "recharge_cash"})
            except Exception:
                logger.exception("Rollback: failed to delete cash sale row for recharge %s", recharge_id)
        if cashbox_updated:
            try:
                await db.cash_boxes.update_one(
                    {"id": recharge.payment_method},
                    {"$inc": {"balance": -recharge.amount}, "$set": {"updated_at": now}},
                )
            except Exception:
                logger.exception("Rollback: failed to reverse cash_box for recharge %s", recharge_id)
        if recharge_inserted:
            try:
                await db.recharges.delete_one({"id": recharge_id})
            except Exception:
                logger.exception("Rollback: failed to delete recharge %s", recharge_id)
        try:
            await credit_wallet(
                main_db, entity_id, cost, "recharge_refund", wallet_txn_id,
                f"استرجاع شحن فاشل {recharge_code}", user.get("name", ""),
            )
        except Exception:
            logger.exception("Rollback: failed to compensate wallet for recharge %s", recharge_id)
        try:
            await reverse_platform_commission(
                main_db, reference_type="recharge", reference_id=recharge_id,
                reason="recharge_saga_rollback",
            )
        except Exception:
            logger.exception("Rollback: failed to reverse commission for recharge %s", recharge_id)
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=500, detail="فشل تسجيل عملية الشحن") from e

    return recharge_doc
