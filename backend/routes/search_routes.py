"""
Ultra Search System Routes
Collections: search_history, search_suggestions
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone
import uuid
import time


# p260: every entity with a public code is searchable from one endpoint.
# Each spec: (group, collection, code fields [prefix-matched, index-friendly],
#             name/label fields [substring-matched], title fields in order,
#             subtitle fields in order, link template).
# Large collections (sales/purchases) use prefix matching for name fields too,
# so a full-collection substring scan never happens on tens of thousands of rows.
_SEARCH_SPECS = [
    ("product",           "products",           ["article_code", "barcode", "sku"],        ["name"],                    ["name"],                    ["article_code", "barcode"], "/products?id={id}"),
    ("customer",          "customers",          ["code", "phone"],                          ["name"],                    ["name"],                    ["code", "phone"],           "/customers?id={id}"),
    ("supplier",          "suppliers",          ["code", "phone"],                          ["name"],                    ["name"],                    ["code", "phone"],           "/suppliers?id={id}"),
    ("sale",              "sales",              ["code", "invoice_number"],                 ["customer_name|prefix"],    ["customer_name", "code"],   ["code", "invoice_number"],  "/sales?invoice={invoice_number}"),
    ("purchase",          "purchases",          ["code", "invoice_number"],                 ["supplier_name|prefix"],    ["supplier_name", "code"],   ["code", "invoice_number"],  "/purchases?id={id}"),
    ("expense",           "expenses",           ["code"],                                   ["title"],                   ["title", "code"],           ["code"],                    "/expenses?id={id}"),
    ("employee",          "employees",          ["code", "phone"],                          ["name"],                    ["name"],                    ["code", "phone"],           "/employees?id={id}"),
    ("system_user",       "users",              ["email"],                                  ["name"],                    ["name"],                    ["email"],                   "/users?id={id}"),
    ("repair_ticket",     "repair_tickets",     ["code", "ticket_number", "imei", "phone"], ["customer_name"],           ["customer_name", "code"],   ["code", "ticket_number"],   "/repairs?id={id}"),
    ("ecom_order",        "ecom_orders",        ["order_code", "tracking_number", "customer.phone"], ["customer.name"],  ["customer.name", "order_code"], ["order_code", "tracking_number"], "/ecom-hub?order={id}"),
    ("store_order",       "store_orders",       ["order_number", "customer_phone"],         ["customer_name"],           ["customer_name", "order_number"], ["order_number"],        "/ecom-hub/store?order={id}"),
    ("daily_session",     "daily_sessions",     ["code"],                                   ["user_name"],               ["code", "user_name"],       ["user_name"],               "/daily-sessions?id={id}"),
    ("inventory_session", "inventory_sessions", ["code"],                                   ["name"],                    ["name", "code"],            ["code"],                    "/inventory-count?id={id}"),
    ("price_update",      "price_update_logs",  ["code"],                                   [],                          ["code"],                    [],                          "/price-history?id={id}"),
    ("partner",           "partners",           ["phone"],                                  ["name"],                    ["name"],                    ["phone"],                   "/partners?id={id}"),
    ("warehouse",         "warehouses",         [],                                         ["name", "location"],        ["name"],                    ["location"],                "/warehouses?id={id}"),
    ("installment",       "installments",       ["code"],                                   ["customer_name"],           ["customer_name", "code"],   ["code"],                    "/installments?id={id}"),
    ("recharge",          "recharges",          ["code", "phone"],                          ["customer_name"],           ["customer_name", "code"],   ["code", "phone"],           "/recharge?id={id}"),
    ("digital_subscription", "digital_subscriptions", ["code", "username"],                 ["customer_name"],           ["customer_name", "code"],   ["code", "username"],        "/digital-panel/subscriptions?id={id}"),
]

_PER_GROUP = 5


def _dig(doc: dict, dotted: str):
    cur = doc
    for part in dotted.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def _first(doc: dict, fields) -> str:
    for f in fields:
        v = _dig(doc, f)
        if v not in (None, ""):
            return str(v)
    return ""


def create_search_routes(db, get_current_user) -> dict:
    router = APIRouter(prefix="/search", tags=["search"])

    @router.get("/global")
    async def global_search(q: str, limit: int = 20, user: dict = Depends(get_current_user)):
        if not q or len(q.strip()) < 2:
            return {"results": [], "groups": {}, "total": 0}
        q = q.strip()

        import asyncio
        import re as _re

        start = time.time()
        esc = _re.escape(q)
        sub = {"$regex": esc, "$options": "i"}
        pre = {"$regex": f"^{esc}", "$options": "i"}

        async def _scan(spec):
            group, coll, code_fields, name_fields, title_f, sub_f, link_t = spec
            clauses = [{f: pre} for f in code_fields]
            for f in name_fields:
                if f.endswith("|prefix"):
                    clauses.append({f[:-7]: pre})
                else:
                    clauses.append({f: sub})
            if not clauses:
                return group, []
            try:
                docs = await db[coll].find(
                    {"$or": clauses}, {"_id": 0}
                ).limit(_PER_GROUP).to_list(_PER_GROUP)
            except Exception:  # noqa: BLE001 — one missing collection must not break search
                return group, []
            items = []
            for d in docs:
                link = link_t
                for m in _re.findall(r"{(\w+)}", link_t):
                    link = link.replace("{%s}" % m, str(_dig(d, m) or d.get("id") or ""))
                items.append({
                    "type": group,
                    "id": d.get("id", ""),
                    "title": _first(d, title_f),
                    "subtitle": _first(d, sub_f),
                    "code": _first(d, code_fields),
                    "link": link,
                })
            return group, items

        pairs = await asyncio.gather(*[_scan(s) for s in _SEARCH_SPECS])
        groups = {g: items for g, items in pairs if items}
        results = [it for _, items in pairs for it in items]
        elapsed = time.time() - start

        # Save search history
        await db.search_history.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user.get("id", ""),
            "query": q,
            "search_type": "global",
            "results_count": len(results),
            "execution_time": round(elapsed, 4),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        # Update suggestions
        await db.search_suggestions.update_one(
            {"query": q.lower().strip()},
            {
                "$set": {"suggestion_text": q, "suggestion_type": "popular"},
                "$inc": {"search_count": 1},
                "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": datetime.now(timezone.utc).isoformat()},
            },
            upsert=True,
        )

        return {
            "results": results[:limit],
            "groups": groups,
            "total": len(results),
            "execution_time": round(elapsed, 4),
        }

    @router.get("/suggestions")
    async def get_suggestions(q: str = "", limit: int = 10, user: dict = Depends(get_current_user)):
        if not q:
            popular = await db.search_suggestions.find(
                {}, {"_id": 0}
            ).sort("search_count", -1).limit(limit).to_list(limit)
            return popular
        suggestions = await db.search_suggestions.find(
            {"suggestion_text": {"$regex": q, "$options": "i"}}, {"_id": 0}
        ).sort("search_count", -1).limit(limit).to_list(limit)
        return suggestions

    @router.get("/history")
    async def get_search_history(limit: int = 20, user: dict = Depends(get_current_user)):
        return await db.search_history.find(
            {"user_id": user.get("id", "")}, {"_id": 0}
        ).sort("created_at", -1).limit(limit).to_list(limit)

    @router.delete("/history")
    async def clear_history(user: dict = Depends(get_current_user)):
        await db.search_history.delete_many({"user_id": user.get("id", "")})
        return {"message": "تم مسح سجل البحث"}

    @router.get("/stats")
    async def get_search_stats(user: dict = Depends(get_current_user)):
        total = await db.search_history.count_documents({})
        avg_time = await db.search_history.aggregate([
            {"$group": {"_id": None, "avg": {"$avg": "$execution_time"}}}
        ]).to_list(1)
        top_queries = await db.search_suggestions.find(
            {}, {"_id": 0}
        ).sort("search_count", -1).limit(10).to_list(10)
        return {
            "total_searches": total,
            "avg_execution_time": round(avg_time[0]["avg"], 4) if avg_time else 0,
            "top_queries": top_queries,
        }

    return router
