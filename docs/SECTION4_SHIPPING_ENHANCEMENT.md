# Section 4: Shipping & Delivery Enhancement

## Overview

Advanced shipping and delivery management module for NT Commerce v16, optimized for the Algerian market. Provides courier management, delivery route planning, tracking across providers, wilaya-based pricing for all 58 Algerian provinces, and COD reconciliation.

## Files

- `backend/routes/ecom/enhanced_shipping_routes.py` - 29 endpoints, ~975 lines
- `backend/utils/enhanced_shipping_indexes.py` - MongoDB indexes (7 collections, 22 indexes)

## Endpoints

### Courier Management (5 endpoints)
- `POST /api/v2/shipping/couriers` - Register a new delivery courier
- `GET /api/v2/shipping/couriers` - List couriers with filters (active, wilaya)
- `GET /api/v2/shipping/couriers/{id}` - Courier details with recent deliveries
- `PUT /api/v2/shipping/couriers/{id}` - Update courier info
- `DELETE /api/v2/shipping/couriers/{id}` - Deactivate courier

### Courier Assignment & Routes (4 endpoints)
- `POST /api/v2/shipping/couriers/assign` - Assign courier to multiple orders
- `GET /api/v2/shipping/couriers/{id}/orders` - Get courier's assigned orders
- `POST /api/v2/shipping/routes` - Create delivery route (tournee)
- `GET /api/v2/shipping/routes` - List routes with date/status filters

### Tracking Management (3 endpoints)
- `POST /api/v2/shipping/labels/{id}/tracking` - Update tracking status + history
- `GET /api/v2/shipping/labels/{id}/tracking` - Full tracking history
- `GET /api/v2/shipping/tracking/{number}` - Track by tracking number

### Wilaya Pricing (2 endpoints)
- `GET /api/v2/shipping/wilayas` - All 58 Algerian wilayas with fees
- `GET /api/v2/shipping/wilayas/{code}/fee` - Calculate fee with weight

### Bulk Labels (2 endpoints)
- `POST /api/v2/shipping/labels/bulk` - Create labels for multiple orders
- `POST /api/v2/shipping/labels/{id}/void` - Void/cancel a label

### Shipping Settings (2 endpoints)
- `GET /api/v2/shipping/settings` - Get shipping configuration
- `PUT /api/v2/shipping/settings` - Update settings

### Pickup Requests (3 endpoints)
- `POST /api/v2/shipping/pickups` - Request provider pickup
- `GET /api/v2/shipping/pickups` - List pickup requests
- `PUT /api/v2/shipping/pickups/{id}/status` - Update pickup status

### Delivery Zones (3 endpoints)
- `POST /api/v2/shipping/zones` - Create delivery zone (wilaya group)
- `GET /api/v2/shipping/zones` - List active zones
- `DELETE /api/v2/shipping/zones/{id}` - Deactivate zone

### COD Reconciliation (1 endpoint)
- `POST /api/v2/shipping/cod/reconcile` - Reconcile COD shipments by provider/date

### Shipping Analytics (3 endpoints)
- `GET /api/v2/shipping/analytics/overview` - Dashboard overview
- `GET /api/v2/shipping/analytics/performance` - Daily delivery performance
- `GET /api/v2/shipping/analytics/couriers` - Per-courier performance stats

### Label Search (1 endpoint)
- `GET /api/v2/shipping/labels` - Advanced label search with filters

## Algeria Wilaya Fee Structure

All 58 Algerian wilayas with desk/home delivery fees. Weight surcharge: +20% per kg over 1kg.
Examples:
- Algiers (16): 250 DZD (desk) / 400 DZD (home)
- Oran (31): 500 DZD (desk) / 700 DZD (home)
- Tamanrasset (11): 800 DZD (desk) / 1000 DZD (home)

## Shipping Providers
- `yalidine` - Yalidine (API-ready)
- `zr` - ZR Express
- `maystro` - Maystro
- `noest` - NOEST
- `manual` - Self delivery

## Database Collections
- `couriers` - Delivery agents
- `delivery_routes` - Tournee planning
- `ecom_shipping_labels` - Shipping labels + tracking
- `shipping_settings` - Tenant configuration
- `pickup_requests` - Provider pickup requests
- `delivery_zones` - Wilaya grouping
- `shipping_activity_log` - Activity log

## Deployment

Built and deployed on VPS 168.231.81.154 as part of NT Commerce v16.
