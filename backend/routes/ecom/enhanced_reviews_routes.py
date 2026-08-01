"""
Enhanced Reviews & Ratings Routes - NT Commerce v16
Section 10: Reviews & Ratings (المراجعات والتقييمات)
"""

import traceback
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════════
# PYDANTIC SCHEMAS
# ═══════════════════════════════════════════════════════════

class ReviewCreate(BaseModel):
    product_id: str
    order_id: Optional[str] = None
    rating: int = Field(..., ge=1, le=5)
    title: Optional[str] = None
    body: str
    pros: Optional[str] = None
    cons: Optional[str] = None
    images: Optional[List[str]] = None
    is_anonymous: bool = False

class ReviewUpdate(BaseModel):
    rating: Optional[int] = Field(None, ge=1, le=5)
    title: Optional[str] = None
    body: Optional[str] = None
    pros: Optional[str] = None
    cons: Optional[str] = None
    images: Optional[List[str]] = None

class ReviewReplyCreate(BaseModel):
    review_id: str
    reply: str
    is_public: bool = True

class ReviewModerationUpdate(BaseModel):
    status: str
    moderation_note: Optional[str] = None

class ReviewHelpfulVote(BaseModel):
    review_id: str
    helpful: bool = True

class ReviewReportCreate(BaseModel):
    review_id: str
    reason: str
    details: Optional[str] = None

class BulkReviewModeration(BaseModel):
    review_ids: List[str]
    status: str


# ═══════════════════════════════════════════════════════════
# FACTORY FUNCTION
# ═══════════════════════════════════════════════════════════

