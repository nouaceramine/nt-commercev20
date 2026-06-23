"""SaaS Database Management Routes"""
from fastapi import APIRouter, HTTPException, Depends, Body
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
import uuid
import io
import json

from config.database import db, client
from .helpers import get_super_admin

router = APIRouter(tags=["SaaS Databases"])


@router.get("/saas/databases")
async def get_databases(admin: dict = Depends(get_super_admin)):
    tenants = await db.saas_tenants.find({}, {"_id": 0}).to_list(1000)
    databases = []

    for tenant in tenants:
        db_name = f"tenant_{tenant['id'].replace('-', '_')}"
        tenant_db = client[db_name]
        collections = await tenant_db.list_collection_names()
        total_docs = 0
        for coll in collections:
            count = await tenant_db[coll].count_documents({})
            total_docs += count

        databases.append({
            "id": tenant["id"],
            "name": tenant.get("name", ""),
            "email": tenant.get("email", ""),
            "company_name": tenant.get("company_name", ""),
            "database_name": db_name,
            "collections_count": len(collections),
            "documents_count": total_docs,
            "is_active": tenant.get("is_active", True),
            "is_frozen": tenant.get("is_frozen", False),
            "created_at": tenant.get("created_at", "")
        })

    return databases


@router.get("/saas/databases/stats")
async def get_databases_stats(admin: dict = Depends(get_super_admin)):
    tenants = await db.saas_tenants.find({}, {"_id": 0}).to_list(1000)
    total_collections = 0
    total_documents = 0

    for tenant in tenants:
        db_name = f"tenant_{tenant['id'].replace('-', '_')}"
        tenant_db = client[db_name]
        collections = await tenant_db.list_collection_names()
        total_collections += len(collections)
        for coll in collections:
            count = await tenant_db[coll].count_documents({})
            total_documents += count

    return {
        "total_databases": len(tenants),
        "total_collections": total_collections,
        "total_documents": total_documents
    }


@router.get("/saas/databases/logs")
async def get_databases_logs(admin: dict = Depends(get_super_admin)):
    return []


@router.get("/saas/databases/backups")
async def get_databases_backups(admin: dict = Depends(get_super_admin)):
    return []


@router.post("/saas/databases/{db_id}/backup")
async def create_database_backup(db_id: str, admin: dict = Depends(get_super_admin)):
    tenant = await db.saas_tenants.find_one({"id": db_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Database not found")

    db_name = f"tenant_{db_id.replace('-', '_')}"
    tenant_db = client[db_name]
    backup_data = {}
    collections = await tenant_db.list_collection_names()
    for coll in collections:
        docs = await tenant_db[coll].find({}, {"_id": 0}).to_list(10000)
        backup_data[coll] = docs

    backup_doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": db_id,
        "database_name": db_name,
        "data": backup_data,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": admin.get("id", "")
    }
    await db.database_backups.insert_one(backup_doc)

    return {"message": "Backup created successfully", "backup_id": backup_doc["id"]}


@router.post("/saas/databases/{db_id}/freeze")
async def freeze_database(db_id: str, admin: dict = Depends(get_super_admin)):
    tenant = await db.saas_tenants.find_one({"id": db_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Database not found")
    new_status = not tenant.get("is_frozen", False)
    await db.saas_tenants.update_one({"id": db_id}, {"$set": {"is_frozen": new_status}})
    return {"is_frozen": new_status}


@router.delete("/saas/databases/{db_id}")
async def delete_database(db_id: str, admin: dict = Depends(get_super_admin)):
    tenant = await db.saas_tenants.find_one({"id": db_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Database not found")
    db_name = f"tenant_{db_id.replace('-', '_')}"
    await client.drop_database(db_name)
    await db.saas_tenants.delete_one({"id": db_id})
    return {"message": "Database deleted successfully"}


@router.get("/saas/databases/{db_id}/export")
async def export_database(db_id: str, admin: dict = Depends(get_super_admin)):
    tenant = await db.saas_tenants.find_one({"id": db_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Database not found")

    db_name = f"tenant_{db_id.replace('-', '_')}"
    tenant_db = client[db_name]
    export_data = {"tenant_id": db_id, "database_name": db_name, "collections": {}}
    collections = await tenant_db.list_collection_names()
    for coll in collections:
        docs = await tenant_db[coll].find({}, {"_id": 0}).to_list(10000)
        export_data["collections"][coll] = docs

    json_data = json.dumps(export_data, ensure_ascii=False, indent=2, default=str)

    return StreamingResponse(
        io.BytesIO(json_data.encode('utf-8')),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={db_name}_export.json"}
    )


@router.post("/saas/databases/{db_id}/schedule")
async def schedule_database_task(db_id: str, task: dict = Body(...), admin: dict = Depends(get_super_admin)):
    tenant = await db.saas_tenants.find_one({"id": db_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Database not found")
    return {"message": "Task scheduled", "task": task}
