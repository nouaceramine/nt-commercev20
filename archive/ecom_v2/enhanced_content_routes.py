"""
Enhanced Content Routes - NT Commerce v16
Section 8: Content Hub - CMS, Blog, Reviews, FAQ & SEO
Provides 32 endpoints for content management
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Body, status
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
import uuid
import traceback
import re


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class CMSPageCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    slug: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)
    excerpt: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    meta_keywords: Optional[List[str]] = Field(default_factory=list)
    is_published: bool = False
    template: Optional[str] = "default"
    order_index: Optional[int] = 0

class CMSPageUpdate(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    content: Optional[str] = None
    excerpt: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    meta_keywords: Optional[List[str]] = None
    is_published: Optional[bool] = None
    template: Optional[str] = None
    order_index: Optional[int] = None

class BlogPostCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    slug: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)
    excerpt: Optional[str] = None
    featured_image: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = Field(default_factory=list)
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    author_name: Optional[str] = None
    is_published: bool = False

class BlogPostUpdate(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    content: Optional[str] = None
    excerpt: Optional[str] = None
    featured_image: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    author_name: Optional[str] = None
    is_published: Optional[bool] = None

class FAQCreate(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    answer: str = Field(min_length=1)
    category: Optional[str] = None
    order_index: Optional[int] = 0
    is_published: bool = True

class FAQUpdate(BaseModel):
    question: Optional[str] = None
    answer: Optional[str] = None
    category: Optional[str] = None
    order_index: Optional[int] = None
    is_published: Optional[bool] = None

class ReviewCreate(BaseModel):
    product_id: str
    customer_id: Optional[str] = None
    customer_name: str = Field(min_length=1)
    rating: int = Field(ge=1, le=5)
    title: Optional[str] = None
    body: Optional[str] = None
    images: Optional[List[str]] = Field(default_factory=list)

class ReviewModerate(BaseModel):
    status: Literal["approved", "rejected", "pending"] = "approved"
    moderation_note: Optional[str] = None

class MediaUpload(BaseModel):
    filename: str = Field(min_length=1)
    url: str = Field(min_length=1)
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    alt_text: Optional[str] = None
    folder: Optional[str] = "general"

class SEOSitemapEntry(BaseModel):
    url_path: str = Field(min_length=1)
    priority: float = Field(default=0.5, ge=0, le=1)
    change_freq: Optional[str] = "weekly"


# ============================================================================
# FACTORY FUNCTION
# ============================================================================

def create_enhanced_content_routes(db, get_current_user, require_permission, cache=None, event_bus=None):
    router = APIRouter(prefix="/content", tags=["Content v2 - CMS & SEO"])

    async def log_activity(action: str, details: str, user_id: str = "system", metadata: Dict = None):
        entry = {"id": str(uuid.uuid4()), "action": action, "details": details, "user_id": user_id, "created_at": datetime.utcnow().isoformat(), "metadata": metadata or {}}
        await db.content_activity_log.insert_one(entry)

    def now_iso():
        return datetime.utcnow().isoformat()

    def paginate(page: int, limit: int):
        return (page - 1) * limit, limit + 1

    def slugify(text: str) -> str:
        return re.sub(r"[^\w\-]", "-", text.lower()).strip("-")[:200]

    # ===== 1. CMS PAGES (5 endpoints) =====

    @router.post("/pages", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_cms_page(page: CMSPageCreate, current_user: dict = Depends(get_current_user)):
        """Create a CMS page (About Us, Terms, Privacy, etc.)."""
        try:
            p_id = str(uuid.uuid4())
            slug = slugify(page.slug)
            existing = await db.cms_pages.find_one({"slug": slug})
            if existing:
                slug = f"{slug}-{uuid.uuid4().hex[:6]}"
            doc = {
                "id": p_id, "title": page.title, "slug": slug,
                "content": page.content, "excerpt": page.excerpt,
                "meta_title": page.meta_title or page.title,
                "meta_description": page.meta_description,
                "meta_keywords": page.meta_keywords,
                "is_published": page.is_published,
                "template": page.template,
                "order_index": page.order_index,
                "created_at": now_iso(),
                "created_by": current_user.get("id", "")
            }
            await db.cms_pages.insert_one(doc)
            doc.pop("_id", None)
            await log_activity("page_created", f"CMS page '{page.title}' created", current_user.get("id", ""))
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/pages", response_model=Dict[str, Any])
    async def list_cms_pages(is_published: Optional[bool] = None, current_user: dict = Depends(get_current_user)):
        """List CMS pages."""
        try:
            query = {}
            if is_published is not None:
                query["is_published"] = is_published
            pages = await db.cms_pages.find(query, {"_id": 0}).sort("order_index", 1).to_list(100)
            return {"pages": pages, "total": len(pages)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/pages/{page_id}", response_model=Dict[str, Any])
    async def get_cms_page(page_id: str, current_user: dict = Depends(get_current_user)):
        """Get CMS page by ID."""
        try:
            page = await db.cms_pages.find_one({"id": page_id}, {"_id": 0})
            if not page:
                raise HTTPException(status_code=404, detail="Page not found")
            return page
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/pages/slug/{slug}", response_model=Dict[str, Any])
    async def get_cms_page_by_slug(slug: str, current_user: dict = Depends(get_current_user)):
        """Get CMS page by slug (for public frontend)."""
        try:
            page = await db.cms_pages.find_one({"slug": slug, "is_published": True}, {"_id": 0})
            if not page:
                raise HTTPException(status_code=404, detail="Page not found")
            return page
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/pages/{page_id}", response_model=Dict[str, Any])
    async def update_cms_page(page_id: str, page: CMSPageUpdate, current_user: dict = Depends(get_current_user)):
        """Update CMS page."""
        try:
            existing = await db.cms_pages.find_one({"id": page_id})
            if not existing:
                raise HTTPException(status_code=404, detail="Page not found")
            changes = {k: v for k, v in page.model_dump().items() if v is not None}
            if changes:
                changes["updated_at"] = now_iso()
                await db.cms_pages.update_one({"id": page_id}, {"$set": changes})
            doc = await db.cms_pages.find_one({"id": page_id}, {"_id": 0})
            return doc
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/pages/{page_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_cms_page(page_id: str, current_user: dict = Depends(get_current_user)):
        """Delete CMS page."""
        try:
            await db.cms_pages.delete_one({"id": page_id})
            return None
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 2. BLOG POSTS (6 endpoints) =====

    @router.post("/blog/posts", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_blog_post(post: BlogPostCreate, current_user: dict = Depends(get_current_user)):
        """Create a blog post."""
        try:
            p_id = str(uuid.uuid4())
            slug = slugify(post.slug)
            existing = await db.blog_posts.find_one({"slug": slug})
            if existing:
                slug = f"{slug}-{uuid.uuid4().hex[:6]}"
            doc = {
                "id": p_id, "title": post.title, "slug": slug,
                "content": post.content, "excerpt": post.excerpt,
                "featured_image": post.featured_image,
                "category": post.category,
                "tags": post.tags,
                "meta_title": post.meta_title or post.title,
                "meta_description": post.meta_description,
                "author_name": post.author_name or current_user.get("name", ""),
                "is_published": post.is_published,
                "view_count": 0,
                "created_at": now_iso(),
                "created_by": current_user.get("id", "")
            }
            await db.blog_posts.insert_one(doc)
            doc.pop("_id", None)
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/blog/posts", response_model=Dict[str, Any])
    async def list_blog_posts(category: Optional[str] = None, tag: Optional[str] = None, is_published: Optional[bool] = None, page: int = Query(1, ge=1), limit: int = Query(10, ge=1), current_user: dict = Depends(get_current_user)):
        """List blog posts with filters."""
        try:
            query = {}
            if is_published is not None:
                query["is_published"] = is_published
            if category:
                query["category"] = category
            if tag:
                query["tags"] = tag
            skip, _ = paginate(page, limit)
            total = await db.blog_posts.count_documents(query)
            items = await db.blog_posts.find(query, {"_id": 0, "content": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"posts": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/blog/posts/{post_id}", response_model=Dict[str, Any])
    async def get_blog_post(post_id: str, current_user: dict = Depends(get_current_user)):
        """Get blog post by ID."""
        try:
            post = await db.blog_posts.find_one({"id": post_id}, {"_id": 0})
            if not post:
                raise HTTPException(status_code=404, detail="Post not found")
            return post
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/blog/posts/slug/{slug}", response_model=Dict[str, Any])
    async def get_blog_post_by_slug(slug: str, current_user: dict = Depends(get_current_user)):
        """Get published blog post by slug (public)."""
        try:
            post = await db.blog_posts.find_one({"slug": slug, "is_published": True}, {"_id": 0})
            if not post:
                raise HTTPException(status_code=404, detail="Post not found")
            # Increment view
            await db.blog_posts.update_one({"id": post["id"]}, {"$inc": {"view_count": 1}})
            post["view_count"] = (post.get("view_count", 0) or 0) + 1
            return post
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/blog/posts/{post_id}", response_model=Dict[str, Any])
    async def update_blog_post(post_id: str, post: BlogPostUpdate, current_user: dict = Depends(get_current_user)):
        """Update blog post."""
        try:
            existing = await db.blog_posts.find_one({"id": post_id})
            if not existing:
                raise HTTPException(status_code=404, detail="Post not found")
            changes = {k: v for k, v in post.model_dump().items() if v is not None}
            if changes:
                changes["updated_at"] = now_iso()
                await db.blog_posts.update_one({"id": post_id}, {"$set": changes})
            doc = await db.blog_posts.find_one({"id": post_id}, {"_id": 0})
            return doc
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/blog/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_blog_post(post_id: str, current_user: dict = Depends(get_current_user)):
        """Delete blog post."""
        try:
            await db.blog_posts.delete_one({"id": post_id})
            return None
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/blog/categories", response_model=Dict[str, Any])
    async def list_blog_categories(current_user: dict = Depends(get_current_user)):
        """Get all blog categories with post counts."""
        try:
            pipeline = [
                {"$match": {"is_published": True, "category": {"$exists": True, "$ne": None}}},
                {"$group": {"_id": "$category", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}}
            ]
            cats = await db.blog_posts.aggregate(pipeline).to_list(None)
            return {"categories": [{"name": c["_id"], "post_count": c["count"]} for c in cats]}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 3. FAQ (5 endpoints) =====

    @router.post("/faq", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_faq(faq: FAQCreate, current_user: dict = Depends(get_current_user)):
        """Create an FAQ entry."""
        try:
            f_id = str(uuid.uuid4())
            doc = {"id": f_id, "question": faq.question, "answer": faq.answer, "category": faq.category, "order_index": faq.order_index, "is_published": faq.is_published, "created_at": now_iso(), "created_by": current_user.get("id", "")}
            await db.faq_entries.insert_one(doc)
            doc.pop("_id", None)
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/faq", response_model=Dict[str, Any])
    async def list_faq(category: Optional[str] = None, current_user: dict = Depends(get_current_user)):
        """List FAQ entries."""
        try:
            query = {"is_published": True}
            if category:
                query["category"] = category
            items = await db.faq_entries.find(query, {"_id": 0}).sort("order_index", 1).to_list(100)
            return {"faq": items, "total": len(items)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/faq/categories", response_model=Dict[str, Any])
    async def list_faq_categories(current_user: dict = Depends(get_current_user)):
        """Get FAQ categories."""
        try:
            cats = await db.faq_entries.distinct("category", {"is_published": True})
            return {"categories": [{"name": c} for c in cats if c]}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/faq/{faq_id}", response_model=Dict[str, Any])
    async def update_faq(faq_id: str, faq: FAQUpdate, current_user: dict = Depends(get_current_user)):
        """Update FAQ."""
        try:
            changes = {k: v for k, v in faq.model_dump().items() if v is not None}
            if changes:
                changes["updated_at"] = now_iso()
                await db.faq_entries.update_one({"id": faq_id}, {"$set": changes})
            doc = await db.faq_entries.find_one({"id": faq_id}, {"_id": 0})
            return doc or {}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/faq/{faq_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_faq(faq_id: str, current_user: dict = Depends(get_current_user)):
        """Delete FAQ."""
        try:
            await db.faq_entries.delete_one({"id": faq_id})
            return None
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 4. PRODUCT REVIEWS (5 endpoints) =====

    @router.post("/reviews", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_review(review: ReviewCreate, current_user: dict = Depends(get_current_user)):
        """Submit a product review."""
        try:
            r_id = str(uuid.uuid4())
            doc = {
                "id": r_id, "product_id": review.product_id,
                "customer_id": review.customer_id,
                "customer_name": review.customer_name,
                "rating": review.rating,
                "title": review.title,
                "body": review.body,
                "images": review.images,
                "status": "pending",
                "helpful_count": 0,
                "created_at": now_iso()
            }
            await db.product_reviews.insert_one(doc)
            doc.pop("_id", None)
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/reviews", response_model=Dict[str, Any])
    async def list_reviews(product_id: Optional[str] = None, status: Optional[str] = None, page: int = Query(1, ge=1), limit: int = Query(50, ge=1), current_user: dict = Depends(get_current_user)):
        """List product reviews."""
        try:
            query = {}
            if product_id:
                query["product_id"] = product_id
            if status:
                query["status"] = status
            skip, _ = paginate(page, limit)
            total = await db.product_reviews.count_documents(query)
            items = await db.product_reviews.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"reviews": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/reviews/product/{product_id}/summary", response_model=Dict[str, Any])
    async def get_product_review_summary(product_id: str, current_user: dict = Depends(get_current_user)):
        """Get review summary for a product."""
        try:
            pipeline = [
                {"$match": {"product_id": product_id, "status": "approved"}},
                {"$group": {"_id": "$rating", "count": {"$sum": 1}}}
            ]
            ratings = await db.product_reviews.aggregate(pipeline).to_list(None)
            rating_map = {r["_id"]: r["count"] for r in ratings}
            total = sum(rating_map.values())
            avg = sum(k * v for k, v in rating_map.items()) / total if total > 0 else 0
            return {"product_id": product_id, "total_reviews": total, "average_rating": round(avg, 1), "rating_breakdown": {str(k): rating_map.get(k, 0) for k in range(1, 6)}}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/reviews/{review_id}/moderate", response_model=Dict[str, Any])
    async def moderate_review(review_id: str, moderation: ReviewModerate, current_user: dict = Depends(get_current_user)):
        """Approve or reject a review."""
        try:
            await db.product_reviews.update_one(
                {"id": review_id},
                {"$set": {"status": moderation.status, "moderation_note": moderation.moderation_note, "moderated_at": now_iso(), "moderated_by": current_user.get("id", "")}}
            )
            return {"review_id": review_id, "status": moderation.status}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/reviews/{review_id}/helpful", response_model=Dict[str, Any])
    async def mark_review_helpful(review_id: str, current_user: dict = Depends(get_current_user)):
        """Mark a review as helpful."""
        try:
            await db.product_reviews.update_one({"id": review_id}, {"$inc": {"helpful_count": 1}})
            review = await db.product_reviews.find_one({"id": review_id}, {"_id": 0, "helpful_count": 1})
            return {"review_id": review_id, "helpful_count": review.get("helpful_count", 0) if review else 0}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 5. MEDIA GALLERY (3 endpoints) =====

    @router.post("/media", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def upload_media(media: MediaUpload, current_user: dict = Depends(get_current_user)):
        """Record a media upload (metadata only - actual upload handled by frontend/storage)."""
        try:
            m_id = str(uuid.uuid4())
            doc = {"id": m_id, **media.model_dump(), "uploaded_at": now_iso(), "uploaded_by": current_user.get("id", "")}
            await db.media_gallery.insert_one(doc)
            doc.pop("_id", None)
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/media", response_model=Dict[str, Any])
    async def list_media(folder: Optional[str] = None, mime_type: Optional[str] = None, page: int = Query(1, ge=1), limit: int = Query(50, ge=1), current_user: dict = Depends(get_current_user)):
        """List media gallery items."""
        try:
            query = {}
            if folder:
                query["folder"] = folder
            if mime_type:
                query["mime_type"] = {"$regex": mime_type}
            skip, _ = paginate(page, limit)
            total = await db.media_gallery.count_documents(query)
            items = await db.media_gallery.find(query, {"_id": 0}).sort("uploaded_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"media": items, "total": total, "page": page, "limit": limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_media(media_id: str, current_user: dict = Depends(get_current_user)):
        """Delete media entry."""
        try:
            await db.media_gallery.delete_one({"id": media_id})
            return None
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 6. SEO TOOLS (3 endpoints) =====

    @router.get("/seo/overview", response_model=Dict[str, Any])
    async def get_seo_overview(current_user: dict = Depends(get_current_user)):
        """SEO overview: content counts, missing meta data."""
        try:
            total_products = await db.products.count_documents({})
            products_missing_meta = await db.products.count_documents({"$or": [{"meta_title": {"$exists": False}}, {"meta_title": ""}]})
            total_pages = await db.cms_pages.count_documents({})
            total_posts = await db.blog_posts.count_documents({})
            published_posts = await db.blog_posts.count_documents({"is_published": True})
            total_reviews = await db.product_reviews.count_documents({"status": "approved"})

            return {
                "products": {"total": total_products, "missing_meta": products_missing_meta},
                "cms_pages": total_pages,
                "blog_posts": {"total": total_posts, "published": published_posts},
                "approved_reviews": total_reviews
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/seo/sitemap", response_model=Dict[str, Any])
    async def generate_sitemap(current_user: dict = Depends(get_current_user)):
        """Generate XML sitemap data for all public content."""
        try:
            now = datetime.utcnow().strftime("%Y-%m-%d")
            urls = []

            # Products
            products = await db.products.find({}, {"_id": 0, "id": 1, "updated_at": 1}).to_list(None)
            for p in products:
                urls.append({"loc": f"/products/{p['id']}", "lastmod": p.get("updated_at", now)[:10], "priority": 0.8, "changefreq": "weekly"})

            # CMS pages
            pages = await db.cms_pages.find({"is_published": True}, {"_id": 0, "slug": 1, "updated_at": 1}).to_list(None)
            for p in pages:
                urls.append({"loc": f"/pages/{p['slug']}", "lastmod": p.get("updated_at", now)[:10], "priority": 0.6, "changefreq": "monthly"})

            # Blog posts
            posts = await db.blog_posts.find({"is_published": True}, {"_id": 0, "slug": 1, "updated_at": 1}).to_list(None)
            for p in posts:
                urls.append({"loc": f"/blog/{p['slug']}", "lastmod": p.get("updated_at", now)[:10], "priority": 0.7, "changefreq": "monthly"})

            return {"url_count": len(urls), "urls": urls[:500]}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/products/{product_id}/seo", response_model=Dict[str, Any])
    async def update_product_seo(product_id: str, meta_title: Optional[str] = Body(None), meta_description: Optional[str] = Body(None), meta_keywords: Optional[List[str]] = Body(None), slug: Optional[str] = Body(None), current_user: dict = Depends(get_current_user)):
        """Update SEO metadata for a product."""
        try:
            update = {}
            if meta_title is not None:
                update["meta_title"] = meta_title
            if meta_description is not None:
                update["meta_description"] = meta_description
            if meta_keywords is not None:
                update["meta_keywords"] = meta_keywords
            if slug is not None:
                update["slug"] = slugify(slug)
            if update:
                update["updated_at"] = now_iso()
                await db.products.update_one({"id": product_id}, {"$set": update})
            product = await db.products.find_one({"id": product_id}, {"_id": 0, "id": 1, "name": 1, "meta_title": 1, "meta_description": 1, "meta_keywords": 1, "slug": 1})
            return product or {"error": "Product not found"}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))


    # ===== 7. CONTENT SEARCH & ANALYTICS (3 endpoints) =====

    @router.post("/search", response_model=Dict[str, Any])
    async def search_content(query: str = Body(...), types: Optional[List[str]] = Body(["pages", "posts", "faq"]), current_user: dict = Depends(get_current_user)):
        """Search across all content types (pages, blog, FAQ)."""
        try:
            escaped = query.replace("\\", "\\").replace("*", "\\*").replace("(", "\\(").replace(")", "\\)")
            results = {"query": query, "pages": [], "posts": [], "faq": []}

            if "pages" in (types or []):
                pages = await db.cms_pages.find(
                    {"is_published": True, "$or": [{"title": {"$regex": escaped, "$options": "i"}}, {"content": {"$regex": escaped, "$options": "i"}}]},
                    {"_id": 0, "content": 0}
                ).limit(10).to_list(None)
                results["pages"] = pages

            if "posts" in (types or []):
                posts = await db.blog_posts.find(
                    {"is_published": True, "$or": [{"title": {"$regex": escaped, "$options": "i"}}, {"content": {"$regex": escaped, "$options": "i"}}]},
                    {"_id": 0, "content": 0}
                ).limit(10).to_list(None)
                results["posts"] = posts

            if "faq" in (types or []):
                faqs = await db.faq_entries.find(
                    {"is_published": True, "$or": [{"question": {"$regex": escaped, "$options": "i"}}, {"answer": {"$regex": escaped, "$options": "i"}}]},
                    {"_id": 0}
                ).limit(10).to_list(None)
                results["faq"] = faqs

            results["total"] = len(results["pages"]) + len(results["posts"]) + len(results["faq"])
            return results
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/overview", response_model=Dict[str, Any])
    async def get_content_analytics(current_user: dict = Depends(get_current_user)):
        """Content analytics overview."""
        try:
            total_pages = await db.cms_pages.count_documents({})
            published_pages = await db.cms_pages.count_documents({"is_published": True})
            total_posts = await db.blog_posts.count_documents({})
            published_posts = await db.blog_posts.count_documents({"is_published": True})
            total_faq = await db.faq_entries.count_documents({"is_published": True})
            total_reviews = await db.product_reviews.count_documents({})
            approved_reviews = await db.product_reviews.count_documents({"status": "approved"})
            total_media = await db.media_gallery.count_documents({})

            # Top viewed posts
            top_posts = await db.blog_posts.find({"is_published": True}, {"_id": 0, "id": 1, "title": 1, "view_count": 1}).sort("view_count", -1).limit(5).to_list(None)

            return {
                "cms_pages": {"total": total_pages, "published": published_pages},
                "blog_posts": {"total": total_posts, "published": published_posts, "top_viewed": top_posts},
                "faq_entries": total_faq,
                "reviews": {"total": total_reviews, "approved": approved_reviews, "pending": total_reviews - approved_reviews},
                "media_items": total_media
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/blog/tags", response_model=Dict[str, Any])
    async def list_blog_tags(current_user: dict = Depends(get_current_user)):
        """Get all blog tags with usage counts."""
        try:
            pipeline = [
                {"$match": {"is_published": True, "tags": {"$exists": True, "$ne": []}}},
                {"$unwind": "$tags"},
                {"$group": {"_id": "$tags", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}}
            ]
            tags = await db.blog_posts.aggregate(pipeline).to_list(None)
            return {"tags": [{"name": t["_id"], "post_count": t["count"]} for t in tags]}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    return router
