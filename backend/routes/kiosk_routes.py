"""Self-service kiosk — customer-facing recharge & card requests.

The shop places a phone/tablet at the counter opened on /flexy-kiosk/<token>.
The customer builds a request (flexy top-up or scratch card) but NOTHING
is executed or delivered until the merchant collects the cash and approves
the request from the merchant panel — approval reuses the exact same
saga / stock-claim code paths as the cashier UI.

Tenant-scoped collections (inside each tenant DB):
  - kiosk_sessions  : {id, token_hash, label, active, tenant_id, expires_at,
                       max_amount, allow_recharge, allow_cards,
                       created_by, created_at, last_used_at}
  - kiosk_requests  : {id, code, session_id, kind, status, payload...,
                       price_estimate, price_final, expires_at, ...}

Security notes:
  - Kiosk endpoints are gated by a high-entropy session token (sha256 stored,
    plaintext returned once at creation). The token embeds the tenant id so
    the public endpoints can resolve the tenant DB explicitly — the `db`
    proxy falls back to main_db without a JWT context, so public handlers
    must NEVER touch `db`; they use the resolved tenant handle only.
  - Kiosk endpoints can ONLY read the public catalog and create/poll
    requests. All money movement happens in the JWT-protected approve
    endpoint, after the merchant collects the cash.
  - Approval is an atomic pending->processing transition (no double-approve).
  - Rate limits: per-session per-minute create cap + pending backlog cap.
  - The catalog never exposes cost/profit data — only customer-facing prices.
"""
from datetime import datetime, timezone, timedelta
from typing import Literal, Optional
import hashlib
import logging
import re
import secrets
import uuid

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from pymongo import ReturnDocument

logger = logging.getLogger(__name__)

REQUEST_TTL_MINUTES = 30
MAX_PENDING_PER_SESSION = 15
MAX_CREATE_PER_MINUTE = 8
MAX_CARD_QTY = 5
PHONE_RE = re.compile(r"^0[567]\d{8}$")
TOKEN_PREFIX = "k_"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _normalize_phone(raw: str) -> str:
    """Normalize an Algerian mobile number to 0XXXXXXXXX; '' if invalid."""
    phone = re.sub(r"[\s\-\.]", "", raw or "")
    if phone.startswith("+213"):
        phone = "0" + phone[4:]
    elif phone.startswith("213"):
        phone = "0" + phone[3:]
    return phone if PHONE_RE.match(phone) else ""


def _request_summary(doc: dict) -> str:
    """Customer-facing one-line summary of a kiosk request."""
    if doc.get("kind") == "recharge":
        return f"{doc.get('operator_name', '')} {doc.get('amount', 0):g} دج → {doc.get('phone_number', '')}"
    qty = doc.get("quantity", 1)
    suffix = f" × {qty:g}" if qty != 1 else ""
    return f"بطاقة {doc.get('card_name', '')}{suffix}"


