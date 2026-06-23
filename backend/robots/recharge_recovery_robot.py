"""
Recharge Recovery Robot
Finds mobile_recharge_tasks stuck in 'processing' (bridge crashed) and either:
  - Resets to 'pending'  → if stuck < 1 hour  (bridge may be temporarily offline)
  - Marks as 'failed'    → if stuck ≥ 1 hour  (compensates the tenant wallet)

Two-pass design for guaranteed wallet compensation:
  Pass A: atomically claim timed-out tasks → status=failed, refund_pending=True
  Pass B: retry any tasks with refund_pending=True until the wallet credit succeeds,
          then flip refund_pending=False / refunded_at=<now>
This ensures a transient wallet error never leaves a task permanently uncompensated.

Runs every 5 minutes across all tenant databases.
"""
import asyncio
from datetime import datetime, timezone, timedelta
import logging

logger = logging.getLogger(__name__)

STALE_PENDING_MINUTES  = 10    # reset to pending after this many minutes
STALE_FAILED_MINUTES   = 60    # mark as failed (+ refund) after this many minutes
CHECK_INTERVAL_SECONDS = 300   # 5 minutes


class RechargeRecoveryRobot:
    def __init__(self, main_db, client):
        self.main_db = main_db
        self.client  = client
        self.name    = "روبوت استرداد الشحن"
        self.is_running = False
        self.check_interval = CHECK_INTERVAL_SECONDS
        self.last_run = None
        self.stats = {
            "checks": 0,
            "reset_to_pending": 0,
            "marked_failed": 0,
            "wallet_refunds": 0,
        }

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self):
        self.is_running = True
        logger.info("RechargeRecoveryRobot started (interval=%ds)", self.check_interval)
        while self.is_running:
            try:
                await self.run_once()
                self.last_run = datetime.now(timezone.utc).isoformat()
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("RechargeRecoveryRobot unexpected error")
            await asyncio.sleep(self.check_interval)

    async def stop(self):
        self.is_running = False

    # ------------------------------------------------------------------
    # Main check
    # ------------------------------------------------------------------

    async def run_once(self, **kwargs) -> dict:
        self.stats["checks"] += 1
        now = datetime.now(timezone.utc)
        pending_cutoff = (now - timedelta(minutes=STALE_PENDING_MINUTES)).isoformat()
        failed_cutoff  = (now - timedelta(minutes=STALE_FAILED_MINUTES)).isoformat()

        reset_count  = 0
        failed_count = 0
        refund_count = 0

        try:
            db_names = await self.client.list_database_names()
        except Exception:
            logger.exception("RechargeRecoveryRobot: could not list databases")
            return self._summary(0, 0, 0)

        for db_name in [d for d in db_names if d.startswith("tenant_")]:
            tdb = self.client[db_name]
            r, f, rf = await self._process_tenant(tdb, now, pending_cutoff, failed_cutoff)
            reset_count  += r
            failed_count += f
            refund_count += rf

        self.stats["reset_to_pending"] += reset_count
        self.stats["marked_failed"]    += failed_count
        self.stats["wallet_refunds"]   += refund_count

        if reset_count or failed_count or refund_count:
            logger.info(
                "RechargeRecoveryRobot: reset=%d  failed=%d  refunds=%d",
                reset_count, failed_count, refund_count,
            )

        return self._summary(reset_count, failed_count, refund_count)

    # ------------------------------------------------------------------
    # Per-tenant logic
    # ------------------------------------------------------------------

    async def _process_tenant(self, tdb, now, pending_cutoff, failed_cutoff):
        reset_count  = 0
        failed_count = 0
        refund_count = 0
        now_iso = now.isoformat()

        # ---- Pass A1: Tasks stuck ≥ 1 hour → atomically claim as failed ----
        # We set refund_pending=True here; the actual wallet credit happens in Pass B
        # so a transient wallet error never leaves compensation permanently skipped.
        try:
            hour_old = await tdb.mobile_recharge_tasks.find(
                {"status": "processing", "updated_at": {"$lt": failed_cutoff}},
                {"_id": 0},
            ).to_list(200)

            for task in hour_old:
                task_id = task.get("id", "")
                try:
                    # Atomic claim: filter on status="processing" so we only win the
                    # race if the bridge has NOT already resolved the task.
                    claim_result = await tdb.mobile_recharge_tasks.update_one(
                        {"id": task_id, "status": "processing"},
                        {"$set": {
                            "status": "failed",
                            "result_message": "انتهت مهلة المعالجة — أُعيد المبلغ للمحفظة",
                            "updated_at": now_iso,
                            "recovered_at": now_iso,
                            "recovery_reason": "timeout_1h",
                            "refund_pending": True,
                        }},
                    )
                    if not claim_result.modified_count:
                        # Bridge already resolved this task — nothing to do.
                        continue

                    # Update the linked recharge record, but only if it is still
                    # non-terminal (guard against overwriting a "success" written by
                    # the bridge between our find() and this update).
                    recharge_id = task.get("recharge_id", "")
                    if recharge_id:
                        await tdb.recharges.update_one(
                            {"id": recharge_id, "status": {"$nin": ["success", "completed"]}},
                            {"$set": {"status": "failed", "updated_at": now_iso}},
                        )

                    failed_count += 1
                except Exception:
                    logger.exception(
                        "RechargeRecoveryRobot: error claiming task %s as failed", task_id
                    )

        except Exception:
            logger.exception(
                "RechargeRecoveryRobot: error querying hour-old tasks in %s", tdb.name
            )

        # ---- Pass A2: Tasks stuck 10–60 min → reset to pending ----
        try:
            stale = await tdb.mobile_recharge_tasks.find(
                {
                    "status": "processing",
                    "updated_at": {"$gte": failed_cutoff, "$lt": pending_cutoff},
                },
                {"_id": 0, "id": 1},
            ).to_list(200)

            for task in stale:
                task_id = task.get("id", "")
                try:
                    result = await tdb.mobile_recharge_tasks.update_one(
                        {"id": task_id, "status": "processing"},
                        {"$set": {
                            "status": "pending",
                            "updated_at": now_iso,
                            "recovered_at": now_iso,
                            "recovery_reason": "timeout_10min",
                        }},
                    )
                    if result.modified_count:
                        reset_count += 1
                except Exception:
                    logger.exception(
                        "RechargeRecoveryRobot: error resetting task %s to pending", task_id
                    )

        except Exception:
            logger.exception(
                "RechargeRecoveryRobot: error querying stale tasks in %s", tdb.name
            )

        # ---- Pass B: Retry pending wallet refunds for already-failed tasks ----
        # This catches any tasks that were claimed as failed in a previous run but
        # whose wallet credit failed transiently. Runs every cycle until success.
        try:
            pending_refunds = await tdb.mobile_recharge_tasks.find(
                {"status": "failed", "refund_pending": True},
                {"_id": 0},
            ).to_list(200)

            for task in pending_refunds:
                task_id       = task.get("id", "")
                entity_id     = task.get("entity_id", "")
                wallet_txn_id = task.get("wallet_txn_id", "")
                operator_name = task.get("operator_name", task.get("operator", ""))
                phone         = task.get("phone_number", "")
                amount        = task.get("amount", 0)

                if not entity_id or not wallet_txn_id:
                    # No wallet data stored — nothing to refund; clear the flag.
                    await tdb.mobile_recharge_tasks.update_one(
                        {"id": task_id},
                        {"$set": {"refund_pending": False, "refunded_at": now_iso}},
                    )
                    continue

                # Deterministic refund reference: prevents double-credit even if
                # credit_wallet is called more than once (e.g. concurrent robots).
                recovery_ref = f"recovery_{wallet_txn_id}"

                already_refunded = await self._refund_already_issued(recovery_ref)
                if already_refunded:
                    # The credit exists but refund_pending was not cleared (e.g. crash
                    # after credit but before the flag update). Clear it now.
                    await tdb.mobile_recharge_tasks.update_one(
                        {"id": task_id},
                        {"$set": {"refund_pending": False, "refunded_at": now_iso}},
                    )
                    refund_count += 1
                    continue

                try:
                    from services.wallet_service import credit_wallet
                    refund_amount = await self._get_original_debit_amount(wallet_txn_id, amount)
                    await credit_wallet(
                        self.main_db,
                        entity_id,
                        refund_amount,
                        "recharge_refund",
                        recovery_ref,
                        f"استرجاع تلقائي — انتهت مهلة شحن {operator_name} {phone}",
                        "روبوت الاسترداد",
                    )
                    # Refund succeeded — clear the pending flag.
                    await tdb.mobile_recharge_tasks.update_one(
                        {"id": task_id},
                        {"$set": {"refund_pending": False, "refunded_at": now_iso}},
                    )
                    refund_count += 1
                except Exception:
                    # Leave refund_pending=True so the next run retries.
                    logger.exception(
                        "RechargeRecoveryRobot: wallet refund failed for task %s "
                        "(will retry next cycle)",
                        task_id,
                    )

        except Exception:
            logger.exception(
                "RechargeRecoveryRobot: error in refund-retry pass for %s", tdb.name
            )

        return reset_count, failed_count, refund_count

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _refund_already_issued(self, recovery_ref: str) -> bool:
        """Return True if a credit transaction with this reference already exists."""
        try:
            existing = await self.main_db.wallet_transactions.find_one(
                {"reference_id": recovery_ref, "transaction_type": "credit"},
                {"_id": 1},
            )
            return existing is not None
        except Exception:
            logger.exception(
                "RechargeRecoveryRobot: could not check idempotency for ref %s; "
                "assuming not issued",
                recovery_ref,
            )
            return False

    async def _get_original_debit_amount(self, wallet_txn_id: str, fallback_amount: float) -> float:
        """Look up the original debit transaction to get the exact cost that was debited."""
        try:
            txn = await self.main_db.wallet_transactions.find_one(
                {"reference_id": wallet_txn_id, "transaction_type": "debit"},
                {"_id": 0, "amount": 1},
            )
            if txn and txn.get("amount"):
                return float(txn["amount"])
        except Exception:
            logger.exception(
                "RechargeRecoveryRobot: could not look up wallet txn %s; using fallback",
                wallet_txn_id,
            )
        return fallback_amount

    def _summary(self, reset_count, failed_count, refund_count) -> dict:
        return {
            "reset_to_pending": reset_count,
            "marked_failed": failed_count,
            "wallet_refunds": refund_count,
        }
