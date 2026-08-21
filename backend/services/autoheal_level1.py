"""AutoHeal Level-1 (p225) — rule-based self-healing on top of the p54 engine.

Three pillars (report §4.1):
  1. Error classification — every system_errors row gets {category, signature}
     and a recurrence counter (autoheal_error_signatures).
  2. Runbooks — a known-error catalog mapping categories to concrete steps.
     Golden rule: automated fixes are SUGGESTED, never imposed on financial
     data — tenant-data checks produce advisory findings with NO
     remediation_key (manual review only).
  3. Morning report — a daily digest of the last 24h: scans, findings,
     auto-fixes, top error categories, and what needs the owner's hand.
"""
from datetime import datetime, timezone, timedelta
import logging
import re
import uuid

logger = logging.getLogger("autoheal_level1")

LOCAL_TZ = timezone(timedelta(hours=1))  # Africa/Algiers

# ── 1. Error classifier ─────────────────────────────────────────────────────
# Ordered: first match wins. Keywords matched against type+message (lowercase).
ERROR_CATEGORIES = [
    ("database", ["mongo", "pymongo", "serverselectiontimeout", "duplicate key", "duplicatekey", "e11000", "bson"]),
    ("cache", ["redis", "6379", "cache connection"]),
    ("network", ["timeout", "timed out", "connecterror", "connection refused", "httpx", "dns", "unreachable"]),
    ("auth", ["401", "403", "unauthorized", "forbidden", "jwt", "token", "مصادقة"]),
    ("validation", ["validation", "pydantic", "valueerror", "typeerror", "keyerror", "attributeerror", "422"]),
    ("integration", ["bridge", "woocommerce", "webhook", "provider", "smtp", "whatsapp", "ussd"]),
]
DEFAULT_CATEGORY = "application"

# ── 2. Runbooks ─────────────────────────────────────────────────────────────
RUNBOOKS = {
    "database": {
        "title_ar": "أخطاء قاعدة البيانات",
        "severity": "High", "notify": True,
        "steps_ar": [
            "تحقق من حالة القاعدة: docker ps | grep mongodb",
            "راجع سجل القاعدة: docker logs ntcommerce-mongodb-1 --tail 100",
            "إن توقفت: docker restart ntcommerce-mongodb-1 ثم تحقق من الـ replica set",
            "أخطاء duplicate key المتكررة تعني خلل منطق upsert — راجع آخر نشر",
        ],
    },
    "cache": {
        "title_ar": "فشل الاتصال بـ Redis",
        "severity": "High", "notify": True,
        "steps_ar": [
            "أعد التشغيل: docker restart ntcommerce-redis-1",
            "تحقق: docker exec ntcommerce-redis-1 redis-cli ping ← PONG",
            "أعد تشغيل الـ backend بعد عودة Redis: docker restart ntcommerce-backend-1",
        ],
    },
    "network": {
        "title_ar": "أخطاء الشبكة/المهلات",
        "severity": "Medium", "notify": False,
        "steps_ar": [
            "تحقق من الاتصال الصادر من الخادم (ping 8.8.8.8)",
            "إن كانت المهلات لخدمة خارجية واحدة — المشكلة عند المزوّد، راقب فقط",
        ],
    },
    "auth": {
        "title_ar": "أخطاء المصادقة",
        "severity": "Medium", "notify": False,
        "steps_ar": [
            "موجات 401/403 المتكررة قد تكون محاولة اختراق — راجع تنبيهات bruteforce",
            "إن كان مستأجراً واحداً — غالباً انتهت جلسته، لا إجراء",
        ],
    },
    "validation": {
        "title_ar": "أخطاء التحقق من البيانات",
        "severity": "Medium", "notify": False,
        "steps_ar": [
            "راجع العينة — غالباً طلب واجهة ببيانات ناقصة",
            "إن تكرر نفس الحقل: أضف تحققاً في الواجهة أو قيّد النموذج",
        ],
    },
    "integration": {
        "title_ar": "أخطاء التكاملات الخارجية",
        "severity": "High", "notify": True,
        "steps_ar": [
            "فشل الجسر: تحقق من تشغيل الجسر المحلي لدى المشترك",
            "فشل SMTP/WhatsApp: تحقق من المفاتيح في إعدادات البريد",
        ],
    },
    "application": {
        "title_ar": "أخطاء تطبيق غير مصنّفة",
        "severity": "Medium", "notify": False,
        "steps_ar": ["راجع العينة والتتبع الكامل في /saas-admin/system-logs"],
    },
}


