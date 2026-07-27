# NT Commerce v16 - Section 2: Orders Management Enhancement

## Overview
36 new endpoints for advanced order operations under `/api/v2/orders/*`.

## Endpoints Summary

### Templates (6)
- `POST /templates` - Create template
- `GET /templates` - List templates
- `GET /templates/{id}` - Get template
- `PUT /templates/{id}` - Update template
- `DELETE /templates/{id}` - Delete template
- `POST /templates/{id}/apply` - Apply template to create order

### Timeline (2)
- `GET /{order_id}/timeline` - Activity timeline
- `POST /{order_id}/timeline/notes` - Add note

### Refunds (3)
- `POST /{order_id}/refund` - Request refund
- `POST /refunds/{id}/process` - Approve/reject refund
- `GET /{order_id}/refunds` - List refunds

### Splitting (1)
- `POST /{order_id}/split` - Split order

### Delivery (3)
- `POST /{order_id}/schedule-delivery` - Schedule delivery
- `GET /{order_id}/delivery-schedule` - Get schedule
- `PUT /delivery-schedules/{id}` - Update schedule

### Duplication (1)
- `POST /{order_id}/duplicate` - Duplicate order

### Returns & Exchanges (4)
- `POST /{order_id}/return` - Request return
- `POST /{order_id}/exchange` - Request exchange
- `GET /{order_id}/returns` - List returns
- `POST /returns/{id}/{decision}` - Process return/exchange

### Bulk Operations (3)
- `POST /bulk/status-update` - Bulk status update
- `POST /bulk/assign-courier` - Bulk assign courier
- `POST /bulk/print-labels` - Print shipping labels

### Analytics (4)
- `GET /analytics/dashboard` - Dashboard metrics
- `GET /analytics/trends` - Order trends
- `GET /customer/{id}/analytics` - Customer analytics
- `GET /customer/{id}/orders` - Customer orders

### Search (1)
- `POST /search/advanced` - Advanced search

### Automation (5)
- `GET /automation/rules` - List rules
- `POST /automation/rules` - Create rule
- `PUT /automation/rules/{id}` - Update rule
- `DELETE /automation/rules/{id}` - Delete rule
- `POST /automation/rules/{id}/toggle` - Toggle rule

### Utilities (3)
- `POST /export` - Export orders
- `GET /stats/by-courier` - Courier stats
- `GET /recovery/abandoned` - Abandoned orders

## New Collections
- `order_templates`
- `order_timelines`
- `order_refunds`
- `delivery_schedules`
- `order_returns`
- `automation_rules`

## Integration

### main.py changes
```python
from routes.ecom.enhanced_orders_routes import create_enhanced_orders_routes

enhanced_orders_router = create_enhanced_orders_routes(
    db=db,
    get_current_user=get_current_user,
    require_permission=require_permission,
    cache=redis_cache,
    event_bus=event_bus
)
app.include_router(enhanced_orders_router, prefix="/api/v2")
```

### MongoDB Indexes
```python
from utils.enhanced_orders_indexes import create_enhanced_orders_indexes
# In startup event:
await create_enhanced_orders_indexes(db)
```

## Status State Machine
```
NEW -> CONFIRMED, CANCELLED
CONFIRMED -> PREPARING, CANCELLED
PREPARING -> SHIPPED, CANCELLED
SHIPPED -> ON_THE_WAY, IN_TRANSIT, DELIVERY_EXCEPTION
ON_THE_WAY -> DELIVERED, DELIVERY_EXCEPTION
IN_TRANSIT -> DELIVERED, DELIVERY_EXCEPTION
DELIVERY_EXCEPTION -> ON_THE_WAY, SHIPPED, CANCELLED
```
