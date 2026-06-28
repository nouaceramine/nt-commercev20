"""Platform Financial Routes — money management for the platform-as-supplier.

Covers everything that lives outside the tenant world:
  • External suppliers (people the platform buys recharge-card/SIM stock from)
  • Purchases from those suppliers (COST side of the platform's P&L)
  • Payments made to those suppliers (reduces our `balance_due`)
  • Financial summary aggregator (revenue from supplier_orders − cost from
    supplier_purchases − wallet balance + top customers & suppliers).

All collections live in `main_db` (cross-tenant). Sale data already lives in
`supplier_orders` and isn't duplicated here.

Endpoints (all super-admin gated):
  GET    /admin/supplier/external-suppliers
  POST   /admin/supplier/external-suppliers
  PUT    /admin/supplier/external-suppliers/{sid}
  DELETE /admin/supplier/external-suppliers/{sid}

  GET    /admin/supplier/purchases?from=&to=&supplier_id=
  POST   /admin/supplier/purchases
  DELETE /admin/supplier/purchases/{pid}

  POST   /admin/supplier/external-suppliers/{sid}/payments
  GET    /admin/supplier/external-suppliers/{sid}/payments

  GET    /admin/supplier/financial/summary?days=30
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Literal
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from config.database import main_db
from routes.saas.helpers import get_super_admin
from services.wallet_service import PLATFORM_WALLET_ID


# ── Models ────────────────────────────────────────────────────────────────
class ExternalSupplierIn(BaseModel):
    name: str
    phone: str = ""
    contact_person: str = ""
    notes: str = ""
    is_active: bool = True


class PurchaseItem(BaseModel):
    """Line in a purchase from an external supplier.

    catalog_id is optional — when set, the UI can later upload codes/ICCIDs
    against this purchase and they'll auto-feed the correct stock collection.

    type → which platform stock collection this item belongs to:
      card    → platform_card_stock     (recharge voucher codes)
      sim     → platform_sim_stock      (ICCID numbers)
      idoom   → platform_idoom_stock    (Idoom internet codes)
      iptv    → no stock (license tracked manually)
      other   → no stock (generic expense)
    """
    type: Literal["card", "idoom", "sim", "iptv", "other"]
    catalog_id: Optional[str] = None
    label: str = ""              # human label, e.g. "Mobilis 1000"
    quantity: int = Field(ge=1, le=100000)
    unit_cost: float = Field(ge=0)


class PurchaseIn(BaseModel):
    supplier_id: str
    items: List[PurchaseItem]
    paid_amount: float = 0
    notes: str = ""
    purchase_date: Optional[str] = None     # ISO date — defaults to today


class PaymentIn(BaseModel):
    amount: float = Field(gt=0)
    method: str = "cash"                    # cash | transfer | other
    notes: str = ""
    payment_date: Optional[str] = None      # ISO


# ── Helpers ───────────────────────────────────────────────────────────────
def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _recompute_supplier_balance(supplier_id: str) -> float:
    """Re-aggregate balance_due from purchases - payments. Returns new balance."""
    purchases_total = 0.0
    async for p in main_db.supplier_purchases.find({"supplier_id": supplier_id}, {"_id": 0, "total_cost": 1}):
        purchases_total += float(p.get("total_cost") or 0)
    payments_total = 0.0
    async for pmt in main_db.supplier_payments.find({"supplier_id": supplier_id}, {"_id": 0, "amount": 1}):
        payments_total += float(pmt.get("amount") or 0)
    balance_due = round(purchases_total - payments_total, 2)
    await main_db.external_suppliers.update_one(
        {"id": supplier_id},
        {"$set": {"balance_due": balance_due, "updated_at": _now()}},
    )
    return balance_due


# ── Router factory ────────────────────────────────────────────────────────
def build_financial_router() -> APIRouter:
    router = APIRouter(tags=["platform-finance"])

    # ── External Suppliers CRUD ──────────────────────────────────────────
    @router.get("/admin/supplier/external-suppliers")
    async def list_suppliers(admin: dict = Depends(get_super_admin)):
        items = await main_db.external_suppliers.find({}, {"_id": 0}).sort("name", 1).to_list(500)
        return items

    @router.post("/admin/supplier/external-suppliers")
    async def add_supplier(payload: ExternalSupplierIn, admin: dict = Depends(get_super_admin)):
        doc = payload.model_dump()
        doc["id"] = str(uuid.uuid4())
        doc["balance_due"] = 0.0
        doc["created_at"] = _now()
        doc["created_by"] = admin.get("id")
        await main_db.external_suppliers.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.put("/admin/supplier/external-suppliers/{sid}")
    async def update_supplier(sid: str, payload: ExternalSupplierIn, admin: dict = Depends(get_super_admin)):
        res = await main_db.external_suppliers.update_one(
            {"id": sid},
            {"$set": {**payload.model_dump(), "updated_at": _now()}},
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="المورد غير موجود")
        return {"ok": True}

    @router.delete("/admin/supplier/external-suppliers/{sid}")
    async def delete_supplier(sid: str, admin: dict = Depends(get_super_admin)):
        # Refuse if there are any purchases — preserves audit trail
        existing = await main_db.supplier_purchases.count_documents({"supplier_id": sid})
        if existing > 0:
            raise HTTPException(
                status_code=400,
                detail=f"لا يمكن حذف المورد لأنه مرتبط بـ {existing} عملية شراء. عطِّله بدلاً من حذفه.",
            )
        await main_db.external_suppliers.delete_one({"id": sid})
        return {"ok": True}

    # ── Purchases ────────────────────────────────────────────────────────
    @router.get("/admin/supplier/purchases")
    async def list_purchases(
        admin: dict = Depends(get_super_admin),
        supplier_id: Optional[str] = None,
        from_date: Optional[str] = Query(None, alias="from"),
        to_date: Optional[str] = Query(None, alias="to"),
        limit: int = 100,
    ):
        q: dict = {}
        if supplier_id:
            q["supplier_id"] = supplier_id
        if from_date or to_date:
            q["purchase_date"] = {}
            if from_date:
                q["purchase_date"]["$gte"] = from_date
            if to_date:
                q["purchase_date"]["$lte"] = to_date
        items = await main_db.supplier_purchases.find(q, {"_id": 0}).sort("purchase_date", -1).to_list(limit)
        return items

    @router.post("/admin/supplier/purchases")
    async def add_purchase(payload: PurchaseIn, admin: dict = Depends(get_super_admin)):
        supplier = await main_db.external_suppliers.find_one({"id": payload.supplier_id})
        if not supplier:
            raise HTTPException(status_code=404, detail="المورد غير موجود")

        # Compute totals
        clean_items = []
        total_cost = 0.0
        for it in payload.items:
            subtotal = round(it.quantity * it.unit_cost, 2)
            total_cost += subtotal
            clean_items.append({
                **it.model_dump(),
                "subtotal": subtotal,
            })

        paid = max(0.0, float(payload.paid_amount or 0))
        balance_due_for_this = round(total_cost - paid, 2)

        doc = {
            "id": str(uuid.uuid4()),
            "supplier_id": payload.supplier_id,
            "supplier_name": supplier.get("name", ""),
            "items": clean_items,
            "total_cost": round(total_cost, 2),
            "paid_amount": paid,
            "balance_due": balance_due_for_this,
            "notes": payload.notes,
            "purchase_date": payload.purchase_date or _now()[:10],
            "created_at": _now(),
            "created_by": admin.get("id"),
        }
        await main_db.supplier_purchases.insert_one(doc)

        # ── EDA: emit purchase.created (dual-write — non-blocking) ──────
        try:
            from services.event_bus import event_bus
            await event_bus.publish(
                "purchase.created",
                {
                    "purchase_id": doc["id"],
                    "supplier_id": doc["supplier_id"],
                    "supplier_name": doc["supplier_name"],
                    "total_cost": doc["total_cost"],
                    "items": doc["items"],
                },
                tenant_id="platform",
                source="platform_finance_routes",
            )
        except Exception:
            pass

        # If paid > 0, record an implicit payment row too — keeps audit clean
        if paid > 0:
            await main_db.supplier_payments.insert_one({
                "id": str(uuid.uuid4()),
                "supplier_id": payload.supplier_id,
                "amount": paid,
                "method": "cash",
                "notes": f"دفعة فورية من عملية شراء {doc['id']}",
                "payment_date": doc["purchase_date"],
                "created_at": _now(),
                "created_by": admin.get("id"),
                "linked_purchase_id": doc["id"],
            })

        await _recompute_supplier_balance(payload.supplier_id)
        doc.pop("_id", None)
        return doc

    @router.delete("/admin/supplier/purchases/{pid}")
    async def delete_purchase(pid: str, admin: dict = Depends(get_super_admin)):
        existing = await main_db.supplier_purchases.find_one({"id": pid}, {"_id": 0, "supplier_id": 1})
        if not existing:
            raise HTTPException(status_code=404, detail="عملية الشراء غير موجودة")
        await main_db.supplier_purchases.delete_one({"id": pid})
        # Cascade — drop any implicit payment row tied to this purchase
        await main_db.supplier_payments.delete_many({"linked_purchase_id": pid})
        await _recompute_supplier_balance(existing["supplier_id"])
        # ── EDA: emit purchase.deleted (compensation) ──────────────────
        try:
            from services.event_bus import event_bus
            await event_bus.publish(
                "purchase.deleted",
                {"purchase_id": pid, "supplier_id": existing["supplier_id"]},
                tenant_id="platform",
                source="platform_finance_routes",
            )
        except Exception:
            pass
        return {"ok": True}

    # ── Payments ─────────────────────────────────────────────────────────
    @router.get("/admin/supplier/external-suppliers/{sid}/payments")
    async def list_payments(sid: str, admin: dict = Depends(get_super_admin)):
        items = await main_db.supplier_payments.find({"supplier_id": sid}, {"_id": 0}).sort("payment_date", -1).to_list(500)
        return items

    @router.post("/admin/supplier/external-suppliers/{sid}/payments")
    async def add_payment(sid: str, payload: PaymentIn, admin: dict = Depends(get_super_admin)):
        if not await main_db.external_suppliers.find_one({"id": sid}, {"_id": 0, "id": 1}):
            raise HTTPException(status_code=404, detail="المورد غير موجود")
        doc = {
            "id": str(uuid.uuid4()),
            "supplier_id": sid,
            "amount": float(payload.amount),
            "method": payload.method,
            "notes": payload.notes,
            "payment_date": payload.payment_date or _now()[:10],
            "created_at": _now(),
            "created_by": admin.get("id"),
        }
        await main_db.supplier_payments.insert_one(doc)
        new_balance = await _recompute_supplier_balance(sid)
        doc.pop("_id", None)
        doc["new_balance_due"] = new_balance
        return doc

    # ── Financial summary (the KPI dashboard) ─────────────────────────────
    @router.get("/admin/supplier/financial/summary")
    async def financial_summary(
        admin: dict = Depends(get_super_admin),
        days: int = Query(30, ge=1, le=365),
    ):
        """Aggregates revenue / cost / profit / wallet / top tenants & suppliers."""
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        cutoff_date = cutoff[:10]

        # Revenue — from supplier_orders.total (completed orders only)
        revenue_pipeline = [
            {"$match": {"status": "completed", "created_at": {"$gte": cutoff}}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
        ]
        rev_doc = await main_db.supplier_orders.aggregate(revenue_pipeline).to_list(1)
        total_revenue = float(rev_doc[0]["total"]) if rev_doc else 0.0
        revenue_orders = int(rev_doc[0]["count"]) if rev_doc else 0

        # Cost — from supplier_purchases.total_cost
        cost_pipeline = [
            {"$match": {"purchase_date": {"$gte": cutoff_date}}},
            {"$group": {"_id": None, "total": {"$sum": "$total_cost"}, "count": {"$sum": 1}}},
        ]
        cost_doc = await main_db.supplier_purchases.aggregate(cost_pipeline).to_list(1)
        total_cost = float(cost_doc[0]["total"]) if cost_doc else 0.0
        purchase_count = int(cost_doc[0]["count"]) if cost_doc else 0

        gross_profit = round(total_revenue - total_cost, 2)
        margin_pct = round((gross_profit / total_revenue * 100), 1) if total_revenue > 0 else 0.0

        # Wallet balance (current snapshot, not range-filtered)
        wallet = await main_db.wallets.find_one(
            {"entity_id": PLATFORM_WALLET_ID}, {"_id": 0, "balance": 1, "currency": 1},
        ) or {}
        wallet_balance = float(wallet.get("balance") or 0)

        # Total balance_due to all external suppliers (platform AP)
        ap_pipeline = [
            {"$match": {"balance_due": {"$gt": 0}}},
            {"$group": {"_id": None, "total": {"$sum": "$balance_due"}, "count": {"$sum": 1}}},
        ]
        ap_doc = await main_db.external_suppliers.aggregate(ap_pipeline).to_list(1)
        total_accounts_payable = float(ap_doc[0]["total"]) if ap_doc else 0.0
        suppliers_with_debt = int(ap_doc[0]["count"]) if ap_doc else 0

        # Top 5 tenants by revenue in range
        top_tenants_pipeline = [
            {"$match": {"status": "completed", "created_at": {"$gte": cutoff}}},
            {"$group": {"_id": "$tenant_id", "revenue": {"$sum": "$total"}, "orders": {"$sum": 1}}},
            {"$sort": {"revenue": -1}},
            {"$limit": 5},
        ]
        top_tenants_raw = await main_db.supplier_orders.aggregate(top_tenants_pipeline).to_list(5)
        tenant_ids = [t["_id"] for t in top_tenants_raw if t["_id"]]
        tenants_meta = {}
        if tenant_ids:
            async for t in main_db.saas_tenants.find(
                {"id": {"$in": tenant_ids}},
                {"_id": 0, "id": 1, "name": 1, "company_name": 1, "email": 1},
            ):
                tenants_meta[t["id"]] = t
        top_tenants = [
            {
                "tenant_id":   t["_id"],
                "tenant_name": (tenants_meta.get(t["_id"]) or {}).get("name") or (tenants_meta.get(t["_id"]) or {}).get("company_name") or (t["_id"] or "—")[:8],
                "revenue":     round(t["revenue"], 2),
                "orders":      t["orders"],
            }
            for t in top_tenants_raw
        ]

        # Top 5 suppliers by cost in range
        top_suppliers_pipeline = [
            {"$match": {"purchase_date": {"$gte": cutoff_date}}},
            {"$group": {"_id": "$supplier_id", "cost": {"$sum": "$total_cost"}, "purchases": {"$sum": 1}, "name": {"$first": "$supplier_name"}}},
            {"$sort": {"cost": -1}},
            {"$limit": 5},
        ]
        top_suppliers_raw = await main_db.supplier_purchases.aggregate(top_suppliers_pipeline).to_list(5)
        top_suppliers = [
            {
                "supplier_id":   s["_id"],
                "supplier_name": s.get("name") or (s["_id"] or "—")[:8],
                "cost":          round(s["cost"], 2),
                "purchases":     s["purchases"],
            }
            for s in top_suppliers_raw
        ]

        return {
            "range_days": days,
            "kpis": {
                "total_revenue":          round(total_revenue, 2),
                "revenue_orders":         revenue_orders,
                "total_cost":             round(total_cost, 2),
                "purchase_count":         purchase_count,
                "gross_profit":           gross_profit,
                "margin_pct":             margin_pct,
                "wallet_balance":         wallet_balance,
                "wallet_currency":        wallet.get("currency", "DZD"),
                "total_accounts_payable": round(total_accounts_payable, 2),
                "suppliers_with_debt":    suppliers_with_debt,
            },
            "top_tenants":   top_tenants,
            "top_suppliers": top_suppliers,
            "daily_trend":   await _build_daily_trend(cutoff, cutoff_date),
        }

    # ── Product-level profitability ──────────────────────────────────────
    @router.get("/admin/supplier/financial/product-profitability")
    async def product_profitability(
        admin: dict = Depends(get_super_admin),
        catalog_id: str = Query(..., min_length=1),
        stock_type: str = Query(..., pattern="^(card|sim|idoom)$"),
    ):
        """Per-product P&L: total qty sold, gross revenue, total cost, gross
        profit, margin %, best customer (tenant) — all derived from the
        per-code stock rows + supplier_orders + supplier_purchases data.

        UX: super-admin picks a catalog item from a dropdown and sees how
        profitable that SKU actually is, with a recommendation if margin is low.
        """
        catalog_coll = {"card": "platform_card_catalog", "sim": "platform_sim_catalog", "idoom": "platform_idoom_catalog"}[stock_type]
        stock_coll_name = {"card": "platform_card_stock", "sim": "platform_sim_stock", "idoom": "platform_idoom_stock"}[stock_type]
        catalog = await getattr(main_db, catalog_coll).find_one({"id": catalog_id}, {"_id": 0})
        if not catalog:
            raise HTTPException(status_code=404, detail="فئة الكاتالوج غير موجودة")

        # All stock rows for this catalog item
        total_stock = await getattr(main_db, stock_coll_name).count_documents({"catalog_id": catalog_id})
        available = await getattr(main_db, stock_coll_name).count_documents({"catalog_id": catalog_id, "status": "available"})
        sold = await getattr(main_db, stock_coll_name).count_documents({"catalog_id": catalog_id, "status": "sold"})
        sold_stock_ids = [d["id"] async for d in getattr(main_db, stock_coll_name).find({"catalog_id": catalog_id, "status": "sold"}, {"_id": 0, "id": 1})]

        # Revenue — sum of unit_price for matching order lines
        revenue = 0.0
        tenant_breakdown: dict = {}
        if sold_stock_ids:
            async for order in main_db.supplier_orders.find(
                {"items.code_ids": {"$in": sold_stock_ids}},
                {"_id": 0, "tenant_id": 1, "items": 1},
            ):
                tid = order.get("tenant_id")
                for it in (order.get("items") or []):
                    matches = [cid for cid in (it.get("code_ids") or []) if cid in sold_stock_ids]
                    if matches and it.get("unit_price") is not None:
                        line_rev = float(it["unit_price"]) * len(matches)
                        revenue += line_rev
                        if tid:
                            tenant_breakdown[tid] = tenant_breakdown.get(tid, {"qty": 0, "revenue": 0.0})
                            tenant_breakdown[tid]["qty"] += len(matches)
                            tenant_breakdown[tid]["revenue"] += line_rev

        # Cost — pulled from any purchase line that targets this catalog item.
        # Uses the weighted average cost across all purchases (closest to FIFO without per-code tracking)
        cost_pipeline = [
            {"$unwind": "$items"},
            {"$match": {"items.catalog_id": catalog_id, "items.type": stock_type}},
            {"$group": {
                "_id": None,
                "total_qty": {"$sum": "$items.quantity"},
                "total_cost": {"$sum": {"$multiply": ["$items.quantity", "$items.unit_cost"]}},
            }},
        ]
        cost_doc = await main_db.supplier_purchases.aggregate(cost_pipeline).to_list(1)
        avg_unit_cost = (cost_doc[0]["total_cost"] / cost_doc[0]["total_qty"]) if cost_doc and cost_doc[0]["total_qty"] > 0 else 0.0
        cost_of_sold = round(avg_unit_cost * sold, 2)
        gross_profit = round(revenue - cost_of_sold, 2)
        margin_pct = round((gross_profit / revenue * 100), 1) if revenue > 0 else 0.0

        # Best customer
        best_tenant = None
        if tenant_breakdown:
            best_tid = max(tenant_breakdown, key=lambda k: tenant_breakdown[k]["revenue"])
            t = await main_db.saas_tenants.find_one({"id": best_tid}, {"_id": 0, "name": 1, "company_name": 1}) or {}
            best_tenant = {
                "tenant_id":   best_tid,
                "tenant_name": t.get("name") or t.get("company_name") or best_tid[:8],
                "qty_bought":  tenant_breakdown[best_tid]["qty"],
                "revenue":     round(tenant_breakdown[best_tid]["revenue"], 2),
            }

        # Lightweight recommendation engine
        no_cost_data = (cost_doc is None or not cost_doc or cost_doc[0].get("total_qty", 0) == 0)
        recommendation = None
        if no_cost_data and revenue > 0:
            recommendation = "📝 لا توجد بيانات تكلفة مُسجَّلة لهذا المنتج. سجِّل عملية شراء من مورد خارجي ليعرض النظام الربح الحقيقي بدلاً من 100%."
        elif revenue > 0:
            if margin_pct < 10:
                recommendation = "📉 الهامش منخفض جداً — فكِّر برفع سعر البيع أو التفاوض على سعر شراء أقل."
            elif margin_pct < 20:
                recommendation = "💡 الهامش متوسط — رفع السعر بنسبة 5-10% قد يكون آمناً."
            elif margin_pct > 40:
                recommendation = "🏆 هامش ممتاز — ركِّز جهد المبيعات على هذا المنتج!"
        elif total_stock > 0 and sold == 0:
            recommendation = "📦 لديك مخزون من هذا المنتج لكن لم يُبَع شيء بعد — قد يكون التسعير عالياً أو المنتج غير مطلوب."

        return {
            "catalog_id":   catalog_id,
            "stock_type":   stock_type,
            "catalog":      catalog,
            "inventory":    {"total": total_stock, "available": available, "sold": sold},
            "revenue":      round(revenue, 2),
            "avg_unit_cost": round(avg_unit_cost, 2),
            "cost_of_sold": cost_of_sold,
            "gross_profit": gross_profit,
            "margin_pct":   margin_pct,
            "has_cost_data": not no_cost_data,
            "best_tenant":  best_tenant,
            "recommendation": recommendation,
        }

    # ── Catalog reference (for the Purchase-form item dropdown) ──────────
    @router.get("/admin/supplier/catalog-reference")
    async def catalog_reference(admin: dict = Depends(get_super_admin)):
        """Return all 4 platform catalogs in one call — used to populate the
        item-picker dropdown in the Purchase-form dialog (cards / sims / idoom /
        iptv). Each entry has {id, label, type}."""
        cards = await main_db.platform_card_catalog.find({"is_active": True}, {"_id": 0, "id": 1, "operator": 1, "denomination": 1}).to_list(500)
        sims = await main_db.platform_sim_catalog.find({"is_active": True}, {"_id": 0, "id": 1, "operator": 1, "tier": 1, "name_ar": 1}).to_list(500)
        idoom = await main_db.platform_idoom_catalog.find({"is_active": True}, {"_id": 0, "id": 1, "denomination": 1}).to_list(500)
        iptv_pkgs = await main_db.platform_catalog.find(
            {"category": "iptv", "active": {"$ne": False}}, {"_id": 0, "id": 1, "name": 1},
        ).to_list(500)
        tier_label = {"retail": "تجزئة", "wholesale": "جملة"}
        return {
            "card":  [{"id": c["id"], "label": f"{c['operator']} {c['denomination']} دج", "type": "card"}  for c in cards],
            "sim":   [{"id": s["id"], "label": s.get("name_ar") or f"{s.get('operator', '?')} {tier_label.get(s.get('tier','retail'), '?')}", "type": "sim"} for s in sims],
            "idoom": [{"id": i["id"], "label": f"Idoom {i['denomination']} دج", "type": "idoom"} for i in idoom],
            "iptv":  [{"id": p["id"], "label": p.get("name", "—"), "type": "iptv"} for p in iptv_pkgs],
        }

    # ── Code Trace — full lifecycle of a stock code/ICCID ────────────────
    @router.get("/admin/supplier/trace")
    async def trace_code(code: str = Query(..., min_length=2), admin: dict = Depends(get_super_admin)):
        """Find a code across all stock collections (card / sim / idoom) and return
        its complete lifecycle: origin (purchase + external supplier + cost),
        current status, and — if sold — which tenant bought it and when.

        Used by the Trace UI sub-tab to answer: 'where did this code come from
        and where did it go?'
        """
        cleaned = (code or "").strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="أدخل كود")

        # Probe all 3 stock collections
        stock = None
        stock_type = None
        for type_key, coll_name in (("card", "platform_card_stock"), ("sim", "platform_sim_stock"), ("idoom", "platform_idoom_stock")):
            doc = await getattr(main_db, coll_name).find_one({"code": cleaned}, {"_id": 0})
            if doc:
                stock = doc
                stock_type = type_key
                break

        if not stock:
            return {"found": False, "code": cleaned}

        # Look up catalog metadata
        catalog_coll_name = {"card": "platform_card_catalog", "sim": "platform_sim_catalog", "idoom": "platform_idoom_catalog"}[stock_type]
        catalog = await getattr(main_db, catalog_coll_name).find_one(
            {"id": stock.get("catalog_id")},
            {"_id": 0},
        ) or {}

        # Origin: tracked via source_purchase_id (set by upload-codes endpoint)
        origin = None
        purchase_id = stock.get("source_purchase_id")
        if purchase_id:
            purchase = await main_db.supplier_purchases.find_one({"id": purchase_id}, {"_id": 0})
            if purchase:
                supplier = await main_db.external_suppliers.find_one({"id": purchase.get("supplier_id")}, {"_id": 0}) or {}
                # Find the specific line whose catalog_id matches the stock's
                matched_item = next(
                    (it for it in (purchase.get("items") or []) if it.get("catalog_id") == stock.get("catalog_id") and it.get("type") == stock_type),
                    None,
                )
                origin = {
                    "purchase_id":   purchase["id"],
                    "purchase_date": purchase.get("purchase_date"),
                    "supplier_id":   purchase.get("supplier_id"),
                    "supplier_name": purchase.get("supplier_name"),
                    "supplier_phone": supplier.get("phone", ""),
                    "unit_cost":     matched_item.get("unit_cost") if matched_item else None,
                    "purchase_label": matched_item.get("label") if matched_item else None,
                }

        # Sale: if status=='sold' or tenant_id is set, look up the supplier_order line
        sale = None
        if stock.get("status") == "sold" or stock.get("tenant_id"):
            # supplier_orders.items[].code_ids includes the stock.id
            order = await main_db.supplier_orders.find_one(
                {"items.code_ids": stock["id"]},
                {"_id": 0, "id": 1, "tenant_id": 1, "created_at": 1, "items": 1, "total": 1, "status": 1},
            )
            tenant_name = "—"
            sold_unit_price = None
            if order:
                tenant = await main_db.saas_tenants.find_one({"id": order.get("tenant_id")}, {"_id": 0, "name": 1, "company_name": 1}) or {}
                tenant_name = tenant.get("name") or tenant.get("company_name") or order.get("tenant_id", "")[:8]
                # Find which order item this code belonged to to extract price
                for it in (order.get("items") or []):
                    if stock["id"] in (it.get("code_ids") or []):
                        sold_unit_price = it.get("unit_price")
                        break
            sale = {
                "order_id":   (order or {}).get("id"),
                "tenant_id":  stock.get("tenant_id") or (order or {}).get("tenant_id"),
                "tenant_name": tenant_name,
                "sold_at":    stock.get("sold_at") or (order or {}).get("created_at"),
                "sold_unit_price": sold_unit_price,
                "order_status": (order or {}).get("status"),
            }

        # Compute simple profit (sold_price - unit_cost) if both known
        profit = None
        if sale and sale.get("sold_unit_price") is not None and origin and origin.get("unit_cost") is not None:
            profit = round(float(sale["sold_unit_price"]) - float(origin["unit_cost"]), 2)

        return {
            "found":         True,
            "code":          cleaned,
            "stock_type":    stock_type,
            "stock_id":      stock["id"],
            "status":        stock.get("status"),
            "created_at":    stock.get("created_at"),
            "catalog":       {
                "id":           catalog.get("id"),
                "operator":     catalog.get("operator"),
                "tier":         catalog.get("tier"),
                "name_ar":      catalog.get("name_ar"),
                "denomination": catalog.get("denomination"),
                "default_price": catalog.get("default_price"),
            },
            "origin":        origin,
            "sale":          sale,
            "unit_profit":   profit,
        }

    # ── Upload codes against a specific purchase (later ICCIDs) ─────────
    @router.post("/admin/supplier/purchases/{pid}/upload-codes")
    async def upload_purchase_codes(
        pid: str,
        item_index: int,
        codes_text: str,
        admin: dict = Depends(get_super_admin),
    ):
        """Bulk-add codes/ICCIDs for ONE item of a previously recorded purchase.

        `item_index` = index of the item in the purchase.items array (0-based).
        Routes the upload to the correct stock collection based on item.type.
        Skips duplicates. Returns {inserted, skipped, total_so_far}.
        """
        purchase = await main_db.supplier_purchases.find_one({"id": pid})
        if not purchase:
            raise HTTPException(status_code=404, detail="عملية الشراء غير موجودة")
        items = purchase.get("items") or []
        if item_index < 0 or item_index >= len(items):
            raise HTTPException(status_code=400, detail="رقم البند غير صحيح")

        it = items[item_index]
        item_type = it.get("type")
        catalog_id = it.get("catalog_id")
        if item_type not in ("card", "sim", "idoom"):
            raise HTTPException(status_code=400, detail="هذا النوع لا يدعم رفع الأكواد (iptv/other)")
        if not catalog_id:
            raise HTTPException(status_code=400, detail="هذا البند غير مرتبط بفئة كاتالوج. لا يمكن رفع الأكواد بدون اختيار الفئة.")

        stock_coll_name = {"card": "platform_card_stock", "sim": "platform_sim_stock", "idoom": "platform_idoom_stock"}[item_type]
        stock_coll = getattr(main_db, stock_coll_name)

        codes = [c.strip() for c in codes_text.splitlines() if c.strip() and not c.strip().startswith("#")]
        if not codes:
            return {"inserted": 0, "skipped": 0, "total_so_far": 0}

        existing = set()
        async for d in stock_coll.find({"code": {"$in": codes}}, {"_id": 0, "code": 1}):
            existing.add(d["code"])
        new_docs = [
            {
                "id": str(uuid.uuid4()),
                "catalog_id": catalog_id,
                "code": c,
                "status": "available",
                "tenant_id": None,
                "sold_at": None,
                "created_at": _now(),
                "source_purchase_id": pid,
            }
            for c in codes if c not in existing
        ]
        if new_docs:
            await stock_coll.insert_many(new_docs)

        # Track per-item progress on the purchase doc for the UI
        total_uploaded_so_far = await stock_coll.count_documents({"source_purchase_id": pid, "catalog_id": catalog_id})
        await main_db.supplier_purchases.update_one(
            {"id": pid},
            {"$set": {f"items.{item_index}.codes_uploaded": total_uploaded_so_far}},
        )

        # ── EDA: emit purchase.codes_uploaded (dual-write) ───────────────
        try:
            from services.event_bus import event_bus
            if len(new_docs) > 0:
                await event_bus.publish(
                    "purchase.codes_uploaded",
                    {
                        "purchase_id": pid,
                        "item_index": item_index,
                        "count": len(new_docs),
                        "stock_type": item_type,
                    },
                    tenant_id="platform",
                    source="platform_finance_routes",
                )
        except Exception:
            pass

        return {
            "inserted": len(new_docs),
            "skipped":  len(codes) - len(new_docs),
            "total_so_far": total_uploaded_so_far,
            "expected": int(it.get("quantity") or 0),
        }

    return router


async def _build_daily_trend(cutoff_iso: str, cutoff_date: str) -> list:
    """Per-day {date, revenue, cost, profit} buckets for the dashboard chart.

    Aggregates `supplier_orders.total` (revenue side) and
    `supplier_purchases.total_cost` (cost side) by ISO day. Profit per day
    is derived client-side from both numbers.
    """
    # Revenue per day
    rev_by_day: dict = {}
    async for row in main_db.supplier_orders.aggregate([
        {"$match": {"status": "completed", "created_at": {"$gte": cutoff_iso}}},
        {"$group": {"_id": {"$substr": ["$created_at", 0, 10]}, "revenue": {"$sum": "$total"}}},
    ]):
        rev_by_day[row["_id"]] = round(float(row["revenue"]), 2)

    # Cost per day
    cost_by_day: dict = {}
    async for row in main_db.supplier_purchases.aggregate([
        {"$match": {"purchase_date": {"$gte": cutoff_date}}},
        {"$group": {"_id": {"$substr": ["$purchase_date", 0, 10]}, "cost": {"$sum": "$total_cost"}}},
    ]):
        cost_by_day[row["_id"]] = round(float(row["cost"]), 2)

    all_days = sorted(set(rev_by_day) | set(cost_by_day))
    return [
        {
            "date":   d,
            "revenue": rev_by_day.get(d, 0),
            "cost":    cost_by_day.get(d, 0),
            "profit":  round(rev_by_day.get(d, 0) - cost_by_day.get(d, 0), 2),
        }
        for d in all_days
    ]

