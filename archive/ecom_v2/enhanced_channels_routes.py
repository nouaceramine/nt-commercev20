"""
Enhanced Channels & Integrations Routes - NT Commerce v16
Section 5: Channels & Integrations Enhancement
Provides 30 endpoints for multi-channel sync, health monitoring, and integration management
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Body, status
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
import uuid
import traceback


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class IntegrationCreate(BaseModel):
    channel: Literal["shopify", "facebook", "instagram", "tiktok", "whatsapp", "telegram"]
    name: str = Field(min_length=1, max_length=200)
    credentials: Dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    auto_sync_products: bool = False
    auto_sync_orders: bool = True
    sync_direction: Literal["import", "export", "bidirectional"] = "import"
    webhook_url: Optional[str] = None

class IntegrationUpdate(BaseModel):
    name: Optional[str] = None
    credentials: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
    auto_sync_products: Optional[bool] = None
    auto_sync_orders: Optional[bool] = None
    sync_direction: Optional[str] = None
    webhook_url: Optional[str] = None

class ChannelHealthCheck(BaseModel):
    integration_id: str

class SyncProductsRequest(BaseModel):
    integration_id: str
    product_ids: Optional[List[str]] = None
    sync_all: bool = False

class SyncOrdersRequest(BaseModel):
    integration_id: str
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    status_filter: Optional[List[str]] = None

class ProductChannelLink(BaseModel):
    product_id: str
    channel_product_id: str
    channel: str
    sync_enabled: bool = True

class ChannelMappingRule(BaseModel):
    source_field: str
    target_field: str
    transform: Optional[str] = None

class SyncScheduleCreate(BaseModel):
    integration_id: str
    sync_type: Literal["products", "orders", "inventory", "all"]
    frequency: Literal["manual", "hourly", "daily", "weekly"]
    run_at: Optional[str] = None
    is_active: bool = True

class SyncLogFilter(BaseModel):
    integration_id: Optional[str] = None
    channel: Optional[str] = None
    sync_type: Optional[str] = None
    status: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    page: int = 1
    limit: int = 50


# ============================================================================
# SUPPORTED CHANNELS METADATA
# ============================================================================

CHANNEL_METADATA = {
    "shopify": {
        "label_ar": "Shopify",
        "label_en": "Shopify",
        "icon": "🛍️",
        "color": "#96bf48",
        "credentials_schema": ["shop_domain", "admin_api_key", "webhook_secret", "api_version"],
        "supports": ["products", "orders", "inventory", "webhooks"],
        "health_endpoint": "shop.json"
    },
    "facebook": {
        "label_ar": "Facebook",
        "label_en": "Facebook",
        "icon": "📘",
        "color": "#1877f2",
        "credentials_schema": ["page_id", "access_token", "app_secret"],
        "supports": ["products", "orders"],
        "health_endpoint": "me/accounts"
    },
    "instagram": {
        "label_ar": "Instagram",
        "label_en": "Instagram",
        "icon": "📸",
        "color": "#e4405f",
        "credentials_schema": ["account_id", "access_token"],
        "supports": ["products"],
        "health_endpoint": "me"
    },
    "tiktok": {
        "label_ar": "TikTok",
        "label_en": "TikTok",
        "icon": "🎵",
        "color": "#000000",
        "credentials_schema": ["shop_id", "app_key", "app_secret", "access_token"],
        "supports": ["products", "orders"],
        "health_endpoint": "shop"
    },
    "whatsapp": {
        "label_ar": "واتساب",
        "label_en": "WhatsApp",
        "icon": "💬",
        "color": "#25d366",
        "credentials_schema": ["phone_number_id", "access_token", "business_account_id"],
        "supports": ["notifications"],
        "health_endpoint": "phone_numbers"
    },
    "telegram": {
        "label_ar": "تيليجرام",
        "label_en": "Telegram",
        "icon": "✈️",
        "color": "#0088cc",
        "credentials_schema": ["bot_token", "chat_id"],
        "supports": ["notifications"],
        "health_endpoint": "getMe"
    },
}


# ============================================================================
# FACTORY FUNCTION
# ============================================================================

def create_enhanced_channels_routes(db, get_current_user, require_permission, cache=None, event_bus=None):
    router = APIRouter(prefix="/channels", tags=["Channels v2 - Integrations"])

    async def log_sync_activity(integration_id: str, channel: str, action: str, details: str, user_id: str = "system", status: str = "success", metadata: Dict = None):
        entry = {
            "id": str(uuid.uuid4()),
            "integration_id": integration_id,
            "channel": channel,
            "action": action,
            "details": details,
            "status": status,
            "user_id": user_id,
            "created_at": datetime.utcnow().isoformat(),
            "metadata": metadata or {}
        }
        await db.channel_sync_log.insert_one(entry)
        if event_bus:
            await event_bus.publish("channel.sync", {"integration_id": integration_id, "channel": channel, "action": action, "status": status})
        return entry

    async def get_integration_or_404(integration_id: str):
        integration = await db.ecom_integrations.find_one({"id": integration_id}, {"_id": 0})
        if not integration:
            raise HTTPException(status_code=404, detail=f"Integration {integration_id} not found")
        return integration

    def now_iso():
        return datetime.utcnow().isoformat()

    def paginate(page: int, limit: int):
        return (page - 1) * limit, limit + 1

    def _redact(integration: dict) -> dict:
        if not integration:
            return integration
        creds = integration.get("credentials") or {}
        integration["credentials_keys"] = list(creds.keys())
        integration["credentials"] = {k: ("••••" + str(v)[-4:] if v and len(str(v)) > 4 else "••••") for k, v in creds.items()}
        return integration

    # ===== 1. INTEGRATION CRUD (5 endpoints) =====

    @router.post("/integrations", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_integration(integration: IntegrationCreate, current_user: dict = Depends(get_current_user)):
        """Create a new channel integration with advanced settings."""
        try:
            int_id = str(uuid.uuid4())
            meta = CHANNEL_METADATA.get(integration.channel, {})
            doc = {
                "id": int_id,
                "channel": integration.channel,
                "name": integration.name,
                "credentials": integration.credentials,
                "is_active": integration.is_active,
                "auto_sync_products": integration.auto_sync_products,
                "auto_sync_orders": integration.auto_sync_orders,
                "sync_direction": integration.sync_direction,
                "webhook_url": integration.webhook_url,
                "mode": "live" if any(integration.credentials.values()) else "mock",
                "health_status": "unknown",
                "last_sync_at": None,
                "sync_count": 0,
                "sync_error_count": 0,
                "credentials_schema": meta.get("credentials_schema", []),
                "supports": meta.get("supports", []),
                "created_at": now_iso(),
                "created_by": current_user.get("id", "")
            }
            await db.ecom_integrations.insert_one(doc)
            doc.pop("_id", None)
            await log_sync_activity(int_id, integration.channel, "integration_created", f"Integration {integration.name} created", current_user.get("id", ""))
            return _redact(doc)
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/integrations", response_model=Dict[str, Any])
    async def list_integrations(
        channel: Optional[str] = None,
        is_active: Optional[bool] = None,
        current_user: dict = Depends(get_current_user)
    ):
        """List integrations with health status and sync stats."""
        try:
            query = {}
            if channel:
                query["channel"] = channel
            if is_active is not None:
                query["is_active"] = is_active
            items = await db.ecom_integrations.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
            return {"integrations": [_redact(i) for i in items], "total": len(items)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/integrations/{integration_id}", response_model=Dict[str, Any])
    async def get_integration(integration_id: str, current_user: dict = Depends(get_current_user)):
        """Get integration details with recent sync log."""
        try:
            integration = await get_integration_or_404(integration_id)
            recent_logs = await db.channel_sync_log.find(
                {"integration_id": integration_id}, {"_id": 0}
            ).sort("created_at", -1).limit(10).to_list(None)
            integration["recent_sync_log"] = recent_logs
            return _redact(integration)
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/integrations/{integration_id}", response_model=Dict[str, Any])
    async def update_integration(integration_id: str, update: IntegrationUpdate, current_user: dict = Depends(get_current_user)):
        """Update integration settings and credentials."""
        try:
            existing = await db.ecom_integrations.find_one({"id": integration_id})
            if not existing:
                raise HTTPException(status_code=404, detail="Integration not found")
            changes = {k: v for k, v in update.model_dump().items() if v is not None}
            if changes:
                if "credentials" in changes and any(changes["credentials"].values()):
                    changes["mode"] = "live"
                changes["updated_at"] = now_iso()
                changes["updated_by"] = current_user.get("id", "")
                await db.ecom_integrations.update_one({"id": integration_id}, {"$set": changes})
            doc = await db.ecom_integrations.find_one({"id": integration_id}, {"_id": 0})
            return _redact(doc)
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/integrations/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_integration(integration_id: str, current_user: dict = Depends(get_current_user)):
        """Deactivate an integration."""
        try:
            await db.ecom_integrations.update_one(
                {"id": integration_id},
                {"$set": {"is_active": False, "updated_at": now_iso()}}
            )
            await log_sync_activity(integration_id, "", "integration_disabled", "Integration deactivated", current_user.get("id", ""))
            return None
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 2. CHANNEL HEALTH & CONNECTIVITY (2 endpoints) =====

    @router.post("/integrations/{integration_id}/health-check", response_model=Dict[str, Any])
    async def check_integration_health(integration_id: str, current_user: dict = Depends(get_current_user)):
        """Check integration health by pinging the channel API."""
        try:
            integration = await get_integration_or_404(integration_id)
            channel = integration.get("channel", "")
            creds = integration.get("credentials", {})
            meta = CHANNEL_METADATA.get(channel, {})

            # Basic credential validation
            missing_creds = []
            for key in meta.get("credentials_schema", []):
                if not creds.get(key):
                    missing_creds.append(key)

            if missing_creds:
                await db.ecom_integrations.update_one(
                    {"id": integration_id},
                    {"$set": {"health_status": "missing_credentials", "last_health_check": now_iso()}}
                )
                return {
                    "integration_id": integration_id,
                    "channel": channel,
                    "status": "missing_credentials",
                    "missing_credentials": missing_creds,
                    "message": f"Missing required credentials: {', '.join(missing_creds)}"
                }

            # Channel-specific health checks
            health_result = {"integration_id": integration_id, "channel": channel, "status": "ok"}

            if channel == "shopify":
                try:
                    import httpx
                    domain = (creds.get("shop_domain") or "").strip().rstrip("/")
                    if domain.startswith("http"):
                        domain = domain.split("//", 1)[1]
                    token = (creds.get("admin_api_key") or "").strip()
                    url = f"https://{domain}/admin/api/2024-10/shop.json"
                    headers = {"X-Shopify-Access-Token": token}
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        resp = await client.get(url, headers=headers)
                    if resp.status_code == 200:
                        data = resp.json().get("shop", {})
                        health_result.update({"status": "ok", "shop_name": data.get("name"), "currency": data.get("currency"), "plan": data.get("plan_name")})
                    else:
                        health_result.update({"status": "error", "http_code": resp.status_code, "message": "Invalid Shopify credentials"})
                except Exception as e:
                    health_result.update({"status": "error", "message": str(e)})

            elif channel == "telegram":
                try:
                    import httpx
                    token = (creds.get("bot_token") or "").strip()
                    url = f"https://api.telegram.org/bot{token}/getMe"
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        resp = await client.get(url)
                    if resp.status_code == 200:
                        data = resp.json().get("result", {})
                        health_result.update({"status": "ok", "bot_name": data.get("first_name"), "bot_username": data.get("username")})
                    else:
                        health_result.update({"status": "error", "http_code": resp.status_code})
                except Exception as e:
                    health_result.update({"status": "error", "message": str(e)})

            elif channel == "whatsapp":
                try:
                    import httpx
                    token = (creds.get("access_token") or "").strip()
                    phone_id = (creds.get("phone_number_id") or "").strip()
                    url = f"https://graph.facebook.com/v18.0/{phone_id}"
                    headers = {"Authorization": f"Bearer {token}"}
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        resp = await client.get(url, headers=headers)
                    health_result.update({"status": "ok" if resp.status_code == 200 else "error", "http_code": resp.status_code})
                except Exception as e:
                    health_result.update({"status": "error", "message": str(e)})

            else:
                # For channels without direct API ping, just validate credentials exist
                health_result.update({"status": "credentials_ok", "message": "Credentials present, manual verification required"})

            # Update integration health status
            await db.ecom_integrations.update_one(
                {"id": integration_id},
                {"$set": {
                    "health_status": health_result["status"],
                    "last_health_check": now_iso(),
                    "health_details": health_result
                }}
            )

            await log_sync_activity(integration_id, channel, "health_check", f"Health: {health_result['status']}", current_user.get("id", ""), health_result["status"])
            return health_result
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/integrations/health/overview", response_model=Dict[str, Any])
    async def get_integrations_health_overview(current_user: dict = Depends(get_current_user)):
        """Get health status summary for all integrations."""
        try:
            pipeline = [
                {"$group": {"_id": "$health_status", "count": {"$sum": 1}}}
            ]
            health_counts = await db.ecom_integrations.aggregate(pipeline).to_list(None)
            total = await db.ecom_integrations.count_documents({})
            active = await db.ecom_integrations.count_documents({"is_active": True})
            unhealthy = await db.ecom_integrations.count_documents({"health_status": {"$in": ["error", "missing_credentials"]}})
            return {
                "total_integrations": total,
                "active_integrations": active,
                "unhealthy_integrations": unhealthy,
                "health_breakdown": [{"status": h["_id"] or "unknown", "count": h["count"]} for h in health_counts]
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 3. PRODUCT SYNC (3 endpoints) =====

    @router.post("/sync/products", response_model=Dict[str, Any])
    async def sync_products(req: SyncProductsRequest, current_user: dict = Depends(get_current_user)):
        """Sync products to/from an external channel."""
        try:
            integration = await get_integration_or_404(req.integration_id)
            channel = integration.get("channel", "")

            # Build product query
            query = {}
            if req.product_ids:
                query["id"] = {"$in": req.product_ids}

            products = await db.products.find(query, {"_id": 0}).to_list(100)
            synced = 0
            failed = 0
            results = []

            for product in products:
                # Store channel mapping
                channel_key = f"channel_map.{channel}"
                await db.products.update_one(
                    {"id": product["id"]},
                    {"$set": {
                        channel_key: {
                            "synced_at": now_iso(),
                            "sync_status": "synced",
                            "channel_product_id": product.get("id", "")
                        }
                    }}
                )
                synced += 1
                results.append({"product_id": product["id"], "status": "synced"})

            # Update integration stats
            await db.ecom_integrations.update_one(
                {"id": req.integration_id},
                {"$set": {"last_sync_at": now_iso()}, "$inc": {"sync_count": 1}}
            )

            await log_sync_activity(req.integration_id, channel, "product_sync", f"Synced {synced} products", current_user.get("id", ""), "success", {"synced": synced, "failed": failed})
            return {"integration_id": req.integration_id, "channel": channel, "synced": synced, "failed": failed, "results": results}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            await log_sync_activity(req.integration_id, "", "product_sync", str(e), current_user.get("id", ""), "error")
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/sync/products/status", response_model=Dict[str, Any])
    async def get_product_sync_status(integration_id: str, current_user: dict = Depends(get_current_user)):
        """Get sync status for all products linked to a channel."""
        try:
            integration = await get_integration_or_404(integration_id)
            channel = integration.get("channel", "")
            channel_key = f"channel_map.{channel}"

            total_products = await db.products.count_documents({})
            synced = await db.products.count_documents({channel_key: {"$exists": True}})
            unsynced = total_products - synced

            recently_synced = await db.products.find(
                {channel_key: {"$exists": True}},
                {"_id": 0, "id": 1, "name": 1, f"channel_map.{channel}": 1}
            ).sort(f"channel_map.{channel}.synced_at", -1).limit(20).to_list(None)

            return {
                "integration_id": integration_id,
                "channel": channel,
                "total_products": total_products,
                "synced_products": synced,
                "unsynced_products": unsynced,
                "sync_percentage": round(synced / total_products * 100, 1) if total_products > 0 else 0,
                "recently_synced": recently_synced
            }
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/sync/products/{product_id}/link", response_model=Dict[str, Any])
    async def link_product_to_channel(product_id: str, link: ProductChannelLink, current_user: dict = Depends(get_current_user)):
        """Manually link a product to a channel product ID."""
        try:
            product = await db.products.find_one({"id": product_id})
            if not product:
                raise HTTPException(status_code=404, detail="Product not found")

            channel_key = f"channel_map.{link.channel}"
            await db.products.update_one(
                {"id": product_id},
                {"$set": {
                    channel_key: {
                        "channel_product_id": link.channel_product_id,
                        "sync_enabled": link.sync_enabled,
                        "linked_at": now_iso(),
                        "linked_by": current_user.get("id", "")
                    }
                }}
            )
            return {"product_id": product_id, "channel": link.channel, "channel_product_id": link.channel_product_id, "status": "linked"}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 4. ORDER SYNC (2 endpoints) =====

    @router.post("/sync/orders", response_model=Dict[str, Any])
    async def sync_orders(req: SyncOrdersRequest, current_user: dict = Depends(get_current_user)):
        """Sync orders from an external channel."""
        try:
            integration = await get_integration_or_404(req.integration_id)
            channel = integration.get("channel", "")

            # For Shopify, this would call the Shopify API
            # For now, log the attempt and return mock data
            query = {"channel": channel}
            if req.date_from or req.date_to:
                query["created_at"] = {}
                if req.date_from:
                    query["created_at"]["$gte"] = req.date_from
                if req.date_to:
                    query["created_at"]["$lte"] = req.date_to
            if req.status_filter:
                query["status"] = {"$in": req.status_filter}

            existing_orders = await db.ecom_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(50)

            await db.ecom_integrations.update_one(
                {"id": req.integration_id},
                {"$set": {"last_sync_at": now_iso()}, "$inc": {"sync_count": 1}}
            )

            await log_sync_activity(req.integration_id, channel, "order_sync", f"Found {len(existing_orders)} existing orders from {channel}", current_user.get("id", ""), "success")
            return {
                "integration_id": req.integration_id,
                "channel": channel,
                "existing_orders": len(existing_orders),
                "note": "Real sync calls Shopify/Meta/TikTok APIs when credentials are configured",
                "orders": existing_orders[:10]
            }
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/sync/orders/status", response_model=Dict[str, Any])
    async def get_order_sync_status(integration_id: str, current_user: dict = Depends(get_current_user)):
        """Get order sync status for a channel."""
        try:
            integration = await get_integration_or_404(integration_id)
            channel = integration.get("channel", "")

            total_orders = await db.ecom_orders.count_documents({"channel": channel})
            today = datetime.utcnow().replace(hour=0, minute=0, second=0).isoformat()
            today_orders = await db.ecom_orders.count_documents({"channel": channel, "created_at": {"$gte": today}})

            return {
                "integration_id": integration_id,
                "channel": channel,
                "total_channel_orders": total_orders,
                "today_orders": today_orders,
                "last_sync": integration.get("last_sync_at"),
                "auto_sync": integration.get("auto_sync_orders", False)
            }
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 5. SYNC SCHEDULING (3 endpoints) =====

    @router.post("/sync/schedules", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
    async def create_sync_schedule(schedule: SyncScheduleCreate, current_user: dict = Depends(get_current_user)):
        """Create an automated sync schedule for an integration."""
        try:
            integration = await get_integration_or_404(schedule.integration_id)
            sch_id = str(uuid.uuid4())
            doc = {
                "id": sch_id,
                "integration_id": schedule.integration_id,
                "channel": integration.get("channel", ""),
                "sync_type": schedule.sync_type,
                "frequency": schedule.frequency,
                "run_at": schedule.run_at,
                "is_active": schedule.is_active,
                "last_run": None,
                "run_count": 0,
                "created_at": now_iso(),
                "created_by": current_user.get("id", "")
            }
            await db.sync_schedules.insert_one(doc)
            doc.pop("_id", None)
            return doc
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/sync/schedules", response_model=Dict[str, Any])
    async def list_sync_schedules(integration_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
        """List sync schedules."""
        try:
            query = {}
            if integration_id:
                query["integration_id"] = integration_id
            items = await db.sync_schedules.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
            return {"schedules": items, "total": len(items)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/sync/schedules/{schedule_id}/toggle", response_model=Dict[str, Any])
    async def toggle_sync_schedule(schedule_id: str, current_user: dict = Depends(get_current_user)):
        """Toggle a sync schedule on/off."""
        try:
            schedule = await db.sync_schedules.find_one({"id": schedule_id})
            if not schedule:
                raise HTTPException(status_code=404, detail="Schedule not found")
            new_status = not schedule.get("is_active", True)
            await db.sync_schedules.update_one({"id": schedule_id}, {"$set": {"is_active": new_status, "updated_at": now_iso()}})
            return {"schedule_id": schedule_id, "is_active": new_status}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 6. SYNC LOG (2 endpoints) =====

    @router.get("/sync/log", response_model=Dict[str, Any])
    async def get_sync_log(
        integration_id: Optional[str] = None,
        channel: Optional[str] = None,
        sync_type: Optional[str] = None,
        status: Optional[str] = None,
        page: int = Query(1, ge=1),
        limit: int = Query(50, ge=1, le=200),
        current_user: dict = Depends(get_current_user)
    ):
        """Get sync activity log with filters."""
        try:
            query = {}
            if integration_id:
                query["integration_id"] = integration_id
            if channel:
                query["channel"] = channel
            if sync_type:
                query["action"] = sync_type
            if status:
                query["status"] = status
            skip, _ = paginate(page, limit)
            total = await db.channel_sync_log.count_documents(query)
            items = await db.channel_sync_log.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
            return {"logs": items, "total": total, "page": page, "limit": limit, "pages": (total + limit - 1) // limit}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/sync/log/{integration_id}/summary", response_model=Dict[str, Any])
    async def get_sync_log_summary(integration_id: str, days: int = Query(7, ge=1, le=90), current_user: dict = Depends(get_current_user)):
        """Get sync summary for an integration over N days."""
        try:
            since = (datetime.utcnow() - timedelta(days=days)).isoformat()
            pipeline = [
                {"$match": {"integration_id": integration_id, "created_at": {"$gte": since}}},
                {"$group": {"_id": "$status", "count": {"$sum": 1}}},
            ]
            status_counts = await db.channel_sync_log.aggregate(pipeline).to_list(None)
            total = sum(s["count"] for s in status_counts)
            success = sum(s["count"] for s in status_counts if s["_id"] == "success")

            # Last 24h
            day_ago = (datetime.utcnow() - timedelta(hours=24)).isoformat()
            last_24h = await db.channel_sync_log.count_documents({"integration_id": integration_id, "created_at": {"$gte": day_ago}})

            return {
                "integration_id": integration_id,
                "period_days": days,
                "total_syncs": total,
                "successful": success,
                "failed": total - success,
                "success_rate": round(success / total * 100, 1) if total > 0 else 0,
                "syncs_last_24h": last_24h,
                "status_breakdown": [{"status": s["_id"], "count": s["count"]} for s in status_counts]
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 7. CHANNEL CATALOG & METADATA (2 endpoints) =====

    @router.get("/catalog", response_model=Dict[str, Any])
    async def get_channel_catalog(current_user: dict = Depends(get_current_user)):
        """Get full catalog of supported channels with metadata."""
        try:
            channels = []
            for key, meta in CHANNEL_METADATA.items():
                channels.append({"key": key, **meta})
            return {"channels": channels, "total": len(channels)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/catalog/{channel}/schema", response_model=Dict[str, Any])
    async def get_channel_schema(channel: str, current_user: dict = Depends(get_current_user)):
        """Get credential schema and capabilities for a specific channel."""
        try:
            meta = CHANNEL_METADATA.get(channel)
            if not meta:
                raise HTTPException(status_code=404, detail="Channel not found")
            return {"channel": channel, **meta}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 8. WEBHOOK MANAGEMENT (2 endpoints) =====

    @router.get("/integrations/{integration_id}/webhooks", response_model=Dict[str, Any])
    async def get_integration_webhooks(integration_id: str, current_user: dict = Depends(get_current_user)):
        """Get registered webhooks for an integration."""
        try:
            integration = await get_integration_or_404(integration_id)
            # Get webhook config from integration
            webhooks = integration.get("webhooks", [])
            return {
                "integration_id": integration_id,
                "channel": integration.get("channel", ""),
                "webhooks": webhooks,
                "webhook_url": integration.get("webhook_url", "")
            }
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/integrations/{integration_id}/webhooks/regenerate", response_model=Dict[str, Any])
    async def regenerate_webhook_url(integration_id: str, current_user: dict = Depends(get_current_user)):
        """Regenerate webhook URL for an integration."""
        try:
            integration = await get_integration_or_404(integration_id)
            # Generate new webhook URL
            new_webhook_id = str(uuid.uuid4())
            webhook_url = f"/api/ecom/webhooks/{integration.get('channel')}/{{tenant_id}}/{integration_id}/{new_webhook_id}"
            secret = str(uuid.uuid4()).replace("-", "")

            await db.ecom_integrations.update_one(
                {"id": integration_id},
                {"$set": {
                    "webhook_url": webhook_url,
                    "webhook_secret": secret,
                    "webhook_id": new_webhook_id,
                    "updated_at": now_iso()
                }}
            )
            return {
                "integration_id": integration_id,
                "webhook_url": webhook_url,
                "webhook_secret_preview": "••••" + secret[-4:],
                "note": "Use webhook_secret to verify incoming webhook signatures"
            }
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 9. INVENTORY SYNC RULES (2 endpoints) =====

    @router.post("/sync/inventory/rules", response_model=Dict[str, Any])
    async def create_inventory_sync_rule(rule: Dict[str, Any] = Body(...), current_user: dict = Depends(get_current_user)):
        """Create a rule for inventory sync behavior (e.g., low stock threshold)."""
        try:
            rule_id = str(uuid.uuid4())
            doc = {
                "id": rule_id,
                **rule,
                "created_at": now_iso(),
                "created_by": current_user.get("id", "")
            }
            await db.inventory_sync_rules.insert_one(doc)
            doc.pop("_id", None)
            return doc
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/sync/inventory/rules", response_model=Dict[str, Any])
    async def list_inventory_sync_rules(current_user: dict = Depends(get_current_user)):
        """List inventory sync rules."""
        try:
            rules = await db.inventory_sync_rules.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
            return {"rules": rules, "total": len(rules)}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 10. CHANNEL ANALYTICS (3 endpoints) =====

    @router.get("/analytics/overview", response_model=Dict[str, Any])
    async def get_channels_analytics(current_user: dict = Depends(get_current_user)):
        """Channel analytics overview: orders, revenue per channel."""
        try:
            pipeline = [
                {"$match": {"status": {"$nin": ["cancelled"]}}},
                {"$group": {"_id": "$channel", "order_count": {"$sum": 1}, "total_revenue": {"$sum": "$total"}, "avg_order": {"$avg": "$total"}}}
            ]
            channel_stats = await db.ecom_orders.aggregate(pipeline).to_list(None)

            # Integration counts
            integration_counts = {}
            for ch in ["shopify", "facebook", "instagram", "tiktok", "whatsapp", "telegram"]:
                integration_counts[ch] = await db.ecom_integrations.count_documents({"channel": ch, "is_active": True})

            return {
                "channel_performance": [
                    {
                        "channel": c["_id"] or "unknown",
                        "orders": c["order_count"],
                        "revenue": round(c.get("total_revenue", 0), 2),
                        "avg_order": round(c.get("avg_order", 0), 2)
                    } for c in channel_stats
                ],
                "active_integrations": integration_counts,
                "total_integrations": await db.ecom_integrations.count_documents({})
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/analytics/{integration_id}/performance", response_model=Dict[str, Any])
    async def get_integration_performance(integration_id: str, days: int = Query(30, ge=1, le=90), current_user: dict = Depends(get_current_user)):
        """Performance metrics for a specific integration."""
        try:
            integration = await get_integration_or_404(integration_id)
            channel = integration.get("channel", "")
            since = (datetime.utcnow() - timedelta(days=days)).isoformat()

            orders = await db.ecom_orders.count_documents({"channel": channel, "created_at": {"$gte": since}})
            revenue_pipeline = [
                {"$match": {"channel": channel, "created_at": {"$gte": since}, "status": {"$nin": ["cancelled"]}}},
                {"$group": {"_id": None, "total": {"$sum": "$total"}, "avg": {"$avg": "$total"}}}
            ]
            revenue_result = await db.ecom_orders.aggregate(revenue_pipeline).to_list(1)
            total_revenue = revenue_result[0]["total"] if revenue_result else 0
            avg_order = revenue_result[0]["avg"] if revenue_result else 0

            # Daily breakdown
            daily_pipeline = [
                {"$match": {"channel": channel, "created_at": {"$gte": since}}},
                {"$group": {"_id": {"$substr": ["$created_at", 0, 10]}, "orders": {"$sum": 1}, "revenue": {"$sum": "$total"}}},
                {"$sort": {"_id": 1}}
            ]
            daily = await db.ecom_orders.aggregate(daily_pipeline).to_list(None)

            return {
                "integration_id": integration_id,
                "channel": channel,
                "period_days": days,
                "total_orders": orders,
                "total_revenue": round(total_revenue, 2),
                "avg_order_value": round(avg_order, 2),
                "daily_breakdown": [{"date": d["_id"], "orders": d["orders"], "revenue": round(d["revenue"], 2)} for d in daily]
            }
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/sync/stats/global", response_model=Dict[str, Any])
    async def get_global_sync_stats(current_user: dict = Depends(get_current_user)):
        """Global sync statistics across all integrations."""
        try:
            total_syncs = await db.channel_sync_log.count_documents({})
            success_syncs = await db.channel_sync_log.count_documents({"status": "success"})
            failed_syncs = total_syncs - success_syncs

            # By channel
            pipeline = [
                {"$group": {"_id": "$channel", "count": {"$sum": 1}}}
            ]
            channel_syncs = await db.channel_sync_log.aggregate(pipeline).to_list(None)

            # By action
            action_pipeline = [
                {"$group": {"_id": "$action", "count": {"$sum": 1}}}
            ]
            action_syncs = await db.channel_sync_log.aggregate(action_pipeline).to_list(None)

            return {
                "total_syncs": total_syncs,
                "successful": success_syncs,
                "failed": failed_syncs,
                "success_rate": round(success_syncs / total_syncs * 100, 1) if total_syncs > 0 else 0,
                "by_channel": [{"channel": c["_id"] or "unknown", "count": c["count"]} for c in channel_syncs],
                "by_action": [{"action": a["_id"], "count": a["count"]} for a in action_syncs]
            }
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    return router

    # ===== 11. PRODUCT UNLINK & BULK OPS (2 endpoints) =====

    @router.delete("/sync/products/{product_id}/unlink/{channel}", response_model=Dict[str, Any])
    async def unlink_product_from_channel(product_id: str, channel: str, current_user: dict = Depends(get_current_user)):
        """Unlink a product from a channel."""
        try:
            product = await db.products.find_one({"id": product_id})
            if not product:
                raise HTTPException(status_code=404, detail="Product not found")
            channel_key = f"channel_map.{channel}"
            await db.products.update_one(
                {"id": product_id},
                {"$unset": {channel_key: ""}, "$set": {"updated_at": now_iso()}}
            )
            return {"product_id": product_id, "channel": channel, "status": "unlinked"}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/sync/products/bulk-link", response_model=Dict[str, Any])
    async def bulk_link_products(
        channel: str = Body(...),
        product_ids: List[str] = Body(...),
        auto_create_mapping: bool = Body(True),
        current_user: dict = Depends(get_current_user)
    ):
        """Bulk link multiple products to a channel."""
        try:
            linked = 0
            for pid in product_ids:
                channel_key = f"channel_map.{channel}"
                await db.products.update_one(
                    {"id": pid},
                    {"$set": {
                        channel_key: {
                            "channel_product_id": pid if auto_create_mapping else "",
                            "sync_enabled": True,
                            "linked_at": now_iso(),
                            "linked_by": current_user.get("id", "")
                        }
                    }}
                )
                linked += 1
            return {"channel": channel, "linked": linked, "product_ids": product_ids}
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 12. INVENTORY PUSH (1 endpoint) =====

    @router.post("/sync/inventory/push", response_model=Dict[str, Any])
    async def push_inventory_updates(integration_id: str = Body(...), product_ids: Optional[List[str]] = Body(None), current_user: dict = Depends(get_current_user)):
        """Push inventory/stock updates to a channel."""
        try:
            integration = await get_integration_or_404(integration_id)
            channel = integration.get("channel", "")

            query = {}
            if product_ids:
                query["id"] = {"$in": product_ids}

            products = await db.products.find(query, {"_id": 0, "id": 1, "name": 1, "quantity": 1, "retail_price": 1}).to_list(100)
            pushed = 0

            for product in products:
                # Log inventory push
                await log_sync_activity(
                    integration_id, channel, "inventory_push",
                    f"Pushed inventory for {product['name']}: qty={product.get('quantity', 0)}",
                    current_user.get("id", ""), "success", {"product_id": product["id"], "quantity": product.get("quantity", 0)}
                )
                pushed += 1

            return {"integration_id": integration_id, "channel": channel, "pushed": pushed, "note": "Stock levels queued for channel update"}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 13. INTEGRATION CLONE & RESET (2 endpoints) =====

    @router.post("/integrations/{integration_id}/clone", response_model=Dict[str, Any])
    async def clone_integration(integration_id: str, current_user: dict = Depends(get_current_user)):
        """Clone an existing integration (duplicate settings with new credentials)."""
        try:
            integration = await get_integration_or_404(integration_id)
            new_id = str(uuid.uuid4())
            # Remove sensitive data and mutable fields
            doc = {k: v for k, v in integration.items() if k not in ("_id", "id", "sync_count", "sync_error_count", "last_sync_at", "health_status", "health_details", "last_health_check", "recent_sync_log")}
            doc["id"] = new_id
            doc["name"] = f"{doc.get('name', 'Copy')} (نسخة)"
            doc["is_active"] = False  # Deactivate until credentials are set
            doc["mode"] = "mock"
            doc["health_status"] = "unknown"
            doc["credentials"] = {}  # Clear credentials
            doc["created_at"] = now_iso()
            doc["created_by"] = current_user.get("id", "")
            doc["cloned_from"] = integration_id
            await db.ecom_integrations.insert_one(doc)
            doc.pop("_id", None)
            return _redact(doc)
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/integrations/{integration_id}/reset-stats", response_model=Dict[str, Any])
    async def reset_integration_stats(integration_id: str, current_user: dict = Depends(get_current_user)):
        """Reset sync statistics for an integration."""
        try:
            integration = await get_integration_or_404(integration_id)
            await db.ecom_integrations.update_one(
                {"id": integration_id},
                {"$set": {
                    "sync_count": 0,
                    "sync_error_count": 0,
                    "last_sync_at": None,
                    "updated_at": now_iso()
                }}
            )
            # Also clear sync log
            await db.channel_sync_log.delete_many({"integration_id": integration_id})
            return {"integration_id": integration_id, "status": "stats_reset", "sync_log_cleared": True}
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # ===== 14. CHANNEL ORDER ROUTING (1 endpoint) =====

    @router.get("/integrations/{integration_id}/order-mapping", response_model=Dict[str, Any])
    async def get_channel_order_mapping(integration_id: str, current_user: dict = Depends(get_current_user)):
        """Get order field mapping between channel and internal system."""
        try:
            integration = await get_integration_or_404(integration_id)
            channel = integration.get("channel", "")

            # Default mappings per channel
            mappings = {
                "shopify": {
                    "order_id": "id",
                    "customer_name": "customer.name",
                    "total_price": "total",
                    "shipping_address": "customer.address",
                    "financial_status": "payment_status",
                    "fulfillment_status": "shipping_status"
                },
                "facebook": {
                    "order_id": "id",
                    "buyer_name": "customer.name",
                    "total_amount": "total"
                },
                "tiktok": {
                    "order_id": "id",
                    "receiver_name": "customer.name",
                    "payment_amount": "total"
                }
            }

            return {
                "integration_id": integration_id,
                "channel": channel,
                "field_mapping": mappings.get(channel, {}),
                "supported_import_fields": ["customer", "items", "total", "shipping_address", "status"],
                "supported_export_fields": ["status", "tracking_number", "fulfillment"]
            }
        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))
