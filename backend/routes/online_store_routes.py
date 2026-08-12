"""
Online Store & WooCommerce Integration Routes
Extracted from server.py
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import re

from services.conversions_api_service import conversions_service
from services.whatsapp_service import whatsapp_service
from services.coupon_service import coupon_service
from services.loyalty_service import loyalty_service
from services.shipping_tracker import shipping_tracker


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
        tenant_id = admin.get("tenant_id") or "platform"
        await db.store_settings.update_one({}, {"$set": settings.model_dump()}, upsert=True)
        if settings.store_slug:
            # Ownership check must look up the SLUG, not the tenant —
            # the previous query-by-tenant made this guard a no-op and
            # allowed two tenants to claim the same public slug.
            existing = await main_db.store_slugs.find_one({"store_slug": settings.store_slug})
            if existing and existing.get("tenant_id") != tenant_id:
                raise HTTPException(status_code=400, detail="هذا الرابط المختصر مستخدم من متجر آخر — اختر رابطاً مختلفاً")
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

    ALLOWED_ORDER_STATUSES = {"pending", "confirmed", "shipped", "delivered", "cancelled", "refunded"}
    STOCK_RESTORING_STATUSES = {"cancelled", "refunded"}

    @router.put("/store/orders/{order_id}/status")
    async def update_store_order_status(order_id: str, data: dict, admin: dict = Depends(get_tenant_admin)):
        status = data.get("status")
        if not status:
            raise HTTPException(status_code=400, detail="status required")
        if status not in ALLOWED_ORDER_STATUSES:
            raise HTTPException(status_code=400, detail=f"حالة غير صالحة. المسموح: {', '.join(sorted(ALLOWED_ORDER_STATUSES))}")
        order = await db.store_orders.find_one({"id": order_id})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        now = datetime.now(timezone.utc).isoformat()
        # Restore stock exactly once when transitioning into cancelled/refunded
        if status in STOCK_RESTORING_STATUSES and not order.get("stock_restored"):
            for item in order.get("items", []):
                pid = item.get("product_id")
                qty = item.get("quantity", 1)
                if pid:
                    await db.products.update_one({"id": pid}, {"$inc": {"quantity": qty}})
            await db.store_orders.update_one({"id": order_id}, {"$set": {"stock_restored": True}})
        await db.store_orders.update_one(
            {"id": order_id},
            {"$set": {"status": status, "updated_at": now}}
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
        tenant_db_inst = main_db if tenant_id == "platform" else get_tenant_db(tenant_id)
        settings = await tenant_db_inst.store_settings.find_one({}, {"_id": 0})
        if not settings or not settings.get("enabled"):
            raise HTTPException(status_code=404, detail="Store not available")

        store_products = await tenant_db_inst.store_products.find({"is_active": True}, {"_id": 0}).to_list(1000)
        product_ids = [sp["product_id"] for sp in store_products]

        products = await tenant_db_inst.products.find(
            {"id": {"$in": product_ids}, "quantity": {"$gt": 0}},
            {"_id": 0, "id": 1, "name_ar": 1, "name_en": 1, "retail_price": 1, 
             "purchase_price": 1, "image_url": 1, "description_ar": 1, 
             "description_en": 1, "quantity": 1, "family_id": 1, "barcode": 1}
        ).to_list(1000)

        family_ids = list(set(p.get("family_id") for p in products if p.get("family_id")))
        families = []
        if family_ids:
            families = await tenant_db_inst.product_families.find(
                {"id": {"$in": family_ids}}, {"_id": 0, "id": 1, "name": 1, "name_ar": 1, "name_en": 1, "image_url": 1}
            ).to_list(100)

        products_by_family = {}
        for family in families:
            family_products = [p for p in products if p.get("family_id") == family["id"]]
            if family_products:
                products_by_family[family["id"]] = {
                    "family": family,
                    "products": family_products
                }

        uncategorized = [p for p in products if not p.get("family_id")]
        total_products = len(products)
        low_stock = len([p for p in products if p.get("quantity", 0) < 5])

        return {
            "success": True,
            "settings": settings,
            "products": products,
            "families": families,
            "products_by_family": products_by_family,
            "uncategorized": uncategorized,
            "stats": {"total_products": total_products, "low_stock": low_stock},
            "tenant_id": tenant_id
        }

    @router.get("/shop/{store_slug}/families")
    async def get_store_families(store_slug: str):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            raise HTTPException(status_code=404, detail="Store not found")
        tenant_id = slug_mapping.get("tenant_id")
        tenant_db_inst = main_db if tenant_id == "platform" else get_tenant_db(tenant_id)
        families = await tenant_db_inst.product_families.find({}, {"_id": 0}).to_list(100)
        return {"success": True, "families": families}

    @router.post("/shop/{store_slug}/order")
    async def create_public_order(store_slug: str, order: StoreOrder):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            raise HTTPException(status_code=404, detail="Store not found")
        tenant_id = slug_mapping.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=404, detail="Store not configured")
        tenant_db_inst = main_db if tenant_id == "platform" else get_tenant_db(tenant_id)
        settings = await tenant_db_inst.store_settings.find_one({"enabled": True})
        if not settings:
            raise HTTPException(status_code=404, detail="Store not available")
        if settings.get("min_order_amount", 0) > 0 and order.subtotal < settings["min_order_amount"]:
            raise HTTPException(status_code=400, detail=f"Minimum order amount is {settings['min_order_amount']}")
        # Atomic stock claim per product (merged duplicates), all-or-nothing —
        # same pattern as POS create_sale_op: conditional find_one_and_update,
        # rollback prior claims on any shortfall
        _claim = {}
        _names = {}
        for item in order.items:
            pid = item.get("product_id")
            if not pid:
                continue
            _claim[pid] = _claim.get(pid, 0) + item.get("quantity", 1)
            _names[pid] = item.get("name", "")
        _claimed = []
        for pid, qty in _claim.items():
            product = await tenant_db_inst.products.find_one({"id": pid}, {"_id": 0, "name_ar": 1, "name_en": 1, "quantity": 1, "is_non_stockable": 1})
            if not product:
                raise HTTPException(status_code=400, detail=f"Product {_names.get(pid, 'Unknown')} not found")
            if product.get("is_non_stockable"):
                continue
            res = await tenant_db_inst.products.find_one_and_update(
                {"id": pid, "quantity": {"$gte": qty}},
                {"$inc": {"quantity": -qty}},
            )
            if res is None:
                for cid, cqty in _claimed:
                    await tenant_db_inst.products.update_one({"id": cid}, {"$inc": {"quantity": cqty}})
                pname = product.get("name_ar") or product.get("name_en") or _names.get(pid, pid)
                raise HTTPException(status_code=400, detail=f"المنتج '{pname}' غير متوفر بالكمية المطلوبة (المتاح {product.get('quantity', 0)})")
            _claimed.append((pid, qty))
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
        # NEW: Send Conversions API Purchase Event
        try:
            await conversions_service.send_purchase(
                order_data["id"],
                order.items,
                order.total,
                f"http://168.231.81.154/shop/{store_slug}/product/{order.items[0].get('product_id', '')}" if order.items else "",
                {
                    "email": order.customer_email,
                    "phone": order.customer_phone
                },
                tenant_id
            )
        except Exception as e:
            logger.error(f"Conversions API error: {e}")

        # NEW: Send WhatsApp Notification
        try:
            await whatsapp_service.send_order_confirmation(
                order.customer_phone,
                order_number,
                order.customer_name,
                order.total,
                [item.model_dump() if hasattr(item, 'model_dump') else item for item in order.items]
            )
        except Exception as e:
            logger.error(f"WhatsApp error: {e}")

        # NEW: Add Loyalty Points
        try:
            await loyalty_service.get_or_create_customer(
                tenant_db_inst,
                order.customer_phone,
                order.customer_name
            )
            await loyalty_service.add_points(
                tenant_db_inst,
                order.customer_phone,
                order.total,
                order_data["id"]
            )
        except Exception as e:
            logger.error(f"Loyalty error: {e}")
        return {"message": "تم استلام طلبك بنجاح", "order_number": order_number, "order_id": order_data["id"]}

    # ── WooCommerce Routes ──

    def _decrypt_wc(settings):
        """Decrypt WooCommerce secrets read from DB (legacy plaintext passes through)."""
        if settings:
            from utils.crypto import decrypt_field
            settings["consumer_key"] = decrypt_field(settings.get("consumer_key"))
            settings["consumer_secret"] = decrypt_field(settings.get("consumer_secret"))
        return settings

    @router.get("/woocommerce/settings")
    async def get_woocommerce_settings(admin: dict = Depends(get_tenant_admin)):
        settings = _decrypt_wc(await db.woocommerce_settings.find_one({"id": "global"}, {"_id": 0}))
        if not settings:
            settings = {"id": "global", "enabled": False, "store_url": "", "consumer_key": "", "consumer_secret": "", "sync_products": True, "sync_orders": True, "sync_customers": True, "last_sync": ""}
            await db.woocommerce_settings.insert_one(settings)
        return settings

    @router.put("/woocommerce/settings")
    async def update_woocommerce_settings(settings: WooCommerceSettings, admin: dict = Depends(get_tenant_admin)):
        from utils.crypto import encrypt_field
        data = settings.model_dump()
        data["consumer_key"] = encrypt_field(data.get("consumer_key"))
        data["consumer_secret"] = encrypt_field(data.get("consumer_secret"))
        await db.woocommerce_settings.update_one({"id": "global"}, {"$set": data}, upsert=True)
        return {"message": "تم حفظ إعدادات WooCommerce"}

    @router.post("/woocommerce/test-connection")
    async def test_woocommerce_connection(admin: dict = Depends(get_tenant_admin)):
        settings = await db.woocommerce_settings.find_one({"id": "global"}, {"_id": 0})
        if not settings or not settings.get("store_url"):
            raise HTTPException(status_code=400, detail="يرجى إدخال رابط المتجر أولاً")
        return {"success": True, "message": "تم الاتصال بالمتجر بنجاح (وضع المحاكاة)", "store_info": {"name": "متجرك", "url": settings.get("store_url"), "version": "8.0.0"}}

    @router.post("/woocommerce/publish-product/{product_id}")
    async def publish_product_to_woocommerce(product_id: str, admin: dict = Depends(get_tenant_admin)):
        wc_settings = _decrypt_wc(await db.woocommerce_settings.find_one({"id": "global"}, {"_id": 0}))
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
        wc_settings = _decrypt_wc(await db.woocommerce_settings.find_one({"id": "global"}, {"_id": 0}))
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

    # NEW: Store Slug Management

    @router.get("/store/slug")
    async def get_store_slug(admin: dict = Depends(get_tenant_admin)):
        tenant_id = admin.get("tenant_id") or "platform"
        slug_mapping = await main_db.store_slugs.find_one({"tenant_id": tenant_id}, {"_id": 0})
        if not slug_mapping:
            return {"success": True, "slug": None, "url": None, "enabled": False}
        base_url = "http://168.231.81.154"
        return {
            "success": True,
            "slug": slug_mapping.get("store_slug"),
            "url": f"{base_url}/shop/{slug_mapping.get('store_slug')}",
            "enabled": slug_mapping.get("enabled", False)
        }

    @router.get("/store/check-slug")
    async def check_slug_availability(slug: str):
        clean = re.sub(r'[^a-zA-Z0-9\-_]', '', slug).lower()
        if len(clean) < 3:
            return {"available": False, "reason": "Slug قصير جداً"}
        existing = await main_db.store_slugs.find_one({"store_slug": clean})
        return {"available": existing is None, "slug": clean}

    # NEW: Public Product Detail

    @router.get("/shop/{store_slug}/product/{product_id}")
    async def get_product_detail(store_slug: str, product_id: str):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            raise HTTPException(status_code=404, detail="Store not found")

        tenant_id = slug_mapping.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=404, detail="Store not configured")

        tenant_db_inst = main_db if tenant_id == "platform" else get_tenant_db(tenant_id)

        store_product = await tenant_db_inst.store_products.find_one(
            {"product_id": product_id, "is_active": True}, {"_id": 0}
        )
        if not store_product:
            raise HTTPException(status_code=404, detail="Product not found in store")

        product = await tenant_db_inst.products.find_one(
            {"id": product_id, "quantity": {"$gt": 0}}, {"_id": 0}
        )
        if not product:
            raise HTTPException(status_code=404, detail="Product not available")

        related_products = await tenant_db_inst.products.find(
            {
                "id": {"$ne": product_id},
                "family_id": product.get("family_id"),
                "quantity": {"$gt": 0}
            },
            {"_id": 0, "id": 1, "name_ar": 1, "name_en": 1, "retail_price": 1, "selling_price": 1, "image_url": 1}
        ).limit(4).to_list(4)

        settings = await tenant_db_inst.store_settings.find_one({}, {"_id": 0}) or {}

        return {
            "success": True,
            "product": product,
            "related_products": related_products,
            "settings": settings
        }

    # ── NEW: Coupon Management ──

    @router.get("/store/coupons")
    async def get_coupons(admin: dict = Depends(get_tenant_admin)):
        coupons = await coupon_service.get_coupons(db, active_only=True)
        return {"success": True, "coupons": coupons}

    @router.post("/store/coupons")
    async def create_coupon(data: dict, admin: dict = Depends(get_tenant_admin)):
        coupon = await coupon_service.create_coupon(db, data)
        return {"success": True, "coupon": coupon}

    @router.delete("/store/coupons/{coupon_id}")
    async def delete_coupon(coupon_id: str, admin: dict = Depends(get_tenant_admin)):
        result = await coupon_service.delete_coupon(db, coupon_id)
        return {"success": result, "message": "تم حذف الكوبون" if result else "فشل الحذف"}

    @router.post("/shop/{store_slug}/validate-coupon")
    async def validate_public_coupon(store_slug: str, data: dict):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            raise HTTPException(status_code=404, detail="Store not found")
        tenant_id = slug_mapping.get("tenant_id")
        tenant_db_inst = main_db if tenant_id == "platform" else get_tenant_db(tenant_id)

        result = await coupon_service.validate_coupon(
            tenant_db_inst,
            data.get("code", ""),
            data.get("subtotal", 0),
            data.get("customer_phone", ""),
            data.get("product_ids", [])
        )
        return result

    # ── NEW: Loyalty Points ──

    @router.get("/store/loyalty/customer/{phone}")
    async def get_customer_loyalty(phone: str, admin: dict = Depends(get_tenant_admin)):
        result = await loyalty_service.get_customer_points(db, phone)
        return {"success": True, "data": result}

    @router.get("/store/loyalty/transactions/{phone}")
    async def get_loyalty_transactions(phone: str, admin: dict = Depends(get_tenant_admin)):
        transactions = await loyalty_service.get_transactions(db, phone)
        return {"success": True, "transactions": transactions}

    @router.post("/shop/{store_slug}/loyalty/redeem")
    async def redeem_loyalty_points(store_slug: str, data: dict):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            raise HTTPException(status_code=404, detail="Store not found")
        tenant_id = slug_mapping.get("tenant_id")
        tenant_db_inst = main_db if tenant_id == "platform" else get_tenant_db(tenant_id)

        result = await loyalty_service.redeem_points(
            tenant_db_inst,
            data.get("phone", ""),
            data.get("points", 0),
            data.get("order_id", "")
        )
        return result

    # ── NEW: Shipping Tracking ──

    @router.post("/store/orders/{order_id}/shipping")
    async def create_shipping_tracking(
        order_id: str,
        data: dict,
        admin: dict = Depends(get_tenant_admin)
    ):
        tracking = await shipping_tracker.create_tracking(
            db, order_id, data.get("carrier", "manual"),
            data.get("tracking_number", ""),
            data.get("status", "pending")
        )
        return {"success": True, "tracking": tracking}

    @router.put("/store/orders/{order_id}/shipping/status")
    async def update_shipping_status(
        order_id: str,
        data: dict,
        admin: dict = Depends(get_tenant_admin)
    ):
        result = await shipping_tracker.update_status(
            db, order_id, data.get("status", ""),
            data.get("location", ""),
            data.get("note", "")
        )

        # Send WhatsApp notification if status changed
        if result:
            order = await db.store_orders.find_one({"id": order_id}, {"_id": 0})
            if order and order.get("customer_phone"):
                await whatsapp_service.send_shipping_update(
                    order["customer_phone"],
                    order_id,
                    data.get("status", ""),
                    data.get("tracking_url", "")
                )

        return {"success": result}

    @router.get("/store/orders/{order_id}/shipping")
    async def get_shipping_tracking(order_id: str, admin: dict = Depends(get_tenant_admin)):
        tracking = await shipping_tracker.get_tracking(db, order_id)
        if tracking:
            tracking["status_display"] = shipping_tracker.get_status_display(tracking.get("status", ""))
        return {"success": True, "tracking": tracking}

    @router.get("/shop/{store_slug}/track/{order_id}")
    async def public_track_order(store_slug: str, order_id: str):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            raise HTTPException(status_code=404, detail="Store not found")
        tenant_id = slug_mapping.get("tenant_id")
        tenant_db_inst = main_db if tenant_id == "platform" else get_tenant_db(tenant_id)

        tracking = await shipping_tracker.get_tracking(tenant_db_inst, order_id)
        order = await tenant_db_inst.store_orders.find_one({"id": order_id}, {"_id": 0})

        if not tracking and not order:
            raise HTTPException(status_code=404, detail="Order not found")

        return {
            "success": True,
            "order": order,
            "tracking": tracking,
            "status_display": shipping_tracker.get_status_display(tracking.get("status", "pending")) if tracking else None
        }

    # ── NEW: Webhook Events (Conversions API) ──

    @router.post("/shop/{store_slug}/events/pageview")
    async def track_page_view(store_slug: str, data: dict):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            return {"tracked": False}

        await conversions_service.send_page_view(
            data.get("url", ""),
            {
                "email": data.get("email", ""),
                "phone": data.get("phone", "")
            },
            slug_mapping.get("tenant_id", "")
        )
        return {"tracked": True}

    @router.post("/shop/{store_slug}/events/view-content")
    async def track_view_content(store_slug: str, data: dict):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            return {"tracked": False}

        await conversions_service.send_view_content(
            data.get("product_id", ""),
            data.get("product_name", ""),
            data.get("price", 0),
            data.get("url", ""),
            {
                "email": data.get("email", ""),
                "phone": data.get("phone", "")
            },
            slug_mapping.get("tenant_id", "")
        )
        return {"tracked": True}

    @router.post("/shop/{store_slug}/events/add-to-cart")
    async def track_add_to_cart(store_slug: str, data: dict):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            return {"tracked": False}

        await conversions_service.send_add_to_cart(
            data.get("product_id", ""),
            data.get("product_name", ""),
            data.get("price", 0),
            data.get("quantity", 1),
            data.get("url", ""),
            {
                "email": data.get("email", ""),
                "phone": data.get("phone", "")
            },
            slug_mapping.get("tenant_id", "")
        )
        return {"tracked": True}

    @router.post("/shop/{store_slug}/events/purchase")
    async def track_purchase_event(store_slug: str, data: dict):
        slug_mapping = await main_db.store_slugs.find_one({"store_slug": store_slug, "enabled": True}, {"_id": 0})
        if not slug_mapping:
            return {"tracked": False}

        await conversions_service.send_purchase(
            data.get("order_id", ""),
            data.get("items", []),
            data.get("total", 0),
            data.get("url", ""),
            {
                "email": data.get("email", ""),
                "phone": data.get("phone", "")
            },
            slug_mapping.get("tenant_id", "")
        )
        return {"tracked": True}

    return router
