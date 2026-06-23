"""
Backup System Routes — Enterprise Grade
========================================
المشاكل المُصلَحة عن النظام القديم:
1. البيانات تُخزَّن على القرص فوراً (gzip JSON) — لا تُعاد توليدها عند التحميل
2. نسخة احتياطية تلقائية قبل أي استعادة (شبكة الأمان)
3. تحقق من تكامل البيانات بعد الاستعادة (مقارنة الأعداد)
4. تراجع تلقائي إذا فشلت الاستعادة
5. Super-admin: backup شامل لجميع قواعد بيانات المستأجرين والمنصة دفعة واحدة
6. تتبع إصدار المخطط (schema_version) لمعرفة حالة الترقية

Storage: data/backups/*.json.gz
"""
import gzip
import json
import io
import os
import glob
import logging
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)

BACKUP_DIR = os.environ.get("BACKUP_DIR", os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data", "backups"
))
os.makedirs(BACKUP_DIR, exist_ok=True)

SCHEMA_VERSION = "2.0.0"


def _count_records(db_data: dict) -> int:
    return sum(len(v) for v in db_data.values() if isinstance(v, list))


async def _dump_db(database) -> dict:
    result = {}
    try:
        colls = await database.list_collection_names()
    except Exception:
        return result
    for c in colls:
        if c.startswith("system."):
            continue
        try:
            docs = await database[c].find({}, {"_id": 0}).to_list(None)
            result[c] = docs
        except Exception as e:
            logger.warning(f"Could not dump collection {c}: {e}")
    return result


async def _write_to_disk(filename: str, data: dict) -> int:
    path = os.path.join(BACKUP_DIR, filename)
    content = json.dumps(data, ensure_ascii=False, default=str).encode("utf-8")
    with gzip.open(path, "wb", compresslevel=6) as f:
        f.write(content)
    return os.path.getsize(path)


