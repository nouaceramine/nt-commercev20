# Section 8: Content Hub - CMS & SEO Enhancement

## Overview

Content management module for NT Commerce v16. Provides CMS pages, blog, FAQ, product reviews, media gallery, and SEO tools.

## Files

- `backend/routes/ecom/enhanced_content_routes.py` - 32 endpoints, ~850 lines
- `backend/utils/enhanced_content_indexes.py` - MongoDB indexes (5 collections, 14 indexes)

## Endpoints

### CMS Pages (5 endpoints)
- `POST /api/v2/content/pages` - Create page
- `GET /api/v2/content/pages` - List pages
- `GET /api/v2/content/pages/{id}` - Get by ID
- `GET /api/v2/content/pages/slug/{slug}` - Public access by slug
- `PUT /api/v2/content/pages/{id}` - Update
- `DELETE /api/v2/content/pages/{id}` - Delete

### Blog Posts (7 endpoints)
- `POST /api/v2/content/blog/posts` - Create post
- `GET /api/v2/content/blog/posts` - List with filters (category, tag)
- `GET /api/v2/content/blog/posts/{id}` - Get by ID
- `GET /api/v2/content/blog/posts/slug/{slug}` - Public access (increments views)
- `PUT /api/v2/content/blog/posts/{id}` - Update
- `DELETE /api/v2/content/blog/posts/{id}` - Delete
- `GET /api/v2/content/blog/categories` - Category list with counts

### FAQ (5 endpoints)
- `POST /api/v2/content/faq` - Create FAQ
- `GET /api/v2/content/faq` - List (published)
- `GET /api/v2/content/faq/categories` - FAQ categories
- `PUT /api/v2/content/faq/{id}` - Update
- `DELETE /api/v2/content/faq/{id}` - Delete

### Product Reviews (5 endpoints)
- `POST /api/v2/content/reviews` - Submit review
- `GET /api/v2/content/reviews` - List with filters
- `GET /api/v2/content/reviews/product/{id}/summary` - Rating summary
- `PUT /api/v2/content/reviews/{id}/moderate` - Approve/reject
- `POST /api/v2/content/reviews/{id}/helpful` - Mark helpful

### Media Gallery (3 endpoints)
- `POST /api/v2/content/media` - Record upload
- `GET /api/v2/content/media` - List with folder filter
- `DELETE /api/v2/content/media/{id}` - Delete

### SEO Tools (3 endpoints)
- `GET /api/v2/content/seo/overview` - SEO dashboard
- `GET /api/v2/content/seo/sitemap` - Generate sitemap data
- `PUT /api/v2/content/products/{id}/seo` - Update product SEO meta

### Extras (4 endpoints)
- `POST /api/v2/content/search` - Cross-content search
- `GET /api/v2/content/analytics/overview` - Content analytics
- `GET /api/v2/content/blog/tags` - Tag cloud with counts

## Deployment

Built and deployed on VPS 168.231.81.154 as part of NT Commerce v16.
