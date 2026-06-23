"""
Digital Services Panel routes — IPTV subscriptions, services catalog, resellers.

Part of the "services" idea (mobile recharge + IPTV + other digital services).
Tenant-scoped collections (via the `db` proxy):
  - digital_services        : sellable services / IPTV packages catalog
  - digital_subscriptions   : sold IPTV (and other) subscriptions
  - resellers               : sub-resellers (موزّعين) each with a balance
  - reseller_transactions   : reseller balance credit/debit ledger

Wallet (choice 1-أ — unified tenant wallet): a digital subscription sale debits the
tenant's OWN single platform wallet (main_db.wallets) by COST, exactly like the
mobile-recharge flow. That balance is funded down the chain from صاحب النظام
(owner → distributor → tenant). Reseller-attributed sales ALSO debit the reseller's
own balance (a tenant-local ledger) by the sale PRICE.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone, timedelta
import calendar
import uuid
import logging

from pymongo import ReturnDocument

logger = logging.getLogger(__name__)


def _add_months(dt: datetime, months: int) -> datetime:
    m = dt.month - 1 + int(months or 0)
    y = dt.year + m // 12
    m = m % 12 + 1
    d = min(dt.day, calendar.monthrange(y, m)[1])
    return dt.replace(year=y, month=m, day=d)


def _parse_dt(value) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return datetime.now(timezone.utc)


def _sub_status(end_date_iso: str, alert_days: int = 7) -> str:
    """Compute live status from the end date."""
    if not end_date_iso:
        return "active"
    end = _parse_dt(end_date_iso)
    now = datetime.now(timezone.utc)
    if end < now:
        return "expired"
    if end <= now + timedelta(days=max(0, alert_days)):
        return "expiring"
    return "active"


def _to_float(v, default=0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def create_digital_panel_routes(db, main_db, require_tenant, get_tenant_admin) -> APIRouter:
    router = APIRouter(prefix="/digital-panel", tags=["digital-panel"])

    # ============================================================
    # Services catalog
    # ============================================================
    @router.get("/services")
    async def list_services(category: Optional[str] = None, user: dict = Depends(require_tenant)):
        query = {}
        if category:
            query["category"] = category
        return await db.digital_services.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)

    @router.post("/services", status_code=201)
    async def create_service(payload: dict, user: dict = Depends(require_tenant)):
        name = (payload.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="اسم الخدمة مطلوب")
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": str(uuid.uuid4()),
            "name": name,
            "category": payload.get("category") or "iptv",  # iptv | recharge | other
            "supplier_name": payload.get("supplier_name") or "",
            "server_name": payload.get("server_name") or "",
            "duration_months": payload.get("duration_months"),
            "default_cost": _to_float(payload.get("default_cost")),
            "default_price": _to_float(payload.get("default_price")),
            "notes": payload.get("notes") or "",
            "active": payload.get("active", True),
            "created_at": now,
            "created_by": user.get("name", ""),
        }
        await db.digital_services.insert_one(dict(doc))
        doc.pop("_id", None)
        return doc

    @router.put("/services/{service_id}")
    async def update_service(service_id: str, payload: dict, user: dict = Depends(require_tenant)):
        update = {k: v for k, v in payload.items() if k not in ("id", "_id", "created_at", "created_by")}
        for fld in ("default_cost", "default_price"):
            if fld in update:
                update[fld] = _to_float(update[fld])
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        res = await db.digital_services.update_one({"id": service_id}, {"$set": update})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="الخدمة غير موجودة")
        return await db.digital_services.find_one({"id": service_id}, {"_id": 0})

    @router.delete("/services/{service_id}")
    async def delete_service(service_id: str, admin: dict = Depends(get_tenant_admin)):
        res = await db.digital_services.delete_one({"id": service_id})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="الخدمة غير موجودة")
        return {"success": True}

    # ============================================================
    # Resellers (موزّعين) + balance ledger
    # ============================================================
    @router.get("/resellers")
    async def list_resellers(user: dict = Depends(require_tenant)):
        return await db.resellers.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)

    @router.post("/resellers", status_code=201)
    async def create_reseller(payload: dict, user: dict = Depends(require_tenant)):
        name = (payload.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="اسم الموزّع مطلوب")
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": str(uuid.uuid4()),
            "name": name,
            "phone": payload.get("phone") or "",
            "email": payload.get("email") or "",
            "balance": _to_float(payload.get("balance")),
            "active": payload.get("active", True),
            "notes": payload.get("notes") or "",
            "created_at": now,
            "created_by": user.get("name", ""),
        }
        await db.resellers.insert_one(dict(doc))
        doc.pop("_id", None)
        return doc

    @router.put("/resellers/{reseller_id}")
    async def update_reseller(reseller_id: str, payload: dict, user: dict = Depends(require_tenant)):
        # balance is only mutated via the dedicated balance endpoint
        update = {k: v for k, v in payload.items()
                  if k not in ("id", "_id", "balance", "created_at", "created_by")}
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        res = await db.resellers.update_one({"id": reseller_id}, {"$set": update})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="الموزّع غير موجود")
        return await db.resellers.find_one({"id": reseller_id}, {"_id": 0})

    @router.delete("/resellers/{reseller_id}")
    async def delete_reseller(reseller_id: str, admin: dict = Depends(get_tenant_admin)):
        res = await db.resellers.delete_one({"id": reseller_id})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="الموزّع غير موجود")
        return {"success": True}

    @router.get("/resellers/{reseller_id}/transactions")
    async def reseller_transactions(reseller_id: str, user: dict = Depends(require_tenant)):
        return await db.reseller_transactions.find(
            {"reseller_id": reseller_id}, {"_id": 0}
        ).sort("created_at", -1).to_list(1000)

    @router.post("/resellers/{reseller_id}/balance")
    async def adjust_reseller_balance(reseller_id: str, payload: dict, user: dict = Depends(require_tenant)):
        """Credit (شحن) or debit (سحب) a reseller balance. type: credit | debit."""
        txn_type = payload.get("type")
        amount = _to_float(payload.get("amount"))
        if txn_type not in ("credit", "debit") or amount <= 0:
            raise HTTPException(status_code=400, detail="نوع أو مبلغ غير صالح")
        new_balance, txn = await _move_reseller_balance(
            reseller_id, txn_type, amount,
            payload.get("reason") or ("شحن رصيد" if txn_type == "credit" else "سحب رصيد"),
            "manual", "", user.get("name", ""),
        )
        return {"balance": new_balance, "transaction": txn}

    async def _move_reseller_balance(reseller_id, txn_type, amount, reason, ref_type, ref_id, created_by):
        reseller = await db.resellers.find_one({"id": reseller_id}, {"_id": 0})
        if not reseller:
            raise HTTPException(status_code=404, detail="الموزّع غير موجود")
        if txn_type == "debit":
            updated = await db.resellers.find_one_and_update(
                {"id": reseller_id, "balance": {"$gte": amount}},
                {"$inc": {"balance": -amount}},
                return_document=ReturnDocument.AFTER, projection={"_id": 0},
            )
            if not updated:
                raise HTTPException(status_code=400, detail="رصيد الموزّع غير كافي")
            delta = -amount
        else:
            updated = await db.resellers.find_one_and_update(
                {"id": reseller_id},
                {"$inc": {"balance": amount}},
                return_document=ReturnDocument.AFTER, projection={"_id": 0},
            )
            delta = amount
        new_balance = updated["balance"]
        txn = {
            "id": str(uuid.uuid4()),
            "reseller_id": reseller_id,
            "reseller_name": reseller.get("name", ""),
            "type": txn_type,
            "amount": amount,
            "balance_before": new_balance - delta,
            "balance_after": new_balance,
            "reason": reason,
            "reference_type": ref_type,
            "reference_id": ref_id,
            "created_by": created_by,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        # Keep balance and ledger consistent: if the audit write fails, revert the
        # balance mutation so we never change a balance without a recorded transaction.
        try:
            await db.reseller_transactions.insert_one(dict(txn))
        except Exception:
            try:
                await db.resellers.update_one({"id": reseller_id}, {"$inc": {"balance": -delta}})
            except Exception:
                logger.exception("reseller balance revert failed for %s", reseller_id)
            logger.exception("reseller ledger write failed; reverted balance for %s", reseller_id)
            raise HTTPException(status_code=500, detail="فشل تسجيل حركة الموزّع")
        txn.pop("_id", None)
        return new_balance, txn

    # ============================================================
    # Subscriptions
    # ============================================================
    def _build_sub_doc(payload, user):
        start_dt = _parse_dt(payload.get("start_date"))
        duration = int(_to_float(payload.get("duration_months"), 1)) or 1
        end_iso = payload.get("end_date")
        if end_iso:
            end_dt = _parse_dt(end_iso)
        else:
            end_dt = _add_months(start_dt, duration)
        cost = _to_float(payload.get("cost"))
        price = _to_float(payload.get("price"))
        # Coerce any unknown / legacy ("wallet") payment method to "cash" so stale
        # clients can never re-introduce the SaaS-wallet flow.
        pm = (payload.get("payment_method") or "cash").lower()
        if pm not in ("cash", "reseller", "debt"):
            pm = "cash"
        return {
            "category": payload.get("category") or "iptv",
            "service_id": payload.get("service_id") or "",
            "service_name": payload.get("service_name") or "",
            "customer_id": payload.get("customer_id") or "",
            "customer_name": payload.get("customer_name") or "",
            "duration_months": duration,
            "line_type": payload.get("line_type") or "m3u",  # m3u | userpass | code
            "m3u_url": payload.get("m3u_url") or "",
            "username": payload.get("username") or "",
            "password": payload.get("password") or "",
            "activation_code": payload.get("activation_code") or "",
            "server_name": payload.get("server_name") or "",
            "supplier_name": payload.get("supplier_name") or "",
            "cost": cost,
            "price": price,
            "profit": round(price - cost, 2),
            "start_date": start_dt.isoformat(),
            "end_date": end_dt.isoformat(),
            "reseller_id": payload.get("reseller_id") or "",
            "reseller_name": payload.get("reseller_name") or "",
            "payment_method": pm,  # cash|reseller|debt
            "notes": payload.get("notes") or "",
        }

    @router.get("/subscriptions")
    async def list_subscriptions(
        status: Optional[str] = None,
        category: Optional[str] = None,
        reseller_id: Optional[str] = None,
        customer_id: Optional[str] = None,
        user: dict = Depends(require_tenant),
    ):
        query = {}
        if category:
            query["category"] = category
        if reseller_id:
            query["reseller_id"] = reseller_id
        if customer_id:
            query["customer_id"] = customer_id
        subs = await db.digital_subscriptions.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
        for s in subs:
            s["status"] = _sub_status(s.get("end_date"))
        if status:
            subs = [s for s in subs if s["status"] == status]
        return subs

    @router.get("/subscriptions/expiring")
    async def expiring_subscriptions(days: int = 7, user: dict = Depends(require_tenant)):
        now = datetime.now(timezone.utc)
        horizon = now + timedelta(days=max(0, days))
        subs = await db.digital_subscriptions.find({}, {"_id": 0}).to_list(2000)
        out = []
        for s in subs:
            end = _parse_dt(s.get("end_date"))
            if now <= end <= horizon:
                s["status"] = _sub_status(s.get("end_date"))
                out.append(s)
        out.sort(key=lambda x: x.get("end_date") or "")
        return out

    @router.get("/subscriptions/{sub_id}")
    async def get_subscription(sub_id: str, user: dict = Depends(require_tenant)):
        sub = await db.digital_subscriptions.find_one({"id": sub_id}, {"_id": 0})
        if not sub:
            raise HTTPException(status_code=404, detail="الاشتراك غير موجود")
        sub["status"] = _sub_status(sub.get("end_date"))
        return sub

    @router.post("/subscriptions", status_code=201)
    async def create_subscription(payload: dict, user: dict = Depends(require_tenant)):
        sub_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        doc = _build_sub_doc(payload, user)
        doc.update({"id": sub_id, "created_at": now, "created_by": user.get("name", "")})

        # Unified tenant wallet (choice 1-أ): a digital/IPTV/system-subscription sale
        # draws from the tenant's OWN single platform wallet (main_db.wallets), funded
        # down the chain from صاحب النظام. We debit it by the COST exactly like the
        # mobile-recharge flow — blocks (HTTP 400) when the balance is insufficient.
        from services.wallet_service import debit_wallet, credit_wallet
        entity_id = user.get("tenant_id") or user.get("id", "")
        cost = _to_float(doc.get("cost"))
        wallet_debited = False
        if cost > 0:
            await debit_wallet(
                main_db, entity_id, cost, "digital_subscription", sub_id,
                f"بيع اشتراك {doc['service_name'] or doc['category']}",
                user.get("name", ""),
            )
            wallet_debited = True

        reseller_debited = False

        # If the sale is attributed to a reseller, charge the reseller's OWN balance
        # (a tenant-local ledger) by the sale PRICE.
        if doc["reseller_id"]:
            try:
                _, _ = await _move_reseller_balance(
                    doc["reseller_id"], "debit", doc["price"],
                    f"بيع اشتراك {doc['service_name'] or doc['category']}",
                    "digital_subscription", sub_id, user.get("name", ""),
                )
                reseller_debited = True
            except Exception:
                if wallet_debited:
                    try:
                        await credit_wallet(main_db, entity_id, cost, "digital_subscription_refund",
                                            sub_id, "استرجاع اشتراك فاشل", user.get("name", ""))
                    except Exception:
                        logger.exception("wallet compensation failed for %s", sub_id)
                raise

        # Persist the subscription; refund every debit on failure.
        try:
            await db.digital_subscriptions.insert_one(dict(doc))
        except Exception as e:
            if reseller_debited:
                try:
                    await _move_reseller_balance(doc["reseller_id"], "credit", doc["price"],
                                                 "استرجاع اشتراك فاشل", "digital_subscription_refund",
                                                 sub_id, user.get("name", ""))
                except Exception:
                    logger.exception("reseller compensation failed for %s", sub_id)
            if wallet_debited:
                try:
                    await credit_wallet(main_db, entity_id, cost, "digital_subscription_refund",
                                        sub_id, "استرجاع اشتراك فاشل", user.get("name", ""))
                except Exception:
                    logger.exception("wallet compensation failed for %s", sub_id)
            logger.exception("subscription creation failed after debits: %s", sub_id)
            raise HTTPException(status_code=500, detail="فشل تسجيل الاشتراك") from e

        doc.pop("_id", None)
        doc["status"] = _sub_status(doc.get("end_date"))
        return doc

    @router.put("/subscriptions/{sub_id}")
    async def update_subscription(sub_id: str, payload: dict, user: dict = Depends(require_tenant)):
        existing = await db.digital_subscriptions.find_one({"id": sub_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="الاشتراك غير موجود")
        merged = {**existing, **payload}
        doc = _build_sub_doc(merged, user)
        doc["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.digital_subscriptions.update_one({"id": sub_id}, {"$set": doc})
        result = await db.digital_subscriptions.find_one({"id": sub_id}, {"_id": 0})
        result["status"] = _sub_status(result.get("end_date"))
        return result

    @router.delete("/subscriptions/{sub_id}")
    async def delete_subscription(sub_id: str, admin: dict = Depends(get_tenant_admin)):
        res = await db.digital_subscriptions.delete_one({"id": sub_id})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="الاشتراك غير موجود")
        return {"success": True}

    # ============================================================
    # Platform catalog (read-only for tenants + purchase)
    # ============================================================
    @router.get("/platform-catalog")
    async def list_platform_catalog_for_tenant(user: dict = Depends(require_tenant)):
        """Tenant: browse active platform-level packages available for purchase."""
        items = await main_db.platform_digital_catalog.find(
            {"active": True}, {"_id": 0}
        ).sort("created_at", -1).to_list(500)
        return items

    @router.post("/platform-catalog/{item_id}/purchase", status_code=201)
    async def purchase_platform_item(item_id: str, user: dict = Depends(require_tenant)):
        """Tenant: buy a platform catalog item — debit wallet by cost_price, add to tenant's digital_services."""
        from services.wallet_service import debit_wallet

        item = await main_db.platform_digital_catalog.find_one({"id": item_id, "active": True}, {"_id": 0})
        if not item:
            raise HTTPException(status_code=404, detail="الباقة غير موجودة أو غير متاحة")

        cost = item.get("cost_price", 0.0)
        tenant_id = user.get("tenant_id") or user.get("id", "")
        ref_id = str(uuid.uuid4())

        if cost > 0:
            await debit_wallet(
                main_db=main_db,
                entity_id=tenant_id,
                amount=cost,
                ref_type="platform_catalog_purchase",
                ref_id=ref_id,
                description=f"شراء باقة: {item.get('name', '')}",
                created_by=user.get("name", ""),
                entity_type="tenant",
            )

        now = datetime.now(timezone.utc).isoformat()
        service_doc = {
            "id": str(uuid.uuid4()),
            "name": item.get("name", ""),
            "category": item.get("category", "iptv"),
            "supplier_name": item.get("supplier_name", ""),
            "server_name": item.get("server_name", ""),
            "duration_months": item.get("duration_months"),
            "default_cost": cost,
            "default_price": item.get("sell_price", 0.0),
            "notes": item.get("description", ""),
            "active": True,
            "platform_catalog_id": item_id,
            "created_at": now,
            "created_by": user.get("name", ""),
        }
        await db.digital_services.insert_one(dict(service_doc))
        service_doc.pop("_id", None)
        return service_doc

    # ============================================================
    # Dashboard stats
    # ============================================================
    @router.get("/stats")
    async def stats(user: dict = Depends(require_tenant)):
        subs = await db.digital_subscriptions.find({}, {"_id": 0}).to_list(5000)
        total = len(subs)
        active = expiring = expired = 0
        total_profit = 0.0
        total_sales = 0.0
        for s in subs:
            st = _sub_status(s.get("end_date"))
            if st == "active":
                active += 1
            elif st == "expiring":
                expiring += 1
            else:
                expired += 1
            total_profit += _to_float(s.get("profit"))
            total_sales += _to_float(s.get("price"))
        resellers = await db.resellers.find({}, {"_id": 0}).to_list(1000)
        return {
            "total_subscriptions": total,
            "active": active,
            "expiring": expiring,
            "expired": expired,
            "total_profit": round(total_profit, 2),
            "total_sales": round(total_sales, 2),
            "resellers_count": len(resellers),
            "resellers_balance": round(sum(_to_float(r.get("balance")) for r in resellers), 2),
            "services_count": await db.digital_services.count_documents({}),
        }

    return router
