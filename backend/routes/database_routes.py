"""
Database Import/Export Routes
Handles database backup, restore, and data import from external sources
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, BackgroundTasks, Request
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timezone
from pydantic import BaseModel
import os
import json
import gzip
import io
import shutil
import uuid
import subprocess
import sys
import logging
import math
from pathlib import Path

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/database", tags=["Database Management"])

security = HTTPBearer()

# Import from main server
from config.database import client, main_db, get_tenant_db

# JWT Settings
from utils.jwt_config import SECRET_KEY
from utils.auth import ensure_active_account
ALGORITHM = "HS256"
import jwt

# Exports directory (use backend-relative path for Replit compatibility)
_BASE_DIR = Path(__file__).parent.parent
EXPORTS_DIR = _BASE_DIR / "exports"
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)

# Uploads directory for imports
IMPORTS_DIR = _BASE_DIR / "imports"
IMPORTS_DIR.mkdir(parents=True, exist_ok=True)
MAX_IMPORT_UPLOAD_BYTES = 100 * 1024 * 1024
MAX_IMPORT_JSON_BYTES = 512 * 1024 * 1024
MAX_ACCESS_UPLOAD_BYTES = MAX_IMPORT_UPLOAD_BYTES


def _import_number(value, field: str) -> float:
    """Finite non-negative numeric field for imported business data."""
    try:
        number = float(value or 0)
    except (TypeError, ValueError):
        number = float("nan")
    if not math.isfinite(number) or number < 0:
        raise ValueError(f"invalid numeric field: {field}")
    return number


def _validate_import_payload(data, strict: bool) -> None:
    """Validate import shape; strict mode protects destructive clear_existing imports."""
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Import payload must be a JSON object")
    for section in ("categories", "products", "customers", "suppliers"):
        if section in data and not isinstance(data[section], list):
            raise HTTPException(status_code=400, detail=f"Import section must be a list: {section}")
    if not strict:
        return

    def _strict_number(row: dict, section: str, index: int, field: str, value) -> None:
        try:
            _import_number(value, field)
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid {section}[{index}].{field}: {exc}",
            ) from exc

    for section in ("categories", "products", "customers", "suppliers"):
        for index, row in enumerate(data.get(section, [])):
            if not isinstance(row, dict):
                raise HTTPException(
                    status_code=422,
                    detail=f"Invalid {section}[{index}]: each imported row must be an object",
                )
            if section == "products":
                _strict_number(row, section, index, "cost_price", row.get("cost_price", 0))
                _strict_number(row, section, index, "retail_price", row.get("selling_price", 0) or row.get("retail_price", 0))
                _strict_number(row, section, index, "wholesale_price", row.get("price_a", 0))
                _strict_number(row, section, index, "min_price", row.get("price_c", 0))
                _strict_number(row, section, index, "purchase_price", row.get("purchase_price", 0))
                _strict_number(row, section, index, "stock", row.get("stock", 0))
                _strict_number(row, section, index, "low_stock_threshold", row.get("stock_alert", 5))
            elif section in ("customers", "suppliers"):
                _strict_number(row, section, index, "account_balance", row.get("account_balance", 0))
                _strict_number(row, section, index, "total_purchased", row.get("total_purchased", 0))

# ============ PYDANTIC MODELS ============

class ImportStatus(BaseModel):
    status: str
    message: str
    statistics: dict = {}

class ExportInfo(BaseModel):
    filename: str
    created_at: str
    size_mb: float
    statistics: dict = {}
    download_url: str

# ============ HELPER FUNCTIONS ============

async def verify_super_admin(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Verify JWT token and return super admin user"""
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        user_role = payload.get("role", "")
        
        # Allow super_admin role
        if user_role not in ["super_admin", "saas_admin"]:
            raise HTTPException(status_code=403, detail="Super admin access required")
        
        # Check in users collection
        user = await main_db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        if user.get("role") not in ["super_admin", "saas_admin"]:
            raise HTTPException(status_code=403, detail="Super admin access required")
        return ensure_active_account(user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ============ EXPORT ENDPOINTS ============

@router.get("/exports")
async def list_exports(admin: dict = Depends(verify_super_admin)):
    """List all available export files"""
    exports = []
    for file in EXPORTS_DIR.glob("*.json*"):
        stat = file.stat()
        exports.append({
            "filename": file.name,
            "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "size_mb": round(stat.st_size / (1024 * 1024), 2)
        })
    
    # Sort by creation time, newest first
    exports.sort(key=lambda x: x["created_at"], reverse=True)
    return {"exports": exports}

@router.get("/download/{filename}")
async def download_export(filename: str, admin: dict = Depends(verify_super_admin)):
    """Download an export file"""
    file_path = EXPORTS_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Security check - ensure file is within exports directory
    try:
        file_path.resolve().relative_to(EXPORTS_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Determine media type
    media_type = "application/gzip" if filename.endswith(".gz") else "application/json"
    
    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type=media_type
    )

@router.delete("/exports/{filename}")
async def delete_export(filename: str, admin: dict = Depends(verify_super_admin)):
    """Delete an export file"""
    file_path = EXPORTS_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Security check
    try:
        file_path.resolve().relative_to(EXPORTS_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    
    file_path.unlink()
    return {"message": "File deleted successfully"}

# ============ IMPORT ENDPOINTS ============

@router.post("/import/{tenant_id}")
async def import_to_tenant(
    tenant_id: str,
    file: UploadFile = File(...),
    clear_existing: bool = False,
    admin: dict = Depends(verify_super_admin)
):
    """
    Import data from JSON file to a tenant's database
    
    - tenant_id: The tenant to import data to
    - file: JSON or JSON.GZ file with the export data
    - clear_existing: If True, clears existing data before import
    """
    # Verify tenant exists
    tenant = await main_db.saas_tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Save uploaded file temporarily
    temp_path = IMPORTS_DIR / f"temp_{uuid.uuid4()}.json"
    
    import_session = None
    import_tx = None

    try:
        # Read and decompress with hard compressed/uncompressed caps.
        chunks = []
        size = 0
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_IMPORT_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="Import file exceeds the upload limit")
            chunks.append(chunk)
        content = b"".join(chunks)
        if file.filename.endswith(".gz"):
            raw_chunks = []
            raw_size = 0
            try:
                with gzip.GzipFile(fileobj=io.BytesIO(content), mode="rb") as gz:
                    while True:
                        chunk = gz.read(1024 * 1024)
                        if not chunk:
                            break
                        raw_size += len(chunk)
                        if raw_size > MAX_IMPORT_JSON_BYTES:
                            raise HTTPException(status_code=413, detail="Decompressed import exceeds the safety limit")
                        raw_chunks.append(chunk)
            except HTTPException:
                raise
            except (OSError, EOFError) as e:
                # p510: invalid/corrupt .gz (incl. renamed zip) must be a client error, not a 500
                raise HTTPException(status_code=400, detail=f"Invalid gzip file: {type(e).__name__}")
            content = b"".join(raw_chunks)

        # Parse JSON
        try:
            data = json.loads(content.decode('utf-8'))
        except UnicodeDecodeError:
            # p510: binary payloads (zip/xlsx/...) uploaded as .json must be a client error, not a 500
            raise HTTPException(status_code=400, detail="File is not valid UTF-8 JSON (binary files such as .zip are not supported; upload .json or .json.gz)")
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON file: {str(e)}")
        
        # p510: validate the whole payload before any destructive clear. Invalid
        # rows are tolerated only for additive imports; clear_existing must be
        # all-or-nothing and must never erase tenant data first.
        _validate_import_payload(data, strict=clear_existing)

        # Get tenant database
        tenant_db = get_tenant_db(tenant_id)
        if clear_existing:
            import_session = await client.start_session()
            import_tx = import_session.start_transaction()
            await import_tx.__aenter__()

        # Clear existing data if requested
        if clear_existing:
            await tenant_db.categories.delete_many({}, session=import_session)
            await tenant_db.products.delete_many({}, session=import_session)
            await tenant_db.customers.delete_many({}, session=import_session)
            await tenant_db.suppliers.delete_many({}, session=import_session)
            logger.info(f"Cleared existing data for tenant {tenant_id}")
        
        statistics = {
            "categories": {"imported": 0, "errors": 0},
            "products": {"imported": 0, "errors": 0},
            "customers": {"imported": 0, "errors": 0},
            "suppliers": {"imported": 0, "errors": 0}
        }
        
        # Build category mapping (original_id -> new_id)
        category_map = {}
        
        # Import categories
        if "categories" in data:
            for cat in data["categories"]:
                try:
                    new_id = str(uuid.uuid4())
                    category_doc = {
                        "id": new_id,
                        "name": cat.get("name", ""),
                        "description": "",
                        "parent_id": None,
                        "image_url": "",
                        "is_active": True,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                    
                    # Check if category with same name exists
                    existing = await tenant_db.categories.find_one({"name": cat.get("name", "")}, session=import_session)
                    if existing:
                        category_map[cat.get("original_id")] = existing.get("id")
                        statistics["categories"]["imported"] += 1
                        continue
                    
                    await tenant_db.categories.insert_one(category_doc, session=import_session)
                    category_map[cat.get("original_id")] = new_id
                    statistics["categories"]["imported"] += 1
                except Exception as e:
                    logger.error(f"Error importing category: {e}")
                    statistics["categories"]["errors"] += 1
        
        # Import products
        if "products" in data:
            for prod in data["products"]:
                try:
                    new_id = str(uuid.uuid4())
                    
                    # Get category ID from mapping
                    original_cat_id = prod.get("original_category_id")
                    category_id = category_map.get(original_cat_id)
                    
                    product_doc = {
                        "id": new_id,
                        "name": prod.get("name", ""),
                        "sku": prod.get("sku", ""),
                        "barcode": prod.get("barcode", ""),
                        "category_id": category_id,
                        "category": prod.get("category", ""),
                        "description": prod.get("description", ""),
                        "cost_price": _import_number(prod.get("cost_price", 0), "cost_price"),
                        "retail_price": _import_number(prod.get("selling_price", 0) or prod.get("retail_price", 0), "retail_price"),  # p171: canonical
                        "wholesale_price": _import_number(prod.get("price_a", 0), "wholesale_price"),
                        "min_price": _import_number(prod.get("price_c", 0), "min_price"),
                        "purchase_price": _import_number(prod.get("purchase_price", 0), "purchase_price"),
                        "stock": _import_number(prod.get("stock", 0), "stock"),
                        "low_stock_threshold": _import_number(prod.get("stock_alert", 5), "low_stock_threshold"),
                        "unit": "قطعة",
                        "warehouse_id": "main",
                        "is_active": prod.get("is_active", True),
                        "notes": prod.get("notes", ""),
                        "compatible_models": "",
                        "image_url": "",
                        "created_at": prod.get("created_at") or datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                    
                    # Check if product with same SKU or barcode exists
                    if prod.get("sku"):
                        existing = await tenant_db.products.find_one({"sku": prod.get("sku")}, session=import_session)
                        if existing:
                            # Update existing product
                            await tenant_db.products.update_one(
                                {"id": existing["id"]},
                                {"$set": {
                                    "stock": _import_number(existing.get("stock", 0), "stock") + _import_number(prod.get("stock", 0), "stock"),
                                    "updated_at": datetime.now(timezone.utc).isoformat()
                                }},
                                session=import_session
                            )
                            statistics["products"]["imported"] += 1
                            continue
                    
                    await tenant_db.products.insert_one(product_doc, session=import_session)
                    statistics["products"]["imported"] += 1
                except Exception as e:
                    logger.error(f"Error importing product: {e}")
                    statistics["products"]["errors"] += 1
        
        # Import customers
        if "customers" in data:
            for cust in data["customers"]:
                try:
                    new_id = str(uuid.uuid4())
                    customer_doc = {
                        "id": new_id,
                        "name": cust.get("name", ""),
                        "phone": cust.get("phone", "") or cust.get("mobile", ""),
                        "email": cust.get("email", ""),
                        "address": cust.get("address", ""),
                        "city": cust.get("city", ""),
                        "notes": cust.get("notes", ""),
                        "debt_balance": _import_number(cust.get("account_balance", 0), "account_balance"),
                        "total_purchases": _import_number(cust.get("total_purchased", 0), "total_purchased"),
                        "is_active": cust.get("is_active", True),
                        "created_at": cust.get("created_at") or datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                    
                    # Check if customer with same phone exists
                    if cust.get("phone"):
                        existing = await tenant_db.customers.find_one({"phone": cust.get("phone")}, session=import_session)
                        if existing:
                            statistics["customers"]["imported"] += 1
                            continue
                    
                    await tenant_db.customers.insert_one(customer_doc, session=import_session)
                    statistics["customers"]["imported"] += 1
                except Exception as e:
                    logger.error(f"Error importing customer: {e}")
                    statistics["customers"]["errors"] += 1
        
        # Import suppliers
        if "suppliers" in data:
            for sup in data["suppliers"]:
                try:
                    new_id = str(uuid.uuid4())
                    supplier_doc = {
                        "id": new_id,
                        "name": sup.get("name", ""),
                        "contact_name": sup.get("contact", ""),
                        "phone": sup.get("phone", ""),
                        "email": sup.get("email", ""),
                        "address": sup.get("address", ""),
                        "city": sup.get("city", ""),
                        "notes": sup.get("notes", ""),
                        "debt_balance": _import_number(sup.get("account_balance", 0), "account_balance"),
                        "total_purchases": _import_number(sup.get("total_purchased", 0), "total_purchased"),
                        "is_active": sup.get("is_active", True),
                        "created_at": sup.get("created_at") or datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                    
                    # Check if supplier with same name exists
                    existing = await tenant_db.suppliers.find_one({"name": sup.get("name", "")}, session=import_session)
                    if existing:
                        statistics["suppliers"]["imported"] += 1
                        continue
                    
                    await tenant_db.suppliers.insert_one(supplier_doc, session=import_session)
                    statistics["suppliers"]["imported"] += 1
                except Exception as e:
                    logger.error(f"Error importing supplier: {e}")
                    statistics["suppliers"]["errors"] += 1
        
        # A destructive import with any row-level error must abort and leave
        # the tenant untouched. The transaction commit happens before the
        # platform log so a failed import never appears as a successful one.
        if clear_existing and any(section.get("errors", 0) for section in statistics.values()):
            raise HTTPException(status_code=422, detail="Import validation failed; existing data was not replaced")
        if import_tx is not None:
            tx_to_commit = import_tx
            import_tx = None
            await tx_to_commit.__aexit__(None, None, None)
        if import_session is not None:
            session_to_close = import_session
            import_session = None
            await session_to_close.end_session()

        # Log the import
        await main_db.import_logs.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "tenant_name": tenant.get("company_name", ""),
            "filename": file.filename,
            "statistics": statistics,
            "clear_existing": clear_existing,
            "imported_by": admin.get("id"),
            "imported_at": datetime.now(timezone.utc).isoformat()
        })
        
        return {
            "status": "success",
            "message": "Data imported successfully",
            "statistics": statistics
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Import error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
    finally:
        # Abort an uncommitted clear_existing transaction and close its session.
        if import_tx is not None:
            await import_tx.__aexit__(*sys.exc_info())
        if import_session is not None:
            await import_session.end_session()
        # Cleanup temp file
        if temp_path.exists():
            temp_path.unlink()

@router.get("/import-logs")
async def get_import_logs(
    limit: int = 50,
    admin: dict = Depends(verify_super_admin)
):
    """Get import history logs"""
    logs = await main_db.import_logs.find(
        {},
        {"_id": 0}
    ).sort("imported_at", -1).limit(limit).to_list(length=limit)
    
    return {"logs": logs}

# ============ ACCESS DATABASE CONVERSION ============

@router.post("/convert-access")
async def convert_access_database(
    request: Request,
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    admin: dict = Depends(verify_super_admin)
):
    """
    Convert Microsoft Access database (.mdb, .accdb, .dblx) to JSON format
    Returns the converted file for download
    """
    # Validate file extension
    valid_extensions = ['.mdb', '.accdb', '.dblx']
    file_ext = os.path.splitext(file.filename)[1].lower()
    
    if file_ext not in valid_extensions:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid file type. Supported: {', '.join(valid_extensions)}"
        )
    
    # Reject obviously oversized multipart requests before creating a temp file.
    declared_size = getattr(file, "size", None)
    if declared_size is None:
        content_length = request.headers.get("content-length")
        try:
            declared_size = int(content_length) if content_length else None
        except ValueError:
            declared_size = None
        # Content-Length includes multipart boundaries; keep a small allowance.
        declared_limit = MAX_ACCESS_UPLOAD_BYTES + 1024 * 1024
    else:
        declared_limit = MAX_ACCESS_UPLOAD_BYTES
    if declared_size is not None and declared_size > declared_limit:
        raise HTTPException(status_code=413, detail="Access database exceeds the upload limit")

    # Save uploaded file outside the root-owned application directory.
    temp_db_path = Path("/tmp") / f"temp_{uuid.uuid4()}{file_ext}"
    
    try:
        # Save uploaded file with a streaming cap; never load an unbounded
        # Access upload into memory before validation.
        uploaded_size = 0
        with open(temp_db_path, 'wb') as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                uploaded_size += len(chunk)
                if uploaded_size > MAX_ACCESS_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="Access database exceeds the upload limit")
                f.write(chunk)
        
        # Generate output filename - sanitize base_name to prevent path traversal
        import re as _re
        base_name = _re.sub(r'[^\w\-.]', '_', os.path.splitext(file.filename)[0])[:100]
        output_filename = f"{base_name}_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        output_path = EXPORTS_DIR / output_filename
        
        # Verify paths stay within expected directories
        if temp_db_path.resolve().parent != Path("/tmp"):
            raise HTTPException(status_code=400, detail="Invalid file path")
        if not str(output_path.resolve()).startswith(str(EXPORTS_DIR.resolve())):
            raise HTTPException(status_code=400, detail="Invalid output path")
        
        # Run conversion script with safe arguments (no shell=True)
        result = subprocess.run(
            [sys.executable, '/app/scripts/convert_access_db.py', str(temp_db_path), str(output_path)],
            capture_output=True,
            text=True,
            timeout=300  # 5 minutes timeout
        )
        
        if result.returncode != 0:
            logger.error(f"Conversion error: {result.stderr}")
            raise HTTPException(status_code=500, detail=f"Conversion failed: {result.stderr}")
        
        # Compress the output
        gzip_path = str(output_path) + ".gz"
        with open(output_path, 'rb') as f_in:
            with gzip.open(gzip_path, 'wb') as f_out:
                shutil.copyfileobj(f_in, f_out)
        
        # Get file stats
        json_size = output_path.stat().st_size
        gz_size = Path(gzip_path).stat().st_size
        
        # Read statistics from the output
        with open(output_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            statistics = data.get('metadata', {}).get('statistics', {})
        
        return {
            "status": "success",
            "message": "Database converted successfully",
            "filename": output_filename,
            "compressed_filename": output_filename + ".gz",
            "size_mb": round(json_size / (1024 * 1024), 2),
            "compressed_size_mb": round(gz_size / (1024 * 1024), 2),
            "statistics": statistics,
            "download_url": f"/api/saas/database/download/{output_filename}.gz"
        }
        
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="Conversion timed out")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Conversion error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
    finally:
        # Cleanup temp file
        if temp_db_path.exists():
            temp_db_path.unlink()
