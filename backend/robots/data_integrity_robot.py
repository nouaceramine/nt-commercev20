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
from core.db_naming import resolve_db_name  # p348

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
            "doctor_runs": 0,
        }
        self._last_doctor_run = None  # weekly golden-template doctor (p32)

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
                tdb = self.client[resolve_db_name(tid)]  # p348
                await self._fix_sale_totals(tenant, tdb)
                await self._fix_negative_quantities(tenant, tdb)
                await self._check_duplicate_barcodes(tenant, tdb)
                await self._close_stale_sessions(tenant, tdb)
                await self._report_orphaned_records(tenant, tdb)
            except Exception as e:
                logger.error(f"Integrity check failed for {tenant.get('id')}: {e}")

        await self._run_weekly_doctor()
        return self.stats

    async def _run_weekly_doctor(self) -> None:
        """Weekly golden-template doctor over every tenant DB (p32): auto-fixes
        missing collections/indexes/seed docs, persists a health snapshot to
        main_db.platform_db_health, and alerts admins on unhealthy tenants."""
        now = datetime.now(timezone.utc)
        last_at = self._last_doctor_run
        if not last_at:
            try:  # persisted cadence survives restarts (p33)
                doc = await self.db.platform_db_health.find_one({}, {"at": 1}, sort=[("at", -1)])
                last_at = doc and doc.get("at")
            except Exception:
                pass
        if last_at:
            try:
                if (now - datetime.fromisoformat(last_at)).days < 7:
                    return
            except (ValueError, TypeError):
                pass
        try:
            from services.tenant_template import doctor_all
            reports = await doctor_all(fix=True)
            unhealthy = [r.get("tenant_id") for r in reports if not r.get("healthy")]
            await self.db.platform_db_health.insert_one({
                "id": str(uuid.uuid4()),
                "at": now.isoformat(),
                "tenants_checked": len(reports),
                "unhealthy": unhealthy,
                "reports": reports,
            })
            self._last_doctor_run = now.isoformat()
            self.stats["doctor_runs"] += 1
            await self._check_db_sizes(now)
            await self._snapshot_golden_template(now)
            await self._refresh_db_tree()
            await self._monthly_restore_test(now)
            logger.info(
                f"Weekly DB doctor: {len(reports)} tenants checked, "
                f"{len(unhealthy)} unhealthy after fix"
            )
            if unhealthy and self.notification:
                try:
                    await self.notification.send_to_admins(
                        None,
                        "فحص قواعد البيانات الأسبوعي",
                        f"بقيت {len(unhealthy)} قاعدة غير سليمة بعد الإصلاح التلقائي: "
                        + ", ".join(unhealthy[:5]),
                        severity="critical",
                        category="integrity",
                    )
                    self.stats["alerts_sent"] += 1
                except Exception as ne:
                    logger.error(f"Doctor alert failed: {ne}")
        except Exception as e:
            logger.error(f"Weekly DB doctor failed: {e}")

    async def _refresh_db_tree(self) -> None:
        """Refresh the mother-tree registry with the weekly cycle (p34, gap 3)."""
        try:
            from services.db_tree import rebuild_tree
            r = await rebuild_tree()
            logger.info(f"db tree refreshed: {r['nodes']} nodes")
        except Exception as e:
            logger.error(f"db tree refresh failed: {e}")

    async def _snapshot_golden_template(self, now) -> None:
        """Weekly golden-template snapshot to /backups (p34, gap 1)."""
        try:
            from services.template_snapshot import snapshot_template, enforce_snapshot_retention
            report = await snapshot_template()
            retention = enforce_snapshot_retention(keep=4)
            logger.info(
                f"template snapshot: {report['collections']} cols / {report['docs']} docs, "
                f"retention removed {len(retention['removed'])}"
            )
        except Exception as e:
            logger.error(f"template snapshot failed: {e}")

    async def _monthly_restore_test(self, now) -> None:
        """Monthly automated restore-test + archive retention (p33, items 7-8)."""
        last = getattr(self, "_last_restore_test", None)
        if not last:
            try:  # persisted cadence survives restarts (p33)
                doc = await self.db.platform_restore_tests.find_one(
                    {}, {"started_at": 1}, sort=[("started_at", -1)]
                )
                last = doc and doc.get("started_at")
            except Exception:
                pass
        if last:
            try:
                if (now - datetime.fromisoformat(last)).days < 30:
                    return
            except (ValueError, TypeError):
                pass
        try:
            from services.restore_test import run_restore_test, enforce_archive_retention
            report = await run_restore_test()
            retention = enforce_archive_retention(keep=5)
            self._last_restore_test = now.isoformat()
            self.stats["restore_tests"] = self.stats.get("restore_tests", 0) + 1
            logger.info(
                f"monthly restore test: ok={report.get('ok')}, "
                f"retention removed {len(retention['removed'])} archives"
            )
            if not report.get("ok") and self.notification:
                try:
                    await self.notification.send_to_admins(
                        None,
                        "فشل اختبار استعادة النسخ الاحتياطية",
                        f"اختبار الاستعادة فشل: {report.get('error') or report.get('mismatches')}",
                        severity="critical",
                        category="integrity",
                    )
                    self.stats["alerts_sent"] += 1
                except Exception as ne:
                    logger.error(f"restore-test alert failed: {ne}")
        except Exception as e:
            logger.error(f"monthly restore test failed: {e}")

    async def _check_db_sizes(self, now) -> None:
        """Alert when any tenant/template DB crosses 500 MB (p32-6). Snapshot is
        stored in main_db.platform_db_sizes for growth tracking."""
        threshold_mb = 500
        try:
            sizes = []
            for name in await self.client.list_database_names():
                if not (name.startswith("tenant_") or name == "template_tenant"):
                    continue
                try:
                    st = await self.client[name].command("dbStats")
                    sizes.append({
                        "db": name,
                        "size_mb": round(st.get("dataSize", 0) / 1048576, 2),
                    })
                except Exception:
                    continue
            over = [x for x in sizes if x["size_mb"] >= threshold_mb]
            await self.db.platform_db_sizes.insert_one({
                "id": str(uuid.uuid4()),
                "at": now.isoformat(),
                "sizes": sizes,
                "over_threshold": [x["db"] for x in over],
            })
            if over and self.notification:
                try:
                    await self.notification.send_to_admins(
                        None,
                        "تنبيه حجم قواعد البيانات",
                        "قواعد تجاوزت 500 ميغابايت: "
                        + ", ".join(f"{x['db']} ({x['size_mb']}MB)" for x in over[:5]),
                        severity="warning",
                        category="integrity",
                    )
                    self.stats["alerts_sent"] += 1
                except Exception as ne:
                    logger.error(f"DB size alert failed: {ne}")
        except Exception as e:
            logger.error(f"DB size check failed: {e}")

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
                {"$match": {"barcode": {"$nin": [None, ""]}}},
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
                    "customer_id": {"$nin": [None, ""]},
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
