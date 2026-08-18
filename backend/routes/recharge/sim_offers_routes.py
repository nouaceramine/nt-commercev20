"""p165: SIM card offers catalog + activation/sale operations.

Business flow (per the tenant's real workflow with DZ operators):
- The tenant buys EMPTY SIM cards from Mobilis/Djezzy/Ooredoo (sim_cost, e.g. 100 DZD).
- On activation he picks an offer (offer_value, e.g. 2500 DZD) — the operator
  deducts offer_value from the tenant's MAIN operator SIM balance automatically.
- The operator sends back a variable BONUS (e.g. 500 DZD) into the main SIM.
- The tenant sells SIM+activation to the customer at sale_price (e.g. 2300 DZD).

profit = sale_price + bonus − offer_value − sim_cost

Side effects of an activation:
  1. sales journal row (type "sim_activation") — purchase_price = offer_value + sim_cost − bonus
     so standard profit reports compute the exact profit.
  2. cash box + transaction (cash) or customer debt (credit).
  3. daily session counters.
  4. operator SIM slot: balance −= offer_value, bonus_balance += bonus, empty_sims −= 1
     (+ entries in sim_balance_logs).
"""
from datetime import datetime, timezone
from typing import Optional
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

OPERATORS = {
    "mobilis": {"prefix": "06", "name_ar": "موبيليس"},
    "djezzy": {"prefix": "07", "name_ar": "جازي"},
    "ooredoo": {"prefix": "05", "name_ar": "أوريدو"},
}


class SimOfferIn(BaseModel):
    operator: str  # mobilis | djezzy | ooredoo
    name: str
    offer_value: float
    default_sale_price: float = 0
    sim_cost: float = 100
    typical_bonus: float = 0
    active: bool = True


class SimActivationIn(BaseModel):
    operator: str
    offer_id: Optional[str] = ""
    offer_name: str
    offer_value: float
    bonus: float = 0
    sale_price: float
    sim_cost: float = 0
    payment_type: str = "cash"  # cash | credit
    customer_id: Optional[str] = None
    notes: Optional[str] = ""


