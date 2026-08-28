"""p268: Super-admin cross-tenant data browser — READ-ONLY, fully audit-logged.

Lets the platform owner search any tenant's database and view their products
(with purchase & sale prices), customers, and sales — without impersonation.
Every single access writes a row to main_db.saas_data_access_log.

Endpoints (super-admin only):
    GET /saas/data-browser/{tenant_id}/search?q=
    GET /saas/data-browser/{tenant_id}/products?skip=&limit=&q=
    GET /saas/data-browser/{tenant_id}/sales?skip=&limit=&q=
    GET /saas/data-browser/{tenant_id}/customers?skip=&limit=&q=
    GET /saas/data-browser/access-log?tenant_id=&limit=
"""
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from config.database import db, client, get_tenant_db
from .helpers import get_super_admin

router = APIRouter(tags=["SaaS Data Browser"])

_ESC = lambda s: re.escape((s or "").strip())


async def _tenant_or_404(tenant_id: str) -> dict:
    t = await db.saas_tenants.find_one({"id": tenant_id}, {"_id": 0, "id": 1, "name": 1, "short_id": 1})
    if not t:
        raise HTTPException(status_code=404, detail="المستأجر غير موجود")
    return t


def _tdb(tenant_id: str):
    return get_tenant_db(tenant_id)


async def _log_access(admin: dict, tenant_id: str, action: str, query: str = ""):
    try:
        await db.saas_data_access_log.insert_one({
            "admin_id": admin.get("id") or admin.get("sub", ""),
            "admin_email": admin.get("email", ""),
            "tenant_id": tenant_id,
            "action": action,
            "query": query,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass  # logging must never break the read


# ── Global search inside one tenant ──────────────────────────────────────────
@router.get("/saas/data-browser/{tenant_id}/search")
async def browser_search(tenant_id: str, q: str = Query("", min_length=0),
                         admin: dict = Depends(get_super_admin)):
    tenant = await _tenant_or_404(tenant_id)
    q = (q or "").strip()
    if len(q) < 2:
        raise HTTPException(status_code=400, detail="أدخل حرفين على الأقل")
    await _log_access(admin, tenant_id, "search", q)
    tdb = _tdb(tenant_id)
    pat = _ESC(q)
    rx = {"$regex": pat, "$options": "i"}
    rxp = {"$regex": f"^{pat}", "$options": "i"}

    products = await tdb.products.find(
        {"$or": [{"name_ar": rx}, {"name_en": rx}, {"barcode": rxp}, {"article_code": rxp}]},
        {"_id": 0, "id": 1, "name_ar": 1, "name_en": 1, "barcode": 1, "article_code": 1,
         "purchase_price": 1, "retail_price": 1, "super_wholesale_price": 1,
         "wholesale_price": 1, "quantity": 1},
    ).limit(10).to_list(10)

    customers = await tdb.customers.find(
        {"$or": [{"name": rx}, {"phone": rxp}, {"code": rxp}]},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "code": 1, "balance": 1},
    ).limit(10).to_list(10)

    sales = await tdb.sales.find(
        {"$or": [{"invoice_number": rxp}, {"code": rxp}, {"customer_name": rx}]},
        {"_id": 0, "id": 1, "invoice_number": 1, "code": 1, "customer_name": 1,
         "total": 1, "status": 1, "created_at": 1},
    ).sort("created_at", -1).limit(10).to_list(10)

    suppliers = await tdb.suppliers.find(
        {"$or": [{"name": rx}, {"phone": rxp}, {"code": rxp}]},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "code": 1, "balance": 1},
    ).limit(10).to_list(10)

    return {
        "tenant": tenant, "q": q,
        "products": products, "customers": customers,
        "sales": sales, "suppliers": suppliers,
    }


