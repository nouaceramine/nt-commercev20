"""Digital Services — topups, gift cards, subscriptions with instant code delivery,
wallet payments and affiliate system (FastAPI + MongoDB implementation)."""
import csv
import io
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

logger = logging.getLogger(__name__)

DIGITAL_TYPES = ["MOBILE_TOPUP", "INTERNET_BUNDLE", "GIFT_CARD", "SUBSCRIPTION"]
DELIVERY_METHODS = ["INSTANT_CODE", "QR_CODE", "DIRECT_TOPUP", "SMS_DELIVERY"]
PAYMENT_METHODS = ["wallet", "ccp", "d17"]


def create_digital_services_routes(db, main_db, get_current_user, get_tenant_admin) -> APIRouter:
    router = APIRouter(prefix="/digital", tags=["digital-services"])

    # ── Models ──
    class DigitalProductCreate(BaseModel):
        name: str
        type: str = "GIFT_CARD"
        provider: str = ""
        price: float
        cost_price: float = 0
        delivery_method: str = "INSTANT_CODE"
        image_url: str = ""
        description: str = ""
        is_active: bool = True

    class OrderCreate(BaseModel):
        product_id: str
        target_phone: str = ""
        payment_method: str = "wallet"
        quantity: int = 1

    class DepositBody(BaseModel):
        amount: float
        note: str = ""

    class CodeRow(BaseModel):
        code: str
        serial: Optional[str] = None
        expiry_date: Optional[str] = None

    # ── Helpers ──
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    async def _get_wallet(user_id: str) -> dict:
        w = await db.wallets.find_one({"entity_type": "user", "entity_id": user_id}, {"_id": 0})
        if not w:
            w = {
                "id": str(uuid.uuid4()), "entity_type": "user", "entity_id": user_id,
                "balance": 0, "currency": "DZD", "created_at": _now(),
            }
            await db.wallets.insert_one(dict(w))
        return w

    async def _wallet_txn(user_id: str, ttype: str, amount: float, before: float, after: float, desc: str, ref: str = None):
        await db.wallet_transactions.insert_one({
            "id": str(uuid.uuid4()), "user_id": user_id, "type": ttype,
            "amount": amount, "balance_before": before, "balance_after": after,
            "description": desc, "reference_id": ref, "created_at": _now(),
        })

    async def _product_stock(product_id: str) -> int:
        return await db.digital_codes.count_documents({"product_id": product_id, "is_used": False})

    async def _with_stock(p: dict) -> dict:
        p["stock"] = await _product_stock(p["id"])
        return p

    def _public_product(p: dict) -> dict:
        return {k: p.get(k) for k in ("id", "name", "type", "provider", "price", "delivery_method", "image_url", "description", "is_active")}

    # ── Products ──
    @router.get("/products")
    async def list_products(type: Optional[str] = None, provider: Optional[str] = None,
                            user: dict = Depends(get_current_user)):
        query = {"is_active": True}
        if type:
            query["type"] = type
        if provider:
            query["provider"] = {"$regex": f"^{provider}$", "$options": "i"}
        items = await db.digital_products.find(query, {"_id": 0}).to_list(500)
        return [await _with_stock(_public_product(p)) for p in items]

    @router.get("/products/all")
    async def list_all_products(admin: dict = Depends(get_tenant_admin)):
        items = await db.digital_products.find({}, {"_id": 0}).to_list(500)
        return [await _with_stock(p) for p in items]

    @router.post("/products", status_code=201)
    async def create_product(data: DigitalProductCreate, admin: dict = Depends(get_tenant_admin)):
        if data.type not in DIGITAL_TYPES:
            raise HTTPException(status_code=400, detail="نوع المنتج غير صالح")
        if data.delivery_method not in DELIVERY_METHODS:
            raise HTTPException(status_code=400, detail="طريقة التسليم غير صالحة")
        doc = {"id": str(uuid.uuid4()), **data.model_dump(), "created_at": _now(), "created_by": admin.get("name", "")}
        await db.digital_products.insert_one(dict(doc))
        doc["stock"] = 0
        return doc

    @router.put("/products/{product_id}")
    async def update_product(product_id: str, data: dict, admin: dict = Depends(get_tenant_admin)):
        data.pop("id", None)
        data["updated_at"] = _now()
        await db.digital_products.update_one({"id": product_id}, {"$set": data})
        p = await db.digital_products.find_one({"id": product_id}, {"_id": 0})
        if not p:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        return await _with_stock(p)

    @router.delete("/products/{product_id}")
    async def delete_product(product_id: str, admin: dict = Depends(get_tenant_admin)):
        await db.digital_products.update_one({"id": product_id}, {"$set": {"is_active": False}})
        return {"message": "تم تعطيل المنتج"}

    # ── Codes (admin) ──
    @router.post("/products/{product_id}/codes")
    async def upload_codes(product_id: str, codes: List[CodeRow], admin: dict = Depends(get_tenant_admin)):
        """Bulk upload codes (JSON list). Each code is AES-256-GCM encrypted at rest."""
        from utils.code_crypto import encrypt_code
        product = await db.digital_products.find_one({"id": product_id})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        inserted, skipped = 0, 0
        for row in codes:
            code = (row.code or "").strip()
            if not code:
                skipped += 1
                continue
            exists = await db.digital_codes.find_one({"product_id": product_id, "serial": row.serial, "is_used": False}) if row.serial else None
            if exists:
                skipped += 1
                continue
            enc = encrypt_code(code)
            await db.digital_codes.insert_one({
                "id": str(uuid.uuid4()), "product_id": product_id,
                "code_encrypted": enc["encrypted"], "iv": enc["iv"], "tag": enc["tag"],
                "serial": row.serial or "", "expiry_date": row.expiry_date or "",
                "is_used": False, "used_at": None, "order_id": None, "created_at": _now(),
            })
            inserted += 1
        return {"inserted": inserted, "skipped": skipped, "stock": await _product_stock(product_id)}

    @router.post("/products/{product_id}/codes/csv")
    async def upload_codes_csv(product_id: str, body: dict, admin: dict = Depends(get_tenant_admin)):
        """Upload codes as CSV text: code,serial,expiryDate (header optional)."""
        from utils.code_crypto import encrypt_code
        product = await db.digital_products.find_one({"id": product_id})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        text = body.get("csv", "")
        inserted, skipped = 0, 0
        reader = csv.reader(io.StringIO(text))
        for row in reader:
            if not row or not row[0].strip() or row[0].strip().lower() == "code":
                continue
            code = row[0].strip()
            serial = row[1].strip() if len(row) > 1 else ""
            expiry = row[2].strip() if len(row) > 2 else ""
            enc = encrypt_code(code)
            await db.digital_codes.insert_one({
                "id": str(uuid.uuid4()), "product_id": product_id,
                "code_encrypted": enc["encrypted"], "iv": enc["iv"], "tag": enc["tag"],
                "serial": serial, "expiry_date": expiry,
                "is_used": False, "used_at": None, "order_id": None, "created_at": _now(),
            })
            inserted += 1
        return {"inserted": inserted, "skipped": skipped, "stock": await _product_stock(product_id)}

    @router.get("/products/{product_id}/codes")
    async def list_codes(product_id: str, admin: dict = Depends(get_tenant_admin)):
        codes = await db.digital_codes.find(
            {"product_id": product_id},
            {"_id": 0, "code_encrypted": 0, "iv": 0, "tag": 0}
        ).sort("created_at", -1).to_list(1000)
        return codes

    # ── Orders ──
    async def _assign_codes(product_id: str, order_id: str, quantity: int) -> list:
        codes = await db.digital_codes.find(
            {"product_id": product_id, "is_used": False}
        ).limit(quantity).to_list(quantity)
        now = _now()
        assigned = []
        for c in codes:
            await db.digital_codes.update_one(
                {"id": c["id"]},
                {"$set": {"is_used": True, "used_at": now, "order_id": order_id}}
            )
            assigned.append(c["id"])
        return assigned

    @router.post("/orders", status_code=201)
    async def create_order(data: OrderCreate, user: dict = Depends(get_current_user)):
        if data.payment_method not in PAYMENT_METHODS:
            raise HTTPException(status_code=400, detail="طريقة الدفع غير صالحة")
        product = await db.digital_products.find_one({"id": data.product_id, "is_active": True}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        amount = product["price"] * data.quantity
        count = await db.digital_orders.count_documents({}) + 1
        order = {
            "id": str(uuid.uuid4()),
            "order_number": f"DIG-{count:06d}",
            "user_id": user.get("id"),
            "user_name": user.get("name", user.get("email", "")),
            "product_id": product["id"],
            "product_name": product["name"],
            "product_type": product["type"],
            "provider": product.get("provider", ""),
            "target_phone": data.target_phone,
            "quantity": data.quantity,
            "amount": amount,
            "payment_method": data.payment_method,
            "status": "PENDING",
            "code_ids": [],
            "created_at": _now(),
        }

        if data.payment_method == "wallet":
            wallet = await _get_wallet(user.get("id"))
            if wallet.get("balance", 0) < amount:
                raise HTTPException(status_code=400, detail=f"رصيد المحفظة غير كافٍ ({wallet.get('balance', 0)} دج)")
            if product["delivery_method"] in ("INSTANT_CODE", "QR_CODE"):
                stock = await _product_stock(product["id"])
                if stock < data.quantity:
                    raise HTTPException(status_code=400, detail="نفدت الأكواد المتاحة لهذا المنتج")
                order["code_ids"] = await _assign_codes(product["id"], order["id"], data.quantity)
                order["status"] = "COMPLETED"
            else:
                order["status"] = "PENDING"  # DIRECT_TOPUP / SMS need manual or provider API
            before = wallet.get("balance", 0)
            await db.wallets.update_one(
                {"entity_type": "user", "entity_id": user.get("id")},
                {"$inc": {"balance": -amount}}
            )
            await _wallet_txn(user.get("id"), "PURCHASE", amount, before, before - amount,
                              f"شراء {product['name']}", order["id"])
            await db.digital_orders.insert_one(dict(order))
            order.pop("_id", None)
            return order

        # CCP / D17 — manual confirmation by admin
        order["payment_instructions"] = {
            "ccp": "حوّل المبلغ إلى حساب CCP ثم أرسل الوصل للإدارة",
            "d17": "ادفع عبر تطبيق D17 إلى الرقم المعتمد ثم أرسل لقطة شاشة",
        }.get(data.payment_method, "")
        await db.digital_orders.insert_one(dict(order))
        order.pop("_id", None)
        return order

    @router.get("/orders")
    async def list_orders(status: Optional[str] = None, user: dict = Depends(get_current_user)):
        query = {}
        if user.get("role") not in ("admin", "super_admin") and user.get("user_type") != "super_admin":
            query["user_id"] = user.get("id")
        if status:
            query["status"] = status
        return await db.digital_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

    @router.get("/orders/{order_id}/codes")
    async def get_order_codes(order_id: str, user: dict = Depends(get_current_user)):
        from utils.code_crypto import decrypt_code
        order = await db.digital_orders.find_one({"id": order_id}, {"_id": 0})
        if not order:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")
        is_admin = user.get("role") in ("admin", "super_admin") or user.get("user_type") == "super_admin"
        if order.get("user_id") != user.get("id") and not is_admin:
            raise HTTPException(status_code=403, detail="غير مصرّح")
        codes = []
        for cid in order.get("code_ids", []):
            c = await db.digital_codes.find_one({"id": cid}, {"_id": 0})
            if c:
                codes.append({
                    "code": decrypt_code(c["code_encrypted"], c["iv"], c["tag"]),
                    "serial": c.get("serial", ""),
                    "expiry_date": c.get("expiry_date", ""),
                })
        return {"order_number": order["order_number"], "product_name": order["product_name"], "codes": codes}

    @router.post("/orders/{order_id}/deliver")
    async def manual_deliver(order_id: str, admin: dict = Depends(get_tenant_admin)):
        """Manual delivery for PENDING orders (CCP/D17 confirmed or direct topup)."""
        order = await db.digital_orders.find_one({"id": order_id}, {"_id": 0})
        if not order:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")
        if order["status"] == "COMPLETED":
            return {"message": "الطلب مسلَّم مسبقاً", "status": "COMPLETED"}
        stock = await _product_stock(order["product_id"])
        if stock >= order.get("quantity", 1):
            order["code_ids"] = await _assign_codes(order["product_id"], order_id, order.get("quantity", 1))
        await db.digital_orders.update_one(
            {"id": order_id},
            {"$set": {"status": "COMPLETED", "code_ids": order["code_ids"], "delivered_by": admin.get("name", ""), "delivered_at": _now()}}
        )
        return {"message": "تم التسليم", "status": "COMPLETED", "codes_assigned": len(order["code_ids"])}

    # ── Wallet ──
    @router.get("/wallet")
    async def get_wallet(user: dict = Depends(get_current_user)):
        wallet = await _get_wallet(user.get("id"))
        txns = await db.wallet_transactions.find(
            {"user_id": user.get("id")}, {"_id": 0}
        ).sort("created_at", -1).limit(20).to_list(20)
        wallet.pop("_id", None)
        return {"wallet": wallet, "transactions": txns}

    @router.post("/wallet/deposit")
    async def wallet_deposit(data: DepositBody, user: dict = Depends(get_current_user)):
        if data.amount <= 0:
            raise HTTPException(status_code=400, detail="المبلغ غير صالح")
        wallet = await _get_wallet(user.get("id"))
        before = wallet.get("balance", 0)
        await db.wallets.update_one(
            {"entity_type": "user", "entity_id": user.get("id")},
            {"$inc": {"balance": data.amount}}
        )
        await _wallet_txn(user.get("id"), "DEPOSIT", data.amount, before, before + data.amount,
                          data.note or "شحن رصيد")
        return {"balance": before + data.amount, "message": "تم شحن الرصيد"}

    @router.post("/wallet/pay")
    async def wallet_pay(body: dict, user: dict = Depends(get_current_user)):
        """Pay a PENDING order from wallet (e.g. after choosing CCP then switching)."""
        order_id = body.get("order_id")
        order = await db.digital_orders.find_one({"id": order_id}, {"_id": 0})
        if not order:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")
        if order.get("user_id") != user.get("id"):
            raise HTTPException(status_code=403, detail="غير مصرّح")
        if order["status"] == "COMPLETED":
            return {"message": "مدفوع مسبقاً"}
        wallet = await _get_wallet(user.get("id"))
        amount = order["amount"]
        if wallet.get("balance", 0) < amount:
            raise HTTPException(status_code=400, detail="رصيد غير كافٍ")
        product = await db.digital_products.find_one({"id": order["product_id"]}, {"_id": 0})
        code_ids = []
        status = "PENDING"
        if product and product["delivery_method"] in ("INSTANT_CODE", "QR_CODE"):
            stock = await _product_stock(product["id"])
            if stock < order.get("quantity", 1):
                raise HTTPException(status_code=400, detail="نفدت الأكواد")
            code_ids = await _assign_codes(product["id"], order_id, order.get("quantity", 1))
            status = "COMPLETED"
        before = wallet.get("balance", 0)
        await db.wallets.update_one(
            {"entity_type": "user", "entity_id": user.get("id")},
            {"$inc": {"balance": -amount}}
        )
        await _wallet_txn(user.get("id"), "PURCHASE", amount, before, before - amount,
                          f"شراء {order['product_name']}", order_id)
        await db.digital_orders.update_one(
            {"id": order_id},
            {"$set": {"status": status, "code_ids": code_ids, "payment_method": "wallet"}}
        )
        return {"status": status, "balance": before - amount}

    # ── Affiliate ──
    def _affiliate_code(user_id: str) -> str:
        return "REF-" + user_id.replace("-", "")[:8].upper()

    @router.get("/affiliate")
    async def get_affiliate(user: dict = Depends(get_current_user)):
        aff = await db.affiliates.find_one({"referrer_id": user.get("id")}, {"_id": 0})
        if not aff:
            return {"active": False, "message": "فعّل رابط الإحالة للبدء"}
        aff["active"] = aff.get("is_active", True)
        return aff

    @router.post("/affiliate")
    async def activate_affiliate(user: dict = Depends(get_current_user)):
        existing = await db.affiliates.find_one({"referrer_id": user.get("id")}, {"_id": 0})
        if existing:
            await db.affiliates.update_one({"id": existing["id"]}, {"$set": {"is_active": True}})
            existing["is_active"] = True
            return existing
        aff = {
            "id": str(uuid.uuid4()),
            "referrer_id": user.get("id"),
            "code": _affiliate_code(user.get("id")),
            "total_clicks": 0, "total_conversions": 0,
            "total_earnings": 0, "commission_rate": 5,
            "is_active": True, "created_at": _now(),
        }
        await db.affiliates.insert_one(dict(aff))
        aff.pop("_id", None)
        return aff

    @router.get("/affiliate/track")
    async def track_click(code: str):
        """Public click tracker for affiliate links."""
        aff = await db.affiliates.find_one({"code": code, "is_active": True})
        if aff:
            await db.affiliates.update_one({"id": aff["id"]}, {"$inc": {"total_clicks": 1}})
            return {"ok": True}
        return {"ok": False}

    return router