def normalize_signature(text: str) -> str:
    sig = re.sub(r"[0-9a-f]{8}-[0-9a-f-]{27,}|[0-9a-f]{24}|\d+", "#", text or "")
    return re.sub(r"\s+", " ", sig).strip()[:160]


def classify_text(error_type: str, message: str) -> str:
    hay = f"{error_type or ''} {message or ''}".lower()
    for cat, keywords in ERROR_CATEGORIES:
        if any(k in hay for k in keywords):
            return cat
    return DEFAULT_CATEGORY


async def classify_system_errors(main_db, batch: int = 500) -> dict:
    """Tag unclassified system_errors rows and bump per-signature recurrence."""
    docs = await main_db.system_errors.find(
        {"classification": {"$exists": False}},
        {"_id": 0, "id": 1, "type": 1, "message": 1, "tenant_id": 1, "timestamp": 1},
    ).sort("timestamp", -1).limit(batch).to_list(batch)
    now = datetime.now(timezone.utc).isoformat()
    by_cat = {}
    for d in docs:
        cat = classify_text(d.get("type"), d.get("message"))
        sig = normalize_signature(d.get("message") or d.get("type") or "?")
        by_cat[cat] = by_cat.get(cat, 0) + 1
        await main_db.system_errors.update_one(
            {"id": d["id"]},
            {"$set": {"classification": {"category": cat, "signature": sig, "classified_at": now}}},
        )
        await main_db.autoheal_error_signatures.update_one(
            {"signature": sig},
            {"$set": {"category": cat, "last_seen": now,
                      "last_tenant_id": d.get("tenant_id", ""),
                      "sample": (d.get("message") or "")[:200]},
             "$inc": {"count": 1},
             "$setOnInsert": {"first_seen": now}},
            upsert=True,
        )
    return {"classified": len(docs), "by_category": by_cat, "remaining":
            await main_db.system_errors.count_documents({"classification": {"$exists": False}})}


# ── 3. Morning report ───────────────────────────────────────────────────────
async def generate_morning_report(main_db, report_date: str | None = None) -> dict:
    """Aggregate the last 24h into a digest. Idempotent per date (upsert)."""
    now_local = datetime.now(LOCAL_TZ)
    date = report_date or now_local.strftime("%Y-%m-%d")
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

    scans = await main_db.autoheal_scans.find(
        {"started_at": {"$gte": since}}, {"_id": 0}).to_list(1000)
    scores = [s.get("health_score", 100) for s in scans]
    new_findings = await main_db.autoheal_findings.find(
        {"first_seen": {"$gte": since}}, {"_id": 0}).to_list(500)
    resolved = await main_db.autoheal_findings.find(
        {"resolved_at": {"$gte": since}}, {"_id": 0, "severity": 1, "auto_action_taken": 1,
                                           "title_ar": 1, "status": 1}).to_list(500)
    awaiting = await main_db.autoheal_findings.find(
        {"status": "awaiting_approval"},
        {"_id": 0, "id": 1, "title_ar": 1, "severity": 1, "occurrences": 1}).to_list(20)
    errors = await main_db.system_errors.find(
        {"timestamp": {"$gte": since}, "classification": {"$exists": True}},
        {"_id": 0, "classification.category": 1, "severity": 1}).to_list(2000)
    err_by_cat = {}
    for e in errors:
        c = (e.get("classification") or {}).get("category", DEFAULT_CATEGORY)
        err_by_cat[c] = err_by_cat.get(c, 0) + 1
    top_sigs = await main_db.autoheal_error_signatures.find(
        {"last_seen": {"$gte": since}}, {"_id": 0}).sort("count", -1).limit(5).to_list(5)

    auto_fixed = [r for r in resolved if r.get("auto_action_taken")]
    doc = {
        "id": f"MR-{date}",
        "date": date,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "window_hours": 24,
        "scans": {"count": len(scans),
                  "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
                  "min_score": min(scores) if scores else None},
        "findings": {"new": len(new_findings),
                     "resolved": len(resolved),
                     "auto_fixed": len(auto_fixed),
                     "auto_fixed_titles": [r.get("title_ar") for r in auto_fixed[:10]]},
        "errors": {"total": len(errors), "by_category": err_by_cat},
        "top_recurring_errors": top_sigs,
        "needs_owner": [{"id": a["id"], "title": a.get("title_ar"),
                         "severity": a.get("severity"), "occurrences": a.get("occurrences", 1)}
                        for a in awaiting],
    }
    await main_db.autoheal_morning_reports.update_one(
        {"date": date}, {"$set": doc}, upsert=True)
    logger.info("AutoHeal morning report %s: scans=%s new=%s resolved=%s awaiting=%s",
                date, len(scans), len(new_findings), len(resolved), len(awaiting))
    return doc
