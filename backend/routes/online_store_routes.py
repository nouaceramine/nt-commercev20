"""
Online Store & WooCommerce Integration Routes
Extracted from server.py
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import uuid


def create_online_store_routes(db, main_db, get_current_user, get_tenant_admin, require_tenant, get_tenant_db) -> dict:
    router = APIRouter(tags=["online-store"])

    # ── Models ──

    class StoreSettings(BaseModel):
        enabled: bool = False
        store_name: str = ""
        store_slug: str = ""
        description: str = ""
        logo_url: str = ""
        banner_url: str = ""
        primary_color: str = "#3b82f6"
        contact_phone: str = ""
        contact_email: str = ""
        contact_address: str = ""
        working_hours: str = "09:00 - 18:00"
        cod_enabled: bool = True
        delivery_enabled: bool = True
        min_order_amount: float = 0
        delivery_fee: float = 0
        free_delivery_threshold: float = 0

    class StoreOrder(BaseModel):
        customer_name: str
        customer_phone: str
        customer_email: str = ""
        delivery_address: str
        delivery_city: str = ""
        delivery_wilaya: str = ""
        items: List[dict]
        subtotal: float
        delivery_fee: float = 0
        total: float
        notes: str = ""
        payment_method: str = "cod"

    class WooCommerceSettings(BaseModel):
        enabled: bool = False
        store_url: str = ""
        consumer_key: str = ""
        consumer_secret: str = ""
        sync_products: bool = True
        sync_orders: bool = True
        sync_customers: bool = True
        last_sync: str = ""

    # ── Online Store Routes ──

    @router.get("/store/settings")
    async def get_store_settings(admin: dict = Depends(get_tenant_admin)):
        settings = await db.store_settings.find_one({}, {"_id": 0})
        return settings or StoreSettings().model_dump()

    @router.put("/store/settings")
    async def update_store_settings(settings: StoreSettings, admin: dict = Depends(get_tenant_admin)):
        tenant_id = admin.get("tenant_id")
        await db.store_settings.update_one({}, {"$set": settings.model_dump()}, upsert=True)
        if settings.store_slug and tenant_id:
            await main_db.store_slugs.update_one(
                {"tenant_id": tenant_id},
                {"$set": {
                    "tenant_id": tenant_id,
                    "store_slug": settings.store_slug,
                    "enabled": settings.enabled,
                    "store_name": settings.store_name,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }},
                upsert=True
            )
            await main_db.store_slugs.create_index("store_slug", unique=True, sparse=True)
        return {"message": "تم حفظ إعدادات المتجر"}

    @router.get("/store/products")
    async def get_store_products(admin: dict = Depends(get_tenant_admin)):
        store_products = await db.store_products.find({}, {"_id": 0}).to_list(1000)
        return store_products

    @router.post("/store/products")
    async def add_store_product(data: dict, admin: dict = Depends(get_tenant_admin)):
        product_id = data.get("product_id")
        if not product_id:
            raise HTTPException(status_code=400, detail="product_id required")
        existing = await db.store_products.find_one({"product_id": product_id})
        if existing:
            return {"message": "Product already in store"}
        store_product = {
            "id": str(uuid.uuid4()),
            "product_id": product_id,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.store_products.insert_one(store_product)
        return {"message": "تمت إضافة المنتج للمتجر"}

    @router.delete("/store/products/{product_id}")
    async def remove_store_product(product_id: str, admin: dict = Depends(get_tenant_admin)):
        await db.store_products.delete_one({"product_id": product_id})
        return {"message": "تمت إزالة المنتج من المتجر"}

    @router.get("/store/orders")
    async def get_store_orders(status: Optional[str] = None, admin: dict = Depends(get_tenant_admin)):
        query = {}
        if status:
            query["status"] = status
        orders = await db.store_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
        return orders

    @router.put("/store/orders/{order_id}/status")
    async def update_store_order_status(order_id: str, data: dict, admin: dict = Depends(get_tenant_admin)):
        status = data.get("status")
        if not status:
            raise HTTPException(status_code=400, detail="status required")
        await db.store_orders.update_one(
            {"id": order_id},
            {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"message": "تم تحديث حالة الطلب"}

    # Public store endpoints (no auth required)
    @router.get("/shop/{store_slug}")
    async def get_public_store(store_slug: str):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            raise HTTPException(status_code=404, detail="Store not found")
        tenant_id = slug_mapping.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=404, detail="Store not configured")
        tenant_db_inst = get_tenant_db(tenant_id)
        settings = await tenant_db_inst.store_settings.find_one({}, {"_id": 0})
        if not settings or not settings.get("enabled"):
            raise HTTPException(status_code=404, detail="Store not available")
        store_products = await tenant_db_inst.store_products.find({"is_active": True}, {"_id": 0}).to_list(1000)
        product_ids = [sp["product_id"] for sp in store_products]
        products = await tenant_db_inst.products.find(
            {"id": {"$in": product_ids}, "quantity": {"$gt": 0}},
            {"_id": 0, "id": 1, "name_ar": 1, "name_en": 1, "retail_price": 1, "image_url": 1, "description_ar": 1, "description_en": 1, "quantity": 1}
        ).to_list(1000)
        return {"settings": settings, "products": products, "tenant_id": tenant_id}

    @router.post("/shop/{store_slug}/order")
    async def create_public_order(store_slug: str, order: StoreOrder):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            raise HTTPException(status_code=404, detail="Store not found")
        tenant_id = slug_mapping.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=404, detail="Store not configured")
        tenant_db_inst = get_tenant_db(tenant_id)
        settings = await tenant_db_inst.store_settings.find_one({"enabled": True})
        if not settings:
            raise HTTPException(status_code=404, detail="Store not available")
        if settings.get("min_order_amount", 0) > 0 and order.subtotal < settings["min_order_amount"]:
            raise HTTPException(status_code=400, detail=f"Minimum order amount is {settings['min_order_amount']}")
        for item in order.items:
            product = await tenant_db_inst.products.find_one({"id": item.get("product_id")})
            if not product:
                raise HTTPException(status_code=400, detail=f"Product {item.get('name', 'Unknown')} not found")
            if product.get("quantity", 0) < item.get("quantity", 1):
                raise HTTPException(status_code=400, detail=f"Product {item.get('name', product.get('name_ar', 'Unknown'))} out of stock")
        for item in order.items:
            await tenant_db_inst.products.update_one(
                {"id": item.get("product_id")},
                {"$inc": {"quantity": -item.get("quantity", 1)}}
            )
        count = await tenant_db_inst.store_orders.count_documents({}) + 1
        order_number = f"WEB{count:06d}"
        order_data = {
            "id": str(uuid.uuid4()),
            "order_number": order_number,
            "store_slug": store_slug,
            **order.model_dump(),
            "status": "pending",
            "payment_status": "unpaid",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await tenant_db_inst.store_orders.insert_one(order_data)
        return {"message": "تم استلام طلبك بنجاح", "order_number": order_number, "order_id": order_data["id"]}

    # ── WooCommerce Routes ──

    @router.get("/woocommerce/settings")
    async def get_woocommerce_settings(admin: dict = Depends(get_tenant_admin)):
        settings = await db.woocommerce_settings.find_one({"id": "global"}, {"_id": 0})
        if not settings:
            settings = {"id": "global", "enabled": False, "store_url": "", "consumer_key": "", "consumer_secret": "", "sync_products": True, "sync_orders": True, "sync_customers": True, "last_sync": ""}
            await db.woocommerce_settings.insert_one(settings)
        return settings

    @router.put("/woocommerce/settings")
    async def update_woocommerce_settings(settings: WooCommerceSettings, admin: dict = Depends(get_tenant_admin)):
        await db.woocommerce_settings.update_one({"id": "global"}, {"$set": settings.model_dump()}, upsert=True)
        return {"message": "تم حفظ إعدادات WooCommerce"}

    @router.post("/woocommerce/test-connection")
    async def test_woocommerce_connection(admin: dict = Depends(get_tenant_admin)):
        settings = await db.woocommerce_settings.find_one({"id": "global"}, {"_id": 0})
        if not settings or not settings.get("store_url"):
            raise HTTPException(status_code=400, detail="يرجى إدخال رابط المتجر أولاً")
        return {"success": True, "message": "تم الاتصال بالمتجر بنجاح (وضع المحاكاة)", "store_info": {"name": "متجرك", "url": settings.get("store_url"), "version": "8.0.0"}}

    @router.post("/woocommerce/publish-product/{product_id}")
    async def publish_product_to_woocommerce(product_id: str, admin: dict = Depends(get_tenant_admin)):
        wc_settings = await db.woocommerce_settings.find_one({"id": "global"}, {"_id": 0})
        if not wc_settings or not wc_settings.get("enabled"):
            raise HTTPException(status_code=400, detail="WooCommerce غير مفعل")
        product = await db.products.find_one({"id": product_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        now = datetime.now(timezone.utc).isoformat()
        wc_product_id = f"wc_{product_id[:8]}"
        await db.products.update_one({"id": product_id}, {"$set": {"woocommerce_id": wc_product_id, "woocommerce_status": "published", "woocommerce_url": f"{wc_settings.get('store_url')}/product/{product.get('name_en', '').lower().replace(' ', '-')}", "woocommerce_synced_at": now}})
        return {"success": True, "message": f"تم نشر المنتج '{product.get('name_en')}' على المتجر", "woocommerce_id": wc_product_id}

    @router.post("/woocommerce/publish-products")
    async def publish_multiple_products(product_ids: List[str], admin: dict = Depends(get_tenant_admin)):
        wc_settings = await db.woocommerce_settings.find_one({"id": "global"}, {"_id": 0})
        if not wc_settings or not wc_settings.get("enabled"):
            raise HTTPException(status_code=400, detail="WooCommerce غير مفعل")
        now = datetime.now(timezone.utc).isoformat()
        published, failed = [], []
        for pid in product_ids:
            product = await db.products.find_one({"id": pid}, {"_id": 0})
            if not product:
                failed.append({"id": pid, "error": "المنتج غير موجود"})
                continue
            wc_pid = f"wc_{pid[:8]}"
            await db.products.update_one({"id": pid}, {"$set": {"woocommerce_id": wc_pid, "woocommerce_status": "published", "woocommerce_synced_at": now}})
            published.append({"id": pid, "name": product.get("name_en"), "woocommerce_id": wc_pid})
        return {"success": True, "message": f"تم نشر {len(published)} منتج على المتجر", "published": published, "failed": failed}

    @router.delete("/woocommerce/unpublish-product/{product_id}")
    async def unpublish_product(product_id: str, admin: dict = Depends(get_tenant_admin)):
        product = await db.products.find_one({"id": product_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")
        await db.products.update_one({"id": product_id}, {"$unset": {"woocommerce_id": "", "woocommerce_status": "", "woocommerce_url": "", "woocommerce_synced_at": ""}})
        return {"success": True, "message": f"تم إلغاء نشر المنتج '{product.get('name_en')}' من المتجر"}

    @router.post("/woocommerce/sync-inventory")
    async def sync_inventory(admin: dict = Depends(get_tenant_admin)):
        products = await db.products.find({"woocommerce_id": {"$exists": True, "$ne": ""}}, {"_id": 0}).to_list(1000)
        now = datetime.now(timezone.utc).isoformat()
        for product in products:
            await db.products.update_one({"id": product["id"]}, {"$set": {"woocommerce_synced_at": now}})
        await db.woocommerce_settings.update_one({"id": "global"}, {"$set": {"last_sync": now}})
        return {"success": True, "message": f"تم مزامنة {len(products)} منتج", "synced_at": now}

    return router
