"""
Smart Supplier Robot
Analyzes supplier performance, compares prices, tracks delivery times
"""
import asyncio
from datetime import datetime, timezone, timedelta
import logging
import uuid

logger = logging.getLogger(__name__)


class SupplierRobot:
    def __init__(self, db, client, notification_service):
        self.db = db
        self.client = client
        self.notification = notification_service
        self.name = "روبوت الموردين"
        self.is_running = False
        self.check_interval = 86400  # daily
        self.last_run = None
        self.stats = {"checks": 0, "alerts_sent": 0, "price_comparisons": 0}

    async def start(self) -> dict:
        self.is_running = True
        logger.info("Supplier Robot started")
        while self.is_running:
            try:
                await self.run_checks()
                self.last_run = datetime.now(timezone.utc).isoformat()
                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Supplier Robot error: {e}")
                await asyncio.sleep(300)

    async def stop(self) -> dict:
        self.is_running = False

    async def run_once(self, **kwargs) -> dict:
        return await self.run_checks()

    async def run_checks(self) -> dict:
        self.stats["checks"] += 1
        results = {
            "performance_scores": await self._score_suppliers(),
            "price_alerts": await self._check_price_changes(),
            "best_deals": await self._find_best_deals(),
            "recommendations": [],
        }

        if results["price_alerts"]:
            results["recommendations"].append({
                "type": "price_change",
                "message_ar": f"تم رصد {len(results['price_alerts'])} تغيير في أسعار الموردين",
                "message_fr": f"{len(results['price_alerts'])} changements de prix détectés",
            })

        return results

    async def _score_suppliers(self) -> dict:
        scores = []
        try:
            dbs = await self.client.list_database_names()
            for db_name in [d for d in dbs if d.startswith("tenant_")]:
                tdb = self.client[db_name]
                suppliers = await tdb.suppliers.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
                for s in suppliers:
                    # Count purchases
                    purchases = await tdb.purchases.count_documents({"supplier_id": s["id"]})
                    # Count defective returns
                    returns = await tdb.supplier_returns.count_documents({"supplier_id": s["id"]})
                    # Score: more purchases + fewer returns = better
                    score = max(0, min(10, 5 + (purchases * 0.5) - (returns * 2)))
                    scores.append({
                        "supplier_id": s["id"],
                        "name": s.get("name", ""),
                        "purchases": purchases,
                        "returns": returns,
                        "score": round(score, 1),
                    })
                scores.sort(key=lambda x: x["score"], reverse=True)
        except Exception:
            pass
        return scores[:20]

    async def _check_price_changes(self) -> dict:
        alerts = []
        try:
            dbs = await self.client.list_database_names()
            for db_name in [d for d in dbs if d.startswith("tenant_")]:
                tdb = self.client[db_name]
                goods = await tdb.supplier_goods.find({}, {"_id": 0}).to_list(500)
                # Group by product_id
                by_product = {}
                for g in goods:
                    pid = g.get("product_id", "")
                    if pid not in by_product:
                        by_product[pid] = []
                    by_product[pid].append(g)
                # Find products with multiple suppliers and big price differences
                for pid, suppliers in by_product.items():
                    if len(suppliers) > 1:
                        prices = [s.get("purchase_price", 0) for s in suppliers]
                        if max(prices) > 0 and (max(prices) - min(prices)) / max(prices) > 0.2:
                            alerts.append({
                                "product_id": pid,
                                "min_price": min(prices),
                                "max_price": max(prices),
                                "difference_pct": round((max(prices) - min(prices)) / max(prices) * 100, 1),
                            })
                            self.stats["price_comparisons"] += 1
        except Exception:
            pass
        return alerts

    async def _find_best_deals(self) -> dict:
        deals = []
        try:
            dbs = await self.client.list_database_names()
            for db_name in [d for d in dbs if d.startswith("tenant_")]:
                tdb = self.client[db_name]
                preferred = await tdb.supplier_goods.find(
                    {"is_preferred": True}, {"_id": 0}
                ).sort("purchase_price", 1).limit(10).to_list(10)
                deals.extend(preferred)
        except Exception:
            pass
        return deals[:10]
