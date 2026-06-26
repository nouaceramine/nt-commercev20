"""
Platform-Supplier service — the Super-Admin acts as an OPTIONAL central
supplier of phone-recharge cards (Mobilis/Djezzy/Ooredoo) and Idoom internet
codes for the tenants. Tenants can still upload their own codes (existing
flow); this module just adds a "buy from the platform" parallel path.

Collections (all in main_db, shared cross-tenant):
    platform_card_catalog   { id, operator, denomination, default_price,
                              tenant_prices: {tenant_id: price}, is_active,
                              created_at }
    platform_idoom_catalog  { id, denomination, default_price, tenant_prices,
                              is_active, created_at }
    platform_card_stock     { id, catalog_id, code, status, tenant_id|null,
                              sold_at|null, created_at }
    platform_idoom_stock    { id, catalog_id, code, status, tenant_id|null,
                              sold_at|null, created_at }
    supplier_orders         { id, tenant_id, items:[{type, catalog_id,
                              operator?, denomination, quantity, unit_price,
                              subtotal, code_ids:[…]}], total, status, 
                              created_at, completed_at }

Order processing is **atomic & all-or-nothing**:
  1. Compute total at the tenant-specific price.
  2. Verify tenant wallet balance ≥ total.
  3. Reserve N available codes per item (status=available -> reserved).
     If any item cannot be fully reserved -> rollback all reservations,
     return 422 with the missing items.
  4. Debit tenant wallet, credit platform wallet, in a single transfer.
  5. Move reserved codes -> sold + insert into the tenant's own
     tenant_db.idoom_codes (for Idoom) or tenant_db.platform_cards (for cards).
  6. Insert supplier_orders doc.
"""
import uuid
import io
import logging
import re
from datetime import datetime, timezone
from typing import Optional, List, Literal

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel, Field

from config.database import main_db, get_tenant_db
from routes.saas.helpers import get_super_admin
from services.wallet_service import PLATFORM_WALLET_ID
from utils.auth import get_current_user

logger = logging.getLogger(__name__)


# ============== Models ==============

class CardCatalogIn(BaseModel):
    operator: str
    denomination: float
    default_price: float
    is_active: bool = True


class IdoomCatalogIn(BaseModel):
    denomination: float
    default_price: float
    is_active: bool = True


class TenantPriceIn(BaseModel):
    tenant_id: str
    price: float


class SupplierOrderItem(BaseModel):
    type: Literal["card", "idoom"]
    catalog_id: str
    quantity: int = Field(ge=1, le=1000)


class SupplierOrderIn(BaseModel):
    items: List[SupplierOrderItem]


# ============== Helpers ==============

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _ensure_wallet(entity_id: str) -> dict:
    w = await main_db.wallets.find_one({"entity_id": entity_id}, {"_id": 0})
    if w:
        return w
    doc = {
        "id": str(uuid.uuid4()),
        "entity_id": entity_id,
        "entity_type": "tenant" if entity_id != PLATFORM_WALLET_ID else "platform",
        "balance": 0.0,
        "currency": "DZD",
        "created_at": _now(),
    }
    await main_db.wallets.insert_one(doc)
    return doc


def _price_for(catalog_doc: dict, tenant_id: str) -> float:
    overrides = catalog_doc.get("tenant_prices") or {}
    if tenant_id in overrides:
        return float(overrides[tenant_id])
    return float(catalog_doc.get("default_price", 0))


async def _create_notification(tenant_id: str, title: str, message: str, link: str = "") -> None:
    """Best-effort notification; silently no-op if collection isn't ready."""
    try:
        tenant_db = get_tenant_db(tenant_id)
        await tenant_db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "title": title,
            "message": message,
            "type": "supplier_order",
            "link": link,
            "is_read": False,
            "created_at": _now(),
        })
    except Exception as exc:
        logger.warning("notif insert failed: %s", exc)


# ============== Router factory ==============

