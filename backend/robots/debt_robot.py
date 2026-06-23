"""
Smart Debt Collection Robot
Tracks overdue debts, sends reminders, analyzes collection performance
"""
import asyncio
from datetime import datetime, timezone, timedelta
import logging
import uuid

logger = logging.getLogger(__name__)


class DebtRobot:
    def __init__(self, db, client, notification_service, sms_service):
        self.db = db
        self.client = client
        self.notification = notification_service
        self.sms = sms_service
        self.name = "روبوت الديون"
        self.is_running = False
        self.check_interval = 3600 * 6
        self.last_run = None
        self.stats = {"checks": 0, "reminders_sent": 0, "overdue_found": 0, "sms_sent": 0}

    async def start(self) -> dict:
        self.is_running = True
        logger.info("Debt Robot started")
        while self.is_running:
            try:
                await self.run_collection_checks()
                self.last_run = datetime.now(timezone.utc).isoformat()
                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Debt Robot error: {e}")
                await asyncio.sleep(300)

    async def stop(self) -> dict:
        self.is_running = False

    async def run_collection_checks(self) -> dict:
        self.stats["checks"] += 1
        tenants = await self.db.saas_tenants.find({"is_active": True}, {"_id": 0}).to_list(500)
        for tenant in tenants:
            try:
                tid = tenant["id"].replace("-", "_")
                tdb = self.client[f"tenant_{tid}"]
                settings = await tdb.settings.find_one({"id": "general"}, {"_id": 0}) or {}
                min_debt = settings.get("min_debt_amount", 1000)
                await self._check_new_debts(tenant, tdb, min_debt)
                await self._check_overdue(tenant, tdb)
                await self._send_debt_reminders(tenant, tdb, min_debt)
                await self._analyze_collection(tenant, tdb)
            except Exception as e:
                logger.error(f"Debt check failed for {tenant.get('id')}: {e}")

    async def _check_new_debts(self, tenant, tdb, min_debt) -> dict:
        today = datetime.now(timezone.utc).date()
        today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
        new_debts = await tdb.sales.find({
            "created_at": {"$gte": today_start.isoformat()},
            "remaining": {"$gt": min_debt},
        }, {"_id": 0, "remaining": 1}).to_list(100)
        if new_debts:
            total = sum(d.get("remaining", 0) for d in new_debts)
            await self.notification.send_to_admins(
                tenant["id"],
                "ديون جديدة اليوم",
                f"تم انشاء {len(new_debts)} دين جديد بقيمة {total:,.0f} دج",
                severity="info",
                category="finance",
            )

    async def _check_overdue(self, tenant, tdb) -> dict:
        now = datetime.now(timezone.utc)
        thresholds = [
            (7, "تذكير اول", "info"),
            (14, "تذكير ثاني", "warning"),
            (30, "دين متاخر", "error"),
        ]
        for days, label, severity in thresholds:
            cutoff = (now - timedelta(days=days)).isoformat()
            overdue = await tdb.sales.find({
                "remaining": {"$gt": 0},
                "created_at": {"$lte": cutoff},
            }, {"_id": 0, "id": 1, "customer_name": 1, "remaining": 1}).to_list(200)
            if not overdue:
                continue
            self.stats["overdue_found"] += len(overdue)
            total = sum(d.get("remaining", 0) for d in overdue)
            await self.notification.send_to_admins(
                tenant["id"],
                f"{label} - {len(overdue)} دين",
                f"ديون متاخرة +{days} يوم بقيمة {total:,.0f} دج",
                severity=severity,
                category="finance",
            )
            self.stats["reminders_sent"] += 1

    async def _send_debt_reminders(self, tenant, tdb, min_debt) -> dict:
        settings = await tdb.settings.find_one({"id": "global"}, {"_id": 0}) or {}
        if not settings.get("auto_reminder_enabled"):
            return
        reminder_days = [7, 14, 30]
        for days in reminder_days:
            target_date = (datetime.now(timezone.utc) - timedelta(days=days))
            target_str = target_date.strftime("%Y-%m-%d")
            debts = await tdb.sales.find({
                "created_at": {"$gte": f"{target_str}T00:00:00", "$lte": f"{target_str}T23:59:59"},
                "remaining": {"$gt": min_debt},
            }, {"_id": 0, "id": 1, "customer_id": 1, "remaining": 1}).to_list(100)
            for debt in debts:
                cid = debt.get("customer_id")
                if not cid:
                    continue
                customer = await tdb.customers.find_one({"id": cid}, {"_id": 0, "name": 1, "phone": 1})
                if customer and customer.get("phone"):
                    msg = (
                        f"السلام عليكم {customer.get('name', '')}،\n"
                        f"نذكركم بوجود فاتورة بقيمة {debt['remaining']:,.0f} دج مستحقة منذ {days} يوم.\n"
                        f"NT Commerce"
                    )
                    await self.sms.send_sms(customer["phone"], msg)
                    self.stats["sms_sent"] += 1
                    await tdb.debt_reminders.insert_one({
                        "id": str(uuid.uuid4()),
                        "customer_id": cid,
                        "debt_id": debt.get("id"),
                        "amount": debt["remaining"],
                        "days_overdue": days,
                        "sent_at": datetime.now(timezone.utc).isoformat(),
                    })

    async def _analyze_collection(self, tenant, tdb) -> dict:
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        debt_pipeline = [
            {"$match": {"remaining": {"$gt": 0}}},
            {"$group": {"_id": None, "total": {"$sum": "$remaining"}, "count": {"$sum": 1}}},
        ]
        debt_result = await tdb.sales.aggregate(debt_pipeline).to_list(1)
        total_debt = debt_result[0]["total"] if debt_result else 0
        debt_count = debt_result[0]["count"] if debt_result else 0
        payment_pipeline = [
            {"$match": {"created_at": {"$gte": month_start.isoformat()}, "type": {"$in": ["debt_payment", "payment"]}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
        ]
        pay_result = await tdb.cash_box_transactions.aggregate(payment_pipeline).to_list(1)
        collected = pay_result[0]["total"] if pay_result else 0
        rate = (collected / total_debt * 100) if total_debt > 0 else 100
        await self.db.collection_reports.update_one(
            {"tenant_id": tenant["id"], "month": month_start.strftime("%Y-%m")},
            {"$set": {
                "tenant_id": tenant["id"],
                "month": month_start.strftime("%Y-%m"),
                "total_debt": round(total_debt, 2),
                "debt_count": debt_count,
                "collected": round(collected, 2),
                "collection_rate": round(rate, 2),
                "updated_at": now.isoformat(),
            }},
            upsert=True,
        )
        if rate < 30 and total_debt > 0:
            await self.notification.send_to_admins(
                tenant["id"],
                "تنبيه تحصيل الديون",
                f"نسبة التحصيل {rate:.0f}% فقط - ديون مستحقة: {total_debt:,.0f} دج",
                severity="error",
                category="finance",
            )

    async def run_once(self) -> dict:
        await self.run_collection_checks()
        self.last_run = datetime.now(timezone.utc).isoformat()
        return self.stats
