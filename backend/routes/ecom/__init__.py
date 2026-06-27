"""E-Commerce Hub Routes Package

Unified multi-channel e-commerce module:
  - integrations_routes: CRUD for channel connections (Shopify / Meta / TikTok / WhatsApp / Telegram / Viber)
  - orders_routes:       Unified orders inbox + manual order entry
  - leads_routes:        Multi-channel leads (FB / IG / TikTok / WhatsApp)
  - shipping_routes:     Shipping labels (Yalidine / ZR / Maystro) — MOCK provider until real keys.

All routes are gated by the `ecommerce_hub` feature flag (super-admin opt-in per tenant).
"""
