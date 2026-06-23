"""
Maintenance Robot
Cleans old data, optimizes indexes, monitors system health.

Enhanced with:
- Tenant DB health check (size, last activity, document counts)
- Alert escalation: if same alert fires 3 consecutive runs → SMS
"""
import asyncio
from datetime import datetime, timezone, timedelta
import logging

logger = logging.getLogger(__name__)

_ESCALATION_THRESHOLD = 3


class MaintenanceRobot:
    def __init__(self, db, client, notification_service):
        self.db = db
        self.client = client
        self.notification = notification_service
        self.name = "روبوت الصيانة"
        self.is_running = False
        self.check_interval = 3600 * 24  # daily
        self.last_run = None
        self.stats = {
            "checks": 0,
            "records_cleaned": 0,
            "indexes_created": 0,
            "health_checks": 0,
            "tenant_dbs_checked": 0,
        }
        self._consecutive_health_failures = 0

    async def start(self) -> None:
        self.is_running = True
        logger.info("Maintenance Robot started")
        while self.is_running:
            try:
                await self.run_maintenance()
                self.last_run = datetime.now(timezone.utc).isoformat()
                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Maintenance Robot error: {e}")
                await asyncio.sleep(600)

    async def stop(self) -> None:
        self.is_running = False

    async def run_maintenance(self) -> dict:
        self.stats["checks"] += 1
        await self._clean_old_notifications()
        await self._clean_old_logs()
        await self._ensure_indexes()
        await self._health_check()
        await self._tenant_health_check()
        return self.stats

    async def _clean_old_notifications(self) -> None:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
        result = await self.db.push_notifications.delete_many({"created_at": {"$lt": cutoff}})
        if result.deleted_count:
            self.stats["records_cleaned"] += result.deleted_count
            logger.info(f"Cleaned {result.deleted_count} old notifications")

    async def _clean_old_logs(self) -> None:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
        for collection_name in ["system_logs", "sms_log", "ai_chat_history"]:
            try:
                coll = getattr(self.db, collection_name)
                result = await coll.delete_many({"created_at": {"$lt": cutoff}})
                if result.deleted_count:
                    self.stats["records_cleaned"] += result.deleted_count
            except Exception:
                pass
        tenants = await self.db.saas_tenants.find(
            {"is_active": True}, {"_id": 0, "id": 1}
        ).to_list(500)
        cutoff_30 = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        for tenant in tenants:
            try:
                tid = tenant["id"].replace("-", "_")
                tdb = self.client[f"tenant_{tid}"]
                for coll_name in ["reorder_recommendations", "stockout_predictions",
                                   "pricing_alerts", "debt_reminders"]:
                    try:
                        result = await tdb[coll_name].delete_many(
                            {"created_at": {"$lt": cutoff_30}}
                        )
                        self.stats["records_cleaned"] += result.deleted_count
                    except Exception:
                        pass
            except Exception:
                pass

    async def _ensure_indexes(self) -> None:
        tenants = await self.db.saas_tenants.find(
            {"is_active": True}, {"_id": 0, "id": 1}
        ).to_list(500)
        indexes_spec = [
            ("sales", [("created_at", -1)]),
            ("sales", [("customer_id", 1)]),
            ("sales", [("remaining", 1)]),
            ("products", [("quantity", 1)]),
            ("products", [("barcode", 1)]),
            ("products", [("additional_barcodes", 1)]),
            ("customers", [("phone", 1)]),
            ("expenses", [("created_at", -1)]),
            ("purchases", [("created_at", -1)]),
        ]
        created = 0
        for tenant in tenants:
            try:
                tid = tenant["id"].replace("-", "_")
                tdb = self.client[f"tenant_{tid}"]
                for coll_name, keys in indexes_spec:
                    try:
                        await tdb[coll_name].create_index(keys, background=True)
                        created += 1
                    except Exception:
                        pass
            except Exception:
                pass
        self.stats["indexes_created"] += created

    async def _health_check(self) -> None:
        self.stats["health_checks"] += 1
        try:
            tenants = await self.db.saas_tenants.count_documents({"is_active": True})
            total_users = await self.db.users.count_documents({})
            info = {
                "active_tenants": tenants,
                "admin_users": total_users,
                "checked_at": datetime.now(timezone.utc).isoformat(),
            }
            await self.db.system_health.update_one(
                {"id": "latest"},
                {"$set": {**info, "id": "latest"}},
                upsert=True,
            )
            self._consecutive_health_failures = 0
        except Exception as e:
            self._consecutive_health_failures += 1
            logger.error(f"Health check failed: {e}")
            msg = f"فشل فحص صحة النظام: {str(e)[:100]}"
            await self.notification.send_to_admins(
                "system", "تنبيه صحة النظام", msg,
                severity="error", category="system",
            )
            if self._consecutive_health_failures >= _ESCALATION_THRESHOLD:
                try:
                    await self.notification.send_to_admins(
                        "system",
                        "🚨 تصعيد: فشل متكرر في فحص النظام",
                        f"فشل الفحص {self._consecutive_health_failures} مرات متتالية. يرجى التدخل الفوري.",
                        severity="critical",
                        category="system",
                    )
                except Exception:
                    pass

    async def _tenant_health_check(self) -> None:
        """Ping every active tenant DB and collect basic health metrics."""
        tenants = await self.db.saas_tenants.find(
            {"is_active": True}, {"_id": 0, "id": 1, "name": 1}
        ).to_list(500)

        healthy = 0
        unhealthy = 0
        tenant_stats = []

        for tenant in tenants:
            try:
                tid = tenant["id"].replace("-", "_")
                tdb = self.client[f"tenant_{tid}"]

                products_count = await tdb.products.count_documents({})
                sales_count = await tdb.sales.count_documents({})
                customers_count = await tdb.customers.count_documents({})

                cutoff_7d = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
                recent_sales = await tdb.sales.count_documents(
                    {"created_at": {"$gte": cutoff_7d}}
                )

                tenant_stats.append({
                    "tenant_id": tenant["id"],
                    "name": tenant.get("name", tenant["id"]),
                    "products": products_count,
                    "sales": sales_count,
                    "customers": customers_count,
                    "sales_last_7d": recent_sales,
                    "checked_at": datetime.now(timezone.utc).isoformat(),
                })
                healthy += 1
                self.stats["tenant_dbs_checked"] += 1
            except Exception as e:
                unhealthy += 1
                logger.error(f"Tenant health check failed for {tenant.get('id')}: {e}")

        if tenant_stats:
            try:
                await self.db.system_health.update_one(
                    {"id": "tenant_health"},
                    {"$set": {
                        "id": "tenant_health",
                        "tenants": tenant_stats,
                        "healthy_count": healthy,
                        "unhealthy_count": unhealthy,
                        "checked_at": datetime.now(timezone.utc).isoformat(),
                    }},
                    upsert=True,
                )
            except Exception as e:
                logger.error(f"Could not save tenant health: {e}")

        if unhealthy:
            await self.notification.send_to_admins(
                "system",
                "تنبيه: قاعدة بيانات مستأجر غير متاحة",
                f"{unhealthy} قاعدة بيانات مستأجر لم يمكن الوصول إليها.",
                severity="error",
                category="system",
            )

    async def run_once(self) -> dict:
        await self.run_maintenance()
        self.last_run = datetime.now(timezone.utc).isoformat()
        return self.stats
