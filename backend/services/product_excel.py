"""Shared transactional product spreadsheet import."""
import asyncio
import re
import uuid
from datetime import datetime, timezone

from config.database import client
from models.schemas import ProductCreate
from pymongo.errors import DuplicateKeyError, PyMongoError
from services.warehouse_stock import adjust_warehouse_stock


def _identity_claim_ids(doc: dict) -> list:
    claims = []
    for field in ("name_en", "name_ar"):
        value = (doc.get(field) or "").strip().casefold()
        if value:
            claims.append(field + ":" + value)
    barcode = str(doc.get("barcode") or "").strip()
    if barcode:
        claims.append("barcode:" + barcode)
    return list(dict.fromkeys(claims))


async def _assert_identities_available(db, doc: dict, exclude_id: str = "", session=None):
    for field in ("name_en", "name_ar"):
        value = (doc.get(field) or "").strip()
        if not value:
            continue
        query = {field: {"$regex": f"^{re.escape(value)}$", "$options": "i"}}
        if exclude_id:
            query["id"] = {"$ne": exclude_id}
        clash = await db.products.find_one(query, {"_id": 0, "id": 1}, session=session)
        if clash:
            raise ValueError("اسم المنتج مستعمل في منتج آخر")
    barcode = str(doc.get("barcode") or "").strip()
    if barcode:
        query = {"$or": [{"barcode": barcode}, {"additional_barcodes": barcode}]}
        if exclude_id:
            query["id"] = {"$ne": exclude_id}
        clash = await db.products.find_one(query, {"_id": 0, "id": 1}, session=session)
        if clash:
            raise ValueError("الباركود مستعمل في منتج آخر")


async def _claim_identities(db, product_id: str, doc: dict, session):
    for claim_id in _identity_claim_ids(doc):
        existing = await db.product_identity_claims.find_one({"_id": claim_id}, session=session)
        if existing and existing.get("product_id") != product_id:
            raise ValueError("اسم المنتج أو الباركود مستعمل مسبقاً")
        if not existing:
            await db.product_identity_claims.insert_one({
                "_id": claim_id, "product_id": product_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }, session=session)


async def _audit_product(db, action: str, product_id: str, product_name: str,
                         admin: dict, details: dict, session):
    await db.product_audit_log.insert_one({
        "id": str(uuid.uuid4()), "action": action, "product_id": product_id,
        "product_name": product_name, "user_id": admin.get("id", ""),
        "performed_by": admin.get("name", admin.get("email", "")),
        "details": details, "created_at": datetime.now(timezone.utc).isoformat(),
    }, session=session)


def _validated_row(row: dict):
    barcode = str(row.get("الباركود", "") or "").strip()
    name_ar = str(row.get("الاسم (عربي)") or "").strip()
    name_en = str(row.get("الاسم (إنجليزي)") or "").strip()
    raw_data = {
        "barcode": barcode,
        "name_ar": name_ar or name_en,
        "name_en": name_en or name_ar,
        "description_ar": str(row.get("الوصف (عربي)") or ""),
        "description_en": str(row.get("الوصف (إنجليزي)") or ""),
        "purchase_price": row.get("سعر الشراء", 0) or 0,
        "wholesale_price": row.get("سعر الجملة", 0) or 0,
        "retail_price": row.get("سعر التجزئة", 0) or 0,
        "quantity": row.get("الكمية", 0) or 0,
        "low_stock_threshold": row.get("حد المخزون المنخفض", 10)
            if row.get("حد المخزون المنخفض", 10) not in (None, "") else 10,
        "compatible_models": [m.strip() for m in str(
            row.get("الموديلات المتوافقة") or "").split(",") if m.strip()],
        "image_url": str(row.get("رابط الصورة") or ""),
    }
    optional_fields = ("article_code", "family_id", "tax_rate", "unit_of_measure")
    for field in optional_fields:
        if field in row:
            raw_data[field] = row[field]
    validated = ProductCreate(**raw_data)
    update_data = {
        field: getattr(validated, field) for field in (
            "barcode", "name_ar", "name_en", "description_ar", "description_en",
            "purchase_price", "wholesale_price", "retail_price", "quantity",
            "low_stock_threshold", "compatible_models", "image_url",
        )
    }
    for field in optional_fields:
        if field in raw_data:
            update_data[field] = getattr(validated, field)
    if "category" in row:
        update_data["category"] = str(row.get("category") or "")
    return validated, update_data, barcode, name_ar, name_en


