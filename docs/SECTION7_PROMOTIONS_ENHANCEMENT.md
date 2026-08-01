# Section 7: Promotions, Discounts & Loyalty Enhancement

## Overview

Comprehensive promotions module for NT Commerce v16. Covers coupon codes, flash sales, automatic discount rules, product bundles, and a full loyalty points program with tier-based rewards.

## Files

- `backend/routes/ecom/enhanced_promotions_routes.py` - 32 endpoints, ~920 lines
- `backend/utils/enhanced_promotions_indexes.py` - MongoDB indexes (7 collections, 17 indexes)

## Endpoints

### Coupons (5 endpoints)
- `POST /api/v2/promotions/coupons` - Create coupon
- `GET /api/v2/promotions/coupons` - List coupons
- `GET /api/v2/promotions/coupons/{id}` - Get with usage stats
- `PUT /api/v2/promotions/coupons/{id}` - Update
- `DELETE /api/v2/promotions/coupons/{id}` - Deactivate

### Coupon Validation (2 endpoints)
- `POST /api/v2/promotions/coupons/validate` - Validate against cart
- `POST /api/v2/promotions/coupons/{id}/apply` - Record usage

### Flash Sales (5 endpoints)
- `POST /api/v2/promotions/flash-sales` - Create flash sale
- `GET /api/v2/promotions/flash-sales` - List (active_only filter)
- `GET /api/v2/promotions/flash-sales/{id}` - Details with products
- `PUT /api/v2/promotions/flash-sales/{id}` - Update
- `DELETE /api/v2/promotions/flash-sales/{id}` - Deactivate

### Discount Rules (3 endpoints)
- `POST /api/v2/promotions/discount-rules` - Create rule
- `GET /api/v2/promotions/discount-rules` - List
- `DELETE /api/v2/promotions/discount-rules/{id}` - Deactivate

### Loyalty Points (5 endpoints)
- `POST /api/v2/promotions/loyalty/award` - Award points
- `POST /api/v2/promotions/loyalty/redeem` - Redeem points (100pts = 1 DZD)
- `GET /api/v2/promotions/loyalty/customers/{id}/balance` - Balance + tier
- `GET /api/v2/promotions/loyalty/tiers` - 4 tiers (Bronze/Silver/Gold/Platinum)
- `GET /api/v2/promotions/loyalty/transactions` - Transaction history

### Bundles (3 endpoints)
- `POST /api/v2/promotions/bundles` - Create bundle
- `GET /api/v2/promotions/bundles` - List with savings calc
- `DELETE /api/v2/promotions/bundles/{id}` - Deactivate

### Analytics (4 endpoints)
- `GET /api/v2/promotions/analytics/overview` - Dashboard
- `GET /api/v2/promotions/analytics/coupons` - Coupon usage trends
- `GET /api/v2/promotions/analytics/loyalty` - Loyalty program stats
- `GET /api/v2/promotions/analytics/revenue-impact` - Revenue lift from promos

### Active Promos (2 endpoints)
- `GET /api/v2/promotions/active` - All active promotions
- `POST /api/v2/promotions/evaluate-cart` - Best discounts for cart

### Extras (3 endpoints)
- `POST /api/v2/promotions/coupons/generate-batch` - Bulk code generator
- `POST /api/v2/promotions/flash-sales/check` - Check product flash sale
- `GET /api/v2/promotions/coupons/customer/{id}/history` - Customer usage

## Loyalty Tiers
- **Bronze**: 0+ pts, 0% discount
- **Silver**: 500+ pts, 3% discount
- **Gold**: 2000+ pts, 7% discount + free shipping
- **Platinum**: 5000+ pts, 12% discount + VIP support

## Discount Rule Conditions
- `cart_total` - Min order amount
- `item_count` - Min items in cart
- `customer_segment` - Specific segments
- `first_order` - New customers
- `payment_method` - Specific payment method
- `wilaya` - Specific Algerian wilayas

## Deployment

Built and deployed on VPS 168.231.81.154 as part of NT Commerce v16.