def create_enhanced_reviews_routes(db, get_current_user, require_permission=None, **kwargs):
    router = APIRouter(prefix="/reviews", tags=["Enhanced Reviews v2"])

    def now_iso():
        return datetime.utcnow().isoformat()

    def paginate(page: int, limit: int):
        return (page - 1) * limit, page * limit

    async def log_activity(action: str, details: str, user_id: str):
        try:
            await db.activities.insert_one({
                "id": str(uuid.uuid4()),
                "action": action,
                "details": details,
                "user_id": user_id,
                "created_at": now_iso(),
                "type": "review",
            })
        except Exception:
            pass

    # ═══════════════════════════════════════════════════════
    # 1. REVIEW CRUD (7 endpoints)
    # ═══════════════════════════════════════════════════════

    @router.post("/", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_review(review: ReviewCreate, current_user: dict = Depends(get_current_user)):
        """Submit a new product review."""
        try:
            user_id = current_user.get("id", "")
            existing = await db.reviews.find_one({
                "product_id": review.product_id,
                "user_id": user_id,
                "status": {"$ne": "deleted"},
            })
            if existing:
                raise HTTPException(status_code=409, detail="You have already reviewed this product")

            review_id = str(uuid.uuid4())
            doc = {
                "id": review_id,
                "product_id": review.product_id,
                "order_id": review.order_id,
                "user_id": user_id,
                "user_name": current_user.get("name", "") if not review.is_anonymous else "Anonymous",
                "rating": review.rating,
                "title": review.title,
                "body": review.body,
                "pros": review.pros,
                "cons": review.cons,
                "images": review.images or [],
                "is_anonymous": review.is_anonymous,
                "status": "pending",
                "helpful_count": 0,
                "not_helpful_count": 0,
                "reply": None,
                "reply_at": None,
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }
            await db.reviews.insert_one(doc)
            doc.pop("_id", None)
            await _update_product_rating(review.product_id)
            await log_activity("review_create", f"Review {review_id} for product {review.product_id}", user_id)
            return doc
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    async def _update_product_rating(product_id: str):
        """Recalculate average rating for a product."""
        try:
            pipeline = [
                {"$match": {"product_id": product_id, "status": "approved"}},
                {"$group": {"_id": "$product_id", "avg": {"$avg": "$rating"}, "count": {"$sum": 1}}},
            ]
            result = await db.reviews.aggregate(pipeline).to_list(None)
            if result:
                avg = round(result[0]["avg"], 1)
                count = result[0]["count"]
            else:
                avg = 0.0
                count = 0
            dist_pipeline = [
                {"$match": {"product_id": product_id, "status": "approved"}},
                {"$group": {"_id": "$rating", "count": {"$sum": 1}}},
            ]
            dist = await db.reviews.aggregate(dist_pipeline).to_list(None)
            distribution = {str(d["_id"]): d["count"] for d in dist}
            for i in range(1, 6):
                if str(i) not in distribution:
                    distribution[str(i)] = 0

            await db.product_ratings.update_one(
                {"product_id": product_id},
                {
                    "$set": {
                        "average_rating": avg,
                        "total_reviews": count,
                        "distribution": distribution,
                        "updated_at": now_iso(),
                    }
                },
                upsert=True,
            )
        except Exception:
            pass

    @router.get("/product/{product_id}", response_model=Dict[str, Any])
    async def get_product_reviews(
        product_id: str,
        page: int = Query(1, ge=1),
        limit: int = Query(20, ge=1, le=100),
        rating: Optional[int] = Query(None, ge=1, le=5),
        sort: str = Query("newest"),
        current_user: dict = Depends(get_current_user),
    ):
        """Get approved reviews for a product."""
        try:
            query = {"product_id": product_id, "status": "approved"}
            if rating:
                query["rating"] = rating
            sort_map = {
                "newest": [("created_at", -1)],
                "oldest": [("created_at", 1)],
                "highest": [("rating", -1)],
                "lowest": [("rating", 1)],
                "helpful": [("helpful_count", -1)],
            }
            sort_order = sort_map.get(sort, [("created_at", -1)])
            skip, _ = paginate(page, limit)
            total = await db.reviews.count_documents(query)
            items = await db.reviews.find(query, {"_id": 0}).sort(sort_order).skip(skip).limit(limit).to_list(limit)
            summary = await db.product_ratings.find_one({"product_id": product_id}, {"_id": 0})
            return {
                "reviews": items,
                "total": total,
                "page": page,
                "limit": limit,
                "summary": summary or {"average_rating": 0, "total_reviews": 0, "distribution": {}},
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/product/{product_id}/summary", response_model=Dict[str, Any])
    async def get_product_rating_summary(product_id: str, current_user: dict = Depends(get_current_user)):
        """Get quick rating summary for a product."""
        try:
            summary = await db.product_ratings.find_one({"product_id": product_id}, {"_id": 0})
            if not summary:
                return {
                    "product_id": product_id,
                    "average_rating": 0.0,
                    "total_reviews": 0,
                    "distribution": {str(i): 0 for i in range(1, 6)},
                }
            return summary
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{review_id}", response_model=Dict[str, Any])
    async def get_review(review_id: str, current_user: dict = Depends(get_current_user)):
        """Get a single review by ID."""
        try:
            review = await db.reviews.find_one({"id": review_id}, {"_id": 0})
            if not review:
                raise HTTPException(status_code=404, detail="Review not found")
            return review
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/{review_id}", response_model=Dict[str, Any])
    async def update_review(review_id: str, update: ReviewUpdate, current_user: dict = Depends(get_current_user)):
        """Update own review."""
        try:
            user_id = current_user.get("id", "")
            existing = await db.reviews.find_one({"id": review_id, "user_id": user_id})
            if not existing:
                raise HTTPException(status_code=404, detail="Review not found or not yours")
            changes = {k: v for k, v in update.model_dump().items() if v is not None}
            if changes:
                changes["updated_at"] = now_iso()
                changes["status"] = "pending"
                await db.reviews.update_one({"id": review_id}, {"$set": changes})
                await _update_product_rating(existing["product_id"])
            doc = await db.reviews.find_one({"id": review_id}, {"_id": 0})
            return doc
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_review(review_id: str, current_user: dict = Depends(get_current_user)):
        """Soft-delete own review."""
        try:
            user_id = current_user.get("id", "")
            review = await db.reviews.find_one({"id": review_id})
            if not review:
                raise HTTPException(status_code=404, detail="Review not found")
            if review.get("user_id") != user_id:
                raise HTTPException(status_code=403, detail="Not your review")
            await db.reviews.update_one(
                {"id": review_id},
                {"$set": {"status": "deleted", "deleted_at": now_iso()}},
            )
            await _update_product_rating(review["product_id"])
            return None
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/my/reviews", response_model=Dict[str, Any])
    async def get_my_reviews(
        page: int = Query(1, ge=1),
        limit: int = Query(20, ge=1, le=100),
        current_user: dict = Depends(get_current_user),
    ):
        """Get all reviews written by current user."""
        try:
            user_id = current_user.get("id", "")
            query = {"user_id": user_id, "status": {"$ne": "deleted"}}
            skip, _ = paginate(page, limit)
            total = await db.reviews.count_documents(query)
            items = await db.reviews.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"reviews": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 2. REVIEW REPLIES (2 endpoints)
    # ═══════════════════════════════════════════════════════

    @router.post("/replies", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def reply_to_review(reply: ReviewReplyCreate, current_user: dict = Depends(get_current_user)):
        """Reply to a review (admin/merchant)."""
        try:
            review = await db.reviews.find_one({"id": reply.review_id})
            if not review:
                raise HTTPException(status_code=404, detail="Review not found")
            await db.reviews.update_one(
                {"id": reply.review_id},
                {
                    "$set": {
                        "reply": reply.reply,
                        "reply_by": current_user.get("id", ""),
                        "reply_by_name": current_user.get("name", ""),
                        "reply_at": now_iso(),
                        "reply_is_public": reply.is_public,
                    }
                },
            )
            return {
                "review_id": reply.review_id,
                "reply": reply.reply,
                "replied_at": now_iso(),
            }
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/{review_id}/reply", response_model=Dict[str, Any])
    async def delete_reply(review_id: str, current_user: dict = Depends(get_current_user)):
        """Delete a reply from a review."""
        try:
            await db.reviews.update_one(
                {"id": review_id},
                {"$set": {"reply": None, "reply_at": None, "reply_by": None, "reply_by_name": None}},
            )
            return {"review_id": review_id, "reply_removed": True}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 3. HELPFUL VOTES (1 endpoint)
    # ═══════════════════════════════════════════════════════

    @router.post("/vote/helpful", response_model=Dict[str, Any])
    async def vote_helpful(vote: ReviewHelpfulVote, current_user: dict = Depends(get_current_user)):
        """Mark a review as helpful or not helpful."""
        try:
            user_id = current_user.get("id", "")
            vote_id = f"{vote.review_id}_{user_id}"
            existing_vote = await db.review_votes.find_one({"id": vote_id})

            if existing_vote:
                old_helpful = existing_vote.get("helpful", True)
                await db.review_votes.update_one({"id": vote_id}, {"$set": {"helpful": vote.helpful, "updated_at": now_iso()}})
                if old_helpful and not vote.helpful:
                    await db.reviews.update_one({"id": vote.review_id}, {"$inc": {"helpful_count": -1, "not_helpful_count": 1}})
                elif not old_helpful and vote.helpful:
                    await db.reviews.update_one({"id": vote.review_id}, {"$inc": {"helpful_count": 1, "not_helpful_count": -1}})
            else:
                await db.review_votes.insert_one({
                    "id": vote_id,
                    "review_id": vote.review_id,
                    "user_id": user_id,
                    "helpful": vote.helpful,
                    "created_at": now_iso(),
                })
                inc_field = "helpful_count" if vote.helpful else "not_helpful_count"
                await db.reviews.update_one({"id": vote.review_id}, {"$inc": {inc_field: 1}})

            review = await db.reviews.find_one({"id": vote.review_id}, {"_id": 0, "helpful_count": 1, "not_helpful_count": 1})
            return {
                "review_id": vote.review_id,
                "helpful": vote.helpful,
                "helpful_count": review.get("helpful_count", 0) if review else 0,
                "not_helpful_count": review.get("not_helpful_count", 0) if review else 0,
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 4. REPORTING (1 endpoint)
    # ═══════════════════════════════════════════════════════

    @router.post("/report", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def report_review(report: ReviewReportCreate, current_user: dict = Depends(get_current_user)):
        """Report a review for inappropriate content."""
        try:
            report_id = str(uuid.uuid4())
            doc = {
                "id": report_id,
                "review_id": report.review_id,
                "reported_by": current_user.get("id", ""),
                "reason": report.reason,
                "details": report.details,
                "status": "open",
                "created_at": now_iso(),
            }
            await db.review_reports.insert_one(doc)
            doc.pop("_id", None)
            await db.reviews.update_one(
                {"id": report.review_id},
                {"$set": {"status": "flagged", "flagged_at": now_iso()}},
            )
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 5. MODERATION (4 endpoints)
    # ═══════════════════════════════════════════════════════

    @router.get("/moderation/queue", response_model=Dict[str, Any])
    async def get_moderation_queue(
        status: str = Query("pending"),
        page: int = Query(1, ge=1),
        limit: int = Query(50, ge=1, le=100),
        current_user: dict = Depends(get_current_user),
    ):
        """Get reviews awaiting moderation."""
        try:
            query = {"status": status}
            skip, _ = paginate(page, limit)
            total = await db.reviews.count_documents(query)
            items = await db.reviews.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"reviews": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/{review_id}/moderate", response_model=Dict[str, Any])
    async def moderate_review(review_id: str, moderation: ReviewModerationUpdate, current_user: dict = Depends(get_current_user)):
        """Approve or reject a review."""
        try:
            review = await db.reviews.find_one({"id": review_id})
            if not review:
                raise HTTPException(status_code=404, detail="Review not found")
            update_fields = {
                "status": moderation.status,
                "moderated_by": current_user.get("id", ""),
                "moderated_at": now_iso(),
                "moderation_note": moderation.moderation_note,
            }
            await db.reviews.update_one({"id": review_id}, {"$set": update_fields})
            if moderation.status == "approved":
                await _update_product_rating(review["product_id"])
            await db.review_reports.update_one(
                {"review_id": review_id, "status": "open"},
                {"$set": {"status": "resolved", "resolved_at": now_iso()}},
            )
            return {"review_id": review_id, "status": moderation.status, "moderated": True}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/moderation/bulk", response_model=Dict[str, Any])
    async def bulk_moderate(req: BulkReviewModeration, current_user: dict = Depends(get_current_user)):
        """Bulk approve or reject reviews."""
        try:
            result = await db.reviews.update_many(
                {"id": {"$in": req.review_ids}},
                {
                    "$set": {
                        "status": req.status,
                        "moderated_by": current_user.get("id", ""),
                        "moderated_at": now_iso(),
                    }
                },
            )
            if req.status == "approved":
                approved = await db.reviews.find({"id": {"$in": req.review_ids}}, {"product_id": 1}).to_list(None)
                product_ids = list(set(a["product_id"] for a in approved))
                for pid in product_ids:
                    await _update_product_rating(pid)
            return {"updated": result.modified_count, "status": req.status}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/moderation/stats", response_model=Dict[str, Any])
    async def get_moderation_stats(current_user: dict = Depends(get_current_user)):
        """Get moderation statistics."""
        try:
            pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
            statuses = await db.reviews.aggregate(pipeline).to_list(None)
            stats = {s["_id"] or "unknown": s["count"] for s in statuses}
            pending_reports = await db.review_reports.count_documents({"status": "open"})
            today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
            today_reviews = await db.reviews.count_documents({"created_at": {"$gte": today}})
            return {
                "reviews_by_status": stats,
                "pending_reports": pending_reports,
                "reviews_today": today_reviews,
                "total_reviews": await db.reviews.count_documents({}),
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 6. ANALYTICS (4 endpoints)
    # ═══════════════════════════════════════════════════════

    @router.get("/analytics/overview", response_model=Dict[str, Any])
    async def get_reviews_analytics(current_user: dict = Depends(get_current_user)):
        """Overall reviews analytics dashboard."""
        try:
            total = await db.reviews.count_documents({})
            approved = await db.reviews.count_documents({"status": "approved"})
            pending = await db.reviews.count_documents({"status": "pending"})
            avg_rating_result = await db.reviews.aggregate([
                {"$match": {"status": "approved"}},
                {"$group": {"_id": None, "avg": {"$avg": "$rating"}}},
            ]).to_list(None)
            avg_rating = round(avg_rating_result[0]["avg"], 1) if avg_rating_result else 0.0
            top_products = await db.product_ratings.find({}, {"_id": 0}).sort("average_rating", -1).limit(10).to_list(10)
            since = (datetime.utcnow() - timedelta(days=30)).isoformat()
            daily_pipeline = [
                {"$match": {"created_at": {"$gte": since}}},
                {"$group": {"_id": {"$substr": ["$created_at", 0, 10]}, "count": {"$sum": 1}}},
                {"$sort": {"_id": 1}},
            ]
            daily = await db.reviews.aggregate(daily_pipeline).to_list(None)
            return {
                "total_reviews": total,
                "approved": approved,
                "pending": pending,
                "average_rating": avg_rating,
                "top_rated_products": top_products,
                "daily_reviews": [{"date": d["_id"], "count": d["count"]} for d in daily],
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/products", response_model=Dict[str, Any])
    async def get_product_reviews_ranking(
        page: int = Query(1, ge=1),
        limit: int = Query(50, ge=1, le=100),
        current_user: dict = Depends(get_current_user),
    ):
        """Get product reviews ranking."""
        try:
            skip, _ = paginate(page, limit)
            total = await db.product_ratings.count_documents({})
            items = await db.product_ratings.find({}, {"_id": 0}).sort("average_rating", -1).skip(skip).limit(limit).to_list(limit)
            return {"products": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/customers", response_model=Dict[str, Any])
    async def get_top_reviewers(current_user: dict = Depends(get_current_user)):
        """Get top reviewers."""
        try:
            pipeline = [
                {"$match": {"status": "approved"}},
                {"$group": {"_id": "$user_id", "name": {"$first": "$user_name"}, "count": {"$sum": 1}, "avg_rating": {"$avg": "$rating"}}},
                {"$sort": {"count": -1}},
                {"$limit": 50},
            ]
            reviewers = await db.reviews.aggregate(pipeline).to_list(None)
            return {
                "reviewers": [
                    {"user_id": r["_id"], "name": r["name"], "review_count": r["count"], "average_rating": round(r["avg_rating"], 1)}
                    for r in reviewers
                ]
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/rating-trends", response_model=Dict[str, Any])
    async def get_rating_trends(days: int = Query(30, ge=1, le=365), current_user: dict = Depends(get_current_user)):
        """Get average rating trends over time."""
        try:
            since = (datetime.utcnow() - timedelta(days=days)).isoformat()
            pipeline = [
                {"$match": {"created_at": {"$gte": since}, "status": "approved"}},
                {"$group": {"_id": {"$substr": ["$created_at", 0, 10]}, "avg_rating": {"$avg": "$rating"}, "count": {"$sum": 1}}},
                {"$sort": {"_id": 1}},
            ]
            daily = await db.reviews.aggregate(pipeline).to_list(None)
            return {"period_days": days, "daily": [{"date": d["_id"], "avg_rating": round(d["avg_rating"], 1), "count": d["count"]} for d in daily]}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 7. ADMIN (2 endpoints)
    # ═══════════════════════════════════════════════════════

    @router.get("/admin/all", response_model=Dict[str, Any])
    async def get_all_reviews(
        status: Optional[str] = None,
        product_id: Optional[str] = None,
        page: int = Query(1, ge=1),
        limit: int = Query(50, ge=1, le=100),
        current_user: dict = Depends(get_current_user),
    ):
        """Admin: get all reviews with filtering."""
        try:
            query = {}
            if status:
                query["status"] = status
            if product_id:
                query["product_id"] = product_id
            skip, _ = paginate(page, limit)
            total = await db.reviews.count_documents(query)
            items = await db.reviews.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"reviews": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/admin/reports", response_model=Dict[str, Any])
    async def get_review_reports(
        status: str = Query("open"),
        page: int = Query(1, ge=1),
        limit: int = Query(50, ge=1, le=100),
        current_user: dict = Depends(get_current_user),
    ):
        """Admin: get review reports."""
        try:
            query = {"status": status}
            skip, _ = paginate(page, limit)
            total = await db.review_reports.count_documents(query)
            items = await db.review_reports.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"reports": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 8. VERIFIED PURCHASE (1 endpoint)
    # ═══════════════════════════════════════════════════════

    @router.get("/product/{product_id}/verified", response_model=Dict[str, Any])
    async def get_verified_purchase_reviews(
        product_id: str,
        page: int = Query(1, ge=1),
        limit: int = Query(20, ge=1, le=100),
        current_user: dict = Depends(get_current_user),
    ):
        """Get verified purchase reviews only."""
        try:
            query = {"product_id": product_id, "status": "approved", "order_id": {"$exists": True, "$ne": None}}
            skip, _ = paginate(page, limit)
            total = await db.reviews.count_documents(query)
            items = await db.reviews.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"reviews": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 9. REVIEW HIGHLIGHTS & WIDGET (2 endpoints)
    # ═══════════════════════════════════════════════════════

    @router.get("/product/{product_id}/highlights", response_model=Dict[str, Any])
    async def get_review_highlights(product_id: str, current_user: dict = Depends(get_current_user)):
        """Get review highlights (most helpful, recent, critical) for a product."""
        try:
            query = {"product_id": product_id, "status": "approved"}
            most_helpful = await db.reviews.find(query, {"_id": 0}).sort("helpful_count", -1).limit(1).to_list(1)
            most_recent = await db.reviews.find(query, {"_id": 0}).sort("created_at", -1).limit(1).to_list(1)
            most_critical = await db.reviews.find({**query, "rating": {"$lte": 2}}, {"_id": 0}).sort("created_at", -1).limit(1).to_list(1)
            most_positive = await db.reviews.find({**query, "rating": {"$gte": 4}}, {"_id": 0}).sort("created_at", -1).limit(1).to_list(1)
            return {
                "product_id": product_id,
                "most_helpful": most_helpful[0] if most_helpful else None,
                "most_recent": most_recent[0] if most_recent else None,
                "most_critical": most_critical[0] if most_critical else None,
                "most_positive": most_positive[0] if most_positive else None,
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/widget/product/{product_id}", response_model=Dict[str, Any])
    async def get_review_widget(product_id: str, current_user: dict = Depends(get_current_user)):
        """Compact review widget data for product pages."""
        try:
            summary = await db.product_ratings.find_one({"product_id": product_id}, {"_id": 0})
            recent = await db.reviews.find(
                {"product_id": product_id, "status": "approved"},
                {"_id": 0, "id": 1, "user_name": 1, "rating": 1, "title": 1, "body": 1, "created_at": 1, "helpful_count": 1, "reply": 1},
            ).sort("created_at", -1).limit(3).to_list(3)
            return {
                "product_id": product_id,
                "average_rating": summary.get("average_rating", 0) if summary else 0,
                "total_reviews": summary.get("total_reviews", 0) if summary else 0,
                "distribution": summary.get("distribution", {}) if summary else {},
                "recent_reviews": recent,
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 10. REVIEW REQUESTS (2 endpoints)
    # ═══════════════════════════════════════════════════════

    @router.post("/request/send", response_model=Dict[str, Any])
    async def send_review_request(order_id: str = Body(...), product_ids: List[str] = Body(...), current_user: dict = Depends(get_current_user)):
        """Send review request to customer after order delivery."""
        try:
            request_id = str(uuid.uuid4())
            doc = {
                "id": request_id,
                "order_id": order_id,
                "product_ids": product_ids,
                "requested_by": current_user.get("id", ""),
                "status": "sent",
                "created_at": now_iso(),
            }
            await db.review_requests.insert_one(doc)
            doc.pop("_id", None)
            notif_id = str(uuid.uuid4())
            await db.notifications.insert_one({
                "id": notif_id,
                "user_id": current_user.get("id", ""),
                "type": "system",
                "title": "طلب مراجعة",
                "message": f"تم طلب مراجعتك للطلبية {order_id}",
                "link": f"/reviews/write?order={order_id}",
                "read": False,
                "created_at": now_iso(),
            })
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/request/list", response_model=Dict[str, Any])
    async def list_review_requests(
        status: Optional[str] = None,
        page: int = Query(1, ge=1),
        limit: int = Query(50, ge=1, le=100),
        current_user: dict = Depends(get_current_user),
    ):
        """List review requests sent."""
        try:
            query = {}
            if status:
                query["status"] = status
            skip, _ = paginate(page, limit)
            total = await db.review_requests.count_documents(query)
            items = await db.review_requests.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"requests": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 11. REVIEW COMPARISON (1 endpoint)
    # ═══════════════════════════════════════════════════════

    @router.post("/compare", response_model=Dict[str, Any])
    async def compare_product_reviews(product_ids: List[str] = Body(...), current_user: dict = Depends(get_current_user)):
        """Compare reviews across multiple products."""
        try:
            results = []
            for pid in product_ids[:10]:
                summary = await db.product_ratings.find_one({"product_id": pid}, {"_id": 0})
                total = await db.reviews.count_documents({"product_id": pid, "status": "approved"})
                results.append({
                    "product_id": pid,
                    "average_rating": summary.get("average_rating", 0) if summary else 0,
                    "total_reviews": total,
                    "distribution": summary.get("distribution", {}) if summary else {},
                })
            return {"comparison": results}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 12. SENTIMENT OVERVIEW (1 endpoint)
    # ═══════════════════════════════════════════════════════

    @router.get("/analytics/sentiment", response_model=Dict[str, Any])
    async def get_sentiment_overview(current_user: dict = Depends(get_current_user)):
        """Get sentiment distribution across all reviews."""
        try:
            positive = await db.reviews.count_documents({"status": "approved", "rating": {"$gte": 4}})
            neutral = await db.reviews.count_documents({"status": "approved", "rating": 3})
            negative = await db.reviews.count_documents({"status": "approved", "rating": {"$lte": 2}})
            total = positive + neutral + negative
            return {
                "positive": positive,
                "neutral": neutral,
                "negative": negative,
                "total": total,
                "percentages": {
                    "positive": round(positive / total * 100, 1) if total else 0,
                    "neutral": round(neutral / total * 100, 1) if total else 0,
                    "negative": round(negative / total * 100, 1) if total else 0,
                }
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 13. REVIEW EXPORT (1 endpoint)
    # ═══════════════════════════════════════════════════════

    @router.get("/admin/export", response_model=Dict[str, Any])
    async def export_reviews(
        product_id: Optional[str] = None,
        status: Optional[str] = None,
        format: str = Query("json"),
        current_user: dict = Depends(get_current_user),
    ):
        """Export reviews data."""
        try:
            query = {}
            if product_id:
                query["product_id"] = product_id
            if status:
                query["status"] = status
            items = await db.reviews.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
            return {
                "format": format,
                "count": len(items),
                "reviews": items,
                "exported_at": now_iso(),
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 14. PRODUCT REVIEW SUMMARY (2 endpoints)
    # ═══════════════════════════════════════════════════════

    @router.get("/product/{product_id}/pros-cons", response_model=Dict[str, Any])
    async def get_product_pros_cons(product_id: str, current_user: dict = Depends(get_current_user)):
        """Aggregate pros and cons for a product from reviews."""
        try:
            pipeline = [
                {"$match": {"product_id": product_id, "status": "approved", "pros": {"$exists": True, "$ne": None}}},
                {"$group": {"_id": "$pros", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 20},
            ]
            pros = await db.reviews.aggregate(pipeline).to_list(None)
            cons_pipeline = [
                {"$match": {"product_id": product_id, "status": "approved", "cons": {"$exists": True, "$ne": None}}},
                {"$group": {"_id": "$cons", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 20},
            ]
            cons = await db.reviews.aggregate(cons_pipeline).to_list(None)
            return {
                "product_id": product_id,
                "pros": [{"text": p["_id"], "count": p["count"]} for p in pros],
                "cons": [{"text": c["_id"], "count": c["count"]} for c in cons],
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/search", response_model=Dict[str, Any])
    async def search_reviews(
        q: str = Query(..., min_length=2),
        product_id: Optional[str] = None,
        page: int = Query(1, ge=1),
        limit: int = Query(20, ge=1, le=100),
        current_user: dict = Depends(get_current_user),
    ):
        """Search reviews by keyword in body/title."""
        try:
            query = {
                "status": "approved",
                "$or": [
                    {"body": {"$regex": q, "$options": "i"}},
                    {"title": {"$regex": q, "$options": "i"}},
                ],
            }
            if product_id:
                query["product_id"] = product_id
            skip, _ = paginate(page, limit)
            total = await db.reviews.count_documents(query)
            items = await db.reviews.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"reviews": items, "total": total, "page": page, "limit": limit, "query": q}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ═══════════════════════════════════════════════════════
    # 15. REVIEW PHOTOS (1 endpoint)
    # ═══════════════════════════════════════════════════════

    @router.get("/product/{product_id}/photos", response_model=Dict[str, Any])
    async def get_review_photos(product_id: str, current_user: dict = Depends(get_current_user)):
        """Get all customer photos from reviews for a product."""
        try:
            pipeline = [
                {"$match": {"product_id": product_id, "status": "approved", "images": {"$exists": True, "$ne": []}}},
                {"$project": {"_id": 0, "id": 1, "images": 1, "user_name": 1, "rating": 1, "created_at": 1}},
                {"$sort": {"created_at": -1}},
                {"$limit": 50},
            ]
            items = await db.reviews.aggregate(pipeline).to_list(None)
            all_photos = []
            for item in items:
                for img in item.get("images", []):
                    all_photos.append({
                        "url": img,
                        "review_id": item["id"],
                        "user_name": item["user_name"],
                        "rating": item["rating"],
                        "created_at": item["created_at"],
                    })
            return {"product_id": product_id, "photos": all_photos, "total_photos": len(all_photos)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    return router