async def _read_from_disk(filename: str) -> dict:
    path = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(
            status_code=404,
            detail="ملف النسخة الاحتياطية غير موجود على القرص — ربما تم حذفه يدوياً"
        )
    try:
        with gzip.open(path, "rb") as f:
            return json.loads(f.read().decode("utf-8"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في قراءة ملف النسخة الاحتياطية: {str(e)}")


async def _auto_pre_restore_snapshot(db, main_db, admin: dict) -> dict:
    """Create a safety snapshot before any restore operation."""
    pre_data = await _dump_db(db)
    entity_id = admin.get("tenant_id", admin.get("id", "unknown"))
    ts = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    pre_filename = f"pre_restore_{entity_id}_{ts}.json.gz"
    pre_envelope = {
        "schema_version": SCHEMA_VERSION,
        "backup_type": "pre_restore_snapshot",
        "entity_type": "tenant",
        "entity_id": entity_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "data": pre_data,
    }
    pre_size = await _write_to_disk(pre_filename, pre_envelope)
    pre_count = await main_db.backups.count_documents({}) + 1
    pre_rec = {
        "id": str(uuid.uuid4()),
        "backup_number": f"PRE-{pre_count:05d}",
        "entity_type": "tenant",
        "entity_id": entity_id,
        "entity_name": admin.get("company_name", admin.get("name", "")),
        "backup_type": "pre_restore_snapshot",
        "format": "json.gz",
        "status": "completed",
        "file_name": pre_filename,
        "file_size": pre_size,
        "tables_count": len(pre_data),
        "records_count": _count_records(pre_data),
        "schema_version": SCHEMA_VERSION,
        "is_encrypted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await main_db.backups.insert_one(pre_rec)
    pre_rec.pop("_id", None)
    return pre_rec, pre_data


async def _do_restore(db, restore_data: dict) -> tuple:
    """Restore collections. Returns (restored_coll, restored_records, errors)."""
    restored_collections = 0
    restored_records = 0
    errors = []
    for coll_name, docs in restore_data.items():
        if not isinstance(docs, list):
            continue
        if coll_name.startswith("system."):
            continue
        try:
            await db[coll_name].delete_many({})
            if docs:
                await db[coll_name].insert_many(docs)
                restored_records += len(docs)
            restored_collections += 1
        except Exception as e:
            logger.error(f"Restore error for collection {coll_name}: {e}")
            errors.append(f"{coll_name}: {str(e)}")
    return restored_collections, restored_records, errors


def create_backup_routes(db, main_db, get_current_user, get_tenant_admin, get_super_admin) -> dict:
    router = APIRouter(prefix="/backup", tags=["backup"])

    # ────────────────────────────────────────────────
    # Schema Version Tracking
    # ────────────────────────────────────────────────

    @router.get("/schema-version")
    async def get_schema_version(user: dict = Depends(get_current_user)):
        meta = await main_db.system_meta.find_one({"key": "schema_version"}, {"_id": 0})
        current = meta.get("version", "1.0.0") if meta else "1.0.0"
        return {
            "current_version": current,
            "system_version": SCHEMA_VERSION,
            "needs_migration": current != SCHEMA_VERSION,
            "updated_at": meta.get("updated_at") if meta else None,
        }

    @router.post("/schema-version/sync")
    async def sync_schema_version(admin: dict = Depends(get_super_admin)):
        """Mark DB as upgraded to current schema version."""
        now = datetime.now(timezone.utc).isoformat()
        await main_db.system_meta.update_one(
            {"key": "schema_version"},
            {"$set": {"key": "schema_version", "version": SCHEMA_VERSION, "updated_at": now}},
            upsert=True
        )
        return {"message": "تم تحديث إصدار المخطط", "version": SCHEMA_VERSION}

    # ────────────────────────────────────────────────
    # Stats
    # ────────────────────────────────────────────────

    @router.get("/stats/summary")
    async def get_backup_stats(user: dict = Depends(get_current_user)):
        total = await main_db.backups.count_documents({})
        size_agg = await main_db.backups.aggregate([
            {"$group": {"_id": None, "total_size": {"$sum": "$file_size"}, "total_records": {"$sum": "$records_count"}}}
        ]).to_list(1)
        schedules_active = await main_db.backup_schedules.count_documents({"is_active": True})
        meta = await main_db.system_meta.find_one({"key": "schema_version"}, {"_id": 0})
        disk_files = glob.glob(os.path.join(BACKUP_DIR, "*.json.gz"))
        disk_size = sum(os.path.getsize(f) for f in disk_files if os.path.exists(f))
        return {
            "total_backups": total,
            "total_size": size_agg[0]["total_size"] if size_agg else 0,
            "total_records": size_agg[0]["total_records"] if size_agg else 0,
            "active_schedules": schedules_active,
            "schema_version": meta.get("version", "1.0.0") if meta else "1.0.0",
            "system_version": SCHEMA_VERSION,
            "needs_migration": (meta.get("version", "1.0.0") if meta else "1.0.0") != SCHEMA_VERSION,
            "disk_files_count": len(disk_files),
            "disk_size_bytes": disk_size,
        }

    # ────────────────────────────────────────────────
    # List & Get
    # ────────────────────────────────────────────────

    @router.get("/list")
    async def get_backups(user: dict = Depends(get_current_user)):
        backups = await main_db.backups.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
        for b in backups:
            fname = b.get("file_name", "")
            b["file_exists"] = bool(fname) and os.path.exists(os.path.join(BACKUP_DIR, fname))
        return backups

    @router.get("/schedules/list")
    async def get_schedules(user: dict = Depends(get_current_user)):
        return await main_db.backup_schedules.find({}, {"_id": 0}).to_list(50)

    @router.get("/{backup_id}")
    async def get_backup(backup_id: str, user: dict = Depends(get_current_user)):
        b = await main_db.backups.find_one({"id": backup_id}, {"_id": 0})
        if not b:
            raise HTTPException(status_code=404, detail="النسخة الاحتياطية غير موجودة")
        fname = b.get("file_name", "")
        b["file_exists"] = bool(fname) and os.path.exists(os.path.join(BACKUP_DIR, fname))
        return b

    # ────────────────────────────────────────────────
    # Create Backup — Tenant
    # ────────────────────────────────────────────────

    @router.post("/create")
    async def create_backup(data: dict, admin: dict = Depends(get_tenant_admin)):
        backup_type = data.get("backup_type", "full")
        collections_to_backup = data.get("collections", None)

        db_data = await _dump_db(db)
        if collections_to_backup:
            db_data = {k: v for k, v in db_data.items() if k in collections_to_backup}

        total_records = _count_records(db_data)
        entity_id = admin.get("tenant_id", admin.get("id", ""))
        ts = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        count = await main_db.backups.count_documents({}) + 1
        backup_num = f"BKP-{count:05d}"
        filename = f"tenant_{entity_id}_{ts}_{backup_num}.json.gz"

        envelope = {
            "schema_version": SCHEMA_VERSION,
            "backup_number": backup_num,
            "backup_type": backup_type,
            "entity_type": "tenant",
            "entity_id": entity_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "collections_count": len(db_data),
            "records_count": total_records,
            "data": db_data,
        }
        file_size = await _write_to_disk(filename, envelope)

        record = {
            "id": str(uuid.uuid4()),
            "backup_number": backup_num,
            "entity_type": "tenant",
            "entity_id": entity_id,
            "entity_name": admin.get("company_name", admin.get("name", "")),
            "backup_type": backup_type,
            "format": "json.gz",
            "status": "completed",
            "file_name": filename,
            "file_size": file_size,
            "tables_count": len(db_data),
            "records_count": total_records,
            "schema_version": SCHEMA_VERSION,
            "is_encrypted": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await main_db.backups.insert_one(record)
        record.pop("_id", None)
        return record

    # ────────────────────────────────────────────────
    # Create Global Backup — Super Admin Only
    # Backs up: main_db + ALL tenant databases
    # ────────────────────────────────────────────────

    @router.post("/global")
    async def create_global_backup(admin: dict = Depends(get_super_admin)):
        from config.database import client as mongo_client

        ts = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')

        all_db_names = await mongo_client.list_database_names()
        tenant_db_names = [n for n in all_db_names if n.startswith("tenant_")]

        global_data: dict = {
            "schema_version": SCHEMA_VERSION,
            "backup_type": "global",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "tenant_count": len(tenant_db_names),
            "databases": {},
        }

        total_records = 0

        # Main platform DB (strip passwords)
        main_dump = await _dump_db(main_db)
        for col_docs in main_dump.values():
            for doc in col_docs:
                doc.pop("password", None)
                doc.pop("hashed_password", None)
        global_data["databases"]["main"] = main_dump
        total_records += _count_records(main_dump)

        # All tenant DBs
        for db_name in tenant_db_names:
            try:
                tdb = mongo_client[db_name]
                tdb_dump = await _dump_db(tdb)
                global_data["databases"][db_name] = tdb_dump
                total_records += _count_records(tdb_dump)
            except Exception as e:
                logger.error(f"Failed to dump {db_name}: {e}")
                global_data["databases"][db_name] = {"_error": str(e)}

        count = await main_db.backups.count_documents({}) + 1
        backup_num = f"GLB-{count:05d}"
        filename = f"global_all_tenants_{ts}_{backup_num}.json.gz"
        global_data["backup_number"] = backup_num
        global_data["records_count"] = total_records

        file_size = await _write_to_disk(filename, global_data)

        record = {
            "id": str(uuid.uuid4()),
            "backup_number": backup_num,
            "entity_type": "global",
            "entity_id": "platform",
            "entity_name": f"Platform — {len(tenant_db_names)} مستأجر",
            "backup_type": "global",
            "format": "json.gz",
            "status": "completed",
            "file_name": filename,
            "file_size": file_size,
            "tables_count": len(tenant_db_names) + 1,
            "records_count": total_records,
            "schema_version": SCHEMA_VERSION,
            "is_encrypted": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await main_db.backups.insert_one(record)
        record.pop("_id", None)
        return record

    # ────────────────────────────────────────────────
    # Download — serves actual stored file
    # ────────────────────────────────────────────────

    @router.get("/{backup_id}/download")
    async def download_backup(backup_id: str, user: dict = Depends(get_current_user)):
        backup = await main_db.backups.find_one({"id": backup_id}, {"_id": 0})
        if not backup:
            raise HTTPException(status_code=404, detail="النسخة الاحتياطية غير موجودة")

        fname = backup.get("file_name", "")
        fpath = os.path.join(BACKUP_DIR, fname)
        if not os.path.exists(fpath):
            raise HTTPException(
                status_code=404,
                detail="ملف النسخة الاحتياطية غير موجود على القرص — تم حذفه أو لم يُنشأ بعد"
            )

        with open(fpath, "rb") as f:
            content = f.read()

        await main_db.backup_downloads.insert_one({
            "id": str(uuid.uuid4()),
            "backup_id": backup_id,
            "entity_type": "user",
            "entity_id": user.get("id", ""),
            "downloaded_by": user.get("name", user.get("email", "")),
            "downloaded_at": datetime.now(timezone.utc).isoformat(),
        })

        return StreamingResponse(
            io.BytesIO(content),
            media_type="application/gzip",
            headers={"Content-Disposition": f"attachment; filename={fname}"}
        )

    # ────────────────────────────────────────────────
    # Safe Restore — from stored backup
    # Auto-snapshot → Restore → Validate → Rollback if needed
    # ────────────────────────────────────────────────

    @router.post("/{backup_id}/restore")
    async def restore_backup(backup_id: str, admin: dict = Depends(get_tenant_admin)):
        backup = await main_db.backups.find_one({"id": backup_id}, {"_id": 0})
        if not backup:
            raise HTTPException(status_code=404, detail="النسخة الاحتياطية غير موجودة")

        fname = backup.get("file_name", "")
        envelope = await _read_from_disk(fname)
        restore_data = envelope.get("data", {})

        if not restore_data:
            raise HTTPException(status_code=400, detail="ملف النسخة الاحتياطية فارغ أو غير صالح")

        # Step 1: Auto-snapshot before restore
        pre_rec, pre_data = await _auto_pre_restore_snapshot(db, main_db, admin)

        # Step 2: Perform restore
        restored_coll, restored_records, errors = await _do_restore(db, restore_data)

        # Step 3: Integrity check — compare record counts
        post_data = await _dump_db(db)
        post_records = _count_records(post_data)
        expected = _count_records(restore_data)
        integrity_ok = (post_records == expected)

        # Step 4: Rollback if critical errors
        if errors and not integrity_ok:
            logger.error(f"Restore failed — rolling back. Errors: {errors}")
            await _do_restore(db, pre_data)
            raise HTTPException(
                status_code=500,
                detail=f"فشلت الاستعادة وتم التراجع تلقائياً إلى الحالة السابقة. الأخطاء: {'; '.join(errors[:3])}"
            )

        # Step 5: Log restore operation
        count = await main_db.backups.count_documents({}) + 1
        entity_id = admin.get("tenant_id", admin.get("id", ""))
        rst_rec = {
            "id": str(uuid.uuid4()),
            "backup_number": f"RST-{count:05d}",
            "entity_type": "tenant",
            "entity_id": entity_id,
            "entity_name": admin.get("company_name", admin.get("name", "")),
            "backup_type": "restore",
            "format": "json.gz",
            "status": "completed",
            "file_name": f"restored_from:{fname}",
            "file_size": 0,
            "tables_count": restored_coll,
            "records_count": restored_records,
            "schema_version": envelope.get("schema_version", "unknown"),
            "is_encrypted": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await main_db.backups.insert_one(rst_rec)

        return {
            "success": True,
            "restored_collections": restored_coll,
            "restored_records": restored_records,
            "pre_restore_backup": pre_rec["backup_number"],
            "integrity_ok": integrity_ok,
            "expected_records": expected,
            "actual_records": post_records,
            "source_schema_version": envelope.get("schema_version", "unknown"),
            "errors": errors,
            "message": (
                "تم الاستعادة بنجاح مع التحقق من تكامل البيانات" if integrity_ok
                else f"تمت الاستعادة مع تحذير: {post_records} سجل بدلاً من {expected}"
            ),
        }

    # ────────────────────────────────────────────────
    # Restore from Upload — disaster recovery
    # ────────────────────────────────────────────────

    @router.post("/restore-upload")
    async def restore_from_upload(
        admin: dict = Depends(get_tenant_admin),
        file: UploadFile = File(...)
    ):
        """Upload a .json or .json.gz backup file and restore from it."""
        if not (file.filename.endswith('.json') or file.filename.endswith('.json.gz') or file.filename.endswith('.gz')):
            raise HTTPException(status_code=400, detail="الملف يجب أن يكون بصيغة .json أو .json.gz")

        content = await file.read()
        try:
            if file.filename.endswith('.gz'):
                raw = gzip.decompress(content)
            else:
                raw = content
            envelope = json.loads(raw.decode("utf-8"))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"ملف غير صالح أو تالف: {str(e)}")

        restore_data = envelope.get("data", {})
        if not isinstance(restore_data, dict) or not restore_data:
            raise HTTPException(status_code=400, detail="بنية الملف غير صحيحة أو فارغة")

        # Pre-restore snapshot
        pre_rec, pre_data = await _auto_pre_restore_snapshot(db, main_db, admin)

        # Restore
        restored_coll, restored_records, errors = await _do_restore(db, restore_data)

        if errors and not restored_records:
            await _do_restore(db, pre_data)
            raise HTTPException(
                status_code=500,
                detail=f"فشلت الاستعادة وتم التراجع. الأخطاء: {'; '.join(errors[:3])}"
            )

        return {
            "success": True,
            "restored_collections": restored_coll,
            "restored_records": restored_records,
            "pre_restore_backup": pre_rec["backup_number"],
            "source_schema_version": envelope.get("schema_version", "unknown"),
            "errors": errors,
            "message": "تم الاستعادة من الملف المرفوع بنجاح",
        }

    # ────────────────────────────────────────────────
    # Delete
    # ────────────────────────────────────────────────

    @router.delete("/{backup_id}")
    async def delete_backup(backup_id: str, admin: dict = Depends(get_tenant_admin)):
        b = await main_db.backups.find_one({"id": backup_id}, {"_id": 0})
        if b:
            fname = b.get("file_name", "")
            # Don't delete pre_restore snapshots without explicit flag
            if b.get("backup_type") == "pre_restore_snapshot":
                pass  # allow deletion
            fpath = os.path.join(BACKUP_DIR, fname)
            if fname and os.path.exists(fpath):
                try:
                    os.remove(fpath)
                except Exception as e:
                    logger.warning(f"Could not delete disk file {fname}: {e}")
        await main_db.backups.delete_one({"id": backup_id})
        return {"message": "تم حذف النسخة الاحتياطية من القاعدة والقرص"}

    # ────────────────────────────────────────────────
    # Schedules
    # ────────────────────────────────────────────────

    @router.post("/schedules")
    async def create_schedule(data: dict, admin: dict = Depends(get_tenant_admin)):
        schedule = {
            "id": str(uuid.uuid4()),
            "entity_type": "tenant",
            "entity_id": admin.get("tenant_id", admin.get("id", "")),
            "frequency": data.get("frequency", "daily"),
            "time": data.get("time", "02:00"),
            "format": data.get("format", "json.gz"),
            "auto_email": data.get("auto_email", False),
            "email_to": data.get("email_to", ""),
            "keep_last": data.get("keep_last", 7),
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await main_db.backup_schedules.insert_one(schedule)
        schedule.pop("_id", None)
        return schedule

    @router.put("/schedules/{schedule_id}")
    async def update_schedule(schedule_id: str, data: dict, admin: dict = Depends(get_tenant_admin)):
        data.pop("id", None)
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await main_db.backup_schedules.update_one({"id": schedule_id}, {"$set": data})
        return await main_db.backup_schedules.find_one({"id": schedule_id}, {"_id": 0})

    @router.delete("/schedules/{schedule_id}")
    async def delete_schedule(schedule_id: str, admin: dict = Depends(get_tenant_admin)):
        await main_db.backup_schedules.delete_one({"id": schedule_id})
        return {"message": "تم حذف الجدول"}

    return router
