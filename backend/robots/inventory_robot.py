"""
Smart Inventory Robot
Monitors stock levels, predicts stockouts, sends alerts, reorder recommendations
"""
import asyncio
from datetime import datetime, timezone, timedelta
import logging
import uuid

logger = logging.getLogger(__name__)

# Optional ML imports
try:
    import numpy as np
    from sklearn.linear_model import LinearRegression
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False
    logger.warning("scikit-learn not available - stockout prediction disabled")


class InventoryRobot:
    def __init__(self, db, client, notification_service):
        self.db = db
        self.client = client
        self.notification = notification_service
        self.name = "روبوت المخزون"
        self.is_running = False
        self.check_interval = 3600
        self.last_run = None
        self.stats = {"checks": 0, "alerts_sent": 0, "recommendations": 0, "predictions": 0}

    async def start(self) -> dict:
        self.is_running = True
        logger.info("Inventory Robot started")
        while self.is_running:
            try:
                await self.run_checks()
                self.last_run = datetime.now(timezone.utc).isoformat()
                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Inventory Robot error: {e}")
                await asyncio.sleep(60)

    async def stop(self) -> dict:
        self.is_running = False

    async def run_checks(self) -> dict:
        self.stats["checks"] += 1
        tenants = await self.db.saas_tenants.find({"is_active": True}, {"_id": 0}).to_list(500)
        for tenant in tenants:
            try:
                tid = tenant["id"].replace("-", "_")
                tdb = self.client[f"tenant_{tid}"]
                await self._check_low_stock(tenant, tdb)
                await self._build_reorder_recommendations(tenant, tdb)
                if ML_AVAILABLE:
                    await self._predict_stockout(tenant, tdb)
                await self._cleanup_old_data(tenant, tdb)
            except Exception as e:
                logger.error(f"Inventory check failed for {tenant.get('id')}: {e}")

    async def _check_low_stock(self, tenant, tdb) -> dict:
        low_stock = await tdb.products.find({
            "$expr": {
                "$lte": ["$quantity", {"$ifNull": ["$low_stock_threshold", 10]}]
            }
        }, {"_id": 0}).to_list(100)
        if not low_stock:
            return
        for p in low_stock[:5]:
            await self.notification.send_to_admins(
                tenant["id"],
                "تنبيه مخزون منخفض",
                f"المنتج {p.get('name_ar', p.get('name', ''))} مخزونه منخفض: {p.get('quantity', 0)} قطعة",
                severity="warning",
                category="inventory",
            )
            self.stats["alerts_sent"] += 1
        if len(low_stock) > 10:
            await self.notification.send_to_admins(
                tenant["id"],
                "تنبيه مخزون عام",
                f"يوجد {len(low_stock)} منتج بمخزون منخفض",
                severity="warning",
                category="inventory",
            )

    async def _build_reorder_recommendations(self, tenant, tdb) -> dict:
        thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        pipeline = [
            {"$match": {"created_at": {"$gte": thirty_days_ago}}},
            {"$unwind": {"path": "$items", "preserveNullAndEmptyArrays": False}},
            {"$group": {
                "_id": "$items.product_id",
                "name": {"$first": "$items.product_name"},
                "total_sold": {"$sum": "$items.quantity"},
                "avg_price": {"$avg": "$items.unit_price"},
            }},
            {"$sort": {"total_sold": -1}},
        ]
        sales = await tdb.sales.aggregate(pipeline).to_list(1000)
        recs = []
        for item in sales:
            prod = await tdb.products.find_one({"id": item["_id"]}, {"_id": 0, "quantity": 1, "name": 1, "name_ar": 1})
            if not prod:
                continue
            qty = prod.get("quantity", 0)
            daily_rate = item["total_sold"] / 30
            if daily_rate <= 0:
                continue
            days_left = qty / daily_rate
            if days_left < 7:
                recs.append({
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant["id"],
                    "product_id": item["_id"],
                    "product_name": item.get("name") or prod.get("name_ar", ""),
                    "current_stock": qty,
                    "daily_sales_rate": round(daily_rate, 2),
                    "days_until_out": round(days_left, 1),
                    "recommended_order": int(daily_rate * 60),
                    "urgency": "high" if days_left < 3 else "medium",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
        if recs:
            await tdb.reorder_recommendations.delete_many({"tenant_id": tenant["id"]})
            await tdb.reorder_recommendations.insert_many(recs)
            self.stats["recommendations"] += len(recs)

    async def _predict_stockout(self, tenant, tdb) -> dict:
        popular = await tdb.products.find({}, {"_id": 0}).sort("sales_count", -1).limit(20).to_list(20)
        predictions = []
        for product in popular:
            pid = product.get("id")
            if not pid:
                continue
            thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
            pipeline = [
                {"$match": {"created_at": {"$gte": thirty_days_ago}, "items.product_id": pid}},
                {"$unwind": "$items"},
                {"$match": {"items.product_id": pid}},
                {"$group": {"_id": {"$substr": ["$created_at", 0, 10]}, "quantity": {"$sum": "$items.quantity"}}},
                {"$sort": {"_id": 1}},
            ]
            daily_sales = await tdb.sales.aggregate(pipeline).to_list(30)
            if len(daily_sales) >= 7:
                X = np.array(range(len(daily_sales))).reshape(-1, 1)
                y = np.array([d["quantity"] for d in daily_sales])
                model = LinearRegression()
                model.fit(X, y)
                future_X = np.array(range(len(daily_sales), len(daily_sales) + 7)).reshape(-1, 1)
                preds = model.predict(future_X)
                avg_daily = max(np.mean(preds), 0.01)
                current_stock = product.get("quantity", 0)
                days_until_out = current_stock / avg_daily
                if days_until_out < 14:
                    predictions.append({
                        "id": str(uuid.uuid4()),
                        "tenant_id": tenant["id"],
                        "product_id": pid,
                        "product_name": product.get("name_ar", product.get("name", "")),
                        "current_stock": current_stock,
                        "avg_daily_sales": round(float(avg_daily), 2),
                        "predicted_stockout_date": (datetime.now(timezone.utc) + timedelta(days=days_until_out)).isoformat(),
                        "days_remaining": round(float(days_until_out), 1),
                        "confidence": min(0.9, len(daily_sales) / 30),
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    })
        if predictions:
            await tdb.stockout_predictions.delete_many({"tenant_id": tenant["id"]})
            await tdb.stockout_predictions.insert_many(predictions)
            self.stats["predictions"] += len(predictions)
            critical = [p for p in predictions if p["days_remaining"] < 3]
            if critical:
                await self.notification.send_to_admins(
                    tenant["id"],
                    "تنبيه حرج - مخزون سينفد قريبا",
                    f"هناك {len(critical)} منتج سينفد خلال 3 ايام",
                    severity="error",
                    category="inventory",
                )

    async def _cleanup_old_data(self, tenant, tdb) -> dict:
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        try:
            await tdb.reorder_recommendations.delete_many({"created_at": {"$lt": week_ago}})
            await tdb.stockout_predictions.delete_many({"created_at": {"$lt": week_ago}})
        except Exception:
            pass

    async def run_once(self) -> dict:
        await self.run_checks()
        self.last_run = datetime.now(timezone.utc).isoformat()
        return self.stats
