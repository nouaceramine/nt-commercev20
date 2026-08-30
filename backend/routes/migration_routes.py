"""p349 — Legacy system migration API.

First adapter: rlynx/BDV10 (Microsoft Access .dblx/.mdb/.accdb).
Tenant admin uploads the legacy DB file; a background job converts it
(mdbtools), imports masters + transactions with the faithful p159 logic
(FIFO debt allocation, opening balances), verifies against source
aggregates, and stores a full reconciliation report on the job doc.

Safety:
- One active job per tenant.
- Non-empty tenant DBs require ?force=true (import is additive — it never
  touches docs lacking import_source="BDV10").
- Full rollback endpoint purges every imported doc.
- Job state lives in the tenant DB (survives worker restarts, consistent
  across the 4 uvicorn workers).
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pymongo import MongoClient

from config.database import get_tenant_db
from utils.auth import get_tenant_admin
from core.db_naming import resolve_db_name
from services.legacy_import import bdv_service

router = APIRouter(prefix="/migration", tags=["legacy-migration"])

UPLOAD_ROOT = os.environ.get("LEGACY_UPLOAD_ROOT", "/legacy_uploads")
ALLOWED_EXT = (".dblx", ".mdb", ".accdb")
MAX_BYTES = 300 * 1024 * 1024  # 300MB hard cap per legacy DB file
JOBS_COLL = "migration_jobs"


def _now():
    return datetime.now(timezone.utc).isoformat()


def _sync_db(tenant_id: str):
    return MongoClient(os.environ["MONGO_URL"])[resolve_db_name(tenant_id)]


def _run_job(job_id: str, tenant_id: str, dblx_path: str, work_dir: str):
    """Background worker (thread): runs the full pipeline, writes progress
    into the job doc in the tenant DB."""
    db = _sync_db(tenant_id)

    def cb(step, label, done, total):
        db[JOBS_COLL].update_one(
            {"id": job_id},
            {"$set": {"step": step, "step_label": label, "done": done,
                      "total": total, "updated_at": _now()}})

    db[JOBS_COLL].update_one({"id": job_id},
                             {"$set": {"status": "running", "started_at": _now()}})
    try:
        report = bdv_service.run_full_import(db, dblx_path, work_dir, cb)
        db[JOBS_COLL].update_one(
            {"id": job_id},
            {"$set": {"status": "done", "report": report, "finished_at": _now(),
                      "step": "done",
                      "step_label": "اكتمل الاستيراد بنجاح" if report.get("all_ok")
                      else "اكتمل الاستيراد مع فروقات — راجع التقرير"}})
        # success: free disk (source file + exported tables)
        try:
            import shutil
            shutil.rmtree(work_dir, ignore_errors=True)
            if os.path.exists(dblx_path):
                os.remove(dblx_path)
        except Exception:
            pass
    except Exception as e:
        db[JOBS_COLL].update_one(
            {"id": job_id},
            {"$set": {"status": "failed", "error": str(e)[:500],
                      "finished_at": _now(), "step_label": "فشل الاستيراد"}})


@router.post("/legacy/jobs")
async def create_legacy_import_job(
    file: UploadFile = File(...),
    force: bool = Query(False),
    user: dict = Depends(get_tenant_admin),
):
    """Upload a legacy DB file (rlynx/BDV10 .dblx) and start the import job."""
    tenant_id = user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400,
                            detail="هذه الميزة لحسابات المشتركين — حدّد المستأجر")
    fname = (file.filename or "").lower()
    if not fname.endswith(ALLOWED_EXT):
        raise HTTPException(
            status_code=400,
            detail="صيغة غير مدعومة — ارفع ملف قاعدة النظام القديم (.dblx / .mdb / .accdb)")

    tdb = get_tenant_db(tenant_id)
    active = await tdb[JOBS_COLL].find_one(
        {"status": {"$in": ["queued", "running"]}}, {"_id": 0, "id": 1})
    if active:
        raise HTTPException(status_code=409,
                            detail="توجد عملية استيراد جارية — انتظر انتهاءها")

    existing_sales = await tdb.sales.estimated_document_count()
    if existing_sales > 0 and not force:
        raise HTTPException(
            status_code=409,
            detail=f"قاعدة بياناتك تحتوي {existing_sales} عملية بيع. الاستيراد إضافي "
                   "ولا يمس بياناتك الحالية، لكن أعد الإرسال مع force=true للتأكيد.")

    job_id = str(uuid.uuid4())
    job_dir = os.path.join(UPLOAD_ROOT, tenant_id, job_id)
    os.makedirs(job_dir, exist_ok=True)
    dblx_path = os.path.join(job_dir, "source" + os.path.splitext(fname)[1])

    size = 0
    with open(dblx_path, "wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_BYTES:
                out.close()
                try:
                    os.remove(dblx_path)
                except OSError:
                    pass
                raise HTTPException(status_code=413,
                                    detail="الملف أكبر من 300MB")
            out.write(chunk)

    if not bdv_service.detect_access_file(dblx_path):
        try:
            os.remove(dblx_path)
        except OSError:
            pass
        raise HTTPException(
            status_code=400,
            detail="الملف ليس قاعدة بيانات Access صالحة — تأكد أنه ملف rlynx/BDV10 الأصلي")

    job = {
        "id": job_id, "source_system": "rlynx-bdv10",
        "file_name": file.filename, "file_size": size,
        "status": "queued", "step": "queued", "step_label": "في الانتظار",
        "done": 0, "total": 0, "report": None, "error": None,
        "created_by": user.get("name") or user.get("email", ""),
        "created_at": _now(), "updated_at": _now(),
    }
    await tdb[JOBS_COLL].insert_one(job)
    job.pop("_id", None)

    loop = asyncio.get_running_loop()
    loop.run_in_executor(None, _run_job, job_id, tenant_id, dblx_path, job_dir)
    return {"ok": True, "job": job}


@router.get("/legacy/jobs")
async def list_legacy_import_jobs(user: dict = Depends(get_tenant_admin)):
    tenant_id = user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="حساب غير مرتبط بمستأجر")
    tdb = get_tenant_db(tenant_id)
    jobs = await tdb[JOBS_COLL].find(
        {}, {"_id": 0, "report.checks": 0, "report.samples": 0,
             "report.export_counts": 0, "report.purged_previous": 0}
    ).sort("created_at", -1).limit(10).to_list(10)
    return {"jobs": jobs}


@router.get("/legacy/jobs/{job_id}")
async def get_legacy_import_job(job_id: str, user: dict = Depends(get_tenant_admin)):
    tenant_id = user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="حساب غير مرتبط بمستأجر")
    tdb = get_tenant_db(tenant_id)
    job = await tdb[JOBS_COLL].find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="عملية الاستيراد غير موجودة")
    return {"job": job}


@router.post("/legacy/jobs/{job_id}/rollback")
async def rollback_legacy_import(job_id: str, user: dict = Depends(get_tenant_admin)):
    """Purge every doc this importer wrote (import_source=BDV10)."""
    tenant_id = user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="حساب غير مرتبط بمستأجر")
    tdb = get_tenant_db(tenant_id)
    job = await tdb[JOBS_COLL].find_one({"id": job_id}, {"_id": 0, "status": 1})
    if not job:
        raise HTTPException(status_code=404, detail="عملية الاستيراد غير موجودة")
    if job["status"] in ("queued", "running"):
        raise HTTPException(status_code=409, detail="العملية جارية — لا يمكن التراجع الآن")
    loop = asyncio.get_running_loop()
    purged = await loop.run_in_executor(None, bdv_service.rollback_import, _sync_db(tenant_id))
    await tdb[JOBS_COLL].update_one(
        {"id": job_id},
        {"$set": {"status": "rolled_back", "rolled_back_at": _now(),
                  "rollback_counts": purged}})
    return {"ok": True, "purged": purged}
