"""
Smart Prediction Robot
Uses historical data to predict sales trends, demand, and seasonal patterns
"""
import asyncio
from datetime import datetime, timezone, timedelta
import logging
import uuid

logger = logging.getLogger(__name__)

try:
    import numpy as np
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False


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
        results = {
            "next_7_days": await self._predict_sales(7),
            "next_30_days": await self._predict_sales(30),
            "trends": await self._analyze_trends(),
            "seasonal_patterns": await self._detect_seasonal(),
        }
        self.stats["predictions_made"] += 1

        # Store predictions
        try:
            dbs = await self.client.list_database_names()
            for db_name in [d for d in dbs if d.startswith("tenant_")]:
                tdb = self.client[db_name]
                await tdb.auto_reports.insert_one({
                    "id": str(uuid.uuid4()),
                    "report_type": "prediction",
                    "robot_name": self.name,
                    "data": results,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
        except Exception:
            pass

        return results

    async def _predict_sales(self, days) -> dict:
        try:
            dbs = await self.client.list_database_names()
            total_predicted = 0
            for db_name in [d for d in dbs if d.startswith("tenant_")]:
                tdb = self.client[db_name]
                # Get last 30 days of sales data
                cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
                sales = await tdb.sales.find({"created_at": {"$gte": cutoff}}, {"_id": 0, "total": 1}).to_list(None)
                if sales and ML_AVAILABLE:
                    totals = [s.get("total", 0) for s in sales]
                    daily_avg = np.mean(totals) if totals else 0
                    total_predicted += daily_avg * days
                elif sales:
                    daily_avg = sum(s.get("total", 0) for s in sales) / max(len(sales), 1)
                    total_predicted += daily_avg * days
            return {"predicted_revenue": round(total_predicted, 2), "days": days, "confidence": 0.7 if ML_AVAILABLE else 0.5}
        except Exception:
            return {"predicted_revenue": 0, "days": days, "confidence": 0}

    async def _analyze_trends(self) -> dict:
        try:
            trends = {"direction": "stable", "growth_rate": 0}
            dbs = await self.client.list_database_names()
            for db_name in [d for d in dbs if d.startswith("tenant_")]:
                tdb = self.client[db_name]
                this_month = datetime.now(timezone.utc).replace(day=1).isoformat()
                last_month = (datetime.now(timezone.utc).replace(day=1) - timedelta(days=1)).replace(day=1).isoformat()
                current = await tdb.sales.count_documents({"created_at": {"$gte": this_month}})
                previous = await tdb.sales.count_documents({"created_at": {"$gte": last_month, "$lt": this_month}})
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
