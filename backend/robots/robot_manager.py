"""
Central Robot Manager
Manages lifecycle of all smart robots as FastAPI background tasks.

Enhanced with:
- Watchdog: auto-restarts crashed robots every 5 minutes
- Run history: saves every run to main_db.robot_runs
- Configurable intervals: reads/writes to main_db.robot_config
- Alert escalation: tracks consecutive alerts per tenant
"""
import asyncio
import logging
from datetime import datetime, timezone
from .inventory_robot import InventoryRobot
from .debt_robot import DebtRobot
from .report_robot import ReportRobot
from .customer_robot import CustomerRobot
from .pricing_robot import PricingRobot
from .maintenance_robot import MaintenanceRobot
from .profit_robot import ProfitRobot
from .repair_robot import RepairRobot
from .prediction_robot import PredictionRobot
from .notification_robot import NotificationRobot
from .supplier_robot import SupplierRobot
from .recharge_recovery_robot import RechargeRecoveryRobot
from .commission_robot import CommissionRobot
from .data_integrity_robot import DataIntegrityRobot

logger = logging.getLogger(__name__)

_WATCHDOG_INTERVAL = 300       # 5 minutes
_MAX_RUN_HISTORY = 200         # records kept in main_db.robot_runs


class RobotManager:
    def __init__(self, main_db, client, notification_service, sms_service, email_service):
        self.db = main_db
        self.client = client
        self.notification = notification_service
        self.sms = sms_service
        self.email = email_service
        self.robots = {}
        self.tasks = {}
        self._watchdog_task = None
        self.started_at = None
        self.is_running = False

    def initialize(self) -> None:
        self.robots = {
            "inventory": InventoryRobot(self.db, self.client, self.notification),
            "debt": DebtRobot(self.db, self.client, self.notification, self.sms),
            "report": ReportRobot(self.db, self.client, self.notification, self.email),
            "customer": CustomerRobot(self.db, self.client, self.notification),
            "pricing": PricingRobot(self.db, self.client, self.notification),
            "maintenance": MaintenanceRobot(self.db, self.client, self.notification),
            "profit": ProfitRobot(self.db, self.client, self.notification),
            "repair": RepairRobot(self.db, self.client, self.notification),
            "prediction": PredictionRobot(self.db, self.client, self.notification),
            "notification_bot": NotificationRobot(self.db, self.client, self.notification),
            "supplier": SupplierRobot(self.db, self.client, self.notification),
            "recharge_recovery": RechargeRecoveryRobot(self.db, self.client),
            "commission": CommissionRobot(self.db, self.client),
            "data_integrity": DataIntegrityRobot(self.db, self.client, self.notification),
        }
        logger.info(f"Initialized {len(self.robots)} robots")

    async def _apply_saved_intervals(self) -> None:
        """Load persisted check_interval values from DB and apply to each robot."""
        try:
            configs = await self.db.robot_config.find(
                {}, {"_id": 0, "robot": 1, "interval_seconds": 1}
            ).to_list(100)
            for cfg in configs:
                name = cfg.get("robot")
                interval = cfg.get("interval_seconds")
                if name in self.robots and isinstance(interval, (int, float)) and interval >= 60:
                    self.robots[name].check_interval = int(interval)
                    logger.info(f"Applied saved interval {interval}s for {name}")
        except Exception as e:
            logger.warning(f"Could not load robot intervals: {e}")

    async def start_all(self) -> None:
        if self.is_running:
            logger.warning("Robots already running")
            return
        if not self.robots:
            self.initialize()
        await self._apply_saved_intervals()
        self.is_running = True
        self.started_at = datetime.now(timezone.utc).isoformat()
        for name, robot in self.robots.items():
            task = asyncio.create_task(robot.start(), name=f"robot_{name}")
            self.tasks[name] = task
            logger.info(f"Started robot: {robot.name}")
        self._watchdog_task = asyncio.create_task(self._watchdog(), name="robot_watchdog")
        logger.info("Watchdog started")

    async def stop_all(self) -> None:
        if self._watchdog_task:
            self._watchdog_task.cancel()
            self._watchdog_task = None
        for name, robot in self.robots.items():
            await robot.stop()
            if name in self.tasks:
                self.tasks[name].cancel()
        self.tasks.clear()
        self.is_running = False
        logger.info("All robots stopped")

    async def restart_robot(self, name: str) -> bool:
        if name not in self.robots:
            return False
        robot = self.robots[name]
        await robot.stop()
        if name in self.tasks:
            self.tasks[name].cancel()
        await asyncio.sleep(1)
        task = asyncio.create_task(robot.start(), name=f"robot_{name}")
        self.tasks[name] = task
        logger.info(f"Restarted robot: {robot.name}")
        return True

    async def run_robot_once(self, name: str, triggered_by: str = "manual", **kwargs) -> dict:
        if name not in self.robots:
            return None
        start_time = datetime.now(timezone.utc)
        try:
            result = await self.robots[name].run_once(**kwargs)
        except Exception as e:
            logger.error(f"run_robot_once({name}) failed: {e}")
            result = {"error": str(e)}
        duration_ms = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
        await self._save_run(name, start_time, duration_ms, result, triggered_by)
        return result

    async def _save_run(self, name: str, started_at: datetime, duration_ms: int,
                        stats: dict, triggered_by: str) -> None:
        """Persist a run record to main_db.robot_runs."""
        try:
            record = {
                "robot": name,
                "robot_name": self.robots[name].name if name in self.robots else name,
                "started_at": started_at.isoformat(),
                "duration_ms": duration_ms,
                "stats": stats or {},
                "triggered_by": triggered_by,
            }
            await self.db.robot_runs.insert_one(record)
            # Keep collection size bounded
            count = await self.db.robot_runs.count_documents({})
            if count > _MAX_RUN_HISTORY:
                oldest = await self.db.robot_runs.find(
                    {}, {"_id": 1}
                ).sort("started_at", 1).limit(count - _MAX_RUN_HISTORY).to_list(50)
                ids = [d["_id"] for d in oldest]
                await self.db.robot_runs.delete_many({"_id": {"$in": ids}})
        except Exception as e:
            logger.warning(f"Could not save run history for {name}: {e}")

    async def get_history(self, robot: str = None, limit: int = 20) -> list:
        """Return recent run records from main_db.robot_runs."""
        try:
            query = {"robot": robot} if robot else {}
            runs = await self.db.robot_runs.find(
                query, {"_id": 0}
            ).sort("started_at", -1).limit(limit).to_list(limit)
            return runs
        except Exception as e:
            logger.warning(f"Could not fetch run history: {e}")
            return []

    async def set_interval(self, name: str, interval_seconds: int) -> bool:
        """Persist interval to DB and apply immediately to the running robot."""
        if name not in self.robots:
            return False
        if interval_seconds < 60:
            return False
        self.robots[name].check_interval = interval_seconds
        try:
            await self.db.robot_config.update_one(
                {"robot": name},
                {"$set": {"robot": name, "interval_seconds": interval_seconds,
                           "updated_at": datetime.now(timezone.utc).isoformat()}},
                upsert=True,
            )
        except Exception as e:
            logger.warning(f"Could not persist interval for {name}: {e}")
        logger.info(f"Interval for {name} set to {interval_seconds}s")
        return True

    async def _watchdog(self) -> None:
        """Background loop: detect crashed robot tasks and auto-restart them."""
        while self.is_running:
            try:
                await asyncio.sleep(_WATCHDOG_INTERVAL)
                for name, task in list(self.tasks.items()):
                    if task.done():
                        exc = task.exception() if not task.cancelled() else None
                        logger.error(
                            f"Watchdog: robot '{name}' task ended unexpectedly "
                            f"(exc={exc}). Auto-restarting..."
                        )
                        await self.run_robot_once(name, triggered_by="watchdog_restart")
                        restarted = await self.restart_robot(name)
                        if restarted:
                            logger.info(f"Watchdog: '{name}' restarted successfully")
                        try:
                            from services.notification_service import NotificationService
                            await self.notification.send_to_admins(
                                "system",
                                "تنبيه: روبوت تعطّل وأُعيد تشغيله",
                                f"الروبوت '{self.robots[name].name}' توقف بشكل غير متوقع وتم إعادة تشغيله تلقائياً.",
                                severity="error",
                                category="robots",
                            )
                        except Exception:
                            pass
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Watchdog error: {e}")
                await asyncio.sleep(60)

    def get_status(self) -> dict:
        status = {
            "started_at": self.started_at,
            "is_running": self.is_running,
            "watchdog_active": self._watchdog_task is not None and not (
                self._watchdog_task.done() if self._watchdog_task else True
            ),
            "robots": {},
        }
        for name, robot in self.robots.items():
            task = self.tasks.get(name)
            task_alive = task is not None and not task.done()
            status["robots"][name] = {
                "name": robot.name,
                "is_running": robot.is_running and task_alive,
                "task_alive": task_alive,
                "last_run": robot.last_run,
                "check_interval": robot.check_interval,
                "stats": robot.stats,
            }
        return status
