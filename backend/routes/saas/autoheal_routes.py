"""
AutoHeal Routes — p54
Super-admin API for the AutoHeal engine: health, scan history, findings,
manual scan trigger, and approval-gated remediations.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone


def create_autoheal_routes(get_super_admin):
    router = APIRouter(prefix="/saas/autoheal", tags=["AutoHeal"])

    def _engine():
        from services.autoheal_service import get_engine
        return get_engine()

    def _db():
        from config.database import main_db
        return main_db

    @router.get("/health")
    async def autoheal_health(admin: dict = Depends(get_super_admin)):
        db = _db()
        last_scan = await db.autoheal_scans.find_one(
            {}, {"_id": 0}, sort=[("started_at", -1)]
        )
        counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
        async for f in db.autoheal_findings.find(
            {"status": {"$in": ["active", "awaiting_approval"]}}, {"_id": 0, "severity": 1}
        ):
            if f.get("severity") in counts:
                counts[f["severity"]] += 1
        score = 100 - 25 * counts["Critical"] - 10 * counts["High"] - 5 * counts["Medium"] - 2 * counts["Low"]
        return {
            "health_score": max(0, score),
            "active_counts": counts,
            "active_total": sum(counts.values()),
            "awaiting_approval": await db.autoheal_findings.count_documents({"status": "awaiting_approval"}),
            "last_scan": last_scan,
            "engine": "AutoHeal-v1",
        }

    @router.get("/scans")
    async def autoheal_scans(limit: int = 20, admin: dict = Depends(get_super_admin)):
        limit = max(1, min(limit, 100))
        items = await _db().autoheal_scans.find(
            {}, {"_id": 0}
        ).sort("started_at", -1).limit(limit).to_list(limit)
        return {"items": items}

    @router.get("/findings")
    async def autoheal_findings(
        status: Optional[str] = None,
        severity: Optional[str] = None,
        limit: int = 50,
        admin: dict = Depends(get_super_admin),
    ):
        query = {}
        if status:
            query["status"] = status
        if severity:
            query["severity"] = severity
        limit = max(1, min(limit, 200))
        items = await _db().autoheal_findings.find(
            query, {"_id": 0}
        ).sort("last_seen", -1).limit(limit).to_list(limit)
        return {"items": items}

    @router.post("/scan")
    async def autoheal_run_scan(admin: dict = Depends(get_super_admin)):
        """Reactive scan — run now and return the scan report."""
        report = await _engine().run_scan("reactive")
        return report

    @router.post("/findings/{finding_id}/approve")
    async def autoheal_approve(finding_id: str, admin: dict = Depends(get_super_admin)):
        db = _db()
        finding = await db.autoheal_findings.find_one({"id": finding_id}, {"_id": 0})
        if not finding:
            raise HTTPException(status_code=404, detail="النتيجة غير موجودة")
        if finding.get("status") not in ("awaiting_approval", "active"):
            raise HTTPException(status_code=400, detail="هذه النتيجة معالَجة مسبقاً")
        if not finding.get("remediation_key"):
            raise HTTPException(status_code=400, detail="لا يوجد إصلاح آلي لهذه النتيجة — راجع التفاصيل يدوياً")
        result = await _engine().execute_remediation(finding, approved_by=admin.get("email", "super_admin"))
        if not result.get("ok"):
            raise HTTPException(status_code=400, detail=result.get("detail", "فشل الإصلاح"))
        await db.autoheal_findings.update_one(
            {"id": finding_id},
            {"$set": {
                "status": "resolved",
                "auto_action_taken": finding.get("remediation_key"),
                "auto_action_status": "success",
                "resolved_at": datetime.now(timezone.utc).isoformat(),
                "resolved_by": admin.get("email", "super_admin"),
                "remediation_result": result.get("detail"),
            }},
        )
        return {"message": result.get("detail"), "status": "resolved"}

    @router.post("/findings/{finding_id}/dismiss")
    async def autoheal_dismiss(finding_id: str, admin: dict = Depends(get_super_admin)):
        db = _db()
        r = await db.autoheal_findings.update_one(
            {"id": finding_id, "status": {"$in": ["active", "awaiting_approval"]}},
            {"$set": {
                "status": "dismissed",
                "resolved_at": datetime.now(timezone.utc).isoformat(),
                "resolved_by": admin.get("email", "super_admin"),
            }},
        )
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="النتيجة غير موجودة أو معالَجة مسبقاً")
        return {"message": "تم التجاهل", "status": "dismissed"}

    @router.get("/error-classes")
    async def autoheal_error_classes(limit: int = 50, admin: dict = Depends(get_super_admin)):
        """p225: classified error signatures with recurrence counts."""
        limit = max(1, min(limit, 200))
        items = await _db().autoheal_error_signatures.find(
            {}, {"_id": 0}).sort("count", -1).limit(limit).to_list(limit)
        by_cat = {}
        for i in items:
            by_cat[i.get("category", "application")] = by_cat.get(i.get("category", "application"), 0) + i.get("count", 0)
        unclassified = await _db().system_errors.count_documents({"classification": {"$exists": False}})
        return {"items": items, "by_category": by_cat, "unclassified": unclassified}

    @router.post("/classify")
    async def autoheal_classify_now(admin: dict = Depends(get_super_admin)):
        """p225: run the error classifier now (also runs automatically every scan)."""
        from services.autoheal_level1 import classify_system_errors
        return await classify_system_errors(_db())

    @router.get("/runbooks")
    async def autoheal_runbooks(admin: dict = Depends(get_super_admin)):
        """p225: the known-error runbook catalog."""
        from services.autoheal_level1 import RUNBOOKS
        return {"runbooks": [{"category": k, **v} for k, v in RUNBOOKS.items()]}

    @router.get("/morning-report")
    async def autoheal_morning_report(date: Optional[str] = None, admin: dict = Depends(get_super_admin)):
        """p225: latest morning report (or a specific date YYYY-MM-DD)."""
        q = {"date": date} if date else {}
        doc = await _db().autoheal_morning_reports.find_one(
            q, {"_id": 0}, sort=[("generated_at", -1)])
        if not doc:
            raise HTTPException(status_code=404, detail="لا يوجد تقرير صباحي بعد")
        return doc

    @router.post("/morning-report/generate")
    async def autoheal_morning_report_generate(admin: dict = Depends(get_super_admin)):
        """p225: force-generate today's morning report."""
        from services.autoheal_level1 import generate_morning_report
        return await generate_morning_report(_db())

    @router.get("/known-issues")
    async def autoheal_known_issues(admin: dict = Depends(get_super_admin)):
        items = await _db().autoheal_known_issues.find(
            {}, {"_id": 0}
        ).sort("occurrences", -1).limit(50).to_list(50)
        return {"items": items}

    return router
