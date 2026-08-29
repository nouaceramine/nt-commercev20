"""Sales application service — create/delete/return sale operations.

Owns invoice numbering, stock deduction, customer balance, cashbox side
effects, installment scheduling, audit logging and the sale.completed event.
"""
from datetime import datetime, timezone, timedelta
import uuid

from fastapi import HTTPException


async def generate_invoice_number(db, prefix: str) -> str:
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    count = await db.counters.find_one_and_update(
        {"_id": f"{prefix}_{today}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return f"{prefix}-{today}-{count['seq']:04d}"


async def create_sale_op(db, s, user: dict) -> dict:
    """p189: ACID wrapper — stock claims, serials, sale doc, installments,
    notifications, customer stats, cash box and the outbox event all commit
    atomically in one MongoDB transaction; any failure aborts everything."""
    from config.database import client
    from pymongo.errors import DuplicateKeyError
    for _attempt in range(2):
        try:
            async with await client.start_session() as _tx_session:
                async with _tx_session.start_transaction():
                    return await _create_sale_impl(db, s, user, _tx_session)
        except DuplicateKeyError:
            if _attempt == 1:
                raise
            # p348: كود مُدخل من العميل تسابق مع عامل آخر (فاتورة مجزأة) —
            # المعاملة أُجهضت بالكامل؛ اسحب كوداً ذرياً جديداً وأعد العملية كلها
            from services.code_generator import next_code as _next_sale_code
            s.code = await _next_sale_code(db, "sales", "BV", 4, True)



async def _create_sale_impl(db, s, user: dict, _tx) -> dict:
    """Create a sale with all side effects. Returns the sale document."""
    sale_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    invoice_number = await generate_invoice_number(db, "INV")

    customer_name = "عميل نقدي"
    if s.customer_id:
        customer = await db.customers.find_one({"id": s.customer_id})
        if customer:
            customer_name = customer["name"]
        # p170: tag customer category (زبون المحل)
        from services.customer_sources import tag_customer_source, SOURCE_POS
        await tag_customer_source(db, SOURCE_POS, customer_id=s.customer_id)

    if s.payment_type in ["credit", "partial"] and not s.customer_id:
        raise HTTPException(status_code=400, detail="Customer required for credit sale")

    # ── Atomic stock claim (all-or-nothing) — BEFORE any side effect ──
    # Same pattern as services/digital_inventory.claim_codes: conditional
    # find_one_and_update per product; any shortfall rolls back prior claims
    # and rejects the sale 400. Non-catalog lines (no product_id) and
    # is_non_stockable products are exempt, preserving prior semantics.
    _claim_qty = {}
    _claim_variants = {}  # p184: (pid, color, size) -> qty
    for item in s.items:
        if item.product_id:
            _claim_qty[item.product_id] = _claim_qty.get(item.product_id, 0) + item.quantity
            _v = getattr(item, "variant", None) or {}
            if _v.get("color") or _v.get("size"):
                _vk = (item.product_id, _v.get("color") or "", _v.get("size") or "")
                _claim_variants[_vk] = _claim_variants.get(_vk, 0) + item.quantity
    _claimed = []
    _claimed_variants = []

    async def _rollback_claims():
        for cid, cqty in _claimed:
            await db.products.update_one({"id": cid}, {"$inc": {"quantity": cqty}}, session=_tx)
        for vpid, vc, vsz, vqty in _claimed_variants:
            await db.products.update_one(
                {"id": vpid, "variants": {"$elemMatch": {"color": vc, "size": vsz}}},
                {"$inc": {"variants.$.quantity": vqty}},
                session=_tx,
            )

    for pid, qty in _claim_qty.items():
        product = await db.products.find_one({"id": pid}, {"_id": 0, "name_ar": 1, "name_en": 1, "quantity": 1, "is_non_stockable": 1})
        if not product or product.get("is_non_stockable"):
            continue
        res = await db.products.find_one_and_update(
            {"id": pid, "quantity": {"$gte": qty}},
            {"$inc": {"quantity": -qty}},
            session=_tx,
        )
        if res is None:
            await _rollback_claims()
            pname = product.get("name_ar") or product.get("name_en") or pid
            raise HTTPException(
                status_code=400,
                detail=f"مخزون غير كافٍ للمنتج '{pname}': المتاح {product.get('quantity', 0)} والمطلوب {qty}",
            )
        _claimed.append((pid, qty))

    # p184: variant-level claims — after all product-level claims succeed
    for (pid, vcolor, vsize), vqty in _claim_variants.items():
        product = await db.products.find_one({"id": pid}, {"_id": 0, "name_ar": 1, "name_en": 1, "has_variants": 1, "variants": 1})
        if not product or not product.get("has_variants"):
            continue
        vres = await db.products.find_one_and_update(
            {"id": pid, "variants": {"$elemMatch": {"color": vcolor, "size": vsize, "quantity": {"$gte": vqty}}}},
            {"$inc": {"variants.$.quantity": -vqty}},
            session=_tx,
        )
        if vres is None:
            await _rollback_claims()
            pname = product.get("name_ar") or product.get("name_en") or pid
            vlabel = " / ".join(x for x in [vcolor, vsize] if x)
            vstock = next(
                (v.get("quantity", 0) for v in (product.get("variants") or [])
                 if (v.get("color") or "") == vcolor and (v.get("size") or "") == vsize),
                0,
            )
            raise HTTPException(
                status_code=400,
                detail=f"مخزون غير كافٍ للمتغير «{vlabel}» من '{pname}': المتاح {vstock} والمطلوب {vqty}",
            )
        _claimed_variants.append((pid, vcolor, vsize, vqty))

    # p187: serial-number tracking — reject already-sold serials, mark sold
    for item in s.items:
        _sn = (getattr(item, "serial_number", None) or "").strip()
        if not _sn or not item.product_id:
            continue
        if item.quantity < 0:  # return line: serial goes back in stock
            await db.product_serials.update_many(
                {"serial": _sn, "status": "sold"},
                {"$set": {"status": "in_stock", "sale_id": None, "sold_at": None, "updated_at": now}},
                session=_tx,
            )
            continue
        _existing = await db.product_serials.find_one({"serial": _sn})
        if _existing and _existing.get("status") == "sold":
            await _rollback_claims()
            raise HTTPException(status_code=400, detail=f"الرقم التسلسلي «{_sn}» مُباع مسبقاً")
        if _existing:
            await db.product_serials.update_one(
                {"id": _existing["id"]},
                {"$set": {"status": "sold", "sale_id": sale_id, "sold_at": now, "updated_at": now}},
                session=_tx,
            )
        else:
            await db.product_serials.insert_one({
                "id": str(uuid.uuid4()), "product_id": item.product_id, "serial": _sn,
                "status": "sold", "sale_id": sale_id, "sold_at": now, "created_at": now,
            }, session=_tx)

    delivery_fee = 0
    delivery_info = None
    if s.delivery and s.delivery.enabled:
        delivery_fee = s.delivery.fee
        delivery_info = {
            "enabled": True, "wilaya_code": s.delivery.wilaya_code,
            "wilaya_name": s.delivery.wilaya_name, "city": s.delivery.city,
            "address": s.delivery.address, "delivery_type": s.delivery.delivery_type,
            "fee": delivery_fee
        }

    final_total = s.total + delivery_fee
    if s.payment_type == "installment" and s.installment_plan:
        s.paid_amount = s.installment_plan.down_payment
    remaining = final_total - s.paid_amount
    # p58: mirror debt whenever the sale is under-paid AND has a customer,
    # regardless of the payment_type label (a "cash" sale paid 100/3600
    # previously recorded remaining=3500 on the invoice but 0 on the customer).
    debt_amount = remaining if (s.payment_type in ["credit", "partial", "installment"] or (s.customer_id and remaining > 0)) else 0
    status = "paid" if remaining <= 0 else ("partial" if s.paid_amount > 0 else "unpaid")

    # p303: recipe-linked items (restaurant dishes) — consume raw ingredients
    # from stock and cost the line by its recipe, so COGS (600) is real.
    # Deduction never blocks the sale (kitchen reality: ingredients may go
    # negative until a purchase lands); returns/deletes restore exactly the
    # stored signed consumption.
    _recipe_map = {}
    for item in s.items:
        if not item.product_id or item.product_id in _recipe_map:
            continue
        recipe = await db.recipes.find_one({"product_id": item.product_id}, {"_id": 0})
        if not recipe:
            continue
        out_qty = recipe.get("output_qty") or 1
        unit_cost = 0.0
        components = []
        for c in (recipe.get("components") or []):
            cp = await db.products.find_one({"id": c["product_id"]}, {"_id": 0, "purchase_price": 1})
            ccost = (cp.get("purchase_price") if cp else None)
            if ccost is None:
                ccost = c.get("unit_cost", 0) or 0
            per_unit = (c.get("quantity") or 0) / out_qty
            unit_cost += per_unit * (ccost or 0)
            components.append({"product_id": c["product_id"], "per_unit": per_unit})
        _recipe_map[item.product_id] = {
            "recipe_id": recipe.get("id"),
            "unit_cost": round(unit_cost, 2),
            "components": components,
        }
    _consumption_by_idx = {}
    for _idx, item in enumerate(s.items):
        _rc = _recipe_map.get(item.product_id) if item.product_id else None
        if not _rc or not item.quantity:
            continue
        consumption = []
        for comp in _rc["components"]:
            cons_qty = round(comp["per_unit"] * item.quantity, 4)
            if not cons_qty:
                continue
            await db.products.update_one(
                {"id": comp["product_id"]},
                {"$inc": {"quantity": -cons_qty}},
                session=_tx,
            )
            consumption.append({"product_id": comp["product_id"], "quantity": cons_qty})
        if consumption:
            _consumption_by_idx[_idx] = consumption
    # p308: modifier options linked to stock products are consumed per dish unit
    # (merged into recipe_consumption so return/delete restore them automatically)
    _mod_cost_by_idx = {}  # p317: per-unit modifier ingredient cost -> COGS
    for _idx, item in enumerate(s.items):
        if not item.quantity:
            continue
        for _m in (getattr(item, "modifiers", None) or []):
            if not isinstance(_m, dict):
                continue
            _mp = _m.get("product_id")
            if not _mp:
                continue
            try:
                _mq = round(float(_m.get("qty") or 1) * item.quantity, 4)
            except (TypeError, ValueError):
                continue
            if not _mq:
                continue
            await db.products.update_one(
                {"id": _mp},
                {"$inc": {"quantity": -_mq}},
                session=_tx,
            )
            _consumption_by_idx.setdefault(_idx, []).append(
                {"product_id": _mp, "quantity": _mq}
            )
            # p317: the modifier's ingredient cost joins the line's COGS,
            # otherwise inventory value (380) drifts from quantities
            _mpd = await db.products.find_one({"id": _mp}, {"_id": 0, "purchase_price": 1})
            _mpc = (_mpd or {}).get("purchase_price") or 0
            if _mpc:
                _per_unit = round(float(_m.get("qty") or 1) * float(_mpc), 4)
                _mod_cost_by_idx[_idx] = round(_mod_cost_by_idx.get(_idx, 0) + _per_unit, 4)

    enriched_items = []
    for _idx, item in enumerate(s.items):
        item_dict = item.model_dump()
        _rc = _recipe_map.get(item.product_id) if item.product_id else None
        if _rc:
            # p303: dish lines are costed by their recipe (authoritative)
            item_dict["purchase_price"] = _rc["unit_cost"]
            item_dict["recipe_id"] = _rc["recipe_id"]
        # p308: consumption record applies to modifier-only lines too (no recipe)
        _cons = _consumption_by_idx.get(_idx)
        if _cons:
            item_dict["recipe_consumption"] = _cons
        # p317: add modifier ingredient cost on top of recipe/product cost
        _mc = _mod_cost_by_idx.get(_idx)
        if _mc:
            _base = item_dict.get("purchase_price")
            if _base is None:
                _pd = await db.products.find_one({"id": item.product_id}, {"_id": 0, "purchase_price": 1})
                _base = (_pd or {}).get("purchase_price", 0) or 0
            item_dict["purchase_price"] = round(float(_base) + _mc, 4)
        if "purchase_price" not in item_dict or item_dict.get("purchase_price") is None:
            product = await db.products.find_one({"id": item.product_id}, {"_id": 0, "purchase_price": 1})
            item_dict["purchase_price"] = product.get("purchase_price", 0) if product else 0
        enriched_items.append(item_dict)

    # p190: COGS snapshot for the accounting event payload
    cogs = round(sum((it.get("purchase_price") or 0) * abs(it.get("quantity") or 0) for it in enriched_items), 2)

    installment_info = None
    if s.payment_type == "installment" and s.installment_plan:
        plan = s.installment_plan
        remaining_after_down = final_total - plan.down_payment
        interest_amount = remaining_after_down * plan.interest_rate / 100
        total_with_interest = remaining_after_down + interest_amount
        installment_amount = round(total_with_interest / plan.installments_count, 2)
        installment_info = {
            "down_payment": plan.down_payment,
            "installments_count": plan.installments_count,
            "interest_rate": plan.interest_rate,
            "interest_amount": round(interest_amount, 2),
            "installment_amount": installment_amount,
            "total_with_interest": round(final_total - plan.down_payment + interest_amount, 2),
            "frequency": plan.frequency,
            "first_due_date": plan.first_due_date,
        }

    # p167: worker-linked cash box — a worker's cash sales land in HIS box
    resolved_cash_box = s.payment_method
    if s.payment_method == "cash" and s.paid_amount > 0:
        try:
            worker_box = await db.cash_boxes.find_one(
                {"assigned_user_id": user.get("id")}, {"_id": 0, "id": 1})
            if worker_box:
                resolved_cash_box = worker_box["id"]
        except Exception:
            resolved_cash_box = s.payment_method

    # p310b: a client-supplied code that already exists (split-bill parts reuse
    # the prefetched code) is replaced by a fresh atomic one before insert
    if s.code:
        _dup = await db.sales.find_one({"code": s.code}, {"_id": 1}, session=_tx)
        if _dup:
            from services.code_generator import next_code as _next_code
            s.code = await _next_code(db, "sales", "BV", 4, True)

    sale_doc = {
        "id": sale_id, "invoice_number": invoice_number,
        "code": s.code or "",
        "customer_id": s.customer_id, "customer_name": customer_name,
        "items": enriched_items,
        "subtotal": s.subtotal, "discount": s.discount,
        "delivery_fee": delivery_fee, "delivery": delivery_info,
        "total": final_total,
        "paid_amount": s.paid_amount, "debt_amount": debt_amount,
        "remaining": max(0, remaining),
        "payment_method": s.payment_method, "payment_type": s.payment_type,
        "cash_box_id": resolved_cash_box,
        "payments": ([{"amount": s.paid_amount, "method": s.payment_method, "at": now}] if s.paid_amount > 0 else []),  # p67
        "installment_plan": installment_info,
        "status": status,
        "notes": s.notes or "", "created_at": now, "created_by": user["name"]
    }
    await db.sales.insert_one(sale_doc, session=_tx)

    if s.payment_type == "installment" and installment_info:
        first_due = datetime.strptime(installment_info["first_due_date"], "%Y-%m-%d")
        freq_days = 30 if installment_info["frequency"] == "monthly" else 7
        interest_share = round(installment_info["interest_amount"] / installment_info["installments_count"], 2)
        for i in range(installment_info["installments_count"]):
            due = (first_due + timedelta(days=freq_days * i)).strftime("%Y-%m-%d")
            await db.installment_payments.insert_one({
                "id": str(uuid.uuid4()),
                "sale_id": sale_id,
                "invoice_number": invoice_number,
                "customer_id": s.customer_id,
                "customer_name": customer_name,
                "installment_number": i + 1,
                "total_installments": installment_info["installments_count"],
                "amount": installment_info["installment_amount"],
                "interest_share": interest_share,
                "due_date": due,
                "status": "pending",
                "paid_date": None,
                "paid_by": None,
                "created_at": now,
            }, session=_tx)

    for item in s.items:
        product = await db.products.find_one({"id": item.product_id}, session=_tx)
        if product:
            threshold = product.get("low_stock_threshold", 10)
            if product.get("quantity", 0) < threshold:
                await db.notifications.insert_one({
                    "id": str(uuid.uuid4()), "type": "low_stock",
                    "message_en": f"Low stock alert: '{product.get('name_en')}' ({product.get('quantity')} remaining)",
                    "message_ar": f"تنبيه مخزون: '{product.get('name_ar')}' ({product.get('quantity')} متبقي)",
                    "product_id": item.product_id, "read": False, "created_at": now
                }, session=_tx)

    if s.customer_id:
        await db.customers.update_one(
            {"id": s.customer_id},
            {"$inc": {"total_purchases": final_total, "balance": debt_amount, "total_debt": debt_amount}},
            session=_tx,
        )

    if s.paid_amount > 0:
        cash_box_id = resolved_cash_box
        await db.cash_boxes.update_one({"id": cash_box_id}, {"$inc": {"balance": s.paid_amount}, "$set": {"updated_at": now}}, session=_tx)
        await db.transactions.insert_one({
            "id": str(uuid.uuid4()), "cash_box_id": cash_box_id,
            "type": "income", "amount": s.paid_amount,
            "description": f"مبيعات - فاتورة {invoice_number}",
            "reference_type": "sale", "reference_id": sale_id,
            "created_at": now, "created_by": user["name"]
        }, session=_tx)

    sale_doc.pop("_id", None)

    # p189: transactional outbox — the event commits atomically with the sale;
    # the relay publishes it to the Redis bus asynchronously (at-least-once,
    # consumers are idempotent via processed_events).
    from services.outbox import outbox_write
    from config.database import main_db as _main_db
    await outbox_write(
        _main_db,
        "sale.completed",
        {
            "sale_id": sale_id,
            "invoice_number": invoice_number,
            "total": final_total,
            "paid_amount": s.paid_amount,
            "remaining": max(0, remaining),
            "cash_box_id": resolved_cash_box,
            "cogs": cogs,
            "customer_id": s.customer_id,
            "items": [{"product_id": it.product_id, "quantity": it.quantity, "price": it.unit_price} for it in s.items],
            "channel": "pos",
        },
        tenant_id=user.get("tenant_id") or "platform",
        source="sales_service",
        session=_tx,
    )

    # p273: bust dashboard caches so stats stay fresh after a new sale
    try:
        from services.cache_service import cache as _cache
        _tid = user.get("tenant_id") or "main"
        for _p in ("dashboard", "sales", "profit"):
            _cache.delete(f"stats:{_p}:{_tid}")
        _cache.delete_pattern(f"stats:dailyfull:{_tid}:*")
    except Exception:
        pass

    return sale_doc


async def delete_sale_op(db, sale_id: str, reason: str, user: dict) -> None:
    """p189: ACID wrapper — full reversal commits atomically in one transaction."""
    from config.database import client
    async with await client.start_session() as _tx_session:
        async with _tx_session.start_transaction():
            await _delete_sale_impl(db, sale_id, reason, user, _tx_session)


async def _delete_sale_impl(db, sale_id: str, reason: str, user: dict, _tx) -> None:
    """Delete a sale: restore stock, revert customer stats, reverse cash, audit-log."""
    sale = await db.sales.find_one({"id": sale_id})
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    if not reason:
        raise HTTPException(status_code=400, detail="يجب إدخال سبب الحذف")
    now = datetime.now(timezone.utc).isoformat()
    for item in sale.get("items", []):
        await db.products.update_one({"id": item["product_id"]}, {"$inc": {"quantity": item["quantity"]}}, session=_tx)
        for _cons in (item.get("recipe_consumption") or []):  # p303: restore consumed ingredients
            if _cons.get("product_id") and _cons.get("quantity"):
                await db.products.update_one({"id": _cons["product_id"]}, {"$inc": {"quantity": _cons["quantity"]}}, session=_tx)
        _v = item.get("variant") or {}  # p184
        if _v.get("color") or _v.get("size"):
            await db.products.update_one(
                {"id": item["product_id"], "variants": {"$elemMatch": {"color": _v.get("color") or "", "size": _v.get("size") or ""}}},
                {"$inc": {"variants.$.quantity": item["quantity"]}},
                session=_tx,
            )
        _sn = (item.get("serial_number") or "").strip()  # p187: serial back in stock
        if _sn:
            await db.product_serials.update_many(
                {"serial": _sn, "sale_id": sale_id},
                {"$set": {"status": "in_stock", "sale_id": None, "sold_at": None, "updated_at": now}},
                session=_tx,
            )
    if sale.get("customer_id"):
        await db.customers.update_one(
            {"id": sale["customer_id"]},
            {"$inc": {"total_purchases": -sale.get("total", 0), "balance": -sale.get("remaining", 0), "total_debt": -sale.get("remaining", 0)}},
            session=_tx,
        )
    payments_log = sale.get("payments") or []
    if payments_log:
        # p67: reverse each payment from the box it actually entered
        for pay in payments_log:
            m = pay.get("method")
            if pay.get("amount", 0) > 0 and m:  # p68
                await db.cash_boxes.update_one({"id": m}, {"$inc": {"balance": -pay["amount"]}, "$set": {"updated_at": now}}, session=_tx)
                await db.transactions.insert_one({
                    "id": str(uuid.uuid4()), "cash_box_id": m,
                    "type": "expense", "amount": pay["amount"],
                    "description": f"حذف مبيعات - فاتورة {sale.get('invoice_number', '')}",
                    "reference_type": "sale_delete", "reference_id": sale_id,
                    "created_at": now, "created_by": user.get("name", "")
                }, session=_tx)
    elif sale.get("paid_amount", 0) > 0:
        cash_box_id = sale.get("cash_box_id") or sale.get("payment_method")
        if cash_box_id:
            await db.cash_boxes.update_one(
                {"id": cash_box_id},
                {"$inc": {"balance": -sale["paid_amount"]}, "$set": {"updated_at": now}},
                session=_tx,
            )
            await db.transactions.insert_one({
                "id": str(uuid.uuid4()), "cash_box_id": cash_box_id,
                "type": "expense", "amount": sale["paid_amount"],
                "description": f"حذف مبيعات - فاتورة {sale.get('invoice_number', '')}",
                "reference_type": "sale_delete", "reference_id": sale_id,
                "created_at": now, "created_by": user.get("name", "")
            }, session=_tx)
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "action": "delete_sale",
        "entity_type": "sale", "entity_id": sale_id,
        "entity_ref": sale.get("invoice_number", ""),
        "reason": reason, "performed_by": user.get("name", ""),
        "performed_by_id": user.get("id", ""),
        "sale_total": sale.get("total", 0),
        "snapshot": {k: v for k, v in sale.items() if k != "_id"},
        "created_at": now
    }, session=_tx)
    await db.sales.delete_one({"id": sale_id}, session=_tx)

    # p189: outbox event (same transaction)
    from services.outbox import outbox_write
    from config.database import main_db as _main_db
    await outbox_write(
        _main_db, "sale.deleted",
        {
            "sale_id": sale_id, "invoice_number": sale.get("invoice_number", ""), "total": sale.get("total", 0),
            "reason": reason,
            "paid_amount": sale.get("paid_amount", 0),
            "cash_box_id": sale.get("cash_box_id") or sale.get("payment_method"),
            "remaining": sale.get("remaining", 0),
            "cogs": round(sum((it.get("purchase_price") or 0) * abs(it.get("quantity") or 0) for it in sale.get("items", [])), 2),
        },
        tenant_id=user.get("tenant_id") or "platform",
        source="sales_service", session=_tx,
    )