def build_supplier_router() -> APIRouter:
    router = APIRouter(tags=["supplier"])

    # ----- Super-admin catalog management -----

    @router.get("/admin/supplier/catalog/cards")
    async def list_card_catalog(admin: dict = Depends(get_super_admin)):
        items = await main_db.platform_card_catalog.find({}, {"_id": 0}).sort("operator", 1).to_list(500)
        return items

    @router.post("/admin/supplier/catalog/cards")
    async def add_card_catalog(payload: CardCatalogIn, admin: dict = Depends(get_super_admin)):
        existing = await main_db.platform_card_catalog.find_one({
            "operator": payload.operator, "denomination": payload.denomination,
        })
        if existing:
            raise HTTPException(status_code=409, detail="Catalog entry already exists")
        doc = payload.model_dump()
        doc["id"] = str(uuid.uuid4())
        doc["tenant_prices"] = {}
        doc["created_at"] = _now()
        await main_db.platform_card_catalog.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.put("/admin/supplier/catalog/cards/{catalog_id}")
    async def update_card_catalog(catalog_id: str, payload: CardCatalogIn, admin: dict = Depends(get_super_admin)):
        res = await main_db.platform_card_catalog.update_one(
            {"id": catalog_id},
            {"$set": payload.model_dump()},
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Not found")
        return {"ok": True}

    @router.delete("/admin/supplier/catalog/cards/{catalog_id}")
    async def delete_card_catalog(catalog_id: str, admin: dict = Depends(get_super_admin)):
        await main_db.platform_card_catalog.delete_one({"id": catalog_id})
        return {"ok": True}

    @router.put("/admin/supplier/catalog/cards/{catalog_id}/tenant-price")
    async def set_card_tenant_price(catalog_id: str, body: TenantPriceIn, admin: dict = Depends(get_super_admin)):
        res = await main_db.platform_card_catalog.update_one(
            {"id": catalog_id},
            {"$set": {f"tenant_prices.{body.tenant_id}": float(body.price)}},
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Not found")
        return {"ok": True}

    @router.delete("/admin/supplier/catalog/cards/{catalog_id}/tenant-price/{tenant_id}")
    async def clear_card_tenant_price(catalog_id: str, tenant_id: str, admin: dict = Depends(get_super_admin)):
        await main_db.platform_card_catalog.update_one(
            {"id": catalog_id},
            {"$unset": {f"tenant_prices.{tenant_id}": ""}},
        )
        return {"ok": True}

    # Idoom catalog -- mirror of cards
    @router.get("/admin/supplier/catalog/idoom")
    async def list_idoom_catalog(admin: dict = Depends(get_super_admin)):
        items = await main_db.platform_idoom_catalog.find({}, {"_id": 0}).sort("denomination", 1).to_list(500)
        return items

    @router.post("/admin/supplier/catalog/idoom")
    async def add_idoom_catalog(payload: IdoomCatalogIn, admin: dict = Depends(get_super_admin)):
        existing = await main_db.platform_idoom_catalog.find_one({"denomination": payload.denomination})
        if existing:
            raise HTTPException(status_code=409, detail="Catalog entry already exists")
        doc = payload.model_dump()
        doc["id"] = str(uuid.uuid4())
        doc["tenant_prices"] = {}
        doc["created_at"] = _now()
        await main_db.platform_idoom_catalog.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.put("/admin/supplier/catalog/idoom/{catalog_id}")
    async def update_idoom_catalog(catalog_id: str, payload: IdoomCatalogIn, admin: dict = Depends(get_super_admin)):
        res = await main_db.platform_idoom_catalog.update_one(
            {"id": catalog_id}, {"$set": payload.model_dump()}
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Not found")
        return {"ok": True}

    @router.delete("/admin/supplier/catalog/idoom/{catalog_id}")
    async def delete_idoom_catalog(catalog_id: str, admin: dict = Depends(get_super_admin)):
        await main_db.platform_idoom_catalog.delete_one({"id": catalog_id})
        return {"ok": True}

    @router.put("/admin/supplier/catalog/idoom/{catalog_id}/tenant-price")
    async def set_idoom_tenant_price(catalog_id: str, body: TenantPriceIn, admin: dict = Depends(get_super_admin)):
        res = await main_db.platform_idoom_catalog.update_one(
            {"id": catalog_id},
            {"$set": {f"tenant_prices.{body.tenant_id}": float(body.price)}},
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Not found")
        return {"ok": True}

    @router.delete("/admin/supplier/catalog/idoom/{catalog_id}/tenant-price/{tenant_id}")
    async def clear_idoom_tenant_price(catalog_id: str, tenant_id: str, admin: dict = Depends(get_super_admin)):
        await main_db.platform_idoom_catalog.update_one(
            {"id": catalog_id},
            {"$unset": {f"tenant_prices.{tenant_id}": ""}},
        )
        return {"ok": True}

    # ----- Stock management (bulk upload by super-admin) -----

    async def _bulk_upload(collection: str, catalog_id: str, raw_text: str) -> dict:
        cat_coll = main_db.platform_card_catalog if collection == "platform_card_stock" else main_db.platform_idoom_catalog
        if not await cat_coll.find_one({"id": catalog_id}):
            raise HTTPException(status_code=404, detail="Catalog entry not found")
        # Accept one code per line, ignore empties/comments
        codes = [c.strip() for c in raw_text.splitlines() if c.strip() and not c.strip().startswith("#")]
        if not codes:
            return {"inserted": 0, "skipped": 0}
        stock_coll = getattr(main_db, collection)
        # Skip duplicates
        existing_codes = set()
        cursor = stock_coll.find({"code": {"$in": codes}}, {"_id": 0, "code": 1})
        async for d in cursor:
            existing_codes.add(d["code"])
        new_docs = [
            {
                "id": str(uuid.uuid4()),
                "catalog_id": catalog_id,
                "code": c,
                "status": "available",
                "tenant_id": None,
                "sold_at": None,
                "created_at": _now(),
            }
            for c in codes if c not in existing_codes
        ]
        if new_docs:
            await stock_coll.insert_many(new_docs)
        return {"inserted": len(new_docs), "skipped": len(codes) - len(new_docs)}

    @router.post("/admin/supplier/stock/cards/{catalog_id}/upload")
    async def upload_card_codes(catalog_id: str, file: UploadFile = File(...), admin: dict = Depends(get_super_admin)):
        data = (await file.read()).decode("utf-8", errors="ignore")
        return await _bulk_upload("platform_card_stock", catalog_id, data)

    @router.post("/admin/supplier/stock/idoom/{catalog_id}/upload")
    async def upload_idoom_codes(catalog_id: str, file: UploadFile = File(...), admin: dict = Depends(get_super_admin)):
        data = (await file.read()).decode("utf-8", errors="ignore")
        return await _bulk_upload("platform_idoom_stock", catalog_id, data)

    @router.get("/admin/supplier/stock/cards")
    async def cards_stock_stats(admin: dict = Depends(get_super_admin)):
        pipeline = [
            {"$group": {"_id": {"catalog_id": "$catalog_id", "status": "$status"}, "count": {"$sum": 1}}},
        ]
        rows = await main_db.platform_card_stock.aggregate(pipeline).to_list(1000)
        return {"rows": rows}

    @router.get("/admin/supplier/stock/idoom")
    async def idoom_stock_stats(admin: dict = Depends(get_super_admin)):
        pipeline = [
            {"$group": {"_id": {"catalog_id": "$catalog_id", "status": "$status"}, "count": {"$sum": 1}}},
        ]
        rows = await main_db.platform_idoom_stock.aggregate(pipeline).to_list(1000)
        return {"rows": rows}

    @router.get("/admin/supplier/orders")
    async def list_all_orders(
        tenant_id: Optional[str] = None,
        limit: int = Query(100, ge=1, le=500),
        admin: dict = Depends(get_super_admin),
    ):
        q: dict = {}
        if tenant_id:
            q["tenant_id"] = tenant_id
        rows = await main_db.supplier_orders.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        return rows

    # ----- Tenant-facing -----

    @router.get("/supplier/catalog")
    async def tenant_catalog(current_user: dict = Depends(get_current_user)):
        """Return the platform catalog enriched with the caller-tenant price
        and current available stock per item."""
        tenant_id = current_user.get("tenant_id") or current_user.get("id")
        cards = await main_db.platform_card_catalog.find({"is_active": True}, {"_id": 0}).to_list(500)
        idoom = await main_db.platform_idoom_catalog.find({"is_active": True}, {"_id": 0}).to_list(500)

        async def _enrich(items, stock_coll):
            for it in items:
                it["my_price"] = _price_for(it, tenant_id)
                it["available"] = await stock_coll.count_documents({
                    "catalog_id": it["id"], "status": "available",
                })
                it.pop("tenant_prices", None)
            return items

        return {
            "cards": await _enrich(cards, main_db.platform_card_stock),
            "idoom": await _enrich(idoom, main_db.platform_idoom_stock),
        }

    @router.get("/supplier/orders")
    async def my_orders(limit: int = Query(50, ge=1, le=200), current_user: dict = Depends(get_current_user)):
        tenant_id = current_user.get("tenant_id") or current_user.get("id")
        rows = await main_db.supplier_orders.find({"tenant_id": tenant_id}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        return rows

    @router.get("/platform-cards")
    async def my_platform_cards(
        operator: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = Query(200, ge=1, le=2000),
        current_user: dict = Depends(get_current_user),
    ):
        """List the tenant's own platform-card stock (cards bought from the
        platform via supplier order)."""
        tenant_id = current_user.get("tenant_id") or current_user.get("id")
        if not tenant_id:
            return {"items": [], "total": 0}
        tenant_db = get_tenant_db(tenant_id)
        q: dict = {}
        if operator:
            q["operator"] = operator
        if status:
            q["status"] = status
        items = await tenant_db.platform_cards.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        return {"items": items}

    @router.get("/platform-cards/stock-summary")
    async def my_platform_cards_summary(current_user: dict = Depends(get_current_user)):
        """Aggregate counts grouped by (operator, denomination) of *available*
        cards. Used by the POS quick-sell dialog."""
        tenant_id = current_user.get("tenant_id") or current_user.get("id")
        if not tenant_id:
            return []
        tenant_db = get_tenant_db(tenant_id)
        pipeline = [
            {"$match": {"status": "available"}},
            {"$group": {
                "_id": {"operator": "$operator", "denomination": "$denomination"},
                "count": {"$sum": 1},
            }},
            {"$sort": {"_id.operator": 1, "_id.denomination": 1}},
        ]
        rows = await tenant_db.platform_cards.aggregate(pipeline).to_list(200)
        # Also aggregate idoom from tenant's own idoom_codes (excluding sold)
        idoom_rows = []
        try:
            idoom_pipeline = [
                {"$match": {"status": "available"}},
                {"$group": {"_id": {"denomination": "$denomination"}, "count": {"$sum": 1}}},
                {"$sort": {"_id.denomination": 1}},
            ]
            idoom_rows = await tenant_db.idoom_codes.aggregate(idoom_pipeline).to_list(200)
        except Exception:
            pass
        return {"cards": rows, "idoom": idoom_rows}

    class SellPlatformCard(BaseModel):
        operator: str
        denomination: float
        sell_price: Optional[float] = None  # what the customer paid; defaults to denomination
        customer_id: Optional[str] = None
        customer_phone: Optional[str] = None
        payment_method: str = "cash"  # cash | credit

    @router.post("/platform-cards/sell")
    async def sell_platform_card(body: SellPlatformCard, current_user: dict = Depends(get_current_user)):
        """Pop the next available card of the chosen (operator, denomination),
        mark it sold, register a tenant-side sale + cash movement, and
        ─ if credit ─ create a debt row in tenant_db.sales so the customer's
        running balance shows up in /customers/{id}/debt.

        Returns the actual code so the POS can show & print it."""
        tenant_id = current_user.get("tenant_id") or current_user.get("id")
        if not tenant_id:
            raise HTTPException(status_code=403, detail="tenant required")
        tenant_db = get_tenant_db(tenant_id)

        # Atomically reserve & mark sold
        card = await tenant_db.platform_cards.find_one_and_update(
            {"operator": body.operator, "denomination": body.denomination, "status": "available"},
            {"$set": {"status": "sold", "sold_at": _now(), "sold_to": body.customer_phone}},
            return_document=True,
        )
        if not card:
            raise HTTPException(status_code=404, detail=f"لا توجد كروت متاحة من {body.operator} {body.denomination}")

        sell_price = float(body.sell_price) if body.sell_price else float(body.denomination)
        is_credit = body.payment_method == "credit"

        # If credit -> require customer_id and fetch their name
        customer_name = ""
        if is_credit:
            if not body.customer_id:
                # Rollback the card
                await tenant_db.platform_cards.update_one(
                    {"id": card["id"]},
                    {"$set": {"status": "available", "sold_at": None, "sold_to": None}},
                )
                raise HTTPException(status_code=400, detail="البيع الآجل يتطلب اختيار زبون")
            cust = await tenant_db.customers.find_one({"id": body.customer_id}, {"_id": 0, "name": 1})
            if not cust:
                await tenant_db.platform_cards.update_one(
                    {"id": card["id"]},
                    {"$set": {"status": "available", "sold_at": None, "sold_to": None}},
                )
                raise HTTPException(status_code=404, detail="الزبون غير موجود")
            customer_name = cust.get("name", "")

        # Insert a full sale row (so existing reports + /customers/{id}/debt pick it up)
        sale_id = str(uuid.uuid4())
        sale_row = {
            "id": sale_id,
            "invoice_number": f"CARD-{sale_id[:6].upper()}",
            "items": [{
                "name": f"{body.operator} {body.denomination} دج",
                "quantity": 1,
                "price": sell_price,
                "discount": 0,
                "is_platform_card": True,
                "card_code": card.get("code"),
                "card_id": card.get("id"),
            }],
            "subtotal": sell_price,
            "discount_total": 0,
            "tax_total": 0,
            "total": sell_price,
            "paid_amount": 0 if is_credit else sell_price,
            "debt_amount": sell_price if is_credit else 0,
            "payment_method": "credit" if is_credit else "cash",
            "customer_id": body.customer_id,
            "customer_name": customer_name,
            "customer_phone": body.customer_phone,
            "type": "platform_card",
            "source": "pos_quick_card",
            "user_id": current_user.get("id"),
            "user_name": current_user.get("name", ""),
            "created_at": _now(),
        }
        await tenant_db.sales.insert_one(sale_row)

        # Also keep the lighter platform_card_sales log for the cards reports
        await tenant_db.platform_card_sales.insert_one({
            "id": sale_id,
            "type": "platform_card",
            "operator": body.operator,
            "denomination": body.denomination,
            "code": card.get("code"),
            "sell_price": sell_price,
            "payment_method": "credit" if is_credit else "cash",
            "customer_id": body.customer_id,
            "customer_name": customer_name,
            "customer_phone": body.customer_phone,
            "card_id": card.get("id"),
            "created_at": _now(),
            "user_id": current_user.get("id"),
        })

        # Update the user's open daily session (best-effort; ignore if none)
        try:
            user_id_for_session = current_user.get("id")
            if user_id_for_session:
                inc = {"total_sales": sell_price, "sales_count": 1}
                if is_credit:
                    inc["credit_sales"] = sell_price
                else:
                    inc["cash_sales"] = sell_price
                await tenant_db.daily_sessions.update_one(
                    {"user_id": user_id_for_session, "status": "open"},
                    {"$inc": inc},
                )
        except Exception as exc:
            logger.warning("daily_sessions update failed: %s", exc)

        return {
            "sale": {
                "id": sale_id,
                "type": "platform_card",
                "operator": body.operator,
                "denomination": body.denomination,
                "sell_price": sell_price,
                "payment_method": "credit" if is_credit else "cash",
                "customer_id": body.customer_id,
                "customer_name": customer_name,
                "is_credit": is_credit,
                "debt_amount": sell_price if is_credit else 0,
                "created_at": sale_row["created_at"],
            },
            "card": {"code": card.get("code"), "operator": card.get("operator"), "denomination": card.get("denomination")},
        }

    @router.get("/platform-cards/sales")
    async def platform_card_sales(
        limit: int = Query(50, ge=1, le=500),
        skip: int = Query(0, ge=0),
        operator: Optional[str] = Query(None),
        payment_method: Optional[str] = Query(None),
        since: Optional[str] = Query(None, description="ISO date — created_at >= since"),
        until: Optional[str] = Query(None, description="ISO date — created_at <= until"),
        search: Optional[str] = Query(None, description="match code or customer name/phone"),
        current_user: dict = Depends(get_current_user),
    ):
        tenant_id = current_user.get("tenant_id") or current_user.get("id")
        if not tenant_id:
            return {"items": [], "total": 0, "limit": limit, "skip": skip, "has_more": False}
        tenant_db = get_tenant_db(tenant_id)

        # Build filter
        flt: dict = {}
        if operator:
            flt["operator"] = operator
        if payment_method:
            flt["payment_method"] = payment_method
        if since or until:
            rng: dict = {}
            if since:
                rng["$gte"] = since
            if until:
                rng["$lte"] = until
            flt["created_at"] = rng
        if search:
            # case-insensitive partial match on three fields; re.escape
            # handles all regex metacharacters incl. backslash.
            rx = {"$regex": re.escape(search), "$options": "i"}
            flt["$or"] = [
                {"code": rx},
                {"customer_name": rx},
                {"customer_phone": rx},
            ]

        total = await tenant_db.platform_card_sales.count_documents(flt)
        cursor = (
            tenant_db.platform_card_sales
            .find(flt, {"_id": 0})
            .sort("created_at", -1)
            .skip(skip)
            .limit(limit)
        )
        items = await cursor.to_list(limit)
        return {
            "items": items,
            "total": total,
            "limit": limit,
            "skip": skip,
            "has_more": (skip + len(items)) < total,
        }

    @router.post("/supplier/order")
    async def place_order(payload: SupplierOrderIn, current_user: dict = Depends(get_current_user)):
        tenant_id = current_user.get("tenant_id") or current_user.get("id")
        user_type = current_user.get("user_type") or current_user.get("type")
        if user_type and user_type not in ("tenant", "admin", None):
            raise HTTPException(status_code=403, detail="Only tenants can place supplier orders")
        if not payload.items:
            raise HTTPException(status_code=400, detail="empty order")

        # --- Resolve catalog + price for each item ---
        resolved = []
        total = 0.0
        for it in payload.items:
            catalog_coll = main_db.platform_card_catalog if it.type == "card" else main_db.platform_idoom_catalog
            stock_coll = main_db.platform_card_stock if it.type == "card" else main_db.platform_idoom_stock
            cat = await catalog_coll.find_one({"id": it.catalog_id, "is_active": True}, {"_id": 0})
            if not cat:
                raise HTTPException(status_code=404, detail=f"Catalog item {it.catalog_id} not found or inactive")
            unit_price = _price_for(cat, tenant_id)
            avail = await stock_coll.count_documents({"catalog_id": it.catalog_id, "status": "available"})
            if avail < it.quantity:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "error": "insufficient_stock",
                        "catalog_id": it.catalog_id,
                        "requested": it.quantity,
                        "available": avail,
                        "denomination": cat.get("denomination"),
                        "operator": cat.get("operator"),
                    },
                )
            subtotal = unit_price * it.quantity
            total += subtotal
            resolved.append({
                "type": it.type,
                "catalog_id": it.catalog_id,
                "operator": cat.get("operator"),
                "denomination": cat.get("denomination"),
                "quantity": it.quantity,
                "unit_price": unit_price,
                "subtotal": subtotal,
                "cat": cat,
                "stock_coll": stock_coll,
            })

        # --- Wallet balance check ---
        tenant_wallet = await _ensure_wallet(tenant_id)
        if tenant_wallet.get("balance", 0) < total:
            raise HTTPException(status_code=402, detail={
                "error": "insufficient_balance",
                "required": total,
                "available": tenant_wallet.get("balance", 0),
            })

        # --- Reserve codes per item; rollback on failure ---
        reservations = []  # [(stock_coll, [code_id,...])]
        try:
            for r in resolved:
                stock_coll = r["stock_coll"]
                candidate_cursor = stock_coll.find(
                    {"catalog_id": r["catalog_id"], "status": "available"},
                    {"_id": 0, "id": 1, "code": 1},
                ).limit(r["quantity"])
                candidates = await candidate_cursor.to_list(r["quantity"])
                if len(candidates) < r["quantity"]:
                    raise HTTPException(status_code=422, detail={"error": "stock_race", "catalog_id": r["catalog_id"]})
                ids = [c["id"] for c in candidates]
                res = await stock_coll.update_many(
                    {"id": {"$in": ids}, "status": "available"},
                    {"$set": {"status": "reserved", "tenant_id": tenant_id, "sold_at": _now()}},
                )
                if res.modified_count < r["quantity"]:
                    raise HTTPException(status_code=422, detail={"error": "stock_race", "catalog_id": r["catalog_id"]})
                reservations.append((stock_coll, ids, candidates, r))
        except HTTPException:
            # Roll back any prior reservations
            for stock_coll, ids, _, _ in reservations:
                await stock_coll.update_many({"id": {"$in": ids}}, {"$set": {"status": "available", "tenant_id": None, "sold_at": None}})
            raise

        # --- Wallet transfer (tenant -> platform) ---
        order_id = str(uuid.uuid4())
        await main_db.wallets.update_one({"entity_id": tenant_id}, {"$inc": {"balance": -total}})
        await _ensure_wallet(PLATFORM_WALLET_ID)
        await main_db.wallets.update_one({"entity_id": PLATFORM_WALLET_ID}, {"$inc": {"balance": total}})
        await main_db.wallet_transfers.insert_one({
            "id": str(uuid.uuid4()),
            "from_entity_id": tenant_id,
            "from_entity_type": "tenant",
            "to_entity_id": PLATFORM_WALLET_ID,
            "to_entity_type": "platform",
            "amount": total,
            "fee": 0,
            "currency": "DZD",
            "reference_type": "supplier_order",
            "reference_id": order_id,
            "description": f"شراء أكواد من المنصة - طلب {order_id[:8]}",
            "created_at": _now(),
        })

        # --- Move codes to tenant_db & mark sold ---
        tenant_db = get_tenant_db(tenant_id)
        order_items_doc = []
        for stock_coll, ids, candidates, r in reservations:
            # Mark as sold in central stock
            await stock_coll.update_many({"id": {"$in": ids}}, {"$set": {"status": "sold"}})
            # Insert into tenant's own stock (re-using existing collections)
            if r["type"] == "idoom":
                tenant_docs = [
                    {
                        "id": str(uuid.uuid4()),
                        "code": c["code"],
                        "denomination": r["denomination"],
                        "status": "available",
                        "source": "platform",
                        "platform_order_id": order_id,
                        "created_at": _now(),
                    } for c in candidates
                ]
                if tenant_docs:
                    await tenant_db.idoom_codes.insert_many(tenant_docs)
            else:  # card
                tenant_docs = [
                    {
                        "id": str(uuid.uuid4()),
                        "code": c["code"],
                        "operator": r["operator"],
                        "denomination": r["denomination"],
                        "status": "available",
                        "source": "platform",
                        "platform_order_id": order_id,
                        "created_at": _now(),
                    } for c in candidates
                ]
                if tenant_docs:
                    await tenant_db.platform_cards.insert_many(tenant_docs)
            order_items_doc.append({
                "type": r["type"],
                "catalog_id": r["catalog_id"],
                "operator": r["operator"],
                "denomination": r["denomination"],
                "quantity": r["quantity"],
                "unit_price": r["unit_price"],
                "subtotal": r["subtotal"],
                "code_ids": ids,
            })

        order_doc = {
            "id": order_id,
            "tenant_id": tenant_id,
            "items": order_items_doc,
            "total": total,
            "status": "completed",
            "created_at": _now(),
            "completed_at": _now(),
        }
        await main_db.supplier_orders.insert_one(order_doc)

        # Notify tenant
        await _create_notification(
            tenant_id,
            "اكتمل طلبك من المنصة",
            f"تم شحن {sum(it['quantity'] for it in order_items_doc)} كود مقابل {total} دج",
            f"/services/operations",
        )

        order_doc.pop("_id", None)
        return order_doc

    return router
