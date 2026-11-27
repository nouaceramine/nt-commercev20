"""p356: ولاء الكاشير — رصيد واحد لكل زبون (customers.loyalty_points).

يكمل حلقة p181: الواجهة كانت تصرف النقاط لكن لا أحد يكسبها. هذا الموديول
يمنح النقاط تلقائياً عند البيع (POS) أو دفع طلب مطعم، ويُستخدم من
sales_service وrestaurant_routes معاً.

بوابة التفعيل: loyalty_settings {"id": "global", enabled, points_per_dinar}.
آمن: فشل الولاء لا يُفشل البيع أبداً، والكسب idempotent لكل مرجع.
"""
from datetime import datetime, timezone
import uuid

_EARN_INDEX_READY = False


async def _ensure_earn_index(db):
    """P577-005: lazy + idempotent unique earn-claim per sale reference."""
    global _EARN_INDEX_READY
    if _EARN_INDEX_READY:
        return
    await db.loyalty_transactions.create_index(
        [("sale_id", 1)], unique=True, name="p577_earn_ref_unique",
        partialFilterExpression={"type": "earn", "sale_id": {"$type": "string"}})
    _EARN_INDEX_READY = True


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _settings(db):
    st = await db.loyalty_settings.find_one({"id": "global"}, {"_id": 0})
    if not st or not st.get("enabled"):
        return None
    return st


async def _resolve_customer(db, customer_id=None, phone=""):
    """بالهوية أولاً ثم بالهاتف؛ هاتف جديد ينشئ زبوناً حد أدنى (كونتوار/مطعم)."""
    if customer_id:
        c = await db.customers.find_one(
            {"id": customer_id},
            {"_id": 0, "id": 1, "name": 1, "loyalty_points": 1})
        if c:
            return c
    phone = (phone or "").strip()
    if phone:
        c = await db.customers.find_one(
            {"phone": phone},
            {"_id": 0, "id": 1, "name": 1, "loyalty_points": 1})
        if c:
            return c
        doc = {"id": str(uuid.uuid4()), "name": f"زبون {phone}",
               "phone": phone, "email": "", "address": "",
               "balance": 0, "total_purchases": 0, "total_debt": 0,
               "loyalty_points": 0, "created_at": _now(),
               "source": "loyalty-auto"}
        await db.customers.insert_one(doc)
        doc.pop("_id", None)
        return doc
    return None


async def earn_points(db, *, amount, ref_id, ref_label, user_name="",
                      customer_id=None, phone=""):
    """يمنح نقاطاً عن عملية مدفوعة. يرجع {customer_id, points, balance} أو None.

    idempotent: معاملة earn واحدة كحد أقصى لكل ref_id.
    """
    try:
        st = await _settings(db)
        if not st:
            return None
        amount = float(amount or 0)
        if amount <= 0:
            return None
        rate = float(st.get("points_per_dinar", 0.01) or 0)
        pts = int(amount * rate)
        if pts <= 0:
            return None
        cust = await _resolve_customer(db, customer_id, phone)
        if not cust:
            return None
        # P577-005: the old check-then-act + read-modify-$set lost concurrent
        # points and double-granted a single reference under racing workers
        # (proven: 12 concurrent unique earns credited 1/12; 12 same-ref earns
        # granted 2x with 11 ledger rows). Claim the reference FIRST through
        # the unique partial index — exactly one worker can ever earn a ref —
        # then move the balance with an atomic $inc.
        await _ensure_earn_index(db)
        from pymongo import ReturnDocument
        from pymongo.errors import DuplicateKeyError
        tx_id = str(uuid.uuid4())
        try:
            await db.loyalty_transactions.insert_one({
                "id": tx_id, "customer_id": cust["id"],
                "points": pts, "type": "earn", "sale_id": ref_id,
                "notes": f"كسب من {ref_label}", "balance_after": None,
                "created_at": _now(), "created_by": user_name})
        except DuplicateKeyError:
            return None  # a racing worker already earned this reference
        upd = await db.customers.find_one_and_update(
            {"id": cust["id"]}, {"$inc": {"loyalty_points": pts}},
            return_document=ReturnDocument.AFTER)
        new_bal = int((upd or {}).get("loyalty_points") or 0)
        await db.loyalty_transactions.update_one(
            {"id": tx_id}, {"$set": {"balance_after": new_bal}})
        return {"customer_id": cust["id"], "points": pts, "balance": new_bal}
    except Exception:
        return None