async def return_sale_op(db, sale_id: str, user: dict) -> None:
    """p189: ACID wrapper — full reversal commits atomically in one transaction."""
    from config.database import client
    async with await client.start_session() as _tx_session:
        async with _tx_session.start_transaction():
            await _return_sale_impl(db, sale_id, user, _tx_session)


async def _return_sale_impl(db, sale_id: str, user: dict, _tx) -> None:
    """Return a sale: restore stock, revert customer stats, reverse cash."""
    sale = await db.sales.find_one({"id": sale_id})
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    now = datetime.now(timezone.utc).isoformat()

    for item in sale["items"]:
        await db.products.update_one({"id": item["product_id"]}, {"$inc": {"quantity": item["quantity"]}}, session=_tx)
        for _cons in (item.get("recipe_consumption") or []):  # p303: restore consumed ingredients
            if _cons.get("product_id") and _cons.get("quantity"):
                await db.products.update_one({"id": _cons["product_id"]}, {"$inc": {"quantity": _cons["quantity"]}}, session=_tx)
        _v = item.get("variant") or {}  # p184
        if _v.get("color") or _v.get("size"):
            await db.products.update_one(
                {"id": item["product_id"], "variants": {"$elemMatch": {"color": _v.get("color") or "", "size": _v.get("size") or ""}}},
                {"$inc": {"variants.$.quantity": item["quantity"]}},
                session=_tx,
            )
        _sn = (item.get("serial_number") or "").strip()  # p187: serial back in stock
        if _sn:
            await db.product_serials.update_many(
                {"serial": _sn, "sale_id": sale_id},
                {"$set": {"status": "in_stock", "sale_id": None, "sold_at": None, "updated_at": now}},
                session=_tx,
            )

    if sale.get("customer_id"):
        await db.customers.update_one(
            {"id": sale["customer_id"]},
            {"$inc": {"total_purchases": -sale["total"], "balance": -sale.get("remaining", 0), "total_debt": -sale.get("remaining", 0)}},
            session=_tx,
        )

    if sale.get("paid_amount", 0) > 0:
        await db.cash_boxes.update_one(
            {"id": sale["payment_method"]},
            {"$inc": {"balance": -sale["paid_amount"]}, "$set": {"updated_at": now}},
            session=_tx,
        )
        await db.transactions.insert_one({
            "id": str(uuid.uuid4()), "cash_box_id": sale["payment_method"],
            "type": "expense", "amount": sale["paid_amount"],
            "description": f"إرجاع مبيعات - فاتورة {sale['invoice_number']}",
            "reference_type": "return", "reference_id": sale_id,
            "created_at": now, "created_by": user["name"]
        }, session=_tx)

    await db.sales.update_one({"id": sale_id}, {"$set": {"status": "returned"}}, session=_tx)

    # p189: outbox event (same transaction)
    from services.outbox import outbox_write
    from config.database import main_db as _main_db
    await outbox_write(
        _main_db, "sale.refunded",
        {
            "sale_id": sale_id, "invoice_number": sale.get("invoice_number", ""), "total": sale.get("total", 0),
            "paid_amount": sale.get("paid_amount", 0),
            "cash_box_id": sale.get("cash_box_id") or sale.get("payment_method"),
            "remaining": sale.get("remaining", 0),
            "cogs": round(sum((it.get("purchase_price") or 0) * abs(it.get("quantity") or 0) for it in sale.get("items", [])), 2),
        },
        tenant_id=user.get("tenant_id") or "platform",
        source="sales_service", session=_tx,
    )
