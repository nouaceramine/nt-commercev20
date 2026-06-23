"""
Wallet Service - shared platform-wallet helpers usable outside wallet_routes.py.

Operates on the platform wallet store (main_db.wallets / main_db.wallet_transactions),
which is the SAME wallet linked to the super admin and topped-up via super-admin approval.
Used by the recharge flow to debit a tenant's wallet for every recharge operation.
"""
from datetime import datetime, timezone
from pymongo import ReturnDocument
from fastapi import HTTPException
import uuid
import logging

from services.code_generator import generate_code

logger = logging.getLogger(__name__)

DEFAULT_LOW_BALANCE = 1000.0

# ── Transfer enrichment ──

async def enrich_transfers(db, transfers: list) -> list:
    """Add from_name / to_name display labels to a list of wallet_transfer dicts.

    Batch-fetches entity names from saas_tenants and saas_agents to avoid N+1 queries.
    """
    if not transfers:
        return transfers

    tenant_ids: set = set()
    agent_ids: set = set()
    for t in transfers:
        for eid_field, etype_field in [("from_entity_id", "from_entity_type"), ("to_entity_id", "to_entity_type")]:
            eid = t.get(eid_field, "")
            etype = t.get(etype_field, "")
            if not eid or eid == PLATFORM_WALLET_ID:
                continue
            if etype == "tenant":
                tenant_ids.add(eid)
            elif etype == "agent":
                agent_ids.add(eid)
            else:
                # Unknown type — try both collections
                tenant_ids.add(eid)
                agent_ids.add(eid)

    tenant_map: dict = {}
    agent_map: dict = {}
    if tenant_ids:
        async for doc in db.saas_tenants.find(
            {"id": {"$in": list(tenant_ids)}},
            {"_id": 0, "id": 1, "name": 1, "company_name": 1, "email": 1},
        ):
            tenant_map[doc["id"]] = (
                doc.get("name") or doc.get("company_name") or doc.get("email") or doc["id"]
            )
    if agent_ids:
        async for doc in db.saas_agents.find(
            {"id": {"$in": list(agent_ids)}},
            {"_id": 0, "id": 1, "name": 1, "email": 1},
        ):
            agent_map[doc["id"]] = doc.get("name") or doc.get("email") or doc["id"]

    def _label(entity_id: str, entity_type: str) -> str:
        if not entity_id:
            return "—"
        if entity_id == PLATFORM_WALLET_ID:
            return "المحفظة الرئيسية"
        if entity_type == "tenant":
            return tenant_map.get(entity_id, entity_id)
        if entity_type == "agent":
            return agent_map.get(entity_id, entity_id)
        return tenant_map.get(entity_id) or agent_map.get(entity_id) or entity_id

    enriched = []
    for t in transfers:
        t = dict(t)
        t.pop("_id", None)
        t["from_name"] = _label(t.get("from_entity_id", ""), t.get("from_entity_type", ""))
        t["to_name"] = _label(t.get("to_entity_id", ""), t.get("to_entity_type", ""))
        enriched.append(t)
    return enriched

# The single platform-owner ("صاحب النظام") wallet — the main wallet that SELLS
# balance down the chain (owner → distributor → tenant). All super-admin sales
# debit this one canonical wallet regardless of which super-admin account acts.
PLATFORM_WALLET_ID = "platform_main"


