"""
Smart Profit Robot
Analyzes daily/monthly/yearly profit, detects trends, generates recommendations
"""
import asyncio
from datetime import datetime, timezone, timedelta
import logging
import uuid

logger = logging.getLogger(__name__)


class ProfitRobot:
    def __init__(self, db, client, notification_service):
        self.db = db
        self.client = client
        self.notification = notification_service
        self.name = "روبوت الأرباح"
        self.is_running = False
        self.check_interval = 86400  # daily
        self.last_run = None
        self.stats = {"checks": 0, "alerts_sent": 0, "recommendations": 0}

    async def start(self) -> dict:
        self.is_running = True
        logger.info("Profit Robot started")
        while self.is_running:
            try:
                await self.run_checks()
                self.last_run = datetime.now(timezone.utc).isoformat()
                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Profit Robot error: {e}")
                await asyncio.sleep(300)

    async def stop(self) -> dict:
        self.is_running = False

    async def run_once(self, **kwargs) -> dict:
        return await self.run_checks()

    async def run_checks(self) -> dict:
        self.stats["checks"] += 1
        results = {
            "daily_profit": await self._analyze_daily(),
            "low_margin_products": await self._find_low_margin(),
            "top_profitable": await self._top_profitable(),
            "recommendations": [],
        }

        # Generate recommendations
        if results["low_margin_products"]:
            results["recommendations"].append({
                "type": "low_margin",
                "message_ar": f"يوجد {len(results['low_margin_products'])} منتج بهامش ربح منخفض",
                "message_fr": f"{len(results['low_margin_products'])} produits à faible marge",
                "count": len(results["low_margin_products"]),
            })
            self.stats["recommendations"] += 1

        # Store report
        try:
            dbs = await self.client.list_database_names()
            tenant_dbs = [d for d in dbs if d.startswith("tenant_")]
            for tdb_name in tenant_dbs:
                tdb = self.client[tdb_name]
                await tdb.auto_reports.insert_one({
                    "id": str(uuid.uuid4()),
                    "report_type": "profit_analysis",
                    "robot_name": self.name,
                    "data": results,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
        except Exception as e:
            logger.error(f"Error storing profit report: {e}")

        return results

    async def _analyze_daily(self) -> dict:
        try:
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            dbs = await self.client.list_database_names()
            total_revenue = 0
            total_cost = 0
            for db_name in [d for d in dbs if d.startswith("tenant_")]:
                tdb = self.client[db_name]
                sales = await tdb.sales.find({"date": {"$regex": today}}, {"_id": 0}).to_list(None)
                for sale in sales:
                    total_revenue += sale.get("total", 0)
                    for item in sale.get("items", []):
                        total_cost += item.get("purchase_price", 0) * item.get("quantity", 0)
            return {"revenue": total_revenue, "cost": total_cost, "profit": total_revenue - total_cost}
        except Exception:
            return {"revenue": 0, "cost": 0, "profit": 0}

    async def _find_low_margin(self) -> dict:
        results = []
        try:
            dbs = await self.client.list_database_names()
            for db_name in [d for d in dbs if d.startswith("tenant_")]:
                tdb = self.client[db_name]
                products = await tdb.products.find(
                    {"purchase_price": {"$gt": 0}}, {"_id": 0, "id": 1, "name_ar": 1, "name_en": 1, "purchase_price": 1, "retail_price": 1, "wholesale_price": 1}
                ).to_list(1000)
                for p in products:
                    sell_price = p.get("retail_price", 0) or p.get("wholesale_price", 0)
                    if sell_price <= 0:
                        continue
                    margin = ((sell_price - p.get("purchase_price", 0)) / p.get("purchase_price", 1)) * 100
                    if margin < 10:
                        results.append({"id": p["id"], "name": p.get("name_ar", p.get("name_en", "")), "margin": round(margin, 2)})
        except Exception:
            pass
        return results[:20]

    async def _top_profitable(self) -> dict:
        results = []
        try:
            dbs = await self.client.list_database_names()
            for db_name in [d for d in dbs if d.startswith("tenant_")]:
                tdb = self.client[db_name]
                products = await tdb.products.find(
                    {"purchase_price": {"$gt": 0}}, {"_id": 0, "id": 1, "name_ar": 1, "name_en": 1, "purchase_price": 1, "retail_price": 1, "wholesale_price": 1}
                ).to_list(1000)
                for p in products:
                    sell_price = p.get("retail_price", 0) or p.get("wholesale_price", 0)
                    profit = sell_price - p.get("purchase_price", 0)
                    results.append({"id": p["id"], "name": p.get("name_ar", p.get("name_en", "")), "profit_per_unit": profit})
                results.sort(key=lambda x: x["profit_per_unit"], reverse=True)
        except Exception:
            pass
        return results[:10]
