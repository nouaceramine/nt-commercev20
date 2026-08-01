# Section 10: Reviews & Ratings Enhancement

## Overview
| Property | Value |
|----------|-------|
| Section | 10 - Reviews & Ratings (المراجعات والتقييمات) |
| File | `enhanced_reviews_routes.py` |
| Endpoints | **32** |
| Collections | 5 (reviews, product_ratings, review_votes, review_reports, review_requests) |
| Indexes | 16 across 5 collections |
| Prefix | `/api/v2/reviews` |
| Status | Deployed & Active |

---

## Collections

### 1. `reviews` - Core review storage
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| product_id | str | Product being reviewed |
| order_id | str | Order reference (verified purchase) |
| user_id | str | Reviewer user ID |
| user_name | str | Display name or Anonymous |
| rating | int | 1-5 stars |
| title | str | Review title (optional) |
| body | str | Review text |
| pros | str | Positive points |
| cons | str | Negative points |
| images | list | Photo URLs |
| is_anonymous | bool | Anonymous review flag |
| status | str | pending, approved, rejected, deleted, flagged |
| helpful_count | int | Helpful votes |
| not_helpful_count | int | Not helpful votes |
| reply | str | Merchant reply |
| reply_by | str | Replier user ID |
| reply_at | str | Reply timestamp |
| moderated_by | str | Moderator user ID |
| moderation_note | str | Moderation reason |

### 2. `product_ratings` - Aggregated rating cache
| Field | Type | Description |
|-------|------|-------------|
| product_id | str | Unique product reference |
| average_rating | float | Calculated average (1-5) |
| total_reviews | int | Count of approved reviews |
| distribution | dict | Count per star rating (1-5) |

### 3. `review_votes` - Helpful vote tracking
| Field | Type | Description |
|-------|------|-------------|
| id | str | Composite: `{review_id}_{user_id}` |
| review_id | str | Voted review |
| user_id | str | Voter |
| helpful | bool | True=helpful, False=not helpful |

### 4. `review_reports` - Abuse reports
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| review_id | str | Reported review |
| reported_by | str | Reporter user ID |
| reason | str | Report reason |
| details | str | Additional details |
| status | str | open, resolved, dismissed |

### 5. `review_requests` - Post-purchase review invitations
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| order_id | str | Target order |
| product_ids | list | Products to review |
| requested_by | str | Merchant user ID |
| status | str | sent, completed |

---

## API Endpoints (32)

### 1. Review CRUD (7)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v2/reviews/` | Submit new review (prevents duplicate per user+product) |
| GET | `/api/v2/reviews/product/{id}` | Get approved reviews with sorting & rating filter |
| GET | `/api/v2/reviews/product/{id}/summary` | Quick rating summary |
| GET | `/api/v2/reviews/{id}` | Get single review |
| PUT | `/api/v2/reviews/{id}` | Update own review (resets to pending) |
| DELETE | `/api/v2/reviews/{id}` | Soft-delete own review |
| GET | `/api/v2/reviews/my/reviews` | Current user's reviews |

### 2. Review Replies (2)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v2/reviews/replies` | Reply to a review (merchant/admin) |
| DELETE | `/api/v2/reviews/{id}/reply` | Remove reply |

### 3. Helpful Votes (1)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v2/reviews/vote/helpful` | Vote helpful/not helpful (prevents duplicates) |

### 4. Reporting (1)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v2/reviews/report` | Report inappropriate review |

### 5. Moderation (4)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v2/reviews/moderation/queue` | Reviews awaiting moderation |
| PUT | `/api/v2/reviews/{id}/moderate` | Approve or reject a review |
| POST | `/api/v2/reviews/moderation/bulk` | Bulk approve/reject |
| GET | `/api/v2/reviews/moderation/stats` | Moderation dashboard stats |

### 6. Analytics (4)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v2/reviews/analytics/overview` | Total reviews, avg rating, top products, daily trend |
| GET | `/api/v2/reviews/analytics/products` | Product ranking by rating |
| GET | `/api/v2/reviews/analytics/customers` | Top reviewers leaderboard |
| GET | `/api/v2/reviews/analytics/rating-trends` | Daily average rating trends |

### 7. Admin (2)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v2/reviews/admin/all` | All reviews with filtering |
| GET | `/api/v2/reviews/admin/reports` | Review abuse reports |

### 8. Verified Purchase (1)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v2/reviews/product/{id}/verified` | Reviews with order_id only |

### 9. Highlights & Widget (2)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v2/reviews/product/{id}/highlights` | Most helpful, recent, critical, positive |
| GET | `/api/v2/reviews/widget/product/{id}` | Compact widget data for product pages |

### 10. Review Requests (2)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v2/reviews/request/send` | Send post-purchase review invitation |
| GET | `/api/v2/reviews/request/list` | List review requests |

### 11. Comparison (1)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v2/reviews/compare` | Compare ratings across products |

### 12. Sentiment (1)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v2/reviews/analytics/sentiment` | Positive/Neutral/Negative distribution |

### 13. Export (1)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v2/reviews/admin/export` | Export reviews (JSON/CSV) |

### 14. Pros & Cons + Search (2)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v2/reviews/product/{id}/pros-cons` | Aggregated pros/cons from reviews |
| GET | `/api/v2/reviews/search` | Search reviews by keyword |

### 15. Photos (1)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v2/reviews/product/{id}/photos` | All customer photos from reviews |

---

## Indexes (16)

### reviews
- `id` (unique)
- `product_id + status + created_at` (desc)
- `user_id + status`
- `status + created_at` (desc)
- `product_id + rating`

### product_ratings
- `product_id` (unique)
- `average_rating` (desc)

### review_votes
- `id` (unique, composite key)
- `review_id`

### review_reports
- `id` (unique)
- `review_id`
- `status + created_at` (desc)

### review_requests
- `id` (unique)
- `order_id`
- `status`

---

## Auto-Rating Calculation
When a review is created, approved, deleted, or updated, the system automatically recalculates:
- `average_rating` for the product
- `total_reviews` count
- `distribution` per star rating (1-5)

Results are cached in `product_ratings` collection for fast reads.

---

## Deployment Status
| Check | Status |
|-------|--------|
| Code written | OK |
| Syntax check | OK |
| Indexes created | OK |
| main.py updated | OK |
| Docker build | OK |
| Container healthy | OK |
| Endpoints responding | OK (HTTP 401 = auth protected) |
| GitHub synced | OK |

---

## Global Progress (Sections 1-10)
| Section | Module | Endpoints | Status |
|---------|--------|-----------|--------|
| 1 | Products | 32 | OK |
| 2 | Orders | 36 | OK |
| 3 | Customers | 30 | OK |
| 4 | Shipping | 29 | OK |
| 5 | Channels | 26 | OK |
| 6 | Leads | 32 | OK |
| 7 | Promotions | 32 | OK |
| 8 | Content | 32 | OK |
| 9 | Notifications | 32 | OK |
| 10 | Reviews | 32 | OK |
| **Total** | | **313 methods** | **250 paths** |

---

## Next Steps
Section 11: Inventory & Warehouse Management
- Stock levels tracking
- Warehouse management
- Stock transfers
- Inventory alerts
- Stock history
- Multi-warehouse support

**Completed: 10/30 sections (33%)**
