"""
Printing & Barcode System Routes
Collections: print_templates, print_logs, printer_settings, product_barcodes, label_designs
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid


def create_printing_routes(db, get_current_user, get_tenant_admin) -> dict:
    router = APIRouter(prefix="/printing", tags=["printing"])

    # ── Print Templates ──
    class TemplateCreate(BaseModel):
        name_ar: str
        name_fr: str = ""
        type: str = "receipt"  # receipt, invoice, label, report, sale, purchase, customer, product, expense
        printer_type: str = "thermal"  # thermal, a4, label
        template_html: str = ""
        paper_width: int = 80
        is_default: bool = False
        is_custom: bool = False
        blocks: Optional[List[dict]] = None
        accent_color: str = "#0f766e"

    @router.post("/templates")
    async def create_template(data: TemplateCreate, admin: dict = Depends(get_tenant_admin)):
        if data.is_default:
            await db.print_templates.update_many(
                {"type": data.type}, {"$set": {"is_default": False}}
            )
        template = {"id": str(uuid.uuid4()), **data.dict(), "created_at": datetime.now(timezone.utc).isoformat()}
        await db.print_templates.insert_one(template)
        template.pop("_id", None)
        return template

    @router.get("/templates")
    async def get_templates(type: Optional[str] = None, user: dict = Depends(get_current_user)):
        query = {"type": type} if type else {}
        return await db.print_templates.find(query, {"_id": 0}).to_list(200)

    @router.put("/templates/{template_id}")
    async def update_template(template_id: str, data: dict, admin: dict = Depends(get_tenant_admin)):
        data.pop("id", None)
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        # If marking as default, atomically unset all other templates of the same type first
        if data.get("is_default"):
            doc_type = data.get("type")
            if not doc_type:
                existing = await db.print_templates.find_one({"id": template_id}, {"_id": 0, "type": 1})
                doc_type = existing.get("type") if existing else None
            if doc_type:
                await db.print_templates.update_many(
                    {"type": doc_type, "id": {"$ne": template_id}},
                    {"$set": {"is_default": False}}
                )
        await db.print_templates.update_one({"id": template_id}, {"$set": data})
        return await db.print_templates.find_one({"id": template_id}, {"_id": 0})

    @router.post("/templates/{template_id}/duplicate")
    async def duplicate_template(template_id: str, admin: dict = Depends(get_tenant_admin)):
        original = await db.print_templates.find_one({"id": template_id}, {"_id": 0})
        if not original:
            raise HTTPException(status_code=404, detail="Template not found")
        new_template = {**original, "id": str(uuid.uuid4()), "is_default": False,
                        "name_ar": original.get("name_ar", "") + " (نسخة)",
                        "name_fr": original.get("name_fr", "") + " (copie)",
                        "created_at": datetime.now(timezone.utc).isoformat()}
        new_template.pop("updated_at", None)
        await db.print_templates.insert_one(new_template)
        new_template.pop("_id", None)
        return new_template

    @router.delete("/templates/{template_id}")
    async def delete_template(template_id: str, admin: dict = Depends(get_tenant_admin)):
        await db.print_templates.delete_one({"id": template_id})
        return {"message": "تم حذف القالب"}

    # ── Printer Settings ──
    @router.get("/settings")
    async def get_printer_settings(user: dict = Depends(get_current_user)):
        settings = await db.printer_settings.find_one({"id": "default"}, {"_id": 0})
        return settings or {
            "id": "default",
            "default_printer": "thermal",
            "print_copies": 1,
            "auto_print_receipt": False,
            "auto_print_invoice": False,
            "show_logo": True,
            "show_barcode": True,
        }

    @router.put("/settings")
    async def update_printer_settings(data: dict, admin: dict = Depends(get_tenant_admin)):
        data["id"] = "default"
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.printer_settings.update_one({"id": "default"}, {"$set": data}, upsert=True)
        return data

    # ── Print Log ──
    @router.post("/log")
    async def log_print(data: dict, user: dict = Depends(get_current_user)):
        log = {
            "id": str(uuid.uuid4()),
            "document_type": data.get("document_type", "receipt"),
            "document_id": data.get("document_id", ""),
            "printer_type": data.get("printer_type", "thermal"),
            "copies": data.get("copies", 1),
            "printed_by": user.get("name", user.get("email", "")),
            "printed_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.print_logs.insert_one(log)
        log.pop("_id", None)
        return log

    @router.get("/logs")
    async def get_print_logs(limit: int = 50, user: dict = Depends(get_current_user)):
        return await db.print_logs.find({}, {"_id": 0}).sort("printed_at", -1).limit(limit).to_list(limit)

    return router


def create_barcode_routes(db, get_current_user, get_tenant_admin) -> dict:
    router = APIRouter(prefix="/barcodes", tags=["barcodes"])

    # ── Label Designs ──
    class LabelCreate(BaseModel):
        name_ar: str
        name_fr: str = ""
        width: int = 40
        height: int = 25
        include_price: bool = True
        include_barcode: bool = True
        include_name: bool = True
        font_size: int = 12

    @router.post("/labels")
    async def create_label(data: LabelCreate, admin: dict = Depends(get_tenant_admin)):
        label = {"id": str(uuid.uuid4()), **data.dict(), "created_at": datetime.now(timezone.utc).isoformat()}
        await db.label_designs.insert_one(label)
        label.pop("_id", None)
        return label

    @router.get("/labels")
    async def get_labels(user: dict = Depends(get_current_user)):
        return await db.label_designs.find({}, {"_id": 0}).to_list(50)

    # ── Barcode Scans ──
    @router.post("/scan")
    async def record_scan(data: dict, user: dict = Depends(get_current_user)):
        barcode = data.get("barcode", "")
        product = await db.products.find_one(
            {"$or": [{"barcode": barcode}, {"article_code": barcode}]}, {"_id": 0}
        )
        scan = {
            "id": str(uuid.uuid4()),
            "barcode": barcode,
            "product_id": product["id"] if product else None,
            "product_found": product is not None,
            "scan_type": data.get("scan_type", "lookup"),
            "scanned_by": user.get("name", ""),
            "scanned_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.barcode_scans.insert_one(scan)
        scan.pop("_id", None)
        return {"scan": scan, "product": product}

    @router.get("/scan-history")
    async def get_scan_history(limit: int = 50, user: dict = Depends(get_current_user)):
        return await db.barcode_scans.find({}, {"_id": 0}).sort("scanned_at", -1).limit(limit).to_list(limit)

    return router
