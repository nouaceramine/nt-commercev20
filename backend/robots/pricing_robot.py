"""
Smart Pricing Robot
Analyzes sales data to recommend optimal prices, detects slow-moving products
"""
import asyncio
from datetime import datetime, timezone, timedelta
import logging
import uuid

logger = logging.getLogger(__name__)


class PricingRobot:
    def __init__(self, db, client, notification_service):
        self.db = db
        self.client = client
        self.notification = notification_service
        self.name = "روبوت التسعير"
        self.is_running = False
        self.check_interval = 3600 * 24  # daily
        self.last_run = None
        self.stats = {"checks": 0, "recommendations": 0, "slow_movers": 0, "margin_alerts": 0}

    async def start(self) -> dict:
        self.is_running = True
        logger.info("Pricing Robot started")
        while self.is_running:
            try:
                await self.run_analysis()
                self.last_run = datetime.now(timezone.utc).isoformat()
                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Pricing Robot error: {e}")
                await asyncio.sleep(600)

    async def stop(self) -> dict:
        self.is_running = False

    async def run_analysis(self) -> dict:
        self.stats["checks"] += 1
        tenants = await self.db.saas_tenants.find({"is_active": True}, {"_id": 0}).to_list(500)
        for tenant in tenants:
            try:
                tid = tenant["id"].replace("-", "_")
                tdb = self.client[f"tenant_{tid}"]
                await self._check_margins(tenant, tdb)
                await self._find_slow_movers(tenant, tdb)
                await self._price_recommendations(tenant, tdb)
            except Exception as e:
                logger.error(f"Pricing analysis failed for {tenant.get('id')}: {e}")

    async def _check_margins(self, tenant, tdb) -> dict:
        """Check products with low profit margins"""
        products = await tdb.products.find(
            {"purchase_price": {"$gt": 0}, "price": {"$gt": 0}},
            {"_id": 0, "id": 1, "name": 1, "name_ar": 1, "price": 1, "purchase_price": 1}
        ).to_list(1000)
        low_margin = []
        for p in products:
            margin = ((p["price"] - p["purchase_price"]) / p["price"]) * 100 if p["price"] > 0 else 0
            if margin < 10:
                low_margin.append({
                    "product_id": p["id"],
                    "name": p.get("name_ar", p.get("name", "")),
                    "price": p["price"],
                    "cost": p["purchase_price"],
                    "margin_pct": round(margin, 1),
                })
        if low_margin:
            self.stats["margin_alerts"] += len(low_margin)
            await tdb.pricing_alerts.delete_many({"type": "low_margin", "tenant_id": tenant["id"]})
            for item in low_margin:
                item["type"] = "low_margin"
                item["tenant_id"] = tenant["id"]
                item["created_at"] = datetime.now(timezone.utc).isoformat()
            await tdb.pricing_alerts.insert_many(low_margin)
            if len(low_margin) > 3:
                await self.notification.send_to_admins(
                    tenant["id"],
                    f"تنبيه هوامش ربح: {len(low_margin)} منتج",
                    f"يوجد {len(low_margin)} منتج بهامش ربح أقل من 10%",
                    severity="warning", category="pricing",
                )

    async def _find_slow_movers(self, tenant, tdb) -> dict:
        """Find products with no sales in 30+ days"""
        thirty_days = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        sold_pipeline = [
            {"$match": {"created_at": {"$gte": thirty_days}}},
            {"$unwind": "$items"},
            {"$group": {"_id": "$items.product_id"}},
        ]
        sold_ids = [r["_id"] for r in await tdb.sales.aggregate(sold_pipeline).to_list(5000)]
        slow = await tdb.products.find(
            {"id": {"$nin": sold_ids}, "quantity": {"$gt": 0}},
            {"_id": 0, "id": 1, "name": 1, "name_ar": 1, "price": 1, "quantity": 1}
        ).to_list(100)
        if slow:
            self.stats["slow_movers"] += len(slow)
            await tdb.pricing_alerts.delete_many({"type": "slow_mover", "tenant_id": tenant["id"]})
            for item in slow:
                await tdb.pricing_alerts.insert_one({
                    "type": "slow_mover",
                    "tenant_id": tenant["id"],
                    "product_id": item["id"],
                    "name": item.get("name_ar", item.get("name", "")),
                    "price": item.get("price", 0),
                    "stock": item.get("quantity", 0),
                    "suggestion": "تخفيض 10-20% لتسريع البيع",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })

    async def _price_recommendations(self, tenant, tdb) -> dict:
        """Generate price optimization recommendations based on sales velocity"""
        thirty_days = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        pipeline = [
            {"$match": {"created_at": {"$gte": thirty_days}}},
            {"$unwind": "$items"},
            {"$group": {
                "_id": "$items.product_id",
                "name": {"$first": "$items.product_name"},
                "total_qty": {"$sum": "$items.quantity"},
                "avg_price": {"$avg": "$items.unit_price"},
                "total_revenue": {"$sum": "$items.total"},
            }},
            {"$sort": {"total_revenue": -1}},
            {"$limit": 20},
        ]
        top_sellers = await tdb.sales.aggregate(pipeline).to_list(20)
        recs = []
        for item in top_sellers:
            product = await tdb.products.find_one({"id": item["_id"]}, {"_id": 0, "price": 1, "purchase_price": 1})
            if not product:
                continue
            current_price = product.get("price", 0)
            cost = product.get("purchase_price", 0)
            if cost <= 0 or current_price <= 0:
                continue
            margin = ((current_price - cost) / current_price) * 100
            daily_rate = item["total_qty"] / 30
            if daily_rate > 3 and margin < 25:
                suggested = cost * 1.3
                recs.append({
                    "product_id": item["_id"],
                    "name": item.get("name", ""),
                    "current_price": current_price,
                    "suggested_price": round(suggested, 2),
                    "reason": "منتج سريع البيع - يمكن رفع السعر",
                    "daily_sales": round(daily_rate, 1),
                    "current_margin": round(margin, 1),
                })
        if recs:
            self.stats["recommendations"] += len(recs)
            await tdb.price_recommendations.delete_many({"tenant_id": tenant["id"]})
            for r in recs:
                r["tenant_id"] = tenant["id"]
                r["created_at"] = datetime.now(timezone.utc).isoformat()
            await tdb.price_recommendations.insert_many(recs)

    async def run_once(self) -> dict:
        await self.run_analysis()
        self.last_run = datetime.now(timezone.utc).isoformat()
        return self.stats
