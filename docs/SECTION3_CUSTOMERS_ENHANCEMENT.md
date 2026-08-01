# Section 3: eCom CRM - Customer Management Enhancement

## Overview

This module provides 30 advanced endpoints for customer relationship management in NT Commerce v16. It extends the basic customer CRUD with unified profiles across all sales channels, segmentation, interaction tracking, RFM analysis, churn detection, and more.

## Files

- `backend/routes/ecom/enhanced_customers_routes.py` - 30 endpoints, ~1330 lines
- `backend/utils/enhanced_customers_indexes.py` - MongoDB indexes (4 collections, 11 indexes)

## Endpoints

### Customer Profile (1 endpoint)
- `GET /api/v2/customers/{customer_id}/profile` - Unified profile with cross-channel history, tier calculation, churn risk

### Customer Segments (5 endpoints)
- `POST /api/v2/customers/segments` - Create segment
- `GET /api/v2/customers/segments` - List segments with customer counts
- `GET /api/v2/customers/segments/{segment_id}` - Get segment with customers
- `PUT /api/v2/customers/segments/{segment_id}` - Update segment
- `DELETE /api/v2/customers/segments/{segment_id}` - Delete segment

### Customer Tags (3 endpoints)
- `POST /api/v2/customers/{customer_id}/tags` - Add tags
- `DELETE /api/v2/customers/{customer_id}/tags/{tag}` - Remove tag
- `GET /api/v2/customers/tags/list` - All tags with usage counts

### Customer Interactions & Timeline (3 endpoints)
- `POST /api/v2/customers/{customer_id}/interactions` - Log interaction (call/email/whatsapp/SMS/meeting/note/ticket/visit)
- `GET /api/v2/customers/{customer_id}/interactions` - List interactions
- `GET /api/v2/customers/{customer_id}/timeline` - Unified timeline (orders + POS sales + interactions + payments)

### Customer Merge (1 endpoint)
- `POST /api/v2/customers/merge` - Merge duplicates, transfers all data

### Customer Analytics (5 endpoints)
- `GET /api/v2/customers/analytics/overview` - Dashboard overview
- `GET /api/v2/customers/{customer_id}/analytics` - Individual customer analytics
- `GET /api/v2/customers/analytics/rfm` - RFM analysis (Recency/Frequency/Monetary)
- `GET /api/v2/customers/analytics/churn-risk` - Churn risk detection
- `GET /api/v2/customers/analytics/segments` - Segment performance analytics

### Customer Wishlist (3 endpoints)
- `POST /api/v2/customers/{customer_id}/wishlist` - Add item
- `GET /api/v2/customers/{customer_id}/wishlist` - List items
- `DELETE /api/v2/customers/{customer_id}/wishlist/{product_id}` - Remove item

### Customer Address Book (5 endpoints)
- `POST /api/v2/customers/{customer_id}/addresses` - Add address
- `GET /api/v2/customers/{customer_id}/addresses` - List addresses
- `PUT /api/v2/customers/{customer_id}/addresses/{address_id}` - Update address
- `DELETE /api/v2/customers/{customer_id}/addresses/{address_id}` - Delete address
- `POST /api/v2/customers/{customer_id}/addresses/{address_id}/default` - Set default

### Bulk Operations (2 endpoints)
- `POST /api/v2/customers/bulk/tag` - Bulk add/remove/replace tags
- `POST /api/v2/customers/bulk/segment` - Bulk assign/remove segment

### Search & Discovery (2 endpoints)
- `POST /api/v2/customers/search/advanced` - Advanced search with filters
- `GET /api/v2/customers/duplicates/find` - Find duplicate customers

## Database Collections

- `customer_segments` - Customer segments/groups
- `customer_interactions` - Interaction log
- `customer_wishlists` - Wishlist items
- `customer_addresses` - Address book entries

## Customer Tier Logic

- `vip` - Total revenue > 100,000 DZD
- `gold` - Total revenue > 50,000 DZD
- `silver` - Total revenue > 20,000 DZD
- `bronze` - Has orders, revenue <= 20,000 DZD
- `new` - No orders yet

## Churn Risk Scoring

- `critical` - No order in 90+ days
- `high` - No order in 60-90 days
- `medium` - No order in 30-60 days
- `low` - Ordered within 30 days

## RFM Segments

- `champions` - R>=4, F>=4, M>=4
- `loyal` - R>=3, F>=3, M>=3
- `new` - R>=4, F<=2
- `at_risk` - R<=2, F>=3, M>=3
- `hibernating` - R<=2, F<=2, M>=3
- `no_purchases` - No transactions
- `others` - Everything else

## Integration Notes

- All endpoints use the same Factory Pattern: `create_enhanced_customers_routes(db, get_current_user, require_permission)`
- Tenant isolation via the shared `db` proxy (ContextVar-based)
- Event bus integration for `customer.activity` events
- Compatible with existing `customers_routes.py` (basic CRUD)
- Reads from existing `db.customers`, `db.ecom_orders`, `db.sales`, `db.debt_payments` collections

## Deployment

Built and deployed on VPS 168.231.81.154 as part of NT Commerce v16.