def create_kiosk_routes(db, main_db, require_tenant, get_tenant_admin, RECHARGE_CONFIG, RechargeCreate, get_tenant_db):
    router = APIRouter()

    # ---------------- shared helpers ----------------

    async def _effective_config() -> dict:
        """Merge RECHARGE_CONFIG with admin DB overrides (same rules as core_routes)."""
        if main_db is None:
            return {k: dict(v) for k, v in RECHARGE_CONFIG.items()}
        effective = {}
        for key, defaults in RECHARGE_CONFIG.items():
            override = await main_db.recharge_operator_config.find_one({"operator": key}, {"_id": 0})
            if override:
                merged = dict(defaults)
                if "commission" in override:
                    merged["commission"] = override["commission"]
                if "platform_commission" in override:
                    merged["platform_commission"] = override["platform_commission"]
                if "amounts" in override and override["amounts"]:
                    merged["amounts"] = override["amounts"]
                effective[key] = merged
            else:
                effective[key] = dict(defaults)
        return effective

    async def _get_session(token: str):
        """Resolve a kiosk token to (session, tenant_db) — public endpoints.

        The token embeds the tenant id ('k_<tenant_id>_<random>') so we can
        resolve the tenant DB explicitly: the `db` proxy would silently fall
        back to main_db without a JWT context.
        """
        if not token or len(token) > 128 or not token.startswith(TOKEN_PREFIX):
            raise HTTPException(status_code=404, detail="رابط الكشك غير صالح")
        tenant_id = token[len(TOKEN_PREFIX):len(TOKEN_PREFIX) + 36]
        tdb = get_tenant_db(tenant_id)
        doc = await tdb.kiosk_sessions.find_one({"token_hash": _hash_token(token)}, {"_id": 0})
        if not doc or not doc.get("active"):
            raise HTTPException(status_code=404, detail="رابط الكشك غير صالح أو تم إيقافه")
        exp = doc.get("expires_at", "")
        if exp and exp < _iso(_now()):
            raise HTTPException(status_code=410, detail="انتهت صلاحية جلسة الكشك — اطلب من البائع تجديد الرابط")
        return doc, tdb

    async def _sweep_expired(tdb) -> None:
        """Lazy expiry: pending requests older than their TTL become 'expired'."""
        await tdb.kiosk_requests.update_many(
            {"status": "pending", "expires_at": {"$lt": _iso(_now())}},
            {"$set": {"status": "expired"}},
        )

    async def _store_name(tdb) -> str:
        for key in ("store_name", "shop_name", "company_name"):
            doc = await tdb.settings.find_one({"key": key}, {"_id": 0, "value": 1})
            if doc and doc.get("value"):
                return str(doc["value"])
        return ""

    async def _estimate_sale_price(tenant_id: str, op_cfg: dict, amount: float) -> float:
        """Mirror the saga's pricing: cost after commission, then tenant margin rule."""
        commission_rate = op_cfg.get("commission", 0) / 100
        cost = amount - amount * commission_rate
        sale_price = round(float(amount), 2)
        if tenant_id and main_db is not None:
            try:
                from services.pricing_engine import get_active_margin_rule, apply_margin_rule
                rule = await get_active_margin_rule(main_db, tenant_id, "recharge")
                if rule:
                    sale_price, _extra = apply_margin_rule(cost, rule)
            except Exception:
                pass
        return sale_price

    async def _execute_card_sale(req: dict, cash_box_id: str, user: dict) -> dict:
        """Cash-only card sale for kiosk approvals — mirrors /cards/sell (cash path)."""
        qty = float(req.get("quantity", 1) or 1)
        now = _iso(_now())
        card = await db.card_stock.find_one_and_update(
            {"id": req["card_id"], "quantity": {"$gte": qty}},
            {"$inc": {"quantity": -qty}, "$set": {"updated_at": now}},
            return_document=ReturnDocument.BEFORE,
        )
        if not card:
            raise HTTPException(status_code=400, detail="الكمية المتوفرة غير كافية")
        unit_cost = float(card.get("unit_cost", 0) or 0)
        sell_price = float(card.get("sell_price") or card.get("denomination") or 0)
        if sell_price <= 0:
            await db.card_stock.update_one({"id": req["card_id"]}, {"$inc": {"quantity": qty}})
            raise HTTPException(status_code=400, detail="سعر البيع غير مضبوط لهذه البطاقة")
        total = round(sell_price * qty, 2)
        profit = round((sell_price - unit_cost) * qty, 2)

        from services.code_generator import generate_code
        code = await generate_code(db, "sales", "CARD", 5, with_year=True)
        sale_id = str(uuid.uuid4())
        sale_inserted = False
        cash_done = False
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
                    "is_card_sale": True, "card_id": req["card_id"],
                }],
                "subtotal": total, "discount": 0, "discount_total": 0, "tax_total": 0,
                "total": total,
                "paid_amount": total, "debt_amount": 0, "remaining": 0,
                "payment_method": cash_box_id, "payment_type": "cash",
                "payments": [{"amount": total, "method": cash_box_id, "at": now}],
                "customer_id": None, "customer_name": "عميل الكشك",
                "type": "card_sale", "source": "kiosk",
                "status": "paid",
                "notes": f"kiosk:{req.get('code', '')}",
                "user_id": user.get("id"), "user_name": user.get("name", ""),
                "created_at": now, "created_by": user.get("name", ""),
            })
            sale_inserted = True
            await db.cash_boxes.update_one(
                {"id": cash_box_id},
                {"$inc": {"balance": total}, "$set": {"updated_at": now}},
            )
            await db.transactions.insert_one({
                "id": str(uuid.uuid4()),
                "cash_box_id": cash_box_id,
                "type": "income",
                "amount": total,
                "description": f"بيع بطاقة {card.get('name')}" + (f" × {qty:g}" if qty != 1 else "") + f" (كشك {req.get('code', '')})",
                "reference_type": "card_sale",
                "reference_id": sale_id,
                "created_at": now,
                "created_by": user.get("name", ""),
            })
            cash_done = True
            try:
                await db.daily_sessions.update_one(
                    {"user_id": user.get("id"), "status": "open"},
                    {"$inc": {"total_sales": total, "cash_sales": total, "sales_count": 1}},
                )
            except Exception:
                pass
        except HTTPException:
            raise
        except Exception as e:
            if sale_inserted:
                try:
                    await db.sales.delete_one({"id": sale_id})
                except Exception:
                    logger.exception("kiosk card sale rollback (sale) failed for %s", sale_id)
            if cash_done:
                try:
                    await db.cash_boxes.update_one(
                        {"id": cash_box_id},
                        {"$inc": {"balance": -total}, "$set": {"updated_at": now}},
                    )
                    await db.transactions.delete_one({"reference_type": "card_sale", "reference_id": sale_id})
                except Exception:
                    logger.exception("kiosk card sale rollback (money) failed for %s", sale_id)
            try:
                await db.card_stock.update_one({"id": req["card_id"]}, {"$inc": {"quantity": qty}})
            except Exception:
                logger.exception("kiosk card sale rollback (stock) failed for %s", req["card_id"])
            logger.exception("kiosk card sale failed: %s", e)
            raise HTTPException(status_code=500, detail="فشل تسجيل بيع البطاقة") from e

        return {"sale_id": sale_id, "total": total, "profit": profit}

    # ============ MERCHANT (JWT) — registered BEFORE /kiosk/{token} ============

    class KioskSessionIn(BaseModel):
        label: str = "كشك الخدمة الذاتية"
        expires_hours: int = Field(default=12, ge=1, le=72)
        max_amount: float = Field(default=5000, gt=0, le=1000000)
        allow_recharge: bool = True
        allow_cards: bool = True

    @router.post("/kiosk/sessions", status_code=201)
    async def create_session(payload: KioskSessionIn, admin: dict = Depends(get_tenant_admin)):
        """Create a kiosk session — the token is returned ONCE (only its hash is stored)."""
        tenant_id = admin.get("tenant_id", "")
        token = f"{TOKEN_PREFIX}{tenant_id}_{secrets.token_urlsafe(24)}"
        now = _now()
        doc = {
            "id": str(uuid.uuid4()),
            "token_hash": _hash_token(token),
            "label": (payload.label or "كشك الخدمة الذاتية").strip()[:60],
            "active": True,
            "tenant_id": tenant_id,
            "expires_at": _iso(now + timedelta(hours=payload.expires_hours)),
            "max_amount": float(payload.max_amount),
            "allow_recharge": bool(payload.allow_recharge),
            "allow_cards": bool(payload.allow_cards),
            "created_by": admin.get("name", ""),
            "created_at": _iso(now),
            "last_used_at": None,
        }
        await db.kiosk_sessions.insert_one(doc)
        return {
            "id": doc["id"],
            "token": token,
            "path": f"/flexy-kiosk/{token}",
            "label": doc["label"],
            "expires_at": doc["expires_at"],
        }

    @router.get("/kiosk/sessions")
    async def list_sessions(admin: dict = Depends(get_tenant_admin)):
        docs = await db.kiosk_sessions.find(
            {}, {"_id": 0, "token_hash": 0},
        ).sort("created_at", -1).to_list(50)
        now_iso = _iso(_now())
        for d in docs:
            d["expired"] = bool(d.get("expires_at") and d["expires_at"] < now_iso)
        return docs

    @router.delete("/kiosk/sessions/{session_id}")
    async def revoke_session(session_id: str, admin: dict = Depends(get_tenant_admin)):
        res = await db.kiosk_sessions.update_one(
            {"id": session_id}, {"$set": {"active": False}},
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="الجلسة غير موجودة")
        return {"ok": True}

    @router.get("/kiosk/requests")
    async def list_requests(status: Optional[str] = None, user: dict = Depends(require_tenant)):
        """Merchant queue — pending kiosk requests plus recent decided ones."""
        await _sweep_expired(db)
        query = {}
        if status:
            query["status"] = status
        docs = await db.kiosk_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
        for d in docs:
            d["summary"] = _request_summary(d)
        pending_count = await db.kiosk_requests.count_documents({"status": "pending"})
        return {"requests": docs, "pending_count": pending_count}

    class KioskApproveIn(BaseModel):
        cash_box_id: str = "cash"

    @router.post("/kiosk/requests/{request_id}/approve")
    async def approve_request(request_id: str, payload: KioskApproveIn, user: dict = Depends(require_tenant)):
        """Approve after collecting the cash — executes the real recharge/card sale.

        The recharge path reuses the cashier's compensating saga (wallet debit,
        cashbox, sales journal, bridge dispatch, rollback). The card path mirrors
        the atomic stock-claim sale. Money moves only here — never in the kiosk.
        """
        await _sweep_expired(db)
        if not await db.cash_boxes.find_one({"id": payload.cash_box_id}, {"_id": 1}):
            raise HTTPException(status_code=404, detail="الصندوق غير موجود")
        doc = await db.kiosk_requests.find_one_and_update(
            {"id": request_id, "status": "pending"},
            {"$set": {
                "status": "processing",
                "approved_by": user.get("name", ""),
                "approved_at": _iso(_now()),
            }},
            return_document=ReturnDocument.AFTER,
        )
        if not doc:
            raise HTTPException(status_code=409, detail="الطلب لم يعد في الانتظار (عولج أو انتهى)")

        try:
            if doc.get("kind") == "recharge":
                cfg = await _effective_config()
                kwargs = dict(
                    operator=doc["operator"],
                    phone_number=doc["phone_number"],
                    amount=doc["amount"],
                    recharge_type=doc["recharge_type"],
                    customer_id=None,
                    payment_method=payload.cash_box_id,
                    notes=f"kiosk:{doc.get('code', '')}",
                )
                try:
                    recharge = RechargeCreate(**kwargs)
                except Exception:
                    # custom cash-box ids fall outside the Literal — skip validation
                    recharge = RechargeCreate.model_construct(**kwargs)
                from services.application.recharge_service import execute_recharge_saga
                rdoc = await execute_recharge_saga(db, main_db, cfg, recharge, user)
                await db.kiosk_requests.update_one(
                    {"id": request_id},
                    {"$set": {
                        "status": "done",
                        "recharge_id": rdoc["id"],
                        "price_final": rdoc.get("sale_price", doc.get("price_estimate")),
                        "decided_at": _iso(_now()),
                    }},
                )
                return {"ok": True, "status": "done", "recharge_id": rdoc["id"],
                        "price_final": rdoc.get("sale_price")}

            result = await _execute_card_sale(doc, payload.cash_box_id, user)
            await db.kiosk_requests.update_one(
                {"id": request_id},
                {"$set": {
                    "status": "done",
                    "sale_id": result["sale_id"],
                    "price_final": result["total"],
                    "decided_at": _iso(_now()),
                }},
            )
            return {"ok": True, "status": "done", "sale_id": result["sale_id"],
                    "price_final": result["total"]}
        except HTTPException as e:
            await db.kiosk_requests.update_one(
                {"id": request_id},
                {"$set": {"status": "failed", "error": str(e.detail), "decided_at": _iso(_now())}},
            )
            raise
        except Exception as e:
            logger.exception("kiosk approve failed for %s: %s", request_id, e)
            await db.kiosk_requests.update_one(
                {"id": request_id},
                {"$set": {"status": "failed", "error": "خطأ داخلي", "decided_at": _iso(_now())}},
            )
            raise HTTPException(status_code=500, detail="تعذر تنفيذ الطلب") from e

    @router.post("/kiosk/requests/{request_id}/reject")
    async def reject_request(request_id: str, reason: Optional[str] = None, user: dict = Depends(require_tenant)):
        res = await db.kiosk_requests.update_one(
            {"id": request_id, "status": "pending"},
            {"$set": {
                "status": "rejected",
                "decided_by": user.get("name", ""),
                "decided_at": _iso(_now()),
                "error": (reason or "")[:200],
            }},
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=409, detail="الطلب لم يعد في الانتظار")
        return {"ok": True}

    # ============ PUBLIC (kiosk token) — after all /kiosk/<literal> routes ============
    # NOTE: these handlers receive `tdb` from _get_session and must use it for
    # every tenant-scoped query — `db` would silently hit main_db (no JWT here).

    @router.get("/kiosk/{token}")
    async def kiosk_catalog(token: str):
        """Public catalog for the customer screen — prices only, never costs."""
        session, tdb = await _get_session(token)
        await tdb.kiosk_sessions.update_one(
            {"id": session["id"]}, {"$set": {"last_used_at": _iso(_now())}},
        )
        cfg = await _effective_config()
        operators = {}
        if session.get("allow_recharge", True):
            for key, oc in cfg.items():
                types = [t for t in (oc.get("ussd") or {}).keys() if t != "balance"]
                if not types:
                    continue
                operators[key] = {
                    "name": oc.get("name", key),
                    "name_en": oc.get("name_en", key),
                    "amounts": oc.get("amounts", []),
                    "types": types,
                }
        cards = []
        if session.get("allow_cards", True):
            cursor = tdb.card_stock.find(
                {},
                {"_id": 0, "id": 1, "name": 1, "operator": 1, "denomination": 1,
                 "sell_price": 1, "quantity": 1},
            )
            async for c in cursor:
                cards.append({
                    "id": c["id"],
                    "name": c.get("name", ""),
                    "operator": c.get("operator", ""),
                    "denomination": c.get("denomination", 0),
                    "price": float(c.get("sell_price") or c.get("denomination") or 0),
                    "available": float(c.get("quantity", 0) or 0) > 0,
                })
        return {
            "label": session.get("label", ""),
            "store_name": await _store_name(tdb),
            "max_amount": session.get("max_amount", 5000),
            "allow_recharge": session.get("allow_recharge", True),
            "allow_cards": session.get("allow_cards", True),
            "operators": operators,
            "cards": cards,
        }

    class KioskRequestIn(BaseModel):
        kind: Literal["recharge", "card"]
        operator: Optional[str] = None
        phone_number: Optional[str] = None
        amount: Optional[float] = None
        recharge_type: Optional[str] = None
        card_id: Optional[str] = None
        quantity: Optional[int] = 1

    @router.post("/kiosk/{token}/requests", status_code=201)
    async def kiosk_create_request(token: str, payload: KioskRequestIn):
        """Create a pending request — validates and prices it, executes NOTHING."""
        session, tdb = await _get_session(token)
        now = _now()

        # Rate limits: burst cap per minute + pending backlog cap
        minute_ago = _iso(now - timedelta(minutes=1))
        recent = await tdb.kiosk_requests.count_documents(
            {"session_id": session["id"], "created_at": {"$gte": minute_ago}},
        )
        if recent >= MAX_CREATE_PER_MINUTE:
            raise HTTPException(status_code=429, detail="طلبات كثيرة متتالية — انتظر قليلاً")
        await _sweep_expired(tdb)
        pending = await tdb.kiosk_requests.count_documents(
            {"session_id": session["id"], "status": "pending"},
        )
        if pending >= MAX_PENDING_PER_SESSION:
            raise HTTPException(status_code=429, detail="قائمة الانتظار ممتلئة — راجع البائع")

        max_amount = float(session.get("max_amount", 5000) or 5000)
        doc = {
            "id": str(uuid.uuid4()),
            "session_id": session["id"],
            "kind": payload.kind,
            "status": "pending",
            "created_at": _iso(now),
            "expires_at": _iso(now + timedelta(minutes=REQUEST_TTL_MINUTES)),
        }

        if payload.kind == "recharge":
            if not session.get("allow_recharge", True):
                raise HTTPException(status_code=403, detail="شحن الرصيد غير مفعّل في هذا الكشك")
            cfg = await _effective_config()
            op = cfg.get(payload.operator or "")
            if not op:
                raise HTTPException(status_code=400, detail="المشغّل غير صالح")
            types = [t for t in (op.get("ussd") or {}).keys() if t != "balance"]
            if payload.recharge_type not in types:
                raise HTTPException(status_code=400, detail="نوع الشحن غير متاح لهذا المشغّل")
            try:
                amount = float(payload.amount)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="المبلغ غير صالح")
            if amount <= 0 or amount > max_amount:
                raise HTTPException(status_code=400, detail=f"المبلغ يجب أن يكون بين 1 و {max_amount:g} دج")
            allowed = [float(a) for a in (op.get("amounts") or [])]
            if allowed and amount not in allowed:
                raise HTTPException(status_code=400, detail="هذا المبلغ غير متاح")
            phone = _normalize_phone(payload.phone_number or "")
            if not phone:
                raise HTTPException(status_code=400, detail="رقم الهاتف غير صالح — مثال: 0550123456")
            doc.update({
                "operator": payload.operator,
                "operator_name": op.get("name", payload.operator),
                "phone_number": phone,
                "amount": amount,
                "recharge_type": payload.recharge_type,
                "price_estimate": await _estimate_sale_price(session.get("tenant_id", ""), op, amount),
            })
        else:
            if not session.get("allow_cards", True):
                raise HTTPException(status_code=403, detail="بيع البطاقات غير مفعّل في هذا الكشك")
            card = await tdb.card_stock.find_one({"id": payload.card_id or ""}, {"_id": 0})
            if not card:
                raise HTTPException(status_code=404, detail="البطاقة غير موجودة")
            qty = int(payload.quantity or 1)
            if qty < 1 or qty > MAX_CARD_QTY:
                raise HTTPException(status_code=400, detail=f"الكمية بين 1 و {MAX_CARD_QTY}")
            if float(card.get("quantity", 0) or 0) < qty:
                raise HTTPException(status_code=400, detail="البطاقة غير متوفرة حالياً")
            unit_price = float(card.get("sell_price") or card.get("denomination") or 0)
            if unit_price <= 0:
                raise HTTPException(status_code=400, detail="سعر البطاقة غير مضبوط — راجع البائع")
            total = round(unit_price * qty, 2)
            if total > max_amount:
                raise HTTPException(status_code=400, detail=f"الحد الأقصى للطلب هو {max_amount:g} دج")
            doc.update({
                "card_id": card["id"],
                "card_name": card.get("name", ""),
                "operator": card.get("operator", ""),
                "quantity": qty,
                "price_estimate": total,
            })

        from services.code_generator import generate_code
        doc["code"] = await generate_code(tdb, "kiosk_requests", "K", 4, with_year=False)
        await tdb.kiosk_requests.insert_one(doc)
        return {
            "id": doc["id"],
            "code": doc["code"],
            "status": "pending",
            "price_estimate": doc["price_estimate"],
            "expires_at": doc["expires_at"],
            "summary": _request_summary(doc),
        }

    @router.get("/kiosk/{token}/requests/{request_id}")
    async def kiosk_poll_request(token: str, request_id: str):
        """Customer-side status poll — own session's requests only."""
        session, tdb = await _get_session(token)
        await _sweep_expired(tdb)
        doc = await tdb.kiosk_requests.find_one(
            {"id": request_id, "session_id": session["id"]},
            {"_id": 0, "id": 1, "code": 1, "kind": 1, "status": 1,
             "price_estimate": 1, "price_final": 1, "operator_name": 1,
             "phone_number": 1, "amount": 1, "card_name": 1, "quantity": 1},
        )
        if not doc:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")
        doc["summary"] = _request_summary(doc)
        return doc

    return {"router": router}
