"""
Golden Tenant Template — قاعدة القالب الذهبي.

template_tenant is the single source of truth for what every tenant database
must contain: collections, indexes and seed data. Registration copies it
instead of the old piecemeal seeding; the doctor compares any tenant DB
against it and fixes drift.

Public API:
    build_template()                      → (re)build template_tenant from code
    copy_template_to_tenant(tenant_id)    → non-destructive copy into a tenant DB
    doctor_tenant(tenant_id, fix=False)   → diff report (+ optional auto-fix)
    doctor_all(fix=False)                 → doctor for every saas_tenants row
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from config.database import client, main_db, get_tenant_db

logger = logging.getLogger(__name__)

TEMPLATE_DB_NAME = "template_tenant"
TEMPLATE_VERSION = 1

# Collections that belong to the PLATFORM, never to a tenant DB — their
# indexes/seed must not leak into tenant copies.
PLATFORM_PREFIXES = ("saas_", "platform_", "agent_", "impersonation", "wallet")
PLATFORM_COLLECTIONS = {
    "tenants", "users", "super_admins", "wallets", "wallet_transactions",
    "store_slugs", "tenant_settings", "affiliates", "leads", "advances",
    "attendance", "chat_rooms", "chat_messages", "audit_logs",
    "database_operation_logs", "push_notifications", "notifications",
    "auto_reports", "collection_reports", "agent_tasks", "ai_chat_history",
    "fraud_alerts", "platform_alerts", "whatsapp_config",
}


def _is_tenant_collection(name: str) -> bool:
    if name in PLATFORM_COLLECTIONS:
        return False
    return not name.startswith(PLATFORM_PREFIXES)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def seed_data() -> dict:
    """Canonical seed documents for a fresh tenant (keyed by collection)."""
    now = _now()
    return {
        "cash_boxes": [
            {"id": "cash", "name": "الصندوق النقدي", "name_fr": "Caisse", "type": "cash", "balance": 0},
            {"id": "bank", "name": "الحساب البنكي", "name_fr": "Compte bancaire", "type": "bank", "balance": 0},
            {"id": "wallet", "name": "المحفظة الإلكترونية", "name_fr": "Portefeuille électronique", "type": "wallet", "balance": 0},
            {"id": "safe", "name": "الخزنة", "name_fr": "Coffre-fort", "type": "safe", "balance": 0},
        ],
        "warehouses": [
            {"id": "main", "name": "المخزن الرئيسي", "location": "", "is_main": True, "created_at": now},
        ],
        "settings": [
            {"id": "general", "low_stock_threshold": 10, "debt_reminder_days": 30,
             "currency": "دج", "language": "ar", "template_version": TEMPLATE_VERSION},
        ],
        "customer_families": [
            {"id": "default-customer-family", "name": "عام", "name_fr": "Général", "created_at": now},
        ],
        "customers": [
            {"id": "default-customer", "name": "زبون نقدي", "phone": "", "email": "",
             "family_id": "default-customer-family", "balance": 0, "total_debt": 0,
             "is_default": True, "created_at": now},
        ],
        "supplier_families": [
            {"id": "default-supplier-family", "name": "عام", "name_fr": "Général", "created_at": now},
        ],
        "suppliers": [
            {"id": "default-supplier", "name": "مورد عام", "phone": "", "email": "",
             "family_id": "default-supplier-family", "balance": 0,
             "is_default": True, "created_at": now},
        ],
        "product_families": [
            {"id": "default-product-family", "name": "عام", "name_fr": "Général", "created_at": now},
        ],
        "currencies": [
            {"code": "DZD", "name": "Algerian Dinar", "name_ar": "دينار جزائري", "symbol": "دج",
             "rate_to_dzd": 1.0, "is_default": True, "is_active": True, "updated_at": now},
            {"code": "USD", "name": "US Dollar", "name_ar": "دولار أمريكي", "symbol": "$",
             "rate_to_dzd": 135.0, "is_default": False, "is_active": True, "updated_at": now},
            {"code": "EUR", "name": "Euro", "name_ar": "يورو", "symbol": "€",
             "rate_to_dzd": 145.0, "is_default": False, "is_active": True, "updated_at": now},
        ],
        "currency_settings": [
            {"id": "global", "default_currency": "DZD", "show_multi_currency": False, "auto_convert": True},
        ],
        "tax_rates": [
            {"id": "vat-standard", "name": "VAT Standard", "name_ar": "ضريبة القيمة المضافة",
             "rate": 19, "type": "vat", "is_active": True, "created_at": now},
            {"id": "vat-reduced", "name": "VAT Reduced", "name_ar": "ضريبة مخفضة",
             "rate": 9, "type": "vat", "is_active": True, "created_at": now},
            {"id": "tap", "name": "TAP", "name_ar": "الضريبة على النشاط",
             "rate": 1.5, "type": "tap", "is_active": True, "created_at": now},
        ],
        "invoice_templates": [
            {"id": "simple", "name": "فاتورة بسيطة", "name_fr": "Facture simple", "type": "simple",
             "header_text": "", "footer_text": "شكراً لتعاملكم معنا", "show_logo": True,
             "show_qr": False, "is_default": True},
            {"id": "detailed", "name": "فاتورة تفصيلية", "name_fr": "Facture détaillée", "type": "detailed",
             "header_text": "", "footer_text": "", "show_logo": True, "show_qr": True, "is_default": False},
            {"id": "thermal", "name": "فاتورة حرارية", "name_fr": "Ticket thermique", "type": "thermal",
             "header_text": "", "footer_text": "", "show_logo": False, "show_qr": False, "is_default": False},
        ],
        "defect_categories": [
            {"id": "defect-mfg", "code": "MFG", "name_ar": "عيب تصنيع", "name_fr": "Défaut de fabrication", "severity": "high"},
            {"id": "defect-trn", "code": "TRN", "name_ar": "تلف أثناء النقل", "name_fr": "Dommage de transport", "severity": "medium"},
            {"id": "defect-str", "code": "STR", "name_ar": "تلف تخزين", "name_fr": "Dommage de stockage", "severity": "medium"},
            {"id": "defect-exp", "code": "EXP", "name_ar": "انتهاء الصلاحية", "name_fr": "Expiration", "severity": "high"},
            {"id": "defect-oth", "code": "OTH", "name_ar": "أخرى", "name_fr": "Autre", "severity": "low"},
        ],
        "loyalty_settings": [
            {"id": "global", "enabled": False, "points_per_dinar": 0.01, "points_value": 0.1,
             "min_redeem_points": 100, "welcome_bonus": 0},
        ],
    }


async def _index_specs(source_db) -> dict:
    """Harvest tenant-relevant index definitions from the (working) main DB."""
    specs = {}
    for col in await source_db.list_collection_names():
        if not _is_tenant_collection(col):
            continue
        idxs = []
        async for i in source_db[col].list_indexes():
            if i["name"] == "_id_":
                continue
            idxs.append({
                "key": list(i["key"].items()),
                "name": i["name"],
                "unique": bool(i.get("unique", False)),
                "sparse": bool(i.get("sparse", False)),
                "partial": i.get("partialFilterExpression"),
            })
        if idxs:
            specs[col] = idxs
    return specs


async def _apply_indexes(target_db, specs: dict) -> int:
    created = 0
    for col, idxs in specs.items():
        for spec in idxs:
            try:
                existing = [x async for x in target_db[col].list_indexes()]
                if any(x["name"] == spec["name"] for x in existing):
                    continue
                kwargs = {"name": spec["name"], "unique": spec["unique"], "sparse": spec["sparse"]}
                if spec["partial"]:
                    kwargs["partialFilterExpression"] = spec["partial"]
                await target_db[col].create_index(spec["key"], **kwargs)
                created += 1
            except Exception as e:  # index conflicts must never block provisioning
                logger.warning(f"template index {col}.{spec['name']}: {e}")
    return created


async def _seed_into(target_db, seeds: dict, only_missing: bool = True) -> int:
    inserted = 0
    for col, docs in seeds.items():
        for doc in docs:
            key = {"id": doc["id"]} if "id" in doc else {"code": doc.get("code")}
            exists = await target_db[col].find_one(key)
            if only_missing and exists:
                continue
            if exists:
                await target_db[col].replace_one(key, doc)
            else:
                await target_db[col].insert_one(doc)
            inserted += 1
    return inserted


async def build_template() -> dict:
    """(Re)build template_tenant: canonical seeds + indexes harvested from main DB."""
    tpl = client[TEMPLATE_DB_NAME]
    seeds = seed_data()
    inserted = await _seed_into(tpl, seeds, only_missing=False)
    specs = await _index_specs(main_db)
    created = await _apply_indexes(tpl, specs)
    await tpl.settings.update_one(
        {"id": "general"},
        {"$set": {"template_version": TEMPLATE_VERSION, "built_at": _now()}},
        upsert=True,
    )
    return {"seed_docs": inserted, "indexes": created, "index_collections": len(specs)}


async def copy_template_to_tenant(tenant_id: str) -> dict:
    """Provision (or repair) a tenant DB from the golden template — non-destructive."""
    tpl = client[TEMPLATE_DB_NAME]
    tenant_db = get_tenant_db(tenant_id)

    stats = {"docs": 0, "indexes": 0}
    for col_name in await tpl.list_collection_names():
        async for doc in tpl[col_name].find({}, {"_id": 0}):
            key = {"id": doc["id"]} if "id" in doc else ({"code": doc["code"]} if "code" in doc else None)
            if key is None:
                continue
            if not await tenant_db[col_name].find_one(key):
                await tenant_db[col_name].insert_one(doc)
                stats["docs"] += 1

    for col_name in await tpl.list_collection_names():
        async for i in tpl[col_name].list_indexes():
            if i["name"] == "_id_":
                continue
            existing = [x async for x in tenant_db[col_name].list_indexes()]
            if any(x["name"] == i["name"] for x in existing):
                continue
            kwargs = {"name": i["name"], "unique": bool(i.get("unique", False)), "sparse": bool(i.get("sparse", False))}
            if i.get("partialFilterExpression"):
                kwargs["partialFilterExpression"] = i["partialFilterExpression"]
            try:
                await tenant_db[col_name].create_index(list(i["key"].items()), **kwargs)
                stats["indexes"] += 1
            except Exception as e:
                logger.warning(f"copy index {col_name}.{i['name']}: {e}")

    await tenant_db.settings.update_one(
        {"id": "general"},
        {"$set": {"template_version": TEMPLATE_VERSION, "provisioned_at": _now()}},
        upsert=True,
    )
    return stats


async def doctor_tenant(tenant_id: str, fix: bool = False) -> dict:
    """Compare a tenant DB against the golden template; optionally auto-fix."""
    tpl = client[TEMPLATE_DB_NAME]
    tenant_db = get_tenant_db(tenant_id)

    missing_collections, missing_docs, missing_indexes = [], [], []
    tenant_cols = set(await tenant_db.list_collection_names())

    for col_name in await tpl.list_collection_names():
        if col_name not in tenant_cols:
            missing_collections.append(col_name)
        tpl_count = await tpl[col_name].count_documents({})
        if tpl_count:
            proj = {"_id": 0, "id": 1, "code": 1, "name": 1}
            async for doc in tpl[col_name].find({}, proj):
                key = None
                for f in ("id", "code", "name"):
                    if f in doc:
                        key = {f: doc[f]}
                        break
                if key is None:
                    continue  # infra docs (e.g. counters) have no stable identity
                if not await tenant_db[col_name].find_one(key):
                    missing_docs.append(f"{col_name}:{key}")
        tpl_idx = {i["name"] async for i in tpl[col_name].list_indexes()} - {"_id_"}
        t_idx = {i["name"] async for i in tenant_db[col_name].list_indexes()} - {"_id_"}
        for name in tpl_idx - t_idx:
            missing_indexes.append(f"{col_name}.{name}")

    report = {
        "tenant_id": tenant_id,
        "missing_collections": missing_collections,
        "missing_seed_docs": missing_docs[:50],
        "missing_seed_docs_total": len(missing_docs),
        "missing_indexes": missing_indexes[:50],
        "missing_indexes_total": len(missing_indexes),
        "healthy": not (missing_collections or missing_docs or missing_indexes),
    }
    if fix and not report["healthy"]:
        stats = await copy_template_to_tenant(tenant_id)
        report["fixed"] = stats
        report["healthy"] = True
    return report


async def doctor_all(fix: bool = False) -> list:
    """Run the doctor for every registered tenant."""
    reports = []
    async for t in main_db.saas_tenants.find({}, {"id": 1}):
        reports.append(await doctor_tenant(t["id"], fix=fix))
    return reports
