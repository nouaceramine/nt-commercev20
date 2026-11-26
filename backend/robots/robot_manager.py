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
import functools
import json
import logging
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
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
from .reactivation_robot import ReactivationRobot

logger = logging.getLogger(__name__)

_WATCHDOG_INTERVAL = 300       # 5 minutes
_MAX_RUN_HISTORY = 200         # records kept in main_db.robot_runs
_CONFIG_CHANNEL = "nt:robot_config"  # p513: cross-worker interval propagation
_RUN_LEASE_TTL = 900           # p562: crash-failover window for run leases
_MAX_CYCLE_TOMBSTONES = 500    # p562: bounded per-(robot, slot) tombstones
_RUN_CLAIMS = "robot_run_claims"
_CYCLE_SLOTS = "robot_cycle_slots"


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
        self._redis = None
        self._config_listener = None
        self.started_at = None
        self.is_running = False
        # p562: serializes start/stop/restart so concurrent lifecycle calls
        # never orphan live robot loops (was: x4 restarts -> 4 live loops).
        self._lifecycle_lock = asyncio.Lock()

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
            "reactivation": ReactivationRobot(self.db, self.client, self.notification, self.sms),
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
        async with self._lifecycle_lock:  # p562: re-entrancy was a loop doubler
            if self.is_running:
                logger.warning("Robots already running")
                return
            if not self.robots:
                self.initialize()
            self._install_cycle_guards()  # p562: one worker executes each cycle
            await self._apply_saved_intervals()
            self.is_running = True
            self.started_at = datetime.now(timezone.utc).isoformat()
            for name, robot in self.robots.items():
                task = asyncio.create_task(robot.start(), name=f"robot_{name}")
                self.tasks[name] = task
                logger.info(f"Started robot: {robot.name}")
            self._watchdog_task = asyncio.create_task(self._watchdog(), name="robot_watchdog")
            logger.info("Watchdog started")
            # p513: listen for interval changes made via OTHER uvicorn workers
            self._config_listener = asyncio.create_task(
                self._config_sub(), name="robot_config_listener")

    async def stop_all(self) -> None:
        async with self._lifecycle_lock:  # p562
            if self._config_listener:
                self._config_listener.cancel()
                self._config_listener = None
            if self._redis is not None:
                try:
                    await self._redis.aclose()
                except Exception:
                    pass
                self._redis = None
            if self._watchdog_task:
                self._watchdog_task.cancel()
                self._watchdog_task = None
            pending = []
            for name, robot in self.robots.items():
                await robot.stop()
                task = self.tasks.get(name)
                if task:
                    task.cancel()
                    pending.append(task)
            if pending:
                # p562: actually wait for the loops to end — cancel() alone
                # left them pending past shutdown ("Task was destroyed").
                await asyncio.gather(*pending, return_exceptions=True)
            self.tasks.clear()
            self.is_running = False
            logger.info("All robots stopped")

    async def restart_robot(self, name: str) -> bool:
        if name not in self.robots:
            return False
        async with self._lifecycle_lock:  # p562: serialize concurrent restarts
            robot = self.robots[name]
            await robot.stop()
            task = self.tasks.get(name)
            if task:
                task.cancel()
                # p562: wait for the old loop to die — cancel()+sleep(1) left
                # orphan loops running alongside the replacement.
                await asyncio.gather(task, return_exceptions=True)
            new_task = asyncio.create_task(robot.start(), name=f"robot_{name}")
            self.tasks[name] = new_task
            logger.info(f"Restarted robot: {robot.name}")
        return True

    async def run_robot_once(self, name: str, triggered_by: str = "manual", **kwargs) -> dict:
        if name not in self.robots:
            return None
        # p562: distributed run lease — concurrent manual runs (double click,
        # two admins, N workers) must not multiply tenant-facing effects.
        token = await self._try_lease(name, kind="manual")
        if token is None:
            return {"busy": True}
        robot = self.robots[name]
        robot._p562_manual = True  # the cycle guard yields to the manual lease
        start_time = datetime.now(timezone.utc)
        try:
            try:
                result = await robot.run_once(**kwargs)
            except Exception as e:
                logger.error(f"run_robot_once({name}) failed: {e}")
                result = {"error": str(e)}
            duration_ms = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
            await self._save_run(name, start_time, duration_ms, result, triggered_by)
            return result
        finally:
            robot._p562_manual = False
            await self._release_lease(name, token)

    # ── p562: distributed run leases + per-cycle tombstones ─────────────
    async def _try_lease(self, name: str, kind: str) -> str | None:
        """Timed mutual-exclusion lease in main_db.robot_run_claims (_id=robot).
        The winner runs; losers get None. Stale leases are taken over, so a
        crashed worker blocks a robot for at most _RUN_LEASE_TTL seconds."""
        now = datetime.now(timezone.utc)
        token = f"{kind}-{uuid.uuid4().hex[:12]}"
        try:
            await self.db[_RUN_CLAIMS].find_one_and_update(
                {"_id": name, "expires_at": {"$lt": now.isoformat()}},
                {"$set": {"token": token, "kind": kind,
                          "expires_at": (now + timedelta(seconds=_RUN_LEASE_TTL)).isoformat()}},
                upsert=True, return_document=ReturnDocument.AFTER)
            return token
        except DuplicateKeyError:
            return None

    async def _release_lease(self, name: str, token: str) -> None:
        try:
            await self.db[_RUN_CLAIMS].delete_one({"_id": name, "token": token})
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Could not release run lease for {name}: {e}")

    async def _try_cycle_slot(self, name: str, slot: int) -> bool:
        """Permanent per-(robot, slot) tombstone: each scheduled slot executes
        on ONE worker exactly once, even after the lease is released."""
        try:
            await self.db[_CYCLE_SLOTS].insert_one({
                "_id": f"{name}:{slot}", "robot": name, "slot": slot,
                "created_at": datetime.now(timezone.utc).isoformat()})
            asyncio.create_task(self._trim_cycle_slots())
            return True
        except DuplicateKeyError:
            return False
        except Exception as e:  # noqa: BLE001
            logger.warning(f"cycle slot claim failed for {name}: {e}")
            return False

    async def _trim_cycle_slots(self) -> None:
        try:
            count = await self.db[_CYCLE_SLOTS].count_documents({})
            if count > _MAX_CYCLE_TOMBSTONES:
                oldest = await self.db[_CYCLE_SLOTS].find(
                    {}, {"_id": 1}
                ).sort("created_at", 1).limit(count - _MAX_CYCLE_TOMBSTONES).to_list(100)
                await self.db[_CYCLE_SLOTS].delete_many(
                    {"_id": {"$in": [d["_id"] for d in oldest]}})
        except Exception:  # noqa: BLE001
            pass

    async def _persisted_interval(self, name: str) -> int | None:
        """Slot identity must agree across workers — use the persisted
        interval (source of truth), falling back to in-memory."""
        try:
            cfg = await self.db.robot_config.find_one(
                {"robot": name}, {"_id": 0, "interval_seconds": 1})
            val = (cfg or {}).get("interval_seconds")
            if isinstance(val, (int, float)) and val >= 60:
                return int(val)
        except Exception:  # noqa: BLE001
            pass
        return None

    _LOOP_METHODS = ("run_checks", "run_once", "run_analysis",
                     "run_collection_checks", "run_maintenance")

    def _install_cycle_guards(self) -> None:
        """p562: wrap every robot loop entry so each scheduled cycle executes
        on exactly ONE worker (the loops used to fire once per worker — x4
        duplicate notifications/SMS/emails/data-fixes in production)."""
        for name, robot in self.robots.items():
            for meth in self._LOOP_METHODS:
                fn = getattr(robot, meth, None)
                if fn is None or getattr(fn, "_p562_guarded", False):
                    continue
                setattr(robot, meth, self._wrap_cycle(name, fn))

    def _wrap_cycle(self, name, fn):
        @functools.wraps(fn)
        async def guarded(*args, **kwargs):
            robot = self.robots.get(name)
            # manual runs (lease held by run_robot_once) and nested loop calls
            # (run_once -> run_checks) pass straight through.
            if (getattr(robot, "_p562_manual", False)
                    or getattr(robot, "_p562_cycle_depth", 0)):
                return await fn(*args, **kwargs)
            interval = (await self._persisted_interval(name)
                        or getattr(robot, "check_interval", 3600) or 3600)
            slot = int(time.time() // max(60, interval))
            token = await self._try_lease(name, kind="cycle")
            if token is None:
                logger.info(f"{name}: cycle skipped — lease held by another worker")
                return {}  # p562b: loops like commission do result.get(...) on it
            try:
                if not await self._try_cycle_slot(name, slot):
                    return {}  # this slot already ran on another worker
                robot._p562_cycle_depth = 1
                try:
                    return await fn(*args, **kwargs)
                finally:
                    robot._p562_cycle_depth = 0
            finally:
                await self._release_lease(name, token)
        guarded._p562_guarded = True
        return guarded

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
        # p513: propagate to the other uvicorn workers (their in-memory robots
        # would otherwise keep the old interval until restart). The local robot
        # was already updated above; the echoed message applies idempotently.
        try:
            r = await self._get_redis()
            if r is not None:
                await r.publish(_CONFIG_CHANNEL, json.dumps(
                    {"robot": name, "interval_seconds": interval_seconds}))
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Could not broadcast interval for {name}: {e}")
        logger.info(f"Interval for {name} set to {interval_seconds}s")
        return True

    async def _get_redis(self):
        # Lazy async Redis client shared by publisher + subscriber.
        if self._redis is None:
            try:
                import redis.asyncio as aioredis
                self._redis = aioredis.from_url(
                    os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
                    decode_responses=True, socket_connect_timeout=2)
                await self._redis.ping()
            except Exception as e:  # noqa: BLE001
                logger.warning(f"robot config redis unavailable: {e}")
                self._redis = None
        return self._redis

    async def _config_sub(self) -> None:
        # Apply interval changes broadcast by sibling workers.
        try:
            r = await self._get_redis()
            if r is None:
                return
            pubsub = r.pubsub()
            await pubsub.subscribe(_CONFIG_CHANNEL)
            async for msg in pubsub.listen():
                if msg.get("type") != "message":
                    continue
                try:
                    data = json.loads(msg["data"])
                except Exception:  # noqa: BLE001
                    continue
                name = data.get("robot")
                interval = data.get("interval_seconds")
                if (name in self.robots and isinstance(interval, (int, float))
                        and interval >= 60):
                    self.robots[name].check_interval = int(interval)
                    logger.info(f"Applied broadcast interval {int(interval)}s for {name}")
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            logger.warning(f"robot config listener stopped: {e}")

    async def _watchdog(self) -> None:
        """Background loop: detect crashed robot tasks and auto-restart them."""
        while self.is_running:
            try:
                await asyncio.sleep(_WATCHDOG_INTERVAL)
                # p513: multi-worker convergence — intervals changed via the API
                # land in robot_config immediately but only in the handling
                # worker's memory; every worker re-applies the persisted values
                # each watchdog cycle so all converge within _WATCHDOG_INTERVAL.
                await self._apply_saved_intervals()
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
