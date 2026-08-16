"""p143-p145: Smart features router — NT Commerce.

Groups the AI/ops intelligence layer in ONE router (tenant-scoped via _TenantDBProxy):

  1) GET  /smart/call-script/{order_id}   — AI-generated call script for confirmation agents
  2) POST /smart/auto-dispatch            — pick best courier (price × wilaya success-rate) + create label
  4) GET  /smart/cart-leak-analysis       — where/why carts leak + actionable suggestion
  5) GET  /smart/stock-forecast           — days-until-stockout per product (14d velocity)
  6) competitor watch CRUD                — track competitor product prices, alert on drops
  9) GET  /smart/wilaya-risk-map          — per-wilaya delivery/return rates (own + platform network)
 12) GET  /smart/morning-report           — spoken-style daily briefing (for WA/Telegram + UI)
 13) POST /smart/return-by-tracking       — scan label QR → one-tap return (restock + finance)

Security: every endpoint is tenant-scoped via require_tenant; platform aggregates are
counts-only (no cross-tenant PII leakage).
"""
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)


def create_smart_router(db, main_db, require_tenant, get_tenant_admin, limiter=None):
    router = APIRouter(tags=["smart"])

    async def _require_ecom(user):
        try:
            from routes.ecom.helpers import require_ecom_feature
            await require_ecom_feature(user)
        except ImportError:
            pass  # feature guard optional — POS-only tenants still get stock forecast

    # ════════════════════════════════════════════════════════════════════
    # 1) AI call script — سكربت مكالمة التأكيد
    # ════════════════════════════════════════════════════════════════════
    @router.get("/smart/call-script/{order_id}")
    async def call_script(order_id: str, user: dict = Depends(require_tenant)):
        order = await db.ecom_orders.find_one({"id": order_id}, {"_id": 0})
        if not order:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")
        cust = order.get("customer") or {}
        phone = cust.get("phone", "")

        # Gather intelligence: own history + network reputation
        from services.application.ecom_order_service import get_network_trust, normalize_phone
        pn = normalize_phone(phone)
        own_orders = await db.ecom_orders.count_documents(
            {"customer.phone": {"$in": [phone, pn]}, "status": "delivered"}) if phone else 0
        own_returns = await db.ecom_orders.count_documents(
            {"customer.phone": {"$in": [phone, pn]}, "status": {"$in": ["returned", "refunded"]}}) if phone else 0
        trust = await get_network_trust(pn) if pn else {"found": False}
        attempts = len(order.get("confirmation_attempts") or [])
        items_txt = "، ".join(f"{i.get('name', 'منتج')} ×{i.get('qty', 1)}" for i in (order.get("items") or [])[:4])
        dtype = "مكتب (stopdesk)" if order.get("delivery_type") == "office" else "باب المنزل"

        facts = {
            "name": cust.get("name", ""), "phone": phone,
            "wilaya": cust.get("wilaya", ""), "city": cust.get("city", ""), "address": cust.get("address", ""),
            "items": items_txt, "total": order.get("total", 0), "delivery_type": dtype,
            "own_delivered": own_orders, "own_returned": own_returns,
            "network_trust": trust.get("trust"), "attempts": attempts,
        }

        # LLM path (optional) — falls back to deterministic script
        script = None
        try:
            from services.ai.openai_llm import llm_chat
            prompt = (
                "أنت مدرب مبيعات هاتفية جزائري. اكتب سكربت مكالمة تأكيد طلب (COD) قصير وعملي بالدارجة/العربية، "
                "بنقاط مرقمة: تحية، تأكيد المعلومات، معالجة الاعتراضات، ختام. البيانات:\n"
                f"الزبون: {facts['name']} — {facts['wilaya']} / {facts['city']} / {facts['address']}\n"
                f"الطلب: {facts['items']} — الإجمالي {facts['total']} دج — التوصيل: {dtype}\n"
                f"سجله عندنا: {own_orders} تسليم ناجح / {own_returns} إرجاع. محاولات الاتصال السابقة: {attempts}.\n"
                f"سمعته في الشبكة: {trust.get('trust') or 'غير معروف'} (returned_net={trust.get('returned', 0)}).\n"
                "إن كان مُرجِعاً متسلسلاً: ابدأ بتأكيد الجدية والعنوان بدقة واقترح الدفع المسبق. "
                "إن كان زبوناً وفيّاً: رحّب به واقترح منتجاً مكملاً. أجب بالسكربت فقط."
            )
            script = await llm_chat("أنت مساعد مبيعات محترف. إجاباتك عملية وقصيرة.", prompt, max_tokens=700)
        except Exception as exc:  # noqa: BLE001
            logger.warning("call-script LLM failed, fallback: %s", exc)

        if not script:
            lines = [f"1️⃣ تحية: «السلام عليكم {facts['name']}، معك [اسمك] من متجرنا، بش نأكدولك الطلبية تاعك.»"]
            lines.append(f"2️⃣ تأكيد الطلب: «طلبيت {items_txt} بمجموع {facts['total']} دج، التوصيل لـ{dtype} — {facts['wilaya']} {facts['city']}.»")
            if own_returns >= 2 or trust.get("trust") == "risk":
                lines.append("3️⃣ ⚠️ مُرجِع سابق — أكّد الجدية: «واش راك متأكد مليح؟ خاطر التوصيل يكلفنا.» واقترح الدفع المسبق بخصم 5%.")
                lines.append("4️⃣ دقّق العنوان حرفياً وأعد قراءته: " + (facts['address'] or "⚠️ لا يوجد عنوان تفصيلي — اطلبه!"))
            elif own_orders >= 2:
                lines.append("3️⃣ زبون وفيّ ⭐ — رحّب به بحرارة واقترح منتجاً مكملاً بخصم.")
                lines.append("4️⃣ أكّد العنوان المعتاد: " + (facts['address'] or facts['city']))
            else:
                lines.append("3️⃣ أكّد العنوان كاملاً: " + " · ".join(x for x in [facts['wilaya'], facts['city'], facts['address']] if x))
                lines.append("4️⃣ أعلمه بمدة التوصيل المتوقعة واطلب منه الرد على الهاتف.")
            if attempts >= 2:
                lines.append(f"⏰ هذه المحاولة رقم {attempts + 1} — إن لم يردّ هذه المرة، فكّر في الإلغاء.")
            lines.append("5️⃣ ختام: «مرحباً بك، توصلك الطلبية إن شاء الله. شكراً!»")
            script = "\n".join(lines)

        return {"order_id": order_id, "order_code": order.get("order_code"), "script": script,
                "facts": facts, "ai_generated": bool(script and "1️⃣" not in script[:4])}

    # ════════════════════════════════════════════════════════════════════
    # 2) Auto-Dispatch — أفضل شركة شحن (سعر × نسبة نجاح الولاية) + إنشاء البوليصة
    # ════════════════════════════════════════════════════════════════════
    @router.get("/smart/courier-scorecard")
    async def courier_scorecard(wilaya: str = "", user: dict = Depends(require_tenant)):
        """Per-courier historical performance for a wilaya (own tenant data)."""
        match = {"courier": {"$ne": None}}
        if wilaya:
            match["customer.wilaya"] = wilaya
        rows = await db.ecom_orders.aggregate([
            {"$match": match},
            {"$group": {
                "_id": "$courier",
                "total": {"$sum": 1},
                "delivered": {"$sum": {"$cond": [{"$eq": ["$status", "delivered"]}, 1, 0]}},
                "returned": {"$sum": {"$cond": [{"$in": ["$status", ["returned", "refunded"]]}, 1, 0]}},
            }},
        ]).to_list(50)
        out = []
        for r in rows:
            done = r["delivered"] + r["returned"]
            out.append({
                "courier": r["_id"], "shipments": r["total"],
                "success_rate": round(100 * r["delivered"] / done, 1) if done else None,
            })
        return {"wilaya": wilaya or None, "scorecard": out}

    @router.post("/smart/auto-dispatch")
    async def auto_dispatch(body: dict, user: dict = Depends(require_tenant)):
        """Pick the best courier for an order and create the label.

        Score = cheapest_price / (1 + success_bonus). Missing history → price only.
        Body: {order_id, dry_run?: bool}
        """
        order_id = (body.get("order_id") or "").strip()
        dry_run = bool(body.get("dry_run"))
        order = await db.ecom_orders.find_one({"id": order_id}, {"_id": 0})
        if not order:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")
        wilaya = str((order.get("customer") or {}).get("wilaya") or "")
        if not wilaya:
            raise HTTPException(status_code=400, detail="ولاية الزبون مفقودة — أكمل بياناته أولاً")

        # Candidate prices: tenant delivery_rates (per-wilaya) + integrations
        wid = re.sub(r"\D", "", wilaya).zfill(2) if re.sub(r"\D", "", wilaya) else None
        rate = await db.delivery_rates.find_one({"id": wid}, {"_id": 0}) if wid else None
        integrations = await db.ecom_integrations.find(
            {"channel": {"$in": ["yalidine", "zr", "maystro"]}, "is_active": True}, {"_id": 0}).to_list(10)

        candidates = []
        for integ in integrations:
            ch = integ.get("channel")
            # price from delivery_rates if present, else flat fallback
            price = None
            if rate:
                price = float(rate.get("office_price" if order.get("delivery_type") == "office" else "home_price") or 0) or None
            candidates.append({"courier": ch, "price": price, "integration_id": integ.get("id")})

        if not candidates:
            raise HTTPException(status_code=400, detail="لا توجد تكاملات شحن مفعّلة — أعدّ Yalidine/ZR/Maystro أولاً")

        # Success-rate bonus from own history for this wilaya
        card = (await courier_scorecard(wilaya, user))["scorecard"]
        rates_map = {c["courier"]: c.get("success_rate") for c in card}

        for c in candidates:
            sr = rates_map.get(c["courier"])
            base = c["price"] if c["price"] else 400.0
            bonus = (sr or 70) / 100.0  # unknown history → 70% assumed
            c["success_rate"] = sr
            c["score"] = round(base / (0.5 + bonus), 1)

        candidates.sort(key=lambda c: c["score"])
        best = candidates[0]

        result = {"order_id": order_id, "wilaya": wilaya, "candidates": candidates,
                  "chosen": best["courier"], "reason": f"أفضل نقاط ({best['score']}) — سعر {best['price'] or 'افتراضي'} دج، نجاح {best['success_rate'] if best['success_rate'] is not None else '؟'}%"}
        if dry_run:
            return result

        # Create the label through the existing battle-tested path
        from routes.ecom.shipping_routes import create_label  # noqa: PLC0415
        label_res = await create_label({"order_id": order_id, "provider": best["courier"]}, user)
        result["label"] = label_res
        return result

    # ════════════════════════════════════════════════════════════════════
    # 4) Cart leak analysis — أين تتسرب السلات؟
    # ════════════════════════════════════════════════════════════════════
    @router.get("/smart/cart-leak-analysis")
    async def cart_leak_analysis(days: int = Query(7, ge=1, le=90), user: dict = Depends(require_tenant)):
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        leads = await db.store_cart_leads.find({"last_seen": {"$gte": since}}, {"_id": 0}).to_list(2000)
        total = len(leads)
        converted = sum(1 for l in leads if l.get("converted"))
        abandoned = [l for l in leads if not l.get("converted")]

        # Heuristics: high shipping vs total, missing name, stale reminders
        suggestions = []
        ship_loss = 0
        for l in abandoned:
            tot = float(l.get("total") or 0)
            if 0 < tot < 2500:
                ship_loss += 1
        if total >= 5:
            rate = round(100 * len(abandoned) / total, 1)
            if ship_loss >= max(2, len(abandoned) // 3):
                avg = round(sum(float(l.get("total") or 0) for l in abandoned if l.get("total")) / max(ship_loss, 1))
                suggestions.append({
                    "key": "free_shipping_threshold",
                    "title_ar": "فعّل التوصيل المجاني فوق عتبة",
                    "detail_ar": f"{ship_loss} سلة مهجورة قيمتها أقل من 2500 دج (متوسط {avg} دج) — غالباً بسبب كلفة التوصيل. عتبة توصيل مجاني عند {max(3000, avg + 800)} دج قد تسترجع جزءاً كبيراً منها.",
                })
            not_reminded = sum(1 for l in abandoned if not l.get("reminder_sent"))
            if not_reminded >= 3:
                suggestions.append({
                    "key": "enable_reminders",
                    "title_ar": "فعّل رسائل التذكير بالسلة",
                    "detail_ar": f"{not_reminded} سلة مهجورة لم تُذكَّر إطلاقاً — رسالة واتساب واحدة تسترجع عادة 10-20%.",
                })
        return {
            "days": days, "total_leads": total, "converted": converted,
            "abandoned": len(abandoned),
            "abandon_rate": round(100 * len(abandoned) / total, 1) if total else 0,
            "recoverable_value": round(sum(float(l.get("total") or 0) for l in abandoned), 2),
            "suggestions": suggestions,
        }

    # ════════════════════════════════════════════════════════════════════
    # 5) Stock-out forecast — تنبؤ نفاد المخزون
    # ════════════════════════════════════════════════════════════════════
    @router.get("/smart/stock-forecast")
    async def stock_forecast(days: int = Query(14, ge=7, le=60), user: dict = Depends(require_tenant)):
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        sales = await db.sales.find({"created_at": {"$gte": since}, "status": {"$ne": "cancelled"}},
                                    {"_id": 0, "items": 1}).to_list(5000)
        velocity = {}  # product_id → units/day
        for s in sales:
            for it in (s.get("items") or []):
                pid = it.get("product_id") or it.get("id")
                if pid:
                    velocity[pid] = velocity.get(pid, 0) + float(it.get("quantity") or 1)
        velocity = {k: v / days for k, v in velocity.items()}

        products = await db.products.find({"is_non_stockable": {"$ne": True}},
                                          {"_id": 0, "id": 1, "name_ar": 1, "name_en": 1, "quantity": 1, "purchase_price": 1}).to_list(2000)
        out = []
        for p in products:
            v = velocity.get(p["id"], 0)
            if v <= 0:
                continue
            qty = float(p.get("quantity") or 0)
            days_left = round(qty / v, 1) if v else None
            out.append({
                "product_id": p["id"], "name": p.get("name_ar") or p.get("name_en") or "",
                "stock": qty, "daily_velocity": round(v, 2), "days_left": days_left,
                "suggested_reorder": int(v * 14) + 1,
                "urgency": "critical" if (days_left or 99) <= 3 else "warning" if (days_left or 99) <= 7 else "ok",
            })
        out.sort(key=lambda x: x["days_left"] or 999)
        return {"days_analyzed": days, "forecast": [o for o in out if o["urgency"] != "ok" or o["days_left"] <= 14][:50]}

    # ════════════════════════════════════════════════════════════════════
    # 6) Competitor watch — تتبع أسعار المنافسين
    # ════════════════════════════════════════════════════════════════════
    class CompetitorWatchIn(BaseModel):
        product_name: str
        competitor_url: str
        competitor_name: str = ""
        my_price: float = 0
        competitor_price: float = 0

    @router.post("/smart/competitor-watch")
    async def add_competitor_watch(data: CompetitorWatchIn, user: dict = Depends(get_tenant_admin)):
        doc = data.model_dump()
        doc.update({"id": str(uuid.uuid4()), "created_at": datetime.now(timezone.utc).isoformat(),
                    "price_history": [{"price": data.competitor_price, "at": datetime.now(timezone.utc).isoformat()}]
                    if data.competitor_price else []})
        await db.competitor_watch.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.get("/smart/competitor-watch")
    async def list_competitor_watch(user: dict = Depends(require_tenant)):
        rows = await db.competitor_watch.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
        for r in rows:
            if r.get("my_price") and r.get("competitor_price"):
                r["verdict"] = ("منافسك أرخص — راجع سعرك" if r["competitor_price"] < r["my_price"]
                                else "سعرك أفضل ✓")
        return {"items": rows}

    @router.put("/smart/competitor-watch/{watch_id}/price")
    async def update_competitor_price(watch_id: str, body: dict, user: dict = Depends(get_tenant_admin)):
        price = float(body.get("competitor_price") or 0)
        now = datetime.now(timezone.utc).isoformat()
        w = await db.competitor_watch.find_one({"id": watch_id})
        if not w:
            raise HTTPException(status_code=404, detail="غير موجود")
        old = float(w.get("competitor_price") or 0)
        await db.competitor_watch.update_one(
            {"id": watch_id},
            {"$set": {"competitor_price": price, "updated_at": now},
             "$push": {"price_history": {"price": price, "at": now}}})
        dropped = old > 0 and price < old
        return {"ok": True, "price_dropped": dropped,
                "alert_ar": f"⚠️ منافسك خفّض من {old} إلى {price} دج" if dropped else None}

    @router.delete("/smart/competitor-watch/{watch_id}")
    async def delete_competitor_watch(watch_id: str, user: dict = Depends(get_tenant_admin)):
        await db.competitor_watch.delete_one({"id": watch_id})
        return {"ok": True}

    # ════════════════════════════════════════════════════════════════════
    # 9) Wilaya risk map — خريطة مخاطر الولايات (خاصة + شبكة المنصة)
    # ════════════════════════════════════════════════════════════════════
    @router.get("/smart/wilaya-risk-map")
    async def wilaya_risk_map(user: dict = Depends(require_tenant)):
        def _bucket(rows):
            out = []
            for r in rows:
                done = (r.get("delivered") or 0) + (r.get("returned") or 0)
                rate = round(100 * (r.get("returned") or 0) / done, 1) if done else 0
                out.append({"wilaya": r["_id"], "orders": r.get("n", 0), "delivered": r.get("delivered", 0),
                            "returned": r.get("returned", 0), "return_rate": rate,
                            "level": "red" if rate >= 30 else "amber" if rate >= 15 else "green"})
            out.sort(key=lambda x: -x["return_rate"])
            return out

        pipeline = [
            {"$group": {"_id": "$customer.wilaya", "n": {"$sum": 1},
                        "delivered": {"$sum": {"$cond": [{"$eq": ["$status", "delivered"]}, 1, 0]}},
                        "returned": {"$sum": {"$cond": [{"$in": ["$status", ["returned", "refunded"]]}, 1, 0]}}}},
        ]
        own = _bucket(await db.ecom_orders.aggregate(pipeline).to_list(100))
        # Platform-wide: anonymized counters only (no PII)
        net = _bucket(await main_db.ecom_orders_network.aggregate(pipeline).to_list(100)) \
            if await main_db.list_collection_names() and "ecom_orders_network" in await main_db.list_collection_names() else []
        return {"own": own, "network": net}

    # ════════════════════════════════════════════════════════════════════
    # 12) Morning report — تقرير الصباح
    # ════════════════════════════════════════════════════════════════════
    @router.get("/smart/morning-report")
    async def morning_report(user: dict = Depends(require_tenant)):
        now = datetime.now(timezone.utc)
        y0 = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        y1 = y0 + timedelta(days=1)
        rng = {"created_at": {"$gte": y0.isoformat(), "$lt": y1.isoformat()}}

        sales = await db.sales.find({**rng, "status": {"$ne": "cancelled"}}, {"_id": 0}).to_list(2000)
        ecom = await db.ecom_orders.find(rng, {"_id": 0}).to_list(2000)
        revenue = sum(float(s.get("total") or 0) for s in sales) + sum(float(o.get("total") or 0) for o in ecom if o.get("status") != "cancelled")
        pending = await db.ecom_orders.count_documents({"status": {"$in": ["new", "awaiting_confirmation"]}})

        # best product yesterday
        counter = {}
        for s in sales:
            for it in (s.get("items") or []):
                nm = it.get("name") or it.get("product_name") or "منتج"
                counter[nm] = counter.get(nm, 0) + float(it.get("quantity") or 1)
        best = max(counter.items(), key=lambda kv: kv[1])[0] if counter else None

        parts = [f"صباح الخير! تقرير الأمس ({y0.strftime('%Y-%m-%d')}):"]
        parts.append(f"• بعت {len(sales) + len(ecom)} طلباً بإجمالي {revenue:,.0f} دج")
        if best:
            parts.append(f"• أفضل منتج: {best}")
        if pending:
            parts.append(f"• عندك {pending} طلبات لم تُؤكد — ابدأ بها!")
        # stock alerts from forecast
        fc = await stock_forecast(14, user)
        crit = [f for f in fc["forecast"] if f["urgency"] == "critical"]
        if crit:
            parts.append(f"• ⚠️ {len(crit)} منتجات تنفد خلال 3 أيام: " + "، ".join(c["name"] for c in crit[:3]))
        if len(parts) == 2 and revenue == 0:
            parts.append("• يوم هادئ — جرّب عرضاً ترويجياً اليوم 💪")
        return {"date": y0.strftime("%Y-%m-%d"), "text": "\n".join(parts),
                "stats": {"orders": len(sales) + len(ecom), "revenue": revenue, "pending": pending, "best_product": best}}

    # ════════════════════════════════════════════════════════════════════
    # 13) QR return — استرجاع بمسح بوليصة الشحن
    # ════════════════════════════════════════════════════════════════════
    @router.post("/smart/return-by-tracking")
    async def return_by_tracking(body: dict, user: dict = Depends(get_tenant_admin)):
        """One-tap return: tracking number (scanned from label QR) → restock + mark returned."""
        tracking = (body.get("tracking") or "").strip()
        if not tracking:
            raise HTTPException(status_code=400, detail="tracking مطلوب")
        order = await db.ecom_orders.find_one({"tracking_number": tracking}, {"_id": 0})
        if not order:
            order = await db.ecom_orders.find_one({"order_code": tracking}, {"_id": 0})
        if not order:
            raise HTTPException(status_code=404, detail="لم يُعثر على طلب بهذا الرقم")
        if order.get("status") in ("returned", "refunded"):
            return {"ok": False, "already_returned": True, "order_code": order.get("order_code")}
        if order.get("status") not in ("shipped", "delivered", "on_the_way", "in_transit", "delivery_exception"):
            raise HTTPException(status_code=400,
                                detail=f"لا يمكن الاسترجاع من حالة «{order.get('status')}» — الطلب يجب أن يكون مشحوناً أو مسلّماً")

        from services.application.ecom_order_service import change_order_status
        # State machine path: shipped/delivered → refunded (returned == refunded في هذا النظام)
        await change_order_status(db, order["id"], "refunded",
                                  f"استرجاع عبر مسح QR ({tracking})", user)
        # Restock
        restocked = []
        for it in (order.get("items") or []):
            pid = it.get("product_id")
            qty = float(it.get("qty") or it.get("quantity") or 1)
            if pid:
                await db.products.update_one({"id": pid}, {"$inc": {"quantity": qty}})
                restocked.append({"product_id": pid, "qty": qty})
        await db.ecom_returns_log.insert_one({
            "id": str(uuid.uuid4()), "order_id": order["id"], "order_code": order.get("order_code"),
            "tracking": tracking, "restocked": restocked, "by": user.get("id"),
            "at": datetime.now(timezone.utc).isoformat(),
        })
        return {"ok": True, "order_code": order.get("order_code"), "restocked": restocked,
                "message_ar": f"تم الاسترجاع: {order.get('order_code')} — أعيد {len(restocked)} منتجاً للمخزون"}

    return router


def create_smart_router_ext(db, main_db, require_tenant, get_tenant_admin, get_tenant_db):
    """p144: WhatsApp sales bot config + Flash Day mode (kept separate for clarity)."""
    router = APIRouter(tags=["smart2"])

    # ════════════════════════════════════════════════════════════════════
    # 3) WhatsApp sales bot — بوت المبيعات
    # ════════════════════════════════════════════════════════════════════
    class WaBotSettings(BaseModel):
        enabled: bool = False
        greeting_ar: str = "أهلاً بك! أرسل اسم منتج أو صورته وسأرشح لك من متجرنا 🛍️"
        max_suggestions: int = 3

    @router.get("/smart/wa-bot/settings")
    async def get_wa_bot(user: dict = Depends(get_tenant_admin)):
        s = await db.wa_bot_settings.find_one({"id": "main"}, {"_id": 0})
        return s or WaBotSettings().model_dump() | {"id": "main"}

    @router.put("/smart/wa-bot/settings")
    async def set_wa_bot(data: WaBotSettings, user: dict = Depends(get_tenant_admin)):
        await db.wa_bot_settings.update_one({"id": "main"}, {"$set": data.model_dump()}, upsert=True)
        return {"ok": True, "enabled": data.enabled}

    @router.get("/smart/wa-bot/log")
    async def wa_bot_log(user: dict = Depends(get_tenant_admin)):
        rows = await db.wa_bot_log.find({}, {"_id": 0}).sort("at", -1).to_list(50)
        return {"items": rows}

    # ════════════════════════════════════════════════════════════════════
    # 10) Flash Day mode — وضع يوم التخفيضات
    # ════════════════════════════════════════════════════════════════════
    class FlashDayIn(BaseModel):
        active: bool
        discount_pct: float = 0        # 0-90
        ends_at: str = ""              # ISO; empty = tonight 23:59
        banner_ar: str = "🔥 عروض اليوم فقط!"

    @router.get("/smart/flash-day")
    async def get_flash_day(user: dict = Depends(require_tenant)):
        s = await db.store_settings.find_one({}, {"_id": 0, "flash_day": 1})
        return {"flash_day": (s or {}).get("flash_day") or {"active": False}}

    @router.put("/smart/flash-day")
    async def set_flash_day(data: FlashDayIn, user: dict = Depends(get_tenant_admin)):
        if not (0 <= data.discount_pct <= 90):
            raise HTTPException(status_code=400, detail="نسبة الخصم بين 0 و 90")
        ends = data.ends_at
        if data.active and not ends:
            ends = datetime.now(timezone.utc).replace(hour=23, minute=59, second=59).isoformat()
        doc = {"active": data.active, "discount_pct": data.discount_pct,
               "ends_at": ends, "banner_ar": data.banner_ar,
               "updated_at": datetime.now(timezone.utc).isoformat()}
        await db.store_settings.update_one({}, {"$set": {"flash_day": doc}}, upsert=True)
        return {"ok": True, "flash_day": doc}

    @router.get("/smart/flash-day/report")
    async def flash_day_report(user: dict = Depends(get_tenant_admin)):
        """End-of-day report: sales during the last active flash window."""
        s = await db.store_settings.find_one({}, {"_id": 0, "flash_day": 1})
        fd = (s or {}).get("flash_day") or {}
        started = fd.get("updated_at", "")
        ended = fd.get("ends_at") or datetime.now(timezone.utc).isoformat()
        if not started:
            return {"report": None}
        rng = {"created_at": {"$gte": started, "$lte": ended}}
        orders = await db.ecom_orders.find({**rng, "status": {"$ne": "cancelled"}}, {"_id": 0}).to_list(2000)
        sales = await db.sales.find({**rng, "status": {"$ne": "cancelled"}}, {"_id": 0}).to_list(2000)
        rev = sum(float(o.get("total") or 0) for o in orders) + sum(float(s2.get("total") or 0) for s2 in sales)
        return {"report": {"orders_count": len(orders) + len(sales), "revenue": round(rev, 2),
                           "window": {"from": started, "to": ended},
                           "summary_ar": f"يوم الهاي: {len(orders) + len(sales)} طلباً بـ {rev:,.0f} دج"}}

    return router


async def handle_wa_sales_bot(db, tenant_id: str, parsed: dict, store_slug: str) -> bool:
    """p144 (idea 3): if the WA message is NOT a confirm/cancel reply and the bot is
    enabled, treat it as a product query and answer with matching products + store link.

    Returns True if the bot replied (caller should skip lead creation).
    """
    from services.ecom.whatsapp_service import send_text_message

    settings = await db.wa_bot_settings.find_one({"id": "main"}, {"_id": 0})
    if not settings or not settings.get("enabled"):
        return False
    phone = parsed.get("from_phone") or ""
    text = (parsed.get("text") or "").strip()
    if not phone:
        return False

    integration = await db.ecom_integrations.find_one(
        {"channel": "whatsapp", "is_active": True}, {"_id": 0})
    if not integration:
        return False

    if not text:
        await send_text_message(integration, phone, settings.get("greeting_ar") or "أهلاً!")
        await db.wa_bot_log.insert_one({"id": str(uuid.uuid4()), "phone": phone,
                                        "query": "<media>", "replied": "greeting",
                                        "at": datetime.now(timezone.utc).isoformat()})
        return True

    # Product search: name/barcode, Arabic-friendly contains-match on words
    words = [w for w in re.split(r"\s+", text) if len(w) >= 2][:4]
    query = {"$or": [{"name_ar": {"$regex": re.escape(w), "$options": "i"}} for w in words] +
                    [{"name_en": {"$regex": re.escape(w), "$options": "i"}} for w in words] +
                    [{"barcode": text}]}
    products = await db.products.find(
        {**query, "quantity": {"$gt": 0}},
        {"_id": 0, "name_ar": 1, "name_en": 1, "sale_price": 1, "price": 1, "quantity": 1},
    ).limit(int(settings.get("max_suggestions") or 3)).to_list(5)

    link = f"https://nt-commerce.net/shop/{store_slug}" if store_slug else ""
    if products:
        lines = [f"🛍️ لقيت هذو في متجرنا:"]
        for p in products:
            price = p.get("sale_price") or p.get("price") or 0
            lines.append(f"• {p.get('name_ar') or p.get('name_en')} — {price:,.0f} دج")
        if link:
            lines.append(f"\nاطلب مباشرة من هنا 👇\n{link}")
    else:
        lines = [f"ما لقيتش «{text[:40]}» في المخزون حالياً 🙏"]
        if link:
            lines.append(f"تصفّح كل المنتجات هنا 👇\n{link}")
    await send_text_message(integration, phone, "\n".join(lines))
    await db.wa_bot_log.insert_one({"id": str(uuid.uuid4()), "phone": phone, "query": text[:120],
                                    "replied": f"{len(products)} products",
                                    "at": datetime.now(timezone.utc).isoformat()})
    return True
