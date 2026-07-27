# NT Commerce v16 - Enhanced Modules Documentation

## Overview

This branch contains 68 new API endpoints across 2 enhanced modules:

| Module | Section | File | Endpoints |
|--------|---------|------|-----------|
| **Products** | Section 1 | `enhanced_products_routes.py` | 32 |
| **Orders** | Section 2 | `enhanced_orders_routes.py` | 36 |
| **Total** | | | **68** |

---

## Quick Setup

### 1. Install Files

Files are already in `backend/routes/ecom/`. Just register them in `main.py`:

```python
from routes.ecom.enhanced_products_routes import create_enhanced_products_routes
from routes.ecom.enhanced_orders_routes import create_enhanced_orders_routes
from utils.enhanced_indexes import create_all_enhanced_indexes

# Register routes
enhanced_products_router = create_enhanced_products_routes(
    db=db, get_current_user=get_current_user, require_permission=require_permission
)
app.include_router(enhanced_products_router, prefix="/api/v2")

enhanced_orders_router = create_enhanced_orders_routes(
    db=db, get_current_user=get_current_user, require_permission=require_permission
)
app.include_router(enhanced_orders_router, prefix="/api/v2")

# Create indexes on startup
@app.on_event("startup")
async def startup():
    await create_all_enhanced_indexes(db)
```

### 2. Create MongoDB Indexes

```python
from utils.enhanced_indexes import create_all_enhanced_indexes
await create_all_enhanced_indexes(db)
```

### 3. New Collections Created

**Products:**
- `product_variants` - Product variants (color, size, etc.)
- `product_bundles` - Product bundles
- `product_reviews` - Customer reviews
- `product_tags` - Product tags
- `stock_movements` - Stock movement tracking
- `product_audit_log` - Audit log
- `related_products` - Related/cross-sell products
- `product_promotions` - Promotions & discounts
- `price_history` - Price change history

**Orders:**
- `order_templates` - Order templates
- `order_timelines` - Activity timeline
- `order_refunds` - Refund records
- `delivery_schedules` - Delivery scheduling
- `order_returns` - Return/exchange requests
- `automation_rules` - Workflow automation

---

## Section 1: Products (32 endpoints)

### Product Variants (5)
- `POST /api/v2/products/{id}/variants` - Create variant
- `GET /api/v2/products/{id}/variants` - List variants
- `PUT /api/v2/products/{id}/variants/{vid}` - Update variant
- `DELETE /api/v2/products/{id}/variants/{vid}` - Delete variant
- `GET /api/v2/products/{id}/variants/{vid}/stock-history` - Stock history

### Product Bundles (3)
- `POST /api/v2/products/bundles` - Create bundle
- `GET /api/v2/products/bundles` - List bundles
- `GET /api/v2/products/bundles/{id}` - Get bundle

### Bulk Operations (3)
- `POST /api/v2/products/bulk/price-update` - Bulk price update
- `POST /api/v2/products/bulk/stock-update` - Bulk stock update
- `POST /api/v2/products/bulk/status-update` - Bulk status update

### Product Reviews (2)
- `POST /api/v2/products/{id}/reviews` - Add review
- `GET /api/v2/products/{id}/reviews` - List reviews

### Product Tags (3)
- `POST /api/v2/products/tags` - Create tag
- `GET /api/v2/products/tags` - List tags
- `POST /api/v2/products/{id}/tags` - Assign tags

### Stock Movements (2)
- `POST /api/v2/products/{id}/stock-movements` - Record movement
- `GET /api/v2/products/{id}/stock-movements` - List movements

### Import/Export (2)
- `POST /api/v2/products/import/csv` - Import CSV
- `POST /api/v2/products/export/csv` - Export CSV

### SEO Metadata (2)
- `PUT /api/v2/products/{id}/seo` - Update SEO
- `GET /api/v2/products/{id}/seo` - Get SEO

### Related Products (2)
- `POST /api/v2/products/{id}/related` - Add related
- `GET /api/v2/products/{id}/related` - List related

### Cost Analysis (1)
- `GET /api/v2/products/{id}/cost-analysis` - Cost analysis

### Promotions (3)
- `POST /api/v2/products/promotions` - Create promotion
- `GET /api/v2/products/promotions/active` - Active promotions
- `GET /api/v2/products/{id}/promotions` - Product promotions