# ── Products with full pricing ───────────────────────────────────────────────
@router.get("/saas/data-browser/{tenant_id}/products")
async def browser_products(tenant_id: str, skip: int = Query(0, ge=0),
                           limit: int = Query(50, ge=1, le=200), q: str = "",
                           admin: dict = Depends(get_super_admin)):
    tenant = await _tenant_or_404(tenant_id)
    await _log_access(admin, tenant_id, "products", q)
    tdb = _tdb(tenant_id)
    query = {}
    if q.strip():
        rx = {"$regex": _ESC(q), "$options": "i"}
        query = {"$or": [{"name_ar": rx}, {"name_en": rx}, {"barcode": rx}, {"article_code": rx}]}
    total = await tdb.products.count_documents(query)
    items = await tdb.products.find(
        query,
        {"_id": 0, "id": 1, "name_ar": 1, "name_en": 1, "barcode": 1, "article_code": 1,
         "purchase_price": 1, "retail_price": 1, "wholesale_price": 1,
         "super_wholesale_price": 1, "quantity": 1, "family_id": 1, "is_active": 1},
    ).sort("name_ar", 1).skip(skip).limit(limit).to_list(limit)
    return {"tenant": tenant, "total": total, "skip": skip, "limit": limit, "items": items}


# ── Sales ────────────────────────────────────────────────────────────────────
@router.get("/saas/data-browser/{tenant_id}/sales")
async def browser_sales(tenant_id: str, skip: int = Query(0, ge=0),
                        limit: int = Query(50, ge=1, le=200), q: str = "",
                        admin: dict = Depends(get_super_admin)):
    tenant = await _tenant_or_404(tenant_id)
    await _log_access(admin, tenant_id, "sales", q)
    tdb = _tdb(tenant_id)
    query = {}
    if q.strip():
        rxp = {"$regex": f"^{_ESC(q)}", "$options": "i"}
        query = {"$or": [{"invoice_number": rxp}, {"code": rxp}, {"customer_name": {"$regex": _ESC(q), "$options": "i"}}]}
    total = await tdb.sales.count_documents(query)
    items = await tdb.sales.find(
        query,
        {"_id": 0, "id": 1, "invoice_number": 1, "code": 1, "customer_name": 1,
         "total": 1, "paid_amount": 1, "payment_method": 1, "status": 1, "created_at": 1},
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"tenant": tenant, "total": total, "skip": skip, "limit": limit, "items": items}


# ── Customers ────────────────────────────────────────────────────────────────
@router.get("/saas/data-browser/{tenant_id}/customers")
async def browser_customers(tenant_id: str, skip: int = Query(0, ge=0),
                            limit: int = Query(50, ge=1, le=200), q: str = "",
                            admin: dict = Depends(get_super_admin)):
    tenant = await _tenant_or_404(tenant_id)
    await _log_access(admin, tenant_id, "customers", q)
    tdb = _tdb(tenant_id)
    query = {}
    if q.strip():
        rx = {"$regex": _ESC(q), "$options": "i"}
        query = {"$or": [{"name": rx}, {"phone": rx}, {"code": rx}]}
    total = await tdb.customers.count_documents(query)
    items = await tdb.customers.find(
        query,
        {"_id": 0, "id": 1, "code": 1, "name": 1, "phone": 1, "balance": 1,
         "total_purchases": 1, "created_at": 1},
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"tenant": tenant, "total": total, "skip": skip, "limit": limit, "items": items}


# ── Access log (who looked at what) ──────────────────────────────────────────
@router.get("/saas/data-browser/access-log")
async def browser_access_log(tenant_id: str = "", limit: int = Query(100, ge=1, le=500),
                             admin: dict = Depends(get_super_admin)):
    query = {"tenant_id": tenant_id} if tenant_id else {}
    rows = await db.saas_data_access_log.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    tids = list({r["tenant_id"] for r in rows})
    names = {}
    if tids:
        async for t in db.saas_tenants.find({"id": {"$in": tids}}, {"_id": 0, "id": 1, "name": 1, "short_id": 1}):
            names[t["id"]] = t
    for r in rows:
        t = names.get(r["tenant_id"], {})
        r["tenant_name"] = t.get("name", "")
        r["tenant_short_id"] = t.get("short_id", "")
    return {"items": rows, "count": len(rows)}