async def apply_product_excel_row(db, row: dict, row_number: int, now: str, admin: dict,
                                  source: str = "excel_import"):
    if not str(row.get("الاسم (عربي)") or "").strip() and not str(row.get("الاسم (إنجليزي)") or "").strip():
        return "skipped"
    validated, update_data, barcode, name_ar, name_en = _validated_row(row)
    update_data["updated_at"] = now

    for attempt in range(5):
        try:
            outcome = None
            async with await client.start_session() as tx_session:
                async with tx_session.start_transaction():
                    barcode_match = None
                    if barcode:
                        barcode_match = await db.products.find_one({
                            "$or": [{"barcode": barcode}, {"additional_barcodes": barcode}]
                        }, session=tx_session)
                    name_clauses = []
                    for value in dict.fromkeys(v for v in (name_ar, name_en) if v):
                        for field in ("name_ar", "name_en"):
                            name_clauses.append({
                                field: {"$regex": f"^{re.escape(value)}$", "$options": "i"}
                            })
                    name_matches = await db.products.find(
                        {"$or": name_clauses}, session=tx_session
                    ).to_list(2) if name_clauses else []
                    if barcode_match and any(
                        item.get("id") != barcode_match.get("id") for item in name_matches
                    ):
                        raise ValueError("الباركود والاسم يشيران إلى منتجين مختلفين")
                    if not barcode_match and len(name_matches) > 1:
                        raise ValueError("اسم المنتج يطابق أكثر من منتج؛ استخدم الباركود")
                    existing = barcode_match or (name_matches[0] if name_matches else None)
                    main_warehouse = await db.warehouses.find_one(
                        {"is_main": True}, session=tx_session
                    )

                    if existing:
                        product_id = existing["id"]
                        identity_doc = {**existing, **update_data}
                        await _assert_identities_available(
                            db, identity_doc, product_id, tx_session
                        )
                        await _claim_identities(db, product_id, identity_doc, tx_session)
                        desired_claims = _identity_claim_ids(identity_doc)
                        await db.product_identity_claims.delete_many(
                            {"product_id": product_id, "_id": {"$nin": desired_claims}},
                            session=tx_session,
                        )
                        old_quantity = float(existing.get("quantity", 0) or 0)
                        new_quantity = float(update_data["quantity"])
                        changed_by = admin.get("name", admin.get("email", ""))
                        for price_field in ("purchase_price", "wholesale_price", "retail_price"):
                            old_price = float(existing.get(price_field, 0) or 0)
                            new_price = float(update_data[price_field])
                            if new_price == old_price:
                                continue
                            await db.price_history.insert_one({
                                "id": str(uuid.uuid4()), "product_id": product_id,
                                "product_name": existing.get("name_ar") or existing.get("name_en") or "",
                                "old_price": old_price, "new_price": new_price,
                                "price_type": price_field,
                                "change_percent": round(
                                    ((new_price - old_price) / old_price) * 100, 2
                                ) if old_price else 0.0,
                                "changed_by": changed_by, "changed_by_name": changed_by,
                                "source": source, "reference": f"row:{row_number}",
                                "created_at": now,
                            }, session=tx_session)
                        if main_warehouse:
                            await adjust_warehouse_stock(
                                db, product_id, main_warehouse["id"], new_quantity - old_quantity,
                                product_quantity_before=old_quantity, session=tx_session,
                            )
                        await db.products.update_one(
                            {"_id": existing["_id"]}, {"$set": update_data}, session=tx_session
                        )
                        await _audit_product(
                            db, "update", product_id, identity_doc["name_ar"] or identity_doc["name_en"],
                            admin, {"source": source, "row": row_number,
                                    "changed_fields": sorted(update_data)}, tx_session,
                        )
                        outcome = "updated"
                    else:
                        product_id = str(uuid.uuid4())
                        product_doc = validated.model_dump()
                        product_doc.update(update_data)
                        product_doc.update({
                            "id": product_id, "name": validated.name_ar or validated.name_en,
                            "created_at": now, "updated_at": now,
                        })
                        await _assert_identities_available(db, product_doc, session=tx_session)
                        await _claim_identities(db, product_id, product_doc, tx_session)
                        await db.products.insert_one(product_doc, session=tx_session)
                        if main_warehouse:
                            await adjust_warehouse_stock(
                                db, product_id, main_warehouse["id"], float(validated.quantity),
                                product_quantity_before=0, session=tx_session,
                            )
                        await _audit_product(
                            db, "create", product_id, product_doc["name"], admin,
                            {"source": source, "row": row_number, "barcode": barcode}, tx_session,
                        )
                        outcome = "created"
            return outcome
        except DuplicateKeyError:
            if attempt == 4:
                raise ValueError("تعارض متزامن في اسم المنتج أو الباركود")
            await asyncio.sleep(0.02 * (2 ** attempt))
        except PyMongoError as exc:
            if attempt == 4 or not exc.has_error_label("TransientTransactionError"):
                raise
            await asyncio.sleep(0.02 * (2 ** attempt))
    raise ValueError("تعذر استيراد الصف بعد إعادة المحاولة")
