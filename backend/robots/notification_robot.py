"""
Smart Notification Robot
Generates smart notifications based on system events, thresholds, and patterns
"""
import asyncio
from datetime import datetime, timezone, timedelta
import logging
import uuid

logger = logging.getLogger(__name__)


class NotificationRobot:
    def __init__(self, db, client, notification_service):
        self.db = db
        self.client = client
        self.notification = notification_service
        self.name = "روبوت الإشعارات"
        self.is_running = False
        self.check_interval = 3600  # hourly
        self.last_run = None
        self.stats = {"checks": 0, "notifications_sent": 0}

    async def start(self) -> dict:
        self.is_running = True
        logger.info("Notification Robot started")
        while self.is_running:
            try:
                await self.run_checks()
                self.last_run = datetime.now(timezone.utc).isoformat()
                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Notification Robot error: {e}")
                await asyncio.sleep(300)

    async def stop(self) -> dict:
        self.is_running = False

    async def run_once(self, **kwargs) -> dict:
        return await self.run_checks()

    async def run_checks(self) -> dict:
        self.stats["checks"] += 1
        notifications = []

        # Check expired subscriptions
        expired = await self._check_expired_subscriptions()
        notifications.extend(expired)

        # Check overdue debts
        debts = await self._check_overdue_debts()
        notifications.extend(debts)

        # Check overdue repairs
        repairs = await self._check_overdue_repairs()
        notifications.extend(repairs)

        # Check pending tasks
        tasks = await self._check_pending_tasks()
        notifications.extend(tasks)

        self.stats["notifications_sent"] += len(notifications)

        # Store notifications
        for n in notifications:
            try:
                await self.db.smart_notifications.update_one(
                    {"reference_id": n.get("reference_id"), "type": n.get("type")},
                    {"$set": n, "$setOnInsert": {"id": str(uuid.uuid4()), "read": False}},
                    upsert=True
                )
            except Exception:
                pass

        return {"notifications_generated": len(notifications), "breakdown": {
            "expired_subscriptions": len(expired),
            "overdue_debts": len(debts),
            "overdue_repairs": len(repairs),
            "pending_tasks": len(tasks),
        }}

    async def _check_expired_subscriptions(self) -> dict:
        notifications = []
        try:
            soon = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
            tenants = await self.db.tenants.find(
                {"subscription_end": {"$lt": soon}, "is_active": True},
                {"_id": 0, "id": 1, "name": 1, "subscription_end": 1}
            ).to_list(100)
            for t in tenants:
                notifications.append({
                    "type": "subscription_expiring",
                    "severity": "warning",
                    "title_ar": f"اشتراك {t.get('name', '')} ينتهي قريباً",
                    "title_fr": f"Abonnement de {t.get('name', '')} expire bientôt",
                    "reference_id": t["id"],
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
        except Exception:
            pass
        return notifications

    async def _check_overdue_debts(self) -> dict:
        notifications = []
        try:
            dbs = await self.client.list_database_names()
            for db_name in [d for d in dbs if d.startswith("tenant_")]:
                tdb = self.client[db_name]
                customers = await tdb.customers.find(
                    {"balance": {"$lt": -1000}},
                    {"_id": 0, "id": 1, "name": 1, "balance": 1}
                ).to_list(50)
                for c in customers:
                    notifications.append({
                        "type": "overdue_debt",
                        "severity": "high",
                        "title_ar": f"ديون مرتفعة: {c.get('name', '')} ({abs(c.get('balance', 0)):,.0f} DA)",
                        "title_fr": f"Dette élevée: {c.get('name', '')} ({abs(c.get('balance', 0)):,.0f} DA)",
                        "reference_id": c["id"],
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    })
        except Exception:
            pass
        return notifications

    async def _check_overdue_repairs(self) -> dict:
        notifications = []
        try:
            cutoff = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
            dbs = await self.client.list_database_names()
            for db_name in [d for d in dbs if d.startswith("tenant_")]:
                tdb = self.client[db_name]
                tickets = await tdb.repair_tickets.find(
                    {"status": {"$in": ["received", "diagnosed"]}, "received_at": {"$lt": cutoff}},
                    {"_id": 0, "id": 1, "ticket_number": 1, "customer_name": 1}
                ).to_list(50)
                for t in tickets:
                    notifications.append({
                        "type": "overdue_repair",
                        "severity": "medium",
                        "title_ar": f"تذكرة إصلاح متأخرة: {t.get('ticket_number', '')} - {t.get('customer_name', '')}",
                        "title_fr": f"Réparation en retard: {t.get('ticket_number', '')}",
                        "reference_id": t["id"],
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    })
        except Exception:
            pass
        return notifications

    async def _check_pending_tasks(self) -> dict:
        notifications = []
        try:
            cutoff = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
            dbs = await self.client.list_database_names()
            for db_name in [d for d in dbs if d.startswith("tenant_")]:
                tdb = self.client[db_name]
                tasks = await tdb.tasks.find(
                    {"status": "pending", "created_at": {"$lt": cutoff}},
                    {"_id": 0, "id": 1, "task_number": 1, "title_ar": 1}
                ).to_list(50)
                for t in tasks:
                    notifications.append({
                        "type": "pending_task",
                        "severity": "low",
                        "title_ar": f"مهمة معلقة: {t.get('title_ar', '')}",
                        "title_fr": f"Tâche en attente: {t.get('task_number', '')}",
                        "reference_id": t["id"],
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    })
        except Exception:
            pass
        return notifications
