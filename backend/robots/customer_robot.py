"""
Customer Analysis Robot
Analyzes customer behavior, segments customers, generates recommendations
"""
import asyncio
from datetime import datetime, timezone, timedelta
import logging
import uuid

logger = logging.getLogger(__name__)


class CustomerRobot:
    def __init__(self, db, client, notification_service):
        self.db = db
        self.client = client
        self.notification = notification_service
        self.name = "روبوت العملاء"
        self.is_running = False
        self.check_interval = 3600 * 12  # every 12 hours
        self.last_run = None
        self.stats = {"checks": 0, "segments_updated": 0, "inactive_found": 0, "vip_found": 0}

    async def start(self) -> dict:
        self.is_running = True
        logger.info("Customer Robot started")
        while self.is_running:
            try:
                await self.run_analysis()
                self.last_run = datetime.now(timezone.utc).isoformat()
                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Customer Robot error: {e}")
                await asyncio.sleep(300)

    async def stop(self) -> dict:
        self.is_running = False

    async def run_analysis(self) -> dict:
        self.stats["checks"] += 1
        tenants = await self.db.saas_tenants.find({"is_active": True}, {"_id": 0}).to_list(500)
        for tenant in tenants:
            try:
                tid = tenant["id"].replace("-", "_")
                tdb = self.client[f"tenant_{tid}"]
                await self._segment_customers(tenant, tdb)
                await self._find_inactive(tenant, tdb)
                await self._find_vip(tenant, tdb)
            except Exception as e:
                logger.error(f"Customer analysis failed for {tenant.get('id')}: {e}")

    async def _segment_customers(self, tenant, tdb) -> dict:
        """Segment customers by purchase frequency and value"""
        ninety_days = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
        pipeline = [
            {"$match": {"created_at": {"$gte": ninety_days}, "customer_id": {"$ne": None}}},
            {"$group": {
                "_id": "$customer_id",
                "name": {"$first": "$customer_name"},
                "total_spent": {"$sum": "$total"},
                "order_count": {"$sum": 1},
                "avg_order": {"$avg": "$total"},
                "last_purchase": {"$max": "$created_at"},
            }},
        ]
        customer_data = await tdb.sales.aggregate(pipeline).to_list(5000)
        if not customer_data:
            return
        avg_spent = sum(c["total_spent"] for c in customer_data) / len(customer_data)
        avg_freq = sum(c["order_count"] for c in customer_data) / len(customer_data)
        segments = []
        for c in customer_data:
            if c["total_spent"] > avg_spent * 2 and c["order_count"] > avg_freq * 1.5:
                seg = "vip"
            elif c["total_spent"] > avg_spent:
                seg = "high_value"
            elif c["order_count"] > avg_freq:
                seg = "frequent"
            elif c["order_count"] == 1:
                seg = "one_time"
            else:
                seg = "regular"
            segments.append({
                "customer_id": c["_id"],
                "customer_name": c.get("name", ""),
                "segment": seg,
                "total_spent": round(c["total_spent"], 2),
                "order_count": c["order_count"],
                "avg_order": round(c["avg_order"], 2),
                "last_purchase": c["last_purchase"],
            })
            await tdb.customers.update_one(
                {"id": c["_id"]},
                {"$set": {"segment": seg, "total_spent_90d": round(c["total_spent"], 2)}},
            )
        self.stats["segments_updated"] += len(segments)
        await tdb.customer_segments.delete_many({"tenant_id": tenant["id"]})
        if segments:
            for s in segments:
                s["tenant_id"] = tenant["id"]
                s["updated_at"] = datetime.now(timezone.utc).isoformat()
            await tdb.customer_segments.insert_many(segments)

    async def _find_inactive(self, tenant, tdb) -> dict:
        """Find customers who haven't purchased in 60+ days"""
        sixty_days = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
        pipeline = [
            {"$match": {"customer_id": {"$ne": None}}},
            {"$group": {"_id": "$customer_id", "name": {"$first": "$customer_name"}, "last": {"$max": "$created_at"}, "total": {"$sum": "$total"}}},
            {"$match": {"last": {"$lt": sixty_days}}},
            {"$sort": {"total": -1}},
            {"$limit": 20},
        ]
        inactive = await tdb.sales.aggregate(pipeline).to_list(20)
        if inactive:
            self.stats["inactive_found"] += len(inactive)
            total_value = sum(c["total"] for c in inactive)
            await self.notification.send_to_admins(
                tenant["id"],
                f"عملاء غير نشطين: {len(inactive)}",
                f"عملاء بقيمة {total_value:,.0f} دج لم يشتروا منذ 60 يوم",
                severity="warning", category="customers",
            )

    async def _find_vip(self, tenant, tdb) -> dict:
        """Find top VIP customers for special attention"""
        thirty_days = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        pipeline = [
            {"$match": {"created_at": {"$gte": thirty_days}, "customer_id": {"$ne": None}}},
            {"$group": {"_id": "$customer_id", "name": {"$first": "$customer_name"}, "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
            {"$sort": {"total": -1}},
            {"$limit": 5},
        ]
        vips = await tdb.sales.aggregate(pipeline).to_list(5)
        if vips:
            self.stats["vip_found"] += len(vips)

    async def run_once(self) -> dict:
        await self.run_analysis()
        self.last_run = datetime.now(timezone.utc).isoformat()
        return self.stats