def build_sim_offers_router(db, main_db=None, require_tenant=None, get_tenant_admin=None):
    router = APIRouter()

    # ============ OFFERS CATALOG ============

    @router.get("/sim/offers")
    async def list_offers(operator: Optional[str] = None, user: dict = Depends(require_tenant)):
        query = {"active": True}
        if operator:
            query["operator"] = operator
        return await db.sim_offers.find(query, {"_id": 0}).sort("offer_value", 1).to_list(200)

    @router.get("/sim/offers/all")
    async def list_all_offers(admin: dict = Depends(get_tenant_admin)):
        return await db.sim_offers.find({}, {"_id": 0}).sort([("operator", 1), ("offer_value", 1)]).to_list(500)

    @router.post("/sim/offers", status_code=201)
    async def create_offer(payload: SimOfferIn, admin: dict = Depends(get_tenant_admin)):
        if payload.operator not in OPERATORS:
            raise HTTPException(status_code=400, detail="متعامل غير معروف")
        doc = payload.model_dump()
        doc["id"] = str(uuid.uuid4())
        doc["operator_name"] = OPERATORS[payload.operator]["name_ar"]
        doc["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.sim_offers.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.put("/sim/offers/{offer_id}")
    async def update_offer(offer_id: str, payload: dict, admin: dict = Depends(get_tenant_admin)):
        payload.pop("id", None)
        payload.pop("_id", None)
        if "operator" in payload and payload["operator"] in OPERATORS:
            payload["operator_name"] = OPERATORS[payload["operator"]]["name_ar"]
        res = await db.sim_offers.update_one({"id": offer_id}, {"$set": payload})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="العرض غير موجود")
        return await db.sim_offers.find_one({"id": offer_id}, {"_id": 0})

    @router.delete("/sim/offers/{offer_id}")
    async def delete_offer(offer_id: str, admin: dict = Depends(get_tenant_admin)):
        res = await db.sim_offers.delete_one({"id": offer_id})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="العرض غير موجود")
        return {"success": True}

    # ============ ACTIVATIONS (بيع + تفعيل شريحة) ============

    @router.get("/sim/activations")
    async def list_activations(user: dict = Depends(require_tenant)):
        return await db.sim_activations.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

    @router.post("/sim/activations", status_code=201)
    async def create_activation(payload: SimActivationIn, user: dict = Depends(require_tenant)):
        if payload.operator not in OPERATORS:
            raise HTTPException(status_code=400, detail="متعامل غير معروف")
        if payload.sale_price <= 0:
            raise HTTPException(status_code=400, detail="سعر البيع يجب أن يكون أكبر من صفر")
        if payload.offer_value < 0 or payload.bonus < 0 or payload.sim_cost < 0:
            raise HTTPException(status_code=400, detail="قيم غير صالحة")
        is_credit = payload.payment_type == "credit"
        if is_credit and not payload.customer_id:
            raise HTTPException(status_code=400, detail="البيع الآجل يتطلب اختيار زبون")

        op = OPERATORS[payload.operator]
        now = datetime.now(timezone.utc).isoformat()

        # Ensure the operator SIM slot exists (auto-create default)
        slot = await db.sim_slots.find_one({"prefix": op["prefix"]})
        if not slot:
            slot = {"slot_id": len(OPERATORS) + 1, "operator": op["name_ar"], "phone": "",
                    "balance": 0, "bonus_balance": 0, "empty_sims": 0, "sim_unit_cost": 100,
                    "last_updated": now, "prefix": op["prefix"]}
            await db.sim_slots.insert_one(dict(slot))

        # Empty-SIM stock gate (stock tracking is part of the chosen design)
        if int(slot.get("empty_sims", 0) or 0) <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"لا توجد شرائح فارغة متبقية لدى {op['name_ar']} — حدّث مخزون الشرائح من صفحة إدارة الشرائح",
            )

        profit = round(payload.sale_price + payload.bonus - payload.offer_value - payload.sim_cost, 2)
        activation_id = str(uuid.uuid4())

        customer_name = "عميل نقدي"
        if payload.customer_id:
            cust = await db.customers.find_one({"id": payload.customer_id}, {"_id": 0, "name": 1})
            if cust:
                customer_name = cust["name"]

        from services.code_generator import generate_code
        code = await generate_code(db, "sim_activations", "SIM", 5, with_year=True)

        doc = {
            "id": activation_id, "code": code,
            "operator": payload.operator, "operator_name": op["name_ar"],
            "offer_id": payload.offer_id or "", "offer_name": payload.offer_name,
            "offer_value": payload.offer_value, "bonus": payload.bonus,
            "sale_price": payload.sale_price, "sim_cost": payload.sim_cost,
            "profit": profit,
            "payment_type": payload.payment_type,
            "customer_id": payload.customer_id or "", "customer_name": customer_name,
            "notes": payload.notes or "",
            "created_at": now, "created_by": user.get("name", ""),
        }

        # ── side effects with best-effort rollback ──
        slot_updated = sale_inserted = cash_done = False
        try:
            # 1) operator SIM: deduct offer value, add bonus, consume one empty SIM
            await db.sim_slots.update_one(
                {"prefix": op["prefix"]},
                {"$inc": {"balance": -payload.offer_value,
                          "bonus_balance": payload.bonus,
                          "empty_sims": -1},
                 "$set": {"last_updated": now}},
            )
            slot_updated = True
            if payload.offer_value:
                await db.sim_balance_logs.insert_one({
                    "id": str(uuid.uuid4()), "slot_id": slot.get("slot_id"),
                    "old_balance": slot.get("balance", 0),
                    "new_balance": round((slot.get("balance", 0) or 0) - payload.offer_value, 2),
                    "change": -payload.offer_value,
                    "notes": f"تفعيل عرض {payload.offer_name} ({code})",
                    "created_at": now, "created_by": user.get("name", ""),
                })
            if payload.bonus:
                await db.sim_balance_logs.insert_one({
                    "id": str(uuid.uuid4()), "slot_id": slot.get("slot_id"),
                    "old_balance": slot.get("bonus_balance", 0),
                    "new_balance": round((slot.get("bonus_balance", 0) or 0) + payload.bonus, 2),
                    "change": payload.bonus, "field": "bonus_balance",
                    "notes": f"بونيس عرض {payload.offer_name} ({code})",
                    "created_at": now, "created_by": user.get("name", ""),
                })

            # 2) sales journal row — purchase_price makes profit reports exact
            await db.sales.insert_one({
                "id": str(uuid.uuid4()),
                "invoice_number": code,
                "items": [{
                    "product_id": None,
                    "product_name": f"شريحة {op['name_ar']} - {payload.offer_name}",
                    "quantity": 1, "unit_price": payload.sale_price, "price": payload.sale_price,
                    "purchase_price": round(payload.offer_value + payload.sim_cost - payload.bonus, 2),
                    "discount": 0, "total": payload.sale_price,
                    "is_sim_activation": True, "activation_id": activation_id,
                }],
                "subtotal": payload.sale_price, "discount": 0, "discount_total": 0, "tax_total": 0,
                "total": payload.sale_price,
                "paid_amount": 0 if is_credit else payload.sale_price,
                "debt_amount": payload.sale_price if is_credit else 0,
                "remaining": payload.sale_price if is_credit else 0,
                "payment_method": "cash", "payment_type": payload.payment_type,
                "payments": [] if is_credit else [{"amount": payload.sale_price, "method": "cash", "at": now}],
                "customer_id": payload.customer_id or None, "customer_name": customer_name,
                "type": "sim_activation", "source": "pos_sim",
                "status": "unpaid" if is_credit else "paid",
                "user_id": user.get("id"), "user_name": user.get("name", ""),
                "created_at": now, "created_by": user.get("name", ""),
            })
            sale_inserted = True

            # 3) money: cash box or customer debt
            if is_credit:
                await db.customers.update_one(
                    {"id": payload.customer_id},
                    {"$inc": {"total_purchases": payload.sale_price,
                              "balance": payload.sale_price, "total_debt": payload.sale_price}},
                )
            else:
                await db.cash_boxes.update_one(
                    {"id": "cash"},
                    {"$inc": {"balance": payload.sale_price}, "$set": {"updated_at": now}},
                )
                await db.transactions.insert_one({
                    "id": str(uuid.uuid4()), "cash_box_id": "cash",
                    "type": "income", "amount": payload.sale_price,
                    "description": f"بيع شريحة {op['name_ar']} - {payload.offer_name} ({code})",
                    "reference_type": "sim_activation", "reference_id": activation_id,
                    "created_at": now, "created_by": user.get("name", ""),
                })
            cash_done = True

            # 4) daily session counters
            try:
                await db.daily_sessions.update_one(
                    {"user_id": user.get("id"), "status": "open"},
                    {"$inc": {"total_sales": payload.sale_price,
                              ("credit_sales" if is_credit else "cash_sales"): payload.sale_price,
                              "sales_count": 1}},
                )
            except Exception:
                pass

            # 5) the activation record itself
            await db.sim_activations.insert_one(dict(doc))
        except Exception as e:
            logger.exception("SIM activation failed — rolling back")
            if cash_done:
                try:
                    if is_credit:
                        await db.customers.update_one(
                            {"id": payload.customer_id},
                            {"$inc": {"total_purchases": -payload.sale_price,
                                      "balance": -payload.sale_price, "total_debt": -payload.sale_price}},
                        )
                    else:
                        await db.cash_boxes.update_one(
                            {"id": "cash"},
                            {"$inc": {"balance": -payload.sale_price}, "$set": {"updated_at": now}},
                        )
                except Exception:
                    logger.exception("rollback: cash/customer revert failed")
            if sale_inserted:
                try:
                    await db.sales.delete_one({"invoice_number": code, "type": "sim_activation"})
                except Exception:
                    logger.exception("rollback: sale row delete failed")
            if slot_updated:
                try:
                    await db.sim_slots.update_one(
                        {"prefix": op["prefix"]},
                        {"$inc": {"balance": payload.offer_value,
                                  "bonus_balance": -payload.bonus,
                                  "empty_sims": 1},
                         "$set": {"last_updated": now}},
                    )
                except Exception:
                    logger.exception("rollback: slot revert failed")
            if isinstance(e, HTTPException):
                raise
            raise HTTPException(status_code=500, detail="فشل تسجيل عملية بيع الشريحة") from e

        return doc

    return router
