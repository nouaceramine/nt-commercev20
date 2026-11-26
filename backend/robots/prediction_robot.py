"""
Smart Prediction Robot
Uses historical data to predict sales trends, demand, and seasonal patterns
"""
import asyncio
from datetime import datetime, timezone, timedelta
import logging
from core.db_naming import (  # p348/p480
    drop_db_if_tenant_deleted,
    is_tenant_db,
    tenant_db_is_active,
)

logger = logging.getLogger(__name__)

try:
    import numpy as np  # noqa: F401 — kept for compat; not required after refactor
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = True  # we now use pure-Python statistics


class PredictionRobot:
    def __init__(self, db, client, notification_service):
        self.db = db
        self.client = client
        self.notification = notification_service
        self.name = "روبوت التوقعات"
        self.is_running = False
        self.check_interval = 86400  # daily
        self.last_run = None
        self.stats = {"checks": 0, "predictions_made": 0}

    async def start(self) -> dict:
        self.is_running = True
        logger.info("Prediction Robot started")
        while self.is_running:
            try:
                await self.run_checks()
                self.last_run = datetime.now(timezone.utc).isoformat()
                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Prediction Robot error: {e}")
                await asyncio.sleep(300)

    async def stop(self) -> dict:
        self.is_running = False

    async def run_once(self, **kwargs) -> dict:
        return await self.run_checks()

    async def run_checks(self) -> dict:
        self.stats["checks"] += 1
        # p554: compute PER TENANT and store PER TENANT — the old flow combined
        # every tenant's sales into one prediction and wrote it into EACH
        # tenant's auto_reports (cross-tenant figures for everyone).
        # Store predictions — p297: one row per (tenant, report_type, day);
        # repeated cycles within a day OVERWRITE the same row (idempotent), and
        # rows older than 90 days are swept. Stops the unbounded pile-up.
        # p562-003: same leak class as profit — the LAST tenant's revenue
        # figures/trends were returned to any tenant admin via /robots/run
        # and persisted in robot_runs. Counts only; per-tenant writes kept.
        tenants_processed = 0
        reports_written = 0
        try:
            dbs = await self.client.list_database_names()
            now = datetime.now(timezone.utc)
            day = now.strftime("%Y-%m-%d")
            cutoff = (now - timedelta(days=90)).isoformat()
            for db_name in [d for d in dbs if is_tenant_db(d)]:
                if not await tenant_db_is_active(self.db, db_name):
                    continue
                tdb = self.client[db_name]
                results = {
                    "next_7_days": await self._predict_sales(tdb, 7),
                    "next_30_days": await self._predict_sales(tdb, 30),
                    "trends": await self._analyze_trends(tdb),
                    "seasonal_patterns": await self._detect_seasonal(),
                }
                self.stats["predictions_made"] += 1
                tenants_processed += 1
                await tdb.auto_reports.create_index(
                    [("report_type", 1), ("day", 1)],
                    unique=True,
                    partialFilterExpression={"day": {"$type": "string"}},
                    name="uniq_report_day",
                )
                await tdb.auto_reports.update_one(
                    {"report_type": "prediction", "day": day},
                    {"$set": {
                        "id": f"prediction-{day}",
                        "report_type": "prediction",
                        "robot_name": self.name,
                        "day": day,
                        "data": results,
                        "created_at": now.isoformat(),
                    }},
                    upsert=True,
                )
                await tdb.auto_reports.delete_many({"created_at": {"$lt": cutoff}})
                reports_written += 1
                await drop_db_if_tenant_deleted(self.db, self.client, db_name)
        except Exception:
            pass

        return {"tenants_processed": tenants_processed,
                "reports_written": reports_written}

    async def _predict_sales(self, tdb, days) -> dict:
        # p554: per-tenant history, returned sales excluded (doctrine), and a
        # bounded read instead of to_list(None).
        try:
            cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
            sales = await tdb.sales.find(
                {"created_at": {"$gte": cutoff}, "status": {"$ne": "returned"}},
                {"_id": 0, "total": 1}).to_list(10000)
            total_predicted = 0
            if sales and ML_AVAILABLE:
                totals = [s.get("total", 0) for s in sales]
                daily_avg = (sum(totals) / len(totals)) if totals else 0
                total_predicted += daily_avg * days
            elif sales:
                daily_avg = sum(s.get("total", 0) for s in sales) / max(len(sales), 1)
                total_predicted += daily_avg * days
            return {"predicted_revenue": round(total_predicted, 2), "days": days, "confidence": 0.7 if ML_AVAILABLE else 0.5}
        except Exception:
            return {"predicted_revenue": 0, "days": days, "confidence": 0}

    async def _analyze_trends(self, tdb) -> dict:
        # p554: per-tenant trend — the old loop let the LAST tenant overwrite
        # the shared result stored everywhere.
        try:
            trends = {"direction": "stable", "growth_rate": 0}
            this_month = datetime.now(timezone.utc).replace(day=1).isoformat()
            last_month = (datetime.now(timezone.utc).replace(day=1) - timedelta(days=1)).replace(day=1).isoformat()
            current = await tdb.sales.count_documents({"created_at": {"$gte": this_month}, "status": {"$ne": "returned"}})
            previous = await tdb.sales.count_documents({"created_at": {"$gte": last_month, "$lt": this_month}, "status": {"$ne": "returned"}})
            if previous > 0:
                growth = ((current - previous) / previous) * 100
                trends["growth_rate"] = round(growth, 2)
                trends["direction"] = "up" if growth > 5 else ("down" if growth < -5 else "stable")
            return trends
        except Exception:
            return {"direction": "unknown", "growth_rate": 0}

    async def _detect_seasonal(self) -> dict:
        return {
            "current_month": datetime.now(timezone.utc).strftime("%B"),
            "expected_demand": "normal",
            "note": "Seasonal analysis requires 12+ months of data",
        }
