"""Idoom ADSL code inventory — stats, listing, bulk CSV upload, atomic sell."""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
import io
import csv
import logging
import math

logger = logging.getLogger(__name__)


from services.digital_inventory import claim_codes, release_codes


def build_idoom_router(db, main_db, require_tenant, get_tenant_admin):
    router = APIRouter()

    # ============ IDOOM CODE INVENTORY ============

    class IdoomCodeSell(BaseModel):
        denomination: float
        payment_method: str = "cash"  # cash | bank | wallet | credit
        customer_id: Optional[str] = None
        customer_phone: Optional[str] = None
        sell_price: Optional[float] = None  # custom price; defaults to denomination
        notes: Optional[str] = ""

    @router.get("/idoom/codes/stats")
    async def idoom_codes_stats(admin: dict = Depends(get_tenant_admin)):
        pipeline = [
            {"$group": {
                "_id": {"denomination": "$denomination", "status": "$status"},
                "count": {"$sum": 1},
            }}
        ]
        rows = await db.idoom_codes.aggregate(pipeline).to_list(100)
        result: dict = {}
        for row in rows:
            denom = str(row["_id"]["denomination"])
            status = row["_id"]["status"]
            if denom not in result:
                result[denom] = {"denomination": row["_id"]["denomination"], "available": 0, "sold": 0}
            result[denom][status] = row["count"]
        total_available = await db.idoom_codes.count_documents({"status": "available"})
        total_sold = await db.idoom_codes.count_documents({"status": "sold"})
        return {"by_denomination": list(result.values()), "total_available": total_available, "total_sold": total_sold}

    @router.get("/idoom/codes")
    async def list_idoom_codes(
        status: Optional[str] = None,
        denomination: Optional[float] = None,
        skip: int = 0,
        limit: int = 50,
        admin: dict = Depends(get_tenant_admin),
    ):
        query: dict = {}
        if status:
            query["status"] = status
        if denomination is not None:
            query["denomination"] = denomination
        docs = await db.idoom_codes.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        total = await db.idoom_codes.count_documents(query)
        return {"items": docs, "total": total}

    @router.post("/idoom/codes/bulk")
    async def idoom_bulk_upload(file: UploadFile = File(...), admin: dict = Depends(get_tenant_admin)):
        """Upload a CSV file with columns: code,denomination to add to inventory."""
        content = await file.read()
        try:
            text = content.decode("utf-8-sig")
        except Exception:
            text = content.decode("latin-1")
        reader = csv.DictReader(io.StringIO(text))
        now = datetime.now(timezone.utc).isoformat()
        inserted = 0
        duplicates = 0
        errors = []
        for i, row in enumerate(reader):
            code = (row.get("code") or row.get("Code") or "").strip()
            denom_raw = (row.get("denomination") or row.get("Denomination") or row.get("prix") or "").strip()
            if not code:
                errors.append(f"صف {i+2}: كود فارغ")
                continue
            try:
                denomination = float(denom_raw)
            except (ValueError, TypeError):
                errors.append(f"صف {i+2}: قيمة غير صالحة '{denom_raw}'")
                continue
            existing = await db.idoom_codes.find_one({"code": code})
            if existing:
                duplicates += 1
                continue
            await db.idoom_codes.insert_one({
                "id": str(uuid.uuid4()),
                "code": code,
                "denomination": denomination,
                "status": "available",
                "created_at": now,
                "added_by": admin.get("name", ""),
                "sold_at": None,
                "sold_txn_id": None,
                "customer_id": None,
            })
            inserted += 1
        return {"inserted": inserted, "duplicates": duplicates, "errors": errors}

    @router.post("/idoom/codes/sell")
    async def sell_idoom_code(body: IdoomCodeSell, user: dict = Depends(require_tenant)):
        """Debit wallet by denomination, mark a matching code as sold, return the code.
        Uses atomic find_one_and_update to prevent duplicate sales under concurrent requests.
        """
        from services.wallet_service import debit_wallet
        entity_id = user.get("tenant_id") or user.get("id", "")
        txn_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        # p506-006/007: validate money/debt counterparts BEFORE claiming stock or
        # debiting the tenant's platform wallet. The old order claimed+sold a code
        # and debited the wallet even when the receiving cash box / debtor was a ghost.
        if not math.isfinite(float(body.denomination or 0)) or float(body.denomination) <= 0:
            raise HTTPException(status_code=400, detail="قيمة الكود غير صالحة")
        sell_price = float(body.sell_price) if body.sell_price is not None else float(body.denomination)
        if not math.isfinite(sell_price) or sell_price <= 0:
            raise HTTPException(status_code=400, detail="سعر البيع غير صالح")
        is_credit_precheck = body.payment_method == "credit"
        customer_doc = None
        if is_credit_precheck:
            if not body.customer_id:
                raise HTTPException(status_code=400, detail="البيع الآجل يتطلب اختيار زبون")
            customer_doc = await db.customers.find_one({"id": body.customer_id}, {"_id": 0, "name": 1})
            if not customer_doc:
                raise HTTPException(status_code=404, detail="الزبون غير موجود")
        elif body.payment_method != "wallet":
            if not await db.cash_boxes.find_one({"id": body.payment_method}, {"_id": 1}):
                raise HTTPException(status_code=404, detail="الصندوق غير موجود")

        # Atomically claim one available code (prevents race conditions)
        claimed = await claim_codes(
            db, "idoom_codes",
            {"denomination": body.denomination, "status": "available"},
            {"status": "reserved", "sold_at": now, "sold_txn_id": txn_id,
             "customer_id": body.customer_id or ""},
            {"status": "available", "sold_at": None, "sold_txn_id": None, "customer_id": None},
            quantity=1,
        )
        code_doc = claimed[0] if claimed else None
        if not code_doc:
            raise HTTPException(status_code=404, detail=f"لا توجد أكواد Idoom متاحة بقيمة {body.denomination} دج")

        try:
            await debit_wallet(
                main_db, entity_id, body.denomination, "idoom_sell", txn_id,
                f"بيع كود Idoom {body.denomination} دج", user.get("name", ""),
            )
        except Exception as debit_err:
            # Wallet debit failed — release the claimed code back to available
            await release_codes(db, "idoom_codes", [code_doc["id"]],
                {"status": "available", "sold_at": None, "sold_txn_id": None, "customer_id": None})
            raise HTTPException(status_code=402, detail=str(debit_err))

        try:
            # Confirm sale
            await db.idoom_codes.update_one(
                {"id": code_doc["id"]},
                {"$set": {"status": "sold"}},
            )
            sell_price = float(body.sell_price) if body.sell_price is not None else float(body.denomination)
            is_credit = body.payment_method == "credit"
            customer_name = (customer_doc or {}).get("name", "") if is_credit else ""
            if is_credit:
                # Insert a sales row so customer debt picks it up
                await db.sales.insert_one({
                    "id": str(uuid.uuid4()),
                    "invoice_number": f"IDOOM-{txn_id[:6].upper()}",
                    "items": [{
                        "name": f"كود Idoom {body.denomination} دج",
                        "quantity": 1, "price": sell_price, "discount": 0,
                        "is_idoom": True, "idoom_code_id": code_doc["id"], "code": code_doc["code"],
                    }],
                    "subtotal": sell_price, "discount_total": 0, "tax_total": 0,
                    "total": sell_price, "paid_amount": 0, "debt_amount": sell_price,
                    "remaining": sell_price, "payment_method": "credit", "payment_type": "credit",
                    "status": "unpaid", "payments": [],
                    "customer_id": body.customer_id, "customer_name": customer_name,
                    "customer_phone": body.customer_phone,
                    "type": "idoom_credit", "source": "pos_quick_idoom",
                    "user_id": user.get("id"), "user_name": user.get("name", ""),
                    "created_at": now,
                })
                # Mirror the debt on the customer record immediately; this route
                # does not emit an outbox event, so the sales row alone was invisible
                # to the customer's balance mirror.
                await db.customers.update_one(
                    {"id": body.customer_id},
                    {"$inc": {"total_purchases": sell_price, "balance": sell_price,
                              "total_debt": sell_price}},
                )
                # Daily session credit sales
                try:
                    await db.daily_sessions.update_one(
                        {"user_id": user.get("id"), "status": "open"},
                        {"$inc": {"total_sales": sell_price, "credit_sales": sell_price, "sales_count": 1}},
                    )
                except Exception:
                    pass
            elif body.payment_method != "wallet":
                await db.cash_boxes.update_one(
                    {"id": body.payment_method},
                    {"$inc": {"balance": sell_price}, "$set": {"updated_at": now}},
                )
                # Daily session cash sales
                try:
                    await db.daily_sessions.update_one(
                        {"user_id": user.get("id"), "status": "open"},
                        {"$inc": {"total_sales": sell_price, "cash_sales": sell_price, "sales_count": 1}},
                    )
                except Exception:
                    pass
            await db.transactions.insert_one({
                "id": str(uuid.uuid4()),
                "cash_box_id": body.payment_method,
                "type": "income",
                "amount": sell_price,
                "description": f"بيع كود Idoom {body.denomination} دج" + (f" (آجل - {customer_name})" if is_credit else ""),
                "reference_type": "idoom_sell",
                "reference_id": txn_id,
                "created_at": now,
                "created_by": user.get("name", ""),
            })
        except Exception as e:
            # DB logging failed after wallet was already debited — compensate + release code
            from services.wallet_service import credit_wallet
            try:
                await credit_wallet(
                    main_db, entity_id, body.denomination, "idoom_refund", txn_id,
                    "استرجاع بيع كود Idoom فاشل", user.get("name", ""),
                )
            except Exception:
                logger.exception("Failed to compensate idoom sell for txn %s", txn_id)
            try:
                await release_codes(db, "idoom_codes", [code_doc["id"]],
                    {"status": "available", "sold_at": None, "sold_txn_id": None, "customer_id": None})
            except Exception:
                logger.exception("Failed to release reserved idoom code %s", code_doc.get("id"))
            raise HTTPException(status_code=500, detail="فشل تسجيل عملية البيع") from e

        return {
            "ok": True,
            "code": code_doc["code"],
            "denomination": body.denomination,
            "txn_id": txn_id,
        }

    return router
