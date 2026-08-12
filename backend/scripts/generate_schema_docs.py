"""Generate SCHEMA.md from the live golden template DB (p33, item 10).

Run inside the backend container or on the host with MONGO access:
    python3 backend/scripts/generate_schema_docs.py
Writes SCHEMA.md at the repo root describing the tenant database schema:
collections, indexes, seed data, and the provisioning lifecycle.
"""
import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
TEMPLATE_DB = "template_tenant"

# Collections that carry golden-template seed data (kept in sync with
# services/tenant_template.py seed_data)
SEED_COLLECTIONS = {
    "cash_boxes": "الصناديق المالية (نقدي/بنكي/أجل/أخرى)",
    "warehouses": "المستودع الرئيسي",
    "settings": "الإعدادات العامة للنظام",
    "customer_families": "عائلات العملاء",
    "supplier_families": "عائلات الموردين",
    "product_families": "عائلات المنتجات",
    "currencies": "العملات (DZD/USD/EUR)",
    "currency_settings": "إعدادات العملة الافتراضية",
    "tax_rates": "معدلات الضريبة (VAT 19%/9% + TAP 1.5%)",
    "invoice_templates": "قوالب الفواتير (بسيط/مفصل/حراري)",
    "defect_categories": "تصنيفات عيوب الصيانة",
    "loyalty_settings": "إعدادات نقاط الولاء",
}

INFRA_COLLECTIONS = {
    "counters": "عدّادات الترقيم التسلسلي (migration 001)",
    "migration_log": "سجل الترقيات المنفذة على هذه القاعدة",
}


async def main() -> None:
    client = AsyncIOMotorClient(MONGO_URL)
    tpl = client[TEMPLATE_DB]

    cols = sorted(await tpl.list_collection_names())
    lines = []
    lines.append("# NT Commerce — مخطط قاعدة بيانات المستأجر\n")
    lines.append(
        f"> مولّد تلقائياً من القاعدة الذهبية `{TEMPLATE_DB}` — "
        f"{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}\n"
    )
    lines.append("## دورة حياة قاعدة المستأجر\n")
    lines.append(
        "1. **القالب الذهبي** `template_tenant`: المرجع الوحيد للمخطط (مجموعات + فهارس + بيانات أساسية).\n"
        "2. **التسجيل**: `copy_template_to_tenant()` تنسخ القالب لقاعدة `tenant_<id>` ثم `migrate_database()` تطبق الترقيات المعلقة فوراً.\n"
        "3. **الترقيات المرقمة** `backend/migrations/NNN_*.py`: تُطبق بالترتيب وتُسجل في `migration_log` لكل قاعدة.\n"
        "4. **الطبيب**: فحص أسبوعي تلقائي (روبوت سلامة البيانات) + يدوي عبر `/api/saas/template/doctor-all?fix=true`.\n"
        "5. **الحذف المتتالي**: أرشفة JSON كاملة في `/backups/` ثم حذف القاعدة وكل المراجع، مع سجل تدقيق.\n"
        "6. **اختبار الاستعادة**: شهري تلقائياً أو يدوياً عبر `/api/saas/restore-test`.\n"
    )
    lines.append(f"## المجموعات ({len(cols)})\n")
    lines.append("| المجموعة | الفهارس | مستندات البذور | الوصف |")
    lines.append("|---|---|---|---|")

    for col in cols:
        if col.startswith("system."):
            continue
        idx_names = []
        async for idx in tpl[col].list_indexes():
            if idx["name"] != "_id_":
                idx_names.append(idx["name"])
        count = await tpl[col].count_documents({})
        desc = SEED_COLLECTIONS.get(col) or INFRA_COLLECTIONS.get(col) or ("بيانات أساسية" if count else "")
        lines.append(
            f"| `{col}` | {len(idx_names)} | {count if count else '—'} | {desc} |"
        )

    lines.append("\n## تفاصيل الفهارس غير الافتراضية\n")
    lines.append("| المجموعة | الفهرس | المفاتيح | فريد |")
    lines.append("|---|---|---|---|")
    for col in cols:
        if col.startswith("system."):
            continue
        async for idx in tpl[col].list_indexes():
            if idx["name"] == "_id_":
                continue
            keys = ", ".join(f"{k}:{v}" for k, v in idx.get("key", {}).items())
            unique = "نعم" if idx.get("unique") else ""
            lines.append(f"| `{col}` | `{idx['name']}` | {keys} | {unique} |")

    lines.append("")
    out = os.environ.get("SCHEMA_OUT", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "SCHEMA.md"))
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"SCHEMA.md written: {out} ({len(cols)} collections)")


if __name__ == "__main__":
    asyncio.run(main())
