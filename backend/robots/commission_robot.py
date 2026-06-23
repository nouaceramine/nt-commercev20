"""
Commission Robot
Automatically promotes PENDING commissions to AVAILABLE once the 7-day
chargeback window has passed.

Runs every hour across all agent_commissions records in main_db.
No tenant iteration needed — commissions are platform-level data.
"""
import asyncio
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

CHECK_INTERVAL_SECONDS = 3600  # 1 hour


class CommissionRobot:
    def __init__(self, main_db, client):
        self.main_db = main_db
        self.client = client
        self.name = "روبوت العمولات"
        self.is_running = False
        self.check_interval = CHECK_INTERVAL_SECONDS
        self.last_run = None
        self.stats = {
            "checks": 0,
            "promoted": 0,
        }

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self):
        self.is_running = True
        logger.info("CommissionRobot started (interval=%ds)", self.check_interval)
        while self.is_running:
            try:
                result = await self.run_once()
                self.last_run = datetime.now(timezone.utc).isoformat()
                if result.get("promoted"):
                    logger.info("CommissionRobot: promoted %d commissions to available", result["promoted"])
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("CommissionRobot unexpected error")
            await asyncio.sleep(self.check_interval)

    async def stop(self):
        self.is_running = False

    # ------------------------------------------------------------------
    # Main check
    # ------------------------------------------------------------------

    async def run_once(self, **kwargs) -> dict:
        self.stats["checks"] += 1
        now = datetime.now(timezone.utc).isoformat()
        try:
            result = await self.main_db.agent_commissions.update_many(
                {"status": "pending", "chargeback_until": {"$lte": now}},
                {"$set": {"status": "available", "updated_at": now}},
            )
            promoted = result.modified_count
            self.stats["promoted"] += promoted
            return {"promoted": promoted}
        except Exception:
            logger.exception("CommissionRobot: error promoting commissions")
            return {"promoted": 0}
