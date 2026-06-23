"""
Smart Repair Robot
Monitors overdue repairs, suggests spare parts, provides diagnostics insights
"""
import asyncio
from datetime import datetime, timezone, timedelta
import logging
import uuid

logger = logging.getLogger(__name__)


class RepairRobot:
    def __init__(self, db, client, notification_service):
        self.db = db
        self.client = client
        self.notification = notification_service
        self.name = "روبوت الإصلاح"
        self.is_running = False
        self.check_interval = 43200  # every 12 hours
        self.last_run = None
        self.stats = {"checks": 0, "alerts_sent": 0, "overdue_found": 0}

    async def start(self) -> dict:
        self.is_running = True
        logger.info("Repair Robot started")
        while self.is_running:
            try:
                await self.run_checks()
                self.last_run = datetime.now(timezone.utc).isoformat()
                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Repair Robot error: {e}")
                await asyncio.sleep(300)

    async def stop(self) -> dict:
        self.is_running = False

    async def run_once(self, **kwargs) -> dict:
        return await self.run_checks()

    async def run_checks(self) -> dict:
        self.stats["checks"] += 1
        results = {
            "overdue_repairs": await self._check_overdue(),
            "low_spare_parts": await self._check_spare_parts(),
            "technician_workload": await self._check_workload(),
            "recommendations": [],
        }

        if results["overdue_repairs"]:
            self.stats["overdue_found"] += len(results["overdue_repairs"])
            results["recommendations"].append({
                "type": "overdue_alert",
                "message_ar": f"يوجد {len(results['overdue_repairs'])} تذكرة إصلاح متأخرة",
                "message_fr": f"{len(results['overdue_repairs'])} réparations en retard",
            })

        if results["low_spare_parts"]:
            results["recommendations"].append({
                "type": "parts_reorder",
                "message_ar": f"{len(results['low_spare_parts'])} قطعة غيار بمخزون منخفض",
                "message_fr": f"{len(results['low_spare_parts'])} pièces à réapprovisionner",
            })

        return results

    async def _check_overdue(self) -> dict:
        overdue = []
        try:
            cutoff = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
            dbs = await self.client.list_database_names()
            for db_name in [d for d in dbs if d.startswith("tenant_")]:
                tdb = self.client[db_name]
                tickets = await tdb.repair_tickets.find(
                    {"status": {"$in": ["received", "diagnosed"]}, "received_at": {"$lt": cutoff}},
                    {"_id": 0, "id": 1, "ticket_number": 1, "customer_name": 1, "status": 1, "received_at": 1}
                ).to_list(100)
                overdue.extend(tickets)
        except Exception:
            pass
        return overdue

    async def _check_spare_parts(self) -> dict:
        low = []
        try:
            dbs = await self.client.list_database_names()
            for db_name in [d for d in dbs if d.startswith("tenant_")]:
                tdb = self.client[db_name]
                parts = await tdb.spare_parts.find(
                    {"quantity": {"$lt": 5}}, {"_id": 0, "id": 1, "name_ar": 1, "quantity": 1}
                ).to_list(50)
                low.extend(parts)
        except Exception:
            pass
        return low

    async def _check_workload(self) -> dict:
        workload = {}
        try:
            dbs = await self.client.list_database_names()
            for db_name in [d for d in dbs if d.startswith("tenant_")]:
                tdb = self.client[db_name]
                tickets = await tdb.repair_tickets.find(
                    {"status": {"$in": ["received", "diagnosed", "in_repair"]}},
                    {"_id": 0, "technician_name": 1}
                ).to_list(500)
                for t in tickets:
                    tech = t.get("technician_name", "غير معين")
                    workload[tech] = workload.get(tech, 0) + 1
        except Exception:
            pass
        return workload
