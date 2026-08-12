"""Automated restore-test + archive retention (p33, items 7-8).

Backups are worthless until a restore is proven. This service:
- run_restore_test(): restores the latest tenant JSON archive (or, when no
  archive exists yet, a fresh dump of the golden template) into a scratch DB,
  validates collection/document counts, then drops the scratch DB and records
  the result in main_db.platform_restore_tests.
- enforce_archive_retention(keep): keeps the newest N tenant_delete_* archive
  directories under /backups and removes the rest.
"""
import asyncio
import json
import logging
import os
import shutil
import uuid
from datetime import datetime, timezone

from config.database import client, main_db

logger = logging.getLogger(__name__)

BACKUPS_DIR = "/backups"
ARCHIVE_PREFIX = "tenant_delete_"
SCRATCH_PREFIX = "restore_test_"
_run_lock = asyncio.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _list_archives() -> list:
    if not os.path.isdir(BACKUPS_DIR):
        return []
    dirs = [
        os.path.join(BACKUPS_DIR, d)
        for d in os.listdir(BACKUPS_DIR)
        if d.startswith(ARCHIVE_PREFIX) and os.path.isdir(os.path.join(BACKUPS_DIR, d))
    ]
    return sorted(dirs, key=os.path.getmtime, reverse=True)


async def _dump_template_to_json(target_dir: str) -> None:
    """Export the golden template DB to JSON files (fallback test source)."""
    os.makedirs(target_dir, exist_ok=True)
    tpl = client["template_tenant"]
    for col in await tpl.list_collection_names():
        if col.startswith("system."):
            continue
        docs = await tpl[col].find({}).to_list(None)
        if docs:
            with open(os.path.join(target_dir, f"{col}.json"), "w", encoding="utf-8") as f:
                f.write(json.dumps(docs, default=str, ensure_ascii=False))


async def run_restore_test() -> dict:
    """Restore the latest archive into a scratch DB and validate it."""
    if _run_lock.locked():
        return {"ok": None, "skipped": "another restore test is already running"}
    async with _run_lock:
        return await _run_restore_test_inner()


async def _run_restore_test_inner() -> dict:
    started = _now()
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    scratch_name = f"{SCRATCH_PREFIX}{ts}_{uuid.uuid4().hex[:8]}"
    src_dir = None
    temp_src = False
    report = {"id": str(uuid.uuid4()), "started_at": started}

    try:
        archives = _list_archives()
        if archives:
            src_dir = archives[0]
            report["source"] = {"type": "tenant_archive", "dir": src_dir}
        else:
            src_dir = os.path.join(BACKUPS_DIR, f"restore_test_src_{ts}")
            await _dump_template_to_json(src_dir)
            temp_src = True
            report["source"] = {"type": "template_dump", "dir": src_dir}

        files = [f for f in os.listdir(src_dir) if f.endswith(".json")]
        scratch = client[scratch_name]
        expected = {}
        for fn in files:
            col = fn[:-5]
            with open(os.path.join(src_dir, fn), encoding="utf-8") as f:
                docs = json.load(f)
            expected[col] = len(docs)
            if docs:
                for d in docs:
                    d.pop("_id", None)  # let Mongo assign fresh _ids
                await scratch[col].insert_many(docs)

        # validate
        mismatches = []
        for col, want in expected.items():
            got = await scratch[col].count_documents({})
            if got != want:
                mismatches.append({"collection": col, "expected": want, "got": got})

        report.update({
            "collections_restored": len(expected),
            "docs_restored": sum(expected.values()),
            "mismatches": mismatches,
            "ok": not mismatches,
        })
    except Exception as exc:
        logger.error(f"restore test failed: {exc}")
        report.update({"ok": False, "error": str(exc)})
    finally:
        try:
            await client.drop_database(scratch_name)
        except Exception:
            pass
        if temp_src and src_dir:
            shutil.rmtree(src_dir, ignore_errors=True)
        report["finished_at"] = _now()
        try:
            await main_db.platform_restore_tests.insert_one(dict(report))  # copy: keep returned dict _id-free
        except Exception as exc:
            logger.error(f"could not persist restore test report: {exc}")

    logger.info(
        f"restore test: ok={report.get('ok')} "
        f"docs={report.get('docs_restored')} src={report.get('source', {}).get('type')}"
    )
    return report


async def latest_restore_test() -> dict:
    return await main_db.platform_restore_tests.find_one(
        {}, {"_id": 0}, sort=[("started_at", -1)]
    )


def enforce_archive_retention(keep: int = 5) -> dict:
    """Keep the newest `keep` tenant archives, remove older ones."""
    archives = _list_archives()
    removed = []
    for old in archives[keep:]:
        try:
            shutil.rmtree(old)
            removed.append(os.path.basename(old))
        except Exception as exc:
            logger.error(f"retention: could not remove {old}: {exc}")
    if removed:
        logger.info(f"archive retention: removed {len(removed)} old archives")
    return {"kept": len(archives) - len(removed), "removed": removed}
