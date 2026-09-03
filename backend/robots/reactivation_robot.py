"""
p357: Reactivation Robot — يمر يومياً على المستأجرين النشطين ويرسل SMS
إعادة تنشيط للزبائن الغائبين (عبر services/reactivation_service).
"""
import asyncio
from datetime import datetime, timezone
import logging
from core.db_naming import resolve_db_name
from services import reactivation_service

logger = logging.getLogger(__name__)


class ReactivationRobot:
    def __init__(self, db, client, notification_service, sms_service):
        self.db = db
        self.client = client
        self.notification = notification_service
        self.sms = sms_service
        self.name = "روبوت إعادة التنشيط"
        self.is_running = False
        self.check_interval = 3600 * 24  # يومياً
        self.last_run = None
        self.stats = {"checks": 0, "tenants_processed": 0, "sms_sent": 0}

    async def start(self) -> dict:
        self.is_running = True
        logger.info("Reactivation Robot started")
        while self.is_running:
            try:
                await self.run_analysis()
                self.last_run = datetime.now(timezone.utc).isoformat()
                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Reactivation Robot error: {e}")
                await asyncio.sleep(300)

    async def stop(self) -> dict:
        self.is_running = False
        return {"status": "stopped"}

    async def run_analysis(self) -> dict:
        self.stats["checks"] += 1
        tenants = await self.db.saas_tenants.find(
            {"is_active": True}, {"_id": 0}).to_list(500)
        total_sent = 0
        for tenant in tenants:
            try:
                tid = tenant["id"].replace("-", "_")
                tdb = self.client[resolve_db_name(tid)]
                res = await reactivation_service.run_reactivation(tdb, tenant, self.sms)
                self.stats["tenants_processed"] += 1
                total_sent += res.get("sent", 0)
                if res.get("sent"):
                    await self.notification.send_to_admins(
                        tenant["id"],
                        "رسائل إعادة تنشيط",
                        f"أُرسلت {res['sent']} رسالة SMS لزبائن غائبين (من أصل {res.get('dormant', 0)})",
                        severity="info",
                        category="marketing",
                    )
            except Exception as e:
                logger.error(f"Reactivation failed for {tenant.get('id')}: {e}")
        self.stats["sms_sent"] += total_sent
        return {"tenants": len(tenants), "sms_sent": total_sent}
