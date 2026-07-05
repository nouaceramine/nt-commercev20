"""Bridge API — external recharge bridge polling, results, config and secrets."""
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime, timezone, timedelta
import logging
import httpx

from .helpers import _assert_safe_bridge_url

logger = logging.getLogger(__name__)


def build_bridge_router(db, main_db, require_tenant, get_tenant_admin, get_tenant_db=None):
    from motor.motor_asyncio import AsyncIOMotorDatabase
    router = APIRouter()

    # ---- bridge secret auth ----
    # Bridge clients are external processes (no JWT). They send X-Tenant-ID + X-Bridge-Secret.
    # verify_bridge resolves the correct tenant DB and returns it so handlers don't use the
    # JWT-ContextVar-based proxy (which would fall back to main_db when no JWT is present).
    async def verify_bridge(
        x_bridge_secret: Optional[str] = Header(None, alias="X-Bridge-Secret"),
        x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-ID"),
    ) -> AsyncIOMotorDatabase:
        if not x_tenant_id:
            raise HTTPException(status_code=400, detail="X-Tenant-ID header manquant")
        if get_tenant_db is None:
            raise HTTPException(status_code=500, detail="get_tenant_db non configuré")
        tenant_db = get_tenant_db(x_tenant_id)
        secret_doc = await tenant_db.settings.find_one({"key": "bridge_secret"}, {"_id": 0})
        expected = (secret_doc.get("value", "") if secret_doc else "")
        if not expected or x_bridge_secret != expected:
            raise HTTPException(status_code=403, detail="Bridge secret invalide")
        return tenant_db
    # ============ BRIDGE API ============

    @router.get("/recharge/bridge/status")
    async def bridge_status(tenant_db=Depends(verify_bridge)):
        """Bridge heartbeat — updates last_seen and returns pending task count.
        Uses tenant_db returned by verify_bridge (correctly resolved from X-Tenant-ID).
        """
        now = datetime.now(timezone.utc).isoformat()
        await tenant_db.settings.update_one(
            {"key": "bridge_last_seen"},
            {"$set": {"key": "bridge_last_seen", "value": now}},
            upsert=True,
        )
        pending = await tenant_db.mobile_recharge_tasks.count_documents({"status": "pending"})
        return {"ok": True, "pending_tasks": pending, "server_time": now}

    @router.get("/recharge/bridge/tasks")
    async def bridge_get_tasks(tenant_db=Depends(verify_bridge)):
        """Return pending bridge tasks and atomically claim them (mark as processing).
        Claim semantics prevent duplicate USSD dispatch by concurrent bridge workers.
        Also carries the check_balances flag set by POST /recharge/bridge/check-balances.
        The flag is atomically cleared on read so the bridge only runs one extra check.
        """
        now = datetime.now(timezone.utc).isoformat()
        # Fetch up to 50 pending tasks
        tasks = await tenant_db.mobile_recharge_tasks.find(
            {"status": "pending"}, {"_id": 0}
        ).sort("created_at", 1).to_list(50)
        if tasks:
            task_ids = [t["id"] for t in tasks]
            # Atomically move claimed tasks to "processing"
            await tenant_db.mobile_recharge_tasks.update_many(
                {"id": {"$in": task_ids}, "status": "pending"},
                {"$set": {"status": "processing", "updated_at": now}},
            )
            for t in tasks:
                t["status"] = "processing"

        # Atomically read-and-clear the on-demand balance-check flag
        flag_doc = await tenant_db.settings.find_one_and_update(
            {"key": "balance_check_requested", "value": True},
            {"$set": {"value": False}},
        )
        check_balances = flag_doc is not None

        return {"tasks": tasks, "check_balances": check_balances}

    # ── Admin: request an on-demand SIM balance check ─────────────────────────
    @router.post("/recharge/bridge/check-balances")
    async def request_balance_check(admin: dict = Depends(get_tenant_admin)):
        """Set a one-shot flag that tells the bridge to run a balance check on its
        next poll cycle.  The flag is atomically cleared by GET /bridge/tasks."""
        await db.settings.update_one(
            {"key": "balance_check_requested"},
            {"$set": {"key": "balance_check_requested", "value": True}},
            upsert=True,
        )
        return {"ok": True}

    # ── Tenant admin: read their self-bridge config ───────────────────────────
    @router.get("/settings/bridge-config")
    async def get_bridge_config(user: dict = Depends(get_tenant_admin)):
        """Return the current tenant's bridge mode and URLs (tenant-readable fields)."""
        entity_id = user.get("tenant_id") or user.get("id", "")
        tenant_doc = None
        if entity_id and main_db is not None:
            tenant_doc = await main_db.saas_tenants.find_one(
                {"id": entity_id},
                {"_id": 0, "recharge_mode": 1, "self_bridge_url": 1, "self_bridge_api_key": 1},
            )
        if not tenant_doc:
            return {"recharge_mode": "owner_bridge", "self_bridge_url": "", "self_bridge_api_key": ""}
        return {
            "recharge_mode": tenant_doc.get("recharge_mode", "owner_bridge"),
            "self_bridge_url": tenant_doc.get("self_bridge_url", ""),
            "self_bridge_api_key": tenant_doc.get("self_bridge_api_key", ""),
        }

    # ── Tenant admin: update their own self-bridge URL / API key ──────────────
    @router.put("/settings/bridge-config")
    async def update_bridge_config(body: dict, user: dict = Depends(get_tenant_admin)):
        """Tenant admin: update self_bridge_url / self_bridge_api_key in main_db.
        Allowed only when the tenant is already in self_bridge mode."""
        entity_id = user.get("tenant_id") or user.get("id", "")
        if not entity_id or main_db is None:
            raise HTTPException(status_code=400, detail="بيانات المشترك غير متاحة")

        tenant_doc = await main_db.saas_tenants.find_one(
            {"id": entity_id},
            {"_id": 0, "recharge_mode": 1},
        )
        if not tenant_doc:
            raise HTTPException(status_code=404, detail="بيانات المشترك غير موجودة")
        if tenant_doc.get("recharge_mode") != "self_bridge":
            raise HTTPException(status_code=403, detail="هذا الإعداد متاح فقط في وضع الجسر الذاتي")

        update: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
        if "self_bridge_url" in body:
            update["self_bridge_url"] = body["self_bridge_url"] or ""
        if "self_bridge_api_key" in body:
            update["self_bridge_api_key"] = body["self_bridge_api_key"] or ""

        await main_db.saas_tenants.update_one({"id": entity_id}, {"$set": update})
        return {"ok": True}

    # ── Tenant admin: test their own self-bridge connectivity ─────────────────
    @router.post("/settings/test-bridge")
    async def tenant_test_bridge(user: dict = Depends(get_tenant_admin)):
        """Tenant admin: ping the configured self_bridge_url/health endpoint."""
        entity_id = user.get("tenant_id") or user.get("id", "")
        tenant_doc = None
        if entity_id and main_db is not None:
            tenant_doc = await main_db.saas_tenants.find_one(
                {"id": entity_id},
                {"_id": 0, "recharge_mode": 1, "self_bridge_url": 1, "self_bridge_api_key": 1},
            )
        if not tenant_doc:
            raise HTTPException(status_code=404, detail="بيانات المشترك غير موجودة")
        if tenant_doc.get("recharge_mode") != "self_bridge":
            raise HTTPException(status_code=400, detail="هذا المشترك لا يستخدم وضع الجسر الذاتي")

        bridge_url = (tenant_doc.get("self_bridge_url") or "").rstrip("/")
        bridge_api_key = tenant_doc.get("self_bridge_api_key", "")
        if not bridge_url:
            raise HTTPException(status_code=400, detail="لم يُعدَّ رابط الجسر بعد")
        _assert_safe_bridge_url(bridge_url)

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(
                    f"{bridge_url}/health",
                    headers={"X-Api-Key": bridge_api_key} if bridge_api_key else {},
                )
            return {"ok": resp.status_code < 400, "status_code": resp.status_code}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    TERMINAL_STATUSES = {"success", "failed"}

    class BridgeTaskResult(BaseModel):
        status: Literal["success", "failed"]
        result_message: str = ""

    @router.patch("/recharge/bridge/tasks/{task_id}/result")
    async def bridge_report_result(
        task_id: str,
        body: BridgeTaskResult,
        tenant_db=Depends(verify_bridge),
    ):
        """Bridge reports the outcome of a recharge task.
        Idempotent: calling again with the same terminal status returns early.
        Uses tenant_db from verify_bridge — not the JWT-ContextVar proxy.
        """
        now = datetime.now(timezone.utc).isoformat()

        # Atomically transition from non-terminal → terminal (prevents duplicate processing)
        update_result = await tenant_db.mobile_recharge_tasks.find_one_and_update(
            {"id": task_id, "status": {"$nin": list(TERMINAL_STATUSES)}},
            {"$set": {"status": body.status, "result_message": body.result_message, "updated_at": now}},
            return_document=False,
        )
        if update_result is None:
            # Either task not found, or already in a terminal state — safe to return idempotently
            task_doc = await tenant_db.mobile_recharge_tasks.find_one({"id": task_id}, {"_id": 0})
            if task_doc is None:
                raise HTTPException(status_code=404, detail="مهمة الجسر غير موجودة")
            return {"ok": True, "task_id": task_id, "status": task_doc.get("status"), "idempotent": True}

        # update_result is the OLD doc (return_document=False)
        task_doc = update_result or {}

        recharge_id = task_doc.get("recharge_id", "")
        recharge = await tenant_db.recharges.find_one({"id": recharge_id}, {"_id": 0}) if recharge_id else None

        # Update recharge record
        if recharge:
            await tenant_db.recharges.update_one(
                {"id": recharge_id},
                {"$set": {"status": body.status, "result_message": body.result_message, "updated_at": now}},
            )

        # If failed → compensate tenant wallet (credit back cost) — only once, guarded above
        if body.status == "failed" and recharge:
            from services.wallet_service import credit_wallet
            # entity_id and wallet_txn_id stored on recharge doc at creation time (reliable)
            entity_id = recharge.get("entity_id", "") or task_doc.get("entity_id", "")
            wallet_txn_id = recharge.get("wallet_txn_id", "") or task_doc.get("wallet_txn_id", recharge_id)
            cost = recharge.get("cost", 0)
            if cost > 0 and entity_id:
                try:
                    await credit_wallet(
                        main_db, entity_id, cost, "recharge_refund", wallet_txn_id,
                        f"استرجاع شحن فاشل {recharge.get('code', recharge_id)}", "bridge",
                    )
                except Exception:
                    logger.exception("Bridge: failed to compensate wallet for recharge %s", recharge_id)

        return {"ok": True, "task_id": task_id, "status": body.status}

    # Bridge secret management (admin)
    @router.get("/recharge/bridge/secret")
    async def get_bridge_secret_value(admin: dict = Depends(get_tenant_admin)):
        doc = await db.settings.find_one({"key": "bridge_secret"}, {"_id": 0})
        return {"secret": doc.get("value", "") if doc else ""}

    class BridgeSecretUpdate(BaseModel):
        secret: str

    @router.put("/recharge/bridge/secret")
    async def set_bridge_secret(body: BridgeSecretUpdate, admin: dict = Depends(get_tenant_admin)):
        if not body.secret or len(body.secret) < 16:
            raise HTTPException(status_code=400, detail="يجب أن لا يقل الـ secret عن 16 حرفاً")
        await db.settings.update_one(
            {"key": "bridge_secret"},
            {"$set": {"key": "bridge_secret", "value": body.secret}},
            upsert=True,
        )
        return {"ok": True}

    # Bridge: update SIM slot balance (called by local bridge after balance USSD)
    class BridgeSimBalance(BaseModel):
        balance_text: str = ""
        balance: float = 0.0

    @router.patch("/recharge/bridge/sim/{slot_id}/balance")
    async def bridge_update_sim_balance(
        slot_id: int,
        body: BridgeSimBalance,
        tenant_db=Depends(verify_bridge),
    ):
        """Bridge reports SIM slot balance after a balance-check USSD.
        Auth via bridge secret — no admin JWT required.
        """
        now = datetime.now(timezone.utc).isoformat()
        await tenant_db.sim_slots.update_one(
            {"slot_id": slot_id},
            {"$set": {
                "balance": body.balance,
                "balance_text": body.balance_text,
                "last_updated": now,
            }},
            upsert=True,
        )
        return {"ok": True, "slot_id": slot_id, "balance": body.balance}

    # Tenant-accessible bridge ping — any authenticated user can check bridge status
    # Used by POS tab for non-admin users to display the offline warning banner.
    @router.get("/recharge/bridge/ping")
    async def bridge_ping(user: dict = Depends(require_tenant)):
        """Lightweight bridge connectivity status — accessible to all tenant users.
        Returns only last_seen and is_online; no sensitive config exposed.
        """
        doc = await db.settings.find_one({"key": "bridge_last_seen"}, {"_id": 0})
        last_seen = doc.get("value") if doc else None
        is_online = False
        if last_seen:
            from datetime import datetime, timezone, timedelta
            try:
                ts = datetime.fromisoformat(last_seen.replace("Z", "+00:00"))
                is_online = (datetime.now(timezone.utc) - ts) < timedelta(seconds=60)
            except Exception:
                pass
        return {"last_seen": last_seen, "pending_tasks": None, "is_online": is_online}

    # Admin: view bridge last seen
    @router.get("/recharge/bridge/last-seen")
    async def bridge_last_seen(admin: dict = Depends(get_tenant_admin)):
        doc = await db.settings.find_one({"key": "bridge_last_seen"}, {"_id": 0})
        pending = await db.mobile_recharge_tasks.count_documents({"status": "pending"})
        return {
            "last_seen": doc.get("value") if doc else None,
            "pending_tasks": pending,
        }

    return router
