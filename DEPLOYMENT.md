# Deployment Guide — NT Commerce v16 (iter 18.4)

## Quick Start (single-container)

This repository ships a production-ready `Dockerfile.base` that bakes in **Python 3.11, Node 20, Nginx, Redis, and Supervisor**. Build once, run anywhere.

### 1. Build
```bash
docker build \
  --build-arg REACT_APP_BACKEND_URL=https://your-app.example.com \
  -f Dockerfile.base \
  -t ntcommerce/v16:latest .
```

### 2. Run
```bash
docker run -d --name ntc \
  -p 80:80 \
  -e MONGO_URL='mongodb+srv://USER:PASS@cluster.mongodb.net' \
  -e DB_NAME='ntcommerce_prod' \
  -e SECRET_KEY="$(openssl rand -hex 32)" \
  -e RESEND_API_KEY='re_xxxxxxxxxxxxxxxx' \
  -e SENDER_EMAIL='noreply@yourdomain.com' \
  -e EMERGENT_LLM_KEY='sk-emergent-xxxxxxxx' \
  ntcommerce/v16:latest
```

### 3. Verify
```bash
curl http://localhost/api/health
# → {"status":"ok"}
```

## Required environment variables

| Variable | Required | Purpose |
|---|---|---|
| `MONGO_URL` | ✅ | MongoDB connection (Atlas / self-hosted) |
| `DB_NAME` | ✅ | Database name (isolates dev/staging/prod) |
| `SECRET_KEY` | ✅ | JWT signing — generate with `openssl rand -hex 32` |
| `EMERGENT_LLM_KEY` | ✅ | LLM (AI Insights + Co-pilot + Lead categorization) |
| `RESEND_API_KEY` | ⚪ | Email (Resend) — falls back to mock if absent |
| `SENDER_EMAIL` | ⚪ | Verified sender domain for Resend |
| `SENDGRID_API_KEY` | ⚪ | Email (SendGrid) fallback |
| `CACHE_REDIS_URL` | auto | Set inside Dockerfile to `redis://127.0.0.1:6379/0` |

> **Note:** `RESEND_API_KEY` and `SENDER_EMAIL` can ALSO be configured at runtime by the super-admin via `/saas-admin/email-settings` (stored in `main_db.platform_settings`). DB values take precedence over env.

## Architecture (single-container)

```
┌──────────────────────── nginx :80 ────────────────────────┐
│  • static /app/frontend/build (React SPA)                  │
│  • /api/* → http://127.0.0.1:8001 (FastAPI)               │
└────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴────────────────────┐
        ▼                                          ▼
┌──── uvicorn :8001 ──────┐               ┌── redis :6379 ───┐
│  FastAPI + supervisor   │               │ @cached_json     │
│  • 2 workers            │               │ • 1-hr AI cache  │
│  • all routes /api/*    │ ◄────────────►│ • debt stats     │
└─────────────────────────┘               └──────────────────┘
                │
                ▼
        ┌─── External MongoDB Atlas ───┐
        │  • main_db.saas_*             │
        │  • tenant_<id>.ecom_*         │
        └───────────────────────────────┘
```

## Webhooks (real channel integrations)

Once deployed, configure these webhook URLs in each external channel. The frontend Channels page auto-displays the Shopify URL when editing an integration; other channels follow the same pattern.

| Channel | URL Template |
|---|---|
| Shopify orders | `…/api/ecom/webhooks/shopify/{TENANT_ID}/{INTEGRATION_ID}/orders` |
| Shopify products | `…/api/ecom/webhooks/shopify/{TENANT_ID}/{INTEGRATION_ID}/products` |
| WhatsApp Cloud API | `…/api/ecom/webhooks/whatsapp/{TENANT_ID}/{INTEGRATION_ID}` |
| Meta (FB/IG leads) | `…/api/ecom/webhooks/meta/{TENANT_ID}/{INTEGRATION_ID}` |
| Telegram Bot | `…/api/ecom/webhooks/telegram/{TENANT_ID}/{INTEGRATION_ID}` |
| Viber Bot | `…/api/ecom/webhooks/viber/{TENANT_ID}/{INTEGRATION_ID}` |
| TikTok Shop | `…/api/ecom/webhooks/tiktok/{TENANT_ID}/{INTEGRATION_ID}` |

## Scaling beyond a single container

When traffic exceeds ~1k req/s on a single node:
1. Move Redis to managed (Upstash / Elasticache) → set `CACHE_REDIS_URL=redis://...`.
2. Remove in-container redis from `supervisord.conf`.
3. Run multiple replicas behind a load balancer (Cloudflare, ALB, Nginx Plus).
4. Optional: split nginx and uvicorn into separate services (Kubernetes Deployment + Service).

## Health monitoring

The container exposes `/api/health` for orchestrators. The super-admin dashboard at `/saas-admin` shows:
- **AI Insights Card** — hourly LLM platform-health snapshot
- **Health Alerts Card** — listed when score < 75 with one-click resolve
- Email alerts auto-sent to all super-admins when severity ≥ warning (throttled to 1/24h per severity)