async def get_or_create_wallet(main_db, entity_id, entity_type="tenant"):
    wallet = await main_db.wallets.find_one({"entity_id": entity_id}, {"_id": 0})
    if not wallet:
        wallet = {
            "id": str(uuid.uuid4()),
            "entity_type": entity_type,
            "entity_id": entity_id,
            "balance": 0.0,
            "currency": "DZD",
            "low_balance_threshold": DEFAULT_LOW_BALANCE,
            "auto_pay_subscription": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await main_db.wallets.insert_one(dict(wallet))
    return wallet


async def debit_wallet(main_db, entity_id, amount, ref_type, ref_id, description, created_by, entity_type="tenant"):
    """Atomically debit a platform wallet, log the transaction (with a PF code), and
    raise HTTP 400 ("الرصيد غير كافي") when the balance is insufficient.

    The conditional ($gte) + $inc update guarantees concurrent debits cannot double-spend.
    Returns (new_balance, transaction_dict).
    """
    wallet = await get_or_create_wallet(main_db, entity_id, entity_type)
    updated = await main_db.wallets.find_one_and_update(
        {"entity_id": entity_id, "balance": {"$gte": amount}},
        {"$inc": {"balance": -amount}},
        return_document=ReturnDocument.AFTER,
        projection={"_id": 0},
    )
    if not updated:
        raise HTTPException(status_code=400, detail="الرصيد غير كافي")
    new_balance = updated["balance"]
    old_balance = new_balance + amount
    code = await generate_code(main_db, "wallet_transactions", "PF", 5, with_year=True)
    txn = {
        "id": str(uuid.uuid4()),
        "code": code,
        "wallet_id": wallet["id"],
        "entity_id": entity_id,
        "transaction_type": "debit",
        "amount": amount,
        "balance_before": old_balance,
        "balance_after": new_balance,
        "reference_type": ref_type,
        "reference_id": ref_id,
        "description": description,
        "status": "completed",
        "created_by": created_by,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await main_db.wallet_transactions.insert_one(dict(txn))
    threshold = wallet.get("low_balance_threshold", DEFAULT_LOW_BALANCE)
    if new_balance < threshold:
        await main_db.wallet_alerts.insert_one({
            "id": str(uuid.uuid4()),
            "wallet_id": wallet["id"],
            "entity_id": entity_id,
            "type": "low_balance",
            "balance": new_balance,
            "threshold": threshold,
            "message": f"الرصيد منخفض: {new_balance:.2f} دج (الحد الأدنى {threshold:.2f} دج)",
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    return new_balance, txn


async def credit_wallet(main_db, entity_id, amount, ref_type, ref_id, description, created_by, entity_type="tenant"):
    """Atomically credit a platform wallet and log the transaction (with a PF code).
    Used to compensate (refund) a previous debit when a dependent operation fails.
    Returns (new_balance, transaction_dict).
    """
    wallet = await get_or_create_wallet(main_db, entity_id, entity_type)
    updated = await main_db.wallets.find_one_and_update(
        {"entity_id": entity_id},
        {"$inc": {"balance": amount}},
        return_document=ReturnDocument.AFTER,
        projection={"_id": 0},
    )
    new_balance = updated["balance"]
    old_balance = new_balance - amount
    code = await generate_code(main_db, "wallet_transactions", "PF", 5, with_year=True)
    txn = {
        "id": str(uuid.uuid4()),
        "code": code,
        "wallet_id": wallet["id"],
        "entity_id": entity_id,
        "transaction_type": "credit",
        "amount": amount,
        "balance_before": old_balance,
        "balance_after": new_balance,
        "reference_type": ref_type,
        "reference_id": ref_id,
        "description": description,
        "status": "completed",
        "created_by": created_by,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await main_db.wallet_transactions.insert_one(dict(txn))
    return new_balance, txn


async def transfer_balance(
    main_db, from_id, to_id, amount, ref_type, ref_id, description, created_by,
    from_type="admin", to_type="tenant", insufficient_message="الرصيد غير كافي",
):
    """Sell/transfer balance between two platform wallets (seller -> buyer).

    Debits the source wallet (atomic $gte guard) then credits the destination,
    logging both transactions plus a wallet_transfers record. If the credit fails
    after the debit, the source is compensated so balance is never lost. Raises
    HTTP 400 with ``insufficient_message`` when the source balance is too low.
    Returns a dict with from_balance / to_balance / debit_txn / credit_txn / transfer.
    """
    if amount <= 0:
        raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون أكبر من صفر")

    await get_or_create_wallet(main_db, to_id, to_type)
    source = await get_or_create_wallet(main_db, from_id, from_type)
    if source.get("balance", 0) < amount:
        raise HTTPException(status_code=400, detail=insufficient_message)

    from_balance, debit_txn = await debit_wallet(
        main_db, from_id, amount, ref_type, ref_id, description, created_by, from_type,
    )
    try:
        to_balance, credit_txn = await credit_wallet(
            main_db, to_id, amount, ref_type, ref_id, description, created_by, to_type,
        )
    except Exception:
        try:
            await credit_wallet(
                main_db, from_id, amount, f"{ref_type}_refund", ref_id,
                "استرجاع تحويل فاشل", created_by, from_type,
            )
        except Exception:
            logger.critical(
                "WALLET COMPENSATION FAILED: %s debited from %s (%s) but credit to %s "
                "(%s) and refund both failed; ref=%s/%s. Manual reconciliation required.",
                amount, from_id, from_type, to_id, to_type, ref_type, ref_id,
            )
        raise

    count = await main_db.wallet_transfers.count_documents({}) + 1
    transfer = {
        "id": str(uuid.uuid4()),
        "transfer_number": f"TRF-{count:05d}",
        "from_entity_type": from_type,
        "from_entity_id": from_id,
        "to_entity_type": to_type,
        "to_entity_id": to_id,
        "amount": amount,
        "fee": 0,
        "net_amount": amount,
        "status": "completed",
        "reference_type": ref_type,
        "reference_id": ref_id,
        "description": description,
        "created_by": created_by,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await main_db.wallet_transfers.insert_one(dict(transfer))
    return {
        "from_balance": from_balance,
        "to_balance": to_balance,
        "debit_txn": debit_txn,
        "credit_txn": credit_txn,
        "transfer": transfer,
    }
