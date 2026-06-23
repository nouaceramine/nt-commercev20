"""
Ultra Search System Routes
Collections: search_history, search_suggestions
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone
import uuid
import time


def create_search_routes(db, get_current_user) -> dict:
    router = APIRouter(prefix="/search", tags=["search"])

    @router.get("/global")
    async def global_search(q: str, limit: int = 20, user: dict = Depends(get_current_user)):
        if not q or len(q) < 2:
            return {"results": [], "total": 0}

        start = time.time()
        results = []
        regex = {"$regex": q, "$options": "i"}

        # Search products
        products = await db.products.find(
            {"$or": [{"name": regex}, {"article_code": regex}, {"barcode": regex}]},
            {"_id": 0, "id": 1, "name": 1, "article_code": 1, "selling_price": 1}
        ).limit(limit).to_list(limit)
        for p in products:
            results.append({"type": "product", "id": p["id"], "title": p.get("name", ""), "subtitle": p.get("article_code", "")})

        # Search customers
        customers = await db.customers.find(
            {"$or": [{"name": regex}, {"phone": regex}]},
            {"_id": 0, "id": 1, "name": 1, "phone": 1}
        ).limit(limit).to_list(limit)
        for c in customers:
            results.append({"type": "customer", "id": c["id"], "title": c.get("name", ""), "subtitle": c.get("phone", "")})

        # Search suppliers
        suppliers = await db.suppliers.find(
            {"$or": [{"name": regex}, {"phone": regex}]},
            {"_id": 0, "id": 1, "name": 1, "phone": 1}
        ).limit(limit).to_list(limit)
        for s in suppliers:
            results.append({"type": "supplier", "id": s["id"], "title": s.get("name", ""), "subtitle": s.get("phone", "")})

        # Search repair tickets
        tickets = await db.repair_tickets.find(
            {"$or": [{"ticket_number": regex}, {"customer_name": regex}, {"imei": regex}]},
            {"_id": 0, "id": 1, "ticket_number": 1, "customer_name": 1, "status": 1}
        ).limit(limit).to_list(limit)
        for t in tickets:
            results.append({"type": "repair_ticket", "id": t["id"], "title": t.get("ticket_number", ""), "subtitle": t.get("customer_name", "")})

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
