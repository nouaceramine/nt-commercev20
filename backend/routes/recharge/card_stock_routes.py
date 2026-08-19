"""Telecom card stock — physical scratch/recharge cards owned by the shop.

The shop buys cards (Mobilis/Djezzy/Ooredoo scratch cards, Idoom cards, any
other card) from suppliers BELOW face value, keeps them in stock, and sells
them from POS or the stock page.

Tenant-scoped collections (via the `db` proxy):
  - card_stock      : card types {id, kind, operator, name, denomination,
                      quantity, unit_cost (weighted avg), sell_price}
  - card_purchases  : تموين (restock) log — cash box → stock

Accounting:
  - Purchase (تموين): stock += qty at weighted-average cost; cash box −= total
    (capital-neutral: cash becomes stock).
  - Sell: stock −= qty; sales row type "card_sale" with purchase_price =
    unit_cost → profit reports compute (sell_price − unit_cost) × qty.
  - Stock value (Σ quantity × unit_cost) is added to total capital in stats.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from pymongo import ReturnDocument
import uuid
import logging

logger = logging.getLogger(__name__)

CARD_KINDS = {"scratch_card", "idoom_card", "other_card"}
CARD_OPERATORS = {"mobilis", "djezzy", "ooredoo", "idoom", "other"}


def build_card_stock_router(db, main_db=None, require_tenant=None, get_tenant_admin=None):
    router = APIRouter()

    class CardTypeIn(BaseModel):
        kind: str = "scratch_card"        # scratch_card | idoom_card | other_card
        operator: str = "other"           # mobilis | djezzy | ooredoo | idoom | other
        name: str
        denomination: float = 0           # face value
        sell_price: float = 0
        quantity: float = 0               # opening stock (no cash movement)
        unit_cost: float = 0              # opening stock unit cost

    class CardTypeUpdate(BaseModel):
        kind: Optional[str] = None
        operator: Optional[str] = None
        name: Optional[str] = None
        denomination: Optional[float] = None
        sell_price: Optional[float] = None

    class CardPurchaseIn(BaseModel):
        card_id: str
        quantity: float
        unit_cost: float
        payment_method: str = "cash"      # cash box id
        notes: Optional[str] = ""

    class CardSellIn(BaseModel):
        card_id: str
        quantity: float = 1
        sell_price: Optional[float] = None   # defaults to card sell_price / denomination
        payment_method: str = "cash"         # cash box id | credit
        customer_id: Optional[str] = None
        notes: Optional[str] = ""

    # ============ STOCK LISTING ============

    @router.get("/cards/stock")
    async def list_card_stock(user: dict = Depends(require_tenant)):
        items = await db.card_stock.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
        total_qty = sum(float(i.get("quantity", 0) or 0) for i in items)
        stock_value = round(sum(float(i.get("quantity", 0) or 0) * float(i.get("unit_cost", 0) or 0) for i in items), 2)
        return {"items": items, "total_quantity": total_qty, "stock_value": stock_value}

    # ============ CARD TYPES CRUD ============

    @router.post("/cards/stock", status_code=201)
    async def create_card_type(payload: CardTypeIn, admin: dict = Depends(get_tenant_admin)):
        name = (payload.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="اسم البطاقة مطلوب")
        if payload.kind not in CARD_KINDS:
            raise HTTPException(status_code=400, detail="نوع البطاقة غير صالح")
        if payload.operator not in CARD_OPERATORS:
            raise HTTPException(status_code=400, detail="المتعامل غير صالح")
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": str(uuid.uuid4()),
            "kind": payload.kind,
            "operator": payload.operator,
            "name": name,
            "denomination": float(payload.denomination or 0),
            "sell_price": float(payload.sell_price or 0),
            "quantity": float(payload.quantity or 0),
            "unit_cost": float(payload.unit_cost or 0),
            "created_at": now,
            "updated_at": now,
            "created_by": admin.get("name", ""),
        }
        await db.card_stock.insert_one(dict(doc))
        doc.pop("_id", None)
        return doc

    @router.put("/cards/stock/{card_id}")
    async def update_card_type(card_id: str, payload: CardTypeUpdate, admin: dict = Depends(get_tenant_admin)):
        update = {k: v for k, v in payload.dict(exclude_none=True).items()}
        if not update:
            raise HTTPException(status_code=400, detail="لا توجد حقول للتحديث")
        if "kind" in update and update["kind"] not in CARD_KINDS:
            raise HTTPException(status_code=400, detail="نوع البطاقة غير صالح")
        if "operator" in update and update["operator"] not in CARD_OPERATORS:
            raise HTTPException(status_code=400, detail="المتعامل غير صالح")
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        res = await db.card_stock.update_one({"id": card_id}, {"$set": update})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="البطاقة غير موجودة")
        return await db.card_stock.find_one({"id": card_id}, {"_id": 0})

    @router.delete("/cards/stock/{card_id}")
    async def delete_card_type(card_id: str, admin: dict = Depends(get_tenant_admin)):
        card = await db.card_stock.find_one({"id": card_id}, {"_id": 0})
        if not card:
            raise HTTPException(status_code=404, detail="البطاقة غير موجودة")
        if float(card.get("quantity", 0) or 0) > 0:
            raise HTTPException(status_code=400, detail="لا يمكن حذف بطاقة لها مخزون — بِع أو سوِّ الكمية أولاً")
        await db.card_stock.delete_one({"id": card_id})
        return {"success": True}

    # ============ PURCHASE (تموين) ============

    @router.post("/cards/purchase", status_code=201)
    async def purchase_cards(payload: CardPurchaseIn, admin: dict = Depends(get_tenant_admin)):
        """Restock cards: stock += qty at weighted-average cost; cash box −= total."""
        qty = float(payload.quantity or 0)
        cost = float(payload.unit_cost or 0)
        if qty <= 0:
            raise HTTPException(status_code=400, detail="الكمية يجب أن تكون أكبر من صفر")
        if cost < 0:
            raise HTTPException(status_code=400, detail="سعر الشراء غير صالح")
        card = await db.card_stock.find_one({"id": payload.card_id}, {"_id": 0})
        if not card:
            raise HTTPException(status_code=404, detail="البطاقة غير موجودة")

        now = datetime.now(timezone.utc).isoformat()
        total = round(qty * cost, 2)
        old_qty = float(card.get("quantity", 0) or 0)
        old_cost = float(card.get("unit_cost", 0) or 0)
        new_qty = old_qty + qty
        new_avg_cost = round(((old_qty * old_cost) + total) / new_qty, 2) if new_qty > 0 else cost

        purchase_id = str(uuid.uuid4())
        card_updated = cash_done = False
        try:
            await db.card_stock.update_one(
                {"id": payload.card_id},
                {"$set": {"quantity": new_qty, "unit_cost": new_avg_cost, "updated_at": now}},
            )
            card_updated = True

            if total > 0:
                await db.cash_boxes.update_one(
                    {"id": payload.payment_method},
                    {"$inc": {"balance": -total}, "$set": {"updated_at": now}},
                )
                await db.transactions.insert_one({
                    "id": str(uuid.uuid4()),
                    "cash_box_id": payload.payment_method,
                    "type": "expense",
                    "amount": total,
                    "description": f"تموين كروت: {card.get('name')} × {qty:g}",
                    "reference_type": "card_purchase",
                    "reference_id": purchase_id,
                    "created_at": now,
                    "created_by": admin.get("name", ""),
                })
            cash_done = True

            await db.card_purchases.insert_one({
                "id": purchase_id,
                "card_id": payload.card_id,
                "card_name": card.get("name", ""),
                "quantity": qty,
                "unit_cost": cost,
                "total_cost": total,
                "payment_method": payload.payment_method,
                "avg_cost_after": new_avg_cost,
                "notes": payload.notes or "",
                "created_at": now,
                "created_by": admin.get("name", ""),
            })
        except Exception as e:
            if card_updated:
                try:
                    await db.card_stock.update_one(
                        {"id": payload.card_id},
                        {"$set": {"quantity": old_qty, "unit_cost": old_cost, "updated_at": now}},
                    )
                except Exception:
                    logger.exception("card purchase rollback failed for %s", payload.card_id)
            if cash_done and total > 0:
                try:
                    await db.cash_boxes.update_one(
                        {"id": payload.payment_method},
                        {"$inc": {"balance": total}, "$set": {"updated_at": now}},
                    )
                    await db.transactions.delete_one({"reference_type": "card_purchase", "reference_id": purchase_id})
                except Exception:
                    logger.exception("card purchase cash rollback failed for %s", purchase_id)
            logger.exception("card purchase failed: %s", e)
            raise HTTPException(status_code=500, detail="فشل تسجيل التموين") from e

        return {
            "id": purchase_id,
            "card_id": payload.card_id,
            "quantity": qty,
            "unit_cost": cost,
            "total_cost": total,
            "new_quantity": new_qty,
            "avg_cost": new_avg_cost,
        }

    @router.get("/cards/purchases")
    async def list_card_purchases(admin: dict = Depends(get_tenant_admin)):
        return await db.card_purchases.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

    # ============ SELL ============

    @router.post("/cards/sell", status_code=201)
    async def sell_card(payload: CardSellIn, user: dict = Depends(require_tenant)):
        """Sell cards from stock: sales row (type card_sale) + cash box / customer debt."""
        qty = float(payload.quantity or 0)
        if qty <= 0:
            raise HTTPException(status_code=400, detail="الكمية يجب أن تكون أكبر من صفر")

        # Atomic stock claim — prevents overselling under concurrent requests
        card = await db.card_stock.find_one_and_update(
            {"id": payload.card_id, "quantity": {"$gte": qty}},
            {"$inc": {"quantity": -qty}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
            return_document=ReturnDocument.BEFORE,
        )
        if not card:
            raise HTTPException(status_code=400, detail="الكمية المتوفرة غير كافية")

        now = datetime.now(timezone.utc).isoformat()
        unit_cost = float(card.get("unit_cost", 0) or 0)
        sell_price = float(payload.sell_price) if payload.sell_price else float(card.get("sell_price") or card.get("denomination") or 0)
        if sell_price <= 0:
            await db.card_stock.update_one({"id": payload.card_id}, {"$inc": {"quantity": qty}})
            raise HTTPException(status_code=400, detail="أدخل سعر البيع")
        total = round(sell_price * qty, 2)
        profit = round((sell_price - unit_cost) * qty, 2)
        is_credit = payload.payment_method == "credit"

        customer_name = "عميل نقدي"
        if is_credit:
            if not payload.customer_id:
                await db.card_stock.update_one({"id": payload.card_id}, {"$inc": {"quantity": qty}})
                raise HTTPException(status_code=400, detail="البيع الآجل يتطلب اختيار زبون")
            cust = await db.customers.find_one({"id": payload.customer_id}, {"_id": 0, "name": 1})
            if cust:
                customer_name = cust["name"]

        from services.code_generator import generate_code
        code = await generate_code(db, "sales", "CARD", 5, with_year=True)
        sale_id = str(uuid.uuid4())

        sale_inserted = cash_done = False
        try:
            await db.sales.insert_one({
                "id": sale_id,
                "invoice_number": code,
                "code": code,
                "items": [{
                    "product_id": None,
                    "product_name": f"بطاقة {card.get('name')}" + (f" × {qty:g}" if qty != 1 else ""),
                    "quantity": qty,
                    "unit_price": sell_price, "price": sell_price,
                    "purchase_price": unit_cost,
                    "discount": 0, "total": total,
                    "is_card_sale": True, "card_id": payload.card_id,
                }],
                "subtotal": total, "discount": 0, "discount_total": 0, "tax_total": 0,
                "total": total,
                "paid_amount": 0 if is_credit else total,
                "debt_amount": total if is_credit else 0,
                "remaining": total if is_credit else 0,
                "payment_method": "cash" if is_credit else payload.payment_method,
                "payment_type": "credit" if is_credit else "cash",
                "payments": [] if is_credit else [{"amount": total, "method": payload.payment_method, "at": now}],
                "customer_id": payload.customer_id or None,
                "customer_name": customer_name,
                "type": "card_sale", "source": "telecom_stock",
                "status": "unpaid" if is_credit else "paid",
                "notes": payload.notes or "",
                "user_id": user.get("id"), "user_name": user.get("name", ""),
                "created_at": now, "created_by": user.get("name", ""),
            })
            sale_inserted = True

            # p170: tag customer category (زبون شحن الرصيد)
            if payload.customer_id:
                from services.customer_sources import tag_customer_source, SOURCE_RECHARGE
                await tag_customer_source(db, SOURCE_RECHARGE, customer_id=payload.customer_id)

            if is_credit:
                await db.customers.update_one(
                    {"id": payload.customer_id},
                    {"$inc": {"total_purchases": total, "balance": total, "total_debt": total}},
                )
            else:
                await db.cash_boxes.update_one(
                    {"id": payload.payment_method},
                    {"$inc": {"balance": total}, "$set": {"updated_at": now}},
                )
                await db.transactions.insert_one({
                    "id": str(uuid.uuid4()),
                    "cash_box_id": payload.payment_method,
                    "type": "income",
                    "amount": total,
                    "description": f"بيع بطاقة {card.get('name')}" + (f" × {qty:g}" if qty != 1 else ""),
                    "reference_type": "card_sale",
                    "reference_id": sale_id,
                    "created_at": now,
                    "created_by": user.get("name", ""),
                })
            cash_done = True

            try:
                await db.daily_sessions.update_one(
                    {"user_id": user.get("id"), "status": "open"},
                    {"$inc": {"total_sales": total,
                              ("credit_sales" if is_credit else "cash_sales"): total,
                              "sales_count": 1}},
                )
            except Exception:
                pass
        except Exception as e:
            if sale_inserted:
                try:
                    await db.sales.delete_one({"id": sale_id})
                except Exception:
                    logger.exception("card sale rollback (sale) failed for %s", sale_id)
            if cash_done:
                try:
                    if is_credit:
                        await db.customers.update_one(
                            {"id": payload.customer_id},
                            {"$inc": {"total_purchases": -total, "balance": -total, "total_debt": -total}},
                        )
                    else:
                        await db.cash_boxes.update_one(
                            {"id": payload.payment_method},
                            {"$inc": {"balance": -total}, "$set": {"updated_at": now}},
                        )
                        await db.transactions.delete_one({"reference_type": "card_sale", "reference_id": sale_id})
                except Exception:
                    logger.exception("card sale rollback (money) failed for %s", sale_id)
            try:
                await db.card_stock.update_one({"id": payload.card_id}, {"$inc": {"quantity": qty}})
            except Exception:
                logger.exception("card sale rollback (stock) failed for %s", payload.card_id)
            logger.exception("card sale failed: %s", e)
            raise HTTPException(status_code=500, detail="فشل تسجيل بيع البطاقة") from e

        return {
            "ok": True,
            "sale_id": sale_id,
            "invoice_number": code,
            "card_name": card.get("name"),
            "quantity": qty,
            "sell_price": sell_price,
            "total": total,
            "profit": profit,
            "remaining_stock": round(float(card.get("quantity", 0) or 0) - qty, 2),
        }

    return router
