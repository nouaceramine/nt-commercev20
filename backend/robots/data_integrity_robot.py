"""
Data Integrity Robot
Scans and AUTO-FIXES data anomalies across all tenant databases:
- Sales with wrong totals  → corrects total_amount
- Negative stock quantities → zeroes them out
- Duplicate barcodes        → flags with alert
- Stale open daily sessions → auto-closes after 48h
- Orphaned sale records     → reports (no delete)
"""
import asyncio
from datetime import datetime, timezone, timedelta
import logging
import uuid

logger = logging.getLogger(__name__)


class DataIntegrityRobot:
    def __init__(self, db, client, notification_service):
        self.db = db
        self.client = client
        self.notification = notification_service
        self.name = "روبوت سلامة البيانات"
        self.is_running = False
        self.check_interval = 3600 * 6  # every 6 hours
        self.last_run = None
        self.stats = {
            "checks": 0,
            "sales_fixed": 0,
            "negative_qty_fixed": 0,
            "duplicate_barcodes": 0,
            "sessions_closed": 0,
            "orphaned_records": 0,
            "alerts_sent": 0,
        }

    async def start(self) -> None:
        self.is_running = True
        logger.info("Data Integrity Robot started")
        while self.is_running:
            try:
                await self.run_checks()
                self.last_run = datetime.now(timezone.utc).isoformat()
                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Data Integrity Robot error: {e}")
                await asyncio.sleep(300)

    async def stop(self) -> None:
        self.is_running = False

    async def run_checks(self) -> dict:
        self.stats["checks"] += 1
        tenants = await self.db.saas_tenants.find(
            {"is_active": True}, {"_id": 0, "id": 1, "name": 1}
        ).to_list(500)

        for tenant in tenants:
            try:
                tid = tenant["id"].replace("-", "_")
                tdb = self.client[f"tenant_{tid}"]
                await self._fix_sale_totals(tenant, tdb)
                await self._fix_negative_quantities(tenant, tdb)
                await self._check_duplicate_barcodes(tenant, tdb)
                await self._close_stale_sessions(tenant, tdb)
                await self._report_orphaned_records(tenant, tdb)
            except Exception as e:
                logger.error(f"Integrity check failed for {tenant.get('id')}: {e}")

        return self.stats

    async def _fix_sale_totals(self, tenant: dict, tdb) -> None:
        """Detect sales where total_amount ≠ sum(items) and correct them."""
        try:
            pipeline = [
                {"$match": {"items": {"$exists": True, "$ne": []}}},
                {"$addFields": {
                    "computed_total": {
                        "$sum": {
                            "$map": {
                                "input": "$items",
                                "as": "item",
                                "in": {
                                    "$multiply": [
                                        {"$ifNull": ["$$item.quantity", 0]},
                                        {"$ifNull": ["$$item.unit_price", 0]},
                                    ]
                                },
                            }
                        }
                    }
                }},
                {"$addFields": {
                    "diff": {
                        "$abs": {
                            "$subtract": [
                                "$computed_total",
                                {"$ifNull": ["$total_amount", 0]},
                            ]
                        }
                    }
                }},
                {"$match": {"diff": {"$gt": 0.5}}},
                {"$limit": 50},
                {"$project": {"_id": 0, "id": 1, "total_amount": 1, "computed_total": 1}},
            ]
            bad_sales = await tdb.sales.aggregate(pipeline).to_list(50)
            if not bad_sales:
                return

            for sale in bad_sales:
                old_total = sale.get("total_amount", 0)
                new_total = round(float(sale.get("computed_total", 0)), 2)
                await tdb.sales.update_one(
                    {"id": sale["id"]},
                    {"$set": {
                        "total_amount": new_total,
                        "_integrity_fixed_at": datetime.now(timezone.utc).isoformat(),
                    }},
                )
                self.stats["sales_fixed"] += 1
                logger.info(
                    f"[{tenant['id']}] Fixed sale {sale['id']}: "
                    f"{old_total} → {new_total}"
                )

            await self.notification.send_to_admins(
                tenant["id"],
                "إصلاح تلقائي: مجاميع مبيعات",
                f"تم تصحيح {len(bad_sales)} فاتورة بمجموع خاطئ تلقائياً.",
                severity="warning",
                category="integrity",
            )
            self.stats["alerts_sent"] += 1
        except Exception as e:
            logger.error(f"[{tenant['id']}] _fix_sale_totals error: {e}")

    async def _fix_negative_quantities(self, tenant: dict, tdb) -> None:
        """Zero out any product with negative stock quantity."""
        try:
            result = await tdb.products.update_many(
                {"quantity": {"$lt": 0}},
                {"$set": {
                    "quantity": 0,
                    "_integrity_fixed_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
            if result.modified_count:
                self.stats["negative_qty_fixed"] += result.modified_count
                logger.warning(
                    f"[{tenant['id']}] Zeroed {result.modified_count} negative-stock products"
                )
                await self.notification.send_to_admins(
                    tenant["id"],
                    "إصلاح تلقائي: مخزون سالب",
                    f"تم تصفير {result.modified_count} منتج بكمية سالبة تلقائياً.",
                    severity="warning",
                    category="integrity",
                )
                self.stats["alerts_sent"] += 1
        except Exception as e:
            logger.error(f"[{tenant['id']}] _fix_negative_quantities error: {e}")

    async def _check_duplicate_barcodes(self, tenant: dict, tdb) -> None:
        """Detect products sharing the same barcode (data entry error)."""
        try:
            pipeline = [
                {"$match": {"barcode": {"$ne": None, "$ne": ""}}},
                {"$group": {"_id": "$barcode", "count": {"$sum": 1}, "names": {"$push": "$name_ar"}}},
                {"$match": {"count": {"$gt": 1}}},
                {"$limit": 20},
            ]
            dupes = await tdb.products.aggregate(pipeline).to_list(20)
            if dupes:
                self.stats["duplicate_barcodes"] += len(dupes)
                names_sample = ", ".join(
                    [f"{d['_id']} ({d['count']} منتجات)" for d in dupes[:3]]
                )
                await self.notification.send_to_admins(
                    tenant["id"],
                    "تنبيه: باركود مكرر",
                    f"يوجد {len(dupes)} باركود مكرر: {names_sample}",
                    severity="warning",
                    category="integrity",
                )
                self.stats["alerts_sent"] += 1
        except Exception as e:
            logger.error(f"[{tenant['id']}] _check_duplicate_barcodes error: {e}")

    async def _close_stale_sessions(self, tenant: dict, tdb) -> None:
        """Auto-close daily sessions open for more than 48 hours."""
        try:
            cutoff = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
            stale = await tdb.daily_sessions.find(
                {"status": "open", "created_at": {"$lt": cutoff}},
                {"_id": 0, "id": 1, "created_at": 1},
            ).to_list(20)

            for session in stale:
                await tdb.daily_sessions.update_one(
                    {"id": session["id"]},
                    {"$set": {
                        "status": "closed",
                        "closed_at": datetime.now(timezone.utc).isoformat(),
                        "close_reason": "auto_closed_by_integrity_robot",
                    }},
                )
                self.stats["sessions_closed"] += 1

            if stale:
                logger.warning(
                    f"[{tenant['id']}] Auto-closed {len(stale)} stale sessions"
                )
                await self.notification.send_to_admins(
                    tenant["id"],
                    "إغلاق تلقائي: جلسات مفتوحة",
                    f"تم إغلاق {len(stale)} جلسة يومية مفتوحة لأكثر من 48 ساعة تلقائياً.",
                    severity="info",
                    category="integrity",
                )
                self.stats["alerts_sent"] += 1
        except Exception as e:
            logger.error(f"[{tenant['id']}] _close_stale_sessions error: {e}")

    async def _report_orphaned_records(self, tenant: dict, tdb) -> None:
        """Detect sales referencing non-existent customers (report only, no delete)."""
        try:
            cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
            recent_sales = await tdb.sales.find(
                {
                    "customer_id": {"$ne": None, "$ne": ""},
                    "created_at": {"$gte": cutoff},
                },
                {"_id": 0, "id": 1, "customer_id": 1},
            ).to_list(200)

            if not recent_sales:
                return

            customer_ids = list({s["customer_id"] for s in recent_sales})
            existing = await tdb.customers.distinct("id", {"id": {"$in": customer_ids}})
            existing_set = set(existing)
            orphaned = [s for s in recent_sales if s["customer_id"] not in existing_set]

            if orphaned:
                self.stats["orphaned_records"] += len(orphaned)
                logger.warning(
                    f"[{tenant['id']}] Found {len(orphaned)} orphaned sale records"
                )
        except Exception as e:
            logger.error(f"[{tenant['id']}] _report_orphaned_records error: {e}")

    async def run_once(self, **kwargs) -> dict:
        await self.run_checks()
        self.last_run = datetime.now(timezone.utc).isoformat()
        return self.stats
