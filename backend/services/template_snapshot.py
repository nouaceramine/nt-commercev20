"""Golden template snapshot service (p34, gap 1).

The golden template (`template_tenant`) is the single source of truth for every
tenant database — but it lives inside the same Mongo instance it provisions.
If the server dies, the model dies with it. This service periodically exports
the template to JSON under /backups/template_snapshot_<ts>/ (volume-mounted,
outside Mongo) and keeps only the newest few snapshots.
"""
import json
import logging
import os
import shutil
import uuid
from datetime import datetime, timezone

from config.database import client, main_db

logger = logging.getLogger(__name__)

BACKUPS_DIR = "/backups"
SNAPSHOT_PREFIX = "template_snapshot_"
TEMPLATE_DB = "template_tenant"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def list_snapshots() -> list:
    if not os.path.isdir(BACKUPS_DIR):
        return []
    dirs = [
        os.path.join(BACKUPS_DIR, d)
        for d in os.listdir(BACKUPS_DIR)
        if d.startswith(SNAPSHOT_PREFIX) and os.path.isdir(os.path.join(BACKUPS_DIR, d))
    ]
    return sorted(dirs, key=os.path.getmtime, reverse=True)


async def snapshot_template() -> dict:
    """Export the golden template DB to a timestamped JSON snapshot."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    target = os.path.join(BACKUPS_DIR, f"{SNAPSHOT_PREFIX}{ts}")
    os.makedirs(target, exist_ok=True)
    tpl = client[TEMPLATE_DB]
    collections = 0
    docs = 0
    for col in await tpl.list_collection_names():
        if col.startswith("system."):
            continue
        data = await tpl[col].find({}).to_list(None)
        if not data:
            continue
        with open(os.path.join(target, f"{col}.json"), "w", encoding="utf-8") as f:
            f.write(json.dumps(data, default=str, ensure_ascii=False))
        collections += 1
        docs += len(data)
    report = {
        "id": str(uuid.uuid4()),
        "at": _now(),
        "dir": target,
        "collections": collections,
        "docs": docs,
    }
    await main_db.platform_template_snapshots.insert_one(dict(report))
    logger.info(f"template snapshot: {collections} collections, {docs} docs -> {target}")
    return report


def enforce_snapshot_retention(keep: int = 4) -> dict:
    """Keep the newest `keep` template snapshots, remove older ones."""
    snaps = list_snapshots()
    removed = []
    for old in snaps[keep:]:
        try:
            shutil.rmtree(old)
            removed.append(os.path.basename(old))
        except Exception as exc:
            logger.error(f"snapshot retention: could not remove {old}: {exc}")
    return {"kept": len(snaps) - len(removed), "removed": removed}


async def latest_snapshot() -> dict:
    return await main_db.platform_template_snapshots.find_one(
        {}, {"_id": 0}, sort=[("at", -1)]
    )