### Audit Log (1)
- `GET /api/v2/products/{id}/audit-log` - Audit log

### Barcode Management (1)
- `POST /api/v2/products/{id}/barcodes` - Add barcode

### Low Stock (1)
- `GET /api/v2/products/alerts/low-stock/enhanced` - Enhanced alerts

### Analytics (1)
- `GET /api/v2/products/analytics/overview` - Dashboard

---

## Section 2: Orders (36 endpoints)

### Order Templates (6)
- `POST /api/v2/orders/templates` - Create template
- `GET /api/v2/orders/templates` - List templates
- `GET /api/v2/orders/templates/{id}` - Get template
- `PUT /api/v2/orders/templates/{id}` - Update template
- `DELETE /api/v2/orders/templates/{id}` - Delete template
- `POST /api/v2/orders/templates/{id}/apply` - Apply template

### Activity Timeline (2)
- `GET /api/v2/orders/{id}/timeline` - Get timeline
- `POST /api/v2/orders/{id}/timeline/notes` - Add note

### Partial Refunds (3)
- `POST /api/v2/orders/{id}/refund` - Request refund
- `POST /api/v2/orders/refunds/{id}/process` - Process refund
- `GET /api/v2/orders/{id}/refunds` - List refunds

### Order Splitting (1)
- `POST /api/v2/orders/{id}/split` - Split order

### Delivery Scheduling (3)
- `POST /api/v2/orders/{id}/schedule-delivery` - Schedule
- `GET /api/v2/orders/{id}/delivery-schedule` - Get schedule
- `PUT /api/v2/orders/delivery-schedules/{id}` - Update schedule

### Order Duplication (1)
- `POST /api/v2/orders/{id}/duplicate` - Duplicate order

### Returns & Exchanges (4)
- `POST /api/v2/orders/{id}/return` - Request return
- `POST /api/v2/orders/{id}/exchange` - Request exchange
- `GET /api/v2/orders/{id}/returns` - List returns
- `POST /api/v2/orders/returns/{id}/{decision}` - Process decision

### Bulk Operations (3)
- `POST /api/v2/orders/bulk/status-update` - Bulk status
- `POST /api/v2/orders/bulk/assign-courier` - Bulk courier
- `POST /api/v2/orders/bulk/print-labels` - Print labels

### Analytics (4)
- `GET /api/v2/orders/analytics/dashboard` - Dashboard
- `GET /api/v2/orders/analytics/trends` - Trends
- `GET /api/v2/orders/customer/{id}/analytics` - Customer analytics
- `GET /api/v2/orders/customer/{id}/orders` - Customer orders

### Advanced Search (1)
- `POST /api/v2/orders/search/advanced` - Advanced search

### Automation Rules (5)
- `GET /api/v2/orders/automation/rules` - List rules
- `POST /api/v2/orders/automation/rules` - Create rule
- `PUT /api/v2/orders/automation/rules/{id}` - Update rule
- `DELETE /api/v2/orders/automation/rules/{id}` - Delete rule
- `POST /api/v2/orders/automation/rules/{id}/toggle` - Toggle rule

### Export (1)
- `POST /api/v2/orders/export` - Export orders

### Courier Stats (1)
- `GET /api/v2/orders/stats/by-courier` - Courier stats

### Abandoned Recovery (1)
- `GET /api/v2/orders/recovery/abandoned` - Abandoned orders

---

## Files Added

```
backend/routes/ecom/
  enhanced_orders_routes.py      # 36 endpoints
  enhanced_products_routes.py    # 32 endpoints

backend/utils/
  enhanced_orders_indexes.py     # Orders indexes
  enhanced_products_indexes.py   # Products indexes
  enhanced_indexes.py            # Combined initializer

docs/
  ENHANCED_MODULES.md            # This documentation
```

## Testing

```bash
# Products dashboard
curl http://localhost:8000/api/v2/products/analytics/overview

# Orders dashboard
curl http://localhost:8000/api/v2/orders/analytics/dashboard

# List templates
curl http://localhost:8000/api/v2/orders/templates

# Advanced search
curl -X POST http://localhost:8000/api/v2/orders/search/advanced \
  -H "Content-Type: application/json" \
  -d '{"page":1,"limit":10}'
```
