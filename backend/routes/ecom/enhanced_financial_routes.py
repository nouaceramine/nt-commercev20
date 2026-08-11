"""
Section 12: Payments & Financial Enhancement
Includes: Payment methods, transactions, refunds, invoicing,
product family capital, profit analytics, profitability tracking.
Factory: create_enhanced_financial_routes(db, get_current_user, require_permission, **kwargs)
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime, timezone, timedelta
import uuid

# ============================================================================
# Pydantic Models
# ============================================================================

class PaymentMethodCreate(BaseModel):
    name: str
    name_ar: Optional[str] = None
    code: str
    type: Literal["cod", "ccp", "bank_transfer", "d17", "barid_mob", "stripe", "custom"]
    config: Dict[str, Any] = {}
    is_active: bool = True
    icon: Optional[str] = None
    description: Optional[str] = None
    fees_percentage: float = 0.0
    fees_fixed: float = 0.0

class PaymentMethodUpdate(BaseModel):
    name: Optional[str] = None
    name_ar: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
    icon: Optional[str] = None
    description: Optional[str] = None
    fees_percentage: Optional[float] = None
    fees_fixed: Optional[float] = None

class TransactionCreate(BaseModel):
    order_id: Optional[str] = None
    customer_id: Optional[str] = None
    payment_method_id: str
    amount: float = Field(gt=0)
    currency: str = "DZD"
    type: Literal["payment", "refund", "payout", "fee", "adjustment", "commission"]
    status: Literal["pending", "completed", "failed", "cancelled"] = "pending"
    reference: Optional[str] = None
    metadata: Dict[str, Any] = {}
    notes: Optional[str] = None

class TransactionUpdate(BaseModel):
    status: Optional[Literal["pending", "completed", "failed", "cancelled"]] = None
    reference: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None

class RefundCreate(BaseModel):
    transaction_id: str
    amount: float = Field(gt=0)
    reason: str
    items: Optional[List[Dict[str, Any]]] = None
    metadata: Dict[str, Any] = {}

class RefundUpdate(BaseModel):
    status: Optional[Literal["pending", "approved", "rejected", "processed"]] = None
    reason: Optional[str] = None
    notes: Optional[str] = None

class InvoiceCreate(BaseModel):
    customer_id: str
    order_ids: List[str] = []
    items: List[Dict[str, Any]] = []
    due_date: Optional[str] = None
    notes: Optional[str] = None
    tax_rate: float = 0.0
    discount_amount: float = 0.0

class InvoiceUpdate(BaseModel):
    status: Optional[Literal["draft", "sent", "paid", "overdue", "cancelled"]] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None
    tax_rate: Optional[float] = None
    discount_amount: Optional[float] = None

class ProductFamilyCapitalCreate(BaseModel):
    family_id: str
    initial_capital: float = Field(ge=0)
    currency: str = "DZD"
    notes: Optional[str] = None

class ProductFamilyCapitalUpdate(BaseModel):
    additional_capital: Optional[float] = None
    notes: Optional[str] = None

class ProfitFilterParams(BaseModel):
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    family_id: Optional[str] = None
    product_id: Optional[str] = None
    warehouse_id: Optional[str] = None

class DateRangeParams(BaseModel):
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    period: Optional[Literal["day", "week", "month", "year"]] = "month"

class CommissionCreate(BaseModel):
    sale_id: str
    agent_id: str
    amount: float = Field(gt=0)
    rate: float = Field(gt=0)
    type: Literal["sale", "referral", "bonus"] = "sale"
    notes: Optional[str] = None

class CommissionUpdate(BaseModel):
    status: Optional[Literal["pending", "approved", "paid", "cancelled"]] = None
    notes: Optional[str] = None

class PayoutCreate(BaseModel):
    agent_id: str
    amount: float = Field(gt=0)
    method: Literal["bank", "ccp", "cash"]
    account_info: Dict[str, Any] = {}
    notes: Optional[str] = None

class PayoutUpdate(BaseModel):
    status: Optional[Literal["pending", "processing", "completed", "failed"]] = None
    notes: Optional[str] = None

class ProfitabilityThresholdUpdate(BaseModel):
    min_profit_margin: Optional[float] = None
    min_roi: Optional[float] = None
    min_turnover_rate: Optional[float] = None
    low_stock_threshold: Optional[int] = None

# ============================================================================
# Helper Functions
# ============================================================================

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _uuid() -> str:
    return str(uuid.uuid4())

async def _get_db(tenant_id: str, db_proxy):
    """Return the request-scoped DB proxy.

    The proxy routes every operation to the correct tenant database via the
    tenant ContextVar set by the auth dependency, so it must be used as-is.
    (Previously this tried to *call* the proxy -> TypeError: not callable,
    breaking every /api/v2/financial/* endpoint with a 500.)"""
    return db_proxy

async def _calculate_product_family_capital(db, family_id: str) -> Dict[str, Any]:
    """Calculate invested capital for a product family."""
    # Get all products in family
    products = await db.products.find({"family_id": family_id}, {"_id": 0}).to_list(None)
    product_ids = [p["id"] for p in products]

    total_capital = 0.0
    product_capitals = []

    for pid in product_ids:
        # Get purchase price from purchases
        purchase_items = await db.purchases.find(
            {"items.product_id": pid},
            {"_id": 0, "items.$": 1}
        ).to_list(None)

        # Get current stock
        stock = await db.inventory.find_one({"product_id": pid}, {"_id": 0})
        current_qty = stock.get("quantity", 0) if stock else 0

        # Calculate avg purchase price
        total_purchased = 0
        total_cost = 0.0
        for purchase in purchase_items:
            for item in purchase.get("items", []):
                if item.get("product_id") == pid:
                    qty = item.get("quantity", 0)
                    price = item.get("purchase_price", item.get("unit_price", 0))
                    total_purchased += qty
                    total_cost += qty * price

        avg_cost = total_cost / total_purchased if total_purchased > 0 else 0
        product_capital = current_qty * avg_cost
        total_capital += product_capital

        product_capitals.append({
            "product_id": pid,
            "product_name": next((p.get("name", "") for p in products if p["id"] == pid), ""),
            "current_stock": current_qty,
            "avg_purchase_price": round(avg_cost, 2),
            "invested_capital": round(product_capital, 2),
        })

    return {
        "family_id": family_id,
        "total_invested_capital": round(total_capital, 2),
        "product_count": len(products),
        "products": product_capitals,
    }

async def _calculate_family_profit(db, family_id: str, date_from: Optional[str] = None, date_to: Optional[str] = None) -> Dict[str, Any]:
    """Calculate profit metrics for a product family."""
    products = await db.products.find({"family_id": family_id}, {"_id": 0}).to_list(None)
    product_ids = [p["id"] for p in products]

    # Build query for sales
    match_query = {"items.product_id": {"$in": product_ids}}
    if date_from or date_to:
        date_filter = {}
        if date_from:
            date_filter["$gte"] = date_from
        if date_to:
            date_filter["$lte"] = date_to
        match_query["created_at"] = date_filter

    sales = await db.sales.find(match_query, {"_id": 0}).to_list(None)

    total_revenue = 0.0
    total_cost = 0.0
    total_quantity_sold = 0
    product_profits = []

    for sale in sales:
        for item in sale.get("items", []):
            if item.get("product_id") in product_ids:
                qty = item.get("quantity", 0)
                sale_price = item.get("unit_price", item.get("price", 0))
                cost_price = item.get("purchase_price", item.get("cost", 0))

                revenue = qty * sale_price
                cost = qty * cost_price
                profit = revenue - cost

                total_revenue += revenue
                total_cost += cost
                total_quantity_sold += qty

                existing = next((pp for pp in product_profits if pp["product_id"] == item["product_id"]), None)
                if existing:
                    existing["revenue"] += revenue
                    existing["cost"] += cost
                    existing["profit"] += profit
                    existing["quantity_sold"] += qty
                else:
                    product = next((p for p in products if p["id"] == item["product_id"]), {})
                    product_profits.append({
                        "product_id": item["product_id"],
                        "product_name": product.get("name", ""),
                        "revenue": revenue,
                        "cost": cost,
                        "profit": profit,
                        "quantity_sold": qty,
                    })

    total_profit = total_revenue - total_cost
    profit_margin = (total_profit / total_revenue * 100) if total_revenue > 0 else 0

    # Sort by profit
    product_profits.sort(key=lambda x: x["profit"], reverse=True)
    for pp in product_profits:
        pp["profit_margin"] = round((pp["profit"] / pp["revenue"] * 100), 2) if pp["revenue"] > 0 else 0
        pp["revenue"] = round(pp["revenue"], 2)
        pp["cost"] = round(pp["cost"], 2)
        pp["profit"] = round(pp["profit"], 2)

    # Determine profitability status
    capital_info = await _calculate_product_family_capital(db, family_id)
    invested_capital = capital_info["total_invested_capital"]
    roi = (total_profit / invested_capital * 100) if invested_capital > 0 else 0

    return {
        "family_id": family_id,
        "family_name": (await db.product_families.find_one({"id": family_id}, {"_id": 0, "name": 1}) or {}).get("name", ""),
        "total_revenue": round(total_revenue, 2),
        "total_cost": round(total_cost, 2),
        "total_profit": round(total_profit, 2),
        "profit_margin_percent": round(profit_margin, 2),
        "total_quantity_sold": total_quantity_sold,
        "invested_capital": invested_capital,
        "roi_percent": round(roi, 2),
        "products": product_profits,
        "profitability_status": "highly_profitable" if profit_margin >= 30 else "profitable" if profit_margin >= 10 else "break_even" if profit_margin >= 0 else "loss",
    }

# ============================================================================
# Factory Function
# ============================================================================

def create_enhanced_financial_routes(db, get_current_user, require_permission, **kwargs):
    router = APIRouter(prefix="/financial", tags=["Financial v2"])

    # ========================================================================
    # GROUP 1: Payment Methods (5 endpoints)
    # ========================================================================

    @router.post("/payment-methods")
    async def create_payment_method(data: PaymentMethodCreate, current_user: dict = Depends(get_current_user)):
        require_permission(current_user, "financial:manage")
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        existing = await tenant_db.payment_methods.find_one({"code": data.code}, {"_id": 0})
        if existing:
            raise HTTPException(status_code=409, detail=f"Payment method with code '{data.code}' already exists")

        method = data.model_dump()
        method["id"] = _uuid()
        method["tenant_id"] = tenant_id
        method["created_at"] = _now()
        method["updated_at"] = _now()
        await tenant_db.payment_methods.insert_one(method)
        return {"status": "success", "data": {k: v for k, v in method.items() if k != "_id"}}

    @router.get("/payment-methods")
    async def list_payment_methods(
        type: Optional[str] = None,
        is_active: Optional[bool] = None,
        current_user: dict = Depends(get_current_user)
    ):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        query = {"tenant_id": tenant_id}
        if type:
            query["type"] = type
        if is_active is not None:
            query["is_active"] = is_active

        methods = await tenant_db.payment_methods.find(query, {"_id": 0}).to_list(None)
        return {"status": "success", "total": len(methods), "data": methods}

    @router.get("/payment-methods/{method_id}")
    async def get_payment_method(method_id: str, current_user: dict = Depends(get_current_user)):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        method = await tenant_db.payment_methods.find_one({"id": method_id, "tenant_id": tenant_id}, {"_id": 0})
        if not method:
            raise HTTPException(status_code=404, detail="Payment method not found")
        return {"status": "success", "data": method}

    @router.put("/payment-methods/{method_id}")
    async def update_payment_method(method_id: str, data: PaymentMethodUpdate, current_user: dict = Depends(get_current_user)):
        require_permission(current_user, "financial:manage")
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        updates["updated_at"] = _now()

        result = await tenant_db.payment_methods.update_one({"id": method_id, "tenant_id": tenant_id}, {"$set": updates})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Payment method not found")
        return {"status": "success", "message": "Payment method updated"}

    @router.delete("/payment-methods/{method_id}")
    async def delete_payment_method(method_id: str, current_user: dict = Depends(get_current_user)):
        require_permission(current_user, "financial:manage")
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        result = await tenant_db.payment_methods.delete_one({"id": method_id, "tenant_id": tenant_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Payment method not found")
        return {"status": "success", "message": "Payment method deleted"}

    # ========================================================================
    # GROUP 2: Transactions (6 endpoints)
    # ========================================================================

    @router.post("/transactions")
    async def create_transaction(data: TransactionCreate, current_user: dict = Depends(get_current_user)):
        require_permission(current_user, "financial:manage")
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        txn = data.model_dump()
        txn["id"] = _uuid()
        txn["tenant_id"] = tenant_id
        txn["created_by"] = current_user.get("id")
        txn["created_at"] = _now()
        txn["updated_at"] = _now()
        await tenant_db.financial_transactions.insert_one(txn)
        return {"status": "success", "data": {k: v for k, v in txn.items() if k != "_id"}}

    @router.get("/transactions")
    async def list_transactions(
        type: Optional[str] = None,
        status: Optional[str] = None,
        payment_method_id: Optional[str] = None,
        customer_id: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        min_amount: Optional[float] = None,
        max_amount: Optional[float] = None,
        skip: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=200),
        current_user: dict = Depends(get_current_user)
    ):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        query = {"tenant_id": tenant_id}
        if type:
            query["type"] = type
        if status:
            query["status"] = status
        if payment_method_id:
            query["payment_method_id"] = payment_method_id
        if customer_id:
            query["customer_id"] = customer_id
        if min_amount is not None or max_amount is not None:
            amount_query = {}
            if min_amount is not None:
                amount_query["$gte"] = min_amount
            if max_amount is not None:
                amount_query["$lte"] = max_amount
            query["amount"] = amount_query
        if date_from or date_to:
            date_query = {}
            if date_from:
                date_query["$gte"] = date_from
            if date_to:
                date_query["$lte"] = date_to
            query["created_at"] = date_query

        total = await tenant_db.financial_transactions.count_documents(query)
        txns = await tenant_db.financial_transactions.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(None)

        # Calculate totals
        pipeline = [
            {"$match": query},
            {"$group": {"_id": None, "total_amount": {"$sum": "$amount"}}}
        ]
        totals_result = await tenant_db.financial_transactions.aggregate(pipeline).to_list(None)
        total_amount = totals_result[0]["total_amount"] if totals_result else 0

        return {"status": "success", "total": total, "total_amount": round(total_amount, 2), "data": txns}

    @router.get("/transactions/{txn_id}")
    async def get_transaction(txn_id: str, current_user: dict = Depends(get_current_user)):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        txn = await tenant_db.financial_transactions.find_one({"id": txn_id, "tenant_id": tenant_id}, {"_id": 0})
        if not txn:
            raise HTTPException(status_code=404, detail="Transaction not found")
        return {"status": "success", "data": txn}

    @router.put("/transactions/{txn_id}")
    async def update_transaction(txn_id: str, data: TransactionUpdate, current_user: dict = Depends(get_current_user)):
        require_permission(current_user, "financial:manage")
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        updates["updated_at"] = _now()

        result = await tenant_db.financial_transactions.update_one({"id": txn_id, "tenant_id": tenant_id}, {"$set": updates})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Transaction not found")
        return {"status": "success", "message": "Transaction updated"}

    @router.get("/transactions/summary/overview")
    async def transactions_summary(current_user: dict = Depends(get_current_user)):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        pipeline = [
            {"$match": {"tenant_id": tenant_id}},
            {"$group": {
                "_id": {"type": "$type", "status": "$status"},
                "count": {"$sum": 1},
                "total": {"$sum": "$amount"}
            }}
        ]
        results = await tenant_db.financial_transactions.aggregate(pipeline).to_list(None)

        summary = {}
        for r in results:
            t = r["_id"]["type"]
            s = r["_id"]["status"]
            if t not in summary:
                summary[t] = {}
            summary[t][s] = {"count": r["count"], "total": round(r["total"], 2)}

        return {"status": "success", "data": summary}

    @router.get("/transactions/report/daily")
    async def daily_transactions_report(
        date: Optional[str] = None,
        current_user: dict = Depends(get_current_user)
    ):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        if not date:
            date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        date_from = f"{date}T00:00:00"
        date_to = f"{date}T23:59:59"

        query = {
            "tenant_id": tenant_id,
            "created_at": {"$gte": date_from, "$lte": date_to}
        }

        pipeline = [
            {"$match": query},
            {"$group": {
                "_id": "$type",
                "count": {"$sum": 1},
                "total": {"$sum": "$amount"}
            }}
        ]
        results = await tenant_db.financial_transactions.aggregate(pipeline).to_list(None)

        report = {r["_id"]: {"count": r["count"], "total": round(r["total"], 2)} for r in results}
        return {"status": "success", "date": date, "data": report}

    # ========================================================================
    # GROUP 3: Refunds (5 endpoints)
    # ========================================================================

    @router.post("/refunds")
    async def create_refund(data: RefundCreate, current_user: dict = Depends(get_current_user)):
        require_permission(current_user, "financial:manage")
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        # Verify transaction exists
        txn = await tenant_db.financial_transactions.find_one({"id": data.transaction_id, "tenant_id": tenant_id}, {"_id": 0})
        if not txn:
            raise HTTPException(status_code=404, detail="Transaction not found")

        if data.amount > txn.get("amount", 0):
            raise HTTPException(status_code=400, detail="Refund amount exceeds transaction amount")

        refund = data.model_dump()
        refund["id"] = _uuid()
        refund["tenant_id"] = tenant_id
        refund["status"] = "pending"
        refund["original_amount"] = txn.get("amount", 0)
        refund["created_by"] = current_user.get("id")
        refund["created_at"] = _now()
        refund["updated_at"] = _now()

        await tenant_db.refunds.insert_one(refund)
        return {"status": "success", "data": {k: v for k, v in refund.items() if k != "_id"}}

    @router.get("/refunds")
    async def list_refunds(
        status: Optional[str] = None,
        transaction_id: Optional[str] = None,
        skip: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=200),
        current_user: dict = Depends(get_current_user)
    ):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        query = {"tenant_id": tenant_id}
        if status:
            query["status"] = status
        if transaction_id:
            query["transaction_id"] = transaction_id

        total = await tenant_db.refunds.count_documents(query)
        refunds = await tenant_db.refunds.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(None)
        return {"status": "success", "total": total, "data": refunds}

    @router.get("/refunds/{refund_id}")
    async def get_refund(refund_id: str, current_user: dict = Depends(get_current_user)):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        refund = await tenant_db.refunds.find_one({"id": refund_id, "tenant_id": tenant_id}, {"_id": 0})
        if not refund:
            raise HTTPException(status_code=404, detail="Refund not found")
        return {"status": "success", "data": refund}

    @router.put("/refunds/{refund_id}")
    async def update_refund(refund_id: str, data: RefundUpdate, current_user: dict = Depends(get_current_user)):
        require_permission(current_user, "financial:manage")
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        updates["updated_at"] = _now()
        if data.status == "processed":
            updates["processed_at"] = _now()
            updates["processed_by"] = current_user.get("id")

        result = await tenant_db.refunds.update_one({"id": refund_id, "tenant_id": tenant_id}, {"$set": updates})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Refund not found")
        return {"status": "success", "message": "Refund updated"}

    @router.get("/refunds/stats/overview")
    async def refunds_stats(current_user: dict = Depends(get_current_user)):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        pipeline = [
            {"$match": {"tenant_id": tenant_id}},
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1},
                "total_amount": {"$sum": "$amount"}
            }}
        ]
        results = await tenant_db.refunds.aggregate(pipeline).to_list(None)
        return {"status": "success", "data": {r["_id"]: {"count": r["count"], "total_amount": round(r["total_amount"], 2)} for r in results}}

    # ========================================================================
    # GROUP 4: Invoicing (5 endpoints)
    # ========================================================================

    @router.post("/invoices")
    async def create_invoice(data: InvoiceCreate, current_user: dict = Depends(get_current_user)):
        require_permission(current_user, "financial:manage")
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        # Generate invoice number
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        counter = await tenant_db.counters.find_one_and_update(
            {"_id": f"inv_{today}"},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=True
        )
        seq = counter.get("seq", 1) if counter else 1
        invoice_number = f"INV-{today}-{seq:04d}"

        # Calculate totals
        subtotal = sum(item.get("quantity", 0) * item.get("unit_price", 0) for item in data.items)
        tax_amount = subtotal * (data.tax_rate / 100)
        total = subtotal + tax_amount - data.discount_amount

        invoice = {
            "id": _uuid(),
            "invoice_number": invoice_number,
            "customer_id": data.customer_id,
            "order_ids": data.order_ids,
            "items": [item.model_dump() if hasattr(item, "model_dump") else item for item in data.items],
            "subtotal": round(subtotal, 2),
            "tax_rate": data.tax_rate,
            "tax_amount": round(tax_amount, 2),
            "discount_amount": data.discount_amount,
            "total": round(total, 2),
            "status": "draft",
            "due_date": data.due_date,
            "notes": data.notes,
            "tenant_id": tenant_id,
            "created_by": current_user.get("id"),
            "created_at": _now(),
            "updated_at": _now(),
        }
        await tenant_db.invoices.insert_one(invoice)
        return {"status": "success", "data": {k: v for k, v in invoice.items() if k != "_id"}}

    @router.get("/invoices")
    async def list_invoices(
        status: Optional[str] = None,
        customer_id: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        skip: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=200),
        current_user: dict = Depends(get_current_user)
    ):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        query = {"tenant_id": tenant_id}
        if status:
            query["status"] = status
        if customer_id:
            query["customer_id"] = customer_id
        if date_from or date_to:
            date_q = {}
            if date_from:
                date_q["$gte"] = date_from
            if date_to:
                date_q["$lte"] = date_to
            query["created_at"] = date_q

        total = await tenant_db.invoices.count_documents(query)
        invoices = await tenant_db.invoices.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(None)

        # Totals
        pipeline = [
            {"$match": {"tenant_id": tenant_id, **({"status": status} if status else {})}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}}
        ]
        totals = await tenant_db.invoices.aggregate(pipeline).to_list(None)

        return {
            "status": "success",
            "total": total,
            "total_amount": round(totals[0]["total"], 2) if totals else 0,
            "data": invoices
        }

    @router.get("/invoices/{invoice_id}")
    async def get_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        invoice = await tenant_db.invoices.find_one({"id": invoice_id, "tenant_id": tenant_id}, {"_id": 0})
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        return {"status": "success", "data": invoice}

    @router.put("/invoices/{invoice_id}")
    async def update_invoice(invoice_id: str, data: InvoiceUpdate, current_user: dict = Depends(get_current_user)):
        require_permission(current_user, "financial:manage")
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        updates["updated_at"] = _now()

        result = await tenant_db.invoices.update_one({"id": invoice_id, "tenant_id": tenant_id}, {"$set": updates})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Invoice not found")
        return {"status": "success", "message": "Invoice updated"}

    @router.post("/invoices/{invoice_id}/send")
    async def send_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
        require_permission(current_user, "financial:manage")
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        result = await tenant_db.invoices.update_one(
            {"id": invoice_id, "tenant_id": tenant_id},
            {"$set": {"status": "sent", "sent_at": _now(), "updated_at": _now()}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Invoice not found")
        return {"status": "success", "message": "Invoice marked as sent"}

    # ========================================================================
    # GROUP 5: Product Family Capital (5 endpoints)
    # ========================================================================

    @router.post("/family-capital")
    async def create_family_capital(data: ProductFamilyCapitalCreate, current_user: dict = Depends(get_current_user)):
        require_permission(current_user, "financial:manage")
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        # Check if family exists
        family = await tenant_db.product_families.find_one({"id": data.family_id}, {"_id": 0})
        if not family:
            raise HTTPException(status_code=404, detail="Product family not found")

        existing = await tenant_db.family_capital.find_one({"family_id": data.family_id, "tenant_id": tenant_id}, {"_id": 0})
        if existing:
            raise HTTPException(status_code=409, detail="Capital record already exists for this family. Use PUT to update.")

        # Calculate actual invested capital
        capital_info = await _calculate_product_family_capital(tenant_db, data.family_id)

        record = {
            "id": _uuid(),
            "family_id": data.family_id,
            "family_name": family.get("name", ""),
            "initial_capital": data.initial_capital,
            "additional_capital": 0.0,
            "total_invested": data.initial_capital + capital_info["total_invested_capital"],
            "current_stock_value": capital_info["total_invested_capital"],
            "currency": data.currency,
            "product_count": capital_info["product_count"],
            "product_capitals": capital_info["products"],
            "notes": data.notes,
            "tenant_id": tenant_id,
            "created_by": current_user.get("id"),
            "created_at": _now(),
            "updated_at": _now(),
        }
        await tenant_db.family_capital.insert_one(record)
        return {"status": "success", "data": {k: v for k, v in record.items() if k != "_id"}}

    @router.get("/family-capital")
    async def list_family_capitals(
        family_id: Optional[str] = None,
        skip: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=200),
        current_user: dict = Depends(get_current_user)
    ):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        query = {"tenant_id": tenant_id}
        if family_id:
            query["family_id"] = family_id

        total = await tenant_db.family_capital.count_documents(query)
        records = await tenant_db.family_capital.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(None)

        # Calculate total portfolio
        total_portfolio = sum(r.get("total_invested", 0) for r in records)

        return {
            "status": "success",
            "total": total,
            "total_portfolio_value": round(total_portfolio, 2),
            "data": records
        }

    @router.get("/family-capital/{capital_id}")
    async def get_family_capital(capital_id: str, current_user: dict = Depends(get_current_user)):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        record = await tenant_db.family_capital.find_one({"id": capital_id, "tenant_id": tenant_id}, {"_id": 0})
        if not record:
            raise HTTPException(status_code=404, detail="Family capital record not found")

        # Refresh current stock value
        fresh = await _calculate_product_family_capital(tenant_db, record["family_id"])
        record["current_stock_value"] = fresh["total_invested_capital"]
        record["product_capitals"] = fresh["products"]

        return {"status": "success", "data": record}

    @router.put("/family-capital/{capital_id}")
    async def update_family_capital(capital_id: str, data: ProductFamilyCapitalUpdate, current_user: dict = Depends(get_current_user)):
        require_permission(current_user, "financial:manage")
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        existing = await tenant_db.family_capital.find_one({"id": capital_id, "tenant_id": tenant_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Family capital record not found")

        updates = {}
        if data.additional_capital is not None and data.additional_capital > 0:
            updates["additional_capital"] = existing.get("additional_capital", 0) + data.additional_capital
            updates["total_invested"] = existing.get("initial_capital", 0) + updates["additional_capital"]
        if data.notes is not None:
            updates["notes"] = data.notes

        # Refresh stock value
        fresh = await _calculate_product_family_capital(tenant_db, existing["family_id"])
        updates["current_stock_value"] = fresh["total_invested_capital"]
        updates["product_capitals"] = fresh["products"]
        updates["updated_at"] = _now()

        result = await tenant_db.family_capital.update_one({"id": capital_id}, {"$set": updates})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Family capital record not found")
        return {"status": "success", "message": "Family capital updated"}

    @router.get("/family-capital/family/{family_id}/report")
    async def family_capital_report(family_id: str, current_user: dict = Depends(get_current_user)):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        # Get capital info
        capital_info = await _calculate_product_family_capital(tenant_db, family_id)

        # Get profit info
        profit_info = await _calculate_family_profit(tenant_db, family_id)

        family = await tenant_db.product_families.find_one({"id": family_id}, {"_id": 0})

        return {
            "status": "success",
            "data": {
                "family": {
                    "id": family_id,
                    "name": family.get("name", "") if family else "",
                    "description": family.get("description", "") if family else "",
                },
                "capital": capital_info,
                "profitability": profit_info,
                "net_position": round(profit_info["total_profit"] - capital_info["total_invested_capital"], 2),
                "health_score": round(
                    min(100, max(0, profit_info["profit_margin_percent"] * 2 + profit_info["roi_percent"])) / 3, 2
                ),
            }
        }

    # ========================================================================
    # GROUP 6: Profit Analytics (6 endpoints)
    # ========================================================================

    @router.get("/analytics/profit-overview")
    async def profit_overview(
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        current_user: dict = Depends(get_current_user)
    ):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        # Date range
        if not date_from:
            date_from = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%dT00:00:00")
        if not date_to:
            date_to = _now()

        # Get all sales in period
        sales_query = {
            "tenant_id": tenant_id,
            "created_at": {"$gte": date_from, "$lte": date_to}
        }
        sales = await tenant_db.sales.find(sales_query, {"_id": 0}).to_list(None)

        total_revenue = 0.0
        total_cost = 0.0
        total_orders = len(sales)
        total_items = 0

        for sale in sales:
            for item in sale.get("items", []):
                qty = item.get("quantity", 0)
                price = item.get("unit_price", item.get("price", 0))
                cost = item.get("purchase_price", item.get("cost", 0))
                total_revenue += qty * price
                total_cost += qty * cost
                total_items += qty

        total_profit = total_revenue - total_cost
        profit_margin = (total_profit / total_revenue * 100) if total_revenue > 0 else 0
        avg_order_value = total_revenue / total_orders if total_orders > 0 else 0

        # Get expenses
        expenses = await tenant_db.expenses.find({
            "tenant_id": tenant_id,
            "expense_date": {"$gte": date_from, "$lte": date_to}
        }, {"_id": 0}).to_list(None)
        total_expenses = sum(e.get("amount", 0) for e in expenses)

        net_profit = total_profit - total_expenses

        return {
            "status": "success",
            "period": {"from": date_from, "to": date_to},
            "data": {
                "total_revenue": round(total_revenue, 2),
                "total_cost": round(total_cost, 2),
                "gross_profit": round(total_profit, 2),
                "total_expenses": round(total_expenses, 2),
                "net_profit": round(net_profit, 2),
                "profit_margin_percent": round(profit_margin, 2),
                "total_orders": total_orders,
                "total_items_sold": total_items,
                "average_order_value": round(avg_order_value, 2),
                "break_even_orders": round(total_expenses / avg_order_value, 0) if avg_order_value > 0 else 0,
            }
        }

    @router.get("/analytics/profit-by-family")
    async def profit_by_family(
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        current_user: dict = Depends(get_current_user)
    ):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        if not date_from:
            date_from = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%dT00:00:00")
        if not date_to:
            date_to = _now()

        families = await tenant_db.product_families.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(None)

        results = []
        for family in families:
            profit_info = await _calculate_family_profit(tenant_db, family["id"], date_from, date_to)
            results.append(profit_info)

        # Sort by profit descending
        results.sort(key=lambda x: x["total_profit"], reverse=True)

        total_portfolio_profit = sum(r["total_profit"] for r in results)
        total_portfolio_revenue = sum(r["total_revenue"] for r in results)

        return {
            "status": "success",
            "period": {"from": date_from, "to": date_to},
            "summary": {
                "total_families": len(results),
                "total_revenue": round(total_portfolio_revenue, 2),
                "total_profit": round(total_portfolio_profit, 2),
                "overall_margin": round((total_portfolio_profit / total_portfolio_revenue * 100), 2) if total_portfolio_revenue > 0 else 0,
                "profitable_families": len([r for r in results if r["total_profit"] > 0]),
                "loss_making_families": len([r for r in results if r["total_profit"] < 0]),
            },
            "data": results
        }

    @router.get("/analytics/profit-by-product")
    async def profit_by_product(
        family_id: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        limit: int = Query(50, ge=1, le=200),
        current_user: dict = Depends(get_current_user)
    ):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        if not date_from:
            date_from = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%dT00:00:00")
        if not date_to:
            date_to = _now()

        # Get products
        product_query = {"tenant_id": tenant_id} if hasattr(tenant_db, 'products') else {}
        if family_id:
            product_query["family_id"] = family_id

        products = await tenant_db.products.find(product_query, {"_id": 0}).to_list(None)

        product_profits = []
        for product in products:
            pid = product["id"]
            sales = await tenant_db.sales.find({
                "items.product_id": pid,
                "created_at": {"$gte": date_from, "$lte": date_to}
            }, {"_id": 0}).to_list(None)

            total_revenue = 0.0
            total_cost = 0.0
            total_qty = 0

            for sale in sales:
                for item in sale.get("items", []):
                    if item.get("product_id") == pid:
                        qty = item.get("quantity", 0)
                        price = item.get("unit_price", item.get("price", 0))
                        cost = item.get("purchase_price", item.get("cost", 0))
                        total_revenue += qty * price
                        total_cost += qty * cost
                        total_qty += qty

            profit = total_revenue - total_cost
            margin = (profit / total_revenue * 100) if total_revenue > 0 else 0

            product_profits.append({
                "product_id": pid,
                "product_name": product.get("name", ""),
                "family_id": product.get("family_id", ""),
                "revenue": round(total_revenue, 2),
                "cost": round(total_cost, 2),
                "profit": round(profit, 2),
                "profit_margin_percent": round(margin, 2),
                "quantity_sold": total_qty,
                "status": "highly_profitable" if margin >= 40 else "profitable" if margin >= 15 else "low_margin" if margin >= 5 else "loss" if profit < 0 else "break_even",
            })

        product_profits.sort(key=lambda x: x["profit"], reverse=True)

        return {
            "status": "success",
            "period": {"from": date_from, "to": date_to},
            "total_products": len(product_profits),
            "data": product_profits[:limit]
        }

    @router.get("/analytics/trend")
    async def profit_trend(
        period: Literal["day", "week", "month"] = "day",
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        current_user: dict = Depends(get_current_user)
    ):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        if not date_from:
            date_from = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%dT00:00:00")
        if not date_to:
            date_to = _now()

        sales = await tenant_db.sales.find({
            "tenant_id": tenant_id,
            "created_at": {"$gte": date_from, "$lte": date_to}
        }, {"_id": 0}).to_list(None)

        from collections import defaultdict
        trend = defaultdict(lambda: {"revenue": 0.0, "cost": 0.0, "orders": 0})

        for sale in sales:
            created = sale.get("created_at", "")
            if len(created) >= 10:
                if period == "month":
                    key = created[:7]  # YYYY-MM
                elif period == "week":
                    dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                    key = dt.strftime("%Y-W%U")
                else:
                    key = created[:10]  # YYYY-MM-DD

                trend[key]["orders"] += 1
                for item in sale.get("items", []):
                    qty = item.get("quantity", 0)
                    price = item.get("unit_price", item.get("price", 0))
                    cost = item.get("purchase_price", item.get("cost", 0))
                    trend[key]["revenue"] += qty * price
                    trend[key]["cost"] += qty * cost

        result = []
        for key in sorted(trend.keys()):
            t = trend[key]
            profit = t["revenue"] - t["cost"]
            result.append({
                "period": key,
                "revenue": round(t["revenue"], 2),
                "cost": round(t["cost"], 2),
                "profit": round(profit, 2),
                "orders": t["orders"],
                "profit_margin": round((profit / t["revenue"] * 100), 2) if t["revenue"] > 0 else 0,
            })

        return {"status": "success", "period_type": period, "data": result}

    @router.get("/analytics/top-products")
    async def top_profitable_products(
        sort_by: Literal["profit", "margin", "quantity"] = "profit",
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        limit: int = Query(20, ge=1, le=100),
        current_user: dict = Depends(get_current_user)
    ):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        if not date_from:
            date_from = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%dT00:00:00")
        if not date_to:
            date_to = _now()

        products = await tenant_db.products.find({}, {"_id": 0}).to_list(None)

        product_data = []
        for product in products:
            pid = product["id"]
            sales = await tenant_db.sales.find({
                "items.product_id": pid,
                "created_at": {"$gte": date_from, "$lte": date_to}
            }, {"_id": 0}).to_list(None)

            revenue = 0.0
            cost = 0.0
            qty = 0
            for sale in sales:
                for item in sale.get("items", []):
                    if item.get("product_id") == pid:
                        q = item.get("quantity", 0)
                        revenue += q * item.get("unit_price", item.get("price", 0))
                        cost += q * item.get("purchase_price", item.get("cost", 0))
                        qty += q

            profit = revenue - cost
            margin = (profit / revenue * 100) if revenue > 0 else 0
            product_data.append({
                "product_id": pid,
                "product_name": product.get("name", ""),
                "family_id": product.get("family_id", ""),
                "revenue": round(revenue, 2),
                "profit": round(profit, 2),
                "profit_margin": round(margin, 2),
                "quantity_sold": qty,
            })

        sort_key = {"profit": "profit", "margin": "profit_margin", "quantity": "quantity_sold"}[sort_by]
        product_data.sort(key=lambda x: x[sort_key], reverse=True)

        return {"status": "success", "data": product_data[:limit]}

    @router.get("/analytics/compare-families")
    async def compare_families(
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        current_user: dict = Depends(get_current_user)
    ):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        if not date_from:
            date_from = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%dT00:00:00")
        if not date_to:
            date_to = _now()

        families = await tenant_db.product_families.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(None)

        comparison = []
        for family in families:
            profit = await _calculate_family_profit(tenant_db, family["id"], date_from, date_to)
            capital_info = await _calculate_product_family_capital(tenant_db, family["id"])

            comparison.append({
                "family_id": family["id"],
                "family_name": family.get("name", ""),
                "revenue": profit["total_revenue"],
                "profit": profit["total_profit"],
                "margin": profit["profit_margin_percent"],
                "roi": profit["roi_percent"],
                "invested_capital": capital_info["total_invested_capital"],
                "product_count": capital_info["product_count"],
                "rank_score": round(profit["total_profit"] * profit["profit_margin_percent"] / 100, 2),
            })

        comparison.sort(key=lambda x: x["rank_score"], reverse=True)

        return {"status": "success", "data": comparison}

    # ========================================================================
    # GROUP 7: Profitability Thresholds & Alerts (3 endpoints)
    # ========================================================================

    @router.get("/profitability/settings")
    async def get_profitability_settings(current_user: dict = Depends(get_current_user)):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        settings = await tenant_db.profitability_settings.find_one({"tenant_id": tenant_id}, {"_id": 0})
        if not settings:
            # Return defaults
            return {
                "status": "success",
                "data": {
                    "min_profit_margin": 15.0,
                    "min_roi": 20.0,
                    "min_turnover_rate": 5,
                    "low_stock_threshold": 10,
                    "auto_alert": True,
                }
            }
        return {"status": "success", "data": settings}

    @router.put("/profitability/settings")
    async def update_profitability_settings(data: ProfitabilityThresholdUpdate, current_user: dict = Depends(get_current_user)):
        require_permission(current_user, "financial:manage")
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        updates["updated_at"] = _now()

        result = await tenant_db.profitability_settings.update_one(
            {"tenant_id": tenant_id},
            {"$set": updates, "$setOnInsert": {"created_at": _now()}},
            upsert=True
        )
        return {"status": "success", "message": "Settings updated"}

    @router.get("/profitability/health-check")
    async def profitability_health_check(current_user: dict = Depends(get_current_user)):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        # Get settings
        settings = await tenant_db.profitability_settings.find_one({"tenant_id": tenant_id}, {"_id": 0})
        min_margin = settings.get("min_profit_margin", 15.0) if settings else 15.0

        # Check all families
        families = await tenant_db.product_families.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(None)

        alerts = []
        healthy = 0
        at_risk = 0
        critical = 0

        for family in families:
            profit = await _calculate_family_profit(tenant_db, family["id"])
            margin = profit["profit_margin_percent"]

            if margin < 0:
                critical += 1
                alerts.append({
                    "family_id": family["id"],
                    "family_name": family.get("name", ""),
                    "severity": "critical",
                    "message": f"Family is losing money with {margin}% margin",
                    "margin": margin,
                })
            elif margin < min_margin / 2:
                critical += 1
                alerts.append({
                    "family_id": family["id"],
                    "family_name": family.get("name", ""),
                    "severity": "critical",
                    "message": f"Very low margin: {margin}% (below {min_margin / 2}%)",
                    "margin": margin,
                })
            elif margin < min_margin:
                at_risk += 1
                alerts.append({
                    "family_id": family["id"],
                    "family_name": family.get("name", ""),
                    "severity": "warning",
                    "message": f"Low margin: {margin}% (below {min_margin}%)",
                    "margin": margin,
                })
            else:
                healthy += 1

        return {
            "status": "success",
            "summary": {
                "total_families": len(families),
                "healthy": healthy,
                "at_risk": at_risk,
                "critical": critical,
                "health_rate": round(healthy / len(families) * 100, 2) if families else 0,
            },
            "alerts": alerts,
        }

    # ========================================================================
    # GROUP 8: Financial Reports (4 endpoints)
    # ========================================================================

    @router.get("/reports/income-statement")
    async def income_statement(
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        current_user: dict = Depends(get_current_user)
    ):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        if not date_from:
            date_from = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%dT00:00:00")
        if not date_to:
            date_to = _now()

        # Revenue from sales
        sales = await tenant_db.sales.find({
            "tenant_id": tenant_id,
            "created_at": {"$gte": date_from, "$lte": date_to}
        }, {"_id": 0}).to_list(None)

        total_revenue = 0.0
        cogs = 0.0
        for sale in sales:
            for item in sale.get("items", []):
                qty = item.get("quantity", 0)
                total_revenue += qty * item.get("unit_price", item.get("price", 0))
                cogs += qty * item.get("purchase_price", item.get("cost", 0))

        gross_profit = total_revenue - cogs

        # Expenses
        expenses = await tenant_db.expenses.find({
            "tenant_id": tenant_id,
            "expense_date": {"$gte": date_from, "$lte": date_to}
        }, {"_id": 0}).to_list(None)

        expense_by_category = {}
        total_expenses = 0.0
        for exp in expenses:
            cat = exp.get("category", "other")
            amount = exp.get("amount", 0)
            expense_by_category[cat] = expense_by_category.get(cat, 0) + amount
            total_expenses += amount

        operating_profit = gross_profit - total_expenses

        # Refunds
        refunds = await tenant_db.refunds.find({
            "tenant_id": tenant_id,
            "created_at": {"$gte": date_from, "$lte": date_to},
            "status": "processed"
        }, {"_id": 0}).to_list(None)
        total_refunds = sum(r.get("amount", 0) for r in refunds)

        net_profit = operating_profit - total_refunds

        return {
            "status": "success",
            "period": {"from": date_from, "to": date_to},
            "data": {
                "revenue": {"total": round(total_revenue, 2), "orders": len(sales)},
                "cogs": round(cogs, 2),
                "gross_profit": round(gross_profit, 2),
                "gross_margin": round((gross_profit / total_revenue * 100), 2) if total_revenue else 0,
                "operating_expenses": {"total": round(total_expenses, 2), "by_category": {k: round(v, 2) for k, v in expense_by_category.items()}},
                "operating_profit": round(operating_profit, 2),
                "refunds": round(total_refunds, 2),
                "net_profit": round(net_profit, 2),
                "net_margin": round((net_profit / total_revenue * 100), 2) if total_revenue else 0,
            }
        }

    @router.get("/reports/cash-flow")
    async def cash_flow_report(
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        current_user: dict = Depends(get_current_user)
    ):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        if not date_from:
            date_from = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%dT00:00:00")
        if not date_to:
            date_to = _now()

        # Cash inflows (completed payments)
        inflows = await tenant_db.financial_transactions.find({
            "tenant_id": tenant_id,
            "type": "payment",
            "status": "completed",
            "created_at": {"$gte": date_from, "$lte": date_to}
        }, {"_id": 0}).to_list(None)

        # Cash outflows (refunds, payouts, expenses)
        outflows = await tenant_db.financial_transactions.find({
            "tenant_id": tenant_id,
            "type": {"$in": ["refund", "payout", "fee"]},
            "status": "completed",
            "created_at": {"$gte": date_from, "$lte": date_to}
        }, {"_id": 0}).to_list(None)

        total_in = sum(t.get("amount", 0) for t in inflows)
        total_out = sum(t.get("amount", 0) for t in outflows)

        return {
            "status": "success",
            "period": {"from": date_from, "to": date_to},
            "data": {
                "cash_inflows": {"total": round(total_in, 2), "transactions": len(inflows)},
                "cash_outflows": {"total": round(total_out, 2), "transactions": len(outflows)},
                "net_cash_flow": round(total_in - total_out, 2),
                "by_payment_method": {},
            }
        }

    @router.get("/reports/balance-sheet")
    async def balance_sheet(current_user: dict = Depends(get_current_user)):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        # Assets: Inventory value
        inventory = await tenant_db.inventory.find({}, {"_id": 0}).to_list(None)
        total_inventory_value = 0.0
        for inv in inventory:
            product = await tenant_db.products.find_one({"id": inv.get("product_id")}, {"_id": 0})
            if product:
                qty = inv.get("quantity", 0)
                avg_cost = product.get("purchase_price", product.get("cost", 0))
                total_inventory_value += qty * avg_cost

        # Cash
        cash_boxes = await tenant_db.cash_boxes.find({}, {"_id": 0}).to_list(None)
        total_cash = sum(c.get("balance", 0) for c in cash_boxes)

        # Accounts receivable
        invoices = await tenant_db.invoices.find({
            "tenant_id": tenant_id,
            "status": {"$in": ["sent", "overdue"]}
        }, {"_id": 0}).to_list(None)
        accounts_receivable = sum(i.get("total", 0) for i in invoices)

        total_assets = total_inventory_value + total_cash + accounts_receivable

        # Liabilities
        purchases = await tenant_db.purchases.find({
            "tenant_id": tenant_id,
            "status": {"$nin": ["paid"]}
        }, {"_id": 0}).to_list(None)
        accounts_payable = sum(p.get("total", 0) for p in purchases)

        refunds_pending = await tenant_db.refunds.find({
            "tenant_id": tenant_id,
            "status": {"$in": ["pending", "approved"]}
        }, {"_id": 0}).to_list(None)
        pending_refunds = sum(r.get("amount", 0) for r in refunds_pending)

        total_liabilities = accounts_payable + pending_refunds

        equity = total_assets - total_liabilities

        return {
            "status": "success",
            "date": _now(),
            "data": {
                "assets": {
                    "current_assets": {
                        "cash": round(total_cash, 2),
                        "inventory": round(total_inventory_value, 2),
                        "accounts_receivable": round(accounts_receivable, 2),
                    },
                    "total_assets": round(total_assets, 2),
                },
                "liabilities": {
                    "accounts_payable": round(accounts_payable, 2),
                    "pending_refunds": round(pending_refunds, 2),
                    "total_liabilities": round(total_liabilities, 2),
                },
                "equity": round(equity, 2),
            }
        }

    @router.get("/reports/tax-summary")
    async def tax_summary(
        year: Optional[int] = None,
        current_user: dict = Depends(get_current_user)
    ):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        if not year:
            year = datetime.now(timezone.utc).year

        date_from = f"{year}-01-01T00:00:00"
        date_to = f"{year}-12-31T23:59:59"

        sales = await tenant_db.sales.find({
            "tenant_id": tenant_id,
            "created_at": {"$gte": date_from, "$lte": date_to}
        }, {"_id": 0}).to_list(None)

        total_revenue = 0.0
        taxable_amount = 0.0
        for sale in sales:
            for item in sale.get("items", []):
                qty = item.get("quantity", 0)
                price = item.get("unit_price", item.get("price", 0))
                total_revenue += qty * price
                taxable_amount += qty * price  # All sales are taxable

        # VAT rate (Algeria: 19% standard)
        vat_rate = 19.0
        vat_amount = taxable_amount * (vat_rate / 100)

        # IBS (Corporate tax ~19% for small businesses)
        ibs_rate = 19.0
        # Rough calculation: profit * rate
        cogs = sum(
            item.get("quantity", 0) * item.get("purchase_price", item.get("cost", 0))
            for sale in sales for item in sale.get("items", [])
        )
        gross_profit = total_revenue - cogs
        ibs_amount = gross_profit * (ibs_rate / 100) if gross_profit > 0 else 0

        return {
            "status": "success",
            "year": year,
            "data": {
                "total_revenue": round(total_revenue, 2),
                "taxable_amount": round(taxable_amount, 2),
                "vat": {"rate": vat_rate, "amount": round(vat_amount, 2)},
                "ibs": {"rate": ibs_rate, "amount": round(ibs_amount, 2)},
                "total_tax_liability": round(vat_amount + ibs_amount, 2),
            }
        }

    # ========================================================================
    # GROUP 9: Commission Management (5 endpoints)
    # ========================================================================

    @router.post("/commissions")
    async def create_commission(data: CommissionCreate, current_user: dict = Depends(get_current_user)):
        require_permission(current_user, "financial:manage")
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        commission = data.model_dump()
        commission["id"] = _uuid()
        commission["tenant_id"] = tenant_id
        commission["status"] = "pending"
        commission["created_by"] = current_user.get("id")
        commission["created_at"] = _now()
        commission["updated_at"] = _now()
        await tenant_db.commissions.insert_one(commission)
        return {"status": "success", "data": {k: v for k, v in commission.items() if k != "_id"}}

    @router.get("/commissions")
    async def list_commissions(
        agent_id: Optional[str] = None,
        status: Optional[str] = None,
        type: Optional[str] = None,
        skip: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=200),
        current_user: dict = Depends(get_current_user)
    ):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        query = {"tenant_id": tenant_id}
        if agent_id:
            query["agent_id"] = agent_id
        if status:
            query["status"] = status
        if type:
            query["type"] = type

        total = await tenant_db.commissions.count_documents(query)
        commissions = await tenant_db.commissions.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(None)

        # Totals by status
        pipeline = [
            {"$match": {"tenant_id": tenant_id}},
            {"$group": {"_id": "$status", "count": {"$sum": 1}, "total": {"$sum": "$amount"}}}
        ]
        totals = await tenant_db.commissions.aggregate(pipeline).to_list(None)

        return {
            "status": "success",
            "total": total,
            "by_status": {t["_id"]: {"count": t["count"], "total": round(t["total"], 2)} for t in totals},
            "data": commissions
        }

    @router.get("/commissions/{commission_id}")
    async def get_commission(commission_id: str, current_user: dict = Depends(get_current_user)):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        commission = await tenant_db.commissions.find_one({"id": commission_id, "tenant_id": tenant_id}, {"_id": 0})
        if not commission:
            raise HTTPException(status_code=404, detail="Commission not found")
        return {"status": "success", "data": commission}

    @router.put("/commissions/{commission_id}")
    async def update_commission(commission_id: str, data: CommissionUpdate, current_user: dict = Depends(get_current_user)):
        require_permission(current_user, "financial:manage")
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        updates["updated_at"] = _now()

        result = await tenant_db.commissions.update_one({"id": commission_id, "tenant_id": tenant_id}, {"$set": updates})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Commission not found")
        return {"status": "success", "message": "Commission updated"}

    @router.get("/commissions/agent/{agent_id}/balance")
    async def agent_commission_balance(agent_id: str, current_user: dict = Depends(get_current_user)):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        pipeline = [
            {"$match": {"tenant_id": tenant_id, "agent_id": agent_id}},
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1},
                "total": {"$sum": "$amount"}
            }}
        ]
        results = await tenant_db.commissions.aggregate(pipeline).to_list(None)

        status_totals = {r["_id"]: {"count": r["count"], "total": round(r["total"], 2)} for r in results}

        pending = status_totals.get("pending", {}).get("total", 0)
        approved = status_totals.get("approved", {}).get("total", 0)
        paid = status_totals.get("paid", {}).get("total", 0)

        return {
            "status": "success",
            "agent_id": agent_id,
            "data": {
                "pending_amount": pending,
                "approved_amount": approved,
                "paid_amount": paid,
                "available_for_payout": approved,
                "total_earned": pending + approved + paid,
            }
        }

    # ========================================================================
    # GROUP 10: Payout Management (4 endpoints)
    # ========================================================================

    @router.post("/payouts")
    async def create_payout(data: PayoutCreate, current_user: dict = Depends(get_current_user)):
        require_permission(current_user, "financial:manage")
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        # Verify agent exists and has enough approved commissions
        balance = await agent_commission_balance(data.agent_id, current_user)
        available = balance["data"]["available_for_payout"]

        if data.amount > available:
            raise HTTPException(status_code=400, detail=f"Payout amount exceeds available balance ({available})")

        payout = data.model_dump()
        payout["id"] = _uuid()
        payout["tenant_id"] = tenant_id
        payout["status"] = "pending"
        payout["created_by"] = current_user.get("id")
        payout["created_at"] = _now()
        payout["updated_at"] = _now()

        await tenant_db.payouts.insert_one(payout)
        return {"status": "success", "data": {k: v for k, v in payout.items() if k != "_id"}}

    @router.get("/payouts")
    async def list_payouts(
        agent_id: Optional[str] = None,
        status: Optional[str] = None,
        skip: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=200),
        current_user: dict = Depends(get_current_user)
    ):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        query = {"tenant_id": tenant_id}
        if agent_id:
            query["agent_id"] = agent_id
        if status:
            query["status"] = status

        total = await tenant_db.payouts.count_documents(query)
        payouts_list = await tenant_db.payouts.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(None)
        return {"status": "success", "total": total, "data": payouts_list}

    @router.get("/payouts/{payout_id}")
    async def get_payout(payout_id: str, current_user: dict = Depends(get_current_user)):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        payout = await tenant_db.payouts.find_one({"id": payout_id, "tenant_id": tenant_id}, {"_id": 0})
        if not payout:
            raise HTTPException(status_code=404, detail="Payout not found")
        return {"status": "success", "data": payout}

    @router.put("/payouts/{payout_id}")
    async def update_payout(payout_id: str, data: PayoutUpdate, current_user: dict = Depends(get_current_user)):
        require_permission(current_user, "financial:manage")
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        updates["updated_at"] = _now()
        if data.status == "completed":
            updates["completed_at"] = _now()
            updates["completed_by"] = current_user.get("id")

        result = await tenant_db.payouts.update_one({"id": payout_id, "tenant_id": tenant_id}, {"$set": updates})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Payout not found")
        return {"status": "success", "message": "Payout updated"}

    # ========================================================================
    # GROUP 11: Barid Mob / CCP Integration Helpers (2 endpoints)
    # ========================================================================

    @router.get("/integrations/ccp/check")
    async def check_ccp_status(current_user: dict = Depends(get_current_user)):
        tenant_id = current_user.get("tenant_id", "default")
        return {
            "status": "success",
            "integration": "ccp",
            "name": "CCP - بريد الجزائر",
            "available": True,
            "config_required": ["ccp_account_number", "ccp_key"],
            "endpoints": [
                {"method": "POST", "path": "/api/v2/financial/ccp/payments", "description": "Process CCP payment"},
                {"method": "GET", "path": "/api/v2/financial/ccp/payments/{id}/status", "description": "Check payment status"},
            ],
            "notes": "Requires CCP API credentials from Barid Mob"
        }

    @router.get("/integrations/barid-mob/config")
    async def get_barid_mob_config(current_user: dict = Depends(get_current_user)):
        tenant_id = current_user.get("tenant_id", "default")
        tenant_db = await _get_db(tenant_id, db)

        config = await tenant_db.integration_configs.find_one({"tenant_id": tenant_id, "integration": "barid_mob"}, {"_id": 0})
        if not config:
            return {
                "status": "success",
                "configured": False,
                "integration": "barid_mob",
                "name": "Barid Mob",
                "setup_guide": {
                    "step_1": "Register at Barid Mob Pro",
                    "step_2": "Get API credentials",
                    "step_3": "Configure webhook URL",
                    "step_4": "Test in sandbox mode",
                }
            }
        return {"status": "success", "configured": True, "data": config}

    return router
